import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, strategistConversations, strategistMessages, currentCampaignProfile } from "@workspace/db";
import { sql, eq, desc, asc } from "drizzle-orm";
import { CAMPAIGN_CONTEXT } from "./ai";
import { buildFreeMakueniAnswer, fetchMakueniOfficialSources, searchFreeMakueniWeb } from "./makueni-free-ai";
import { requireAuth } from "../lib/auth";

const router = Router();

// Persisted strategist conversations contain sensitive strategy — require a logged-in session.
router.use(requireAuth);

const STRATEGIST_ROLE = `You are the active Kenyan workspace's public-policy and operational analyst. Use the shared reviewed Kenya evidence and the dated workspace digest. Distinguish measured records, historical baselines, planning targets and unknowns. Social mentions are not representative polls. Do not treat missing database queries as verified zeros or infer electoral outcomes from unsourced data. Explain source, period, jurisdiction and limitations. Provide neutral evidence-review and operational next steps, not demographic political targeting. Uploaded candidate material is an internal proposal, not independent proof of achievement.`;

async function num(query: string): Promise<number | null> {
  try {
    const r = await db.execute(sql.raw(query));
    const row = r.rows[0] as Record<string, unknown> | undefined;
    const v = row ? Object.values(row)[0] : null;
    return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
  } catch {
    return null;
  }
}

async function buildLiveDigest(): Promise<string> {
  const [
    membersTotal,
    supporters,
    activeVolunteers,
    doorsKnocked,
    messagesSent,
    openThreats,
    registeredVoters,
    upcomingEvents,
    milestonesTotal,
    milestonesDone,
    donationsTotal,
    pledgesPending,
    negMentions,
    posMentions,
  ] = await Promise.all([
    num(`SELECT count(*) FROM members`),
    num(`SELECT count(*) FROM members WHERE support_level IN ('strong_supporter','supporter')`),
    num(`SELECT count(*) FROM volunteers WHERE status = 'active'`),
    num(`SELECT count(*) FROM canvass_visits`),
    num(`SELECT coalesce(sum(recipient_count),0) FROM message_campaigns WHERE sent_at IS NOT NULL`),
    num(`SELECT count(*) FROM narrative_mentions WHERE status = 'open'`),
    num(`SELECT coalesce(sum(registered_voters),0) FROM polling_stations`),
    num(`SELECT count(*) FROM campaign_events WHERE start_date >= '${new Date().toISOString().slice(0, 10)}'`),
    num(`SELECT count(*) FROM milestones`),
    num(`SELECT count(*) FROM milestones WHERE status = 'completed'`),
    num(`SELECT coalesce(sum(amount),0) FROM donations`),
    num(`SELECT coalesce(sum(amount),0) FROM pledges WHERE status = 'pending'`),
    num(`SELECT count(*) FROM social_mentions WHERE sentiment = 'negative'`),
    num(`SELECT count(*) FROM social_mentions WHERE sentiment = 'positive'`),
  ]);

  let supportByWard: string = "no ward-level support data yet";
  try {
    const wards = await db.execute(sql.raw(
      `SELECT ward, count(*) AS contacts,
              sum(CASE WHEN support_level IN ('strong_supporter','supporter') THEN 1 ELSE 0 END) AS supporters
       FROM members WHERE ward IS NOT NULL AND ward <> '' GROUP BY ward ORDER BY ward`
    ));
    if (wards.rows.length > 0) {
      supportByWard = wards.rows
        .map((r) => {
          const row = r as { ward: string; contacts: string | number; supporters: string | number };
          return `${row.ward}: ${row.contacts} contacts, ${row.supporters} supporters`;
        })
        .join(" | ");
    }
  } catch {
    /* keep fallback */
  }

  let turnout = "assumptions not set";
  try {
    const t = await db.execute(sql.raw(
      `SELECT ta.ward, ta.expected_turnout_rate, coalesce(ps.reg,0) AS reg
       FROM turnout_assumptions ta
       LEFT JOIN (SELECT ward, sum(registered_voters) AS reg FROM polling_stations GROUP BY ward) ps ON ps.ward = ta.ward
       ORDER BY ta.ward`
    ));
    if (t.rows.length > 0) {
      turnout = t.rows
        .map((r) => {
          const row = r as { ward: string; expected_turnout_rate: number; reg: string | number };
          const reg = Number(row.reg);
          return `${row.ward}: ${reg.toLocaleString()} imported registered voters; ${row.expected_turnout_rate}% manually recorded turnout assumption (not an observed result or validated prediction)`;
        })
        .join(" | ");
    }
  } catch {
    /* keep fallback */
  }

  const configuredDate = currentCampaignProfile()?.electionDate ?? null;
  const daysToElection = configuredDate && Number.isFinite(Date.parse(configuredDate)) ? Math.ceil((Date.parse(configuredDate) - Date.now()) / 86400000) : "not configured";
  const readiness = milestonesTotal !== null && milestonesDone !== null && milestonesTotal > 0 ? Math.round((milestonesDone / milestonesTotal) * 100) : "not available";
  const fmt = (n: number | null) => n === null ? "unavailable (query failed or no value)" : n.toLocaleString();

  return `
WORKSPACE RECORD COUNTS (operational records, not official electorate totals or representative opinion):
- Days to configured election (${configuredDate ?? "date not set"}): ${daysToElection}
- Registered voters (polling station roll): ${fmt(registeredVoters)}
- Voter contacts in database: ${fmt(membersTotal)} (${fmt(supporters)} identified supporters)
- Support by ward: ${supportByWard}
- Recorded turnout assumptions: ${turnout}
- Field: ${fmt(doorsKnocked)} doors knocked | Volunteers active: ${fmt(activeVolunteers)}
- Messaging: ${fmt(messagesSent)} messages sent
- Finance: KES ${fmt(donationsTotal)} raised | KES ${fmt(pledgesPending)} in pending pledges
- Narrative: ${openThreats} open narrative threats | Social sentiment: ${posMentions} positive vs ${negMentions} negative mentions
- Campaign plan readiness: ${readiness}% (${milestonesDone}/${milestonesTotal} milestones) | Upcoming events: ${upcomingEvents}
`.trim();
}

// ---- guards (same pattern as other AI endpoints) ----
let strategistInFlight = false;
const lastCallByIp = new Map<string, number>();
const COOLDOWN_MS = 8000;

router.get("/conversations", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(strategistConversations)
      .orderBy(desc(strategistConversations.updatedAt))
      .limit(50);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "strategist list conversations failed");
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

router.get("/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  try {
    const [conv] = await db
      .select()
      .from(strategistConversations)
      .where(eq(strategistConversations.id, id));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(strategistMessages)
      .where(eq(strategistMessages.conversationId, id))
      .orderBy(asc(strategistMessages.createdAt), asc(strategistMessages.id));
    res.json({ ...conv, messages: msgs });
  } catch (err) {
    req.log.error({ err }, "strategist get conversation failed");
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

router.delete("/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  try {
    await db.delete(strategistMessages).where(eq(strategistMessages.conversationId, id));
    await db.delete(strategistConversations).where(eq(strategistConversations.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "strategist delete conversation failed");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.post("/chat", async (req, res) => {
  const { message, conversationId } = req.body as { message?: string; conversationId?: number };
  const text = message?.trim();
  if (!text) {
    res.status(400).json({ error: "message required" });
    return;
  }
  if (text.length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 characters)" });
    return;
  }

  const ip = req.ip ?? "unknown";
  const last = lastCallByIp.get(ip) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) {
    res.status(429).json({ error: "Please wait a few seconds between messages." });
    return;
  }
  if (strategistInFlight) {
    res.status(429).json({ error: "The strategist is already responding. Please wait." });
    return;
  }
  strategistInFlight = true;

  try {
    // Resolve or create conversation before streaming
    let convId: number;
    if (conversationId !== undefined && conversationId !== null) {
      if (!Number.isInteger(conversationId)) {
        res.status(400).json({ error: "Invalid conversation id" });
        return;
      }
      const [conv] = await db
        .select()
        .from(strategistConversations)
        .where(eq(strategistConversations.id, conversationId));
      if (!conv) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      convId = conv.id;
    } else {
      const title = text.length > 80 ? `${text.slice(0, 77)}...` : text;
      const [created] = await db
        .insert(strategistConversations)
        .values({ title })
        .returning();
      convId = created.id;
    }

    // Prior turns for context (last 12)
    const prior = await db
      .select()
      .from(strategistMessages)
      .where(eq(strategistMessages.conversationId, convId))
      .orderBy(desc(strategistMessages.createdAt), desc(strategistMessages.id))
      .limit(12);
    prior.reverse();

    const digest = await buildLiveDigest();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${JSON.stringify({ conversationId: convId })}\n\n`);

    let assistantText = "";
    if (process.env.MAKUENI_AI_MODE === "free") {
      const [liveSources, publicWebResults] = await Promise.all([
        fetchMakueniOfficialSources(),
        searchFreeMakueniWeb(text),
      ]);
      assistantText = buildFreeMakueniAnswer({
        message: text,
        operationalDigest: digest,
        module: "strategist",
        context: {
          liveCountyDigest: digest,
          recentConversation: prior.slice(-4).map((m) => ({ role: m.role, content: m.content.slice(0, 500) })),
          publicWebResults,
        },
        liveSources,
      });
      res.write(`data: ${JSON.stringify({ content: assistantText, mode: "free-fallback" })}\n\n`);
    } else {
      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-5.1",
          max_completion_tokens: 1536,
          messages: [
            { role: "system", content: `${CAMPAIGN_CONTEXT}\n\n${STRATEGIST_ROLE}\n\n${digest}` },
            ...prior.map((m) => ({
              role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
              content: m.content,
            })),
            { role: "user", content: text },
          ],
          stream: true,
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            assistantText += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
      } catch (err) {
        req.log.warn({ err }, "Paid strategist unavailable; using free Makueni fallback");
        const [liveSources, publicWebResults] = await Promise.all([
          fetchMakueniOfficialSources(),
          searchFreeMakueniWeb(text),
        ]);
        assistantText = buildFreeMakueniAnswer({
          message: text,
          operationalDigest: digest,
          module: "strategist",
          context: { liveCountyDigest: digest, publicWebResults },
          liveSources,
        });
        res.write(`data: ${JSON.stringify({ content: assistantText, mode: "free-fallback" })}\n\n`);
      }
    }

    if (assistantText.trim()) {
      await db.insert(strategistMessages).values([
        { conversationId: convId, role: "user", content: text },
        { conversationId: convId, role: "assistant", content: assistantText },
      ]);
      await db
        .update(strategistConversations)
        .set({ updatedAt: new Date() })
        .where(eq(strategistConversations.id, convId));
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: "Empty response from AI. Please retry." })}\n\n`);
    }
    res.end();
  } catch (err) {
    req.log.error({ err }, "strategist chat failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "Chief Strategist is unavailable. Please retry." });
    } else {
      res.end();
    }
  } finally {
    strategistInFlight = false;
    lastCallByIp.set(ip, Date.now());
  }
});

export default router;

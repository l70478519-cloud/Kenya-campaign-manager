import { Router } from "express";
import { db, membersTable, voterRegistryTable } from "@workspace/db";
import {
  insightPollsTable,
  insightQuestionsTable,
  insightResponsesTable,
  insightAnswersTable,
  insightAiSummariesTable,
  insightShareEventsTable,
} from "@workspace/db";
import { eq, desc, inArray, and, ilike, or, sql, ne, isNull } from "drizzle-orm";
import {
  CreateInsightPollBody,
  UpdateInsightPollBody,
  CreateInsightQuestionBody,
  UpdateInsightQuestionBody,
  SubmitInsightResponseBody,
  ListInsightPollsQueryParams,
} from "@workspace/api-zod";
import OpenAI from "openai";
import crypto from "crypto";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "openai-disabled",
});

const router = Router();

function param(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : (v ?? "");
}

// ─── Branded slug helpers ─────────────────────────────────────────────────────
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// Generate a slug that is unique across all polls, optionally ignoring one poll
// (so re-publishing or renaming keeps the same slug). Falls back to a short
// random suffix when the base is taken or the title yields an empty slug.
async function uniqueSlug(base: string, ignorePollId?: number): Promise<string> {
  const root = slugify(base) || "poll";
  let candidate = root;
  for (let attempt = 0; attempt < 50; attempt++) {
    const conds = [eq(insightPollsTable.slug, candidate)];
    if (ignorePollId !== undefined) conds.push(ne(insightPollsTable.id, ignorePollId));
    const [existing] = await db
      .select({ id: insightPollsTable.id })
      .from(insightPollsTable)
      .where(conds.length > 1 ? and(...conds) : conds[0])
      .limit(1);
    if (!existing) return candidate;
    candidate = attempt < 6 ? `${root}-${attempt + 2}` : `${root}-${crypto.randomBytes(2).toString("hex")}`;
  }
  return `${root}-${crypto.randomBytes(4).toString("hex")}`;
}

// ─── Polls ────────────────────────────────────────────────────────────────────

router.get("/polls", async (req, res): Promise<void> => {
  const parsed = ListInsightPollsQueryParams.safeParse(req.query);
  const status = parsed.success ? parsed.data.status : undefined;
  const polls = status
    ? await db.select().from(insightPollsTable).where(eq(insightPollsTable.status, status)).orderBy(desc(insightPollsTable.createdAt))
    : await db.select().from(insightPollsTable).orderBy(desc(insightPollsTable.createdAt));

  // Attach response counts efficiently
  const pollIds = polls.map((p) => p.id);
  const countRows = pollIds.length > 0
    ? await db.select({ pollId: insightResponsesTable.pollId, count: sql<number>`cast(count(*) as integer)` })
        .from(insightResponsesTable)
        .where(inArray(insightResponsesTable.pollId, pollIds))
        .groupBy(insightResponsesTable.pollId)
    : [];
  const countMap: Record<number, number> = {};
  for (const row of countRows) countMap[row.pollId] = row.count;
  const result = polls.map((p) => ({ ...p, responseCount: countMap[p.id] ?? 0 }));
  res.json(result);
});

router.post("/polls", async (req, res): Promise<void> => {
  const parsed = CreateInsightPollBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }
  const { title, description, targetAudience = {}, respondentIds = [] } = parsed.data;
  const shareToken = crypto.randomBytes(16).toString("hex");
  const [poll] = await db.insert(insightPollsTable).values({
    title,
    description,
    status: "draft",
    shareToken,
    targetAudience,
    respondentIds,
  }).returning();
  res.status(201).json(poll);
});

router.get("/polls/:id", async (req, res): Promise<void> => {
  const id = parseInt(param(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [poll] = await db.select().from(insightPollsTable).where(eq(insightPollsTable.id, id));
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
  res.json(poll);
});

router.patch("/polls/:id", async (req, res): Promise<void> => {
  const id = parseInt(param(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateInsightPollBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }
  const { title, description, status, slug, targetAudience, respondentIds } = parsed.data;
  const updates: Partial<typeof insightPollsTable.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (targetAudience !== undefined) updates.targetAudience = targetAudience;
  if (respondentIds !== undefined) updates.respondentIds = respondentIds;
  if (slug !== undefined) {
    // Normalise to a valid slug and guarantee uniqueness (ignoring this poll).
    const normalized = slugify(slug);
    if (!normalized) { res.status(400).json({ error: "Invalid slug", message: "Slug must contain at least one letter or number." }); return; }
    updates.slug = await uniqueSlug(normalized, id);
  }
  const [poll] = await db.update(insightPollsTable).set(updates).where(eq(insightPollsTable.id, id)).returning();
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
  res.json(poll);
});

router.delete("/polls/:id", async (req, res): Promise<void> => {
  const id = parseInt(param(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(insightPollsTable).where(eq(insightPollsTable.id, id));
  res.status(204).send();
});

router.post("/polls/:id/publish", async (req, res): Promise<void> => {
  const id = parseInt(param(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(insightPollsTable).where(eq(insightPollsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Poll not found" }); return; }

  // Auto-generate a branded slug on first publish (keeps any existing slug).
  const slug = existing.slug ?? await uniqueSlug(existing.title, id);

  const [poll] = await db.update(insightPollsTable)
    .set({ status: "published", slug, publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(insightPollsTable.id, id))
    .returning();
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
  res.json(poll);
});

// ─── Members + Voter Registry search (for respondent selection in builder) ────

router.get("/members/search", async (req, res): Promise<void> => {
  const { q = "", ward, limit = "50" } = req.query as Record<string, string>;
  const lim = Math.min(parseInt(limit) || 50, 200);

  const memberConditions = [];
  if (q.trim()) {
    memberConditions.push(or(
      ilike(membersTable.firstName, `%${q}%`),
      ilike(membersTable.lastName, `%${q}%`),
      ilike(membersTable.email, `%${q}%`),
    ));
  }
  if (ward) memberConditions.push(eq(membersTable.ward, ward));

  const voterConditions = [];
  if (q.trim()) voterConditions.push(ilike(voterRegistryTable.fullName, `%${q}%`));
  if (ward) voterConditions.push(eq(voterRegistryTable.ward, ward));

  const [members, voters] = await Promise.all([
    db.select({
      id: membersTable.id,
      firstName: membersTable.firstName,
      lastName: membersTable.lastName,
      email: membersTable.email,
      ward: membersTable.ward,
      supportLevel: membersTable.supportLevel,
      source: membersTable.id, // placeholder to distinguish
    })
      .from(membersTable)
      .where(memberConditions.length ? and(...memberConditions) : undefined)
      .limit(lim)
      .orderBy(membersTable.firstName),

    db.select({
      id: voterRegistryTable.id,
      fullName: voterRegistryTable.fullName,
      ward: voterRegistryTable.ward,
      phone: voterRegistryTable.phone,
    })
      .from(voterRegistryTable)
      .where(voterConditions.length ? and(...voterConditions) : undefined)
      .limit(lim)
      .orderBy(voterRegistryTable.fullName),
  ]);

  const memberResults = members.map((m) => ({
    id: `member-${m.id}`,
    numericId: m.id,
    source: "member" as const,
    firstName: m.firstName,
    lastName: m.lastName,
    displayName: `${m.firstName} ${m.lastName}`,
    email: m.email,
    ward: m.ward,
    supportLevel: m.supportLevel,
  }));

  const voterResults = voters.map((v) => {
    const parts = v.fullName.trim().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");
    return {
      id: `voter-${v.id}`,
      numericId: v.id,
      source: "voter" as const,
      firstName,
      lastName,
      displayName: v.fullName,
      email: null,
      ward: v.ward,
      supportLevel: null,
    };
  });

  // Merge and cap at lim
  const combined = [...memberResults, ...voterResults].slice(0, lim);
  res.json(combined);
});

// ─── Questions ────────────────────────────────────────────────────────────────

router.get("/polls/:id/questions", async (req, res): Promise<void> => {
  const pollId = parseInt(param(req.params.id));
  if (isNaN(pollId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const questions = await db.select().from(insightQuestionsTable)
    .where(eq(insightQuestionsTable.pollId, pollId))
    .orderBy(insightQuestionsTable.order);
  res.json(questions);
});

router.post("/polls/:id/questions", async (req, res): Promise<void> => {
  const pollId = parseInt(param(req.params.id));
  if (isNaN(pollId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = CreateInsightQuestionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }
  const { type, text, order = 0, options = [], required = true } = parsed.data;
  const [question] = await db.insert(insightQuestionsTable).values({ pollId, type, text, order, options, required }).returning();
  res.status(201).json(question);
});

router.patch("/polls/:id/questions/:qid", async (req, res): Promise<void> => {
  const qid = parseInt(param(req.params.qid));
  if (isNaN(qid)) { res.status(400).json({ error: "Invalid qid" }); return; }
  const parsed = UpdateInsightQuestionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }
  const updates: Partial<typeof insightQuestionsTable.$inferInsert> = {};
  const { type, text, order, options, required } = parsed.data;
  if (type !== undefined) updates.type = type;
  if (text !== undefined) updates.text = text;
  if (order !== undefined) updates.order = order;
  if (options !== undefined) updates.options = options;
  if (required !== undefined) updates.required = required;
  const [question] = await db.update(insightQuestionsTable).set(updates).where(eq(insightQuestionsTable.id, qid)).returning();
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }
  res.json(question);
});

router.delete("/polls/:id/questions/:qid", async (req, res): Promise<void> => {
  const qid = parseInt(param(req.params.qid));
  if (isNaN(qid)) { res.status(400).json({ error: "Invalid qid" }); return; }
  await db.delete(insightQuestionsTable).where(eq(insightQuestionsTable.id, qid));
  res.status(204).send();
});

// ─── Results ─────────────────────────────────────────────────────────────────
// Note: segment/segmentValue accepted as query params server-side even though
// not in OpenAPI (to avoid TS2308 collision). Client passes them directly.

router.get("/polls/:id/results", async (req, res): Promise<void> => {
  const pollId = parseInt(param(req.params.id));
  if (isNaN(pollId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const segment = (req.query.segment as string) || undefined;
  const segmentValue = (req.query.segmentValue as string) || undefined;

  const [poll] = await db.select().from(insightPollsTable).where(eq(insightPollsTable.id, pollId));
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }

  const questions = await db.select().from(insightQuestionsTable)
    .where(eq(insightQuestionsTable.pollId, pollId))
    .orderBy(insightQuestionsTable.order);

  let responses = await db.select().from(insightResponsesTable).where(eq(insightResponsesTable.pollId, pollId));

  if (segment && segmentValue) {
    responses = responses.filter((r) => {
      const segMap: Record<string, string | null | undefined> = {
        ward: r.respondentWard,
        ageGroup: r.respondentAgeGroup,
        gender: r.respondentGender,
        supportLevel: r.respondentSupportLevel,
      };
      return segMap[segment] === segmentValue;
    });
  }

  const totalResponses = responses.length;
  const invitedCount = Array.isArray(poll.respondentIds) ? (poll.respondentIds as number[]).length : 0;
  const responseRate = invitedCount > 0 ? totalResponses / invitedCount : 0;

  const responseIds = responses.map((r) => r.id);
  const allAnswers = responseIds.length > 0
    ? await db.select().from(insightAnswersTable).where(inArray(insightAnswersTable.responseId, responseIds))
    : [];

  const questionResults = questions.map((q) => {
    const answers = allAnswers.filter((a) => a.questionId === q.id);
    const totalAnswers = answers.length;

    if (q.type === "open_ended") {
      return {
        questionId: q.id,
        questionText: q.text,
        type: q.type,
        totalAnswers,
        distribution: [],
        openEndedAnswers: answers.map((a) => ({
          responseId: a.responseId,
          value: a.value,
          sentiment: null,
        })),
      };
    }

    const counts: Record<string, number> = {};
    for (const a of answers) {
      counts[a.value] = (counts[a.value] || 0) + 1;
    }
    const distribution = Object.entries(counts).map(([value, count]) => ({
      value,
      count,
      percentage: totalAnswers > 0 ? Math.round((count / totalAnswers) * 1000) / 10 : 0,
    }));

    return {
      questionId: q.id,
      questionText: q.text,
      type: q.type,
      totalAnswers,
      distribution,
      openEndedAnswers: [],
    };
  });

  res.json({
    poll,
    questions,
    totalResponses,
    invitedCount,
    responseRate,
    questionResults,
  });
});

// ─── Responses ────────────────────────────────────────────────────────────────

router.get("/polls/:id/responses", async (req, res): Promise<void> => {
  const pollId = parseInt(param(req.params.id));
  if (isNaN(pollId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const responses = await db.select().from(insightResponsesTable)
    .where(eq(insightResponsesTable.pollId, pollId))
    .orderBy(desc(insightResponsesTable.submittedAt));

  const responseIds = responses.map((r) => r.id);
  const allAnswers = responseIds.length > 0
    ? await db.select().from(insightAnswersTable).where(inArray(insightAnswersTable.responseId, responseIds))
    : [];

  const result = responses.map((r) => ({
    ...r,
    answers: allAnswers.filter((a) => a.responseId === r.id).map((a) => ({
      questionId: a.questionId,
      value: a.value,
    })),
  }));
  res.json(result);
});

router.delete("/polls/:id/responses/:responseId", async (req, res): Promise<void> => {
  const pollId = parseInt(param(req.params.id));
  const responseId = parseInt(param(req.params.responseId));
  if (isNaN(pollId) || isNaN(responseId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select({ id: insightResponsesTable.id })
    .from(insightResponsesTable)
    .where(and(eq(insightResponsesTable.id, responseId), eq(insightResponsesTable.pollId, pollId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Response not found" }); return; }
  await db.delete(insightAnswersTable).where(eq(insightAnswersTable.responseId, responseId));
  await db.delete(insightResponsesTable).where(eq(insightResponsesTable.id, responseId));
  res.status(204).end();
});

// ─── AI Summary ───────────────────────────────────────────────────────────────

router.post("/polls/:id/ai-summary", async (req, res): Promise<void> => {
  const pollId = parseInt(param(req.params.id));
  if (isNaN(pollId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [poll] = await db.select().from(insightPollsTable).where(eq(insightPollsTable.id, pollId));
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }

  const questions = await db.select().from(insightQuestionsTable)
    .where(eq(insightQuestionsTable.pollId, pollId))
    .orderBy(insightQuestionsTable.order);

  const responses = await db.select().from(insightResponsesTable).where(eq(insightResponsesTable.pollId, pollId));
  const totalResponses = responses.length;
  const responseIds = responses.map((r) => r.id);
  const allAnswers = responseIds.length > 0
    ? await db.select().from(insightAnswersTable).where(inArray(insightAnswersTable.responseId, responseIds))
    : [];

  const questionSummaries = questions.map((q) => {
    const answers = allAnswers.filter((a) => a.questionId === q.id);
    if (q.type === "open_ended") {
      return `Q: ${q.text}\nOpen-ended answers (${answers.length}):\n${answers.slice(0, 20).map((a) => `- "${a.value}"`).join("\n")}`;
    }
    const counts: Record<string, number> = {};
    for (const a of answers) counts[a.value] = (counts[a.value] || 0) + 1;
    const dist = Object.entries(counts).map(([v, c]) => `${v}: ${c} (${answers.length > 0 ? Math.round(c / answers.length * 100) : 0}%)`).join(", ");
    return `Q: ${q.text}\nAnswers: ${dist}`;
  }).join("\n\n");

  const prompt = `You are an expert research analyst. Summarize the following opinion poll results for the research team in 3-5 clear paragraphs. Highlight key findings, surprising results, and actionable insights.

Poll: "${poll.title}"
Total Responses: ${totalResponses}

${questionSummaries}

Provide a clear narrative summary that survey organisers can act on.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 4096,
  });

  const content = completion.choices[0]?.message?.content ?? "No summary generated.";

  const [existing] = await db.select().from(insightAiSummariesTable)
    .where(and(eq(insightAiSummariesTable.pollId, pollId), eq(insightAiSummariesTable.summaryType, "poll")));

  let summary;
  if (existing) {
    [summary] = await db.update(insightAiSummariesTable)
      .set({ content, generatedAt: new Date(), metadata: { totalResponses, model: "gpt-5" } })
      .where(eq(insightAiSummariesTable.id, existing.id))
      .returning();
  } else {
    [summary] = await db.insert(insightAiSummariesTable)
      .values({ pollId, summaryType: "poll", content, metadata: { totalResponses, model: "gpt-5" } })
      .returning();
  }

  res.json(summary);
});

router.get("/polls/:id/ai-summary", async (req, res): Promise<void> => {
  const pollId = parseInt(param(req.params.id));
  if (isNaN(pollId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [summary] = await db.select().from(insightAiSummariesTable)
    .where(and(eq(insightAiSummariesTable.pollId, pollId), eq(insightAiSummariesTable.summaryType, "poll")))
    .orderBy(desc(insightAiSummariesTable.generatedAt));
  if (!summary) { res.status(404).json({ error: "No summary found" }); return; }
  res.json(summary);
});

// ─── Sentiment Analysis ───────────────────────────────────────────────────────
// Returns structured JSON with per-response labels, overall score, and themes.

router.post("/polls/:id/questions/:qid/sentiment", async (req, res): Promise<void> => {
  const pollId = parseInt(param(req.params.id));
  const qid = parseInt(param(req.params.qid));
  if (isNaN(pollId) || isNaN(qid)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [question] = await db.select().from(insightQuestionsTable).where(eq(insightQuestionsTable.id, qid));
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  const responses = await db.select().from(insightResponsesTable).where(eq(insightResponsesTable.pollId, pollId));
  const responseIds = responses.map((r) => r.id);
  const answers = responseIds.length > 0
    ? await db.select().from(insightAnswersTable)
        .where(and(inArray(insightAnswersTable.responseId, responseIds), eq(insightAnswersTable.questionId, qid)))
    : [];

  if (!answers.length) { res.status(400).json({ error: "No open-ended answers to analyze" }); return; }

  const numberedAnswers = answers.slice(0, 50).map((a, i) => `${i + 1}. "${a.value}"`).join("\n");

  const prompt = `You are an expert research analyst. Perform structured sentiment analysis on the following open-ended poll responses to the question: "${question.text}"

Responses:
${numberedAnswers}

Return ONLY a valid JSON object (no markdown, no explanation) with this exact shape:
{
  "overallSentiment": "positive" | "neutral" | "negative" | "mixed",
  "overallScore": <number between -1.0 (very negative) and 1.0 (very positive)>,
  "breakdown": {
    "positive": <percentage 0-100>,
    "neutral": <percentage 0-100>,
    "negative": <percentage 0-100>
  },
  "topThemes": [
    { "theme": "<short theme name>", "sentiment": "positive"|"neutral"|"negative", "count": <number>, "exampleQuotes": ["<quote>"] }
  ],
  "perResponse": [
    { "index": <1-based number>, "sentiment": "positive"|"neutral"|"negative", "score": <-1.0 to 1.0>, "keyPhrase": "<short key phrase>" }
  ],
  "notablePositiveQuote": "<quote>",
  "notableNegativeQuote": "<quote>",
  "campaignImplication": "<1-2 sentence actionable insight for survey stakeholders>"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
  });

  const rawContent = completion.choices[0]?.message?.content ?? "{}";
  let structured: Record<string, unknown>;
  try {
    structured = JSON.parse(rawContent);
  } catch {
    structured = { raw: rawContent };
  }

  const contentStr = JSON.stringify(structured, null, 2);

  const [existing] = await db.select().from(insightAiSummariesTable)
    .where(and(
      eq(insightAiSummariesTable.pollId, pollId),
      eq(insightAiSummariesTable.summaryType, "sentiment"),
      eq(insightAiSummariesTable.questionId!, qid),
    ));

  let summary;
  if (existing) {
    [summary] = await db.update(insightAiSummariesTable)
      .set({ content: contentStr, generatedAt: new Date(), metadata: { questionId: qid, answerCount: answers.length, structured } })
      .where(eq(insightAiSummariesTable.id, existing.id))
      .returning();
  } else {
    [summary] = await db.insert(insightAiSummariesTable)
      .values({ pollId, questionId: qid, summaryType: "sentiment", content: contentStr, metadata: { questionId: qid, answerCount: answers.length, structured } })
      .returning();
  }

  res.json(summary);
});

// ─── Trend ───────────────────────────────────────────────────────────────────

router.get("/polls/:id/trend", async (req, res): Promise<void> => {
  const pollId = parseInt(param(req.params.id));
  if (isNaN(pollId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const questionText = (req.query.questionText as string) || undefined;

  const [poll] = await db.select().from(insightPollsTable).where(eq(insightPollsTable.id, pollId));
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }

  const allPolls = await db.select().from(insightPollsTable).where(eq(insightPollsTable.status, "published"));

  const periods = [];
  for (const p of allPolls) {
    const pollQuestions = await db.select().from(insightQuestionsTable)
      .where(eq(insightQuestionsTable.pollId, p.id));

    const matchingQ = questionText
      ? pollQuestions.find((q) => q.text.toLowerCase().includes(questionText.toLowerCase()))
      : pollQuestions[0];

    if (!matchingQ) continue;

    const responses = await db.select().from(insightResponsesTable).where(eq(insightResponsesTable.pollId, p.id));
    const responseIds = responses.map((r) => r.id);
    const answers = responseIds.length > 0
      ? await db.select().from(insightAnswersTable)
          .where(and(inArray(insightAnswersTable.responseId, responseIds), eq(insightAnswersTable.questionId, matchingQ.id)))
      : [];

    const counts: Record<string, number> = {};
    for (const a of answers) counts[a.value] = (counts[a.value] || 0) + 1;
    const distribution = Object.entries(counts).map(([value, count]) => ({
      value,
      count,
      percentage: answers.length > 0 ? Math.round(count / answers.length * 1000) / 10 : 0,
    }));

    periods.push({
      date: (p.publishedAt ?? p.createdAt).toISOString(),
      pollId: p.id,
      pollTitle: p.title,
      distribution,
    });
  }

  res.json({
    questionText: questionText || "All questions",
    periods: periods.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  });
});

// ─── Public Poll-Taking (no auth required) ────────────────────────────────────

router.get("/p/:shareToken", async (req, res): Promise<void> => {
  const [poll] = await db.select().from(insightPollsTable)
    .where(eq(insightPollsTable.shareToken, param(req.params.shareToken)));
  if (!poll || poll.status !== "published") { res.status(404).json({ error: "Poll not found or not published" }); return; }

  const questions = await db.select().from(insightQuestionsTable)
    .where(eq(insightQuestionsTable.pollId, poll.id))
    .orderBy(insightQuestionsTable.order);

  res.json({
    id: poll.id,
    title: poll.title,
    description: poll.description,
    questions,
  });
});

// ─── Funnel event recording (public) ─────────────────────────────────────────
// Records lightweight engagement events ("view" / "start" / "complete") keyed
// by poll and share channel so the distribution dashboard can show a funnel.
router.post("/p/:shareToken/event", async (req, res): Promise<void> => {
  const [poll] = await db.select({ id: insightPollsTable.id, status: insightPollsTable.status })
    .from(insightPollsTable)
    .where(eq(insightPollsTable.shareToken, param(req.params.shareToken)));
  if (!poll || poll.status !== "published") { res.status(404).json({ error: "Poll not found or not published" }); return; }

  const eventType = String(req.body?.eventType ?? "");
  // Only top-of-funnel events are accepted from the public client. `complete`
  // is recorded server-side in the submit handler so it cannot be forged.
  if (!["view", "start"].includes(eventType)) {
    res.status(400).json({ error: "Invalid eventType" });
    return;
  }
  const channel = typeof req.body?.channel === "string" && req.body.channel.trim()
    ? req.body.channel.trim().slice(0, 40)
    : "direct";

  await db.insert(insightShareEventsTable).values({ pollId: poll.id, eventType, channel });
  res.status(204).send();
});

// ─── Sharing & Distribution funnel analytics ──────────────────────────────────
router.get("/polls/:id/distribution", async (req, res): Promise<void> => {
  const id = parseInt(param(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [poll] = await db.select({ shareToken: insightPollsTable.shareToken, slug: insightPollsTable.slug })
    .from(insightPollsTable)
    .where(eq(insightPollsTable.id, id));
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }

  const events = await db.select({
    eventType: insightShareEventsTable.eventType,
    channel: insightShareEventsTable.channel,
    createdAt: insightShareEventsTable.createdAt,
  }).from(insightShareEventsTable).where(eq(insightShareEventsTable.pollId, id));

  type Counts = { views: number; starts: number; completes: number };
  const blank = (): Counts => ({ views: 0, starts: 0, completes: 0 });
  const bump = (c: Counts, type: string) => {
    if (type === "view") c.views++;
    else if (type === "start") c.starts++;
    else if (type === "complete") c.completes++;
  };

  const totals = blank();
  const channelMap = new Map<string, Counts>();
  const dayMap = new Map<string, Counts>();

  for (const e of events) {
    bump(totals, e.eventType);
    const ch = e.channel || "direct";
    if (!channelMap.has(ch)) channelMap.set(ch, blank());
    bump(channelMap.get(ch)!, e.eventType);
    const day = e.createdAt.toISOString().slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, blank());
    bump(dayMap.get(day)!, e.eventType);
  }

  const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  res.json({
    slug: poll.slug,
    shareToken: poll.shareToken,
    totals,
    startRate: rate(totals.starts, totals.views),
    completionRate: rate(totals.completes, totals.starts),
    conversionRate: rate(totals.completes, totals.views),
    byChannel: [...channelMap.entries()]
      .map(([channel, c]) => ({ channel, ...c }))
      .sort((a, b) => b.completes - a.completes || b.views - a.views),
    timeline: [...dayMap.entries()]
      .map(([date, c]) => ({ date, ...c }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  });
});

// ─── Shareable link with per-poll social preview tags ─────────────────────────
// WhatsApp/Facebook/Twitter crawlers read OG tags from the first HTML response
// and ignore JS, so we serve correct per-poll tags here and redirect real
// browsers on to the SPA poll page.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPollPreview(res: import("express").Response, poll: { title: string | null; description: string | null }, pollUrl: string): void {
  const title = escapeHtml(poll.title?.trim() || "Opinion Poll");
  const description = escapeHtml(
    poll.description?.trim() ||
      "Share your opinion — your response is anonymous and takes less than a minute.",
  );

  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, max-age=300");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta http-equiv="refresh" content="0; url=${pollUrl}" />
<script>window.location.replace(${JSON.stringify(pollUrl)});</script>
</head>
<body>
<p>Redirecting to the poll… <a href="${pollUrl}">Tap here if you are not redirected.</a></p>
</body>
</html>`);
}

router.get("/share/:shareToken", async (req, res): Promise<void> => {
  const token = param(req.params.shareToken);
  const pollUrl = `/insights/p/${encodeURIComponent(token)}`;

  const [poll] = await db.select().from(insightPollsTable)
    .where(eq(insightPollsTable.shareToken, token));

  if (!poll || poll.status !== "published") {
    res.redirect(302, pollUrl);
    return;
  }

  renderPollPreview(res, poll, pollUrl);
});

// ─── Branded short link (mounted at app root as /s/:slug) ─────────────────────
// Resolves a poll by its memorable slug, records a "view" funnel event attributed
// to the `src` channel, then serves OG preview tags + redirects the real browser
// to the SPA poll page (carrying the channel through to start/complete events).
export const shortLinkRouter: import("express").IRouter = Router();

shortLinkRouter.get("/:slug", async (req, res): Promise<void> => {
  const slug = param(req.params.slug);
  const channelRaw = typeof req.query.src === "string" ? req.query.src : "";
  const channel = channelRaw.trim().slice(0, 40);

  const [poll] = await db.select().from(insightPollsTable)
    .where(eq(insightPollsTable.slug, slug));

  if (!poll || poll.status !== "published") {
    res.redirect(302, "/insights/");
    return;
  }

  const channelParam = channel ? `?src=${encodeURIComponent(channel)}` : "";
  const pollUrl = `/insights/p/${encodeURIComponent(poll.shareToken)}${channelParam}`;

  // Record the view (best effort — never block the redirect on analytics).
  try {
    await db.insert(insightShareEventsTable).values({
      pollId: poll.id,
      eventType: "view",
      channel: channel || "direct",
    });
  } catch (err) {
    req.log.error({ err }, "failed to record share view event");
  }

  renderPollPreview(res, poll, pollUrl);
});

router.post("/p/:shareToken/submit", async (req, res): Promise<void> => {
  const [poll] = await db.select().from(insightPollsTable)
    .where(eq(insightPollsTable.shareToken, param(req.params.shareToken)));
  if (!poll || poll.status !== "published") { res.status(404).json({ error: "Poll not found or not published" }); return; }

  const parsed = SubmitInsightResponseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }

  const {
    respondentName,
    respondentEmail,
    respondentWard,
    respondentAgeGroup,
    respondentGender,
    respondentSupportLevel,
    submissionToken,
    channel,
    answers,
  } = parsed.data;

  if (!answers.length) { res.status(400).json({ error: "answers required" }); return; }

  // ── Deduplication layer 1: device token ──────────────────────────────────
  if (submissionToken) {
    const [tokenDupe] = await db.select({ id: insightResponsesTable.id })
      .from(insightResponsesTable)
      .where(and(
        eq(insightResponsesTable.pollId, poll.id),
        eq(insightResponsesTable.submissionToken, submissionToken)
      ))
      .limit(1);
    if (tokenDupe) {
      res.status(409).json({ error: "already_submitted", message: "You have already submitted a response to this poll." });
      return;
    }
  }

  // ── Deduplication layer 2: email ─────────────────────────────────────────
  if (respondentEmail) {
    const [emailDupe] = await db.select({ id: insightResponsesTable.id })
      .from(insightResponsesTable)
      .where(and(
        eq(insightResponsesTable.pollId, poll.id),
        ilike(insightResponsesTable.respondentEmail, respondentEmail)
      ))
      .limit(1);
    if (emailDupe) {
      res.status(409).json({ error: "already_submitted", message: "A response from this email address has already been recorded." });
      return;
    }
  }

  // Resolve respondentId — match against invited members/voters by email or name
  // poll.respondentIds stores numeric IDs; we enrich responses with a typed identity
  // e.g. "member-42" or "voter-99" so invited-vs-responded tracking is unambiguous.
  let respondentId: string | undefined;
  const invitedIds = Array.isArray(poll.respondentIds) ? (poll.respondentIds as number[]) : [];

  if (respondentEmail && invitedIds.length > 0) {
    // Look up by email in members table
    const [matchedMember] = await db.select({ id: membersTable.id })
      .from(membersTable)
      .where(and(
        ilike(membersTable.email, respondentEmail),
        inArray(membersTable.id, invitedIds)
      ))
      .limit(1);
    if (matchedMember) {
      respondentId = `member-${matchedMember.id}`;
    }
  }

  if (!respondentId && respondentName && invitedIds.length > 0) {
    // Fallback: match voter registry by name
    const [matchedVoter] = await db.select({ id: voterRegistryTable.id })
      .from(voterRegistryTable)
      .where(and(
        ilike(voterRegistryTable.fullName, `%${respondentName}%`),
        inArray(voterRegistryTable.id, invitedIds)
      ))
      .limit(1);
    if (matchedVoter) {
      respondentId = `voter-${matchedVoter.id}`;
    }
  }

  const [response] = await db.insert(insightResponsesTable).values({
    pollId: poll.id,
    respondentId: respondentId ?? null,
    respondentName,
    respondentEmail,
    respondentWard,
    respondentAgeGroup,
    respondentGender,
    respondentSupportLevel,
    submissionToken: submissionToken ?? null,
  }).returning();

  await db.insert(insightAnswersTable).values(
    answers.map((a) => ({
      responseId: response.id,
      questionId: a.questionId,
      value: a.value,
    }))
  );

  // Funnel: record a "complete" event attributed to the share channel.
  await db.insert(insightShareEventsTable).values({
    pollId: poll.id,
    eventType: "complete",
    channel: channel ? channel.slice(0, 40) : "direct",
  });

  res.status(201).json({
    ...response,
    answers,
  });
});

// Backfill branded slugs for already-published polls that predate the sharing
// module (status=published, slug IS NULL). Runs once at startup so legacy polls
// are immediately shareable via /s/:slug, QR, and social channels.
export async function backfillPublishedSlugs(): Promise<number> {
  const polls = await db
    .select({ id: insightPollsTable.id, title: insightPollsTable.title })
    .from(insightPollsTable)
    .where(and(eq(insightPollsTable.status, "published"), isNull(insightPollsTable.slug)));

  let updated = 0;
  for (const poll of polls) {
    const slug = await uniqueSlug(poll.title, poll.id);
    await db.update(insightPollsTable).set({ slug }).where(eq(insightPollsTable.id, poll.id));
    updated++;
  }
  return updated;
}

export default router;

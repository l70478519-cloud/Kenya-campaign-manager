import crypto from "node:crypto";
import {
  db,
  opinionPollsTable,
  pollVotesTable,
  insightPollsTable,
  insightQuestionsTable,
  insightResponsesTable,
  insightAnswersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

type OptionEntry = { label: string; votes?: number };

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

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "poll";
  let candidate = root;
  for (let attempt = 0; attempt < 50; attempt++) {
    const [existing] = await db
      .select({ id: insightPollsTable.id })
      .from(insightPollsTable)
      .where(eq(insightPollsTable.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    candidate = attempt < 6 ? `${root}-${attempt + 2}` : `${root}-${crypto.randomBytes(2).toString("hex")}`;
  }
  return `${root}-${crypto.randomBytes(4).toString("hex")}`;
}

async function main() {
  const opinionPolls = await db.select().from(opinionPollsTable).orderBy(opinionPollsTable.id);
  console.log(`Found ${opinionPolls.length} opinion polls to import.`);

  for (const poll of opinionPolls) {
    // Idempotency: skip if an insight poll with the same title already exists.
    const [dup] = await db
      .select({ id: insightPollsTable.id })
      .from(insightPollsTable)
      .where(eq(insightPollsTable.title, poll.title))
      .limit(1);
    if (dup) {
      console.log(`  • SKIP "${poll.title}" (already imported as insight poll #${dup.id}).`);
      continue;
    }

    const options = (Array.isArray(poll.options) ? (poll.options as OptionEntry[]) : []);
    const labels = options.map((o) => o.label).filter((l): l is string => typeof l === "string" && l.length > 0);

    const shareToken = crypto.randomBytes(16).toString("hex");
    const slug = await uniqueSlug(poll.title);
    const now = new Date();

    // 1. Insight poll (published so it appears with results in the dashboard).
    const [insightPoll] = await db
      .insert(insightPollsTable)
      .values({
        title: poll.title,
        description: poll.description ?? null,
        status: "published",
        shareToken,
        slug,
        targetAudience: poll.ward && poll.ward !== "all" ? { wards: [poll.ward] } : {},
        respondentIds: [],
        publishedAt: now,
        updatedAt: now,
      })
      .returning();

    // 2. Single-choice question carrying the poll options.
    const [question] = await db
      .insert(insightQuestionsTable)
      .values({
        pollId: insightPoll!.id,
        type: "n",
        text: poll.title,
        order: 0,
        options: labels,
        required: true,
      })
      .returning();

    // 3. Migrate each vote into a response + answer pair.
    const votes = await db.select().from(pollVotesTable).where(eq(pollVotesTable.pollId, poll.id));
    let migrated = 0;
    for (const vote of votes) {
      const label = labels[vote.optionIndex];
      if (label === undefined) continue;
      const [response] = await db
        .insert(insightResponsesTable)
        .values({
          pollId: insightPoll!.id,
          respondentName: vote.respondentName ?? null,
          respondentWard: vote.ward ?? null,
          respondentAgeGroup: vote.ageGroup ?? null,
          respondentGender: vote.gender ?? null,
          submittedAt: vote.submittedAt,
        })
        .returning();
      await db.insert(insightAnswersTable).values({
        responseId: response!.id,
        questionId: question!.id,
        value: label,
      });
      migrated++;
    }

    console.log(`  ✓ Imported "${poll.title}" → insight poll #${insightPoll!.id} (slug: ${slug}, ${migrated} responses).`);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

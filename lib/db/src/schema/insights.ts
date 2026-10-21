import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const insightPollsTable = pgTable("insight_polls", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  shareToken: text("share_token").notNull(),
  slug: text("slug").unique(),
  targetAudience: jsonb("target_audience").notNull().default({}),
  respondentIds: jsonb("respondent_ids").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

// Funnel tracking for the sharing & distribution module.
// One row per engagement event: a "view" (branded link opened), "start"
// (poll page loaded by a real respondent), or "complete" (response submitted).
// `channel` attributes the event to the share source (whatsapp/x/facebook/
// email/native/qr/copy/direct) so we can break the funnel down per channel.
export const insightShareEventsTable = pgTable("insight_share_events", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  pollId: integer("poll_id").notNull().references(() => insightPollsTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  channel: text("channel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insightQuestionsTable = pgTable("insight_questions", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  pollId: integer("poll_id").notNull().references(() => insightPollsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  text: text("text").notNull(),
  order: integer("order").notNull().default(0),
  options: jsonb("options").notNull().default([]),
  required: boolean("required").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insightResponsesTable = pgTable("insight_responses", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  pollId: integer("poll_id").notNull().references(() => insightPollsTable.id, { onDelete: "cascade" }),
  respondentId: text("respondent_id"),
  respondentEmail: text("respondent_email"),
  respondentName: text("respondent_name"),
  respondentWard: text("respondent_ward"),
  respondentAgeGroup: text("respondent_age_group"),
  respondentGender: text("respondent_gender"),
  respondentSupportLevel: text("respondent_support_level"),
  submissionToken: text("submission_token"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insightAnswersTable = pgTable("insight_answers", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  responseId: integer("response_id").notNull().references(() => insightResponsesTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => insightQuestionsTable.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insightAiSummariesTable = pgTable("insight_ai_summaries", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  pollId: integer("poll_id").notNull().references(() => insightPollsTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").references(() => insightQuestionsTable.id, { onDelete: "cascade" }),
  summaryType: text("summary_type").notNull().default("poll"),
  content: text("content").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInsightPollSchema = createInsertSchema(insightPollsTable).omit({ id: true, createdAt: true, updatedAt: true, publishedAt: true });
export const insertInsightShareEventSchema = createInsertSchema(insightShareEventsTable).omit({ id: true, createdAt: true });
export const insertInsightQuestionSchema = createInsertSchema(insightQuestionsTable).omit({ id: true, createdAt: true });
export const insertInsightResponseSchema = createInsertSchema(insightResponsesTable).omit({ id: true, submittedAt: true });
export const insertInsightAnswerSchema = createInsertSchema(insightAnswersTable).omit({ id: true, createdAt: true });
export const insertInsightAiSummarySchema = createInsertSchema(insightAiSummariesTable).omit({ id: true, generatedAt: true });

export type InsightPoll = typeof insightPollsTable.$inferSelect;
export type InsightShareEvent = typeof insightShareEventsTable.$inferSelect;
export type InsertInsightShareEvent = z.infer<typeof insertInsightShareEventSchema>;
export type InsightQuestion = typeof insightQuestionsTable.$inferSelect;
export type InsightResponse = typeof insightResponsesTable.$inferSelect;
export type InsightAnswer = typeof insightAnswersTable.$inferSelect;
export type InsightAiSummary = typeof insightAiSummariesTable.$inferSelect;
export type InsertInsightPoll = z.infer<typeof insertInsightPollSchema>;
export type InsertInsightQuestion = z.infer<typeof insertInsightQuestionSchema>;
export type InsertInsightResponse = z.infer<typeof insertInsightResponseSchema>;
export type InsertInsightAnswer = z.infer<typeof insertInsightAnswerSchema>;
export type InsertInsightAiSummary = z.infer<typeof insertInsightAiSummarySchema>;

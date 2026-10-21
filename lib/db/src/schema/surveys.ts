import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const surveysTable = pgTable("surveys", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  questions: jsonb("questions").notNull().default([]),
  responseCount: integer("response_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const surveyResponsesTable = pgTable("survey_responses", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  surveyId: integer("survey_id").notNull(),
  memberId: integer("member_id"),
  answers: jsonb("answers").notNull().default({}),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const insertSurveySchema = createInsertSchema(surveysTable).omit({ id: true, createdAt: true });
export const insertSurveyResponseSchema = createInsertSchema(surveyResponsesTable).omit({ id: true, submittedAt: true });
export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type InsertSurveyResponse = z.infer<typeof insertSurveyResponseSchema>;
export type Survey = typeof surveysTable.$inferSelect;
export type SurveyResponse = typeof surveyResponsesTable.$inferSelect;

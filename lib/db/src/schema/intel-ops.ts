import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, jsonb, date } from "drizzle-orm/pg-core";

export const opinionPollsTable = pgTable("opinion_polls", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  ward: text("ward").default("all"),
  status: text("status").notNull().default("active"),
  options: jsonb("options").notNull().default([]),
  totalVotes: integer("total_votes").notNull().default(0),
  deadline: date("deadline"),
  createdBy: text("created_by").default("Campaign Manager"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pollVotesTable = pgTable("poll_votes", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  pollId: integer("poll_id").notNull(),
  optionIndex: integer("option_index").notNull(),
  respondentName: text("respondent_name"),
  ward: text("ward"),
  ageGroup: text("age_group"),
  gender: text("gender"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const topicalIssuesTable = pgTable("topical_issues", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("infrastructure"),
  urgency: text("urgency").notNull().default("medium"),
  ward: text("ward").default("all"),
  status: text("status").notNull().default("open"),
  reportedBy: text("reported_by"),
  affectedPopulation: integer("affected_population"),
  tags: jsonb("tags").notNull().default([]),
  fieldReports: jsonb("field_reports").notNull().default([]),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type OpinionPoll = typeof opinionPollsTable.$inferSelect;
export type PollVote = typeof pollVotesTable.$inferSelect;
export type TopicalIssue = typeof topicalIssuesTable.$inferSelect;

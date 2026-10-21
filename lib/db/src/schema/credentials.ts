import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";

export const legislativeRecordsTable = pgTable("legislative_records", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  title: text("title").notNull(),
  type: text("type").notNull().default("bill"),
  description: text("description").notNull(),
  date: text("date").notNull(),
  session: text("session"),
  status: text("status").notNull().default("pending"),
  category: text("category").notNull().default("general"),
  impact: text("impact"),
  beneficiaries: text("beneficiaries"),
  evidenceLinks: jsonb("evidence_links").notNull().default([]),
  tags: jsonb("tags").notNull().default([]),
  published: boolean("published").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const achievementsTable = pgTable("achievements", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("infrastructure"),
  ward: text("ward").default("all"),
  year: text("year").notNull(),
  status: text("status").notNull().default("completed"),
  impactMetric: text("impact_metric"),
  impactValue: text("impact_value"),
  budget: text("budget"),
  fundingSource: text("funding_source"),
  partnerAgencies: jsonb("partner_agencies").notNull().default([]),
  photos: jsonb("photos").notNull().default([]),
  published: boolean("published").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const researchSessionsTable = pgTable("research_sessions", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  topic: text("topic").notNull(),
  query: text("query").notNull(),
  response: text("response").notNull(),
  keyPoints: jsonb("key_points").notNull().default([]),
  sources: jsonb("sources").notNull().default([]),
  savedToRecord: integer("saved_to_record"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LegislativeRecord = typeof legislativeRecordsTable.$inferSelect;
export type Achievement = typeof achievementsTable.$inferSelect;
export type ResearchSession = typeof researchSessionsTable.$inferSelect;

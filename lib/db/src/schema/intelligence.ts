import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const narrativeMentionsTable = pgTable("narrative_mentions", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  platform: text("platform").notNull(),
  content: text("content").notNull(),
  author: text("author"),
  url: text("url"),
  threatLevel: text("threat_level").notNull().default("low"),
  status: text("status").notNull().default("open"),
  counterNarrative: text("counter_narrative"),
  sentiment: text("sentiment").default("neutral"),
  sentimentScore: integer("sentiment_score").default(50),
  engagementCount: integer("engagement_count").default(0),
  source: text("source").default("manual"),
  aiSummary: text("ai_summary"),
  aiAnalyzed: boolean("ai_analyzed").default(false),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  respondedAt: timestamp("responded_at"),
});

export const competitorsTable = pgTable("competitors", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  name: text("name").notNull(),
  party: text("party"),
  constituency: text("constituency"),
  strengths: jsonb("strengths").notNull().default([]),
  weaknesses: jsonb("weaknesses").notNull().default([]),
  promisesMade: jsonb("promises_made").notNull().default([]),
  promisesKept: integer("promises_kept").notNull().default(0),
  promisesBroken: integer("promises_broken").notNull().default(0),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const warRoomBriefsTable = pgTable("war_room_briefs", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  priority: text("priority").notNull().default("medium"),
  category: text("category").notNull(),
  actions: jsonb("actions").notNull().default([]),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNarrativeMentionSchema = createInsertSchema(narrativeMentionsTable).omit({ id: true, detectedAt: true, respondedAt: true });
export const insertCompetitorSchema = createInsertSchema(competitorsTable).omit({ id: true, lastUpdated: true });
export const insertWarRoomBriefSchema = createInsertSchema(warRoomBriefsTable).omit({ id: true, createdAt: true });
export type InsertNarrativeMention = z.infer<typeof insertNarrativeMentionSchema>;
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type InsertWarRoomBrief = z.infer<typeof insertWarRoomBriefSchema>;
export type NarrativeMention = typeof narrativeMentionsTable.$inferSelect;
export type Competitor = typeof competitorsTable.$inferSelect;
export type WarRoomBrief = typeof warRoomBriefsTable.$inferSelect;

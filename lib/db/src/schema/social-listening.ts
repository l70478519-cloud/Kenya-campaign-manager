import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const socialMentionsTable = pgTable("social_mentions", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  summary: text("summary").notNull(),
  source: text("source"),
  url: text("url"),
  sentiment: text("sentiment").notNull().default("neutral"),
  category: text("category").notNull().default("candidate"),
  topic: text("topic"),
  publishedAt: text("published_at"),
  /** verified (link opened), unconfirmed (site blocked the check), feed (from a news feed, not fetched). */
  linkStatus: text("link_status"),
  linkCheckedAt: timestamp("link_checked_at"),
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
});

export const socialSourceHealthTable = pgTable("social_source_health", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  sourceKey: text("source_key").notNull(),
  sourceType: text("source_type").notNull().default("web_search"),
  status: text("status").notNull().default("unknown"),
  lastAttemptAt: timestamp("last_attempt_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastItemCount: integer("last_item_count").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("social_source_health_campaign_source_key_unique").on(t.ownerCampaignId, t.sourceKey)]);

export const insertSocialMentionSchema = createInsertSchema(socialMentionsTable).omit({ id: true, scannedAt: true });
export type InsertSocialMention = z.infer<typeof insertSocialMentionSchema>;
export type SocialMention = typeof socialMentionsTable.$inferSelect;
export type SocialSourceHealth = typeof socialSourceHealthTable.$inferSelect;

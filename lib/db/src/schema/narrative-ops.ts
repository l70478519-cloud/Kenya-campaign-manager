import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";

export const narrativeResponsesTable = pgTable("narrative_responses", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  mentionId: integer("mention_id"),
  platform: text("platform").notNull(),
  content: text("content").notNull(),
  draftedBy: text("drafted_by").notNull().default("manual"),
  status: text("status").notNull().default("draft"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  publishedAt: timestamp("published_at"),
  rejectionReason: text("rejection_reason"),
  targetUrl: text("target_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const platformIntegrationsTable = pgTable("platform_integrations", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  platform: text("platform").notNull(),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  accessToken: text("access_token"),
  accessTokenSecret: text("access_token_secret"),
  pageId: text("page_id"),
  bearerToken: text("bearer_token"),
  rssUrl: text("rss_url"),
  webhookUrl: text("webhook_url"),
  isActive: boolean("is_active").notNull().default(false),
  lastSynced: timestamp("last_synced"),
  lastStatus: text("last_status"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("platform_integrations_campaign_platform_unique").on(t.ownerCampaignId, t.platform)]);

export const narrativeScansTable = pgTable("narrative_scans", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  platform: text("platform").notNull(),
  query: text("query").notNull(),
  status: text("status").notNull().default("pending"),
  mentionsFound: integer("mentions_found").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type NarrativeResponse = typeof narrativeResponsesTable.$inferSelect;
export type PlatformIntegration = typeof platformIntegrationsTable.$inferSelect;
export type NarrativeScan = typeof narrativeScansTable.$inferSelect;

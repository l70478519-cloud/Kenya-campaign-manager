import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, real, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { socialMentionsTable } from "./social-listening";

export const kolTable = pgTable("kol", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  handle: text("handle"),
  tier: text("tier").notNull().default("micro"),
  /** Computed influence score (lib/kol-score.ts), or the manual override when one is set. */
  influenceScore: integer("influence_score").notNull().default(0),
  followerCount: integer("follower_count").notNull().default(0),
  /** Stance toward the candidate: supporter, neutral or opponent. Changes are logged in kol_stance_history. */
  alignment: text("alignment").notNull().default("neutral"),
  ward: text("ward"),
  notes: text("notes"),
  lastEngaged: text("last_engaged"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Measured scores (docs/SOCIAL_LISTENING_PLAN.md, KOL-1).
  /** online (social accounts) or offline (chief, clergy, chama or market leader…). Null on older rows = online. */
  kind: text("kind"),
  /** Offline role, e.g. chief, clergy, chama leader. */
  role: text("role"),
  /** Offline KOLs: field-assessed number of people they reach. */
  reachEstimate: integer("reach_estimate"),
  /** Manual score (0-100) that replaces the computed one; needs a reason. */
  scoreOverride: integer("score_override"),
  overrideReason: text("override_reason"),
  stanceUpdatedAt: timestamp("stance_updated_at"),
});

/** A KOL's accounts and channels, with figures as entered by staff (and when). */
export const kolHandlesTable = pgTable("kol_handles", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  kolId: integer("kol_id").notNull().references(() => kolTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  handle: text("handle").notNull(),
  url: text("url"),
  followers: integer("followers"),
  /** Average engagement rate in percent, as entered. */
  engagementRate: real("engagement_rate"),
  /** When the follower and engagement figures were recorded. */
  figuresAsOf: timestamp("figures_as_of"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Every stance change: who, when, why, and what it was before. */
export const kolStanceHistoryTable = pgTable("kol_stance_history", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  kolId: integer("kol_id").notNull().references(() => kolTable.id, { onDelete: "cascade" }),
  stance: text("stance").notNull(),
  previousStance: text("previous_stance"),
  /** staff (desk assessment), field (in-person assessment) or initial (when the KOL was added). */
  source: text("source").notNull(),
  note: text("note"),
  recordedBy: text("recorded_by"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

/** Social listening mentions linked to a KOL by handle or full name. */
export const kolMentionLinksTable = pgTable("kol_mention_links", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  kolId: integer("kol_id").notNull().references(() => kolTable.id, { onDelete: "cascade" }),
  mentionId: integer("mention_id").notNull().references(() => socialMentionsTable.id, { onDelete: "cascade" }),
  /** handle or name. */
  matchedOn: text("matched_on").notNull(),
  /** author (the KOL published it) or mentioned (the KOL is named in it). */
  role: text("role").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("kol_mention_links_kol_mention_unique").on(t.kolId, t.mentionId)]);

export const insertKOLSchema = createInsertSchema(kolTable).omit({ id: true, createdAt: true });
export type InsertKOL = z.infer<typeof insertKOLSchema>;
export type KOL = typeof kolTable.$inferSelect;
export type KOLHandle = typeof kolHandlesTable.$inferSelect;
export type KOLStanceChange = typeof kolStanceHistoryTable.$inferSelect;

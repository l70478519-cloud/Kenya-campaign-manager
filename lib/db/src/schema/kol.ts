import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const kolTable = pgTable("kol", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  handle: text("handle"),
  tier: text("tier").notNull().default("micro"),
  influenceScore: integer("influence_score").notNull().default(0),
  followerCount: integer("follower_count").notNull().default(0),
  alignment: text("alignment").notNull().default("neutral"),
  ward: text("ward"),
  notes: text("notes"),
  lastEngaged: text("last_engaged"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertKOLSchema = createInsertSchema(kolTable).omit({ id: true, createdAt: true });
export type InsertKOL = z.infer<typeof insertKOLSchema>;
export type KOL = typeof kolTable.$inferSelect;

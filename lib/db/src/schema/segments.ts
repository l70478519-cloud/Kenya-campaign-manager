import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const segmentsTable = pgTable("segments", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  name: text("name").notNull(),
  description: text("description"),
  criteria: jsonb("criteria").notNull().default({}),
  memberCount: integer("member_count").notNull().default(0),
  isLocked: boolean("is_locked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSegmentSchema = createInsertSchema(segmentsTable).omit({ id: true, createdAt: true });
export type InsertSegment = z.infer<typeof insertSegmentSchema>;
export type Segment = typeof segmentsTable.$inferSelect;

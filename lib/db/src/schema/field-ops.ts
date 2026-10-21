import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const canvassSessionsTable = pgTable("canvass_sessions", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  name: text("name").notNull(),
  type: text("type").notNull().default("door-to-door"),
  ward: text("ward").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull().default("planned"),
  assignedVolunteers: integer("assigned_volunteers").notNull().default(0),
  doorsTarget: integer("doors_target").notNull().default(0),
  doorsCompleted: integer("doors_completed").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const canvassVisitsTable = pgTable("canvass_visits", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  sessionId: integer("session_id").notNull(),
  memberId: integer("member_id"),
  address: text("address").notNull(),
  outcome: text("outcome").notNull(),
  supportLevel: text("support_level"),
  notes: text("notes"),
  visitedAt: timestamp("visited_at").notNull().defaultNow(),
});

export const insertCanvassSessionSchema = createInsertSchema(canvassSessionsTable).omit({ id: true, createdAt: true });
export const insertCanvassVisitSchema = createInsertSchema(canvassVisitsTable).omit({ id: true, visitedAt: true });
export type InsertCanvassSession = z.infer<typeof insertCanvassSessionSchema>;
export type InsertCanvassVisit = z.infer<typeof insertCanvassVisitSchema>;
export type CanvassSession = typeof canvassSessionsTable.$inferSelect;
export type CanvassVisit = typeof canvassVisitsTable.$inferSelect;

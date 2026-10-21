import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: text("due_date").notNull(),
  startDate: text("start_date"),
  status: text("status").notNull().default("pending"),
  category: text("category").notNull(),
  priority: text("priority").notNull().default("medium"),
  owner: text("owner"),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const campaignSettingsTable = pgTable("campaign_settings", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("campaign_settings_campaign_key_unique").on(t.ownerCampaignId, t.key)]);

export const candidateReadinessTable = pgTable("candidate_readiness", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  domain: text("domain").notNull(),
  item: text("item").notNull(),
  status: text("status").notNull().default("not_started"),
  owner: text("owner"),
  notes: text("notes"),
  weight: text("weight").notNull().default("medium"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMilestoneSchema = createInsertSchema(milestonesTable).omit({ id: true, createdAt: true, completedAt: true });
export const insertReadinessSchema = createInsertSchema(candidateReadinessTable).omit({ id: true, updatedAt: true });
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type Milestone = typeof milestonesTable.$inferSelect;
export type CampaignSetting = typeof campaignSettingsTable.$inferSelect;
export type CandidateReadiness = typeof candidateReadinessTable.$inferSelect;

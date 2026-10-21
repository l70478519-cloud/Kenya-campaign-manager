import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignEventsTable = pgTable("campaign_events", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  location: text("location"),
  ward: text("ward"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: text("status").notNull().default("scheduled"),
  attendeeCount: integer("attendee_count").notNull().default(0),
  maxAttendees: integer("max_attendees"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCampaignEventSchema = createInsertSchema(campaignEventsTable).omit({ id: true, createdAt: true });
export type InsertCampaignEvent = z.infer<typeof insertCampaignEventSchema>;
export type CampaignEvent = typeof campaignEventsTable.$inferSelect;

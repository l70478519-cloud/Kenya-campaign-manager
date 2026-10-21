import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const volunteersTable = pgTable("volunteers", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  ward: text("ward"),
  status: text("status").notNull().default("active"),
  role: text("role").notNull().default("canvasser"),
  interests: text("interests"),
  availability: text("availability"),
  message: text("message"),
  source: text("source"),
  doorsKnocked: integer("doors_knocked").notNull().default(0),
  hoursLogged: real("hours_logged").notNull().default(0),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const volunteerAssignmentsTable = pgTable("volunteer_assignments", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  volunteerId: integer("volunteer_id").notNull(),
  ward: text("ward").notNull(),
  sessionId: integer("session_id"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

export const insertVolunteerSchema = createInsertSchema(volunteersTable).omit({ id: true, joinedAt: true });
export const insertVolunteerAssignmentSchema = createInsertSchema(volunteerAssignmentsTable).omit({ id: true, assignedAt: true });
export type InsertVolunteer = z.infer<typeof insertVolunteerSchema>;
export type InsertVolunteerAssignment = z.infer<typeof insertVolunteerAssignmentSchema>;
export type Volunteer = typeof volunteersTable.$inferSelect;
export type VolunteerAssignment = typeof volunteerAssignmentsTable.$inferSelect;

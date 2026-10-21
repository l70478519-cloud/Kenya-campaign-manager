import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, boolean, date } from "drizzle-orm/pg-core";

export const volunteerTasksTable = pgTable("volunteer_tasks", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  volunteerId: integer("volunteer_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("canvassing"),
  ward: text("ward"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("assigned"),
  targetMetric: text("target_metric"),
  targetValue: integer("target_value"),
  currentValue: integer("current_value").notNull().default(0),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  assignedBy: text("assigned_by").notNull().default("Campaign Manager"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const volunteerProgressLogsTable = pgTable("volunteer_progress_logs", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  taskId: integer("task_id").notNull(),
  volunteerId: integer("volunteer_id").notNull(),
  logDate: date("log_date").notNull(),
  completionPct: integer("completion_pct").notNull().default(0),
  valueAchieved: integer("value_achieved").default(0),
  notes: text("notes"),
  blockers: text("blockers"),
  hoursSpent: integer("hours_spent").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const volunteerIssuesTable = pgTable("volunteer_issues", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  volunteerId: integer("volunteer_id").notNull(),
  taskId: integer("task_id"),
  severity: text("severity").notNull().default("medium"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  ward: text("ward"),
  status: text("status").notNull().default("open"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
});

export type VolunteerTask = typeof volunteerTasksTable.$inferSelect;
export type VolunteerProgressLog = typeof volunteerProgressLogsTable.$inferSelect;
export type VolunteerIssue = typeof volunteerIssuesTable.$inferSelect;

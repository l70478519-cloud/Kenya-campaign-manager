import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const diDatasetsTable = pgTable("di_datasets", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  name: text("name").notNull(),
  sector: text("sector").notNull().default("General"),
  description: text("description"),
  sourceType: text("source_type").notNull().default("upload"),
  columns: jsonb("columns").notNull().default([]),
  rowCount: integer("row_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const diDatasetRowsTable = pgTable("di_dataset_rows", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  datasetId: integer("dataset_id").notNull(),
  row: jsonb("row").notNull().default({}),
});

export const diQuestionsTable = pgTable("di_questions", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  datasetId: integer("dataset_id"),
  question: text("question").notNull(),
  status: text("status").notNull().default("answered"),
  intent: text("intent"),
  intentLabel: text("intent_label"),
  chartType: text("chart_type"),
  chartData: jsonb("chart_data").notNull().default([]),
  chartMeta: jsonb("chart_meta").notNull().default({}),
  explanation: text("explanation"),
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const diBriefingsTable = pgTable("di_briefings", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  datasetId: integer("dataset_id"),
  title: text("title").notNull(),
  sections: jsonb("sections").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const diSnapshotsTable = pgTable("di_snapshots", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  datasetId: integer("dataset_id"),
  metrics: jsonb("metrics").notNull().default({}),
  noNewData: boolean("no_new_data").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const diChangesTable = pgTable("di_changes", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  snapshotId: integer("snapshot_id").notNull(),
  datasetId: integer("dataset_id"),
  metric: text("metric").notNull(),
  label: text("label").notNull(),
  previous: integer("previous").notNull().default(0),
  current: integer("current").notNull().default(0),
  delta: integer("delta").notNull().default(0),
  severity: text("severity").notNull().default("low"),
  explanation: text("explanation").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDiQuestionSchema = createInsertSchema(diQuestionsTable).omit({ id: true, createdAt: true });
export const insertDiBriefingSchema = createInsertSchema(diBriefingsTable).omit({ id: true, createdAt: true });

export type InsertDiQuestion = z.infer<typeof insertDiQuestionSchema>;
export type DiQuestion = typeof diQuestionsTable.$inferSelect;
export type DiBriefing = typeof diBriefingsTable.$inferSelect;
export type DiSnapshot = typeof diSnapshotsTable.$inferSelect;
export type DiChange = typeof diChangesTable.$inferSelect;
export type DiDataset = typeof diDatasetsTable.$inferSelect;
export type DiDatasetRow = typeof diDatasetRowsTable.$inferSelect;

export type DiColumnMeta = {
  key: string;
  label: string;
  type: "number" | "text" | "date";
};

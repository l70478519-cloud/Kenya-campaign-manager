import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const voterRegistryTable = pgTable("voter_registry", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  nationalId: text("national_id"),
  voterNumber: text("voter_number"),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  gender: text("gender"),
  dateOfBirth: text("date_of_birth"),
  ward: text("ward"),
  subCounty: text("sub_county"),
  pollingStation: text("polling_station"),
  pollingStationCode: text("polling_station_code"),
  stream: text("stream"),
  status: text("status").notNull().default("pending"),
  source: text("source").notNull().default("manual"),
  importBatch: text("import_batch"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const voterSyncLogsTable = pgTable("voter_sync_logs", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  recordsProcessed: integer("records_processed").default(0),
  recordsNew: integer("records_new").default(0),
  recordsDuplicate: integer("records_duplicate").default(0),
  errorMessage: text("error_message"),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const iebcCredentialsTable = pgTable("iebc_credentials", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  apiKey: text("api_key"),
  baseUrl: text("base_url").default("https://api.iebc.or.ke/v1"),
  clientId: text("client_id"),
  notes: text("notes"),
  lastTested: timestamp("last_tested"),
  lastStatus: text("last_status"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVoterSchema = createInsertSchema(voterRegistryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVoter = z.infer<typeof insertVoterSchema>;
export type VoterRecord = typeof voterRegistryTable.$inferSelect;

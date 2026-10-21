import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pollingStationsTable = pgTable("polling_stations", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  ward: text("ward").notNull(),
  registeredVoters: integer("registered_voters").notNull().default(0),
  streamCount: integer("stream_count").notNull().default(1),
  agentName: text("agent_name"),
  agentPhone: text("agent_phone"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("polling_stations_campaign_code_unique").on(t.ownerCampaignId, t.code)]);

export const tallyResultsTable = pgTable("tally_results", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  stationId: integer("station_id").notNull(),
  stationCode: text("station_code").notNull(),
  candidateName: text("candidate_name").notNull(),
  party: text("party"),
  votes: integer("votes").notNull().default(0),
  totalValidVotes: integer("total_valid_votes"),
  rejectedVotes: integer("rejected_votes").notNull().default(0),
  registeredVoters: integer("registered_voters"),
  status: text("status").notNull().default("submitted"),
  submittedBy: text("submitted_by"),
  verifiedBy: text("verified_by"),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const electionEventsTable = pgTable("election_events_log", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  type: text("type").notNull().default("info"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  ward: text("ward"),
  stationCode: text("station_code"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const turnoutAssumptionsTable = pgTable("turnout_assumptions", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  ward: text("ward").notNull(),
  expectedTurnoutRate: integer("expected_turnout_rate").notNull().default(65),
  muleSupportShare: integer("mule_support_share").notNull().default(50),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("turnout_assumptions_campaign_ward_unique").on(t.ownerCampaignId, t.ward)]);

export const insertPollingStationSchema = createInsertSchema(pollingStationsTable).omit({ id: true, createdAt: true });
export const insertTallyResultSchema = createInsertSchema(tallyResultsTable).omit({ id: true, createdAt: true, verifiedAt: true });
export const insertElectionEventSchema = createInsertSchema(electionEventsTable).omit({ id: true, createdAt: true });

export type InsertPollingStation = z.infer<typeof insertPollingStationSchema>;
export type InsertTallyResult = z.infer<typeof insertTallyResultSchema>;
export type InsertElectionEvent = z.infer<typeof insertElectionEventSchema>;
export type PollingStation = typeof pollingStationsTable.$inferSelect;
export type TallyResult = typeof tallyResultsTable.$inferSelect;
export type ElectionEvent = typeof electionEventsTable.$inferSelect;
export type TurnoutAssumption = typeof turnoutAssumptionsTable.$inferSelect;

import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fundraisingCampaignsTable = pgTable("fundraising_campaigns", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  name: text("name").notNull(),
  description: text("description"),
  goalAmount: integer("goal_amount").notNull().default(0),
  raisedAmount: integer("raised_amount").notNull().default(0),
  status: text("status").notNull().default("active"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const donationsTable = pgTable("donations", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  campaignId: integer("campaign_id").references(() => fundraisingCampaignsTable.id, { onDelete: "set null" }),
  donorName: text("donor_name").notNull(),
  donorId: integer("donor_id").references(() => donorsTable.id, { onDelete: "set null" }),
  amount: integer("amount").notNull(),
  channel: text("channel").notNull().default("cash"),
  reference: text("reference"),
  ward: text("ward"),
  notes: text("notes"),
  reconciled: integer("reconciled").notNull().default(0),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const donorsTable = pgTable("donors", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  ward: text("ward"),
  type: text("type").notNull().default("individual"),
  tier: text("tier").notNull().default("regular"),
  totalGiven: integer("total_given").notNull().default(0),
  notes: text("notes"),
  tags: text("tags"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pledgesTable = pgTable("pledges", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  donorName: text("donor_name").notNull(),
  donorId: integer("donor_id").references(() => donorsTable.id, { onDelete: "set null" }),
  campaignId: integer("campaign_id").references(() => fundraisingCampaignsTable.id, { onDelete: "set null" }),
  amount: integer("amount").notNull(),
  promisedDate: text("promised_date"),
  fulfilledDate: text("fulfilled_date"),
  status: text("status").notNull().default("pending"),
  channel: text("channel"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mpesaTransactionsTable = pgTable("mpesa_transactions", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  checkoutRequestId: text("checkout_request_id").notNull().unique(),
  merchantRequestId: text("merchant_request_id"),
  phone: text("phone").notNull(),
  amount: integer("amount").notNull(),
  accountReference: text("account_reference"),
  donorName: text("donor_name"),
  campaignId: integer("campaign_id").references(() => fundraisingCampaignsTable.id, { onDelete: "set null" }),
  ward: text("ward"),
  status: text("status").notNull().default("pending"),
  resultCode: integer("result_code"),
  resultDesc: text("result_desc"),
  mpesaReceipt: text("mpesa_receipt"),
  donationId: integer("donation_id").references(() => donationsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFundraisingCampaignSchema = createInsertSchema(fundraisingCampaignsTable).omit({ id: true, createdAt: true });
export const insertDonationSchema = createInsertSchema(donationsTable).omit({ id: true, createdAt: true });
export const insertDonorSchema = createInsertSchema(donorsTable).omit({ id: true, createdAt: true });
export const insertPledgeSchema = createInsertSchema(pledgesTable).omit({ id: true, createdAt: true });

export type InsertFundraisingCampaign = z.infer<typeof insertFundraisingCampaignSchema>;
export type FundraisingCampaign = typeof fundraisingCampaignsTable.$inferSelect;
export type InsertDonation = z.infer<typeof insertDonationSchema>;
export type Donation = typeof donationsTable.$inferSelect;
export type InsertDonor = z.infer<typeof insertDonorSchema>;
export type Donor = typeof donorsTable.$inferSelect;
export type InsertPledge = z.infer<typeof insertPledgeSchema>;
export type Pledge = typeof pledgesTable.$inferSelect;
export type MpesaTransaction = typeof mpesaTransactionsTable.$inferSelect;

import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  ward: text("ward"),
  status: text("status").notNull().default("active"),
  supportLevel: text("support_level"),
  smsConsent: boolean("sms_consent").notNull().default(false),
  whatsappConsent: boolean("whatsapp_consent").notNull().default(false),
  emailConsent: boolean("email_consent").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;

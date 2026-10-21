import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const messagingProvidersTable = pgTable("messaging_providers", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  channel: text("channel").notNull(),
  provider: text("provider").notNull(),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  username: text("username"),
  senderId: text("sender_id"),
  phoneNumber: text("phone_number"),
  phoneNumberId: text("phone_number_id"),
  businessAccountId: text("business_account_id"),
  webhookSecret: text("webhook_secret"),
  smtpHost: text("smtp_host"),
  smtpPort: text("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPassword: text("smtp_password"),
  fromEmail: text("from_email"),
  fromName: text("from_name"),
  isActive: boolean("is_active").notNull().default(false),
  testStatus: text("test_status"),
  lastTested: timestamp("last_tested"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MessagingProvider = typeof messagingProvidersTable.$inferSelect;

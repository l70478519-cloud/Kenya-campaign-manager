import { campaignIdColumn } from "./_tenant";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const generatedDocumentsTable = pgTable("generated_documents", {
  id: serial("id").primaryKey(),
  ownerCampaignId: campaignIdColumn(),
  docType: text("doc_type").notNull(), // "speech" | "manifesto"
  title: text("title").notNull(),
  occasion: text("occasion"),
  audience: text("audience"),
  ward: text("ward"),
  language: text("language").notNull().default("English"),
  tone: text("tone"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGeneratedDocumentSchema = createInsertSchema(generatedDocumentsTable).omit({
  id: true,
  createdAt: true,
});

export type GeneratedDocument = typeof generatedDocumentsTable.$inferSelect;
export type InsertGeneratedDocument = z.infer<typeof insertGeneratedDocumentSchema>;

import { pgTable, serial, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const adminUsersTable = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  phone: text("phone"),
  role: text("role").notNull().default("viewer"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  inviteToken: text("invite_token"),
  invitedBy: text("invited_by"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const adminRolesTable = pgTable("admin_roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#6b7280"),
  permissions: jsonb("permissions").notNull().default({}),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  userName: text("user_name").notNull(),
  action: text("action").notNull(),
  module: text("module").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  severity: text("severity").notNull().default("info"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemConfigTable = pgTable("system_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull().default(""),
  category: text("category").notNull().default("general"),
  description: text("description").notNull().default(""),
  isSecret: boolean("is_secret").notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AdminUser = typeof adminUsersTable.$inferSelect;
export type AdminRole = typeof adminRolesTable.$inferSelect;
export type AuditLog = typeof auditLogsTable.$inferSelect;
export type SystemConfig = typeof systemConfigTable.$inferSelect;

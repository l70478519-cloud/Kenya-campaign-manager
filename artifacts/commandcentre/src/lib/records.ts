import {
  PiggyBank, Receipt, Truck, Handshake, CalendarClock, BookCheck, Siren, FileSignature, History,
  Gauge, Network, GraduationCap, Briefcase, ListChecks, AlertTriangle, ShieldCheck, LayoutGrid,
  type LucideIcon,
} from "lucide-react";

export const BASE = import.meta.env.BASE_URL;

export type FieldType =
  | "text" | "textarea" | "number" | "money" | "date" | "datetime"
  | "select" | "email" | "phone" | "url" | "ward" | "rating" | "boolean";

export interface FieldDef {
  key: string; label: string; type: FieldType; required?: boolean; options?: string[];
  help?: string; list?: boolean; sensitive?: boolean; max?: number; min?: number;
}
export interface ModuleDef {
  key: string; title: string; feature: string; description: string; rbac: string; navGroup: string;
  icon: string; titleField: string; fields: FieldDef[]; statuses: string[]; initialStatus: string;
  transitions?: Record<string, string[]>; separateApprover?: string[]; closedStatuses: string[];
  dueField?: string; importable?: boolean; access: "read" | "write";
}
export interface RecordRow {
  id: string | number; module: string; title: string; status: string; ward: string | null;
  data: Record<string, unknown>; createdBy: string; updatedBy: string | null; createdAt: string; updatedAt: string;
}

export const ICONS: Record<string, LucideIcon> = {
  PiggyBank, Receipt, Truck, Handshake, CalendarClock, BookCheck, Siren, FileSignature, History,
  Gauge, Network, GraduationCap, Briefcase, ListChecks, AlertTriangle, ShieldCheck,
};
export const iconFor = (name: string): LucideIcon => ICONS[name] ?? LayoutGrid;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}api/${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (HTTP ${res.status})`);
  }
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export const humanize = (s: string) => s.replace(/[_-]/g, " ").replace(/^\w/, c => c.toUpperCase());

export function formatValue(field: FieldDef | undefined, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (!field) return String(v);
  switch (field.type) {
    case "money": return `KES ${Number(v).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
    case "number": return Number(v).toLocaleString("en-KE");
    case "boolean": return v ? "Yes" : "No";
    case "rating": return `${"★".repeat(Number(v))}${"☆".repeat(5 - Number(v))}`;
    case "datetime": return new Date(String(v)).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
    case "date": return new Date(String(v) + "T00:00:00").toLocaleDateString("en-KE", { dateStyle: "medium" });
    default: return String(v);
  }
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(c => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** Converts a stored value into what an <input> expects. */
export function toInputValue(field: FieldDef, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (field.type === "datetime") {
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (field.type === "boolean") return v ? "true" : "false";
  return String(v);
}

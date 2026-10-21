import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("Kaiti has exactly four canonical wards", () => {
  const geo = read("artifacts/api-server/src/data/makueni-geography.ts");
  assert.match(geo, /constituency:\s*"Kaiti"/);
  const wards = geo.match(/wards:\s*\[([^\]]+)\]/)?.[1].match(/"[^"]+"/g)?.map(s => s.slice(1,-1)) ?? [];
  assert.deepEqual([...wards].sort(), ["Ilima", "Kee", "Kilungu", "Ukia"]);
});

test("dashboard never claims unverified integration health", () => {
  const page = read("artifacts/commandcentre/src/pages/dashboard.tsx");
  assert.match(page, /SERVICE HEALTH NOT VERIFIED/);
  assert.doesNotMatch(page, /label:\s*"MESSAGING_UPLINK",\s*status:\s*"OPERATIONAL"/);
});

test("message statistics exclude drafts and unsent campaigns", () => {
  const messaging = read("artifacts/api-server/src/routes/messaging.ts");
  assert.match(messaging, /isNotNull\(messageCampaignsTable\.sentAt\)/);
});

test("Field session deletion uses active campaign geography and a transaction", () => {
  const field = read("artifacts/api-server/src/routes/field-ops.ts");
  assert.match(field, /db\.transaction\(async \(tx\)/);
  assert.match(field, /inArray\(canvassSessionsTable\.ward, campaignWards\(\)\)/);
});

test("Event mutations use active campaign geography", () => {
  const events = read("artifacts/api-server/src/routes/events.ts");
  assert.match(events, /inArray\(campaignEventsTable\.ward, campaignWards\(\)\)/);
  assert.match(events, /db\.delete\(campaignEventsTable\)\.where\(and\(/);
});

test("production sessions require secret and use secure cookies", () => {
  const app = read("artifacts/api-server/src/app.ts");
  assert.match(app, /if \(isProd && !sessionSecret\)/);
  assert.match(app, /httpOnly:\s*true/);
  assert.match(app, /secure:\s*process\.env\.NODE_ENV === "production"/);
});

test("source health endpoint does not falsely imply database readiness", () => {
  const health = read("artifacts/api-server/src/routes/health.ts");
  assert.match(health, /router\.get\("\/healthz"/);
  assert.doesNotMatch(health, /db\.execute/);
});

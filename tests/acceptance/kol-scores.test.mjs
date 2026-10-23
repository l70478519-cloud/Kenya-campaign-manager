import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

// Measured KOL scores, mention links and stance history (docs/SOCIAL_LISTENING_PLAN.md, KOL-1).

registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); } catch (err) {
      if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});
const lib = (name) => import(new URL(`../../artifacts/api-server/src/lib/${name}.ts`, import.meta.url).href);
const { scoreKol, tierFor, KOL_WEIGHTS } = await lib("kol-score");
const { matchKols } = await lib("kol-match");
const { KOL_MIGRATION_SQL } = await lib("kol-sql");
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

const now = new Date("2026-10-23T12:00:00Z");
const base = {
  kind: "online", followers: [12_400], reachEstimate: null, engagementRates: [3], mentions90d: 2,
  ward: "Kilungu", campaignWards: ["Ukia", "Kee", "Kilungu", "Ilima"], lastActivity: new Date("2026-10-18T12:00:00Z"),
  now, override: null, overrideReason: null,
};

test("weights add up to 100 and every component is explained", () => {
  assert.equal(Object.values(KOL_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const s = scoreKol(base);
  const byKey = Object.fromEntries(s.components.map(c => [c.key, c]));
  assert.equal(byKey.reach.value, 68, "log scale: 12,400 followers");
  assert.equal(byKey.engagement.value, 30);
  assert.equal(byKey.relevance.value, 40);
  assert.equal(byKey.locality.value, 100);
  assert.equal(byKey.recency.value, 100, "active 5 days ago");
  for (const c of s.components) assert.ok(c.detail.length > 5, `${c.key} has an explanation`);
  // (68×35 + 30×20 + 40×20 + 100×15 + 100×10) / 100 = 62.8
  assert.equal(s.score, 63);
  assert.equal(s.method, "measured");
});

test("missing data is left out and the weights re-balanced, never assumed", () => {
  const s = scoreKol({ ...base, engagementRates: [], lastActivity: null });
  assert.deepEqual(s.missing, ["Engagement", "Recency"]);
  // (68×35 + 40×20 + 100×15) / 70 = 66.9
  assert.equal(s.score, 67);
  const empty = scoreKol({ ...base, followers: [0], engagementRates: [], mentions90d: 0, ward: null, lastActivity: null });
  assert.deepEqual(empty.missing, ["Reach", "Engagement", "Recency"]);
  assert.equal(empty.score, 13, "only relevance 0 and locality 30 remain: (0×20 + 30×15) / 35 = 12.9");
});

test("offline KOLs use the field reach estimate; manual scores keep the measured value visible", () => {
  const offline = scoreKol({ ...base, kind: "offline", followers: [0], reachEstimate: 5000, engagementRates: [] });
  const reach = offline.components.find(c => c.key === "reach");
  assert.equal(reach.value, 74);
  assert.match(reach.detail, /field estimate/);
  const manual = scoreKol({ ...base, override: 90, overrideReason: "Bishop of the largest church in Kilungu" });
  assert.equal(manual.score, 90);
  assert.equal(manual.method, "override");
  assert.equal(manual.measured, 63);
  assert.equal(manual.overrideReason, "Bishop of the largest church in Kilungu");
  assert.equal(tierFor(5_000), "micro");
  assert.equal(tierFor(12_400), "mid");
  assert.equal(tierFor(250_000), "macro");
  assert.equal(tierFor(2_000_000), "mega");
});

test("mentions link to KOLs by handle or full name, as author or subject", () => {
  const kols = [
    { kolId: 1, name: "Mbaitu TV", handles: ["@mbaitutv"] },
    { kolId: 2, name: "Hon. Joshua Kimilu", handles: [] },
    { kolId: 3, name: "Kioko", handles: [] },
  ];
  assert.deepEqual(matchKols({ summary: "Kaiti town hall live", source: "YouTube · Mbaitu TV" }, kols), [{ kolId: 1, matchedOn: "name", role: "author" }]);
  assert.deepEqual(matchKols({ summary: "Clip shared by @MbaituTV this morning", source: "Tuko" }, kols), [{ kolId: 1, matchedOn: "handle", role: "mentioned" }]);
  assert.deepEqual(matchKols({ summary: "Joshua Kimilu retains Kaiti MP seat", source: "KBC" }, kols), [{ kolId: 2, matchedOn: "name", role: "mentioned" }]);
  assert.deepEqual(matchKols({ summary: "𝗝𝗼𝘀𝗵𝘂𝗮 𝗞𝗶𝗺𝗶𝗹𝘂 speaks", source: null }, kols).map(m => m.kolId), [2], "decorative letters");
  assert.deepEqual(matchKols({ summary: "Mr Kioko sells maize at Kilungu market", source: null }, kols), [], "single-word names are too common to match");
  assert.deepEqual(matchKols({ summary: "Kimilu said", source: null }, kols), [], "partial names don't match");
});

test("startup SQL is identical to the migration file", () => {
  assert.equal(KOL_MIGRATION_SQL, read("lib/db/migrations/20261025_kol_measured_scores.sql").replace(/\r\n/g, "\n"));
  assert.match(read("artifacts/api-server/src/lib/seed.ts"), /await ensureKolTables\(\);/);
});

test("stance changes are recorded; manual scores need a reason; actions are audited", () => {
  const kol = read("artifacts/api-server/src/routes/kol.ts");
  assert.match(kol, /router\.post\("\/:id\/stance"/);
  assert.match(kol, /previousStance: current\.alignment/, "history keeps the previous stance");
  assert.match(kol, /Stance changes go through the history/, "PATCH can't change stance without a history entry");
  assert.match(kol, /Give a reason \(5\+ characters\) for a manual score/);
  assert.match(kol, /await audit\(req, "Recorded KOL stance"/);
  assert.match(kol, /"Set manual KOL score"/);
  assert.match(kol, /k\.ward === null \|\| k\.ward === "" \|\| isCampaignArea/, "KOLs without a ward are no longer hidden");
});

test("editing a KOL never resets fields the edit left out (regression)", () => {
  const kol = read("artifacts/api-server/src/routes/kol.ts");
  const base = kol.slice(kol.indexOf("const baseSchema = z.object({"), kol.indexOf("});", kol.indexOf("const baseSchema = z.object({")));
  assert.ok(!base.includes(".default("), "the schema used for edits (baseSchema.partial()) has no defaults");
  const create = kol.slice(kol.indexOf("const createSchema = baseSchema.extend({"), kol.indexOf("});", kol.indexOf("const createSchema = baseSchema.extend({")));
  assert.ok(create.includes('.default("online")') && create.includes('.default("neutral")'), "defaults apply only when creating");
  assert.ok(kol.includes("baseSchema.partial().refine"), "edits use the schema without defaults");
});

test("recency and relevance use the publication date when known (regression)", () => {
  const svc = read("artifacts/api-server/src/lib/kol-service.ts");
  assert.ok(svc.includes("Date.parse(l.publishedAt)"), "uses the publication date");
  assert.ok(svc.includes(": l.scannedAt.getTime()"), "falls back to the collection date");
});

test("scans link mentions to KOLs; Analytics counts the stances the app saves", () => {
  assert.match(read("artifacts/api-server/src/routes/social.ts"), /linkMentionsToKols\(inserted\.map/);
  const analytics = read("artifacts/api-server/src/routes/analytics.ts");
  assert.match(analytics, /alignment\} = 'supporter'/);
  assert.match(analytics, /alignment\} = 'opponent'/);
  assert.doesNotMatch(analytics, /kolTable.alignment} = '(aligned|opposed)'/, "every KOL alignment count uses the saved values");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchScope, categoryQueries, categoryPrompt } from "../../artifacts/api-server/src/lib/social-terms.ts";
import { isNonPublicAddress, checkPublicLink } from "../../artifacts/api-server/src/lib/link-check.ts";

// Social listening, campaign scope and link checks (docs/SOCIAL_LISTENING_PLAN.md, SL-1).

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const profile = (seat, extra = {}) => ({ seat, candidateName: "Hon. Jane Mwende", county: "Makueni", constituency: null, wards: [], ...extra });

test("search area follows the seat", () => {
  assert.equal(searchScope(profile("President", { county: null, wards: ["Makueni", "Nairobi"] })).areaLabel, "Kenya");
  for (const seat of ["Governor", "Senator", "Woman Rep"]) assert.equal(searchScope(profile(seat)).areaLabel, "Makueni County", seat);
  assert.equal(searchScope(profile("MP", { constituency: "Kaiti", wards: ["Ukia", "Kee"] })).areaLabel, "Kaiti Constituency");
  assert.equal(searchScope(profile("MCA", { constituency: "Kaiti", wards: ["Ukia"] })).areaLabel, "Ukia Ward");
  assert.equal(searchScope(profile("MP")).areaLabel, "", "no invented area when the constituency isn't set");
  assert.equal(searchScope(profile("Governor")).shortName, "Jane Mwende", "titles are stripped from the short name");
});

test("a county-level campaign never searches for a 'Constituency'", () => {
  const scope = searchScope(profile("Governor", { wards: ["Wote", "Kalawa"] }));
  for (const key of ["candidate", "issues", "opponent"]) {
    for (const q of categoryQueries(key, scope)) assert.doesNotMatch(q, /constituency/i, `${key}: ${q}`);
    assert.doesNotMatch(categoryPrompt(key, scope) ?? "", /constituency/i, key);
  }
  assert.ok(categoryQueries("candidate", scope).some(q => q.includes("Makueni")), "candidate queries name the county");
  assert.ok(categoryQueries("candidate", scope).some(q => q.includes("governor")), "candidate queries name the office");
});

test("a presidential campaign searches nationally", () => {
  const scope = searchScope(profile("President", { county: null, wards: ["Makueni", "Nairobi"] }));
  assert.equal(scope.national, true);
  for (const q of categoryQueries("issues", scope)) assert.match(q, /^Kenya /);
});

test("listed opponents are searched; none listed means the category is skipped", () => {
  const scope = searchScope(profile("MP", { constituency: "Kaiti", wards: ["Ukia"] }));
  assert.deepEqual(categoryQueries("competitor", scope, ["John Doe", "Mary Roe"]), ['"John Doe" Kaiti', '"Mary Roe" Kaiti']);
  assert.deepEqual(categoryQueries("competitor", scope, []), []);
  assert.equal(categoryPrompt("competitor", scope, []), null);
});

test("private, loopback and internal addresses are never fetched", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
    assert.equal(isNonPublicAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "102.68.79.1", "2a00:1450:4001:80b::200e"]) assert.equal(isNonPublicAddress(ip), false, ip);
});

const publicDns = async () => ["93.184.216.34"];
const respond = (status, location) => async () => ({ status, headers: { get: (h) => (h.toLowerCase() === "location" ? location ?? null : null) }, body: null });

test("link check: opens, missing, blocked, private and redirected links", async () => {
  assert.equal((await checkPublicLink("https://news.example.co.ke/a", { lookup: publicDns, fetcher: respond(200) })).status, "verified");
  assert.equal((await checkPublicLink("https://news.example.co.ke/a", { lookup: publicDns, fetcher: respond(404) })).status, "broken");
  assert.equal((await checkPublicLink("https://news.example.co.ke/a", { lookup: publicDns, fetcher: respond(403) })).status, "unconfirmed");
  assert.equal((await checkPublicLink("https://internal.example/a", { lookup: async () => ["10.0.0.5"], fetcher: respond(200) })).status, "broken");
  assert.equal((await checkPublicLink("http://localhost:8080/admin", { lookup: publicDns, fetcher: respond(200) })).status, "broken");
  assert.equal((await checkPublicLink("ftp://news.example.co.ke/a", { lookup: publicDns, fetcher: respond(200) })).status, "broken");

  // A public page that redirects to an internal address is refused at the redirect.
  const hops = { "https://news.example.co.ke/a": [301, "http://metadata.internal/latest"], "http://metadata.internal/latest": [200] };
  const lookup = async (host) => (host === "metadata.internal" ? ["169.254.169.254"] : ["93.184.216.34"]);
  const fetcher = async (url) => { const [status, location] = hops[url]; return respond(status, location)(); };
  assert.equal((await checkPublicLink("https://news.example.co.ke/a", { lookup, fetcher })).status, "broken");

  // Ordinary redirects are followed.
  const ok = { "https://news.example.co.ke/a": [302, "/story"], "https://news.example.co.ke/story": [200] };
  const okFetch = async (url) => { const [status, location] = ok[url]; return respond(status, location)(); };
  const result = await checkPublicLink("https://news.example.co.ke/a", { lookup: publicDns, fetcher: okFetch });
  assert.equal(result.status, "verified");
  assert.equal(result.finalUrl, "https://news.example.co.ke/story");

  assert.equal((await checkPublicLink("https://slow.example/a", { lookup: publicDns, fetcher: async () => { throw new Error("timeout"); } })).status, "unconfirmed");
});

test("scans are limited per campaign, not across the platform", () => {
  const social = read("artifacts/api-server/src/routes/social.ts");
  assert.match(social, /const scanState = new Map<number/);
  assert.match(social, /req\.campaignId/);
  assert.doesNotMatch(social, /let scanInFlight/);
  assert.match(social, /checkLinks\(/, "AI-supplied links are checked before saving");
});

test("source status is campaign-owned", () => {
  const isolation = read("artifacts/api-server/src/lib/tenant-isolation.ts");
  const shared = isolation.slice(isolation.indexOf("const SHARED_TABLES"), isolation.indexOf("]);", isolation.indexOf("const SHARED_TABLES")));
  assert.doesNotMatch(shared, /social_source_health/);
  assert.match(isolation, /"social_source_health", "source_key", "social_source_health_source_key_key"/);
  assert.match(isolation, /"social_source_health", "source_key", "social_source_health_source_key_unique"/);
  assert.match(isolation, /DROP INDEX IF EXISTS/);
  const schema = read("lib/db/src/schema/social-listening.ts");
  assert.match(schema, /unique\("social_source_health_campaign_source_key_unique"\)\.on\(t\.ownerCampaignId, t\.sourceKey\)/);
  assert.match(read("artifacts/api-server/src/lib/seed.ts"), /await ensureSocialListeningColumns\(\);/);
});

test("KOL messages and checks are campaign-neutral", () => {
  const kol = read("artifacts/api-server/src/routes/kol.ts");
  assert.doesNotMatch(kol, /Makueni/);
  assert.match(kol, /Invalid KOL id/);
});

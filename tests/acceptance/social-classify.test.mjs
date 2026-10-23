import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyByRules, needsReview, detectLanguage, detectTopic, parseAiClassifications, classificationPrompt, COUNTED_MENTIONS_SQL,
} from "../../artifacts/api-server/src/lib/social-classify.ts";

// Classification, review queue, field mentions and report (docs/SOCIAL_LISTENING_PLAN.md, SL-3).

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("word-list classifier: sentiment, confidence and review", () => {
  const strong = classifyByRules("Governor launched and commissioned the new hospital wing, residents praised the upgrade");
  assert.equal(strong.sentiment, "positive");
  assert.ok(strong.confidence >= 65 && strong.confidence <= 70);
  assert.equal(needsReview(strong), false, "clear positive news is counted automatically");

  const single = classifyByRules("Residents complain about the market");
  assert.equal(single.sentiment, "negative");
  assert.equal(single.confidence, 55);
  assert.equal(needsReview(single), true, "a single keyword is not enough to count an opinion");

  const mixed = classifyByRules("Project launched but stalled after protests");
  assert.equal(mixed.confidence, 35);
  assert.equal(needsReview(mixed), true);

  const plain = classifyByRules("County assembly sits on Tuesday");
  assert.equal(plain.sentiment, "neutral");
  assert.equal(needsReview(plain), false, "plain neutral news doesn't flood the queue");

  const urgent = classifyByRules("Rally disrupted by violence; police say two people were attacked");
  assert.equal(urgent.urgency, "high");
  assert.equal(needsReview(urgent), true, "urgent items always go to a person");

  assert.equal(classifyByRules("Wakazi walalamika kuhusu ufisadi na maandamano").sentiment, "negative", "Swahili cues count");
  assert.equal(classifyByRules("anything").classifiedBy, "rules");
  assert.ok(classifyByRules("praised welcomed launched commissioned completed").confidence <= 70, "rules never claim more than 70%");
});

test("language and topic detection", () => {
  assert.equal(detectLanguage("The governor said that the road to Wote will be completed in March"), "en");
  assert.equal(detectLanguage("Mbunge wa eneo hilo amesema kwamba wananchi wa kaunti ya Makueni watapata maji"), "sw");
  assert.equal(detectLanguage("Msee manze, wananchi wa mtaa ni noma sana na serikali"), "sheng");
  assert.equal(detectLanguage("The wananchi wa Kaiti are waiting for the serikali to fix the road and the bridge"), "mixed");
  assert.equal(detectLanguage("Kaiti"), "unknown");
  assert.equal(detectLanguage("MAKUENI COUNTY STEPS UP SUPPORT FOR FLOOD VICTIMS"), "en", "short headline with one English word");
  assert.equal(detectLanguage("Mradi wa Kaiti"), "sw", "short headline with one Swahili word");
  assert.equal(detectTopic("New borehole for Ukia residents"), "Water");
  assert.equal(detectTopic("Barabara ya Kilungu imeharibika"), "Roads");
  assert.equal(detectTopic("Nothing in particular"), null);
});

test("AI answers are validated; invented or malformed labels are ignored", () => {
  const out = `Here you go: [
    {"id": 1, "sentiment": "negative", "topic": "Water", "language": "sw", "urgency": "normal", "confidence": 0.82},
    {"id": 2, "sentiment": "angry", "topic": "x", "language": "en", "urgency": "low", "confidence": 0.9},
    {"id": 9, "sentiment": "positive", "topic": "x", "language": "en", "urgency": "low", "confidence": 0.9},
    {"id": 3, "sentiment": "positive", "topic": "Roads", "language": "klingon", "urgency": "low", "confidence": 99},
    {"id": 4, "sentiment": "neutral", "topic": "Health", "language": "en", "urgency": "low", "confidence": 1}
  ]`;
  const labels = parseAiClassifications(out, [1, 2, 3, 4]);
  assert.deepEqual([...labels.keys()].sort(), [1, 3, 4], "invalid sentiment (2) and unknown id (9) are dropped");
  assert.equal(labels.get(1).confidence, 82);
  assert.equal(labels.get(1).classifiedBy, "ai");
  assert.equal(labels.get(3).language, "unknown", "unknown language label becomes 'unknown'");
  assert.equal(labels.get(3).confidence, 95, "percent input accepted and capped at 95");
  assert.equal(labels.get(4).confidence, 95, "never fully certain");
  assert.equal(parseAiClassifications("no json here", [1]).size, 0);
  assert.equal(parseAiClassifications("[{bad json", [1]).size, 0);
  const prompt = classificationPrompt([{ id: 1, text: "hello" }], "Hon. Test, MP race, Kaiti Constituency");
  assert.match(prompt, /Do not add facts, items or numbers/);
});

test("totals everywhere exclude mentions pending review or rejected", () => {
  assert.equal(COUNTED_MENTIONS_SQL, "(review_status IS NULL OR review_status IN ('auto', 'confirmed'))");
  assert.match(read("artifacts/api-server/src/routes/di.ts"), /\.where\(sql\.raw\(COUNTED_MENTIONS_SQL\)\)/);
  const strategist = read("artifacts/api-server/src/routes/strategist.ts");
  assert.match(strategist, /sentiment = 'negative' AND \$\{COUNTED_MENTIONS_SQL\}/);
  assert.match(strategist, /sentiment = 'positive' AND \$\{COUNTED_MENTIONS_SQL\}/);
  const page = read("artifacts/commandcentre/src/pages/social-listening.tsx");
  assert.match(page, /m\.reviewStatus !== "rejected"/);
  assert.match(page, /all\.filter\(isCounted\)/);
});

test("review decisions and field reports are validated and audited", () => {
  const social = read("artifacts/api-server/src/routes/social.ts");
  assert.match(social, /router\.post\("\/mentions\/:id\/review"/);
  assert.match(social, /await audit\(req, decision === "confirm"/);
  assert.match(social, /router\.post\("\/field-mentions"/);
  assert.match(social, /!campaignWards\(\)\.includes\(f\.ward\)/, "field reports must use the campaign's wards");
  assert.match(social, /await audit\(req, "Logged field mention"/);
  assert.match(social, /router\.get\("\/report"/);
  assert.match(social, /pending and rejected items are excluded/);
  assert.match(social, /isNull\(socialMentionsTable\.classifiedBy\)/, "older mentions are classified over time");
});

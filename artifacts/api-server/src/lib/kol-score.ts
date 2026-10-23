/**
 * Transparent KOL influence score (docs/SOCIAL_LISTENING_PLAN.md, KOL-1.3).
 *
 * Influence = how far and how actively a person's voice carries in the
 * campaign's area. Stance (supporter / neutral / opponent) is shown next to
 * the score, not inside it: an influential opponent must rank high so the
 * team sees them. Components with no data are left out and the remaining
 * weights re-balanced; nothing is assumed.
 *
 * Pure functions with no imports, so they can be unit-tested directly.
 */

export const KOL_WEIGHTS = { reach: 35, engagement: 20, relevance: 20, locality: 15, recency: 10 } as const;
type Key = keyof typeof KOL_WEIGHTS;

export type KolScoreInput = {
  kind: "online" | "offline";
  /** Follower counts of the KOL's accounts (and the older single follower field). */
  followers: number[];
  /** Offline KOLs: field-assessed number of people reached. */
  reachEstimate: number | null;
  /** Engagement rates in percent, per account. */
  engagementRates: number[];
  /** Linked social listening mentions in the last 90 days. */
  mentions90d: number;
  ward: string | null;
  campaignWards: string[];
  /** Latest of: newest linked mention (publication date when known), recorded engagement. */
  lastActivity: Date | null;
  now: Date;
  override: number | null;
  overrideReason: string | null;
};

export type ScoreComponent = { key: Key; label: string; weight: number; value: number | null; detail: string };
export type KolScore = {
  score: number;
  method: "measured" | "override";
  components: ScoreComponent[];
  /** Components left out for lack of data. */
  missing: string[];
  /** Score before any override, for transparency. */
  measured: number;
  overrideReason?: string;
};

const LABELS: Record<Key, string> = {
  reach: "Reach", engagement: "Engagement", relevance: "Relevance", locality: "Locality", recency: "Recency",
};
const clamp = (n: number) => Math.round(Math.max(0, Math.min(100, n)));
const DAY = 24 * 3600_000;

export function scoreKol(input: KolScoreInput): KolScore {
  const comps: ScoreComponent[] = [];
  const add = (key: Key, value: number | null, detail: string) =>
    comps.push({ key, label: LABELS[key], weight: KOL_WEIGHTS[key], value: value === null ? null : clamp(value), detail });

  // Reach: log scale, so 1,000 followers isn't 1/1000th of a million.
  const maxFollowers = Math.max(0, ...input.followers.filter(n => Number.isFinite(n)));
  if (input.kind === "offline" && input.reachEstimate && input.reachEstimate > 0) {
    add("reach", (Math.log10(input.reachEstimate + 1) / 5) * 100, `About ${input.reachEstimate.toLocaleString("en-KE")} people reached (field estimate); 100,000 scores 100`);
  } else if (maxFollowers > 0) {
    add("reach", (Math.log10(maxFollowers + 1) / 6) * 100, `${maxFollowers.toLocaleString("en-KE")} followers on the largest account; 1,000,000 scores 100`);
  } else {
    add("reach", null, input.kind === "offline" ? "No reach estimate recorded" : "No follower figures recorded");
  }

  const rates = input.engagementRates.filter(n => Number.isFinite(n) && n >= 0);
  if (rates.length) {
    const best = Math.max(...rates);
    add("engagement", best * 10, `${best}% engagement rate; 10% or more scores 100`);
  } else {
    add("engagement", null, "No engagement rate recorded");
  }

  add("relevance", input.mentions90d * 20, `${input.mentions90d} linked mention${input.mentions90d === 1 ? "" : "s"} in the last 90 days; 5 or more scores 100`);

  if (input.ward && input.campaignWards.includes(input.ward)) add("locality", 100, `Based in ${input.ward}`);
  else if (input.ward === "all" || input.ward === "county-wide") add("locality", 70, "Reaches the whole area");
  else add("locality", 30, "No ward recorded");

  if (input.lastActivity) {
    const days = Math.max(0, Math.floor((input.now.getTime() - input.lastActivity.getTime()) / DAY));
    add("recency", days <= 7 ? 100 : days <= 30 ? 70 : days <= 90 ? 40 : 10, `Latest dated activity ${days} day${days === 1 ? "" : "s"} ago (newest linked mention by publication date, or recorded engagement)`);
  } else {
    add("recency", null, "No recent activity recorded");
  }

  const used = comps.filter(c => c.value !== null);
  const totalWeight = used.reduce((n, c) => n + c.weight, 0);
  const measured = totalWeight ? clamp(used.reduce((n, c) => n + (c.value as number) * c.weight, 0) / totalWeight) : 0;
  const missing = comps.filter(c => c.value === null).map(c => c.label);

  if (input.override !== null && Number.isFinite(input.override)) {
    return { score: clamp(input.override), method: "override", components: comps, missing, measured, overrideReason: input.overrideReason ?? undefined };
  }
  return { score: measured, method: "measured", components: comps, missing, measured };
}

/** Suggested tier from reach (followers, or people reached offline). */
export function tierFor(reach: number): "micro" | "mid" | "macro" | "mega" {
  return reach >= 1_000_000 ? "mega" : reach >= 100_000 ? "macro" : reach >= 10_000 ? "mid" : "micro";
}

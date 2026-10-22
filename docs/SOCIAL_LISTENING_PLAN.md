# Social listening and KOL analysis — plan and progress tracker

Goal: social listening that a campaign can trust. Every mention has a real, reachable source; it is about **this** campaign (its candidate, seat and area); its classification says how confident it is; and key opinion leaders (KOLs) are ranked by measured, explainable scores instead of typed-in numbers.

Applies to every campaign on the platform: President, Governor, Senator, Woman Rep, MP and MCA. All data stays isolated per campaign by row-level security.

**How to track:** tick a task `- [x]` in the PR that completes it, with the PR number, and update the summary table in the same PR.

## Summary

| Phase | Area | Done / total |
|---|---|---|
| 1 | SL-1 Campaign scope and correctness | 6 / 6 |
| 1 | SL-2 Free, link-verified sources | 0 / 6 |
| 1 | SL-3 AI classifies, never invents | 0 / 4 |
| 1 | KOL-1 Measured KOL scores | 0 / 5 |
| 2 | SL-4 Paid and official platform access | 0 / 4 |
| 3 | SL-5 Alerts and rapid response | 0 / 3 |
| | **Total** | **6 / 28** |

## Review of the current module (main at `7804f7b`)

| # | Finding | Impact |
|---|---|---|
| 1 | The scan lock and cooldown are global (`routes/social.ts`), one per server | While one campaign scans, every other campaign gets "A scan is already in progress" |
| 2 | `social_source_health` is a shared table (`lib/tenant-isolation.ts` `SHARED_TABLES`), keyed only by `source_key` | Each campaign sees the source status of whichever campaign scanned last |
| 3 | Search wording always says "… Constituency" | Wrong for Governor, Senator, Woman Rep (county), President (Kenya) and MCA (ward) campaigns. With no constituency it reads "your area Constituency" |
| 4 | Opponents aren't monitored. The "opponent" category is labelled PUBLIC RECORDS in the app and searches budget and audit news | The competitors each campaign lists (`competitors` table) are never searched |
| 5 | AI web-search results supply their own links, checked only for URL format (`publicSourceUrl`) | Invented or dead links can be stored as mentions |
| 6 | Free mode uses one source (Google News RSS) and keyword sentiment | Narrow coverage; sentiment has no confidence and no review step |
| 7 | KOLs are typed in by hand (follower count, influence score); errors say "Makueni County ward"; ward validation is duplicated; `PATCH /:id` doesn't validate the id | Scores aren't measured; wrong messages for other campaigns |

## Principles

1. **A mention is only stored with a real source.** The link must open, or the item is explicitly marked as an unverified lead.
2. **AI classifies; it never supplies mentions or numbers.** Sentiment, topic, language and urgency carry a confidence level. Low-confidence or high-threat items go to a human.
3. **Per campaign, per seat.** Search terms come from the campaign profile (candidate, seat, area, wards, opponents).
4. **Public content only.** Public pages, news and the campaign's own accounts. No private groups, no profiling of private individuals. Follow the Kenya Data Protection Act 2019 and the ODPC Guidance Notes for Electoral Purposes.
5. **Transparent scores.** Every KOL score shows its components and weights.

---

## Phase 1 — accurate, free

### SL-1 Campaign scope and correctness
- [x] SL-1.1 Scan lock and cooldown per campaign, not per server.
- [x] SL-1.2 Make `social_source_health` campaign-owned: `owner_campaign_id`, row-level security, and a unique key per campaign.
- [x] SL-1.3 Seat-aware search wording: Kenya / "X County" / "X Constituency" / "X Ward", matching the app's area label.
- [x] SL-1.4 New "Opponents" category, searching the campaign's competitors by name. "Public records" stays as it is.
- [x] SL-1.5 Verify every stored link: AI-supplied links must open (HTTP 2xx/3xx) or are dropped; record when the link was checked.
- [x] SL-1.6 KOL validation: campaign-aware messages, remove the duplicate check, validate `:id`.

**Acceptance:**
- Two campaigns can scan at the same time.
- Each sees only its own source status.
- A Governor campaign's queries name the county, not a constituency.
- Listed opponents are searched.
- No stored mention has a link that fails to open.

### SL-2 Free, link-verified sources
- [ ] SL-2.1 Collector interface: every source returns the same item shape (title, url, source, published date, text, collector).
- [ ] SL-2.2 Kenyan news RSS feeds (curated list: national outlets plus county/regional where available).
- [ ] SL-2.3 GDELT (global news index; English and Swahili).
- [ ] SL-2.4 YouTube Data API (optional `YOUTUBE_API_KEY`): videos and public comments mentioning the candidate or area.
- [ ] SL-2.5 Duplicate detection by normalised link and near-identical title; per-source health and item counts.
- [ ] SL-2.6 Clean free-search summaries: the snippet repeats the headline and HTML entities such as `&nbsp;` aren’t decoded (`searchFreeMakueniWeb`).

### SL-3 AI classifies, never invents
- [ ] SL-3.1 Classify each stored mention: sentiment, topic, language (English/Swahili/Sheng/other) and urgency, each with a confidence level. Keyword fallback in free mode, labelled as such.
- [ ] SL-3.2 Review queue: low-confidence or high-urgency items need a human decision before they count in totals.
- [ ] SL-3.3 Field-reported mentions: radio, barazas, churches and markets, entered by staff with ward and source.
- [ ] SL-3.4 Reporting: mentions by source, sentiment trend, top topics, all with "as of" time and coverage notes.

### KOL-1 Measured KOL scores
- [ ] KOL-1.1 Several handles per KOL (Facebook, X, TikTok, YouTube, radio programme, offline role).
- [ ] KOL-1.2 Link mentions to KOLs by handle or name.
- [ ] KOL-1.3 Transparent influence score with visible weights:

  | Component | What it measures |
  |---|---|
  | Reach | Log-scaled followers |
  | Engagement | How much their audience responds |
  | Relevance | Share of their posts about the campaign or area |
  | Stance | Supportive, neutral or hostile, from linked mentions |
  | Locality | Their ward |
  | Recency | How recently they were active |

  Manual overrides are allowed but labelled.
- [ ] KOL-1.4 Offline KOLs (chiefs, clergy, chama, boda-boda and market leaders, MCAs): field-assessed reach and stance with notes.
- [ ] KOL-1.5 Stance-change history per KOL.

## Phase 2 — paid and official access (needs budget or accounts)
- [ ] SL-4.1 X API (pay-per-use, about $0.005 per post read): targeted searches with a monthly cap set per campaign.
- [ ] SL-4.2 Campaign's own Facebook Page and Instagram (Graph API, page token): comments and reactions on own posts.
- [ ] SL-4.3 Campaign's own TikTok business account analytics.
- [ ] SL-4.4 Optional licensed social listening vendor (trial first; check Kenyan, Swahili and Kamba coverage).

## Phase 3 — alerts and rapid response
- [ ] SL-5.1 Alerts: hostile KOL stance change, topic spike, high-urgency mention.
- [ ] SL-5.2 Hand-off to Rapid Response with source and verification attached.
- [ ] SL-5.3 Scheduled scans per campaign, with daily limits.

## Not possible or not allowed
- **Meta Content Library and TikTok Research API:** limited to non-profit and academic research, so campaigns aren't eligible.
- **Private Facebook/WhatsApp groups and scraping logged-in pages:** against platform terms and the Data Protection Act.

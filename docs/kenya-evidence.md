# Kenya evidence grounding

Reviewed on 22 October 2026. This release adds a compact, attributed public-source digest. It does not train a model, index every page of every PDF, import a live voter register, or establish current project delivery.

## Coverage

National constitutional/devolution evidence is usable with all 47 county configurations. The official 2026 Economic Survey launch summary supplies national 2025/2024 growth context. County-specific development summaries are currently available for Makueni: the supplied 2013–2017 and 2018–2022 CIDPs, the November 2019 sanitation strategy, and the official 2023–2027 CIDP summary found during research. Other counties receive national evidence and an explicit local-evidence gap. Add their reviewed, dated official documents before making county-specific assertions.

The executable source catalogue is `artifacts/api-server/src/lib/kenya-evidence.ts`. Each source has a URL, publisher, period, jurisdiction, source type and review status. Facts have source IDs, page/section locators, periods and evidence classifications. The review date is not a measurement date.

## Supplied links

- All three IEBC index/statistics links were attempted but timed out in web retrieval. Direct document downloads also failed. Their original URLs are retained with unavailable status; no new numeric voter totals were imported from those pages.
- State Department for Devolution county information was reviewed for national context.
- The two supplied CIDPs and World Bank-hosted Makueni sanitation strategy were reviewed for dated, county-scoped summaries. Hosting by the World Bank does not turn a Makueni baseline into a national statistic.
- The Debunk article is retained as secondary historical commentary and excluded from the factual digest.
- GitHub's Kenya-counties topic is retained as a discovery index, not as certified electoral geography. Existing campaign geography was not overwritten with community repository data.

Additional official research sources include the Constitution's Fourth Schedule hosted by IGRTC, Makueni's official CIDP summary and the State Department for Economic Planning's 2026 Economic Survey launch summary. The original KNBS census/full-survey pages that could not be downloaded remain distinct from reviewed official summaries.

## Behaviour

All model calls, including the primary campaign, receive the Kenya evidence policy and active scope. Citation titles, URLs, numbers and place names are never renamed to fit another campaign. The deterministic answer fallback uses the same source selector. Web-news discovery requires Kenya or a configured valid Kenyan county in the returned content; discovery remains unverified.

Document generation and analysis expose evidence metadata. The analyst and speech/manifesto pages show a collapsible source catalogue with dates and availability. Historical baselines, planning priorities, proposals and verified outcomes are distinct categories. County-wide values are not relabelled as ward values.

The analyst no longer supplies a universal 65% or Makueni-wide turnout default when ward evidence is absent. Historical turnout needs a denominator from the same election, and historical comparisons use the selected office. Missing figures stay unknown. Existing campaign arithmetic is conditional and is not a validated election forecast; convenience polls and contacts are not representative electorate samples.

## Verification

Acceptance tests cover all 47 county configurations, absence of cross-county leakage, source eligibility, time and geographic labels, Kenya-only discovery and missing turnout evidence. Additional stubbed provider-adapter tests cover primary/non-primary context and citation preservation without real model calls. Browser fixtures cover the source catalogue, failed-source labels, Makueni/Kisumu separation, mobile width and both document/analyst views.

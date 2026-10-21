import { useAuth } from "@/lib/auth";
import { CAMPAIGN } from "@/lib/wards";
import { useEffect, useMemo, useState } from "react";
import {
  useListSocialMentions,
  useScanSocial,
  useDeleteSocialMention,
  getListSocialMentionsQueryKey,
} from "@workspace/api-client-react";
import type { SocialMention } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Radio, RefreshCw, ExternalLink, Trash2, TrendingUp, TrendingDown,
  Minus, Globe, AlertCircle, Search, MessageSquareText, Copy, Check, Facebook, X, Music,
} from "lucide-react";

const CATEGORIES: { key: string; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "candidate", label: (CAMPAIGN.candidate || "Candidate").toUpperCase() },
  { key: "issues", label: "LOCAL ISSUES" },
  { key: "opponent", label: "PUBLIC RECORDS" },
];

const SENTIMENTS: { key: string; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "positive", label: "POSITIVE" },
  { key: "negative", label: "NEGATIVE" },
  { key: "neutral", label: "NEUTRAL" },
];

const CATEGORY_LABEL: Record<string, string> = {
  candidate: (CAMPAIGN.candidate || "Candidate").toUpperCase(),
  issues: "LOCAL ISSUES",
  opponent: "PUBLIC RECORDS",
};

function mentionDate(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildReplySuggestions(summary: string, topic?: string | null): string[] {
  const subject = summary.replace(/\s*[—–-]\s*.+$/, "").trim().replace(/[.!?]+$/, "");
  const shortSubject = subject.length > 180 ? subject.slice(0, 177) + "..." : subject;
  const area = topic?.toLowerCase().includes("water") ? "water services"
    : topic?.toLowerCase().includes("road") ? "road access"
    : topic?.toLowerCase().includes("health") ? "health services"
    : topic?.toLowerCase().includes("education") ? "education"
    : `${CAMPAIGN.areaLabel} services and development`;
  return [
    `Thank you for sharing this update about “${shortSubject}”. We are reviewing the source and the details so the community can understand what has been confirmed and what still needs clarification.`,
    `This is an important topic for ${area}. Could you share the original notice or the latest dated update, including the specific ward or location, so residents can check the details accurately?`,
    `For residents following this issue, the next useful step is to verify the latest official update, the responsible department and the current implementation status. We will avoid treating an unverified headline as a confirmed fact.`,
  ];
}

function sentimentStyle(s: string) {
  switch (s) {
    case "positive": return { text: "text-green-400", border: "border-green-400/40", bg: "bg-green-400/10", Icon: TrendingUp };
    case "negative": return { text: "text-red-400", border: "border-red-400/40", bg: "bg-red-400/10", Icon: TrendingDown };
    default: return { text: "text-yellow-400", border: "border-yellow-400/40", bg: "bg-yellow-400/10", Icon: Minus };
  }
}

export default function SocialListening() {
  const qc = useQueryClient();
  const { data: mentions = [], isLoading } = useListSocialMentions();
  const [category, setCategory] = useState("all");
  const [sentiment, setSentiment] = useState("all");
  const [replyItemId, setReplyItemId] = useState<number | null>(null);
  const [copiedReply, setCopiedReply] = useState<string | null>(null);
  const [feedSearch, setFeedSearch] = useState<{
    platform: "facebook" | "x" | "tiktok";
    query: string;
    results: Array<{ title: string; url: string; source: string; publishedAt: string | null; snippet: string }>;
    loading: boolean;
    error: string | null;
    coverage?: string;
    liveSearchUrl?: string;
    checkedAt?: string;
  } | null>(null);
  const [feedQuery, setFeedQuery] = useState(() => `${CAMPAIGN.candidate} ${CAMPAIGN.constituency}`.trim());
  const [publicFeed, setPublicFeed] = useState<Array<{ title: string; url: string; source: string; publishedAt: string | null; snippet: string }>>([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [story, setStory] = useState<{ url: string; title: string } | null>(null);
  useEffect(() => {
    let active = true;
    Promise.allSettled((["facebook", "x", "tiktok"] as const).map(async platform => {
      const response = await fetch("/api/social/search-feed?platform=" + platform + "&q=" + encodeURIComponent(`${CAMPAIGN.candidate} ${CAMPAIGN.constituency}`.trim()));
      if (!response.ok) throw new Error("Search unavailable");
      const data = await response.json();
      return (data.results ?? []) as typeof publicFeed;
    })).then(results => {
      if (!active) return;
      const combined = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
      setPublicFeed(Array.from(new Map(combined.filter(item => item.url).map(item => [item.url, item])).values()).sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0)));
      setPublicLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function searchPlatform(platform: "facebook" | "x" | "tiktok") {
    setFeedSearch({ platform, query: feedQuery, results: [], loading: true, error: null });
    try {
      const response = await fetch(`/api/social/search-feed?platform=${platform}&q=${encodeURIComponent(feedQuery)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Search failed (HTTP ${response.status})`);
      setFeedSearch({ platform, query: data.query ?? feedQuery, results: data.results ?? [], loading: false, error: null, coverage: data.coverage, checkedAt: data.checkedAt, liveSearchUrl: data.liveSearchUrl });
    } catch (error) {
      setFeedSearch(current => current ? { ...current, loading: false, error: error instanceof Error ? error.message : "Search failed." } : current);
    }
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: getListSocialMentionsQueryKey() });
  const scan = useScanSocial({ mutation: { onSuccess: invalidate } });
  const del = useDeleteSocialMention({ mutation: { onSuccess: invalidate } });
  // Everyone can view, search and scan; removing saved mentions stays with Intelligence editors.
  const { can } = useAuth();
  const canDelete = can("intelligence", "write");

  // Scans are manual to avoid repeated provider failures, rate limits and
  // accidental requests whenever the page mounts or refreshes.

  const all = mentions as SocialMention[];

  const counts = useMemo(() => {
    const c = { total: all.length, positive: 0, negative: 0, neutral: 0 };
    for (const m of all) {
      if (m.sentiment === "positive") c.positive++;
      else if (m.sentiment === "negative") c.negative++;
      else c.neutral++;
    }
    return c;
  }, [all]);

  const lastScan = useMemo(() => {
    if (all.length === 0) return null;
    return all.reduce<string | null>((max, m) => (!max || m.scannedAt > max ? m.scannedAt : max), null);
  }, [all]);

  const filtered = all
    .filter((m) => (category === "all" || m.category === category) && (sentiment === "all" || m.sentiment === sentiment))
    .slice()
    .sort((a, b) => {
      const aDate = mentionDate(a.publishedAt) || mentionDate(a.scannedAt);
      const bDate = mentionDate(b.publishedAt) || mentionDate(b.scannedAt);
      return bDate - aDate;
    });

  const scanResult = scan.data as (typeof scan.data & { source?: string; failedCategories?: string[] }) | undefined;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-widest flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" /> {`${CAMPAIGN.candidate} · ${CAMPAIGN.constituency} social listening`.toUpperCase()}
          </h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5 tracking-wider">
            {`Public web monitoring · ${CAMPAIGN.candidate} · ${CAMPAIGN.constituency} news & service issues`.toUpperCase()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setFeedQuery(`${CAMPAIGN.candidate} ${CAMPAIGN.constituency}`.trim()); void searchPlatform("facebook"); }} className="flex items-center gap-1.5 border border-border px-3 py-2 font-mono text-[10px] tracking-wider hover:bg-secondary"><Facebook className="w-3.5 h-3.5" /> SEARCH FACEBOOK</button>
          <button type="button" onClick={() => { setFeedQuery(`${CAMPAIGN.candidate} ${CAMPAIGN.constituency}`.trim()); void searchPlatform("x"); }} className="flex items-center gap-1.5 border border-border px-3 py-2 font-mono text-[10px] tracking-wider hover:bg-secondary"><X className="w-3.5 h-3.5" /> SEARCH X</button>
          <button type="button" onClick={() => { setFeedQuery(`${CAMPAIGN.candidate} ${CAMPAIGN.constituency}`.trim()); void searchPlatform("tiktok"); }} className="flex items-center gap-1.5 border border-border px-3 py-2 font-mono text-[10px] tracking-wider hover:bg-secondary"><Music className="w-3.5 h-3.5" /> SEARCH TIKTOK</button>
          <input value={feedQuery} onChange={event => setFeedQuery(event.target.value)} placeholder="Search public posts..." className="w-40 border border-border bg-background px-2 py-2 text-xs" aria-label="Public social search query" />
          <button
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs tracking-wider hover:bg-primary/90 disabled:opacity-60"
          >
            <RefreshCw className={"w-3.5 h-3.5" + (scan.isPending ? " animate-spin" : "")} />
            {scan.isPending ? "SCANNING THE WEB…" : "RUN SCAN"}
          </button>
        </div>
      </div>

      {story && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-label="Story preview">
          <div className="flex h-[88vh] w-full max-w-5xl flex-col border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border p-3"><h2 className="truncate text-sm font-semibold">{story.title}</h2><button type="button" onClick={() => setStory(null)} className="border border-border px-3 py-1">CLOSE ✕</button></div>
            <iframe src={story.url} title={story.title} className="min-h-0 w-full flex-1 bg-white" referrerPolicy="no-referrer" />
            <div className="border-t border-border p-3 text-xs text-muted-foreground">If the publisher blocks embedded viewing, <a href={story.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">open the original story</a>.</div>
          </div>
        </div>
      )}
      {feedSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`${feedSearch.platform} public search results`} onMouseDown={event => { if (event.target === event.currentTarget) setFeedSearch(null); }}>
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border p-4">
              <div><h2 className="font-bold text-sm tracking-wider">{feedSearch.platform.toUpperCase()} · PUBLIC SEARCH</h2><p className="mt-1 text-xs text-muted-foreground">Search: {feedSearch.query}</p></div>
              <button type="button" onClick={() => setFeedSearch(null)} className="border border-border px-3 py-1 text-sm hover:bg-secondary">CLOSE ✕</button>
            </div>
            <div className="flex gap-2 border-b border-border p-3">
              <input value={feedQuery} onChange={event => setFeedQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void searchPlatform(feedSearch.platform); }} className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-sm" aria-label="Search query" />
              <button type="button" onClick={() => void searchPlatform(feedSearch.platform)} disabled={feedSearch.loading || !feedQuery.trim()} className="bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">{feedSearch.loading ? "SEARCHING…" : "SEARCH"}</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {feedSearch.loading && <p className="py-8 text-center text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Searching publicly indexed results…</span></p>}
              {feedSearch.error && <p className="border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-400">{feedSearch.error}</p>}
              {!feedSearch.loading && !feedSearch.error && feedSearch.results.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No matching public search results were returned. This does not mean the platform has no posts.</p>}
              <ul className="space-y-3">{feedSearch.results.map((item, index) => <li key={item.url || index} className="border border-border p-3">
                <p className="text-sm font-semibold">{item.title}</p>{item.snippet && <p className="mt-2 text-sm text-muted-foreground">{item.snippet}</p>}
                <p className="mt-2 text-[11px] text-muted-foreground">{item.source}{item.publishedAt ? ` · ${item.publishedAt}` : ""}</p>
                <button type="button" onClick={() => setStory({url:item.url,title:item.title})} className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline">View story <ExternalLink className="h-3 w-3" /></button>
              </li>)}</ul>
            </div>
            <div className="border-t border-border p-3 text-[11px] text-muted-foreground">
              {feedSearch.coverage || "Results come from publicly indexed search listings, not a complete live feed."}{feedSearch.checkedAt ? ` Checked: ${new Date(feedSearch.checkedAt).toLocaleString()}.` : ""}
              {feedSearch.liveSearchUrl && <a href={feedSearch.liveSearchUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-lg border border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary">Open live {feedSearch.platform === "x" ? "X" : feedSearch.platform === "facebook" ? "Facebook" : "TikTok"} search <ExternalLink className="h-3 w-3" /></a>}
              <p className="mt-1">Full real-time feeds require approved platform API access. Public search results may be delayed or incomplete.</p>
            </div>
          </div>
        </div>
      )}

      {scan.isError && (
        <div className="flex items-start gap-2 bg-red-400/10 border border-red-400/40 text-red-400 px-3 py-2 font-mono text-[11px]">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>
            <p>Scan failed. Existing mentions are unchanged.</p>
            <p className="mt-1 text-red-300/90 break-words">
              {scan.error instanceof Error ? scan.error.message.replace(/<[^>]*>/g, "").slice(0, 400) : "The API did not provide a readable error. Check the Render API logs."}
            </p>
          </div>
        </div>
      )}
      {scanResult && !scan.isPending && (
        <div className="bg-card border border-primary/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
          Last scan found <span className="text-foreground">{scanResult.scanned}</span> items ·{" "}
          <span className="text-green-400">{scanResult.inserted} new</span> added{scanResult.source ? ` · via ${scanResult.source}` : ""}.
          {scanResult.failedCategories?.length ? <span className="text-amber-300"> Some searches failed ({scanResult.failedCategories.join(", ")}); try again shortly.</span> : null}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="TOTAL MENTIONS" value={counts.total + publicFeed.length} tone="text-foreground" />
        <StatCard label="POSITIVE" value={counts.positive} tone="text-green-400" />
        <StatCard label="NEGATIVE" value={counts.negative} tone="text-red-400" />
        <StatCard label="NEUTRAL" value={counts.neutral} tone="text-yellow-400" />
      </div>
      {lastScan && (
        <p className="font-mono text-[10px] text-muted-foreground">
          LAST SCAN: {new Date(lastScan).toLocaleString()}
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <FilterRow label="TOPIC" items={CATEGORIES} value={category} onChange={setCategory} />
        <FilterRow label="SENTIMENT" items={SENTIMENTS} value={sentiment} onChange={setSentiment} />
      </div>

      {/* Feed */}
      <div className="bg-card border border-border">
        <div className="p-3 border-b border-border bg-secondary/30 flex items-center justify-between">
          <h3 className="font-mono text-xs tracking-widest flex items-center gap-2">
            <Globe className="w-3.5 h-3.5" /> MENTIONS FEED
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">{filtered.length + (category === "all" && sentiment === "all" ? publicFeed.length : 0)} SHOWN</span>
        </div>

        {category === "all" && sentiment === "all" && (
          <div className="border-b border-border">
            <div className="bg-secondary/20 px-4 py-2 text-xs font-semibold">PUBLIC SOCIAL MENTIONS · AUTOMATIC RESULTS</div>
            {publicLoading && <p className="p-4 text-xs text-muted-foreground">Loading publicly indexed stories…</p>}
            {!publicLoading && publicFeed.length === 0 && <p className="p-4 text-xs text-muted-foreground">No indexed stories returned. Platform coverage may be incomplete.</p>}
            <ul className="divide-y divide-border">{publicFeed.map(item => <li key={item.url} className="p-4">
              <button type="button" onClick={() => setStory({url:item.url,title:item.title})} className="text-left text-sm font-semibold hover:text-primary">{item.title}</button>
              {item.snippet && <p className="mt-2 text-xs text-muted-foreground">{item.snippet}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground"><span>{item.source}</span><span>{item.publishedAt}</span><button type="button" onClick={() => setStory({url:item.url,title:item.title})} className="text-primary underline">READ STORY</button></div>
            </li>)}</ul>
          </div>
        )}
        {isLoading ? (
          <div className="p-10 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : all.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Search className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <p className="font-mono text-xs text-muted-foreground">NO SAVED SCAN MENTIONS YET</p>
            <p className="font-mono text-[10px] text-muted-foreground/70 max-w-md mx-auto">
              Press RUN SCAN to search public news for {CAMPAIGN.candidate},
              {CAMPAIGN.areaLabel} projects, ward-level service issues, budgets and official updates. Only publicly indexed results are covered; private posts and some social platforms may not be available.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center font-mono text-xs text-muted-foreground">NO MENTIONS MATCH THESE FILTERS</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((m) => {
              const st = sentimentStyle(m.sentiment);
              return (
                <li key={m.id} className="p-4 flex gap-3">
                  <div className={"shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center border " + st.border + " " + st.bg}>
                    <st.Icon className={"w-3.5 h-3.5 " + st.text} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-snug">{m.summary}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2 font-mono text-[10px] text-muted-foreground">
                      <span className={"px-1.5 py-0.5 border " + st.border + " " + st.text}>{m.sentiment.toUpperCase()}</span>
                      <span className="px-1.5 py-0.5 border border-border">{CATEGORY_LABEL[m.category] ?? m.category.toUpperCase()}</span>
                      {m.topic && <span className="px-1.5 py-0.5 bg-secondary/60">{m.topic}</span>}
                      {m.source && <span>· {m.source}</span>}
                      {m.publishedAt && <span>· {m.publishedAt}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-start gap-1">
                    <button
                      onClick={() => setReplyItemId(replyItemId === m.id ? null : m.id)}
                      className="flex items-center gap-1 p-1.5 border border-primary/40 text-primary hover:bg-primary/10 font-mono text-[10px]"
                      title="Generate three response drafts"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" /> REPLY IDEAS
                    </button>
                    {m.url && (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 border border-border hover:bg-secondary text-muted-foreground hover:text-foreground"
                        title="Open source"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {canDelete && <button
                      onClick={() => del.mutate({ id: m.id })}
                      className="p-1.5 border border-border hover:bg-red-400/10 text-muted-foreground hover:text-red-400"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>}
                  </div>
                  {replyItemId === m.id && (
                    <div className="mt-3 space-y-2 border border-primary/30 bg-secondary/20 p-3">
                      <p className="font-mono text-[10px] tracking-wider text-primary">THREE DRAFT RESPONSES · REVIEW BEFORE POSTING</p>
                      {buildReplySuggestions(m.summary, m.topic).map((reply, index) => (
                        <div key={index} className="flex items-start gap-2 border border-border bg-background p-2">
                          <p className="flex-1 text-xs leading-relaxed">{index + 1}. {reply}</p>
                          <button
                            onClick={() => {
                              void navigator.clipboard.writeText(reply).then(() => setCopiedReply(`${m.id}-${index}`)).catch(() => setCopiedReply(null));
                            }}
                            className="shrink-0 p-1.5 border border-border hover:bg-secondary"
                            title="Copy response"
                          >
                            {copiedReply === `${m.id}-${index}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ))}
                      <p className="text-[10px] text-muted-foreground">These are neutral draft ideas for a public discussion, not published automatically. Check the original post/comment and facts before using them.</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border border-border p-4">
      <p className="font-mono text-[10px] text-muted-foreground mb-1 tracking-wider">{label}</p>
      <span className={"text-2xl font-bold " + tone}>{value}</span>
    </div>
  );
}

function FilterRow({
  label, items, value, onChange,
}: { label: string; items: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-muted-foreground tracking-wider">{label}:</span>
      <div className="flex flex-wrap gap-1">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={
              "px-2 py-1 font-mono text-[10px] tracking-wider border " +
              (value === it.key
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary")
            }
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

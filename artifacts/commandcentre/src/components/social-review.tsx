import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getListSocialMentionsQueryKey } from "@workspace/api-client-react";
import { Check, X, ClipboardList, Mic, BarChart3 } from "lucide-react";
import { CAMPAIGN, WARDS } from "@/lib/wards";

// Social listening review queue, field-reported mentions and report
// (docs/SOCIAL_LISTENING_PLAN.md, SL-3.2 to SL-3.4).

type Mention = {
  id: number; summary: string; source: string | null; url: string | null; sentiment: string; category: string;
  topic: string | null; language: string | null; urgency: string | null; confidence: number | null; classifiedBy: string | null;
  reviewStatus: string | null; scannedAt: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/social${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

function useRefreshAll() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["social-review"] });
    void qc.invalidateQueries({ queryKey: ["social-report"] });
    void qc.invalidateQueries({ queryKey: getListSocialMentionsQueryKey() });
  };
}

const LANG: Record<string, string> = { en: "English", sw: "Swahili", sheng: "Sheng", mixed: "Mixed", unknown: "Unknown" };

/** Why an item is waiting, in plain words. */
function reason(m: Mention): string {
  if (m.urgency === "high") return "Marked urgent";
  if (m.confidence !== null && m.confidence < 40) return `Mixed signals (${m.confidence}% sure)`;
  return `${m.sentiment} at ${m.confidence ?? "?"}% confidence`;
}

export function ReviewQueue({ canWrite }: { canWrite: boolean }) {
  const refresh = useRefreshAll();
  const { data: items = [], isLoading, error } = useQuery({ queryKey: ["social-review"], queryFn: () => api<Mention[]>("/review") });
  const [sentiment, setSentiment] = useState<Record<number, string>>({});
  const review = useMutation({
    mutationFn: (v: { id: number; decision: "confirm" | "reject"; sentiment?: string }) =>
      api<Mention>(`/mentions/${v.id}/review`, { method: "POST", body: JSON.stringify({ decision: v.decision, ...(v.sentiment ? { sentiment: v.sentiment } : {}) }) }),
    onSuccess: refresh,
  });

  return (
    <section className="bg-card border border-border">
      <header className="px-4 py-3 border-b border-border flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h2 className="font-mono text-xs tracking-widest">REVIEW QUEUE</h2>
        <span className="font-mono text-[10px] text-muted-foreground">{items.length} waiting · urgent or uncertain items don't count in totals until confirmed</span>
      </header>
      {isLoading && <p className="p-4 text-xs text-muted-foreground">Loading…</p>}
      {error && <p className="p-4 text-xs text-red-400">{(error as Error).message}</p>}
      {!isLoading && !items.length && <p className="p-4 text-xs text-muted-foreground">Nothing waiting for review.</p>}
      {review.error && <p className="px-4 pt-3 text-xs text-red-400">{(review.error as Error).message}</p>}
      <ul className="divide-y divide-border">
        {items.map((m) => (
          <li key={m.id} className="p-4 space-y-2">
            <p className="text-sm leading-snug">{m.summary}</p>
            <div className="flex flex-wrap gap-2 font-mono text-[10px] text-muted-foreground">
              <span className={"px-1.5 py-0.5 border " + (m.urgency === "high" ? "border-red-500/50 text-red-400" : "border-amber-500/40 text-amber-300")}>{reason(m)}</span>
              <span className="px-1.5 py-0.5 border border-border">LABELLED BY {(m.classifiedBy ?? "rules").toUpperCase()}</span>
              {m.language && <span className="px-1.5 py-0.5 border border-border">{LANG[m.language] ?? m.language}</span>}
              {m.source && <span>· {m.source}</span>}
              {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">open source</a>}
            </div>
            {canWrite && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="font-mono text-[10px] text-muted-foreground">Sentiment
                  <select className="ml-1 bg-background border border-border px-1 py-0.5" value={sentiment[m.id] ?? m.sentiment}
                    onChange={(e) => setSentiment((s) => ({ ...s, [m.id]: e.target.value }))}>
                    {["positive", "neutral", "negative"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <button type="button" disabled={review.isPending}
                  onClick={() => review.mutate({ id: m.id, decision: "confirm", sentiment: sentiment[m.id] && sentiment[m.id] !== m.sentiment ? sentiment[m.id] : undefined })}
                  className="flex items-center gap-1 px-2 py-1 border border-green-500/50 text-green-400 font-mono text-[10px] hover:bg-green-500/10">
                  <Check className="w-3 h-3" /> CONFIRM
                </button>
                <button type="button" disabled={review.isPending} onClick={() => review.mutate({ id: m.id, decision: "reject" })}
                  className="flex items-center gap-1 px-2 py-1 border border-red-500/50 text-red-400 font-mono text-[10px] hover:bg-red-500/10">
                  <X className="w-3 h-3" /> REJECT (IRRELEVANT OR WRONG)
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const SOURCE_TYPES = [
  ["radio", "Radio"], ["baraza", "Baraza"], ["church", "Church"], ["market", "Market"], ["meeting", "Meeting"], ["other", "Other"],
] as const;
const FIELD_CATEGORIES = [
  ["candidate", (CAMPAIGN.candidate || "Candidate")], ["issues", "Local issue"], ["competitor", "Opponent"], ["opponent", "Public records"],
] as const;

export function FieldMentionForm() {
  const refresh = useRefreshAll();
  const empty = { summary: "", sourceName: "", sourceType: "radio", ward: "", category: "candidate", sentiment: "neutral", urgency: "normal", heardOn: new Date().toISOString().slice(0, 10) };
  const [form, setForm] = useState(empty);
  const save = useMutation({
    mutationFn: () => api<Mention>("/field-mentions", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { setForm({ ...empty, sourceType: form.sourceType, ward: form.ward }); refresh(); },
  });
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const field = "w-full bg-background border border-border px-2 py-1.5 text-sm";

  return (
    <section className="bg-card border border-border">
      <header className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Mic className="w-4 h-4 text-primary" />
        <h2 className="font-mono text-xs tracking-widest">LOG A FIELD MENTION</h2>
        <span className="font-mono text-[10px] text-muted-foreground">Radio, barazas, churches, markets: what you heard in person</span>
      </header>
      <form className="p-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="sm:col-span-2 text-xs">What was said
          <textarea required minLength={5} maxLength={500} rows={3} className={field} value={form.summary} onChange={set("summary")}
            placeholder="e.g. Caller on the breakfast show said the Ukia water project has stalled for three months" />
        </label>
        <label className="text-xs">Where it was heard
          <select className={field} value={form.sourceType} onChange={set("sourceType")}>
            {SOURCE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs">Station, venue or speaker
          <input required minLength={2} maxLength={120} className={field} value={form.sourceName} onChange={set("sourceName")} placeholder="e.g. Mbaitu FM, Kilungu market" />
        </label>
        <label className="text-xs">Ward
          <select required className={field} value={form.ward} onChange={set("ward")}>
            <option value="">Choose…</option>
            <option value="all">Whole area</option>
            {WARDS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <label className="text-xs">Date heard
          <input type="date" className={field} value={form.heardOn} onChange={set("heardOn")} />
        </label>
        <label className="text-xs">About
          <select className={field} value={form.category} onChange={set("category")}>
            {FIELD_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs">Tone toward the candidate
          <select className={field} value={form.sentiment} onChange={set("sentiment")}>
            {["positive", "neutral", "negative"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs">Urgency
          <select className={field} value={form.urgency} onChange={set("urgency")}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High (threat, misinformation, unrest)</option>
          </select>
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={save.isPending} className="px-3 py-1.5 border border-primary text-primary font-mono text-xs hover:bg-primary/10">
            {save.isPending ? "SAVING…" : "SAVE FIELD MENTION"}
          </button>
          {save.isSuccess && <span className="text-xs text-green-400">Saved.</span>}
          {save.error && <span className="text-xs text-red-400">{(save.error as Error).message}</span>}
        </div>
      </form>
    </section>
  );
}

type Report = {
  asOf: string; days: number;
  totals: { counted: number; pendingReview: number; rejected: number; urgent: number };
  bySentiment: { key: string; count: number }[]; bySource: { key: string; count: number }[];
  byChannel: { key: string; count: number }[]; byLanguage: { key: string; count: number }[];
  topTopics: { key: string; count: number }[]; labelledBy: { key: string; count: number }[];
  weekly: { week: string; positive: number; negative: number; neutral: number }[];
  notes: string[];
};

function Breakdown({ title, rows, label }: { title: string; rows: { key: string; count: number }[]; label?: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      <h3 className="font-mono text-[10px] tracking-widest text-muted-foreground mb-1">{title}</h3>
      {!rows.length && <p className="text-xs text-muted-foreground">No data</p>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="text-xs">
            <div className="flex justify-between gap-2"><span className="truncate">{label ? label(r.key) : r.key}</span><span className="font-mono">{r.count}</span></div>
            <div className="h-1 bg-secondary"><div className="h-1 bg-primary" style={{ width: `${(r.count / max) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SocialReport() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useQuery({ queryKey: ["social-report", days], queryFn: () => api<Report>(`/report?days=${days}`) });
  return (
    <section className="bg-card border border-border">
      <header className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h2 className="font-mono text-xs tracking-widest">REPORT</h2>
        <select className="ml-auto bg-background border border-border px-1 py-0.5 font-mono text-[10px]" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </header>
      {isLoading && <p className="p-4 text-xs text-muted-foreground">Loading…</p>}
      {error && <p className="p-4 text-xs text-red-400">{(error as Error).message}</p>}
      {data && (
        <div className="p-4 space-y-4">
          <p className="font-mono text-[10px] text-muted-foreground">
            As of {new Date(data.asOf).toLocaleString()} · {data.totals.counted} counted · {data.totals.pendingReview} awaiting review · {data.totals.rejected} rejected · {data.totals.urgent} urgent
          </p>
          <div>
            <h3 className="font-mono text-[10px] tracking-widest text-muted-foreground mb-1">SENTIMENT BY WEEK (COUNTED MENTIONS)</h3>
            {!data.weekly.length ? <p className="text-xs text-muted-foreground">No data</p> : (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr><th className="text-left font-normal">Week of</th><th className="text-right font-normal">Positive</th><th className="text-right font-normal">Neutral</th><th className="text-right font-normal">Negative</th></tr></thead>
                <tbody>{data.weekly.map((w) => (
                  <tr key={w.week}><td>{w.week}</td><td className="text-right text-green-400">{w.positive}</td><td className="text-right">{w.neutral}</td><td className="text-right text-red-400">{w.negative}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Breakdown title="TOP TOPICS" rows={data.topTopics} />
            <Breakdown title="TOP SOURCES" rows={data.bySource} />
            <Breakdown title="LANGUAGE" rows={data.byLanguage} label={(k) => LANG[k] ?? k} />
            <Breakdown title="CHANNEL" rows={data.byChannel} label={(k) => (k === "field" ? "Field reports" : "Public web & feeds")} />
            <Breakdown title="SENTIMENT" rows={data.bySentiment} />
            <Breakdown title="LABELLED BY" rows={data.labelledBy} label={(k) => ({ ai: "AI", rules: "Word lists", staff: "Staff" } as Record<string, string>)[k] ?? k} />
          </div>
          <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

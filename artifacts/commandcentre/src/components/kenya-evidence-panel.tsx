import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/records";
type Bundle = {
  country: string;
  county: string | null;
  reviewedOn: string;
  mode: string;
  sources: {
    id: string;
    title: string;
    url: string;
    period: string;
    status: string;
    kind: string;
    note?: string;
    county: string | null;
  }[];
  facts: {
    id: string;
    sourceId: string;
    text: string;
    locator: string;
    period: string;
    county: string | null;
    nature: string;
  }[];
  limitations: string[];
};
export function KenyaEvidencePanel() {
  const [review, setReview] = useState("");
  const [busy, setBusy] = useState(false);
  async function runReview(task: string) {
    setBusy(true); setReview("");
    try { const result = await api<{ text: string; note?: string; mode: string }>("dashboard/evidence-review", { method: "POST", body: JSON.stringify({ task }) }); setReview(`${result.mode}\n${result.note ?? ""}\n\n${result.text}`); }
    catch { setReview("Evidence review could not be completed. Please retry."); }
    finally { setBusy(false); }
  }
  const q = useQuery({
    queryKey: ["kenya-evidence"],
    queryFn: () => api<Bundle>("dashboard/evidence"),
    staleTime: 60_000,
  });
  return (
    <details className="rounded-lg border border-border bg-card p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Kenya evidence and source status
      </summary>
      {q.isLoading ? (
        <p className="mt-3 text-muted-foreground">Loading evidence…</p>
      ) : q.isError ? (
        <p role="alert" className="mt-3 text-red-300">
          Evidence could not be loaded.{" "}
          <button className="underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        q.data && (
          <div className="mt-4 space-y-4">
            <p className="text-muted-foreground">
              Scope:{" "}
              {q.data.county
                ? `${q.data.county} County, Kenya`
                : "Kenya national context"}{" "}
              · Source review: {q.data.reviewedOn}. This date is not a new
              statistical measurement.
            </p>
            <div className="space-y-3">
              {q.data.facts.map((f) => (
                <div key={f.id} className="rounded border border-border p-3">
                  <p>{f.text}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {f.county ? `${f.county} County` : "Kenya national"} ·{" "}
                    {f.period} · {f.nature.replaceAll("-", " ")} · {f.locator}
                  </p>
                  <a
                    className="mt-1 inline-block text-xs text-primary underline"
                    target="_blank"
                    rel="noreferrer"
                    href={q.data!.sources.find((s) => s.id === f.sourceId)?.url}
                  >
                    [{f.sourceId}] Original source
                  </a>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold">Public-document review</h3>
              <p className="text-xs text-muted-foreground">Neutral service-delivery research using the sources above. No voter records are sent.</p>
              <div className="flex flex-wrap gap-2">
                {[["analyst", "Evidence analyst"], ["swot", "Evidence SWOT"], ["response", "Factual response draft"]].map(([task, label]) => <button key={task} disabled={busy} onClick={() => void runReview(task)} className="rounded border border-border px-3 py-2 disabled:opacity-50">{label}</button>)}
              </div>
              {busy && <p role="status">Reviewing sources…</p>}
              {review && <p role="status" className="whitespace-pre-wrap rounded border border-border p-3">{review}</p>}
            </div>
            <h3 className="font-semibold">Source catalogue</h3>
            {q.data.sources.map((s) => (
              <div key={s.id} className="border-b border-border pb-2">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {s.title}
                </a>
                <p className="text-xs text-muted-foreground">
                  {s.period} · {s.status} · {s.kind}
                  {s.note ? ` — ${s.note}` : ""}
                </p>
              </div>
            ))}
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {q.data.limitations.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )
      )}
    </details>
  );
}

import { WARDS as CAMPAIGN_WARDS, CAMPAIGN } from "@/lib/wards";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mic, ScrollText, Library, Sparkles, Copy, Check, Download, Save, Trash2, RotateCcw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const API = `${BASE}api/speeches`;

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `Request failed: ${r.status}`);
  }
  return r.json();
}

interface GeneratedDocument {
  id: number;
  docType: string;
  title: string;
  occasion: string | null;
  audience: string | null;
  ward: string | null;
  language: string;
  tone: string | null;
  body: string;
  createdAt: string;
}

const OCCASIONS = ["Candidate Development Vision", `${CAMPAIGN.constituency} Community Listening Forum`, "Proposed Water Access Plan", "Proposed Road Improvement Plan", "Healthcare Priorities Discussion", "Education and Bursary Proposals", "Agriculture and Livelihoods Forum", "Youth and Women Empowerment Forum", "Public Accountability Discussion", "Radio Community Questions and Answers"];
const WARDS = ["constituency-wide", ...CAMPAIGN_WARDS];
const LANGUAGES = ["English", "Swahili", "English + Swahili mix"];
const TONES = ["Inspirational", "Fiery / Passionate", "Solemn / Respectful", "Warm / Personal", "Statesmanlike", "Conversational"];
const LENGTHS = [
  { value: "short", label: "SHORT · ~2 MIN" },
  { value: "medium", label: "MEDIUM · ~5 MIN" },
  { value: "long", label: "LONG · ~10 MIN" },
];

type Tab = "speech" | "manifesto" | "library";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] text-muted-foreground tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary";

function OutputPanel({
  title, body, meta, onSave, saving, saved,
}: {
  title: string;
  body: string;
  meta: { docType: string; occasion?: string; audience?: string; ward?: string; language: string; tone?: string };
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const download = () => {
    const blob = new Blob([`${title}\n\n${body}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="bg-card border border-border">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="font-mono text-[10px] text-primary tracking-widest truncate">{title}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={copy} className="text-muted-foreground hover:text-foreground" title="Copy">
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button onClick={download} className="text-muted-foreground hover:text-foreground" title="Download .txt">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onSave}
            disabled={saving || saved}
            className="flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground font-mono text-[10px] tracking-wider disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            {saved ? "SAVED" : saving ? "SAVING" : "SAVE"}
          </button>
        </div>
      </div>
      <div className="p-4 max-h-[55vh] overflow-y-auto">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{body}</pre>
      </div>
    </div>
  );
}

export default function Speeches() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("speech");

  // Speech form
  const [occasion, setOccasion] = useState(OCCASIONS[0]);
  const [audience, setAudience] = useState("");
  const [ward, setWard] = useState(WARDS[0]);
  const [sLanguage, setSLanguage] = useState(LANGUAGES[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [keyPoints, setKeyPoints] = useState("");
  const [currentGaps, setCurrentGaps] = useState("");
  const [length, setLength] = useState("medium");

  // Manifesto form
  const [mLanguage, setMLanguage] = useState(LANGUAGES[0]);
  const [mTone, setMTone] = useState("Statesmanlike");
  const [priorityIssues, setPriorityIssues] = useState("");

  const [output, setOutput] = useState<{ title: string; body: string; docType: string; mode?: string; notes?: string[] } | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const speechMut = useMutation({
    mutationFn: () =>
      api("/generate", {
        method: "POST",
        body: JSON.stringify({ occasion, audience, ward, language: sLanguage, tone, keyPoints, currentGaps, length }),
      }),
    onMutate: () => { setError(null); setSavedId(null); setOutput(null); },
    onSuccess: (d) => {
      setOutput({ title: d.title, body: d.body, docType: "speech", mode: d.mode, notes: d.notes });
      // The server already saves generated speeches to the library.
      if (d.documentId) { setSavedId(d.documentId); qc.invalidateQueries({ queryKey: ["speech-docs"] }); }
    },
    onError: (e: Error) => setError(e.message),
  });

  const manifestoMut = useMutation({
    mutationFn: () =>
      api("/manifesto", {
        method: "POST",
        body: JSON.stringify({ language: mLanguage, tone: mTone, priorityIssues }),
      }),
    onMutate: () => { setError(null); setSavedId(null); setOutput(null); },
    onSuccess: (d) => setOutput({ title: d.title, body: d.body, docType: "manifesto", mode: d.mode, notes: d.notes }),
    onError: (e: Error) => setError(e.message),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      api("/documents", {
        method: "POST",
        body: JSON.stringify({
          docType: output!.docType,
          title: output!.title,
          occasion: output!.docType === "speech" ? occasion : null,
          audience: output!.docType === "speech" ? audience || null : null,
          ward: output!.docType === "speech" ? ward : null,
          language: output!.docType === "speech" ? sLanguage : mLanguage,
          tone: output!.docType === "speech" ? tone : mTone,
          body: output!.body,
        }),
      }),
    onSuccess: (d) => { setSavedId(d.document.id); qc.invalidateQueries({ queryKey: ["speech-docs"] }); },
    onError: (e: Error) => setError(e.message),
  });

  const { data: docsData } = useQuery<{ documents: GeneratedDocument[] }>({
    queryKey: ["speech-docs"],
    queryFn: () => api("/documents"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["speech-docs"] }),
  });

  const generating = speechMut.isPending || manifestoMut.isPending;
  const docs = docsData?.documents ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-wider flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> AI SPEECH &amp; MANIFESTO GENERATOR
        </h1>
        <p className="font-mono text-[11px] text-muted-foreground mt-1">
          Prepare {CAMPAIGN.areaLabel} public-service announcements and development briefs using verified information
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          ["speech", "SPEECH WRITER", Mic],
          ["manifesto", "MANIFESTO BUILDER", ScrollText],
          ["library", "SAVED LIBRARY", Library],
        ] as [Tab, string, typeof Mic][]).map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] tracking-widest border-b-2 -mb-px transition-colors ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
            {t === "library" && docs.length > 0 && (
              <span className="text-[9px] bg-secondary px-1.5 py-0.5">{docs.length}</span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 p-3 font-mono text-xs text-red-400">{error}</div>}

      {/* SPEECH TAB */}
      {tab === "speech" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="OCCASION">
                <select value={occasion} onChange={(e) => setOccasion(e.target.value)} className={inputCls}>
                  {OCCASIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="WARD FOCUS">
                <select value={ward} onChange={(e) => setWard(e.target.value)} className={inputCls}>
                  {WARDS.map((w) => <option key={w}>{w}</option>)}
                </select>
              </Field>
            </div>
            <Field label="AUDIENCE (optional)">
              <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. youth, farmers, church congregation" className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="LANGUAGE">
                <select value={sLanguage} onChange={(e) => setSLanguage(e.target.value)} className={inputCls}>
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="TONE">
                <select value={tone} onChange={(e) => setTone(e.target.value)} className={inputCls}>
                  {TONES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <Field label="LENGTH">
              <div className="grid grid-cols-3 gap-2">
                {LENGTHS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLength(l.value)}
                    className={`px-2 py-2 font-mono text-[9px] tracking-wider border ${
                      length === l.value ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="CANDIDATE'S PLAN / KEY COMMITMENTS (optional)">
              <textarea value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} rows={3}
                placeholder={`What ${CAMPAIGN.candidate || "the candidate"} aims to deliver if elected — one commitment per line...`}
                className={`${inputCls} resize-none`} />
            </Field>
            <Field label="DOCUMENTED LOCAL DEVELOPMENT NEEDS (optional — cite sources)">
              <textarea value={currentGaps} onChange={(e) => setCurrentGaps(e.target.value)} rows={3}
                placeholder={`Describe documented needs in ${CAMPAIGN.constituency}, with ward, date and source link. Avoid unsupported allegations.`}
                className={`${inputCls} resize-none`} />
            </Field>
            <button
              onClick={() => speechMut.mutate()}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-mono text-xs tracking-widest disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {speechMut.isPending ? "DRAFTING SPEECH..." : "GENERATE SPEECH"}
            </button>
          </div>

          <div>
            {generating && <GeneratingCard label="Composing speech section by section..." />}
            {!generating && output?.docType === "speech" && (
              <>{(output.mode || output.notes?.length) ? <div className="kaiti-glass rounded-xl p-3 mb-3 text-xs space-y-1">
                {output.mode && <p className="font-semibold text-primary">{output.mode === "ai" ? "Written by AI" : output.mode.includes("fallback") ? "AI unavailable — written from the campaign template" : "Written from the campaign template (no AI tokens used)"}</p>}
                {output.notes?.map((n, i) => <p key={i} className="text-muted-foreground">• {n}</p>)}
              </div> : null}
              <OutputPanel title={output.title} body={output.body}
                meta={{ docType: "speech", occasion, audience, ward, language: sLanguage, tone }}
                onSave={() => saveMut.mutate()} saving={saveMut.isPending} saved={savedId !== null} /></>
            )}
            {!generating && !output && <EmptyOutput label="Configure the speech and hit generate." />}
          </div>
        </div>
      )}

      {/* MANIFESTO TAB */}
      {tab === "manifesto" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="LANGUAGE">
                <select value={mLanguage} onChange={(e) => setMLanguage(e.target.value)} className={inputCls}>
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="TONE">
                <select value={mTone} onChange={(e) => setMTone(e.target.value)} className={inputCls}>
                  {TONES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <Field label="PRIORITY ISSUES (optional)">
              <textarea value={priorityIssues} onChange={(e) => setPriorityIssues(e.target.value)} rows={4}
                placeholder="Any specific issues to emphasize across the manifesto..."
                className={`${inputCls} resize-none`} />
            </Field>
            <div className="bg-secondary/40 border border-border p-3 font-mono text-[10px] text-muted-foreground leading-relaxed">
              Builds a full manifesto around the 4 campaign pillars: grassroots empowerment, infrastructure,
              constitutional mandate, and local accessibility — plus a vision preamble and closing pledge.
            </div>
            <button
              onClick={() => manifestoMut.mutate()}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-mono text-xs tracking-widest disabled:opacity-50"
            >
              <ScrollText className="w-4 h-4" />
              {manifestoMut.isPending ? "BUILDING MANIFESTO..." : "GENERATE MANIFESTO"}
            </button>
          </div>

          <div>
            {generating && <GeneratingCard label="Drafting all manifesto sections in parallel..." />}
            {!generating && output?.docType === "manifesto" && (
              <>{(output.mode || output.notes?.length) ? <div className="kaiti-glass rounded-xl p-3 mb-3 text-xs space-y-1">
                {output.mode && <p className="font-semibold text-primary">{output.mode === "ai" ? "Written by AI" : output.mode.includes("fallback") ? "AI unavailable — written from the campaign template" : "Written from the campaign template (no AI tokens used)"}</p>}
                {output.notes?.map((n, i) => <p key={i} className="text-muted-foreground">• {n}</p>)}
              </div> : null}
              <OutputPanel title={output.title} body={output.body}
                meta={{ docType: "manifesto", language: mLanguage, tone: mTone }}
                onSave={() => saveMut.mutate()} saving={saveMut.isPending} saved={savedId !== null} /></>
            )}
            {!generating && !output && <EmptyOutput label="Set your preferences and build the manifesto." />}
          </div>
        </div>
      )}

      {/* LIBRARY TAB */}
      {tab === "library" && (
        <div className="space-y-3">
          {docs.length === 0 && (
            <div className="bg-card border border-border p-8 text-center font-mono text-xs text-muted-foreground">
              No saved documents yet. Generate a speech or manifesto and save it here.
            </div>
          )}
          {docs.map((d) => <LibraryItem key={d.id} doc={d} onDelete={() => deleteMut.mutate(d.id)} deleting={deleteMut.isPending} />)}
        </div>
      )}
    </div>
  );
}

function GeneratingCard({ label }: { label: string }) {
  return (
    <div className="bg-card border border-border p-8 flex flex-col items-center justify-center gap-3 min-h-[200px]">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyOutput({ label }: { label: string }) {
  return (
    <div className="bg-card border border-dashed border-border p-8 flex flex-col items-center justify-center gap-2 min-h-[200px]">
      <Sparkles className="w-6 h-6 text-primary/30" />
      <p className="font-mono text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function LibraryItem({ doc, onDelete, deleting }: { doc: GeneratedDocument; onDelete: () => void; deleting: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(doc.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="bg-card border border-border">
      <div className="flex items-center justify-between p-3">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-3 text-left min-w-0 flex-1">
          <span className={`font-mono text-[9px] px-1.5 py-0.5 border shrink-0 ${
            doc.docType === "manifesto" ? "text-yellow-400 border-yellow-400/30" : "text-primary border-primary/30"
          }`}>
            {doc.docType.toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{doc.title}</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {[doc.language, doc.tone, doc.ward, new Date(doc.createdAt).toLocaleDateString()].filter(Boolean).join(" · ")}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0 pl-3">
          <button onClick={copy} className="text-muted-foreground hover:text-foreground" title="Copy">
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onDelete} disabled={deleting} className="text-muted-foreground hover:text-red-400 disabled:opacity-50" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="p-4 border-t border-border max-h-[50vh] overflow-y-auto">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{doc.body}</pre>
        </div>
      )}
    </div>
  );
}

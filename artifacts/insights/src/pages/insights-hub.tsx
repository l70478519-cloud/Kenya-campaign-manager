import { useState } from "react";
import { Link } from "wouter";
import { Brain, Sparkles, RefreshCw, ChevronRight, BarChart2, Users, CheckCircle2, Clock, FileText, AlertCircle, Lightbulb, TrendingUp } from "lucide-react";
import { useListInsightPolls, useGetInsightAiSummary, useGenerateInsightAiSummary } from "@workspace/api-client-react";
import type { InsightPoll } from "@workspace/api-client-react";

// ─── Per-poll AI card ─────────────────────────────────────────────────────────
function PollAiCard({ poll }: { poll: InsightPoll }) {
  const { data: summary, refetch, isLoading: summaryLoading } = useGetInsightAiSummary(poll.id);
  const generate = useGenerateInsightAiSummary();
  const [expanded, setExpanded] = useState(false);

  const hasResponses = (poll.responseCount ?? 0) > 0;
  const isPublished = poll.status === "published" || poll.status === "closed";

  async function handleGenerate() {
    await generate.mutateAsync({ id: poll.id });
    refetch();
  }

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    published: "bg-emerald-50 text-emerald-700",
    closed: "bg-indigo-50 text-indigo-700",
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      {/* Poll header */}
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
          <BarChart2 className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm text-foreground truncate">{poll.title}</h3>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColors[poll.status] ?? "bg-gray-100 text-gray-600"}`}>
              {poll.status.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> {poll.responseCount ?? 0} responses
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/polls/${poll.id}/results`}>
            <span className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer font-medium">
              Results <ChevronRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
      </div>

      {/* AI summary section */}
      <div className="border-t px-5 py-4 bg-muted/30">
        {!isPublished && !hasResponses ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Publish this poll and collect responses to enable AI analysis.</span>
          </div>
        ) : !hasResponses ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>No responses yet. Share the poll link to start collecting data.</span>
          </div>
        ) : summaryLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
            <Brain className="h-3.5 w-3.5" />
            <span>Loading AI summary…</span>
          </div>
        ) : summary?.content ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700">
                <Sparkles className="h-3.5 w-3.5" />
                AI NARRATIVE SUMMARY
                {summary.generatedAt && (
                  <span className="text-muted-foreground font-normal ml-1">
                    · {new Date(summary.generatedAt).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
              <button
                onClick={handleGenerate}
                disabled={generate.isPending}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-indigo-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${generate.isPending ? "animate-spin" : ""}`} />
                Regenerate
              </button>
            </div>
            <p className={`text-sm text-foreground leading-relaxed whitespace-pre-line ${!expanded && "line-clamp-3"}`}>
              {summary.content}
            </p>
            {summary.content.length > 200 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {expanded ? "Show less" : "Read full analysis →"}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Brain className="h-3.5 w-3.5 text-indigo-400" />
              <span>{poll.responseCount} responses ready — generate an AI narrative summary.</span>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generate.isPending}
              className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors font-medium"
            >
              {generate.isPending ? (
                <><RefreshCw className="h-3 w-3 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="h-3 w-3" /> Generate AI Summary</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InsightsHub() {
  const { data: polls = [], isLoading } = useListInsightPolls();

  const totalPolls = polls.length;
  const totalResponses = polls.reduce((a, p) => a + (p.responseCount ?? 0), 0);
  const publishedPolls = polls.filter(p => p.status === "published" || p.status === "closed");
  const pollsWithResponses = polls.filter(p => (p.responseCount ?? 0) > 0);

  // Split into ready-for-AI and others
  const ready = polls.filter(p => (p.responseCount ?? 0) > 0);
  const notReady = polls.filter(p => (p.responseCount ?? 0) === 0);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Brain className="h-5 w-5 text-indigo-600" />
          </div>
          <h1 className="text-xl font-bold text-foreground">AI Insights</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          GPT-powered narrative analysis across all your opinion polls — summaries, sentiment, and strategic recommendations.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Polls", value: totalPolls, icon: <FileText className="h-4 w-4 text-indigo-500" />, color: "text-indigo-600" },
          { label: "Published", value: publishedPolls.length, icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, color: "text-emerald-600" },
          { label: "Total Responses", value: totalResponses.toLocaleString(), icon: <Users className="h-4 w-4 text-blue-500" />, color: "text-blue-600" },
          { label: "Ready for AI", value: pollsWithResponses.length, icon: <Sparkles className="h-4 w-4 text-amber-500" />, color: "text-amber-600" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="border rounded-xl p-4 bg-card">
            <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* How it works — shown when no polls yet */}
      {totalPolls === 0 && !isLoading && (
        <div className="border rounded-xl p-8 text-center bg-muted/30">
          <Brain className="h-10 w-10 text-indigo-300 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No polls yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create and publish a poll, collect responses, then come back here to run AI analysis.</p>
          <Link href="/">
            <span className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors">
              <FileText className="h-4 w-4" /> Create a Poll
            </span>
          </Link>
        </div>
      )}

      {/* How AI Insights works — info panel */}
      {totalPolls > 0 && (
        <div className="border rounded-xl p-5 bg-indigo-50/50 border-indigo-100">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-indigo-800 mb-1">How AI Insights work</p>
              <p className="text-xs text-indigo-700 leading-relaxed">
                Each poll with responses gets its own <strong>AI Narrative Summary</strong> — a 3–5 paragraph analysis by GPT highlighting key findings, surprising patterns, and actionable recommendations. For open-ended questions, <strong>AI Sentiment Analysis</strong> labels themes, sentiment scores, and per-response insights. Summaries are cached — regenerate any time new responses come in.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {[
                  { icon: <BarChart2 className="h-3 w-3" />, label: "Narrative summary per poll" },
                  { icon: <TrendingUp className="h-3 w-3" />, label: "Open-ended sentiment analysis" },
                  { icon: <Sparkles className="h-3 w-3" />, label: "Actionable insights" },
                ].map(({ icon, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-xs bg-white border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                    {icon} {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Polls with responses — ready for AI */}
      {ready.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-sm text-foreground">Ready for AI Analysis</h2>
            <span className="text-xs text-muted-foreground">({ready.length} poll{ready.length !== 1 ? "s" : ""})</span>
          </div>
          <div className="space-y-3">
            {ready.map(poll => <PollAiCard key={poll.id} poll={poll} />)}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="border rounded-xl p-5 animate-pulse bg-muted/40 h-24" />
          ))}
        </div>
      )}

      {/* Polls awaiting responses */}
      {notReady.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Awaiting Responses</h2>
            <span className="text-xs text-muted-foreground">({notReady.length} poll{notReady.length !== 1 ? "s" : ""})</span>
          </div>
          <div className="space-y-2">
            {notReady.map(poll => (
              <div key={poll.id} className="border rounded-xl px-5 py-4 flex items-center gap-4 bg-card opacity-70">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{poll.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {poll.status === "draft" ? "Draft — publish to start collecting responses" : "Published — share the link to collect responses"}
                  </p>
                </div>
                <Link href={`/polls/${poll.id}/build`}>
                  <span className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer font-medium shrink-0">
                    {poll.status === "draft" ? "Edit & Publish" : "View Poll"}
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

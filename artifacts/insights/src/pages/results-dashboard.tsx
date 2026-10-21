import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useGetInsightPoll,
  useLoadInsightResults,
  useGenerateInsightAiSummary,
  useGetInsightAiSummary,
  useAnalyzeInsightSentiment,
  useLoadInsightTrend,
  useLoadInsightDistribution,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { ArrowLeft, Brain, TrendingUp, MessageSquare, Users, RefreshCw, ThumbsUp, ThumbsDown, Minus, Share2, Eye, MousePointerClick, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6", "#3b82f6"];

const SEGMENT_OPTIONS = [
  { value: "all", label: "All Respondents" },
  { value: "ward", label: "By Ward" },
  { value: "ageGroup", label: "By Age Group" },
  { value: "gender", label: "By Gender" },
  { value: "supportLevel", label: "By Agreement Level" },
];

const STATIC_SEGMENT_VALUES: Record<string, string[]> = {
  ward: [], // populated dynamically from response data
  ageGroup: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
  gender: ["Male", "Female", "Non-binary", "Prefer not to say"],
  supportLevel: ["Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"],
};

interface DistributionEntry { value: string; count: number; percentage: number }
interface QuestionResult {
  questionId: number;
  questionText: string;
  type: string;
  totalAnswers: number;
  distribution: DistributionEntry[];
  openEndedAnswers?: Array<{ value: string }>;
}
interface InsightResults {
  totalResponses: number;
  invitedCount: number;
  responseRate: number;
  questions?: unknown[];
  questionResults: QuestionResult[];
  segment?: string;
  segmentValue?: string;
}

async function fetchResults(pollId: number, segment?: string, segmentValue?: string): Promise<InsightResults> {
  const params = new URLSearchParams();
  if (segment && segment !== "all") params.set("segment", segment);
  if (segmentValue) params.set("segmentValue", segmentValue);
  const qs = params.toString();
  const res = await fetch(`/api/insights/polls/${pollId}/results${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to load results");
  return res.json() as Promise<InsightResults>;
}

interface SentimentStructured {
  overallSentiment?: string;
  overallScore?: number;
  breakdown?: { positive: number; neutral: number; negative: number };
  topThemes?: Array<{ theme: string; sentiment: string; count: number }>;
  perResponse?: Array<{ index: number; sentiment: string; score: number; keyPhrase: string }>;
  notablePositiveQuote?: string;
  notableNegativeQuote?: string;
  campaignImplication?: string;
}

function parseSentiment(content: string | undefined): SentimentStructured | null {
  if (!content) return null;
  try { return JSON.parse(content) as SentimentStructured; } catch { return null; }
}

function SentimentBadge({ value }: { value: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    positive: { color: "bg-green-100 text-green-800 border-green-200", icon: <ThumbsUp className="h-3 w-3" /> },
    neutral: { color: "bg-gray-100 text-gray-700 border-gray-200", icon: <Minus className="h-3 w-3" /> },
    negative: { color: "bg-red-100 text-red-800 border-red-200", icon: <ThumbsDown className="h-3 w-3" /> },
    mixed: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <Minus className="h-3 w-3" /> },
  };
  const style = map[value.toLowerCase()] ?? map["neutral"]!;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${style.color}`}>
      {style.icon}
      {value.charAt(0).toUpperCase() + value.slice(1)}
    </span>
  );
}

export default function ResultsDashboard() {
  const { id } = useParams<{ id: string }>();
  const pollId = parseInt(id!);
  const { toast } = useToast();

  const [segment, setSegment] = useState<string>("all");
  const [segmentValue, setSegmentValue] = useState<string>("");
  const [sentimentResults, setSentimentResults] = useState<Record<number, SentimentStructured | null>>({});
  const [sentimentQid, setSentimentQid] = useState<number | null>(null);

  const { data: poll } = useGetInsightPoll(pollId);

  // Main results (no segment filter — for Question Results tab and stats)
  const { data: results, isLoading, refetch } = useLoadInsightResults(pollId);

  // Cross-tab results: separate fetch with segment params so charts update live
  const {
    data: filteredResults,
    isLoading: filteredLoading,
    refetch: refetchFiltered,
  } = useQuery<InsightResults>({
    queryKey: ["insights-results-crosstab", pollId, segment, segmentValue],
    queryFn: () => fetchResults(pollId, segment, segmentValue),
    staleTime: 30000,
  });

  const { data: aiSummary, refetch: refetchSummary } = useGetInsightAiSummary(pollId);
  const generateSummary = useGenerateInsightAiSummary();
  const analyzeSentiment = useAnalyzeInsightSentiment();
  const { data: trend } = useLoadInsightTrend(pollId);
  const { data: distribution, refetch: refetchDistribution } = useLoadInsightDistribution(pollId);

  // Derive ward values: use poll.targetAudience.wards if configured, else default list
  const dynamicSegmentValues = useMemo<Record<string, string[]>>(() => {
    const taWards = (poll?.targetAudience as { wards?: string[] } | null)?.wards ?? [];
    const knownWards = taWards.length > 0
      ? taWards
      : ["Ward 1", "Ward 2", "Ward 3", "Ward 4", "Ward 5", "Ward 6", "Ward 7", "Ward 8", "Ward 9", "Ward 10"];
    return {
      ...STATIC_SEGMENT_VALUES,
      ward: knownWards,
    };
  }, [poll]);

  const handleGenerateSummary = async () => {
    await generateSummary.mutateAsync({ id: pollId });
    refetchSummary();
    toast({ title: "AI summary generated" });
  };

  const handleSentiment = async (qid: number) => {
    setSentimentQid(qid);
    try {
      const result = await analyzeSentiment.mutateAsync({ id: pollId, qid });
      const parsed = parseSentiment(result.content);
      setSentimentResults((prev) => ({ ...prev, [qid]: parsed }));
      toast({ title: "Sentiment analysis complete" });
    } catch {
      toast({ title: "Sentiment analysis failed", variant: "destructive" });
    } finally {
      setSentimentQid(null);
    }
  };

  const openEndedQuestions = results?.questionResults?.filter((q) => q.type === "open_ended") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{poll?.title ?? "Results"}</h1>
          <p className="text-sm text-muted-foreground">Live Results Dashboard</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetch(); refetchFiltered(); refetchDistribution(); }} className="gap-1">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {/* Stats row */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-indigo-500 bg-indigo-50 rounded-lg p-1.5" />
                <div>
                  <p className="text-2xl font-bold">{results?.totalResponses ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Total Responses</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-cyan-500 bg-cyan-50 rounded-lg p-1.5" />
                <div>
                  <p className="text-2xl font-bold">{results?.invitedCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Invited</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-emerald-500 bg-emerald-50 rounded-lg p-1.5" />
                <div>
                  <p className="text-2xl font-bold">{Math.round((results?.responseRate ?? 0) * 100)}%</p>
                  <p className="text-xs text-muted-foreground">Response Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-8 w-8 text-violet-500 bg-violet-50 rounded-lg p-1.5" />
                <div>
                  <p className="text-2xl font-bold">{results?.questions?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Questions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="results">
        <TabsList className="w-full">
          <TabsTrigger value="results" className="flex-1">Question Results</TabsTrigger>
          <TabsTrigger value="ai" className="flex-1">AI Summary</TabsTrigger>
          <TabsTrigger value="crosstab" className="flex-1">Demographics</TabsTrigger>
          <TabsTrigger value="distribution" className="flex-1">Distribution</TabsTrigger>
          <TabsTrigger value="trend" className="flex-1">Trends</TabsTrigger>
        </TabsList>

        {/* Question Results Tab — unfiltered */}
        <TabsContent value="results" className="space-y-4 mt-4">
          {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
          {results?.questionResults?.map((qr) => (
            <Card key={qr.questionId}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{qr.questionText}</CardTitle>
                <CardDescription className="text-xs">
                  {qr.totalAnswers} answer{qr.totalAnswers !== 1 ? "s" : ""}
                  {" · "}
                  <Badge variant="outline" className="text-xs">{qr.type}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {qr.type === "open_ended" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">{qr.openEndedAnswers?.length ?? 0} open-ended responses</p>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => handleSentiment(qr.questionId)}
                        disabled={analyzeSentiment.isPending && sentimentQid === qr.questionId}
                        className="gap-1"
                      >
                        <Brain className="h-3 w-3" />
                        {analyzeSentiment.isPending && sentimentQid === qr.questionId ? "Analysing..." : "AI Sentiment"}
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {qr.openEndedAnswers?.slice(0, 10).map((a, i) => (
                        <p key={i} className="text-sm bg-muted/50 rounded p-2 border-l-2 border-indigo-200 italic">
                          "{a.value}"
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {qr.distribution.map((d) => (
                        <div key={d.value} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="truncate max-w-[60%]">{d.value}</span>
                            <span className="text-muted-foreground">{d.count} ({d.percentage}%)</span>
                          </div>
                          <Progress value={d.percentage} className="h-2" />
                        </div>
                      ))}
                    </div>
                    {qr.distribution.length > 1 && (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={qr.distribution} layout="vertical" margin={{ left: 0, right: 20 }}>
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="value" width={120} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number) => [`${v} responses`]} />
                          <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* AI Summary Tab */}
        <TabsContent value="ai" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-indigo-500" /> AI Narrative Summary
                </CardTitle>
                <Button size="sm" onClick={handleGenerateSummary} disabled={generateSummary.isPending} className="gap-1">
                  <Brain className="h-3 w-3" />
                  {generateSummary.isPending ? "Generating..." : aiSummary ? "Regenerate" : "Generate Summary"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {aiSummary ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Generated {new Date(aiSummary.generatedAt).toLocaleString()}
                  </p>
                  <div className="prose prose-sm max-w-none text-sm text-foreground whitespace-pre-wrap">
                    {aiSummary.content}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Click "Generate Summary" to get an AI-powered narrative analysis of your poll results.
                </p>
              )}
            </CardContent>
          </Card>

          {openEndedQuestions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-violet-500" /> Sentiment Analysis
              </h3>
              {openEndedQuestions.map((qr) => {
                const s = sentimentResults[qr.questionId];
                return (
                  <Card key={qr.questionId}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{qr.questionText}</CardTitle>
                        <Button
                          variant="outline" size="sm"
                          onClick={() => handleSentiment(qr.questionId)}
                          disabled={analyzeSentiment.isPending && sentimentQid === qr.questionId}
                          className="gap-1 text-xs shrink-0"
                        >
                          <Brain className="h-3 w-3" />
                          {analyzeSentiment.isPending && sentimentQid === qr.questionId ? "Analysing..." : s ? "Re-run" : "Analyse"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {s ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 flex-wrap">
                            {s.overallSentiment && <SentimentBadge value={s.overallSentiment} />}
                            {s.overallScore !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                Score: <span className="font-medium text-foreground">{s.overallScore.toFixed(2)}</span>
                              </span>
                            )}
                          </div>
                          {s.breakdown && (
                            <div className="space-y-1">
                              <div className="flex gap-0.5 h-3 rounded-full overflow-hidden">
                                <div style={{ width: `${s.breakdown.positive}%` }} className="bg-green-400" title={`Positive ${s.breakdown.positive}%`} />
                                <div style={{ width: `${s.breakdown.neutral}%` }} className="bg-gray-300" title={`Neutral ${s.breakdown.neutral}%`} />
                                <div style={{ width: `${s.breakdown.negative}%` }} className="bg-red-400" title={`Negative ${s.breakdown.negative}%`} />
                              </div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-400 inline-block" />Positive {s.breakdown.positive}%</span>
                                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-gray-300 inline-block" />Neutral {s.breakdown.neutral}%</span>
                                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-400 inline-block" />Negative {s.breakdown.negative}%</span>
                              </div>
                            </div>
                          )}
                          {s.topThemes && s.topThemes.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Themes</p>
                              <div className="flex flex-wrap gap-2">
                                {s.topThemes.map((t, i) => (
                                  <div key={i} className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-lg border text-xs">
                                    <SentimentBadge value={t.sentiment} />
                                    <span className="font-medium">{t.theme}</span>
                                    <span className="text-muted-foreground">({t.count})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            {s.notablePositiveQuote && (
                              <div className="bg-green-50 border-l-2 border-green-400 p-2 rounded text-xs italic">
                                <p className="text-green-700 font-medium mb-1 not-italic text-[10px] uppercase tracking-wide">Notable Positive</p>
                                "{s.notablePositiveQuote}"
                              </div>
                            )}
                            {s.notableNegativeQuote && (
                              <div className="bg-red-50 border-l-2 border-red-400 p-2 rounded text-xs italic">
                                <p className="text-red-700 font-medium mb-1 not-italic text-[10px] uppercase tracking-wide">Notable Negative</p>
                                "{s.notableNegativeQuote}"
                              </div>
                            )}
                          </div>
                          {s.campaignImplication && (
                            <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-lg">
                              <p className="text-xs font-medium text-indigo-900 uppercase tracking-wide mb-1">Key Implication</p>
                              <p className="text-sm text-indigo-800">{s.campaignImplication}</p>
                            </div>
                          )}
                          {s.perResponse && s.perResponse.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Per-Response Labels</p>
                              <div className="space-y-1 max-h-40 overflow-y-auto">
                                {s.perResponse.map((r) => (
                                  <div key={r.index} className="flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground w-6 shrink-0">#{r.index}</span>
                                    <SentimentBadge value={r.sentiment} />
                                    <span className="text-muted-foreground">{r.keyPhrase}</span>
                                    <span className="ml-auto text-muted-foreground">{r.score.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Click "Analyse" to run AI sentiment analysis on {qr.totalAnswers} responses.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Demographics / Cross-tab Tab — uses filteredResults with segment params */}
        <TabsContent value="crosstab" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Demographic Breakdown</CardTitle>
              <CardDescription className="text-xs">
                Filter results by respondent demographics — charts update automatically when you select a segment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 flex-wrap items-end">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Segment by</p>
                  <Select
                    value={segment}
                    onValueChange={(v) => { setSegment(v); setSegmentValue(""); }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="All respondents" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEGMENT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {segment !== "all" && dynamicSegmentValues[segment]?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Value</p>
                    <Select value={segmentValue} onValueChange={setSegmentValue}>
                      <SelectTrigger className="w-52">
                        <SelectValue placeholder="Select value..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dynamicSegmentValues[segment].map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {segment !== "all" && (
                  <Button size="sm" variant="ghost" onClick={() => { setSegment("all"); setSegmentValue(""); }}>
                    Clear
                  </Button>
                )}
              </div>

              {segment !== "all" && (
                <div className="flex items-center gap-2 p-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <div className="h-2 w-2 rounded-full bg-indigo-500" />
                  <p className="text-xs text-indigo-800">
                    Showing <span className="font-semibold">{filteredResults?.totalResponses ?? "…"}</span> responses
                    {" "}filtered by <span className="font-semibold">{segment}{segmentValue ? `: ${segmentValue}` : ""}</span>
                  </p>
                </div>
              )}

              {filteredLoading && [0, 1].map((i) => <Skeleton key={i} className="h-48" />)}

              {(filteredResults?.questionResults ?? [])
                .filter((qr) => qr.type !== "open_ended" && qr.distribution.length > 0)
                .map((qr) => (
                  <div key={qr.questionId} className="space-y-2 pt-2 border-t first:border-t-0">
                    <p className="text-sm font-medium">{qr.questionText}</p>
                    <p className="text-xs text-muted-foreground">{qr.totalAnswers} answers</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={qr.distribution}
                          dataKey="count"
                          nameKey="value"
                          cx="50%"
                          cy="50%"
                          outerRadius={75}
                          label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                        >
                          {qr.distribution.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend />
                        <Tooltip formatter={(v: number) => [`${v} responses`]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ))}

              {!filteredLoading && (filteredResults?.questionResults ?? []).filter((q) => q.type !== "open_ended").length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No choice-type questions found. Add single or multiple-choice questions to see demographic breakdowns.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribution / Sharing funnel Tab */}
        <TabsContent value="distribution" className="mt-4 space-y-4">
          {!distribution ? (
            <Skeleton className="h-64" />
          ) : distribution.totals.views === 0 && distribution.totals.starts === 0 && distribution.totals.completes === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <Share2 className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
                <p className="text-sm font-medium">No sharing activity yet</p>
                <p className="text-xs text-muted-foreground">
                  Share this poll's branded link or QR code to start tracking views, starts and completions per channel.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Funnel stat cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <Eye className="h-8 w-8 text-blue-500 bg-blue-50 rounded-lg p-1.5" />
                    <div>
                      <p className="text-2xl font-bold">{distribution.totals.views}</p>
                      <p className="text-xs text-muted-foreground">Link Views</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <MousePointerClick className="h-8 w-8 text-amber-500 bg-amber-50 rounded-lg p-1.5" />
                    <div>
                      <p className="text-2xl font-bold">{distribution.totals.starts}</p>
                      <p className="text-xs text-muted-foreground">Started · {distribution.startRate}% of views</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 bg-emerald-50 rounded-lg p-1.5" />
                    <div>
                      <p className="text-2xl font-bold">{distribution.totals.completes}</p>
                      <p className="text-xs text-muted-foreground">Completed · {distribution.completionRate}% of starts</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Conversion funnel */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-500" /> Engagement Funnel
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Overall conversion (view → complete): <span className="font-semibold text-foreground">{distribution.conversionRate}%</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {([
                    { label: "Viewed", value: distribution.totals.views, color: "bg-blue-500" },
                    { label: "Started", value: distribution.totals.starts, color: "bg-amber-500" },
                    { label: "Completed", value: distribution.totals.completes, color: "bg-emerald-500" },
                  ] as const).map((step) => {
                    const max = distribution.totals.views || 1;
                    const pct = Math.round((step.value / max) * 100);
                    return (
                      <div key={step.label} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{step.label}</span>
                          <span className="text-muted-foreground">{step.value} ({pct}%)</span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${step.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Per-channel breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-violet-500" /> Channel Performance
                  </CardTitle>
                  <CardDescription className="text-xs">Views, starts and completions by share channel</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ResponsiveContainer width="100%" height={Math.max(160, distribution.byChannel.length * 48)}>
                    <BarChart data={distribution.byChannel} layout="vertical" margin={{ left: 0, right: 20 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="channel" width={90} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="views" name="Views" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="starts" name="Started" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="completes" name="Completed" fill="#10b981" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 font-medium">Channel</th>
                          <th className="py-2 font-medium text-right">Views</th>
                          <th className="py-2 font-medium text-right">Started</th>
                          <th className="py-2 font-medium text-right">Completed</th>
                          <th className="py-2 font-medium text-right">Conv.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {distribution.byChannel.map((c) => (
                          <tr key={c.channel} className="border-b last:border-0">
                            <td className="py-2 capitalize">{c.channel}</td>
                            <td className="py-2 text-right">{c.views}</td>
                            <td className="py-2 text-right">{c.starts}</td>
                            <td className="py-2 text-right">{c.completes}</td>
                            <td className="py-2 text-right text-muted-foreground">
                              {c.views > 0 ? Math.round((c.completes / c.views) * 100) : 0}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Activity over time */}
              {distribution.timeline.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-cyan-500" /> Activity Over Time
                    </CardTitle>
                    <CardDescription className="text-xs">Daily views, starts and completions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={distribution.timeline}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="views" name="Views" stroke="#3b82f6" strokeWidth={2} dot />
                        <Line type="monotone" dataKey="starts" name="Started" stroke="#f59e0b" strokeWidth={2} dot />
                        <Line type="monotone" dataKey="completes" name="Completed" stroke="#10b981" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Trend Tab */}
        <TabsContent value="trend" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" /> Trend Tracker
              </CardTitle>
              <CardDescription className="text-xs">Track how opinion shifts across recurring polls</CardDescription>
            </CardHeader>
            <CardContent>
              {trend && trend.periods.length > 1 ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Question: <span className="font-medium">{trend.questionText}</span></p>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={trend.periods}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="pollTitle" tick={{ fontSize: 11 }} />
                      <YAxis unit="%" tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`${v}%`]} />
                      <Legend />
                      {trend.periods[0]?.distribution.map((d, i) => (
                        <Line
                          key={d.value}
                          type="monotone"
                          dataKey={(entry: typeof trend.periods[0]) =>
                            entry.distribution.find((x) => x.value === d.value)?.percentage ?? 0
                          }
                          name={d.value}
                          stroke={COLORS[i % COLORS.length]}
                          strokeWidth={2}
                          dot
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Trend data appears when you have multiple published polls with similar questions.
                  Currently showing data from {trend?.periods.length ?? 0} poll(s).
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

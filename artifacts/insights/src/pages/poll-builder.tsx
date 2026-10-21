import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useGetInsightPoll,
  useListInsightQuestions,
  useCreateInsightQuestion,
  useUpdateInsightQuestion,
  useDeleteInsightQuestion,
  usePublishInsightPoll,
  useUpdateInsightPoll,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ShareDialog } from "@/components/share-dialog";
import { ArrowLeft, Plus, Trash2, GripVertical, Share2, ExternalLink, Search, X, Users, Filter } from "lucide-react";

type QuestionType = "single_choice" | "multi_choice" | "open_ended";

const typeLabels: Record<QuestionType, string> = {
  single_choice: "Single Choice",
  multi_choice: "Multiple Choice",
  open_ended: "Open Ended",
};

interface PersonResult {
  id: string;
  numericId: number;
  source: "member" | "voter";
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  ward: string | null;
  supportLevel: string | null;
}

function usePersonSearch(query: string) {
  return useQuery<PersonResult[]>({
    queryKey: ["person-search", query],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query, limit: "40" });
      const res = await fetch(`/api/insights/members/search?${params}`);
      if (!res.ok) return [];
      return res.json() as Promise<PersonResult[]>;
    },
    enabled: query.length >= 1,
    staleTime: 10000,
  });
}

interface TargetAudience {
  wards?: string[];
  supportLevels?: string[];
  ageGroups?: string[];
  [key: string]: unknown;
}

const WARD_OPTIONS = ["Ward 1", "Ward 2", "Ward 3", "Ward 4", "Ward 5", "Ward 6", "Ward 7", "Ward 8"];
const SUPPORT_OPTIONS = ["Strong Support", "Lean Support", "Undecided", "Lean Against", "Strong Against"];
const AGE_OPTIONS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              selected.includes(o)
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-transparent text-foreground border-border hover:border-indigo-400"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PollBuilder() {
  const { id } = useParams<{ id: string }>();
  const pollId = parseInt(id!);
  const { toast } = useToast();

  const { data: poll, refetch: refetchPoll } = useGetInsightPoll(pollId);
  const { data: questions = [], refetch } = useListInsightQuestions(pollId);
  const createQuestion = useCreateInsightQuestion();
  const updateQuestion = useUpdateInsightQuestion();
  const deleteQuestion = useDeleteInsightQuestion();
  const publishPoll = usePublishInsightPoll();
  const updatePoll = useUpdateInsightPoll();

  const [newType, setNewType] = useState<QuestionType>("single_choice");
  const [newText, setNewText] = useState("");
  const [newOptions, setNewOptions] = useState<string[]>(["Option A", "Option B"]);
  const [newRequired, setNewRequired] = useState(true);
  const [addingOption, setAddingOption] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editType, setEditType] = useState<QuestionType>("single_choice");
  const [addingEditOption, setAddingEditOption] = useState("");

  const [personSearch, setPersonSearch] = useState("");
  const [selectedPersons, setSelectedPersons] = useState<PersonResult[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { data: personResults = [] } = usePersonSearch(personSearch);

  const [audience, setAudience] = useState<TargetAudience>({
    wards: [],
    supportLevels: [],
    ageGroups: [],
  });

  // Hydrate audience and selectedPersons from loaded poll data (runs once when poll arrives)
  useEffect(() => {
    if (!poll || hydrated) return;
    const ta = poll.targetAudience as TargetAudience | null ?? {};
    setAudience({
      wards: (ta.wards as string[] | undefined) ?? [],
      supportLevels: (ta.supportLevels as string[] | undefined) ?? [],
      ageGroups: (ta.ageGroups as string[] | undefined) ?? [],
    });
    // Reconstruct selectedPersons from respondentIds (just display stubs; search can refine)
    const ids = Array.isArray(poll.respondentIds) ? (poll.respondentIds as number[]) : [];
    if (ids.length > 0) {
      setSelectedPersons(ids.map((nid) => ({
        id: `member-${nid}`,
        numericId: nid,
        source: "member" as const,
        firstName: "Respondent",
        lastName: `#${nid}`,
        displayName: `Respondent #${nid}`,
        email: null,
        ward: null,
        supportLevel: null,
      })));
    }
    setHydrated(true);
  }, [poll, hydrated]);

  const handleAddQuestion = async () => {
    if (!newText.trim()) return;
    await createQuestion.mutateAsync({
      id: pollId,
      data: {
        type: newType,
        text: newText,
        order: questions.length,
        options: newType !== "open_ended" ? newOptions.filter(Boolean) : [],
        required: newRequired,
      },
    });
    setNewText("");
    setNewOptions(["Option A", "Option B"]);
    setAddingOption("");
    refetch();
    toast({ title: "Question added" });
  };

  const handleDeleteQuestion = async (qid: number) => {
    await deleteQuestion.mutateAsync({ id: pollId, qid });
    refetch();
    toast({ title: "Question removed" });
  };

  const handleSaveEdit = async (qid: number) => {
    await updateQuestion.mutateAsync({
      id: pollId,
      qid,
      data: {
        text: editText,
        options: editType !== "open_ended" ? editOptions.filter(Boolean) : [],
      },
    });
    setEditingId(null);
    setAddingEditOption("");
    refetch();
  };

  const handlePublish = async () => {
    if (questions.length === 0) {
      toast({ title: "Add at least one question before publishing", variant: "destructive" });
      return;
    }
    await publishPoll.mutateAsync({ id: pollId });
    refetchPoll();
    toast({ title: "Poll published!", description: "Respondents can now submit answers." });
  };

  const handleAddPerson = (person: PersonResult) => {
    if (selectedPersons.some((p) => p.id === person.id)) return;
    setSelectedPersons((prev) => [...prev, person]);
  };

  const handleRemovePerson = (personId: string) => {
    setSelectedPersons((prev) => prev.filter((p) => p.id !== personId));
  };

  const handleSaveRespondents = async () => {
    await updatePoll.mutateAsync({
      id: pollId,
      data: { respondentIds: selectedPersons.map((p) => p.numericId) },
    });
    refetchPoll();
    toast({ title: `${selectedPersons.length} respondent${selectedPersons.length !== 1 ? "s" : ""} saved` });
  };

  const handleSaveAudience = async () => {
    await updatePoll.mutateAsync({
      id: pollId,
      data: { targetAudience: audience },
    });
    refetchPoll();
    toast({ title: "Target audience saved" });
  };

  const audienceFilterCount =
    (audience.wards?.length ?? 0) +
    (audience.supportLevels?.length ?? 0) +
    (audience.ageGroups?.length ?? 0);

  const shareUrl = poll ? `${window.location.origin}/api/insights/share/${poll.shareToken}` : "";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{poll?.title ?? "Loading..."}</h1>
          <p className="text-sm text-muted-foreground">Poll Builder</p>
        </div>
        <div className="flex gap-2">
          {poll?.status === "published" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> Preview
                </a>
              </Button>
              <Button size="sm" onClick={() => setShareOpen(true)}>
                <Share2 className="h-4 w-4 mr-1" /> Share
              </Button>
            </>
          )}
          {poll?.status === "draft" && (
            <Button size="sm" onClick={handlePublish} disabled={publishPoll.isPending}>
              <Share2 className="h-4 w-4 mr-1" />
              {publishPoll.isPending ? "Publishing..." : "Publish"}
            </Button>
          )}
          {poll?.status === "published" && (
            <Badge className="bg-green-100 text-green-800 border border-green-200">Published</Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="questions">
        <TabsList className="w-full">
          <TabsTrigger value="questions" className="flex-1">Questions</TabsTrigger>
          <TabsTrigger value="audience" className="flex-1">
            <Filter className="h-3 w-3 mr-1" />
            Audience
            {audienceFilterCount > 0 && (
              <Badge className="ml-1.5 bg-indigo-100 text-indigo-700 text-[10px] h-4 px-1">{audienceFilterCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="respondents" className="flex-1">
            <Users className="h-3 w-3 mr-1" />
            Respondents
            {selectedPersons.length > 0 && (
              <Badge className="ml-1.5 bg-indigo-100 text-indigo-700 text-[10px] h-4 px-1">{selectedPersons.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Questions Tab */}
        <TabsContent value="questions" className="space-y-4 mt-4">
          <div className="space-y-3">
            {questions.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No questions yet. Add your first question below.
                </CardContent>
              </Card>
            )}
            {questions.map((q, idx) => (
              <Card key={q.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <GripVertical className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">Q{idx + 1}</span>
                        <Badge variant="outline" className="text-xs">{typeLabels[q.type as QuestionType] ?? q.type}</Badge>
                        {q.required && <Badge variant="outline" className="text-xs text-red-600 border-red-200">Required</Badge>}
                      </div>
                      {editingId === q.id ? (
                        <div className="space-y-3">
                          <Input value={editText} onChange={(e) => setEditText(e.target.value)} className="text-sm" placeholder="Question text" />
                          {editType !== "open_ended" && (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground font-medium">Answer Options</p>
                              {editOptions.map((opt, i) => (
                                <div key={i} className="flex gap-2">
                                  <Input
                                    value={opt}
                                    onChange={(e) => {
                                      const updated = [...editOptions];
                                      updated[i] = e.target.value;
                                      setEditOptions(updated);
                                    }}
                                    className="text-sm"
                                    placeholder={`Option ${i + 1}`}
                                  />
                                  <Button
                                    variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                                    onClick={() => setEditOptions(editOptions.filter((_, j) => j !== i))}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              <div className="flex gap-2">
                                <Input
                                  value={addingEditOption}
                                  onChange={(e) => setAddingEditOption(e.target.value)}
                                  placeholder="Add option..."
                                  className="text-sm"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && addingEditOption.trim()) {
                                      setEditOptions([...editOptions, addingEditOption.trim()]);
                                      setAddingEditOption("");
                                    }
                                  }}
                                />
                                <Button variant="outline" size="sm" onClick={() => {
                                  if (addingEditOption.trim()) {
                                    setEditOptions([...editOptions, addingEditOption.trim()]);
                                    setAddingEditOption("");
                                  }
                                }}>Add</Button>
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveEdit(q.id)} disabled={updateQuestion.isPending}>
                              {updateQuestion.isPending ? "Saving..." : "Save"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setAddingEditOption(""); }}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <CardTitle
                          className="text-sm cursor-pointer hover:text-primary"
                          onClick={() => {
                            setEditingId(q.id);
                            setEditText(q.text);
                            setEditType(q.type as QuestionType);
                            setEditOptions(Array.isArray(q.options) ? [...(q.options as string[])] : []);
                            setAddingEditOption("");
                          }}
                        >
                          {q.text}
                          <span className="ml-2 text-xs text-muted-foreground font-normal">(click to edit)</span>
                        </CardTitle>
                      )}
                      {editingId !== q.id && q.type !== "open_ended" && Array.isArray(q.options) && q.options.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {(q.options as string[]).map((opt, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                              {opt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDeleteQuestion(q.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Plus className="h-4 w-4" /> Add Question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Question Type</Label>
                  <Select value={newType} onValueChange={(v) => setNewType(v as QuestionType)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single_choice">Single Choice</SelectItem>
                      <SelectItem value="multi_choice">Multiple Choice</SelectItem>
                      <SelectItem value="open_ended">Open Ended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col justify-end">
                  <div className="flex items-center gap-2">
                    <Switch checked={newRequired} onCheckedChange={setNewRequired} id="req" />
                    <Label htmlFor="req" className="text-xs">Required</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Question Text *</Label>
                <Input
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="e.g. How would you rate council services?"
                  className="text-sm"
                />
              </div>

              {newType !== "open_ended" && (
                <div className="space-y-2">
                  <Label className="text-xs">Answer Options</Label>
                  {newOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const updated = [...newOptions];
                          updated[i] = e.target.value;
                          setNewOptions(updated);
                        }}
                        className="text-sm"
                        placeholder={`Option ${i + 1}`}
                      />
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setNewOptions(newOptions.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={addingOption}
                      onChange={(e) => setAddingOption(e.target.value)}
                      placeholder="New option text..."
                      className="text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && addingOption.trim()) {
                          setNewOptions([...newOptions, addingOption.trim()]);
                          setAddingOption("");
                        }
                      }}
                    />
                    <Button variant="outline" size="sm" onClick={() => { if (addingOption.trim()) { setNewOptions([...newOptions, addingOption.trim()]); setAddingOption(""); } }}>Add</Button>
                  </div>
                </div>
              )}

              <Button onClick={handleAddQuestion} disabled={!newText.trim() || createQuestion.isPending} className="w-full">
                {createQuestion.isPending ? "Adding..." : "Add Question"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Target Audience Tab */}
        <TabsContent value="audience" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="h-4 w-4 text-indigo-500" /> Target Audience Filters
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Define demographic filters for this poll's target audience. These configure who the poll is designed for.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <MultiSelect
                label="Wards"
                options={WARD_OPTIONS}
                selected={audience.wards ?? []}
                onChange={(vals) => setAudience((a) => ({ ...a, wards: vals }))}
              />
              <MultiSelect
                label="Support Levels"
                options={SUPPORT_OPTIONS}
                selected={audience.supportLevels ?? []}
                onChange={(vals) => setAudience((a) => ({ ...a, supportLevels: vals }))}
              />
              <MultiSelect
                label="Age Groups"
                options={AGE_OPTIONS}
                selected={audience.ageGroups ?? []}
                onChange={(vals) => setAudience((a) => ({ ...a, ageGroups: vals }))}
              />

              {audienceFilterCount > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                  <p className="text-xs text-indigo-800">
                    <span className="font-semibold">{audienceFilterCount}</span> filter{audienceFilterCount !== 1 ? "s" : ""} selected —{" "}
                    this poll targets respondents matching these demographics.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleSaveAudience} disabled={updatePoll.isPending} className="flex-1">
                  {updatePoll.isPending ? "Saving..." : "Save Audience Filters"}
                </Button>
                {audienceFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setAudience({ wards: [], supportLevels: [], ageGroups: [] })}
                  >
                    Clear all
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Respondents Tab */}
        <TabsContent value="respondents" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-500" /> Target Respondents
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Search members and voter registry records to add as targeted respondents for this poll.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Search Members &amp; Voter Registry</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    placeholder="Search by name, email, or ward..."
                    className="pl-9 text-sm"
                  />
                </div>
                {personResults.length > 0 && personSearch && (
                  <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                    {personResults.map((p) => {
                      const already = selectedPersons.some((s) => s.id === p.id);
                      return (
                        <div key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">{p.displayName}</p>
                              <Badge variant="outline" className={`text-[10px] shrink-0 ${p.source === "voter" ? "border-amber-300 text-amber-700 bg-amber-50" : "border-indigo-300 text-indigo-700 bg-indigo-50"}`}>
                                {p.source === "voter" ? "Voter" : "Member"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {p.email ?? "No email"}{p.ward ? ` · ${p.ward}` : ""}
                            </p>
                          </div>
                          {p.supportLevel && (
                            <Badge variant="outline" className="text-xs shrink-0">{p.supportLevel}</Badge>
                          )}
                          <Button
                            size="sm"
                            variant={already ? "secondary" : "outline"}
                            className="shrink-0 text-xs"
                            onClick={() => already ? handleRemovePerson(p.id) : handleAddPerson(p)}
                          >
                            {already ? "Remove" : "Add"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {personSearch.length >= 1 && personResults.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">No results found</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Selected Respondents ({selectedPersons.length})</Label>
                  {selectedPersons.length > 0 && (
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedPersons([])}>
                      Clear all
                    </Button>
                  )}
                </div>
                {selectedPersons.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-4 text-center">
                    No respondents selected. Search and add people above, or leave empty for a public poll.
                  </p>
                ) : (
                  <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                    {selectedPersons.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{p.displayName}</p>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${p.source === "voter" ? "border-amber-300 text-amber-700" : "border-indigo-300 text-indigo-700"}`}>
                              {p.source === "voter" ? "Voter" : "Member"}
                            </Badge>
                          </div>
                          {p.email && <p className="text-xs text-muted-foreground truncate">{p.email}</p>}
                        </div>
                        {p.ward && <Badge variant="outline" className="text-xs shrink-0">{p.ward}</Badge>}
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleRemovePerson(p.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={handleSaveRespondents} disabled={updatePoll.isPending} className="w-full" variant="outline">
                {updatePoll.isPending ? "Saving..." : `Save ${selectedPersons.length} Respondent${selectedPersons.length !== 1 ? "s" : ""}`}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ShareDialog
        poll={poll ? { id: poll.id, title: poll.title, slug: poll.slug, shareToken: poll.shareToken, status: poll.status } : null}
        open={shareOpen}
        onOpenChange={setShareOpen}
        onSlugChange={refetchPoll}
      />
    </div>
  );
}

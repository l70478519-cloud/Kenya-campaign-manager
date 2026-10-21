import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useGetPublicPoll, useSubmitInsightResponse, useRecordInsightShareEvent } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ClipboardList, Ban } from "lucide-react";

// ── Device token helpers ──────────────────────────────────────────────────────
function getOrCreateDeviceToken(shareToken: string): string {
  const key = `poll_token_${shareToken}`;
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(key, token);
  }
  return token;
}

function markSubmitted(shareToken: string) {
  localStorage.setItem(`poll_done_${shareToken}`, "1");
}

function hasSubmitted(shareToken: string): boolean {
  return localStorage.getItem(`poll_done_${shareToken}`) === "1";
}

// Reads the share channel (e.g. ?src=whatsapp) once on mount so funnel events
// can be attributed to the channel that drove the visit.
function getChannel(): string {
  const src = new URLSearchParams(window.location.search).get("src");
  return src ? src.trim().slice(0, 40) : "direct";
}

export default function PublicPoll() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { data: poll, isLoading, isError } = useGetPublicPoll(shareToken!);
  const submitResponse = useSubmitInsightResponse();
  const recordEvent = useRecordInsightShareEvent();
  const channel = useRef<string>(getChannel());
  const { toast } = useToast();

  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});
  const [respondentName, setRespondentName] = useState("");
  const [respondentEmail, setRespondentEmail] = useState("");
  const [respondentWard, setRespondentWard] = useState("");
  const [respondentAgeGroup, setRespondentAgeGroup] = useState("");
  const [respondentGender, setRespondentGender] = useState("");
  const [respondentSupportLevel, setRespondentSupportLevel] = useState("");

  // Layer 1: check localStorage immediately — same device
  const [submitted, setSubmitted] = useState(() => hasSubmitted(shareToken ?? ""));
  const [alreadySubmitted, setAlreadySubmitted] = useState(() => hasSubmitted(shareToken ?? ""));

  // Ensure token is created on first visit (before submission)
  const deviceToken = useRef<string>("");
  useEffect(() => {
    if (shareToken) {
      deviceToken.current = getOrCreateDeviceToken(shareToken);
      // Re-check in case localStorage was cleared between renders
      if (hasSubmitted(shareToken)) {
        setSubmitted(true);
        setAlreadySubmitted(true);
      }
    }
  }, [shareToken]);

  // Record a "start" funnel event once per device per poll (best effort).
  useEffect(() => {
    if (!shareToken) return;
    const key = `poll_started_${shareToken}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    recordEvent.mutate({
      shareToken,
      data: { eventType: "start", channel: channel.current },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareToken]);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <p className="text-muted-foreground">Loading poll...</p>
    </div>
  );

  if (isError || !poll) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="py-12 text-center space-y-3">
          <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
          <p className="font-medium">Poll not found</p>
          <p className="text-sm text-muted-foreground">This poll may have expired or been closed.</p>
        </CardContent>
      </Card>
    </div>
  );

  // Already submitted (same device or same email — flagged by server 409)
  if (alreadySubmitted && !submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="py-12 text-center space-y-4">
          <Ban className="h-16 w-16 text-amber-400 mx-auto" />
          <div>
            <h2 className="text-xl font-bold">Already Submitted</h2>
            <p className="text-sm text-muted-foreground mt-1">
              A response from this device or email has already been recorded for this poll. Only one response per person is allowed.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Submitted in this session (success screen)
  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="py-12 text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <div>
            <h2 className="text-xl font-bold">Thank you!</h2>
            <p className="text-sm text-muted-foreground mt-1">Your response has been recorded. You can only submit once.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const handleSingleChoice = (questionId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleMultiChoice = (questionId: number, option: string, checked: boolean) => {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[] | undefined) ?? [];
      return {
        ...prev,
        [questionId]: checked ? [...current, option] : current.filter((v) => v !== option),
      };
    });
  };

  const handleOpenEnded = (questionId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (!poll.questions) return;

    const required = poll.questions.filter((q) => q.required);
    for (const q of required) {
      const val = answers[q.id];
      if (!val || (Array.isArray(val) && val.length === 0)) {
        toast({ title: `Please answer: "${q.text}"`, variant: "destructive" });
        return;
      }
    }

    const flatAnswers = poll.questions.flatMap((q) => {
      const val = answers[q.id];
      if (!val) return [];
      if (Array.isArray(val)) return val.map((v) => ({ questionId: q.id, value: v }));
      return [{ questionId: q.id, value: val as string }];
    });

    try {
      await submitResponse.mutateAsync({
        shareToken: shareToken!,
        data: {
          respondentName: respondentName || undefined,
          respondentEmail: respondentEmail || undefined,
          respondentWard: respondentWard || undefined,
          respondentAgeGroup: respondentAgeGroup || undefined,
          respondentGender: respondentGender || undefined,
          respondentSupportLevel: respondentSupportLevel || undefined,
          submissionToken: deviceToken.current || undefined,
          channel: channel.current,
          answers: flatAnswers,
        },
      });

      // Success — mark in localStorage so same device sees "already submitted"
      markSubmitted(shareToken!);
      setSubmitted(true);
    } catch (err: any) {
      // Layer 2/3: server returned 409 — duplicate detected
      const status = err?.response?.status ?? err?.status;
      const body = err?.response?.data ?? err?.data ?? {};
      if (status === 409 || body?.error === "already_submitted") {
        // Mark locally so they don't hit the server again
        markSubmitted(shareToken!);
        setAlreadySubmitted(true);
      } else {
        toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" });
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{poll.title}</CardTitle>
            {poll.description && <CardDescription>{poll.description}</CardDescription>}
          </CardHeader>
        </Card>

        {/* Respondent info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Your Details (optional)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={respondentName} onChange={(e) => setRespondentName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={respondentEmail} onChange={(e) => setRespondentEmail(e.target.value)} placeholder="you@example.com" type="email" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ward</Label>
              <Input value={respondentWard} onChange={(e) => setRespondentWard(e.target.value)} placeholder="Ward name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Age Group</Label>
              <Select value={respondentAgeGroup} onValueChange={setRespondentAgeGroup}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {["18-24", "25-34", "35-44", "45-54", "55-64", "65+"].map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gender</Label>
              <Select value={respondentGender} onValueChange={setRespondentGender}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {["Male", "Female", "Non-binary", "Prefer not to say"].map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Agreement Level</Label>
              <Select value={respondentSupportLevel} onValueChange={setRespondentSupportLevel}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {["Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        {poll.questions?.map((q, idx) => (
          <Card key={q.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <span className="text-muted-foreground text-sm mr-2">Q{idx + 1}.</span>
                {q.text}
                {q.required && <span className="text-red-500 ml-1">*</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {q.type === "single_choice" && (
                <RadioGroup
                  value={(answers[q.id] as string) ?? ""}
                  onValueChange={(v) => handleSingleChoice(q.id, v)}
                  className="space-y-2"
                >
                  {(q.options as string[]).map((opt) => (
                    <div key={opt} className="flex items-center gap-3">
                      <RadioGroupItem value={opt} id={`${q.id}-${opt}`} />
                      <Label htmlFor={`${q.id}-${opt}`} className="cursor-pointer">{opt}</Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
              {q.type === "multi_choice" && (
                <div className="space-y-2">
                  {(q.options as string[]).map((opt) => {
                    const checked = ((answers[q.id] as string[] | undefined) ?? []).includes(opt);
                    return (
                      <div key={opt} className="flex items-center gap-3">
                        <Checkbox
                          id={`${q.id}-${opt}`}
                          checked={checked}
                          onCheckedChange={(c) => handleMultiChoice(q.id, opt, !!c)}
                        />
                        <Label htmlFor={`${q.id}-${opt}`} className="cursor-pointer">{opt}</Label>
                      </div>
                    );
                  })}
                </div>
              )}
              {q.type === "open_ended" && (
                <Textarea
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => handleOpenEnded(q.id, e.target.value)}
                  placeholder="Type your answer here..."
                  rows={4}
                />
              )}
            </CardContent>
          </Card>
        ))}

        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={submitResponse.isPending}
        >
          {submitResponse.isPending ? "Submitting..." : "Submit Response"}
        </Button>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Each person may only submit one response. Duplicate submissions are blocked automatically.
        </p>
      </div>
    </div>
  );
}

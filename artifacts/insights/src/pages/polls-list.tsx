import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListInsightPolls, useCreateInsightPoll, useCreateInsightQuestion, useDeleteInsightPoll, usePublishInsightPoll } from "@workspace/api-client-react";
import { ADVANCED_POLL_TEMPLATE } from "@/lib/advanced-poll-template";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ShareDialog } from "@/components/share-dialog";
import { PlusCircle, BarChart2, Edit, Trash2, Share2, MoreVertical, ClipboardList, Sparkles } from "lucide-react";

const statusColor: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
  published: "bg-green-100 text-green-800 border-green-200",
  closed: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function PollsList() {
  const { data: polls = [], refetch } = useListInsightPolls();
  const createPoll = useCreateInsightPoll();
  const createQuestion = useCreateInsightQuestion();
  const deletePoll = useDeleteInsightPoll();
  const publishPoll = usePublishInsightPoll();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sharePoll, setSharePoll] = useState<typeof polls[number] | null>(null);
  const [buildingTemplate, setBuildingTemplate] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    await createPoll.mutateAsync({ data: { title, description } });
    setOpen(false);
    setTitle("");
    setDescription("");
    refetch();
    toast({ title: "Poll created", description: "Your new poll is ready to build." });
  };

  const handleCreateFromTemplate = async () => {
    if (buildingTemplate) return;
    setBuildingTemplate(true);
    let createdPollId: number | null = null;
    let added = 0;
    try {
      const poll = await createPoll.mutateAsync({
        data: {
          title: ADVANCED_POLL_TEMPLATE.title,
          description: ADVANCED_POLL_TEMPLATE.description,
        },
      });
      createdPollId = poll.id;
      for (let i = 0; i < ADVANCED_POLL_TEMPLATE.questions.length; i++) {
        const q = ADVANCED_POLL_TEMPLATE.questions[i];
        await createQuestion.mutateAsync({
          id: poll.id,
          data: { type: q.type, text: q.text, order: i, options: q.options, required: q.required },
        });
        added++;
      }
      toast({
        title: "Advanced poll created",
        description: `${added} questions added. Review candidate names and wards, then publish.`,
      });
      navigate(`/polls/${poll.id}/build`);
    } catch {
      if (createdPollId !== null) {
        // Poll exists but some questions failed — send the user to the builder
        // to finish or fix it rather than leaving an orphaned draft.
        toast({
          title: "Template partially built",
          description: `${added} of ${ADVANCED_POLL_TEMPLATE.questions.length} questions were added. Opening the builder so you can finish it.`,
          variant: "destructive",
        });
        navigate(`/polls/${createdPollId}/build`);
      } else {
        toast({ title: "Could not build template", description: "Please try again.", variant: "destructive" });
      }
    } finally {
      setBuildingTemplate(false);
    }
  };

  const handleDelete = async (id: number) => {
    await deletePoll.mutateAsync({ id });
    refetch();
    toast({ title: "Poll deleted" });
  };

  const handlePublish = async (id: number) => {
    await publishPoll.mutateAsync({ id });
    refetch();
    toast({ title: "Poll published!", description: "Your poll is now live and accepting responses." });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Opinion Polls</h1>
          <p className="text-muted-foreground text-sm mt-1">Create, manage and analyse your polls</p>
        </div>
        <div className="flex gap-2">
        <Button variant="outline" className="gap-2" onClick={handleCreateFromTemplate} disabled={buildingTemplate}>
          <Sparkles className="h-4 w-4 text-indigo-500" />
          {buildingTemplate ? "Building..." : "Advanced Template"}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <PlusCircle className="h-4 w-4" />
              New Poll
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Poll</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label htmlFor="title">Poll Title *</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ward Resident Satisfaction Survey" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description for respondents" rows={3} />
              </div>
              <Button onClick={handleCreate} disabled={!title.trim() || createPoll.isPending} className="w-full">
                {createPoll.isPending ? "Creating..." : "Create Poll"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {polls.length === 0 ? (
        <Card className="py-16">
          <CardContent className="flex flex-col items-center text-center gap-3">
            <ClipboardList className="h-12 w-12 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No polls yet. Create your first poll to get started.</p>
            <Button variant="outline" onClick={() => setOpen(true)}>Create Poll</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {polls.map((poll) => (
            <Card key={poll.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{poll.title}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/polls/${poll.id}/build`}>
                          <Edit className="h-4 w-4 mr-2" /> Build Questions
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/polls/${poll.id}/results`}>
                          <BarChart2 className="h-4 w-4 mr-2" /> View Results
                        </Link>
                      </DropdownMenuItem>
                      {poll.status === "draft" && (
                        <DropdownMenuItem onClick={() => handlePublish(poll.id)}>
                          <Share2 className="h-4 w-4 mr-2" /> Publish Poll
                        </DropdownMenuItem>
                      )}
                      {poll.status === "published" && (
                        <DropdownMenuItem onClick={() => setSharePoll(poll)}>
                          <Share2 className="h-4 w-4 mr-2" /> Share Poll
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(poll.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {poll.description && (
                  <CardDescription className="text-xs line-clamp-2">{poll.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-2 space-y-3">
                <Badge className={`text-xs border ${statusColor[poll.status] ?? "bg-gray-100 text-gray-700"}`}>
                  {poll.status.charAt(0).toUpperCase() + poll.status.slice(1)}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(poll.createdAt).toLocaleDateString()}
                  {poll.publishedAt && ` · Published ${new Date(poll.publishedAt).toLocaleDateString()}`}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
                    <Link href={`/polls/${poll.id}/build`}><Edit className="h-3 w-3 mr-1" /> Build</Link>
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
                    <Link href={`/polls/${poll.id}/results`}><BarChart2 className="h-3 w-3 mr-1" /> Results</Link>
                  </Button>
                  {poll.status === "published" && (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => setSharePoll(poll)}>
                      <Share2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ShareDialog
        poll={sharePoll}
        open={!!sharePoll}
        onOpenChange={(o) => !o && setSharePoll(null)}
        onSlugChange={refetch}
      />
    </div>
  );
}

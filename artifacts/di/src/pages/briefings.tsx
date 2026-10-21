import React from "react";
import { useBriefings, useGenerateBriefing, useDeleteBriefing } from "@/hooks/use-di-api";
import { useDataset } from "@/hooks/use-dataset";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Plus, Trash2, Download, Copy, Clock, Loader2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function BriefingsPage() {
  const { selectedDatasetId } = useDataset();
  const { data: briefings, isLoading } = useBriefings(selectedDatasetId);
  const generateMutation = useGenerateBriefing();
  const deleteMutation = useDeleteBriefing();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = React.useState<number | null>(null);

  const selectedBriefing = briefings?.find(b => b.id === selectedId) || briefings?.[0];

  React.useEffect(() => {
    if (briefings && briefings.length > 0 && !selectedId) {
      setSelectedId(briefings[0].id);
    } else if (briefings && selectedId !== null) {
      if (!briefings.find(b => b.id === selectedId)) {
        setSelectedId(briefings.length > 0 ? briefings[0].id : null);
      }
    }
  }, [briefings, selectedId]);

  const handleCopy = (briefing: any) => {
    if (!briefing) return;
    const text = `# ${briefing.title}\n\n` + briefing.sections.map((s: any) => `## ${s.title}\n${s.content}`).join("\n\n");
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "Briefing contents have been copied.",
    });
  };

  const handleDownload = (briefing: any) => {
    if (!briefing) return;
    const text = `# ${briefing.title}\n\n` + briefing.sections.map((s: any) => `## ${s.title}\n${s.content}`).join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Briefing-${briefing.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar List */}
      <div className="w-80 border-r border-border/50 bg-card/30 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="font-medium text-sm uppercase tracking-wider font-mono">Saved Briefings</h2>
          <Button 
            size="sm" 
            variant="default"
            className="h-8 gap-1.5"
            onClick={() => generateMutation.mutate({ datasetId: selectedDatasetId ?? undefined })}
            disabled={generateMutation.isPending || selectedDatasetId === null}
          >
            {generateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Generate New
          </Button>
        </div>
        
        {generateMutation.error && (
          <div className="m-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex gap-2 text-xs text-destructive">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p>{(generateMutation.error as any).message || "Generation failed"}</p>
          </div>
        )}

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-muted/40 animate-pulse rounded-lg border border-border/50"></div>
              ))}
            </div>
          ) : briefings?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
              <FileText className="w-8 h-8 mb-3 opacity-20" />
              <p className="text-sm">No briefings generated for this dataset.</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <AnimatePresence>
                {briefings?.map(briefing => (
                  <motion.div
                    key={briefing.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`cursor-pointer border rounded-lg p-3 transition-all duration-200 group ${
                      selectedId === briefing.id 
                        ? "bg-primary/10 border-primary/30 shadow-[0_0_10px_rgba(var(--primary),0.1)]" 
                        : "bg-card/50 border-border/50 hover:bg-muted/50 hover:border-border"
                    }`}
                    onClick={() => setSelectedId(briefing.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className={`text-sm font-medium line-clamp-2 ${selectedId === briefing.id ? "text-primary" : "text-foreground"}`}>
                        {briefing.title}
                      </h3>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(briefing.createdAt), { addSuffix: true })}
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(briefing.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-colors p-1"
                        aria-label="Delete briefing"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main View */}
      <div className="flex-1 bg-background relative flex flex-col min-w-0">
        {generateMutation.isPending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-50">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <FileText className="w-8 h-8 text-primary animate-pulse" />
              </div>
            </div>
            <h2 className="mt-6 text-lg font-mono uppercase tracking-widest text-primary">Synthesizing Briefing</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm text-center">
              Aggregating live telemetry across current dataset factors...
            </p>
          </div>
        ) : !selectedBriefing ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50">
             <FileText className="w-16 h-16 mb-4 opacity-20" />
             <p>Select a briefing or generate a new one</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="max-w-4xl mx-auto px-8 py-10">
              <div className="flex items-start justify-between mb-8 pb-6 border-b border-border">
                <div className="pr-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest bg-primary/20 text-primary px-2 py-1 rounded">Executive Brief</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      ID: BRF-{selectedBriefing.id.toString().padStart(4, '0')}
                    </span>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-foreground">{selectedBriefing.title}</h1>
                  <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Generated on {new Date(selectedBriefing.createdAt).toLocaleString()}
                  </p>
                </div>
                
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={() => handleCopy(selectedBriefing)} className="gap-2">
                    <Copy className="w-4 h-4" /> Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDownload(selectedBriefing)} className="gap-2">
                    <Download className="w-4 h-4" /> Export
                  </Button>
                </div>
              </div>

              <div className="space-y-8">
                {selectedBriefing.sections.map((section, idx) => (
                  <motion.div 
                    key={section.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card className="border-border/50 bg-card/50 overflow-hidden">
                      <CardHeader className="bg-muted/20 border-b border-border/50 py-4 px-6">
                        <CardTitle className="text-lg flex items-center gap-3">
                          <span className="text-primary font-mono text-xs opacity-50">0{idx+1}</span>
                          {section.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="prose prose-invert max-w-none prose-p:text-sm prose-p:leading-relaxed prose-p:text-card-foreground/90 prose-ul:text-sm prose-li:text-card-foreground/90 prose-headings:text-foreground">
                          {section.content.split('\n\n').map((paragraph, i) => (
                            <p key={i}>{paragraph}</p>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

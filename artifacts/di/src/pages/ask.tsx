import React, { useState } from "react";
import { useSuggestions, useAskHistory, useAsk, useDeleteAskHistory } from "@/hooks/use-di-api";
import { useDataset } from "@/hooks/use-dataset";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, Bot, User, Clock, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { ChartRenderer } from "@/components/chart-renderer";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const { selectedDatasetId } = useDataset();
  
  const { data: suggestionsData } = useSuggestions(selectedDatasetId);
  const { data: history, isLoading: isHistoryLoading } = useAskHistory(selectedDatasetId);
  const askMutation = useAsk();
  const deleteMutation = useDeleteAskHistory();
  
  const suggestions = suggestionsData?.suggestions || [];

  const handleAsk = (q: string) => {
    if (!q.trim() || askMutation.isPending) return;
    askMutation.mutate({ question: q, datasetId: selectedDatasetId ?? undefined }, {
      onSuccess: () => setQuestion("")
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAsk(question);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden max-w-5xl mx-auto w-full px-6 py-8">
      <div className="mb-8 flex-shrink-0">
        <h1 className="text-3xl font-light tracking-tight mb-2">Interrogate the Data</h1>
        <p className="text-muted-foreground max-w-2xl">
          Query your dataset in plain English. The DI engine maps intent to active datasets and synthesizes narratives.
        </p>
      </div>

      <div className="flex-1 flex flex-col min-h-0 relative z-10 gap-6">
        
        {/* Chat history */}
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="flex flex-col gap-6 pb-4">
            <AnimatePresence initial={false}>
              {history?.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col gap-4"
                >
                  {/* User Question */}
                  <div className="flex items-start gap-4 self-end max-w-[85%]">
                    <div className="bg-primary/20 text-foreground border border-primary/20 rounded-2xl rounded-tr-sm px-5 py-3 shadow-sm">
                      <p className="text-sm">{item.question}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>

                  {/* AI Response */}
                  <div className="flex items-start gap-4 self-start max-w-[90%] w-full">
                    <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-1 shadow-[0_0_10px_rgba(var(--primary),0.2)]">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-6 py-5 shadow-md flex-1 overflow-hidden">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {item.status === 'answered' ? item.intentLabel || item.intent : 'Out of Scope'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                          </span>
                          <button 
                            onClick={() => deleteMutation.mutate(item.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {item.status === "answered" ? (
                        <>
                          <ChartRenderer answer={item} />
                          <div className="mt-4 pt-4 border-t border-border/30">
                            <p className="text-sm leading-relaxed text-card-foreground/90 font-medium">
                              {item.explanation}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 text-destructive/90 mb-3">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-sm font-medium">Query not supported</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{item.message}</p>
                          {item.suggestions && item.suggestions.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-border/30">
                              <p className="text-xs font-mono uppercase text-muted-foreground mb-2">Suggested alternative queries:</p>
                              <div className="flex flex-wrap gap-2">
                                {item.suggestions.map((s, i) => (
                                  <button 
                                    key={i} 
                                    onClick={() => handleAsk(s)}
                                    className="text-xs bg-muted/50 hover:bg-primary/20 hover:text-primary transition-colors border border-border px-3 py-1.5 rounded-full"
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {askMutation.isPending && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-4 self-start w-full"
              >
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-6 py-5 flex flex-col gap-3 min-w-[200px]">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground font-mono">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Synthesizing...</span>
                  </div>
                </div>
              </motion.div>
            )}

            {history?.length === 0 && !askMutation.isPending && !isHistoryLoading && (
              <div className="flex flex-col items-center justify-center h-40 text-center opacity-50 mt-10">
                <Bot className="w-12 h-12 mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Awaiting Query</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="flex-shrink-0 bg-background/80 backdrop-blur pt-2">
          {history?.length === 0 && suggestions.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary" />
                Suggested Queries
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleAsk(suggestion)}
                    className="text-xs bg-card hover:bg-primary/20 border border-border/50 hover:border-primary/30 text-muted-foreground hover:text-foreground px-4 py-2 rounded-full transition-all duration-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {askMutation.error && (
            <div className="mb-3 px-4 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {(askMutation.error as any).message || "Failed to process query"}
            </div>
          )}

          <form onSubmit={onSubmit} className="relative group">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative flex items-center border border-border/50 bg-card rounded-full shadow-lg overflow-hidden focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about the active dataset..."
                className="flex-1 border-0 bg-transparent focus-visible:ring-0 px-6 py-6 h-14 text-base shadow-none"
                disabled={askMutation.isPending || selectedDatasetId === null}
              />
              <div className="pr-2">
                <Button 
                  type="submit" 
                  size="icon" 
                  className={cn(
                    "rounded-full h-10 w-10 transition-all",
                    question.trim() && selectedDatasetId !== null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                  disabled={!question.trim() || askMutation.isPending || selectedDatasetId === null}
                >
                  {askMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

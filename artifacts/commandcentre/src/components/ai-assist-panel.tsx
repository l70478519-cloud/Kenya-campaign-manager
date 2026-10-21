import React, { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, Send, ChevronDown, RotateCcw, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface AiAssistPanelProps {
  module: string;
  context?: Record<string, unknown>;
}

const BASE = import.meta.env.BASE_URL ?? "/";

async function fetchQuickPrompts(module: string): Promise<string[]> {
  try {
    const r = await fetch(`${BASE}api/ai/quick-prompts?module=${encodeURIComponent(module)}`);
    if (!r.ok) return [];
    const data = await r.json();
    return data.prompts ?? [];
  } catch {
    return [];
  }
}

export function AiAssistPanel({ module, context = {} }: AiAssistPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open && quickPrompts.length === 0) {
      fetchQuickPrompts(module).then(setQuickPrompts);
    }
  }, [open, module]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || streaming) return;

    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setStreaming(true);

    const assistantIdx = messages.length + 1;
    setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

    abortRef.current = new AbortController();
    let fullContent = "";

    try {
      const resp = await fetch(`${BASE}api/ai/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, context, message: userMsg }),
        signal: abortRef.current.signal,
      });

      if (!resp.body) throw new Error("No response body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              fullContent += data.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullContent, streaming: true };
                return updated;
              });
            }
            if (data.done || data.error) {
              const finalContent = data.error ? `⚠ ${data.error}` : fullContent;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: finalContent };
                return updated;
              });
            }
          } catch { }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "⚠ Connection error. Please retry." };
          return updated;
        });
      }
    } finally {
      setStreaming(false);
    }
  }, [module, context, messages.length, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const copyMessage = (idx: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
  };

  const moduleLabel = module.replace(/-/g, " ").toUpperCase();

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "kaiti-ai-trigger fixed right-3 sm:right-6 z-50 flex items-center gap-2 rounded-full sm:rounded-xl px-3 sm:px-4 py-3 sm:py-2.5 font-mono text-xs font-bold tracking-widest border transition-all shadow-lg backdrop-blur",
          open
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card text-primary border-primary/50 hover:bg-primary/10"
        )}
      >
        <Sparkles className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        <span className="hidden sm:inline">AI ASSIST</span>
        <span className="sr-only sm:hidden">AI Assist</span>
        <ChevronDown className={cn("hidden sm:block w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {/* Panel */}
      {open && (
        <div role="dialog" aria-label="AI Assist" className="kaiti-ai-panel kaiti-glass fixed inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-20 sm:right-6 z-50 w-full sm:w-[440px] h-[85dvh] sm:h-auto max-h-[85dvh] sm:max-h-[min(75dvh,680px)] flex flex-col rounded-t-2xl sm:rounded-2xl bg-card border border-primary/30 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="font-mono text-xs font-bold tracking-widest text-primary">AI ASSIST</span>
              <span className="font-mono text-[9px] text-muted-foreground border border-border px-1.5 py-0.5">[ {moduleLabel} ]</span>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button onClick={clearChat} className="text-muted-foreground hover:text-foreground transition-colors" title="Clear chat">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close AI Assist" className="p-2 -m-1 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick prompts */}
          {messages.length === 0 && quickPrompts.length > 0 && (
            <div className="px-3 py-2.5 border-b border-border shrink-0">
              <p className="font-mono text-[9px] text-muted-foreground tracking-widest mb-2">QUICK PROMPTS</p>
              <div className="flex flex-col gap-1">
                {quickPrompts.slice(0, 3).map((p, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(p)}
                    className="text-left font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary/50 px-2 py-1.5 border border-transparent hover:border-border transition-all"
                  >
                    → {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Sparkles className="w-6 h-6 text-primary/40 mb-2" />
                <p className="font-mono text-xs text-muted-foreground">AI is ready.</p>
                <p className="font-mono text-[10px] text-muted-foreground/60 mt-1">Ask about your campaign area, its wards, local services or this dashboard.</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}>
                <span className="font-mono text-[8px] text-muted-foreground/60 tracking-widest px-1">
                  {msg.role === "user" ? "YOU" : "AI"}
                </span>
                <div className={cn(
                  "relative group max-w-[92%] px-3 py-2 text-sm sm:text-[11px] leading-relaxed font-sans whitespace-pre-wrap break-words rounded-xl",
                  msg.role === "user"
                    ? "bg-primary/15 border border-primary/30 text-foreground"
                    : "bg-secondary/60 border border-border text-foreground"
                )}>
                  {msg.streaming && msg.content === "" ? (
                    <span className="flex gap-1">
                      <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                  {msg.role === "assistant" && !msg.streaming && msg.content && (
                    <button
                      onClick={() => copyMessage(idx, msg.content)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                    >
                      {copied === idx ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-border shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={streaming}
                rows={1}
                placeholder="Ask anything... (Enter to send)"
                className="flex-1 resize-none rounded-xl bg-secondary border border-border px-3 py-2 font-mono text-base sm:text-xs focus:outline-none focus:border-primary placeholder:text-muted-foreground/50 disabled:opacity-50 max-h-24 overflow-y-auto"
                style={{ fieldSizing: "content" } as any}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={streaming || !input.trim()}
                className="shrink-0 rounded-xl bg-primary text-primary-foreground p-3 sm:p-2 hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="font-mono text-[8px] text-muted-foreground/50 mt-1.5">Shift+Enter for new line · answers use your campaign data and the county plans</p>
          </div>
        </div>
      )}
    </>
  );
}

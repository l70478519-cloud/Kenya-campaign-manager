import { CAMPAIGN } from "@/lib/wards";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit, Send, Plus, Trash2, Loader2, MessageSquare, Copy, Check, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL ?? "/";

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const STARTER_PROMPTS = [
  "What are the latest public project updates in our area?",
  "Summarize water, roads and health service issues in our area",
  "What official budget and ward profile sources should I check?",
  "Draft a public participation speech for one of our wards",
  "How can residents report and follow up a stalled county project?",
  "Summarize recent public news about our area and cite the links",
];

export default function Strategist() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["strategist-conversations"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/strategist/conversations`);
      if (!r.ok) throw new Error("Failed to load conversations");
      return r.json();
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversation = useCallback(async (id: number) => {
    abortRef.current?.abort();
    setStreaming(false);
    setActiveId(id);
    try {
      const r = await fetch(`${BASE}api/strategist/conversations/${id}`);
      if (!r.ok) throw new Error("load failed");
      const data = await r.json();
      setMessages(
        (data.messages ?? []).map((m: { role: string; content: string }) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }))
      );
    } catch {
      setMessages([]);
    }
  }, []);

  const newConversation = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setActiveId(null);
    setMessages([]);
    setInput("");
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${BASE}api/strategist/conversations/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["strategist-conversations"] });
    if (activeId === id) newConversation();
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg = text.trim();
      if (!userMsg || streaming) return;

      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMsg },
        { role: "assistant", content: "", streaming: true },
      ]);
      setInput("");
      setStreaming(true);

      abortRef.current = new AbortController();
      let fullContent = "";

      const finish = (content: string) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content };
          return updated;
        });
      };

      try {
        const resp = await fetch(`${BASE}api/strategist/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMsg, conversationId: activeId ?? undefined }),
          signal: abortRef.current.signal,
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Request failed" }));
          finish(`⚠ ${err.error ?? "Request failed. Please retry."}`);
          return;
        }
        if (!resp.body) throw new Error("No response body");

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.conversationId && !activeId) {
                setActiveId(data.conversationId);
              }
              if (data.content) {
                fullContent += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: fullContent,
                    streaming: true,
                  };
                  return updated;
                });
              }
              if (data.done || data.error) {
                finish(data.error ? `⚠ ${data.error}` : fullContent);
              }
            } catch {
              /* partial line */
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          finish("⚠ Connection error. Please retry.");
        }
      } finally {
        setStreaming(false);
        queryClient.invalidateQueries({ queryKey: ["strategist-conversations"] });
      }
    },
    [streaming, activeId, queryClient]
  );

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

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Conversation sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border/50 bg-card/30">
        <div className="p-3 border-b border-border/50">
          <button
            onClick={newConversation}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-mono uppercase tracking-wider hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Session
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center mt-6 px-2">
              No strategy sessions yet. Ask your first question.
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={cn(
                "group flex items-start gap-2 px-3 py-2 rounded-md cursor-pointer text-xs transition-colors",
                activeId === c.id
                  ? "bg-primary/10 border border-primary/30 text-foreground"
                  : "hover:bg-muted/50 text-muted-foreground border border-transparent"
              )}
            >
              <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span className="flex-1 line-clamp-2">{c.title}</span>
              <button
                onClick={(e) => deleteConversation(c.id, e)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
                aria-label="Delete session"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <BrainCircuit className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">AI CHIEF STRATEGIST</h1>
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">
              {CAMPAIGN.areaLabel} information · public sources and service-delivery records
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto mt-8 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Your strategy war room</h2>
              <p className="text-sm text-muted-foreground mb-8">
                The Chief Strategist reads the live campaign database — voters, field ops,
                finance, turnout forecast, threats — and gives you prioritized, actionable counsel.
              </p>
              <div className="grid sm:grid-cols-2 gap-2 text-left">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    disabled={streaming}
                    className="px-4 py-3 rounded-lg border border-border/60 bg-card/50 hover:border-primary/40 hover:bg-primary/5 text-xs text-left text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((msg, idx) =>
                msg.role === "user" ? (
                  <div key={idx} className="flex justify-end">
                    <div className="bg-primary/15 border border-primary/25 rounded-2xl rounded-tr-sm px-5 py-3 max-w-[85%] text-sm whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-1">
                      <BrainCircuit className="w-4 h-4 text-primary" />
                    </div>
                    <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-5 py-4 flex-1 min-w-0 group/msg">
                      {msg.content === "" && msg.streaming ? (
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing the campaign
                          picture...
                        </span>
                      ) : (
                        <>
                          <div className="text-sm whitespace-pre-wrap leading-relaxed">
                            {msg.content}
                            {msg.streaming && (
                              <span className="inline-block w-2 h-4 ml-0.5 bg-primary/70 animate-pulse align-text-bottom" />
                            )}
                          </div>
                          {!msg.streaming && (
                            <button
                              onClick={() => copyMessage(idx, msg.content)}
                              className="mt-3 flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {copied === idx ? (
                                <>
                                  <Check className="w-3 h-3" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" /> Copy
                                </>
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-border/50 px-4 md:px-8 py-4">
          <div className="max-w-3xl mx-auto flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your Chief Strategist anything about the campaign..."
              rows={2}
              maxLength={2000}
              className="flex-1 resize-none rounded-lg border border-border/60 bg-card/50 px-4 py-3 text-sm focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/60"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={streaming || !input.trim()}
              className="h-11 px-4 rounded-lg bg-primary text-primary-foreground flex items-center gap-2 text-xs font-mono uppercase tracking-wider disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

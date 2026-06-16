"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion } from "framer-motion";
import {
  Send,
  Settings,
  X,
  Paperclip,
  FileText,
  Plus,
  MessageSquare,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAccessToken } from "@/lib/supabase";
import { type Item, chatSessionsApi, type ChatSessionData, type ContextItemStub } from "@/lib/api";
import { ItemPickerDialog } from "@/components/items/ItemPickerDialog";
import { SPRING, EASE_OUT } from "@/components/ui/motion";

// ── Types ──────────────────────────────────────────────────────────────────────

type ModelProvider = "github" | "openai" | "anthropic" | "gemini" | "custom";

type ModelSettings = {
  provider: ModelProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatSession = ChatSessionData & { messages: Message[] };

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: ModelSettings = {
  provider: "github",
  apiKey: "",
  model: "gpt-4o-mini",
  baseUrl: "",
};

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  github: "GitHub Models",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  custom: "Custom (OpenAI-compatible)",
};

const PROVIDER_MODELS: Record<ModelProvider, string[]> = {
  github: [
    "gpt-4o",
    "gpt-4o-mini",
    "Meta-Llama-3.1-70B-Instruct",
    "Meta-Llama-3.1-8B-Instruct",
    "Phi-3.5-mini-instruct",
    "Mistral-large",
    "Cohere-command-r-plus",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
  ],
  gemini: [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash-thinking-exp",
  ],
  custom: [],
};

const SUGGESTED_PROMPTS = [
  "What did I save last week?",
  "Find my notes on machine learning",
  "Show me everything about React hooks",
  "What are my starred items?",
];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Session helpers ────────────────────────────────────────────────────────────

function sessionTitle(msgs: Message[]): string {
  const first = msgs.find((m) => m.role === "user")?.content ?? "New chat";
  return first.length > 52 ? first.slice(0, 50) + "…" : first;
}

function groupByDate(sessions: ChatSession[]): { label: string; items: ChatSession[] }[] {
  const now = Date.now();
  const DAY = 86_400_000;
  const groups: Record<string, ChatSession[]> = {};

  for (const s of sessions) {
    const age = now - new Date(s.updated_at).getTime();
    let label: string;
    if (age < DAY) label = "Today";
    else if (age < 2 * DAY) label = "Yesterday";
    else if (age < 7 * DAY) label = "This week";
    else if (age < 30 * DAY) label = "This month";
    else label = "Older";
    (groups[label] ??= []).push(s);
  }

  const ORDER = ["Today", "Yesterday", "This week", "This month", "Older"];
  return ORDER.filter((l) => groups[l]).map((l) => ({ label: l, items: groups[l] }));
}

// ── Settings helpers ───────────────────────────────────────────────────────────

function loadSettings(): ModelSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem("sb_chat_model");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function persistSettings(s: ModelSettings) {
  try {
    localStorage.setItem("sb_chat_model", JSON.stringify(s));
  } catch {}
}

// ── API call ───────────────────────────────────────────────────────────────────

async function callModel(
  messages: { role: string; content: string }[],
  settings: ModelSettings,
  contextItemIds: string[] = []
): Promise<string> {
  if (!settings.apiKey) {
    throw new Error("No API key configured. Click the model button above to add one.");
  }

  const token = await getAccessToken();
  const body = {
    provider: settings.provider,
    api_key: settings.apiKey,
    model: settings.model,
    base_url: settings.baseUrl,
    messages,
    context_item_ids: contextItemIds,
  };

  const res = await fetch(`${API_URL}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.detail ?? `API error ${res.status}`);
  }
  const data: any = await res.json();
  return data.content as string;
}

// ── Markdown components (token-aligned) ──────────────────────────────────────────

const markdownComponents = {
  h1: ({ children }: any) => <h1 className="font-display text-lg font-bold mt-3 mb-2 pb-1 border-b border-border">{children}</h1>,
  h2: ({ children }: any) => <h2 className="font-display text-base font-bold mt-3 mb-1.5">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
  p: ({ children }: any) => <p className="mb-3 leading-6 last:mb-0">{children}</p>,
  ul: ({ children }: any) => <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="leading-6">{children}</li>,
  pre: ({ children }: any) => <pre className="bg-muted rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">{children}</pre>,
  code: ({ className, children, ...props }: any) => {
    const isBlock = !!className;
    return isBlock
      ? <code className={cn("font-mono text-xs", className)} {...props}>{children}</code>
      : <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>;
  },
  blockquote: ({ children }: any) => <blockquote className="border-l-2 border-brand/50 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2 hover:text-brand/80 transition-colors">{children}</a>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  table: ({ children }: any) => <div className="overflow-x-auto my-2"><table className="w-full border-collapse text-xs">{children}</table></div>,
  th: ({ children }: any) => <th className="border border-border px-2 py-1 bg-muted font-medium text-left">{children}</th>,
  td: ({ children }: any) => <td className="border border-border px-2 py-1">{children}</td>,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ModelSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<ModelSettings>(DEFAULT_SETTINGS);
  const [contextItems, setContextItems] = useState<Item[]>([]);
  const contextItemsRef = useRef<Item[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setDraft(s);
    setSessionId(crypto.randomUUID());
    chatSessionsApi.list().then(setSessions).catch(() => {});
  }, []);

  // ── Sync refs and auto-scroll ──────────────────────────────────────────────

  useEffect(() => {
    contextItemsRef.current = contextItems;
  }, [contextItems]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Auto-save session (debounced) ──────────────────────────────────────────

  const saveSession = useCallback((id: string, msgs: Message[], ctxItems: Item[]) => {
    if (!id || msgs.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      chatSessionsApi
        .upsert(id, {
          title: sessionTitle(msgs),
          messages: msgs.map((m) => ({ role: m.role, content: m.content })),
          context_item_stubs: ctxItems.map((i) => ({
            id: i.id,
            title: i.title,
            ai_title: i.ai_title,
          })),
        })
        .then((saved) => {
          setSessions((prev) => {
            const idx = prev.findIndex((s) => s.id === saved.id);
            const next = idx >= 0 ? [...prev] : [saved, ...prev];
            if (idx >= 0) next[idx] = { ...saved, messages: msgs };
            return next.sort(
              (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            );
          });
        })
        .catch(() => {});
    }, 800);
  }, []);

  useEffect(() => {
    saveSession(sessionId, messages, contextItems);
  }, [messages, sessionId, saveSession]);

  // ── Session management ─────────────────────────────────────────────────────

  function startNewChat() {
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setContextItems([]);
    contextItemsRef.current = [];
  }

  function openSession(session: ChatSession) {
    setSessionId(session.id);
    const msgs: Message[] = (session.messages ?? []).map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    setMessages(msgs);
    const restored = (session.context_item_stubs ?? []).map((stub) => ({
      ...stub,
      user_id: "", folder_id: null, folder: null, content_type: "",
      source_url: null, storage_key: null, file_size: null, mime_type: null,
      summary: null, tags: [], entities: null, confidence: null,
      needs_review: false, is_starred: false, view_count: 0,
      created_at: "", updated_at: "",
    } as Item));
    setContextItems(restored);
    contextItemsRef.current = restored;
  }

  function deleteSessionById(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    chatSessionsApi.delete(id).catch(() => {});
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === sessionId) startNewChat();
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  function openSettings() {
    setDraft(settings);
    setShowSettings(true);
  }

  function saveAndClose() {
    persistSettings(draft);
    setSettings(draft);
    setShowSettings(false);
  }

  // ── Send message ───────────────────────────────────────────────────────────

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const ids = contextItemsRef.current.map((i) => i.id);
      const reply = await callModel(history, settings, ids);
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: reply };
      setMessages((m) => {
        const next = [...m, assistantMsg];
        saveSession(sessionId, next, contextItemsRef.current);
        return next;
      });
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `⚠️ ${err instanceof Error ? err.message : "Something went wrong"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const isConfigured = !!settings.apiKey && !!settings.model;
  const modelChip = isConfigured
    ? `${PROVIDER_LABELS[settings.provider]} · ${settings.model}`
    : "Configure model →";
  const grouped = groupByDate(sessions);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sessions sidebar ───────────────────────────────────────────────── */}
      <motion.div
        animate={{ width: sidebarOpen ? 240 : 44 }}
        transition={SPRING}
        className="flex flex-col border-r border-border bg-muted/30 shrink-0 overflow-hidden"
      >
        {/* Sidebar toggle + new chat */}
        <div className="flex items-center gap-1 p-2 border-b border-border">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex items-center justify-center h-7 w-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title={sidebarOpen ? "Collapse" : "Expand"}
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {sidebarOpen && (
            <button
              onClick={startNewChat}
              className="flex items-center gap-1.5 flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-primary text-primary-foreground shadow-soft hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />
              New chat
            </button>
          )}
        </div>

        {/* Session list */}
        {sidebarOpen && (
          <div className="flex-1 overflow-auto py-2">
            {grouped.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No previous chats
              </p>
            )}
            {grouped.map(({ label, items }) => (
              <div key={label} className="mb-3">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                {items.map((s) => {
                  const active = s.id === sessionId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => openSession(s)}
                      className={cn(
                        "group relative flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors rounded-lg mx-0.5",
                        active
                          ? "bg-brand-muted text-brand"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="active-session"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-brand"
                          transition={SPRING}
                        />
                      )}
                      <MessageSquare
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          active ? "text-brand" : "text-muted-foreground"
                        )}
                      />
                      <span className="flex-1 truncate text-xs">{s.title}</span>
                      <button
                        onClick={(e) => deleteSessionById(s.id, e)}
                        className="hidden group-hover:flex items-center justify-center h-5 w-5 rounded-md hover:bg-destructive/15 hover:text-destructive text-muted-foreground shrink-0 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Main chat area ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex flex-col h-full max-w-3xl mx-auto w-full p-4 md:p-6">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-4 shrink-0">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Chat</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Ask anything about your knowledge base.
              </p>
            </div>
            <button
              onClick={openSettings}
              title="Model settings"
              className={cn(
                "flex items-center gap-1.5 shrink-0 rounded-xl border px-3 py-2 text-xs transition-colors",
                isConfigured
                  ? "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "border-brand/40 bg-brand-muted text-brand hover:bg-brand/15"
              )}
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="max-w-[180px] truncate font-medium">{modelChip}</span>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto space-y-4 mb-4 -mx-1 px-1">
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
                className="py-10 space-y-5"
              >
                {!isConfigured && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-xs text-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
                    <span className="leading-relaxed">
                      No model configured. Click the model button above to add your API key.
                    </span>
                  </div>
                )}

                <div className="flex flex-col items-center text-center pt-4">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 rounded-3xl bg-brand/20 blur-2xl" />
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-3xl border border-border bg-card shadow-lift">
                      <Sparkles className="h-6 w-6 text-brand" />
                    </div>
                  </div>
                  <p className="font-display text-lg font-semibold">How can I help?</p>
                  <p className="text-sm text-muted-foreground mt-1">Try one of these prompts.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SUGGESTED_PROMPTS.map((prompt, i) => (
                    <motion.button
                      key={prompt}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.1 + i * 0.05 }}
                      whileHover={{ y: -2 }}
                      onClick={() => sendMessage(prompt)}
                      className="group rounded-2xl border border-border bg-card p-3.5 text-sm text-left shadow-soft transition-colors hover:border-brand/40 hover:shadow-lift"
                    >
                      <span className="group-hover:text-brand transition-colors">{prompt}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE_OUT }}
                  className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md whitespace-pre-wrap shadow-soft"
                        : "bg-card border border-border rounded-bl-md shadow-soft"
                    )}
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3.5 shadow-soft">
                    <div className="flex gap-1.5 items-center">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="h-2 w-2 rounded-full bg-brand"
                          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: i * 0.15,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={bottomRef} />
          </div>

          {/* Context file chips */}
          <AnimatePresence>
            {contextItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="flex flex-wrap gap-1.5 mb-2 shrink-0 overflow-hidden"
              >
                {contextItems.map((item) => (
                  <motion.span
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-1 rounded-full border border-brand/30 bg-brand-muted px-2.5 py-1 text-xs text-brand"
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="max-w-[160px] truncate">
                      {item.title ?? item.ai_title ?? "Untitled"}
                    </span>
                    <button
                      onClick={() => setContextItems((prev) => prev.filter((i) => i.id !== item.id))}
                      className="ml-0.5 rounded-full hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.span>
                ))}
                <button
                  onClick={() => setContextItems([])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
                >
                  Clear all
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
            className="flex gap-2 shrink-0"
          >
            <button
              type="button"
              onClick={() => setShowFilePicker(true)}
              title="Add file as context"
              className={cn(
                "relative flex items-center justify-center h-12 w-12 rounded-2xl border bg-card transition-colors shrink-0",
                contextItems.length > 0
                  ? "border-brand/40 text-brand"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Paperclip className="h-4 w-4" />
              {contextItems.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground font-mono">
                  {contextItems.length}
                </span>
              )}
            </button>

            <div className="group relative flex-1">
              <input
                type="text"
                placeholder={isConfigured ? "Ask anything..." : "Configure a model to start…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-soft outline-none transition-all placeholder:text-muted-foreground/70 focus:border-brand/40 focus:shadow-brand focus:ring-4 focus:ring-brand/10 disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={cn(
                "flex items-center justify-center h-12 w-12 rounded-2xl bg-brand text-brand-foreground shadow-brand transition-all shrink-0 hover:scale-[1.04] active:scale-95",
                (loading || !input.trim()) && "opacity-50 cursor-not-allowed hover:scale-100"
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* ── Settings modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center glass p-4"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={SPRING}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lift space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-lg">Model Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Provider */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Provider</label>
                <select
                  value={draft.provider}
                  onChange={(e) => {
                    const provider = e.target.value as ModelProvider;
                    const defaultModel = PROVIDER_MODELS[provider][0] ?? "";
                    setDraft((d) => ({ ...d, provider, model: defaultModel }));
                  }}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                >
                  {(Object.keys(PROVIDER_LABELS) as ModelProvider[]).map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>

              {/* API key */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  API Key / Token
                </label>
                <input
                  type="password"
                  placeholder={
                    draft.provider === "github"
                      ? "ghp_xxxx…"
                      : draft.provider === "anthropic"
                      ? "sk-ant-xxxx…"
                      : draft.provider === "gemini"
                      ? "AIza…"
                      : "sk-xxxx…"
                  }
                  value={draft.apiKey}
                  onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Stored only in your browser&rsquo;s localStorage.
                </p>
              </div>

              {/* Model */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                {PROVIDER_MODELS[draft.provider].length > 0 ? (
                  <select
                    value={draft.model}
                    onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                  >
                    {PROVIDER_MODELS[draft.provider].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. gpt-4o, llama3, mistral-7b"
                    value={draft.model}
                    onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                  />
                )}
              </div>

              {/* Custom base URL */}
              {draft.provider === "custom" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Base URL</label>
                  <input
                    type="text"
                    placeholder="https://your-endpoint.example.com/v1"
                    value={draft.baseUrl}
                    onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-mono outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                  />
                </div>
              )}

              {/* Provider hints */}
              {draft.provider === "github" && (
                <p className="text-xs text-muted-foreground rounded-xl bg-muted/60 p-3 leading-relaxed">
                  GitHub Models uses your personal access token (PAT). Generate one at GitHub →
                  Settings → Developer settings → Personal access tokens.
                </p>
              )}
              {draft.provider === "gemini" && (
                <p className="text-xs text-muted-foreground rounded-xl bg-muted/60 p-3 leading-relaxed">
                  Get your Gemini API key at{" "}
                  <span className="font-mono">aistudio.google.com</span> → Get API key. Free tier
                  available.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAndClose}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft hover:opacity-90 transition-opacity"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── File picker ───────────────────────────────────────────────────── */}
      {showFilePicker && (
        <ItemPickerDialog
          open
          title="Add file as context"
          onPick={(item) => {
            setContextItems((prev) =>
              prev.some((i) => i.id === item.id) ? prev : [...prev, item]
            );
            setShowFilePicker(false);
          }}
          onClose={() => setShowFilePicker(false)}
        />
      )}
    </div>
  );
}

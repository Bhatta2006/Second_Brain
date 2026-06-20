"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion } from "framer-motion";
import {
  Send, Settings, X, Paperclip, FileText, Plus, MessageSquare,
  Trash2, ChevronLeft, ChevronRight, Sparkles, AlertTriangle,
  Search, FolderPlus, Link2, HelpCircle, CheckCircle2, Zap,
  ZapOff, Brain, Loader2, FilePlus, PenLine, Unlink, ChevronDown,
  ChevronUp, AlertOctagon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAccessToken } from "@/lib/supabase";
import {
  type Item, chatSessionsApi, type ChatSessionData, type ContextItemStub,
  streamAgentChat, agentApi, type AgentEvent,
  type AgentToolCallEvent, type AgentToolResultEvent,
  type AgentQuestionEvent, type AgentDeleteConfirmEvent,
} from "@/lib/api";
import { ItemPickerDialog } from "@/components/items/ItemPickerDialog";
import { SPRING, EASE_OUT } from "@/components/ui/motion";

// ── Types ─────────────────────────────────────────────────────────────────────

type ModelProvider = "github" | "openai" | "anthropic" | "gemini" | "custom";

type ModelSettings = {
  provider: ModelProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
};

type ToolActivity = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  summary?: string;
  status: "running" | "done" | "error";
};

type PendingQuestion = AgentQuestionEvent & { id: string };
type PendingDelete = AgentDeleteConfirmEvent & { id: string };

type MessageContent =
  | { kind: "text"; text: string }
  | { kind: "streaming"; text: string }
  | { kind: "tool_activity"; activities: ToolActivity[] }
  | { kind: "question"; data: PendingQuestion; answered?: string }
  | { kind: "delete_confirm"; data: PendingDelete; confirmed?: boolean };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;          // plain text for session persistence
  blocks: MessageContent[]; // rich UI blocks
  citedItemIds?: string[];
};

type ChatSession = ChatSessionData & { messages: Message[] };

// ── Constants ─────────────────────────────────────────────────────────────────

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
  custom: "Custom Endpoint",
};

const PROVIDER_MODELS: Record<ModelProvider, string[]> = {
  github: ["gpt-4o", "gpt-4o-mini", "Meta-Llama-3.1-70B-Instruct", "Mistral-large"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-thinking-exp"],
  custom: [],
};

const TOOL_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  search_knowledge:          { icon: <Search className="h-3 w-3" />,     label: "Searching knowledge base",  color: "text-blue-500" },
  get_item_detail:           { icon: <FileText className="h-3 w-3" />,   label: "Reading item content",      color: "text-indigo-500" },
  get_graph_neighbours:      { icon: <Link2 className="h-3 w-3" />,      label: "Exploring knowledge graph", color: "text-violet-500" },
  list_folders:              { icon: <FolderPlus className="h-3 w-3" />, label: "Listing folders",           color: "text-amber-500" },
  create_item:               { icon: <FilePlus className="h-3 w-3" />,   label: "Creating item",             color: "text-green-500" },
  update_item:               { icon: <PenLine className="h-3 w-3" />,    label: "Updating item",             color: "text-cyan-500" },
  create_folder:             { icon: <FolderPlus className="h-3 w-3" />, label: "Creating folder",           color: "text-orange-500" },
  link_items:                { icon: <Link2 className="h-3 w-3" />,      label: "Linking items",             color: "text-purple-500" },
  ask_user:                  { icon: <HelpCircle className="h-3 w-3" />, label: "Asking for clarification",  color: "text-yellow-500" },
  request_delete_confirmation: { icon: <AlertOctagon className="h-3 w-3" />, label: "Requesting delete confirmation", color: "text-red-500" },
  execute_delete:            { icon: <Trash2 className="h-3 w-3" />,     label: "Executing delete",          color: "text-red-600" },
};

const SUGGESTED_PROMPTS_AGENTIC = [
  "What did I save this week? Give me a summary.",
  "Find my notes on machine learning and link related ones.",
  "Create a summary of my React notes and save it.",
  "Organize my untagged items into the right folders.",
];

const SUGGESTED_PROMPTS_SIMPLE = [
  "What did I save last week?",
  "Find my notes on machine learning",
  "Show me everything about React hooks",
  "What are my starred items?",
];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Markdown components ───────────────────────────────────────────────────────

const markdownComponents = {
  h1: ({ children }: { children: React.ReactNode }) => <h1 className="font-display text-lg font-bold mt-3 mb-2 pb-1 border-b border-border">{children}</h1>,
  h2: ({ children }: { children: React.ReactNode }) => <h2 className="font-display text-base font-bold mt-3 mb-1.5">{children}</h2>,
  h3: ({ children }: { children: React.ReactNode }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
  p: ({ children }: { children: React.ReactNode }) => <p className="mb-3 leading-6 last:mb-0">{children}</p>,
  ul: ({ children }: { children: React.ReactNode }) => <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }: { children: React.ReactNode }) => <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }: { children: React.ReactNode }) => <li className="leading-6">{children}</li>,
  pre: ({ children }: { children: React.ReactNode }) => <pre className="bg-muted rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">{children}</pre>,
  code: ({ className, children, ...props }: { className?: string; children: React.ReactNode }) => {
    const isBlock = !!className;
    return isBlock
      ? <code className={cn("font-mono text-xs", className)} {...props}>{children}</code>
      : <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>;
  },
  blockquote: ({ children }: { children: React.ReactNode }) => <blockquote className="border-l-2 border-brand/50 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
  a: ({ href, children }: { href?: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2 hover:text-brand/80 transition-colors">{children}</a>,
  strong: ({ children }: { children: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  table: ({ children }: { children: React.ReactNode }) => <div className="overflow-x-auto my-2"><table className="w-full border-collapse text-xs">{children}</table></div>,
  th: ({ children }: { children: React.ReactNode }) => <th className="border border-border px-2 py-1 bg-muted font-medium text-left">{children}</th>,
  td: ({ children }: { children: React.ReactNode }) => <td className="border border-border px-2 py-1">{children}</td>,
};

// ── Session helpers ───────────────────────────────────────────────────────────

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

function loadSettings(): ModelSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem("sb_chat_model");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function persistSettings(s: ModelSettings) {
  try { localStorage.setItem("sb_chat_model", JSON.stringify(s)); } catch {}
}

function loadAgenticMode(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem("sb_agentic_mode");
    return raw === null ? true : raw === "true";
  } catch {}
  return true;
}

// ── Simple mode API call (existing proxy) ─────────────────────────────────────

async function callSimpleModel(
  messages: { role: string; content: string }[],
  settings: ModelSettings,
  contextItemIds: string[] = []
): Promise<string> {
  if (!settings.apiKey) throw new Error("No API key configured.");
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      provider: settings.provider,
      api_key: settings.apiKey,
      model: settings.model,
      base_url: settings.baseUrl,
      messages,
      context_item_ids: contextItemIds,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string })?.detail ?? `API error ${res.status}`);
  }
  const data = await res.json();
  return data.content as string;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ToolActivityRow({ activity }: { activity: ToolActivity }) {
  const meta = TOOL_META[activity.tool] ?? {
    icon: <Zap className="h-3 w-3" />,
    label: activity.tool,
    color: "text-muted-foreground",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-2 py-1"
    >
      <div className={cn("mt-0.5 shrink-0", meta.color)}>{meta.icon}</div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">{meta.label}</span>
        {activity.status === "running" && (
          <Loader2 className="inline h-3 w-3 ml-1.5 animate-spin text-muted-foreground" />
        )}
        {activity.status === "done" && activity.summary && (
          <span className="ml-1.5 text-xs text-foreground/70">→ {activity.summary}</span>
        )}
        {activity.status === "done" && (
          <CheckCircle2 className="inline h-3 w-3 ml-1.5 text-green-500" />
        )}
      </div>
    </motion.div>
  );
}

function ToolActivityBlock({ activities }: { activities: ToolActivity[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasMany = activities.length > 2;

  const visible = !hasMany || expanded ? activities : activities.slice(0, 2);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-xs my-1 max-w-[85%]">
      <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">
        <Brain className="h-3 w-3" />
        Agent Actions
      </div>
      {visible.map((a) => <ToolActivityRow key={a.id} activity={a} />)}
      {hasMany && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" /> Show less</>
            : <><ChevronDown className="h-3 w-3" /> +{activities.length - 2} more actions</>}
        </button>
      )}
    </div>
  );
}

function QuestionCard({
  data,
  answered,
  onAnswer,
}: {
  data: PendingQuestion;
  answered?: string;
  onAnswer?: (answer: string) => void;
}) {
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  if (answered) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-3.5 my-1 max-w-[85%] text-sm">
        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
          <HelpCircle className="h-3 w-3" /> Agent asked
        </p>
        <p className="font-medium text-sm mb-1">{data.question}</p>
        <p className="text-xs text-brand">You answered: <span className="font-medium">{answered}</span></p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-brand/30 bg-brand-muted/60 p-4 my-1 max-w-[90%] space-y-3"
    >
      <div className="flex items-start gap-2">
        <HelpCircle className="h-4 w-4 text-brand shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-brand mb-0.5">Agent needs clarification</p>
          {data.context && <p className="text-xs text-muted-foreground mb-1">{data.context}</p>}
          <p className="text-sm font-medium">{data.question}</p>
        </div>
      </div>

      {data.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.options.map((opt) => (
            <button
              key={opt}
              onClick={() => setSelected(opt)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
                selected === opt
                  ? "bg-brand text-brand-foreground border-brand"
                  : "border-border bg-card hover:border-brand/40 hover:bg-brand-muted"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setSelected(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (input.trim() || selected)) {
              onAnswer?.(selected ?? input.trim());
            }
          }}
          placeholder={data.options.length > 0 ? "Or type your own answer…" : "Type your answer…"}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10 placeholder:text-muted-foreground/60"
        />
        <button
          onClick={() => { if (selected || input.trim()) onAnswer?.(selected ?? input.trim()); }}
          disabled={!selected && !input.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Submit
        </button>
      </div>
    </motion.div>
  );
}

function DeleteConfirmCard({
  data,
  confirmed,
  onConfirm,
}: {
  data: PendingDelete;
  confirmed?: boolean;
  onConfirm?: (token: string) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const canConfirm = confirmText === "DELETE";

  if (confirmed) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3.5 my-1 max-w-[85%] text-sm">
        <div className="flex items-center gap-2 text-red-500">
          <AlertOctagon className="h-4 w-4" />
          <span className="font-semibold text-xs">Delete confirmed and executed</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border-2 border-red-500/40 bg-red-500/5 p-4 my-1 max-w-[90%] space-y-3"
    >
      <div className="flex items-start gap-2">
        <AlertOctagon className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-red-500 text-sm">PERMANENT DELETE — Cannot be undone</p>
          <p className="text-xs text-muted-foreground mt-0.5">{data.reason}</p>
        </div>
      </div>

      {data.items.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">Items to delete:</p>
          <ul className="space-y-1">
            {data.items.map((item) => (
              <li key={item.id} className="text-xs flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-medium">{item.title}</span>
                <span className="text-muted-foreground">({item.content_type})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.folders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">Folders to delete:</p>
          <ul className="space-y-1">
            {data.folders.map((folder) => (
              <li key={folder.id} className="text-xs flex items-center gap-1.5">
                <span className="font-medium">📁 {folder.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">
          Type <span className="font-mono font-bold text-red-500">DELETE</span> to confirm:
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="w-full rounded-lg border border-red-500/30 bg-background px-3 py-2 text-sm font-mono outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/10 placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setConfirmText("")}
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={!canConfirm || confirming}
          onClick={async () => {
            setConfirming(true);
            try {
              await agentApi.confirmDelete(data.delete_token);
              onConfirm?.(data.delete_token);
            } catch (e) {
              console.error(e);
            } finally {
              setConfirming(false);
            }
          }}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all",
            canConfirm
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-red-200 text-red-400 cursor-not-allowed"
          )}
        >
          {confirming ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirm Permanent Delete"}
        </button>
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

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
  const [agenticMode, setAgenticMode] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setDraft(s);
    setAgenticMode(loadAgenticMode());
    setSessionId(crypto.randomUUID());
    chatSessionsApi.list().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => { contextItemsRef.current = contextItems; }, [contextItems]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Session persistence ────────────────────────────────────────────────────

  const saveSession = useCallback((id: string, msgs: Message[], ctxItems: Item[]) => {
    if (!id || msgs.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const plainMessages = msgs.map((m) => ({ role: m.role, content: m.content }));
      chatSessionsApi
        .upsert(id, {
          title: sessionTitle(msgs),
          messages: plainMessages,
          context_item_stubs: ctxItems.map((i) => ({ id: i.id, title: i.title, ai_title: i.ai_title })),
        })
        .then((saved) => {
          setSessions((prev) => {
            const idx = prev.findIndex((s) => s.id === saved.id);
            const next = idx >= 0 ? [...prev] : [saved, ...prev];
            if (idx >= 0) next[idx] = { ...saved, messages: msgs };
            return next.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          });
        })
        .catch(() => {});
    }, 800);
  }, []);

  useEffect(() => { saveSession(sessionId, messages, contextItems); }, [messages, sessionId, saveSession]);

  // ── Session management ─────────────────────────────────────────────────────

  function startNewChat() {
    abortRef.current?.();
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setContextItems([]);
    contextItemsRef.current = [];
    setLoading(false);
  }

  function openSession(session: ChatSession) {
    abortRef.current?.();
    setSessionId(session.id);
    const msgs: Message[] = (session.messages ?? []).map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      blocks: [{ kind: "text", text: m.content }],
    }));
    setMessages(msgs);
    const restored = (session.context_item_stubs ?? []).map((stub) => ({
      ...stub, user_id: "", folder_id: null, folder: null, content_type: "",
      source_url: null, storage_key: null, file_size: null, mime_type: null,
      summary: null, tags: [], entities: null, confidence: null,
      needs_review: false, is_starred: false, view_count: 0,
      created_at: "", updated_at: "",
    } as Item));
    setContextItems(restored);
    contextItemsRef.current = restored;
    setLoading(false);
  }

  function deleteSessionById(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    chatSessionsApi.delete(id).catch(() => {});
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === sessionId) startNewChat();
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  function saveAndClose() {
    persistSettings(draft);
    setSettings(draft);
    setShowSettings(false);
  }

  function toggleAgenticMode() {
    const next = !agenticMode;
    setAgenticMode(next);
    try { localStorage.setItem("sb_agentic_mode", String(next)); } catch {}
  }

  // ── Send message — Agentic ─────────────────────────────────────────────────

  async function sendAgentMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      blocks: [{ kind: "text", text: text.trim() }],
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    // Create the assistant message as a shell that we'll progressively fill
    const assistantId = (Date.now() + 1).toString();
    const initialActivities: ToolActivity[] = [];
    let streamingText = "";

    // Add a placeholder assistant message
    setMessages((m) => [...m, {
      id: assistantId,
      role: "assistant",
      content: "",
      blocks: [{ kind: "tool_activity", activities: [] }],
    }]);

    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let aborted = false;
    abortRef.current = () => { aborted = true; };

    try {
      const stream = streamAgentChat({
        provider: settings.provider,
        api_key: settings.apiKey,
        model: settings.model,
        base_url: settings.baseUrl,
        messages: allMessages,
        context_item_ids: contextItemsRef.current.map((i) => i.id),
        session_id: sessionId,
      });

      const activities: ToolActivity[] = [];
      let currentToolId: string | null = null;
      let finalAnswer = "";
      let citedItemIds: string[] = [];

      for await (const event of stream) {
        if (aborted) break;

        if (event.type === "tool_call") {
          const ev = event as AgentToolCallEvent;
          const toolId = crypto.randomUUID();
          currentToolId = toolId;
          activities.push({ id: toolId, tool: ev.tool, args: ev.args, status: "running" });

          setMessages((msgs) => msgs.map((m) =>
            m.id === assistantId
              ? { ...m, blocks: [{ kind: "tool_activity", activities: [...activities] }] }
              : m
          ));
        }

        else if (event.type === "tool_result") {
          const ev = event as AgentToolResultEvent;
          if (currentToolId) {
            const idx = activities.findIndex((a) => a.id === currentToolId);
            if (idx !== -1) {
              activities[idx] = { ...activities[idx], status: "done", summary: ev.summary };
            }
          }

          setMessages((msgs) => msgs.map((m) =>
            m.id === assistantId
              ? { ...m, blocks: [{ kind: "tool_activity", activities: [...activities] }] }
              : m
          ));
        }

        else if (event.type === "question") {
          const ev = event as AgentQuestionEvent;
          const questionData: PendingQuestion = { ...ev, id: crypto.randomUUID() };

          setMessages((msgs) => msgs.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  blocks: [
                    { kind: "tool_activity", activities: [...activities] },
                    { kind: "question", data: questionData },
                  ],
                }
              : m
          ));

          // Pause loading — user must answer
          setLoading(false);
          break;
        }

        else if (event.type === "delete_confirm") {
          const ev = event as AgentDeleteConfirmEvent;
          const deleteData: PendingDelete = { ...ev, id: crypto.randomUUID() };

          setMessages((msgs) => msgs.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  blocks: [
                    { kind: "tool_activity", activities: [...activities] },
                    { kind: "delete_confirm", data: deleteData },
                  ],
                }
              : m
          ));
        }

        else if (event.type === "delta") {
          const d = event as { type: "delta"; text: string };
          finalAnswer += d.text;

          setMessages((msgs) => msgs.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  blocks: [
                    ...(activities.length > 0 ? [{ kind: "tool_activity" as const, activities: [...activities] }] : []),
                    { kind: "streaming" as const, text: finalAnswer },
                  ],
                }
              : m
          ));
        }

        else if (event.type === "answer") {
          const ev = event as { type: "answer"; content: string; cited_item_ids: string[] };
          finalAnswer = ev.content;
          citedItemIds = ev.cited_item_ids ?? [];

          setMessages((msgs) => msgs.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: finalAnswer,
                  citedItemIds,
                  blocks: [
                    ...(activities.length > 0 ? [{ kind: "tool_activity" as const, activities: [...activities] }] : []),
                    { kind: "text" as const, text: finalAnswer },
                  ],
                }
              : m
          ));
        }

        else if (event.type === "error") {
          const ev = event as { type: "error"; message: string };
          setMessages((msgs) => msgs.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `⚠️ ${ev.message}`,
                  blocks: [{ kind: "text" as const, text: `⚠️ ${ev.message}` }],
                }
              : m
          ));
        }

        else if (event.type === "done") {
          break;
        }
      }
    } catch (err) {
      setMessages((msgs) => msgs.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content: `⚠️ ${err instanceof Error ? err.message : "Something went wrong"}`,
              blocks: [{ kind: "text" as const, text: `⚠️ ${err instanceof Error ? err.message : "Something went wrong"}` }],
            }
          : m
      ));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  // ── Send message — Simple ─────────────────────────────────────────────────

  async function sendSimpleMessage(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      blocks: [{ kind: "text", text: text.trim() }],
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const reply = await callSimpleModel(history, settings, contextItemsRef.current.map((i) => i.id));
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
        blocks: [{ kind: "text", text: reply }],
      };
      setMessages((m) => { const next = [...m, assistantMsg]; saveSession(sessionId, next, contextItemsRef.current); return next; });
    } catch (err) {
      setMessages((m) => [...m, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `⚠️ ${err instanceof Error ? err.message : "Something went wrong"}`,
        blocks: [{ kind: "text", text: `⚠️ ${err instanceof Error ? err.message : "Something went wrong"}` }],
      }]);
    } finally {
      setLoading(false);
    }
  }

  function sendMessage(text: string) {
    if (agenticMode) sendAgentMessage(text);
    else sendSimpleMessage(text);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const isConfigured = !!settings.apiKey && !!settings.model;
  const modelChip = isConfigured
    ? `${PROVIDER_LABELS[settings.provider]} · ${settings.model}`
    : "Configure model →";
  const grouped = groupByDate(sessions);
  const SUGGESTED = agenticMode ? SUGGESTED_PROMPTS_AGENTIC : SUGGESTED_PROMPTS_SIMPLE;

  // ── Message block renderer ─────────────────────────────────────────────────

  function renderBlocks(msg: Message) {
    return msg.blocks.map((block, i) => {
      if (block.kind === "text") {
        return msg.role === "user" ? (
          <span key={i}>{block.text}</span>
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {block.text}
          </ReactMarkdown>
        );
      }
      if (block.kind === "streaming") {
        return (
          <div key={i}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {block.text}
            </ReactMarkdown>
            <span className="inline-block w-0.5 h-4 bg-brand animate-pulse ml-0.5 align-middle" />
          </div>
        );
      }
      if (block.kind === "tool_activity" && block.activities.length > 0) {
        return <ToolActivityBlock key={i} activities={block.activities} />;
      }
      if (block.kind === "question") {
        return (
          <QuestionCard
            key={i}
            data={block.data}
            answered={block.answered}
            onAnswer={(answer) => {
              // Mark answered in state
              setMessages((msgs) => msgs.map((m) =>
                m.id === msg.id
                  ? {
                      ...m,
                      blocks: m.blocks.map((b, bi) =>
                        bi === i ? { ...b, answered: answer } : b
                      ),
                    }
                  : m
              ));
              // Resume agent with the answer
              sendAgentMessage(answer);
            }}
          />
        );
      }
      if (block.kind === "delete_confirm") {
        return (
          <DeleteConfirmCard
            key={i}
            data={block.data}
            confirmed={block.confirmed}
            onConfirm={() => {
              setMessages((msgs) => msgs.map((m) =>
                m.id === msg.id
                  ? {
                      ...m,
                      blocks: m.blocks.map((b, bi) =>
                        bi === i ? { ...b, confirmed: true } : b
                      ),
                    }
                  : m
              ));
            }}
          />
        );
      }
      return null;
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <motion.div
        animate={{ width: sidebarOpen ? 240 : 44 }}
        transition={SPRING}
        className="flex flex-col border-r border-border bg-muted/30 shrink-0 overflow-hidden"
      >
        <div className="flex items-center gap-1 p-2 border-b border-border">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex items-center justify-center h-7 w-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
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
        {sidebarOpen && (
          <div className="flex-1 overflow-auto py-2">
            {grouped.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No previous chats</p>
            )}
            {grouped.map(({ label, items }) => (
              <div key={label} className="mb-3">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                {items.map((s) => {
                  const active = s.id === sessionId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => openSession(s)}
                      className={cn(
                        "group relative flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors rounded-lg mx-0.5",
                        active ? "bg-brand-muted text-brand" : "hover:bg-muted text-foreground"
                      )}
                    >
                      {active && (
                        <motion.span layoutId="active-session" className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-brand" transition={SPRING} />
                      )}
                      <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", active ? "text-brand" : "text-muted-foreground")} />
                      <span className="flex-1 truncate text-xs">{s.title}</span>
                      <button
                        onClick={(e) => deleteSessionById(s.id, e)}
                        className="hidden group-hover:flex items-center justify-center h-5 w-5 rounded-md hover:bg-destructive/15 hover:text-destructive text-muted-foreground shrink-0 transition-colors"
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

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex flex-col h-full max-w-3xl mx-auto w-full p-4 md:p-6">

          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-4 shrink-0">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Chat</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {agenticMode ? "Agentic AI — searches, creates, and organizes your knowledge." : "Ask anything about your knowledge base."}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Agentic / Simple toggle */}
              <button
                onClick={toggleAgenticMode}
                title={agenticMode ? "Switch to Simple mode" : "Switch to Agentic mode"}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all",
                  agenticMode
                    ? "border-brand/50 bg-brand-muted text-brand hover:bg-brand/15"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {agenticMode ? <Brain className="h-3.5 w-3.5" /> : <ZapOff className="h-3.5 w-3.5" />}
                {agenticMode ? "Agentic" : "Simple"}
              </button>

              {/* Model settings */}
              <button
                onClick={() => { setDraft(settings); setShowSettings(true); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-colors",
                  isConfigured
                    ? "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                    : "border-brand/40 bg-brand-muted text-brand hover:bg-brand/15"
                )}
              >
                <Settings className="h-3.5 w-3.5" />
                <span className="max-w-[160px] truncate font-medium">{modelChip}</span>
              </button>
            </div>
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
                    <span className="leading-relaxed">No model configured. Click the model button above to add your API key.</span>
                  </div>
                )}
                <div className="flex flex-col items-center text-center pt-4">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 rounded-3xl bg-brand/20 blur-2xl" />
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-3xl border border-border bg-card shadow-lift">
                      {agenticMode ? <Brain className="h-6 w-6 text-brand" /> : <Sparkles className="h-6 w-6 text-brand" />}
                    </div>
                  </div>
                  <p className="font-display text-lg font-semibold">
                    {agenticMode ? "SecondBrain Agent" : "How can I help?"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {agenticMode
                      ? "I can search, create, organize, and link your knowledge autonomously."
                      : "Try one of these prompts."}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SUGGESTED.map((prompt, i) => (
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
                  className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "max-w-[88%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md whitespace-pre-wrap shadow-soft"
                        : "bg-card border border-border rounded-bl-md shadow-soft w-full"
                    )}
                  >
                    {renderBlocks(msg)}
                  </div>

                  {/* Cited item chips */}
                  {msg.role === "assistant" && msg.citedItemIds && msg.citedItemIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 max-w-[88%]">
                      {msg.citedItemIds.map((id) => (
                        <span
                          key={id}
                          className="flex items-center gap-1 rounded-full border border-brand/20 bg-brand-muted px-2 py-0.5 text-[10px] text-brand cursor-pointer hover:bg-brand/15 transition-colors"
                          title={`Item: ${id}`}
                        >
                          <FileText className="h-2.5 w-2.5" />
                          {id.slice(0, 8)}…
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Loading indicator (simple mode only) */}
            <AnimatePresence>
              {loading && !agenticMode && (
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
                          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={bottomRef} />
          </div>

          {/* Context chips */}
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
                  <motion.span key={item.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-1 rounded-full border border-brand/30 bg-brand-muted px-2.5 py-1 text-xs text-brand"
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="max-w-[160px] truncate">{item.title ?? item.ai_title ?? "Untitled"}</span>
                    <button onClick={() => setContextItems((prev) => prev.filter((i) => i.id !== item.id))} className="ml-0.5 rounded-full hover:text-destructive transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </motion.span>
                ))}
                <button onClick={() => setContextItems([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1">Clear all</button>
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

            <div className="relative flex-1">
              <input
                type="text"
                placeholder={
                  loading && agenticMode
                    ? "Agent is working…"
                    : isConfigured
                    ? agenticMode
                      ? "Ask the agent to search, create, organize…"
                      : "Ask anything…"
                    : "Configure a model to start…"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-soft outline-none transition-all placeholder:text-muted-foreground/70 focus:border-brand/40 focus:shadow-brand focus:ring-4 focus:ring-brand/10 disabled:opacity-60"
              />
              {agenticMode && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-muted-foreground/50 pointer-events-none">
                  <Brain className="h-3 w-3" /> Agent
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={cn(
                "flex items-center justify-center h-12 w-12 rounded-2xl bg-brand text-brand-foreground shadow-brand transition-all shrink-0 hover:scale-[1.04] active:scale-95",
                (loading || !input.trim()) && "opacity-50 cursor-not-allowed hover:scale-100"
              )}
            >
              {loading && agenticMode
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>

      {/* Settings modal */}
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
                <button onClick={() => setShowSettings(false)} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Provider</label>
                <select
                  value={draft.provider}
                  onChange={(e) => {
                    const provider = e.target.value as ModelProvider;
                    setDraft((d) => ({ ...d, provider, model: PROVIDER_MODELS[provider][0] ?? "" }));
                  }}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                >
                  {(Object.keys(PROVIDER_LABELS) as ModelProvider[]).map((p) => (
                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">API Key / Token</label>
                <input
                  type="password"
                  placeholder={
                    draft.provider === "github" ? "ghp_xxxx…"
                    : draft.provider === "anthropic" ? "sk-ant-xxxx…"
                    : draft.provider === "gemini" ? "AIza…"
                    : "sk-xxxx…"
                  }
                  value={draft.apiKey}
                  onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Stored only in your browser&rsquo;s localStorage.</p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                {PROVIDER_MODELS[draft.provider].length > 0 ? (
                  <select
                    value={draft.model}
                    onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                  >
                    {PROVIDER_MODELS[draft.provider].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. moonshotai/Kimi-K2, llama3, mistral-7b"
                    value={draft.model}
                    onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                  />
                )}
              </div>

              {draft.provider === "custom" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Base URL</label>
                  <input
                    type="text"
                    placeholder="https://api.moonshot.ai/v1"
                    value={draft.baseUrl}
                    onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-mono outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Any OpenAI-compatible endpoint works — Ollama, vLLM, LM Studio, Moonshot, etc.
                  </p>
                </div>
              )}

              {draft.provider === "github" && (
                <p className="text-xs text-muted-foreground rounded-xl bg-muted/60 p-3 leading-relaxed">
                  GitHub Models uses your personal access token (PAT). Generate one at GitHub → Settings → Developer settings → Personal access tokens.
                </p>
              )}

              {/* Agentic mode note */}
              <div className={cn(
                "rounded-xl p-3 text-xs leading-relaxed",
                agenticMode ? "bg-brand-muted text-brand" : "bg-muted text-muted-foreground"
              )}>
                <span className="font-semibold">{agenticMode ? "🤖 Agentic mode is ON" : "💬 Simple mode is ON"}</span>
                {agenticMode
                  ? " — The agent uses function calling. Works best with GPT-4o, Claude 3.5, Gemini 2.0 Flash, or any OpenAI-compatible model that supports tools."
                  : " — Standard one-shot chat proxy. Works with any model."}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowSettings(false)} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
                <button onClick={saveAndClose} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft hover:opacity-90 transition-opacity">Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File picker */}
      {showFilePicker && (
        <ItemPickerDialog
          open
          title="Add file as context"
          onPick={(item) => {
            setContextItems((prev) => prev.some((i) => i.id === item.id) ? prev : [...prev, item]);
            setShowFilePicker(false);
          }}
          onClose={() => setShowFilePicker(false)}
        />
      )}
    </div>
  );
}

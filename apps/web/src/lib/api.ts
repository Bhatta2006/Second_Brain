import { getAccessToken } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PREFIX = "/api/v1";

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${PREFIX}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "API error");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Multipart upload — does NOT set Content-Type so the browser adds the boundary. */
async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${PREFIX}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Upload failed");
  }
  return res.json();
}

/** Absolute URL for an item's stored binary (used by the file viewer). */
export function itemFileUrl(itemId: string): string {
  return `${API_URL}${PREFIX}/items/${itemId}/file`;
}

// ── Items ──────────────────────────────────────────────────────────────────

export type Item = {
  id: string;
  user_id: string;
  folder_id: string | null;
  folder: { id: string; name: string; emoji?: string; color?: string } | null;
  title: string | null;
  content_type: string;
  source_url: string | null;
  storage_key: string | null;
  file_size: number | null;
  mime_type: string | null;
  summary: string | null;
  ai_title: string | null;
  tags: string[];
  entities: {
    people?: string[];
    places?: string[];
    organisations?: string[];
    concepts?: string[];
  } | null;
  confidence: number | null;
  needs_review: boolean;
  is_starred: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
};

export type ItemListResponse = {
  total: number;
  page: number;
  page_size: number;
  results: Item[];
};

export const itemsApi = {
  list: (params?: {
    folder_id?: string;
    content_type?: string;
    is_starred?: boolean;
    needs_review?: boolean;
    page?: number;
    page_size?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.folder_id) q.set("folder_id", params.folder_id);
    if (params?.content_type) q.set("content_type", params.content_type);
    if (params?.is_starred != null) q.set("is_starred", String(params.is_starred));
    if (params?.needs_review != null) q.set("needs_review", String(params.needs_review));
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    return apiFetch<ItemListResponse>(`/items?${q}`);
  },
  get: (id: string) => apiFetch<Item>(`/items/${id}`),
  ingest: (payload: {
    type: "file" | "url" | "text";
    url?: string;
    text?: string;
    file_key?: string;
    hint_folder_id?: string;
    metadata?: Record<string, unknown>;
  }) => apiFetch<{ item_id: string; status: string }>("/items/ingest", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  upload: (
    file: File,
    folderId?: string | null,
    titleOverride?: string,
    tagsOverride?: string[],
    aiOrganise?: boolean
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    if (folderId) fd.append("folder_id", folderId);
    if (titleOverride) fd.append("title_override", titleOverride);
    if (tagsOverride?.length) fd.append("tags_override", JSON.stringify(tagsOverride));
    if (aiOrganise) fd.append("ai_organise", "true");
    return apiUpload<{ item_id: string; status: string }>("/items/upload", fd);
  },
  update: (
    id: string,
    data: Partial<{ title: string; folder_id: string | null; tags: string[]; is_starred: boolean }>
  ) => apiFetch<Item>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  // Move is just an update of folder_id. null = uncategorised (root).
  move: (id: string, folderId: string | null) =>
    apiFetch<Item>(`/items/${id}`, { method: "PATCH", body: JSON.stringify({ folder_id: folderId }) }),
  copy: (id: string, folderId: string | null) => {
    const q = folderId ? `?folder_id=${folderId}` : "";
    return apiFetch<Item>(`/items/${id}/copy${q}`, { method: "POST" });
  },
  link: (sourceId: string, targetId: string) =>
    apiFetch<{ status: string }>(`/items/${sourceId}/link?target_id=${targetId}`, { method: "POST" }),
  unlink: (sourceId: string, targetId: string) =>
    apiFetch<void>(`/items/${sourceId}/link/${targetId}`, { method: "DELETE" }),
  links: (id: string) => apiFetch<Item[]>(`/items/${id}/links`),
  similar: (id: string, limit = 8) => apiFetch<ItemListResponse>(`/items/${id}/similar?limit=${limit}`),
  backlinks: (id: string) => apiFetch<ItemListResponse>(`/items/${id}/backlinks`),
  delete: (id: string) => apiFetch<void>(`/items/${id}`, { method: "DELETE" }),
};

// ── Folders ────────────────────────────────────────────────────────────────

export type Folder = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  emoji: string | null;
  color: string | null;
  is_smart: boolean;
  ai_generated: boolean;
  depth: number;
  item_count: number;
  created_at: string;
  children: Folder[];
};

export const foldersApi = {
  tree: () => apiFetch<Folder[]>("/folders"),
  create: (data: {
    name: string;
    parent_id?: string;
    emoji?: string;
    color?: string;
    is_smart?: boolean;
    smart_filter?: {
      content_type?: string;
      tags?: string[];
      is_starred?: boolean;
      date_from?: string;
      date_to?: string;
    };
  }) => apiFetch<Folder>("/folders", { method: "POST", body: JSON.stringify(data) }),
  update: (
    id: string,
    data: Partial<{ name: string; emoji: string; color: string; parent_id: string | null }>
  ) => apiFetch<Folder>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  move: (id: string, parentId: string | null) =>
    apiFetch<Folder>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify({ parent_id: parentId }) }),
  delete: (id: string) => apiFetch<void>(`/folders/${id}`, { method: "DELETE" }),
  items: (id: string, page = 1) => apiFetch<ItemListResponse>(`/folders/${id}/items?page=${page}`),
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const exportApi = {
  json: async () => {
    const token = await getAccessToken();
    const res = await fetch(`${API_BASE}/api/v1/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `secondbrain_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
  zip: async () => {
    const token = await getAccessToken();
    const res = await fetch(`${API_BASE}/api/v1/export/zip`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `secondbrain_export_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ── Search ─────────────────────────────────────────────────────────────────

export type SearchResponse = {
  total: number;
  page: number;
  results: Array<{
    id: string;
    title: string | null;
    summary: string | null;
    content_type: string;
    folder: { id: string; name: string } | null;
    tags: string[];
    score: number;
    created_at: string;
  }>;
};

export const searchApi = {
  search: (q: string, params?: {
    content_type?: string;
    folder_id?: string;
    tags?: string[];
    date_from?: string;
    date_to?: string;
    is_starred?: boolean;
    page?: number;
  }) => {
    const qs = new URLSearchParams({ q });
    if (params?.content_type) qs.set("content_type", params.content_type);
    if (params?.folder_id) qs.set("folder_id", params.folder_id);
    if (params?.tags) params.tags.forEach((t) => qs.append("tags", t));
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.is_starred != null) qs.set("is_starred", String(params.is_starred));
    if (params?.page) qs.set("page", String(params.page));
    return apiFetch<SearchResponse>(`/search?${qs}`);
  },
  semantic: (payload: {
    query: string;
    content_type?: string;
    folder_id?: string;
    tags?: string[];
    limit?: number;
  }) => apiFetch<SearchResponse>("/search/semantic", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
};

// ── Graph ──────────────────────────────────────────────────────────────────

export type GraphResponse = {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    folder: string | null;
    folder_id: string | null;
    tags: string[];
    view_count: number;
    is_starred: boolean;
    thumbnail_url?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
    weight: number;
  }>;
  meta: {
    total_nodes: number;
    total_edges: number;
    truncated: boolean;
    min_weight: number;
  };
};

export const graphApi = {
  get: (params?: { item_id?: string; depth?: number; min_weight?: number }) => {
    const qs = new URLSearchParams();
    if (params?.item_id) qs.set("item_id", params.item_id);
    if (params?.depth) qs.set("depth", String(params.depth));
    if (params?.min_weight) qs.set("min_weight", String(params.min_weight));
    return apiFetch<GraphResponse>(`/graph?${qs}`);
  },
};

// ── Settings ─────────────────────────────────────────────────────────────────

export type EmbeddingConfig = {
  provider: string;
  model: string;
  dimensions: number;
  base_url: string | null;
};

export const settingsApi = {
  getEmbedding: () => apiFetch<EmbeddingConfig>("/settings/embedding"),
  reembed: () =>
    apiFetch<{ task_id: string; status: string }>("/settings/embedding/reembed", {
      method: "POST",
    }),
};

// ── Chat Sessions ──────────────────────────────────────────────────────────────

export type ChatSessionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export type ContextItemStub = {
  id: string;
  title: string | null;
  ai_title: string | null;
};

export type ChatSessionData = {
  id: string;
  title: string | null;
  messages: ChatSessionMessage[];
  context_item_stubs: ContextItemStub[];
  created_at: string;
  updated_at: string;
};

export const chatSessionsApi = {
  list: () => apiFetch<ChatSessionData[]>("/chat/sessions"),
  upsert: (
    id: string,
    data: {
      title?: string | null;
      messages: Array<{ role: string; content: string }>;
      context_item_stubs?: ContextItemStub[];
    }
  ) =>
    apiFetch<ChatSessionData>(`/chat/sessions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/chat/sessions/${id}`, { method: "DELETE" }),
};

// ── Agent (Agentic AI) ─────────────────────────────────────────────────────

export type AgentEventType =
  | "status"
  | "tool_call"
  | "tool_result"
  | "question"
  | "delete_confirm"
  | "delta"
  | "answer"
  | "error"
  | "done";

export type AgentToolCallEvent = {
  type: "tool_call";
  tool: string;
  args: Record<string, unknown>;
};

export type AgentToolResultEvent = {
  type: "tool_result";
  result: Record<string, unknown>;
  summary: string;
};

export type AgentQuestionEvent = {
  type: "question";
  question: string;
  options: string[];
  context: string;
};

export type AgentDeleteConfirmEvent = {
  type: "delete_confirm";
  items: Array<{ id: string; title: string; content_type: string; created_at: string }>;
  folders: Array<{ id: string; name: string }>;
  reason: string;
  delete_token: string;
};

export type AgentDeltaEvent = {
  type: "delta";
  text: string;
};

export type AgentAnswerEvent = {
  type: "answer";
  content: string;
  cited_item_ids: string[];
};

export type AgentErrorEvent = {
  type: "error";
  message: string;
};

export type AgentStatusEvent = {
  type: "status";
  message: string;
};

export type AgentEvent =
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentQuestionEvent
  | AgentDeleteConfirmEvent
  | AgentDeltaEvent
  | AgentAnswerEvent
  | AgentErrorEvent
  | AgentStatusEvent
  | { type: "done" };

export type AgentChatRequest = {
  provider: "github" | "openai" | "anthropic" | "gemini" | "custom";
  api_key: string;
  model: string;
  base_url?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context_item_ids?: string[];
  session_id?: string;
};

/**
 * Stream agent events from POST /api/v1/agent.
 * Returns an async generator that yields typed AgentEvent objects.
 * The caller is responsible for breaking out of the loop on "done" or "error".
 */
export async function* streamAgentChat(
  payload: AgentChatRequest
): AsyncGenerator<AgentEvent> {
  const token = await getAccessToken();

  const res = await fetch(`${API_URL}/api/v1/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as Record<string, string>)?.detail ?? `Agent API error ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const rawData = line.slice(6).trim();
        try {
          const parsed = JSON.parse(rawData);
          yield { type: currentEvent, ...parsed } as AgentEvent;
        } catch {
          // malformed JSON — skip
        }
        currentEvent = "";
      }
    }
  }
}

/** Confirm a delete after the user typed "DELETE" in the UI. */
export const agentApi = {
  confirmDelete: (delete_token: string) =>
    apiFetch<{ success: boolean; deleted_items: number; deleted_folders: number; message: string }>(
      "/agent/confirm-delete",
      { method: "POST", body: JSON.stringify({ delete_token }) }
    ),
};


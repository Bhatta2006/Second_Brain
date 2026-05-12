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

// ── Items ──────────────────────────────────────────────────────────────────

export type Item = {
  id: string;
  user_id: string;
  folder_id: string | null;
  folder: { id: string; name: string; emoji?: string; color?: string } | null;
  title: string | null;
  content_type: string;
  source_url: string | null;
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
  update: (id: string, data: Partial<{ title: string; folder_id: string; tags: string[]; is_starred: boolean }>) =>
    apiFetch<Item>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
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
  create: (data: { name: string; parent_id?: string; emoji?: string; color?: string }) =>
    apiFetch<Folder>("/folders", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; emoji: string; color: string }>) =>
    apiFetch<Folder>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<void>(`/folders/${id}`, { method: "DELETE" }),
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
  search: (q: string, params?: { content_type?: string; folder_id?: string; tags?: string[]; page?: number }) => {
    const qs = new URLSearchParams({ q });
    if (params?.content_type) qs.set("content_type", params.content_type);
    if (params?.folder_id) qs.set("folder_id", params.folder_id);
    if (params?.tags) params.tags.forEach((t) => qs.append("tags", t));
    if (params?.page) qs.set("page", String(params.page));
    return apiFetch<SearchResponse>(`/search?${qs}`);
  },
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

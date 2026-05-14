import { create } from "zustand";
import { persist } from "zustand/middleware";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PREFIX = "/api/v1/llm/github";

export type AuthMode = "oauth" | "api-key";
export type ConnectionStatus =
  | "disconnected"
  | "pending"
  | "connected"
  | "expired";

export type LLMModel = { id: string; name: string };

type LLMStore = {
  authMode: AuthMode;
  status: ConnectionStatus;
  models: LLMModel[];
  selectedModel: string | null;
  apiKey: string;
  deviceCode: { user_code: string; verification_uri: string } | null;
  pollingTimer: ReturnType<typeof setInterval> | null;

  setAuthMode: (mode: AuthMode) => void;
  setApiKey: (key: string) => void;
  setSelectedModel: (id: string) => void;

  // OAuth flow
  startOAuth: () => Promise<void>;
  pollStatus: () => Promise<void>;
  disconnect: () => Promise<void>;

  // API-key flow
  fetchModelsWithKey: () => Promise<void>;

  // Shared
  fetchModels: () => Promise<void>;
  stopPolling: () => void;
};

function _dedup(models: LLMModel[]): LLMModel[] {
  const seen = new Set<string>();
  return models.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return fetch(`${API_URL}${PREFIX}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? "API error");
    }
    return res.json() as Promise<T>;
  });
}

export const useLLMStore = create<LLMStore>()(
  persist(
    (set, get) => ({
      authMode: "oauth",
      status: "disconnected",
      models: [],
      selectedModel: null,
      apiKey: "",
      deviceCode: null,
      pollingTimer: null,

      setAuthMode: (mode) => set({ authMode: mode }),
      setApiKey: (key) => set({ apiKey: key }),
      setSelectedModel: (id) => set({ selectedModel: id }),

      stopPolling: () => {
        const timer = get().pollingTimer;
        if (timer) clearInterval(timer);
        set({ pollingTimer: null });
      },

      startOAuth: async () => {
        get().stopPolling();
        const data = await apiFetch<{
          user_code: string;
          verification_uri: string;
          expires_in: number;
        }>("/connect", { method: "POST" });
        set({ deviceCode: data, status: "pending" });

        // Poll every 5s
        const timer = setInterval(async () => {
          await get().pollStatus();
        }, 5000);
        set({ pollingTimer: timer });
      },

      pollStatus: async () => {
        const data = await apiFetch<{ status: ConnectionStatus }>("/status");
        set({ status: data.status });
        if (data.status === "connected") {
          get().stopPolling();
          set({ deviceCode: null });
          await get().fetchModels();
        } else if (data.status === "expired") {
          get().stopPolling();
          set({ deviceCode: null });
        }
      },

      disconnect: async () => {
        get().stopPolling();
        await apiFetch("/disconnect", { method: "POST" });
        set({
          status: "disconnected",
          models: [],
          selectedModel: null,
          deviceCode: null,
        });
      },

      fetchModels: async () => {
        const data = await apiFetch<{ models: LLMModel[] }>("/models");
        const models = _dedup(data.models);
        set({
          models,
          selectedModel: get().selectedModel ?? models[0]?.id ?? null,
        });
      },

      fetchModelsWithKey: async () => {
        const { apiKey } = get();
        if (!apiKey.trim()) throw new Error("No API key provided");
        const data = await apiFetch<{ models: LLMModel[] }>("/api-key/models", {
          method: "POST",
          body: JSON.stringify({ api_key: apiKey }),
        });
        const models = _dedup(data.models);
        set({
          models,
          selectedModel: get().selectedModel ?? models[0]?.id ?? null,
          status: "connected",
        });
      },
    }),
    {
      name: "llm-store",
      partialize: (s) => ({
        authMode: s.authMode,
        apiKey: s.apiKey,
        selectedModel: s.selectedModel,
        status: s.status,
        models: _dedup(s.models),
      }),
    },
  ),
);

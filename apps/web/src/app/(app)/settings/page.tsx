"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Cpu, Server, Ruler, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { settingsApi } from "@/lib/api";
import { FadeUp } from "@/components/ui/motion";

export default function SettingsPage() {
  const { data: embedding, isLoading } = useQuery({
    queryKey: ["settings", "embedding"],
    queryFn: () => settingsApi.getEmbedding(),
  });

  const [reembedState, setReembedState] = useState<
    "idle" | "running" | "started" | "error"
  >("idle");
  const [message, setMessage] = useState<string>("");

  async function handleReembed() {
    setReembedState("running");
    setMessage("");
    try {
      await settingsApi.reembed();
      setReembedState("started");
      setMessage(
        "Re-embedding started in the background. Search and graph will improve as items are processed — this can take a few minutes."
      );
    } catch (err: unknown) {
      setReembedState("error");
      setMessage(err instanceof Error ? err.message : "Failed to start re-embedding");
    }
  }

  return (
    <div className="relative h-full overflow-auto">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-64 opacity-[0.5] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <div className="relative mx-auto w-full max-w-3xl p-6 space-y-8">
        {/* Header */}
        <FadeUp>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" /> SETTINGS
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure how SecondBrain processes your knowledge.
          </p>
        </FadeUp>

        {/* Embedding model card */}
        <FadeUp>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold">Embedding model</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Powers semantic search and the knowledge graph. Configured app-wide
                  via environment variables.
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-muted text-brand">
                <Cpu className="h-5 w-5" />
              </span>
            </div>

            {isLoading ? (
              <div className="mt-5 h-24 animate-pulse rounded-xl bg-muted" />
            ) : embedding ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <InfoTile icon={Server} label="Provider" value={embedding.provider} />
                <InfoTile icon={Cpu} label="Model" value={embedding.model} mono />
                <InfoTile
                  icon={Ruler}
                  label="Dimensions"
                  value={String(embedding.dimensions)}
                />
                {embedding.base_url && (
                  <div className="sm:col-span-3">
                    <InfoTile
                      icon={Server}
                      label="Endpoint"
                      value={embedding.base_url}
                      mono
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-5 text-sm text-destructive">Could not load embedding config.</p>
            )}

            {/* Re-embed */}
            <div className="mt-6 rounded-xl border border-border bg-background/50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold">Re-embed all items</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Run after switching the embedding model so existing items match the
                    new model. Required for search to work after a model change.
                  </p>
                </div>
                <button
                  onClick={handleReembed}
                  disabled={reembedState === "running"}
                  className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${reembedState === "running" ? "animate-spin" : ""}`}
                  />
                  {reembedState === "running" ? "Starting…" : "Re-embed"}
                </button>
              </div>

              {message && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                    reembedState === "error"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-brand-muted text-brand"
                  }`}
                >
                  {reembedState === "error" ? (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  )}
                  <span>{message}</span>
                </motion.div>
              )}
            </div>
          </div>
        </FadeUp>
      </div>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 truncate text-sm font-medium ${mono ? "font-mono text-xs" : ""}`} title={value}>
        {value}
      </div>
    </div>
  );
}

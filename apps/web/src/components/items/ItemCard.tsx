"use client";

import {
  Star, FileText, Globe, Image as ImageIcon, Volume2, Video,
  File, Sparkles, AlertCircle, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/api";

type ContentConfig = {
  icon: React.ElementType;
  /** raw lucide icon color — allowed per design system */
  icon_color: string;
};

const CONTENT_CONFIG: Record<string, ContentConfig> = {
  url:   { icon: Globe,      icon_color: "text-blue-500" },
  pdf:   { icon: FileText,   icon_color: "text-red-500" },
  image: { icon: ImageIcon,  icon_color: "text-violet-500" },
  audio: { icon: Volume2,    icon_color: "text-pink-500" },
  video: { icon: Video,      icon_color: "text-orange-500" },
  text:  { icon: ScrollText, icon_color: "text-emerald-500" },
  doc:   { icon: File,       icon_color: "text-sky-500" },
};

const DEFAULT_CONFIG: ContentConfig = {
  icon: File,
  icon_color: "text-muted-foreground",
};

type Props = {
  item: Item;
  onClick?: (item: Item) => void;
  onStar?: (item: Item) => void;
};

function confidenceColor(c: number | null) {
  if (c == null) return "bg-muted-foreground/40";
  if (c >= 0.8) return "bg-success";
  if (c >= 0.5) return "bg-warning";
  return "bg-destructive";
}

export function ItemCard({ item, onClick, onStar }: Props) {
  const config = CONTENT_CONFIG[item.content_type] ?? DEFAULT_CONFIG;
  const Icon = config.icon;
  const usingAiTitle = !item.title && !!item.ai_title;
  const displayTitle = item.title ?? item.ai_title ?? item.source_url ?? "Untitled";
  const isProcessing = !item.ai_title && !item.summary;

  return (
    <div
      className="group relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border border-border bg-card p-4 cursor-pointer
        shadow-soft transition-all duration-300 ease-out
        hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift
        focus-within:border-brand/40"
      onClick={() => onClick?.(item)}
    >
      {/* subtle brand wash that blooms on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/[0.04] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      {/* AI-processing shimmer overlay */}
      {isProcessing && (
        <div
          aria-hidden
          className="animate-shimmer pointer-events-none absolute inset-0 opacity-60"
        />
      )}

      <div className="relative flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60",
              "transition-transform duration-300 group-hover:scale-105"
            )}
          >
            <Icon className={cn(config.icon_color)} style={{ height: "1.1rem", width: "1.1rem" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium leading-tight">{displayTitle}</p>
              {usingAiTitle && (
                <Sparkles className="h-3 w-3 text-brand shrink-0" aria-label="AI-generated title" />
              )}
            </div>
            <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground mt-0.5">
              {item.content_type}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {item.confidence != null && (
            <span
              className={cn("h-2 w-2 rounded-full ring-2 ring-card transition-opacity", confidenceColor(item.confidence))}
              title={`AI confidence ${(item.confidence * 100).toFixed(0)}%`}
            />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onStar?.(item); }}
            className={cn(
              "p-1.5 rounded-lg transition-all duration-200",
              item.is_starred
                ? "text-warning"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-warning hover:bg-muted"
            )}
          >
            <Star
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110"
              fill={item.is_starred ? "currentColor" : "none"}
            />
          </button>
        </div>
      </div>

      {item.summary && (
        <p className="relative line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
      )}

      {isProcessing && (
        <div className="relative flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 rounded-full bg-brand animate-bounce"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </span>
          <span className="italic">AI is processing…</span>
        </div>
      )}

      <div className="relative flex items-center gap-1 flex-wrap">
        {item.folder && (
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {item.folder.emoji} {item.folder.name}
          </span>
        )}
        {item.needs_review && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
            <AlertCircle className="h-3 w-3" />
            Review
          </span>
        )}
        {item.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground"
          >
            #{tag}
          </span>
        ))}
        {item.tags.length > 3 && (
          <span className="text-[11px] text-muted-foreground">+{item.tags.length - 3}</span>
        )}
      </div>

      <p className="relative text-[11px] text-muted-foreground/70">
        {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
      </p>
    </div>
  );
}

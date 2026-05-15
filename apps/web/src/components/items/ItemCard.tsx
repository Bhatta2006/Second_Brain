"use client";

import {
  Star, FileText, Globe, Image as ImageIcon, Volume2, Video,
  File, Sparkles, AlertCircle, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/api";

type ContentConfig = {
  icon: React.ElementType;
  bg: string;
  text: string;
};

const CONTENT_CONFIG: Record<string, ContentConfig> = {
  url:   { icon: Globe,      bg: "bg-blue-100 dark:bg-blue-950",    text: "text-blue-600 dark:text-blue-400" },
  pdf:   { icon: FileText,   bg: "bg-red-100 dark:bg-red-950",      text: "text-red-600 dark:text-red-400" },
  image: { icon: ImageIcon,  bg: "bg-violet-100 dark:bg-violet-950",text: "text-violet-600 dark:text-violet-400" },
  audio: { icon: Volume2,    bg: "bg-pink-100 dark:bg-pink-950",    text: "text-pink-600 dark:text-pink-400" },
  video: { icon: Video,      bg: "bg-orange-100 dark:bg-orange-950",text: "text-orange-600 dark:text-orange-400" },
  text:  { icon: ScrollText, bg: "bg-emerald-100 dark:bg-emerald-950", text: "text-emerald-600 dark:text-emerald-400" },
  doc:   { icon: File,       bg: "bg-sky-100 dark:bg-sky-950",      text: "text-sky-600 dark:text-sky-400" },
};

const DEFAULT_CONFIG: ContentConfig = {
  icon: File,
  bg: "bg-muted",
  text: "text-muted-foreground",
};

type Props = {
  item: Item;
  onClick?: (item: Item) => void;
  onStar?: (item: Item) => void;
};

function confidenceColor(c: number | null) {
  if (c == null) return "bg-muted";
  if (c >= 0.8) return "bg-emerald-500";
  if (c >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

export function ItemCard({ item, onClick, onStar }: Props) {
  const config = CONTENT_CONFIG[item.content_type] ?? DEFAULT_CONFIG;
  const Icon = config.icon;
  const usingAiTitle = !item.title && !!item.ai_title;
  const displayTitle = item.title ?? item.ai_title ?? item.source_url ?? "Untitled";
  const isProcessing = !item.ai_title && !item.summary;

  return (
    <div
      className="group relative flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 cursor-pointer
        hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5
        transition-all duration-200 ease-out"
      onClick={() => onClick?.(item)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", config.bg)}>
            <Icon className={cn("h-4.5 w-4.5", config.text)} style={{ height: "1.1rem", width: "1.1rem" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium leading-tight">{displayTitle}</p>
              {usingAiTitle && (
                <Sparkles className="h-3 w-3 text-primary shrink-0" aria-label="AI-generated title" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">{item.content_type}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {item.confidence != null && (
            <span
              className={cn("h-2 w-2 rounded-full transition-opacity", confidenceColor(item.confidence))}
              title={`AI confidence ${(item.confidence * 100).toFixed(0)}%`}
            />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onStar?.(item); }}
            className={cn(
              "p-1.5 rounded-md transition-all duration-150",
              item.is_starred
                ? "text-yellow-500"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-500"
            )}
          >
            <Star
              className="h-3.5 w-3.5 transition-transform duration-150 group-hover:scale-110"
              fill={item.is_starred ? "currentColor" : "none"}
            />
          </button>
        </div>
      </div>

      {item.summary && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
      )}

      {isProcessing && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </span>
          <span className="italic">AI is processing…</span>
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        {item.folder && (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {item.folder.emoji} {item.folder.name}
          </span>
        )}
        {item.needs_review && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" />
            Review
          </span>
        )}
        {item.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
          >
            #{tag}
          </span>
        ))}
        {item.tags.length > 3 && (
          <span className="text-[11px] text-muted-foreground">+{item.tags.length - 3}</span>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
      </p>
    </div>
  );
}

"use client";

import {
  Star, FileText, Link, Image as ImageIcon, Volume2, Video, File, Sparkles, AlertCircle, Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/api";

const CONTENT_TYPE_ICONS: Record<string, React.ElementType> = {
  url: Link,
  pdf: FileText,
  image: ImageIcon,
  audio: Volume2,
  video: Video,
  text: FileText,
  doc: File,
};

type Props = {
  item: Item;
  onClick?: (item: Item) => void;
  onStar?: (item: Item) => void;
  onDelete?: (item: Item) => void;
};

function confidenceColor(c: number | null) {
  if (c == null) return "bg-muted";
  if (c >= 0.8) return "bg-emerald-500";
  if (c >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

export function ItemCard({ item, onClick, onStar, onDelete }: Props) {
  const Icon = CONTENT_TYPE_ICONS[item.content_type] ?? File;
  const usingAiTitle = !item.title && !!item.ai_title;
  const displayTitle = item.title ?? item.ai_title ?? item.source_url ?? "Untitled";
  const isProcessing = !item.ai_title && !item.summary;

  return (
    <div
      className="group relative flex flex-col gap-2 rounded-lg border border-border bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
      onClick={() => onClick?.(item)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium leading-tight">{displayTitle}</p>
              {usingAiTitle && (
                <Sparkles className="h-3 w-3 text-primary shrink-0" aria-label="AI-generated title" />
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {item.confidence != null && (
            <span
              className={cn("h-2 w-2 rounded-full", confidenceColor(item.confidence))}
              title={`AI confidence ${(item.confidence * 100).toFixed(0)}%`}
            />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStar?.(item);
            }}
            className={cn(
              "p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity",
              item.is_starred && "opacity-100 text-yellow-500"
            )}
          >
            <Star className="h-4 w-4" fill={item.is_starred ? "currentColor" : "none"} />
          </button>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
              title="Delete item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {item.summary && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{item.summary}</p>
      )}

      {isProcessing && (
        <p className="text-xs text-muted-foreground italic flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          AI is processing this item…
        </p>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        {item.folder && (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {item.folder.emoji} {item.folder.name}
          </span>
        )}
        {item.needs_review && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
            <AlertCircle className="h-3 w-3" />
            Review
          </span>
        )}
        {item.tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
          >
            #{tag}
          </span>
        ))}
        {item.tags.length > 4 && (
          <span className="text-xs text-muted-foreground">+{item.tags.length - 4}</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {new Date(item.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}

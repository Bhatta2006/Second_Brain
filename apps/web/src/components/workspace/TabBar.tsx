"use client";

import { X, Plus, FileText, Link as LinkIcon, Image as ImageIcon, FileQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/api";

export type WorkspaceTab = {
  /** Stable tab id. For an item tab this is the item id; for a blank tab a uuid. */
  key: string;
  item: Item | null; // null = an empty "new tab" placeholder
};

const TYPE_ICON: Record<string, React.ElementType> = {
  url: LinkIcon,
  image: ImageIcon,
  pdf: FileText,
  text: FileText,
  doc: FileText,
  audio: FileText,
  video: FileText,
};

type Props = {
  tabs: WorkspaceTab[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onNewTab: () => void;
};

export function TabBar({ tabs, activeKey, onSelect, onClose, onNewTab }: Props) {
  return (
    <div className="flex items-stretch border-b border-border bg-card overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        const Icon = tab.item ? TYPE_ICON[tab.item.content_type] ?? FileQuestion : Plus;
        const label = tab.item
          ? tab.item.title ?? tab.item.ai_title ?? tab.item.source_url ?? "Untitled"
          : "New tab";
        return (
          <div
            key={tab.key}
            onClick={() => onSelect(tab.key)}
            className={cn(
              "group flex items-center gap-1.5 border-r border-border px-3 py-2 text-xs cursor-pointer max-w-[200px] shrink-0 transition-colors",
              active
                ? "bg-background font-medium"
                : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.key);
              }}
              className={cn(
                "ml-0.5 rounded p-0.5 shrink-0 transition-opacity",
                active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <button
        onClick={onNewTab}
        title="New tab"
        className="flex items-center px-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

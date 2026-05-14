"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, FolderIcon, Check } from "lucide-react";
import { type Folder } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

type FolderPickerProps = {
  folders: Folder[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  placeholder?: string;
  className?: string;
};

function flattenFolders(folders: Folder[], depth = 0): Array<Folder & { depth: number }> {
  const result: Array<Folder & { depth: number }> = [];
  for (const folder of folders) {
    result.push({ ...folder, depth });
    if (folder.children.length > 0) {
      result.push(...flattenFolders(folder.children, depth + 1));
    }
  }
  return result;
}

export function FolderPicker({
  folders,
  selectedId,
  onSelect,
  placeholder = "Select folder...",
  className,
}: FolderPickerProps) {
  const [open, setOpen] = useState(false);

  const flatFolders = flattenFolders(folders);
  const selectedFolder = flatFolders.find((f) => f.id === selectedId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {selectedFolder ? (
              <>
                <span>{selectedFolder.emoji ?? "📁"}</span>
                <span className="truncate">{selectedFolder.name}</span>
              </>
            ) : (
              <>
                <FolderIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{placeholder}</span>
              </>
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <ScrollArea className="h-64">
          <div className="py-1">
            {/* None option */}
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <FolderIcon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left text-muted-foreground">No folder</span>
              {selectedId === null && <Check className="h-4 w-4 text-primary" />}
            </button>

            {/* Folder options */}
            {flatFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => {
                  onSelect(folder.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                style={{ paddingLeft: `${12 + folder.depth * 16}px` }}
              >
                <span>{folder.emoji ?? "📁"}</span>
                <span className="flex-1 text-left truncate">{folder.name}</span>
                {selectedId === folder.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

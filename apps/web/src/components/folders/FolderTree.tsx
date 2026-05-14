"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, FolderIcon, FolderPlus, Edit2, Trash2, MoreVertical } from "lucide-react";
import { type Folder } from "@/lib/api";
import { cn } from "@/lib/utils";

type FolderTreeProps = {
  folders: Folder[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreateFolder?: (parentId?: string) => void;
  onEditFolder?: (folder: Folder) => void;
  onDeleteFolder?: (folder: Folder) => void;
  showActions?: boolean;
  compact?: boolean;
};

type FolderNodeProps = {
  folder: Folder;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateFolder?: (parentId: string) => void;
  onEditFolder?: (folder: Folder) => void;
  onDeleteFolder?: (folder: Folder) => void;
  showActions?: boolean;
  compact?: boolean;
};

function FolderNode({
  folder,
  selectedId,
  onSelect,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  showActions = false,
  compact = false,
}: FolderNodeProps) {
  const [open, setOpen] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const hasChildren = folder.children.length > 0;
  const isSelected = selectedId === folder.id;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-md transition-colors relative",
          isSelected
            ? "bg-accent font-medium"
            : "hover:bg-muted text-muted-foreground"
        )}
        style={{ paddingLeft: `${compact ? 4 : 8 + folder.depth * 16}px` }}
      >
        <button
          onClick={() => {
            onSelect(folder.id);
            if (hasChildren) setOpen(!open);
          }}
          className="flex-1 flex items-center gap-1.5 px-2 py-1.5 text-sm min-w-0"
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span className="shrink-0">{folder.emoji ?? "📁"}</span>
          <span className="flex-1 text-left truncate">{folder.name}</span>
          {!compact && (
            <span className="text-xs opacity-50 shrink-0">{folder.item_count}</span>
          )}
        </button>

        {showActions && (
          <div className="relative shrink-0 pr-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-3 w-3" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-md shadow-lg z-20 py-1">
                  {folder.depth < 2 && onCreateFolder && (
                    <button
                      onClick={() => {
                        onCreateFolder(folder.id);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left"
                    >
                      <FolderPlus className="h-3 w-3" />
                      New subfolder
                    </button>
                  )}
                  {onEditFolder && (
                    <button
                      onClick={() => {
                        onEditFolder(folder);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left"
                    >
                      <Edit2 className="h-3 w-3" />
                      Rename
                    </button>
                  )}
                  {onDeleteFolder && (
                    <button
                      onClick={() => {
                        onDeleteFolder(folder);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {open && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreateFolder={onCreateFolder}
              onEditFolder={onEditFolder}
              onDeleteFolder={onDeleteFolder}
              showActions={showActions}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  folders,
  selectedId,
  onSelect,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  showActions = false,
  compact = false,
}: FolderTreeProps) {
  return (
    <div className="space-y-0.5">
      {/* All Items option */}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          selectedId === null
            ? "bg-accent font-medium"
            : "hover:bg-muted text-muted-foreground"
        )}
      >
        <FolderIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">All Items</span>
      </button>

      {/* Folder tree */}
      {folders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreateFolder={onCreateFolder}
          onEditFolder={onEditFolder}
          onDeleteFolder={onDeleteFolder}
          showActions={showActions}
          compact={compact}
        />
      ))}

      {/* Create root folder button */}
      {showActions && onCreateFolder && (
        <button
          onClick={() => onCreateFolder()}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mt-2"
        >
          <FolderPlus className="h-4 w-4" />
          <span>New Folder</span>
        </button>
      )}
    </div>
  );
}

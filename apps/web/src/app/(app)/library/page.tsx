"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight, ChevronDown, FolderPlus, Pencil, Trash2,
  FolderInput, Copy, Star, MoveRight, Link as LinkIcon,
  FileText, Link2, Image as ImageIcon, FileQuestion,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { itemsApi, foldersApi, type Item, type Folder } from "@/lib/api";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { FolderPickerDialog } from "@/components/folders/FolderPickerDialog";
import { ItemPickerDialog } from "@/components/items/ItemPickerDialog";
import { FileContent } from "@/components/items/FileContent";
import { TabBar, type WorkspaceTab } from "@/components/workspace/TabBar";
import { FadeUp, EASE_OUT } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

type CtxMenu =
  | { kind: "folder"; folder: Folder; x: number; y: number }
  | { kind: "item"; item: Item; x: number; y: number }
  | null;

type Picker =
  | { kind: "move-item"; item: Item }
  | { kind: "copy-item"; item: Item }
  | { kind: "move-folder"; folder: Folder }
  | null;

const ITEM_ICON: Record<string, React.ElementType> = {
  url: Link2,
  image: ImageIcon,
  pdf: FileText,
  text: FileText,
  doc: FileText,
  audio: FileText,
  video: FileText,
};

function itemLabel(it: Item): string {
  return it.title ?? it.ai_title ?? it.source_url ?? "Untitled";
}

// ── Tree rows ────────────────────────────────────────────────────────────────

function TreeItem({
  item,
  depth,
  active,
  onOpen,
  onContextMenu,
}: {
  item: Item;
  depth: number;
  active: boolean;
  onOpen: (it: Item) => void;
  onContextMenu: (e: React.MouseEvent, it: Item) => void;
}) {
  const Icon = ITEM_ICON[item.content_type] ?? FileQuestion;
  return (
    <button
      onClick={() => onOpen(item)}
      onContextMenu={(e) => onContextMenu(e, item)}
      className={cn(
        "group relative flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-sm transition-colors",
        active
          ? "bg-brand-muted font-medium text-brand"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
      style={{ paddingLeft: `${18 + depth * 14}px` }}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
      )}
      <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-brand" : "opacity-70")} />
      <span className="truncate text-left">{itemLabel(item)}</span>
      {item.is_starred && (
        <Star className="ml-auto h-3 w-3 shrink-0 text-brand" fill="currentColor" />
      )}
    </button>
  );
}

function TreeFolder({
  folder,
  depth,
  itemsByFolder,
  activeItemId,
  onOpenItem,
  onFolderContextMenu,
  onItemContextMenu,
  renamingId,
  renameValue,
  setRenameValue,
  commitRename,
  cancelRename,
}: {
  folder: Folder;
  depth: number;
  itemsByFolder: Map<string, Item[]>;
  activeItemId: string | null;
  onOpenItem: (it: Item) => void;
  onFolderContextMenu: (e: React.MouseEvent, f: Folder) => void;
  onItemContextMenu: (e: React.MouseEvent, it: Item) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
}) {
  const [open, setOpen] = useState(true);
  const folderItems = itemsByFolder.get(folder.id) ?? [];
  const hasContents = folder.children.length > 0 || folderItems.length > 0;
  const renaming = renamingId === folder.id;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  return (
    <div>
      <div
        onContextMenu={(e) => onFolderContextMenu(e, folder)}
        className="group flex w-full items-center gap-1 rounded-lg pr-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
        style={{ paddingLeft: `${4 + depth * 14}px` }}
      >
        <button
          onClick={() => setOpen(!open)}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground transition-transform hover:text-foreground"
        >
          {hasContents ? (
            open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="block w-3" />
          )}
        </button>
        <span className="shrink-0">{folder.emoji ?? "📁"}</span>
        {renaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-brand bg-background px-1.5 py-0.5 text-sm outline-none ring-2 ring-brand/30"
          />
        ) : (
          <button
            onClick={() => setOpen(!open)}
            className="min-w-0 flex-1 truncate py-1.5 text-left font-medium"
          >
            {folder.name}
          </button>
        )}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground opacity-70">
          {folder.item_count}
        </span>
      </div>

      {open && (
        <div>
          {folder.children.map((child) => (
            <TreeFolder
              key={child.id}
              folder={child}
              depth={depth + 1}
              itemsByFolder={itemsByFolder}
              activeItemId={activeItemId}
              onOpenItem={onOpenItem}
              onFolderContextMenu={onFolderContextMenu}
              onItemContextMenu={onItemContextMenu}
              renamingId={renamingId}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              commitRename={commitRename}
              cancelRename={cancelRename}
            />
          ))}
          {folderItems.map((it) => (
            <TreeItem
              key={it.id}
              item={it}
              depth={depth + 1}
              active={activeItemId === it.id}
              onOpen={onOpenItem}
              onContextMenu={onItemContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [linkingItem, setLinkingItem] = useState<Item | null>(null);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: folders } = useQuery({
    queryKey: ["folders"],
    queryFn: () => foldersApi.tree(),
  });

  const { data: allItems } = useQuery({
    queryKey: ["items", { page_size: 500 }],
    queryFn: () => itemsApi.list({ page_size: 500 }),
  });

  // Group items by folder id; null folder_id => uncategorised (root level).
  const itemsByFolder = new Map<string, Item[]>();
  const rootItems: Item[] = [];
  for (const it of allItems?.results ?? []) {
    if (it.folder_id) {
      const arr = itemsByFolder.get(it.folder_id) ?? [];
      arr.push(it);
      itemsByFolder.set(it.folder_id, arr);
    } else {
      rootItems.push(it);
    }
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["folders"] });
  }

  // ── tabs ───────────────────────────────────────────────────────────────────
  function openItem(item: Item) {
    // Already open? just focus it.
    const existing = tabs.find((t) => t.item?.id === item.id);
    if (existing) {
      setActiveKey(existing.key);
      return;
    }
    // If the active tab is blank, fill it instead of opening a new one.
    const activeTab = tabs.find((t) => t.key === activeKey);
    if (activeTab && activeTab.item === null) {
      setTabs((prev) =>
        prev.map((t) => (t.key === activeKey ? { ...t, item } : t))
      );
      return;
    }
    const key = item.id;
    setTabs((prev) => [...prev, { key, item }]);
    setActiveKey(key);
  }

  function newTab() {
    const key = `blank-${Date.now()}`;
    setTabs((prev) => [...prev, { key, item: null }]);
    setActiveKey(key);
  }

  function closeTab(key: string) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.key === key);
      const next = prev.filter((t) => t.key !== key);
      if (key === activeKey) {
        const neighbour = next[idx] ?? next[idx - 1] ?? null;
        setActiveKey(neighbour?.key ?? null);
      }
      return next;
    });
  }

  // ── folder operations ──────────────────────────────────────────────────────
  async function createFolder(parentId: string | null) {
    const created = await foldersApi.create({
      name: "New Folder",
      parent_id: parentId ?? undefined,
    });
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    setRenamingId(created.id);
    setRenameValue("New Folder");
  }

  async function commitRename() {
    if (renamingId && renameValue.trim()) {
      await foldersApi.update(renamingId, { name: renameValue.trim() });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    }
    setRenamingId(null);
    setRenameValue("");
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  async function deleteFolder(folder: Folder) {
    if (!confirm(`Delete folder "${folder.name}"? Items inside become uncategorised.`)) return;
    await foldersApi.delete(folder.id);
    refresh();
  }

  // ── item operations ────────────────────────────────────────────────────────
  async function handleStar(item: Item) {
    await itemsApi.update(item.id, { is_starred: !item.is_starred });
    queryClient.invalidateQueries({ queryKey: ["items"] });
  }

  async function deleteItem(item: Item) {
    if (!confirm(`Delete "${itemLabel(item)}"?`)) return;
    await itemsApi.delete(item.id);
    closeTab(item.id);
    refresh();
  }

  async function handlePick(folderId: string | null) {
    if (!picker) return;
    if (picker.kind === "move-item") {
      await itemsApi.move(picker.item.id, folderId);
    } else if (picker.kind === "copy-item") {
      await itemsApi.copy(picker.item.id, folderId);
    } else if (picker.kind === "move-folder") {
      await foldersApi.move(picker.folder.id, folderId);
    }
    setPicker(null);
    refresh();
  }

  async function handleLinkPick(target: Item) {
    if (!linkingItem) return;
    await itemsApi.link(linkingItem.id, target.id);
    setLinkingItem(null);
    queryClient.invalidateQueries({ queryKey: ["graph"] });
  }

  // ── context menus ──────────────────────────────────────────────────────────
  function folderMenuItems(folder: Folder): MenuItem[] {
    return [
      { label: "New subfolder", icon: FolderPlus, onClick: () => createFolder(folder.id) },
      {
        label: "Rename",
        icon: Pencil,
        onClick: () => {
          setRenamingId(folder.id);
          setRenameValue(folder.name);
        },
      },
      { label: "Move to…", icon: MoveRight, onClick: () => setPicker({ kind: "move-folder", folder }) },
      {
        label: "Delete",
        icon: Trash2,
        destructive: true,
        separatorBefore: true,
        onClick: () => deleteFolder(folder),
      },
    ];
  }

  function itemMenuItems(item: Item): MenuItem[] {
    return [
      { label: "Open in tab", icon: FileText, onClick: () => openItem(item) },
      { label: "Move to…", icon: FolderInput, onClick: () => setPicker({ kind: "move-item", item }) },
      { label: "Copy to…", icon: Copy, onClick: () => setPicker({ kind: "copy-item", item }) },
      { label: "Link to…", icon: LinkIcon, onClick: () => setLinkingItem(item) },
      {
        label: item.is_starred ? "Unstar" : "Star",
        icon: Star,
        onClick: () => handleStar(item),
      },
      {
        label: "Delete",
        icon: Trash2,
        destructive: true,
        separatorBefore: true,
        onClick: () => deleteItem(item),
      },
    ];
  }

  const activeTab = tabs.find((t) => t.key === activeKey) ?? null;
  // Keep open tabs in sync with the latest item data (titles change after AI).
  const activeItem =
    activeTab?.item != null
      ? allItems?.results.find((i) => i.id === activeTab.item!.id) ?? activeTab.item
      : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* File-tree sidebar */}
      <div className="w-64 shrink-0 overflow-y-auto border-r border-border bg-card p-2">
        <div className="mb-2 flex items-center justify-between px-2 py-1">
          <p className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Files
          </p>
          <button
            onClick={() => createFolder(null)}
            title="New folder"
            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-brand"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>

        <FadeUp className="space-y-0.5">
        {folders?.map((folder) => (
          <TreeFolder
            key={folder.id}
            folder={folder}
            depth={0}
            itemsByFolder={itemsByFolder}
            activeItemId={activeItem?.id ?? null}
            onOpenItem={openItem}
            onFolderContextMenu={(e, f) => {
              e.preventDefault();
              setCtxMenu({ kind: "folder", folder: f, x: e.clientX, y: e.clientY });
            }}
            onItemContextMenu={(e, it) => {
              e.preventDefault();
              setCtxMenu({ kind: "item", item: it, x: e.clientX, y: e.clientY });
            }}
            renamingId={renamingId}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            commitRename={commitRename}
            cancelRename={cancelRename}
          />
        ))}

        {/* Uncategorised items at root level */}
        {rootItems.map((it) => (
          <TreeItem
            key={it.id}
            item={it}
            depth={0}
            active={activeItem?.id === it.id}
            onOpen={openItem}
            onContextMenu={(e, item) => {
              e.preventDefault();
              setCtxMenu({ kind: "item", item, x: e.clientX, y: e.clientY });
            }}
          />
        ))}

        {folders?.length === 0 && rootItems.length === 0 && (
          <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
            No files yet. Save something from the Inbox, then organise it here.
          </p>
        )}
        </FadeUp>
      </div>

      {/* Tabbed workspace */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TabBar
          tabs={tabs}
          activeKey={activeKey}
          onSelect={setActiveKey}
          onClose={closeTab}
          onNewTab={newTab}
        />

        <div className="flex-1 overflow-auto bg-muted/20 bg-dots p-6">
          {!activeTab && (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="animate-fade-up text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-card shadow-soft">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-display text-lg font-semibold text-foreground">No tab open</p>
                <p className="mt-1 text-sm">Click a file in the sidebar, or press + for a new tab.</p>
              </div>
            </div>
          )}

          {activeTab && !activeItem && (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="animate-fade-up text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-card shadow-soft">
                  <FileQuestion className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-display text-lg font-semibold text-foreground">Empty tab</p>
                <p className="mt-1 text-sm">Pick a file from the sidebar to open it here.</p>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {activeItem && (
              <motion.div
                key={activeItem.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="mx-auto max-w-4xl"
              >
                <div className="mb-5 border-b border-border pb-4">
                  <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
                    {itemLabel(activeItem)}
                  </h1>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono uppercase tracking-wide">
                      {activeItem.content_type}
                    </span>
                    {activeItem.folder && (
                      <span className="truncate">📁 {activeItem.folder.name}</span>
                    )}
                  </p>
                </div>
                <FileContent item={activeItem} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={
            ctxMenu.kind === "folder"
              ? folderMenuItems(ctxMenu.folder)
              : itemMenuItems(ctxMenu.item)
          }
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Move / copy picker */}
      {picker && (
        <FolderPickerDialog
          open
          title={
            picker.kind === "copy-item"
              ? "Copy to folder"
              : picker.kind === "move-folder"
              ? "Move folder into…"
              : "Move to folder"
          }
          disabledFolderId={picker.kind === "move-folder" ? picker.folder.id : undefined}
          onPick={handlePick}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Link picker */}
      {linkingItem && (
        <ItemPickerDialog
          open
          title={`Link "${itemLabel(linkingItem)}" to…`}
          excludeId={linkingItem.id}
          onPick={handleLinkPick}
          onClose={() => setLinkingItem(null)}
        />
      )}
    </div>
  );
}

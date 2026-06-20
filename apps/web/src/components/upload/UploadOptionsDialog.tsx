"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, Tag, Plus, Sparkles, FolderTree, Folder as FolderIcon } from "lucide-react";
import { itemsApi, foldersApi, type Folder } from "@/lib/api";
import { SPRING } from "@/components/ui/motion";

/** Where the item should go. Discriminated so the parent knows whether to set a
 *  folder id, create a new folder, or hand routing to the AI. */
export type Destination =
  | { kind: "ai" }
  | { kind: "existing"; folderId: string }
  | { kind: "new"; folderName: string }
  | { kind: "none" };

type Props = {
  defaultTitle: string;
  onSave: (title: string, tags: string[], destination: Destination) => void;
  onSkip: () => void;
  onClose: () => void;
};

/** Flatten the folder tree into "Parent / Child" labels for the picker. */
function flattenFolders(tree: Folder[], prefix = ""): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const f of tree) {
    const label = prefix ? `${prefix} / ${f.name}` : f.name;
    out.push({ id: f.id, label });
    if (f.children?.length) out.push(...flattenFolders(f.children, label));
  }
  return out;
}

export function UploadOptionsDialog({ defaultTitle, onSave, onSkip, onClose }: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Destination: AI by default (the "Let AI organise" path), or a manual folder.
  const [aiOrganise, setAiOrganise] = useState(true);
  const [folderId, setFolderId] = useState<string>("");      // "" = uncategorised
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);

  const { data } = useQuery({
    queryKey: ["items", { page_size: 500 }],
    queryFn: () => itemsApi.list({ page_size: 500 }),
  });

  const { data: folderTree } = useQuery({
    queryKey: ["folders"],
    queryFn: () => foldersApi.tree(),
  });

  const folderOptions = useMemo(
    () => flattenFolders(folderTree ?? []),
    [folderTree]
  );

  function buildDestination(): Destination {
    if (aiOrganise) return { kind: "ai" };
    if (creatingNew && newFolderName.trim())
      return { kind: "new", folderName: newFolderName.trim() };
    if (folderId) return { kind: "existing", folderId };
    return { kind: "none" };
  }

  const existingTags = useMemo(() => {
    const tagSet = new Set<string>();
    data?.results.forEach((item) => item.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [data]);

  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    const pool = existingTags.filter((t) => !selectedTags.includes(t));
    if (!q) return pool.slice(0, 30);
    return pool.filter((t) => t.toLowerCase().includes(q)).slice(0, 20);
  }, [existingTags, selectedTags, tagInput]);

  function addTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || selectedTags.includes(normalized)) return;
    setSelectedTags((prev) => [...prev, normalized]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  }

  const showCreate =
    tagInput.trim().length > 0 &&
    !existingTags.includes(tagInput.trim().toLowerCase());

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Glass backdrop */}
        <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />

        <motion.div
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-lift"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={SPRING}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold">Save options</h2>
              <p className="text-xs text-muted-foreground">
                Customise or skip — AI will fill any blanks
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/40"
              />
            </div>

            {/* Destination */}
            <div>
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <FolderTree className="h-3 w-3" /> Where to save
              </label>

              {/* AI vs Manual toggle */}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAiOrganise(true)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                    aiOrganise
                      ? "border-brand/50 bg-brand-muted text-brand shadow-soft"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Let AI organise
                </button>
                <button
                  type="button"
                  onClick={() => setAiOrganise(false)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                    !aiOrganise
                      ? "border-brand/50 bg-brand-muted text-brand shadow-soft"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <FolderIcon className="h-3.5 w-3.5" /> Choose folder
                </button>
              </div>

              <AnimatePresence initial={false}>
                {aiOrganise ? (
                  <motion.p
                    key="ai-hint"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    AI reads your file and routes it to a fitting folder — reusing an
                    existing one or creating a new one if needed.
                  </motion.p>
                ) : (
                  <motion.div
                    key="manual"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 space-y-2 overflow-hidden"
                  >
                    {!creatingNew ? (
                      <>
                        <select
                          value={folderId}
                          onChange={(e) => setFolderId(e.target.value)}
                          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/40"
                        >
                          <option value="">Uncategorised (no folder)</option>
                          {folderOptions.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => { setCreatingNew(true); setFolderId(""); }}
                          className="flex items-center gap-1 text-xs font-medium text-brand transition-opacity hover:opacity-80"
                        >
                          <Plus className="h-3 w-3" /> Create new folder
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          placeholder="New folder name…"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/40"
                        />
                        <button
                          type="button"
                          onClick={() => { setCreatingNew(false); setNewFolderName(""); }}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Tags */}
            <div>
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Tag className="h-3 w-3" /> Tags
              </label>

              {/* Selected chips */}
              <AnimatePresence initial={false}>
                {selectedTags.length > 0 && (
                  <motion.div
                    className="mt-2 flex flex-wrap gap-1.5"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {selectedTags.map((tag) => (
                      <motion.span
                        key={tag}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={SPRING}
                        className="flex items-center gap-1 rounded-full border border-brand/30 bg-brand-muted px-2.5 py-0.5 font-mono text-xs text-brand"
                      >
                        #{tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="rounded-full transition-colors hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </motion.span>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Input */}
              <div className="relative mt-2">
                <input
                  type="text"
                  placeholder={
                    existingTags.length > 0
                      ? "Search existing tags or type to create…"
                      : "Type a tag and press Enter…"
                  }
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagInput.trim()) {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 pr-20 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/40"
                />
                {showCreate && (
                  <button
                    onClick={() => addTag(tagInput)}
                    className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-xs font-medium text-brand transition-opacity hover:opacity-80"
                  >
                    <Plus className="h-3 w-3" /> Create
                  </button>
                )}
              </div>

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-auto">
                  {suggestions.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => addTag(tag)}
                      className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs transition-colors hover:bg-accent"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-5 py-4">
            <button
              onClick={onSkip}
              className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Skip — let AI decide
            </button>
            <button
              onClick={() => onSave(title, selectedTags, buildDestination())}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Save with these options
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

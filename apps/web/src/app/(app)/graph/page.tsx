"use client";

import { useCallback, useRef, useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Search as SearchIcon, Maximize2, Unlink, X, Network } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { graphApi, itemsApi } from "@/lib/api";
import { SPRING, EASE_OUT } from "@/components/ui/motion";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

const EDGE_COLORS: Record<string, string> = {
  semantic: "#6366f1",
  shared_tag: "#14b8a6",
  temporal: "#eab308",
  entity_match: "#ef4444",
  user_link: "#2563eb",
};

// Theme-aware canvas palette. The graph is a <canvas> so these must be plain
// color strings, not Tailwind tokens — they're chosen to mirror the design
// system's electric-blue accent and neutral foreground.
function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

// Brand blue — brighter variant in dark mode, to match the locked palette.
const NODE_DEFAULT = "#71717a";          // neutral node
const NODE_BRAND = "#2563eb";            // selected / focused (light)
const NODE_BRAND_DARK = "#3b82f6";       // selected / focused (dark)
const NODE_HALO = "#3b82f6";             // hover/selection glow
const NODE_STAR_RING = "#2563eb";        // starred ring uses accent
const DIMMED_ALPHA = 0.12;

// Adaptive labels (Obsidian-style)
const LABEL_HIDE_BELOW = 0.8;   // zoom level below which labels disappear entirely
const LABEL_FADE_FULL = 1.6;    // zoom level at which labels reach full opacity
const LABEL_FONT_WORLD = 3.5;   // base font size in graph-world units; screen px = this * zoom

function labelOpacity(zoom: number, forced: boolean): number {
  if (forced) return 1;
  if (zoom <= LABEL_HIDE_BELOW) return 0;
  if (zoom >= LABEL_FADE_FULL) return 1;
  return (zoom - LABEL_HIDE_BELOW) / (LABEL_FADE_FULL - LABEL_HIDE_BELOW);
}

type SelectedNode = {
  id: string;
  label: string;
  type: string;
  folder: string | null;
  tags: string[];
};

type SelectedEdge = {
  sourceId: string;
  targetId: string;
  sourceLabel: string;
  targetLabel: string;
  edges: Array<{ type: string; weight: number }>;
};

type GNode = {
  id: string;
  label: string;
  name: string;
  type: string;
  folder: string | null;
  folder_id: string | null;
  tags: string[];
  view_count: number;
  is_starred: boolean;
  val: number;
  x?: number;
  y?: number;
};

type GLink = {
  source: string | GNode;
  target: string | GNode;
  color: string;
  width: number;
  edges: Array<{ type: string; weight: number }>;
};

function nodeRadius(viewCount: number): number {
  return 4 + Math.log(1 + viewCount) * 3;
}

function applyAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  return `${hex.slice(0, 7)}${a.toString(16).padStart(2, "0")}`;
}

export default function GraphPage() {
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [minWeight, setMinWeight] = useState(0.6);
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(false);
  const [enabledEdgeTypes, setEnabledEdgeTypes] = useState<Set<string>>(
    () => new Set(Object.keys(EDGE_COLORS))
  );

  // Track theme so canvas colors stay in sync with light/dark mode.
  useEffect(() => {
    setDark(isDark());
    const obs = new MutationObserver(() => setDark(isDark()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const brandColor = dark ? NODE_BRAND_DARK : NODE_BRAND;
  const canvasBg = dark ? "#0a0a0a" : "#fafafa";
  const labelRgb = dark ? "229, 231, 235" : "39, 39, 42";

  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["graph", minWeight],
    queryFn: () => graphApi.get({ min_weight: minWeight }),
    retry: 1,
  });

  async function handleUnlink(edge: SelectedEdge) {
    await itemsApi.unlink(edge.sourceId, edge.targetId);
    setSelectedEdge(null);
    queryClient.invalidateQueries({ queryKey: ["graph"] });
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [] as GNode[], links: [] as GLink[] };
    type Pair = {
      source: string;
      target: string;
      edges: Array<{ type: string; weight: number }>;
    };
    const pairMap = new Map<string, Pair>();
    for (const e of data.edges) {
      const [a, b] = e.source < e.target ? [e.source, e.target] : [e.target, e.source];
      const key = `${a}|${b}`;
      const pair = pairMap.get(key) ?? { source: a, target: b, edges: [] };
      pair.edges.push({ type: e.type, weight: e.weight });
      pairMap.set(key, pair);
    }
    return {
      nodes: data.nodes.map<GNode>((n) => ({
        ...n,
        id: n.id,
        label: n.label,
        name: n.label,
        val: Math.max(1, Math.log(1 + n.view_count) * 3),
      })),
      links: Array.from(pairMap.values())
        .filter((p) => p.edges.some((e) => enabledEdgeTypes.has(e.type)))
        .map<GLink>((p) => {
          const visibleEdges = p.edges.filter((e) => enabledEdgeTypes.has(e.type));
          const strongest = visibleEdges.reduce((a, b) => (b.weight > a.weight ? b : a), visibleEdges[0]);
          return {
            source: p.source,
            target: p.target,
            color: EDGE_COLORS[strongest.type] ?? "#888888",
            width: 1.5,
            edges: visibleEdges,
          };
        }),
    };
  }, [data, enabledEdgeTypes]);

  // Build a neighbour index for instant hover highlighting (O(1) lookup).
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of graphData.links) {
      const s = typeof link.source === "string" ? link.source : link.source.id;
      const t = typeof link.target === "string" ? link.target : link.target.id;
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    }
    return map;
  }, [graphData]);

  const searchLower = search.trim().toLowerCase();
  const matchingNodeIds = useMemo(() => {
    if (!searchLower) return null;
    const ids = new Set<string>();
    for (const n of graphData.nodes) {
      const haystack = `${n.label} ${n.tags.join(" ")}`.toLowerCase();
      if (haystack.includes(searchLower)) ids.add(n.id);
    }
    return ids;
  }, [searchLower, graphData.nodes]);

  function isDimmed(nodeId: string): boolean {
    if (matchingNodeIds && !matchingNodeIds.has(nodeId)) return true;
    if (hoveredNodeId) {
      if (nodeId === hoveredNodeId) return false;
      return !(neighbours.get(hoveredNodeId)?.has(nodeId) ?? false);
    }
    return false;
  }

  function isLinkDimmed(link: GLink): boolean {
    const s = typeof link.source === "string" ? link.source : link.source.id;
    const t = typeof link.target === "string" ? link.target : link.target.id;
    if (matchingNodeIds && !matchingNodeIds.has(s) && !matchingNodeIds.has(t)) return true;
    if (hoveredNodeId) return s !== hoveredNodeId && t !== hoveredNodeId;
    return false;
  }

  const handleNodeClick = useCallback((node: any) => {
    const n = node as GNode;
    setSelectedEdge(null);
    setSelectedNode({
      id: n.id, label: n.label, type: n.type, folder: n.folder, tags: n.tags,
    });
    if (graphRef.current && n.x != null && n.y != null) {
      graphRef.current.centerAt(n.x, n.y, 600);
      graphRef.current.zoom(3, 600);
    }
  }, []);

  const handleLinkClick = useCallback((link: any) => {
    const l = link as GLink;
    const sourceId = typeof l.source === "object" ? l.source.id : l.source;
    const targetId = typeof l.target === "object" ? l.target.id : l.target;
    const sourceLabel = typeof l.source === "object" ? l.source.label : l.source;
    const targetLabel = typeof l.target === "object" ? l.target.label : l.target;
    setSelectedNode(null);
    setSelectedEdge({ sourceId, targetId, sourceLabel, targetLabel, edges: l.edges });
  }, []);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNodeId(node ? (node as GNode).id : null);
    if (typeof document !== "undefined") {
      document.body.style.cursor = node ? "pointer" : "default";
    }
  }, []);

  const handleZoomToFit = useCallback(() => {
    if (graphRef.current) graphRef.current.zoomToFit(500, 60);
  }, []);

  return (
    <div className="relative h-screen w-full bg-background" ref={containerRef}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      )}

      {/* Floating control bar */}
      <motion.div
        initial={{ opacity: 0, y: -10, x: -6 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="glass absolute left-4 top-4 z-10 flex w-64 flex-col gap-3.5 rounded-2xl border border-border p-4 shadow-lift"
      >
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-muted text-brand">
            <Network className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold leading-tight text-foreground">
              Knowledge Graph
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {data?.meta.total_nodes ?? 0} nodes · {data?.meta.total_edges ?? 0} edges
            </p>
          </div>
        </div>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search in graph…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-background/80 py-1.5 pl-8 pr-2 text-xs outline-none transition-shadow focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>

        <div>
          <label className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Min weight</span>
            <span className="font-mono text-foreground">{minWeight.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.1}
            value={minWeight}
            onChange={(e) => setMinWeight(parseFloat(e.target.value))}
            className="mt-1.5 w-full accent-brand"
          />
        </div>

        <button
          onClick={handleZoomToFit}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background/60 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-brand"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Zoom to fit
        </button>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Edge types
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setEnabledEdgeTypes(new Set(Object.keys(EDGE_COLORS)))}
                className="text-xs font-medium text-brand hover:underline"
              >
                All
              </button>
              <button
                onClick={() => setEnabledEdgeTypes(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                None
              </button>
            </div>
          </div>
          {Object.entries(EDGE_COLORS).map(([type, color]) => (
            <label
              key={type}
              className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <input
                type="checkbox"
                checked={enabledEdgeTypes.has(type)}
                onChange={() =>
                  setEnabledEdgeTypes((prev) => {
                    const next = new Set(prev);
                    if (next.has(type)) next.delete(type);
                    else next.add(type);
                    return next;
                  })
                }
                className="rounded accent-brand"
              />
              <span
                className="inline-block h-0.5 w-4 shrink-0 rounded"
                style={{ backgroundColor: color }}
              />
              <span className="capitalize">{type.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
      </motion.div>

      {/* Legend */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.1 }}
        className="glass absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 rounded-xl border border-border px-3.5 py-3 shadow-soft"
      >
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Legend
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NODE_DEFAULT }} />
          Item
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-offset-1 ring-offset-transparent" style={{ backgroundColor: brandColor, boxShadow: `0 0 0 1.5px ${brandColor}` }} />
          Selected / starred
        </div>
      </motion.div>

      {/* Node detail panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            key={`node-${selectedNode.id}`}
            initial={{ opacity: 0, x: 16, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 16, scale: 0.97 }}
            transition={SPRING}
            className="glass absolute right-4 top-4 z-10 w-64 space-y-3 rounded-2xl border border-border p-4 shadow-lift"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-md bg-brand-muted px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-brand">
                {selectedNode.type}
              </span>
              <button
                onClick={() => setSelectedNode(null)}
                className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-sm font-semibold leading-snug text-foreground">{selectedNode.label}</p>
            {selectedNode.folder && (
              <p className="text-xs text-muted-foreground">📁 {selectedNode.folder}</p>
            )}
            {selectedNode.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedNode.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edge detail panel */}
      <AnimatePresence>
        {selectedEdge && (
          <motion.div
            key={`edge-${selectedEdge.sourceId}-${selectedEdge.targetId}`}
            initial={{ opacity: 0, x: 16, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 16, scale: 0.97 }}
            transition={SPRING}
            className="glass absolute right-4 top-4 z-10 w-72 space-y-3 rounded-2xl border border-border p-4 shadow-lift"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {selectedEdge.edges.length} relationship{selectedEdge.edges.length === 1 ? "" : "s"}
              </span>
              <button
                onClick={() => setSelectedEdge(null)}
                className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="text-xs leading-relaxed">
              <p className="truncate font-medium text-foreground">{selectedEdge.sourceLabel}</p>
              <p className="my-1 text-brand">↕</p>
              <p className="truncate font-medium text-foreground">{selectedEdge.targetLabel}</p>
            </div>

            <div className="space-y-1.5 border-t border-border pt-3">
              {selectedEdge.edges
                .slice()
                .sort((a, b) => b.weight - a.weight)
                .map((e, i) => (
                  <div key={`${e.type}-${i}`} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: EDGE_COLORS[e.type] ?? "#888888" }}
                    />
                    <span className="flex-1 capitalize text-foreground">{e.type.replace("_", " ")}</span>
                    <span className="font-mono text-muted-foreground">{e.weight.toFixed(2)}</span>
                  </div>
                ))}
            </div>

            {selectedEdge.edges.some((e) => e.type === "user_link") && (
              <button
                onClick={() => handleUnlink(selectedEdge)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                <Unlink className="h-3.5 w-3.5" />
                Remove manual link
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {isError && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <div className="animate-fade-up text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-destructive/10">
              <Network className="h-7 w-7 text-destructive" />
            </div>
            <p className="font-display text-lg font-semibold text-foreground">Graph unavailable</p>
            <p className="mt-1 max-w-xs text-sm">Could not load the knowledge graph. Check that all services are running.</p>
          </div>
        </div>
      )}

      {!isError && data?.meta.total_nodes === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <div className="animate-fade-up text-center">
            <div className="glow-brand mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-muted text-brand">
              <Network className="h-7 w-7" />
            </div>
            <p className="font-display text-lg font-semibold text-foreground">No connections yet</p>
            <p className="mt-1 max-w-xs text-sm">Save more items — connections appear after AI processing.</p>
          </div>
        </div>
      )}

      <ForceGraph2D
        ref={graphRef as any}
        graphData={graphData as any}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor={canvasBg}
        nodeRelSize={1}
        nodeCanvasObjectMode={() => "replace"}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const n = node as GNode;
          const dimmed = isDimmed(n.id);
          const hovered = hoveredNodeId === n.id;
          const selected = selectedNode?.id === n.id;
          const focused = hovered || selected;
          const radius = nodeRadius(n.view_count);

          // Brand-blue glow/halo for hovered or selected nodes.
          if (focused) {
            const halo = dark ? NODE_HALO : NODE_BRAND;
            const grd = ctx.createRadialGradient(n.x!, n.y!, radius, n.x!, n.y!, radius * 3.5);
            grd.addColorStop(0, applyAlpha(halo, selected ? 0.6 : 0.45));
            grd.addColorStop(1, applyAlpha(halo, 0));
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius * 3.5, 0, 2 * Math.PI);
            ctx.fillStyle = grd;
            ctx.fill();
          }

          // Base circle — focused/starred nodes adopt the brand accent.
          const baseColor = focused || n.is_starred ? brandColor : NODE_DEFAULT;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, radius, 0, 2 * Math.PI);
          ctx.fillStyle = dimmed ? applyAlpha(baseColor, DIMMED_ALPHA) : baseColor;
          ctx.fill();

          // Accent ring for starred / selected items.
          if (n.is_starred || selected) {
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius + 1.5, 0, 2 * Math.PI);
            ctx.strokeStyle = dimmed ? applyAlpha(NODE_STAR_RING, DIMMED_ALPHA) : brandColor;
            ctx.lineWidth = (selected ? 2.5 : 2) / globalScale;
            ctx.stroke();
          }

          // Adaptive label — fixed size in world coords, fade in/out with zoom.
          const forced =
            hovered || selectedNode?.id === n.id || !!matchingNodeIds?.has(n.id);
          const alpha = labelOpacity(globalScale, forced);
          if (alpha > 0) {
            const effectiveAlpha = alpha * (dimmed && !forced ? DIMMED_ALPHA : 1);
            // Slight font growth when zoomed in close — feels natural without
            // letting the text balloon beyond the nodes.
            const fontSize = LABEL_FONT_WORLD * (globalScale >= 2.5 ? 1.15 : 1);
            ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = `rgba(${labelRgb}, ${effectiveAlpha})`;
            const label = n.label.length > 28 ? `${n.label.slice(0, 28)}…` : n.label;
            ctx.fillText(label, n.x!, n.y! + radius + 1.5);
          }
        }}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          const n = node as GNode;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, nodeRadius(n.view_count) + 2, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={(link: any) => {
          const l = link as GLink;
          const dimmed = isLinkDimmed(l);
          const baseAlpha = Math.min(0.85, 0.4 + l.edges.length * 0.15);
          return applyAlpha(l.color, dimmed ? DIMMED_ALPHA : baseAlpha);
        }}
        linkWidth={(link: any) => {
          const l = link as GLink;
          const s = typeof l.source === "string" ? l.source : l.source.id;
          const t = typeof l.target === "string" ? l.target : l.target.id;
          const emphasised = hoveredNodeId === s || hoveredNodeId === t;
          return emphasised ? 2.5 : 1.5;
        }}
        linkLabel={(link: any) => {
          const l = link as GLink;
          return `${l.edges.length} relationship${l.edges.length === 1 ? "" : "s"}`;
        }}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onLinkClick={handleLinkClick}
        warmupTicks={120}
        cooldownTicks={300}
        cooldownTime={4000}
        d3AlphaDecay={0.018}
        d3VelocityDecay={0.28}
        enableNodeDrag={true}
        onEngineStop={() => {
          // Centre & frame the graph the first time physics settles.
          if (graphRef.current) {
            graphRef.current.zoomToFit(500, 60);
          }
        }}
      />
    </div>
  );
}

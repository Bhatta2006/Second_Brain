"use client";

import { useCallback, useRef, useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Search as SearchIcon, Maximize2 } from "lucide-react";
import { graphApi } from "@/lib/api";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

const EDGE_COLORS: Record<string, string> = {
  semantic: "#6366f1",
  shared_tag: "#14b8a6",
  temporal: "#eab308",
  entity_match: "#ef4444",
  user_link: "#ffffff",
};

const NODE_DEFAULT = "#818cf8";
const NODE_HALO = "#a5b4fc";
const NODE_STAR_RING = "#f2a623";
const DIMMED_ALPHA = 0.12;

// Content-type → node color mapping
const NODE_TYPE_COLORS: Record<string, string> = {
  text: "#60a5fa",    // blue
  url: "#34d399",     // green
  pdf: "#f87171",     // red
  image: "#fbbf24",   // amber
  audio: "#a78bfa",   // violet
  video: "#fb923c",   // orange
  doc: "#f472b6",     // pink
  file: "#94a3b8",    // slate
};

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ["graph", minWeight],
    queryFn: () => graphApi.get({ min_weight: minWeight }),
    retry: 1,
  });

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
      links: Array.from(pairMap.values()).map<GLink>((p) => {
        const strongest = p.edges.reduce((a, b) => (b.weight > a.weight ? b : a), p.edges[0]);
        const totalWeight = p.edges.reduce((s, e) => s + e.weight, 0);
        return {
          source: p.source,
          target: p.target,
          color: EDGE_COLORS[strongest.type] ?? "#888888",
          width: Math.max(1.5, Math.min(6, totalWeight * 1.8)),
          edges: p.edges,
        };
      }),
    };
  }, [data]);

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
    const sourceLabel = typeof l.source === "object" ? l.source.label : l.source;
    const targetLabel = typeof l.target === "object" ? l.target.label : l.target;
    setSelectedNode(null);
    setSelectedEdge({ sourceLabel, targetLabel, edges: l.edges });
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
    <div className="relative w-full h-screen" ref={containerRef}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3 bg-card/90 backdrop-blur rounded-xl border border-border p-3 shadow-lg w-60">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Knowledge Graph</p>
          <p className="text-xs text-muted-foreground">
            {data?.meta.total_nodes ?? 0} nodes · {data?.meta.total_edges ?? 0} edges
          </p>
        </div>

        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by title or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background pl-7 pr-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">
            Min weight: {minWeight.toFixed(1)}
          </label>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.1}
            value={minWeight}
            onChange={(e) => setMinWeight(parseFloat(e.target.value))}
            className="w-full mt-1"
          />
        </div>

        <button
          onClick={handleZoomToFit}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border py-1 text-xs hover:bg-muted transition-colors"
        >
          <Maximize2 className="h-3 w-3" />
          Zoom to fit
        </button>

        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Edge types</p>
          {Object.entries(EDGE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: color }} />
              <span className="capitalize">{type.replace("_", " ")}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Node types</p>
          {Object.entries(NODE_TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Node detail panel */}
      {selectedNode && (
        <div className="absolute top-4 right-4 z-10 w-64 bg-card/90 backdrop-blur rounded-xl border border-border p-4 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs bg-secondary rounded px-1.5 py-0.5 font-mono uppercase">
              {selectedNode.type}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <p className="font-medium text-sm leading-snug">{selectedNode.label}</p>
          {selectedNode.folder && (
            <p className="text-xs text-muted-foreground">📁 {selectedNode.folder}</p>
          )}
          {selectedNode.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedNode.tags.map((t) => (
                <span key={t} className="text-xs bg-muted rounded px-1.5 py-0.5">#{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edge detail panel */}
      {selectedEdge && (
        <div className="absolute top-4 right-4 z-10 w-72 bg-card/90 backdrop-blur rounded-xl border border-border p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {selectedEdge.edges.length} relationship{selectedEdge.edges.length === 1 ? "" : "s"}
            </span>
            <button
              onClick={() => setSelectedEdge(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>

          <div className="text-xs text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground truncate">{selectedEdge.sourceLabel}</p>
            <p className="my-1 text-muted-foreground">↕</p>
            <p className="font-medium text-foreground truncate">{selectedEdge.targetLabel}</p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-border">
            {selectedEdge.edges
              .slice()
              .sort((a, b) => b.weight - a.weight)
              .map((e, i) => (
                <div key={`${e.type}-${i}`} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: EDGE_COLORS[e.type] ?? "#888888" }}
                  />
                  <span className="capitalize flex-1">{e.type.replace("_", " ")}</span>
                  <span className="font-mono text-muted-foreground">{e.weight.toFixed(2)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-lg font-medium">Graph unavailable</p>
            <p className="text-sm mt-1">Could not load the knowledge graph. Check that all services are running.</p>
          </div>
        </div>
      )}

      {!isError && data?.meta.total_nodes === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-lg font-medium">No items yet</p>
            <p className="text-sm mt-1">Save some items — they will appear as nodes in your knowledge graph.</p>
          </div>
        </div>
      )}

      <ForceGraph2D
        ref={graphRef as any}
        graphData={graphData as any}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#0a0a0a"
        nodeRelSize={1}
        nodeCanvasObjectMode={() => "replace"}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const n = node as GNode;
          const dimmed = isDimmed(n.id);
          const hovered = hoveredNodeId === n.id;
          const radius = nodeRadius(n.view_count);

          // Halo (subtle glow for hovered or focused nodes)
          if (hovered) {
            const grd = ctx.createRadialGradient(n.x!, n.y!, radius, n.x!, n.y!, radius * 3);
            grd.addColorStop(0, applyAlpha(NODE_HALO, 0.5));
            grd.addColorStop(1, applyAlpha(NODE_HALO, 0));
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius * 3, 0, 2 * Math.PI);
            ctx.fillStyle = grd;
            ctx.fill();
          }

          // Base circle — color by content type
          const nodeColor = NODE_TYPE_COLORS[n.type] ?? NODE_DEFAULT;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, radius, 0, 2 * Math.PI);
          ctx.fillStyle = dimmed ? applyAlpha(nodeColor, DIMMED_ALPHA) : nodeColor;
          ctx.fill();

          // Gold ring for starred items
          if (n.is_starred) {
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius + 1, 0, 2 * Math.PI);
            ctx.strokeStyle = dimmed ? applyAlpha(NODE_STAR_RING, DIMMED_ALPHA) : NODE_STAR_RING;
            ctx.lineWidth = 2 / globalScale;
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
            ctx.fillStyle = `rgba(229, 231, 235, ${effectiveAlpha})`;
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
          return emphasised ? l.width + 1 : l.width;
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

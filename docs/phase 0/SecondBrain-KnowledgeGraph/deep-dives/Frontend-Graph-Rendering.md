---
title: Frontend Graph Rendering
tags: [secondbrain, frontend, d3, react-force-graph, web-worker, rendering]
status: in-progress
created: 2026-05-11
related:
  - "[[Knowledge-Graph-Implementation]]"
  - "[[Graph-API-Design]]"
---

# Frontend Graph Rendering

## Table of Contents

- [[#1. Library Choice|Library Choice]]
- [[#2. Component Structure|Component Structure]]
- [[#3. Node Sizing and Colour|Node Sizing and Colour]]
- [[#4. Edge Rendering|Edge Rendering]]
- [[#5. Web Worker Physics|Web Worker Physics]]
- [[#6. Incremental Updates|Incremental Updates]]
- [[#7. Cluster Mode|Cluster Mode]]
- [[#8. Interactions|Interactions]]
- [[#9. Performance Targets|Performance Targets]]
- [[#10. Mobile (Phase 4)|Mobile (Phase 4)]]
- [[#11. References|References]]

---

## 1. Library Choice

| Library | Renderer | Use |
|---|---|---|
| `react-force-graph-2d` | Canvas (2D) | Default graph view |
| `react-force-graph-3d` | Three.js (WebGL) | 3D toggle — Pro plan only |
| `react-native-d3` | SVG | Mobile graph view — Phase 4 |
| `d3.polygonHull` | SVG overlay | Cluster convex hulls |

`react-force-graph-2d` is canvas-based, not SVG. This is important — at 500+ nodes, SVG degrades badly (one DOM element per node), whereas canvas draws everything in a single `<canvas>` element and handles 10k+ nodes smoothly.

---

## 2. Component Structure

```tsx
// apps/web/components/graph/GraphView.tsx

import { useRef, useCallback, useEffect } from "react"
import ForceGraph2D from "react-force-graph-2d"
import { useGraphData } from "@/hooks/useGraphData"
import { useGraphStore } from "@/stores/graphStore"
import { ClusterOverlay } from "./ClusterOverlay"
import { GraphToolbar } from "./GraphToolbar"
import { ItemDetailPanel } from "./ItemDetailPanel"

export function GraphView() {
  const graphRef = useRef()
  const { data, isLoading } = useGraphData()       // fetches /graph
  const { selectedNode, setSelectedNode, clusterMode } = useGraphStore()

  return (
    <div className="relative w-full h-full">
      <GraphToolbar graphRef={graphRef} />

      <ForceGraph2D
        ref={graphRef}
        graphData={data}
        nodeCanvasObject={renderNode}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        onNodeClick={(node) => setSelectedNode(node)}
        onNodeRightClick={showContextMenu}
        onNodeHover={showTooltip}
        onBackgroundClick={() => setSelectedNode(null)}
        onEngineStop={clusterMode ? computeHulls : undefined}
        warmupTicks={100}         // pre-run physics before first render
        cooldownTicks={200}
        d3AlphaDecay={0.02}       // slower cooling = better layout
        d3VelocityDecay={0.3}
      />

      {clusterMode && <ClusterOverlay graphRef={graphRef} />}
      {selectedNode && <ItemDetailPanel node={selectedNode} />}
    </div>
  )
}
```

---

## 3. Node Sizing and Colour

**Size** is proportional to `viewCount` on a log scale, so heavily-accessed items are visually prominent without dominating the layout.

```ts
// Radius: min 4px, max ~18px for a view count of ~1000
function nodeRadius(viewCount: number): number {
  return 4 + Math.log(1 + viewCount) * 3
}
```

**Colour** matches the item's folder colour (hex stored on the `folders` table). Starred items get a gold ring.

```ts
function renderNode(node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) {
  const radius = nodeRadius(node.viewCount)
  const label = node.label

  // Base circle — folder colour
  ctx.beginPath()
  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
  ctx.fillStyle = node.folderColor || "#888"
  ctx.fill()

  // Gold ring for starred items
  if (node.isStarred) {
    ctx.strokeStyle = "#F2A623"
    ctx.lineWidth = 2 / globalScale
    ctx.stroke()
  }

  // Label — only show when zoomed in enough
  if (globalScale >= 1.5) {
    ctx.font = `${10 / globalScale}px sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillStyle = "#fff"
    ctx.fillText(label.slice(0, 20), node.x, node.y + radius + 6 / globalScale)
  }
}
```

---

## 4. Edge Rendering

Edge appearance encodes edge type and weight:

```ts
function getLinkColor(link: GraphEdge): string {
  switch (link.type) {
    case "semantic":   return `rgba(99, 102, 241, ${link.weight})`   // indigo
    case "shared_tag": return `rgba(20, 184, 166, ${link.weight})`   // teal
    case "temporal":   return `rgba(234, 179, 8,  ${link.weight})`   // amber
    case "entity_match": return `rgba(239, 68, 68, ${link.weight})`  // red
    case "user_link":  return `rgba(255, 255, 255, 0.9)`             // white — always visible
    default:           return `rgba(150, 150, 150, ${link.weight})`
  }
}

function getLinkWidth(link: GraphEdge): number {
  if (link.type === "user_link") return 2      // always thick
  return link.weight * 2                        // 0.6–1.0 → 1.2–2px
}
```

---

## 5. Web Worker Physics

The D3 force simulation must run in a Web Worker to keep the main thread responsive. Without this, dragging a node or typing in the search bar freezes the simulation.

```ts
// ForceGraph2D supports this via the `nodeAutoColorBy` + worker mode

<ForceGraph2D
  graphData={data}
  // Enable worker-based simulation
  // react-force-graph uses d3-force internally;
  // the worker option offloads tick computation
  cooldownTime={3000}
  onEngineStop={() => {
    // Physics settled — safe to compute convex hulls now
    if (clusterMode) computeHulls()
  }}
/>
```

For manual Web Worker control if needed:

```ts
// Pre-compute layout in a worker before rendering
const worker = new Worker(new URL("./graphWorker.ts", import.meta.url))
worker.postMessage({ nodes: data.nodes, edges: data.edges, ticks: 300 })
worker.onmessage = (e) => {
  // Positions are now pre-computed; hand to ForceGraph with simulation disabled
  setPrecomputedData(e.data)
}
```

---

## 6. Incremental Updates

When a new item arrives via WebSocket (`item.ready`), append it to the graph without re-fetching the full dataset:

```ts
// hooks/useGraphData.ts
const { subscribe } = useWebSocket()

useEffect(() => {
  subscribe("item.ready", async (itemId: string) => {
    // Fetch just the new item's node + its edges
    const { nodes: newNodes, edges: newEdges } =
      await fetch(`/api/v1/graph/item/${itemId}/neighbours`).then(r => r.json())

    if (graphRef.current) {
      const current = graphRef.current.graphData()
      graphRef.current.graphData({
        nodes: [...current.nodes, ...newNodes.filter(n => !nodeExists(n.id, current))],
        edges: [...current.edges, ...newEdges],
      })
      // Briefly re-heat the simulation to absorb the new node
      graphRef.current.d3ReheatSimulation()
    }
  })
}, [])
```

---

## 7. Cluster Mode

Cluster mode groups nodes by folder with a convex hull outline drawn over each group.

```ts
// components/graph/ClusterOverlay.tsx
import * as d3 from "d3"

function computeHulls(graphRef) {
  const { nodes } = graphRef.current.graphData()

  // Group nodes by folder
  const byFolder = d3.group(nodes, (n) => n.folder)

  const hulls = []
  for (const [folder, folderNodes] of byFolder) {
    if (folderNodes.length < 3) continue  // Need at least 3 points for a hull

    const points = folderNodes.map((n) => [n.x, n.y])
    const hull = d3.polygonHull(points)
    if (hull) hulls.push({ folder, hull, color: folderNodes[0].folderColor })
  }
  setHulls(hulls)
}

// Render as SVG overlay on top of the canvas
function ClusterOverlay({ hulls }) {
  return (
    <svg className="absolute inset-0 pointer-events-none w-full h-full">
      {hulls.map(({ folder, hull, color }) => (
        <path
          key={folder}
          d={`M${hull.join("L")}Z`}
          fill={color}
          fillOpacity={0.08}
          stroke={color}
          strokeOpacity={0.3}
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
      ))}
    </svg>
  )
}
```

> **Known issue:** The SVG overlay and the canvas use different coordinate systems. The overlay must apply the same pan/zoom transform as the canvas. Use `graphRef.current.screen2GraphCoords()` to convert between them.

---

## 8. Interactions

| Action | Implementation |
|---|---|
| Click node | `onNodeClick` → open item detail slide-in panel |
| Double-click node | `onNodeClick` with `event.detail === 2` → fetch ego graph, replace graph data |
| Hover node | `onNodeHover` → show tooltip (title + summary snippet) |
| Drag node | Built-in to react-force-graph — positions nodes, reheat simulation |
| Right-click node | `onNodeRightClick` → context menu: Open / Move / Link / Delete |
| Click edge | `onLinkClick` → show edge type badge + weight |
| Search in graph | Filter: dim non-matching nodes via `nodeColor` function checking search term |
| Focus mode button | Replace `graphData` with ego graph response |
| Zoom to fit | `graphRef.current.zoomToFit(400)` |
| Zoom to node | `graphRef.current.centerAt(node.x, node.y, 500)` then `graphRef.current.zoom(4, 500)` |

---

## 9. Performance Targets

From the PRD:

| Metric | Target |
|---|---|
| Graph render (1000 nodes) | < 2s initial render, 60fps interaction |
| Graph API response | < 300ms p95 |
| Node click → detail panel | < 100ms (no network call — data already in graph) |

Canvas at 1000 nodes + 3000 edges runs comfortably at 60fps on mid-range hardware. The 10k-node case requires LOD (level of detail) techniques — hide labels and reduce node detail when zoomed out, show full detail on zoom.

---

## 10. Mobile (Phase 4)

`react-native-d3` on React Native (Expo). Key differences from web:

- SVG-based (not canvas) — performance degrades above ~300 nodes. Apply stricter pagination (top-100 instead of top-500).
- No Web Worker support in React Native — simulation must be pre-computed server-side or via a simpler layout algorithm (tree layout for mobile).
- Touch interactions: pinch to zoom, tap to select, long-press for context menu.

---

## 11. References

- [react-force-graph GitHub](https://github.com/vasturiano/react-force-graph)
- [d3.polygonHull](https://d3js.org/d3-polygon#polygonHull)
- [D3 force simulation](https://d3js.org/d3-force)
- [Canvas vs SVG performance](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)

---

*Related notes: [[Knowledge-Graph-Implementation]] · [[Graph-API-Design]]*

"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, applyNodeChanges, applyEdgeChanges, Handle, Position,
  type Node, type Edge, type Connection,
  type NodeChange, type EdgeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphNode as DbNode, GraphEdge as DbEdge } from "@/types/client-structure";

/* ────────────────────────────────────────────────────────────────────────────
 * OrgGraphCanvas — free-placement canvas-style chart builder.
 *
 * Drag boxes anywhere. Connect boxes by dragging from one handle to
 * another. Many-to-one is just "two edges arriving at the same target".
 *
 * Each node carries a `level` so the structure provisioner can still
 * project the graph into folder paths. Levels are picked at add-time.
 *
 * Submits a single hidden `graph_json` field — { nodes: [...], edges: [...] }.
 * ──────────────────────────────────────────────────────────────────────────── */

const PALETTE = [
  { ring: "ring-indigo-300", bg: "bg-indigo-50", chip: "bg-indigo-100 text-indigo-700" },
  { ring: "ring-emerald-300", bg: "bg-emerald-50", chip: "bg-emerald-100 text-emerald-700" },
  { ring: "ring-sky-300", bg: "bg-sky-50", chip: "bg-sky-100 text-sky-700" },
  { ring: "ring-amber-300", bg: "bg-amber-50", chip: "bg-amber-100 text-amber-700" },
  { ring: "ring-rose-300", bg: "bg-rose-50", chip: "bg-rose-100 text-rose-700" },
  { ring: "ring-violet-300", bg: "bg-violet-50", chip: "bg-violet-100 text-violet-700" },
];
function paletteFor(level: number) {
  return PALETTE[level % PALETTE.length];
}

type NodeData = {
  label: string;
  description?: string;
  level: number;
  cap: number | null;
  bucketing: "separate" | "combined";
  onChange: (patch: Partial<NodeData>) => void;
  onRemove: () => void;
};

function BoxNode({ data }: NodeProps<Node<NodeData>>) {
  const p = paletteFor(data.level);
  const unlimited = data.cap == null;
  return (
    <div
      className={
        "relative min-w-[200px] max-w-[260px] rounded-lg border bg-white p-3 shadow-md ring-1 " + p.ring
      }
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-zinc-400" />
      <div className="flex items-start gap-2">
        <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " + p.chip}>
          {data.level + 1}
        </span>
        <input
          type="text"
          value={data.label}
          onChange={(e) => data.onChange({ label: e.target.value })}
          placeholder="Label"
          className="nodrag flex-1 rounded border border-zinc-300 px-2 py-1 text-sm font-semibold"
        />
        <button
          type="button"
          onClick={data.onRemove}
          title="Remove"
          className="nodrag rounded border border-red-200 bg-red-50 px-1 py-0.5 text-[10px] text-red-700 hover:bg-red-100"
        >
          ✕
        </button>
      </div>
      <input
        type="text"
        value={data.description ?? ""}
        onChange={(e) => data.onChange({ description: e.target.value })}
        placeholder="Description (optional)"
        className="nodrag mt-2 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
      />
      <div className="nodrag mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-700">
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => data.onChange({ cap: e.target.checked ? null : 1 })}
          />
          Unlimited
        </label>
        {!unlimited && (
          <input
            type="number"
            min={1}
            value={data.cap ?? 1}
            onChange={(e) => data.onChange({ cap: Math.max(1, Number(e.target.value) || 1) })}
            className="w-14 rounded border border-zinc-300 px-1.5 py-0.5"
          />
        )}
        <select
          value={data.bucketing}
          onChange={(e) => data.onChange({ bucketing: e.target.value as NodeData["bucketing"] })}
          className="rounded border border-zinc-300 px-1.5 py-0.5"
        >
          <option value="separate">separate</option>
          <option value="combined">combined</option>
        </select>
        <span className="ml-auto text-[10px] text-zinc-400">level {data.level + 1}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-zinc-400" />
    </div>
  );
}

const nodeTypes = { box: BoxNode };

function nid() {
  return Math.random().toString(36).slice(2, 10);
}

function buildInitial(initial?: { nodes: DbNode[]; edges: DbEdge[] } | null): {
  nodes: Node<NodeData>[]; edges: Edge[];
} {
  if (!initial || initial.nodes.length === 0) {
    // Sensible default seed: admin lane + a starter "Store" box.
    return {
      nodes: [
        seedNode("n1", "Store", 0, 200, 60),
      ],
      edges: [],
    };
  }
  return {
    nodes: initial.nodes.map((n) => ({
      id: n.id,
      type: "box",
      position: { x: n.x, y: n.y },
      data: {
        label: n.label, description: n.description ?? "", level: n.level,
        cap: n.cap, bucketing: n.bucketing,
        onChange: () => {}, onRemove: () => {}, // wired up by the parent on render
      },
    })),
    edges: initial.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, animated: false,
    })),
  };
}

function seedNode(id: string, label: string, level: number, x: number, y: number): Node<NodeData> {
  return {
    id, type: "box",
    position: { x, y },
    data: {
      label, description: "", level, cap: null, bucketing: "separate",
      onChange: () => {}, onRemove: () => {},
    },
  };
}

export function OrgGraphCanvas({
  initial,
}: {
  initial?: { nodes: DbNode[]; edges: DbEdge[] } | null;
}) {
  const seed = useMemo(() => buildInitial(initial), [initial]);
  const [nodes, setNodes] = useState<Node<NodeData>[]>(seed.nodes);
  const [edges, setEdges] = useState<Edge[]>(seed.edges);
  const [nextLevel, setNextLevel] = useState<number>(1);
  const [nextLabel, setNextLabel] = useState<string>("New box");

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as Node<NodeData>[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (conn: Connection) =>
      setEdges((eds) => addEdge({ ...conn, id: `e-${nid()}`, animated: false }, eds)),
    [],
  );

  function patchNode(id: string, patch: Partial<NodeData>) {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }
  function removeNode(id: string) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }

  // Re-bind action closures into node data on every render so each node always
  // calls the freshest patch/remove (closures over current state).
  const livingNodes = nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      onChange: (patch: Partial<NodeData>) => patchNode(n.id, patch),
      onRemove: () => removeNode(n.id),
    },
  }));

  function addNode() {
    const id = `n-${nid()}`;
    const sameLevel = livingNodes.filter((n) => n.data.level === nextLevel).length;
    const x = 50 + sameLevel * 260;
    const y = 60 + nextLevel * 200;
    setNodes((nds) => [
      ...nds,
      {
        id, type: "box",
        position: { x, y },
        data: {
          label: nextLabel || `Box ${nds.length + 1}`,
          description: "", level: nextLevel, cap: null, bucketing: "separate",
          onChange: () => {}, onRemove: () => {},
        },
      },
    ]);
    setNextLabel("New box");
  }

  // Serialize for the server action.
  const graphJson = JSON.stringify({
    nodes: livingNodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      description: n.data.description || undefined,
      level: n.data.level,
      x: n.position.x,
      y: n.position.y,
      cap: n.data.cap,
      bucketing: n.data.bucketing,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  });

  return (
    <div className="w-full">
      <input type="hidden" name="graph_json" value={graphJson} />

      {/* Toolbar for adding boxes with a level */}
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 text-xs">
        <span className="font-medium text-zinc-700">Add new box:</span>
        <input
          type="text"
          value={nextLabel}
          onChange={(e) => setNextLabel(e.target.value)}
          placeholder="Label"
          className="w-40 rounded border border-zinc-300 px-2 py-1"
        />
        <label className="inline-flex items-center gap-1 text-zinc-600">
          Level
          <select
            value={nextLevel}
            onChange={(e) => setNextLevel(Number(e.target.value))}
            className="rounded border border-zinc-300 px-1.5 py-1"
          >
            {Array.from({ length: 8 }, (_, i) => (
              <option key={i} value={i}>{i + 1}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={addNode}
          className="rounded-md bg-zinc-900 px-3 py-1.5 font-semibold text-white hover:bg-zinc-800"
        >
          + Add box
        </button>
        <span className="ml-auto text-[10px] text-zinc-500">
          Drag handles to draw connections (many-to-one supported). Drag boxes to reposition freely.
        </span>
      </div>

      {/* Canvas — fixed height so it scrolls within rather than blowing out the page */}
      <div className="rounded-lg border border-zinc-200" style={{ height: 540 }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={livingNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls position="bottom-left" />
            <MiniMap pannable zoomable className="!bg-zinc-50" />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

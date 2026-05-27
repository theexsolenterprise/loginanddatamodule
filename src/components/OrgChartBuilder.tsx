"use client";

import { useState } from "react";
import type { ChartNode } from "@/types/client-structure";

/**
 * OrgChartBuilder — visual tree editor where every box is a node.
 *
 * Click "+" under any box to add a child. Click "+" beside any box to add
 * a sibling (parallel chain). Edit label/description inline. Each box
 * carries its own count (Unlimited or N) and bucketing.
 *
 * State is a forest of `ChartNode`. On submit, the JSON is serialized
 * into a hidden `boxes_json` form field for the server action to parse.
 */

const PALETTE = [
  { ring: "ring-indigo-200", chip: "bg-indigo-100 text-indigo-700" },
  { ring: "ring-emerald-200", chip: "bg-emerald-100 text-emerald-700" },
  { ring: "ring-sky-200", chip: "bg-sky-100 text-sky-700" },
  { ring: "ring-amber-200", chip: "bg-amber-100 text-amber-700" },
  { ring: "ring-rose-200", chip: "bg-rose-100 text-rose-700" },
  { ring: "ring-violet-200", chip: "bg-violet-100 text-violet-700" },
];

function nid() {
  return Math.random().toString(36).slice(2, 10);
}

function makeNode(label = "Box"): ChartNode {
  return { id: nid(), label, description: "", cap: null, bucketing: "separate", children: [], linksTo: [] };
}

/** Collect every node in the tree paired with its id + label, for the link picker. */
function collectAll(nodes: ChartNode[], out: { id: string; label: string }[] = []) {
  for (const n of nodes) {
    out.push({ id: n.id, label: n.label });
    collectAll(n.children, out);
  }
  return out;
}

function seed(): ChartNode[] {
  return [{ ...makeNode("Store"), children: [{ ...makeNode("Owner"), children: [{ ...makeNode("Employee"), children: [{ ...makeNode("Customer"), cap: null, bucketing: "combined" }] }] }] }];
}

export function OrgChartBuilder({ initial }: { initial?: ChartNode[] }) {
  const [boxes, setBoxes] = useState<ChartNode[]>(() =>
    initial && initial.length > 0 ? initial : seed(),
  );

  function mutateAt(path: number[], fn: (n: ChartNode) => ChartNode | ChartNode[] | null): ChartNode[] {
    function walk(nodes: ChartNode[], depth: number): ChartNode[] {
      return nodes.flatMap((n, i) => {
        const onPath = path[depth] === i;
        if (!onPath) return [n];
        if (depth === path.length - 1) {
          const r = fn(n);
          if (r === null) return [];
          return Array.isArray(r) ? r : [r];
        }
        return [{ ...n, children: walk(n.children, depth + 1) }];
      });
    }
    return walk(boxes, 0);
  }

  function expand(path: number[]) {
    setBoxes(
      mutateAt(path, (n) => {
        const N = n.cap ?? 1;
        if (N <= 1) return n;
        return Array.from({ length: N }, (_, i) => ({
          ...n,
          id: nid(),
          label: `${n.label} ${i + 1}`,
          cap: 1,
        }));
      }),
    );
  }

  function toggleLink(path: number[], otherId: string) {
    setBoxes(
      mutateAt(path, (n) => {
        const links = new Set(n.linksTo ?? []);
        if (links.has(otherId)) links.delete(otherId);
        else links.add(otherId);
        return { ...n, linksTo: Array.from(links) };
      }),
    );
  }

  function updateAt(path: number[], patch: Partial<ChartNode>) {
    setBoxes(mutateAt(path, (n) => ({ ...n, ...patch })));
  }
  function addChild(path: number[]) {
    setBoxes(mutateAt(path, (n) => ({ ...n, children: [...n.children, makeNode("Sub-box")] })));
  }
  function addSibling(path: number[]) {
    // Adds a sibling AFTER the node at `path` within its parent's children.
    if (path.length === 0) return;
    const idx = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    if (parentPath.length === 0) {
      setBoxes((prev) => {
        const next = prev.slice();
        next.splice(idx + 1, 0, makeNode("Box"));
        return next;
      });
      return;
    }
    setBoxes(
      mutateAt(parentPath, (parent) => {
        const next = parent.children.slice();
        next.splice(idx + 1, 0, makeNode("Sub-box"));
        return { ...parent, children: next };
      }),
    );
  }
  function remove(path: number[]) {
    if (path.length === 0) return;
    setBoxes(mutateAt(path, () => null));
  }
  function moveLeft(path: number[]) {
    if (path.length === 0) return;
    const idx = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    if (idx === 0) return;
    if (parentPath.length === 0) {
      setBoxes((prev) => {
        const next = prev.slice();
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        return next;
      });
      return;
    }
    setBoxes(
      mutateAt(parentPath, (parent) => {
        const next = parent.children.slice();
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        return { ...parent, children: next };
      }),
    );
  }
  function moveRight(path: number[]) {
    if (path.length === 0) return;
    const idx = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    if (parentPath.length === 0) {
      if (idx >= boxes.length - 1) return;
      setBoxes((prev) => {
        const next = prev.slice();
        [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
        return next;
      });
      return;
    }
    setBoxes(
      mutateAt(parentPath, (parent) => {
        if (idx >= parent.children.length - 1) return parent;
        const next = parent.children.slice();
        [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
        return { ...parent, children: next };
      }),
    );
  }

  const all = collectAll(boxes);
  return (
    <div className="w-full">
      <input type="hidden" name="boxes_json" value={JSON.stringify(boxes)} />

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50/50 p-6">
        <div className="flex min-w-fit flex-col items-center gap-3">
          <div className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white">
            Admin (you)
          </div>
          <Connector />

          <Row
            nodes={boxes}
            path={[]}
            depth={0}
            allNodes={all}
            actions={{
              updateAt, addChild, addSibling, remove, moveLeft, moveRight,
              expand, toggleLink,
            }}
          />
        </div>
      </div>

      {boxes.length === 0 && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => setBoxes([makeNode("Box")])}
            className="rounded-full border-2 border-dashed border-zinc-300 px-5 py-2 text-xs font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"
          >
            + Add root box
          </button>
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-zinc-500">
        <span className="font-mono">+ child</span> extends below ·{" "}
        <span className="font-mono">+ sibling</span> adds a parallel branch ·{" "}
        <span className="font-mono">←→</span> reorders peers ·{" "}
        <span className="font-mono">🔗</span> cross-links any two boxes ·{" "}
        <span className="font-mono">expand ↪</span> turns a count-N box into N independent siblings.
      </p>
    </div>
  );
}

interface Actions {
  updateAt: (path: number[], patch: Partial<ChartNode>) => void;
  addChild: (path: number[]) => void;
  addSibling: (path: number[]) => void;
  remove: (path: number[]) => void;
  moveLeft: (path: number[]) => void;
  moveRight: (path: number[]) => void;
  expand: (path: number[]) => void;
  toggleLink: (path: number[], otherId: string) => void;
}

function Row({
  nodes, path, depth, actions, allNodes,
}: {
  nodes: ChartNode[];
  path: number[];
  depth: number;
  actions: Actions;
  allNodes: { id: string; label: string }[];
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start justify-center gap-4">
      {nodes.map((node, i) => {
        const myPath = [...path, i];
        const palette = PALETTE[depth % PALETTE.length];
        return (
          <div key={node.id} className="flex flex-col items-center gap-2">
            <Card
              node={node} path={myPath} depth={depth}
              actions={actions} palette={palette} allNodes={allNodes}
            />
            {node.children.length > 0 && (
              <>
                <Connector />
                <Row nodes={node.children} path={myPath} depth={depth + 1} actions={actions} allNodes={allNodes} />
              </>
            )}
            {/* + child below */}
            <button
              type="button"
              onClick={() => actions.addChild(myPath)}
              className="mt-1 rounded-full border border-dashed border-zinc-300 bg-white px-3 py-0.5 text-[10px] text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
            >
              + child
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Card({
  node, path, depth, actions, palette, allNodes,
}: {
  node: ChartNode;
  path: number[];
  depth: number;
  actions: Actions;
  palette: { ring: string; chip: string };
  allNodes: { id: string; label: string }[];
}) {
  const unlimited = node.cap == null;
  const stackCount = !unlimited && node.cap! > 1 ? Math.min(node.cap!, 5) : 1;
  return (
    <div className="relative">
      {/* Visible stack: 1 base card + N-1 offset shadows behind it. */}
      {stackCount > 1 && (
        <>
          {Array.from({ length: stackCount - 1 }, (_, i) => (
            <div
              key={i}
              aria-hidden
              className={"absolute rounded-lg border bg-white ring-1 " + palette.ring}
              style={{
                inset: 0,
                transform: `translate(${(i + 1) * 5}px, ${(i + 1) * 5}px)`,
                opacity: 0.55 - i * 0.1,
                zIndex: -i - 1,
              }}
            />
          ))}
        </>
      )}

      <div className={"relative min-w-[220px] max-w-[280px] rounded-lg border bg-white p-3 shadow-sm ring-1 " + palette.ring}>
        <div className="flex items-start gap-2">
          <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " + palette.chip}>
            {depth + 1}
          </span>
          <input
            type="text"
            value={node.label}
            onChange={(e) => actions.updateAt(path, { label: e.target.value })}
            placeholder="Label"
            className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm font-semibold"
          />
          <button
            type="button"
            onClick={() => actions.remove(path)}
            title="Remove box"
            className="rounded border border-red-200 bg-red-50 px-1 py-0.5 text-[10px] text-red-700 hover:bg-red-100"
          >
            ✕
          </button>
        </div>
        <input
          type="text"
          value={node.description ?? ""}
          onChange={(e) => actions.updateAt(path, { description: e.target.value })}
          placeholder="Description (optional)"
          className="mt-2 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-700">
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(e) => actions.updateAt(path, { cap: e.target.checked ? null : 1 })}
            />
            Unlimited
          </label>
          {!unlimited && (
            <input
              type="number"
              min={1}
              value={node.cap ?? 1}
              onChange={(e) => actions.updateAt(path, { cap: Math.max(1, Number(e.target.value) || 1) })}
              className="w-14 rounded border border-zinc-300 px-1.5 py-0.5"
              title="How many parallel boxes — visualized as a stack."
            />
          )}
          <select
            value={node.bucketing}
            onChange={(e) => actions.updateAt(path, { bucketing: e.target.value as ChartNode["bucketing"] })}
            className="rounded border border-zinc-300 px-1.5 py-0.5"
            title="separate = scoped under each parent · combined = shared at root"
          >
            <option value="separate">separate</option>
            <option value="combined">combined</option>
          </select>
          {!unlimited && (node.cap ?? 1) > 1 && (
            <button
              type="button"
              onClick={() => actions.expand(path)}
              className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-medium hover:bg-zinc-50"
              title={`Split into ${node.cap} independent siblings`}
            >
              expand ↪
            </button>
          )}
        </div>

        {/* Visible link chips — collapsed view */}
        {(node.linksTo?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {(node.linksTo ?? []).map((tid) => {
              const target = allNodes.find((o) => o.id === tid);
              if (!target) return null;
              return (
                <span
                  key={tid}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700"
                  title={`Cross-link to "${target.label}"`}
                >
                  → {target.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Link to other boxes */}
        <details className="mt-2 group">
          <summary className="cursor-pointer select-none rounded px-1 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-700">
            🔗 Links ({node.linksTo?.length ?? 0})
          </summary>
          <div className="mt-1 max-h-32 space-y-1 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-1.5 text-[10px]">
            {allNodes.filter((o) => o.id !== node.id).length === 0 ? (
              <p className="italic text-zinc-400">No other boxes yet.</p>
            ) : (
              allNodes
                .filter((o) => o.id !== node.id)
                .map((o) => {
                  const on = node.linksTo?.includes(o.id) ?? false;
                  return (
                    <label key={o.id} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => actions.toggleLink(path, o.id)}
                      />
                      <span className={on ? "text-zinc-800" : "text-zinc-500"}>{o.label}</span>
                    </label>
                  );
                })
            )}
          </div>
        </details>

        <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => actions.moveLeft(path)}
              title="Move left"
              className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 hover:bg-zinc-50"
            >←</button>
            <button
              type="button"
              onClick={() => actions.moveRight(path)}
              title="Move right"
              className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 hover:bg-zinc-50"
            >→</button>
          </div>
          <button
            type="button"
            onClick={() => actions.addSibling(path)}
            className="rounded-full border border-dashed border-zinc-300 px-2 py-0.5 hover:border-zinc-400"
          >
            + sibling →
          </button>
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="my-0 flex justify-center">
      <div className="h-5 w-px bg-zinc-300" />
    </div>
  );
}

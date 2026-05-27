"use client";

import { useState } from "react";
import type { Tier } from "@/types/client-structure";

type RoleAs = "store" | "owner" | "employee" | "customer";
type Bucketing = "separate" | "combined";
type SubBuckets = "single" | "n" | "unlimited";

interface TierRow {
  key: string;
  label: string;
  roleAs: RoleAs;
  cap: string;
  unlimited: boolean;
  bucketing: Bucketing;
  subBucketsMode: SubBuckets;
  subBucketsN: string;
}

function slug(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/**
 * Same shape as DynamicTierEditor but seeded from an existing tier list.
 * Used on /admin/clients/[id]/edit so the admin reshapes a tenant in place.
 */
export function DynamicTierEditorHydrated({ initial }: { initial: Tier[] }) {
  const seed: TierRow[] = initial.map((t) => ({
    key: t.key,
    label: t.label,
    roleAs: t.roleAs,
    cap: t.cap == null ? "" : String(t.cap),
    unlimited: t.cap == null,
    bucketing: t.bucketing,
    subBucketsMode:
      t.bucketing === "separate"
        ? "single"
        : t.subBuckets === 1
          ? "single"
          : t.subBuckets == null
            ? "unlimited"
            : "n",
    subBucketsN: t.bucketing === "combined" && typeof t.subBuckets === "number" && t.subBuckets > 1
      ? String(t.subBuckets) : "",
  }));

  const [rows, setRows] = useState<TierRow[]>(seed);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function update(idx: number, patch: Partial<TierRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function add() {
    let k = "tier";
    let n = rows.length + 1;
    while (rows.some((r) => r.key === k)) k = `tier-${n++}`;
    setRows((prev) => [
      ...prev,
      { key: k, label: `Tier ${prev.length + 1}`, roleAs: "employee", cap: "", unlimited: true, bucketing: "separate", subBucketsMode: "single", subBucketsN: "" },
    ]);
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function reorder(from: number, to: number) {
    if (from === to) return;
    setRows((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function subBucketsValue(r: TierRow): number | null {
    if (r.bucketing !== "combined") return null;
    if (r.subBucketsMode === "single") return 1;
    if (r.subBucketsMode === "unlimited") return null;
    return Number(r.subBucketsN) || null;
  }

  const tiersForServer = rows.map((r) => ({
    key: r.key || slug(r.label),
    label: r.label,
    roleAs: r.roleAs,
    cap: r.unlimited ? null : Number(r.cap) || null,
    bucketing: r.bucketing,
    subBuckets: subBucketsValue(r),
  }));

  function previewPiece(r: TierRow): string {
    if (r.bucketing === "separate") return `${r.key}/<${r.key}>`;
    if (r.subBucketsMode === "single") return `${r.key}/_shared`;
    if (r.subBucketsMode === "n") return `${r.key}/[${r.subBucketsN || "N"} sub-folders]`;
    return `${r.key}/[∞ sub-folders]`;
  }
  const previewPath = rows.map(previewPiece).join(" / ");

  return (
    <div>
      <input type="hidden" name="tiers_json" value={JSON.stringify(tiersForServer)} />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Drag <span className="font-medium">⋮⋮</span> to reorder · Top is closest to admin.
        </p>
        <button type="button" onClick={add} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
          + Add tier
        </button>
      </div>

      <ol className="space-y-2">
        {rows.map((row, i) => {
          const isDragging = dragIndex === i;
          const isOver = overIndex === i && dragIndex !== i;
          return (
            <li
              key={row.key + "@" + i}
              draggable
              onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
              onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
              onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorder(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
              className={
                "rounded-lg border bg-white px-3 py-3 transition " +
                (isDragging ? "opacity-40 " : "") +
                (isOver ? "border-brand-500 ring-2 ring-brand-500/30 " : "border-zinc-200")
              }
            >
              <div className="grid grid-cols-12 items-end gap-3">
                <span className="col-span-1 cursor-grab self-center select-none text-lg text-zinc-400 hover:text-zinc-700 active:cursor-grabbing" title="Drag to reorder">⋮⋮</span>

                <label className="col-span-3 text-xs text-zinc-600">
                  Label
                  <input type="text" value={row.label} onChange={(e) => {
                    const lbl = e.target.value;
                    update(i, { label: lbl, key: row.key === slug(rows[i].label) || row.key === "" ? slug(lbl) : row.key });
                  }} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
                </label>

                <label className="col-span-2 text-xs text-zinc-600">
                  Key
                  <input type="text" value={row.key} onChange={(e) => update(i, { key: slug(e.target.value) })} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-xs" />
                </label>

                <label className="col-span-2 text-xs text-zinc-600">
                  Acts as
                  <select value={row.roleAs} onChange={(e) => update(i, { roleAs: e.target.value as RoleAs })} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                    <option value="store">store</option>
                    <option value="owner">owner</option>
                    <option value="employee">employee</option>
                    <option value="customer">customer</option>
                  </select>
                </label>

                <div className="col-span-2 text-xs text-zinc-600">
                  Max count
                  <input type="number" min={1} value={row.cap} onChange={(e) => update(i, { cap: e.target.value })} disabled={row.unlimited} placeholder="∞" className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-50 disabled:text-zinc-400" />
                  <label className="mt-1 flex items-center gap-1 text-[10px]">
                    <input type="checkbox" checked={row.unlimited} onChange={(e) => update(i, { unlimited: e.target.checked })} /> Unlimited
                  </label>
                </div>

                <label className="col-span-1 text-xs text-zinc-600">
                  Bucket
                  <select value={row.bucketing} onChange={(e) => update(i, { bucketing: e.target.value as Bucketing })} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs">
                    <option value="separate">separate</option>
                    <option value="combined">combined</option>
                  </select>
                </label>

                <div className="col-span-1 self-center text-right">
                  <button type="button" onClick={() => remove(i)} disabled={rows.length <= 1} className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50">✕</button>
                </div>
              </div>

              {row.bucketing === "combined" && (
                <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                  <span className="font-medium">Within the combined pool:</span>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name={`sub_${row.key}`} checked={row.subBucketsMode === "single"} onChange={() => update(i, { subBucketsMode: "single" })} />
                      1 single shared folder
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name={`sub_${row.key}`} checked={row.subBucketsMode === "n"} onChange={() => update(i, { subBucketsMode: "n" })} />
                      <span>multiple separated sub-folders</span>
                      <input type="number" min={1} value={row.subBucketsN} onChange={(e) => update(i, { subBucketsN: e.target.value })} disabled={row.subBucketsMode !== "n"} placeholder="N" className="ml-1 w-16 rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:bg-zinc-100 disabled:text-zinc-400" />
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="radio" name={`sub_${row.key}`} checked={row.subBucketsMode === "unlimited"} onChange={() => update(i, { subBucketsMode: "unlimited" })} />
                      unlimited separated sub-folders
                    </label>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {rows.length > 0 && (
        <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Path preview: <code className="font-mono text-zinc-800">{previewPath}</code>
        </p>
      )}
    </div>
  );
}

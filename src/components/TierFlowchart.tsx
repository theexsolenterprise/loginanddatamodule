"use client";

import { useState } from "react";
import type { Tier } from "@/types/client-structure";

type RoleAs = "store" | "owner" | "employee" | "customer";
type Bucketing = "separate" | "combined";
type SubBuckets = "single" | "n" | "unlimited";

interface BranchTierRow {
  key: string;
  label: string;
  cap: string;
  unlimited: boolean;
  bucketing: Bucketing;
}

interface InstanceRow {
  label: string;
  description: string;
  /** Per-instance override sub-chain. If empty, this instance uses the
   *  parent tier's default next level. If populated, fans into these
   *  branch tiers instead. */
  branch: BranchTierRow[];
}

interface TierRow {
  key: string;
  label: string;
  /** Computed silently from depth — not user-editable. */
  roleAs: RoleAs;
  cap: string;
  unlimited: boolean;
  bucketing: Bucketing;
  subBucketsMode: SubBuckets;
  subBucketsN: string;
  /** Per-instance labels/descriptions, only used when separate + capped. */
  instances: InstanceRow[];
  /** True when restoring a structure whose roleAs differs from depth — preserve override. */
  roleOverridden?: boolean;
}

function slug(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function padInstances(arr: InstanceRow[], n: number): InstanceRow[] {
  if (n <= 0) return arr.slice();
  if (arr.length >= n) return arr.slice(0, n);
  const out = arr.slice();
  while (out.length < n) out.push({ label: "", description: "", branch: [] });
  return out;
}

/** Auto-derive a sensible roleAs from a tier's depth in the chart. */
function inferRoleAs(depth: number): RoleAs {
  if (depth === 0) return "store";
  if (depth === 1) return "owner";
  if (depth === 2) return "employee";
  return "customer";
}

function defaultsFromInitial(initial: Tier[]): TierRow[] {
  if (initial.length === 0) {
    return [
      { key: "store", label: "Store", roleAs: "store", cap: "", unlimited: true, bucketing: "separate", subBucketsMode: "single", subBucketsN: "", roleOverridden: false, instances: [] },
      { key: "owner", label: "Owner", roleAs: "owner", cap: "", unlimited: true, bucketing: "separate", subBucketsMode: "single", subBucketsN: "", roleOverridden: false, instances: [] },
      { key: "employee", label: "Employee", roleAs: "employee", cap: "", unlimited: true, bucketing: "separate", subBucketsMode: "single", subBucketsN: "", roleOverridden: false, instances: [] },
      { key: "customer", label: "Customer", roleAs: "customer", cap: "", unlimited: true, bucketing: "combined", subBucketsMode: "unlimited", subBucketsN: "", roleOverridden: false, instances: [] },
    ];
  }
  return initial.map((t, i) => ({
    key: t.key, label: t.label, roleAs: t.roleAs,
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
    roleOverridden: t.roleAs !== inferRoleAs(i),
    instances: (t.instances ?? []).map((inst) => ({
      label: inst.label ?? "",
      description: inst.description ?? "",
      branch: (inst.branch ?? []).map((bt) => ({
        key: bt.key,
        label: bt.label,
        cap: bt.cap == null ? "" : String(bt.cap),
        unlimited: bt.cap == null,
        bucketing: bt.bucketing,
      })),
    })),
  }));
}

/** Depth-based palette — cycles after 6 levels. */
const DEPTH_PALETTE: { ring: string; chip: string }[] = [
  { ring: "ring-indigo-200",  chip: "bg-indigo-100 text-indigo-700" },
  { ring: "ring-emerald-200", chip: "bg-emerald-100 text-emerald-700" },
  { ring: "ring-sky-200",     chip: "bg-sky-100 text-sky-700" },
  { ring: "ring-amber-200",   chip: "bg-amber-100 text-amber-700" },
  { ring: "ring-rose-200",    chip: "bg-rose-100 text-rose-700" },
  { ring: "ring-violet-200",  chip: "bg-violet-100 text-violet-700" },
];
function paletteForDepth(d: number) {
  return DEPTH_PALETTE[d % DEPTH_PALETTE.length];
}

/**
 * TierFlowchart — visual org-chart-style builder for `clients.structure.tiers`.
 *
 * The chart reads top-to-bottom: admin (you) is implicit at the top, then
 * each card is one tier reporting to the one above. Use the up/down arrows
 * or drag the card to reorder; "+ Add tier below" appends to the bottom.
 *
 * Submits a single hidden `tiers_json` field — the same payload the server
 * actions already accept.
 */
export function TierFlowchart({ initial }: { initial: Tier[] }) {
  const [rows, setRows] = useState<TierRow[]>(() => defaultsFromInitial(initial));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function update(idx: number, patch: Partial<TierRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function updateInstance(tierIdx: number, instIdx: number, patch: Partial<InstanceRow>) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== tierIdx) return r;
        const capN = Number(r.cap) || 0;
        const padded = padInstances(r.instances, capN);
        const next = padded.map((inst, j) => (j === instIdx ? { ...inst, ...patch } : inst));
        return { ...r, instances: next };
      }),
    );
  }

  function moveInstance(tierIdx: number, from: number, to: number) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== tierIdx) return r;
        const capN = Number(r.cap) || 0;
        const padded = padInstances(r.instances, capN);
        if (from === to || from < 0 || to < 0 || from >= padded.length || to >= padded.length) return r;
        const next = padded.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return { ...r, instances: next };
      }),
    );
  }

  function addBranchTier(tierIdx: number, instIdx: number) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== tierIdx) return r;
        const capN = Number(r.cap) || 0;
        const padded = padInstances(r.instances, capN);
        const next = padded.map((inst, j) => {
          if (j !== instIdx) return inst;
          let k = "branch-tier";
          let n = (inst.branch?.length ?? 0) + 1;
          while (inst.branch?.some((b) => b.key === k)) k = `branch-tier-${n++}`;
          return {
            ...inst,
            branch: [
              ...(inst.branch ?? []),
              { key: k, label: `Sub-tier ${(inst.branch?.length ?? 0) + 1}`, cap: "", unlimited: true, bucketing: "separate" as Bucketing },
            ],
          };
        });
        return { ...r, instances: next };
      }),
    );
  }

  function updateBranchTier(tierIdx: number, instIdx: number, branchIdx: number, patch: Partial<BranchTierRow>) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== tierIdx) return r;
        const capN = Number(r.cap) || 0;
        const padded = padInstances(r.instances, capN);
        const next = padded.map((inst, j) => {
          if (j !== instIdx) return inst;
          const nb = (inst.branch ?? []).map((bt, bi) => bi === branchIdx ? { ...bt, ...patch } : bt);
          return { ...inst, branch: nb };
        });
        return { ...r, instances: next };
      }),
    );
  }

  function removeBranchTier(tierIdx: number, instIdx: number, branchIdx: number) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== tierIdx) return r;
        const capN = Number(r.cap) || 0;
        const padded = padInstances(r.instances, capN);
        const next = padded.map((inst, j) => {
          if (j !== instIdx) return inst;
          return { ...inst, branch: (inst.branch ?? []).filter((_, bi) => bi !== branchIdx) };
        });
        return { ...r, instances: next };
      }),
    );
  }
  function add() {
    let k = "tier";
    let n = rows.length + 1;
    while (rows.some((r) => r.key === k)) k = `tier-${n++}`;
    const depth = rows.length;
    setRows((prev) => [
      ...prev,
      {
        key: k, label: `Tier ${prev.length + 1}`,
        roleAs: inferRoleAs(depth),
        cap: "", unlimited: true, bucketing: "separate",
        subBucketsMode: "single", subBucketsN: "",
        instances: [],
      },
    ]);
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
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

  const tiersForServer = rows.map((r, i) => {
    const capNum = r.unlimited ? null : Number(r.cap) || null;
    // Only carry per-instance data when it actually applies.
    const carry = r.bucketing === "separate" && capNum != null;
    return {
      key: r.key || slug(r.label),
      label: r.label,
      // Auto-inferred from depth unless the row was loaded with an override.
      roleAs: r.roleOverridden ? r.roleAs : inferRoleAs(i),
      cap: capNum,
      bucketing: r.bucketing,
      subBuckets: subBucketsValue(r),
      instances: carry ? r.instances.slice(0, capNum).map((inst) => ({
        label: inst.label || undefined,
        description: inst.description || undefined,
        branch: (inst.branch ?? []).length > 0
          ? inst.branch.map((bt, bi) => ({
              key: bt.key || slug(bt.label) || `branch-${bi}`,
              label: bt.label || `Tier ${bi + 1}`,
              roleAs: inferRoleAs(i + 1 + bi), // depth = parent + position in branch
              cap: bt.unlimited ? null : Number(bt.cap) || null,
              bucketing: bt.bucketing,
              subBuckets: bt.bucketing === "combined" ? null : 1,
              instances: [],
            }))
          : undefined,
      })) : [],
    };
  });

  return (
    <div className="flex flex-col items-center">
      <input type="hidden" name="tiers_json" value={JSON.stringify(tiersForServer)} />

      {/* Admin badge — the implicit top of every chart */}
      <div className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm">
        Admin (you)
      </div>
      <Connector />

      {/* Tier cards */}
      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
          No tiers yet. Click "Add tier below" to start your chart.
        </div>
      ) : (
        rows.map((row, i) => {
          const isDragging = dragIndex === i;
          const isOver = overIndex === i && dragIndex !== i;
          const palette = paletteForDepth(i);
          return (
            <div key={i} className="flex w-full max-w-2xl flex-col items-center">
              <div
                draggable
                onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
                onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
                onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
                onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                className={
                  "w-full rounded-xl border bg-white p-4 shadow-sm ring-1 transition " +
                  palette.ring + " " +
                  (isDragging ? "opacity-40 " : "") +
                  (isOver ? "scale-[1.01] " : "")
                }
              >
                {/* Card header: level number, label, role pill, controls */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-1 items-center gap-3">
                    <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold " + palette.chip}>
                      {i + 1}
                    </span>
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => {
                        const lbl = e.target.value;
                        update(i, {
                          label: lbl,
                          key: row.key === slug(rows[i].label) || row.key === "" ? slug(lbl) : row.key,
                        });
                      }}
                      placeholder="Tier name"
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-base font-semibold text-zinc-900"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton title="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</IconButton>
                    <IconButton title="Move down" disabled={i === rows.length - 1} onClick={() => move(i, i + 1)}>↓</IconButton>
                    <IconButton title="Drag to reorder" tabIndex={-1}>⋮⋮</IconButton>
                    <IconButton title="Remove tier" onClick={() => remove(i)} variant="danger" disabled={rows.length <= 1}>✕</IconButton>
                  </div>
                </div>

                {/* Card body: row of compact controls */}
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <Field label="Path key">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => update(i, { key: slug(e.target.value) })}
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs"
                    />
                  </Field>
                  <Field label="How many?">
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={row.unlimited}
                          onChange={(e) => update(i, { unlimited: e.target.checked })}
                        />
                        Unlimited
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={row.cap}
                        onChange={(e) => update(i, { cap: e.target.value })}
                        disabled={row.unlimited}
                        placeholder="N"
                        className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:bg-zinc-100 disabled:text-zinc-400"
                      />
                    </div>
                  </Field>
                  <Field label="Bucketing">
                    <select
                      value={row.bucketing}
                      onChange={(e) => update(i, { bucketing: e.target.value as Bucketing })}
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs"
                      title="separate = scoped under each parent · combined = shared across peers"
                    >
                      <option value="separate">separate per parent</option>
                      <option value="combined">combined (shared)</option>
                    </select>
                  </Field>
                </div>

                {/* Per-instance editor — separate + capped only.
                    Each instance is a draggable card with its own label
                    and description (e.g. "Store 1" / "New York Mall Store"). */}
                {row.bucketing === "separate" && !row.unlimited && Number(row.cap) > 0 && (() => {
                  const capN = Math.min(Number(row.cap), 50); // hard guard
                  const instances = padInstances(row.instances, capN);
                  return (
                    <div className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-medium">Instances ({capN})</span>
                        <span className="text-[10px] text-zinc-500">
                          Drag <span className="font-mono">⋮⋮</span> or use ↑↓ to reorder
                        </span>
                      </div>
                      <ol className="space-y-2">
                        {instances.map((inst, j) => (
                          <InstanceCard
                            key={j}
                            tierLabel={row.label}
                            index={j}
                            total={capN}
                            value={inst}
                            paletteChip={palette.chip}
                            onChange={(patch) => updateInstance(i, j, patch)}
                            onMove={(dir) => moveInstance(i, j, j + dir)}
                            onReorder={(from, to) => moveInstance(i, from, to)}
                            onAddBranch={() => addBranchTier(i, j)}
                            onUpdateBranch={(bi, patch) => updateBranchTier(i, j, bi, patch)}
                            onRemoveBranch={(bi) => removeBranchTier(i, j, bi)}
                          />
                        ))}
                      </ol>
                    </div>
                  );
                })()}

                {/* Sub-bucket choice — appears only when bucketing is combined */}
                {row.bucketing === "combined" && (
                  <div className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                    <span className="font-medium">Inside the shared pool:</span>
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <label className="inline-flex items-center gap-1">
                        <input type="radio" name={`sub_${i}`} checked={row.subBucketsMode === "single"} onChange={() => update(i, { subBucketsMode: "single" })} />
                        1 single shared folder
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input type="radio" name={`sub_${i}`} checked={row.subBucketsMode === "n"} onChange={() => update(i, { subBucketsMode: "n" })} />
                        <span>multiple separated sub-folders</span>
                        <input
                          type="number"
                          min={1}
                          value={row.subBucketsN}
                          onChange={(e) => update(i, { subBucketsN: e.target.value })}
                          disabled={row.subBucketsMode !== "n"}
                          placeholder="N"
                          className="ml-1 w-14 rounded-md border border-zinc-300 px-2 py-1 disabled:bg-zinc-100 disabled:text-zinc-400"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input type="radio" name={`sub_${i}`} checked={row.subBucketsMode === "unlimited"} onChange={() => update(i, { subBucketsMode: "unlimited" })} />
                        unlimited sub-folders
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Connector to next card */}
              {i < rows.length - 1 && <Connector />}
            </div>
          );
        })
      )}

      {/* Add-tier button at the bottom of the chart */}
      <div className="my-4 flex flex-col items-center">
        {rows.length > 0 && <Connector dashed />}
        <button
          type="button"
          onClick={add}
          className="rounded-full border-2 border-dashed border-zinc-300 bg-white px-5 py-2 text-xs font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"
        >
          + Add tier below
        </button>
      </div>

      {/* Path preview helper */}
      {rows.length > 0 && (
        <div className="mt-4 w-full max-w-2xl rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <span className="font-medium">Folder layout preview:</span>{" "}
          <code className="font-mono text-zinc-800">
            {rows
              .map((r) => {
                if (r.bucketing === "separate") return `${r.key}/<${r.key}>`;
                if (r.subBucketsMode === "single") return `${r.key}/_shared`;
                if (r.subBucketsMode === "n") return `${r.key}/[${r.subBucketsN || "N"} sub]`;
                return `${r.key}/[∞ sub]`;
              })
              .join(" / ")}
          </code>
        </div>
      )}
    </div>
  );
}

/* ─── small UI helpers ────────────────────────────────────────────────────── */

function Connector({ dashed = false }: { dashed?: boolean }) {
  return (
    <div className="my-2 flex justify-center">
      <div className={"h-6 w-px " + (dashed ? "border-l-2 border-dashed border-zinc-300" : "bg-zinc-300")} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function IconButton({
  children, title, onClick, disabled, variant, tabIndex,
}: {
  children: React.ReactNode; title: string; onClick?: () => void;
  disabled?: boolean; variant?: "danger"; tabIndex?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={tabIndex}
      title={title}
      className={
        "inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs font-medium transition " +
        (variant === "danger"
          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50") +
        " disabled:cursor-not-allowed disabled:opacity-40"
      }
    >
      {children}
    </button>
  );
}

/* ─── Per-instance editor card ────────────────────────────────────────────── */

function InstanceCard({
  tierLabel, index, total, value, paletteChip, onChange, onMove, onReorder,
  onAddBranch, onUpdateBranch, onRemoveBranch,
}: {
  tierLabel: string;
  index: number;
  total: number;
  value: InstanceRow;
  paletteChip: string;
  onChange: (patch: Partial<InstanceRow>) => void;
  onMove: (dir: 1 | -1) => void;
  onReorder: (from: number, to: number) => void;
  onAddBranch: () => void;
  onUpdateBranch: (bi: number, patch: Partial<BranchTierRow>) => void;
  onRemoveBranch: (bi: number) => void;
}) {
  const placeholder = `${tierLabel} ${index + 1}`;
  const branch = value.branch ?? [];
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/instance-index", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData("text/instance-index"));
        if (!Number.isNaN(from)) onReorder(from, index);
      }}
      className="rounded-md border border-zinc-200 bg-white px-2 py-1.5"
    >
      <div className="grid grid-cols-12 items-center gap-2">
        <span className="col-span-1 cursor-grab select-none text-center text-sm text-zinc-400 active:cursor-grabbing" title="Drag to reorder">⋮⋮</span>
        <span className={"col-span-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold " + paletteChip}>
          {index + 1}
        </span>
        <input
          type="text"
          value={value.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={placeholder}
          className="col-span-3 rounded border border-zinc-300 px-2 py-1 text-xs"
        />
        <input
          type="text"
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Description — e.g. New York Mall Store"
          className="col-span-5 rounded border border-zinc-300 px-2 py-1 text-xs"
        />
        <div className="col-span-2 flex justify-end gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title="Move up"
            className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] hover:bg-zinc-50 disabled:opacity-40"
          >↑</button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            title="Move down"
            className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] hover:bg-zinc-50 disabled:opacity-40"
          >↓</button>
        </div>
      </div>

      {/* Branch sub-chain — this instance's parallel-flow override */}
      <details className="mt-2 group">
        <summary className="cursor-pointer select-none rounded px-2 py-1 text-[10px] text-zinc-600 hover:bg-zinc-50">
          🌿 Branch sub-chain ({branch.length}) — give this {tierLabel.toLowerCase()} its own children
        </summary>
        <div className="mt-2 space-y-1.5 rounded border border-zinc-200 bg-zinc-50/60 p-2">
          {branch.length === 0 && (
            <p className="text-[10px] italic text-zinc-500">
              No branch. This {tierLabel.toLowerCase()} inherits the default chain below.
            </p>
          )}
          {branch.map((bt, bi) => (
            <div key={bi} className="grid grid-cols-12 items-center gap-1.5 rounded border border-zinc-200 bg-white px-2 py-1">
              <span className="col-span-1 text-center text-[10px] font-mono text-zinc-400">{bi + 1}</span>
              <input
                type="text"
                value={bt.label}
                onChange={(e) => onUpdateBranch(bi, { label: e.target.value, key: slug(e.target.value) || bt.key })}
                placeholder="Sub-tier label"
                className="col-span-4 rounded border border-zinc-300 px-1.5 py-0.5 text-[11px]"
              />
              <label className="col-span-3 flex items-center gap-1 text-[10px] text-zinc-600">
                <input
                  type="checkbox"
                  checked={bt.unlimited}
                  onChange={(e) => onUpdateBranch(bi, { unlimited: e.target.checked })}
                />
                Unlimited
                <input
                  type="number"
                  min={1}
                  value={bt.cap}
                  onChange={(e) => onUpdateBranch(bi, { cap: e.target.value })}
                  disabled={bt.unlimited}
                  placeholder="N"
                  className="ml-1 w-10 rounded border border-zinc-300 px-1 py-0.5 text-[10px] disabled:bg-zinc-100 disabled:text-zinc-400"
                />
              </label>
              <select
                value={bt.bucketing}
                onChange={(e) => onUpdateBranch(bi, { bucketing: e.target.value as Bucketing })}
                className="col-span-3 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px]"
              >
                <option value="separate">separate</option>
                <option value="combined">combined</option>
              </select>
              <button
                type="button"
                onClick={() => onRemoveBranch(bi)}
                title="Remove branch tier"
                className="col-span-1 rounded border border-red-200 bg-red-50 px-1 py-0.5 text-[10px] text-red-700 hover:bg-red-100"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAddBranch}
            className="w-full rounded border border-dashed border-zinc-300 bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 hover:border-zinc-400"
          >
            + Add sub-tier under this {tierLabel.toLowerCase()}
          </button>
        </div>
      </details>
    </li>
  );
}

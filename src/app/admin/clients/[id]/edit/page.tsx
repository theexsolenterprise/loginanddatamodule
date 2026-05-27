import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  GraphNodeSchema,
  GraphEdgeSchema,
  ClientStructureSchema,
  defaultLabels,
  tiersFromGraph,
  type ClientLabels,
  type ClientStructure,
  type Tier,
} from "@/types/client-structure";
import { OrgGraphCanvas } from "@/components/OrgGraphCanvas";
import { ensurePrefix, getClientStore, storeNameForClient } from "@/lib/blobs";
import { defaultFolderPlan } from "@/lib/structure";
import { requireAdmin } from "../../../../../../auth";

export default async function EditClientPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [c] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!c) notFound();

  const labels = (c.labels ?? defaultLabels()) as ClientLabels;
  const structure = (c.structure ?? {}) as ClientStructure;

  async function save(formData: FormData) {
    "use server";
    await requireAdmin();
    const name = String(formData.get("name") ?? c.name).trim();
    const kind = String(formData.get("kind") ?? c.kind);

    // Preserve any stored labels; the editor no longer surfaces this form.
    const nextLabels = labels;

    const graphRaw = String(formData.get("graph_json") ?? "{}");
    let graph;
    try {
      graph = z.object({
        nodes: z.array(GraphNodeSchema),
        edges: z.array(GraphEdgeSchema),
      }).parse(JSON.parse(graphRaw));
    } catch {
      throw new Error("Invalid graph configuration.");
    }
    if (graph.nodes.length === 0) throw new Error("Add at least one box to the chart.");

    const tiers: Tier[] = tiersFromGraph(graph);

    const nextStructure = ClientStructureSchema.parse({
      graph,
      tiers,
      linkPolicy: String(formData.get("linkPolicy") ?? structure.linkPolicy ?? "flexible") as "strict" | "flexible",
      employeeTiers: formData.get("employeeTiers") === "on",
    });
    nextStructure.roles = Array.from(new Set(tiers.map((t) => t.roleAs)));

    await db.update(clients).set({
      name, kind, labels: nextLabels, structure: nextStructure, updatedAt: new Date(),
    }).where(eq(clients.id, c.id));

    // Reflect the new tier shape on disk: ensure any new top-level prefixes
    // exist. We don't delete old prefixes — that would lose data. Operators
    // who actually want to drop a removed tier's folder can do it manually
    // (or via a future migration tool).
    const storeName = c.blobsStore || storeNameForClient(c.id);
    const store = getClientStore(storeName);
    await store.set("_meta/manifest.json", JSON.stringify({
      clientId: c.id, provisionedAt: c.createdAt, updatedAt: new Date().toISOString(),
      structure: nextStructure,
    }, null, 2));
    for (const prefix of defaultFolderPlan(nextStructure)) {
      await ensurePrefix(store, prefix);
    }

    redirect(`/admin/clients/${c.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/clients/${c.id}`} className="text-xs text-zinc-500 hover:underline">
          ← Back to {c.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-zinc-900">Edit structure</h1>
        <p className="text-sm text-zinc-500">Reshape this tenant's tiers, labels, and bucketing. Existing data is preserved; new tier prefixes are added on save.</p>
      </div>

      <form action={save} className="space-y-8 rounded-xl border border-zinc-200 bg-white p-6">
        <section>
          <h2 className="text-sm font-semibold text-zinc-900">Identity</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-zinc-700">Display name</span>
              <input name="name" defaultValue={c.name} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-700">Kind</span>
              <input name="kind" defaultValue={c.kind} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-900">Company structure</h2>
          <p className="-mt-1 mb-3 text-xs text-zinc-500">
            Drag boxes anywhere on the canvas. Draw connections between any two boxes — many-to-one is supported.
          </p>
          <OrgGraphCanvas initial={structure.graph ?? { nodes: [], edges: [] }} />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-900">Tree policy</h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-zinc-700">Link policy</span>
              <select name="linkPolicy" defaultValue={structure.linkPolicy ?? "flexible"} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
                <option value="flexible">Flexible — children can hang off any ancestor</option>
                <option value="strict">Strict — every child must have a parent in the tier above</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="employeeTiers" defaultChecked={structure.employeeTiers ?? true} />
              Use primary / secondary employee tiers
            </label>
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-2">
          <Link href={`/admin/clients/${c.id}`} className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            Cancel
          </Link>
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800">
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}


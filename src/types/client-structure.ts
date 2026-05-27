import { z } from "zod";

/**
 * ClientLabels — what each role/node-type is called *inside* this tenant.
 * Defaults are filled in by `defaultLabels()` below; the admin can override
 * any subset at onboarding.
 *
 * Example overrides for a clinic:
 *   { store: "Hospital", owner: "Director", employee: "Doctor",
 *     customer: "Patient", employeePrimary: "Attending",
 *     employeeSecondary: "Resident" }
 */
export const ClientLabelsSchema = z.object({
  store: z.string().min(1).default("Store"),
  owner: z.string().min(1).default("Owner"),
  employee: z.string().min(1).default("Employee"),
  customer: z.string().min(1).default("Customer"),
  employeePrimary: z.string().min(1).default("Primary employee"),
  employeeSecondary: z.string().min(1).default("Secondary employee"),
});
export type ClientLabels = z.infer<typeof ClientLabelsSchema>;

/**
 * A single tier in a client's org chart.
 *
 * - `key`        — slug. Used in URLs and blob paths. Must be unique within
 *                  the client.
 * - `label`      — human-readable name (e.g. "Regional Manager").
 * - `roleAs`     — which base RBAC role this tier inherits. The label is
 *                  cosmetic; permissions come from `roleAs`. A client can
 *                  have many tiers that all map to e.g. "owner".
 * - `cap`        — soft upper bound on instances; `null` = unlimited.
 * - `bucketing`  — controls scoping:
 *     • "separate" → this tier is *scoped under its parent*. Each store gets
 *       its own owners; each owner gets its own employees. Path:
 *       `<parentKey>/<parentInstance>/<key>/<instance>/...`.
 *     • "combined" → this tier is *shared across all peers* of the tier
 *       above. One pool of customers shared by all stores. Path:
 *       `<key>/<instance>/...` (no parent prefix).
 */
export const TierSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  roleAs: z.enum(["store", "owner", "employee", "customer"]),
  cap: z.number().int().nullable().default(null),
  bucketing: z.enum(["separate", "combined"]).default("separate"),
  /**
   * When bucketing === "combined", controls subdivision of the shared pool:
   *   - 1     → single shared folder, all instances live in one place.
   *   - N     → up to N separated sub-folders inside the combined pool.
   *   - null  → unlimited separated sub-folders inside the combined pool.
   * Ignored when bucketing === "separate".
   */
  subBuckets: z.number().int().nullable().default(1),
});
export type Tier = z.infer<typeof TierSchema>;

/**
 * ClientStructure — shape of the org tree the tenant can hold.
 *
 * - `tiers`        — ordered list of tiers (top = closest to admin). Every
 *                    client gets a tiers array; the legacy `roles` field
 *                    below is derived from it for backwards compat.
 * - `linkPolicy`   — "strict": every child must have a parent in the tier
 *                    above. "flexible": children can hang off any ancestor.
 * - `employeeTiers`— toggle whether "primary/secondary" employee distinction
 *                    is exposed in this client's UI.
 * - `roles`        — *derived* convenience copy of each tier's `roleAs`.
 *                    Kept so old read paths keep working.
 */
export const ClientStructureSchema = z.object({
  tiers: z
    .array(TierSchema)
    .min(1)
    .default([
      { key: "store", label: "Store", roleAs: "store", cap: null, bucketing: "separate", subBuckets: 1 },
      { key: "owner", label: "Owner", roleAs: "owner", cap: null, bucketing: "separate", subBuckets: 1 },
      { key: "employee", label: "Employee", roleAs: "employee", cap: null, bucketing: "separate", subBuckets: 1 },
      { key: "customer", label: "Customer", roleAs: "customer", cap: null, bucketing: "combined", subBuckets: 1 },
    ]),
  linkPolicy: z.enum(["strict", "flexible"]).default("flexible"),
  employeeTiers: z.boolean().default(true),
  /** Legacy / derived. Don't write — set by mergeStructure() from tiers. */
  roles: z
    .array(z.enum(["store", "owner", "employee", "customer"]))
    .default([]),
});
export type ClientStructure = z.infer<typeof ClientStructureSchema>;

export function defaultLabels(): ClientLabels {
  return ClientLabelsSchema.parse({});
}
export function defaultStructure(): ClientStructure {
  return ClientStructureSchema.parse({});
}

/** Apply a partial override on top of the defaults. */
export function mergeLabels(over: Partial<ClientLabels> = {}): ClientLabels {
  return ClientLabelsSchema.parse({ ...defaultLabels(), ...over });
}
export function mergeStructure(over: Partial<ClientStructure> = {}): ClientStructure {
  const merged = ClientStructureSchema.parse({ ...defaultStructure(), ...over });
  // Always derive `roles` from `tiers` (single source of truth).
  merged.roles = Array.from(new Set(merged.tiers.map((t) => t.roleAs)));
  return merged;
}

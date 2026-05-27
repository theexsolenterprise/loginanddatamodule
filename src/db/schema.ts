import {
  pgTable,
  pgEnum,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ────────────────────────────────────────────────────────────────────────────
 * Enums
 *
 * `role` is the *system* role used for permission decisions. It is the same
 * across every client — what varies per client is the *label* (e.g. an
 * "employee" might be displayed as "Doctor") and the structure of the tree.
 * ──────────────────────────────────────────────────────────────────────────── */
export const roleEnum = pgEnum("role", [
  "admin", // The platform owner (you). Globally privileged.
  "store", // A location/branch/hospital — usually managed by an owner.
  "owner", // A business owner / franchisee / clinic director.
  "employee", // A staff member. The `isPrimary` flag toggles full vs. limited.
  "customer", // End user — buyer, patient, member, etc.
]);

export const nodeTypeEnum = pgEnum("node_type", [
  "store",
  "owner",
  "employee",
  "customer",
]);

export const clientStatusEnum = pgEnum("client_status", [
  "active",
  "suspended",
  "archived",
]);

/* ────────────────────────────────────────────────────────────────────────────
 * clients — one row per tenant (an ecommerce store, a hospital network, etc.)
 *
 * `labels`  : { store: "Branch", owner: "Manager", employee: "Doctor", ... }
 * `structure`: caps + rules for what the tenant can contain — see
 *              src/types/client-structure.ts for the typed shape.
 * ──────────────────────────────────────────────────────────────────────────── */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(), // url-friendly; e.g. "acme-ecom"
    name: text("name").notNull(),
    kind: text("kind").notNull(), // free-form: "ecommerce", "healthcare", ...
    status: clientStatusEnum("status").notNull().default("active"),
    labels: jsonb("labels").notNull().default({}), // see ClientLabels
    structure: jsonb("structure").notNull().default({}), // see ClientStructure
    blobsStore: text("blobs_store").notNull(), // Netlify Blobs store name
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("clients_slug_idx").on(t.slug),
  }),
);

/* ────────────────────────────────────────────────────────────────────────────
 * users — anything that can log in.
 *
 * - admin users have clientId = NULL (they're cross-tenant).
 * - every other user belongs to exactly one client.
 * - role is the *system* role; `isPrimary` only matters for employees.
 * - passwordHash is nullable so a user can be Google-only.
 * ──────────────────────────────────────────────────────────────────────────── */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    role: roleEnum("role").notNull(),
    isPrimary: boolean("is_primary").notNull().default(true),

    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    passwordHash: text("password_hash"),
    // `name` is required by the Auth.js DrizzleAdapter (it writes to it on
    // OAuth sign-up). We mirror first+last here on insert/update.
    name: text("name"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    image: text("image"),

    // Per-user permission *overrides* on top of role defaults. Optional.
    permissions: jsonb("permissions").notNull().default({}),

    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Email unique within a client; admins (clientId NULL) unique globally.
    // Postgres treats NULLs as distinct, which is what we want here:
    // two admins can't share an email, two clients can each have a "ceo@…".
    emailScopeIdx: uniqueIndex("users_email_client_idx").on(t.email, t.clientId),
    clientRoleIdx: index("users_client_role_idx").on(t.clientId, t.role),
  }),
);

/* ────────────────────────────────────────────────────────────────────────────
 * nodes — the per-client org tree.
 *
 * An ecommerce client might look like:
 *   store(HQ) ── owner(Alice) ── employee(Bob, primary) ── customer(C1, C2…)
 *
 * A hospital client might look like:
 *   store(General Hosp) ── employee(Dr. Smith, primary) ── customer(Patient42)
 *   (no "owner" node — the structure config simply doesn't require one)
 * ──────────────────────────────────────────────────────────────────────────── */
export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => nodes.id, {
      onDelete: "cascade",
    }),
    type: nodeTypeEnum("type").notNull(),
    name: text("name").notNull(),
    // Link to the login user, if this node is a person who logs in.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // Free-form per-node attributes (specialty, sku-prefix, license #, …).
    metadata: jsonb("metadata").notNull().default({}),
    blobPrefix: text("blob_prefix").notNull(), // e.g. "stores/HQ/owners/alice/"
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clientParentIdx: index("nodes_client_parent_idx").on(t.clientId, t.parentId),
    typeIdx: index("nodes_type_idx").on(t.clientId, t.type),
    userIdx: index("nodes_user_idx").on(t.userId),
  }),
);

/* ────────────────────────────────────────────────────────────────────────────
 * Auth.js (NextAuth) adapter tables — verbatim from @auth/drizzle-adapter
 * docs so Google OAuth + email magic-links work without surprises.
 * ──────────────────────────────────────────────────────────────────────────── */
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }),
);

/* ────────────────────────────────────────────────────────────────────────────
 * audit_log — append-only trail of who-did-what. Useful for compliance
 * and for the admin UI's "recent activity" panel.
 * ──────────────────────────────────────────────────────────────────────────── */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(), // e.g. "client.create", "user.password_change"
    target: text("target"), // free-form ID/name being acted on
    metadata: jsonb("metadata").notNull().default({}),
    at: timestamp("at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    clientAtIdx: index("audit_client_at_idx").on(t.clientId, t.at),
  }),
);

/* ── Relations ────────────────────────────────────────────────────────────── */
export const clientsRelations = relations(clients, ({ many }) => ({
  users: many(users),
  nodes: many(nodes),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  client: one(clients, { fields: [users.clientId], references: [clients.id] }),
  accounts: many(accounts),
  nodes: many(nodes),
}));

export const nodesRelations = relations(nodes, ({ one, many }) => ({
  client: one(clients, { fields: [nodes.clientId], references: [clients.id] }),
  parent: one(nodes, { fields: [nodes.parentId], references: [nodes.id], relationName: "parent" }),
  children: many(nodes, { relationName: "parent" }),
  user: one(users, { fields: [nodes.userId], references: [users.id] }),
}));

/* ── Inferred row types ───────────────────────────────────────────────────── */
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Node = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
export type Role = (typeof roleEnum.enumValues)[number];
export type NodeType = (typeof nodeTypeEnum.enumValues)[number];

# Architecture

## Data model

Three core tables plus Auth.js adapter tables and an audit log.

```
┌───────────────┐    1     ∞ ┌───────────────┐
│   clients     │────────────│    users      │
│ id            │            │ id            │
│ slug          │            │ clientId(FK)? │ ── null for admin
│ name          │            │ role          │
│ kind          │            │ isPrimary     │
│ labels  JSONB │            │ email         │
│ structure JSONB│           │ passwordHash? │ ── nullable: Google-only OK
│ blobsStore    │            │ firstName     │
│ status        │            │ lastName      │
└───────┬───────┘            └───────┬───────┘
        │ 1                          │ 0/1
        │                            │
        │ ∞                          │
┌───────▼───────────────────────────▼───────┐
│   nodes  (self-referencing org tree)      │
│ id, clientId(FK), parentId(FK→nodes.id)?  │
│ type ∈ {store, owner, employee, customer} │
│ name, userId(FK→users.id)?                │
│ blobPrefix     metadata JSONB             │
└───────────────────────────────────────────┘
```

Why three tables and not four:

- A **node** is an org-chart entity. A **user** is something that logs in.
- They link via `node.userId` (nullable — a customer record can exist as data
  without ever having a login).
- This lets us add data-only entities (kiosks, devices, API keys) without
  bending the auth model.

## Request flow — login

1. User visits `/login` and POSTs email + password (or clicks Google).
2. Auth.js `Credentials.authorize` looks up the email; if multiple users
   share that email across clients, admins (`clientId = null`) are matched
   first (they're more privileged), then per-client rows.
3. Auth.js mints a JWT cookie. Our `jwt` callback stamps `role`, `clientId`,
   `isPrimary`, `firstName`, `lastName` into the token.
4. Middleware reads the JWT cookie at the edge — no DB hit per request — to
   gate `/admin/*` vs `/app/*` and bounce unauthenticated traffic to `/login`.

## Request flow — tenant onboarding

1. Admin visits `/admin/clients/new`, fills the wizard.
2. Server action validates with Zod (`ClientLabelsSchema`, `ClientStructureSchema`).
3. Inserts a row in `clients`.
4. Calls `provisionClientStore({ clientId, structure })` which:
   - Creates a Netlify Blobs store named `client-<uuid>`.
   - Writes `_meta/manifest.json` so the store is "real".
   - Writes a `.placeholder` blob inside each top-level prefix
     (`stores/`, `owners/`, …) so the tree shows up in listings.
5. Updates the client row with the chosen `blobsStore` name.
6. Redirects to `/admin/clients/[id]`.

## Multi-tenancy boundaries

Tenant isolation is enforced at three layers:

| Layer       | Mechanism                                                     |
| ----------- | ------------------------------------------------------------- |
| Database    | Every business row has `client_id` (FK). Queries filter on it.|
| Auth session| JWT carries `clientId`; middleware blocks cross-client paths. |
| Storage     | One Netlify Blobs *store* per client. Stores are physically isolated namespaces — keys in one cannot leak into another. |

## Folder layout (code)

```
src/
├── app/                          # Next.js App Router pages
│   ├── login/                    # universal sign-in
│   ├── admin/                    # admin-only area
│   │   ├── settings/restore/     # merge-or-replace confirm
│   │   ├── clients/[id]/         # per-tenant CRUD
│   │   └── backups/              # backup listing
│   └── app/                      # store/owner/employee/customer
│       └── settings/             # self-service + subordinates + subtree backup
├── components/                   # shared UI (Shell, SettingsForm, …)
├── db/                           # Drizzle schema + client + seed
├── lib/                          # blobs, rbac, backup, email, structure
└── types/                        # zod schemas for labels & structure
netlify/functions/
└── scheduled-backup.ts           # cron: 0 0,12 * * *
middleware.ts                     # role-based route gates
auth.ts                           # Auth.js v5 config
```

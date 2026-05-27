# Extending the module

This module is *just* login + structural data + per-client blob storage.
The whole point of keeping it small is so other Quidvis projects can layer
domain-specific data on top.

## Add a new business table for one client kind (e.g. e-commerce orders)

1. Define the table in `src/db/schema.ts`. Always include
   `clientId uuid not null references clients(id) on delete cascade`.
2. Add the table to the per-client backup zip by extending `rowsForScope()`
   in `src/lib/backup.ts`. Append your rows under
   `clients/<clientId>/<your-table>.json`. Bump `BACKUP_SCHEMA_VERSION`.
3. Add a wipe + insert step in `restoreBackup()` symmetric to the existing
   nodes/users blocks.
4. Generate and apply a migration:

```bash
npm run db:generate
npm run db:migrate
```

## Add a new permission action

In `src/lib/rbac.ts`:

```ts
export const ACTIONS = {
  // …existing
  ORDER_REFUND: "order:refund",
} as const;

PERMISSIONS.admin.add(ACTIONS.ORDER_REFUND);
PERMISSIONS.owner.add(ACTIONS.ORDER_REFUND);
```

Then guard the route:

```ts
import { assertCan, ACTIONS } from "@/lib/rbac";
const session = await requireSession();
assertCan(asActor(session.user), ACTIONS.ORDER_REFUND);
```

## Add a new tier (e.g. "regional-manager" between store and owner)

1. Add to `roleEnum` in `src/db/schema.ts` + migrate.
2. Add to `RANK` and `PERMISSIONS` in `src/lib/rbac.ts`.
3. Add to `ClientLabelsSchema` and `ClientStructureSchema` in
   `src/types/client-structure.ts`.
4. Add to the navigation in `src/components/Shell.tsx`.

## Store blobs from a new feature

Use `getClientStore(storeNameForClient(clientId))` and write keys under your
own prefix (e.g. `orders/<orderId>.json`). The existing backup code mirrors
the entire client store, so your new prefix gets backed up automatically.

## Talk to this module from another website

Not supported by default — we explicitly didn't expose an API. When you
need it:

1. Add a route at `src/app/api/v1/<resource>/route.ts`.
2. Issue per-client API keys (a table linked to `clients`) and check them
   with a small `verifyApiKey(req)` helper.
3. Document the endpoint in `docs/api.md` (write that file when you create
   the first endpoint).

Keep the API minimal until you have a real consumer — premature surface
area is the most expensive mistake here.

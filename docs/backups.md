# Backups & restore

## Scopes

```ts
type BackupScope =
  | { kind: "system" }
  | { kind: "client";  clientId: string }
  | { kind: "subtree"; clientId: string; nodeId: string }
```

| Scope     | Who can use it                                   | Includes                                        |
| --------- | ------------------------------------------------ | ----------------------------------------------- |
| system    | admin                                            | every client, all users, all blobs              |
| client    | admin                                            | one client's users + tree + blobs               |
| subtree   | the user that owns the subtree root, or admin    | the user's node + descendants + their blobs     |

## Storage layout (in `admin-backups` Netlify Blobs store)

```
system/auto/<ISO>.zip
system/restore-points/<slug>--<ISO>.zip
clients/<clientId>/auto/<ISO>.zip
clients/<clientId>/restore-points/<slug>--<ISO>.zip
clients/<clientId>/subtree/<nodeId>/auto/<ISO>.zip
clients/<clientId>/subtree/<nodeId>/restore-points/<slug>--<ISO>.zip
```

## Zip contents

```
manifest.json
clients/<clientId>/meta.json            ← omitted for subtree backups
clients/<clientId>/users.json
clients/<clientId>/nodes.json
clients/<clientId>/blobs/<...>          ← verbatim mirror of client store
```

`manifest.json` includes `version`, `type`, `scope`, `label`, `createdAt`,
`clients[]`. Schema version is `BACKUP_SCHEMA_VERSION = 1`; restore refuses
mismatched versions.

## Automatic backups

`netlify/functions/scheduled-backup.ts`, cron `0 0,12 * * *`:

1. One system-wide auto backup.
2. One auto backup per client (so a single failing tenant doesn't block the rest).

Auto-backups are kept **forever** (no retention sweep). Manual restore points
likewise.

## API routes

| Route                              | Method | Body                  | Returns                       |
| ---------------------------------- | ------ | --------------------- | ----------------------------- |
| `/api/backups/create`              | POST   | `scope`, `label`      | 303 → settings page           |
| `/api/backups/restore-latest`      | POST   | `scope`              | 303 → `/settings/restore?key=…` |
| `/api/backups/download-latest`     | POST   | `scope`              | ZIP attachment                |
| `/api/backups/import`              | POST   | `scope`, multipart `file` | 303 → `/settings/restore?key=…` |
| `/api/backups/restore`             | POST   | `key`, `mode`        | 303 → settings page           |

Both restore-latest and import bounce to a confirm screen — the user picks
**Merge** or **Replace** before the destructive action runs.

## Merge vs Replace

- **Replace** — for each client in the backup, wipe its nodes + blobs (or
  the subtree's nodes + prefixed blobs) and reinsert from the zip. Strict
  rollback.
- **Merge** — upsert by primary key only. Existing rows newer than the
  backup stay. Safer, but can leave stale data.

The choice is logged in `audit_log.metadata.mode` so a future audit can tell
which kind of restore happened.

## RBAC

`src/lib/backup-rbac.ts` →

- `admin` can backup/restore any scope.
- Non-admins can only operate on **subtree** scopes where the scope's
  `nodeId` is themselves or a descendant in the tree.
- Walking the tree is done at request time, not cached, so role changes
  take effect immediately.

## What goes in a UI

`src/components/DataBackupCard.tsx` is the dark card from the reference
image. Four buttons → four API endpoints. Drop it into any page and pass
the right `scope` prop:

```tsx
<DataBackupCard scope={{ kind: "system" }} />
<DataBackupCard scope={{ kind: "client", clientId }} />
<DataBackupCard scope={{ kind: "subtree", clientId, nodeId }} />
```

The card auto-fetches the most recent backup in that scope to show the
"Latest restore point" timestamp.

# RBAC

## Rank table

```
admin     5
store     4
owner     3
employee  2   (×2 tiers: isPrimary = true | false)
customer  1
```

## Two permission functions

All access decisions go through `src/lib/rbac.ts`. There are exactly two
functions to learn:

### `canManage(actor, target)` — user-on-user

Can `actor` create / edit / disable / delete `target`?

```ts
admin                  → can manage anyone
self                   → can manage self always
employee (secondary)   → can manage NO ONE except self
same-client, higher-rank → can manage strictly-lower-rank users
cross-client           → never (except admin)
```

### `can(actor, action)` — actor-on-verb

Default-deny matrix. Each role gets a `Set<Action>`. Actions:

```ts
client:crud      client:backup    user:invite     user:disable
blob:write       blob:read        structure:edit  self:account
```

Roles:

| Role              | client:crud | user:invite | blob:write | blob:read | self:account |
| ----------------- | :---------: | :---------: | :--------: | :-------: | :----------: |
| admin             | ✓           | ✓           | ✓          | ✓         | ✓            |
| store             |             | ✓           | ✓          | ✓         | ✓            |
| owner             |             | ✓           | ✓          | ✓         | ✓            |
| employee primary  |             |             | ✓          | ✓         | ✓            |
| employee secondary|             |             |  (denied)  | ✓         | ✓            |
| customer          |             |             |            | ✓ (own)   | ✓            |

## "Who can I invite?" (UI)

| Logged-in role     | Can invite                            |
| ------------------ | ------------------------------------- |
| admin              | store / owner / employee / customer    |
| store              | owner / employee / customer            |
| owner              | employee / customer                    |
| employee (primary) | customer                               |
| employee (secondary)| (none)                                |
| customer           | (none)                                 |

## "Who shows up in my Team list?"

- **admin** — every user except themselves.
- **everyone else** — same-client users where `canManage` returns true.

## How to extend

Adding a new role:

1. Add to `roleEnum` in `src/db/schema.ts`.
2. Add rank to `RANK` in `src/lib/rbac.ts`.
3. Add entry to `PERMISSIONS` in `src/lib/rbac.ts`.
4. Add label fields to `ClientLabelsSchema` if it needs a custom display name.

Adding a new action:

1. Add to `ACTIONS` const in `src/lib/rbac.ts`.
2. Add to relevant role `Set<Action>` entries.
3. Call `assertCan(actor, action)` in the route handler.

That's the whole pattern. No matrix files, no role plugins, no inheritance.

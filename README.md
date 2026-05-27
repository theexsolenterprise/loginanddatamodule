# Quidvis — Login & Data Module

A small Next.js + Netlify app that gives any number of *client tenants* (an
e-commerce store, a hospital network, a school, …) a fully-configurable
five-tier login system, per-tenant blob storage, and a backup/restore system
that works at every level of the tree.

It is intentionally narrow in scope:

- **Login data only, for now.** Users, the org tree (stores / owners /
  employees / customers), and arbitrary per-tenant blob files. No
  domain-specific tables yet — those get bolted on later per client.
- **One central Netlify site.** Everyone signs in at the same URL. Their
  tenant is derived from their session.
- **No public API.** This module is a website, not a backend service. Clients
  will get their *own* websites later that talk to this same DB / blob store.

## Five roles

```
admin  →  store  →  owner  →  employee (primary | secondary)  →  customer
```

The hierarchy is *parameterized*, not hardcoded:

- Each tenant chooses which tiers exist (a clinic might skip "owner").
- Each tenant relabels them ("store" → "Hospital", "employee" → "Doctor",
  "customer" → "Patient").
- Each tenant caps how many of each tier exist, or leaves it unlimited.

## Stack

| Concern        | Choice                          |
| -------------- | ------------------------------- |
| Framework      | Next.js 15 (App Router)         |
| Hosting        | Netlify                         |
| Auth           | Auth.js v5 (Credentials + Google)|
| Database       | Neon Postgres + Drizzle ORM     |
| Blob storage   | Netlify Blobs (one store/tenant)|
| Email          | Gmail SMTP via OAuth2 (optional)|
| Auto-backup    | Netlify Scheduled Function (2×/day)|
| Restore prompt | Merge or Replace, every time    |

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
# edit DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID/SECRET, ADMIN_EMAIL/PASSWORD

# 3. Database
npm run db:generate     # generate migrations from schema
npm run db:migrate      # apply to Neon
npm run db:seed         # create bootstrap admin

# 4. Run
netlify dev             # http://localhost:8888  (recommended)
# or
npm run dev             # http://localhost:3000  (Next only)
```

## What you'll see

| URL                              | Who                |
| -------------------------------- | ------------------ |
| `/login`                         | everyone           |
| `/admin`                         | admin              |
| `/admin/clients`                 | admin — CRUD tenants |
| `/admin/clients/new`             | admin — onboarding wizard |
| `/admin/clients/[id]`            | admin — tenant detail |
| `/admin/backups`                 | admin — list backups |
| `/admin/settings`                | admin — profile, team, system backup |
| `/app`                           | store / owner / employee / customer |
| `/app/settings`                  | self profile, subordinates, my-subtree backup |
| `/app/settings/restore?key=…`    | merge-or-replace confirm |

## Docs

- [`docs/architecture.md`](docs/architecture.md) — data model & data flow
- [`docs/rbac.md`](docs/rbac.md) — roles, ranks, permissions, `canManage`
- [`docs/backups.md`](docs/backups.md) — scopes, formats, schedule, restore
- [`docs/extending.md`](docs/extending.md) — how to add domain-specific data later

## Credentials you need to provision

| What                       | Where                                 | Env var                  |
| -------------------------- | ------------------------------------- | ------------------------ |
| Neon Postgres URL          | console.neon.tech                     | `DATABASE_URL`           |
| Neon direct (DDL) URL      | same project, "direct" tab            | `DATABASE_URL_UNPOOLED`  |
| Auth.js secret             | `openssl rand -base64 32`             | `AUTH_SECRET`            |
| Google OAuth client        | console.cloud.google.com/apis/credentials | `AUTH_GOOGLE_ID/SECRET` |
| Gmail SMTP refresh token   | developers.google.com/oauthplayground/| `GMAIL_REFRESH_TOKEN`    |
| Gmail sender address       | your gmail/workspace address          | `GMAIL_SENDER`           |
| Admin bootstrap            | choose now                            | `ADMIN_EMAIL/PASSWORD`   |

For Netlify Blobs in dev, no creds needed — the SDK falls back to a local
`./.blobs/` directory automatically.

## License

Internal — Quidvis.

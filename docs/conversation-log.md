# Conversation log

A faithful record of every prompt and every decision behind the design of
this module. Kept here so future-you (or a collaborator) can answer "why is
it like this?" without spelunking git history.

Started: 2026-05-26.

---

## Prompts in order

### P1 — Original brief
> help me create a simple login system with 5 levels: admin, store, owner,
> employee (primary/secondary access option), and customer. admin is me and
> always at top. but when i create a client i will have different types of
> clients with different number of stores, owners, employees and customers
> that will be distributed control differently for different type of clients
> like store, doctor appointment, etc. so when as the admin from the
> settings tab i onboard a client i should be able to choose how many of
> each role and how their levels of login work for that company to be
> created and be able to be crud the different clients like this. this must
> also automatically create buckets and client store, owner, employees and
> customer data as per the structure of the company. for example, in an
> ecommerce store website client, we may have multiple stores, multiple
> owners, multiple employees and multiple customers all separated or
> combined based on the need whereas a doctor (employee) may have different
> hospitals (stores) and strictly linked customers (patients). so allow to
> label as well as create the structure for the company with multiple levels
> and set up the login and folder structure automatically under the overall
> admin folder. this enables us to create backup zips or manage all the data
> across clients and applications efficiently. use github, netlify, blobs
> and neon.

### P2
> ill create a new github, netlify and oauth as you need it

### P3
> make sure we also get to choose the number of owners, employees, stores or
> customers or keep it unlimited open.

### P4
> make all land on a default dashboard (admin, store, owner, employee,
> customer) and have the login details change in the settings tabs
> accessible through the side bar and top bar

### P5
> create zip folder based backup folder on top of the admin folder to manage
> a backup that is created by capturing an image of the the folder
> structures under admin of all the clients and their respective folder
> structures. this backup can be created for the entire system for all the
> clients or per client to create a restore point, restore from recent
> restore point, download backup, and upload backup to restore everything to
> that point. also have an automatic backup system to backup individual and
> the entire system with timestamps in addition to the restore point in
> case restore point isn't created. automatic backup twice a day for now.

### P6
> the store or owners or employees or customers should also be able to
> backup and restore with all the functionality for their data as per the
> structure of the client.

### P7
> `/home/ashish/Desktop/Quidvis Linux/QUIDVIS_LINUX/login and data module/image.png`
> use this for reference for the restore point CRUD and download and import.
>
> *(Image attached: dark card titled "Data Backup" with 4 stacked buttons —
> Create Restore Point (solid green), Restore From Latest (outline green),
> Download Backup (outline orange), Import Backup .json or .zip (outline
> gray). Footer: "Latest restore point: 5/26/2026, 8:36:03 PM".)*

### P8
> make sure the login details updating for the role and the people under
> them along with the backup system is in the settings tab of the
> respective login.

### P9
> use zip file. and login data only as the current data. this module of
> storage maybe extended to have any data but will be used as a login and
> data module to be used for different clients and their website
> development needs (both frontend and backend).

### P10 *(interrupt)*
> ask me as many questions as you want for clarity

### P11
> also maintain concise documentation for this simple login and data
> management module.

### P12
> let me know when you need login and names for github, netlify, or codes
> for oauth, or neon

### P13
> use localhost with netlify to check everything use dom and browser agent
> then give me to check once ready with everything. first ask me if you
> need anything along the way

### P14
> also create a file with a record of all my prompts and qa choices.

---

## Decisions (Q&A choices)

### Round 1 — initial scope
| Question                                                                | Answer                                                                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| How should the employee primary/secondary distinction work?            | **Two access levels of same role** (`isPrimary` boolean on `users`)                                 |
| Should the auth UI use email+password, or username+password?           | Email+password + firstname/lastname + Google OAuth; every level can change password / CRUD account |
| Where will this run, and do you want me to wire up Neon + Blobs now?   | **Scaffold only, I'll add creds**                                                                   |

### Round 2 — scope lock-in (after P9)
| Question                                                                 | Answer                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| How will this be deployed and consumed by client websites?               | **One central Netlify site**                                    |
| Will other apps talk to this module over an API?                         | **No — self-contained website only**                            |
| How do tenants route on the URL?                                         | **Single shared URL — tenant comes from the user's session**    |
| What goes in a backup ZIP at this stage?                                 | **Login data + blob storage** (current scaffold)                |

### Round 3 — operational details
| Question                                                                 | Answer                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| When importing a ZIP backup whose client IDs already exist, what should happen? | **Ask merge or replace at restore time; act on the choice**     |
| How do you want to handle password reset + user invite emails?           | **Google SMTP via OAuth**                                       |
| How long should auto-backups be retained?                                | **Keep everything forever**                                     |
| Where should this code live in your GitHub setup?                        | **Standalone repo**                                             |

### Round 4 — local-run unblockers
| Question                                                                 | Answer                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Neon DB — connection string now, or run Postgres a different way?        | **I'll paste a Neon URL now**                                   |
| Google OAuth — wire and test now, or skip locally?                       | **I'll create Google credentials now**                          |
| Netlify CLI — install globally?                                          | **Yes, install it globally**                                    |
| Local dev port                                                           | **8888 with Netlify CLI**                                       |

---

## What changed because of each decision

- **`isPrimary` on `users`** — keeps the schema minimal; one row per
  employee instead of two role variants.
- **JWT session strategy** — middleware can read role/clientId at the edge
  without a DB roundtrip per request.
- **One Netlify Blobs store per tenant** — physical isolation, not just
  logical. A bug constructing the wrong key can't cross tenants.
- **Backup includes blob storage** — restoring brings files back, not just
  rows. Schema-versioned (`BACKUP_SCHEMA_VERSION = 1`) so we can evolve.
- **Merge vs replace prompt** — destructive actions are never one-click;
  `/api/backups/restore-latest` and `/api/backups/import` both redirect to
  `/settings/restore?key=…` first.
- **Auto-backups never pruned** — `lib/backup.ts` has no retention sweep.
  Manual restore points and twice-daily auto-snapshots live forever in the
  `admin-backups` blobs store.
- **Google SMTP via OAuth** — `lib/email.ts` reuses the *same* OAuth client
  used for sign-in. Refresh token comes from the OAuth Playground once.
- **Standalone repo** — `.gitignore` and `README.md` are at the root; the
  Netlify site builds from this single directory.
- **Single shared URL** — no `/c/<slug>/` routing; the user's session is
  the tenant. Cuts URL parsing and DNS complexity.

---

*Keep this file growing as new decisions are made. When in doubt, write the
choice and a sentence about why.*

# UpTo MVP

A campus events and social app for Santa Clara University students, rebuilt as a
one-week CSEN 174 project. Students see what is happening on campus right now,
RSVP, post their own plans ("Up-Tos") with a public share link, drop quick map
pins for free food, and verify that they are SCU students; admins review
imported events and reports.

Scope was fixed by three lab documents (in `docs/labs/`): a feature is in scope
if and only if a lab claims it exists. [`docs/PROJECT.md`](docs/PROJECT.md) has
the full context: data model, API contract and team ownership.

## Layout

```
packages/contracts/   @upto/contracts: every API request/response type, and ROUTES
fixtures/             @upto/fixtures: sample data, the exact shape GET /events returns
backend/              Express 5 + TypeScript + Prisma 6 API
  prisma/schema.prisma  the data model (20 tables); prisma/migrations/; prisma/seed.ts
  src/app.ts, deps.ts   mounts every router; routes without one answer 501
  src/validators/       the six Lab 5 validators
  src/controllers/, src/routes/, src/services/
  lab-tests/            the 52 Lab 5 tests (lab-tests/extra/: more validator tests)
web/                  Next.js 15 app (App Router)
  app/(app)/            home, discover, create, profile, chat, map, notifications
  app/(auth)/           sign-in, sign-up
  app/admin/, app/u/    admin console, public Up-To share page
  components/, lib/     shared UI, data loading, RSVP
  styles/tokens.css     design tokens; components use tokens, never raw values
docs/                 PROJECT.md, the lab PDFs, reference screenshots
```

## Setup

### Prerequisites

- Node 20.12 or newer (the servers use `process.loadEnvFile`) and npm 10+
- A PostgreSQL database. The team uses Supabase; any Postgres works.

> **Linux and Windows: use `npm install`, not `npm ci`.** `package-lock.json`
> was generated on macOS and lists only the macOS builds of platform-specific
> packages (TypeScript's native compiler, esbuild, sharp). On Linux or Windows,
> `npm ci` installs exactly that list, and tools then fail with an unresolved
> platform package; for example `tsc` fails on Linux with
> `Unable to resolve @typescript/typescript-linux-x64`. `npm install` resolves
> the right builds for your machine.

### 1. Install and configure

```bash
npm install                      # every workspace (macOS: npm ci also works)
cp .env.example .env             # at the REPO ROOT, not backend/
```

Edit the root `.env`. Both servers read it from the root: the backend loads it
in `server.ts` and the web app in `next.config.ts`.

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres URL. For Supabase, the session pooler (port 5432). Required: the backend refuses to start without it. |
| `SESSION_SECRET` | Signs session cookies. Required in production; in development an insecure default is used if empty. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. |
| `PORT` | Backend port, default 4000. |
| `WEB_ORIGIN` | The web app's origin, e.g. `http://localhost:3000`. Used for CORS and as the origin of Up-To share links; unset, share links point at `https://up-to.co`. |
| `NEXT_PUBLIC_API_URL` | The backend's URL as the web app reaches it, e.g. `http://localhost:4000`. |
| `NEXT_PUBLIC_USE_FIXTURES` | `false` (the default) uses the real API. `true` runs the web app offline against `fixtures/`, with no backend. |

The `NEXT_PUBLIC_` values are built into the web app; rebuild it after changing them.

### 2. Create the database and seed it

The Prisma commands read `DATABASE_URL` from the environment, so load the root
`.env` into your shell first (bash/zsh):

```bash
cd backend
set -a && . ../.env && set +a

npx prisma migrate deploy        # applies prisma/migrations (schema + the Report check constraint)
npx prisma generate              # the Prisma client; rerun after every npm install / npm ci
SEED_PASSWORD=choose-a-password npx tsx prisma/seed.ts
```

The seed mirrors `fixtures/events.ts`, so Home looks like the screenshots, and it
moves every date to today by default (`SEED_LITERAL=1` keeps the fixtures'
original November 15, 2026 times). It is idempotent: running it again updates
the same rows. It creates 12 events (Right Now, Later today, This week, and one
event pending review), 2 drops, an Up-To with a poll, a chat room, and these
accounts:

| Username | Role |
| --- | --- |
| `abhi` | Verified SCU student, RSVP'd to one event |
| `edrick` | Admin (opens `/admin`) |
| `liz`, `abe` | Students |
| `seed01` … `seed30` | Placeholder students behind the going counts and votes |

All named accounts sign in with the `SEED_PASSWORD` you chose. **Always set it:**
without it the seed writes the accounts with no password. The team's shared
development database was seeded with `SEED_PASSWORD=upto-dev-2026`. Treat that
as a development-only password and reseed with a new one before anything is
deployed publicly.

### 3. Run

From the repo root, in two terminals:

```bash
npm run dev:backend              # API on http://localhost:4000  (GET /health)
npm run dev:web                  # web on http://localhost:3000
```

If the backend says `Port 4000 is already in use`, set `PORT` to a free port and
point `NEXT_PUBLIC_API_URL` at it.

### 4. Check

```bash
npm run typecheck                                    # backend and web
npm run build -w web                                 # production build
cd backend
npx tsx --test --test-reporter=spec lab-tests/*.test.ts                          # Lab 5: 52/52
npx tsx --test --test-reporter=spec src/routes/studentVerification.route.test.ts # Lab 6: 46/46
npx tsx --test lab-tests/*.test.ts lab-tests/extra/*.test.ts src/routes/*.test.ts \
  src/services/importer/*.test.ts src/app.test.ts                                # all 224
```

The tests use in-memory fake databases, so they need no database and no `.env`.

## What's built

### Screens

| Route | What it does |
| --- | --- |
| `/home` | Right Now, Later today and This week, each one of the server's event windows; Join (RSVP) on every event |
| `/discover` | Every upcoming event, by day. WHEN (Upcoming, Now, Today, This week, This quarter, Past) and SHOW ME (All, Free food, Clubs, Active, Career) filters with live counts; a detail pane with directions, sign-up and Join |
| `/sign-up`, `/sign-in` | Accounts; a new account goes on to verification |
| `/profile` | SCU email verification: a 6-digit code, then Continue to Home |
| `/create` | Post an Up-To and get its share link |
| `/u/:slug` | The public share page for an Up-To; works signed out |
| `/chat` | Group chat: room list, thread, send (REST, with refresh) |
| `/admin` | Admins only: the review queue (approve or reject imported events) and the reports queue |
| `/map`, `/notifications` | Placeholders; cut this week |

Live events show a NOW badge above the server's label ("NOW / 2 hrs left"). Every
time label, sign-up label and "live now" flag is computed by the server and shown
as is; neither page computes its own.

### API

36 of the 39 routes in `packages/contracts` (`ROUTES`) are implemented. Every
response is `{ ok: true, data }` or `{ ok: false, error: { code, message, field? } }`.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/signup`, `/auth/signin`, `/auth/google`, `/auth/signout`, `GET /auth/me` |
| Verification (Lab 6) | `POST /verify/send`, `/verify/confirm`, `/verify/switch` |
| Events | `GET /events` (windows `now`, `today`, `week`, `quarter`, `past`; `filter`, `category`, paging), `GET /events/:id`, `POST /events/:id/rsvp`, `POST /events/rsvp/sync` |
| Up-Tos and polls | `POST /uptos`, `GET /uptos/:id`, `GET /u/:slug`, `POST /uptos/:id/rsvp`, `/uptos/:id/poll`, `/uptos/:id/poll/respond`, `/uptos/:id/report` |
| Drops | `GET /drops`, `POST /drops`, `/drops/:id/vote`, `/drops/:id/report`, `/drops/rules-agreement` |
| Chat | `GET`/`POST /chat/rooms`, `PATCH /chat/rooms/:id`, `POST /chat/rooms/:id/members`, `GET`/`POST /chat/rooms/:id/messages`, `POST /chat/rooms/:id/mute`, `POST /chat/messages/:id/report` |
| Admin | `GET /admin/events/pending`, `POST /admin/events/:id/approve`, `/admin/events/:id/reject`, `GET /admin/reports` |
| Not implemented (501) | `GET /sources`, `POST /admin/flyer`, `GET /notifications` |

Events are also imported from SCU's LiveWhale calendar by hand:
`npx tsx src/services/importer/cli.ts` (from `backend/`, with the `.env` loaded).
Imported events arrive pending review.

### Tests: 224, all passing

| Suite | Tests |
| --- | --- |
| Lab 5 validators (`lab-tests/*.test.ts`) | 52/52 |
| Lab 6 verification (`src/routes/studentVerification.route.test.ts`) | 46/46 |
| Everything else: more validator and label tests, events, Up-Tos, drops, reports, admin, importer, app wiring | 126/126 |
| **Total** | **224/224** |

## Conformance with the labs

**Lab 4: architecture and class diagram.** Two actors (student, admin), two
clients in one Next.js app (the student web app and the admin console), a REST
API, and four server components (accounts, chat, events/Up-Tos/drops, importer)
over Postgres. The platform label moved from iOS to web; the structure did not.
Every class in the diagram is a table in `backend/prisma/schema.prisma`:

| Lab 4 class | Table(s) |
| --- | --- |
| User | `User` |
| CampusEvent, Attendance, EventSource | `CampusEvent`, `Attendance`, `EventSource` |
| UpTo | `UpTo`, `UpToRsvp` |
| Poll | `Poll`, `PollSlot`, `PollResponse` |
| Drop | `Drop`, `DropVote`, `DropRulesAgreement` |
| Report, DropReport, UpToReport | `Report`, one table with a `targetType` discriminator, narrowed back into `DropReport` and `UpToReport` in `packages/contracts` |
| Room, Message | `Room`, `RoomMember`, `Message` |
| Push notifications | `Notification` (the route is a stub) |

The remaining tables (`CampusVerificationChallenge`, `CampusVerificationCode`,
`AccountHandoff`) exist for Lab 6.

**Lab 5: unit testing.** The six validator files Lab 5 names are in
`backend/src/validators/`: `drops`, `poll`, `campusEventRsvp`, `upto`, `chat` and
`auth.validator.ts`. Their 52 tests are in `backend/lab-tests/`, one file per class
(`Drop`, `Poll`, `Attendance`, `UpTo`, `RoomMessage`, `User`), and run with the
command Lab 5 gives, from `backend/`:

```bash
npx tsx --test --test-reporter=spec lab-tests/*.test.ts      # 52/52
```

**Lab 6: regression testing.** `confirmVerification` is in
`backend/src/controllers/studentVerification.controller.ts`, built to the V2
control flow:
- up to three live codes per account, any of which works;
- using one spends all of them;
- five wrong guesses shared across them, counted on the challenge row;
- codes stored only as salted hashes (Node's built-in scrypt; PROJECT.md asks for
  bcrypt, and swapping it in changes only `services/verification/hashing.ts`);
- a single-use switch token bound to the account and the device.

`backend/src/routes/studentVerification.route.test.ts` (46 tests) reaches every
node, including S1 (an expired code answers 410 rather than "incorrect") and
R9b (two requests racing for one handoff, using the `slowDown` helper Lab 6
prints).

Lab 6 documents a *diff between two versions* of this function. A fresh build
has only one version, so its V1-versus-V2 comparison (for example, "24 of 36
selected") cannot be reproduced here. What is reproduced is V2 itself, with
every node covered by a test.

## Known limitations

- **Cut deliberately this week:** the Map screen, sockets (chat is REST with
  refresh), Gemini flyer reading, the scheduled importer (it runs by hand), and
  notifications.
- **Still 501:** `GET /sources`, `POST /admin/flyer`, `GET /notifications`.
- **`UpTo.contact`** is stored and validated, but `packages/contracts` does not
  include it yet, so the API does not return it and the share page cannot show it.
- **Chat message reports** are stored but do not appear in the admin reports
  queue, which lists drop and Up-To reports.
- **Speed:** Home takes about 1.1 s on a warm server, since it loads three event
  windows against a remote database. The backend's Prisma pool is capped at 5
  connections because Supabase's session pooler allows only 15 clients across
  everyone sharing the project; set `connection_limit` in `DATABASE_URL` to change it.
- **Sessions across hosts:** Home and Discover render on the Next server and
  forward the visitor's session cookie to the API. That works while the web app
  and the API share a host (as `localhost:3000` and `localhost:4000` do); a
  deployment on separate domains needs another approach.
- **Platform lockfile:** see the Linux and Windows warning under Prerequisites.

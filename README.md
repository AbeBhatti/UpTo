# UpTo MVP

Campus events and social app for Santa Clara University students, rebuilt as a
one-week class project. Scope is set by Labs 4, 5 and 6: see
[`docs/PROJECT.md`](docs/PROJECT.md) for the scope, data model, API contract and
file ownership, and `docs/labs/` for the lab documents.

## Layout

```
packages/contracts/   @upto/contracts — every API request/response type and ROUTES (shared)
fixtures/             @upto/fixtures — sample data; the literal shape GET /events returns (shared)
backend/              Express + TypeScript + Prisma API
  prisma/schema.prisma  18 tables (Abhi and Abe own it after commit 1)
  src/app.ts            mounts every route in ROUTES; unbuilt routes answer 501 (shared)
  src/validators/       the six Lab 5 validators
  lab-tests/            the 52 Lab 5 tests
web/                  Next.js 15 app (App Router)
  styles/tokens.css     brand values; no raw hex or magic pixels in components (shared)
  shell/                left rail / bottom tab bar
  app/(app)/            home, discover, map, chat, profile, notifications, create
  app/(auth)/           sign-in, sign-up
docs/                 project context, lab PDFs, reference screenshots
```

## Setup

Requires Node 20+ and npm 10+.

```bash
npm install                 # installs every workspace
cp .env.example .env        # then fill in DATABASE_URL
```

## Run

```bash
npm run dev:backend         # API on http://localhost:4000 (GET /health)
npm run dev:web             # web on http://localhost:3000
```

## Check

```bash
npm run prisma:validate -w backend      # needs DATABASE_URL set (any Postgres URL)
npm run typecheck                       # backend and web
npx tsx --test backend/src/app.test.ts  # every ROUTES entry answers 501, /health 200
npm run build -w web                    # production build
cd backend && npx tsx --test --test-reporter=spec lab-tests/*.test.ts   # Lab 5: must print 52 of 52
```

## Branches

`main` is protected. Work on your own branch (`edrick`, `liz`, `abhi`, `abe`),
push daily, and only edit the files your brief says you own. The shared files
(`packages/contracts/`, `fixtures/`, `web/styles/`, `backend/src/app.ts`,
`backend/prisma/schema.prisma`) change by announcing in the group chat, merging
to `main` within the hour, and everyone rebasing that day.

## Not built this week

The Map screen, sockets, the chat UI, Gemini flyer reading, the scheduled
importer, notifications, and poll and report UI. Their backend endpoints and
validators still ship where a lab needs them.

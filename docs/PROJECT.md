# UpTo MVP — shared project context

Read this before writing code. Your own brief in `briefs/` says what you build;
this says what the system is and what the rules are.

---

## 1. What we are building and why the scope is what it is

UpTo is a campus events and social app for Santa Clara University students. We
are rebuilding a bare version from scratch in one week.

**The scoping rule: a feature is in scope if and only if a lab document already
claims it exists.** The three labs are submitted and fixed, so they decide the
boundary rather than four people arguing about what "MVP" means. They also make
specific factual claims about a codebase — if we quietly drop a class or rename
a validator file, those documents become false.

So this is a *conformance* project. Three things must be true at the end:

| Lab | Claim we must make true |
| --- | --- |
| **Lab 4** | The component diagram and the class diagram describe our real structure |
| **Lab 5** | 52 unit tests pass across six named validator files |
| **Lab 6** | `confirmVerification` has the V2 control flow, node for node |

Everything the labs do not mention is out. That means **no** clubs, friends,
following, dining, gym, athletics, safety, search, trips, or off-campus drive
times — even though they are all over the screenshots.

### Cut for the one-week build

Map screen, sockets, chat UI, Gemini flyer reading, the scheduled importer,
notifications, poll and report UI. Their backend endpoints and validators still
ship where a lab needs them; only the features are cut.

**Validators are cheap, features are expensive.** `chat.validator.ts` and its 9
tests ship even though chat barely ships. Lab 5 stays at 52 of 52.

---

## 2. Architecture

```text
  ACTORS          CLIENTS                  SERVER                 STORES

  Student  -----> Up-To Web App            Up-To Server           Supabase
                  Next.js 15      --REST-->  Node + Express   -->  Postgres
                  [Edrick] shell,            TypeScript            18 tables
                           home,             Prisma
                           discover
                  [Liz]    create,         +-------------------+
                           admin, chat      | Accounts    [Abe] |
                                            | Chat        [Abe] |
  Admin    -----> Admin Console   --REST--> | Events etc [Abhi] |
                  [Liz]                     | Importer   [Abhi] |
                                            +-------------------+
```

Differences from the Lab 4 diagram, all deliberate:

1. **The client is web, not iOS.** Structure is unchanged — two actors, two
   clients, a REST API, four server components. Only the platform label moves.
2. **Push Notifications is an interface with a stub**, not Firebase.
3. **Campus Sources is one source**, not three. `EventSource` still has `type`
   and `url`, so adding more is a row and an adapter.

---

## 3. Data model

18 tables in `prisma/schema.prisma`. **Paste it as-is; do not redesign it.**
Every Lab 4 class is already there.

| Lab 4 class | Table(s) |
| --- | --- |
| `User` | `User` |
| `CampusEvent` | `CampusEvent` |
| `Attendance` | `Attendance` |
| `EventSource` | `EventSource` |
| `UpTo` | `UpTo`, `UpToRsvp` |
| `Poll` | `Poll`, `PollSlot`, `PollResponse` |
| `Drop` | `Drop`, `DropVote`, `DropRulesAgreement` |
| `Report` + `DropReport` + `UpToReport` | `Report`, single-table inheritance |
| `Room` | `Room`, `RoomMember` |
| `Message` | `Message` |
| *(Lab 6)* | `CampusVerificationChallenge`, `CampusVerificationCode`, `AccountHandoff` |
| *(Lab 4 push)* | `Notification` |

Two decisions you must not undo:

- **`Report` is one table with a `targetType` discriminator.** Prisma has no
  table inheritance. `packages/contracts` narrows it back into `DropReport` and
  `UpToReport` types, so the class diagram's subclasses still exist in code.
- **The attempt budget lives on `CampusVerificationChallenge`, not on the
  code row.** That is what makes the five wrong guesses *shared* across up to
  three live codes. Move it and Lab 6 cannot be implemented as written.

`schema.prisma` is a shared file. Changing it means announcing in the group
chat, merging to `main` within the hour, and everyone rebasing that day.

---

## 4. The API contract

`packages/contracts/src/index.ts` declares every request and response. **If the
frontend renders it, it is declared there. If it is declared there, the backend
returns exactly that — same field names, same nesting, same nulls.**

When the backend wants a different shape, the fix is to change `contracts` and
tell the group, never to return something else and let the client adapt.

### Response envelope, everywhere

```ts
{ ok: true,  data: T }
{ ok: false, error: { code, message, field? } }
```

### Error codes

`invalid_request` 400 · `unauthorized` 401 · `forbidden` 403 · `not_found` 404 ·
`campus_email_in_use` 409 · `expired` 410 · `attempts_exhausted` 410 ·
`incorrect` 422 · `class_of_out_of_range` 422 · `rate_limited` 429 ·
`server_error` 500

The verification codes come straight from Lab 6's returns R1–R13 and must keep
those exact spellings.

### Two server-computed contracts

Both exist so clients never recompute them and never disagree:

**Sign-up state.** The server sets `signup.state` and `signup.label`; the client
renders the label verbatim.

| State | Copy |
| --- | --- |
| `OPENS_LATER` | `Sign-ups open Fri 9 AM` |
| `OPEN` | `Sign up by Nov 9` |
| `CLOSED` | `Sign-ups closed` |
| `REQUIRED_UNKNOWN` | `Sign-up needed` |
| `NOT_REQUIRED` | *(nothing rendered)* |

**Time labels.** The server sets `timeLabel`: `2 hrs left`, `Until 5:00 p.m.`,
`Ends around 2:00 p.m.`, `NOW`, `Tomorrow 11:00 a.m.`

---

## 5. Lab 5 — the 52 tests

Six validator files at exactly these paths, plus a `lab-tests/` directory. This
command must work unchanged:

```bash
npx tsx --test --test-reporter=spec lab-tests/*.test.ts
```

| Validator | Test file | Tests | Owner |
| --- | --- | --- | --- |
| `src/validators/drops.validator.ts` | `lab-tests/Drop.test.ts` | 11 | Abhi |
| `src/validators/poll.validator.ts` | `lab-tests/Poll.test.ts` | 7 | Abhi |
| `src/validators/campusEventRsvp.validator.ts` | `lab-tests/Attendance.test.ts` | 8 | Abhi |
| `src/validators/upto.validator.ts` | `lab-tests/UpTo.test.ts` | 9 | Abhi |
| `src/validators/chat.validator.ts` | `lab-tests/RoomMessage.test.ts` | 9 | Abe |
| `src/validators/auth.validator.ts` | `lab-tests/User.test.ts` | 8 | Abe |

### Every limit the tests assert

| Rule | Value |
| --- | --- |
| Drop text | 3 to 80 **graphemes**, normalised before measuring |
| Drop votes | `HERE`, `GONE`, or `null` to withdraw |
| Drop rules version | integer, 1 to 2 |
| Drop coordinates | finite; lat ±90, lng ±180; `NaN`/`Infinity` rejected |
| Poll slots | 2 to 20; labels max 120 |
| Poll question | max 280, trimmed; whitespace-only rejected |
| Poll slot order | integer ≥ 0, may be omitted |
| RSVP statuses | three, case-insensitive, trimmed |
| RSVP sync batch | max 200 ids; ids max 191 chars; deduplicated |
| UpTo description | cleaned, then max 2,000 |
| UpTo contact | email, or phone of 7 to 15 digits |
| Report details | max 500; reason an exact enum value |
| Group name | 1 to 80, trimmed, **no line breaks** |
| Add members | 1 to 20, **exactly one list** supplied |
| Message revision | integer 0 to 50 |
| Mute | `null` or an ISO timestamp |
| Username | 3 to 30 · Password min 6 · Avatar seed max 64 |

### Helpers the tests reach through the validators

- `countGraphemes(text)` — an emoji with a skin-tone modifier counts as **one**.
  Use `Intl.Segmenter`.
- `normalizeDropText(text)` — collapse whitespace *before* measuring, so what is
  counted is what is stored.
- `classifyContact(input)` — returns `email`, `phone` or `null`.
- `cleanDescription(text)` — normalise line endings, strip invisible characters,
  collapse blank runs.

### Two conventions

1. **Every object schema is `.strict()`.** An unexpected key is a 400, not
   ignored. Three tests depend on this, including "a client cannot set
   server-owned fields like `authorId`".
2. **The `rejects()` helper checks the error message**, not just that it threw.
   Otherwise a test passes for the wrong reason. Put it in `lab-tests/support/`.

---

## 6. Lab 6 — confirmVerification

File: `src/controllers/studentVerification.controller.ts`.

**Up to 3 live codes per account. Any live code works. Using one spends all of
them. The 5 wrong guesses are shared.**

Every node below must be reachable:

| Node | Behaviour | Return |
| --- | --- | --- |
| N1 | Body fails to parse | `400 invalid_request` |
| N2 | Load the challenge | — |
| D2 | Build live-code list; empty or address mismatch | `410 expired` |
| D3 | `attempts >= 5` | `410 attempts_exhausted` |
| N3 | Atomically take an attempt slot | — |
| N4 | Re-read; address changed under us | `410` |
| **L1** | **Compare against each live code** | falls through on match |
| D4 | No live code matched | → S1 |
| **S1** | **Compare against expired codes too** | match → `410 expired` (RS) |
| N5 | No match anywhere | `422 incorrect` |
| N6 | Refund the attempt; define `spendChallenge()` | — |
| D5 | `classOf` out of range | `422 class_of_out_of_range` |
| N7 | Load me | `410 expired` |
| N8 | Another account holds this address | → N9 |
| **N9** | **Spend, create one handoff; lost the race** | `409` + switch token, or `410` (R9b) |
| D7, N10 | Class year jumped > 1 year → warn | — |
| N11 | Spend, stamp the account; lost the race | `410` / `200 verified` |
| E1 | Unique clash on the stamp | `409` / `500` |

**S1 and R9b are the two most often forgotten** and are exactly what Lab 6's own
new tests were written to cover.

Also required: `issueCampusVerificationCode` (keeps 3, **drops the oldest
first**, does not refill the budget, hourly limit), bcrypt-hashed codes,
`MAX_ATTEMPTS = 5` on the challenge row, and a single-use switch token bound to
account and device.

### Test harness

An in-memory fake database exposing `db.user`,
`db.campusVerificationChallenge`, `db.tables.accountHandoff` with Prisma's
method shapes, plus a `slowDown(model, method, ms)` helper that delays one call
by 30 ms so two requests overlap identically every run. **Lab 6 prints
`slowDown` verbatim in its appendix — copy it from there.**

**Honest note:** Lab 6 documents a *diff between two versions*. A fresh build has
only one version, so we cannot reproduce "24 of 36 selected". What we reproduce
is V2 itself, with tests covering every node.

---

## 7. File ownership

Nobody edits a file they do not own. This is what keeps four branches merging.

| Path | Owner |
| --- | --- |
| `packages/contracts/`, `fixtures/`, `web/styles/`, `backend/src/app.ts` | **Edrick**, changed by agreement |
| `app/(auth)/`, `app/(app)/layout.tsx`, `shell/`, `home/`, `discover/`, `components/` | Edrick |
| `app/(app)/create/`, `chat/`, `profile/`, `admin/`, `u/[slug]/` | Liz |
| `validators/{drops,poll,campusEventRsvp,upto}.validator.ts` | Abhi |
| `controllers/{events,uptos,drops,admin}.*` + matching routes | Abhi |
| `services/{drops,importer}/` | Abhi |
| `lab-tests/{Drop,Poll,Attendance,UpTo}.test.ts` | Abhi |
| `validators/{auth,chat,studentVerification}.validator.ts` | Abe |
| `controllers/{auth,studentVerification,chat}.*` + matching routes | Abe |
| `services/{verification,chat}/` | Abe |
| `lab-tests/{User,RoomMessage}.test.ts`, `routes/studentVerification.route.test.ts` | Abe |
| `prisma/schema.prisma` | **Abhi and Abe jointly** |

**The three shared files** — `schema.prisma`, `packages/contracts/`, `app.ts` —
change by: announce in the group chat, change it, merge to `main` within the
hour, everyone rebases that day. Expect this two or three times; it is routine.
What breaks a project is doing it quietly.

---

## 8. Order and integration

**Day 1** — Edrick alone on the critical path. Everyone else starts work with no
dependency on him. Nothing merges until commit 1 is on `main`.

**Days 2–5** — All four in parallel, in their own directories.

**Day 6 — integration, in this order.** Merging frontend before the API exists
means debugging two unknowns at once.

1. Merge Abe, then Abhi. Backend only.
2. **Run the Lab 5 suite. It must print 52 of 52.** Do not merge any frontend
   until it does.
3. Run the verification suite.
4. Point the frontend at the real API — one environment variable.
5. Merge Edrick, then Liz. Edrick first; Liz's screens live inside his shell.
6. Walk four paths end to end: sign up and verify; browse and RSVP; post an
   Up-To and open its share page; send a chat message.
7. Conformance pass: tick every Lab 4 class and method, and every Lab 6 node.

**Day 7** — Buffer. Schedule nothing.

### If something has to give

Cut in this order: chat (costs 9 Lab 5 tests, so only if desperate) → the import
script → Discover → the admin page.

**Never cut:** the six validators, the 52 tests, or `confirmVerification`.
Those three *are* the labs.

---

## 9. House rules

- No raw hex values and no magic pixel numbers in a component. Use the tokens.
  If there is no token for it, ask rather than inventing one.
- Findings are verified before they are reported. Reproduce it, then report it.
- **Tests are never weakened.** A failing test means fix the code — never loosen
  the assertion, skip the case, or widen a tolerance to go green.
- Push to your own branch daily, even unfinished. A branch that first appears on
  integration day is the thing that breaks integration day.

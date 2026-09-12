# InclineYou App — Claude working notes

@AGENTS.md

Expo / React Native client for InclineYou, a trainer-first coaching app. This directory
is the frontend half of a monorepo; the Spring Boot API lives in `../backend` and
has its own `CLAUDE.md` (start with `../backend/API.md` for the contract).

## Read these first

- `AGENTS.md` (imported above) — the SDK 54 pin. It is not optional context.
- `agent/` — the eight source-of-truth product docs, plus `agent/design system/`
  and `agent/interaction-map/`. Screens are drawn from the interaction map;
  frame numbers in code comments (e.g. "8a–8c", "drawer 2b") refer to it.

## Commands

```bash
npm start              # Expo dev server
npm run android        # expo run:android — needs a dev client, not Expo Go
npm run typecheck      # tsc --noEmit — the only automated check in this project
```

There is no test suite and no linter. `npm run typecheck` must pass.

Point the app at the API with `EXPO_PUBLIC_API_URL` in `.env` (copy
`.env.example`). Only `EXPO_PUBLIC_*` reaches the bundle — never put a secret
there, it ships in plain text inside the APK. Default is the Android emulator
host `http://10.0.2.2:8080`.

`google-services.json` is not in the repo; `app.config.js` only wires FCM when
the file is present, so builds without it work and simply have no push.

## Architecture

Feature-first, with pure logic separated from screens:

- `src/db` — WatermelonDB: `schema.ts`, `migrations.ts`, `models/` (24 models),
  and per-feature read/write helpers (`clients.ts`, `diary.ts`, `money.ts`, …).
- `src/sync` — the queue screen's content, derived from WatermelonDB's own dirty
  state (`db/pending.ts`), never from a separate outbox table.
- `src/api` — axios instance in `api/client.ts` plus one module per resource.
- `src/design` — the design system, ~90 components + `tokens.ts`.
- `src/navigation` — `RootNavigator` → `AuthStack` / `SetupStack` /
  `MainStack` + `AppTabs` (trainer) / `ClientStack` + `ClientTabs` (client).
- `src/screens` — `auth/`, `setup/`, `client/`, `main/{clients,diary,drawer,home,log,money}`.
- `src/store/AuthContext.tsx` — the session; token in `expo-secure-store`.
- Domain logic modules — `home/`, `clients/`, `diary/`, `money/`, `log/`,
  `training/`, `reports/`, `nudges/`, `settings/`, `push/`, `setup/`, `client/`,
  `team/`.

### Offline-first is the architecture, not a feature

Every write goes to the local SQLite database first and reconciles through
`db/sync.ts` (`/v1/sync/pull` + `/v1/sync/push`). Screens read from WatermelonDB
observables, never from a network response. A trainer on a gym floor with no
signal is the design centre — recorded money and completed sessions must survive
that, which is why sign-out blocks on unsynced writes.

Push rejections come back structured and are repaired locally
(`db/repair.ts`); see the `SyncRejection` docs in `db/sync.ts` for the
`kept: true/false` distinction.

### WatermelonDB migrations are immutable

Schema version is **19**. Bump `schema.version` and *append* a `toVersion` entry
to `db/migrations.ts` — **never edit a `toVersion` that has already run**, and
never write a destructive step. Trainers' phones carry data we cannot refetch.
This mirrors the backend's additive-only Flyway contract; the two move together.

### Ids are client-generated UUID v4

`db/index.ts` overrides WatermelonDB's id generator so every local id is a valid
PostgreSQL UUID. Offline writes need stable keys the server will accept as-is.

### Team coaching writes online — the one exception

`team/` is the only feature in this app that does **not** write to SQLite first,
and the exception is deliberate: every write to a team is a *permission change*,
and one authored offline would be replayed at an unknown later time — possibly
after the grant was revoked. So `api/team.ts` is awaited by the screens, and the
buttons are disabled offline with a banner that says why.

Reads are still local. `teams` and `team_members` are pull-only synced tables
(in the schema baseline, v1), so the Team screen draws from an observable with no signal like
every other screen — an admin on a gym floor can still see who their coaches
are. What is **not** synced is the rest of the team: teammates' clients, their
programs, their money. Those are online-only REST, and no role ever sees a
teammate's money book at all. See `backend/agent/InclineYou_team_coaching_prd.md`.

Three things to keep true when touching this:

- `team/team.ts`'s `capabilities()` / `memberActions()` are the app's copy of the
  backend's `TeamScope`. **They exist so a button is never drawn for an action
  the server will refuse.** If `TeamScope` changes, that file changes.
- After any successful write, call `syncDatabase('team')`. Without it the screen
  sits on stale local rows and the button looks broken.
- Screens show the server's `detail` and branch on its `code` — never the other
  way round. The fifteen team codes are already written for a trainer to read.

Where it lives: drawer → **Growth → Team** (frames 6a–6l), plus a card on Home
whenever an invitation is waiting, which is how an invited coach actually finds
it — nobody goes looking for a Team screen. The shared program shelf is also
reachable from **Programs** (3a), because that is where a coach hunting for a plan
actually goes.

**Phase 2 (built):** 6f team roster · 6g a teammate's client, read-only and with
no money on it · 6h the reassign sheet · 6i the shared shelf. `team/roster.ts` is
the derivation module, and it reuses `clients/roster.ts`'s 10/21-day drift
thresholds on purpose — two screens disagreeing about what "quiet" means is worse
than either number being wrong. These four are the only screens in the app with a
real loading state and a real offline dead end, because the data genuinely is not
on the phone; each one says so and points at the offline thing that does work.

**Phase 3 (built):** 6j edit a teammate's plan · 6k the change log · 6l the
owner's earnings. Two rules there: every edit through 6j is recorded server-side
and pushed to the coach whose client it is, so the screens say so *before* the
edit rather than leaving the coach to discover it; and the money copy on 6a and 6d
is **precise, not absolute** — "nobody opens anybody else's money book, the owner
sees monthly totals per coach". Don't restore the older absolute wording; the
revenue endpoint made it false.

One thing to know before touching a handover: a client reassigned away arrives on
the old coach's device **projected as `status: 'archived'`** rather than deleted.
That is what makes their money book keep working — it resolves names through
`client_id` for payments that stay theirs — and it is why no screen needed a
"handed over" concept. Don't "fix" it by tombstoning the client.

### Pure derivation modules

`home/deck`, `clients/roster`, `diary/diary`, `money/money` and friends are
**pure**: rows and `now` come in as arguments; they never read the database or the
clock. Keep new derivation logic in that shape — it's what makes the screens
testable by inspection and re-renderable from observables.

## The design system is mandatory

`src/design/index.ts` is the only surface screens should import from. No screen
may hard-code a colour, size, radius, or font — if something is missing, **add it
to the system**, don't inline it. `tokens.ts` is ported verbatim from
`agent/design system/inclineyoudesignsystem.html`, which is the source of truth; swap
the palette and the app reskins.

Two RN translations baked into the tokens: em letter-spacing is resolved to
absolute px, and `inset` box-shadows become `borderWidth`/`borderColor`.

## Feature flags — built, deliberately off

Do **not** rebuild or delete the code behind these:

| Flag | Where | Status |
| --- | --- | --- |
| `BATCHES_ENABLED` | `src/diary/diary.ts` | diary frame 3d built, off — deferred post-MVP |
| `SELF_TRAINING_ENABLED` | `src/settings/prefs.ts` | drawer 2b built, off since 15 Aug 2026 |
| `WHATSAPP_OTP_ENABLED` | `src/api/auth.ts` | off — SMS/stub OTP only |

## Conventions

- TypeScript throughout; screens are function components with hooks.
- The OTP resend ladder in the app mirrors `app.otp.resend-ladder-seconds` on the
  backend — change both or the countdown lies.
- Money is rendered through `home/time`'s `rupees` / `rupeesShort`; never
  hand-format currency.
- The exercise library is **text-only** — no thumbnails or demo GIFs. The
  upstream artwork is © Gym visual and unlicensed for us; it was removed on
  17 Aug 2026. Every "free" GIF dataset is the same artwork re-uploaded.
- Template days are **ordinal slots**; weekdays and times are chosen per client at
  apply time into `program.schedule`, and the count must match or apply 400s.
- Comments in this codebase explain the product reasoning behind a choice (see
  the headers of `money/money.ts` and `sync/queue.ts`). Match that density and
  voice — say why, in the words a trainer would use.

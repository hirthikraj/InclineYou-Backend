# XRep App — Claude working notes

@AGENTS.md

Expo / React Native client for XRep, a trainer-first coaching app. This directory
is the frontend half of a monorepo; the Spring Boot API lives in `../backend` and
has its own `CLAUDE.md` (start with `../backend/API.md` for the contract).

## Read these first

- `AGENTS.md` (imported above) — the SDK 54 pin. It is not optional context.
- `agent/` — the five source-of-truth product docs, plus `agent/design system/`
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

- `src/db` — WatermelonDB: `schema.ts`, `migrations.ts`, `models/` (22 models),
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
  `training/`, `reports/`, `nudges/`, `settings/`, `push/`, `setup/`, `client/`.

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

Schema version is **18**. Bump `schema.version` and *append* a `toVersion` entry
to `db/migrations.ts` — **never edit a `toVersion` that has already run**, and
never write a destructive step. Trainers' phones carry data we cannot refetch.
This mirrors the backend's additive-only Flyway contract; the two move together.

### Ids are client-generated UUID v4

`db/index.ts` overrides WatermelonDB's id generator so every local id is a valid
PostgreSQL UUID. Offline writes need stable keys the server will accept as-is.

### Pure derivation modules

`home/deck`, `clients/roster`, `diary/diary`, `money/money` and friends are
**pure**: rows and `now` come in as arguments; they never read the database or the
clock. Keep new derivation logic in that shape — it's what makes the screens
testable by inspection and re-renderable from observables.

## The design system is mandatory

`src/design/index.ts` is the only surface screens should import from. No screen
may hard-code a colour, size, radius, or font — if something is missing, **add it
to the system**, don't inline it. `tokens.ts` is ported verbatim from
`agent/design system/xrepdesignsystem.html`, which is the source of truth; swap
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

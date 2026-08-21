# XRep — monorepo notes

XRep is a trainer-first coaching app for independent personal trainers in India:
a roster, workout programs, a session diary, and a cash/UPI money book that works
with no signal on a gym floor.

Two halves, each with its own `CLAUDE.md` — **read the one for the half you're
working in**; this file only covers what spans both.

| Path | What it is | Its notes |
| --- | --- | --- |
| `backend/` | Spring Boot 4.1 · Java 21 · Postgres 16 · Redis 7 | `backend/CLAUDE.md` |
| `app/` | Expo SDK 54 · React Native 0.81.5 · WatermelonDB | `app/CLAUDE.md` |

## The contract between them

`backend/API.md` is the source of truth for the wire format — endpoints, the
authorization table, rate-limit tiers, and the error `code` catalogue the app
branches on. Change an endpoint, change that file in the same commit.

**Schema evolution is additive-only, on both sides, in lockstep.** The backend's
Flyway migrations (`backend/src/main/resources/db/migration`, V1…V27) and the
app's WatermelonDB migrations (`app/src/db/migrations.ts`, schema v19) follow the
same law: append a new version, never edit one that has run, never drop or
repurpose a column, never remove a response field. Trainers' phones carry data we
cannot refetch, and old builds must keep working.

**Offline-first is the architecture, not a feature.** The app writes to local
SQLite and reconciles through `/v1/sync/pull` + `/v1/sync/push`. Treat REST as the
online complement. Ids are client-generated UUID v4 so an offline write has a key
the server accepts as-is.

Three rules that touch both halves:

- The OTP resend ladder is duplicated — `RESEND_LADDER` in `app/src/api/auth.ts`
  and `app.otp.resend-ladder-seconds` in `application.yml`. Change both or the
  countdown lies.
- The exercise library is **text-only**. The upstream artwork is © Gym visual and
  unlicensed for us; V22 dropped the media columns on 17 Aug 2026. Every "free"
  GIF dataset is the same artwork re-uploaded.
- **A team widens reads; it never moves ownership.** V26 added team coaching
  (`backend/agent/XRep_team_coaching_prd.md`). No table gained a `team_id`, no
  existing endpoint changed what it returns, and only `team` + `team_member` enter
  sync — teammates' clients are online-only REST, and no role ever sees a
  teammate's money book — except an owner-only, totals-only revenue roll-up, whose
  arrival changed the app's copy in the same commit. All three phases are built on
  both halves (drawer 6a–6l).
  The team screens are the one place in the app that writes online instead of to
  SQLite, because a permission change must never be queued — and reassignment is
  the one place a client row is *projected* per caller rather than mirrored.
- Template days are **ordinal slots**. Weekdays and times are chosen per client at
  apply time into `program.schedule`; the count must match or apply 400s.

## Local development

```bash
docker compose up -d                      # Postgres + Redis for the backend
cd backend && ./mvnw spring-boot:run      # API on :8080
cd app && npm start                       # Expo dev server (needs a dev client)
```

`docker-compose.yml` runs Redis with `--appendonly yes` deliberately: the OTP
wrong-attempt lock and daily send ceiling are abuse controls, and a Redis without
AOF turns "three attempts" into "three attempts per deploy". Don't drop the flag.

## CI

`.github/workflows/ci.yml`, two jobs, both must pass:

- **backend** — `./mvnw -B verify` against a Postgres service container.
  Note there is **no Redis in CI**, so the suite runs on the Postgres OTP store
  and in-process rate-limit buckets. Anything that only works with Redis present
  will pass locally and fail — or silently skip — here.
- **app** — `npm ci` then `npm run typecheck`. There is no test suite and no
  linter on the app side; typecheck is the whole gate.

## Product docs — three copies, kept identical

The eight source-of-truth docs (requirements and plan, core data model,
interaction map, developer getting-started, manual test plan, growth roadmap,
deployment runbook, AI feature spec) exist in **three places**, and as of
20 Aug 2026 all three are byte-identical:

- `notes/` — the tracked copy, and the only one under version control
- `backend/agent/` and `app/agent/` — untracked working copies

**Edit one, copy to the other two, and make sure `notes/` is among them** — it is
the only copy git protects. The drift that existed before (`XRep_core_data_model.md`
was a version behind in `notes/`, missing the V24/V25 notes on `program.schedule`,
`duration_seconds`, and ordinal day slots) is resolved; keep it that way.

Each location also carries extras the others lack:

- `notes/` only — `core_data_model_erd.html`, `interaction-map/gen_flow.py` (the
  script that renders the flow diagrams), `PushMore_waitlist_copy.html`
- `notes/design system/` and `app/agent/design system/` — `xrepdesignsystem.html`,
  the source of truth for `app/src/design/tokens.ts`, plus the 11 screen designs
  the interaction map's frame numbers refer to. Now tracked via `notes/`.

## Stray paths

`out/` is IntelliJ compile output, now gitignored — it had committed a stale
`application.yml` and a duplicate `V1__init_schema.sql`. Nothing builds from it;
don't edit it and don't mistake that migration for the real one in
`backend/src/main/resources/db/migration/`. `system/screens/` is empty and untracked.

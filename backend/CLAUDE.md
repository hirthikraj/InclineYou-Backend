# XRep Backend — Claude working notes

Spring Boot 4.1 / Java 21 REST API for XRep, a trainer-first coaching app. This
directory is the backend half of a monorepo; the Expo client lives in `../app`
and has its own `CLAUDE.md`.

## Read these first

- `API.md` — the complete endpoint reference, the authorization table, the rate-limit
  tiers, and the error `code` catalogue. **Keep it in sync with any endpoint change.**
- `SCHEMA.md` — the same thing for the database: all 28 tables, every column with
  the migration that added it, all 53 foreign keys, the uniqueness and check
  constraints, the index inventory, and the table→sync-collection mapping.
  **Keep it in sync with any migration.**
- `agent/` — the nine source-of-truth product docs (requirements, data model,
  interaction map, getting-started, manual test plan, growth roadmap, deployment
  runbook, AI feature spec, gym platform PRD). Consult them before inventing
  product behaviour;
  don't reopen decisions they've settled.

## Commands

```bash
docker compose -f ../docker-compose.yml up -d   # Postgres 16 + Redis 7
./mvnw spring-boot:run                          # run on :8080
./mvnw test                                     # full test suite
./mvnw test -Dtest=OtpServiceTest               # one class
./scripts/seed-sample-month.sh <phone>          # 6 clients, one month — the small seed
./scripts/seed-full-demo.sh <phone>             # 44 clients, every feature — the big seed
./scripts/seed-realistic-20.sh <phone>          # 20 clients, a plausible week — the realistic seed
```

The three seed scripts are alternatives, not layers — running one over another
duplicates working hours and price lists. All are scoped to the trainer whose
phone you pass, which must be the phone signed in on the device.

**One trainer coaches one client at a time, and the two newer seeds enforce it.**
`seed-full-demo` and `seed-realistic-20` both derive the timetable rather than
typing an hour per client: each `(weekday, band)` is a queue, `row_number()` over
that partition picks one of four positions, and the position sets the time on a
75-minute pitch — 06:00 · 07:15 · 08:30 · 09:45, then 17:00 · 18:15 · 19:30 ·
20:45, inside a 06:00–11:00 / 17:00–22:00 split shift, Mon–Sat. Two clients on
one day therefore *cannot* be given one time. Both assert it before committing,
against the rows actually written:

- every client's chosen weekdays cover their template's ordinal days exactly
  once, the rule `POST /v1/templates/{id}/apply` enforces;
- no session runs past the shift; and
- no two of the trainer's sessions **overlap** — measured against each session's
  own duration, not merely a shared start time.

Both print the week as a grid when they finish, so it is visible rather than
merely claimed. **Neither seeds a batch**: a batch is several clients in one
slot, which is the one shape a one-at-a-time dataset cannot hold. Reach for
`seed-sample-month` if you need the diary's batch row.

Which one: `seed-sample-month` is the smallest honest dataset, enough for a
screen to render while you work on it. `seed-realistic-20` aims at PLAUSIBILITY
— 20 clients, all of them coached, nine weeks of logged history and two ahead.
`seed-full-demo` aims at COVERAGE: 44 clients so the A–Z rail exists
(`INDEX_RAIL_MIN = 40`), every state the roster can draw, and rows in every table
sync pulls.

Forty-four is more than one person can coach — 138 sessions and 137 hours a week
against a 48-session shift — so full-demo splits the roster with a `books`
column: **19 clients are on the diary, 25 are on the books**. The other 25 keep
their plan, pack, payments, measurements and a weekly slot on file, in states
that legitimately have no sessions this quarter (paused, inactive, invited,
archived, declined, removed, not yet set up). Their slot may be one a coached
client also holds — they never meet on a real date. That split is what lets the
same file be both a 44-client roster and a diary one person could work; the old
version resolved it by double-booking five people at 6am.

All three are now on V24 semantics — ordinal template days, `program.schedule`,
weekdays translated onto `program_exercise.day_of_week` exactly as apply does it.
`seed-sample-month` is the exception and still bakes weekdays into the
blueprint, so copy from one of the other two.

## Architecture

`com.xrep.xrep_backend`, one package per feature, each a thin
`*Controller` over a `*Service`:

`auth` · `client` · `exercise` · `template` · `program` · `session` ·
`progress` · `payment` · `report` · `nudge` · `push` · `sync` · `trainer` ·
`team`

Cross-cutting: `config` (security, Redis, health, `AppProperties`),
`ratelimit`, `exception` (the global RFC-7807 handler), `entity` + `repository`
(JPA), `seed`.

### Persistence is deliberately split

Only five things are JPA entities — `AppUser`, `Trainer`, `Client`, `BodyMetric`,
`OtpRequest`. Everything else (programs, sessions, packages, payments, set logs,
reports, nudges, the sync endpoints) is hand-written SQL through
`NamedParameterJdbcTemplate`. Follow whichever the surrounding service already
uses; do not "upgrade" a JDBC service to JPA.

`ddl-auto: validate` — Flyway owns the schema, Hibernate only checks it.

### Schema evolution is additive-only

Migrations live in `src/main/resources/db/migration` (`V1`…`V35`). **Never edit a
migration that has run** — append a new `V{n}__name.sql`. Never drop or repurpose
a column, and never remove or rename a response field: old app builds on
trainers' phones must keep working. The client's WatermelonDB migrations in
`../app/src/db/migrations.ts` follow the same law and move in lockstep.

### Ownership is a query filter

Trainer-scoped endpoints read the trainer UUID from the JWT subject and filter
every query by `trainer_id`. A wrong id therefore yields **404, not 403** — that
is intentional, not a bug. Keep new queries scoped the same way (`findOwned(...)`
is the pattern in `ClientService`).

### A team widens reads; it never moves ownership

`team` (V26) does not change the rule above — it adds a resolver. `TeamScope`
answers "whose rows may this caller read", widening the set from `{me}` to
`{me + my team}` for an owner or admin, and **every team-wide query takes its
trainer-id set from there and nowhere else.** `trainer_id` keeps meaning what it
always meant, no table gains a `team_id`, and none of the endpoints that predate
V26 changed what they return — team reads live under `/v1/team/**`. Three rules
that are decisions and not oversights, all argued in
`agent/XRep_team_coaching_prd.md`:

- **No role ever sees a teammate's money book.** `package`, `payment` and
  `gym_settlement` must never be returned under a `/v1/team/**` path — with one
  audited exception, `GET /v1/team/revenue`, which is **owner-only and totals
  only** (no payment row, no client name). Adding money anywhere else under that
  namespace breaks the promise the app's invitation screen makes.
- **An admin editing a teammate's plan writes a `team_activity` row** (V27) and
  pushes to the coach whose client it is. Editing your own writes nothing — a
  `CHECK (actor <> subject)` enforces it. The log is append-only and readable by
  the coach, not only by admins; that readability is the whole reason the editing
  capability is acceptable.
- **Team-wide data is online-only.** Only `team` and `team_member` enter sync, plus
  team custom exercises; teammates' clients are REST reads.
- **Reassigning a client moves the plan, not the history.** Logged sessions and
  collected payments keep their original `trainer_id`. `client_assignment` is both
  the audit log and the sync tombstone source: the pull filters
  `trainer_id = :tid`, so the moved `program` / `program_exercise` /
  `scheduled_session` rows must be named in `deleted` or they sit on the old
  coach's phone forever. The **client row is the exception** — it stays there,
  projected as `status: 'archived'`, because that device still holds payments and
  workouts that resolve a name through `client_id`. `nudge_rule` never moves; it
  has no `client_id`.

### A gym is the next rung — designed, not built

`agent/XRep_gym_platform_prd.md` (Ring 2 of the growth roadmap: sell the gym
owner the layer above trainers who already use us). Nothing below exists yet, but
it constrains what you may write today.

The law extends unchanged — **a gym never owns a client** — with one addition
that is a *narrowing* of the money rule above rather than a hole in it:

- **`client.gym_id` is the money wall.** For a gym client the gym is the
  collector of record and sees everything, money included, because it banked it.
  For a trainer-managed client (`gym_id IS NULL`) the gym sees nothing at all,
  not even a count — and **`gym_id IS NULL` does not mean "independent"**, it
  means the trainer is the system of record, which includes clients at a gym
  that never signed up. Matching on `trainer.gym_name` or on
  `payment_mode = 'gym_collects'` to find "a gym's clients" is a bug: it would
  hand one gym a window into another gym's clients. That is not a weakening of "no role sees a teammate's money
  book": a *team* is peers looking sideways, a *gym* is the counterparty to the
  transaction. `/v1/team/**` stays closed to `package`, `payment` and
  `gym_settlement`.
- **The gym scope resolves to a set of client ids, not trainer ids.** Unlike
  `TeamScope`, which widens *whose books* you read. That difference is the safety
  property: a trainer's trainer-managed clients are unreachable because they are
  not in the set, not because 40 queries each remember `AND gym_id IS NOT NULL`.
- **`client.trainer_id` stays `NOT NULL`.** A gym member with no coach is a
  `gym_member` row (new, gym-owned); assigning one *creates* a `client` row owned
  by that coach.
- **Gym money is new tables.** `payment.client_id` and `payment.trainer_id` are
  both `NOT NULL` — the V11 argument for `gym_settlement` having its own table
  applies unchanged to membership fees. And `gym_settlement` does **not** gain a
  `direction` column: the opposite obligation (the gym owing a trainer their
  share) is `trainer_payout`, paid on what was **collected**, with
  `payment.payout_id` stamping which payout consumed each payment.
- **A gym-sent reminder is a `nudge_log` row**, never a new table. The
  once-per-client-per-7-days cap is computed *on the phone*
  (`../app/src/nudges/rules.ts`, `COOLDOWN_DAYS = 7`) from that client's
  `nudge_log` history, so a reminder stored anywhere else is invisible to it and
  the client gets two WhatsApp messages in one afternoon.

See `SCHEMA.md` → *Planned: V28+* for the migration-by-migration list and the
five invariants a V28 author must not break.

### Soft deletes everywhere

`DELETE` sets `deleted_at`; nothing is hard-deleted, because sync has to
propagate the tombstone to every device. Every read filters `deleted_at IS NULL`.

### Offline-first is the real write path

The app writes locally and reconciles through `/v1/sync/pull` + `/v1/sync/push`
(and `/v1/client/sync/**` for clients). The REST endpoints are the online
complement. A push that refuses a record returns a structured rejection the app
repairs against — see `sync/SyncService.java` and `sync/SyncRows.java`.

## Security

- **Auth** is phone + OTP → JWT (7-day expiry, `app.jwt.*`). Roles:
  `ROLE_TRAINER`, `ROLE_CLIENT`, `ROLE_INVITED`. Path rules live in
  `config/SecurityConfig.java`, first match wins — see the table in `API.md`.
  ⚠️ **One phone = one role is being reversed** (V18 decided it; V28 undoes it —
  a trainer can be a gym's coach, an independent coach, and somebody's client at
  once). `app_user.role` narrows to *the role the app opens in* and authority
  moves to a new `user_role (role, scope_type, scope_id)` table. The expensive
  part is this bullet, not the schema: the JWT subject is a trainer UUID for
  trainers and a phone for everyone else, and must become person + active role +
  scope — which touches `SecurityConfig`, `JwtAuthFilter`, `RateLimitFilter`
  (which keys buckets off the subject) and the 13 controllers that resolve it
  from `SecurityContextHolder`. `ClientPhoneGuard` narrows to refusing only your *own* number on
  your own roster, so `PHONE_IS_TRAINER` stays in the catalogue.
- **OTP state** is Redis-first (`RedisOtpStore`) with a Postgres fallback
  (`JpaOtpStore`) behind `DelegatingOtpStore`, switched by `app.redis.enabled`.
  Redis being down must never lock anyone out of signing in.
- **Wrong-attempt locks and daily send ceilings are persistent by design.** V17
  moved the lock out of memory precisely so a restart couldn't clear it. Redis
  runs with `--appendonly yes` for the same reason — that flag is a security
  requirement, not a preference.
- **Rate limiting** (`ratelimit/RateLimitFilter.java`) runs after JWT auth, keyed
  by token subject or remote IP on `/v1/auth/**`. Four tiers — `AUTH`, `SYNC`,
  `MESSAGING` (10/min, each call spends a real WhatsApp message), `STANDARD`.
  Bucket4j counts in Redis, falling back to in-process buckets.
- Every new endpoint needs a tier decision. Anything that sends a message goes in
  `MESSAGING`.

## Errors

RFC-7807 `ProblemDetail` plus an extra `code` field the app branches on
(`exception/GlobalExceptionHandler.java`): `OTP_WRONG`, `OTP_EXPIRED`,
`OTP_LOCKED`, `OTP_THROTTLED`, `PHONE_IS_TRAINER`, `PHONE_ON_ANOTHER_ROSTER`,
`RATE_LIMITED`. Adding a client-visible failure mode means adding a `code` here
and to the table in `API.md` — the app cannot branch on prose.

## Conventions

- Lombok `@RequiredArgsConstructor` for injection; no field `@Autowired`.
- Request/response DTOs are `record`s nested in the service that owns them.
- Jakarta Bean Validation on request records; `@Valid` at the controller.
- All ids are UUIDs, generated client-side so offline writes have stable keys.
- Money is `BigDecimal`; timestamps are `Instant` (UTC).
- Comments here explain *why* a non-obvious choice was made (see the 250 ms Redis
  timeout in `application.yml`). Match that density — narrate the reasoning, not
  the syntax.

## Config

Everything is env-overridable in `application.yml` under `app.*`. Notable kill
switches: `REDIS_ENABLED`, `RATE_LIMIT_ENABLED`, `SEED_EXERCISES`,
`FCM_CREDENTIALS` (blank disables push), `FORWARD_HEADERS` (`framework` behind
Railway's proxy, or every trainer shares one rate-limit bucket).

The exercise library is **text-only**. The upstream thumbnails and demo GIFs are
© Gym visual and need a licence we don't hold; V22 dropped the media columns.
Don't reintroduce image or GIF fields — every "free" GIF dataset is the same
artwork re-uploaded.

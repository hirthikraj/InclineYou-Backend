# InclineYou Backend — Claude working notes

Spring Boot 4.1 / Java 21 REST API for InclineYou, a trainer-first coaching app. This
directory is the backend half of a monorepo; the Expo client lives in `../app`
and has its own `CLAUDE.md`.

## Read these first

- `TENANCY.md` — the two ownership axes, the four RLS tiers, and the two token
  issuers. **Read it before any schema or query work**; it is the shortest path
  to not getting `tenant_id` wrong.
- `IDENTITY.md` — **PLANNED, not built.** Separating *who a person is* from *how
  they proved it*: `person` + `person_credential` in four migrations that must
  land in a fixed order (labelled V43–V46 there, written before the history was
  flattened — read them as a sequence, not as file names), and the four things
  we owe because we built our own auth (key rotation, refresh tokens, OTP
  toll-fraud controls, social sign-in). Read it before touching `auth/`, the
  phone columns, or the three RLS policies that match on `app_phone()` — a
  recycled Indian number currently has no correct outcome, and that file says
  why.
- `../../release/api-contract-v1.1.html` — **the final v1 wire contract**; the backend serves
  exactly its routes. Where `API.md` and it differ, the contract wins.
  **`../../release/api-contract-v1.2.html` (10 Oct 2026) adds the client portal** — the invite, `/v1/portal/**`,
  the trainer-side invite/message/reminder routes and the bell — on top of 1.1, written against `V11`. Its
  *Schema review* lists three open schema calls (R99–R101) and one build-order trap (R107).
- `API.md` — per-route notes, the authorization table, the rate-limit
  tiers, and the error `code` catalogue. **Keep it in sync with any endpoint change.**
- `SCHEMA.md` — the same thing for the database: all 46 tables, every column with
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
./mvnw test -Dtest=TenantIsolationTest          # the RLS walls, as `inclineyou_app`
./scripts/seed-three-months.sh <phone>          # v1 schema: 16 clients, 13 weeks of diary + logs + money — WIPES that trainer's workspace first
python3 scripts/refresh-schema-xml.py           # schema.xml + schema.html from the live db; --check to test
```

`seed-three-months.sh` is the only seed, and the only one written for the v1 schema (the earlier
seeds targeted the pre-v1 tables and were deleted 6 Oct 2026; they are in git history). It
**wipes the named trainer's workspace** (clients, diary, money, programs, price list) and rebuilds
three months of it, dated relative to the day it runs. The phone must already exist — sign in once.
It keeps the sign-in rows. Re-running gives the same diary.

It builds a timetable with one person on the floor at a time — 06:00 · 07:15 · 08:30 · 09:45, then
17:00 · 18:15 · 19:30 · 20:45 on a 75-minute pitch, inside a 06:00–11:00 / 17:00–22:00 split shift,
Mon–Sat — and asserts before committing that no two sessions overlap and none runs outside the
shift. Its money book goes through the ledger triggers (`package_adjustment` charges each session),
so a change to those triggers is the likeliest thing to break it. It seeds no batch.

### The exercise library seeds itself

There is no exercise seed script to run. `ExerciseSeeder` (an `ApplicationRunner` in `infrastructure/seed/`) loads
`src/main/resources/seed/exercises.json` on **every boot** and upserts by `source_id` (`inclineyou-<id>`), writing only
rows whose fields changed. **The file is authoritative:** an `inclineyou` exercise whose id is no longer in it is
retired (`deleted_at`), never deleted. Turn it off with `SEED_EXERCISES=false`. It runs under the `SYSTEM` tenant
context, the only actor allowed to write an `origin = 'inclineyou'` row. `seed-three-months.sh` looks exercises up by
that `source_id` and fails naming the missing ones — start the backend once first.

**The library is ours (6 Oct 2026), written for Indian trainers, one equipment and one muscle at a time.** It replaced
the upstream hasaneyldrm/Gym-visual dataset entirely. The single place to edit is `exercise-library/exercises-india.json`
(655 exercises, plus a `parked` list of ones cut on purpose and the allowed vocabulary); then run
`python3 scripts/build-exercise-seed.py` to regenerate the seed (`--check` fails if it is stale) and restart.
**Every entry is a `draft`** — nothing has been reviewed by a qualified trainer; the status rides in `metadata.review`.
The traditional-tool entries (gada, mudgar, tyre, dand, baithak, surya namaskar) are the least verified.

What lands in `exercise`: `name`, `muscle_group` = `target` (19 values), `body_part` (10), `equipment` (text), `level`,
`movement_pattern`, `log_type`, `description` (steps joined by blank lines), `secondary_targets`, `form_cues`, and
`metadata` (`aliases`, `commonMistakes`, `safety`, `reviewNote`, `equipmentNeeded`, `category`, `review`, `source`).
Names are unique in the file. No media columns exist.

**V9 added two lookups.** `log_type` is now one of six — `weight_reps`, `reps`, `time`, `distance`, `weight_time`,
`weight_distance` — each the default shape of a `set_log` row (`LogTypes.kindsOf` maps it to load and effort kind when
an exercise is added to a session). `equipment` (59 rows: key, name, category) and `equipment_alias` (65 raw strings →
an equipment row) back `exercise.equipment_id`, which a trigger fills from the text; `exercise.equipment` stays as the
legacy string the API returns. A new equipment string needs one row in `equipment_alias` and nothing else. `GET
/v1/exercises/meta` gained `equipmentGroups` (grouped by category) and `GET /v1/exercises` an `equipmentKey` filter —
both additive.

**The starter programs seed themselves too (V10, 6 Oct 2026).** `CertifiedSeeder` runs right after `ExerciseSeeder`
(`@Order(2)`) and writes the 12 InclineYou programs on the shelf from `src/main/resources/seed/certified-programs.json`,
which names each movement by its library id. Edit that file by hand — it is the source, there is no build step — and
restart. Each program is **week 1 only**, one workout per training day (a week with nothing of its own repeats week 1 in
the builder); a set's kinds come from the movement's `log_type`, and the load is left null for the coach to fill in per
client. Program and workout ids are fixed (a name-based UUID of the slug), so a re-run changes nothing; a program is
rewritten only when `certified_program.content_hash` says its content changed — workouts are updated in place and their
movements replaced, `revised_at` moves (so every trainer's copy shows as behind) and `used_count` is never touched. A
program that leaves the file is retired, not deleted. **All 12 are `is_sample = true` with `reviewed_at` NULL** — written
by us, not signed off; the schema refuses a reviewed sample, so marking one reviewed is a person's act, not the seeder's.
`SEED_CERTIFIED=false` turns it off. If a named exercise is missing from the library the program is skipped and logged,
never half-written.

Not built yet: aliases have no column (they live in `metadata`), and a time/distance entry screen on the web.

## Architecture

`com.inclineyou.inclineyou_backend`, in three top-level packages (29 Sep 2026):

- `core/` — one vertical slice per feature: `assessment` · `attention` · `auth`
  · `client` · `exercise` · `nudge` · `payment` · `program` · `progress` ·
  `session` · `sessionlog` · `tenant` · `trainer` · `workout`. A slice owns
  its JPA entities and Spring Data repositories too
  (`Trainer` + `TrainerBusiness` in `core/trainer`,
  `AppUser` + `OtpRequest` in `core/auth`) — there is no global `entity/` or
  `repository/` package any more.
- `infrastructure/` — `config` (security, Redis, health, `AppProperties`),
  `ratelimit`, `seed`.
- `shared/` — `exception` (the global RFC-7807 handler), `wire` (the `Page` /
  `Items` / `Cursor` envelopes every controller returns). `shared/util` gets
  created by the first helper that two slices need, not before.

A slice is being reshaped, module by module, into four layers:
`*Controller` (the HTTP contract — a request `record` with Jakarta Bean
Validation, checked by `@Valid`) → `*Service` (logic only, takes the typed
record, never a `Map`) → `*JdbcRepository` (all SQL, nothing else) — with the
records in a `dto/` subpackage once a slice has more than a handful.

`payment/` is on this shape (3 Oct 2026): twelve `*Service`s with no SQL, eight `*JdbcRepository`s
(`Pack`, `Package`, `Payment`, `MoneyReport`, `PracticeReport`, `GymArrangement`, `TrainerPayout`,
`GymMoney`), records in `payment/dto/`. Two rules came out of it: the package ledger CTE (what a
package still owes) has ONE definition, in `PackageJdbcRepository`, and the money summary asks it
for "owed today" rather than copying it; and money formatting and the workspace currency are
`shared/util/Money` and `WorkspaceClock.currency()`, not per-service helpers. The pack and payment
PATCH routes keep a raw `Map` body on purpose — presence of a key is the contract (absent = leave,
null = clear), which a record cannot say — and validate it into typed values at the service's entry.

**Scope reversed 10 Oct 2026: the cut below is a snapshot, not a ceiling.** The product is now the full
trainer–client product (`../../release/prd-trainer-client-product.html`), so the client portal comes back:
`/v1/me/*`, the invite and consent write, the paused / removed states and a client's own sign-in all have to be
rebuilt, from `41710f0^` in git history but on the V1 tables and this section's conventions (`shared/wire`, strict
binding, `*JdbcRepository`, no SQL in services). Write each route into `api-contract` before the code; the contract
still wins over `API.md`. **Entry rule (10 Oct):** `otp/verify` on the public path must no longer answer
`role: client` / `403 CLIENT_SIGN_IN_UNAVAILABLE` — the one login page routes by the number — a number with no account is claimable as a trainer, a number held by an
*accepted client* account is redirected to the portal (so `otp/verify` answers `role: client` as a real destination, not
a 403), and a number with a pending invite goes to the invite page (one number, one role: `app_user.role` stays
single-valued; both roles are an on-demand later change). A client's first entry is a personal invite link, sent over
WhatsApp from the trainer's own number, bound to one client and the number on record; the invite page collects the
client's own date of birth (18 or over) and consent, verifies the number, and on *Let me in* creates the client account
in one transaction. `client` has no token or expiry columns yet, and that schema is deliberately designed after the PRD
is agreed (PRD D-06, D-13, D-14, D-16). The client lens (RLS tier 4) and a per-client rate-limit key need the same test evidence the
trainer walls have before any client can sign in. Team, workspaces, gym, the phone's sync and AI stay out; for them
the paragraph below still describes the tree.

**The v1 cut (3 Oct 2026).** The backend carries exactly the routes in `../../release/api-contract-v1.1.html`
and nothing else. Removed in that pass, all of it in git history: the workspace routes under `/v1/tenants`
(switch, members, shares, revenue, stale clients, assign — `TenantScope`, `TenantContext` and `WorkspaceClock`
stay, they are the RLS plumbing under every request); `/v1/devices` and the FCM push service (and the
`firebase-admin` dependency and `FCM_CREDENTIALS`); `GET /v1/clients/{id}/report` (the web builds its printable
card from `set-history`); `GET /v1/clients?view=legacy` and `GET /v1/sessions/{id}`; `POST /v1/auth/membership/**`
and `/mode/**` and every client-portal branch of sign-in — a number that is only a client's is now `403
CLIENT_SIGN_IN_UNAVAILABLE`, and `AuthResponse` no longer carries `clientOf` / `paused` / `removed`; and the typed-number
body on `DELETE /v1/trainers/me`, which now takes the step-up ticket alone. The `Client` JPA entity went with
the legacy roster. **Sign-in was then moved onto the v1.1 contract** (same day): `otp/request` answers a `requestId`,
`GET /v1/auth/otp/requests/{id}` reads delivery status, `otp/verify` takes `{requestId, otp}` and answers the
contract's shape, `POST /v1/trainers` replaced `POST /v1/auth/trainer`, and a stale session is `401
SESSION_EXPIRED` / `SESSION_REVOKED`. Every request is an `otp_request` row (`OtpRequestLedger`) whichever store holds
the live state — Redis, or Postgres when it is down, where the row *is* the code; a newer request retires the older by
setting `consumed_at`. `OTP_WRONG` and `OTP_EXPIRED` are now 401. Not wired: the provider's delivery webhook (so
`delivered` / `read` never appear) and `requestId` on errors / `X-Request-Id`, which is wire-wide and not sign-in's. `progress/` is on the shape too`progress/` is on the shape too
(`SetHistoryJdbcRepository`, `SetHistoryService`, records in `progress/dto/`).

`nudge/` is on the same shape and on the v1 `nudge_log` (3 Oct 2026): `NudgeLogJdbcRepository` (the append-only log and
the figures a message quotes), `NudgeReadService` (`GET /v1/nudges`) and `NudgeDraftService`
(`POST /v1/clients/{id}/nudges`), `NudgeText` (substitution, Indian digit grouping, ordinals — pure), records in
`nudge/dto/`; the template library was already layered. The 1.0 `POST …/nudge` and `GET …/clients/{id}/nudges` are gone
(they wrote and read `template_name`/`status`, which v1 does not have, and no caller was left) and `NudgeRuleException`
with them.

`session/` is on the same shape (3 Oct 2026): `SessionJdbcRepository` (the L4 row and window, and the booking's lookups) and
`SessionStateJdbcRepository` (the locked row, every status verb, the two batch routes and the `package_adjustment` charge),
under `SessionReadService`, `SessionBookingService`, `SessionWriteService` (the batches), `SessionStateService` (the verbs) and
`SessionChargeService` (which pack pays, and taking a charge back — one place, so a charged no-show and a done cannot pick
different packs), with the records in `session/dto/`. The legacy `ScheduledSessionService` (pre-v1 columns) is deleted;
`GET /v1/sessions/{id}` answers the L4 row. `PATCH` keeps a `Map` body on purpose — presence of a key is the contract — and
validates it into a typed `SessionEdit` at the service's entry. `SessionDiaryTest` pins the read, the booking and the PATCH;
`SessionStateTest` the verbs.

**Every slice is now on this shape (3 Oct 2026): no class in `core/` outside a `*JdbcRepository` holds SQL.** The last ones:
`attention/` (`AttentionDismissalJdbcRepository`, records in `attention/dto/`), `assessment/` (`AssessmentListJdbcRepository` for the list, `MetricReadingsJdbcRepository`
under `MetricReadings`, which keeps only the catalogue's units) and `client/` (`ClientPhoneJdbcRepository` under
`ClientPhoneGuard`, which keeps the codes and the sentences). The "created or found" wrappers and the wire records that were
nested in services (`Made`, `Created`, `Applied`, `TemplateResponse` …) moved to each slice's `dto/` under distinct names. What
stays by design: the `SessionStore` implementations in `auth/` (an interface with a Redis and a JDBC side, so `JdbcSessionStore`
is that slice's repository under another name), the JPA entities and their Spring Data repositories, `ClientPhoneGuard.Verdict`
(a verdict with its own factories), and the startup seeder and health checks under `infrastructure/`.

### Persistence is deliberately split

Only four things are JPA entities — `AppUser`, `Trainer`, `TrainerBusiness`,
`OtpRequest`. Everything else (programs, sessions, packages, payments, set logs,
nudges) is hand-written SQL through
`NamedParameterJdbcTemplate`. Follow whichever the surrounding service already
uses; do not "upgrade" a JDBC service to JPA.

`ddl-auto: validate` — Flyway owns the schema, Hibernate only checks it.

### Two ownership axes, and they are independent

Since **V37–V42** every row carries `tenant_id` as well as `trainer_id`, and they
answer different questions:

- **`trainer_id` — who coaches.** Unchanged, still `NOT NULL`, still what all 383
  existing queries filter on.
- **`tenant_id` — whose books.** Which workspace the row is in. **Immutable**:
  stamped at insert by `stamp_tenant_id` and refused any change by
  `freeze_tenant_id` (both V39).

They used to be one fact. They came apart when one trainer had to coach privately
*and* at a gym with different clients — the same `trainer_id` now writes into two
workspaces, and which one is decided at creation.

Because a row never moves, joining a gym costs no bulk `UPDATE`, leaving one
cascades into nothing, and a coach's private practice was never in the gym's
scope to begin with.

Three consequences for anything you write:

- **Don't add `AND tenant_id = …` to queries.** RLS adds it, and a `BEFORE INSERT`
  trigger stamps writes — which is why V37–V42 changed 383 statements to zero.
  Keep the `trainer_id` filters; RLS is the backstop, not the replacement.
- **A new table joins one of the four policy tiers**, or gets added to the
  not-policied list in `SCHEMA.md` with a reason. Silence is an oversight.
- **`tenant_member` IS the planned `user_role`.** Do not build a second one.

- **Development runs behind the policies; the test suite does not.**
  `application.yml` connects the pool as `inclineyou_app` (non-owning, so RLS applies)
  and gives Flyway its own owner credentials. `src/test/resources/
  application.properties` pins the suite back to `inclineyou`, because a
  `@Transactional` test holds one connection borrowed before any request exists
  and an unlabelled connection is correctly worth nothing under RLS.
  `TenantIsolationTest` is where the walls are actually asserted — it opens its
  own `inclineyou_app` connections. Since V11 it also asserts the client lens: a client session reads exactly its own rows, the money switch, and what a client may write. If you add a code path that creates a workspace,
  test it there or it is untested.
- **Two roles, two pairs of environment variables.** `APP_DB_USERNAME` /
  `APP_DB_PASSWORD` are the request path (`inclineyou_app`); `MIGRATION_DB_USERNAME` /
  `MIGRATION_DB_PASSWORD` are Flyway, the seeds and the suite (`inclineyou`).
  `DATABASE_URL` is shared. **Nothing that serves a request may use the second
  pair** — an owner connection has every policy switched off and no log says so,
  which is why `DatabaseIdentityCheck` asks `row_security_active('client')` at
  boot and warns. `APP_DB_PASSWORD` is deliberately also V42's `appRolePassword`
  placeholder: one secret, one name — and because a versioned migration runs
  once, `afterMigrate__sync_app_role_password.sql` re-applies it on every
  startup so rotating the variable actually rotates the role. `.env.example` at
  the repo root is the checklist.

Read `TENANCY.md` before touching any of it — its *What running the app behind
the wall found* section is the list of things that broke the first time, and
three of them were the same shape.

### Schema evolution is additive-only

Migrations live in `src/main/resources/db/migration`, and there is exactly one:
`V1__init_schema.sql`, the **consolidated baseline**. The forty-two migrations
that built this schema were flattened into it on 11 Sep 2026, during the rename
to InclineYou — the one safe moment, because the rename changed the database
name and both database roles, so no instance anywhere had to be carried forward.
The flattening was verified rather than assumed: a database built from the
forty-two and a database built from `V1` were dumped and diffed, and the only
difference in 4,300 lines was `gen_random_uuid()` becoming schema-qualified.

**The V-numbers elsewhere in these notes and all through `SCHEMA.md` are
historical labels, not files.** `V30 gave the sold package pause/resume` still
tells you why `paused_at` is a column; it no longer points at a migration you
can open. `git log` has them.

**25 Sep 2026 — rebuilt as a fresh v1.** `V1__init_schema.sql` was replaced by a new baseline that builds the 41 tables approved in `../release/proposed-schema.html` (that page carries the reasoning; later-release tables are in `../release/later-schema.html`). The old baseline and `V2`–`V22` are archived in `db-archive/pre-v1-2026-09-25/` — `V4`–`V22` were never in git, so that folder is their only copy. **`V2__slot_program_day_and_cancel_reason.sql` (28 Sep 2026) added `client_schedule_slot.program_day` (R45) and `scheduled_session.cancel_reason` (R68); `V3`–`V6` followed (V5, 30 Sep, adds `certified_program_count_use()`; V6 the exercise trigram index and custom-name uniqueness); the next migration is `V12` (V7 money integrity, V8 gym place, V9 equipment and log types, V10 certified-program content hash, **V11 the client portal** are in).** `V11__client_portal.sql` (10 Oct 2026) adds seven tables, sixteen columns, the client lens of row-level security with a column guard on every table a client may write (staff and clients share one database role, so a GRANT cannot limit a client's columns), and ten functions, and replaces `erase_clients`, `erase_account` and `purge_closed_tenants` in place; it was tested against a scratch database built from V1–V10 (107 assertions) and by the 340-test suite on a scratch database (`DATABASE_URL=…/<scratch>`, so tests never touch the dev database) and **was applied to the local dev database on 10 Oct 2026 (Flyway v11, rows untouched), so it is now immutable: any change is a V12**. It was amended in place before that, after the API contract: `client_package_balance()` (a package balance with no money, because a policy cannot hide a column), `invite_card_by_id()` and `trainer.bell_seen_at`. **A client's own workout is not the trainer's time (R107, 10 Oct 2026).** `scheduled_session.logged_by = 'client'` rows (a self-run day) are excluded from every trainer read that means *my diary* — the diary window, the picker, the roster's figures, the practice report, pause/resume — and refused as 404 by every trainer status verb; they are included in one client's own history (`GET /v1/sessions?clientId=`) once a set is done, in set-history and in plan-day counting. **A new query over `scheduled_session` must pick a side** and carry `logged_by = 'trainer'` or say why not; `ClientLoggedSessionsTest` is where it is pinned. **Inside a `SECURITY DEFINER` function `current_user` is the owner, never the caller: recognise the request role with `session_user`** (V1's `erase_account` got this wrong and V11 fixes it). Until every module is adapted, `ddl-auto` is `none` (put `validate` back when the five entities match), and `SCHEMA.md`, `API.md` and the three seed scripts describe the old schema. A stale `target/classes/db/migration` from an earlier build will make Flyway run the archived files — run `./mvnw clean` first.

From here the law is what it always was: **never edit a migration that has
run** — append a new `V{n}__name.sql`. Never drop or repurpose a column, and
never remove or rename a response field: old app builds on trainers' phones must
keep working. The client's WatermelonDB migrations in
`../app/src/db/migrations.ts` were reset to schema v1 in the same change and
follow the same law, in lockstep.

**The one exception is `V22__drop_body_metric.sql`** (24 Sep 2026): a body is
measured in an assessment and nowhere else, so `body_metric` lost every writer
and was dropped — with the phone build and sync out of v1 and nothing in
production, there was no row anywhere to lose. Readings live on
`assessment.readings`; `assessment/MetricReadings.java` is the one reader that
turns them into a series. Don't treat it as a precedent.

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
`agent/InclineYou_team_coaching_prd.md`:

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

`agent/InclineYou_gym_platform_prd.md` (Ring 2 of the growth roadmap: sell the gym
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

See `SCHEMA.md` → *Planned: the gym platform* for the migration-by-migration
list and the five invariants its author must not break.

### Soft deletes everywhere

`DELETE` sets `deleted_at`; nothing is hard-deleted, because sync has to
propagate the tombstone to every device. Every read filters `deleted_at IS NULL`.

### The web writes straight to the server

The web — the trainer app and, from 10 Oct 2026, the client portal — is online-only: there is no sync endpoint,
and the phone's offline-first protocol is out of this backend until that build returns. The one open question
is the client's workout flow with no signal (PRD decision D-03): if it gets a queue, it is a service worker that
replays client-UUID writes against REST, not a sync endpoint.

## Security

- **Auth is one interface with two issuers** (`AuthTokenIssuer`, V41). The phone
  gets a self-contained **JWT** because it is offline half the time; the web gets
  an opaque, revocable **session** (`X-InclineYou-Client: web`), because a token that
  leaks from a browser is one somebody else is holding and "wait seven days" is
  not an incident response. `AuthTokenService` picks; nothing below it can tell
  which answered. Sessions store a SHA-256 of the token, never the token.
- **Auth** is phone + OTP → JWT (7-day expiry, `app.jwt.*`). Roles:
  `ROLE_TRAINER`, `ROLE_CLIENT`, `ROLE_INVITED`. Path rules live in
  `config/SecurityConfig.java`, first match wins — see the table in `API.md`.
  ✅ **One phone = one role is reversed** (V18 started it; **V37 finished it** —
  `tenant_member` is the many-to-many, one person and N workspaces). The
  paragraph below is kept for the history and for the JWT-subject argument, which
  still holds: the subject is a trainer UUID for trainers and a phone for
  everyone else, and the **workspace** rides as a separate `tid` claim rather than
  being folded into the subject. Old text follows.
  ⚠️ ~~One phone = one role is being reversed~~ (V18 decided it; V28 undoes it —
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
  **Off by default in development, on everywhere else.** `./mvnw spring-boot:run`
  activates the `dev` profile (declared on `spring-boot-maven-plugin`), whose
  only content is `app.rate-limit.enabled: ${RATE_LIMIT_ENABLED:false}`; a
  packaged jar, Railway and CI run with no profile and keep the ceiling. The
  reason is the key, not the numbers: everything unsigned-in on a laptop is
  `ip:127.0.0.1`, so Expo, the Next dev server and a curl loop share one
  120/60s `STANDARD` bucket and a hot reload spends it. `RATE_LIMIT_ENABLED`
  still overrides in both directions — set it to `true` to exercise the limiter
  locally — and the filter logs its state at boot, warning when it is off.
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
- Request/response DTOs are `record`s — nested in the service while a slice is small, in its `dto/` subpackage once it is not.
- Jakarta Bean Validation on request records; `@Valid` at the controller.
- Request bodies bind **strictly, app-wide** (`infrastructure/config/JacksonConfig`,
  29 Sep 2026): an unknown key is a 400, `5.5` is not an `Integer`, `"5"` is not a
  number. `GlobalExceptionHandler#handleUnreadable` names the field. A record that
  must tolerate extra keys opts out with `@JsonIgnoreProperties(ignoreUnknown = true)`.
- A PATCH record's fields are `shared/wire/Patch<T>`: null = key absent (leave it),
  `Patch` holding null = clear it. Constraints go on the type argument
  (`Patch<@Size(max = 100) String>`). `Optional<T>` cannot do this — Jackson maps
  absent and null to the same `Optional.empty()`.
- All ids are UUIDs, generated client-side so offline writes have stable keys.
- Money is `BigDecimal`; timestamps are `Instant` (UTC).
- Comments here explain *why* a non-obvious choice was made (see the 250 ms Redis
  timeout in `application.yml`). Match that density — narrate the reasoning, not
  the syntax.

## Config

Everything is env-overridable in `application.yml` under `app.*`, and
`.env.example` at the repo root lists every variable with its default —
`docker compose` reads that same file, Spring Boot does not (`set -a; source
.env; set +a`). Notable kill switches: `REDIS_ENABLED`, `RATE_LIMIT_ENABLED`,
`SEED_EXERCISES`, `FORWARD_HEADERS`
(`framework` behind Railway's proxy, or every trainer shares one rate-limit
bucket). The database's two identities are `APP_DB_*` and `MIGRATION_DB_*` —
see *Two ownership axes* above.

The exercise library is **text-only**. The upstream thumbnails and demo GIFs are
© Gym visual and need a licence we don't hold; V22 dropped the media columns.
Don't reintroduce image or GIF fields — every "free" GIF dataset is the same
artwork re-uploaded.

# XRep Backend — Claude working notes

Spring Boot 4.1 / Java 21 REST API for XRep, a trainer-first coaching app. This
directory is the backend half of a monorepo; the Expo client lives in `../app`
and has its own `CLAUDE.md`.

## Read these first

- `API.md` — the complete endpoint reference, the authorization table, the rate-limit
  tiers, and the error `code` catalogue. **Keep it in sync with any endpoint change.**
- `agent/` — the five source-of-truth product docs (requirements, data model,
  interaction map, getting-started, deployment runbook). Consult them before
  inventing product behaviour; don't reopen decisions they've settled.

## Commands

```bash
docker compose -f ../docker-compose.yml up -d   # Postgres 16 + Redis 7
./mvnw spring-boot:run                          # run on :8080
./mvnw test                                     # full test suite
./mvnw test -Dtest=OtpServiceTest               # one class
./scripts/seed-sample-month.sh <phone>          # 6 clients, one month — the small seed
./scripts/seed-full-demo.sh <phone>             # 44 clients, every feature — the big seed
```

The two seed scripts are alternatives, not layers — running one over the other
duplicates working hours and price lists. Both are scoped to the trainer whose
phone you pass, which must be the phone signed in on the device.

## Architecture

`com.xrep.xrep_backend`, one package per feature, each a thin
`*Controller` over a `*Service`:

`auth` · `client` · `exercise` · `template` · `program` · `session` ·
`progress` · `payment` · `report` · `nudge` · `push` · `sync` · `trainer`

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

Migrations live in `src/main/resources/db/migration` (`V1`…`V25`). **Never edit a
migration that has run** — append a new `V{n}__name.sql`. Never drop or repurpose
a column, and never remove or rename a response field: old app builds on
trainers' phones must keep working. The client's WatermelonDB migrations in
`../app/src/db/migrations.ts` follow the same law and move in lockstep.

### Ownership is a query filter

Trainer-scoped endpoints read the trainer UUID from the JWT subject and filter
every query by `trainer_id`. A wrong id therefore yields **404, not 403** — that
is intentional, not a bug. Keep new queries scoped the same way (`findOwned(...)`
is the pattern in `ClientService`).

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

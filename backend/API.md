# XRep Backend — API Reference

Every HTTP endpoint the Spring Boot backend exposes, what it is for, and what it
expects. Generated from the controllers under
`backend/src/main/java/com/xrep/xrep_backend/`.

- **Base path:** all product endpoints live under `/v1`. `/health` is the one
  exception and is deliberately unversioned.
- **Auth:** bearer JWT in `Authorization: Bearer <token>`, issued by
  `POST /v1/auth/otp/verify`. The token's *subject* is a trainer UUID for
  trainer tokens and the **phone number** for every other role.
- **Content type:** JSON in, JSON out. Timestamps are epoch milliseconds unless
  the field name says `Date` (then it is ISO `yyyy-MM-dd`).

---

## Contents

| Area | Base | Endpoints |
| --- | --- | --- |
| [Health](#health) | `/health` | 1 |
| [Auth & membership](#auth--membership) | `/v1/auth` | 6 |
| [Trainer profile](#trainer-profile) | `/v1/trainers` | 2 |
| [Clients](#clients) | `/v1/clients` | 7 |
| [Progress](#progress) | `/v1/clients/{clientId}/progress` | 1 |
| [Exercises](#exercises) | `/v1/exercises` | 3 |
| [Templates](#templates) | `/v1/templates` | 6 |
| [Programs](#programs) | `/v1/programs` | 9 |
| [Scheduled sessions (diary)](#scheduled-sessions-diary) | `/v1/sessions` | 6 |
| [Workout sessions & set logs](#workout-sessions--set-logs) | `/v1/workouts` | 8 |
| [Packages & payments (money book)](#packages--payments-money-book) | `/v1/clients/{id}/packages`, `/v1/packages`, `/v1/payments` | 5 |
| [Nudges](#nudges) | `/v1/clients/{clientId}/nudge` | 1 |
| [Reports](#reports) | `/v1/clients/{clientId}/report` | 2 |
| [Push devices](#push-devices) | `/v1/devices` | 2 |
| [Trainer sync](#trainer-sync) | `/v1/sync` | 2 |
| [Client sync](#client-sync) | `/v1/client/sync` | 2 |

**Total: 63 endpoints.**

---

## Authorization model

Enforced in `config/SecurityConfig.java`, in this order — first match wins:

| Path | Requirement |
| --- | --- |
| `/v1/auth/trainer` | any authenticated token |
| `/v1/auth/membership/**` | `ROLE_INVITED` |
| `/v1/auth/**`, `/health` | public |
| `/v1/client/**` | `ROLE_CLIENT` |
| everything else | `ROLE_TRAINER` |

Sessions are stateless; CSRF, form login and HTTP Basic are all disabled.
Trainer-scoped endpoints read the token subject as the trainer UUID and every
query is filtered by `trainer_id`, so one trainer can never read another's rows —
a wrong id yields `404`, not `403`.

## Rate limiting

`ratelimit/RateLimitFilter.java` runs after JWT auth and buckets requests by
token subject (or client IP when anonymous). Four tiers, keyed independently so
a chatty sync does not spend an ordinary request's budget:

| Tier | Applies to | Default |
| --- | --- | --- |
| `AUTH` | `/v1/auth/**` | 300 / 60s |
| `SYNC` | `/v1/sync/**`, `/v1/client/sync/**` | 60 / 60s |
| `MESSAGING` | `POST …/nudge`, `POST …/report/weekly` | 10 / 60s |
| `STANDARD` | everything else | 120 / 60s |
| *(exempt)* | `/health` | — |

Refusals return `429` with an RFC-7807 body carrying `"code": "RATE_LIMITED"`
and `retryAfterSeconds`. Counting is in Redis via Bucket4j, falling back to
in-process buckets when Redis is down.

## Error shape

Errors are RFC-7807 `ProblemDetail` documents with an extra `code` field the app
branches on (`exception/GlobalExceptionHandler.java`):

| `code` | Status | Meaning |
| --- | --- | --- |
| `OTP_WRONG` | 422 | Code did not match; an attempt was spent. |
| `OTP_EXPIRED` | 410 | Code was valid and has since lapsed. |
| `OTP_LOCKED` | 429 | Too many wrong codes — number locked, carries a countdown. |
| `OTP_THROTTLED` | 429 | Codes requested too fast — carries the real wait. |
| `PHONE_IS_TRAINER` | 409 | That number already signs in as a trainer. |
| `PHONE_ON_ANOTHER_ROSTER` | 409 | That number is another trainer's client. |
| `RATE_LIMITED` | 429 | Tier budget exhausted. |

---

## Health

### `GET /health`
**Purpose:** unauthenticated liveness probe for Railway and the uptime monitor.

Runs `SELECT 1` against Postgres and reports Redis status for both the rate
limiter and the OTP store. Returns `200` when the DB is up, `503` when it is not.
Redis being down is reported but never changes the status code — every
Redis-backed component has a working fallback, so a Redis outage is *degraded*,
not *down*, and returning 503 would tell Railway to kill a container that is
serving traffic correctly.

```json
{ "status": "UP", "db": "UP",
  "rateLimiting": "redis", "otpStore": "redis", "redis": "UP" }
```

---

## Auth & membership

`auth/AuthController.java` — phone-OTP sign-in and the invite lifecycle.

### `POST /v1/auth/otp/request`
**Purpose:** send a one-time code to a phone number. *Public.*

Body: `{ "phone": "9876543210" }` — must match `^[6-9]\d{9}$` (TRAI allocates
only the 6–9 series to mobile). Returns `200` with no body.

Throttled per number by a resend ladder (30s / 60s / 120s inside a 60-minute
window) with a hard ceiling of 10 sends per rolling 24 hours. Breaching either
yields `OTP_THROTTLED`.

### `POST /v1/auth/otp/verify`
**Purpose:** exchange a code for a JWT. *Public.* This is the only endpoint that
mints tokens.

Body: `{ "phone": "9876543210", "otp": "123456" }`. The OTP must match `^\d{6}$` —
shape is checked *before* the code, so a typo cannot spend one of the three
attempts a trainer gets. Phone validation is identical to `/otp/request` so one
bad number cannot get two different answers.

Returns `AuthResponse`:

| Field | Meaning |
| --- | --- |
| `token` | the bearer JWT |
| `trainerId` | subject when the caller is a trainer |
| `isNewUser`, `setupComplete` | whether onboarding is owed |
| `role` | `trainer` \| `client` \| `pending` \| `invited` \| `removed` \| `unattached` \| `gym_admin` — which screen this sign-in is owed |
| `trainerName` | for "Welcome back, Ravi"; null before setup |
| `clientOf[]` | every roster this number is on (`Membership`) |
| `pausedInfo` / `removedInfo` | who paused/ended it and when |

`Membership` carries both `status` (the *trainer's* view: `active` / `paused` /
`archived` / `inactive`) and `membershipStatus` (the *client's* own answer:
`invited` / `accepted` / `declined` / `paused` / `removed`). They are kept apart
because they answer to different people and can legitimately disagree.

### `POST /v1/auth/trainer`
**Purpose:** claim the signed-in number as a trainer account. *Any authenticated
token.* Returns a fresh `AuthResponse` carrying the upgraded role.

### `POST /v1/auth/membership/{clientId}/accept`
**Purpose:** the client accepts a trainer's invite. *`ROLE_INVITED`.* Also stamps
the privacy acceptance the screen carried. Returns a re-issued `AuthResponse`.

### `POST /v1/auth/membership/{clientId}/decline`
**Purpose:** the client declines. *`ROLE_INVITED`.* The row is kept rather than
deleted — the trainer's roster should say what happened.

### `POST /v1/auth/membership/{clientId}/ack-removal`
**Purpose:** "OK" on the removal notice. *`ROLE_INVITED`.* The local data wipe
happens on the phone; this is only what stops the notice being redrawn at every
future sign-in.

---

## Trainer profile

`trainer/TrainerController.java` — the signed-in trainer's own record.

### `GET /v1/trainers/me`
**Purpose:** the profile the app draws Settings and the money screen from.

Returns id, phone, name, `upiVpa`, `experienceBand`, `specialities[]`,
`certifications[]`, `languages[]`, `setupComplete` / `setupCompletedAt`,
`gymName`, `gymSharePercent`, and a `preferences` map.

A null `gymName` means *no gym*, which is not the same as a 0% cut — one hides
the "your share" line entirely, the other claims an arrangement that keeps all
of it.

### `PATCH /v1/trainers/me`
**Purpose:** partial profile update — onboarding writes here, so does Settings.

Every field is optional; only what is sent is written. `completeSetup: true`
stamps `setupCompletedAt`. Settings switches live under `preferences`.

---

## Clients

`client/ClientController.java` — the roster. All trainer-scoped.

### `GET /v1/clients`
**Purpose:** the roster list. Returns every non-deleted client for this trainer,
each with `StatusFlags` (`paymentDue`, `sessionPackLow`, `planExpiring`) so the
list can draw its badges without a second round trip.

### `POST /v1/clients` → `201`
**Purpose:** add a client.

Body: `name` (required), `phone`, `goal`, `paymentMode`, `trainerSplitPercent`,
`heightCm`, `activityLevel`, `metadata`, `sessionsPerWeek`,
`sessionDurationMinutes`, `deliveryMode`.

Runs the phone guard: a number that already signs in as a trainer, or sits on
another trainer's roster, is refused with `409` and a `PHONE_*` code.

### `POST /v1/clients/phone-availability`
**Purpose:** ask whether a number is addable *before* anything is written.

Body: `{ "phone": "…" }`. Returns `{ "available": bool, "code": …, "message": … }`.

The roster is written offline and pushed later, so a refusal that only exists at
push time reaches the trainer minutes after they typed the number, on a screen
they long since left. This asks the same rule early, while the add form is still
open. It is an optimisation, **not** the enforcement — `create` and the sync push
both apply the rule again, because a phone with no signal skips this entirely.

Two deliberate design choices:
- **Not a 4xx.** Nothing failed; a question was answered. A `200` keeps a network
  error distinguishable from a taken number.
- **POST for a read.** The alternative puts a phone number in a URL, and query
  strings are logged by everything they pass through — access log, reverse proxy,
  Railway's request log. The number is not even the caller's own.

### `GET /v1/clients/{id}`
**Purpose:** one client's full record for the detail screen.

### `PUT /v1/clients/{id}`
**Purpose:** edit a client. Adds `status` and `weeklySchedule` on top of the
create fields.

### `DELETE /v1/clients/{id}` → `204`
**Purpose:** remove a client from the roster. Soft delete — the row is tombstoned
with `deleted_at` so sync can propagate the removal.

### `GET /v1/clients/{id}/body-metrics`
**Purpose:** the measurement history behind the progress charts.

### `POST /v1/clients/{id}/body-metrics` → `201`
**Purpose:** record one measurement.

Body: `metricType`, `value`, `unit`, `notes`, `recordedAt` (epoch ms) — all
required except `notes`.

---

## Progress

### `GET /v1/clients/{clientId}/progress`
`progress/ProgressController.java`

**Purpose:** the numbers behind the client's progress screen, computed server-side
from the set logs.

Returns `{ prs: [...], volumeByWeek: [...] }` — personal records per exercise
(`maxLoadKg`, `maxReps`, `achievedAt`) and weekly training volume points.
Ownership is checked first; a client that is not this trainer's yields `404`.

---

## Exercises

`exercise/ExerciseController.java` — the shared library plus per-trainer customs.

### `GET /v1/exercises`
**Purpose:** search and browse the exercise library.

Query params: `q`, `muscleGroup`, `equipment`, `level`, `page` (default `0`),
`size` (default `20`). Returns `{ exercises: [...], total }` covering both the
seeded global library and this trainer's own custom exercises.

### `GET /v1/exercises/meta`
**Purpose:** the filter vocabulary — `muscleGroups[]`, `equipment[]`, `levels[]` —
so the filter sheet is populated from the data rather than a hardcoded list.

### `POST /v1/exercises` → `201`
**Purpose:** create a custom exercise when the library has no match.

Body: `name` (required), `muscleGroup`, `equipment`, `movementPattern`,
`description`, `imageUrl`, `videoUrl`. Comes back with `isCustom: true` and is
visible only to the creating trainer.

---

## Templates

`template/TemplateController.java` — reusable program blueprints, not tied to any
client.

### `GET /v1/templates`
**Purpose:** the trainer's template shelf.

### `POST /v1/templates` → `201`
**Purpose:** save a template.

Body: `name` (required), `goal`, `description`, `exercises[]`, `dayLabels`.
Each exercise entry carries `exerciseId`, `sets`, `reps`, `restSeconds`,
`targetLoad`, `notes`, `dayOfWeek` and `orderIndex`.

### `GET /v1/templates/{id}` · `PUT /v1/templates/{id}` · `DELETE /v1/templates/{id}` → `204`
**Purpose:** read, edit and remove one template.

### `POST /v1/templates/{id}/apply` → `201`
**Purpose:** the point of templates — instantiate one as a live program for a
client, copying every exercise row across in one transaction.

Body: `clientId` (required), plus optional `name`, `goal`, `startDate`, `endDate`
overrides. Returns a `ProgramSummary` for the program that was created.

---

## Programs

`program/ProgramController.java` — a client's live training plan.

### `GET /v1/programs?clientId=…`
**Purpose:** list programs, optionally narrowed to one client.

### `POST /v1/programs` → `201`
**Purpose:** create a program from scratch (rather than from a template).

Body: `clientId` (required), `name` (required), `goal`, `startDate`, `endDate`,
`status`.

### `GET /v1/programs/{id}` · `PUT /v1/programs/{id}` · `DELETE /v1/programs/{id}` → `204`
**Purpose:** read, edit and archive one program.

### `GET /v1/programs/{id}/exercises`
**Purpose:** the program's exercise rows, in `orderIndex` order.

### `POST /v1/programs/{id}/exercises` → `201`
**Purpose:** add an exercise to the program.

Body: `exerciseId` (required), `sets`, `reps`, `restSeconds`, `targetLoad`,
`notes`, `dayOfWeek`, `week`, `orderIndex`. `week` (added in migration V20)
places the row within a multi-week program; null reads as week 1.

### `PUT /v1/programs/{id}/exercises/{exId}`
**Purpose:** edit one exercise row — the prescription, its day, its week, or its
position in the list.

### `DELETE /v1/programs/{id}/exercises/{exId}` → `204`
**Purpose:** drop an exercise from the program.

---

## Scheduled sessions (diary)

`session/ScheduledSessionController.java` — what is *planned*. The diary screen.

### `GET /v1/sessions`
**Purpose:** the agenda. Query params `clientId`, `from`, `to` (epoch ms) narrow
it to a client and a date window.

### `POST /v1/sessions` → `201`
**Purpose:** book a session.

Body: `scheduledAt` (required, epoch ms), `clientId` (required), `programId`,
`durationMinutes`, `notes`, `dayLabel`, `templateDay`, `deliveryMode`
(`floor` | `remote`; null means "use whatever this client usually does").

### `GET /v1/sessions/{id}` · `PUT /v1/sessions/{id}` · `DELETE /v1/sessions/{id}` → `204`
**Purpose:** read, reschedule and cancel one booking. `PUT` can move
`scheduledAt`, change `status`, `durationMinutes`, `notes` or `deliveryMode`.

### `POST /v1/sessions/{id}/done`
**Purpose:** mark a booked session complete — the bridge from *planned* to
*logged*. Creates the corresponding workout session and decrements the client's
session pack.

Body (optional): `workoutNotes`, `sessionDate` (ISO `yyyy-MM-dd`; defaults to
today).

---

## Workout sessions & set logs

`session/WorkoutSessionController.java` — what *actually happened*. Kept separate
from scheduled sessions because a plan and a log are different records.

### `GET /v1/workouts?clientId=…`
**Purpose:** the workout history, optionally per client.

### `POST /v1/workouts` → `201`
**Purpose:** log a session that happened.

Body: `clientId` (required), `sessionDate` (required, ISO `yyyy-MM-dd`),
`programId`, `scheduledSessionId`, `notes`.

### `GET /v1/workouts/{id}` · `PUT /v1/workouts/{id}`
**Purpose:** read one logged session; `PUT` edits its `notes`.

### `GET /v1/workouts/{id}/sets`
**Purpose:** every set logged in this session.

### `POST /v1/workouts/{id}/sets` → `201`
**Purpose:** log one set — the highest-frequency write in the product.

Body: `exerciseId` (required), `setNumber`, `loadKg`, `reps`, `rpe`, `notes`.
These rows are what `/progress` computes PRs and volume from.

### `PUT /v1/workouts/{id}/sets/{setId}`
**Purpose:** correct a set — load, reps, RPE or notes.

### `DELETE /v1/workouts/{id}/sets/{setId}` → `204`
**Purpose:** delete a mis-entered set.

---

## Packages & payments (money book)

`payment/PackageController.java` — session packs sold, and money collected
against them.

### `GET /v1/clients/{clientId}/packages`
**Purpose:** every package sold to this client, newest first.

Each returns `type`, `sessionsTotal`, `sessionsRemaining`, `amount`, `currency`,
`startDate`, `endDate`, `status`.

### `POST /v1/clients/{clientId}/packages` → `201`
**Purpose:** sell a package.

Body: `type` (required), `amount` (required), `sessionsTotal`, `startDate`,
`endDate`. `sessionsRemaining` is seeded from `sessionsTotal` and decremented by
`POST /v1/sessions/{id}/done`.

### `GET /v1/packages/{packageId}/payments`
**Purpose:** the payment history against one package — what has been collected
versus what is owed.

### `POST /v1/packages/{packageId}/payments` → `201`
**Purpose:** record a payment.

Body: `amount` (required), `method` (required — cash / UPI / etc.),
`collectedBy` (required — trainer or gym; this is what drives the gym-share
split).

### `PATCH /v1/payments/{paymentId}/confirm`
**Purpose:** confirm a pending UPI payment once the money has landed.

Body: `{ "upiReference": "…" }`. Flips `status` and stamps `paidAt`. Separate from
`POST` because a UPI deep link is fired optimistically and confirmed later.

---

## Nudges

### `POST /v1/clients/{clientId}/nudge`
`nudge/NudgeController.java` · **`MESSAGING` tier — 10/min.**

**Purpose:** generate a WhatsApp nudge for a client (payment reminder, missed
session, and so on).

Body: `{ "templateName": "…" }`. Returns
`{ "nudgeId", "whatsappUrl", "message" }` — the backend renders the message from
the template and the client's live figures, logs the nudge, and hands back a
`wa.me` deep link the app opens. The backend does not send the message itself.

---

## Reports

`report/ReportController.java` — both **`MESSAGING` tier** where noted.

### `GET /v1/clients/{clientId}/report`
**Purpose:** an on-demand text report for one client, generated live from their
sessions, sets and metrics. Returns `{ "report": "…" }` — plain text, ready to
paste into WhatsApp.

### `POST /v1/clients/{clientId}/report/weekly` · **`MESSAGING` tier — 10/min**
**Purpose:** share on demand — write the *stored* weekly report for one week now,
rather than waiting for Monday's scheduled job.

Query param `weekStart` (ISO date); defaults to last week's start in
`Asia/Kolkata`. Returns `{ "weekStart", "stored" }`.

Idempotent, deliberately: a week that already has a report keeps the one it has,
and `stored: false` means it was already there. That is the answer to "can I
re-send last week's" — yes, and it will be the same numbers.

---

## Push devices

`push/DeviceController.java` — FCM token registration.

### `POST /v1/devices/token` → `204`
**Purpose:** register the device's native FCM token. The app posts here after
every sign-in and on every token refresh.

Body: `{ "token": "…", "platform": "android" | "ios" }`. Blank token → `400`;
unknown trainer → `404`.

### `DELETE /v1/devices/token` → `204`
**Purpose:** deregister on sign-out, so a shared or handed-on phone stops
receiving another trainer's notifications. Idempotent — a missing trainer is not
an error.

---

## Trainer sync

`sync/SyncController.java` — the WatermelonDB sync protocol. This is how the
offline-first app actually moves data; the REST endpoints above are the
online-only path. **`SYNC` tier — 60/min.**

### `GET /v1/sync/pull?lastPulledAt=…`
**Purpose:** everything that changed for this trainer since the cursor.

`lastPulledAt` is epoch ms; omit or pass `0` for a full initial sync. Returns
`{ timestamp, changes: { <table>: { created[], updated[], deleted[] } } }`.

Tables pulled: `clients`, `body_metrics`, `exercises`, `templates`, `programs`,
`program_exercises`, `scheduled_sessions`, `workout_sessions`, `set_logs`,
`workout_exercises`, `packages`, `payments`, `nudge_logs`, `working_hours`,
`time_blocks`, `packs`, `gym_settlements`, `nudge_rules`, `exercise_favourites`,
`batches`, `weekly_reports`.

`weekly_reports` is **pull-only and must stay that way** — the scheduled job
writes them, and a phone that could rewrite a sent report would make every one of
them arguable. The trainer reads the same rows the client does, so the two sides
never drift.

### `POST /v1/sync/push`
**Purpose:** apply the phone's local changes. Body is the WatermelonDB
`{ changes: { <table>: { created, updated, deleted } } }` envelope.

Returns `200` with `{ "rejected": [ { table, id, field, code, message, kept } ] }` —
empty on the overwhelming majority of pushes.

This used to answer `204` ("everything you sent, we took"), which is no longer
true: a roster row whose phone belongs to a trainer or to another trainer's
client is refused while everything around it lands. A silent refusal is the worst
option — the record sits on the phone looking synced and exists nowhere else — so
the push names what it would not take, per record, in words the app can put on
screen. `kept: true` means the rest of the record landed and only that field was
left as it was.

Tables accepted on push are the pull list **minus** `weekly_reports`.

---

## Client sync

`sync/ClientSyncController.java` — the client half of sync (FR-11).
**`ROLE_CLIENT` · `SYNC` tier — 60/min.**

These are separate routes rather than a flag on the trainer's, because the two
differ in the only way that matters: who the caller is allowed to be.
`/v1/sync/**` is gated to `ROLE_TRAINER` and reads the token subject as a trainer
id; these are gated to `ROLE_CLIENT` and read it as a phone. A client token
therefore cannot reach a roster even if a route were mistyped, and vice versa.

`clientId` is a **request parameter rather than a token claim**, on purpose: the
same person can be on two trainers' rosters, so one sign-in can legitimately hold
two client records. It is untrusted input, re-checked against the token's phone on
every single request.

### `GET /v1/client/sync/pull?clientId=…&lastPulledAt=…`
**Purpose:** the client's own slice of the data — scoped by a SQL wall, not by
trust in the parameter.

Tables: `clients`, `coaches`, `exercises`, `templates`, `programs`,
`program_exercises`, `scheduled_sessions`, `workout_sessions`,
`workout_exercises`, `set_logs`, `body_metrics`, `packages`, `payments`,
`weekly_reports`.

### `POST /v1/client/sync/push?clientId=…` → `204`
**Purpose:** apply what the client logged on their own phone.

Only four tables are accepted — `workout_sessions`, `workout_exercises`,
`set_logs`, `body_metrics` — plus session confirmations. Anything else in the
envelope is dropped and logged as "not a client's to write". A client can record
what they did; they cannot edit the program, the roster, or the money.

---

## Notes for callers

- **Soft deletes everywhere.** `DELETE` sets `deleted_at`; rows are tombstoned so
  sync can propagate the removal to every device. Nothing is hard-deleted.
- **Additive-only schema contract.** Response fields are added, never removed or
  repurposed. A client written against an older field set keeps working.
- **`404`, not `403`, for other trainers' data.** Ownership is a query filter, so
  a wrong id is indistinguishable from a missing one — by design.
- **Offline-first is the real path.** The app writes locally and reconciles
  through `/v1/sync`; treat the REST endpoints as the online complement, not the
  primary write path.

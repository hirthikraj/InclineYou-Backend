# InclineYou Backend — API Reference

Every HTTP endpoint the Spring Boot backend exposes, what it is for, and what it
expects. Generated from the controllers under
`backend/src/main/java/com/inclineyou/inclineyou_backend/`.

For the storage side of the same contract — tables, columns, keys, constraints
and indexes — see [`SCHEMA.md`](SCHEMA.md).

- **Base path:** all product endpoints live under `/v1`. `/health` is the one
  exception and is deliberately unversioned.
- **Auth:** bearer JWT in `Authorization: Bearer <token>`, issued by
  `POST /v1/auth/otp/verify`. The token's *subject* is a trainer UUID for
  trainer tokens and the **phone number** for every other role.
- **Content type:** JSON in, JSON out. Timestamps are epoch milliseconds unless
  the field name says `Date` (then it is ISO `yyyy-MM-dd`).

---

## Contents

| Area | Base | Endpoints | Status |
| --- | --- | --- | --- |
| [Health](#health) | `/health` | 1 | Reviewed
| [Auth & membership](#auth--membership) | `/v1/auth` | 8 | Reviewed
| [Sessions (web sign-in)](#sessions-web-sign-in) | `/v1/auth/sessions` | 3 | V41 · reshaped by [Settings v1.1](#settings-v11--account--sign-in-3-oct-2026)
| [Settings v1.1 — account & sign-in](#settings-v11--account--sign-in-3-oct-2026) | `/v1/auth/step-up` · `/v1/auth/sessions` · `/v1/trainers/me/phone` · `DELETE /v1/trainers/me` | 9 | v1.1
| [Workspaces](#workspaces) | `/v1/tenants` | 8 | V37–V42
| [Trainer profile](#trainer-profile) | `/v1/trainers` | 2 | Reviewed
| [The account](#the-account) | `/v1/trainers/me/phone`, `/v1/trainers/me` | 5 | V36
| [Settings v1.1 — profile, working week & messages](#settings-v11--profile-working-week--messages) | `/v1/trainers/me/consent` · `/setup/complete` · `PATCH /v1/working-hours` · `/v1/nudge-templates` | 6 | v1.1
| [Working hours](#working-hours) | `/v1/working-hours` | 2 |
| [Team coaching](#team-coaching) | `/v1/team` | 29 |
| [Clients](#clients) | `/v1/clients` | 10 |
| [Progress](#progress) | `/v1/clients/{clientId}/progress` | 1 |
| [Exercises](#exercises) | `/v1/exercises` | 5 | V9
| [Measuring cycle — V5](#measuring-cycle--v5) | — (fields on `/v1/clients`, `/v1/trainers/me`) | 0 | V5, V22
| [Assessments — V14](#assessments--v14) | `/v1/assessments`, `/v1/assessment-templates`, `/v1/assessment-catalog` | 11 | V14
| [Templates](#templates) | `/v1/templates` (incl. `/certified`) | 11 | V11
| [Programs](#programs) | `/v1/programs` | 11 |
| [Workout templates](#workout-templates) | `/v1/workout-templates` | 5 | V13
| [Scheduled sessions (diary)](#scheduled-sessions-diary) | `/v1/sessions` | 6 |
| [Workout sessions & set logs](#workout-sessions--set-logs) | `/v1/workouts` — **removed** | 0 |
| [Packs (the price list)](#packs-the-price-list) | `/v1/packs` | 3 |
| [Packages & payments (money book)](#packages--payments-money-book) | `/v1/clients/{id}/packages`, `/v1/packages`, `/v1/payments` | 14 |
| [Nudges](#nudges) | `/v1/clients/{clientId}/nudge`, `/v1/nudges`, `/v1/nudge-templates` | 6 |
| [Attention dismissals](#attention-dismissals) | `/v1/attention/dismissals` | 3 |
| [Reports](#reports) | `/v1/clients/{clientId}/report` | 2 |
| [Push devices](#push-devices) | `/v1/devices` | 2 |
| [Trainer sync](#trainer-sync) | `/v1/sync` | 2 |
| [Client sync](#client-sync) | `/v1/client/sync` | 2 |
| [Client portal](#client-portal--v1me) | `/v1/me` | 34 | modules 11a–11e

**Total: 200 endpoints.** (26 Sep 2026: the trainer's bell — the three `/v1/notifications` routes — and `POST /v1/programs/{id}/notify` were removed; there is no notification service in v1. 23 Sep 2026: V8 added `PATCH /v1/payments/{id}/write-off` and `POST /v1/payments/{id}/invoice`; V9 added `GET /v1/exercises/categories` and `GET /v1/exercises/{id}`; V11 added the three `/v1/templates/certified` routes; V13 added the five `/v1/workout-templates` routes; V14 added the eleven assessment routes; V15 added the three bell routes; module 11a added the sixteen `/v1/me` reads 11b the four workout writes 11c the three client writes, 11d the portal bell, `PATCH /v1/me/prefs` and `POST /v1/programs/{id}/notify`, and 11e the seven account routes; and V5's two sitting routes were removed with its table; V5's four body-assessment routes were missing from this table and are now counted. The total had read 129 while its own rows summed to 141 — it is now the sum of the rows.)

---

## Authorization model

Enforced in `config/SecurityConfig.java`, in this order — first match wins:

| Path | Requirement |
| --- | --- |
| `/v1/auth/trainer` | any authenticated token |
| `/v1/auth/mode/**` | any authenticated token |
| `/v1/auth/membership/**` | `ROLE_INVITED` |
| `/v1/auth/**`, `/health` | public |
| `/v1/client/**` | `ROLE_CLIENT` |
| `/v1/me`, `/v1/me/**` | `ROLE_CLIENT` — the client portal (module 11) |
| everything else | `ROLE_TRAINER` |

`/v1/team/**` deliberately has **no rule of its own** — it falls through to
`ROLE_TRAINER`, and the role checks *inside* a team (owner / admin / coach) are
`team/TeamScope.java`'s job rather than the security chain's, because they depend
on a database row and not on a path. See [Team coaching](#team-coaching).

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
| `MESSAGING` | `POST …/nudge`, `POST …/report/weekly`, `POST /v1/team/invites` | 10 / 60s |
| `STANDARD` | everything else — including every route V6–V15 added (write-off, invoice, exercise categories and by-id, the certified shelf, workout templates), none of which sends a message | 120 / 60s |
| *(exempt)* | `/health` | — |

Refusals return `429` with an RFC-7807 body carrying `"code": "RATE_LIMITED"`
and `retryAfterSeconds`. Counting is in Redis via Bucket4j, falling back to
in-process buckets when Redis is down.

`RATE_LIMIT_ENABLED` turns the whole filter off, and **it is off by default in
development**: `./mvnw spring-boot:run` activates the `dev` profile, which
defaults the flag to `false`. Everything else — a packaged jar, Railway, CI —
runs with no profile and therefore with the limiter on. The reason is the
keying: an unauthenticated local caller is `ip:127.0.0.1`, so Expo, the web dev
server and any curl loop share one `STANDARD` bucket and a hot reload spends it,
which shows up as `429`s indistinguishable from a bug in the screen being
worked on. The filter logs its state at boot, and warns when it is off.

## Error shape

Errors are RFC-7807 `ProblemDetail` documents with an extra `code` field the app
branches on (`exception/GlobalExceptionHandler.java`):

| `code` | Status | Meaning |
| --- | --- | --- |
| `OTP_WRONG` | 422 | Code did not match; an attempt was spent. |
| `OTP_EXPIRED` | 410 | Code was valid and has since lapsed. |
| `OTP_LOCKED` | 429 | Too many wrong codes — number locked, carries a countdown. |
| `OTP_THROTTLED` | 429 | Codes requested too fast — carries the real wait. |
| `PHONE_IS_TRAINER` | 409 | That's the caller's own number — trainer/client duality is allowed for everyone else's. |
| `PHONE_ON_ANOTHER_ROSTER` | 409 | That number is another coach's client **in this workspace**. Narrowed by V38: it used to mean "anywhere in the product", which made it impossible for one person to be a client of a private trainer and, separately, a client at a gym. |
| `RATE_LIMITED` | 429 | Tier budget exhausted. |
| `PHONE_ON_YOUR_ROSTER` | 409 | That number is already on the caller's own roster. |
| `PHONE_ALREADY_IN_TEAM` | 409 | That number is already in a coaching team. |
| `PHONE_ALREADY_INVITED` | 409 | This team already has an invite out to that number. |
| `PHONE_IS_SELF` | 422 | You cannot invite your own number. |
| `ALREADY_IN_TEAM` | 409 | The caller is already in a team. |
| `TEAM_SEAT_LIMIT` | 409 | No free seats; carries `seatLimit`. |
| `TEAM_INVITE_EXPIRED` | 410 | Older than the expiry window; ask for a new one. |
| `NOT_TEAM_ADMIN` | 403 | The action needs `owner` or `admin`. |
| `NOT_TEAM_OWNER` | 403 | The action needs `owner`. |
| `TEAM_MEMBERSHIP_REQUIRED` | 403 | The caller is in no team. |
| `MEMBER_NOT_IN_TEAM` | 404 | That coach is not an active member of the caller's team. |
| `CLIENT_NOT_IN_TEAM` | 404 | That client's coach is not in the caller's team. |
| `TEMPLATE_NOT_IN_TEAM` | 404 | That program is not in the caller's team library. |
| `PROGRAM_NOT_IN_TEAM` | 404 | That plan's coach is not in the caller's team. |
| `EXERCISE_NOT_IN_TEAM` | 404 | Not a team custom exercise; the seeded library is not editable. |
| `TEAM_RANGE_INVALID` | 422 | The revenue date range ends before it starts. |
| `CANNOT_REMOVE_OWNER` | 422 | Transfer ownership first. |
| `CANNOT_DEMOTE_OWNER` | 422 | The owner's role is changed by transferring, not editing. |
| `TEAM_ROLE_INVALID` | 422 | A member can be made `admin` or `coach`, nothing else. |
| `TEAM_READ_ONLY` | — | Sync-push rejection reason, not an HTTP status. |
| `NO_WORKSPACE` | 422 | The caller belongs to no workspace yet. |
| `NOT_A_MEMBER` | 404 | That workspace, or that row in it, is not the caller's — the *404, not 403* rule, one rung up. |
| `NOT_TENANT_ADMIN` | 403 | The action needs `owner`, `admin` or `gym_admin` **in that workspace**. |
| `SWITCHING_DISABLED` | 422 | `app.tenant.switching-enabled=false`. |
| `CANNOT_LEAVE_OWN` | 422 | You cannot leave your own practice. |
| `PHONE_IN_THIS_WORKSPACE` | 409 | Another coach in this workspace already has that number. |
| `NOT_A_COACH_HERE` | 422 | The receiving trainer does not coach in this workspace. |
| `VALIDATION` | 400 | A field was refused; `detail` names it and says why (`gender: must be one of …`, `dateOfBirth: that date is in the future`, `paidAt: …`, an empty note). **Branch on the field in `detail` only for display** — the code is shared on purpose, so a new field needs no new code. Thrown by `AccountRuleException`, `ClientRuleException`, `PackageRuleException`, `WorkoutRuleException` and `AssessmentRuleException`. |
| `ALREADY_COLLECTED` | 409 | **V8.** Write-off refused: the payment was already collected (`paid` / `confirmed`). |
| `WRITTEN_OFF` | 409 | **V8.** The payment was written off — it cannot be invoiced, and it cannot be confirmed. |
| `GYM_COLLECTED` | 409 | **V8.** Invoice refused: the gym is the collector of record and raises its own receipt. |
| `NOT_PAID` | 409 | **V8.** Invoice refused: the payment is still pending, and the bill prints *Paid on*. |
| `PAYMENT_NOT_FOUND` | 404 | **V8.** Not one of the caller's payments, or not in the active workspace. |
| `PACKAGE_NOT_FOUND` | 404 | Not one of the caller's packages. |
| `CLIENT_NOT_FOUND` | 404 | Not on the caller's roster (money-book routes). |
| `PACKAGE_NEEDS_PRICE` · `PACKAGE_NEEDS_SESSIONS` · `PACKAGE_FIELD_INVALID` | 400 | A sale that cannot be written as sent — no price, no session count on a session pack, an unknown enum value or a malformed date. |
| `PACKAGE_BAD_EXTENSION` | 400 | An extension outside 1–365 days. |
| `PACKAGE_BAD_SESSION_COUNT` · `PACKAGE_NO_CHANGE` | 400 | A V4 count correction out of range, or to the count it already has. |
| `PACKAGE_NO_EXPIRY` | 409 | Extending a pack that has no expiry date. |
| `PACKAGE_FEWER_THAN_DELIVERED` | 409 | Correcting a count below the sessions already delivered. |
| `PACKAGE_NOT_COUNTED` | 409 | Correcting sessions on a pack that does not count them. |
| `PACKAGE_ALREADY_PAUSED` · `PACKAGE_NOT_PAUSED` | 409 | Pause on a paused pack, resume on a running one. |
| `PACKAGE_NOT_LIVE` | 409 | Pause / resume / extend on a pack that has finished — renew instead. |
| `PACK_NEEDS_NAME` · `PACK_NEEDS_PRICE` · `PACK_NEEDS_SESSIONS` · `PACK_FIELD_INVALID` · `PACK_FIELD_UNKNOWN` | 400 | A price-list entry that cannot be written as sent. |
| `PACK_OWNER_IMMUTABLE` | 400 | A pack's `owner` cannot change — it would re-attribute every package sold from it. |
| `PACK_NOT_FOUND` | 404 | Not on the caller's price list. |
| `UNKNOWN_VARIABLE` | 400 | v1.1 — a `{token}` in a nudge-template body that the template does not fill; the sentence names the ones it does. |
| `CONSENT_REQUIRED` | 400 | v1.1 — `POST /v1/trainers/me/consent` with a `policyVersion` that is missing or is not the notice in force (`app.privacy.policy-version`). |
| `PROFILE_TOO_LONG` | 400 | v1.1 — `headline` over 80 or `bio` over 1200 on `PATCH /v1/trainers/me`; refused, never truncated. |
| ~~`NUDGE_TEMPLATE_UNKNOWN` · `NUDGE_TEMPLATE_EMPTY` · `NUDGE_TEMPLATE_TOO_LONG`~~ | — | Retired in v1.1 by the nudge-templates rewrite: an unknown name is a plain 404, a blank or over-long body is `VALIDATION`. |
| `NUDGE_CLIENT_NOT_FOUND` | 404 | The client is no longer on the caller's roster. |
| `NUDGE_NO_PHONE` | 422 | The client has no phone number, so there is nowhere to send the link. |
| `EMAIL_INVALID` · `EMAIL_TOO_LONG` | 400 | V36's contact address is not shaped like one, or is over 254 characters. |
| `DELETE_NOT_CONFIRMED` | 400 | Closing the account (deprecated typed path): the typed confirmation is not this account's number. |
| `STEP_UP_REQUIRED` | 403 | A dangerous act (change number, close account) without a valid step-up ticket for it. See *Settings v1.1*. |
| `TICKET_EXPIRED` | 401 | The step-up ticket was right but has aged out or been spent — start the step-up again. |
| `PHONE_INVALID` | 400 | The new number is not an E.164 Indian mobile. |
| `ASSESSMENT_NOT_FOUND` | 404 | **V14.** Not one of the caller's sent assessments, or deleted. (V5 used this code for a body reading; that is now `READING_NOT_FOUND`. V5 never shipped, so no build reads the old meaning.) |
| `ASSESSMENT_TEMPLATE_NOT_FOUND` | 404 | **V14.** Not one of the caller's assessment templates, or deleted. |
| `READING_NOT_FOUND` | 404 | **Retired by V22** with the routes that raised it (`PUT` / `DELETE /v1/clients/{id}/body-metrics/{metricId}`). Nothing returns it; the code is kept out of reuse. |
| `SCHEDULE_MISMATCH` | 400 | `POST /v1/templates/{id}/apply`: the schedule — sent, or derived from the client's standing week — does not name the template's days one-for-one. `detail` names the numbers. |
| `SCHEDULE_INVALID` | 400 | `apply`: a slot on no weekday, two slots on one weekday, or a time that is not `HH:mm`. |
| `CERTIFIED_READ_ONLY` | 403 | **V11.** `PUT` / `DELETE /v1/templates/{id}` aimed at a certified program — copy it and edit the copy. |
| `CERTIFIED_COPY_FIRST` | 409 | **V11.** `apply` aimed at a certified program — a client is only ever put on a copy. |
| `CERTIFIED_NOT_FOUND` | 404 | **V11.** No such certified program, or it has been retired. |
| `WORKOUT_NOT_FOUND` | 404 | **V13.** Not one of the caller's saved workouts, or deleted. |
| `NOT_A_CLIENT` | 403 | **Portal.** Signed in as a client, but the number is on no live roster. |
| `NOT_YOURS` | 403 | **Portal.** `?clientId=` is not one of this number's rows — the same answer whether it exists or not. |
| `NOT_FOUND` | 404 | **Portal.** An `{id}` route on something that is not this client's (a plan, a workout, an assessment); `detail` is the sentence the page prints. |
| `SESSION_CANCELLED` | 409 | **Portal 11b.** Starting a workout against a cancelled session. |
| `WORKOUT_CLOSED` | 409 | **Portal 11b.** A set or a swap on a finished workout. |
| `NOT_APPROVED` | 422 | **Portal 11b.** A swap to anything but the trainer's approved alternative. |
| `ALREADY_STARTED` | 409 | **Portal 11b.** A swap of a movement that already has a logged set. |
| `ALREADY_IN_WORKOUT` | 409 | **Portal 11b.** A swap to a movement already in today's log. |
| `CLOSED` | 409 | **Portal 11c.** Answering or submitting an assessment already sent back. |
| `EMPTY` | 400 | **Portal 11c.** Submitting an assessment with nothing answered. |
| `PHONE_UNCHANGED` · `PHONE_TAKEN` · `PHONE_CHANGE_UNPROVEN` | 400 · 409 · 401 | Also returned by the **portal's** number change (11e), with the trainer's meanings. `PHONE_TAKEN` never says who holds the number. |

The rows from `VALIDATION` down were added on 23 Sep 2026: the six V8 codes are
new, and the rest already existed in the code and in their own sections below
(Packages, Packs, Nudges, The account, Body assessments) but were missing from
this catalogue. Codes documented **only** in their section's own table —
`PHONE_UNCHANGED`, `PHONE_TAKEN`, `PHONE_CHANGE_UNPROVEN` under *The account*,
and V5's `ASSESSMENT_METRIC_UNKNOWN` / `ASSESSMENT_VALUE_RANGE` /
`ASSESSMENT_INTERVAL_RANGE` under *Measuring cycle* — are listed there.

The three team `403`s look like they contradict the *404, not 403* rule below, and
do not. That rule is about **cross-trainer** access, and it still holds: anything
reaching *outside* the caller's team (`MEMBER_NOT_IN_TEAM`, `CLIENT_NOT_IN_TEAM`)
is a `404` for exactly the old reason. Inside a team the caller already knows the
team is real — they are in it — so hiding "you are not an admin" behind a `404`
would deny them a fact they are entitled to and leave the app unable to draw the
difference between *ask your owner to promote you* and *this is gone*.

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
| `clientOf[]` | every LIVE roster this number is on (`Membership`) — populated for a `trainer` role too, now that trainer/client duality is allowed |
| `pausedInfo` / `removedInfo` | who paused/ended it and when |

`role` is the *home* role — which screen sign-in opens into by default, not an
exclusivity lock. A phone can own a trainer account and also be a live client
on somebody else's roster; `clientOf[]` on a trainer's response is how that
surfaces, and `POST /v1/auth/mode/trainer` / `mode/client` (below) switch
between them without a fresh sign-in.

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

### `POST /v1/auth/mode/trainer`
**Purpose:** switch a signed-in session into trainer mode. *Any authenticated
token.* For a phone that is currently signed in as a client (or mid-invite) but
also owns a trainer account. 404s (no body beyond the standard error shape) if
this number owns no trainer account. Mints a fresh trainer token and returns
the same `AuthResponse` shape a trainer's own sign-in gets, `clientOf[]`
included; the caller's previous token is simply left to expire.

### `POST /v1/auth/mode/client`
**Purpose:** switch a signed-in session into client mode. *Any authenticated
token.* For a trainer whose own number also holds a **live** (accepted or
paused) membership on somebody else's roster. No body — a client token is
bound to the phone, not to one relationship, so the response carries every
live roster this number is on, same as any other client sign-in; the app's
existing multi-roster picker disambiguates from there. 404s if there is no
live membership anywhere for this number.

---

## Sessions (web sign-in)

> **3 Oct 2026** — the list and sign-out routes are `/v1/auth/sessions` ([Settings v1.1](#settings-v11--account--sign-in-3-oct-2026)). The singular `GET/DELETE /v1/auth/session` and `/all` were removed the same day, once the web no longer called them.

**Two kinds of credential, one interface.** `AuthTokenService` picks; nothing
below it can tell which answered.

| | Phone | Web |
| --- | --- | --- |
| Credential | a signed **JWT**, 7 days | an opaque **session token**, 72 hours |
| Chosen by | no header, or anything but `web` | `X-InclineYou-Client: web` |
| Works offline | yes — that is the whole reason | no, and does not need to |
| Revocable | **no**; it expires on its own clock | **yes**, immediately |
| Switching workspace | a new token, because the workspace is a signed claim | an `UPDATE`; the browser keeps the token it has |
| Shape | three dot-separated segments | begins `xs_` |

A session token may travel as `Authorization: Bearer xs_…` **or** in an
`inclineyou_session` cookie — the cookie so that browser JavaScript never has to hold
it. The row stores a **SHA-256 of the token**, never the token: a database dump
must not be a set of live credentials. SHA-256 rather than bcrypt because this is
256 bits of `SecureRandom` with no structure to guess, so it wants a fast one-way
function, not a KDF on the hot path of every request.

`POST /v1/auth/otp/verify` is unchanged except that the response now carries
`tokenKind` — `jwt` or `session`. Nothing on the server branches on it; the web
needs to know it holds something revocable and the phone needs to know it holds
something that works with no signal.

---

## Workspaces

**One person belongs to several workspaces.** A trainer coaches privately *and*
at a gym with different clients; one human can be a client under two separate
arrangements. `tenant` is the workspace, `tenant_member` is the many-to-many, and
every row in the product carries an **immutable** `tenant_id` stamped where it
was created.

Two things follow that the client has to understand:

- **`X-InclineYou-View: focused`** narrows reads to the active workspace. Absent or
  `combined` (the default) spans every workspace the caller belongs to, which is
  what puts a 07:00 private client and an 18:00 gym client on one Today screen.
- **The money book ignores that header entirely.** Packages, payments, packs and
  settlements are always the active workspace alone, enforced by the database
  (tier 2 in `V42__row_level_security.sql`), so a total is never a mix of two
  businesses.

### `GET /v1/tenants`

The switcher. Home first, then by name.

```json
[{ "id": "…", "type": "solo", "name": "Priya's practice", "role": "owner",
   "home": true, "active": true, "administers": true,
   "revenueSharePercent": null, "assignmentMarginPercent": null }]
```

`type` is `solo` · `team` · `gym`. `revenueSharePercent` **null means 100%**,
which is the only correct answer for a solo workspace.

### `POST /v1/tenants/{id}/activate`

Stand somewhere else. Body `{ "remember": true }` also makes it the workspace the
app opens in next time.

```json
{ "tenantId": "…", "token": null, "tokenKind": "session" }
```

**`token` is null when the existing credential still works** — the web case,
because moving a session is an `UPDATE`. The client must not read null as a
sign-out. A JWT caller gets a fresh token here and should replace the one it has.

`404 NOT_A_MEMBER` for a workspace that is not one of the caller's — deliberately
not a 403, per the *404, not 403* rule.

### `GET /v1/tenants/{id}/members`

Everyone who works here, with their `clientCount` **in this workspace** — a coach
may hold twelve here and four somewhere else, and the second number is none of
this workspace's business.

### `PATCH /v1/tenants/{id}/members/{memberId}/shares` → `204`

`{ "revenueSharePercent": 70, "assignmentMarginPercent": 5 }`. Owner/admin only.
**Null means leave it alone**, the same contract `/v1/trainers/me` uses — a PATCH
naming one percentage cannot blank the other.

Changes apply from now. Every handover already recorded keeps the margin frozen
onto its `client_assignment` row, for the reason V11 froze `share_percent` onto a
payment: an admin who renegotiates in March must not restate what they earned in
January.

### `PATCH /v1/tenants/{id}/members/{memberId}/role` → `204`

`{ "role": "admin" }`. The owner's role is not editable here.

### `GET /v1/tenants/{id}/revenue?from=&to=`

Role decides the shape:

| Role | Sees |
| --- | --- |
| `owner` · `admin` · `gym_admin` | the workspace total **and** the split per coach |
| `coach` | their own line, and **no total** — not a rank, not a share of something |

Everyone also gets `myShare` (their collections × their percentage) and
`myPlacementMargin` (what their placements earned, at the margin frozen on each
client, excluding clients they placed with themselves).

**Collected means `paid` OR `confirmed`** — REST writes the first, sync has
carried the second since V1, and counting one halves a trainer's month.

Note this is a *different* endpoint from `GET /v1/team/revenue`, which stays
owner-only and totals-only for a V26 team. This one is workspace-shaped and is
the version a gym uses.

### `GET /v1/tenants/{id}/stale-clients`

Everyone here with no working coach, oldest first, with the outstanding balance —
because a client who has paid for eight sessions and has nobody to take them is a
refund waiting to happen.

### `POST /v1/tenants/{id}/members/{trainerId}/unavailable` → `200`

`{ "clientsNeedingACoach": 12 }`. A coach has stopped working here.

**It marks `client.stale_at` and touches nothing else.** `status` is untouched,
so every `WHERE status = 'active'` read on the server and on every phone in the
field keeps counting them — a stale client is still an active client; what is
missing is a coach. V30 made exactly this call for `paused_at`.

Their clients in **other** workspaces are not affected. Those are a different
tenant and were never in scope, which is the whole reason leaving a gym is cheap.

### `POST /v1/tenants/{id}/clients/{clientId}/assign` → `204`

`{ "toTrainerId": "…", "note": "…", "reason": "trainer_left" }`

Gives a client a coach. **The client keeps everything** — measurements, logged
sessions, payments and their plan are the same rows before and after. What
changes hands is the forward-looking work: `client.trainer_id`, the current
program, and sessions from today onward. Logged workouts and collected payments
keep their original `trainer_id`, because they record who did the work and who
took the money.

`tenant_id` does not change and cannot: a handover happens *inside* a workspace,
and the immutability trigger refuses anything else.

`422 NOT_A_COACH_HERE` if the receiving trainer does not work in this workspace.

---

## Trainer profile

`trainer/TrainerController.java` — the signed-in trainer's own record.

### `GET /v1/trainers/me`
**Purpose:** the profile the app draws Settings and the money screen from.

Returns id, phone, name, `upiVpa`, `experienceBand`, `specialities[]`,
`certifications[]`, `languages[]`, `setupComplete` / `setupCompletedAt`,
`gymName`, `gymSharePercent`, a `preferences` map, V33's identity block —
`headline`, `bio`, `introVideoUrl`, `introVideoId` — V34's place block:
`mapLink`, `trainingModes[]`, `serviceAreas[]` — and V35's social block:
`instagramUrl`, `youtubeUrl`, `instagramHandle`, `youtubeHandle` — V36's
`email` — V5's `assessmentIntervalDays`, `assessmentMetrics` — and V6's `gender`.

**`gender` (V6)** is `woman` · `man` · `nonbinary` · `undisclosed`, or null for
*never asked*. `undisclosed` is an answer, not an absence, and the setup flow's
step 1 counts as answered only once `name` and `gender` are both set. On the
PATCH, null leaves it alone, `""` clears it, and any other id is refused with
`400 VALIDATION` and a `detail` naming the four.

A null `gymName` means *no gym*, which is not the same as a 0% cut — one hides
the "your share" line entirely, the other claims an arrangement that keeps all
of it.

**The identity block is the part a CLIENT reads** — nothing in InclineYou branches on
any of it. `introVideoId` is **derived, not stored**: the 11 characters out of
`introVideoUrl`, sent so a caller that wants a thumbnail or an `<iframe>` does
not re-implement the parse. It is ignored on the way up. There is no profile
photo yet — the service has no image store — so the initials avatar both halves
draw is still the trainer's face.

**`trainingModes` is not `workMode`, and a caller must not treat it as one.**
`workMode` (V23) and `gymName` are the money book's defaults hint — which price
lists exist, who collects. `trainingModes` (V34) is how the coaching is actually
delivered: `gym_floor`, `home_visit`, `online`, `hybrid`, plus anything
`custom:`-prefixed. A trainer whose `workMode` is `gym` may still take home
visits, so neither answer can be derived from the other. `serviceAreas` is free
text — the localities a trainer travels to — and exists because `home_visit` with
no answer to *how far* is not information a client can act on.

**`youtubeUrl` is a CHANNEL; `introVideoUrl` is one video.** Two columns, two
promises to a client, and a caller must not fall back from one to the other.
`instagramHandle` and `youtubeHandle` are **derived, not stored** — the `@handle`
out of each URL, sent for the same reason `introVideoId` is, so a card that wants
to render `@ravi.trains` rather than a URL does not re-implement the parse. Both
are ignored on the way up, and `youtubeHandle` is **null for a `/channel/UC…`
URL**, which genuinely has no handle: an honest null rather than an invented one.

**`email` (V36) is a CONTACT DETAIL and not a credential.** There is no email
anywhere else in this product: sign-in is a phone number and a six-digit code,
and this service has no mail transport, no verification token and nothing that
could send one. So it is stored, returned, and branched on by nothing — the
position `bio` is in. It is deliberately **not unique and not indexed**:
uniqueness is a property of a login, and two trainers sharing a studio inbox is
not an error. Null means never answered.

### `PATCH /v1/trainers/me`
**Purpose:** partial profile update — onboarding writes here, so does Settings.

Every field is optional; only what is sent is written. `completeSetup: true`
stamps `setupCompletedAt`. Settings switches live under `preferences`.

**Omitting a field leaves it alone; sending `""` clears it.** The one asymmetry
is `name`, which ignores a blank rather than clearing — a nameless trainer
cannot send an invite.

**`gender` (V6)** is one of `woman` · `man` · `nonbinary` · `undisclosed`
(case-insensitive, stored lower-case); `""` clears it and anything else is
`400 VALIDATION` with a `detail` naming the four — a typed refusal, so the
sentence reaches the setup step rather than being lost to the servlet error page.
The redesigned setup flow counts step 1 as answered only once `name` and `gender`
are both set, so a PATCH that dropped it would leave a trainer unable to finish
setup — which is what it did before V6.

Three rules on the V33 identity fields:

- `headline` is capped at **80** characters and `bio` at **1200**, and both are
  **refused with a 400 rather than truncated**. Every other string on this
  endpoint truncates silently, which is right for a pasted name and wrong for
  prose: answering 200 while dropping the last sentence of somebody's bio is the
  worst of the three available outcomes. Both halves cap in the UI, so a screen
  never meets this.
- `introVideoUrl` accepts any YouTube shape a share sheet produces — `youtu.be`,
  `/shorts`, `/embed`, `/live`, `m.` and `music.` hosts, the id anywhere in the
  query — and **stores it canonical**: `https://www.youtube.com/watch?v=<id>`. A
  `t=` offset, a `list=` playlist and every tracking parameter are dropped: an
  intro video starts at the beginning and is one video. Anything else is a 400.
- Validation is **shape only**. Nothing here reaches YouTube to check the video
  exists or is public — a write path that made an outbound call would turn saving
  a profile into a request that fails when someone else's service is down.

And two on V35's social links, which go the OTHER way from `mapLink`:

- It is stored **verbatim**, not canonicalised, and the only check is that it
  starts `http://` or `https://` (refused over **500** characters, again rather
  than truncated — a URL cut short is broken, not shortened). The asymmetry with
  `introVideoUrl` is deliberate: a YouTube link has one canonical form and one
  field that matters, while a maps URL is a short `maps.app.goo.gl` redirect from
  one share sheet, a long `/maps/place/…@lat,lng,z/data=` string from another,
  and something else again from Apple or OpenStreetMap. A normaliser would
  eventually break a link that worked.
- `instagramUrl` and `youtubeUrl` are **canonicalised**, like `introVideoUrl` and
  unlike the field above them. The seam: a profile reduces to a handle and a
  video reduces to an id — both are the whole fact — while a place reduces to
  nothing. Accepted: a bare `@handle` or a bare handle, and any profile URL with
  or without scheme, `www.`/`m.`, trailing slash or query. Stored:
  `https://www.instagram.com/<handle>` and `https://www.youtube.com/<path>`,
  share tokens (`igsh=`, `si=`) dropped. Refused over **500** characters —
  and this is the one field where truncating would not fail loudly, because a
  canonicaliser handed a cut URL reads the shortened handle as a real one and
  stores a link to somebody else's account.
- **What the canonicaliser must never do is rewrite the identifying part.** A
  YouTube channel is addressable four ways — `/@handle`, `/channel/UC…`, `/c/…`,
  `/user/…` — which are not interchangeable, so the path is kept exactly as
  given and only the scheme, host and query are normalised. Resolving between
  them would need a call to YouTube, and this write path never reaches the
  network. Two shapes are refused with a sentence that names the mistake: an
  Instagram **post or reel** (`/p/`, `/reel/`, `/stories/`, …) is a link to one
  video, not to an account, and a **watch URL** in `youtubeUrl` belongs in
  `introVideoUrl` one field up.

And one on V36's `email`:

- Capped at **254** — RFC 5321's ceiling on an address — and **refused with a
  400 rather than truncated**, which puts it with `headline` and `bio` rather
  than with the silently-trimmed strings: half an address is not a shorter
  address, it is a wrong one, and a truncation would store a plausible-looking
  string that reaches nobody. `""` clears it.
- Validation is **shape only, and deliberately loose**: one `@`, something on
  each side of it, a dot in the domain, no whitespace. No attempt at RFC 5322 —
  a regex that tries costs several hundred characters, still gets quoted local
  parts wrong, and rejects addresses that work. **The only check that settles an
  address is sending to it**, and this service cannot send, so the honest
  ceiling on what it may claim is *that is not an address at all*.

---

## The account

`trainer/AccountController.java` and `trainer/AccountDeleteController.java` —
the login itself, and the way out. Separate from the profile above, which is one
GET and one PATCH whose whole contract is *null means leave it alone*: every
route here rewrites or retires an identity and each carries a proof a profile
PATCH has no concept of.

All of them are `STANDARD` tier and `TRAINER`-only. **The codes are
`OtpService`'s**, the same ones `/v1/auth/otp/*` sends, so every wait, lock and
daily ceiling that governs sign-in governs these too, per number, and they raise
the same three errors with the same `code`s and the same `retryAfterSeconds`.

### Changing the number you sign in with

> **Superseded 3 Oct 2026 by [Settings v1.1](#settings-v11--account--sign-in-3-oct-2026)** — the proof of the *current* number is now one shared **step-up** (`/v1/auth/step-up`), `confirm` no longer returns a token, and deletion is confirmed by a ticket, not the typed number. `/phone/challenge` and `/phone/verify` were removed on 3 Oct; the typed-number DELETE body below still answers, as **deprecated**, until the web sends the ticket.

Four calls (the first two are the shared step-up), and **two numbers are proved, not one**.

```
POST /v1/auth/step-up                {purpose: phone_change}  → 204   (code to the OLD number)
POST /v1/auth/step-up/verify         {purpose, otp}           → {ticket, expiresAt}
POST /v1/trainers/me/phone/request   {ticket, phone}          → 204    (code to the NEW number)
POST /v1/trainers/me/phone/confirm   {ticket, phone, otp}     → {phone}
```

The **old** number is proved because a bearer token is seven days long and lives
in a cookie: without this step anybody holding one could re-point the account at
a number they control and lock the trainer out of their own book permanently.
The **new** number is proved because a mistyped last digit would otherwise move
the account to a stranger's phone, with no way back — the old number no longer
signs in and the new one is not theirs.

`ticket` is a **short-lived signed JWT**, ten minutes, `role: phone_change`,
subject the trainer id, `phone` the number that was proved. It is the memory
that step 2 happened, and it is a ticket rather than a row because a table would
be a second place for a half-finished change to live and a row nobody sweeps
outlives the SIM it is about.

**It is never an `Authorization` header** — it travels in the body alongside the
trainer's real bearer token, because it is a second factor rather than a
credential. `SecurityConfig`'s `anyRequest().hasRole("TRAINER")` is what makes
that true rather than merely intended: a `phone_change` role presented as a
bearer authenticates nothing.

It is checked against the trainer's **current** number when spent, so a ticket
minted before one change is not spendable after it.

`confirm` rewrites `trainer.phone` and `app_user.phone` in **one transaction** —
a change that landed on one and not the other is an account that either cannot
be signed into or cannot be found once you are in. It answers a **fresh token**,
because the old one carries the old number in its `phone` claim; the caller must
store it.

Refusals, each with a `code` and a sentence in `detail`:

| Code | Status | Means |
| --- | --- | --- |
| `PHONE_UNCHANGED` | 400 | the new number is the one they are already on |
| `PHONE_TAKEN` | 409 | somebody already holds it — **it does not say who**, or this endpoint would answer *is this number on InclineYou* for any number in India |
| `PHONE_CHANGE_UNPROVEN` | 401 | no ticket, a forged one, or one that aged out — go back to step 1 |
| `OTP_WRONG` · `OTP_EXPIRED` · `OTP_LOCKED` · `OTP_THROTTLED` | as at sign-in | the same three, from the same service |

Availability is checked at **step 3 and again at step 4**: once so that a number
that can never work is refused before an SMS is spent on it, and again because
two minutes is long enough for somebody else to sign up in between. It counts
**soft-deleted rows as occupied**, which is the same rule the deletion note
below states from the other side.

### `DELETE /v1/trainers/me` → `204`
**Body:** `{confirmPhone}` — the trainer's own number, typed back. Compared on
the last ten digits, so whichever way a screen formatted it is an answer this
accepts; a mismatch is `DELETE_NOT_CONFIRMED`, 400.

A body on a DELETE is unusual and is the right shape: the confirmation is a
proof rather than an identifier, and a query string would write the trainer's
own number into every access log between the browser and here.

**It is a soft delete** — `deleted_at` on `trainer` and on `app_user`, in one
transaction. There is no hard delete and there cannot be a cheap one:
`client.trainer_id` is NOT NULL and twenty tables hang off `client` in turn, so
removing the row would take a year of somebody's sessions, packages and payments
with it. What the stamp does is what a trainer means by *delete*: the number
stops resolving at sign-in, every route stops loading, and nothing in the
product can reach any of it again.

**The number is not released.** Both phone columns are plain UNIQUE indexes
rather than partial on `deleted_at`, so the deleted row keeps its number and a
fresh sign-up on it is refused. Deliberate, and V36 carries the argument: the
trainer's clients, packages and payments all still point at that row, and
handing the number to a second person would put a stranger's sign-in next to a
year of somebody else's money. **A caller must say so before the button works.**

**There is no OTP on this one**, and the asymmetry with the flow above is
considered: changing a number is an attacker's goal, because it takes the
account over. Deleting is nobody's goal but the owner's — it destroys what an
attacker would want and hands them nothing. What it needs protection from is a
mis-tap, and ten typed digits is what supplies that.

Calling it twice is a **404**, which is the honest answer to deleting something
already gone.

---

## Working hours

`trainer/WorkingHoursController.java` — the trainer's own week. **Read, and (v1.1, 3 Oct 2026) `PATCH`** — replaces only the weekdays listed; see [Settings v1.1](#settings-v11--profile-working-week--messages). The phone still writes this table offline through `/v1/sync/push`.

### `GET /v1/working-hours`
**Purpose:** the working windows the diary and the day ribbon are drawn on.

Returns a list of `{ id, weekday, startMinute, endMinute, metadata, createdAt,
updatedAt }`, sorted by `weekday` then `startMinute`.

`weekday` is **0 = Monday … 6 = Sunday** — the column's own ISO order, matching
the day strip on both halves and *not* JavaScript's `getDay()`, where Sunday is
0. A caller converting from a `Date` has to shift.

**A split shift is two rows on one weekday**, which is the whole reason this is a
table rather than a pair of columns on `trainer`: one range per day would claim
the trainer is free for lunch. Callers merge overlaps themselves — both halves
already own that function (`mergeWindows` in `app/src/diary/diary.ts` and in
`web app/web/lib/setup/hours.ts`).

A trainer who has never answered the hours step gets `[]`, not a default week.
Inventing 06:00–11:00 here would draw a working window for somebody who never
said so, and price a gap inside it at a rate they never set.

**Why it exists, and why there is no write path.** Until now `working_hours`
reached the wire only inside the WatermelonDB envelope, because the only client
that needed it was the phone, which gets it on its cursor. The web's Today screen
cannot be drawn without it — the windows are the ribbon's ground, the hole
between two shifts is the shape of a split-shift day, and a *sellable gap* is by
definition free time inside a window. The alternative was `/v1/sync/pull`, which
for an established trainer carries the 1,324-row exercise library and every set
log ever recorded, on a screen that is opened every morning and left open.

Writes stay where they were: setup pushes these rows through `/v1/sync/push`, and
the per-day editor is in the diary on the phone. A permission-shaped table with
two write paths is how the two halves drift.

---

## Team coaching

`team/TeamController.java` — a senior trainer running a team of trainers. Full
design in `agent/InclineYou_team_coaching_prd.md`. **All three phases are built**:
forming a team, who is in it, the shared exercise pool, team-wide client reads,
client reassignment, the shared program library, admins editing a teammate's plan
in place, and the owner's revenue roll-up.

Everything here is `ROLE_TRAINER` and `STANDARD` tier, except
`POST /v1/team/invites`, which is `MESSAGING`.

**The governing idea:** *a team is a visibility grant, never a change of owner.*
Every row keeps its `trainer_id` and every existing endpoint keeps filtering on
it — not one of the 63 endpoints that predate this section changed what it
returns. What a team adds is a resolver (`TeamScope`) that widens the *set* of
trainer ids an owner or admin may **read** from `{me}` to `{me + my team}`. Reads
widen; ownership does not move. Which is also why joining a team changes nothing
about a coach's clients, programs or money, and leaving changes nothing back.

**Two things a team never grants**, both deliberate:
- **A teammate's money book.** `package`, `payment` and `gym_settlement` are never
  returned under any `/v1/team/**` path except
  [`GET /v1/team/revenue`](#get-v1teamrevenue), which is **owner-only and totals
  only** — no payment row, no client name. Everywhere else the split a coach
  negotiated with a gym is not the next coach's business, and there is a test
  asserting the absence.
- **Offline access to team-wide data.** Only `team` and `team_member` enter sync
  (see [Trainer sync](#trainer-sync)); teammates' clients are online-only REST.
  An offline copy leaves with the phone, and an admin removed on Tuesday must not
  still hold forty clients' history on Wednesday.

**Roles.** `owner` · `admin` · `coach`. The owner is not a fourth kind of admin —
it is the admin who cannot be removed. Admins may invite, remove coaches, and
promote coaches; only the owner may remove or demote an *admin*, edit the team,
transfer ownership, or delete the team. Two admins able to demote each other in a
race is an incident with no upside.

**Kill switch.** `TEAM_ENABLED=false` makes every endpoint here `404` and stops
any caller's read scope widening — two mechanisms, because they answer two
different questions.

### `GET /v1/team`
**Purpose:** the caller's team, their role in it, and seat usage.

Returns `id`, `name`, `logoUrl`, `seatLimit`, `activeMembers`, `pendingInvites`,
`ownerTrainerId`, `myRole`, `createdAt`, `updatedAt`.

**`204` when the caller is in no team** — that is the normal state for almost
every trainer, and it is not an error.

### `POST /v1/team` → `201`
**Purpose:** create a team and become its owner. Body: `name` (required),
`seatLimit` (optional; defaults from `app.team.default-seat-limit`, 5).

`409 ALREADY_IN_TEAM` if the caller is already in one — one team per trainer,
enforced by a partial unique index, for the same reason `app_user.role` is
exclusive.

### `PATCH /v1/team` · `DELETE /v1/team` → `204`
**Purpose:** edit `name` / `logoUrl` / `seatLimit`; or end the team. **Owner only.**

A seat limit below the current headcount is allowed: it only gates future
accepts. Deleting soft-deletes the team and every membership — and touches no
client data, ever. Every coach walks away with exactly what they walked in with.

### `POST /v1/team/transfer-ownership`
**Purpose:** hand the team over. Body: `{ "memberId": "…" }`. **Owner only.**

The old owner becomes an `admin` in the same transaction. Standing down happens
first, which is both the honest order of events and the only order the
one-active-owner index permits.

### `GET /v1/team/members`
**Purpose:** the coach list, ordered as a hierarchy (owner, admins, coaches) with
each coach's live client count. Pending invites appear here too — a pending
invite to a number with no InclineYou account has a `phone` and a null `name`, because
the number is all we know about them.

### `POST /v1/team/invites` → `201` · **`MESSAGING` tier — 10/min**
**Purpose:** invite a coach by phone. Body: `{ "phone": "…" }`. **Admin+.**

Returns the new member row plus `whatsappUrl` (a `wa.me` deep link) and
`message`. The backend does not send messages — it never has, `NudgeService`
works the same way — so the invitation travels by the inviter's own WhatsApp,
from their own number, which is also why a coach believes it.

`MESSAGING` tier because it spends a message, and here that ceiling doubles as
the anti-spam control: an invite puts a message in front of somebody who never
asked for one.

**The invite may precede the account.** If the number has no trainer account, the
row is written against the phone with a null `trainer_id` and bound the first time
that number signs in — which makes an invitation an acquisition channel and not
merely an internal permission grant. A number that is already somebody's client
can be invited too — trainer/client duality is allowed — and accepts the same
way anyone without an account does: claim a trainer account
(`POST /v1/auth/trainer`) first if they have not already, which coexists with
their client memberships rather than replacing them.

Refusals come from `team/TeamPhoneGuard.java`: `PHONE_ALREADY_IN_TEAM`,
`PHONE_ALREADY_INVITED`, `PHONE_IS_SELF`. Like `ClientPhoneGuard`, **the message
never names the other team** — "already coaching at Iron House" would hand any
gym owner with a phone book a way to enumerate a competitor's staff one number
at a time.

A *declined* invite or an *ended* membership does not block a fresh invite. A
rule that outlives the refusal it describes strands people forever.

### `POST /v1/team/invites/phone-availability`
**Purpose:** ask whether a number is invitable before anything is written.
**Admin+.** Body `{ "phone": "…" }` → `{ available, code, message }`.

Same shape and the same two design choices as
[`/v1/clients/phone-availability`](#post-v1clientsphone-availability): a `200`
because nothing failed, and a POST because a phone number does not belong in a
URL that every proxy on the path will log.

### `DELETE /v1/team/invites/{id}` → `204`
**Purpose:** revoke a pending invite. **Admin+.** `404 MEMBER_NOT_IN_TEAM` if it
is not this team's, or has already been answered.

### `PATCH /v1/team/members/{id}/role`
**Purpose:** promote or demote. Body `{ "role": "admin" | "coach" }`. **Admin+**,
except that touching an `admin` is **owner only**.

`owner` is not an assignable value (`422 TEAM_ROLE_INVALID`) — making somebody the
owner also demotes the current one and rewrites `team.owner_trainer_id`, which is
a transfer and not a role edit.

### `DELETE /v1/team/members/{id}` → `204`
**Purpose:** remove a coach. **Admin+**; removing an `admin` is owner only; the
owner cannot be removed at all (`422 CANNOT_REMOVE_OWNER`).

**Removal ends visibility, not ownership — their clients stay theirs.** If the
gym wants the clients to stay with the gym, an admin reassigns them first,
deliberately (Phase 2), which writes an audit row. Forty clients silently
changing hands as a side effect of a removal nobody wrote down is the outcome
this refuses to make possible.

### `DELETE /v1/team/members/me` → `204`
**Purpose:** leave. Any non-owner, any time. Their clients stay theirs.

### `GET /v1/team/invitations`
**Purpose:** invitations addressed to the caller — bound to their trainer id, or
matched on their phone for an invite that predates the account.

Returns `id`, `teamId`, `teamName`, `invitedByName`, `invitedAt`, `expiresAt`.
Expired ones are omitted rather than shown greyed out: there is nothing the
invitee can do with one.

Read over REST rather than through sync, and that is the rule and not an
omission — an invitation is a permission change, and a permission change that can
be answered offline and replayed later can be replayed *after the grant was
revoked*.

### `POST /v1/team/invitations/{id}/accept`
**Purpose:** join. Returns the team, as `GET /v1/team` would.

Seats are checked **here rather than at invite time**, because seats are consumed
by people and not by intentions: an owner may invite six for five seats and the
first five in get them. `409 TEAM_SEAT_LIMIT` carries `seatLimit`.
`410 TEAM_INVITE_EXPIRED` past `app.team.invite-expiry-days` (14).
`409 ALREADY_IN_TEAM` if the caller joined somewhere else in the meantime — the
unique index is the arbiter of two simultaneous accepts.

Nothing about the caller's existing clients, programs or money changes. That is
what makes it safe to say yes to.

### `POST /v1/team/invitations/{id}/decline` → `204`
**Purpose:** say no. The row is bound to the trainer id on the way out as well as
in, so the history can say *who* declined and not just that a number did.

### `GET /v1/team/clients`
**Purpose:** the team's whole roster, grouped by the coach who owns each client.
**Admin+.**

Returns `[{ trainerId, coachName, role, clients[] }]`, the caller's own group
first. Each client carries `lastSessionAt`, `upcomingSessions` and
`hasActiveProgram` — the three facts an admin is actually reading the screen for,
which is "is anybody being dropped".

Grouped server-side because the grouping *is* the answer. **Online-only:** this is
not in sync and must not be (see [Trainer sync](#trainer-sync)).

### `GET /v1/team/clients/{id}`
**Purpose:** one teammate's client — profile, programs, recent sessions,
measurements. **Admin+.**

**No money, at any role.** `package`, `payment` and `gym_settlement` are never
referenced under this path; there is a test that asserts their absence from the
response. The body carries `moneyHidden: true` so the app can *say* so — a coach
who inherits a client and finds an empty money book will read it as data loss
unless told the money stayed with the coach who collected it.

`404 CLIENT_NOT_IN_TEAM` for a client whose coach is outside the caller's team,
which is the standing cross-trainer 404 and not a new rule.

### `POST /v1/team/clients/{id}/reassign`
**Purpose:** move a client to another coach in the team. **Admin+.**

Body: `{ "toTrainerId": "…", "programAction": "keep" | "clear", "note": "…" }`.
Returns `{ programsMoved, sessionsMoved, noop, … }`.

**The plan moves, the history stays.**

| Moves | Stays |
| --- | --- |
| `client` — the assignment itself | `workout_session`, `workout_exercise`, `set_log` |
| `program` (when `keep`; soft-deleted when `clear`) | `scheduled_session` — past, and any `done`/`cancelled` |
| `scheduled_session` — **future `scheduled` rows only** | `package`, `payment`, `gym_settlement` |
| | `weekly_report`, `nudge_log` |

A logged session is a statement about who ran it, and the money went to a
specific coach under a specific split; rewriting either makes two coaches' books
wrong at once. Tomorrow's session, by contrast, is the new coach's job and has to
appear in *their* diary.

`nudge_rule` is deliberately **not** touched. There is no such thing as a
client-scoped nudge rule — the table is one row per trainer per kind with a
unique index on the pair — so "moving" them would take rules that were never
about this client and collide with that index on arrival. **V32's
`nudge_template` is the same shape and the same answer**: it is one row per
trainer per template name, it is the trainer's wording rather than a fact about
anybody, and a reassignment has nothing to move.

`membership_status` is untouched too: a client who agreed to be coached by the gym
does not get re-invited because the gym changed who delivers it. They get a push.

Reassigning to the current coach answers `200` with `noop: true` and writes
nothing, including no audit row.

### `GET /v1/team/clients/{id}/assignments`
**Purpose:** every move this client has been through, newest first, with who did
it and what happened to the plan. **Admin+.** Append-only; there is no delete.

### `GET /v1/team/templates`
**Purpose:** every template belonging to an active member of the team, the
caller's own included and flagged `mine`. **Any member.**

Not admin-gated, deliberately: the library is the one team-wide read a plain
coach gets, and it is most of what a coach joins a team for. Each row carries
`days`, `exercises` and `clientsOnIt` so the shelf can show shape rather than
just a name.

### `GET /v1/team/programs/{id}`
**Purpose:** a teammate's plan with its exercises. **Admin+.**

Answers for the caller's own programs too, flagged `teammates: false`, so the
roster can link to a plan without first working out whose it is.

`404 PROGRAM_NOT_IN_TEAM` outside the caller's team.

### `PATCH /v1/team/programs/{id}`
**Purpose:** the plan's name, goal or status. **Admin+.**

There is deliberately no create and no delete. Giving a teammate's client a whole
new plan, or taking their plan away, are handover-shaped decisions — and the
handover exists, and is audited.

### `POST /v1/team/programs/{id}/exercises` → `201` · `PATCH …/{exId}` · `DELETE …/{exId}` → `204`
**Purpose:** change what a teammate's client actually does. **Admin+.**

The case this exists for: the coach is off sick, their client is on the floor, and
the plan says 5×5 back squat for a shoulder that is not having it. Handing the
client over permanently is the wrong answer to one swapped exercise.

Body carries `sets`, `reps`, **`durationSeconds`** (V25 — a hold rather than a
count; the older `/v1/programs/**` endpoints predate this field and drop it),
`restSeconds`, `targetLoad`, `notes`, `dayOfWeek`, `week`, `orderIndex`. Absent
fields are left as they were.

**Every edit writes a `team_activity` row and pushes to the coach whose client it
is.** That is what makes the capability acceptable; see
[`GET /v1/team/activity`](#get-v1teamactivity). Editing your *own* client writes
nothing — there is nobody to account to, and a `CHECK` constraint refuses such a
row anyway.

Removal is a soft delete, so the tombstone reaches the owning coach's phone.
Nothing else is needed for an edit to sync: the program's `trainer_id` never
moved, so the coach's own filter still matches and `updated_at` carries it.

### `PATCH /v1/team/exercises/{id}` → `204`
**Purpose:** fix a team custom exercise for everybody. **Admin+.**

Custom exercises are the one thing shared *in place* rather than copied — they
ride sync — which is what makes editing one the right shape: a typo in "Barbell
Squt" is wrong in every program in the team that points at it, and a copy would
fix none of them. `404 EXERCISE_NOT_IN_TEAM` for a seeded library row, which
belongs to nobody and is the same for every trainer in the product.

### `GET /v1/team/activity?clientId=…`
**Purpose:** who changed what, on whose clients. **Any member.**

Not admin-gated, and that is the point: the coach whose plan was edited is the
reason this record exists, and a log only its authors could read would be an
account of nothing. **The scope inverts by role, server-side** — a coach sees the
crossings that happened to them, an admin sees the team's — so the app cannot get
it wrong by omitting a parameter.

`summary` is prose written at the moment of the edit and stored, not rebuilt on
read: rebuilding it from current state would produce a different sentence every
time the plan changed again. `team_activity` is append-only; there is no delete.

### `GET /v1/team/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD`
**Purpose:** what the team took, per coach. **Owner only** — `403 NOT_TEAM_OWNER`
for an admin.

Returns `{ from, to, teamCollected, teamGymShare, coaches: [{ trainerId,
coachName, role, collected, gymShare, payments, payingClients }] }`. Defaults to
the current month.

**The single carve-out in the rule that no role sees a teammate's money**, kept
narrow by four limits, each closing a way this could have become a general
money-reading power:

- **owner only**, not admins — an admin runs the roster, the numbers belong to
  whoever owns the business;
- **totals only** — a sum, a count, and how many clients paid;
- **no client is ever named**, so "who paid what" is not derivable;
- **no `gym_settlement`** — a coach's arrangement with a gym stays theirs.
  `payment.gym_share_amount` is included because it was recorded on the payment
  at the time (V11) and is the owner's half of that same transaction.

The range reads `paid_at`, not `created_at`: cash taken on Saturday and recorded
on Monday belongs to Saturday, which is the whole reason that column exists.
Pending money is not revenue. A coach who took nothing appears as a zero rather
than vanishing — a missing row reads as "no data" and sends an owner hunting for
a bug.

**This endpoint narrowed a promise the app makes.** Phase 1's invitation screen
said nobody in a team could see what another coach had collected; the app's copy
changed in the same commit that shipped this, rather than after somebody noticed.

### `POST /v1/team/templates/{id}/copy` → `201`
**Purpose:** copy a teammate's template into the caller's own book. **Any member.**

A copy, not a share. A template two coaches use and one coach edits is a template
that changed under the other's clients without either of them touching it — the
bug this product already refuses one level down, where assigning a template
copies it onto the client. Ordinal day slots (V24) are what make a copy
self-contained: the blueprint travels inside `structure`, so there are no
children to clone and nothing can be half-copied.

The new row reaches the caller's phone through the ordinary `templates` sync.

---

## Clients

`client/ClientController.java` — the roster. All trainer-scoped.

### `GET /v1/clients`
**Purpose:** the roster list. Returns every non-deleted client for this trainer,
each with `StatusFlags` (`paymentDue`, `sessionPackLow`, `planExpiring`) so the
list can draw its badges without a second round trip.

Carries **`membershipStatus`** — V18's column, `accepted` | `invited` |
`declined` | `removed` | `unavailable`. It is the state of the *invitation*,
where `status` is the state of the coaching, and the two are separate because
they answer to two people who can disagree: a trainer can hold an arrangement
they are still being billed for while the client has never opened the app.

The column has travelled in the sync envelope since V18 and never on this
response, which cost the roster a whole attention band. `unavailable` means the
number the trainer typed already signs in as a *trainer* account, so the invite
can never be delivered — the row needs a **Fix number** action rather than a
silent wait, and a client that could not read the field could not draw it.
Appended last, like every other additive field.

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

**Sending `weeklySchedule` BOOKS THE DIARY**, in the same transaction — V3, and
`DiaryService` carries the three-pass rule that keeps a hand-booked session and a
typed note through the change. Two fields on `ClientResponse` say what that did,
**appended last**:

| | |
| --- | --- |
| `sessionsBooked` | how many sessions THIS REQUEST put in the diary |
| `firstSessionAt` | epoch ms of the first one it booked |

Both **null** when the request did not touch the rhythm — a name change books
nothing and must not claim a zero — and both are `DiaryService.Result`'s own
count rather than a count of the diary afterwards, which would answer a different
question: adding a fourth training day spreads the same eight sessions, and a
count of the board would report eight where nothing new was booked. Zero is a
real answer on a rhythm with nothing to lay down. The same pair
`PackageResponse.sessionsBooked` carries for the sale.

**Physical information (V7).** `dateOfBirth` is an ISO date (`YYYY-MM-DD`) on the
request and is **appended last** to `ClientResponse` (null = never given). Null
leaves it alone and `""` clears it. A date in the future, more than 120 years
ago, or not a date at all is `400 VALIDATION` with a `detail` naming the field —
each is a typo in the year. The age the client file prints is derived on read
and never stored. **`heightCm: 0` clears the height**, for the same reason `""`
clears the date: null already means *leave it alone*, and nobody is zero
centimetres tall. Neither field is in the phone's push upsert, so an older build
cannot null them.

**Moving the phone number runs the same check `POST` does** (`ClientPhoneGuard`),
and only when the number actually changes — re-saving the number a row already
holds is not a move. A refusal is `409` with `code` `PHONE_ON_YOUR_ROSTER`,
`PHONE_ON_ANOTHER_ROSTER` or `PHONE_IS_TRAINER`.

### `DELETE /v1/clients/{id}` → `204`
**Purpose:** remove a client from the roster. Soft delete — the row is tombstoned
with `deleted_at` so sync can propagate the removal.

### `GET /v1/clients/{id}/body-metrics`
**Purpose:** the measurement history behind the progress charts. One row per
number: `{ id, clientId, metricType, value, unit, notes, recordedAt, createdAt }`,
newest first.

**Read out of the client's completed assessments since V22** — a body is
measured in an assessment and nowhere else, and `body_metric` is dropped. Only
V5's six ids come out (`weight` · `body_fat` · `chest` · `waist` · `hip` ·
`arm`); the other catalogue measurements stay on the assessment's own detail.
`id` is **the assessment's id**, so up to six rows share one; `unit` is the
catalogue's; `notes` is always `null`; `recordedAt` and `createdAt` are both the
assessment's `completedAt`. A booked, unreturned or deleted assessment
contributes nothing. The shape is unchanged so the web's three readers did not
move.

**There is no write.** `POST /v1/clients/{id}/body-metrics` was removed in V22
(`405`); a reading is recorded by taking an assessment (MUST-21).

---

## Measuring cycle — V5

**V5's sitting routes are gone, and so are its reading routes (V22).** V5 as first written had a trainer-taken
*sitting* — `GET` / `POST /v1/clients/{id}/assessments`, grouping readings in an
`assessment` table. Both were removed before V5 ever shipped (23 Sep 2026), at the
product owner's request: the redesign's *assessment* is a questionnaire the client
answers — see [Assessments](#assessments--v14). What remains of V5 is the cadence
on the client and trainer. `PUT` and `DELETE /v1/clients/{id}/body-metrics/{metricId}`
— correcting or dropping one loose reading — went with `body_metric` in V22: a
reading lives on its assessment, and correcting it is an edit to that
assessment's readings.

**The six metric ids are fixed** — `weight` (kg) · `body_fat` (%) · `chest` ·
`waist` · `hip` · `arm` (cm). `metric_type` is an unconstrained varchar, and free
text there produces two spellings of one measurement. A seventh is a deploy. The
assessment catalogue uses the same six ids for the measurements it shares.

Refusals on the cycle fields, all with a `code` on a `ProblemDetail`:

| `code` | |
| --- | --- |
| `ASSESSMENT_METRIC_UNKNOWN` | an id outside the six on a client's or trainer's `assessmentMetrics` |
| `ASSESSMENT_INTERVAL_RANGE` | a cadence outside 7–365 days |

### The cycle rides on the client and the trainer

`ClientResponse` carries three fields, **appended last**:

| | |
| --- | --- |
| `assessmentIntervalDays` | days between measurements; null = not on a cycle |
| `nextAssessmentOn` | ISO date, what is owed; null = nothing |
| `assessmentMetrics` | this client's sheet; null = the trainer's default |

**They are columns on `client`, not derived from the last assessment**, because
`/today` reads `GET /v1/clients` trainer-wide: a due-check computed from
last-reading-per-client is one request per client on the screen a trainer opens
every morning. `nextAssessmentOn` is stored rather than `last + interval` so a
trainer can push one week without rewriting when the last one happened.

`PUT /v1/clients/{id}` writes all three. `assessmentIntervalDays: 0` takes the
client off the cycle and clears the date with it; `nextAssessmentOn: ""` clears
the date alone. Setting an interval on a client with no date **seeds** one at
today + interval, unless the request carries a date of its own.

> **Nothing advances `nextAssessmentOn` on its own any more.** The removed
> sitting route moved it when a measurement was recorded; with it gone, the date
> moves only when a trainer writes it. Wiring a returned questionnaire
> assessment to advance it is a product decision, not made yet.

`TrainerResponse` carries `assessmentIntervalDays` and `assessmentMetrics`, the
defaults a new client is offered, written through `PATCH /v1/trainers/me`.

---

### `GET /v1/clients/{id}/notes`
**Purpose:** the trainer's own notes on this client, newest first. **V29.**

Returns `[{ id, clientId, body, pinned, createdAt, updatedAt, sharedWithClient }]`.

**`sharedWithClient` (V7)** says the client this note is about may read it in
the portal. It is a **different audience from a teammate, who still sees
nothing** — sharing never widens V29's rule sideways. It defaults to `false` in
the DDL, because every note before V7 was written as private.

**The author is in the predicate, not implied by the client.** A team widens
reads over a teammate's roster (V26) and it must not widen this, for the same
reason no role ever sees a teammate's money book. So a coach holding a client
another coach wrote notes on gets an **empty list**, not a 403 — the notes are
not theirs to know about.

**`pinned` is what the client file's always-visible strip draws.** Everything
else is filed in the notes tab. One flag over one kind of thing rather than two
stores that would drift.

> **This is not a health record and must never become one.**
> `InclineYou_MVP_interaction_map.md` excludes health data outright under the DPDP Act
> 2023 — "**No medical or health-condition fields anywhere** — no injuries, no
> conditions, no medications" — and `InclineYou_core_data_model.md` §3.2 pins the note
> as "free text; **no medical fields**". `body` is free text and there is no
> injury field, no condition field and no PAR-Q flag beside it. Do not add one:
> the moment a field tells a medical note apart from any other note, the product
> holds health data whatever the field is called. The sanctioned path is §5 of
> the data model — a separate `health_note` table with its own consent and access
> controls — and it is a different feature, not a wider version of this one.

### `POST /v1/clients/{id}/notes` → `201`
**Purpose:** write a note. **V29.**

Body: `body` (required, non-blank, ≤ 4,000 characters), `pinned` (optional,
defaults `false`), `sharedWithClient` (optional, V7 — only an explicit `true`
shares; absent is private). An empty or over-long body is `400 VALIDATION` with
the reason in `detail`.

The cap is about a note staying a note, not about storage — the column is `TEXT`.
It is checked before the write so an over-long note is a `400` with a reason
rather than a silent truncation of something somebody just typed.

### `PUT /v1/clients/{id}/notes/{noteId}`
**Purpose:** edit the text, the pin, or both. **V29.**

Body: `body`, `pinned` and `sharedWithClient` (V7), **all optional, and absent
means unchanged**. `{"sharedWithClient":false}` retracts a shared note without
touching its text or pin. That is
what lets the strip's pin toggle and the notes tab's editor share one route
without either clobbering the other's field — `{"pinned":false}` unpins without
sending the text back, and `{"body":"…"}` rewrites without disturbing the pin.

A note this trainer did not write is a `404`, not a `403`: asking about somebody
else's note should not confirm that it exists.

### `DELETE /v1/clients/{id}/notes/{noteId}` → `204`
**Purpose:** remove a note. **V29.** Soft delete — the row is tombstoned with
`deleted_at`.

> **None of the four routes enter sync.** The web is online-only and the phone
> will read these over REST when it adopts them — V28's argument, and V26's
> before it.

---

## Assessments — V14

`assessment/AssessmentController.java`. A **questionnaire** a trainer builds and
sends, and the client answers in the portal: which tape measurements to take,
which questions to ask. Called *assessment* everywhere, never *check-in*. The
client's side — answering, submitting — is `/v1/me/assessments*` (the portal
module); this is the trainer's.

> **Timestamps on these routes are ISO-8601 strings** (`dueAt`, `sentAt`,
> `completedAt`, `readAt`, `createdAt`, `updatedAt`), **the one deliberate
> exception** to epoch ms everywhere else — it is what the web's assessment
> screens read (decided 23 Sep 2026). `dueAt` also accepts a bare `YYYY-MM-DD`,
> read as midnight IST.

**Status is derived on the server and never stored:** `done` once completed;
else `booked` while unsent; else `missed` once `dueAt` has passed; otherwise
`waiting`. `unread` is `status == done && readAt == null` and false in every other
state. The app reads both and never works them out.

```ts
Row      { id, clientId, templateId: string|null, name, dueAt, sentAt|null, completedAt|null, readAt|null,
           status: 'booked'|'waiting'|'missed'|'done', unread,
           measurements: {got, asked}, questions: {got, asked} }        // list rows carry NO readings/answers
Question { id, text, kind: 'yesno'|'rating'|'text'|'choice', scale: 5|10|20|null,
           options: {id, text}[], allowMultiple, allowCustom }
Template { id, name, description|null, measurements: {on, keys[]}, questions: {on, items: Question[]},
           createdAt, updatedAt }
```

### `GET /v1/assessment-catalog`
**Purpose:** what a template may pick from — `{ groups, measurements, questions }`:
21 measurements (`{key, label, group, unit, metric}`) in four groups and an
11-question bank. **The product's, not the trainer's** — never emptied for a new
account, and a trainer cannot add to it (a measurement is only worth taking if it
is taken the same way twice). The six measurements V5 also knows use **V5's ids**
— `weight`, `body_fat`, `chest`, `waist`, `hip`, `arm` — and `metric` names that
id (null on the other fifteen). **It includes health items** — the *Vitals* group
(`resting_hr`, `bp`), `visceral`, the `q_pain` question and the *Illness* option —
by the product owner's recorded decision, kept isolable in `AssessmentCatalogue`.

### `GET /v1/assessment-templates` · `GET /{id}`
**Purpose:** the caller's templates, most recently touched first; one template, or
`404 ASSESSMENT_TEMPLATE_NOT_FOUND`.

### `POST /v1/assessment-templates` → `201` · `PUT /{id}`
**Purpose:** save a template. `name` is **required** (≤ 120; `400 VALIDATION
name: required`); `description` optional (`""` clears on `PUT`). `PUT` replaces
each block that is **present**, whole — there is no per-question PATCH.

Normalised on write:
- a block arrives as `{on, keys|items}` or as a **bare list, which counts as ON**;
  a missing `on` is ON;
- measurement keys are filtered to the catalogue and de-duplicated in order;
- an unknown question `kind` becomes `text`; `scale` is kept only on a `rating`
  and must be 5, 10 or 20, else 10;
- `options`, `allowMultiple` and `allowCustom` are **forced empty / false unless
  `kind == 'choice'`**;
- missing question ids are minted (`aq_…`), missing option ids are `a`, `b`, …;
  a question with no text is *Question n*.

### `DELETE /v1/assessment-templates/{id}` → `204`
Soft. **Every assessment already sent from it survives**, with `templateId` set to
null in the same transaction — a sent assessment stopped being the template when
it went out.

### `GET /v1/assessments`
**Purpose:** the trainer's sent assessments. Query: `status` (a **CSV set** —
unknown names are ignored, and a set of only unknown names filters nothing),
`read` (`unread` = returned and not read; `read` = returned and read), `clientId`,
`q` (matches the assessment's name **or** the client's), `page` (default 0),
`size` (default 20, max 200). Returns `{ items: Row[], total }`, **`total` counted
after every filter**, ordered `dueAt` newest first, then `id`.

### `GET /v1/assessments/{id}`
**Purpose:** one assessment, **assembled on the server**: the `Row` plus
`client {id, name, status}`, `template {id, name, description} | null`,
`asked { measurements: Measurement[], questions: Question[] }` (what the template
asks for, from the **live** template), `readings` (each `{key, value}` joined to
its catalogue row), `answers` (each joined to its question —
`{questionId, text, kind, scale, options, allowMultiple, yes, rating, answer,
optionIds, chosen}`), `history` (per reading key, the value from every one of this
client's **returned** assessments, oldest first by `completedAt`) and `returned`
(`{id, name, at}`, newest first). A question is looked up in the template first
and the bank second; a reading or answer that resolves to neither is **dropped**,
never drawn as an id. `history` is the only reading history there is — since
V22 a body reading exists nowhere but on an assessment. Not the caller's:
`404 ASSESSMENT_NOT_FOUND`.

### `POST /v1/assessments` → `201`
**Purpose:** book or send one. Body `{ clientId, templateId, dueAt?, sendNow?,
name? }`. `sendNow: false` books it (`booked`, `sentAt` null); anything else sends
it now. `name` defaults to the template's. **The asked counts are frozen from the
template when it is sent.** Refusals: `400 VALIDATION` with `clientId: no such
client`, `templateId: no such assessment` or `dueAt: must be an ISO date-time`.
Returns the `Row`.

### `PATCH /v1/assessments/{id}`
Body `{ read?, dueAt?, send? }`. `read: true` stamps `readAt`; **`read: false`
genuinely un-reads** (how a trainer parks one opened by accident). `send: true`
sends a booked one — re-freezing its counts from the template as it now stands —
and does nothing to one already sent. Returns the `Row`.

### `DELETE /v1/assessments/{id}` → `204`
Soft — it may hold answers a client wrote.

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
**Purpose:** search and browse the exercise library — **or resolve a known
handful of ids to their rows.**

Query params: `ids`, `q`, `source`, `muscleGroup`, `bodyPart`, `target`,
`equipment`, `level`, `page` (default `0`), `size` (default `20`, capped at
`100`). Returns `{ exercises: [...], total }` covering both the seeded global
library and this trainer's own custom exercises. `total` is counted after every
filter.

**`source` (V9)** picks the shelf: `incline` — the catalogue only; `mine` — this
trainer's finished custom movements; `draft` — their drafts; **anything else,
absent included, is everything except drafts.** An unknown value falls through
to that default rather than answering an empty library. It is **not applied to an
`ids` read**, so a draft already named in a plan still resolves.

**`q` matches `name`, `target`, `movementPattern` and `bodyPart`** (V9,
case-insensitive substring) — "quads" and "hinge" find movements whose names say
neither. Not `description`: prose matches everything and ranks nothing.

**The 100-row cap is deliberate and stays.** A caller that wants names for known
rows uses `ids`, not `size=2000`.

**`ids=a,b,c`** returns exactly those rows and **ignores paging**. The phone
holds the library in SQLite and joins locally; the online half holds nothing, so
every screen that draws a set log, a program row or a plan was pulling the whole
library (`?size=2000`) to turn six UUIDs into six names — one request, but the
largest response this API serves, asked for on load, on each of those screens.

Three rules it must keep, each of which fails quietly if it doesn't:
- A **malformed id is a `400`**, never dropped from the filter. Dropping it
  returns a shorter list that looks complete and draws a blank where the
  exercise should be.
- An `ids` that resolves to **nothing returns nothing**. If an empty set fell
  through to "no filter", an empty basket would get the entire library back —
  the exact response the parameter exists to prevent.
- Paging is ignored, for the same reason: a `size=20` default keeping the first
  twenty of thirty named ids is the missing-name bug in another costume.

More than **600 ids** is a `400` rather than a silent truncation.

Every exercise carries **`logType`** — V12's column, `weight_reps` | `reps`,
**null on every seeded row and read as `weight_reps`**, which is what all of
them are. It decides whether a log grid draws a load field or the words *no
load*, and whether the record test runs its reps branch — where there is no
plate step, so every real record is a loud one. Without it a caller has to infer
the answer from whether past sets carried a load, which is a decent guess with
nothing at all to go on for an exercise nobody has logged yet.

Every exercise also carries, **appended last by V9**:

| Field | |
| --- | --- |
| `status` | `published` \| `draft`. Drafts exist only on custom rows. |
| `secondaryTargets` | `string[]`, **never null** — `[]` until authored. |
| `formCues` | `string[]`, **never null** — `[]` until authored. |

**Both lists are empty on every row today, deliberately.** The mock generates cues
for the whole catalogue and those must not be seeded: a generated form cue served
as real is a coaching instruction nobody wrote. Filling them is a content pass of
its own. `imageUrl` / `videoUrl` are still on the shape and always null since V22.

### `GET /v1/exercises/meta`
**Purpose:** the filter vocabulary — `muscleGroups[]`, `bodyParts[]`,
`targets[]`, `equipment[]`, `levels[]` — so the filter sheet is populated from the
data rather than a hardcoded list. Read off the catalogue only, alphabetical.

### `GET /v1/exercises/categories`
**Purpose:** the library's *By categories* view. **V9.**

Returns `{ categories: [{ muscleGroup, count }], total, uncategorised }`.

- Counts **the caller's library** — the catalogue plus this trainer's own custom
  rows, **drafts excluded** — which is exactly what the default list read shows,
  so a card saying 34 opens a list of 34.
- **Ordered by the catalogue's muscle-group list** (`/meta`'s order), **never by
  count**: a grid that reshuffles whenever a movement is added is one nobody can
  navigate by position. A group only a custom row uses comes after the
  catalogue's, alphabetically.
- Rows with no `muscleGroup` go into `uncategorised`, not into a card; groups with
  a count of 0 are not returned. `total` is every non-draft row visible.

### `GET /v1/exercises/{id}`
**Purpose:** one exercise, whole — the exercise info panel. **V9.**

Returns one `ExerciseResponse`, including `secondaryTargets` and `formCues`.
Visible means what the list means — the catalogue, or this trainer's own custom
rows, **drafts included**. Anything else is a `404`, not a `403`, so the route
cannot confirm another trainer's private movement exists. The literal paths
(`/meta`, `/categories`) are declared before this one.

### `POST /v1/exercises` → `201`
**Purpose:** create a custom exercise when the library has no match.

Body: `name` (required), `muscleGroup`, `equipment`, `movementPattern`,
`description`, `imageUrl`, `videoUrl`, `logType`, and V9's `target` and
`status`. Comes back with `isCustom: true` and is visible only to the creating
trainer.

**`status`: only the literal `draft` makes a draft**; anything else — null, a
typo — is `published`, because a movement silently filed as a draft is one that
vanishes from the library its author is looking at. `target` is the primary
muscle, trimmed and cut at 50. A custom movement gets **no** generated pattern,
cues or secondary targets — both lists come back `[]`.

`logType` is `weight_reps` | `reps`; anything else, null included, becomes
`weight_reps` — the same default the sync push applies, so two writers of one
column cannot give the same exercise two log types depending on which half
created it. **Set once and never updated**, per V12: every set already recorded
against an exercise stops making sense if it changes.

---

## Templates

`template/TemplateController.java` — reusable program blueprints, not tied to any
client.

### `GET /v1/templates`
**Purpose:** the trainer's template shelf.

A `TemplateResponse` carries `id`, `name`, `goal`, `description`, `exercises[]`,
`dayLabels`, `createdAt`, `updatedAt`, and — appended in the V31 pass —
`weeks`, `trainingDays[]`, `assignedCount` and `activeAssignedCount`, and —
appended 23 Sep 2026 — **`assignedClients[]`**.

**`source` and `copiedFrom` (V11), appended after it.** `source` is `own` on every
row of this shelf — a copy of a certified program is the trainer's own the moment
it exists — and the certified list answers `certified` in the same field.
`copiedFrom` is `{id, name, updatedAt}` of the certified original, **frozen at
copy time** (so it still names the original after it is retired), or null.
`updatedAt` older than the original's current one is how the builder says *the
original was revised since you copied it*; nothing is ever propagated.

**`assignedClients` is `{id, name}[]`, the shelf's avatar cluster**: at most **6**
of the clients on an **active** copy, one entry per client, ordered by name and
then id so it is a total order and never reshuffles between loads. It is a
**sample, never a count** — `activeAssignedCount` is the authority for "+N
more", and nothing may derive a count from the array's length. It lists **only
the caller's own clients**: a template's copies can sit with a teammate after a
reassignment, and a coach must not read a teammate's client names off a shelf.
Read in one query for the whole shelf, on the list and on `GET /{id}`.

**`exercises[]` is camelCase, as documented here, and that is newer than this
document.** Until 28 Aug 2026 the field was a raw `List<Map<String,Object>>`
handed straight out of the `template.structure` jsonb, so it answered with the
STORAGE spelling — `exercise_id`, `day_of_week`, `rest_seconds` — while this
page had always said `exerciseId`. Its only REST consumer read every field as
absent and drew every template as "0 days a week" with nothing in it. The
storage format is unchanged and stays snake_case, because the phone's
`parseBlueprint` keys on it; only the DTO was fixed.

### `POST /v1/templates` → `201`
**Purpose:** save a template.

Body: `name` (required), `goal`, `description`, `exercises[]`, `dayLabels`,
`weeks`, `trainingDays[]`.

Each exercise entry carries `exerciseId`, `sets`, `reps`, `restSeconds`,
`targetLoad`, `notes`, `dayOfWeek`, `orderIndex`, `week`, `durationSeconds`,
V31's `tempo`, `altExerciseId`, `groupId` and `setDetail[]`, and V10's
**`workoutId`** and **`workoutName`**.

**A day holds named workouts (V10).** `workoutId` says which block on its day an
entry belongs to — "Upper A", then "Conditioning" — and `workoutName` is what the
block is called. The id is a **local handle the builder mints**, not a reference
to a workout template (pouring a workout into a day re-mints ids on purpose), so
the server stores it and never resolves it. Both are optional: an entry with
neither is its day's single unnamed block, which is every entry written before
V10. Trimmed, blank as null, and cut to 64 / 120 characters — the widths of the
client copy's columns. They live in `template.structure`, so the blueprint needed
no migration, and `duplicate` carries them because it copies the blob as stored.

`week` and `durationSeconds` are **not new columns** — both have been in the
blueprint JSON and copied by `apply` since V20 and V25 — but neither had a field
on the request record, so Jackson dropped them on every write and a multi-week
or timed template could not be authored over REST at all.

`weeks` and `trainingDays` are the same story on the template row itself:
`template.weeks` (V20) and `template.training_days` (V24) were readable through
sync and unwritable over REST, so every web-authored template left both NULL and
its day layout had to be inferred from wherever exercises had landed. `dayOfWeek`
is an **ordinal slot** — Day 1, Day 2 — never a weekday.

`setDetail[]` is one object per set, `{reps, durationSeconds, toFailure}`, and it
is only sent when the sets differ from each other. While they agree, `sets` and
`reps` say it and `setDetail` is absent, which is what a pre-V31 reader
understands. When they diverge, `reps` is written null and `sets` keeps the
count — incomplete but true, never a number that is wrong for half the sets.

### `GET /v1/templates/{id}` · `PUT /v1/templates/{id}` · `DELETE /v1/templates/{id}` → `204`
**Purpose:** read, edit and remove one template.

`PUT` is a partial update per field, and `exercises` replaces the whole blueprint
when present — `template.structure` is a single jsonb column, so there is no row
to patch.

A **certified program's id** sent to `PUT` or `DELETE` is `403
CERTIFIED_READ_ONLY`, and to `POST /{id}/apply` is `409 CERTIFIED_COPY_FIRST` —
named rather than answered with a bare 404, because the id is real and the
trainer is one *Copy* away from what they meant.

### `POST /v1/templates/{id}/duplicate` → `201`
**Purpose:** copy a blueprint, so a trainer can tweak one for a client without
touching the version other clients are already on.

Body: optional `{ "name": "…" }`. Without one the copy is named
`"<name> (copy)"`, then `"(copy 2)"` — numbered rather than allowed to collide,
because a shelf is chosen from by name.

The structure is copied **as stored**, not through the DTO, so a key this build
has no field for survives the copy. The copy carries no assignments: it is a new
blueprint with nobody on it, which is exactly what makes it safe to edit.

### `GET /v1/templates/{id}/assignments`
**Purpose:** who is on a copy of this template.

Returns `programId`, `clientId`, `clientName`, `programName`, `startDate`,
`endDate`, `status`, `createdAt`, `updatedAt`, `behindTemplate`, `divergence`.

`behindTemplate` compares the program's **`synced_at`** against the template's
`updated_at`. **It was `updated_at` before V2 and that read is now wrong**: a
copy the trainer tuned this morning has the newer stamp and has taken nothing,
so it reported itself up to date having never received the edit. A copy that
differs from its blueprint is the NORMAL state — per-client adjustment is what
the two tables are for — so this is a fact for the trainer to act on, never an
error, and nothing repairs it automatically. `POST /v1/programs/{id}/resync` is
the only thing that does, and only when asked.

`divergence` (V2) is what the copy SAYS that the blueprint does not, which is a
different question from the clock above and the one the trainer needs: a resync
replaces the whole prescription, so pushing a tidied blueprint to thirteen
clients deletes per-client work, and this is what lets the screen name it first.

```
{ "added": 0, "removed": 0, "swapped": 1, "changed": 0, "noted": 1,
  "alts": 0, "shape": 1, "total": 3,
  "lines": [ { "kind": "swapped", "week": 1, "day": 2,
               "text": "Tuesday · Push · Bench Press → Dumbbell Press" } ] }
```

Four things about it are decisions rather than details:

- **rows pair by movement within a lane, never by position.** A copy's row ids
  were minted by `apply`, so an id-keyed diff reports every row as both added
  and removed, and a positional one reports four changes for one inserted row.
- **one out, one in, same lane is a SWAP** — the injury substitution, and as a
  removal plus an addition it reads as two changes and loses the fact that one
  replaced the other.
- **a cue is its own kind** (`noted`), not a re-prescription. Folding
  `program_exercise.notes` into the prescription reported every copy in the book
  as re-prescribed against a blueprint it agreed with on every number.
- **the blueprint is translated into the client's week first.** A template's day
  is an ordinal slot and a copy's is a weekday; comparing them unmapped reports
  every row on both sides. Where a program has **no** `schedule` to translate
  through, the lines say `Day 1` rather than naming a weekday nothing can
  derive.

### `POST /v1/templates/{id}/apply` → `201`
**Purpose:** the point of templates — instantiate one as a live program for a
client, copying every exercise row across in one transaction.

Body: `clientId` (required), `schedule[]` (optional since 23 Sep 2026), plus
optional `name`, `goal`, `startDate`, `endDate` overrides. Returns a
`ProgramSummary` for the program that was created.

`schedule[]` is `{day, weekday, time}` per ordinal slot — the translation from
"Day 2" to "Wednesday at 06:30", which is the client's choice and not the
template's. It must cover **exactly** the template's day slots, one distinct
weekday each, `time` as 24-hour `HH:mm`. A plan silently missing a day, or with a
day nobody scheduled, is worse than an error, so anything else is refused:

| Refusal | Answer |
| --- | --- |
| the wrong number of days, or a slot covered twice / not at all | `400 SCHEDULE_MISMATCH`, `detail` naming the numbers |
| a slot on no weekday, two slots on one weekday, a time that is not `HH:mm` | `400 SCHEDULE_INVALID` |

Both are typed now (`ProgramRuleException`); until 23 Sep 2026 they were bare
`ResponseStatusException`s whose sentence never reached a screen.

**No `schedule` sent: the client's standing week is the schedule.** The
redesigned add-a-client flow agrees the days on step 3 and then applies the plan
with `{clientId}` alone. The server pairs `client.weekly_schedule` with the
template's days **by position** — the client's k-th slot (by weekday, then time)
takes the template's k-th training day — and the rest of apply runs exactly as if
that schedule had been sent, including storing it in `program.schedule`. A week
with a different number of days, or no week at all, is `400 SCHEDULE_MISMATCH`
with a sentence naming both numbers: the trainer has to choose which day goes.
An explicit `schedule` always wins.

**Apply ends the caller's previous plan for that client.** In the same
transaction, every other `active` program **this trainer** has for the client
becomes `completed`, with `endDate` set to today (IST) unless it had already
ended earlier. Before this, re-planning a client left two plans `active` and
every screen reading "the active program" drew whichever came back first. It is
scoped by `trainer_id` — *a team widens reads; it never moves ownership*, so a
teammate's plan on a reassigned client is never ended here. The diary's rhythm
sessions are re-pointed at the new plan by the same reconcile as before.

**The result is a snapshot.** Nothing reaches back through `program.template_id`
to rewrite it, so editing the blueprint afterwards changes the blueprint and
nothing else.

### Certified programs · V11

Programs **InclineYou authors**, which a trainer browses, previews and **copies**.
Three decisions are fixed: they are authored in-house; using one copies it; and
**nothing propagates** — a copy is the trainer's own template from the moment it
exists, and revising the original changes only the original.

They live in their own table, `certified_template`, not in `template`: a
certified row stamped with any one workspace would be invisible to every other
under tier-1 RLS. It is a catalogue — readable from every workspace, writable by
no request — so rows arrive by migration. **The two rows today are samples**
(`certified.sample: true`, `reviewedAt: null`), written 23 Sep 2026 so the shelf
has something to render; see `SCHEMA.md`.

The literal paths are declared before `/{id}` — before they existed,
`GET /v1/templates/certified` bound `certified` to the UUID-typed `{id}` and
answered **400**, not 404.

#### `GET /v1/templates/certified`
**Purpose:** the shelf, and the "start from" chooser.

Each item is a **`TemplateWire`** — the same shape `GET /v1/templates` answers, so
one renderer serves both — with:

| Field | On a certified item |
| --- | --- |
| `exercises` | `[]` — never sent on the list |
| `exerciseCount` | the blueprint's entry count |
| `assignedCount`, `activeAssignedCount`, `assignedClients` | `0`, `0`, `[]` — nobody is ever on the original |
| `source` / `copiedFrom` | `certified` / `null` |
| `certified` | `{ summary, level, equipment, reviewedAt, usedCount, sample }` |
| `mine` | `{ id, copiedAt, stale }` — the **caller's** newest copy, or `null` |

`level` is `beginner` · `intermediate` · `advanced`; `equipment` is `full-gym` ·
`dumbbells` · `bodyweight`. **`reviewedAt` is when a qualified human reviewed the
program, not `updated_at`**, and is null until one has. `sample` (appended beyond
the mock's shape) is true for a placeholder, and a screen should say so.
`stale` means the original's `updated_at` is later than the copy's frozen
`copiedFrom.updatedAt` (compared at millisecond precision). The list is never
emptied for a new account and never filtered by what the caller has copied;
it is ordered beginner → advanced, then by name.

#### `GET /v1/templates/certified/{id}`
**Purpose:** the preview. The same item **with** `exercises` — the full blueprint,
V31 fields and V10's named workouts included. `404 CERTIFIED_NOT_FOUND` when the
id is unknown or retired.

**The blueprint is resolved on read.** A certified blueprint names each movement
by the catalogue's stable `source_id` (`gymvisual-0025`), because catalogue UUIDs
are minted per database by the seeder after migrations run; the server maps them
to this database's `exercise.id` in one query, so `exerciseId` on the wire is an
ordinary library id. An entry whose movement is not in the library is dropped
rather than drawn blank.

#### `POST /v1/templates/certified/{id}/copy` → `201`
**Purpose:** use one. Body (optional): `{ "name"?: string }` — the original's name
is kept by default, with no "(copy)" suffix. Returns the new **`TemplateResponse`**.

One transaction: a trainer-owned template with the blueprint copied **verbatim**
(`groupId`, `setDetail`, the named workouts, `dayLabels`, `trainingDays`,
`weeks`), `source: own`, `copiedFrom` frozen as at this moment, and the original's
`usedCount` incremented — which nothing else ever moves. Copying twice makes two
copies; `mine` reports the newest. The copy is then an ordinary template:
editable, deletable, assignable.

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

`ProgramResponse` carries `dayLabels`, `weeks`, `trainingDays` and `syncedAt`
since **V2** — the copy's own shape, appended last, so a build that predates them
reads the ten fields it always read. The three shape fields are keyed by WEEKDAY
where a template's are ordinal slots; `SCHEMA.md`'s `program` table says why.
`syncedAt` is null on a program written from scratch, which has never taken a
blueprint.

`schedule` is appended beside them — ordinal slot → the weekday and time this
client trains it, exactly what `apply` was given and stored. It is what lets a
caller compare a copy against its blueprint at all: a template's `dayOfWeek` is
an ordinal slot and a copy's is a concrete weekday, so an unmapped comparison
puts every row on both sides of the ledger for a plan nobody has touched.
`program/PlanDiff.java` states the rule; the web's own diff reads this field for
the same reason. Null for a plan written from scratch and for one applied before
the column existed — neither has a blueprint to line up against.

### `GET /v1/programs/{id}/exercises`
**Purpose:** the program's exercise rows, in `orderIndex` order.

Every row carries **`workoutId`** and **`workoutName`**, appended last by V10 —
the named block on its day, copied from the blueprint by `apply` and `resync`.
`POST` and `PUT /v1/programs/{id}/exercises` take both on each row and store them
as sent (trimmed, cut to 64 / 120); unlike `groupId` the id is **not re-minted**,
because it is the board's own handle for the block. On
`PUT /v1/programs/{id}/exercises/{exId}` null leaves them alone and `""` clears.
`PlanDiff` ignores both: a renamed or regrouped block is not a change to what the
client is prescribed.

### `PUT /v1/programs/{id}/exercises`  · V2
**Purpose:** replace the whole prescription — the client plan builder's save.

Body: `exercises[]` (the same row shape `POST` takes), plus the copy's own shape
— `dayLabels`, `weeks`, `trainingDays`, `name`. Returns the rows as saved.

One PUT and not a dozen row writes, for `PUT /v1/templates/{id}`'s reason: one
drag on a board moves every row under it, and a dozen ordered round trips whose
failure is partial is not a save. The whole thing is one transaction — a refused
row leaves the previous prescription intact.

Three things it does and does not do:

- **`synced_at` is NOT touched.** Tuning a copy is not the same act as taking
  the blueprint, and `behindTemplate` must keep telling the truth about a copy
  the trainer edited this morning.
- **the days are the CLIENT's weekdays**, not the template's ordinal slots. Rows
  arrive in the week the screen has been reading them in; this route performs no
  translation of its own and must not start.
- **a shape field is written only when it is sent.** `{}` is a real answer
  meaning *this plan has no day names* and has to be distinguishable from *I am
  not telling you about the labels*, so absent means unchanged.

Every shape field is optional; a save that only reordered rows sends none.

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

`ProgramExerciseRequest` and `ProgramExerciseResponse` also carry
`durationSeconds` (V25's column, which had no request field until V31) and V31's
`tempo`, `altExerciseId`, `groupId` and `setDetail[]`. On `PUT`, an empty string
clears `altExerciseId` or `groupId` and an empty `setDetail` list clears the
per-set prescription back to the scalar `sets`/`reps`.

`groupId` is a correlation id shared by the adjacent members of one superset —
not a foreign key. Members are minted **per program**, so two clients on the same
template never share one.

### `POST /v1/programs/{id}/resync`
**Purpose:** push the template's current blueprint onto one client's copy.

Explicit, one program at a time, never automatic. Returns
`{programId, templateId, removed, added}`.

Three things it does and does not touch:

- **the client's schedule is kept, not re-asked.** The weekday and time each
  ordinal slot landed on were chosen once, for them, and a blueprint edit is not
  a reason to move somebody's Tuesday. The stored `program.schedule` is replayed
  through the same translation `apply` runs;
- **a blueprint that has GROWN a day is a 400** naming the mismatch, because
  inventing a weekday for the new day is the invention the count-match rule
  exists to refuse. Assign it again to choose when the new day happens;
- **history is untouched.** `workout_session`, `set_log` and `scheduled_session`
  key on the program, the exercise and the client, never on a `program_exercise`
  row id, so every set already logged reads back identically. The old rows are
  tombstoned rather than deleted, so the sync envelope can tell the phone.

A program written from scratch rather than from a template has nothing to pull
from and answers 400.

---

## Workout templates

`workout/WorkoutTemplateController.java` — **V13.** One reusable session,
prescribed **per set**, that a trainer saves once and pours into any program day
(`/programs/workouts`, and the program builder's library pane). **Not a
`template` with one week**: a week sheet prescribes a row as *N × reps*, a
workout prescribes each set with a load kind and an effort kind of its own.
Trainer-owned, tier 1, never in sync.

```ts
SetWire      { loadKind: 'percent_1rm'|'level'|'weight'|'weight_range'|'bodyweight'|'rpe_level'|'rpe_weight';
               loadValue: number|null;
               effortKind: 'max_reps'|'max_time'|'max_distance'|'distance'|'reps'|'rep_interval'|'time';
               effortValue: number|null; restSeconds: number|null; tempo: string|null; notes: string|null }
ExerciseWire { id; exerciseId; orderIndex; groupId: string|null;
               alternatives: { exerciseId; sets: SetWire[] }[]; sets: SetWire[] }
WorkoutTemplateResponse { id; name; notes: string|null; exercises: ExerciseWire[];
               dividers: { label; beforeIndex }[]; createdAt; updatedAt;   // epoch ms
               exerciseCount; setCount }                                   // COUNTED on read, never stored
```

`setCount` counts every set of every movement; alternatives are not counted,
because they replace a movement rather than add to it.

### `GET /v1/workout-templates`
**Purpose:** the caller's saved workouts, most recently touched first (then
oldest, then id — a total order). An empty account answers `[]`.

### `GET /v1/workout-templates/{id}`
**Purpose:** one workout, whole — used when it is poured into a program day.
Not the caller's, or deleted: `404 WORKOUT_NOT_FOUND`.

### `POST /v1/workout-templates` → `201`
**Purpose:** save one. Body `{ name?, notes?, exercises?, dividers? }`, every
field optional; `name` defaults to *New workout*.

### `PUT /v1/workout-templates/{id}`
**Purpose:** save it again. **A whole-body replace of the fields present**:
each of `name`, `notes`, `exercises` and `dividers` that is sent replaces the
stored one entirely, and an absent one is left alone. **There is deliberately no
per-exercise PATCH** — two write granularities on one blob is how a half-saved
session happens. Dividers sent without exercises are clamped against the
exercises already stored.

### `DELETE /v1/workout-templates/{id}` → `204`
**Purpose:** remove one. **Soft** (`deleted_at`). A program day that a workout
was poured into holds **copies** of its rows, carrying only V10's `workoutName`,
so nothing cascades and no plan loses a row.

### What the server does to every write

The builder is a drag-and-drop board, so the request is read as loose JSON and
rebuilt field by field:

| Input | Stored as |
| --- | --- |
| an exercise's `orderIndex` | **re-derived from array position**; the sent value is never read |
| an exercise's `id` | kept when sent (≤ 64 chars), minted when absent |
| an unknown `loadKind` / `effortKind` | `weight` / `reps` |
| a `loadValue`, `effortValue` or `restSeconds` that is not a number (a numeric string included) | `null`; `restSeconds` is rounded to whole seconds |
| an empty `tempo`, `notes` or top-level `notes` | `null` |
| an alternative with no `exerciseId`, or with no sets | dropped |
| a divider's `beforeIndex` | rounded, then **clamped to `[0, exercises.length]`** — evaluated after this body's exercises |
| a divider with an empty `label` | dropped; the rest are sorted by `beforeIndex`, stably |
| an `exerciseId` (alternatives included) the caller cannot see — neither the catalogue nor their own custom movement — or one that is not a UUID | **`400 VALIDATION`** with `detail` naming the position (`exercises[1].alternatives[0].exerciseId: not a movement in your library`); nothing is stored |

Ceilings, each a `400 VALIDATION` rather than a truncation: 60 movements, 30 sets
per movement or alternative, 5 alternatives per movement, 30 dividers, a name of
120 characters and 500 for any note.

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
`scheduledAt`, change `status`, `durationMinutes`, `notes` or `deliveryMode` —
and settle the session against the client's pack with **`packDelta`**.

Every session response carries **`packDelta`** and **`packPackageId`** — V10's
columns, what this session took and from which pack. `0` and null mean it cost
nothing, which is a different fact from costing one and has to be drawable as
one: *Marked no-show* and *Marked no-show · pack −1*.

**`packDelta` on the request is `-1` or `0`, and nothing else.** Until it
existed, `POST /v1/sessions/{id}/done` was the only endpoint anywhere that
touched `sessions_remaining`, so a session marked `no_show` over REST wrote a
status and left the money alone — while the phone's `markNotTrained` had always
settled the pack in the same write.

It is a request field rather than a rule the server applies to `no_show` on its
own, and that is the decision: **whether a missed session burns one is a
commercial question the trainer settles with the client**, not an invariant. The
server's job is to make the answer expressible, and exact however many times it
is asked.

Four rules, which are the server's copy of the phone's `settlePack`, quadrant
for quadrant — the pack reflects the session's *current outcome*, never the
running total of every button ever pressed:

| already charged | asked for | what happens |
| --- | --- | --- |
| yes | `-1` | nothing moves; the **original stamp is kept**, so an undo still credits the pack it took from |
| yes | `0` | put back, capped at the pack's own `sessions_total` |
| no | `-1` | one comes off the oldest chargeable pack |
| no | `0` | nothing moves |

Closing a session is not a one-way door — it can be finished from the log, from
the diary and from its detail screen, then re-decided — and every one of those
paths used to subtract one more. A twelve-session pack with one session
delivered could read nine.

Two guards, both `400`:
- **Any delta but `-1` or `0`.** A route that can set an arbitrary count can
  bill four sessions for one no-show, and can silently undo a charge the 24-hour
  undo exists to reverse properly. It is why `PATCH /v1/packages/{id}` with a
  `sessionsRemaining` was deliberately never built.
- **A `done` session.** That outcome owns its charge in `/done`, which also
  opens the workout log; two front doors to one outcome is the double-charge
  shape again. `cancelled` is accepted because the refund quadrant is exactly
  what a done-then-cancelled session needs.

A **paused pack is not chargeable** (V30) — the session is marked and costs
nothing, exactly as it already does for a client with no pack at all, and the
zero is stamped rather than left null so a resume cannot bill it late. Omitting
`packDelta` leaves the pack untouched, so every caller that predates the field —
every reschedule, every note edit — is unaffected.

### `POST /v1/sessions/{id}/done`
**Purpose:** mark a booked session complete — the bridge from *planned* to
*logged*. Creates the corresponding workout session and decrements the client's
session pack.

Body (optional): `workoutNotes`, `sessionDate` (ISO `yyyy-MM-dd`; defaults to
today).

---

## Workout sessions & set logs

**Removed.** `/v1/workouts` no longer exists. The eight writes went on 3 Oct 2026 and the five reads (`GET /v1/workouts`, `/sets`, `/{id}`, `/{id}/sets`, `/{id}/exercises`) went with the Progress pass the same day. The log is the session: read it through [Log session v1.1](#log-session-v11-3-oct-2026) (`GET /v1/sessions/{id}/log`), list sessions with `GET /v1/sessions` (each row carries `startedAt`, `endedAt` and `log` totals), and read a client's sets through `GET /v1/clients/{id}/set-history`.

## Packs (the price list)

`payment/PackController.java` — **what the trainer sells**, which is not what a
client bought. `pack` and `package` are one letter apart and are two different
things: a pack is the offer (a 12-session block at ₹9,000), a package is the
sale. The section below owns the second.

Retiring a price is `PATCH {"status":"inactive"}` and there is **no DELETE** —
`package.pack_id` is a foreign key, and removing a price a client is on would
rewrite what they paid.

**Why these three routes exist.** `pack` used to reach the wire only inside the
sync envelope (`packs` in `POST /v1/sync/push`), which is all the phone needs
because it holds the table locally. The web half is online-only and holds
nothing, so its Packages screen would otherwise have had to pull the whole
account on every render. The sync path is unchanged; nothing on a phone notices.

### `GET /v1/packs`
**Purpose:** the trainer's price list, in their own `order_index` then by price.

Query params `owner` (`trainer` | `gym`) and `status` (`active` | `inactive`);
omit both for everything.

**Retired entries are returned by default, not filtered.** The Packs screen draws
them in their own group — *no longer offered, 2 still on it* — and a caller that
wants only what is for sale passes `status=active`.

Each row returns `id`, `name`, `type`, `sessions`, `amount`, `currency`,
`validityDays`, `status`, `owner`, `orderIndex`, `createdAt`, `updatedAt`, and
**`activeClients`** — how many live packages point at this pack. It is computed
server-side because every caller wants it and the alternative is shipping every
sold package to a screen with no other use for them.

**`owner` is V19's two price lists.** A trainer employed at a gym keeps their own
packs, which they price and can discount, alongside the packages the gym's
counter sells, which they can do neither to. Absent reads as `trainer` — the
column's own default, and what a build predating V19 always meant.

### `POST /v1/packs` → `201`
**Purpose:** add a price.

Body: `name` (required), `type` (required — `session_pack` | `monthly` |
`single`), `amount` (required, > 0), `sessions`, `validityDays`, `owner`
(defaults `trainer`), `orderIndex` (defaults 0).

`sessions` is forced to NULL on a `monthly` (it is a duration, not a count) and
to 1 on a `single`. A `session_pack` without one is a `400`.

### `PATCH /v1/packs/{packId}` → `200`
**Purpose:** change a price, rename it, retire it, or bring it back.

Body: any of `name`, `type`, `sessions`, `amount`, `validityDays`, `status`,
`orderIndex`. Anything else is a `400` rather than an ignored field.

**Partial by KEY PRESENCE, not by null.** A key you send is applied — `null`
included; a key you omit is untouched. So retiring is `{"status":"inactive"}` and
nothing else, and `{"validityDays":null}` genuinely clears an expiry. The usual
`COALESCE(:field, field)` shape cannot express that second one at all, because
absent and null arrive identically, and a validity a trainer cleared and that
quietly stayed is the kind of wrong that surfaces months later.

`sessions` is the one field the body does not get the last word on: sending
`type: "monthly"` forces it NULL and `type: "single"` forces it 1, the same
normalisation `POST` applies. A 12-session pack edited into a Monthly must not
keep the 12.

**`owner` is not in the body and cannot be changed.** Moving a pack between the
two lists would re-attribute every package already sold from it, and the gym's
prices are not the trainer's to re-badge. `pushPacks` in `SyncService` refuses
the same move for the same reason.

A pack belonging to another trainer answers `404`, not `403` — a trainer has no
business learning that somebody else's price list has that id.

---

## Packages & payments (money book)

`payment/PackageController.java` — session packs sold, and money collected
against them.

### `GET /v1/clients/{clientId}/packages`
**Purpose:** every package sold to this client, newest first.

Each returns `type`, `sessionsTotal`, `sessionsRemaining`, `amount`, `currency`,
`startDate`, `endDate`, `status`.

### `GET /v1/packages`
**Purpose:** every package on the roster, newest first — the read the per-client
route cannot be.

Query param `status` narrows it (`active`, `completed`, …); omit it for all.

Its sibling above answers *what has this one person bought*, which is the client
file's question. Two screens ask a different one — the deck's *who is running
out* and the money book's *what is live* — and answering that through the
per-client route costs one request per client on the screen a trainer opens every
morning. At 22 clients that is 22 requests against a 120/min ceiling, so a
refresh is rate-limited for reading a dashboard.

Every package response carries, **appended after `updatedAt`** so a reader
written against the twelve-field shape keeps working: `packId`, `pausedAt`,
`pausedDays`, `closedAt`, `dueDate`, `discountAmount`, `amountPaid`, `amountDue`.

**`amountPaid` and `amountDue` are computed by the server** and must not be
re-derived. `amountPaid` sums payments whose status is `paid` **or** `confirmed`
— this API writes the first, the sync envelope has carried the second since V1,
and both mean *the money arrived*. `amountDue` is `amount − paid − writtenOff`,
floored at zero, because an overpayment is a real thing and a negative
outstanding renders as a debt owed the wrong way. Three components on the web
used to sum `confirmed` alone and showed every paid-up client as owing the full
amount; one figure, computed beside the rows it comes from, cannot drift.

**`status=active` means it, since V30.** A lifecycle sweep runs on every read of
these two routes and closes anything that has quietly finished: `completed` when
the sessions ran out, `expired` when the validity lapsed with sessions still on
it, `closed_at` stamped either way. Exhaustion wins when both are true on the
same day. **It never touches a paused pack.** Before V30 nothing ever moved a
package off `active`, so a twelve-session block finished in March was still
`active` in August.

> A caller that wants *packs with money on them* must ask `amountDue > 0` rather
> than `status = 'active'` — a client can finish all twelve sessions and still owe
> for four of them, and that pack is now closed.

**V30 is backend + web only, and the sync path is untouched.** `paused_at`,
`paused_days` and `closed_at` are absent from `pushPackages`' upsert and
`package_adjustment` is not in the envelope, so no phone build notices and an old
build's push cannot erase them. Two consequences to know:

- The phone does not know about pause, so a session marked done **on the phone**
  still decrements a paused pack from its own SQLite. Only the server-side
  `POST /v1/sessions/{id}/done` honours the pause.
- `pushPackages` assigns `status = EXCLUDED.status`, so a phone still holding a
  swept pack as `active` will push it back to `active`. This **converges rather
  than fights**: the next read sweeps it closed again, and the sweep is
  idempotent. It is churn, not a correctness bug, and it ends when the phone
  adopts the REST routes.

### `POST /v1/clients/{clientId}/packages` → `201`
**Purpose:** sell a package.

Body: `packId`, `type`, `amount`, `sessionsTotal`, `startDate`, `endDate`,
`discountAmount`, `dueDate`. `sessionsRemaining` is seeded from `sessionsTotal`
and decremented by `POST /v1/sessions/{id}/done`.

**Pass `packId` and everything else is optional.** Type, session count and price
come off the price-list entry, and its `validityDays` becomes a real `endDate`
counted from the start. Anything sent alongside overrides it — the commonest
reason to send an `amount` is that this client is paying something else, which is
what `discountAmount` records the *why* of. Without `packId` the V1 contract is
unchanged: `type` and `amount` are required.

This is what finally writes `package.pack_id`. V11 added the column and nothing
ever wrote it through REST, which is why `pack.activeClients` — the count that
makes retiring a price a decision — read zero for every REST-sold pack.

### `POST /v1/packages/{packageId}/renew` → `201`
**Purpose:** repeat a pack that has run out. **An empty body is a complete
request.**

Body (all optional): `packId`, `sessionsTotal`, `amount`, `discountAmount`,
`startDate`, `dueDate`. Everything omitted defaults to what the expiring pack
said, because that is what renewing means — a trainer renewing a client on a gym
floor must not be asked to re-type a price they set last month.

**This is also how a client buys more sessions mid-pack**, with exactly one
field different: `startDate` set to today. A renewal starts where the current
pack stops (the table below); sessions bought on top of a pack that is still
running have to be live now, or the client has paid for something that does not
exist until their current pack lapses. The web calls the two *Renew* and *Add
sessions* and picks between them on `packBand` — empty, ≤2 left, or ≤7 days to
run is a renewal, anything else is an addition. Both write a second `package`
row, because **a package is a sale**: adding sessions to the row bought in
August would blend two prices into one per-session figure and leave nothing
saying what was actually agreed. `POST /v1/packages/{id}/sessions` is the
narrow exception and it moves no money — see below.

The response carries `sessionsBooked`, like a sale: the write reconciles the
client's standing week inside the same transaction, so a renewal usually puts
sessions in the diary as well as a row in the books.

A POST, not a PATCH: it **creates** a package and leaves the old row exactly as it
is, which is what keeps a client's history readable and what the money book is
still owed against. It sits on the old package's id rather than the client's,
because a client with two packs behind them has two different renewals available.

*Dates continue from expiry*, three cases:

| | |
| --- | --- |
| renewed **early** | starts the day after the current pack lapses — nobody is charged twice for the same fortnight |
| renewed **late** | starts **today**. Back-dating would silently hand back validity nobody had; `extend` is how you choose to give it, and it leaves a row saying so |
| **no expiry** | the new pack has none either. It runs until the sessions are used |

The validity window comes from the price-list entry if the pack still points at
one, else from the old pack's own span **minus `pausedDays`**.

### `POST /v1/packages/{packageId}/pause` · `resume` · `extend`

**Purpose:** the three things that actually happen to a coaching arrangement.
V30. Each writes a `package_adjustment` row as well as changing the pack, and
each returns the updated `PackageResponse`.

| Route | Body | What it does |
| --- | --- | --- |
| `pause` | `reason`, `effectiveAt` | Stops the clock. |
| `resume` | `reason`, `effectiveAt` | Restarts it and pushes `endDate` out by exactly the days the pause cost, accumulating them into `pausedDays`. |
| `extend` | `days` (1–365, required), `reason` | Pushes `endDate` out. Sessions are untouched — this is time, not sessions. |

`effectiveAt` accepts epoch ms, an ISO instant, a zoneless ISO datetime, or a
bare `YYYY-MM-DD`; the last two are read in the server's zone. It exists because
trainers catch up on Sundays, and a pause back-dated to the Thursday the client
actually left gives back the right number of days.

**`pause` is a column, not a status.** `status` stays `active` throughout, so
every existing `WHERE status = 'active'` read — the deck, the money book,
`pack.activeClients` — keeps counting a client who is on holiday as the active
client they still are. The single thing it gates is the charge:
`POST /v1/sessions/{id}/done` will not decrement a paused pack. A client with a
paused pack and a second live one is charged against the second; with nothing
chargeable the session is marked done for free, exactly as for a client with no
pack at all, and `pack_delta` records the zero so the resumed pack is not
retroactively billed.

Refusals, all through `PackageRuleException`, all with a `code` and a sentence:
`PACKAGE_ALREADY_PAUSED` / `PACKAGE_NOT_PAUSED` / `PACKAGE_NOT_LIVE` (409),
`PACKAGE_NO_EXPIRY` (409 — nothing to extend), `PACKAGE_BAD_EXTENSION` (400).
Most are **409 rather than 400**: the request is well-formed and the state will
not take it, which means *the world moved, re-read it* rather than *fix what you
sent*.

There is deliberately **no general `PATCH /v1/packages/{id}`**. `BACKEND_GAPS.md`
§6 asks for one carrying `sessionsRemaining` and calls it "the more general answer
and the more dangerous one" — a route that sets a session count directly can
silently undo a charge the diary's 24-hour undo exists to reverse properly. These
three move dates and nothing else.

V4 adds a fourth verb that moves sessions, and it is narrow on purpose: it sets
the TOTAL and moves what is left by the same delta, so what has been delivered
cannot change. See `POST /v1/packages/{packageId}/sessions` below.

### `POST /v1/packages/{packageId}/sessions` · V4
**Purpose:** the pack was sold with twelve and the row says ten. **A correction,
never a sale.**

Body: `sessionsTotal` (required, 1–500 — the number it *should* have been,
absolute rather than a delta, because that is the number the trainer knows) and
`reason`. Returns the updated `PackageResponse` and writes a
`package_adjustment` of kind `sessions` carrying the signed delta.

**It moves `sessionsTotal` and `sessionsRemaining` and never `amount`.** That is
the whole line between this and `/renew`: money changing hands is a sale and
gets its own row; a number that was simply typed wrong is a correction. It is
the exact sibling of `extend`, which gives days away and leaves the price alone.

**`sessionsRemaining` moves by the DELTA, which is what makes this safe** — and
it is why it is not the `PATCH /v1/packages/{id}` this file has always refused.
That route, `BACKEND_GAPS.md` §6's option (b), sets `sessionsRemaining`
directly, and the danger both documents name is real: it can silently undo a
charge that the diary's 24-hour undo exists to reverse properly. This route
cannot. `used = sessionsTotal − sessionsRemaining` is invariant across it by
construction, so no correction can un-deliver a session, and a total corrected
to fewer than have already been delivered is refused by name rather than
clamped. Option (b) stays unbuilt.

Refusals: `PACKAGE_BAD_SESSION_COUNT` (400 — outside 1–500), `PACKAGE_NO_CHANGE`
(400 — the count it already has, refused rather than answered 200 having done
nothing), `PACKAGE_NOT_COUNTED` (409 — a monthly pack counts no sessions;
`extend` is the verb that applies), `PACKAGE_FEWER_THAN_DELIVERED` (409),
`PACKAGE_NOT_LIVE` (409).

### `GET /v1/packages/{packageId}/adjustments`
**Purpose:** everything that has happened to one pack, oldest first.

Each row: `kind` (`pause` | `resume` | `extend` | `sessions`), `days`,
`sessions`, `reason`, `effectiveAt`, `createdAt`. **Append-only** — no update, no
delete; reversing an adjustment is another row, which is why `days` is signed. On
a resume `days` is the pause's length; on a pause it is `0`, because an open
pause has no length yet.

`sessions` is V4 and is the signed change a correction made to the count —
negative as often as positive, since the commonest correction is a count typed
too high. It is `0` on pause, resume and extend, which all move days; `days` is
`0` on a correction, which moves neither dates nor money. A row carries one or
the other, decided by its `kind`.

It exists so goodwill is a fact rather than a feeling: an extension is the
cheapest thing a trainer gives away and the easiest to forget having given, and
"I have already stretched this twice" should be something they can look up.

### `GET /v1/packages/{packageId}/payments`
**Purpose:** the payment history against one package — what has been collected
versus what is owed.

Every payment response — here, `GET /v1/payments`, the record, confirm,
write-off and invoice routes — carries **`invoiceNo`** and **`invoicedAt`**
(epoch ms), **appended last** by V8. Both null until somebody raises an invoice,
which is the common case: the pair is what decides between *Raise an invoice*
and *INV-2627-0007* on each row.

### `GET /v1/payments`
**Purpose:** the trainer's money across the whole roster, in a window.

Query params `from`, `to` (epoch ms) and `status`. Same convention as
`GET /v1/sessions`, so a caller that knows one window knows this one: **`to` is
exclusive**, so the first instant of next month does not also collect that day's
first payment.

**The window is on `created_at`, not `paid_at`, and that is the deliberate
half.** A month's *billing* is what was raised that month. Dating by `paid_at`
would move an invoice into whichever month it happened to be settled in, and
would drop every unpaid one — which is exactly the figure *still owed* is made
of.

### `POST /v1/packages/{packageId}/payments` → `201`
**Purpose:** record a payment.

Body: `amount` (required), `method` (required — cash / UPI / etc.),
`collectedBy` (required — trainer or gym; this is what drives the gym-share
split), and three optional fields: `paidAt`, `note`, `upiReference`.

**`paidAt` is what says the money actually arrived, and it is the date.** Every
payment this route wrote used to be `pending`, and only
`PATCH /v1/payments/{id}/confirm` could move it. That is right for a UPI intent
fired optimistically and wrong for the two commonest cases in this business:
cash in a hand and a gym counter's slip are already settled by the time anyone
types them, and a book that filed them as pending showed a trainer who had been
paid in full a month of debt they did not have.

| `paidAt` | Row written | Gym share |
| --- | --- | --- |
| sent (epoch ms) | `status = 'paid'`, `paid_at` stamped to it | split stamped now, same rule as `confirm` |
| omitted | `status = 'pending'`, `paid_at` null | null — not yet split |

It is **clamped to now**, never rejected. Back-dating is the point — a trainer
catching up on Sunday says the money came on Thursday — but a payment dated next
March would sit above every ledger the screen can draw and inflate the GST
rolling twelve months.

`note` is V11's `payment.note` — free text, never parsed, optional on every
method rather than only on UPI. The column has been on the wire inside the sync
envelope since V11 and REST simply never selected it, so a note written on the
phone was invisible to the web and the web had nowhere to write one.

`upiReference` was **already being sent by the web's record panel and silently
dropped**: only `confirm` wrote that column. It is written at record time now,
and `confirm` `COALESCE`s onto it rather than overwriting, so confirming without
a reference no longer erases one.

Every payment response carries **`gymShareAmount`** — the gym's cut, copied onto
the row at record time (V11 stores it rather than looking the percentage up
later, so a contract changing in October cannot move September's split). It is
null on a fresh `pending` row: the split has not been made yet, and `0` would
read as *the gym took nothing*, which is a different fact.

That field is **appended last but one**, and `note` is now appended after it. The
position is the additive-only contract rather than tidiness — every existing
caller destructures by name, so a reader written against the twelve- or
thirteen-field shape keeps working. `gymShareAmount` was already on the wire
inside the sync envelope; the trainer's own `yours = billed − cut` was the one
figure REST could not compute, which is what put it here.

**None of this touches the sync path.** `pushPayments` already upserts `note`,
`paid_at`, `status` and `upi_reference`, so the phone's own record flow is
unchanged and an old build's push neither loses nor clobbers anything new.

### `PATCH /v1/payments/{paymentId}/confirm`
**Purpose:** confirm a pending UPI payment once the money has landed.

Body: `{ "upiReference"?, "method"?, "paidAt"? }`, every field optional. Flips
`status` to `paid` and stamps `paidAt`. Separate from `POST` because a UPI deep
link is fired optimistically and confirmed later.

**`paidAt` and `method` (V8).** A trainer settling Tuesday's cash on Thursday
sends Tuesday; absent means now. Unlike `POST`, which clamps, a `paidAt` in the
future is **refused** — `400 VALIDATION` — because it is a date somebody typed on
purpose and silently replacing it would store a day nobody chose (five minutes
of clock skew are forgiven). `method` overwrites the row's method when sent and
leaves it alone when not, so a pending row whose method was never known can
learn it at the moment it is settled.

A **written-off row cannot be confirmed** — `409 WRITTEN_OFF`. Its amount is
already on the package's `written_off_amount`, and confirming it would count the
same rupees as both collected and forgiven.

### `PATCH /v1/payments/{paymentId}/write-off`
**Purpose:** stop chasing a debt, without pretending it was paid and without
deleting it. **V8.**

Body (optional): `{ "reason"?: string }` — appended to the row's `note` as
`"<old> · <reason>"`, refused over 500 characters. Returns the payment row.

- `status` becomes `write_off`; `paidAt` and `gymShareAmount` become null. The
  amount, client and date stay — "₹2,000 was forgiven in March" is still a fact
  in the books.
- **The row's amount is added to the package's `written_off_amount`** (and
  `written_off_at` is stamped if unset), in the same transaction. That is what
  makes the debt drop: `amountDue` is `amount − paid − writtenOff`, and a pending
  payment row is a placeholder for money expected, not part of that sum. It is
  also the column the phone already draws.
- A write-off **never counts as collected** — `amountPaid` sums `paid` and
  `confirmed` only.

| Refusal | Answer |
| --- | --- |
| already `paid` / `confirmed` | `409 ALREADY_COLLECTED` — money that arrived was not forgiven; delete a wrong entry instead |
| already written off | `200`, unchanged — a second press must not forgive the amount twice |
| not this trainer's, or not in the active workspace | `404 PAYMENT_NOT_FOUND` |

### `POST /v1/payments/{paymentId}/invoice`
**Purpose:** give a collected payment a bill number. **V8.**

No body. Returns the payment row with `invoiceNo` and `invoicedAt`.

**`INV-<FY>-<NNNN>`.** The financial year runs April–March on the Indian
calendar, so September 2026 is `2627`; the sequence is **per trainer, per
financial year, across every workspace they coach in**, because a bill series
belongs to its issuer. It is gap-free and collision-free: the counter row
(`invoice_counter`) is locked by the upsert that advances it, inside the same
transaction, and a unique index on `payment (trainer_id, invoice_no)` is the
backstop.

**Minted on request, never on write**, and **idempotent** — a row that already
has a number answers it unchanged.

| Refusal | Answer |
| --- | --- |
| written off | `409 WRITTEN_OFF` — *"This one was written off. There is nothing to bill for."* |
| `collectedBy = gym` | `409 GYM_COLLECTED` — *"The gym collected this one and raises its own receipt…"* |
| still `pending` | `409 NOT_PAID` — the bill prints *Paid on*; mark it paid first |
| not this trainer's | `404 PAYMENT_NOT_FOUND` |

> **This is the trainer's bill to their client, not a tax invoice.** It computes
> no tax. `PRICING.md`'s GST-compliant invoices are InclineYou billing the
> trainer — a different document — and no copy on either half may call this one
> a tax invoice.

---

## Nudges

**This is where the gym's cut is frozen onto the row, and until V30 nothing
did it.** V11 stores `gym_share_amount` and `share_percent` "applied AT RECORD
TIME … so September's split must not move", and the note above says the split is
stamped on confirmation — but the UPDATE wrote four columns and neither of those
was among them. Every confirmed payment carried a null cut, so the client file's
*the gym's share* row never rendered and *what you keep* showed the full billed
amount to a trainer who keeps half of it.

The rule: the cut applies **only when the gym collected**. Zero in three cases,
two of which surprise people — the trainer collected (whatever the mode, and even
on the gym's own floor), there is no gym on the profile, or no share is agreed.
Remote sessions are zero by being collected by the trainer, which is a rule in
code and not a second column. The percentage is read from `trainer` at that
instant and **copied**, never joined at read time; re-confirming an already-split
payment cannot re-derive it, because the first confirmation is the one that
counts.

**There is no Nudges screen, and that is what these six routes are for.** A nudge
belongs next to the thing that triggered it — the Today card, the client row, the
dues list, the pack that is ending, the session nobody turned up to — so the
sending is a button on a row and what is left over is two things that needed a
wire of their own: the trainer's own WORDING, and the RECORD of what was sent.
V32.

**Nothing here sends a message and nothing ever has.** The backend renders a
draft, logs that it was drafted, and hands back a `wa.me` deep link. The trainer's
own WhatsApp opens with the text in the box and they press send. That is the
right delivery for v1 rather than a compromise: it costs nothing, needs no
Business API approval, no Meta trust tier and no template review — and a message
from the trainer's own number lands in a thread the client already has open,
where one from a platform number does not. Scheduled and automatic nudges are v2,
behind the trust tiers.

### `POST /v1/clients/{clientId}/nudge`
`nudge/NudgeController.java` · **`MESSAGING` tier — 10/min.**

**Purpose:** draft a WhatsApp nudge for a client, and log it.

Body: `{ "templateName": "…" }`. Returns
`{ "nudgeId", "whatsappUrl", "message", "sentAt" }` — the backend renders the
message from the trainer's template and the client's live figures, writes a
`nudge_log` row **carrying the rendered text** (V32's `nudge_log.message`), and
hands back the deep link.

**The message is not in the request body and deliberately cannot be.** A caller
that could supply the sentence could put a figure in it that disagrees with the
money book, and the caller most likely to is the screen that has just done some
arithmetic of its own. Every variable is resolved server-side, from the same rows
the money book reads.

**The eight templates** — `NudgeTemplateCatalog`, which is the whitelist and the
default wording in one place:

| Template | What it is for | `{count}` means |
| --- | --- | --- |
| `renewal` | the pack is nearly done | sessions left |
| `payment_reminder` | money is owed. `{amount}` is `SUM(amount − paid − written off)`, the same arithmetic as `PackageResponse.amountDue` | days outstanding |
| `missed_session` | they missed sessions they were booked into | no-shows in 30 days |
| `check_in` | nothing is wrong; how is the week going | sessions delivered |
| `re_engagement` | they stopped weeks ago. Names the gap and offers a slot | sessions delivered |
| `well_done` | a milestone. `{nth}` is the ordinal — 100th, 111th | sessions delivered |
| `session_summary` | sent after a session, while it is still in their head | sessions delivered |
| `session_reminder` | tomorrow's session, confirmed the night before | — |

`{count}` means a different number in each of them **on purpose**: there is
exactly one count per template, so a trainer editing one can never be looking at
two, and the editor prints what this one means. The other tokens are `{name}`
(first name), `{trainer}`, `{amount}`, `{package}` (the pack's name via
`package.pack_id → pack.name`), `{days}` and `{nth}`.

**`well_done`'s figure IS interpolated now**, reversing what this file used to
say. The old objection — that counting the sessions again is "a second opinion
about a number the trainer is looking at on the row" — was a real risk, and the
answer is to count them the way the deck counts them rather than to leave the
number out: `workout_session` rows per client, which is exactly
`buildAttention`'s milestone counter in `lib/today/deck.ts`.

**Two refusals, both with a sentence** (`NudgeRuleException` → `ProblemDetail`):
`422 NUDGE_NO_PHONE` for a client with no number on file — the request is
well-formed and asks for something that cannot exist, and a `wa.me` link built
from a malformed number opens WhatsApp on an error page, which reads to the
trainer as the app being broken — and `404 NUDGE_CLIENT_NOT_FOUND` for somebody
else's client, per the standing convention.

An unknown `templateName` still falls through to a generic line rather than a
400: on a rolling deploy where the app knows a ninth template and the server does
not, a trainer standing next to a client should get a WhatsApp with something in
it, not an error on the button they just pressed.

**There is no `DELETE`.** The product cannot know whether the trainer pressed send
in WhatsApp, so it cannot honestly offer to un-send — and deleting the row would
reopen the cooldown, which is the one thing the record exists to hold shut. The
sync path can soft-delete a row the phone wrote; that is a device withdrawing its
own write, and every read here honours `deleted_at`.

### `GET /v1/nudges?days&limit`
**`STANDARD` tier**, and that is not an oversight. `RateLimitFilter` tiers on
`POST` plus a path ending `/nudge`, so these GETs fall through — correctly: a read
of the history spends no WhatsApp and no money, and putting it in the
ten-a-minute tier would make one dashboard load cost the trainer one of the ten
messages they are actually allowed to send. The same call V28's dismissals made.

**Purpose:** what has been sent across the roster, newest first.

Returns `[{ "id", "clientId", "clientName", "templateName", "templateLabel",
"channel", "status", "message", "sentAt" }]`. `days` defaults to **7**, the
cooldown window, because that is what the caller that matters is asking: Today
reads this to stop raising a row about somebody the trainer messaged yesterday.
`message` is **null on every row written before V32** and is left as an absence
rather than re-rendered from the template name — the wording belongs to the
trainer now, so re-rendering March's reminder in August's words would put a
sentence in the history that was never sent. `templateLabel` is resolved
server-side so a renamed template renames every history at once.

**This is what closes the cooldown gap.** `COOLDOWN_DAYS` — "never twice in seven
days to the same person" — has been computed on the phone from its local
`nudge_log` since the drawer was designed, and `nudge_log` reached the wire only
inside the sync envelope: a reminder sent from a laptop was invisible to the
phone's cap and vice versa. Both halves can now read the same rows.

**It is still not enforced by this endpoint, and that is deliberate.** A trainer
pressing *Remind* on somebody they messaged on Monday knows something the product
does not — the client replied, or asked to be chased again on Thursday — and
answering that with a 429 teaches them to open WhatsApp directly, which loses the
log for every client rather than enforcing the cap for one. The enforcement is the
QUEUE going quiet: `deck.ts` pushes a contacted client's row below every
uncontacted one, so it falls behind the disclosure.

One trainer-wide read rather than one per client, for the reason `GET
/v1/packages` exists: the screen has already read the roster, and a per-client
route on a dashboard is twenty-two requests against a 120/min ceiling.

### `GET /v1/clients/{clientId}/nudges?days&limit`
**`STANDARD` tier.** The same rows, narrowed to one client, `days` defaulting to
**365** — the client file draws a follow-up history, and "when did I last chase
this" is a question whose answer is often months old.

Narrowed by `trainer_id` as well as `client_id`, so a coach holding a client
somebody else wrote nudges to gets an **empty list** — the same privacy rule V29
gave `client_note`, and for the same reason: a team widens reads over a
teammate's roster and must not widen this.

### `GET /v1/nudge-templates`
`nudge/NudgeTemplateController.java` · **`STANDARD` tier.** V32; **rewritten to v1.1 (3 Oct 2026)** — see [Settings v1.1](#settings-v11--profile-working-week--messages).

**Purpose:** the trainer's message library — all eight, merged.

Returns `{ "items": [{ "name", "label", "purpose", "body", "isDefault", "variables": [{ "token", "label", "meaning" }], "version" }] }`, **always the eight names in the `nudge_template_name` check's order** — `payment_reminder · renewal · missed_session · re_engagement · session_reminder · session_summary · well_done · check_in`. `body` is the trainer's wording where they have saved one and the catalogue's default where they have not; `isDefault` says which and gates *Reset*; `version` is the override row's `updated_at` as epoch ms in a string, **`null` while it is the built-in wording**. `variables[].label` is the contract's word; `meaning` carries the same text for 1.0 callers. **Cacheable:** `ETag` (a hash of every template's version) and `If-None-Match` → `304`.

**`nudge_template` is an OVERRIDE table, not a seeded one.** A trainer who has never opened the library has no rows. Seeding eight on signup would freeze today's copy into every account, so improving a default sentence would reach nobody. The v1 table has no `deleted_at` and no `id`: a row is `(trainer_id, template, body, created_at, updated_at)`, and a reset is a real `DELETE`.

**The label, the purpose and the variables are on the wire because the web holds no copy of any of them** — eight message bodies in two places is how a drifted sentence reaches a client.

**Not `nudge_rule.message`.** The phone's `nudge_rule` is one row per trainer per *kind* and answers *when should a nudge be raised*; this answers *what does it say*. A trainer who edits both has two strings until the phone adopts `nudge_template`.

### `PUT /v1/nudge-templates/{name}` · `DELETE /v1/nudge-templates/{name}`
**Purpose:** save the trainer's own wording; reset to the built-in.

`PUT` body `{ "body": "…" }` (≤ 1000), **`If-Match` required** (`428 PRECONDITION_REQUIRED` without it): the `version` read, or **`*` to create the first override** (`412` if one already exists). A stale version, or a version for a template with no override, is `412 PRECONDITION_FAILED`. Answers the template row with its new `version`. Refusals: unknown name `404` (plain, no `code`); blank body or over 1000 `400 VALIDATION`; a `{token}` the template does not fill `400 UNKNOWN_VARIABLE` — *which replaces 1.0's leave-it-verbatim rule: a typo caught on save never reaches a client.*

`DELETE` removes the override and answers **the default** (`version: null`) so the screen repaints without a second request. **Idempotent** — resetting a template nobody overrode is `200`; an unknown name is `404`.

**`nudge_template` is not in sync**, per V26's, V28's, V29's and V30's precedent. `NudgeService` and `NudgeDraftService` read the override through `NudgeTemplateJdbcRepository`.

---

## Attention dismissals

`attention/AttentionDismissalController.java` — **`STANDARD` tier.** V28.

**Purpose:** what the trainer has silenced in Today's *Needs you today* queue.

The queue ranks work by what it costs to ignore, and it earns its place by being
trustworthy — a list that cannot be silenced argues with the trainer every morning
about a client they dealt with off-app, and the way that argument ends is the
trainer stopping reading the list.

Three routes and no more. There is deliberately **no per-client GET**: the only
caller is a dashboard that has already read the whole roster, and a per-client
route here would be the mistake `GET /v1/packages` was added to fix.

**`STANDARD`, not `MESSAGING`.** Dismissing a row sends nothing and spends nothing,
and clearing six rows must not cost a trainer six of the ten messages a minute they
are actually allowed.

### `GET /v1/attention/dismissals`
**Purpose:** every silence still in force for this trainer.

Returns `[{ "id", "clientId", "kind", "band", "snoozedUntil", "createdAt",
"updatedAt" }]`. `snoozedUntil` is **null for a permanent dismissal**; a timestamp
means snoozed until then. Expired snoozes are filtered in SQL and are **not**
deleted on read — a GET that writes cannot be retried and turns a read timeout into
a partial mutation.

### `POST /v1/attention/dismissals` → `201`
**Purpose:** silence a row, or change how long it stays silent.

Body: `clientId` (required), `kind` (required), `band` (required), `snoozeUntil`
(epoch ms, or null/absent for "do not raise this again").

Upsert on `(trainer_id, client_id, kind)`, so a snooze extended and a snooze made
permanent are the same call and the answer is `201` either way. `created_at` is not
reassigned on conflict — it dates the first time the trainer said *not now* about
this job. The row comes back, and its `id` is what a DELETE needs.

**`kind` is `AttentionItem.kind`, not the row's key:** `pack` | `overdue` |
`missed` | `quiet` | `no-program` | `unmarked` | `milestone` | `log`. The queue is
already one row per client per kind, so this is the same grain as the thing being
silenced — silencing a client's money must not silence their empty pack. Not
constrained to a fixed set in the schema, for the reason the statuses aren't: an
eighth kind should cost a deploy, not a migration.

**`band` is the field that stops a dismissal becoming a blindfold.** It records how
bad the condition was WHEN it was silenced, and the reader compares it against the
live band: "pack ends in 2 sessions" dismissed on Monday does not keep the row
hidden when the pack hits zero on Thursday. The comparison is the client's, not the
server's — the band ladder lives in `lib/today/deck.ts` and `app/src/home/deck.ts`,
and this stores a name from it rather than a rank out of it.

### `DELETE /v1/attention/dismissals/{id}` → `204`
**Purpose:** put the job back in the list.

A delete rather than a flag: the unique constraint counts a tombstone, so a soft
delete would make the next dismissal of the same job collide with a silence that is
meant to be gone. Scoped by `trainer_id` in the WHERE clause, so somebody else's
row is a `404` rather than a deletion. **A `404` is success to the caller** — the
row is gone, which is what restoring it means.

**Nothing here enters the sync envelope.** The web is online-only and a silence
authored on a phone with no signal is one replayed at an unknown later time — the
same argument V26 makes for the team tables. When the phone adopts this it reads it
over REST, as the team screens do.

---

## Business v1.1 (3 Oct 2026)

Built on the v1 schema; money is always a decimal string and every response states its `currency`. All are STANDARD tier and read the active workspace only (RLS). Contract: `release/api-contract-v1.1.html`, Business.

| Route | What it does |
| --- | --- |
| `GET /v1/money/summary` | Adds `takeHome` to every month and to `total` (collected less the gym's part of paid payments). |
| `GET /v1/money/activity?from&to&limit&cursor` | `sold` · `paid` · `write_off` · `refund`, newest first, keyset on `(at, id)`. Limit 8 default, 100 max. |
| `GET /v1/payments/export?from&to&…` | CSV, streamed page by page. `from` and `to` required, 3 years max (`RANGE_TOO_LARGE`). Cells starting `= + - @` are prefixed with `'`. |
| `GET /v1/money/gym?from&to` | `stats`, `shares[]` (per pack: `sold`, `billed`, `trainerTake`, `gymCut`, `gymSharePercent`, `gymShareAmount`) and `settlement` (null until pay terms exist). 24 months max. |
| `GET · POST /v1/gym-arrangements`, `PATCH · DELETE /{id}` | Pay terms with a gym. Errors `ARRANGEMENT_NEEDS_GYM` · `ARRANGEMENT_OVERLAP` · `ARRANGEMENT_STARTED` · `ID_CONFLICT`. |
| `GET · POST /v1/trainer-payouts`, `PATCH · DELETE /{id}` | What the gym paid. `ARRANGEMENT_REQUIRED` with no running terms; `receivedAt` never in the future. |
| `GET /v1/reports/practice?months=12` | Months, headline (`retentionPercent`, `takeHome`), top ten clients with `collected` and `yours`. 24 months max. |
| `POST /v1/packs` · `PATCH /v1/packs/{id}` · `DELETE /v1/packs/{id}` | Price list on the v1 columns: `service`, `basis`, `sessions`, `validityDays`, `trainerSharePercent` | `trainerShareAmount`. Unknown keys (including the old `type`) are 400. DELETE only for a pack never sold. |

`PackRow` (`GET /v1/packs`) gains `gymSharePercent` and `gymShareAmount`: what the gym keeps, derived and never stored.

### Gym directory (V8, 3 Oct 2026)

`PATCH /v1/trainers/me` accepts `gymPlace: {placeId, name, address?, city?, lat?, lng?, mapLink?} | null` — the gym picked from the web's place search (the web's server reads Places; this backend never calls out). `placeId` (≤300) and `name` (≤120) are required; `lat` and `lng` come together, within ±90 / ±180; `mapLink` must be http(s). Setting it adds the place to the shared directory (or reuses the row with that `placeId`; blanks are filled, nothing is overwritten), links the profile, and snapshots `gymName = name`. `null` clears the link **and** `gymName`. `gymName` alone stays free text and **unlinks**; sending both is 400 `VALIDATION`. A gym needs `gym_floor` among `trainingModes`, else 400 `GYM_NEEDS_FLOOR` (was a bare `VALIDATION`). Arrangements and payouts recorded earlier under the same typed name join the place when it is picked.

`GET /v1/trainers/me` and `GET /v1/me` return `gymPlace: {id, placeId, name, address, city, mapLink} | null`. Arrangement and payout rows carry `gymPlaceId`. Settlement keys on the place when there is one, else on the case-insensitive name, so a rename cannot split one gym's balance. Support reads `gym_place_stats` with `scripts/gym-stats.sh` — trainers and active clients per gym, counts only.

New error codes: `PACK_NAME_TAKEN` · `PACK_SOLD` · `GYM_PACK_NEEDS_GYM` · `PACK_OWNER_IMMUTABLE` · `ARRANGEMENT_NEEDS_GYM` · `ARRANGEMENT_OVERLAP` · `ARRANGEMENT_STARTED` · `ARRANGEMENT_REQUIRED`.

## Log session v1.1 (3 Oct 2026)

**The log IS the scheduled session** (R2/R40): one id throughout, `/v1/sessions/{id}`. Starting stamps `started_at` and lays the session's workout down as `session_exercise` rows and **planned** `set_log` rows with their targets *copied* (editing the plan later never rewrites a past target). Every quantity — load, effort, rpe, e1RM, volume, targets — is a **JSON number** in the set's own kind (kg for `weight`, % for `percent_1rm`, reps, seconds, metres); `tempo` stays text. Seven load kinds × seven effort kinds: `percent_1rm · level · weight · weight_range · bodyweight · rpe_level · rpe_weight` × `reps · rep_interval · time · distance · max_reps · max_time · max_distance`. STANDARD tier (a set tap is one small request; the console is one read). Implemented in `core/sessionlog` (controller → services → three `*JdbcRepository`s).

| Route | What it does |
| --- | --- |
| `GET /v1/sessions/pick` | `{open, booked, everybody}`. **open** = started and not ended, any age, each `{sessionId, clientId, clientName, scheduledAt, startedAt, workoutName, setsDone, volumeKg}` — `setsDone` and `volumeKg` are the log read's own `totals` figures, from one grouped query, so "Carry on · 4 sets in · 1,200 kg" needs no second request · **booked** = today (workspace zone), still `scheduled`, not started · **everybody** = active clients with `nextWorkoutName` (the rule booking uses) and `lastDoneAt`. One composite read, no cursor. |
| `GET /v1/sessions/{id}/log` | `{session (Schedule row), client {id,name,hasPinnedNote}, program {id,name,weeks}\|null, exercises[], totals}`. Before start `exercises` is the **plan preview**: same entries, `id` null (also on its sets). Each exercise: `id` (= session_exercise.id, the key of every write), `exerciseId`, `name`, `equipment`, `position`, `section`, `groupId` (from the plan row), `source` `planned\|added`, `plannedFrom`, `swappedFrom`, `swappedFromName` (the original movement's name, `null` when never swapped — also on the entry every exercise write answers with), `swapReason`, `removedAt` (removed ones are included so Undo can be offered), `notes`, `sets[]`, `alternatives[]` (the plan's own swaps), `last`, `best`. |
| `POST /v1/sessions/{id}/start` `{startedAt?}` | Opens the log and lays the plan down. **Idempotent** (row locked, stamp is `UPDATE … WHERE started_at IS NULL`): an open log is returned unchanged. `startedAt` back-dates, never into the future. Answers the full log. |
| `POST /v1/sessions/walk-in` `{id?, clientId, durationMinutes?, workoutId?}` | Book now and start in one write. `scheduled_at` is the server's clock cut to the minute (never sent); workout = the next one of the client's active program unless `workoutId`. **201**, or **200** for a replayed `id` (no second booking, no second plan). Booking rules are `SessionBookingService`'s. Answers the full log. |
| `PATCH /v1/sessions/{id}/sets/{setId}` | The hot path. Body is a map; a key's presence is the contract. `{done:true}` = as prescribed (actuals copied from the targets); `{done:true, loadValue, effortValue, rpe}` = what happened (any value not sent is copied from the target); `{loadValue}` on a **done** set = correction, `done_at` unchanged; `{done:false}` = skip / un-log (actuals cleared, row stays). `done_at` is stamped on the first done only, so a retried tap is harmless. **`notes`** (≤ 200 characters, trimmed; empty or `null` clears) may be sent alone or with any of the above: a notes-only PATCH says something *about* the set and changes neither its values nor whether it is done (so it is **not** the "values on a not-done set need `done:true`" 400), and skipping a set keeps its note. Answers `{set, totals, isBest}`. |
| `POST /v1/sessions/{id}/exercises/{sxId}/sets` `{id?, loadValue, effortValue, rpe, done?, loadKind?, effortKind?, notes?}` | An extra set (`planned: false`, no targets) at the next position; kinds default to the exercise's last set. **201** `{set, totals}`, **200** for a replayed id. An extra set only exists as a logged one (the schema's `set_log_done`), so `done:false` is a 400 and no value is a 422. `notes` (≤ 200) is stored with it. |
| `DELETE /v1/sessions/{id}/sets/{setId}` | Only an **extra** set. Answers `{totals}`. A planned set is skipped, never deleted. |
| `POST /v1/sessions/{id}/exercises` `{id?, exerciseId, position?, sets?}` | Add a movement (`source: added`). `position` inserts and moves later ones (default: append); `sets` lays down that many **empty planned** rows (0–50), kinds from the exercise's log type (`reps` → bodyweight × reps, else weight × reps). **201** the exercise entry, **200** on a replayed id. |
| `PATCH /v1/sessions/{id}/exercises/{sxId}` | Any of `removed` (hides it, its sets stay and leave the totals) · `notes` (≤ 500, null clears) · `restSeconds` (0–3600; the sets still to do) · `onPlan:true` (only with `restSeconds`: also rewrites the client's plan rest and bumps `program.revised_at`). Answers the exercise entry. |
| `POST /v1/sessions/{id}/exercises/{sxId}/swap` `{toExerciseId, planRowId?, reason?, scope?}` | `reason` `unavailable\|difficulty`, `scope` `today` (default) `\|program`. The original is kept in `swappedFrom` across swaps; swapping back to it clears the swap. With a `planRowId` (one of the plan's alternatives) the sets still to do are replaced by its targets and done sets are untouched; with a library pick the old targets stay. `scope: program` also changes the client's plan from the next session on and bumps `program.revised_at` **in the same transaction** (a builder tab then gets `412 PROGRAM_REVISED`). |
| `POST /v1/sessions/{id}/end` `{endedAt?}` | Close the log. **Idempotent** (an ended log keeps its time), answers the Schedule row. Does not mark the session done or charge the pack. `endedAt` ≥ `started_at`, never in the future. |

**`last`, `best` and `isBest`.** `last` is the client's most recent *completed* session containing the exercise (`{date, sets[]}`, date in the workspace zone). `best` is their top set over completed sessions in the same load/effort kinds the session is logging that exercise in (`{date, loadValue, effortValue, loadKind, effortKind, e1rm}`; `e1rm` only for weight × reps). Both come from **one** query for every exercise (`idx_session_exercise_history`). A set ranks by Epley, `load × (1 + reps / 30)`, for weight × reps and by its own value (effort, else load) for every other kind — defined once, in `LogSql.score`. `isBest` on a set write is true when that set is done and strictly beats the client's other done sets for the exercise in the same kinds (completed sessions and this session's earlier sets); with nothing to beat it is false, so a first-ever set is not a PR flash.

**`totals`** `{setsDone, setsPlanned, volumeKg}` — one aggregate over the session's non-removed exercises; `volumeKg` is done weight × reps sets only, the same figure as `log.volumeKg` on the Schedule row.

**Errors.** `404` — not your session / set / exercise, or a library exercise you can't use · `409 SESSION_NOT_STARTED` · `409 SESSION_CANCELLED` · `409 SESSION_NO_SHOW` · `409 CLIENT_NOT_BOOKABLE` (walk-in: paused, archived or removed) · `409 SESSION_CLIENT_TIME_TAKEN` · `409 ID_CONFLICT` (a client-minted id that is someone else's) · `409 SET_PLANNED` (DELETE on a planned set) · `409 SET_LIMIT` (50 sets on one exercise) · `409 EXERCISE_REMOVED` (a write to a removed exercise — restore it first) · `422 SET_NEEDS_VALUE` (`done:true` with nothing prescribed to copy, or an extra set with no value) · `400 VALIDATION` — rpe not 1–10 in half steps, a value outside the set's range (load 0–2000, effort 0–86400), a load on a bodyweight set, a key that is not a field, a string where a number belongs, set notes over 200, exercise notes over 500, rest outside 0–3600, swapping to the same exercise, a bad `reason` / `scope` / `planRowId`, `scope: program` or `onPlan` on an exercise that is not from the client's own program, an `endedAt` / `startedAt` in the future or before the start, values on a not-done set without `done:true`, `done:false` on an extra set.

### Also changed for the console (3 Oct 2026, additive)

- **`GET /v1/clients/{clientId}/set-history`** (core/progress — documented here because the console's history column and its "Repeat 3 Oct · Push A" offer read it) gains **`sessions`**: a map keyed by session id holding `{workoutName}` (`null` for a session with no workout), for the sessions that appear on *this page* only — the same idiom as `exercises`, so a 5,000-set page does not repeat a name 5,000 times. Appended last: `{exercises, items, nextCursor, sessions}`; every existing field and the item shape are unchanged. The name is joined in the same query (`scheduled_session.workout_id → workout.name`).
- **`GET /v1/clients/{clientId}/set-history`** rows also carry **`setId`** (the `set_log.id`, additive, 3 Oct) — a row used to have no id the web could write to, so the exercise-history page's *Correct a set* sent a synthesised key and got 400. A past set is corrected with `PATCH /v1/sessions/{sessionId}/sets/{setId}` using the row's `sessionId` and `setId`.
- **Marking a session done is allowed once its log has been opened, whatever the clock says.** `POST /v1/sessions/{id}/done` and the batch `POST /v1/sessions/done` (one shared rule, `SessionWriteService.markOne`) used to refuse any session whose scheduled start had not come (`409 SESSION_NOT_STARTED`, *"This session's start time hasn't come yet."*). A session with `started_at` set is now treated as started: a trainer who starts early can finish. The same 409 (batch: `skipped` / `SESSION_NOT_STARTED`) still answers a session that has **not** been started and whose time has not come, so a planned future session cannot be marked done by accident. Marking it done also closes the open log (`ended_at`) and charges the pack exactly as before. The no-show rules are unchanged (a session whose log was opened can't be a no-show).

## Settings v1.1 — account & sign-in (3 Oct 2026)

Contract: `release/api-contract-v1.1.html`, Settings (A9–A10). `core/trainer/StepUp*`, `AccountController`, `AccountDeleteController`; `core/auth/Sessions*`. **TRAINER-only** except the sessions routes (any signed-in role). AUTH tier for `/v1/auth/**` and `/v1/trainers/me/phone/*` (each spends or settles an OTP); `DELETE /v1/trainers/me` is STANDARD.

### Step-up — one proof for the two dangerous acts

| Route | What it does |
| --- | --- |
| `POST /v1/auth/step-up` `{purpose}` → `204` | A code to the **current** number. `purpose` is `phone_change` or `account_deletion`; anything else is 400 `VALIDATION`. The OTP service's waits, ceiling and lock apply unchanged (`OTP_THROTTLED` · `OTP_LOCKED` as at sign-in). |
| `POST /v1/auth/step-up/verify` `{purpose, otp}` → `{ticket, expiresAt}` | The code back. `expiresAt` is epoch ms, ten minutes out. A wrong code is `422 OTP_WRONG` (with `attemptsLeft`) / `OTP_EXPIRED` / `OTP_LOCKED`. |

**The ticket** is a signed JWT (`role: step_up`) carrying the trainer id, the `purpose`, the number that was proved, and a binding to **the session it was earned on** (SHA-256 of the token; `-` for a JWT caller). It travels in the body of `phone/request` · `phone/confirm` or in the **`X-Step-Up-Ticket`** header of `DELETE /v1/trainers/me` — never as `Authorization`, and a `step_up` role is not `ROLE_TRAINER`, so presenting it as a bearer authenticates nothing. **Single use is by state change, not by a table:** the number it proved stops being the account's number (phone change) or the account stops existing (deletion), and `require` re-reads the live number, so the ticket dies with the thing it was about. Stateless, so there is nothing to sweep or to leak.

| Code | Status | Means |
| --- | --- | --- |
| `STEP_UP_REQUIRED` | 403 | no ticket, malformed or forged, wrong purpose, wrong trainer, or earned on a different browser session. The client starts the step-up. |
| `TICKET_EXPIRED` | 401 | it was right and has aged out (10 min) or been spent (the number it proved is no longer the account's). The client restarts the step-up with a fresh code. |

### Changing the number — two requests after the step-up

| Route | What it does |
| --- | --- |
| `POST /v1/trainers/me/phone/request` `{ticket, phone}` → `204` | Ticket purpose `phone_change`. `400 PHONE_INVALID` (not an E.164 Indian mobile), `400 PHONE_UNCHANGED`, `409 PHONE_TAKEN` (never says whose; soft-deleted rows count as occupied) — all **before** a code is spent. Then a code to the new number. |
| `POST /v1/trainers/me/phone/confirm` `{ticket, phone, otp}` → `{phone}` | The new number's code. `trainer`/`app_user` swap and **every other web session is ended** (`revoked_reason = 'phone_changed'`) in one transaction; the caller's own session survives, so **no token comes back** — keep the one you have. A trainer's session subject is the trainer id, so a JWT stays valid too (the phone is not signed out by this). |

### Signed-in browsers

| Route | What it does |
| --- | --- |
| `GET /v1/auth/sessions` → `{items: [{id, userAgent, issuedAt, lastSeenAt, current}]}` | Live sessions of the caller, newest activity first; times are epoch ms; exactly one row has `current: true`. Empty for a JWT caller (a JWT is stored nowhere). |
| `DELETE /v1/auth/sessions/{id}` → `204` | End one (`sign_out`). **Idempotent**: an id that is not yours, already ended or never existed is a quiet `204` — nothing to leak, nothing to retry. A non-UUID is 400 `VALIDATION`. |
| `DELETE /v1/auth/sessions/current` → `204` | Sign out this browser (sign-out). |
| `DELETE /v1/auth/sessions?scope=others` → `204` | End every session but this one (`sign_out_all`). Any other `scope`, or none, is 400 `VALIDATION`. |

### Closing the account

`DELETE /v1/trainers/me` → `204`, header **`X-Step-Up-Ticket: <ticket>`** (purpose `account_deletion`), **no body**. Soft delete on `trainer` and `app_user`, **every** session ended (`sign_out_all`), the number **not** released (see *The account* above — unchanged). No ticket → `403 STEP_UP_REQUIRED`. A second call is `404`. **Deprecated transitional path:** with no ticket header and the old body `{confirmPhone}` the typed-number confirmation still works (`400 DELETE_NOT_CONFIRMED` on a mismatch); remove once the web sends the ticket.

### Removed (3 Oct 2026)

`POST /v1/trainers/me/phone/challenge`, `POST /v1/trainers/me/phone/verify`, `GET /v1/auth/session`, `DELETE /v1/auth/session` and `DELETE /v1/auth/session/all` — the web calls none of them. Their replacements are `/v1/auth/step-up[/verify]` and `/v1/auth/sessions`. Still answering, deprecated: the typed-number body on `DELETE /v1/trainers/me`. **Breaking, no shim:** `phone/confirm` answers `{phone}` only — the old `token` field is gone.

## Settings v1.1 — profile, working week & messages
3 Oct 2026 · `core/trainer` + `core/nudge` · the contract's Settings group (api-contract-v1.1). The account half — step-up, phone change, signed-in browsers, delete — is documented under [The account](#the-account).

### What changed on `/v1/trainers/me`
- **`GET`** carries `ETag: "<version>"` and honours `If-None-Match` (`304`). `version` is the later of `trainer.updated_at` and `trainer_business.updated_at`, as epoch ms in a string.
- **`PATCH`** honours `If-Match` when sent (`412 PRECONDITION_FAILED`; absent means "go ahead", because a PATCH sends only what changed) and answers the profile with the new `ETag`.
- **Instants are epoch ms**, not ISO strings: `setupCompletedAt` is now a number. Appended fields: `privacyPolicyVersion`, `privacyAcceptedAt` (both on `app_user`, null until accepted) and `version`.
- **`acceptPrivacyPolicy` and `completeSetup` are no longer PATCH keys.** Sending either is `400 VALIDATION` with an `errors[]` entry `{field, code: "unknown_field"}` — an old caller fails loudly instead of silently not consenting.
- **`headline` > 80 / `bio` > 1200** is `400 PROFILE_TOO_LONG` (was a bean-validation `VALIDATION`).
- **A gym needs the floor.** Naming a `gymName` (or `gymPlace`) with `trainingModes` lacking `gym_floor` is `400 GYM_NEEDS_FLOOR`; a PATCH that only drops `gym_floor` **clears the gym** instead of failing, because the trainer's intent is unambiguous.

### `POST /v1/trainers/me/consent` → `200` profile
Body `{ "policyVersion": "2026-09" }`. Must equal the notice in force (`app.privacy.policy-version`, env `PRIVACY_POLICY_VERSION`), else `400 CONSENT_REQUIRED` — a missing version answers the same. **Idempotent: accepting the version already on file keeps the original `privacyAcceptedAt`**; a *new* version moves both columns together (the `app_user_privacy_pair` check).

### `POST /v1/trainers/me/setup/complete` → `200` profile
No body. Stamps `setupCompletedAt` **once and never un-stamps it**; a second call returns the first instant.

### `PATCH /v1/working-hours` → `200 {items: the whole week}`
Was `PUT`, and before that a push through the sync envelope. Body `{ "days": [{ "weekday": 1–7, "windows": [{ "start": "HH:mm", "end": "HH:mm" }] }] }`. **Replaces only the weekdays listed**, in one transaction: each listed day's rows are soft-deleted and its windows inserted; `windows: []` is a rest day; unlisted days are untouched; the same body twice gives the same week. `400 VALIDATION` (and nothing written) for a weekday outside 1–7, a weekday listed twice, a time that is not `HH:mm`, `start ≥ end`, or two windows on one day that **overlap** (touching — 06:00–11:00 and 11:00–12:00 — is a split shift, not an overlap). The sync push still writes this table for the phone.

### Nudge templates
`GET` / `PUT` / `DELETE /v1/nudge-templates` — see [Nudges](#nudges) above for the v1.1 shape.

### `errors[]` on every `VALIDATION`
Additive: a `400 VALIDATION` body gains `"errors": [{ "field", "code", "message" }]` beside `detail` — one entry per bean-validation failure, per `"field: sentence"` service refusal, and per unreadable body (`code` is `unknown_field` or `invalid`). `detail` is unchanged, so nothing that reads it notices.

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

### `GET /v1/sync/pull?lastPulledAt=…&libraryPulledAt=…`
**Purpose:** everything that changed for this trainer since the cursor.

`lastPulledAt` is epoch ms; omit or pass `0` for a full initial sync. Returns
`{ timestamp, libraryTimestamp, changes: { <table>: { created[], updated[], deleted[] } } }`.

**`libraryPulledAt` is a second, independent cursor, for the shared exercise
library alone** — the `exercises` rows with `is_custom = false`. Optional; store
`libraryTimestamp` from the response and send it back here. Omitting it is
supported and is what older builds do.

It exists because the library is the one collection in this pull that is not the
caller's data. Every other table is scoped by `trainer_id`, so "what changed
since your cursor" and "what of yours changed" are the same question. The library
belongs to nobody: it changes only when `ExerciseSeeder` runs, so a single cursor
over it answers *"has the library been re-imported since you last synced"* —
almost always no — and never the question a device is actually asking, which is
*"do I hold it at all"*. A phone whose cursor is newer than the last import can
therefore be handed a complete workout log and **none of the exercises naming
it**, and every row in the log renders the app's "An exercise not on this phone
yet". Two cursors separate the two questions: send `libraryPulledAt=0` to mean
"I have none of it", and advance it only when the library is applied.

A caller that never sends it is still correct. `exercises` also carries the
exercise behind any row **in this same pull** that names one — a
`program_exercise`, a `workout_exercise` (both sides of a swap), a `set_log` or an
`exercise_favourite`. That clause is bounded by what is already being sent, so a
steady-state pull adds nothing, and it is what makes a log renderable on a device
that never asked for a library cursor.

`GET /v1/client/sync/pull` takes the same second cursor, and carries the same
referential clause over the three tables a client can have — see its own entry
below.

Tables pulled: `clients`, `exercises`, `templates`, `programs`,
`program_exercises`, `scheduled_sessions`, `workout_sessions`, `set_logs`,
`workout_exercises`, `packages`, `payments`, `nudge_logs`, `working_hours`,
`time_blocks`, `packs`, `gym_settlements`, `nudge_rules`, `exercise_favourites`,
`batches`, `weekly_reports`, `teams`, `team_members`.

`teams` and `team_members` are the **only** team data that goes offline, and they
are here because they are the UI chrome: without them the app cannot draw "Iron
House · you are an admin", and both are read on every drawer open. Teammates'
clients, programs, sessions and money are deliberately **not** synced — see
[Team coaching](#team-coaching).

Both are **pull-only**, and a push carrying either is refused per record with
`"code": "TEAM_READ_ONLY"` rather than dropped. Every write to them is a
permission change, and a permission change authored offline is one that gets
replayed at an unknown later time — potentially after the grant was revoked.

`exercises` widened with V26: a custom exercise created by **any active member of
the caller's team** now rides the caller's cursor. It has to — a program copied
from a teammate points at their exercise rows, and a phone without them opens that
program on the gym floor and draws blank lines. Custom exercises are a few
hundred bytes each; teammates' clients are not, and that is the whole line being
drawn. Writing is unchanged: a coach still only ever writes their own. Leaving a
team emits deletions for the exercises that left scope, because those rows did not
change — the caller's relationship to them did.

**Reassignment changes what a device holds, and the pull carries both halves.**
When a client moves between coaches (V26 Phase 2):

- The **new** coach's pull picks up the client, their programs, those programs'
  exercises and the future sessions. The child rows are `updated_at`-stamped by
  the reassignment on purpose — nothing about a program exercise changed except
  who may see it, and sync is a cursor over `updated_at`, so without the stamp
  they would never arrive.
- The **old** coach's pull names the moved `programs`, `program_exercises` and
  `scheduled_sessions` in `deleted`. Those rows stop *matching* their filter
  rather than becoming deleted, so without this they would sit on that phone
  forever — live, editable, and invisible to the server. This fires on the first
  reassignment any team performs.
- The old coach **keeps the client row**, projected with `status: "archived"`.
  Tombstoning it would be the obvious move and is wrong: that device still holds
  their `payment`, `package` and `workout_session` rows for this person — history
  that stays theirs by design — and every one resolves a name through
  `client_id`. `archived` is exactly what this is from their side, so the roster,
  the deck and the diary drop them with no screen having to learn a new concept,
  while the money book keeps working. Safe because both write paths in
  `pushClients` end in `WHERE client.trainer_id = :tid`, so a phone echoing the
  projected row back is a no-op.

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

Tables accepted on push are the pull list **minus** `weekly_reports`, `teams` and
`team_members`.

**`attention_dismissal` (V28) is in neither list, deliberately.** It is
online-only REST — see [Attention dismissals](#attention-dismissals) — for V26's
reason about the team tables: a silence authored on a phone with no signal is one
replayed at an unknown later time, against a queue whose whole value is that the
trainer trusts what it is showing them right now.

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

### `GET /v1/client/sync/pull?clientId=…&lastPulledAt=…&libraryPulledAt=…`
**Purpose:** the client's own slice of the data — scoped by a SQL wall, not by
trust in the parameter.

Tables: `clients`, `coaches`, `exercises`, `templates`, `programs`,
`program_exercises`, `scheduled_sessions`, `workout_sessions`,
`workout_exercises`, `set_logs`, `packages`, `payments`,
`weekly_reports`.

`libraryPulledAt` is the shared exercise library's own cursor, exactly as on
[`/v1/sync/pull`](#get-v1syncpulllastpulledatlibrarypulledat) and for the same
reason. Optional; store `libraryTimestamp` from the response and send it back.
A caller that omits it is still correct: `exercises` also carries the exercise
behind any row **in this same pull** that names one — a `program_exercise`, a
`workout_exercise` (both sides of a swap) or a `set_log`. Three sources, not the
trainer pull's five: a client has no `exercise_favourite` rows, and no custom
exercises of their own.

### `POST /v1/client/sync/push?clientId=…` → `204`
**Purpose:** apply what the client logged on their own phone.

Only three tables are accepted — `workout_sessions`, `workout_exercises`,
`set_logs` — plus session confirmations. (`body_metrics` left both sync
directions with its table in V22; a push still carrying it is dropped and
logged.) Anything else in the
envelope is dropped and logged as "not a client's to write". A client can record
what they did; they cannot edit the program, the roster, or the money.

---

## Client portal — `/v1/me`

`portal/PortalController.java` — module 11a, **reads**. The web's `/me/*` pages:
the client's own view of their coaching. **`ROLE_CLIENT` only**; the token's
subject is the phone. Until this, a client's whole API was `/v1/client/sync/*`,
the offline phone's protocol. Timestamps are **epoch ms**, except the assessment
routes, which are **ISO** like the trainer's side.

**Which roster.** One phone can be a client of two trainers (two `client` rows,
possibly in two workspaces). Every route takes an optional **`?clientId=`**, which
the web appends from its roster cookie when there is more than one. Resolution
(`PortalScope`): no live row for the phone → **`403 NOT_A_CLIENT`**; a `clientId`
that is not one of the phone's rows → **`403 NOT_YOURS`**; no `clientId` → the
single row, or else the most recently **accepted** (then newest, then id — a total
order). A row is live when it and its trainer are not deleted and its membership
is not `declined` — the same set the tier-4 policies admit. Not-yours on an `{id}`
route is **`404 NOT_FOUND`**, so it cannot confirm somebody else's row exists.

**Nothing of the trainer's side of the arrangement is on this wire.** Every read
is projected field by field: no `collected_by`, gym share or UPI reference on a
payment, no pack charge on a session, no split percentages on the client.

| Route | Returns |
| --- | --- |
| `GET /v1/me` | `{ client: {id, name, phone, goal, membershipStatus, deliveryMode, sessionsPerWeek, sessionDurationMinutes, weeklySchedule, startedAt, health}, trainer: {id, name, phone, gymName, headline, mapLink}, rosters: [{clientId, clientName, trainerName}], prefs }`. `trainer` is **the resolved roster's**; `trainer.phone` is exposed on purpose (the portal's WhatsApp links). `startedAt` is `accepted_at`, else `created_at`. `health` is `client.metadata.health` or `""`; the client corrects it with `PATCH /v1/me` (11e). **`prefs`** is the stored `client_prefs` row (11d), or the defaults when there is none: `hideWeight: false`, every `notify` switch on, `nominee: null`. |
| `GET /v1/me/sessions?from&to` | `[{ id, scheduledAt, durationMinutes, status, dayLabel, templateDay, deliveryMode, location, workoutId }]`, **half-open** `[from, to)` in epoch ms (a missing bound is unbounded), oldest first. `location` is `trainer.gym_name`, or null for a remote session; `workoutId` is the log started from it. |
| `GET /v1/me/program` | The live plan — the newest `active` one — as `Program`, or a JSON **`null`** (200) when none. |
| `GET /v1/me/programs` | Every **non-active** plan, newest first: `{ id, name, goal, startDate, endDate, weeks, status, trainingDays, dayCount, exerciseCount, workoutCount }`. `workoutCount` is the workouts logged on it, **or null when there is no record to count from** (no workouts at all, or the block ended before the oldest one) — never a guessed 0. No adherence figure, by rule. |
| `GET /v1/me/programs/{id}` | One plan, live or finished; `404 "That plan is not here."` |
| `GET /v1/me/workouts?limit` | Newest first: `{ id, sessionDate, startedAt, endedAt, setCount, volumeKg, exerciseCount, effort }`. `volumeKg` is Σ load × reps, rounded; `exerciseCount` counts movements with a set; `effort` is the client's feedback on it (11b), or null. |
| `GET /v1/me/workouts/{id}` | `{ id, sessionDate, startedAt, endedAt, dayLabel, programName, deliveryMode, scheduledAt, notes, feedback: {effort, note, at} | null, exercises: [{ exercise, targetSets, targetReps, targetLoad, restSeconds, swappedFromExerciseId, alternative, sets: [{id, setNumber, loadKg, reps, rpe}], lastTime }] }`. Movements are the live `workout_exercise` cards in order, plus any movement with sets and no card (a log from before cards existed). `cue`, `targetLoad` and `alternative` come from the plan's row for that movement (on the session's day where known). `lastTime` is the previous workout's sets for it and the all-time best load and reps, or null. `404 "No such workout."` |
| `GET /v1/me/sets` | Every set the client has logged, oldest first — **unwindowed**, because a personal best is a claim about all of it: `[{ exerciseId, setNumber, loadKg, reps, sessionDate, createdAt }]`. |
| `GET /v1/me/exercises?ids=` | `Exercise[]` for the given ids, **narrowed to movements in this client's own set logs** so the route cannot be walked to list the library; unknown ids are dropped, no ids is `[]`. |
| `GET /v1/me/metrics` | Every body reading, oldest first: `[{ id, metricType, value, unit, recordedAt }]` — **out of the client's returned assessments** since V22, the same six ids and the same shape rules as `GET /v1/clients/{id}/body-metrics` (`id` is the assessment's). |
| `GET /v1/me/packages` | Newest first: `{ id, name, type, sessionsTotal, sessionsRemaining, amount, amountPaid, amountDue, status, startDate, endDate, pausedAt }`. `name` is the pack's, else *Session pack*; `amountDue = amount − collected − written off`, floored at 0. `pausedAt` is added beyond the mock — a paused pack reading as live is a small lie. |
| `GET /v1/me/payments` | Newest first: `{ id, amount, method, status, paidAt, createdAt }` — nothing else. |
| `GET /v1/me/messages` | Newest first, two sources: `client_message` rows (`{id, body, kind, at, readAt, trainerName}`) and the trainer's notes about this client marked **`sharedWithClient`** (`kind: note`, `at` = last edit, `readAt` always null). A private note never appears. |
| `GET /v1/me/milestones` | Newest first: `{ id, kind, label, value, at }`. Never windowed. |
| `GET /v1/me/assessments` | **Sent** ones only, newest due first: `{ id, name, dueAt, sentAt, completedAt, status, measurements: {got, asked}, questions: {got, asked} }` (ISO). `status` is the client's three — `done`, else `late` once due (still answerable), else `open`. An open one whose template is gone is dropped. |
| `GET /v1/me/assessments/{id}` | The row plus `{ description, asked: {measurements, questions}, readings, answers }`. **What is asked comes from the live template**, with no bank fallback. Unsent or not theirs → `404 "No such assessment."` |

### Logging a workout — module 11b

The log is the **same** `workout_session` / `workout_exercise` / `set_log` rows the
trainer's console and the phone write, so a session the trainer opened and one the
client opened are one log. Every insert carries the resolved client row's
`tenant_id` (a client on two rosters writes into the right book). Each returns the
`Workout` read above unless stated.

| Route | Behaviour |
| --- | --- |
| `POST /v1/me/workouts` `{ sessionId? }` | **Resume before create**: an open log for this session — or, with none, an open no-session log dated today — answers **200** as it stands, whoever opened it. Otherwise **201** with a new log (`logged_by: client`) against the live plan, seeded with the plan's rows for **the session's slot** (mapped to the copy's weekday through `program.schedule`), or for today's weekday with no session. Not the client's session → `404`; a cancelled one → `409 SESSION_CANCELLED`. |
| `POST /v1/me/workouts/{id}/sets` `{ exerciseId, setNumber, loadKg, reps }` | **Upsert on (workout, movement, set number)** — 201 when new, 200 when the same set number is saved again, so a double tap cannot make two sets. Returns `{ id, setNumber, loadKg, reps, rpe }`. The movement must be a **live card in this log** (`400 VALIDATION exerciseId: not in this workout` — the mock accepted any library movement); `setNumber` 1–50, `loadKg` 0–1000, `reps` 0–1000; a finished log → `409 WORKOUT_CLOSED`. |
| `POST /v1/me/workouts/{id}/swap` `{ exerciseId, toExerciseId }` | Only to the plan row's **approved alternative** (`422 NOT_APPROVED` otherwise) and only **before any set** of it is logged (`409 ALREADY_STARTED`). The card keeps its target sets, takes the plan's reps and records `swappedFromExerciseId`. A movement not in the log → `404`; one already in it → `409 ALREADY_IN_WORKOUT`. |
| `POST /v1/me/workouts/{id}/finish` `{ effort?, note? }` | **Idempotent** — only the first call closes the log (`endedAt`); every call upserts the feedback it carries into `workout_feedback` (`effort` `easy` · `right` · `hard`, else `400`). **It marks no session and charges no pack** (product decision, 23 Sep 2026): the booked session stays `scheduled` for the trainer, and shows as unmarked on Today. On the call that closes it, **every 25th finished workout mints a milestone** — "25th session with {trainer's first name}" — and a retry cannot mint it twice. |

### What the client writes about themselves — module 11c

| Route | Behaviour |
| --- | --- |
| `POST /v1/me/assessments/{id}/answers` | One answer per call: `{ kind: 'measurement', key, value?, clear? }` or `{ kind: 'question', questionId, yes? \| rating? \| text? \| optionIds?, clear? }`. Returns the assessment (as `GET …/{id}`). **The replacement is validated in full before the old answer is removed**, so a refused save leaves what the client already gave. The key or question must be one the **live template** asks (`400 VALIDATION`); a measurement is a finite number > 0; a question is checked by kind — `yesno` a boolean, `rating` a whole number 1–scale (default 10), `text` non-empty, `choice` at least one known option id, or its own text **only when `allowCustom`**, and a single-answer choice keeps the first id. Fields that do not belong to the kind are stored null. `clear: true` withdraws the answer. Readings and answers are kept in the template's order. Unsent or not theirs → `404`; already sent back → `409 CLOSED`; an unknown `kind` → `400`. |
| `POST /v1/me/assessments/{id}/submit` | Send it back: `completedAt` now, `readAt` cleared so the trainer sees it **unread**. **A partial submission is allowed**; nothing answered at all → `400 EMPTY`; already sent → `409 CLOSED`. It does **not** ring the trainer's bell — returned assessments are read on the assessments list. |
| ~~`POST /v1/me/metrics`~~ | **Removed in V22** (`405`). The weigh-in was a loose reading, and a body is now measured in an assessment and nowhere else. |

### The client's settings and bell — module 11d

`client_prefs` is **the one table the trainer's half never reads** (no staff
policy at all). The client's bell holds facts the trainer's actions produced.

| Route | Behaviour |
| --- | --- |
| `PATCH /v1/me/prefs` | `{ hideWeight?, notify?: Partial<{programUpdated, sessionReminder, trainerNote, personalBest, packChanged}>, nominee?: {name, phone} \| null }` → the full `prefs`. The row is **created on the first write** with the all-on defaults; `notify` is **merged**, not replaced; `nominee: null` clears it, an absent key leaves it. A nominee needs a trimmed `name` (`400 VALIDATION nominee.name: required`, clipped to 80) and a **10-digit** number (formatting and a `+91` prefix are stripped; else `400`). `hideWeight` is a display switch — nothing refuses a write because of it. The nominee is a third person's data (DPDP §14): stored as specified, dropped with the prefs when the client leaves, and never contacted by the product. |
| `GET /v1/me/notifications` | The last **21 days**, newest first: `[{ id, kind, amount, subjectAt, text, at, readAt }]` — `kind` `note` · `plan` · `session` · `pack` · `best`; no `clientId`; no `?unread` filter. Rows are facts; the portal writes the sentence and drops a kind it does not know. |
| `POST /v1/me/notifications/{id}/read` | `{ id, readAt }` — idempotent, never un-reads; not theirs → `404`. |
| `POST /v1/me/notifications/read` | Marks every unread row in one request → `{ readAt }`. |

**What rings the client's bell** — trainer writes, each gated **at the moment of
sending** by the matching switch (a switched-off kind writes no row, so switching
it back on refills nothing), through `mint_client_notification()`:

| Trainer write | `kind` · `text` · other fields | Switch |
| --- | --- | --- |
| `POST /v1/sessions` (a future session) | `session` · `booked` · `subjectAt` = the slot | `sessionReminder` |
| a booking run by the diary (a sale, a renewal, `apply`, a new standing week) | `session` · `booked` — **one** row naming the **first** session booked | `sessionReminder` |
| `PUT /v1/sessions/{id}` moving it / cancelling it | `session` · `moved` (new slot) / `cancelled` | `sessionReminder` |
| `DELETE /v1/sessions/{id}` (a future, scheduled one) | `session` · `cancelled` | `sessionReminder` |
| `POST /v1/clients/{id}/packages` / `POST /v1/packages/{id}/renew` | `pack` · `sold` / `renewed` · `amount` | `packChanged` |
| a payment recorded as collected, or confirmed | `pack` · the method · `amount` | `packChanged` |
| `POST /v1/templates/{id}/apply` | `plan` · the plan's name · `subjectAt == at` (a **new** plan) | `programUpdated` |
| `PUT /v1/programs/{id}` changing name, goal or dates; `POST /v1/programs/{id}/notify` | `plan` · the name · `subjectAt` = the plan's creation (**changed**) | `programUpdated` |
| the portal's `/finish` minting a milestone | `best` · the milestone's label | `personalBest` |

Notes, a pending payment, a status marked after the fact and a row edit on
`PUT …/exercises` ring nothing. The phone's sync push rings nothing either — only
these REST writes do.

### The client's account — module 11e

| Route | Behaviour |
| --- | --- |
| `POST /v1/me/phone/challenge` → `204` | A code to the **current** number (the OTP service's waits, ceiling and lock apply unchanged). |
| `POST /v1/me/phone/verify` `{ otp }` | That code back → `{ ticket }`, a ten-minute signed proof bound to this roster row and this number. A wrong code is the OTP service's own `422 OTP_WRONG` / `OTP_EXPIRED` / `OTP_LOCKED`. |
| `POST /v1/me/phone/request` `{ ticket, phone }` → `204` | Checked **before** an SMS is spent: a 10-digit mobile (`400 VALIDATION`), a real move (`400 PHONE_UNCHANGED`), and nobody on InclineYou holding it — a trainer, an identity row, or any live roster in any workspace (`409 PHONE_TAKEN`, never saying whose). Then a code to the new number. A missing, forged or stale ticket → `401 PHONE_CHANGE_UNPROVEN`. |
| `POST /v1/me/phone/confirm` `{ ticket, phone, otp }` | The new number's code; the number moves on **every client row that carries it** (every roster, every workspace, a declined one included) and on the identity row, in one transaction → `{ phone, token }`. **Store the token**: the old credential's phone no longer resolves (`NOT_A_CLIENT`). |
| `PATCH /v1/me` `{ health }` | Corrects `health` (`client.metadata.health`, ≤ 2,000) → `{ id, phone, health }`. **A `phone` is refused** (`400`) — a number moves only through the two-code ladder above. `health` is health data under the product's standing rule, accepted by the product owner's recorded decision (23 Sep 2026: include it now, strip health collection later if required). |
| `GET /v1/me/export` | One JSON document: `{ exportedAt, client, trainer, sessions, workouts, sets, measurements, packages, payments, messagesFromTrainer, feedback, milestones, assessments, settings }`. **Field-listed throughout** — the client row without the trainer's or team's arrangement (split and margin percentages, assignment, staleness), payments as `{id, packageId, amount, method, status, upiReference, paidAt, note, createdAt}` without the gym's side. The trainer's **private** notes are not in it; shared notes are, as messages. `settings` is the prefs row, or null. |
| `DELETE /v1/me` `{ confirmation }` → `204` | **Leaving this trainer — a membership exit, not an erasure** (product decision, 23 Sep 2026). The typed number is re-checked on its last ten digits (`400 DELETE_NOT_CONFIRMED`). Soft-deleted: this roster's `client` row, its prefs (the **nominee erased**), its bell, its assessments, its workout feedback, and its **future** bookings. **Kept as the trainer's records:** payments, packages, logged workouts, past sessions and the trainer's notes. Other rosters on the same number are untouched. A DPDP erasure is separate, policy-first work. |

`Program` is `{ id, name, goal, startDate, endDate, weeks, status, week, dayLabels,
trainingDays, days: [{ templateDay, label, exercises: [{ exercise, sets, reps,
targetLoad, restSeconds }] }] }`. **Its days are keyed by the client's day SLOTS**,
not by weekday: a client's copy stores weekdays (V2's translation at apply) while
sessions carry the template's ordinal `templateDay`, so each weekday is mapped
back through `program.schedule` — and `days[].templateDay`, `trainingDays` and the
keys of `dayLabels` agree with the sessions. A plan written from scratch has no
schedule and keeps weekdays. A multi-week plan shows one week: `week` (weeks since
start, clamped) on a live plan, week 1 on a finished one. `Exercise` is `{ id,
name, muscleGroup, equipment, logType, cue, formCues, steps }` — `cue` is the
plan's note, `steps` the library description, `formCues` `[]` until authored; no
clip, by product decision.

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

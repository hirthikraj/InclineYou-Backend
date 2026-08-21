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
| [Team coaching](#team-coaching) | `/v1/team` | 29 |
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

**Total: 92 endpoints.**

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
| `PHONE_ON_YOUR_ROSTER` | 409 | That number is already on the caller's own roster. |
| `PHONE_IS_CLIENT` | 409 | Invited as a coach, but the number is somebody's client. |
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

## Team coaching

`team/TeamController.java` — a senior trainer running a team of trainers. Full
design in `agent/XRep_team_coaching_prd.md`. **All three phases are built**:
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
invite to a number with no XRep account has a `phone` and a null `name`, because
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
merely an internal permission grant.

Refusals come from `team/TeamPhoneGuard.java`: `PHONE_IS_CLIENT`,
`PHONE_ALREADY_IN_TEAM`, `PHONE_ALREADY_INVITED`, `PHONE_IS_SELF`. Like
`ClientPhoneGuard`, **the message never names the other team** — "already coaching
at Iron House" would hand any gym owner with a phone book a way to enumerate a
competitor's staff one number at a time.

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
about this client and collide with that index on arrival.

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

`body_metrics` follows the same widened scope, so a measurement series survives a
handover on both phones.

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

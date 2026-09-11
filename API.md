# XRep Backend — API Reference

Every HTTP endpoint the Spring Boot backend exposes, what it is for, and what it
expects. Generated from the controllers under
`backend/src/main/java/com/xrep/xrep_backend/`.

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
| [Sessions (web sign-in)](#sessions-web-sign-in) | `/v1/auth/session` | 3 | V41
| [Workspaces](#workspaces) | `/v1/tenants` | 8 | V37–V42
| [Trainer profile](#trainer-profile) | `/v1/trainers` | 2 | Reviewed
| [The account](#the-account) | `/v1/trainers/me/phone`, `/v1/trainers/me` | 5 | V36
| [Working hours](#working-hours) | `/v1/working-hours` | 1 |
| [Team coaching](#team-coaching) | `/v1/team` | 29 |
| [Clients](#clients) | `/v1/clients` | 11 |
| [Progress](#progress) | `/v1/clients/{clientId}/progress` | 1 |
| [Exercises](#exercises) | `/v1/exercises` | 3 |
| [Templates](#templates) | `/v1/templates` | 8 |
| [Programs](#programs) | `/v1/programs` | 10 |
| [Scheduled sessions (diary)](#scheduled-sessions-diary) | `/v1/sessions` | 6 |
| [Workout sessions & set logs](#workout-sessions--set-logs) | `/v1/workouts` | 13 |
| [Packs (the price list)](#packs-the-price-list) | `/v1/packs` | 3 |
| [Packages & payments (money book)](#packages--payments-money-book) | `/v1/clients/{id}/packages`, `/v1/packages`, `/v1/payments` | 12 |
| [Nudges](#nudges) | `/v1/clients/{clientId}/nudge`, `/v1/nudges`, `/v1/nudge-templates` | 6 |
| [Attention dismissals](#attention-dismissals) | `/v1/attention/dismissals` | 3 |
| [Reports](#reports) | `/v1/clients/{clientId}/report` | 2 |
| [Push devices](#push-devices) | `/v1/devices` | 2 |
| [Trainer sync](#trainer-sync) | `/v1/sync` | 2 |
| [Client sync](#client-sync) | `/v1/client/sync` | 2 |

**Total: 129 endpoints.**

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

**Two kinds of credential, one interface.** `AuthTokenService` picks; nothing
below it can tell which answered.

| | Phone | Web |
| --- | --- | --- |
| Credential | a signed **JWT**, 7 days | an opaque **session token**, 72 hours |
| Chosen by | no header, or anything but `web` | `X-XRep-Client: web` |
| Works offline | yes — that is the whole reason | no, and does not need to |
| Revocable | **no**; it expires on its own clock | **yes**, immediately |
| Switching workspace | a new token, because the workspace is a signed claim | an `UPDATE`; the browser keeps the token it has |
| Shape | three dot-separated segments | begins `xs_` |

A session token may travel as `Authorization: Bearer xs_…` **or** in an
`xrep_session` cookie — the cookie so that browser JavaScript never has to hold
it. The row stores a **SHA-256 of the token**, never the token: a database dump
must not be a set of live credentials. SHA-256 rather than bcrypt because this is
256 bits of `SecureRandom` with no structure to guess, so it wants a fast one-way
function, not a KDF on the hot path of every request.

`POST /v1/auth/otp/verify` is unchanged except that the response now carries
`tokenKind` — `jwt` or `session`. Nothing on the server branches on it; the web
needs to know it holds something revocable and the phone needs to know it holds
something that works with no signal.

### `GET /v1/auth/session`

Every live session for this caller. Empty for a JWT caller, and honestly so —
a JWT is stored nowhere and cannot be listed.

```json
[{ "id": "…", "userAgent": "Mozilla/5.0 …", "issuedAt": 1756500000000,
   "lastSeenAt": 1756512000000, "expiresAt": 1756758000000, "current": true }]
```

### `DELETE /v1/auth/session` → `200`

Sign out here. `{ "tokenKind": "session", "revoked": true }` — `revoked` is
**false** for a JWT, which the client should still discard locally. A button that
appears to work is worse than one that says what it did.

### `DELETE /v1/auth/session/all` → `200`

`{ "sessionsEnded": 3 }`. Every browser, now.

---

## Workspaces

**One person belongs to several workspaces.** A trainer coaches privately *and*
at a gym with different clients; one human can be a client under two separate
arrangements. `tenant` is the workspace, `tenant_member` is the many-to-many, and
every row in the product carries an **immutable** `tenant_id` stamped where it
was created.

Two things follow that the client has to understand:

- **`X-XRep-View: focused`** narrows reads to the active workspace. Absent or
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
`instagramUrl`, `youtubeUrl`, `instagramHandle`, `youtubeHandle` — and V36's
`email`.

A null `gymName` means *no gym*, which is not the same as a 0% cut — one hides
the "your share" line entirely, the other claims an arrangement that keeps all
of it.

**The identity block is the part a CLIENT reads** — nothing in XRep branches on
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

Four calls, and **two numbers are proved, not one**.

```
POST /v1/trainers/me/phone/challenge                     → 200, no body
POST /v1/trainers/me/phone/verify    {otp}               → {ticket}
POST /v1/trainers/me/phone/request   {ticket, phone}     → 200, no body
POST /v1/trainers/me/phone/confirm   {ticket, phone, otp}→ {phone, token}
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
| `PHONE_TAKEN` | 409 | somebody already holds it — **it does not say who**, or this endpoint would answer *is this number on XRep* for any number in India |
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

`trainer/WorkingHoursController.java` — the trainer's own week. **Read only.**

Still read only after the web gained a working-week editor on 29 Aug 2026:
`/settings/profile/work` reads this route and **writes through `/v1/sync/push`**,
the one path that has ever written this table. A second write path on a table the
phone also writes offline is how the two halves drift, which is the reason this
controller has no PUT — see the note at the top of `WorkingHoursService`.

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

### `DELETE /v1/clients/{id}` → `204`
**Purpose:** remove a client from the roster. Soft delete — the row is tombstoned
with `deleted_at` so sync can propagate the removal.

### `GET /v1/clients/{id}/body-metrics`
**Purpose:** the measurement history behind the progress charts.

### `POST /v1/clients/{id}/body-metrics` → `201`
**Purpose:** record one measurement.

Body: `metricType`, `value`, `unit`, `notes`, `recordedAt` (epoch ms) — all
required except `notes`.

### `GET /v1/clients/{id}/notes`
**Purpose:** the trainer's own notes on this client, newest first. **V29.**

Returns `[{ id, clientId, body, pinned, createdAt, updatedAt }]`.

**The author is in the predicate, not implied by the client.** A team widens
reads over a teammate's roster (V26) and it must not widen this, for the same
reason no role ever sees a teammate's money book. So a coach holding a client
another coach wrote notes on gets an **empty list**, not a 403 — the notes are
not theirs to know about.

**`pinned` is what the client file's always-visible strip draws.** Everything
else is filed in the notes tab. One flag over one kind of thing rather than two
stores that would drift.

> **This is not a health record and must never become one.**
> `XRep_MVP_interaction_map.md` excludes health data outright under the DPDP Act
> 2023 — "**No medical or health-condition fields anywhere** — no injuries, no
> conditions, no medications" — and `XRep_core_data_model.md` §3.2 pins the note
> as "free text; **no medical fields**". `body` is free text and there is no
> injury field, no condition field and no PAR-Q flag beside it. Do not add one:
> the moment a field tells a medical note apart from any other note, the product
> holds health data whatever the field is called. The sanctioned path is §5 of
> the data model — a separate `health_note` table with its own consent and access
> controls — and it is a different feature, not a wider version of this one.

### `POST /v1/clients/{id}/notes` → `201`
**Purpose:** write a note. **V29.**

Body: `body` (required, non-blank, ≤ 4,000 characters), `pinned` (optional,
defaults `false`).

The cap is about a note staying a note, not about storage — the column is `TEXT`.
It is checked before the write so an over-long note is a `400` with a reason
rather than a silent truncation of something somebody just typed.

### `PUT /v1/clients/{id}/notes/{noteId}`
**Purpose:** edit the text, the pin, or both. **V29.**

Body: `body` and `pinned`, **both optional, and absent means unchanged**. That is
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

Query params: `ids`, `q`, `muscleGroup`, `bodyPart`, `target`, `equipment`,
`level`, `page` (default `0`), `size` (default `20`). Returns
`{ exercises: [...], total }` covering both the seeded global library and this
trainer's own custom exercises.

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

### `GET /v1/exercises/meta`
**Purpose:** the filter vocabulary — `muscleGroups[]`, `equipment[]`, `levels[]` —
so the filter sheet is populated from the data rather than a hardcoded list.

### `POST /v1/exercises` → `201`
**Purpose:** create a custom exercise when the library has no match.

Body: `name` (required), `muscleGroup`, `equipment`, `movementPattern`,
`description`, `imageUrl`, `videoUrl`, `logType`. Comes back with
`isCustom: true` and is visible only to the creating trainer.

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
`weeks`, `trainingDays[]`, `assignedCount` and `activeAssignedCount`.

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
and V31's `tempo`, `altExerciseId`, `groupId` and `setDetail[]`.

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
`endDate`, `status`, `createdAt`, `updatedAt`, `behindTemplate`.

`behindTemplate` compares the program's `updated_at` against the template's. A
copy that differs from its blueprint is the NORMAL state — per-client adjustment
is what the two tables are for — so this is a fact for the trainer to act on,
never an error, and nothing repairs it automatically. `POST
/v1/programs/{id}/resync` is the only thing that does, and only when asked.

### `POST /v1/templates/{id}/apply` → `201`
**Purpose:** the point of templates — instantiate one as a live program for a
client, copying every exercise row across in one transaction.

Body: `clientId` (required), `schedule[]`, plus optional `name`, `goal`,
`startDate`, `endDate` overrides. Returns a `ProgramSummary` for the program that
was created.

`schedule[]` is `{day, weekday, time}` per ordinal slot — the translation from
"Day 2" to "Wednesday at 06:30", which is the client's choice and not the
template's. It must cover **exactly** the template's day slots, one distinct
weekday each, `time` as 24-hour `HH:mm`, or the call is a 400 naming the
mismatch. A plan silently missing a day, or with a day nobody scheduled, is
worse than an error.

**The result is a snapshot.** Nothing reaches back through `program.template_id`
to rewrite it, so editing the blueprint afterwards changes the blueprint and
nothing else.

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

`session/WorkoutSessionController.java` — what *actually happened*. Kept separate
from scheduled sessions because a plan and a log are different records.

### `GET /v1/workouts?clientId=…`
**Purpose:** the workout history, optionally per client.

### `POST /v1/workouts` → `201`
**Purpose:** log a session that happened.

Body: `clientId` (required), `sessionDate` (required, ISO `yyyy-MM-dd`),
`programId`, `scheduledSessionId`, `notes`.

### `GET /v1/workouts/{id}` · `PUT /v1/workouts/{id}`
**Purpose:** read one logged session; `PUT` edits its `notes` and **closes or
reopens the log**.

Body: `notes`, `endedAt` (epoch ms). Both are optional and **both are
conditional** — an absent field is left as it is.

Every workout response carries **`endedAt`** — V13's column, stamped when the
trainer *closed* the log. **Null means the log is still open**, which is the only
thing that makes a scheduled session *in session*.

The column and the sync envelope have carried it since V13; this DTO did not, and
the omission was load-bearing rather than cosmetic. `buildRunning` — on both
halves — looks for a session whose log has not ended, so with the field absent
every log read as permanently open: a session logged on Tuesday still said *In
session* on Sunday, and the *started, nothing logged* state could never fire at
all. Those are the two states a trainer's home screen is most often in.

It is also what makes *Later* honest: finishing the log and closing the money are
different facts, and a trainer who did the first and left the second should not
still be told they are mid-session.

Appended last, like every other additive field.

**`endedAt` on the request has three states**, and the third is why it is a
number rather than a boolean:

| sent | meaning |
| --- | --- |
| absent / null | leave `ended_at` exactly as it is — **the default** |
| `> 0` | close the log at that instant |
| `0` | reopen it |

Absent has to mean *leave it*: every caller written before this field sends
`{notes}` alone, and if absent meant "clear", each of them would silently reopen
a closed log and put the trainer back *In session*. And `0` has to mean
something, because with null already taken, an additive-only API that never adds
a way back has made mis-tapping *Finish the log* permanent. It is the same
"empty clears" rule `deliveryMode` uses on the scheduled-session update, spelled
for a number.

**`notes` became conditional in the same change**, which is a behaviour change
worth stating: it used to be written unconditionally, so a request carrying only
`endedAt` would have set it to `NULL` — closing a log would have *erased the
session's notes*. Nothing clears notes by sending null; a cleared note is an
empty string, which is non-null and still clears.

Before this, `SyncService.pushWorkoutSessions` was the only writer of the column
anywhere, so the online half closed logs by posting whole rows back through the
sync envelope to change one field.

### `GET /v1/workouts/sets?clientId=…&exerciseId=…` · **`STANDARD` tier**
**Purpose:** **every set one client has ever logged**, in one request, optionally
narrowed to one exercise. `clientId` is required; `exerciseId` is not.

`STANDARD` rather than a tier of its own, and that is the point of it: this
endpoint exists to turn ~150 requests into one, so the budget it spends is a
hundred-and-fiftieth of what the shape it replaces spent.

The workout console needs every set this client has done on the movements in
today's grid — *Previous* is per set number against the last session, and the
record test compares today's top set against the heaviest load in the whole
history. Per-session reads make that ~150 requests for a client at three
sessions a week for a year, against a 120/min tier, so the online half read a
40-session **window** and patched the hole with the all-time maximum from
`/progress` — which is `LIMIT 30` exercises and counts only sets that carry a
load. A client with more than thirty movements, or a reps-only exercise logged
more than forty times, could still have an old best outside both.

Deliberately **unbounded**: a window is what produced the wrong answer. The
phone answers the same question with a local `SELECT` over SQLite, and this is
the online half's equivalent of that read.

Rows come back **oldest first**, so a caller folding them into a running best or
a per-set-number *previous* does it in one pass. Ownership is the join, not a
second check — another trainer's client matches no session and so no set, and
comes back empty.

### `GET /v1/workouts/{id}/sets`
**Purpose:** every set logged in this session.

Every set — on both routes — carries **`sessionDate`**, the owning log's date as
ISO `yyyy-MM-dd`. A set's date is the *session's*, never its `created_at`: a
Tuesday session typed up on Thursday is a Tuesday session, and both *Previous*
and the record test order by when the training happened. Redundant on the
per-session read; on the bulk read it is the whole point, because a caller
holding two thousand sets would otherwise need the workout list as well just to
sort them. Appended last.

### `POST /v1/workouts/{id}/sets` → `201`
**Purpose:** log one set — the highest-frequency write in the product.

Body: `exerciseId` (required), `setNumber`, `loadKg`, `reps`, `rpe`, `notes`.
These rows are what `/progress` computes PRs and volume from.

### `PUT /v1/workouts/{id}/sets/{setId}`
**Purpose:** correct a set — load, reps, RPE or notes.

### `DELETE /v1/workouts/{id}/sets/{setId}` → `204`
**Purpose:** delete a mis-entered set.

### `GET /v1/workouts/{id}/exercises` · `POST` → `201` · `PUT .../{rowId}` · `DELETE .../{rowId}` → `204`
**Purpose:** today's card list — V13's `workout_exercise`. What is in the grid,
in what order, what was asked for, and what was swapped or taken out.

The table has been in the sync envelope since V13 and had no route, so the online
half could only *reconstruct* the grid from the program's rows plus every
exercise that happened to have a set logged against it. Three things that
reconstruction cannot represent, all of them things a trainer did on purpose: an
exercise **added** to today that nobody has typed a set into yet; a **swap**,
where the rack was busy so the bench press was not skipped but replaced — and
`swappedFromExerciseId` is what adherence reads, so reconstructed the original
just vanishes and reads as a skip; and **rest** for an off-plan exercise, which
had nowhere to persist.

`POST` body: `exerciseId` (required), `orderIndex`, `source` (`planned` |
`unplanned`; null means `planned`), `swappedFromExerciseId`, `targetSets`,
`targetReps`, `restSeconds`.

`POST` is **idempotent on the pair**. The table's unique index is partial —
`(workout_session_id, exercise_id) WHERE deleted_at IS NULL` — so a second POST
would otherwise be a `500`. Adding an exercise that is already there, including
one just removed, updates the row and **clears `removedAt`**, which is what "add
it back" means to the trainer who clicked it.

`PUT` body: `orderIndex`, `targetSets`, `targetReps`, `restSeconds`, `removedAt`
— the same three-state Long as `endedAt`: absent leaves it, `> 0` takes the card
out of today, `0` puts it back, which is what the toast's Undo needs.

**`removedAt` and `DELETE` are different verbs.** A removed row stays in the list
and is drawn struck through — it is still the record that the trainer decided not
to do this. `DELETE` tombstones with `deleted_at`, which is for a row that should
never have existed, and is soft like every delete here so sync carries it.

An exercise this trainer cannot see — a mistyped id, or another trainer's private
custom — is a `404`, checked before the foreign key, which would answer with a
`500` and would not notice the second case at all.

---

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

### `GET /v1/packages/{packageId}/adjustments`
**Purpose:** everything that has happened to one pack, oldest first.

Each row: `kind` (`pause` | `resume` | `extend`), `days`, `reason`,
`effectiveAt`, `createdAt`. **Append-only** — no update, no delete; reversing an
adjustment is another row, which is why `days` is signed. On a resume `days` is
the pause's length; on a pause it is `0`, because an open pause has no length yet.

It exists so goodwill is a fact rather than a feeling: an extension is the
cheapest thing a trainer gives away and the easiest to forget having given, and
"I have already stretched this twice" should be something they can look up.

### `GET /v1/packages/{packageId}/payments`
**Purpose:** the payment history against one package — what has been collected
versus what is owed.

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

Body: `{ "upiReference": "…" }`. Flips `status` and stamps `paidAt`. Separate from
`POST` because a UPI deep link is fired optimistically and confirmed later.

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
`nudge/NudgeTemplateController.java` · **`STANDARD` tier.** V32.

**Purpose:** the trainer's message library — all eight, merged.

Returns `[{ "name", "label", "purpose", "body", "isDefault", "variables":
[{ "token", "meaning" }] }]`. `body` is the trainer's wording where they have
saved one and the catalogue's default where they have not; `isDefault` says
which, and gates the *Reset* button.

**`nudge_template` is an OVERRIDE table, not a seeded one.** A trainer who has
never opened the library has no rows at all. Seeding eight on signup was the
obvious alternative and it is wrong: it freezes today's copy into every account
that ever existed, so improving a default sentence — and these are sentences a
trainer sends to somebody they see three times a week — would reach nobody.

**The label, the purpose and the variables are on the wire because the web holds
no copy of any of them.** The root `CLAUDE.md` opens with what happens when a
policy number lives in three files; eight message bodies is a worse version of
the same trap, because a drifted sentence is one a client actually receives.

**Why this is not `nudge_rule.message`.** V12's `nudge_rule` already carries a
message column with `{name}`/`{days}`/`{amount}` substitution, and it is the
wrong table: it is one row per trainer per KIND — `quiet` | `pack_low` |
`overdue` | `well_done` | `birthday` — which the phone's `NudgeRulesScreen`
iterates and renders, and it answers *when should a nudge be raised, and should
it go automatically*. Writing template names into its `kind` would put rows that
editor cannot label into a table it walks. The honest cost is stated in V32: a
trainer who edits a rule's draft on the phone and the same template's body on the
web has two strings. They do not fight — the phone's automation reads its rule,
these routes read this table — and closing the overlap means the phone adopting
`nudge_template`, in a commit that moves both halves.

### `PUT /v1/nudge-templates/{name}` · `DELETE /v1/nudge-templates/{name}`
**Purpose:** save the trainer's own wording; reset to the built-in.

`PUT` body `{ "body": "…" }`, upsert on `(trainer_id, name)` — saving twice is one
row. `DELETE` is a soft delete that answers **the default** rather than `204`, so
the screen can repaint without a second request, and it is idempotent: resetting a
template nobody overrode writes nothing and returns the default.

**The body is not validated for which variables it contains.** A trainer who
deletes `{amount}` from the payment reminder has written a payment reminder that
does not name the figure, which is a legitimate thing to want. An unknown token
is left in the message **verbatim** rather than blanked, so a typo shows up as
itself in the WhatsApp composer where the trainer can see it — rendering silently
is how a client receives "Hi , you owe .".

Three refusals, each a sentence: `400 NUDGE_TEMPLATE_UNKNOWN` for a name outside
the catalogue, `400 NUDGE_TEMPLATE_EMPTY` (an empty override is a DELETE, not a
save — a stored empty body sends an empty WhatsApp), and
`400 NUDGE_TEMPLATE_TOO_LONG` past 600 characters, because a reminder nobody
reads to the end is a reminder that did not work.

**`nudge_template` is not in sync**, per V26's, V28's, V29's and V30's precedent.
No phone build notices, and the phone keeps its own built-in wording until it
adopts these routes.

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
`workout_exercises`, `set_logs`, `body_metrics`, `packages`, `payments`,
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

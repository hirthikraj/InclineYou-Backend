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
| [Auth](#auth) | `/v1/auth` | 3 | Reviewed
| [Sessions (web sign-in)](#sessions-web-sign-in) | `/v1/auth/sessions` | 3 | V41 · reshaped by [Settings v1.1](#settings-v11--account--sign-in-3-oct-2026)
| [Settings v1.1 — account & sign-in](#settings-v11--account--sign-in-3-oct-2026) | `/v1/auth/step-up` · `/v1/auth/sessions` · `/v1/trainers/me/phone` · `DELETE /v1/trainers/me` | 9 | v1.1
| [Trainer profile](#trainer-profile) | `/v1/trainers` | 2 | Reviewed
| [The account](#the-account) | `/v1/trainers/me/phone`, `/v1/trainers/me` | 5 | V36
| [Settings v1.1 — profile, working week & messages](#settings-v11--profile-working-week--messages) | `/v1/trainers/me/consent` · `/setup/complete` · `PATCH /v1/working-hours` · `/v1/nudge-templates` | 6 | v1.1
| [Working hours](#working-hours) | `/v1/working-hours` | 2 |
| [Clients](#clients) | `/v1/clients` | 10 |
| [Progress](#progress) | `/v1/clients/{clientId}/progress` | 1 |
| [Exercises](#exercises) | `/v1/exercises` | 5 | V9
| [Measuring cycle — V5](#measuring-cycle--v5) | — (fields on `/v1/clients`, `/v1/trainers/me`) | 0 | V5, V22
| [Assessments — V14](#assessments--v14) | `/v1/assessments`, `/v1/assessment-templates`, `/v1/assessment-catalog` | 11 | V14
| [Programs](#programs) | `/v1/programs` | 11 |
| [Workout templates](#workout-templates) | `/v1/workout-templates` | 5 | V13
| [Scheduled sessions (diary)](#scheduled-sessions-diary) | `/v1/sessions` | 6 |
| [Packs (the price list)](#packs-the-price-list) | `/v1/packs` | 3 |
| [Packages & payments (money book)](#packages--payments-money-book) | `/v1/clients/{id}/packages`, `/v1/packages`, `/v1/payments` | 14 |
| [Nudges](#nudges) | `/v1/clients/{clientId}/nudges`, `/v1/nudges`, `/v1/nudge-templates` | 5 |
| [Attention dismissals](#attention-dismissals) | `/v1/attention/dismissals` | 3 |

**The wire contract is `release/api-contract-v1.1.html`; where this file and it differ, the contract wins.** This file keeps the per-route notes for the v1 trainer web app; the team, workspace-switcher, client-portal, sync, push-device and report routes were removed from the backend and from here.

---

## Authorization model

Enforced in `config/SecurityConfig.java`, in this order — first match wins:

| Path | Requirement |
| --- | --- |
| `POST /v1/trainers` | any authenticated token — the `pending` token's one route |
| `/v1/auth/**`, `/health` | public |
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
| `MESSAGING` | `POST …/nudges` | 10 / 60s |
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
| `OTP_WRONG` | 401 | Code did not match; an attempt was spent. Carries `attemptsLeft`. |
| `OTP_EXPIRED` | 401 | Code was valid and has since lapsed. |
| `OTP_REQUEST_NOT_FOUND` | 404 | The sign-in `requestId` is unknown, used, expired or superseded. |
| `PHONE_INVALID` | 400 | Fails the phone format. |
| `CONSENT_REQUIRED` | 400 | A missing or outdated privacy-policy version on `POST /v1/trainers`. |
| `CLIENT_SIGN_IN_UNAVAILABLE` | 403 | The number is only a client's, and client sign-in is not open. |
| `SESSION_EXPIRED` | 401 | The session (or pending token) is past its expiry. |
| `SESSION_REVOKED` | 401 | The session was signed out elsewhere or by an account change. |
| `OTP_LOCKED` | 429 | Too many wrong codes — number locked, carries a countdown. |
| `OTP_THROTTLED` | 429 | Codes requested too fast — carries the real wait. |
| `SIGN_IN_BLOCKED` | 403 | `POST /v1/auth/otp/request` from an address that asked codes for more than 5 different numbers in an hour, or collected 5 refused sends. Blocked for 24 h, then clears itself; nothing is sent. Carries `retryAfterSeconds`. Never a phone number — that would let anyone lock a trainer out. |
| `SIGNUPS_PAUSED` | 503 | The day's budget for numbers with no account (100, system-wide) is spent. Known numbers are unaffected. Carries `retryAfterSeconds`. |
| `OTP_DELIVERY_FAILED` | 502 | WhatsApp refused or did not answer; the request is marked `failed`. |
| `PHONE_IS_TRAINER` | 409 | That's the caller's own number — trainer/client duality is allowed for everyone else's. |
| `PHONE_ON_ANOTHER_ROSTER` | 409 | That number is another coach's client **in this workspace**. Narrowed by V38: it used to mean "anywhere in the product", which made it impossible for one person to be a client of a private trainer and, separately, a client at a gym. |
| `RATE_LIMITED` | 429 | Tier budget exhausted. |
| `TEAM_READ_ONLY` | — | Sync-push rejection reason, not an HTTP status. |
| `NO_WORKSPACE` | 422 | The caller belongs to no workspace yet. |
| `VALIDATION` | 400 | A field was refused; `detail` names it and says why (`gender: must be one of …`, `dateOfBirth: that date is in the future`, `paidAt: …`, an empty note). **Branch on the field in `detail` only for display** — the code is shared on purpose, so a new field needs no new code. Thrown by `AccountRuleException`, `ClientRuleException`, `PackageRuleException`, `WorkoutRuleException` and `AssessmentRuleException`. |
| `WRITTEN_OFF` | 409 | **V8.** The payment was written off — it cannot be invoiced, and it cannot be confirmed. |
| `PACKAGE_NOT_FOUND` | 404 | Not one of the caller's packages. |
| `PACKAGE_NEEDS_PRICE` · `PACKAGE_NEEDS_SESSIONS` · `PACKAGE_FIELD_INVALID` | 400 | A sale that cannot be written as sent — no price, no session count on a session pack, an unknown enum value or a malformed date. |
| `PACKAGE_BAD_SESSION_COUNT` · `PACKAGE_NO_CHANGE` | 400 | A V4 count correction out of range, or to the count it already has. |
| `PACKAGE_ALREADY_PAUSED` · `PACKAGE_NOT_PAUSED` | 409 | Pause on a paused pack, resume on a running one. |
| `PACK_NEEDS_NAME` · `PACK_NEEDS_PRICE` · `PACK_NEEDS_SESSIONS` · `PACK_FIELD_INVALID` · `PACK_FIELD_UNKNOWN` | 400 | A price-list entry that cannot be written as sent. |
| `PACK_OWNER_IMMUTABLE` | 400 | A pack's `owner` cannot change — it would re-attribute every package sold from it. |
| `PACK_NOT_FOUND` | 404 | Not on the caller's price list. |
| `UNKNOWN_VARIABLE` | 400 | v1.1 — a `{token}` in a nudge-template body that the template does not fill; the sentence names the ones it does. |
| `CONSENT_REQUIRED` | 400 | v1.1 — `POST /v1/trainers/me/consent` with a `policyVersion` that is missing or is not the notice in force (`app.privacy.policy-version`). |
| `PROFILE_TOO_LONG` | 400 | v1.1 — `headline` over 80 or `bio` over 1200 on `PATCH /v1/trainers/me`; refused, never truncated. |
| ~~`NUDGE_TEMPLATE_UNKNOWN` · `NUDGE_TEMPLATE_EMPTY` · `NUDGE_TEMPLATE_TOO_LONG`~~ | — | Retired in v1.1 by the nudge-templates rewrite: an unknown name is a plain 404, a blank or over-long body is `VALIDATION`. |
| ~~`NUDGE_CLIENT_NOT_FOUND`~~ | — | Retired 3 Oct 2026 with `POST …/nudge`. `POST …/nudges` answers a plain 404 for a client not on the roster. |
| ~~`NUDGE_NO_PHONE`~~ | — | Retired 3 Oct 2026 with `POST …/nudge`: `POST …/nudges` answers `409 CLIENT_NO_PHONE` — adding a number makes the same request work. |
| `EMAIL_INVALID` · `EMAIL_TOO_LONG` | 400 | V36's contact address is not shaped like one, or is over 254 characters. |
| `STEP_UP_REQUIRED` | 403 | A dangerous act (change number, close account) without a valid step-up ticket for it. See *Settings v1.1*. |
| `TICKET_EXPIRED` | 401 | The step-up ticket was right but has aged out or been spent — start the step-up again. |
| `PHONE_INVALID` | 400 | The new number is not an E.164 Indian mobile. |
| `SESSION_CANCELLED` | 409 | **Portal 11b.** Starting a workout against a cancelled session. |
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

## Auth

`auth/AuthController.java` — phone-OTP sign-in and claiming a trainer account. A number that is only a client's is refused on verify with `403 CLIENT_SIGN_IN_UNAVAILABLE` (the client portal is not in v1).

### `POST /v1/auth/otp/request`
**Purpose:** send a sign-in code to a phone number over WhatsApp. *Public.* `AUTH` tier.

Body: `{ "phone": "+919876543210" }` — `+91`, then a mobile number starting 6–9.
Anything else is `400 PHONE_INVALID`.

Returns `200`:

```json
{ "requestId": "0b6f…", "expiresAt": 1790300600000, "resendAfterSeconds": 30 }
```

`requestId` is the `otp_request` row's id: random, carrying no phone number. The
web keeps it in its httpOnly sign-in cookie and sends it, not the number, to
verify and to the status read. A new request for the same number **supersedes** the
previous one — only the latest id can be verified. `resendAfterSeconds` is the
next rung of the resend ladder, for the countdown. The answer is the same
whether or not the number has an account.

Throttled per number by a resend ladder (30s / 60s / 120s inside a 60-minute
window) with a ceiling of 10 sends per rolling 24 hours — `429 OTP_THROTTLED`
with `retryAfterSeconds`. A number serving a wrong-code lock is
`429 OTP_LOCKED`; both carry `Retry-After`.

### `GET /v1/auth/otp/requests/{requestId}`
**Purpose:** did the WhatsApp message arrive — the "Didn't get it?" screen. *Public.*

Returns `{ "deliveryStatus": "sent", "deliveryError": null, "expiresAt": … }`;
`deliveryStatus` is `queued | sent | delivered | read | failed`. The row goes
`queued → sent` when the sender takes the code and `failed` (with
`deliveryError`) when it refuses; `delivered` and `read` are for the provider's
webhook, which is not wired. Keyed by the id the caller was given, never by a
number, so it answers nothing about an arbitrary phone. Unknown, expired,
used, superseded or malformed ids are all `404 OTP_REQUEST_NOT_FOUND`.

### `POST /v1/auth/otp/verify`
**Purpose:** check the code, and open a session. *Public.* With
`X-InclineYou-Client: web` the credential is a revocable session; without it, a JWT.

Body: `{ "requestId": "0b6f…", "otp": "123456" }`. The code is checked against the
request it was sent for. Its shape (`^\d{6}$`) is checked *before* the code, so a
typo cannot spend one of the three attempts. The wrong-attempt lock stays keyed on
the **number** behind the request, so asking for a fresh request does not reset it.

Returns `AuthResponse` (instants are epoch ms):

| Field | Meaning |
| --- | --- |
| `token` | the bearer credential — opaque (`xs_…`) on the web |
| `sessionId` | `web_session.id`, "this device" in Settings; null for a JWT |
| `expiresAt` | when the credential stops working |
| `role` | `trainer` \| `pending` (a new number). A number that is only a client's never gets here |
| `isNewUser` | true for `pending` |
| `trainerId`, `trainerName` | null on `pending`; the name is null before setup |
| `setupCompletedAt` | null until onboarding is finished |
| `privacyPolicyVersion` | what they accepted; null on `pending` |
| `currentPolicyVersion` | what is in force — a mismatch sends them to the consent screen |

A `pending` token is a 15-minute JWT (also on the web: `web_session` needs an
`app_user` row, which a new number does not have yet) and opens exactly one
route, `POST /v1/trainers`.

Errors: `401 OTP_WRONG` `{attemptsLeft}` · `401 OTP_EXPIRED` ·
`404 OTP_REQUEST_NOT_FOUND` · `429 OTP_LOCKED` `{retryAfterSeconds}` ·
`403 CLIENT_SIGN_IN_UNAVAILABLE` — a number that is only a client's (the portal
is not in v1); a number that is both signs in as the trainer.

### `POST /v1/trainers`
**Purpose:** become a trainer — the new-number sign-up. *`pending` token, or a trainer's own session.*

Body: `{ "privacyPolicyVersion": "2026-09" }` — must equal `currentPolicyVersion`;
missing or outdated is `400 CONSENT_REQUIRED`. Creates the `app_user` (privacy
pair stamped once) and the `trainer`; the database triggers provision the
solo workspace, the practice row and the trial. Answers the verify shape with
`role: "trainer"` and a revocable session: **`201`** the first time.

Idempotent by target state: the pending token replayed, or a call from a session
that already belongs to a trainer, answers **`200`** with the account that exists
(the latter with its own credential echoed — no second session is minted). A
phone that is already somebody's client can claim too; the existing row becomes
the trainer's.

No live pending token or session is `401 SESSION_EXPIRED`.

### Stale credentials
Any endpoint answers `401` with `code: SESSION_EXPIRED` for a session past
`expires_at` (or an expired pending JWT) and `SESSION_REVOKED` for one that was
signed out elsewhere or by an account change. A forged or unknown token is a bare
`401`, indistinguishable from none.

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

`POST /v1/auth/otp/verify` mints either, by the same header; the response's `sessionId` is non-null exactly when the credential is a session.

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

> **Superseded (3 Oct 2026).** In v1 the week is `PUT /v1/clients/{id}/schedule` (`If-Match`, whole week), which books a rolling 28 days and answers `{schedule, slots, booked, cancelled, clashes}`; selling a pack books nothing. `DiaryService` and `SessionPlanner`, which implemented the rule below, were deleted; the paragraph is kept as history.

**Sending `weeklySchedule` BOOKS THE DIARY**, in the same transaction — V3, and
`DiaryService` carries the three-pass rule that keeps a hand-booked session and a
typed note through the change. Two fields on `ClientResponse` say what that did,
**appended last**:

| | |
| --- | --- |
| `sessionsBooked` | how many sessions THIS REQUEST put in the diary |
| `firstSessionAt` | epoch ms of the first one it booked |

Both **null** when the request did not touch the rhythm — a name change books
nothing and must not claim a zero — and both are `the pre-v1 DiaryService.Result`'s own
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

### `GET /v1/sessions/{id}` → `200`
One session in the L4 shape — the same row `GET /v1/sessions` draws (booking, `workout`, `startedAt` / `endedAt`, `log` totals, `charge`) — with its `version` as the `ETag` that `PATCH` takes as `If-Match`. `404` when it is not this trainer's live session. (3 Oct 2026: it used to answer a pre-v1 shape from columns v1 does not have, a 500 for every session.)

`PUT /v1/sessions/{id}` is gone: move or change a session with `PATCH /v1/sessions/{id}`, and take a booking back with `DELETE /v1/sessions/{id}` → `204` (see Schedule).

### `POST /v1/sessions/{id}/done`
**Purpose:** mark a booked session complete — the bridge from *planned* to
*logged*. Creates the corresponding workout session and decrements the client's
session pack.

Body (optional): `workoutNotes`, `sessionDate` (ISO `yyyy-MM-dd`; defaults to
today).

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

### `POST /v1/clients/{clientId}/nudges` → `201` (a replay `200`)
`nudge/NudgeController.java` · **`MESSAGING` tier — 10/min.** On the v1 `nudge_log` (3 Oct 2026). It replaces
`POST …/nudge`, which wrote columns v1 does not have and was removed once its callers moved.

**Purpose:** draft a WhatsApp nudge for a client, log it, and hand back the deep link.

Body: `{ "id"?, "template", "packageId"?, "sessionId"? }`. `id` is the caller's own UUID, so a retry finds its row
(`200` with the stored message; the same id under another trainer or client is `409 ID_CONFLICT`). `template` is one of
the eight names below; `re_engagement` and `session_summary` have no agreed `nudge_log.reason` yet and answer
`400 VALIDATION` ("not available yet") rather than a guess. `packageId` is accepted only on `payment_reminder` and
`renewal`, `sessionId` only on `missed_session`, `session_reminder` and `session_summary` (`nudge_log_subject`), and each
must belong to this client. Returns `{ "id", "message", "whatsappUrl", "sentAt" }`.

The server writes the row **carrying the rendered text** (`nudge_log.message`, ≤ 1000 characters), with
`channel = whatsapp_manual` and a `reason` it derives from the template — `payment_reminder → dues`,
`renewal → pack_ending`, `missed_session → no_show`, `check_in → lapsed`, `well_done → manual`,
`session_reminder → session`. The log is append-only.

**The message is not in the request body and deliberately cannot be.** A caller that could supply the sentence could
put a figure in it that disagrees with the money book, and the caller most likely to is the screen that has just done
some arithmetic of its own. Every variable is resolved server-side: `{amount}` and `{days}` come from the same package
ledger the money card reads (`amountDue`, `dueDate`), day counts on the workspace's calendar.

**Refusals:** `404` for a client not on the roster; `409 CLIENT_NO_PHONE` for a client with no usable number — adding one
makes the same request work, and a `wa.me` link built from a malformed number opens WhatsApp on an error page; `400
VALIDATION` for an unknown template or a malformed id. The once-per-client-per-7-days cooldown is **not** a refusal
(see below).

**The eight templates** — `NudgeTemplateCatalog`, which is the whitelist and the default wording in one place:

| Template | What it is for | `{count}` means |
| --- | --- | --- |
| `renewal` | the pack is nearly done | sessions left |
| `payment_reminder` | money is owed. `{amount}` is the package's `amountDue` (or everything the client owes) | days outstanding |
| `missed_session` | they missed sessions they were booked into | no-shows in 30 days |
| `check_in` | nothing is wrong; how is the week going | — (`{days}` since the last delivered session) |
| `re_engagement` | they stopped weeks ago. Names the gap and offers a slot | — |
| `well_done` | a milestone. `{nth}` is the ordinal — 100th, 111th | sessions delivered |
| `session_summary` | sent after a session, while it is still in their head | — |
| `session_reminder` | tomorrow's session, confirmed the night before | — |

`{count}` means a different number in each of them **on purpose**: there is exactly one count per template, so a
trainer editing one can never be looking at two. The other tokens are `{name}` (first name), `{trainer}`, `{amount}`,
`{package}`, `{days}` and `{nth}`. An unknown `{token}` is left exactly as typed, so a typo arrives in the trainer's own
WhatsApp composer, in front of them, before they press send.

**There is no `DELETE`.** The product cannot know whether the trainer pressed send in WhatsApp, so it cannot honestly
offer to un-send — and deleting the row would reopen the cooldown, which is the one thing the record exists to hold
shut.

### `GET /v1/nudges?from&clientId&include&limit&cursor`
**`STANDARD` tier**, and that is not an oversight. `RateLimitFilter` tiers on `POST` plus a path ending `/nudges`, so
this GET falls through — correctly: a read of the history spends no WhatsApp and no money, and putting it in the
ten-a-minute tier would make one dashboard load cost the trainer one of the ten messages they are actually allowed to
draft.

**Purpose:** what has been drafted, newest first — across the roster, or one client with `clientId` (the client file's
follow-up timeline, `from` a year back). Returns `{ items: [{ id, clientId, template, reason, sentAt, message? }],
nextCursor }`; `sentAt` is epoch ms and `message` is present **only with `include=message`** (opt-in on any query, rather
than switched on by `clientId`, because a field that appears and disappears with a filter is a trap for every typed
client). `from` is a date in the workspace's timezone and defaults to **7 days ago**, the cooldown window: Today reads
this to stop raising a row about somebody the trainer messaged yesterday. Keyset on `(sentAt, id)` descending, 500 a page
(1,000 at most). A malformed `from`, `clientId` or `include` is `400 VALIDATION`.

Replaces `GET /v1/clients/{id}/nudges?days&limit`, which read pre-v1 columns (`template_name`, `status`) and was removed
3 Oct 2026 with no caller left. `templateLabel`, `templateName`, `clientName` and `status` are not on the new rows;
`template` and `reason` are.

**It is still not enforced by this endpoint, and that is deliberate.** A trainer pressing *Remind* on somebody they
messaged on Monday knows something the product does not — the client replied, or asked to be chased again on Thursday —
and answering that with a 429 teaches them to open WhatsApp directly, which loses the log for every client rather than
enforcing the cap for one. The enforcement is the QUEUE going quiet. `COOLDOWN_DAYS` has four copies
(`app/src/nudges/rules.ts`, `NudgeReadService`, `lib/nudges/cooldown.ts`, imported by `lib/today/deck.ts`).

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

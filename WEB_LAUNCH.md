# InclineYou — Web Launch Book

**Scope: the web app only — trainer half *and* client portal.** `web app/web/`
(Next.js 16, 62 routes) and the Spring backend behind it, from the current tree to a production deployment
serving Indian personal trainers. The Expo app is deliberately out of scope —
nothing here blocks it, nothing here needs it, and `notes/
InclineYou_deployment_runbook.md` remains the reference for the day it ships.

**Status: a plan. Nothing in §5 has been done.** §4 is the inventory of what
already exists and is correct; §5 is the list of what does not; §8 is the
sign-off checklist. Read §3 first — it is the whole picture on one screen.

Companion to `backend/TENANCY.md` (the isolation model), `backend/IDENTITY.md`
(the auth roadmap and the four things we owe for building our own), and
`backend/API.md` (the wire).

**How to use this book.** Every item in §5 has the same shape — what is wrong,
why it matters, the fix, and **how to verify it is done**. Work them in the
order of §7. Tick §8 against staging first and production second. Nothing here
requires re-deriving anything; it is meant to be picked up cold.

---

## 1. What is being shipped

A Next.js App Router application where **every page renders on the server and no
browser ever talks to the Spring API.** That is the load-bearing architectural
fact of this deployment, and it is verified rather than assumed: every module
touching `INCLINEYOU_API_URL` carries `import 'server-only'`, and the single client
component that fetches (`components/programs/LibraryPanel.tsx`) calls a
`'use server'` action rather than the API.

Three consequences:

- **The backend needs no CORS configuration**, and must not grow one. The only
  origin that ever calls it is the Next server.
- **The token never exists in browser JavaScript.** It lives in an `httpOnly`
  cookie — not "hard to read", absent. This is materially better than a SPA with
  a token in `localStorage`, and it is worth not trading away later for a
  client-side data-fetching convenience.
- **The Next↔Spring hop is on the critical path of every page render.** This
  drives the hosting decision in §6 more than anything else, and it is the thing
  most likely to be got wrong, because the instinct is to put the frontend on a
  global edge network. Do not: an edge deployment in Washington calling a Mumbai
  backend pays two intercontinental round trips before a trainer sees Today.

Deliberately absent, per `web app/web/AGENTS.md`: no offline banner, no sync
pill, no sync queue. The web is online-only; its design set says otherwise and
the design set is wrong.

---

## 2. The stack

| Layer | What | State |
| --- | --- | --- |
| Frontend | Next.js 16.3.2, React 19.2.8, TypeScript, 62 routes | Built · not containerised · not in CI |
| Backend | Spring Boot 4.1, Java 21, 256 tests green | Built · not containerised |
| Database | Postgres 16, 42 migrations, RLS enforced as `inclineyou_app` | Built and proven |
| Cache | Redis 7, AOF on — OTP state and rate limits | Built, with fallbacks |
| Auth | Phone + OTP → `httpOnly` cookie | Built · **cannot deliver a code** |

---

## 3. Status at a glance

**Already done — 24 items.** The security baseline is genuinely strong; §4 is
the evidence. Highlights: row-level security enforced by Postgres and proven by
eleven tests, an app that connects as a non-owning role, bcrypt-hashed OTPs,
SHA-256 session tokens, `httpOnly` cookies, no card data anywhere, parameterised
SQL throughout, and phone masking already standard in logs.

**Must do before launch — 18 items.** Seven are hard blockers.

| | Item | Severity |
| --- | --- | --- |
| **MUST-1** | No SMS provider — nobody can sign in | ⛔ blocker |
| **MUST-2** | Web never requests a revocable session — sign-out does not sign out | ⛔ blocker |
| **MUST-3** | No Dockerfile exists anywhere | ⛔ blocker |
| **MUST-4** | Web app has no CI at all | ⛔ blocker |
| **MUST-5** | 9 controllers take request bodies without `@Valid` | 🔶 high |
| **MUST-6** | Missing `INCLINEYOU_API_URL` silently becomes localhost (25 files) | 🔶 high |
| **MUST-7** | No security headers — `next.config.ts` is empty | 🔶 high |
| **MUST-8** | Server Actions have no `allowedOrigins` | 🔶 high |
| **MUST-9** | `JWT_SECRET` has a published default and cannot be rotated | 🔶 high |
| **MUST-10** | No refresh token — 7-day hard expiry | 🔷 launch week |
| **MUST-11** | Route protection is per-page with no backstop | 🔷 launch week |
| **MUST-12** | `otp_request` grows forever and holds phone numbers | 🔷 launch week |
| **MUST-13** | **The client portal is four stub routes — it is not built** | ⛔ blocker |
| **MUST-14** | **A client's only API surface is sync pull/push — the portal has no REST to read** | ⛔ blocker |
| **MUST-15** | Clients never consented — the invite screen is where that happens | 🔶 high |
| **MUST-16** | **No billing of any kind — the 30-day trial has no clock** | ⛔ blocker |
| **MUST-17** | No payment rail — no gateway picked, KYC and GSTIN unstarted | 🔶 day 31 |
| **MUST-18** | No GST-compliant invoice, required from the first rupee | 🔶 day 31 |

**The client portal ships in v1** (decided 30 Aug 2026), which adds MUST-13…15
and changes the threat model: see §5.13.

**Billing does not exist** (raised 30 Aug 2026), which adds MUST-16…18 — see
§5.16. Only one of the three blocks the launch, and it is the small one: the
**trial clock** is the only billing component that cannot be added after the
first trainer signs up. The rail is due on day 31, because the trial is 30 days;
its KYC queues are what start now.

**No devops is a governing requirement** (30 Aug 2026): no manual deploys, no
babysitting, no hand-rolled backups. §6 is written around it, and it rules out
IaaS and Kubernetes regardless of price or locality. The honest residue is
§6.6 — one to two hours a month, not zero.

---

## 4. What is already done

Not a victory lap — this section exists so nobody rebuilds it, and so the
checklist in §8 can say *verify* rather than *build*. Each line names its
evidence.

### 4.1 Data isolation — the strongest part of the system

| | Evidence |
| --- | --- |
| ✅ Row-level security on 29 tables, four policy tiers | V37–V42 |
| ✅ App connects as **non-owning** `inclineyou_app`, so policies actually apply | `application.yml`, `DataSourceConfig` |
| ✅ Flyway holds separate owner credentials — DDL is owner work | `MIGRATION_DB_*` |
| ✅ Isolation proven, not assumed — 11 tests opening real `inclineyou_app` connections | `TenantIsolationTest` |
| ✅ Boot-time proof that RLS is live, asked of Postgres not inferred | `DatabaseIdentityCheck` → `row_security_active('client')` |
| ✅ `tenant_id` immutable — stamped on insert, refused on update | `stamp_tenant_id`, `freeze_tenant_id` (V39) |
| ✅ Ownership is a query filter; a wrong id yields 404, never 403 | `ClientService.findOwned` pattern |
| ✅ No role sees a teammate's money book | `/v1/team/**` excludes `package`/`payment`/`gym_settlement` |
| ✅ App-role password reconciled on every boot, so rotation works | `afterMigrate__sync_app_role_password.sql` |

### 4.2 Credentials and secrets at rest

| | Evidence |
| --- | --- |
| ✅ OTP codes **bcrypt-hashed** in both stores, never stored plain | `JpaOtpStore`, `RedisOtpStore` |
| ✅ Session tokens stored as **SHA-256**, never the token | `web_session.token_hash` |
| ✅ Phone numbers **masked in logs** as standard | `masked()` in `AccountService`, `OtpSendLimiter`, `DelegatingOtpStore` |
| ✅ Boot refuses to start if OTP codes would be logged on a real deployment | `TransportSecurityCheck`, 5 unit tests |
| ✅ **No card data anywhere** — UPI deep link and cash only | the highest-sensitivity class simply is not held |

### 4.3 Transport

| | Evidence |
| --- | --- |
| ✅ Boot-time check of whether the DB connection is really encrypted | `TransportSecurityCheck` → `pg_stat_ssl` |
| ✅ HSTS configured, one year, `includeSubDomains` | `SecurityConfig` |
| ✅ HTTPS-only redirect available behind one flag | `REQUIRE_HTTPS` + `HttpsRedirectFilter` |
| ✅ Redis TLS available behind one flag | `REDIS_SSL` |
| ✅ Every variable documented with its failure mode | `.env.example` |
| ✅ Transport section written into the deployment runbook | `notes/InclineYou_deployment_runbook.md` §2c |

### 4.4 Web posture

| | Evidence |
| --- | --- |
| ✅ **No browser code reaches the API** — all `server-only` or `'use server'` | verified across `lib/` |
| ✅ Token in an `httpOnly` cookie, absent from browser JS | `lib/auth/session.ts` |
| ✅ `secure` in production, `sameSite: 'lax'` with a documented reason | same |
| ✅ Backend needs no CORS, and has none | consequence of the above |
| ✅ **No `dangerouslySetInnerHTML` anywhere** — XSS surface minimal | verified across `app/`, `components/`, `lib/` |
| ✅ Exactly one `NEXT_PUBLIC_` variable, genuinely public | `NEXT_PUBLIC_SUPPORT_WHATSAPP` |
| ✅ No file upload path exists | keep it that way |

### 4.5 Abuse controls

| | Evidence |
| --- | --- |
| ✅ Four rate-limit tiers, Bucket4j on Redis with in-process fallback | `RateLimitFilter` |
| ✅ `MESSAGING` tier at 10/min because each call spends real money | `application.yml` |
| ✅ OTP: 3 attempts, 10-minute lock, `[30,60,120]` ladder, 10/day ceiling | `app.otp.*` |
| ✅ Lock and ceiling **survive a restart** — deliberately persistent | V17; Redis AOF mandated |
| ✅ Redis outage never locks anyone out — Postgres fallback | `DelegatingOtpStore` |

### 4.6 Code and data discipline

| | Evidence |
| --- | --- |
| ✅ **All SQL parameterised** — no string concatenation found | verified across `src/main/java` |
| ✅ Soft deletes everywhere; every read filters `deleted_at IS NULL` | schema-wide |
| ✅ Additive-only schema law, 42 migrations, none edited after running | `SCHEMA.md` |
| ✅ RFC-7807 errors with a stable `code` catalogue the clients branch on | `GlobalExceptionHandler` |
| ✅ 256 backend tests green, run in CI against real Postgres | `.github/workflows/ci.yml` |
| ✅ Money is `BigDecimal`, timestamps `Instant` (UTC), ids UUID | conventions |
| ✅ **No open backend gaps for the web** | `web app/web/BACKEND_GAPS.md` |

---

## 5. What must be done

### MUST-1 · Wire an SMS provider ⛔

**What.** `OtpSender` ships only `LoggingOtpSender`, which throws when
`app.otp.sms-enabled` is true. No code can reach a phone.

**Why it is first.** Everything else in this book is refinement. This is the
front door, and it does not open.

**The fix.** Mostly not code:

1. Choose a provider. **MSG91** is the usual India answer — it has DLT tooling
   built in, which is the part that costs time. Twilio and AWS SNS work and leave
   DLT to you.
2. **DLT registration on a telco portal** — principal entity, header (sender ID),
   OTP template approval. **Budget 1–2 weeks.** It is a regulatory queue, not an
   engineering task, and it is the long pole of the entire launch.
3. Implement behind the existing `OtpSender` seam. Nothing else changes.
4. Set `sms-enabled: true` and `OTP_DEV_CODES_IN_LOG=false`.

Do not launch on WhatsApp OTP as the primary — it needs a BSP, its own approval
queue, and a trainer in a basement gym still gets SMS.

**Verify.** A real code arrives on **Jio and Airtel** handsets. Delivery differs
per carrier; one test on one SIM is not a test.

---

### MUST-2 · Make the web ask for a revocable session ⛔

**What.** V41 built two token issuers — a self-contained JWT for the phone, an
opaque revocable session for the browser — switched by the `X-InclineYou-Client: web`
header. **That header appears zero times in `web app/web/`.**

**Why.** The browser therefore holds a JWT, so:

- **Sign-out does not sign anyone out.** It deletes a cookie; the token stays
  valid for its remaining seven days and anyone holding a copy keeps full access.
- `web_session`, `SessionController`, `SessionSweeper` and the device list are
  dead code in production.
- A workspace switch costs a re-mint rather than the `UPDATE` it was built to be.
- **You have no way to respond to a leaked credential.** That is the incident
  response the session issuer exists to provide.

**The fix.** Send `X-InclineYou-Client: web` on the sign-in call in `lib/auth/api.ts`.
Small change; check the whole auth path for anywhere else that mints.

**Verify.** Sign in → sign out → replay the old cookie value. It must 401. Also
confirm rows now appear in `web_session`.

---

### MUST-3 · Containerise both halves ⛔

**What.** There is **no Dockerfile anywhere in this repository**, despite
`notes/InclineYou_deployment_runbook.md` §2 saying "Railway builds the Dockerfile".

**The fix.**

- **Backend** — multi-stage, JDK 21 build → JRE runtime, non-root user.
- **Frontend** — set `output: 'standalone'` in `next.config.ts` first (it is
  currently an empty config object), then a slim runtime image, non-root user.
- **Pin base images by digest, not tag**, or a rebuild silently changes your
  runtime.

**Verify.** Both images build from a clean checkout and run with only documented
environment variables. Confirm neither runs as root (`docker run ... id -u` ≠ 0).

---

### MUST-4 · Put the web app in CI ⛔

**What.** `.github/workflows/ci.yml` has two jobs, `backend` and `app` (the Expo
client). **The word "web" does not appear.** The half shipping first is the only
half with no gate.

**The fix.** A `web` job: `npm ci` → `npx tsc --noEmit` → `npm run lint` →
`npm run build`. The build step matters most: a Server Component type error that
only surfaces at build time is a broken deploy, not a broken commit.

**Verify.** Open a PR with a deliberate type error and watch CI fail.

---

### MUST-5 · Add `@Valid` to the nine unguarded write endpoints 🔶

**What.** `backend/CLAUDE.md` states the convention: *"Jakarta Bean Validation on
request records; `@Valid` at the controller."* Thirteen of twenty-five
controllers follow it. **Nine controllers accept `@RequestBody` on a write
endpoint with no `@Valid`**, which means any constraint annotations on those
records are **not enforced**:

`NudgeController` · `NudgeTemplateController` · `DeviceController` ·
`ReportController` · `ScheduledSessionController` (3 write mappings) ·
`ClientSyncController` · `SyncController` · `TrainerController`

Spot-checked `ScheduledSessionController`: `@RequestBody CreateRequest` with no
`@Valid`, confirming the annotations are decorative there.

**Why.** Unvalidated input reaching a service is the precondition for a whole
class of bugs, and the convention existing but not being applied is worse than
no convention — it invites the assumption that validation happened.

**The fix.** Add `@Valid`, then run the suite: some will fail, and each failure is
a request the API was previously accepting that it should not have been.

**Verify.** Every write endpoint rejects a body violating its own annotations.
Confirm the three remaining read-only controllers (`SessionController`,
`HealthController`, `ProgressController`, `WorkingHoursController`) genuinely
have no write path.

---

### MUST-6 · Fail fast on a missing API URL 🔶

**What.** `process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080'` appears in
**25 files**. A deployment that forgets the variable starts cleanly and sends
every request nowhere.

**The fix.** One module reading the variable once, **throwing at startup if unset
outside development**. Same module refuses a non-HTTPS API URL in production.
Replace all 25 fallbacks with an import.

**Verify.** Unset the variable and confirm the app refuses to start rather than
starting broken.

---

### MUST-7 · Add security headers 🔶

**What.** `next.config.ts` is an empty config object — no CSP, no
`X-Frame-Options`, no `Referrer-Policy`, no `Permissions-Policy`.

**The fix.** See §8-G for the exact set. Start CSP at `default-src 'self'` and
add only what breaks; use a nonce rather than `unsafe-inline`.

**Verify.** An external header scanner against the production domain, and the
browser console clean of CSP violations across all 62 routes.

---

### MUST-8 · Pin Server Action origins 🔶

**What.** Server Actions are not merely this app's write path — because of §1
they are the **only** way anything in a browser reaches data. The entire attack
surface is concentrated into one mechanism: **Server Action POSTs carrying the
session cookie.**

Next validates `Origin` against `Host` for Server Actions (the built-in CSRF
defence) and `sameSite: 'lax'` is the second layer. **Behind a reverse proxy the
forwarded host can differ from the origin**, which is exactly the deployment
shape §6 recommends.

**The fix.** Set `experimental.serverActions.allowedOrigins` to the production
domain explicitly rather than relying on inference.

**Verify.** Replay a Server Action POST with a foreign `Origin` header. It must
be refused.

---

### MUST-9 · Real `JWT_SECRET`, and a way to rotate it 🔶

**What.** `dev-only-secret-change-before-production-32chars` is published in this
repository. Worse, **it cannot be rotated without signing every user out** —
one HMAC key, no `kid`, no verification window.

**The fix.** Generate one (`openssl rand -base64 48`) into the platform secret
store. Rotation is **M1 in `backend/IDENTITY.md`**: `kid` in the header, a
two-key window. No migration needed — it is `JwtService`, a config shape, and a
filter that tries two keys.

**Verify.** `git log -p` shows no real secret ever committed. After M1, rotate on
staging and confirm existing sessions survive.

---

### MUST-10 · Refresh tokens 🔷

7-day hard expiry, no refresh anywhere in `auth/` (**M2 in
`backend/IDENTITY.md`**). On the web this is an annoyance rather than a blocked
workflow, so it is launch-week rather than launch-blocking. It becomes urgent the
moment the Expo app ships, since OTP is the one flow needing signal on a gym
floor. Note the same table gives you the **device list** — one migration, three
features.

---

### MUST-11 · A route-protection backstop 🔷

There is no `middleware.ts`; each page pulls its own guard from `lib/*/guard.ts`.
The real boundary is the backend, which refuses any request without a token, so
an unguarded page renders an error rather than leaking data — **a correctness and
UX issue, not a breach.** Still worth middleware redirecting unauthenticated
requests for everything outside `(auth)`, so a new route is protected by default
rather than by remembering.

---

### MUST-12 · Sweep `otp_request` 🔷

V41's comment records it: the V1 cleanup job was never written and the table has
accumulated since the first sign-in. **It holds phone numbers.** Add a sweeper
beside `SessionSweeper` — both a data-minimisation and a disk item.

---

## 5.13 · The client portal — what shipping it in v1 means

Decided 30 Aug 2026. It is not a checklist tick; it is scope, plus a change of
threat model.

**The threat model changes because the users change.** Every user until now was
a trainer — a paying customer with a reputational stake, who chose to be here.
A client is a member of the public whose number was typed in by somebody else.
They did not sign up, they may not want an account, and a hostile one is a
perfectly ordinary thing to expect. Three consequences run through the items
below: **MUST-2 applies doubly** (a client's session must be revocable), rate
limits must hold per client and not merely per trainer, and the tier-4 wall
needs the same evidence tier 1 has.

**What is already right, and it is a lot.** Tier 4 of the RLS model — *the
client lens* — is built and live: a client is not staff of anything, gets no
tier-1 or tier-2 access at all, and reads only their own rows across every
roster they are on. `client`, `body_metric`, `program`, `scheduled_session`,
`workout_session`, `weekly_report`, `package`, `payment` all carry a
`client_client` policy keyed on `app_client_ids()`, and the four tables with no
`client_id` are covered by EXISTS subqueries. `SecurityConfig` gates
`/v1/client/**` behind `hasRole("CLIENT")`. The `inclineyou_client` cookie is a
preference and not a permission — `ClientSyncController` re-checks it against
the token's phone on **every** request. **The backend is ready; the web is not.**

### MUST-13 · Build the portal — it is four stubs ⛔

Every client-facing route renders a `NotBuilt` placeholder:

| Route | Lines | What it should be |
| --- | --- | --- |
| `app/me/today/page.tsx` | 5 | The portal itself — design frame `webapp-client-portal.html` |
| `app/invite/[clientId]/page.tsx` | 5 | **The entry point.** How a client accepts. Frame `webapp-auth.html 3b` |
| `app/(auth)/sign-in/paused/page.tsx` | 5 | Wall — this roster is on hold |
| `app/(auth)/sign-in/removed/page.tsx` | 5 | Wall — a trainer ended it |

The sign-in *branching* that reaches them is fully built and correct —
`destinationFor` in `lib/auth/session.ts` handles every role and wall, and
`/sign-in/role`, `/sign-in/unattached` and `/sign-in/new` are real screens. So
the routing spine exists and four leaves are missing. `/invite/[clientId]` is
the one to build first: it is the only door into the portal, and per MUST-15 it
is also where consent is captured.

*(Unrelated and worth knowing: `/reports` is also a stub, and `/settings/hours`
is a genuine redirect to `/settings/profile/work`, not a stub.)*

### MUST-14 · Give the client role something to read ⛔

**The entire client-role API surface is two endpoints**: `GET /v1/client/sync/pull`
and `POST /v1/client/sync/push`. That is the sync protocol built for the offline
Expo client. There is no client-facing REST.

So the portal has two options and only one of them is right:

- ❌ Make the web speak the sync envelope. This contradicts `AGENTS.md` outright
  — the web is online-only, deliberately, with no sync queue and no offline
  chrome — and it would put a reconciliation protocol in a tier that has nothing
  to reconcile.
- ✅ **Add client-scoped REST reads.** Whatever the portal renders — next
  session, current program, recent history, package balance — as plain
  endpoints under `/v1/client/**`, in the shape the trainer half already uses.

**This is a backend gap, and it is not in `BACKEND_GAPS.md`** — that file
reports "no open gaps", which was true when assessed, because it was assessed
for the trainer half. Reopen it with the portal's list before building.

Two rules for those endpoints, both already established: they take their scope
from `app_client_ids()` and never from a path parameter the caller supplies, and
each one needs a rate-limit tier decision — `STANDARD` for reads, and anything
that sends a message goes in `MESSAGING`.

### MUST-15 · Capture consent at the invite 🔶

A trainer types a client's name and phone number into the roster. **The client
never agreed to any of it.** That is defensible while the data exists only to
help the trainer coach them — but the moment the portal ships, that person
becomes a user of your product, holding an account, reading their own record.

Under DPDP this is the question of who is the Data Fiduciary for a client's
record — the trainer, InclineYou, or both — and it is a real legal question rather
than a drafting one. **Get an answer before launch, not after.**

The product answer is already sitting there, unbuilt: **`/invite/[clientId]` is
the consent moment.** It is the first screen a client ever sees, it exists to be
accepted or declined, and a decline already has a meaning the schema records.
Put the notice there — what is held, who entered it, who can see it, how to have
it removed — rather than in a policy page nobody opens. That makes MUST-13's
first screen legally load-bearing, which is a good reason to build it first and
a bad reason to rush it.

Note the erasure tension from §6.7 lands hardest here: a client asking to be
deleted is asking about rows their trainer needs for their own books.

---

## 5.16 · Billing — the trial has to start before anyone can sign up

Raised 30 Aug 2026. `PRICING.md` settles what to charge; **nothing charges it.**
Checked across the whole tree: no `subscription` table, no trial timestamp, no
gateway client, no webhook route, no entitlement check, no invoice. The only meter
that exists is `team.seat_limit` (V26, default 5), which counts seats and knows
nothing about money.

Billing belongs to this book rather than to the mobile runbook, because
**`PRICING.md` §8 puts collection on the web** — trainers subscribe on the
website to stay out of Apple's IAP. The web-first launch order is what makes that
free, and it is why this is the web's problem.

**The severity split is the useful part**, and it is not the obvious one:

- **The trial clock is a hard blocker** (MUST-16). It is the only billing
  component that cannot be added after the first trainer signs up: a trainer
  recorded against a schema with no trial start has no honest expiry, forever.
- **The payment rail is not a launch blocker — it is a day-31 blocker**
  (MUST-17), because the trial is 30 days. Its *approval queues* are the launch
  item: gateway KYC needs the GSTIN, and both are queues like DLT.
- **GST-compliant invoicing is due with the first rupee** (MUST-18), which is
  the same day-31 deadline, decided in `PRICING.md` §8.1.

### MUST-16 · Record the trial, and degrade to read-only ⛔

`PRICING.md`: **30-day free trial, full Pro, no card to start**, and a permanent
free tier at three clients. Neither exists in code.

What has to land before the first non-test signup:

- **A trial start, an expiry, and a state.** `trialing → active → past_due →
  grace (read-only) → free`, and the *trial ends on* date visible to the trainer
  rather than only known to us.
- **Read-only, never locked out.** `PRICING.md` §8: a trainer must never lose
  their money book to a payment failure. A decline that hides somebody's books is
  how you lose the trainer *and* the data that keeps them.
- **The free-tier cap enforced at the write path**, with an error `code` in
  `API.md`'s catalogue — the clients cannot branch on prose (`PLAN_LIMIT_CLIENTS`
  and `SUBSCRIPTION_PAST_DUE`, or names of your choosing).

Two things that are not obvious and are argued in full in the runbook §4b:

- **The billing tables must NOT carry `tenant_id`.** A seat is a *coaching
  trainer*, and V37 deliberately lets one trainer coach in two workspaces — a
  tenant-scoped subscription bills one person twice. They join `app_user` and
  `trainer` on `SCHEMA.md`'s *deliberately not policied* list, with that reason
  written down, because silence there is an oversight.
- **The cap collides with offline writes.** A free-tier trainer adding a fourth
  client with no signal already has the row in their phone's SQLite, and
  `/v1/sync/push` is where it arrives — from a build that predates every code
  above. **Recommendation: the push accepts it; only the web refuses a new one.**
  Losing a trainer's offline work to a billing state is the worst outcome
  available.

**Verify:** create an account on staging, confirm a trial start is stored and an
expiry is shown; move the clock past it and confirm the money book still *reads*;
add a fourth client on the free tier over the web and get a coded refusal; push
the same fourth client through sync and confirm it is not destroyed.

### MUST-17 · Decide the payment rail, and start its queues now 🔶

The rail itself — hosted checkout, **UPI Autopay mandate**, webhooks, dunning —
is due before day 31, not before launch. What is due now is a decision and two
applications.

- **Decide: autopay at launch, or hand-invoice the first cohort?**
  `PRICING.md` §11.3 already floats the second, and the 90-day target of 50–100
  trainers makes it genuinely viable — a UPI collect request and a status flipped
  by hand. Either is defensible. Discovering the question on day 31, when the
  first cohort's trials expire in the same week, is not.
- **Gateway KYC is a queue** (Razorpay or Cashfree): PAN, GSTIN, business bank
  account, incorporation proof, and public **Terms, Refund/Cancellation, Privacy
  and Contact** pages the reviewer actually opens. Start it with DLT.
- **The webhook is the source of truth**, never the browser redirect. It needs a
  public path rule in `SecurityConfig` (first match wins — above the authenticated
  patterns), **signature verification**, **idempotency on the provider's event
  id**, and its own rate-limit tier: `STANDARD` is wrong, because that tier keys
  on a token subject and a webhook has no token.
- **Mandates are regulated.** UPI Autopay requires a pre-debit notification to
  the payer 24 hours ahead (so a day-30 charge is decided on day 29) and
  **self-serve revocation** — a cancel button, not an email to support. ₹499 is
  well under the autopay ceiling; confirm current RBI e-mandate rules and the
  gateway's own limits before building.
- **No card data, still.** §4 gets to say *no card data anywhere*; PSP-hosted
  checkout keeps that true, and it is the largest scope reduction on offer here.

**The gateway: Razorpay, with Cashfree as the alternate.** Not on price — all the
credible Indian options are within a rounding error of each other — but on **UPI
Autopay maturity** and on having a **Payment Links / Invoices** product that
covers the hand-invoice path above with no code at all. Stripe is the one to rule
out despite the familiarity: restricted Indian onboarding and the weakest
UPI-Autopay story, and a UPI mandate is the entire collection strategy. Keep it
behind a `BillingProvider` interface the way V41 kept the token issuer behind
`AuthTokenIssuer`, and the choice stays a class rather than a project. The runbook
§4b has the comparison, the table shapes and the four endpoints.

**Hosted redirect, not the gateway's JS SDK — and this one is on this book's
critical path.** §1's load-bearing property is that no browser talks to anything
but the Next server. Embedding `checkout.js` breaks it and forces §8-G's CSP to
allow a third-party **script and frame origin on the money screen**. Redirecting
to the gateway's hosted page keeps the CSP at `default-src 'self'` and keeps card
data off our origin entirely, for the price of a page transition. **If the SDK is
ever adopted, the CSP allowlist becomes a launch item.**

**What it costs — small, and not where the effort belongs.** UPI and RuPay debit
carry **0% MDR by regulation**, cards run ~2% (₹9.98 on a ₹499 charge, and the
18% GST on that fee is now reclaimable input credit). At the 90-day target of
50–100 paying seats that is **₹0–500/month on UPI, ~₹500–1,000 on cards**, against
~₹3,520 of infrastructure in §6.4a. Insist on zero fixed fees — no setup, no AMC,
no monthly charge on the subscriptions product — and get **one answer in writing:
what is charged on a UPI Autopay debit**, nothing or a flat per-debit fee. The
real number is elsewhere: 2% of ₹499 is ₹10, and one trainer whose mandate fails
unnoticed is ₹423. **Mandate success and dunning, not MDR.**

### MUST-18 · GST-compliant invoices from the first payment 🔶

Decided in `PRICING.md` §8.1, and it is a billing-system requirement rather than
an accounting one: our GSTIN, the correct **place of supply**, the **SAC** on the
line item, and an invoice series that never repeats and never skips.

**₹499 is inclusive**, so the invoice does not say ₹499 of revenue — it is
**₹422.88 + ₹76.12**, and every figure in `PRICING.md` is computed on the first
number. Confirm the SAC and the B2C place-of-supply rule with the CA rather than
deriving them.

*(The good half, already banked in §6.4a's arithmetic: registered, the 18% OIDAR
GST on hosting becomes reclaimable input credit.)*

---

## 6. Where to deploy — India first, and hands-off

**The governing requirement is no devops.** Stated 30 Aug 2026: no manual
deploys, no babysitting servers, no hand-rolled backups. That is a legitimate
constraint for a solo micro-SaaS and it changes the answer below — it promotes
*ops burden* to a first-class criterion alongside latency, and it demotes the
big clouds, which are the most capable and the least hands-off.

### 6.1 What this app forces

Five constraints that eliminate most of the field before any vendor comparison:

1. **Hands-off, or it is the wrong provider.** Git push → deploy. Managed
   Postgres with automated backups. Managed Redis. Automatic TLS. See §6.2 for
   what that means concretely and §6.6 for what it honestly cannot cover.
2. **All four pieces in ONE city — not merely one country.** Next and Spring
   must be co-located because every page render is an internal API call (§1),
   *and* the database must be with them because a page makes many queries. India
   has two commodity regions, **Mumbai** (`ap-south-1` / `asia-south1`) and
   **Bangalore** (DigitalOcean `BLR1`), roughly 1,000 km apart. Mixing them —
   an app in Bangalore against Supabase in Mumbai — adds ~20–30 ms to *every
   query*, not every page. **Pick a city and put everything in it.**
3. **The database must allow a non-owning runtime role.** The isolation model is
   RLS with the app as `inclineyou_app` and `inclineyou` owning the tables. A managed
   Postgres that will not let you `CREATE ROLE` and reassign ownership cannot run
   this application safely.
4. **The database connection must be session-mode, never transaction-pooled.**
   `TenantAwareDataSource` sets six `set_config(..., false)` values on connection
   *borrow*, because ten JDBC classes have no transaction above them and
   `SET LOCAL` cannot work. A transaction-mode pooler multiplexes connections per
   transaction — **the tenant context would leak into the next caller's
   request.** The most dangerous configuration mistake available here, and it
   fails silently.
5. **Redis wants real persistence.** `--appendonly yes` is a security
   requirement: without it the wrong-attempt lock resets on restart and "three
   attempts" becomes "three attempts per deploy".

Regions, prices and product tiers move — **verify at decision time.** The five
constraints do not move; screen any provider against them first.

### 6.2 What "hands-off" has to mean

The setup to insist on. Anything a provider does not give you here, you own
forever:

| | Requirement | Why it matters to you specifically |
| --- | --- | --- |
| ✅ | **Git push → auto deploy**, both apps, no CLI step | The thing you said you do not want to do |
| ✅ | **Managed Postgres: automated daily backups + point-in-time recovery** | Backups you never run. PITR is the difference between losing a day and losing an hour |
| ✅ | **Managed Redis** — never a self-hosted container | A self-hosted Redis makes its AOF file your backup problem |
| ✅ | **Automatic TLS issue and renewal** | An expired certificate at 2am is the classic unmanaged-ops incident |
| ✅ | **Health check with automatic restart** | The app recovers without you |
| ✅ | **Built-in alerting to a phone** | You are not monitoring; you are being told |
| ✅ | **No OS to patch** — PaaS or managed containers, never a VM | A Droplet or an EC2 instance is a machine you now own |
| ✅ | **Rollback to the previous deploy in one click** | Your incident response, given no on-call |

**This rules out IaaS entirely.** Raw VMs, Kubernetes, and Indian IaaS providers
like E2E Networks are all wrong for you regardless of price or locality — they
hand you a machine, and a machine is a job.

### 6.3 The options, rated

**Ops burden** is the column to read first: 🟢 hands-off · 🟡 some setup, then
quiet · 🔴 a real ongoing job.

**Frontend — Next.js 16 SSR (needs a Node runtime; not a static export)**

| Option | Ops | Indian region | Verdict |
| --- | --- | --- | --- |
| **DigitalOcean App Platform** | 🟢 | **BLR1** | Git push, auto TLS, auto restart. Co-locates with its own managed DB and Redis. **The recommendation.** |
| Vercel | 🟢 | Mumbai `bom1` (paid) | Best-in-class DX, and still a *cross-provider* hop to your backend. Only coherent if the backend is also in Mumbai |
| Fly.io | 🟡 | Mumbai `bom` | `fly deploy` is pleasant; verify the current managed-Postgres story before relying on it (their classic Postgres made you the DBA) |
| Railway | 🟢 | **none** | Delightful, hands-off, and Singapore is the nearest region |
| Render | 🟢 | **none** | Same story — Singapore |
| Cloudflare Workers | 🟡 | edge | Adapter maturity on Next 16; remote from your backend anyway |
| AWS Amplify / ECS | 🔴 | Mumbai | Capable, and not hands-off |

**Backend — Spring Boot, JVM, containerised**

| Option | Ops | Indian region | Verdict |
| --- | --- | --- | --- |
| **DigitalOcean App Platform** | 🟢 | **BLR1** | Deploys a Dockerfile from git. Same platform as the frontend, same city, one bill |
| GCP Cloud Run | 🟡 | Mumbai `asia-south1` | Excellent once wired; needs Artifact Registry + Cloud Build + IAM first. **`min-instances ≥ 1`** — JVM cold starts make scale-to-zero a bad trade |
| AWS App Runner | 🟡 | Mumbai | The hands-off face of AWS. Fewer knobs than ECS, which is the point |
| Fly.io | 🟡 | Mumbai `bom` | Good container story, small ops tail |
| Azure Container Apps | 🟡 | Central India | Fine; least common for this stack |
| Railway | 🟢 | **none** | Currently planned. Singapore |
| AWS ECS Fargate | 🔴 | Mumbai | ALB, task definitions, ECR, IAM, VPC, security groups, a pipeline. A job |
| Zoho Catalyst | ❓ | India | Indian provider and data centres. Verify JVM container support and whether Postgres-with-custom-roles is even possible |

**Database — Postgres 16, custom roles, RLS**

| Option | Ops | City | Verdict |
| --- | --- | --- | --- |
| **DO Managed Postgres** | 🟢 | Bangalore | Daily backups + PITR, custom roles fine. **Use the direct port — its pooler is PgBouncer** (constraint 4) |
| Supabase | 🟢 | Mumbai | Cheap and pleasant. Two checks: session-mode connection only, **never port 6543**; and verify `CREATE ROLE`, ownership and `afterMigrate__sync_app_role_password.sql` run, since their `postgres` is not a superuser |
| Aiven | 🟢 | Mumbai | Genuinely managed, custom roles fine, session connections fine. Pricier |
| GCP Cloud SQL | 🟡 | Mumbai | Solid, automated backups + PITR, a little more console work |
| AWS RDS | 🟡 | Mumbai | The most compatible option in existence for this schema. `rds_superuser` creates roles, no pooler surprises. Not hands-off to set up |
| Neon | 🟢 | verify | Verify Mumbai availability and pooler mode before considering |

**Redis — OTP state and rate limits**

| Option | Ops | City | Verdict |
| --- | --- | --- | --- |
| **DO Managed Redis/Valkey** | 🟢 | Bangalore | Simple, regional, managed |
| Aiven | 🟢 | Mumbai | Configurable persistence; confirm AOF or equivalent |
| Upstash | 🟢 | Mumbai | Very cheap; its durability model is its own — **confirm a lock survives a restart** before relying on it (constraint 5) |
| ElastiCache | 🟡 | Mumbai | Fine, AWS-shaped |
| Self-hosted container | 🔴 | — | You now own the AOF file and its backups. Against §6.2 |

**If Redis is absent or misconfigured** nothing breaks, but rate limits fall back
to in-process buckets — **the effective limit multiplies by instance count.** Run
one instance, or run Redis.

### 6.4 The tension, and the recommendation

**The lowest-ops platforms mostly have no Indian region, and the Indian regions
mostly belong to higher-ops clouds.** Railway and Render are exactly the
hands-off experience you want and both stop at Singapore. AWS and GCP are in
Mumbai and both cost you real ops time. Precisely one option sits in the
intersection.

**→ DigitalOcean App Platform, everything in BLR1 (Bangalore).**

Both apps deployed from git, Managed Postgres and Managed Redis in the same
city, automatic TLS, automated backups with PITR, health checks with restart,
built-in alerting, and one bill. It satisfies all five constraints in §6.1 and
every row of §6.2. It is not the most powerful platform on this page and that is
not what you asked for.

**Alternates, in order:**

| | Stack | Ops | When to pick it |
| --- | --- | --- | --- |
| **B** | **GCP Cloud Run + Cloud SQL + Memorystore**, all `asia-south1` (Mumbai) | 🟡 | You want Mumbai specifically, or expect scale where Cloud Run's model pays. Accept a day of IAM and pipeline setup, then it is quiet. `min-instances ≥ 1` |
| **C** | **Vercel (`bom1`) + AWS App Runner + RDS + ElastiCache**, all Mumbai | 🟡 | You want Vercel's frontend DX. Only coherent with the backend also in Mumbai |
| **D** | **Railway, all Singapore** | 🟢 | A beta, or buying time. Everything hands-off, ~40–60 ms of avoidable latency on every hop, and this app makes several per page |
| **E** | **AWS `ap-south-1` full** — ECS, RDS, ElastiCache, one VPC, private subnets | 🔴 | A gym chain sends a security questionnaire. Deliberately last: it contradicts the governing requirement |

**On Vercel:** a good product, and the wrong *default* here purely because of §1.
The coherent version pins functions to `bom1` **and** puts the backend in Mumbai
— never Vercel's default region against an Indian backend.

**On Railway:** it is the current plan and it has no Indian region. Staying on it
for a beta is defensible. Launching an India-first product from Singapore is a
choice worth making consciously rather than by inheritance.

### 6.4a What it costs

**These are estimates, not quotes.** Provider pricing and tier names move;
**price it in the DigitalOcean console before committing.** The shape of the bill
is stable even when the numbers are not, and the shape is what matters here:
four line items, none of them surprising.

| Component | Size | ~USD/mo | ~INR/mo |
| --- | --- | --- | --- |
| **Next.js** — App Platform container | 1 GB / 1 vCPU | ~$10–12 | ~₹880–1,060 |
| **Spring Boot** — App Platform container | 1 GB (tight, needs JVM tuning) | ~$10–12 | ~₹880–1,060 |
| | 2 GB (comfortable) | ~$20–25 | ~₹1,760–2,200 |
| **Managed Postgres** | 1 GB / 10 GB disk | ~$15 | ~₹1,320 |
| **Managed Redis/Valkey** | 1 GB — **deferrable, see below** | ~$15 | ~₹1,320 |
| TLS, load balancer, health checks, backups | included | $0 | ₹0 |

*INR at **₹88 = $1**. State the rate rather than bury it — re-run the column when
it moves, and note **DigitalOcean bills in USD**, so this line carries forex risk
that a rupee-priced subscription does not.*

| Scenario | USD/mo | INR/mo | + 18% GST |
| --- | --- | --- | --- |
| **Launch** — single instance, Redis deferred | ~$35–40 | ~₹3,080–3,520 | **~₹3,640–4,150** |
| With Redis | ~$50–55 | ~₹4,400–4,840 | ~₹5,190–5,710 |
| With staging on smallest tiers | ~$75–95 | ~₹6,600–8,360 | ~₹7,790–9,865 |

**Add 18% GST.** Imported digital services fall under India's OIDAR rules, so
the bill carries it. If you are GST-registered you account for it under reverse
charge and can claim input credit, which effectively removes it; if you are not
registered, it is a real 18% you cannot reclaim. **That is a question for a CA,
and it is worth asking before the invoices start** — see `PRICING.md`, which
carries the full cost model this table feeds.

#### Redis is genuinely optional at launch — with one condition

`REDIS_ENABLED=false` is a supported configuration, not a degraded one, and CI
already proves it: **there is no Redis in CI** and all 256 tests pass. Both
things Redis holds have real fallbacks:

- **OTP state falls back to Postgres.** The wrong-attempt lock is
  `otp_request.locked_until` (V17) with a pessimistic row lock in `JpaOtpStore`,
  and the daily send ceiling is counted from `otp_request` rows. **Both stay
  persistent across a restart** — which was V17's entire point — so the security
  property Redis was protecting does not depend on Redis.
- **Rate limiting falls back to in-process buckets.**

**The condition is exactly one backend instance.** In-process buckets do not
share state, so the effective rate limit multiplies by instance count. Add Redis
the day you add a second instance — and treat that as the trigger, written down,
rather than something to notice later.

#### Sizing notes

- **The JVM is the thing to watch.** Spring Boot 4 with Hibernate, HikariCP,
  Flyway and the Firebase Admin SDK is not comfortable in 512 MB. Start at 1 GB
  with `-XX:MaxRAMPercentage=70`, and move to 2 GB rather than debugging an OOM
  kill at 7am. Next.js SSR is the cheaper of the two.
- **Postgres 1 GB is right for launch** and has plenty of headroom for a few
  hundred trainers; this schema's rows are small and there is no media.
- **Staging should not be a second production.** Smallest container tiers and a
  dev-tier database. Its job is catching *configuration* differences (§9), which
  does not need production-shaped hardware.

#### Three things to verify in the console, because they are §6.2 requirements

1. **Point-in-time recovery is available on the database tier you pick** — daily
   backups alone are not what §6.2 asks for, and PITR is sometimes a higher tier.
2. **Zero-downtime deploys** — the cheapest App Platform tier may restart the
   container on deploy rather than rolling it. A few seconds of downtime is
   survivable at launch; know whether you are buying it.
3. **Included bandwidth and the overage rate** — small for this app (no media, no
   uploads), but know the number.

#### How the alternates compare

Roughly, at this scale: **GCP Cloud Run (stack B) lands in the same range for
compute** — `min-instances = 1` removes the scale-to-zero saving that makes Cloud
Run cheap — **but Cloud SQL costs meaningfully more than DO's managed Postgres**,
so B is the pricier option as well as the higher-ops one. **Railway (stack D) is
comparable on price**; you are paying the same money for Singapore. AWS (stack E)
is the most expensive by some distance once RDS, ElastiCache and an ALB are
running.

**Cost is not the reason to choose DigitalOcean here** — the reason is §6.4. It
simply also happens to be the cheapest of the four.

### 6.5 Verifying co-location after deploy

Do not assume the console. Measure once, from inside the deployed backend:

- Spring → Postgres round trip: **single-digit ms**. Tens of ms means a
  cross-city hop and constraint 2 was broken.
- Next → Spring for one page render: **single-digit ms**.
- Then load `/today` end-to-end from an Indian connection and compare against
  local. A large gap that the two hops above do not explain is a CDN or TLS
  problem, not a locality one.

### 6.6 What stays manual, honestly

Managed hosting outsources *execution*, never *ownership*. Even on the
recommendation, these remain yours, and no provider removes them:

| Recurring | Effort |
| --- | --- |
| Responding when an alert fires | rare, unpredictable |
| **A restore test — actually restoring a backup, once** | an hour, once. An untested backup is not a backup |
| Approving dependency bumps (Dependabot raises them) | minutes a month |
| Rotating secrets | an hour a year, and easier after M1 |
| The SMS account, DLT templates, spend alarm | not a hosting concern at all |

Realistically **one to two hours a month**, not zero. Budget it as such; the
alternative is discovering it during an incident. Everything else on this page is
chosen so that the list stays this short.

### 6.7 Data residency and DPDP

India's Digital Personal Data Protection Act, 2023 is the regime. Two things to
be accurate about:

- **It is not a hard localisation mandate.** DPDP permits cross-border transfer
  except to countries the government restricts by notification — unlike the RBI's
  payments rules, which *are* localisation and which do not reach you because
  **you store no card data**. Bangalore or Mumbai is therefore a latency and
  trust decision more than a legal one, which is what makes §6.4 a free choice.
- **Its other obligations are real**: consent, purpose limitation, breach
  notification, and data-principal rights including correction and erasure. Your
  soft-delete-everything design is in genuine tension with an erasure request, and
  V36 already decided a deleted trainer's row is retained. **Have an answer for
  "delete my data" before a trainer asks** — and per MUST-15, before a *client*
  asks, which is the harder version.

**The DPDP Rules were still being finalised as of this writing — verify current
status and deadlines.** Get a lawyer on the privacy policy; none of this is legal
advice.

## 7. Release sequence

| Phase | Work | Depends on |
| --- | --- | --- |
| **0 · Start the clock** | MUST-1 DLT registration · **GST registration → payment-gateway KYC (MUST-17)** · the Data Fiduciary question (§5.13) | nothing — do these first, they are queues you do not control |
| **1 · Make it deployable** | MUST-3 Dockerfiles · MUST-4 web CI · MUST-6 API-URL module | nothing |
| **2 · Close the gaps** | MUST-2 session header · MUST-5 `@Valid` · MUST-7 headers · MUST-8 origins · MUST-9 secret | nothing |
| **2a · Trial clock** | **MUST-16** — trial start, expiry, states, read-only degrade, free-tier cap. Small, and it must precede the first real signup | nothing |
| **2b · Client portal** | MUST-14 client REST endpoints → MUST-13 build the four screens → MUST-15 consent on the invite. **Start the Data Fiduciary question in parallel — it is a lawyer's queue, like DLT** | nothing; longest engineering item |
| **3 · Provision** | Pick a stack from §6.4 — **default: DigitalOcean App Platform, all BLR1**. Bring up **staging first**, identically configured, deploying the same way production will | phase 1 |
| **4 · Transport pass** | `sslmode=verify-full` · `REDIS_SSL` · `REQUIRE_HTTPS` **with** `FORWARD_HEADERS=framework` · `OTP_DEV_CODES_IN_LOG=false` | phase 3 |
| **4b · Prove locality** | Measure both hops per §6.5. Cheap now, and the one thing that is expensive to discover after launch | phase 3 |
| **5 · Wire SMS** | Implement the provider; test on two carriers | phase 0 clearing |
| **6 · Launch** | §8 signed off on staging then production; monitoring live; flip DNS | all above |
| **7 · Launch week** | MUST-10 refresh · MUST-11 middleware · MUST-12 sweeper · M1 rotation · M3 toll-fraud tuning | launch |
| **8 · Before day 31** | MUST-17 payment rail (or the decision to hand-invoice) · MUST-18 GST invoice. **The first cohort's trials all expire in the same week** | phase 0 clearing |

Phases 1 and 2 are independent of every hosting decision — they can be done
before anything in §6 is chosen.

---

## 8. Production checklist

Verified against **staging**, then re-verified against **production** after the
first deploy. An item not observed passing is not done. Items marked *(verify)*
are already built per §4 and only need confirming in the deployed environment.

### 0 · Deployment automation (the governing requirement, §6.2)
- [ ] **Git push → deploy, both apps.** No manual deploy step anywhere in the path
- [ ] Automatic TLS issue **and renewal** — confirm renewal is automatic, not just issuance
- [ ] Managed Postgres and managed Redis — **no self-hosted container for either**
- [ ] **No VM or OS you are responsible for patching**
- [ ] All four pieces in **one city** — verified by measurement, not by console (§6.5)
- [ ] Staging deploys the same way production does, from the same definition

### A · Secrets and configuration
- [ ] `JWT_SECRET` freshly generated (≥ 32 chars), never in git, in the secret store
- [ ] `APP_DB_PASSWORD` and `MIGRATION_DB_PASSWORD` distinct and generated
- [ ] `APP_DB_USERNAME=inclineyou_app` in production — **not** `inclineyou`
- [ ] `INCLINEYOU_API_URL` set, HTTPS, app refuses to start without it (MUST-6)
- [ ] No `.env` in any image; `git log -p` audited for a committed secret
- [ ] Rotation procedure written down and rehearsed once

### B · Transport
- [ ] `DATABASE_URL` carries `sslmode=verify-full` with a CA cert — not `require`
- [ ] *(verify)* boot log reads `Database transport: ENCRYPTED`
- [ ] `REDIS_SSL=true` and a `rediss://` endpoint
- [ ] `REQUIRE_HTTPS=true` **and** `FORWARD_HEADERS=framework` — both, or neither
- [ ] *(verify)* HSTS present on a real response; HTTP redirects rather than also serving
- [ ] TLS 1.2 minimum, 1.3 preferred, confirmed by an external scanner
- [ ] Database has **no public endpoint**, or is IP-restricted to the app

### C · Authentication and session
- [ ] **MUST-2 done** — sign in, sign out, replay the old cookie, confirm 401
- [ ] *(verify)* cookies are `httpOnly`, `secure`, `sameSite=lax`, `path=/` — check `secure` really is on, it keys off `NODE_ENV`
- [ ] *(verify)* OTP 3 attempts · 10-min lock · `[30,60,120]` ladder · 10/day — observed, not assumed
- [ ] *(verify)* wrong-attempt lock survives a backend restart (this is what AOF is for)
- [ ] `OTP_DEV_CODES_IN_LOG=false`, and no code found in the aggregator
- [ ] Session expiry actually expires; `SessionSweeper` running
- [ ] Enumeration: an unknown number and a known one are indistinguishable in response **and timing**
- [ ] **Client** sign-out revokes too — same test as MUST-2, run as a client
- [ ] A client on two rosters switching `inclineyou_client` reads only the roster they switched to

### D · Authorization and tenant isolation
- [ ] *(verify)* boot log reads `Database identity: inclineyou_app — row-level security is ACTIVE`
- [ ] *(verify)* `TenantIsolationTest` green in CI
- [ ] Manual cross-tenant probe on staging with **two real accounts**: trainer A cannot read B's client by direct id — expect 404, not 403
- [ ] *(verify)* no `/v1/team/**` response carries `package`, `payment` or `gym_settlement`, except owner-only `GET /v1/team/revenue`
- [ ] Every route under `(main)` has a guard, or middleware covers it (MUST-11)
- [ ] **Tier-4 probe with two real client accounts**: client A cannot read B's program, sessions, package or payments by direct id — and a client reaches no trainer-scoped route at all
- [ ] *(verify)* a client role reaching `/v1/clients/**` (trainer-side, plural) is refused — the path similarity to `/v1/client/**` is one typo from a hole
- [ ] Tier-4 isolation added to `TenantIsolationTest`, not just probed by hand

### E · Input and injection
- [ ] **MUST-5 done** — `@Valid` on all nine unguarded write endpoints
- [ ] *(verify)* all SQL parameterised — no concatenation into a query string
- [ ] *(verify)* no `dangerouslySetInnerHTML` anywhere
- [ ] Free-text fields (`service_areas`, notes, `map_link`) render as text, never markup
- [ ] No upload path exists — if one is added, this section grows

### F · Rate limiting and abuse
- [ ] `RATE_LIMIT_ENABLED=true`
- [ ] **If Redis is deferred (§6.4a): exactly one backend instance, and "add Redis before scaling to two" written into the runbook.** In-process buckets do not share state, so a second instance silently doubles every limit
- [ ] If Redis is on: rate limiting **verified across two instances**, not assumed
- [ ] `FORWARD_HEADERS=framework`, or every user shares one bucket keyed on the proxy
- [ ] *(verify)* `MESSAGING` tier at 10/min — each call spends real money
- [ ] Per-IP and per-prefix OTP ceilings added once SMS is live (M3 in `IDENTITY.md`)
- [ ] Spend alarm on the SMS account, set below the amount that would hurt
- [ ] Rate limits verified **as a client**, keyed per client and not per trainer — clients are the untrusted population (§5.13)

### G · Web headers and browser posture
- [ ] `Content-Security-Policy` — start `default-src 'self'`; nonce, never `unsafe-inline`
- [ ] Billing uses a **hosted redirect**, so the CSP above needs no third-party `script-src`/`frame-src` — if the gateway's JS SDK was adopted instead, that allowlist is done and reviewed (MUST-17)
- [ ] `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'` — clickjacking on a money screen
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` — client ids must not leak in referrers
- [ ] `Permissions-Policy` denying camera, microphone, geolocation
- [ ] Server Actions `allowedOrigins` set (MUST-8); a foreign-`Origin` POST refused
- [ ] *(verify)* only `NEXT_PUBLIC_SUPPORT_WHATSAPP` reaches the client bundle

### H · Logging and PII
- [ ] *(verify)* phone numbers masked — confirm no new call site bypasses `masked()`
- [ ] No OTP, token or session hash in any log line
- [ ] Log retention bounded; aggregator access list reviewed
- [ ] Error responses carry no stack traces in production

### I · Dependencies
- [ ] `npm audit` and an OWASP dependency check on Maven, both clean of highs
- [ ] Next 16.3.2 and Spring Boot 4.1 confirmed current at launch; advisory feeds subscribed
- [ ] Dependabot or equivalent enabled
- [ ] Base images pinned by digest

### J · Backups and recovery — provider-run, per §6.2
- [ ] **Automated daily backups are the provider's job and are switched on** — no cron of yours, no manual `pg_dump` in the loop
- [ ] **Point-in-time recovery enabled**, and the window known (the difference between losing an hour and losing a day)
- [ ] **A restore actually performed** into a scratch database — an hour, once, and the one item in §6.6 nobody can do for you
- [ ] Backups confirmed encrypted at rest
- [ ] Any manual `pg_dump` encrypted or destroyed after use
- [ ] RTO and RPO written down, even if the answer is "a day"

### K · Monitoring and response — push, never poll (§6.2)
- [ ] Uptime check on `/health` with alerting that **reaches a phone**. You are not watching a dashboard; you are being told
- [ ] **Health check wired to automatic restart** so the common case needs no human at all
- [ ] Error tracking (Sentry free tier) on both halves
- [ ] Alerts on: auth-failure spikes, 5xx rate, DB connection saturation, SMS spend
- [ ] **One-click rollback to the previous deploy verified** — with no on-call, this is your incident response
- [ ] Written incident procedure — **including how to revoke every session**, which requires MUST-2
- [ ] Both boot diagnostics checked after **every** deploy, not just the first

### L · Legal
- [ ] Privacy policy published, DPDP-shaped, lawyer-reviewed
- [ ] Terms of service published
- [ ] A real answer to a deletion request, given soft-delete-everything (§6.7)
- [ ] Consent language at sign-up covering what is stored and why
- [ ] **Two classes of data subject covered** — the trainer who signed up, and the client whose number a trainer typed in (§5.13)
- [ ] **Consent captured on the invite screen** (MUST-15), not only in a policy page
- [ ] **Answered: who is the Data Fiduciary for a client's record** — trainer, InclineYou, or both. A lawyer's question, needed before launch
- [ ] A client's deletion request has an answer that survives their trainer still needing the books
- [ ] A named contact for data questions

### M · Billing and entitlements (§5.16)
- [ ] ⛔ **A trial start is recorded for every account**, an expiry computed, and the *trial ends on* date shown to the trainer
- [ ] Past-due degrades to **read-only** — the money book still opens (`PRICING.md` §8)
- [ ] Free-tier cap (3 clients) refused on the web with a `code` in `API.md`; the same row through `/v1/sync/push` is **not** destroyed
- [ ] Billing tables carry **no `tenant_id`**, and are on `SCHEMA.md`'s not-policied list with the reason written down
- [ ] Payment path decided in writing: autopay at launch, or hand-invoice the first cohort
- [ ] Gateway pricing confirmed **in writing**: 0% on UPI, the per-debit autopay fee (if any), no setup fee, no AMC, no monthly subscriptions-product fee, the chargeback fee
- [ ] The integration sits behind a `BillingProvider` interface — no gateway type leaks above it
- [ ] Gateway approved, **UPI Autopay enabled**, one real low-value mandate + debit end-to-end
- [ ] Webhook: **signature verified**, **idempotent on the event id**, own rate-limit tier, public path rule above the authenticated patterns
- [ ] Mandate **cancellation is self-serve** in the product
- [ ] No card, CVV or UPI PIN reaches our servers or logs — §4's *no card data anywhere* still true
- [ ] First GST invoice checked by the CA: GSTIN, place of supply, SAC, unbroken series, ₹499 → ₹422.88 + ₹76.12
- [ ] Alerts: trials expiring this week · mandate-failure rate · **unprocessed webhook events** · a renewal window with zero successful debits
- [ ] The Expo app confirmed to carry **no price, no purchase and no steering link** (runbook §5D)

---

## 9. Day-two operations

- **Deploys are independent.** The additive-only law makes that safe: the backend
  must never remove a response field, so an older web build keeps working through
  a rolling deploy.
- **Migrations** run on the migration credentials at startup. Additive only, no
  exceptions, never edit one that has run.
- **Staging is a second full environment**, identically configured. Its value is
  not catching bugs; it is catching *configuration* differences, which is where
  every item in §8-B fails.
- **The two boot lines are the real health check.** `Database identity: inclineyou_app —
  RLS ACTIVE` and `Database transport: ENCRYPTED`. If either is wrong, the
  deployment is wrong in a way nothing else will tell you.

---

## 10. Open questions

1. **Which SMS provider, and has DLT registration started?** The critical path.
   Everything else parallelises; this cannot be compressed.
2. **Confirm DigitalOcean App Platform, all BLR1?** It is the only option in the
   intersection of *hands-off* and *Indian region* (§6.4). The alternative worth
   a moment is GCP Cloud Run in Mumbai — one day of setup, then quiet — if you
   would rather be in Mumbai than Bangalore.
3. **Is Railway a hard constraint?** No Indian region; nearest is Singapore.
   Perfectly hands-off, which is why it is tempting. Fine for a beta; launching
   an India-first product from Singapore is a choice worth making consciously
   rather than by inheritance.
4. **Custom domain and support email?** Needed for the privacy policy contact and
   for the HSTS `includeSubDomains` decision in §8-G.
5. **Is there a launch date?** It decides whether MUST-10 and M1 are launch items
   or launch-week items.
6. ~~Does the client portal ship in v1?~~ **Answered 30 Aug 2026: yes.** It is
   four stub routes and has no REST surface to read from, so it is now MUST-13,
   MUST-14 and MUST-15 — see §5.13. **This is the largest piece of engineering
   left in this book**, and it likely sets the launch date rather than DLT.
7. **Autopay at launch, or hand-invoice the first cohort?** MUST-17, and
   `PRICING.md` §11.3 raises it too. Fifty invoices a month is hand-collectible
   and buys time to build the rail against real customers. Needs an answer
   before launch even though the rail itself is not due until day 31.
8. **Has GST registration started?** It gates gateway KYC, which gates every
   form of collection, and it makes the hosting GST in §6.4a reclaimable.
9. **Who is the Data Fiduciary for a client's record** — the trainer, InclineYou, or
   both? A lawyer's question, raised by MUST-15, and worth starting now because
   it gates the copy on a screen that has to be built anyway.

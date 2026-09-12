# InclineYou — End-to-End Deployment Runbook (iOS + Android)

**Stack:** React Native (Expo + EAS) app · Java + Spring Boot backend on **Railway (managed)** · Redis (managed, AOF on) · PostgreSQL (managed) · object storage (R2/S3) · WhatsApp BSP · FCM · UPI deep link (client → trainer) · **payment gateway for the trainer's own subscription (Razorpay recommended) — not wired, see §4b** · phone OTP.
**Release strategy:** iOS + Android **at the same time**, using **organization** developer accounts.

---

## 0. Mental model — two release trains

- **Backend train** — Railway, deploy whenever you want (push → auto-deploy). Because old app versions live on users' phones, the backend must stay **backward-compatible (additive-only)**, per the schema-evolution contract.
- **App train** — every native/store change goes through **both** Google Play *and* Apple App Store review; users update on their own schedule. JS/UI-only fixes bypass both stores via **EAS Update (OTA)**.

---

## 1. Start these early — lead-time items (do in parallel with building)

- [ ] **Get a D-U-N-S number (free) — do this first.** It unlocks the **Google Play organization account** (which is *exempt from the 12-tester closed-testing gate* — you publish straight to production) and, if you want it, **Apple organization enrollment**. It takes a few days to ~2 weeks, so start now. This single step removes the Android tester requirement.
- [ ] **Google Play organization account** (verified with the D-U-N-S) → no 12-tester gate; publish to production after review.
- [ ] **Apple Developer account ($99/year).** Enroll as an **organization** (uses the D-U-N-S, cleaner seller name) — or as an **individual**, which is faster and perfectly fine since TestFlight has no tester gate. Org verification can take days–weeks; plan for it.
- [ ] **WhatsApp utility templates** → submit for Meta approval via your BSP (takes time).
- [ ] **SMS DLT (TRAI)** for transactional SMS — or skip it with **WhatsApp OTP**.
- [ ] **Privacy policy URL** + **Play Data Safety** form + **Apple App Privacy** ("nutrition label") — all required to publish. You collect minimal PII, no medical data.
- [ ] **GST registration (GSTIN)** — `PRICING.md` §8.1 decided to register ahead of the ₹20 lakh threshold, and every payment gateway asks for the GSTIN before it will approve an account. Its own queue; start it with the D-U-N-S.
- [ ] **Payment gateway account — Razorpay (recommended), Cashfree as the alternate** → KYC review: PAN, GSTIN, business bank account, incorporation proof, and a live website they read. Days to weeks. Ask for **UPI Autopay enablement** and a written answer on **per-debit fees** in the same thread. **This is how the trainer pays *us*** — see §4b, which is a launch blocker.
- [ ] **Public Terms, Refund/Cancellation and Contact pages** — required by the gateway before approval, not only by the stores. The privacy policy above is the same page set.

> With the org account, your **critical path is the D-U-N-S + Apple enrollment lead time and store review** — not a 14-day test. Get the D-U-N-S moving today.

---

## 2. Deploy the backend (Spring Boot + PostgreSQL) — managed on Railway

1. **Containerise** the app — a Dockerfile that builds the jar and runs it on a slim JRE image.
2. **Railway project:** connect the GitHub repo → Railway builds the Dockerfile and deploys → gives an HTTPS URL. Add **managed PostgreSQL** in the same project (private networking, same invoice, automated backups).
3. **Secrets** as Railway environment variables — DB URL, JWT secret, BSP API key, SMS key, R2 keys, FCM service-account. Never commit secrets.
4. **Migrations** — Flyway runs on app startup; the first deploy creates the schema. Every later migration is additive.
5. **Custom domain + HTTPS** — point `api.yourdomain` at the Railway service; TLS is automatic.
6. **Smoke test against production** — `/health`, then the OTP → create-client → sync round-trip.
7. **Backups** — Railway's managed Postgres backs up; still export periodically and **test a restore once**.

> **Not Vercel for the backend.** Vercel is built for frontend/serverless (Next.js/Node), not a long-running Java service. Keep Vercel in mind later for a **web landing page or the trainer web dashboard** — not for this backend.

---

## 2b. Redis (OTP state + rate limiting) — managed on Railway

Added when the one-time codes and the API rate limiter moved off Postgres. Small,
but it carries two abuse controls, so the configuration is not free-form.

1. **Provision** — add a Redis service to the same Railway project (private
   networking, so it is never exposed publicly).
2. **`appendonly yes` is mandatory.** ⚠ This is the one setting that must not be
   skipped. The OTP lock and the daily send ceiling are abuse controls; V17 moved
   the lock out of memory precisely so a restart could not clear it, and a Redis
   without AOF puts that straight back — the brute-force ceiling silently becomes
   "three attempts per Redis restart". Verify after provisioning:
   ```
   redis-cli config get appendonly     # must be: yes
   ```
3. **Env vars** — `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`. Absent or
   unreachable is survivable (see below) but is not the intended running state.
4. **`REDIS_ENABLED=false`** is the kill switch if Redis ever misbehaves in
   production. The app keeps working: OTP state falls back to the `otp_request`
   table and rate limiting to in-process buckets.

**What happens when Redis is down.** Nothing user-visible. Sign-in works, the
limits still hold — the OTP ones from Postgres exactly as before, the API ones
per-instance rather than globally. This is verified behaviour, not a hope: the
backend boots and passes its full suite with no Redis reachable at all. The one
thing to know is that a lock imposed while Redis was up is still honoured after a
failover, because it is mirrored to Postgres and sign-in takes the later of the
two.

**Memory** is negligible — three short-lived keys per number mid-sign-in plus one
bucket per active caller, all TTL'd. A 256 MB instance is generous.

---

## 2c. Encryption in transit and at rest

Two different threats, which is why both are needed and neither substitutes for
the other. **In transit** protects data moving between two machines — the threat
is somebody on the wire. **At rest** protects data sitting on a disk — the threat
is somebody holding the storage: a stolen volume, a leaked backup file, a
misconfigured bucket.

### In transit

| Hop | What to set | Notes |
| --- | --- | --- |
| Client → API | HTTPS, `REQUIRE_HTTPS=true`, `FORWARD_HEADERS=framework` | Railway terminates TLS. **Set the two variables together** — behind a terminating proxy every request reaches the container as plain HTTP and only `X-Forwarded-Proto` says otherwise, so `REQUIRE_HTTPS` alone is an infinite redirect. HSTS (one year, `includeSubDomains`) is emitted automatically on secure requests. |
| API → Postgres | `?sslmode=verify-full&sslrootcert=<ca.pem>` on `DATABASE_URL` | **The default is a silent downgrade.** libpq defaults to `sslmode=prefer`: TLS if offered, plaintext without complaint if not. `require` encrypts but does not authenticate the server — it stops a passive listener, not an active man in the middle. `verify-full` is the one to use. |
| API → Redis | `REDIS_SSL=true`, a `rediss://` endpoint | Lower stakes than Postgres — bcrypt hashes and counters, not client records — but the OTP lock and the rate limits are abuse controls, and rewriting them in flight turns "three attempts" into unlimited. |
| App → API | Standard TLS | Certificate pinning is deliberately **not** done: it makes certificate rotation an app-store release, and on an offline-first app with old builds in the field that is a liability rather than a win. |

The API asks Postgres at boot which it actually got, rather than trusting the
URL — `TransportSecurityCheck` queries `pg_stat_ssl` and logs
`Database transport: ENCRYPTED` or a warning. Same principle as
`DatabaseIdentityCheck` beside it: the URL says what was requested, the server
says what happened, and only the second is the answer. Note what it cannot prove
— Postgres will not report which `sslmode` the client asked for, so **`ENCRYPTED`
does not mean `verify-full`**. That part is this checklist's job.

### At rest

Mostly a provider checkbox rather than code. Confirm each:

- **Postgres volume** — encrypted at rest by the managed provider (AES-256 on
  Railway and Supabase alike). Verify rather than assume.
- **Backups** — encrypted too, and this is the one people miss. Any manual
  `pg_dump` taken for the restore test in §9 is now the least protected copy of
  the entire database; encrypt it or delete it when the test is done.
- **Redis AOF** — a real at-rest store, since `appendonly yes` is mandatory
  (§2b). It holds bcrypt hashes and counters, never a plaintext code.
- **Secrets** — `JWT_SECRET`, `APP_DB_PASSWORD`, `MIGRATION_DB_PASSWORD` in the
  platform secret store, never in git.
- **Logs** — `OTP_DEV_CODES_IN_LOG=false`. A log is storage: shipped to an
  aggregator, retained for weeks, readable by more people than the database. The
  API refuses to start with this on against an encrypted database connection,
  because those two facts together describe a deployment printing sign-in codes.
  If turning it off breaks sign-in with *no SMS provider is wired*, that is the
  true state of the system — wire the provider rather than turning the log back
  on.

### What at-rest encryption does not do

Worth stating plainly so it is not over-trusted. It defends against somebody
holding the disk or the backup. It does **nothing** against a leaked
`APP_DB_PASSWORD`, a compromised app server, SQL injection, an over-privileged
role, or a bug in a row-level-security policy — in all of those the attacker
arrives over a legitimate connection and the database decrypts everything for
them, because that is its job.

The controls actually carrying that weight are the tenancy ones: RLS, the
non-owning `inclineyou_app` login, `DatabaseIdentityCheck` at boot, and
`TenantIsolationTest`. See `backend/TENANCY.md`. Do the work above because it is
cheap and because DPDP-style *reasonable security safeguards* expect it — not in
the belief that it is where the risk lives.

**One thing deliberately not done:** column-level encryption on phone numbers or
names. `app_phone()` compares the phone string inside three RLS policies, and
both `app_user.phone` and `trainer.phone` carry UNIQUE indexes — none of which
survives an encrypted column. It would trade the tenancy wall for a checkbox.

---

## 3. Object storage & media
- Create an R2 (or S3) bucket; set CORS; generate keys → into the Railway env.
- **No exercise media to upload.** The seeded library is text-only: upstream's stills and demo GIFs are © Gym visual and are not redistributed by us, so there is no mirror step and no `EXERCISE_MEDIA_BASE_URL`. (The bucket is still worth creating — progress photos and report PDFs land here later, and R2 has no egress fees.)
- If a Gym visual licence is ever bought, this is where the mirror step comes back: upload to the bucket, serve GIFs as `image/gif` (as `application/octet-stream` they download instead of animating), and restore the media columns in `ExerciseSeeder`.

---

## 4. Third-party services (production config)
- **FCM (push):** Firebase project → **service-account JSON** into the backend → `google-services` / `GoogleService-Info` config into the app (both platforms).
- **WhatsApp BSP:** account → API key into the backend → templates pre-approved (Part 1).
- **SMS / OTP:** MSG91 (needs DLT) or **WhatsApp OTP** (no DLT) → key into the backend.
- **UPI:** nothing to deploy — a `upi://` deep link; just capture each trainer's VPA at onboarding.
- **Payment gateway (the trainer's own subscription):** Razorpay or Cashfree — UPI Autopay mandate, hosted checkout, webhooks, GST invoice. **Not wired, and a launch blocker: §4b is the whole of it.** Note the distinction from the line above: `upi://` is a *client paying their trainer* and has nothing to deploy; this is a *trainer paying InclineYou* and has everything to deploy.

---

## 4b. Subscription billing and the free trial ⛔ **BLOCKER**

**None of this exists in the codebase.** Checked 30 Aug 2026: there is no
`subscription` table, no trial timestamp, no PSP client, no webhook endpoint, no
entitlement check and no invoice — anywhere in the backend, the web app or the
Expo app. `PRICING.md` settles the *price* (**₹499 per coaching seat per month,
inclusive of GST, 30-day free trial, free tier at three clients**); the product
has no way to charge it, and no way for a free trial to end.

The only meter that exists is `team.seat_limit` (V26, default 5, env
`TEAM_SEAT_LIMIT`), enforced when an invite is **accepted** rather than when it is
sent. It counts seats correctly and knows nothing about money.

So this is a launch blocker, not a roadmap item. It has two halves with very
different deadlines, and conflating them is how it gets postponed as one lump.

### The clock blocks launch; the rail has thirty days

| Half | What it is | When it is due |
| --- | --- | --- |
| **The trial clock and entitlement state** | `trial_started_at`, an expiry, the states around it, and the check that reads them | ⛔ **before the first real signup** |
| **The payment rail** | PSP account, UPI Autopay mandate, checkout, webhooks, dunning, GST invoice | before **day 31** — but its approval queues start now (§1) |

**The clock cannot be retro-fitted, and that is the whole argument.** A trainer
who signs up in launch week against a schema with no trial column is a trainer
whose trial has no start date, no expiry and no honest way to backdate one — you
either invent a date for a paying stranger or give them the product free
permanently. Every other billing component can arrive after the first cohort
signs up; this one cannot arrive after them at all. Ship the column, the state and
the *trial ends on* date on the account screen before the first non-test account
exists.

**The rail has a cheap first version, and `PRICING.md` §11.3 already floats it.**
The 90-day target is 50–100 active trainers, which is 50–100 invoices a month —
hand-collectible. A UPI collect request, a compliant invoice and a status flipped
by hand is a legitimate launch posture, and it buys the time to build autopay
properly against real customers. **Decide it deliberately before launch**, not on
day 31 when the first cohort's trials all expire in the same week. What is *not*
optional either way is the clock, the GST invoice, and the fact that somebody has
to be told their trial is ending.

### Where the money is collected — decided, and the launch order makes it free

- **On the web, never in the iOS app.** §5D is the reason; the web-first launch
  makes it natural rather than a workaround. The Expo app must contain no
  purchase, no price and no link Apple can read as steering — **re-read the
  current App Store Review Guidelines before wiring even a button**, because
  the external-link rules have changed more than once.
- **Nothing about billing enters sync.** Same shape as V30 and V32–V36: no
  phone build learns about it. If the app ever needs to show subscription state
  it reads it over REST as **new response fields**, which the additive-only law
  permits and old builds ignore.
- **The browser never touches card data.** PSP-hosted checkout or the PSP's own
  SDK only; no PAN, no CVV, no UPI PIN ever reaches our servers or our logs.
  `WEB_LAUNCH.md` §4 currently gets to say *no card data anywhere* — keep that
  true, because it is the single largest scope reduction available here.

### What has to be built

1. **Schema — and it is the first table that must sit *outside* the tenant
   model.** A seat is a **coaching trainer**, and V37 deliberately lets one
   trainer coach in two workspaces; a `subscription` carrying `tenant_id` would
   bill one person twice for one seat. So the billing tables join `app_user`
   and `trainer` on `SCHEMA.md`'s *deliberately not policied* list, with exactly
   that reason — and per the law in that section, saying nothing is an oversight
   rather than a default. The **migration number is contended**: `IDENTITY.md`
   claims V43–V47 and the gym PRD's sequence has already been shifted twice, so
   take the next free number at the time it is written and correct both documents
   in the same commit.
2. **A state machine that degrades to read-only, never to a locked door.**
   `trialing → active → past_due → grace (read-only) → free`. `PRICING.md` §8 is
   unambiguous: **a trainer must never lose access to their money book over a
   payment failure.** Losing somebody's books to a mandate decline is how you
   lose the trainer, and it is also how you lose the data that makes them stay.
3. **Entitlement checks at the write path, with an error `code` the clients can
   branch on.** The free tier's three-client cap lives in client creation, not in
   the UI. Every client-visible refusal needs a `code` in
   `exception/GlobalExceptionHandler.java` **and** in `API.md`'s catalogue — the
   app cannot branch on prose. Two are needed at minimum, along the lines of
   `PLAN_LIMIT_CLIENTS` and `SUBSCRIPTION_PAST_DUE`.
4. **The consequence nobody expects: the cap collides with offline writes.** A
   trainer on the free tier adds a fourth client on a gym floor with no signal.
   The row is already in their phone's SQLite; `/v1/sync/push` is where it
   arrives. Refusing it means a structured rejection the app repairs against
   (`sync/SyncService.java`, `sync/SyncRows.java`) — and **every build in the
   field predates the code**, so it will surface as a generic sync failure over a
   client the trainer can see on their own screen. **Recommendation: the push
   accepts the row and only the web refuses a *new* one over the cap.** Losing a
   trainer's offline work to a billing state is the worst outcome on the menu, and
   an over-cap roster that prompts an upgrade is a far better one.
5. **Webhooks, and they are the source of truth.** A success redirect in the
   trainer's browser proves nothing; the mandate and the debit are confirmed by
   the PSP's webhook. That endpoint needs: a public path rule in
   `config/SecurityConfig.java` (first match wins — put it above the authenticated
   patterns), **signature verification**, **idempotency keyed on the provider's
   event id** (they retry, and they deliver out of order), and its own
   **rate-limit tier decision** — `STANDARD` is wrong there, because that tier
   keys on the token subject and a webhook carries no token.
6. **Mandate lifecycle, which is regulated and not merely fiddly.** UPI Autopay
   requires a **pre-debit notification to the payer 24 hours before the debit**
   (the PSP sends it, but it means a day-30 charge is decided on day 29), and
   **revocation has to be self-serve** — a cancel button in the product, not an
   email to support. Our ₹499 is far below the per-transaction autopay ceiling, so
   no additional-factor step is involved; **confirm the current RBI e-mandate
   rules and the PSP's own limits before building**, since both move.
7. **GST-compliant invoices from the first paying customer** (`PRICING.md` §8.1,
   decided). That means our GSTIN, the correct **place of supply**, the **SAC**
   on the line item, and an invoice series that never repeats and never skips a
   number. Note what *inclusive of GST* does to the arithmetic: **₹499 charged is
   ₹422.88 revenue and ₹76.12 tax**, so the number stored on the invoice line is
   not the number the trainer paid. Confirm the SAC and the place-of-supply rule
   for a B2C Indian customer with the CA rather than deriving them here.
8. **Trial anti-farming — V36 already gave it to you, by accident.** Deleting an
   account sets `deleted_at` on both rows and **does not release the phone
   number**, because `app_user.phone` and `trainer.phone` carry plain UNIQUE
   indexes rather than partial ones. A trainer therefore cannot delete and
   re-trial on the same number, which is precisely the property a trial needs. Two
   rules follow. The trial grant has to be keyed on something that **survives
   account deletion** — today the never-released number is that something, so
   hanging `subscription` off `trainer_id` is safe and the reason belongs in a
   comment beside it; the day `IDENTITY.md` lands, the grant moves to `person`.
   And **do not "fix" the phone-release behaviour** with a partial unique index
   until this section has an answer, because that fix quietly reopens unlimited
   free months.

### Which gateway — Razorpay, and why not on price

**All the credible Indian options cost roughly the same, so pick on the two
things that differ: UPI Autopay maturity and a hosted invoice product.**

| Gateway | Cards (list) | UPI | Why it is or is not the pick |
| --- | --- | --- | --- |
| **Razorpay** ✅ | ~2% | **0%** | The most mature **UPI Autopay** support, a **Payment Links / Invoices** product that covers the hand-invoice path in §4b with no code at all, GST-compliant invoices out of the box, and Java + webhook documentation that is actually current. This is the recommendation |
| **Cashfree** | ~1.75–2% | **0%** | A genuine alternative and marginally cheaper on cards; strong UPI. Pick it if onboarding stalls at Razorpay — the difference is a rounding error at our volume |
| **PhonePe PG** | aggressive | **0%** | Strong on UPI, thinner on recurring mandates and on invoicing. Worth a quote, not a default |
| **PayU / Paytm PG** | ~2% | 0% | Fine, older developer experience, no reason to prefer them |
| **Stripe** ❌ | ~2% + intl | limited | Restricted onboarding in India and the weakest UPI-Autopay story. **Do not** pick the familiar one here — the entire collection strategy is a UPI mandate |
| **Instamojo / plain payment links** | ~2% + flat | 0% | Not a gateway choice so much as the zero-code first version. Reasonable for the first twenty invoices |

**Rates are list prices at the time of writing and are negotiable at volume —
verify all of them in writing before committing**, along with the one question
that actually matters (below).

**Keep the choice reversible the way V41 kept the token issuer reversible.** Put
it behind a `BillingProvider` interface with one implementation, exactly as
`AuthTokenIssuer` has two — nothing above it should be able to tell which gateway
answered. Switching gateway later is then a class, not a project, and that matters
more than the 0.25% between the top two.

### How it plugs into this product

Concretely, in the shape this codebase already has. Nothing below exists.

**Backend — a new `billing` package**, thin `BillingController` over a
`BillingService`, hand-written SQL through `NamedParameterJdbcTemplate` (the
persistence split in `backend/CLAUDE.md`: do not make this JPA), request/response
DTOs as nested `record`s, `@Valid` at the controller.

| Piece | Shape |
| --- | --- |
| `subscription` | `trainer_id`, plan, status, `trial_started_at`, `trial_ends_at`, `current_period_end`, seats, provider ref. **No `tenant_id`** (§4b.1) |
| `mandate` | subscription, provider ref, status, `revoked_at` — one row per autopay authorisation |
| `invoice` | subscription, **series number**, gross / tax / net, place of supply, SAC, issued date |
| `billing_event` | the provider's event id **UNIQUE**, the raw payload, received / processed timestamps — write it before acting on it, so a replay is possible and a double-delivery is a no-op |
| `BillingProvider` | interface; `RazorpayProvider` over `RestClient` + an HMAC-SHA256 check. The whole surface we need is four calls, so an SDK is optional |

| Endpoint | Tier | Notes |
| --- | --- | --- |
| `GET /v1/billing/subscription` | `STANDARD` | The trainer's own state. New response fields only — old app builds ignore them |
| `POST /v1/billing/checkout` | `STANDARD` | Creates the order/subscription at the gateway, returns a **hosted redirect URL** |
| `POST /v1/billing/cancel` | `STANDARD` | Revokes the mandate. Self-serve, because the regulator requires it |
| `POST /v1/billing/webhook` | **its own** | Public path rule in `SecurityConfig`, above the authenticated patterns. `STANDARD` is wrong: it keys on a token subject and a webhook carries none. Signature-gated, idempotent, returns 200 fast and processes after |

Config under `app.billing.*` in `AppProperties`, env-overridable like everything
else, with **`BILLING_ENABLED=false` as the kill switch** — the same convention as
`REDIS_ENABLED` and `RATE_LIMIT_ENABLED`, and the thing that lets the rail ship
dark before day 31. Secrets: key id, key secret, **webhook secret** (a separate
value; a leaked webhook secret forges payments).

**Web — hosted redirect, not the gateway's JavaScript SDK.** This is a real
decision and not a preference. `WEB_LAUNCH.md` §1's load-bearing property is that
**no browser ever talks to anything but the Next server**; embedding
`checkout.js` breaks it and forces §8-G's `Content-Security-Policy` to allow a
third-party script *and* frame origin on the one screen that handles money.
Redirecting to the gateway's own hosted page keeps the CSP at `default-src 'self'`,
keeps card data off our origin entirely, and costs a page transition. **If the SDK
is ever adopted, the CSP allowlist is a launch item, not a follow-up.**

The rest of the web side:

- `lib/billing/*` carries `import 'server-only'` like every other API module;
  checkout is a `'use server'` action that returns a redirect.
- **Never trust the return URL.** The trainer landing back on our success page
  proves they came back, not that they paid. The webhook is the only truth.
- **Where it lives on screen:** the state belongs on `/settings` (V36's Account
  tab strip), but the *prompt* belongs where the trainer already looks — a trial
  countdown on Today, not a Billing destination they must remember to visit. Same
  law as V32's nudges: it goes next to the thing that triggered it.
- The trial banner and the read-only degrade are the only billing chrome the
  trainer sees while things are working. A trainer who is paying should never
  think about billing again.

**And the one line of it that blocks launch is tiny:** signup writes a
`subscription` row in `trialing` with `trial_started_at = now` and
`trial_ends_at = +30 days`. One migration, one insert in the signup path, one
field on the account screen. Everything else in this section can wait for day 31;
that cannot wait at all.

### What it costs

Two costs, and they are different in kind: a **percentage of each collection**,
and **fixed platform fees**. At our price the first is small and the second should
be zero.

**Per seat, per month, on ₹499 charged.** Note the fee is computed on the ₹499
actually charged, not on the ₹422.88 we keep (§8.1) — so 2% of the charge is 2.4%
of the revenue.

| Rail | Gateway fee (list) | GST on the fee | **Effective, after input credit** | as % of ₹422.88 net |
| --- | --- | --- | --- | --- |
| **UPI Autopay** ✅ | **0%** MDR | — | **₹0**, or a flat per-debit fee if the gateway levies one | 0 – ~1.2% |
| UPI collect (manual) | **0%** MDR | — | **₹0** | 0% |
| RuPay debit | **0%** MDR | — | ₹0 | 0% |
| Card e-mandate (Visa/MC) | ~2% → ₹9.98 | ₹1.80 | **₹9.98** | 2.4% |
| Netbanking / wallet | ~2% → ₹9.98 | ₹1.80 | ₹9.98 | 2.4% |
| International card | ~3% → ₹14.97 | ₹2.69 | ₹14.97 | 3.5% |

**UPI and RuPay debit carry zero MDR by regulation**, not by the gateway's
generosity — the 2020 zero-MDR mandate — so no gateway can charge a percentage on
them. What a gateway *can* charge is a flat fee on an autopay debit or a fee for
the subscriptions product itself. **That is the one question to get answered in
writing before signing: what is charged on a UPI Autopay debit — nothing, or a
flat per-debit fee?** Assume ₹0–5 until confirmed; both answers are survivable.

**GST on the fee is reclaimable** now that we are registered (§8.1), so the
effective cost is the base fee, not the fee plus 18% — the same input-credit
argument that made hosting ~15% cheaper.

**Monthly, at the roadmap's targets**, against ~₹3,520/month of infrastructure:

| Paying seats | All UPI | All cards | Infra, for scale |
| --- | --- | --- | --- |
| 50 (90-day target, low) | **₹0 – 250** | ~₹500 | ~₹3,520 |
| 100 (90-day target, high) | **₹0 – 500** | ~₹1,000 | ~₹3,520 |
| 500 | **₹0 – 2,500** | ~₹5,000 | ~₹3,520 + |

**Fixed fees should be zero, and it is worth insisting on that.** Standard plans
carry no setup fee and no annual maintenance; settlement is **T+2 working days**,
which is irrelevant at this scale, and *instant settlement* is a paid add-on we do
not need. Three things to check for anyway, because they are where the fixed cost
hides: a **monthly fee on the subscriptions/mandate product**, a **per-mandate
registration fee**, and a **chargeback fee** — that last one applies to cards and
essentially not to UPI, which is one more reason to route collection to UPI.
Refunds generally do **not** return the MDR.

**The conclusion is worth stating plainly, because it changes where the effort
goes: the gateway is not a cost problem, it is a collection-rate problem.** 2% of
₹499 is ₹10 a month. One trainer whose mandate silently fails and is never fixed
is ₹423 a month. The entire economics of collection sit in mandate success and
dunning, not in MDR — which is exactly what `PRICING.md` §8 says when it calls the
autopay mandate the highest-leverage billing decision in the book. Route to UPI
because it is free *and* almost never disputed; do not spend a week negotiating
2% down to 1.9%.

### Lead-time items hiding in here

These are queues you do not control, exactly like the D-U-N-S in §1 and DLT
registration. They are in the checklist there for that reason.

- **PSP onboarding is a KYC review.** Razorpay or Cashfree will want PAN, the
  **GSTIN**, a bank account in the business's name, incorporation proof, and a
  live website they actually read. Days to a few weeks.
- **GST registration is its own queue**, and `PRICING.md` §8.1 has already
  decided to register ahead of the ₹20 lakh threshold rather than at it.
- **The PSP requires public Terms, Refund/Cancellation, Privacy and Contact
  pages** before it will approve the account. That is a launch dependency living
  inside a billing dependency, and the privacy policy is on the §1 list anyway.
- **UPI Autopay may need separate enablement** on the PSP account beyond basic
  activation. Ask on day one; do not discover it in week four.

---

## 5. Build & release the app — both platforms via EAS

Because it's React Native, **one codebase builds both**: `eas build --platform all`.

### 5A — Android (Google Play, organization account)
1. Configure `app.json` / `eas.json` — package identifier, version, `versionCode`, build profiles.
2. `eas build -p android --profile production` → **.aab** (EAS manages the keystore).
3. Play Console: store listing, screenshots, icon, feature graphic, **privacy policy**, **Data Safety**, content rating, target audience.
4. **Org account → no 12-tester gate.** Still run **internal testing** on real devices for quality, then publish straight to **production**. Upload with `eas submit -p android`.
5. Confirm **target API level** compliance (Play Console flags the current minimum).
6. Review (~1–3 days) → **staged rollout** (20% → 100%).

### 5B — iOS (App Store, via TestFlight)
1. Configure the iOS **bundle identifier**; EAS handles signing/provisioning (managed credentials).
2. `eas build -p ios --profile production` → **.ipa**.
3. **TestFlight** for beta: `eas submit -p ios` → App Store Connect → TestFlight. **Internal testers** (your team, up to 100) need no review — invite your **5 iOS design partners** and they can test immediately. **External testers** (up to 10,000, via link) need a quick Beta App Review. **No minimum-tester gate on iOS.**
4. App Store Connect: listing, **screenshots per device size**, **App Privacy** labels, age rating.
5. Submit for **App Store review** (~1–3 days, occasionally longer) → release.

### 5C — Releasing both at once
- `eas build --platform all` builds both; `eas submit` to each store.
- Both then gate only on **store review timelines** (~1–3 days each), not a 14-day test — so a simultaneous launch is straightforward once the org accounts exist. Start the Android and iOS submissions together.

### 5D — iOS payments heads-up (important)
- A client paying their **trainer** via UPI for **in-person** training is a real-world service — Apple generally allows this **outside** In-App Purchase (like ride-hailing or a gym membership).
- But the **trainer's own ₹500/₹1000 subscription**, if charged **inside the iOS app**, can trigger Apple **IAP and its ~30% cut**.
- **Plan:** have trainers subscribe on your **website**, not inside the iOS app; the app just reflects their status. **Verify the current App Store Review Guidelines before wiring billing** — Apple's payment rules change.
- **Status: not built, and it blocks launch.** The website half is the whole billing system — the trial clock, the mandate, the invoice. **§4b** is the detail, including which part of it genuinely cannot wait and which part has thirty days of slack.

---

## 6. Environments
- **Production** — Railway.
- **Staging** — a second Railway environment + database to test before prod.
- **Dev** — local, Postgres **and Redis** in Docker (`docker compose up -d`).
- App build profiles map each to the right API URL, for both platforms.

---

## 7. Shipping updates after launch
- **Backend:** push → Railway auto-deploys. Instant, additive-only.
- **App (native or store-visible):** new `eas build` → `eas submit` → **both** stores review → users update.
- **App (JS/UI only):** **EAS Update (OTA)** → both platforms, no store review (respect each store's policy; can't change native code this way).
- **DB migrations:** additive Flyway on deploy; safe for the old app versions still live.

---

## 8. CI/CD (keep it simple)
- **GitHub → Railway:** push to `main` → Railway builds + deploys the backend automatically.
- A **separate workflow** runs `eas build` / `eas submit` for **both platforms** on tagged releases.
- Manual is fine to start; automate once it's routine.

---

## 9. Ops essentials (don't skip)
- **Backups:** managed on Railway; still export periodically and **test a restore** — an untested backup isn't one.
- **Monitoring:** Sentry (free tier) for app + backend crash reporting; an uptime check on `/health`; keep logs.
- **Secrets:** Railway's secret store; rotate keys; never in git. Note that
  `JWT_SECRET` cannot currently be rotated without signing every phone out —
  that is M1 in `backend/IDENTITY.md`.
- **Transport:** see §2c. The boot log answers both questions — which database
  identity connected, and whether it connected over TLS.
- **Cost alerts:** set billing alerts on Railway, Apple, and your BSP.
- **Billing is an ops surface, not just a build (§4b).** Four things need a human or an alarm: **trials expiring this week** — the first cohort's day 31 lands in one week, so it is a queue and not an event; **mandate failure rate**, which is a normal number that becomes an incident when it doubles; **unprocessed webhook events**, because a silently dropped one means a trainer paid and the product does not know; and a **monthly reconciliation** of paid seats against coaching trainers, plus the gateway's settlements against our own invoices.
- **Revenue alerts point the other way from cost alerts.** Set one for money *not* arriving — a day with zero successful debits during a renewal window is either a holiday or a broken integration, and only one of those is fine.

---

## 10. First-launch checklist (dual-platform, org account)

1. [ ] **D-U-N-S number obtained** (unlocks both org accounts).
2. [ ] Google Play **organization** account + Apple Developer account set up.
3. [ ] Privacy policy published; **Play Data Safety** + **Apple App Privacy** completed.
4. [ ] WhatsApp templates approved; DLT done (or WhatsApp OTP chosen).
5. [ ] Backend on **Railway**; managed Postgres; HTTPS live; `/health` green; **backups + restore-tested**.
5b. [ ] **Redis provisioned with `appendonly yes` verified** — an OTP lock that a restart clears is not a lock.
5c. [ ] **Transport verified (§2c)** — `DATABASE_URL` carries `sslmode=verify-full`; boot log says `Database transport: ENCRYPTED`; `REDIS_SSL=true`; `REQUIRE_HTTPS=true` **and** `FORWARD_HEADERS=framework`; HSTS header present on a real response.
5d. [ ] **`OTP_DEV_CODES_IN_LOG=false`** — and confirmed no sign-in code appears in the log aggregator.
5e. [ ] **Backups confirmed encrypted**, and any manual `pg_dump` from the restore test encrypted or deleted.
6. [ ] Object storage bucket live (progress photos, report PDFs). No exercise media — the library ships text-only, so no Gym visual licence is required to launch.
7. [ ] FCM, BSP, OTP wired with prod keys.
7b. [ ] ⛔ **Trial clock live before the first non-test signup (§4b)** — a trial start recorded, an expiry computed, the *trial ends on* date visible to the trainer, and the read-only degrade path in place. **This one cannot be retro-fitted**: a trainer signed up without it has no honest expiry, ever.
7c. [ ] **Payment path decided and stated in writing** — autopay at launch, or hand-invoice the first cohort (`PRICING.md` §11.3). Either is defensible; discovering it on day 31 is not.
7d. [ ] Gateway pricing confirmed **in writing** — 0% on UPI, the per-debit autopay fee (if any), no setup fee, no AMC, no monthly fee on the subscriptions product, and the chargeback fee (§4b *What it costs*).
7e. [ ] Gateway account approved; **UPI Autopay enabled**; a real end-to-end mandate + debit tested with a live low-value charge; webhook **signature-verified and idempotent**; cancellation self-serve.
7f. [ ] **GST invoice emitted for the first payment** and checked by the CA — GSTIN, place of supply, SAC, unbroken invoice series, and the ₹499 → ₹422.88 + ₹76.12 split shown correctly.
7g. [ ] Free-tier cap (3 clients) enforced on the **web** write path, with a `code` in `API.md`'s catalogue — and `/v1/sync/push` confirmed **not** to break an offline write over it (§4b.4).
8. [ ] Prod smoke test passed (OTP → create client → sync → survives restart).
9. [ ] `eas build --platform all` → **.aab + .ipa**; app points at prod API.
10. [ ] Play listing **and** App Store Connect listing complete.
11. [ ] Internal testing on real **Android** devices; **iOS partners on TestFlight**.
12. [ ] iOS subscription billing routed **via website** (not in-app), guidelines re-checked — and the shipped app confirmed to carry **no price, no purchase and no link Apple reads as steering**.
13. [ ] Submit **both** to store review.
14. [ ] Sentry + uptime monitoring live.
15. [ ] Android staged rollout + iOS release → **live on both**.

---

*Critical path: the **D-U-N-S number and Apple org enrollment** (start today), then store review. With the organization account there's no 14-day Android test to wait on — the wiring and the approvals are what set your launch date, not the code.*

*Running beside it, on its own queues: **GST registration and payment-gateway KYC** (§1), which gate §4b. The one piece of §4b that gates the launch itself rather than the first invoice is the **trial clock** — it is a day-one requirement because it is the only part that cannot be added after the first trainer signs up.*

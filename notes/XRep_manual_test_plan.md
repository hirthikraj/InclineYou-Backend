# XRep — Manual Test Plan & Test Case Document

**Version:** 1.2 · **Date:** 20 Aug 2026 · **For:** manual QA of the MVP (trainer + client roles)
**Scope:** FR-1 – FR-11 and NFR-1 – NFR-13 of [`XRep_final_requirements_and_plan.md`](XRep_final_requirements_and_plan.md), all screens in [`XRep_MVP_interaction_map.md`](XRep_MVP_interaction_map.md), plus the Spring Boot backend surface.
**Includes:** happy paths, edge cases, corner cases, offline/sync, business-logic abuse, and a full security section (§21).

> **v1.1 — what changed.** Schema **V18** made one phone hold exactly one role and turned consent into a
> first-class state. Two consequences run through this document:
>
> 1. **A number can no longer be both a trainer and a client.** `app_user.role` is single-valued and
>    exclusive, and the roster refuses a number that already owns a trainer account. The old `TC` fixture
>    and most of §16 tested a case that can no longer exist — both are rewritten rather than deleted, because
>    "this must now be impossible" is itself a test.
> 2. **A trainer adding a number is a claim, not a relationship.** New clients are born `invited` and must
>    accept before anything of theirs is shared. New exits at sign-in: **invited**, **removed**,
>    **unattached**. See §1.4.

> **v1.2 — what changed.** Schema **V26** and **V27** added **team coaching**: a senior
> trainer runs a team of trainers. It is a whole new feature area rather than a change
> to an existing one, so it lands as **§16A** (plus §21.3b and §20 q18–q26) and nothing
> else is renumbered. Three things in it are worth knowing before you execute anything:
>
> 1. **A team widens reads; it never moves ownership.** None of the 63 endpoints that
>    predate V26 changed what they return, so every case outside §16A should behave
>    exactly as it did in v1.1. If one does not, that is the finding.
> 2. **Team coaching is the one part of the app that writes ONLINE.** Every write is a
>    permission change, and one authored offline would be replayed at an unknown later
>    time. §16A.8 checks that the app refuses honestly instead of queueing — the
>    opposite of what every other 📵 case in this document asserts.
> 3. **One money promise was deliberately narrowed.** Phase 1's invitation screen said
>    nobody in a team could see what another coach collected; Phase 3's owner-only
>    revenue roll-up makes that untrue, and the copy changed with it. **TEAM-104 tests
>    the copy**, because a promise quietly narrowed is worse than one never made.

> This document is written to be executed on a device with the backend running locally. Every case is
> pass/fail-able by one person with a phone, a terminal, and `curl`. Cases marked **⚠ known gap** are
> expected to fail or behave unexpectedly against today's code — record the actual behaviour and
> triage rather than assuming a mistake in the steps.

---

## 0 · Test environment setup

### 0.1 Bring up the stack

| Step | Command | Expected |
|---|---|---|
| 1 | `docker compose up -d` (repo root) | `xrep-postgres` healthy on 5432 (db `xrepdb`, user `xrep`) **and `xrep-redis` on 6379**. Confirm `docker exec xrep-redis redis-cli config get appendonly` returns `yes` — without AOF, SEC-OTP-02 silently regresses |
| 2 | `cd backend && ./mvnw spring-boot:run` | Flyway applies V1–V27, app listens on 8080, exercise seed loads (1,324 exercises); a second run reports `0 rows changed` |
| 3 | `curl -i localhost:8080/health` | `200`, no auth required |
| 4 | `cd app && npm run android` (device on same LAN) | App installs; set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8080` — `10.0.2.2` only works on the emulator |

### 0.2 Getting an OTP in dev

`app.otp.sms-enabled: false`, so no SMS is sent. The code is printed to the backend console:

```
[DEV] OTP for 9841657298: 481902
```

Keep the backend log tailing in a second terminal for the whole session. **Note this for §21 — an OTP in
plaintext application logs is itself a finding to verify is switched off in production.**

**You will hit the send throttle during a long session.** One number gets 30s → 60s → 120s between codes
and **10 codes per rolling 24 hours**, enforced from `otp_request` rows (so a backend restart does not
clear it). Two ways out while testing:

```bash
# Forget one number's send history — the cleanest reset.
# State lives in Redis now, so clear BOTH: the daily ceiling is a Bucket4j
# bucket, the ladder is a sorted set, and the lock is mirrored to Postgres.
docker exec xrep-redis redis-cli --scan --pattern 'otp:*98xxxxxx01*' | \
  xargs -r docker exec -i xrep-redis redis-cli del
docker exec xrep-postgres psql -U xrep -d xrepdb \
  -c "DELETE FROM otp_request WHERE phone = '98xxxxxx01';"

# Or lift the limits for a session (never in a deployed environment)
APP_OTP_MAX_SENDS_PER_DAY=1000 APP_OTP_RESEND_LADDER_SECONDS=0 ./mvnw spring-boot:run
```

Deleting rows is preferable — it keeps the limits under test rather than switching them off, which is
what §21.2 is checking. The same `DELETE` also clears a **wrong-attempt lock**, which now lives on
`otp_request.locked_until` rather than in memory — so restarting the backend is no longer a way out of
one (that's the point of SEC-OTP-02).

### 0.2.1 Every endpoint is rate-limited too

Separate from the OTP limits, a per-caller ceiling sits in front of the whole API — keyed by the token's
subject where there is one, by remote address on `/v1/auth/**`:

| Tier | Paths | Limit |
|---|---|---|
| standard | everything not below | 120 / min |
| auth | `/v1/auth/**` | 300 / min |
| sync | `/v1/sync/**`, `/v1/client/sync/**` | 60 / min |
| messaging | `POST …/nudge`, `POST …/report/weekly` | 10 / min |
| — | `/health` | exempt |

Refusals are `429` with `code: RATE_LIMITED` and a `Retry-After`. Normal app use is nowhere near these,
but a scripted `for` loop is — so when a §21 case wants 1000 requests, either expect the 429s as part of
the result or disable the limiter for that run:

```bash
RATE_LIMIT_ENABLED=false ./mvnw spring-boot:run
```

Counters are in memory, so a **restart also clears them** (unlike the OTP limits).

### 0.3 Test data

- **Fresh trainer (day-zero states):** use a phone number never seen before. Do *not* seed it.
- **Populated trainer:** `cd backend && ./scripts/seed-sample-month.sh <trainer-phone>` — the trainer row
  must exist first (sign in once). Seeded clients carry `metadata->>'seed' = 'true'` and are wiped on re-run;
  hand-added clients survive.
- **Client-role account:** add a client from the trainer app whose phone is a *second* real number you can
  receive on / read the log for, then sign in on a second device (or after sign-out) with that number.
- **Invited-not-yet-accepted:** add a client from the trainer app with a number you can receive on, and
  then *do not* sign in as them. That row sits at `membership_status = 'invited'` — this is the default
  state of every new client now, so most of §4 is exercised against it.
- **Un-invitable (V18):** put **trainer A's own number** on trainer B's roster. This used to create a
  both-roles account; it is now refused as an invite and the row lands `unavailable`. The client record
  still works completely — only app access is impossible.
- **Removed-but-not-told:** accept an invite, then have the trainer end the coaching from `ClientEndScreen`
  (**Archive**, not the hard remove — the purge deletes the row and leaves nothing to notify against).

### 0.4 Reference accounts to create before starting

| Alias | Phone | Role | Purpose |
|---|---|---|---|
| T1 | 98xxxxxx01 | Trainer, seeded | Main trainer, populated states |
| T2 | 98xxxxxx02 | Trainer, seeded | Cross-tenant isolation tests (§21.3) |
| T0 | 98xxxxxx03 | Trainer, empty | Day-zero / first-run states |
| C1 | 98xxxxxx04 | Client of T1 | Client-role happy path |
| C2 | 98xxxxxx05 | Client of T2 | Client-vs-client isolation |
| CB | 98xxxxxx06 | Client of T1 **and** T2 | Two-membership cases (still supported) |
| CI | 98xxxxxx07 | Invited by T1, never signed in | Consent screen, invite states (§1.4) |
| CD | 98xxxxxx08 | Invited by T1, then **declined** | Decline path, `unattached` |
| CR | 98xxxxxx09 | Client of T1, then **archived** | Removal notice + local wipe |
| CN | — | Client of T1, **no phone** | Nudge/UPI degradation cases. Born `accepted` — nobody to ask |
| TA | 98xxxxxx10 | Trainer, joins T1's team | Teammate coach → promoted to admin (§16A.2) |
| TB | 98xxxxxx11 | Trainer, joins T1's team | The second coach — reassignment needs somewhere to send people |
| TX | 98xxxxxx12 | Trainer, owner of a **second** team | Cross-**team** isolation (§21.3b). Different from T2, deliberately: one trainer in no team and one in another team fail differently |
| CX | 98xxxxxx13 | Client of **TA** | The reassignment fixture. Give them a program, a future session, a past session, a logged workout and a recorded payment before starting §16A.4 |

> **T2 must never join a team.** Half of §21.3 depends on T2 being a trainer T1 has no
> relationship with at all. Team-scoped isolation uses **TX** instead, and the two
> refusals are genuinely different: T2's ids are outside every team T1 is in, TX's are
> inside a team T1 is not in. A single fixture would test only one of them.

> **`TC` (one phone, both roles) is gone.** It described the pre-V18 model and is now an impossible state,
> not a fixture. What replaces it is **AUTH-42**, which asserts the *refusal*: put T1's number on T2's
> roster and confirm it lands `unavailable` rather than creating a dual-role account. Anywhere this
> document previously said "TC", the case is either that refusal or a **CB** multi-roster case.

### 0.5 Conventions

- **ID prefix** = module. `⚠` = known gap. `🔒` = security. `📵` = must be run with the radio off.
- **Severity:** S1 data loss / money wrong / cross-tenant leak · S2 feature blocked · S3 wrong state or copy · S4 cosmetic.
- Fill the **P/F** column: `P` pass, `F` fail (raise a bug with the template in §25), `N/A`, `B` blocked.
- Every screen must also be checked against the **state matrix** in §22.1 — that is a per-screen sweep, not one test.

---

## 1 · AUTH — phone entry, OTP, role resolution

Backend: `auth/AuthController.java`, `auth/AuthService.java`, `auth/OtpService.java`.
Config: OTP expiry **10 min**, max wrong attempts **3**, lock **10 min**, JWT expiry **7 days**.

### 1.1 Phone entry

| ID | Case | Steps | Expected | P/F |
|---|---|---|---|---|
| AUTH-01 | Valid number | Enter `9841657298` → Continue | OTP screen; backend logs a 6-digit code |P|
| AUTH-02 | Leading 0–5 rejected | Enter `5841657298` → blur, then Send | Inline error **"Indian mobile numbers start with 6, 7, 8 or 9."** on blur *and* on send; **no request fired** (`PHONE_RE` mirrors the server's `^[6-9]\d{9}$`). Retyping the same number must **not** clear the error |P|
| AUTH-02a | Server-detail backstop | Temporarily tighten a server-side `@Pattern` the app doesn't know about, then submit | The screen quotes the server's own sentence (`readValidationDetail` reads the 400's `detail`, strips the `phone: ` prefix), never the generic "Couldn't send the code" | |
| AUTH-03 | Too short | `98416` → Continue | Continue disabled or inline error; no 400 alert |P|
| AUTH-04 | Too long | Type 11 digits | Input caps at 10, or inline error |P|
| AUTH-05 | Non-digits | Paste `98a1-657 298` | Digits-only sanitising or a clear error; never a server 400 dialog |P|
| AUTH-06 | Leading/trailing spaces | Paste ` 9841657298 ` | Trimmed and accepted |P|
| AUTH-07 | +91 prefix pasted | Paste `+919841657298` | Either accepted (stripped to 10) or clearly rejected — must not silently send 12 digits |P|
| AUTH-08 | Unicode / emoji digits | Paste `९८४१६५७२९८` | Rejected cleanly, no crash |P|
| AUTH-09 | Offline 📵 | Radio off → Continue | Honest "no connection" message, retry affordance. This is the **one** flow allowed to require network | |
| AUTH-10 | Backend down | Stop backend → Continue | Timeout after 15s (axios timeout), recoverable error, not a hang | |
| AUTH-11 | Double-tap Continue | Tap Continue twice fast | One OTP request, button disabled while in flight (no two codes) |P|
| AUTH-12 | Back from OTP, change number | OTP screen → back → new number → Continue | New code for the new number; old code no longer relevant |P|

### 1.2 OTP verification

| ID | Case | Steps | Expected | P/F |
|---|---|---|---|---|
| AUTH-20 | Correct code | Enter the logged code | Signed in; lands per role (see 1.3) |P|
| AUTH-21 | Wrong code ×1 | Enter `000000` (assuming wrong) | `422 OTP_WRONG`, inline error, **"2 attempts left"** shown |P|
| AUTH-22 | Wrong code ×2 | Repeat | "1 attempt left" |P|
| AUTH-23 | Wrong code ×3 → lock | Repeat | `429 OTP_LOCKED`, countdown from `retryAfterSeconds` (600), input disabled |P|
| AUTH-24 | Request OTP while locked | Tap Resend during lock | `429` with `Retry-After`; UI shows the same countdown, does not send a code |P|
| AUTH-25 | Lock expiry | Wait out 10 min → request + verify | Works again. A `locked_until` in the past needs no clearing — it is simply over. Note the old code row still carries `wrong_attempts: 3`, so retrying the **old** code re-locks immediately; the recovery is a new code |P|
| AUTH-26 | Expired code | Wait 10 min → enter the old code | `410 OTP_EXPIRED`, copy says **send a new one** (not "wrong code") | |
| AUTH-27 | Expired ≠ wrong attempt | 2 wrong attempts → let code expire → enter expired code → resend → 1 wrong attempt | Expired call must **not** burn an attempt; after the resend you still get "attempts left" behaviour consistent with a fresh code | |
| AUTH-28 | Superseded code | Request OTP → Resend → enter the **first** code | First code fails as wrong (only the latest unverified row is checked) and **burns an attempt** — confirm the copy doesn't blame the user for a resend | |
| AUTH-29 | Code reuse | Verify successfully → sign out → enter the same code again | Rejected (row marked verified) — `410`, not a second session | |
| AUTH-30 | Paste from SMS/clipboard | Paste 6 digits into the first box | Fills all six boxes and auto-submits | |
| AUTH-31 | Partial code | Enter 4 digits | Submit disabled; no request | |
| AUTH-32 | Non-numeric in OTP | Try letters | Blocked at the input; and if one reaches the API it is a `400 must be a 6-digit code`, **not** a spent attempt (see SEC-OTP-09a) | |
| AUTH-33 | Resend timer | Land on OTP screen, resend three times | Resend disabled with a visible countdown, escalating 30s → 60s → 120s; the **server enforces the same ladder**, so tapping early is refused with the real wait rather than blamed on the network (SEC-OTP-04c/04d) | |
| AUTH-34 | Backgrounded mid-OTP | Enter 3 digits → background 2 min → return | Digits and timer state survive, or a clean restart — never a half-dead screen | |
| AUTH-35 | Offline verify 📵 | Radio off → submit code | Clear network error, code not consumed, retry works when back online | |
| AUTH-36 | Force-close mid-OTP | Kill app on OTP screen → reopen | Back at phone entry (or OTP with number intact), no crash, no stale session | |

### 1.3 Role resolution (the exits)

Since V18 sign-in resolves in **one round trip** — `AppUserRepository.findIdentityByPhone` returns the role,
the trainer's setup state and every roster's consent status in a single query. `app_user.role` is the whole
answer to "which half of the product is this", and it is **exclusive**.

| ID | Case | Precondition | Expected | P/F |
|---|---|---|---|---|
| AUTH-40 | Known trainer | T1 verifies | `role: trainer`, lands on the Deck. `clientOf` is **empty** — a trainer is never also somebody's client now |P|
| AUTH-41 | Somebody's client only | C1 verifies | `role: client`, client Today; **no trainer row created** in Postgres — verify with `select * from trainer where phone='<C1>'` (0 rows) |P|
| AUTH-42 | Dual role is impossible | Put T1's number on T2's roster, sync, then T1 verifies | `role: trainer` **only**, no role picker. The roster row lands `membership_status='unavailable'` (§4). Confirm `select role from app_user where phone='<T1>'` is exactly one row reading `trainer` |P|
| AUTH-42a | Claim blocked from the other side | Sign in on **C1's** number and try `POST /v1/auth/trainer` | `409` — "already on a trainer's roster as a client". The exclusivity is guarded at both doors, not just the roster one | |
| AUTH-43 | Neither → 7a | New number verifies | `role: pending`, "we don't know this number" screen with two exits, no dead end |P|
| AUTH-43a | One query, not several | Watch the SQL log for a single verify | One `SELECT` resolves the identity; role and membership state arrive together. A second lookup to decide the screen is a regression |P|
| AUTH-44 | 7a → "I'm a trainer" | On 7a, tap it | `POST /v1/auth/trainer` with **no body**; trainer row created; trainer token returned; setup wizard starts |P|
| AUTH-45 | 7a claim idempotent | Tap "I'm a trainer" twice / retry after a dropped response | Exactly one trainer row; same account returned |P|
| AUTH-46 | 7a → "I train with someone" exit | Take the other exit | Explains their trainer must add them; no orphan trainer row |P|
| AUTH-47 | Trainer name placeholder | Claim trainer, don't finish setup, sign out, sign in | No "Welcome back, 9841657298" — greeting is suppressed while the name is still the phone number |P|
| AUTH-48 | Paused-only membership | Pause C1 on T1's roster → C1 signs in | **Signs in normally** into the client lens with full history; a banner names who paused it and the date. Pause is not a wall |P|
| AUTH-50 | Soft-deleted client | Delete C1 on T1 (soft) → C1 signs in with no other roster | Falls through to 7a (pending), not a broken client lens |P|
| AUTH-51 | Soft-deleted trainer | Set `trainer.deleted_at` → that number signs in | Treated as not a trainer; no access to the old roster | |
| AUTH-52 | Setup incomplete resume | Trainer abandons setup halfway → kill app → sign in again | Resumes the wizard (`setupComplete=false` survives reinstall and second device) | |
| AUTH-53 | Returning session, offline 📵 | Signed-in trainer, radio off, cold start | Opens straight into local data — **never** the phone screen | |
| AUTH-54 | Token expiry (7 days) | Force an expired token (see 🔒 SEC-AUTH-04) | App signs out gracefully with an explanation; no infinite 401 loop, no data loss of queued writes | |
| AUTH-55 | Reinstall | Uninstall → reinstall → sign in | Local DB is empty, first sync repopulates from server; no duplicate rows | |
| AUTH-56 | `gym_admin` is reserved | `update app_user set role='gym_admin' where phone='<T0>'` → verify | An honest stop — "Gym accounts aren't available yet" — **not** a trainer's Deck rendered over somebody else's data. No token is issued | |

### 1.4 Consent — invite, decline, removal (V18)

A trainer typing a number into their roster is a **claim**. Until the person on the other end accepts,
nothing of theirs is shared — and the token behind the consent screen is deliberately incapable of
opening a sync scope, so there is nothing to leak even by accident.

| ID | Case | Precondition | Expected | P/F |
|---|---|---|---|---|
| AUTH-60 | Invited client signs in | CI verifies | `role: invited`; the **accept/decline** screen names the trainer, their gym, and the name they were added as | |
| AUTH-61 | What accepting means is stated | On that screen | Three consequences readable *before* choosing: the trainer writes the plan, **they see everything logged**, and no other client or trainer ever does. Privacy Policy link present | |
| AUTH-62 | Decline is a real exit | Inspect the footer | Decline sits in the same footer at the same weight as Accept. An accept that is the only way off the screen is not consent (S2 if it is hidden or absent) | |
| AUTH-63 | 🔒 Invited token opens nothing | `GET /v1/sync/pull` **and** `/v1/client/sync/pull?clientId=<CI>` with the invited token | **`403` both** — this is the case the whole consent step rests on. S1 if either returns data | |
| AUTH-64 | Accept | Tap Accept | `membership_status → accepted`, `accepted_at` stamped, `app_user.privacy_accepted_at` stamped, a real client token issued, client lens opens | |
| AUTH-65 | Accept is idempotent | Double-tap / retry a dropped response | One state change; `accepted_at` does not move on the second call | |
| AUTH-66 | Decline | CD taps Decline → confirm | `membership_status → declined`, `declined_at` stamped. **The row is kept** — the trainer's roster should still say what happened | |
| AUTH-67 | Declined ≠ 7a | CD signs in again | `role: unattached` — the "you're not training with anyone" screen. It must **never** offer "I'm a trainer": that would quietly convert somebody who declined one invite (S3) | |
| AUTH-68 | Two invites, answer one | Invite CD from T1 and T2, decline T1's | The screen re-renders for **T2's** invite rather than dropping them out of the flow | |
| AUTH-69 | Live roster beats a pending invite | CB accepted with T1, freshly invited by T2 | Signs straight in as `client` — training is not held up by a consent screen. T2's invite still travels in `clientOf` for the app to surface inside | |
| AUTH-70 | Removal is announced | CR (archived by T1) signs in | `role: removed`; the notice names the trainer and the date ("ended your coaching on 14 August 2026") | |
| AUTH-71 | Removal wipes locally, keeps server | Tap OK | Local DB cleared; `removed_ack_at` stamped. In psql the client row, its payments and its sessions are **still there** — the trainer's books must not move because a client tapped OK (S1 if they vanish) | |
| AUTH-72 | Shown exactly once | Sign in again after acknowledging | `role: unattached`, **no** removal notice. The row still reads `removed` forever, so a missing ack stamp means this screen is the app for the rest of time (S3) | |
| AUTH-73 | Server-first ordering | Acknowledge with the radio off 📵 | The wipe does **not** run — the phone keeps its data and the notice returns. Wiping before the ack lands would erase the data *and* re-show the screen | |
| AUTH-74 | Removed then re-added | T1 archives CR, then un-archives (resume) | `removed_ack_at` clears, so a second removal is announced again rather than silently swallowed | |
| AUTH-75 | Legacy rows are not walled | A client created **before** V18 | `membership_status` defaulted to `accepted` — somebody who has trained for months must never meet a consent screen (S1 if a live client is locked out) | |

---

## 2 · TSETUP — trainer setup wizard

Screens: `screens/setup/*` (name, experience, specialities, certifications, languages, packs, payment, preflight, done).

| ID | Case | Expected | P/F |
|---|---|---|---|
| TSETUP-01 | Happy path all steps | Profile saved, `setup_completed_at` set, lands on the Deck | |
| TSETUP-02 | Name required | Empty name → Continue blocked with inline message (not a system alert) | |
| TSETUP-03 | Name 100+ chars / emoji / Tamil script | Accepted or limited with a visible counter; no layout break downstream (Deck header, reports, UPI `pn=`) | |
| TSETUP-04 | Skip optional steps | Specialities/certifications/languages skippable; profile still completes | |
| TSETUP-05 | Back navigation mid-wizard | Earlier answers preserved on return | |
| TSETUP-06 | Force-close mid-wizard | Draft survives (`setup/draft.ts`); resumes where it stopped | |
| TSETUP-07 | Offline wizard 📵 | All steps complete offline; profile queues and pushes later (`setup/profileSync.ts`) | |
| TSETUP-08 | UPI VPA valid | `name@bank` accepted | |
| TSETUP-09 | UPI VPA invalid | `nobody`, `a@`, `@b`, spaces, 100 chars, `x@y@z` → inline rejection, never saved silently | |
| TSETUP-10 | UPI VPA skipped | Setup completes; every UPI affordance later shows the **disabled-no-VPA** state routing to Settings | |
| TSETUP-11 | Packs step: 0 packs | Allowed; Money screen shows a real empty state, not a blank card | |
| TSETUP-12 | Pack price edge values | `0`, `1`, `999999`, decimals, `-500` → negative/decimal rejected or normalised to whole rupees | |
| TSETUP-13 | Duplicate pack names | Warned, not blocked | |
| TSETUP-14 | Double-tap Done | One profile push, no duplicate trainer/pack rows | |
| TSETUP-15 | Setup completing on device B | Finish setup on A → open B → B reflects it after sync, doesn't restart the wizard | |

---

## 3 · HOME — the Deck (FR-7)

| ID | Case | Expected | P/F |
|---|---|---|---|
| HOME-01 | Day zero (T0) | Every block empty at once and each says what fills it — no bare "no data", no spinners | |
| HOME-02 | Active count excludes paused | Pause a client → count drops by one immediately (local write) | |
| HOME-03 | Revenue this month | Equals the sum of `payment.status='paid'` rows in the current calendar month, IST (statuses are `pending` \| `paid` \| `overdue`) | |
| HOME-04 | Month boundary | Set device date to the 1st → revenue resets; last month still reachable | |
| HOME-05 | Gym split, mixed roster | Trainer's share vs gym's share computed per client `trainer_split_percent`; obvious which half is the trainer's | |
| HOME-06 | All-freelance trainer | Split block **collapses** — must not render "100% / 0%" | |
| HOME-07 | Split % = 0 and = 100 | 0 → whole amount to the gym; 100 → whole amount to the trainer; both render sanely | |
| HOME-08 | Split % blank on a freelance client | Treated as trainer keeps everything | |
| HOME-09 | Revenue provably incomplete | Gym-collected clients with no amount → number is qualified, not overstated | |
| HOME-10 | Today's sessions | Correct times in IST, correct statuses, tap-through marks done | |
| HOME-11 | Rest day | "No sessions today" reads as intentional | |
| HOME-12 | Needs attention | Renewals due, payments pending, unmarked past sessions all appear; each is tappable to the fixing screen | |
| HOME-13 | "3 sessions need marking" | Leave yesterday's sessions scheduled → prompt appears with the right count | |
| HOME-14 | Stale data | Last-synced time is shown where the number matters (revenue, sessions remaining) | |
| HOME-15 | Offline Deck 📵 | Renders fully from local data, offline chip present, nothing spins forever | |
| HOME-16 | 30-client roster | Deck scrolls smoothly, cold start under a few seconds (NFR-3) | |
| HOME-17 | Pull-to-refresh while offline 📵 | Fails quietly into the queued/offline state, no error dialog | |
| HOME-18 | Device clock wrong | Set clock 3 days back/forward → "today" is visibly wrong but the app does not corrupt data; check what syncs (see 🔒 SEC-BIZ-09) | |

---

## 4 · CLI — clients, intake, roster, file (FR-1)

### 4.1 Add client

| ID | Case | Expected | P/F |
|---|---|---|---|
| CLI-01 | Minimum viable client | Name only → saves; appears in the roster **before** any network call | |
| CLI-02 | Full intake | Name, phone, goal, mode, split %, height, starting weight, activity level all persist | |
| CLI-03 | Name missing | Inline error; save blocked | |
| CLI-04 | Name 1 char / 60 chars / Tamil / emoji | Accepted; roster row, client file header and reports all survive it | |
| CLI-05 | Duplicate phone | Adding the same phone twice **warns and allows** (never blocks) | |
| CLI-06 | No phone | Allowed; every nudge/UPI affordance for that client shows a **capability-missing** state, not a broken button | |
| CLI-07 | Invalid phone | `12345`, letters, 15 digits → inline rejection | |
| CLI-08 | Own number as client | Trainer adds their own number → allowed; the role toggle appears for them (see §17) | |
| CLI-09 | Height edge values | `0`, `1`, `120`, `250`, `999`, blank, `170.5` → out-of-range rejected with a human message; blank allowed | |
| CLI-10 | Weight edge values | `0`, `20`, `300`, `500`, blank, `72.35` → same; unit is kg everywhere, no imperial | |
| CLI-11 | Split % edge values | `0`, `100`, `101`, `-1`, blank, `33.33` → >100/<0 rejected; blank on freelance = trainer keeps all | |
| CLI-12 | Mode switch reveals split | Choosing "gym front office" reveals the split field; switching back hides it and clears/keeps it consistently | |
| CLI-13 | Goal free text 500 chars | No truncation that loses meaning; no crash | |
| CLI-14 | Goal with newlines / RTL / script mix | Renders, no layout break | |
| CLI-15 | Offline add 📵 | Saves locally, roster updates instantly, queue count increments by the right number of records | |
| CLI-16 | Double-tap Save | Exactly one client row (check Postgres after sync) | |
| CLI-17 | Force-close mid-form | Either a preserved draft or a clean discard — never a half-written client | |
| CLI-18 | ⚠ No health fields | Sweep the whole intake and every sheet: **no injuries, conditions, medications, allergies** anywhere (DPDP Act 2023). Any such field is an S1 compliance bug | |
| CLI-19 | Client-added confirmation | `ClientAddedScreen` offers the obvious next step (assign a plan / book a session) | |

### 4.2 Roster & status chips

Derived by `app/src/db/clientStatusRules.ts` — never hand-set.

| ID | Case | Expected | P/F |
|---|---|---|---|
| CLI-30 | Empty roster (T0) | The product's most important empty state: what it's for + one action | |
| CLI-31 | Search no results | Distinct from empty roster; offers to clear the query | |
| CLI-32 | Filtered to nothing | Distinct again; offers **clear filters** | |
| CLI-33 | Search partial / case / diacritics | `rav` finds "Ravi"; case-insensitive; forgiving of spacing | |
| CLI-34 | Search by phone | Finds by number if that's the intent — confirm and record which | |
| CLI-35 | Chip: `active` / `paused` | Correct tone (good/warn) | |
| CLI-36 | Chip: `payment due ₹3000` | Fires on any pending/due/unpaid payment row, amount appended when known | |
| CLI-37 | Chip: `overdue ₹3000` | Only when explicitly overdue; danger tone | |
| CLI-38 | Chip: `3 sessions left` | Fires at ≤3 remaining on a live pack; uses the **fewest** across packs | |
| CLI-39 | Chip: `pack empty` | At 0 **or below** (negative remaining must not read as "0 left") | |
| CLI-40 | Chip: `5d left` / `ends today` | Within 7 days of the soonest pack/program end | |
| CLI-41 | Chip: `expired` | End date in the past, danger tone | |
| CLI-42 | Four chips + 20-char name at 360dp | Row stays readable; no chip clipped to meaninglessness | |
| CLI-43 | Chip not colour-only | Each tone distinguishable without colour (icon/text) — red-green colour-blind check | |
| CLI-44 | Sort options | Each sort in `SortSheet` orders correctly and persists sensibly | |
| CLI-45 | Filter combinations | Two or more filters combine as AND; count in the header matches the list | |
| CLI-46 | Swipe row actions | `SwipeRow`/`RowMenu` actions all work and are undoable or confirmed where destructive | |
| CLI-47 | 30+ clients scroll | No jank; index rail (if present) jumps correctly | |
| CLI-48 | Paused client visibility | Stays in the roster, excluded from active counts and from weekly reports | |

**Consent on the roster (V18).** `status` is the trainer's view (active/paused/archived); `membership_status`
is the client's own answer and is **server-owned** — the app reads it and never writes it. The two can
legitimately disagree, and the roster has to show both without conflating them.

| ID | Case | Steps | Expected | P/F |
|---|---|---|---|---|
| CLI-50 | New client is `invited` | Add a client with a phone → sync → psql | `membership_status='invited'`, `invited_at` set. This is now the default for every new client | |
| CLI-51 | Client with **no** phone | Add a client, leave the phone blank → sync | Born `accepted`, not `invited` — there is nobody to ask, so nothing should sit waiting on an answer that can never come | |
| CLI-52 | Un-invitable number | Put T1's number on T2's roster → sync | Row **exists** (S1 if the client, their sessions or their payments are dropped), tagged **"Can't invite"** in `warn` tone. It must **not** read "Invited" | |
| CLI-53 | The line says what to do | Look at the row's second line | "That number is a trainer account — they can't be invited". A tag alone that never explains itself is S3 | |
| CLI-54 | Ranked above money | Give the same client an overdue payment | The un-invitable item still wins the row. Every other attention item became true over time; this one is a typo from seconds ago that takes seconds to fix, and burying it leaves the trainer believing they invited somebody they didn't | |
| CLI-55 | Swipe verb is an edit | Swipe the row | **Fix number** → `EditClient`. It is the only attention item whose fix is an edit rather than a WhatsApp — there is nothing to say to the client and nothing they could do | |
| CLI-56 | Correcting the number recovers it | Edit to a free number → sync | `membership_status → invited`, the tag clears, `app_user` gains a `client` row for the new number | |
| CLI-57 | Editing back re-blocks | Edit back to the trainer's number → sync | `unavailable` again — never left claiming "invited" for an invite that cannot be delivered | |
| CLI-58 | Invite age restarts on recovery | After CLI-56, check the roster line | Counts from when the number became **valid**, not from the first attempt. "Invited 30 days ago · not set up" about an invite that only became sendable today is a lie — nobody was ignoring it | |
| CLI-59 | Roster redraws on pull | Leave the roster open while the correcting sync lands | The tag clears without a manual refresh (`membership_status` is in `observeWithColumns`; if it is missing the row goes stale until an unrelated edit rebuilds it) | |
| CLI-59a | Un-invitable client still works | Book, log and bill the CLI-52 client | All normal. Only app access is impossible — the trainer's record is untouched | |

### 4.3 Client file, edit, end

| ID | Case | Expected | P/F |
|---|---|---|---|
| CLI-60 | File renders all sections | Chips, intake, metrics, programs, sessions, money, actions | |
| CLI-61 | Brand-new client's file | Every section shows a real empty state | |
| CLI-62 | Edit every field | Each change persists locally and after sync | |
| CLI-63 | Pause → reactivate | Status flips both ways; chips and counts follow; history untouched | |
| CLI-64 | Soft delete | Confirm dialog **names the consequence** ("their history stays / goes"), not "are you sure"; row disappears; `deleted_at` set, row still in Postgres | |
| CLI-65 | Deleted client's tail | Their sessions/payments/logs behave per spec (verify what the app claims in the dialog is actually true) | |
| CLI-66 | Delete then re-add same phone | Allowed; the new client is a separate row, no resurrection of old data | |
| CLI-67 | Change payment mode after payments exist | Historic payments keep their original mode; the ledger doesn't rewrite history | |
| CLI-68 | Change split % mid-month | Dashboard split recalculates per the rule the product intends — record which (retroactive or forward-only) | |
| CLI-69 | Offline edit + trainer edits on device B 📵 | Last-write-wins, silently; no duplicate, no crash; recency is visible enough that the trainer isn't confused | |
| CLI-70 | File explains an un-invitable number (open the CLI-52 client) | A **"Can't invite"** tag beside the status (not replacing it — they are still active) and a callout naming the number, why, and a **Change number** button | |
| CLI-71 | Archive is the removal the client sees (`ClientEndScreen` → **Archive**) | `membership_status → removed`, `removed_at` stamped. This — not the hard remove — is what drives AUTH-70 | |
| CLI-72 | Hard remove leaves nothing to notify (`ClientEndScreen` → remove/purge) | Row and its money are gone by design, so that client falls through to `unattached` at sign-in rather than a removal notice. Confirm the dialog says the money goes too | |
| CLI-73 | Resuming an archived client (un-archive) | `membership_status` returns to `accepted`; a previously-acknowledged removal is re-armed (AUTH-74) | |

### 4.4 Body metrics (append-only, FR-1.3)

| ID | Case | Expected | P/F |
|---|---|---|---|
| CLI-80 | Add weight with a date | Appears in the list and the chart | |
| CLI-81 | Backdated entry | Accepted; chart re-orders correctly | |
| CLI-82 | Future-dated entry | Rejected or clearly marked — must not silently become "latest" | |
| CLI-83 | Two entries same day | Both kept (append-only); the screen picks one for "current" deterministically | |
| CLI-84 | Correcting a reading | The path is **another entry**, not an edit or delete (no delete path exists server-side) | |
| CLI-85 | Non-weight metrics | Waist/chest etc. save with the right unit (cm) | |
| CLI-86 | Value edge cases | `0`, negative, `999`, `72.456`, blank, text → rejected inline where invalid | |
| CLI-87 | Offline metric 📵 | Queues, appears instantly | |
| CLI-88 | Duplicate queued push | Re-sync the same queued row → **one** reading, not two (upsert by id) | |

---

## 5 · EXR — exercise library & custom exercises (FR-3.4)

| ID | Case | Expected | P/F |
|---|---|---|---|
| EXR-01 | Seeded library present | 1,324 exercises searchable offline | |
| EXR-02 | Search by name | Fast, forgiving (`benc` → Barbell bench press). Seeded names are lower-case but for the first letter | |
| EXR-03 | Search by muscle / equipment | Filters combine correctly. Typing a body part (`legs`) also matches, which muscle names alone would not | |
| EXR-04 | No results | Real empty state + "add a custom exercise" exit | |
| EXR-05 | Missing image | Falls back to the dumbbell glyph, not a broken-image box (media is mirrored and may 404) | |
| EXR-06 | Media while offline 📵 | Placeholder, no broken-image icon, no retry storm | |
| EXR-07 | Create custom exercise inline | Created from the picker **mid-build without losing the draft** | |
| EXR-08 | Custom name duplicate of a seeded one | Allowed with a warning; both distinguishable in the list | |
| EXR-09 | Custom name blank / 200 chars / emoji | Blank rejected; long name doesn't break rows | |
| EXR-10 | Custom video link | Valid URL opens externally; invalid rejected; `javascript:` / `file:` schemes refused (🔒 see SEC-DEV-06) | |
| EXR-11 | Custom exercise visible to the client | Assigned in a program → the client's app shows the **name**, not a blank (client pull includes `trainer_id`'s custom exercises) | |
| EXR-12 | Another trainer's custom exercise | T2's custom exercise never appears in T1's picker | |
| EXR-13 | Scroll 1,324 rows | Smooth; search-as-you-type doesn't drop input; thumbnails don't stall the list | |
| EXR-14 | Open a seeded exercise → How to | The tab opens on the **numbered steps**. No demo frame, no empty media box, no spinner where one used to be | |
| EXR-15 | 🔒 No Gym visual media anywhere | No image renders and no "© Gym visual" credit appears on any screen. Grep the sync payload: every `image_url` and `video_url` is null. **A frame or a credit line surfacing here means unlicensed media shipped** — a legal defect, not a cosmetic one | |
| EXR-16 | Every row shows the glyph | All 1,324 rows draw the dumbbell tile. It must read as a deliberate tile, not as a broken image — no torn-page icon, no flicker | |
| EXR-17 | Open a custom exercise | Same as a seeded one, except the accent outline on the tile. With no photographs anywhere, that outline is now the only visual tell for "yours" — confirm it is legible in both themes | |
| EXR-18 | Row recycled after a failed image | Scroll a row whose image 404'd out of view and back; the next exercise in that cell shows **its own** image, not the inherited glyph | |
| EXR-19 | Program written against the retired library | After V21, a program built on the old seed reads "That exercise isn't here" — history and set logs intact, exercise re-pickable. **Expected, not a bug** | |

---

## 6 · PRG — templates, programs, per-client tweak (FR-3)

The rule under test: **a template is a blueprint, a program is the client's copy, and editing the copy never edits the blueprint.**

| ID | Case | Expected | P/F |
|---|---|---|---|
| PRG-01 | Build first template from nothing | Empty template → empty day → add exercises; every empty state designed | |
| PRG-02 | Days 0–6, 3-day and 6-day plans | Both build and render; day tabs handle up to 7 | |
| PRG-03 | Day labels | "Push Day" saves and shows on both roles | |
| PRG-04 | Sets/reps/rest/target load | Reps accepts `8–12` and `AMRAP`; load accepts `bodyweight` and `60kg` — **free text, not steppers** | |
| PRG-05 | Numeric-looking targets | `0`, `999`, `-3` in sets → sane handling | |
| PRG-06 | Reorder within a day | Order persists after reopen and after sync | |
| PRG-07 | Move an exercise between days | Ends up in exactly one day | |
| PRG-08 | Delete an exercise from a template | Removed; assigned programs unaffected | |
| PRG-09 | Duplicate / rename a template | Copy is independent; rename doesn't orphan programs | |
| PRG-10 | Assign to a client | Deep copy created; **template unchanged** — verify in Postgres that `program_exercise` rows are new ids | |
| PRG-11 | Tweak the program | Screen states visibly "this affects only this client"; template and other clients' programs unchanged | |
| PRG-12 | Edit the template after assigning | Assigned programs **do not** change (documented behaviour, open question Q2) — confirm and record | |
| PRG-13 | Delete an assigned template | Existing programs survive; the UI says so before deleting | |
| PRG-14 | Assign when an active program exists | Explicit choice: replace or run both. Never silent double-assignment | |
| PRG-15 | Assign to a paused client | Allowed or explained; not a silent no-op | |
| PRG-16 | Assign fires a push | Trainer is told the client will be notified; client receives it (FR-8.3) | |
| PRG-17 | Offline build + assign 📵 | Fully offline; syncs later; the push fires after sync, not before | |
| PRG-18 | Force-close mid-build | Every added exercise survives; nothing waits on a Save button | |
| PRG-19 | Empty template assigned | Either blocked with a reason or produces an honest empty program | |
| PRG-20 | 20 exercises in one day | Scrolls; drag handles still usable | |
| PRG-21 | Program with a deleted exercise | Exercise soft-deleted after assignment → program row degrades gracefully | |
| PRG-22 | Two devices assign different templates | Last-write-wins; the roster doesn't end up with two active programs | |

---

## 7 · DIA — diary, scheduling, session lifecycle (FR-2)

| ID | Case | Expected | P/F |
|---|---|---|---|
| DIA-01 | Book a one-off session | Client, date, time, duration saved; appears in the day view | |
| DIA-02 | Day / week / month views | All three render; day has time gutters; switching keeps the focused date | |
| DIA-03 | Empty day / empty week | Reads as a rest day, not as broken | |
| DIA-04 | Recurring weekly slots | "Mon/Wed/Fri 7:00am 60min for 8 weeks" → **preview of every generated date before commit** | |
| DIA-05 | Recurring across a month boundary / DST-free IST | All 24 dates correct, no off-by-one | |
| DIA-06 | Recurring 0 weeks / 52 weeks | 0 rejected; large count either capped with a reason or handled | |
| DIA-07 | Double booking | Shown as a clash (`ClashSheet`) but **allowed** — trainers do it on purpose | |
| DIA-08 | Booking outside working hours | Warned, not blocked | |
| DIA-09 | Booking in the past | Allowed (retroactive) or clearly refused — record which; must be deliberate | |
| DIA-10 | Time off / blocks | `TimeOffSheet` blocks the slot; booking into it warns | |
| DIA-11 | Mark done | **Decrements the pack by exactly 1**; links the workout log; status/tone changes | |
| DIA-12 | Mark done twice | Pack decrements once (idempotent) | |
| DIA-13 | Mark no-show | Pack **not** decremented (current rule, Q4) | |
| DIA-14 | Cancel | Distinct from no-show in copy and consequence; pack untouched | |
| DIA-15 | Done → undo/revert | If offered, the pack increments back exactly once | |
| DIA-16 | Reschedule | Time changes, identity kept; "they'll be told" confirmation; client gets a push | |
| DIA-17 | Reschedule to the same time | No-op or a clear message; no spurious push | |
| DIA-18 | Mark done with no logged sets | Completely normal, no warning that implies failure | |
| DIA-19 | Retroactive marking | Yesterday's scheduled sessions markable; Deck's "needs marking" count clears | |
| DIA-20 | Session for a client with no pack | Allowed; nothing to decrement; no error | |
| DIA-21 | Session for a paused client | Allowed or explained; consistent with the roster's story | |
| DIA-22 | Session for a soft-deleted client | Not offerable; existing ones don't crash the diary | |
| DIA-23 | Offline booking + marking 📵 | Both work; queue count rises; no network error surfaced | |
| DIA-24 | Two devices mark the same session | One decrement in Postgres, not two (S1 if it double-decrements) | |
| DIA-25 | Device clock wrong by ±1 day | Today's list is wrong but recoverable; no data written to the wrong date silently | |
| DIA-26 | Midnight boundary | A 11:55pm session stays on its own day after midnight passes | |
| DIA-27 | Long client name in a session row | Time/duration/status stay visible | |
| DIA-28 | Batches (⚠ deferred) | `BATCHES_ENABLED` off → no batch UI reachable anywhere; frame 3d must not leak in | |

---

## 8 · LOG — the workout log, the floor screen (FR-4)

The tightest constraint in the product: one hand, mid-set, no signal. **Offline is the default here, not an error.**

| ID | Case | Expected | P/F |
|---|---|---|---|
| LOG-01 | Open from session | Today's programmed exercises listed in program order | |
| LOG-02 | Open from client file / Today | Same screen, same engine | |
| LOG-03 | Prefill from last session | Load, reps and RPE prefilled as ghost values from the previous session for that exercise | |
| LOG-04 | First-ever session for an exercise | Empty numeric state, no fake zeros | |
| LOG-05 | Confirm a set | Persists immediately; visible without any save action | |
| LOG-06 | Keyboards | Load = decimal, reps = integer, RPE = decimal 1–10 | |
| LOG-07 | Partial set (load, no reps) | **Saves anyway** | |
| LOG-08 | Bodyweight set (blank load) | Legitimate, saves, reads as bodyweight not as 0kg | |
| LOG-09 | Load `0` vs blank | Distinguishable in storage and display | |
| LOG-10 | Extreme values | Load `500`, `0.5`, `1000`, negative; reps `0`, `1`, `100`, `999`; RPE `0`, `10`, `11`, `5.5` → out-of-range rejected inline | |
| LOG-11 | Edit a set just logged | Updates in place, no duplicate row | |
| LOG-12 | Delete a set logged by mistake | Removed; PRs and volume recompute (they're computed on read) | |
| LOG-13 | Sets beyond target | Target 3, log 5 → allowed, no warning | |
| LOG-14 | Skip an exercise | Doesn't read as a failure (`NotTrainedSheet`) | |
| LOG-15 | Add an unplanned exercise | `AddExerciseSheet` mid-session; ordering sensible | |
| LOG-16 | Swap an exercise | `SwapSheet` records `swapped_from_exercise_id`; history still readable | |
| LOG-17 | Rest timer | `RestSheet`/`RestTimer` counts down; survives screen off; doesn't block logging | |
| LOG-18 | No program assigned | Freestyle session: pick exercises ad hoc, logs fine | |
| LOG-19 | Force-close mid-session | **Every set already entered survives** (NFR-11). Nothing held in memory | |
| LOG-20 | Airplane mode for the whole session 📵 | No network error ever appears in the log; sync bar carries the truth | |
| LOG-21 | Two clients back to back | Switching sessions is fast and unambiguous; sets never land on the wrong client | |
| LOG-22 | Same exercise in two sessions same day | Both recorded separately; set numbering per session | |
| LOG-23 | PR in the moment | If celebrated in-log, it doesn't block the next set (Q7); if deferred, Progress shows it | |
| LOG-24 | Logged by client vs trainer | `logged_by` shown to both roles; a later tick from the other side does **not** rewrite it | |
| LOG-25 | Finish session | `FinishScreen` summary correct; appointment markable done from there | |
| LOG-26 | Finish an empty session | Allowed, honest summary | |
| LOG-27 | Reopen a finished session | Editable or read-only per design — consistent, not a crash | |
| LOG-28 | Exercise history | `ExerciseHistoryScreen` shows previous sessions for that exercise, gaps and all | |
| LOG-29 | Today's bests | `TodaysBestsScreen` matches the sets actually logged | |
| LOG-30 | 40 sets in one session | No lag on entry; scroll position sane after each confirm | |
| LOG-31 | Screen rotation / large font | Layout survives at the OS's largest font size | |
| LOG-32 | Set note long text | 500 chars saves; row doesn't explode | |

---

## 9 · PRO — progress, PRs, adherence (FR-5)

| ID | Case | Expected | P/F |
|---|---|---|---|
| PRO-01 | PRs computed on read | Heaviest load, best e1RM, best volume — never stored; a deleted set changes them retroactively | |
| PRO-02 | PR on a bodyweight exercise | **Reps are the record**, not load | |
| PRO-03 | PR mark wherever a set appears | Consistent marking in log, history, progress | |
| PRO-04 | One data point | A real design, not a spinner and not an empty chart frame | |
| PRO-05 | Two to four points | Chart doesn't imply a trend it can't support | |
| PRO-06 | Gap of months then a return | Chart shows the gap; **does not interpolate a lie** | |
| PRO-07 | Volume chart | = Σ(load × reps) per session; matches a hand calculation for one client | |
| PRO-08 | Top-set chart | Heaviest working set per exercise | |
| PRO-09 | Bodyweight chart, sparse | Handles weeks with no entry | |
| PRO-10 | Weight moving "wrong" for the goal | Neutral framing, no judgement, no red | |
| PRO-11 | Units | kg and cm everywhere; no imperial anywhere in v1 | |
| PRO-12 | Legibility at 360dp | Readable in gym lighting; axis labels not clipped | |
| PRO-13 | Adherence = done ÷ scheduled | Matches a hand count; cancelled/no-show handled per the stated rule | |
| PRO-14 | Adherence roster-wide | `AdherenceScreen` surfaces who is drifting; paused clients excluded or marked | |
| PRO-15 | Zero scheduled sessions | Adherence shows "—", not 0% or NaN | |
| PRO-16 | Same numbers, both roles | Trainer's and client's Progress agree exactly for the same client | |
| PRO-17 | Offline progress 📵 | Computed locally, fully available | |

---

## 10 · PAY — packs, money book, payments (FR-6, FR-7)

There is **no gateway**. Reconciliation is manual by design. The ledger must feel trustworthy without pretending.

### 10.1 Packages

| ID | Case | Expected | P/F |
|---|---|---|---|
| PAY-01 | Create session pack | Sessions, amount, start, expiry saved; `sessions_remaining` = total | |
| PAY-02 | Create monthly pack | Dates-based, no session count, or count optional | |
| PAY-03 | Amount edge values | `0`, `1`, `-500`, `99,99,999`, decimals → negative rejected; whole rupees in practice | |
| PAY-04 | Sessions edge values | `0`, `1`, `100`, negative, blank → sane handling | |
| PAY-05 | Expiry before start | Rejected inline | |
| PAY-06 | Expiry = start | Allowed or rejected — deliberate either way | |
| PAY-07 | Two live packs on one client | Allowed? If so, decrement order is defined and visible | |
| PAY-08 | Pack exhausted before expiry | Renewal prompt; `pack empty` chip | |
| PAY-09 | Pack expires with sessions left | Renewal prompt; `expired` chip; leftover sessions handled per spec | |
| PAY-10 | Renewal prefills | New pack prefilled from the previous one's values | |
| PAY-11 | Write-off | `WriteOffSheet` records `written_off_at`/`amount`; the month's figures still add up | |
| PAY-12 | Write-off reversal | Correctable by a reversing entry, not an edit | |
| PAY-13 | Pack for a paused client | Consistent with the pause story | |

### 10.2 Recording payments

| ID | Case | Expected | P/F |
|---|---|---|---|
| PAY-20 | Trainer-collects, mark paid | Ledger row: amount, method, collected-by, who confirmed, date | |
| PAY-21 | Gym-collects, mark paid | No UPI link anywhere; trainer marks paid/unpaid | |
| PAY-22 | Gym-collects with no amount | Allowed (paid/unpaid only); revenue must not invent a number | |
| PAY-23 | Cash method | `method: cash` has a full path | |
| PAY-24 | Partial payment | Half now → remainder still owed; both visible; figures add up | |
| PAY-25 | Overpayment | More than owed → refused with a reason, or recorded as credit — deliberate, never a negative owed that reads as a debt | |
| PAY-26 | Payment amount `0` / negative | Rejected | |
| PAY-27 | Marked paid by mistake | Correction is a **reversing entry** (append-only), not a delete | |
| PAY-28 | Undo window | Within `UNDO_WINDOW_MS` (24h) undo is offered; after it, only a reversing entry | |
| PAY-29 | Both parties mark it paid | **One** payment, no double-counted revenue (S1 if doubled) | |
| PAY-30 | Backdated payment | Lands in the right month's figures | |
| PAY-31 | Future-dated payment | Rejected or marked; must not inflate this month's revenue | |
| PAY-32 | Offline payment record 📵 | Never blocked; queues; ledger shows it immediately | |
| PAY-33 | Receipt | `ReceiptSheet` shows a correct, shareable receipt; amount in words/₹ correct | |
| PAY-34 | Export | `ExportSheet` output opens elsewhere; totals match the screen | |
| PAY-35 | Ledger ordering | Newest first; running balance points at the right numbers | |
| PAY-36 | "Hisaab clear" month | A month with nothing outstanding says so | |
| PAY-37 | GST warning line | Approaching ₹20L (80% = ₹16L) warns **before** crossing, never after | |
| PAY-38 | Gym share screen | `GymShareScreen` splits per client percentage; totals reconcile with the Deck | |
| PAY-39 | Owed screen | `OwedScreen` lists exactly the clients with a balance; matches the chips | |

### 10.3 UPI deep link (FR-6.3)

`upiUri()` in `app/src/money/money.ts` builds `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`.

| ID | Case | Expected | P/F |
|---|---|---|---|
| PAY-50 | Happy path | Button opens the UPI app with VPA, payee name, amount and note prefilled | |
| PAY-51 | No VPA saved | **Button does not exist**; routed to Settings with an explanation (first-run gap) | |
| PAY-52 | No UPI app installed | Android fails the intent silently → fallback shows the VPA as **copyable text** | |
| PAY-53 | Amount rounding | `am` is `Math.round(amount)` — check ₹1500.4 → 1500 and ₹1500.6 → 1501; the screen and the link must agree | |
| PAY-54 | Amount `0` or negative | Pay button disabled (`amount <= 0`) | |
| PAY-55 | Partial amount typed | Link carries the typed amount; remainder shown as still owed | |
| PAY-56 | Typed amount > owed | See PAY-25 | |
| PAY-57 | Trainer name with `&`, `#`, newline, emoji | URI-encoded; **no extra UPI parameters injected** (🔒 SEC-DEV-04) | |
| PAY-58 | Note with special chars | Encoded; UPI app shows it intact | |
| PAY-59 | Offline UPI 📵 | The UPI app itself needs network, but XRep's record queues; mark-paid is never blocked | |
| PAY-60 | Client-side pay sheet | Same rules on `screens/client/PaySheet.tsx`; client never sees the split | |

---

## 11 · NDG — WhatsApp nudges (FR-9)

| ID | Case | Expected | P/F |
|---|---|---|---|
| NDG-01 | One-tap from context | Reachable from the row that made it necessary (client row, session row, owed row) | |
| NDG-02 | Four templates | Session reminder, weekly check-in, payment reminder, renewal/expiry all present | |
| NDG-03 | Payment reminder is mode-aware | "Pay via UPI" for trainer-collects vs "pay at the front office" for gym-collects | |
| NDG-04 | Variables prefilled and editable | Preview shows the **exact** outgoing message | |
| NDG-05 | Wording locked | The template body is not free text; the UI makes that legible (Meta-approved templates) | |
| NDG-06 | Client with no phone | Affordance absent or explained — never a broken send | |
| NDG-07 | Malformed stored phone | `whatsappUri` returns null for <10 digits → button degrades, no `wa.me/91undefined` | |
| NDG-08 | Delivery states | queued → sent → failed; **"sent" must not imply read** | |
| NDG-09 | Send offline 📵 | Queues, goes out later, state readable | |
| NDG-10 | Repeat sends | "Last nudged" visible so trainers don't spam | |
| NDG-11 | Nudge spam guard | Sending 5 in a row → warned or rate-limited; record actual behaviour | |
| NDG-12 | Auto vs manual | `NudgeRulesScreen` says which fire on their own; each can be turned off, and off means off | |
| NDG-13 | Rule edits take effect | Change a rule → next trigger honours it | |
| NDG-14 | Provider down / template rejected | Actionable failure, not a silent nothing | |
| NDG-15 | Bulk message | `BulkMessageSheet` sends to the selected set only; count matches; opt-outs respected | |
| NDG-16 | Nudge log privacy | The nudge log is the trainer's outbox — it must never reach a client's device (🔒 SEC-WALL-03) | |
| NDG-17 | Long client name / Tamil text in a variable | Message renders, no truncation mid-word that changes meaning | |

---

## 12 · RPT — weekly report (FR-10)

Server-side: `report/WeeklyReportJob.java`, `WeeklyReportWriter.java`; API `GET /v1/clients/{id}/report`, `POST /v1/clients/{id}/report/weekly`.

| ID | Case | Expected | P/F |
|---|---|---|---|
| RPT-01 | Generated per active client | Progress, PRs, adherence for the week | |
| RPT-02 | Week with zero sessions | Says something **true and not shaming** | |
| RPT-03 | Week with no PRs | The common case; reads fine | |
| RPT-04 | A great week | The celebratory, shareable case | |
| RPT-05 | Client who just started | One session, no baseline → honest report | |
| RPT-06 | Paused clients excluded | No report generated or sent | |
| RPT-07 | Soft-deleted client excluded | Same | |
| RPT-08 | Trainer preview before send | Preview matches what the client receives | |
| RPT-09 | On-demand for a past week | Any past week generable; correct week boundaries in IST (Mon–Sun or as specified) | |
| RPT-10 | Idempotent regeneration | Regenerating the same week doesn't create two rows / two sends | |
| RPT-11 | Report opened weeks later | Dates unambiguous (no bare "Monday") | |
| RPT-12 | Client-side view | `screens/client/ReportsScreen.tsx` shows exactly the stored report, offline | |
| RPT-13 | Delivery link stands alone | If a link, it renders outside the app — and is **not guessable/enumerable** (🔒 SEC-PRIV-04) | |
| RPT-14 | Report for another trainer's client | `GET /v1/clients/{C2}/report` as T1 → refused (🔒 SEC-IDOR-06) | |

---

## 13 · SYNC — offline-first sync (FR-8, NFR-2/4/11)

Trainer: `GET/POST /v1/sync/pull|push`. Client: `GET/POST /v1/client/sync/pull|push?clientId=…`.

| ID | Case | Expected | P/F |
|---|---|---|---|
| SYNC-01 | In-sync state | Silent — no badge shouting success | |
| SYNC-02 | Offline state 📵 | Persistent, calm, **not an error**; everything still works | |
| SYNC-03 | Queued state | "12 changes waiting to sync" — count is accurate, tone reassuring | |
| SYNC-04 | Syncing state | Brief, non-blocking, no modal | |
| SYNC-05 | Sync failed | Warning tone, retry, explicit "your data is safe" | |
| SYNC-06 | Retry after failure | Succeeds without duplicating anything | |
| SYNC-07 | Airplane mode → back online | Auto-sync on reconnect and on app foreground | |
| SYNC-08 | Long offline stretch | A week of logs (100+ records) syncs in one pass; no timeout, no partial-apply corruption | |
| SYNC-09 | Kill the app mid-sync | Queue intact; re-sync completes; no duplicates | |
| SYNC-10 | Backend down mid-push | Fails cleanly, queue preserved | |
| SYNC-11 | Backend 500 mid-push | Same; the record is not silently dropped | |
| SYNC-11a | Rate-limited sync (429) | Drive `/v1/sync/pull` past 60/min, then sync from the app | Lands in the designed **sync failed** state — retry offered, local data visibly safe. Sync is event-triggered with an in-flight guard and no retry loop, so it must **not** spin against the limit | |
| SYNC-12 | Slow network (throttle to 2G) | No UI freeze; timeout at 15s then queued | |
| SYNC-13 | Conflict, both sides edited | Last-write-wins, **silent** (no prompt); value may change under the trainer | |
| SYNC-14 | Client logs while trainer offline | Appears after sync, attributed to the client — not to the trainer | |
| SYNC-15 | Soft deletes propagate | Deleting on A removes it on B after sync | |
| SYNC-16 | Idempotent re-push | Push the same queued batch twice → no duplicate rows (client UUIDs + upsert) | |
| SYNC-17 | Cursor correctness | `lastPulledAt` advances; a second immediate pull returns (almost) nothing | |
| SYNC-18 | Cursor = 0 / missing | Full history returned, app handles the volume | |
| SYNC-19 | Force-close mid-write | No data loss (NFR-11) | |
| SYNC-20 | Two devices, same trainer | Both converge; no lost writes beyond documented LWW | |
| SYNC-21 | Clock skew | Device clock 1h ahead → its writes always win LWW. Record the blast radius (🔒 SEC-BIZ-09) | |
| SYNC-22 | Migration on upgrade | Install the previous build, create data, upgrade → WatermelonDB migrations run, data intact (migrations are immutable — never edited) | |
| SYNC-23 | Sign out with queued changes | Queue is flushed before the token is wiped, or the user is warned; no silent loss | |
| SYNC-24 | Sign out then in as someone else | **Local DB wiped** — no trace of the previous account's clients (S1 if any leaks) | |

---

## 14 · PUSH — notifications (FR-8.2)

| ID | Case | Expected | P/F |
|---|---|---|---|
| PUSH-01 | Permission primer | Asked at a moment the value is obvious, not on first launch (Q5) | |
| PUSH-02 | Permission denied | Every push-dependent promise degrades; the app explains what stops working and how to re-enable | |
| PUSH-03 | Token registration | `POST /v1/devices/token` succeeds for a trainer; token stored | |
| PUSH-04 | Token de-registration on sign-out | `DELETE /v1/devices/token` called; no pushes to the signed-out device | |
| PUSH-05 | ⚠ Client push token | `/v1/devices/**` is TRAINER-only and only `trainer.fcm_token` exists — a **client-role** device cannot register. Expect client pushes not to arrive; record as a gap against FR-8.2/FR-11 | |
| PUSH-06 | Plan assigned → client | Push received, deep-links to Today/plan | |
| PUSH-07 | Session rescheduled → client | Push received, deep-links to Sessions | |
| PUSH-08 | Payment confirmed → both | Deep-links to payment history | |
| PUSH-09 | Weekly report ready → client | Deep-links to the report | |
| PUSH-10 | Session logged by client → trainer | Deep-links to session detail | |
| PUSH-11 | App open when push arrives | In-app landing, no jarring navigation loss | |
| PUSH-12 | App backgrounded | Tapping the notification lands on the right screen | |
| PUSH-13 | App killed | Cold start deep-links correctly | |
| PUSH-14 | Push while offline 📵 | Arrives late; the app doesn't act on stale content | |
| PUSH-15 | No FCM credentials configured | Backend logs instead of sending; nothing crashes (`app.fcm.credentials` blank) | |
| PUSH-16 | Notification content privacy | No client name/amount on a lock screen beyond what's acceptable — check against DPDP minimisation | |

---

## 15 · CLNT — client role (FR-11)

| ID | Case | Expected | P/F |
|---|---|---|---|
| CLNT-01 | First launch, no plan | The most likely first launch: explains their trainer will assign one | |
| CLNT-02 | Rest day | Distinct from "no plan" | |
| CLNT-03 | Today's plan | Matches what the trainer assigned, exercise for exercise | |
| CLNT-04 | This week | `WeekScreen` shows the week correctly | |
| CLNT-05 | Next session card | Right time, right day, IST | |
| CLNT-06 | Payment due banner | Amount matches the trainer's ledger | |
| CLNT-07 | Log their own workout | Same log engine; `logged_by: client`; trainer sees who logged it | |
| CLNT-08 | Log offline 📵 | Works fully; syncs on the client's next pull/push | |
| CLNT-09 | Progress | Their PRs and charts; same numbers as the trainer's view | |
| CLNT-10 | Log a body metric | `WeightSheet` appends; append-only explained; no delete path | |
| CLNT-11 | Sessions list | Upcoming visible; **cannot cancel, move or no-show** | |
| CLNT-12 | Confirm a moved session | Can set `client_confirmed_at` once; a second confirm is a no-op | |
| CLNT-13 | Trainer changed the plan | Push, then visible on next open | |
| CLNT-14 | Pay via UPI | Trainer-collects only; never a broken button | |
| CLNT-15 | Gym-collects client | "Pay at the front office", no UPI button at all | |
| CLNT-16 | Mark own payment paid | ⚠ Client push refuses `payments` server-side — confirm the client UI does **not** promise a balance change it cannot make; the honest behaviour is "tell your trainer" | |
| CLNT-17 | Receipts | `ReceiptsScreen` shows their own payments only | |
| CLNT-18 | Weekly report | Reads Sunday's stored report | |
| CLNT-19 | Client never sees the split | No split %, no gym share, no revenue anywhere (Q6) — sweep every screen | |
| CLNT-20 | Client never sees another client | No roster, no cohort, no aggregate a name is inferable from | |
| CLNT-21 | Paused client experience | History and self-logging present, coaching layer absent, banner names the trainer and date | |
| CLNT-22 | Two memberships (CB) | Both trainers' data reachable, kept apart, no cross-contamination of plans or money | |
| CLNT-23 | Removed from a roster mid-session | Next sync refuses (403) — the app must not hard-crash; it explains and lands somewhere sane | |
| CLNT-24 | Client help / profile | `ClientHelpScreen`, `ClientProfileScreen` render; sign-out works | |
| CLNT-25 | Client notifications screen | Shows their own events only | |
| CLNT-26 | Nothing before consent — as CI (invited, never accepted), sweep every client screen | There is no way into any of them; the invited token opens no scope (AUTH-63). A client screen reachable pre-acceptance is **S1**: it shows training data to somebody who has not agreed to share it | |
| CLNT-27 | Accepting opens the lens cleanly | First sync populates plan/sessions/coach; no empty shell, no "no plan" screen for a client who has one | |
| CLNT-28 | Second invite surfaced inside — CB accepted with T1, freshly invited by T2 | The outstanding invite is reachable from **inside** the lens (it travels in `clientOf`, AUTH-69) rather than only at the next sign-in | |
| CLNT-29 | Removal notice copy (as CR) | Names the trainer and the date; explains the local data goes and the trainer keeps their own record; offers a WhatsApp to the trainer for "this must be a mistake" | |
| CLNT-30 | Wipe scope — CB removed by T1 but still with T2 | ⚠ Verify what the wipe actually clears: `resetLocalDatabase()` is whole-database. Confirm T2's data returns on the next sync and record the gap if the intermediate state is visibly broken | |

---

## 16 · ROLE — the picker (a client of two trainers)

**Rewritten for V18.** This section used to test one phone holding both roles. That state no longer
exists: `app_user.role` is exclusive. What survives is the case it was conflated with — **a client on two
trainers' rosters**, which is two client rows and one human being, and is still fully supported.
`RoleScreen` now serves only that.

The trainer↔client lens switch is therefore unreachable, and the point of ROLE-10/11 is that it degrades
to *absent* rather than to *broken*.

| ID | Case | Expected | P/F |
|---|---|---|---|
| ROLE-01 | Picker appears for CB | Both **trainers** listed by name and gym; copy reads "You train with more than one trainer. Whose book do you want to open?" — no coaching card | |
| ROLE-02 | Single live roster skips the picker (C1 signs in) | Straight into the lens. The picker must never appear for one membership | |
| ROLE-03 | Switch between trainers, from the client drawer | Same token, no re-login; local queue flushed first | |
| ROLE-04 | State not lost | Switching doesn't lose an in-progress log or form (or warns before discarding) | |
| ROLE-05 | Lens persists across restart | Reopening lands on the last-used membership | |
| ROLE-06 | Data separation | Each membership shows only its own trainer's plans, sessions and money — no bleed (see SEC-WALL-05) | |
| ROLE-07 | Paused roster selectable but not preselected — CB paused by T1, active with T2 | T2's card is preselected; T1's is still tappable and labelled "Paused — your history is still here" | |
| ROLE-08 | Switch while offline 📵 | Works from local data | |
| ROLE-09 | Switch with queued writes | Nothing is lost or misattributed to the other membership | |
| ROLE-10 | No coaching card for a client (inspect `RoleScreen` as CB) | The trainer card and its roster count are gone. A client's `trainerId` is always null now, so an offered-but-dead "Switch to coaching" in `ClientDrawer` is S3 | |
| ROLE-11 | No client card for a trainer — T1 → "My training" in the tab bar | Lands on **SelfTraining**, because a trainer's `clientOf` is always empty. It must not open an empty client lens (`AppTabs.tsx` falls through to `SelfTraining` when `memberships` is empty — confirm it does) | |

---

## 16A · TEAM — team coaching (V26, V27)

> **Numbered 16A rather than renumbering 17–27.** Every later section is
> cross-referenced by number from a dozen places in this document (§21, §22.1,
> §25), and shifting them would break more than it tidies. Same reason §21.1b
> exists.

Backend: `team/` — `TeamService`, `TeamScope`, `TeamPhoneGuard`, `TeamClientService`,
`TeamLibraryService`, `TeamEditService`, `TeamRevenueService`. App: `src/team/`,
drawer frames **6a–6l**. Design: [`XRep_team_coaching_prd.md`](XRep_team_coaching_prd.md).

**The three rules under test.** Everything in this section is a way of checking one
of them, and a failure against any of them is **S1**:

1. **A team widens reads; it never moves ownership.** No table gained a `team_id`,
   and none of the 63 endpoints that predate V26 changed what they return.
2. **Nobody opens anybody else's money book.** `package`, `payment` and
   `gym_settlement` never appear under `/v1/team/**` — with exactly one exception,
   `GET /v1/team/revenue`, which is owner-only and totals-only.
3. **Team-wide data is online-only.** Only `team` and `team_member` enter sync, plus
   team custom exercises. Everything else team-wide needs a connection, and the
   screens must say so rather than fake a cache.

`TEAM_ENABLED=false` on the backend must make every case here answer `404` and the
drawer row disappear — run **TEAM-01** first to confirm which mode you are in.

### 16A.1 Forming a team, inviting, seats

| ID | Case | Steps | Expected | P/F |
|---|---|---|---|---|
| TEAM-01 | Feature switch | Restart backend with `TEAM_ENABLED=false`; open the drawer | No **Team** row under Growth. `curl $BASE/v1/team -H "$T1"` → `404` with no `code`. Restore `true` before continuing | |
| TEAM-02 | No team is not an error | As T1 (no team yet), `curl -i $BASE/v1/team -H "$T1"` | **`204`**, empty body. The screen shows the create pitch, not an error | |
| TEAM-03 | Create a team | Drawer → Growth → Team → Create a team | Named from the gym name if T1 has one; T1 is `owner`, `activeMembers: 1`, seat limit 5 | |
| TEAM-04 | One team per trainer | Try to create a second | `409 ALREADY_IN_TEAM` | |
| TEAM-05 | Invite a number with an account | Invite TA's number | `201`; WhatsApp opens with the invitation prefilled from **T1's own number** | |
| TEAM-06 | Back out of WhatsApp | Invite, then cancel the share sheet | The invitation **still exists**, listed as "Waiting for them to accept". Coupling it to the share sheet would make the list lie | |
| TEAM-07 | Invite a number with **no** XRep account | Invite an unused number | `201`, `member.trainerId` is null, `phone` shown, no name. `team_member.invited_phone` set | |
| TEAM-08 | …then that number signs up | Sign in as that number, complete trainer setup | The invitation is waiting on the Home card **and** the drawer badge. Accepting binds `trainer_id` | |
| TEAM-09 | Invite a client's number | Invite C1's number | `409 PHONE_IS_CLIENT`. Pre-flight on the form says the same before submit | |
| TEAM-10 | Invite a number already in another team | Invite TX (owner of a second team) | `409 PHONE_ALREADY_IN_TEAM`. 🔒 **The message must not name TX's team or TX** — see SEC-TEAM-02 | |
| TEAM-11 | Invite yourself | Invite T1's own number | `422 PHONE_IS_SELF` | |
| TEAM-12 | Invite twice | Invite TA again while pending | `409 PHONE_ALREADY_INVITED` | |
| TEAM-13 | Re-invite after a decline | TA declines; invite again | Allowed. A rule that outlived the refusal would strand them | |
| TEAM-14 | Pre-flight agrees with the write | For each refusal above, call `POST /v1/team/invites/phone-availability` first | Same `code`, `200` status, `available: false`. A form that says available and a save that refuses is the bug | |
| TEAM-15 | Invite is `MESSAGING` tier | 11 invites inside a minute | 11th → `429 RATE_LIMITED`. This ceiling is the anti-spam control, not only a cost control | |
| TEAM-16 | Seats are checked on **accept** | Set the limit to 1 (owner fills it); invite TA | Invite succeeds — seats are consumed by people, not intentions | |
| TEAM-17 | …and refused there | TA accepts | `409 TEAM_SEAT_LIMIT` carrying `seatLimit: 1`. The app names the number without parsing the sentence | |
| TEAM-18 | Raise the limit from the app | Team → ⋯ → Team seats → 5 | TA can now accept. **A limit with no editor would be a wall with no door** | |
| TEAM-19 | Lower the limit below headcount | Set 5 → 2 with 3 coaches in | Allowed; nobody is removed; the next accept is refused. The sheet says so before saving | |
| TEAM-20 | Invitation expiry | Set `TEAM_INVITE_EXPIRY_DAYS=0`, restart, list invitations | Expired ones are **omitted** from the list; accepting a stale id → `410 TEAM_INVITE_EXPIRED` | |
| TEAM-21 | Accept changes nothing of theirs | Note TA's client count, programs and this month's collected before accepting; accept | All three identical afterwards. **This is the promise that makes joining safe to say yes to** | |
| TEAM-22 | Two accepts at once | Two invitations to TA from two teams; accept both quickly | One wins, the other `409 ALREADY_IN_TEAM`. The partial unique index is the arbiter | |

### 16A.2 Roles, removal, ownership

| ID | Case | Expected | P/F |
|---|---|---|---|
| TEAM-23 | A coach is not widened | TA as plain `coach`: no **Team clients** row, `GET /v1/team/clients` → `403 NOT_TEAM_ADMIN`. Being in a team is not being an admin | |
| TEAM-24 | …but does get the library | **Team programs** is reachable, and lists every coach's templates. This is most of what a coach joins for | |
| TEAM-25 | Promote a coach to admin | Owner → coach row → Make them an admin. Push arrives; TA now sees Team clients | |
| TEAM-26 | An admin cannot touch another admin | Promote TA and TB to admin; as TA try to demote or remove TB | `403 NOT_TEAM_OWNER` both ways, and neither action is drawn in the sheet | |
| TEAM-27 | `owner` is not an assignable role | `PATCH /v1/team/members/{id}/role` with `"owner"` | `422 TEAM_ROLE_INVALID` — making somebody the owner is a transfer | |
| TEAM-28 | The owner cannot be removed | As an admin, remove the owner | `422 CANNOT_REMOVE_OWNER`; the row offers no Remove | |
| TEAM-29 | The owner cannot leave | Team → ⋯ → there is no Leave for an owner; `DELETE /v1/team/members/me` → `422 CANNOT_REMOVE_OWNER` | |
| TEAM-30 | Transfer ownership | Coach sheet → Hand the team over → confirm | They become `owner`, T1 becomes `admin`, `team.owner_trainer_id` rewritten. The dialog **names them** | |
| TEAM-31 | Removal ends visibility, not ownership | Remove TA; check TA's roster, programs and money book | All intact and still theirs. The dialog says exactly this before you confirm | |
| TEAM-32 | Removed coach loses the team | TA's phone after the next sync: no team, no teammates, no team exercises. `GET /v1/team` → `204` | |
| TEAM-33 | Removal tombstones reach every phone | On a **third** member's device, the removed coach disappears from the list after one sync | |
| TEAM-34 | Delete the team | Owner → ⋯ → Delete the team | Every member freed; **no client data touched anywhere**; each ex-member can immediately create their own | |
| TEAM-35 | Leave | As a non-owner coach, Leave the team | Their clients stay theirs; the team drops off their phone | |
| TEAM-36 | Member ids outside the team | `DELETE /v1/team/members/{id_from_TX_team}` as T1 | `404 MEMBER_NOT_IN_TEAM` — outside your team is *not there*, per the standing convention | |

### 16A.3 Team clients, and the money line

| ID | Case | Expected | P/F |
|---|---|---|---|
| TEAM-37 | Roster grouped by coach | Team → Team clients: one group per coach, **caller's own first**, then alphabetical | |
| TEAM-38 | Drift is stated, not left as a date | A client with no logged session for 25 days reads "Quiet 25 days" with an alert spine — not "last session 26 Jul". The screen exists to have done the subtraction | |
| TEAM-39 | Drift thresholds match the roster | 10 days → warn, 21 days → danger, identical to the trainer's own roster. Two screens disagreeing about "quiet" is worse than either threshold being wrong | |
| TEAM-40 | Gaps are one per row | A client with no plan *and* nothing booked shows one tag, not two. Drifting outranks both | |
| TEAM-41 | Never logged | A brand-new client reads "Never logged a session", warn tone — not "Quiet 19710 days" | |
| TEAM-42 | 🔒 No money on the client detail | Open a teammate's client. **No packages, no payments, no amount owed, no split.** `moneyHidden: true` in the response | |
| TEAM-43 | …and the screen says why | The callout names the rule ("Money stays with the coach who collected it"). An absence with no explanation gets filed as data loss | |
| TEAM-44 | Client ids outside the team | `GET /v1/team/clients/{C2_id}` (T2 is in no team) as T1 | `404 CLIENT_NOT_IN_TEAM` | |
| TEAM-45 | A coach cannot read the roster | `GET /v1/team/clients` as a plain coach | `403 NOT_TEAM_ADMIN` | |
| TEAM-46 | Archived clients are out | Archive one of TA's clients | Gone from the team roster; the count drops | |

### 16A.4 Reassignment — the correctness gate

> **Run this whole subsection on two devices, both signed in, both synced.** It is
> the only part of team coaching where a bug is invisible on the screen that caused
> it. Fixture: **CX**, a client of TA with a program, a future session, a past
> session, a logged workout and a recorded payment.

| ID | Case | Steps | Expected | P/F |
|---|---|---|---|---|
| TEAM-47 | Hand over, keep the plan | Team clients → CX → Hand to another coach → TB → Keep it | `200`; both coaches get a push; toast names TB | |
| TEAM-48 | The plan moved | psql | `client`, `program` and the **future** `scheduled_session` now carry TB's `trainer_id` | |
| TEAM-49 | The past did not | psql | The **past** session, the `workout_session` and the `payment` still carry TA's `trainer_id`. **S1 if any of them moved** | |
| TEAM-50 | Nudge rules untouched | psql: `SELECT trainer_id, kind FROM nudge_rule` | Unchanged for both coaches. There is no such thing as a client-scoped nudge rule, and moving them would violate `(trainer_id, kind)` | |
| TEAM-51 | Membership not reset | psql | `client.membership_status` still `accepted`. A client does not get re-invited because the gym changed who delivers | |
| TEAM-52 | The client is told | CX's phone | A push naming the new coach. They are **not** asked to re-accept | |
| TEAM-53 | New coach's device: gains | Sync TB | CX appears on the roster, with the program, **its exercises**, the future session and the whole measurement history | |
| TEAM-54 | …exercises really do arrive | Open the program on TB's phone | Every exercise is there. They are `updated_at`-stamped by the handover precisely because nothing about them changed except who may see them | |
| TEAM-55 | …and not the history | TB's money book for CX | Empty, starting now. The past sessions are not in their diary | |
| TEAM-56 | Old coach's device: losses | Sync TA | The program, its exercises and the future session are **gone** — not stale, gone | |
| TEAM-57 | **…but CX is still there, as archived** | TA's roster and money book | CX is **not** on the active roster, and the recorded payment still shows **CX's name**. `status` arrives as `archived` in TA's pull while psql still says `active` | |
| TEAM-58 | The projection cannot leak back | Force a push from TA's phone after TEAM-57 | psql: CX still `active` and still TB's. Both write paths end in `WHERE client.trainer_id = :tid` | |
| TEAM-59 | Start fresh | Hand another client over with **Start fresh** | Their programs are soft-deleted; the plan is gone from both phones; the new coach sees "No program yet" | |
| TEAM-60 | Hand back | Hand CX from TB back to TA; sync both | TA has the plan again — **nothing stays deleted**. The tombstone test is `trainer_id <> me`, so a return simply stops matching | |
| TEAM-61 | Same pull twice | `GET /v1/sync/pull?lastPulledAt=0` twice as TA | Identical `deleted` arrays. Deleting an absent record is a no-op | |
| TEAM-62 | No-op handover | Hand CX to the coach who already has them | `200` with `noop: true`, and **no audit row**. A log of moves that did not happen is a log nobody can read | |
| TEAM-63 | Audit row | Team clients → CX → Recent changes / Handovers | Who, to whom, by whom, what happened to the plan, and the note. Both coaches see it | |
| TEAM-64 | A coach cannot reassign | `POST …/reassign` as a plain coach | `403 NOT_TEAM_ADMIN` | |
| TEAM-65 | Target must be in the team | Reassign to T2 (in no team) | `404 MEMBER_NOT_IN_TEAM` | |
| TEAM-66 | Reassign then remove the coach | Hand CX to TB, then remove TB from the team | CX stays TB's — removal never moves ownership. This is the sequence a gym owner will get wrong; confirm the copy warned them | |

### 16A.5 The shared library

| ID | Case | Expected | P/F |
|---|---|---|---|
| TEAM-67 | Team custom exercises ride sync | TA creates a custom exercise; sync T1 | It appears in T1's own exercise picker, tagged as the team's, **and works offline** | |
| TEAM-68 | …because a copied plan needs them | Copy a template that uses TA's custom exercise, assign it, open it on the floor with the radio **off** 📵 | Exercise names render. A blank line here is the bug this exception exists to prevent | |
| TEAM-69 | Only the team's | A custom exercise belonging to TX (another team) never appears | |
| TEAM-70 | Leaving takes them back | Leave the team, sync | TA's custom exercises are gone from the picker; T1's own remain. Those rows never changed — the caller's relationship to them did | |
| TEAM-71 | The shelf | Programs → Browse the team's programs, or Team → Team programs | Every coach's templates, **yours split into its own group**, each with days / exercises / how many clients are on it | |
| TEAM-72 | Copy | Tap a teammate's template | `201`; toast names the copy; it appears in your own Programs after the sync | |
| TEAM-73 | A copy is detached | After copying, have the original's owner rewrite theirs | Your copy is unchanged. **This is the bug every competitor shipped**; S1 if it moves | |
| TEAM-74 | Template outside the team | `POST /v1/team/templates/{TX_template}/copy` | `404 TEMPLATE_NOT_IN_TEAM` | |
| TEAM-75 | Editing a teammate's template | There is no way to. Copy-only is deliberate — a template two coaches use and one edits changes under the other's clients | |
| TEAM-76 | A template with no blueprint | A template with null `structure` on the shelf | Reads "0 days · 0 exercises", does not crash the row | |

### 16A.6 Admin editing, and the record that makes it safe (V27)

> The case this exists for: the coach is off sick, their client is on the floor, and
> the plan says 5×5 squat for a shoulder that is not having it.

| ID | Case | Expected | P/F |
|---|---|---|---|
| TEAM-77 | Open a teammate's plan | Team clients → their client → tap a plan | Grouped by week and day; the app bar and a callout both name whose plan it is | |
| TEAM-78 | Change a prescription | Tap an exercise → 4 × 6 → save | Saved; **the sheet opened seeded with 5 × 5**, not with 3 × 10 defaults. Overwriting a considered prescription with a default is the bug | |
| TEAM-79 | A timed hold survives | Edit a plank: Hold → 45s | Stored in `duration_seconds`, not `reps`. ⚠ The older `/v1/programs/**` endpoints drop this field; the team path must not | |
| TEAM-80 | Add an exercise | Day header → Add → pick → prescribe | Added to that day. The picker searches the **local** library, so the choice works offline even though the write does not | |
| TEAM-81 | Remove an exercise | Long-press → Take it out | Soft-deleted; the dialog says logged sets stay in the client's history | |
| TEAM-82 | A swap is two rows | Remove one exercise, add another | Two activity rows — "Removed …", "Added …" — not one that hides half of what happened | |
| TEAM-83 | Every crossing is recorded | After TEAM-78, sign in as the **owning coach** → Team → Recent changes | The change, the admin's name, the time, and a sentence naming the client and the day | |
| TEAM-84 | …and pushed | The owning coach's device | A push arrived at the time of the edit | |
| TEAM-85 | Editing your **own** client records nothing | Edit one of your own clients' plans through the same path | No activity row. `CHECK (actor <> subject)` refuses one; there is nobody to account to | |
| TEAM-86 | The coach can read the log | As a plain coach, `GET /v1/team/activity` | Their own crossings. **Not `403`** — a log only its authors could read is an account of nothing | |
| TEAM-87 | Scope inverts by role | Same call as an admin | The whole team's crossings. The difference comes from `TeamScope`, not from a query parameter | |
| TEAM-88 | The sentence is frozen | After TEAM-78, change the same exercise again to 2 × 20, then re-read the first row | The first row still says 4 × 6. Stored prose, not re-derived — otherwise every account of a change moves | |
| TEAM-89 | Append-only | No delete in the UI; `DELETE /v1/team/activity/...` does not exist. The screen says nothing can be removed | |
| TEAM-90 | The edit reaches the owning coach | Sync the owning coach after TEAM-78 | The new prescription is on their phone. Nothing had to be written for this: `trainer_id` never moved | |
| TEAM-91 | …and not the admin's | Sync the admin | The teammate's program is **not** in their local database. Editing is not a claim | |
| TEAM-92 | A coach cannot edit | `PATCH /v1/team/programs/{id}` as a plain coach | `403 NOT_TEAM_ADMIN` | |
| TEAM-93 | Plans outside the team | Same call with TX's program id | `404 PROGRAM_NOT_IN_TEAM` | |
| TEAM-94 | No create, no delete | There is no way to give a teammate's client a new plan or remove their plan | Deliberate — those are handover-shaped, and the handover is audited | |
| TEAM-95 | Fix a shared exercise | Rename TA's "Barbell Squt" to "Barbell Squat" as an admin | Fixed for everyone; every program pointing at it now reads correctly; TA gets a row and a push | |
| TEAM-96 | The seeded library is untouchable | `PATCH /v1/team/exercises/{seeded_id}` | `404 EXERCISE_NOT_IN_TEAM`. 1,324 rows belonging to nobody must stay identical for every trainer in the product | |

### 16A.7 The owner's earnings

> **Read §0.4 of the PRD before running this.** This endpoint is the one place money
> crosses between coaches, and it narrowed a promise the invitation screen used to
> make. TEAM-104 checks that the copy was narrowed with it.

| ID | Case | Expected | P/F |
|---|---|---|---|
| TEAM-97 | Owner only | Team → Team earnings is drawn for the owner only. `GET /v1/team/revenue` as an admin → `403 NOT_TEAM_OWNER`; as a coach → same | |
| TEAM-98 | Totals per coach | Record payments for two coaches | Each row: collected, payment count, paying-client count. Team total = the sum | |
| TEAM-99 | 🔒 No client is ever named | Grep the whole response | No client name and **no client id**. "Who paid what" must not be derivable, or this is the money book by another route | |
| TEAM-100 | `paid_at`, not `created_at` | Record today a payment taken 40 days ago | Falls in the 60-day range, not in this month's. Cash arrives in basements; the date it happened is the date that counts | |
| TEAM-101 | Pending money is not revenue | Leave a payment `pending` | Excluded from every range | |
| TEAM-102 | A coach who took nothing | A coach with no payments in the range | Appears as **₹0**, not absent. A missing row reads as "no data" and sends an owner hunting for a bug | |
| TEAM-103 | The gym's cut | With a gym share recorded | Shown as a slice **of** what was collected, with the split legend. With no gym, the right-hand figure is the coach count and the bar is hidden — a ₹0 "gym's cut" would claim an arrangement that does not exist | |
| TEAM-104 | The promise matches the code | Read the money line on the invitation screen (6d) and on 6a | Both say **totals only, and that the owner sees them**. Neither claims nobody can see anything. ⚠ **If either still says "not the admins, not the owner", the copy regressed and the product is lying** — S1 for trust, not for data | |
| TEAM-105 | Backwards range | `?from=2026-08-20&to=2026-08-01` | `422 TEAM_RANGE_INVALID`, not an empty month | |
| TEAM-106 | Ranges | This month / Last month / This year | Boundaries inclusive; the subtitle names the dates being shown | |

### 16A.8 📵 Offline behaviour

> Team coaching is the only part of XRep that **writes online**. Every write here is
> a permission change, and one authored offline is one replayed at an unknown later
> time — possibly after the grant was revoked. So these cases check that the app is
> honest about it rather than queueing.

| ID | Case | Expected | P/F |
|---|---|---|---|
| TEAM-107 | The team still draws 📵 | Radio off, open Team | Name, your role, seats and the whole coach list are there. `team`/`team_member` are synced for exactly this | |
| TEAM-108 | Writes are refused, once | Radio off | One banner ("changes need a connection"), and the write buttons disabled. **Not** one toast per attempt | |
| TEAM-109 | Nothing is queued | Radio off, try to invite / promote / remove | Nothing appears in the sync queue and nothing lands when the radio comes back | |
| TEAM-110 | Push refuses team tables | Craft a push with a `team_members` row: `POST /v1/sync/push` | `200` with a rejection carrying `"code": "TEAM_READ_ONLY"`, and psql unchanged. **Refused out loud, not dropped** — a silent refusal leaves a record that looks synced and exists nowhere | |
| TEAM-111 | Team-wide reads are honest dead ends 📵 | Radio off, open Team clients / Team programs / Team earnings / Recent changes | Each says it needs a connection **and points at the offline thing that does work** ("your own clients are on the Clients tab") | |
| TEAM-112 | A failed refresh keeps the list | Load Team clients, drop the network, pull to refresh | The correct list from a minute ago stays on screen. Replacing it with an error page is the bug | |
| TEAM-113 | Invitations are online-only | Radio off, open the Home invitation card | Answering is disabled with a reason, and the invitation is still there afterwards | |
| TEAM-114 | Sign out clears team state | Sign out T1, sign in TA on the same phone | No trace of T1's team, invitations or badge. The invitation cache is REST-only, so `unsafeResetDatabase` does not reach it — it is cleared explicitly | |

---

## 17 · SET — settings, profile, sign-out, deletion

| ID | Case | Expected | P/F |
|---|---|---|---|
| SET-01 | Edit profile | Name, gym name persist and reach the client's "coach" row on next sync | |
| SET-02 | Add/change UPI VPA | `UpiSheet` validates; UPI affordances appear/disappear accordingly | |
| SET-03 | Remove UPI VPA | All UPI buttons revert to the disabled-no-VPA state | |
| SET-04 | Notification settings | Each toggle takes effect; denied OS permission is explained, not hidden | |
| SET-05 | Working hours | `WorkingHoursScreen` saves; diary warnings follow | |
| SET-06 | Delivery mode | `ModeSheet` per client/global behaves per spec | |
| SET-07 | Self-training | `SelfTrainingScreen` doesn't contaminate client data or revenue | |
| SET-08 | Help / FAQ | Renders offline | |
| SET-09 | Sign out | Confirms; wipes token + local data; lands on phone entry | |
| SET-10 | Sign out with queued changes | See SYNC-23 | |
| SET-11 | ⚠ Account/data deletion | DPDP requires deletion be honoured. Find the path; if there is none, that is a compliance gap to log | |
| SET-12 | Reinstall after sign-out | No residual data (check app storage) | |

---

## 18 · XCUT — cross-cutting UI states

Run this sweep on **every** screen in the inventory; log one bug per offender.

| ID | Case | Expected | P/F |
|---|---|---|---|
| XCUT-01 | First-run empty | Says what the screen is for + one action. Never a bare "no data" | |
| XCUT-02 | Emptied (filters/deletion) | Different from first-run; offers the way back | |
| XCUT-03 | Loading | Local reads are near-instant; no flashing spinner | |
| XCUT-04 | Saving | Double-submit disabled | |
| XCUT-05 | Validation errors inline | ⚠ Today many are native system alerts ("Could not add set.") — every one found is a bug against the state matrix | |
| XCUT-06 | Destructive confirms | Name the consequence, not "are you sure" | |
| XCUT-07 | Capability missing | No button that cannot work (no VPA, no phone, no UPI app) | |
| XCUT-08 | Long content / ~40% text growth | Simulate Tamil-length strings; no meaning lost to truncation | |
| XCUT-09 | Largest OS font size | No clipped buttons or unreachable actions | |
| XCUT-10 | Smallest supported screen (360dp) | Nothing horizontally scrolls that shouldn't | |
| XCUT-11 | Dark mode / system theme | Consistent, legible (if supported; if not, confirm it's forced light) | |
| XCUT-12 | Screen reader labels | Every icon-only button has a label; status chips announce their meaning | |
| XCUT-13 | Colour-blind safety | Status never carried by colour alone (known defect to verify fixed) | |
| XCUT-14 | Reduce motion | `useReduceMotion` honoured | |
| XCUT-15 | Keyboard overlap | `useKeyboardVisible` keeps the focused field and primary action visible | |
| XCUT-16 | Back button / gesture | Never exits the app from a mid-flow screen without warning | |
| XCUT-17 | Deep-link into a screen while signed out | Lands on sign-in, then resumes — never a blank screen | |
| XCUT-18 | Rapid navigation | Tap through 20 screens fast → no crash, no duplicate stacks | |
| XCUT-19 | Low memory / OS kills app | Restores to a sane screen with data intact | |
| XCUT-20 | Interruptions | Incoming call, alarm, split screen mid-log → set data survives | |
| XCUT-21 | Cold start time | Under a few seconds on mid-range Android (NFR-3) | |
| XCUT-22 | Battery/CPU during a session | No runaway sync loop while offline | |

---

## 19 · Device & platform matrix

Run the **smoke suite (§24)** on each row; run the full plan on the primary device.

| Device class | OS | Screen | Notes |
|---|---|---|---|
| Primary mid-range Android | 13/14 | 360–412dp | The target device; full plan |
| Low-end Android | 10/11 | 360dp, 2–3GB RAM | Perf, cold start, memory kills |
| Large Android | 14 | 480dp+ | Layout stretch |
| Tablet (if installable) | — | — | Confirm it degrades or is blocked, not broken |
| Emulator | 14 | — | `10.0.2.2` base URL path |
| iOS (later) | — | — | Out of MVP scope; note anything already broken |

Network conditions to cover on the primary device: full wifi · 4G · **throttled 2G** · airplane mode · wifi-with-no-internet (captive portal) · flapping connection (toggle every 5s during a sync).

---

## 20 · Data integrity spot-checks (run in psql)

After a full functional pass, verify the database agrees with the screens.

```sql
-- 1. No orphaned tenancy: every client belongs to a live trainer
SELECT count(*) FROM client c LEFT JOIN trainer t ON t.id=c.trainer_id WHERE t.id IS NULL;           -- expect 0

-- 2. Pack decrements match sessions marked done
SELECT p.id, p.sessions_total, p.sessions_remaining,
       (SELECT count(*) FROM scheduled_session s
         WHERE s.client_id=p.client_id AND s.status='done' AND s.deleted_at IS NULL) AS done
FROM package p WHERE p.deleted_at IS NULL;

-- 3. No negative remaining that the UI reports as "0 left"
SELECT * FROM package WHERE sessions_remaining < 0;

-- 4. No duplicate payments for one confirmation (double-marking)
SELECT client_id, amount, paid_at, count(*) FROM payment
GROUP BY 1,2,3 HAVING count(*) > 1;

-- 5. Revenue on the Deck == paid payments this month  (status: 'pending' | 'paid' | 'overdue')
SELECT sum(amount) FROM payment
WHERE status='paid' AND deleted_at IS NULL AND paid_at >= date_trunc('month', now());

-- 6. No orphaned set logs (a parent session must exist)
SELECT count(*) FROM set_log sl LEFT JOIN workout_session ws ON ws.id=sl.workout_session_id
WHERE ws.id IS NULL;                                                                                 -- expect 0

-- 7. Template/program isolation. The blueprint lives in template.structure (JSONB); the
--    client's copy is program_exercise rows. Snapshot the template before a program tweak
--    and re-run after — the text must be byte-identical.
SELECT id, md5(structure::text) FROM template WHERE deleted_at IS NULL ORDER BY id;
SELECT p.id, p.template_id, count(pe.id) AS own_rows FROM program p
LEFT JOIN program_exercise pe ON pe.program_id=p.id AND pe.deleted_at IS NULL
WHERE p.deleted_at IS NULL GROUP BY 1,2;

-- 8. No future-dated writes poisoning the sync cursor
SELECT 'client' t, count(*) FROM client WHERE updated_at > now() + interval '1 minute'
UNION ALL SELECT 'set_log', count(*) FROM set_log WHERE updated_at > now() + interval '1 minute';    -- expect 0

-- 9. Soft deletes are soft
SELECT count(*) FROM client WHERE deleted_at IS NOT NULL;   -- rows still present, not DELETEd

-- 10. No health data columns exist anywhere (DPDP)
SELECT table_name, column_name FROM information_schema.columns
WHERE column_name ~* 'injur|medic|condition|allerg|diagnos|disease';                                  -- expect 0 rows

-- ── V18 · identity and consent ────────────────────────────────────────────

-- 11. One phone, one role. The UNIQUE constraint enforces it, so a second row
--     is impossible — what this catches is the same NUMBER living in both
--     trainer and client, which is the state V18 exists to prevent.
SELECT c.phone FROM client c JOIN trainer t ON t.phone = c.phone
WHERE c.deleted_at IS NULL AND t.deleted_at IS NULL
  AND c.membership_status <> 'unavailable';                                                           -- expect 0 rows

-- 12. Every invitable client has an identity, and it says client
SELECT c.phone, u.role FROM client c LEFT JOIN app_user u ON u.phone = c.phone
WHERE c.phone IS NOT NULL AND c.deleted_at IS NULL
  AND c.membership_status <> 'unavailable'
  AND (u.phone IS NULL OR u.role <> 'client');                                                        -- expect 0 rows

-- 13. Consent states are only the six we ship
SELECT DISTINCT membership_status FROM client;
--   expect a subset of: invited · accepted · declined · paused · removed · unavailable

-- 14. Timestamps agree with the state they claim
SELECT id, membership_status, invited_at, accepted_at, declined_at, removed_at FROM client
WHERE (membership_status='accepted'    AND accepted_at IS NULL)
   OR (membership_status='declined'    AND declined_at IS NULL)
   OR (membership_status='removed'     AND removed_at  IS NULL)
   OR (membership_status='unavailable' AND invited_at IS NOT NULL);                                    -- expect 0 rows

-- 15. Nobody who predates V18 is sitting behind a consent wall
SELECT count(*) FROM client
WHERE created_at < (SELECT installed_on FROM flyway_schema_history WHERE version='18')
  AND membership_status <> 'accepted' AND deleted_at IS NULL;                                          -- expect 0

-- 17. The otp_request backlog, now that Redis carries the live path.
--     Rows here should only appear from a Redis-down failover or a lock mirror.
--     A large or growing count while Redis is healthy means the fallback is
--     being taken silently — check the logs for "falling back to Postgres".
SELECT count(*) FILTER (WHERE expires_at < NOW())  AS expired_backlog,
       count(*) FILTER (WHERE locked_until IS NOT NULL) AS lock_mirrors,
       count(*)                                     AS total
FROM otp_request;

-- 16. A removal never took the trainer's money with it (AUTH-71)
SELECT c.id, c.membership_status, count(p.id) AS payments FROM client c
LEFT JOIN payment p ON p.client_id = c.id AND p.deleted_at IS NULL
WHERE c.membership_status = 'removed' GROUP BY 1,2;
--   payments must be whatever it was BEFORE the client tapped OK — acknowledging
--   a removal is a client-side wipe and must not touch the server's books.
```

---


### 20.1 Team coaching (V26/V27)

```sql
-- 18. One team per trainer. The partial unique index should make this impossible;
--     a row here means the index is missing, not that the service is wrong.
SELECT trainer_id, count(*) FROM team_member
WHERE status='active' AND deleted_at IS NULL AND trainer_id IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;                                                       -- expect 0

-- 19. One owner per team, and team.owner_trainer_id agrees with the member row.
--     Two representations of one fact; they must never disagree.
SELECT t.id, t.owner_trainer_id, m.trainer_id AS member_owner
FROM team t LEFT JOIN team_member m
  ON m.team_id=t.id AND m.role='owner' AND m.status='active' AND m.deleted_at IS NULL
WHERE t.deleted_at IS NULL AND (m.trainer_id IS NULL OR m.trainer_id <> t.owner_trainer_id);  -- expect 0

-- 20. No table gained a team_id. The whole design rests on this.
SELECT table_name FROM information_schema.columns
WHERE column_name='team_id' AND table_schema='public';                                 -- expect ONLY team_member, client_assignment, team_activity

-- 21. Every membership identifies somebody — a trainer id, or the phone it was sent to.
SELECT count(*) FROM team_member WHERE trainer_id IS NULL AND invited_phone IS NULL;   -- expect 0

-- 22. Seats: no team is over its own limit.
SELECT t.id, t.seat_limit, count(m.id) AS active FROM team t
JOIN team_member m ON m.team_id=t.id AND m.status='active' AND m.deleted_at IS NULL
WHERE t.deleted_at IS NULL AND t.seat_limit IS NOT NULL
GROUP BY 1,2 HAVING count(m.id) > t.seat_limit;                                        -- expect 0

-- 23. Reassignment moved the plan and kept the history. For every handover, the
--     client is with the new coach while the logged work and the money are not.
SELECT ca.client_id, ca.from_trainer_id, ca.to_trainer_id,
       c.trainer_id                                                   AS client_now,
       (SELECT count(*) FROM workout_session w
         WHERE w.client_id=ca.client_id AND w.trainer_id=ca.to_trainer_id) AS history_that_moved,
       (SELECT count(*) FROM payment p
         WHERE p.client_id=ca.client_id AND p.trainer_id=ca.to_trainer_id) AS money_that_moved
FROM client_assignment ca JOIN client c ON c.id=ca.client_id;
-- client_now = to_trainer_id for the latest row; history_that_moved and
-- money_that_moved must be 0 unless the new coach logged/collected since. S1 otherwise.

-- 24. Nudge rules were never client-scoped, so a handover must not have created a
--     second rule of the same kind for anybody.
SELECT trainer_id, kind, count(*) FROM nudge_rule
WHERE deleted_at IS NULL GROUP BY 1,2 HAVING count(*) > 1;                             -- expect 0

-- 25. The activity log records crossings only, and nothing has been rewritten.
SELECT count(*) FROM team_activity WHERE actor_trainer_id = subject_trainer_id;        -- expect 0
SELECT count(*) FROM information_schema.columns
WHERE table_name='team_activity' AND column_name IN ('updated_at','deleted_at');       -- expect 0

-- 26. The revenue roll-up agrees with the payments it claims to sum, for one team.
SELECT p.trainer_id, sum(p.amount) FROM payment p
JOIN team_member m ON m.trainer_id=p.trainer_id AND m.status='active' AND m.deleted_at IS NULL
WHERE m.team_id = :team_id AND p.status='paid' AND p.deleted_at IS NULL
  AND p.paid_at >= date_trunc('month', now())
GROUP BY 1;                                          -- compare against 6l, per coach
```

---

## 21 · 🔒 Security testing

Run these against **your own local/staging instance only**. Nothing here needs a tool beyond `curl`,
`jwt.io`, adb, and (optionally) an intercepting proxy such as mitmproxy/Burp on a test device.

Notation: `$T1` = trainer T1's JWT, `$C1` = client C1's JWT, `$P` = a pending (7a) token, `$BASE` = `http://localhost:8080`.

Grab a token by verifying an OTP:

```bash
curl -s -X POST $BASE/v1/auth/otp/request -H 'Content-Type: application/json' -d '{"phone":"98xxxxxx01"}'
# read the code from the backend log, then:
curl -s -X POST $BASE/v1/auth/otp/verify -H 'Content-Type: application/json' \
  -d '{"phone":"98xxxxxx01","otp":"481902"}' | tee /tmp/t1.json
```

### 21.1 Authentication & tokens

| ID | Case | How | Expected | P/F |
|---|---|---|---|---|
| SEC-AUTH-01 | No token | `curl -i $BASE/v1/clients` | `401`, no data, no stack trace | |
| SEC-AUTH-02 | Garbage token | `-H 'Authorization: Bearer abc.def.ghi'` | `401`; backend logs a parse warning and does **not** authenticate | |
| SEC-AUTH-03 | Signature stripped / `alg: none` | Re-encode a real token with `alg: none`, drop the signature | Rejected `401` (jjwt `parseSignedClaims` must refuse unsigned) | |
| SEC-AUTH-04 | Expired token | Mint one with `exp` in the past using the dev secret | `401`; **app signs out gracefully** (see AUTH-54) | |
| SEC-AUTH-05 | Tampered claims, original signature | Change `sub` to T2's id, keep the old signature | `401` — signature must fail | |
| SEC-AUTH-06 | Role escalation by claim edit | Re-sign a client token with `role: trainer` **using the dev secret** | Succeeds *if the secret is known* → proves the whole model rests on secret strength. **Verify production uses a strong `JWT_SECRET` env var, not `dev-only-secret-change-before-production-32chars`** (S1 if the default ships) | |
| SEC-AUTH-07 | Missing `role` claim = trainer | Mint a token with no `role` claim (dev secret) | Treated as **trainer** by design (pre-V14 compatibility). Confirm this is intentional and that legacy tokens all expire within 7 days of the V14 deploy | |
| SEC-AUTH-08 | Client token on trainer routes | `-H "Authorization: Bearer $C1"` on `/v1/clients`, `/v1/sync/pull`, `/v1/devices/token`, `/v1/packages/*` | `403` on every one — a client token must never reach a roster | |
| SEC-AUTH-09 | Trainer token on client routes | `$T1` on `/v1/client/sync/pull?clientId=…` | `403` | |
| SEC-AUTH-10 | Pending token anywhere but 7a | `$P` on `/v1/clients`, `/v1/sync/pull`, `/v1/client/sync/pull` | `403` everywhere; only `/v1/auth/trainer` works | |
| SEC-AUTH-11 | Pending token claims trainer twice | `POST /v1/auth/trainer` twice with `$P` | One trainer row, same account both times (idempotent) | |
| SEC-AUTH-12 | Phone in body ignored | `POST /v1/auth/trainer -d '{"phone":"98xxxxxx99"}'` | Body ignored; the account is created for the **token's** number only | |
| SEC-AUTH-13 | Trainer token on `/v1/auth/trainer` | `$T1` (subject is a UUID) | `400` "This sign-in already has a trainer account." — no second account | |
| SEC-AUTH-14 | Client token on `/v1/auth/trainer` | `$C1` (subject is a phone) | Creates a trainer account for **their own** number. Confirm this is the intended "client becomes a trainer" path; it must not be usable for any other number | |
| SEC-AUTH-15 | Token reuse after sign-out | Capture `$T1`, sign out in the app, replay `$T1` | ⚠ There is no server-side revocation — the token stays valid up to 7 days. Record it; mitigations are shortening expiry or a denylist | |
| SEC-AUTH-16 | Token in logs | Grep the backend log for JWTs and `sub` values | `DEBUG` logging prints subjects (`log.debug("JWT auth set for subject: …")`). Production must not run `com.xrep: DEBUG` | |
| SEC-AUTH-17 | Bearer prefix case | `authorization: bearer <token>` (lowercase) | Header name is case-insensitive; scheme match is `startsWith("Bearer ")` → lowercase `bearer` is **ignored** (unauthenticated). Confirm the app always sends the exact prefix | |
| SEC-AUTH-18 | Two Authorization headers | Send both a valid and an invalid one | Deterministic, safe outcome (no privilege from header confusion) | |
| SEC-AUTH-19 | Very long token | 1MB `Bearer` value | Rejected without OOM | |
| SEC-AUTH-20 | Concurrent sessions | Same trainer on two devices | Both work; no session fixation, no cross-device data bleed | |

### 21.1b 🔒 Redis-backed OTP state and rate limiting

The one-time code, its attempt counter, the lock and the send history moved to
Redis; the API rate-limit buckets moved with them. Everything here has a
Postgres/in-process fallback, so the cases split in two: does the fast path do
what it claims, and does the slow path take over without dropping a limit.

| ID | Case | How | Expected | P/F |
|---|---|---|---|---|
| SEC-RDS-01 | The code is never stored in the clear | `redis-cli hgetall otp:code:<phone>` after a request | A bcrypt hash (`$2a$10$…`), an `expiresAt`, an `attempts`. **S1** if the six digits are readable — anyone with Redis access would own every account | |
| SEC-RDS-02 | TTL is set and matches config | `redis-cli ttl otp:code:<phone>` | ≈600s (`app.otp.expiry-minutes`). A key with `-1` never expires and is the growth bug moving house | |
| SEC-RDS-03 | AOF is on | `redis-cli config get appendonly` | `yes`. Without it a restart clears every live lock and the brute-force ceiling becomes "three per restart" — SEC-OTP-02, reintroduced | |
| SEC-RDS-04 | A lock survives a Redis restart | Lock a number → `docker restart xrep-redis` → verify again | Still `429 OTP_LOCKED`, TTL roughly intact. This is SEC-OTP-02 for the new store | |
| SEC-RDS-05 | A lock survives Redis being **wiped** | Lock a number → `redis-cli flushall` → verify | Still locked — the Postgres mirror is the backstop, and `lockedUntil` takes the LATER of the two stores | |
| SEC-RDS-06 | Redis down: sign-in still works | `docker stop xrep-redis` → request + verify a code | Both succeed, from `otp_request`. **S1 if sign-in fails** — a cache must never be the reason nobody can get in | |
| SEC-RDS-07 | Redis down: limits still hold | While stopped, request codes past the ladder and the ceiling | Still refused with `OTP_THROTTLED`. Falling **open** here would be free brute force and an unbounded SMS bill | |
| SEC-RDS-08 | Redis down: the app still BOOTS | Stop Redis → restart the backend → `/health` | `200`. The proxy manager connects lazily for exactly this reason; an eager connect turns "degrade" into "fail to boot" | |
| SEC-RDS-09 | Recovery is automatic | Start Redis again, wait ~30s, make a request | `rl:*` keys reappear; the log says "rate limiting is using Redis". An app that stayed on in-memory buckets until the next deploy is running a weaker limit for days | |
| SEC-RDS-10 | The attempt counter is atomic | Fire 10 parallel wrong-code verifies at a fresh code | Never more than `maxAttempts` accepted before the lock. This is SEC-OTP-06 — the race the old read-modify-write allowed | |
| SEC-RDS-11 | Rate-limit buckets are shared, not per process | Restart the backend mid-way through spending a tier's budget | The count **survives** the restart. Under the old in-memory limiter it reset to full, which was the documented gap | |
| SEC-RDS-12 | Keys are bounded | After a full run, `redis-cli --scan` and count | Every key has a TTL or an expiration strategy; nothing accumulates per caller forever. A rate limiter that eats memory becomes the outage | |
| SEC-RDS-13 | Redis is not publicly reachable | From outside the private network, `redis-cli -h <host> ping` | Refused. Redis has no auth by default and holds every live code hash and lock — **S1** if it answers | |

### 21.2 OTP & account takeover

| ID | Case | How | Expected | P/F |
|---|---|---|---|---|
| SEC-OTP-01 | Brute force the code | Loop `otp/verify` with wrong codes | Locked after **3** wrong attempts, `429` + `Retry-After: 600`. 10⁶ space is only safe because of this lock | |
| SEC-OTP-02 | Lock survives a restart | Trigger the lock (3 wrong codes) → restart the backend → verify again, and request a new code | Both still `429 OTP_LOCKED`, with `retryAfterSeconds` showing what is **left** of the ten minutes, not a fresh 600. The wait is `otp_request.locked_until` (V17), so a deploy no longer resets the brute-force ceiling and a second instance sees the same lock. Confirm in the DB: `select wrong_attempts, locked_until > now() from otp_request where phone='…'` → `3 | t` | |
| SEC-OTP-03 | ⚠ Attempt counter vs new code | Get locked → wait out the lock → request a **fresh** code → brute force again | Each fresh OTP row starts at 0 wrong attempts, so an attacker gets 3 tries per 10 minutes indefinitely. Quantify: is the total attempt budget over an hour acceptable? | |
| SEC-OTP-04 | Send rate: the ladder | `curl -X POST $BASE/v1/auth/otp/request -d '{"phone":"98xxxxxx01"}' -H 'Content-Type: application/json'` twice in a row | 1st `200`; 2nd `429` with `code: OTP_THROTTLED`, `retryAfterSeconds: 30`, and a `Retry-After: 30` header. Then 60s before the third and 120s before the fourth and later. **Nothing is written and no SMS is sent on a refusal** — `select count(*) from otp_request where phone=…` rises by 1, not 2 | |
| SEC-OTP-04a | Send rate: the day's ceiling | Insert ten backdated sends, then ask for one more:<br>`docker exec xrep-postgres psql -U xrep -d xrepdb -c "INSERT INTO otp_request (phone, otp_hash, expires_at, verified, created_at) SELECT '98xxxxxx09','x',now(),true, now() - interval '20 hours' + (i * interval '1 minute') FROM generate_series(1,10) i;"` | `429 OTP_THROTTLED` with `retryAfterSeconds` ≈ **14400** (four hours — until the oldest of the ten ages out of the rolling day), not the 120s rung. The ceiling is quoted ahead of the ladder because it is the longer wait | |
| SEC-OTP-04b | The limit survives a restart | Trigger the ladder, restart the backend, immediately request again | Still `429`. Counted from `otp_request` rows, not memory — the opposite of SEC-OTP-02's lock, and the reason to move that lock the same way | |
| SEC-OTP-04c | Honest copy for both waits | On the phone screen, request twice; separately, drive a number to its daily ceiling and request | 30s → *"That's a lot of codes. Try again in 30 seconds."* · ceiling → *"That's too many codes for this number today. Try again in about 4 hours."* Never *"Check your connection"*, and never a one-minute promise for an hours-long wait (`throttleMessage` in `app/src/api/auth.ts`) | |
| SEC-OTP-04d | Resend re-arms from the server | On the OTP screen, force the client cooldown out of step (kill and reopen the app, then Resend at once) | The 429's `retryAfterSeconds` re-arms the visible countdown, so the client's timer follows the server's rather than looping through refusals | |
| SEC-OTP-04e | ⚠ Per-IP limiting | Hammer `otp/request` with **many different** valid numbers from one host | Per-number limits do not bound the total: 1000 numbers is 1000 texts. Per-IP is **not implemented** — it needs `server.forward-headers-strategy` and a trusted-proxy config first, or a shared Railway egress IP would throttle every trainer at once. Record the cost exposure before SMS goes live | |
| SEC-OTP-05 | Concurrent verify race | Fire 10 parallel verifies with the correct code | Exactly one success; the counter and `verified` flag stay consistent | |
| SEC-OTP-06 | Concurrent wrong verifies | 10 parallel wrong codes | Counter reaches the cap; no way to exceed 3 by racing | |
| SEC-OTP-07 | Code reuse after success | Replay a verified code | Rejected (`410`), no second token | |
| SEC-OTP-08 | Expired code doesn't burn attempts | See AUTH-27 | Confirmed by design (`OtpExpiredException` returns before the counter) — but check an attacker can't use it to probe indefinitely | |
| SEC-OTP-09 | Phone validated on verify | `POST /v1/auth/otp/verify -d '{"phone":"not-a-phone","otp":"123456"}'` | `400` with `phone: must be a valid 10-digit Indian mobile number` — both endpoints share `AuthController.PHONE_PATTERN`, so the same bad number gets the same answer at both doors. **No OTP lookup, no attempt burned.** Repeat with `phone` = `' OR 1=1--`, `5741234567`, a 10KB string, `null`, an array, and a JSON number — all `400`, none reaching the database | |
| SEC-OTP-09a | Malformed code spends nothing | Request a code, then submit `abcdef`, `12345`, `1234567`, `12 34 56`, `١٢٣٤٥٦` → then submit the **correct** code | Each malformed one is a `400 otp: must be a 6-digit code` with no DB write; the correct code still works and `select wrong_attempts from otp_request …` is still **0**. Shape is checked before the code is, so typos never eat one of the three guesses | |
| SEC-OTP-10 | Cross-number verify | Request a code for A, submit it against B | Rejected — codes are scoped per phone | |
| SEC-OTP-11 | Account enumeration on request | Request a code for a known and an unknown number; compare status, body, timing | Identical `200` and empty body for both — no enumeration | |
| SEC-OTP-12 | Enumeration on verify | Compare responses for known-trainer / known-client / unknown numbers | The `role`, `isNewUser` and `clientOf` fields *do* reveal whether a number is known — but only **after** a correct OTP, i.e. only to the number's owner. Confirm nothing leaks pre-verification | |
| SEC-OTP-13 | ⚠ OTP in plaintext logs | Grep the backend log | `[DEV] OTP for …` prints the code. Verify `sms-enabled: true` in production removes it entirely (the log line is in the `else` branch) and that no log ships codes | |
| SEC-OTP-14 | OTP hash storage | `select otp_hash from otp_request limit 1;` | BCrypt hash, never the plaintext code | |
| SEC-OTP-15 | Old rows cleanup | Check `otp_request` growth after 100 requests | Rows accumulate — confirm there's a cleanup job or accept the growth; unbounded PII-linked rows are a retention issue | |
| SEC-OTP-16 | Timing side channel | Compare verify timing for wrong-vs-right code | BCrypt makes both slow; no usable oracle | |

### 21.3 Authorisation & tenancy (IDOR)

Every trainer endpoint derives `trainerId` from the token subject; every path/body id is attacker-controlled. Test each with **T1's token against T2's ids**.

| ID | Case | How | Expected | P/F |
|---|---|---|---|---|
| SEC-IDOR-01 | Another trainer's client | `GET $BASE/v1/clients/{C2_id}` with `$T1` | `403`/`404`, **no data** | |
| SEC-IDOR-02 | Update another trainer's client | `PUT /v1/clients/{C2_id}` with `$T1` | Refused; verify in psql that nothing changed | |
| SEC-IDOR-03 | Delete another trainer's client | `DELETE /v1/clients/{C2_id}` | Refused; `deleted_at` still null | |
| SEC-IDOR-04 | Foreign body metrics | `GET`/`POST /v1/clients/{C2_id}/body-metrics` | Refused both ways | |
| SEC-IDOR-05 | Foreign progress | `GET /v1/clients/{C2_id}/progress` | Refused | |
| SEC-IDOR-06 | Foreign report | `GET /v1/clients/{C2_id}/report`, `POST …/report/weekly` | Refused; no report written | |
| SEC-IDOR-07 | Foreign packages | `GET`/`POST /v1/clients/{C2_id}/packages` | Refused | |
| SEC-IDOR-08 | Foreign payments | `GET`/`POST /v1/packages/{T2_pkg}/payments` | Refused | |
| SEC-IDOR-09 | Confirm a foreign payment | `PATCH /v1/payments/{T2_payment}/confirm` | Refused — this is money; S1 if it works | |
| SEC-IDOR-10 | Nudge a foreign client | `POST /v1/clients/{C2_id}/nudge` | Refused — otherwise T1 can message T2's clients. ⚠ **Today this is a `500`**, not a `403`/`404`: the lookup throws `EmptyResultDataAccessException` on any id that isn't this trainer's. No data leaks and the body carries no stack trace, and an unknown id fails identically to a foreign one (so it is not an enumeration oracle) — but the status is wrong and every miss logs a stack trace | |
| SEC-IDOR-11 | Foreign ids in a sync push | `POST /v1/sync/push` with rows carrying `trainer_id` = T2 | Server must scope by the token, not the row; nothing lands on T2's tenancy | |
| SEC-IDOR-12 | Sync push creating a client for T2 | Craft a `clients` row with `trainer_id` = T2's uuid | Ignored/rescoped to T1 | |
| SEC-IDOR-13 | Sync push over another trainer's row | Send an existing T2 client id with new values | Untouched (upserts must be scoped) | |
| SEC-IDOR-14 | Sync pull scope | `GET /v1/sync/pull?lastPulledAt=0` as T1 | Contains **zero** rows belonging to T2 — diff the payload against psql | |
| SEC-IDOR-15 | Malformed uuid | `GET /v1/clients/not-a-uuid` | `400`, not a `500` with a stack trace | |
| SEC-IDOR-16 | Nil / random uuid | `GET /v1/clients/00000000-0000-0000-0000-000000000000` | Clean 403/404 | |
| SEC-IDOR-17 | Deleted client access | Soft-delete a client, then fetch it by id | Treated as gone | |
| SEC-IDOR-18 | Device token hijack | `POST /v1/devices/token` with another trainer's id in the body | Token binds to the **caller** only | |

### 21.3b 🔒 Team scope (V26/V27)

A team is the first thing in this product that lets one trainer read another's rows,
so it is the first place where "ownership is a query filter" has a second answer. Every
case here is about the boundary of that answer.

`TeamScope` is the only source of the trainer-id set. A query that assembles its own
list of teammates is the vulnerability, not the symptom — **SEC-TEAM-14** is how you
look for one.

Set up: T1 owns a team with TA (admin) and TB (coach). TX owns a **different** team.
T2 is in no team.

| ID | Case | How | Expected | P/F |
|---|---|---|---|---|
| SEC-TEAM-01 | A coach cannot read teammates' clients | `GET $BASE/v1/team/clients` with TB's token | `403 NOT_TEAM_ADMIN`. Being in a team is not being an admin | |
| SEC-TEAM-02 | Refusals never name the other team | Invite TX's number; read the message | "already part of a coaching team" and nothing more. Naming it hands any gym owner with a phone book a way to **enumerate a competitor's staff one number at a time** — the same rule `ClientPhoneGuard` follows | |
| SEC-TEAM-03 | Another team's client | `GET /v1/team/clients/{TX_client_id}` as T1 | `404 CLIENT_NOT_IN_TEAM`, no data | |
| SEC-TEAM-04 | Another team's member | `DELETE /v1/team/members/{TX_member_id}` as T1 | `404 MEMBER_NOT_IN_TEAM`; psql shows TX's team intact | |
| SEC-TEAM-05 | Another team's template | `POST /v1/team/templates/{TX_template}/copy` | `404 TEMPLATE_NOT_IN_TEAM`; nothing written | |
| SEC-TEAM-06 | Another team's plan | `PATCH /v1/team/programs/{TX_program}` | `404 PROGRAM_NOT_IN_TEAM`; psql unchanged | |
| SEC-TEAM-07 | Reassign **out** of the team | `POST /v1/team/clients/{CX}/reassign` with `toTrainerId` = T2 or TX | `404 MEMBER_NOT_IN_TEAM`. A client must not be able to leave the team through this door | |
| SEC-TEAM-08 | Reassign somebody else's client **in** | Reassign T2's client id to TB | `404 CLIENT_NOT_IN_TEAM`. S1 if it works — that is theft of a roster | |
| SEC-TEAM-09 | 🔒 **No money under `/v1/team/**`** | For every path in §16A, `curl` it and grep the body for `amount`, `package`, `payment`, `gym_share`, `settlement` and a known payment figure | Nothing, on every path except `/v1/team/revenue`. **S1** — this is the promise the whole money book rests on | |
| SEC-TEAM-10 | Revenue is owner-only | `GET /v1/team/revenue` with TA's (admin) token, then TB's | `403 NOT_TEAM_OWNER` both. An admin runs the roster; the numbers belong to whoever owns the business | |
| SEC-TEAM-11 | Revenue names no client | Grep the response for client names and ids | Neither. Totals, counts and a client **count** only — "who paid what" must not be derivable | |
| SEC-TEAM-12 | Revenue is scoped to the team | Give TX's coaches payments; read as T1 | TX's numbers absent. Diff the total against psql for T1's team only | |
| SEC-TEAM-13 | Team tables are pull-only | `POST /v1/sync/push` with a `team_members` row promoting yourself to `owner` | `200` with `"code": "TEAM_READ_ONLY"` per record, `role` unchanged in psql. **A permission change must never be authorable offline** | |
| SEC-TEAM-14 | The widening has one source | `grep -rn "IN (:visible\|visibleTrainerId" backend/src/main/java` | Every team-wide query takes its set from `TeamScope`. A hand-rolled teammate list is a finding even if it currently returns the right rows | |
| SEC-TEAM-15 | Removal is effective immediately | Remove TA; **without letting TA's app sync**, replay a `/v1/team/clients` request with TA's still-valid token | `403`/`404`. Authorisation is a live database read, not a token claim — which is also why team data is not cached offline | |
| SEC-TEAM-16 | A removed admin keeps no offline copy | TA's device after removal + one sync | No teammate clients on the device, because there never were any. **This is the whole argument for team data being online-only** | |
| SEC-TEAM-17 | The archived projection cannot be weaponised | After a handover, push CX back from the old coach's token with `status: 'active'`, a new name, and `trainer_id` = the old coach | Every field unchanged in psql. Both write paths end in `WHERE client.trainer_id = :tid` | |
| SEC-TEAM-18 | Feature switch closes the whole namespace | `TEAM_ENABLED=false`, then `curl` all 29 team paths | `404` on every one, and `TeamScope` widens nobody — verify a team admin's `/v1/clients` returns only their own | |
| SEC-TEAM-19 | The activity log cannot be edited or erased | Try `DELETE`/`PATCH` on `/v1/team/activity`; then `UPDATE team_activity` in psql and re-read | No such endpoints. The table has no `deleted_at` and no `updated_at` — an account of a change that can be rewritten is not an account | |
| SEC-TEAM-20 | An edit cannot be laundered as your own | `INSERT` a `team_activity` row where actor = subject via psql | Refused by `CHECK (actor_trainer_id <> subject_trainer_id)`. The table records crossings; a self-row would be a place to hide one | |
| SEC-TEAM-21 | The seeded library is immutable | `PATCH /v1/team/exercises/{seeded_id}` as an owner | `404 EXERCISE_NOT_IN_TEAM`. One trainer editing a row 1,324 of which every trainer in the product shares would be a cross-tenant write | |
| SEC-TEAM-22 | Team endpoints are gated to trainers | Replay any `/v1/team/**` path with a **client** token, then an `invited` token | `403` both. `/v1/team/**` falls through to `hasRole("TRAINER")` — confirm nothing was added above it in `SecurityConfig` | |
| SEC-TEAM-23 | Malformed and nil ids | `not-a-uuid` and the nil uuid on every `/v1/team/**` path taking one | `400` and a clean `404`; never a `500` with a stack trace | |

### 21.4 The client wall (FR-11 isolation)

`ClientSyncService.resolve()` checks the requested `clientId` against the phone in the token on **every** request.

| ID | Case | How | Expected | P/F |
|---|---|---|---|---|
| SEC-WALL-01 | Another client's id | `GET /v1/client/sync/pull?clientId={C2_id}` with `$C1` | `403 "Not your record."` — and identical for a **non-existent** id, so ids can't be probed | |
| SEC-WALL-02 | Own id, wrong token | C1's id with `$C2` | `403` | |
| SEC-WALL-03 | Pull payload contents | Full pull as `$C1`, inspect every table | Must contain **only**: own client row, cut-down coach row (name, gym, phone, upi_vpa), library + own trainer's custom exercises, own programs/templates/sessions/logs/metrics/packages/payments/reports. Must **not** contain: the roster, other clients' anything, the price list, working hours/time blocks, gym settlement, nudge rules, **nudge log** | |
| SEC-WALL-04 | Coach row minimisation | Inspect the `coaches` payload | Exactly the seven allowed columns; **no** trainer PII beyond name/gym/phone/upi_vpa; `upi_vpa` is never rendered on screen | |
| SEC-WALL-05 | Two memberships | `$CB` pulls with T1's clientId, then T2's | Each pull is scoped to that membership; neither leaks the other trainer's roster | |
| SEC-WALL-06 | Write a workout onto another client | Push a `workout_sessions` row with `client_id` = C2 | Ignored — ids come from the resolved scope; verify in psql the row landed on C1 (or not at all) | |
| SEC-WALL-07 | Write a set onto a foreign session | `set_logs` row whose `workout_session_id` belongs to C2 | Nothing inserted (the feeding SELECT returns no rows) | |
| SEC-WALL-08 | Write a body metric for another client | `body_metrics` row with `client_id` = C2 | Rescoped to C1; no foreign row | |
| SEC-WALL-09 | Client writes a payment | Push a `payments` table | **Refused** and logged: `REFUSED n record(s) for 'payments'`. Balance unchanged (S1 if a client can move the book) | |
| SEC-WALL-10 | Client writes clients/packages/programs/nudge_log | Push each | All refused + logged; nothing half-applied | |
| SEC-WALL-11 | Client cancels a session | Push `scheduled_sessions` with a deletion | Refused + logged "a client cannot cancel" | |
| SEC-WALL-12 | Client moves a session | Push `scheduled_sessions` with a new time | Only `client_confirmed_at` is ever written; the time is unchanged | |
| SEC-WALL-13 | Re-confirm a session | Push `client_confirmed_at` twice with different values | Only the first sticks (`AND client_confirmed_at IS NULL`) | |
| SEC-WALL-14 | Client deletes a body metric | Push a `body_metrics` deletion | No delete path exists — nothing is removed (append-only) | |
| SEC-WALL-15 | Soft-deleted client's token | Soft-delete C1, replay `$C1` | `403` on resolve; the still-valid token grants nothing | |
| SEC-WALL-16 | Deleted trainer's client | Soft-delete T1, C1 pulls | `403` (resolve joins on a live trainer) | |
| SEC-WALL-17 | Paused client's access | Pause C1, pull | Allowed by design — history and self-logging. Confirm the coaching layer isn't also served | |
| SEC-WALL-18 | Cursor abuse | `lastPulledAt=-1`, `0`, `9999999999999`, `abc` | No crash, no unscoped dump, `400` for garbage | |
| SEC-WALL-19 | 🔒 Invited token, both sync doors | Invited token (CI) → `/v1/sync/pull` and `/v1/client/sync/pull?clientId=<CI>` | **`403` both.** The consent step is worthless if the token that precedes it can read the data it is asking permission for — **S1** | |
| SEC-WALL-20 | Invited token elsewhere | Same token → `/v1/clients`, `/v1/trainer`, `/v1/sync/push` | `403` — it is good for accept, decline and ack-removal only | |
| SEC-WALL-21 | Answer somebody else's invite | Invited token for CI → `POST /v1/auth/membership/{CD_client_id}/accept` | `403 "Not your record."` — the client id in the path is untrusted until proved against the phone in the token. Identical answer for a **non-existent** id, so ids can't be probed | |
| SEC-WALL-22 | Client token on the membership routes | Accepted client's token → `/v1/auth/membership/{own}/accept` | `403` — gated to `ROLE_INVITED`, so a live client cannot re-run consent transitions | |
| SEC-WALL-23 | Trainer token accepts on a client's behalf | T1's token → `/v1/auth/membership/{CI}/accept` | `403`. A trainer manufacturing their own client's consent is **S1** — it is the one signature that must come from the other person | |
| SEC-WALL-24 | Ack a removal you weren't given | Invited token → `ack-removal` on a foreign client id | `403`; no `removed_ack_at` written anywhere | |
| SEC-WALL-25 | Forge a role claim | Re-sign a token with `role: client` (see SEC-AUTH-02 for the secret) | Rejected unless the signing key is known — and if it is, that is the finding, not this case | |
| SEC-WALL-26 | Push a membership_status | Trainer pushes `clients` with `membership_status: 'accepted'` | Ignored — the column is derived server-side and never read from the push. A trainer must not be able to self-accept on behalf of a client (**S1**) | |

### 21.5 Injection & input handling

| ID | Case | How | Expected | P/F |
|---|---|---|---|---|
| SEC-INJ-01 | SQLi in client name | Create a client named `Robert'); DROP TABLE client;--` | Stored as literal text; tables intact. Repeat for goal, notes, pack name, exercise name, set note, metric note | |
| SEC-INJ-02 | SQLi in search | Search `' OR '1'='1` in the roster and exercise picker | No extra rows (queries are parameterised via `NamedParameterJdbcTemplate` / WatermelonDB) | |
| SEC-INJ-03 | SQLi via sync push values | Push a row with `notes` = `'; UPDATE payment SET amount=0;--` | Literal text; no side effects | |
| SEC-INJ-04 | SQLi via `clientId` param | `clientId=1' OR '1'='1` | `400` (UUID binding), not a query | |
| SEC-INJ-05 | Type confusion in push | Send `reps` as `"abc"`, `load_kg` as an object, `set_number` as an array | Rejected or dropped for that row; the batch does **not** half-apply; no `500` cascade | |
| SEC-INJ-06 | Oversized payload | 10MB sync push | Rejected with a clear status, no OOM | |
| SEC-INJ-07 | Deeply nested JSON | 1000-level nesting | Rejected, no stack overflow | |
| SEC-INJ-08 | Null bytes / control chars | `name` = `A B`, `\r\n` injection into `notes` | Stored safely; no log-injection forging fake log lines | |
| SEC-INJ-09 | Unicode / RTL override | Name with U+202E, emoji ZWJ sequences | Renders without breaking the roster row or the report | |
| SEC-INJ-10 | Mass assignment | Push a client row including `deleted_at: null` on a deleted client, `id` change, `trainer_id`, `created_at` in 2099 | Server-controlled columns are not writable from the payload; a client cannot resurrect a deleted row | |
| SEC-INJ-11 | Unknown fields | Add `is_admin: true`, `role: "trainer"` to a client push | Ignored (tolerant reader), never persisted | |
| SEC-INJ-12 | Duplicate ids in one batch | Same `id` twice with different values | Deterministic result, no constraint error 500 | |
| SEC-INJ-13 | HTTP method confusion | `GET` a POST-only route and vice versa | `405`, no side effects | |
| SEC-INJ-14 | Content-Type mismatch | `text/plain` body on a JSON endpoint | `415`, clean error | |
| SEC-INJ-15 | Path traversal in ids | `/v1/clients/../../health` | No route confusion; `403`/`404` | |
| SEC-INJ-16 | XSS in the weekly report | Client name `<img src=x onerror=alert(1)>` → generate a report and open it as a link/PDF | Escaped in the rendered output — the report is the one artefact that renders **outside** the app | |

### 21.6 Configuration, transport & exposure

| ID | Case | How | Expected | P/F |
|---|---|---|---|---|
| SEC-CFG-01 | Default JWT secret | `echo $JWT_SECRET` in the deploy env | Overridden with a strong random value. Shipping the default is **S1** (anyone can mint a trainer token) | |
| SEC-CFG-02 | Secret length/entropy | Inspect | ≥256-bit random for HS256 | |
| SEC-CFG-03 | TLS in transit | Check the production base URL | `https` only; `EXPO_PUBLIC_API_URL` in the release build must not be `http` (default is `http://10.0.2.2:8080`) | |
| SEC-CFG-04 | Cleartext traffic on Android | Inspect the release manifest for `usesCleartextTraffic` | Disabled in release | |
| SEC-CFG-05 | MITM with a proxy CA | Route a test device through mitmproxy | Traffic visible only with a user-installed CA; consider whether pinning is wanted for money endpoints — record the decision | |
| SEC-CFG-06 | Health endpoint leakage | `curl $BASE/health` | Liveness only — no version, no DB details, no env | |
| SEC-CFG-07 | Actuator / debug endpoints | `curl $BASE/actuator/env`, `/actuator/health`, `/error`, `/v3/api-docs`, `/swagger-ui.html` | `401`/`403`/`404`; nothing that dumps config. (`anyRequest().hasRole("TRAINER")` should cover them — verify) | |
| SEC-CFG-08 | Stack traces in responses | Force a 500 (e.g. SEC-IDOR-15 variants) | No stack trace, no SQL, no class names in the body | |
| SEC-CFG-09 | Verbose logging in prod | Check `logging.level.com.xrep` | `DEBUG` in `application.yml` logs subjects and sync payload keys — production must be `INFO`/`WARN` | |
| SEC-CFG-10 | DB credentials | `application.yml` defaults `xrep/xrep_dev` | Overridden by env in every non-local deploy; DB not reachable from the internet | |
| SEC-CFG-11 | Postgres exposed | `nmap`/`psql` the deploy host on 5432 | Not publicly reachable | |
| SEC-CFG-12 | CORS | `curl -H 'Origin: https://evil.example' -i $BASE/v1/clients` | No permissive `Access-Control-Allow-Origin` (no browser client exists in v1) | |
| SEC-CFG-13 | CSRF | Confirm the API is bearer-only, no cookies | CSRF disabled is correct **only** because there are no cookie sessions — verify no endpoint sets a session cookie | |
| SEC-CFG-14 | Security headers | Inspect response headers | Sensible defaults; nothing that caches an authorised response (`Cache-Control: no-store` on money/PII responses) | |
| SEC-CFG-15 | Rate limit: the standard tier | 130 requests to `/v1/clients` with one trainer token | ~120 through, then `429` with `code: RATE_LIMITED`, `retryAfterSeconds` and a `Retry-After` header. Expect one or two extra: the bucket refills smoothly at 2/s while the loop runs | |
| SEC-CFG-15a | Keyed by identity, not by network | Exhaust trainer A's budget, then make one request as trainer B **from the same host** | B gets `200`, A still `429`. The bucket is the token's subject, so one trainer cannot spend another's budget — and a gym's shared wifi is not one caller | |
| SEC-CFG-15b | Tiers are separate budgets | Exhaust `/v1/sync/pull` (60), then `GET /v1/clients` with the same token | The sync refusal must not close the rest of the API: `200`. Repeat for messaging (10 nudges) → sync and standard unaffected | |
| SEC-CFG-15c | Unauthenticated floods are counted | 130 requests to `/v1/clients` with **no** token | ~121 × `401`, then `429`. Traffic that ends in 401 still costs a token — the limiter sits after the JWT filter but before authorisation, so a credential-less flood is bounded | |
| SEC-CFG-15d | Health is exempt | 200 requests to `/health` | All `200`. Limiting the liveness probe is how a healthy deployment gets killed | |
| SEC-CFG-15e | ⚠ Counters are per process | Exhaust a tier → restart the backend → request again | Allowed again. In-memory by design (a DB write per request is the worse trade), so the effective ceiling is the configured one **times the instance count**. A shared store is required before running more than one instance — record it as a scaling prerequisite, not a bug | |
| SEC-CFG-15f | Messaging tier protects spend | 13 × `POST /v1/clients/{id}/nudge` | Exactly 10 reach the service, then `429`. Same for `POST …/report/weekly` — each call spends a WhatsApp message | |
| SEC-CFG-16 | Flyway/migration exposure | Confirm no endpoint runs migrations or reveals schema | — | |
| SEC-CFG-17 | Exercise media host | Confirm no media host is configured | `EXERCISE_MEDIA_BASE_URL` no longer exists and nothing should reintroduce it. The app must make **no third-party media request** — in particular none to `raw.githubusercontent.com`, which is both an availability risk and a request leak | |
| SEC-CFG-17b | 🔒 No unlicensed media in the DB | `SELECT count(*) FROM exercise WHERE image_url IS NOT NULL OR video_url IS NOT NULL` on prod | Zero across the seeded library. The Gym visual artwork is **not** ours to redistribute; if a licence is later bought, this case flips to "licence on file" rather than "count is zero" | |
| SEC-CFG-18 | FCM credentials handling | Check how `FCM_CREDENTIALS` is supplied | Env-injected, never committed, never logged | |
| SEC-CFG-19 | Seeding disabled in prod | `SEED_EXERCISES` | Deliberate; re-seeding must not duplicate or overwrite custom exercises | |
| SEC-CFG-20 | Backup/restore | Verify DB backups exist and are encrypted at rest (NFR-8) | — | |

### 21.7 Device & mobile-app security

| ID | Case | How | Expected | P/F |
|---|---|---|---|---|
| SEC-DEV-01 | Token at rest | Confirm the JWT lives in `expo-secure-store` (Keystore), not AsyncStorage | Keystore-backed (`api/client.ts` uses SecureStore) | |
| SEC-DEV-02 | Local DB at rest | Pull the app's SQLite file on a rooted/debuggable device | Contains client PII in the clear. Decide and record: is device-level encryption relied on? Is `android:allowBackup` disabled in release? | |
| SEC-DEV-03 | ADB backup / debuggable release | `adb backup`, check `android:debuggable` in the release build | Backup disabled, not debuggable | |
| SEC-DEV-04 | UPI URI injection | Set the trainer name to `Ravi&am=1&pn=Evil` and the note to `x&am=99999`; open the pay sheet | `encodeURIComponent` neutralises them — the UPI app shows **one** amount, matching the screen. If the amount differs, S1 | |
| SEC-DEV-05 | WhatsApp URI injection | Client name with `&text=`/newlines in a nudge variable | Encoded; the composed message is exactly the preview | |
| SEC-DEV-06 | Malicious exercise video link | Save `javascript:alert(1)`, `file:///etc/passwd`, `intent://…` and tap it | Refused or opened externally as an inert unknown scheme — never executed in a WebView | |
| SEC-DEV-07 | Deep-link handling | Fire the app's deep links via `adb shell am start -a android.intent.action.VIEW -d '<link>'` with foreign ids | Unauthenticated deep links land on sign-in; foreign ids resolve to nothing, never another tenant's data | |
| SEC-DEV-08 | Exported components | `adb shell dumpsys package <pkg>` | No unnecessary exported activities/receivers/providers | |
| SEC-DEV-09 | Screenshot / app-switcher | Open Money and the OTP screen, background the app | Consider `FLAG_SECURE` on OTP and money screens; record the decision | |
| SEC-DEV-10 | Clipboard | Copy the VPA fallback (PAY-52) | Nothing sensitive beyond the VPA lands on the clipboard; no auto-copied token | |
| SEC-DEV-11 | Logcat leakage | `adb logcat | grep -iE 'jwt|token|otp|phone'` during a full session | No tokens, codes or bulk PII in device logs in a release build | |
| SEC-DEV-12 | Third-party network calls | Watch traffic during a session | Only your backend, FCM, and the exercise image host. No unexpected analytics | |
| SEC-DEV-13 | Sign-out wipes local data | Sign out, inspect app storage | Token deleted from SecureStore; local DB wiped (see SYNC-24) | |
| SEC-DEV-14 | Second user on the same device | Sign out T1 → sign in T2 | T2 sees nothing of T1's — S1 if any row survives | |
| SEC-DEV-15 | Lost-phone story | Note what an attacker with an unlocked phone gets | Full roster access until sign-out; no app-level PIN in MVP. Record as accepted risk or a gap | |
| SEC-DEV-16 | Screen-lock bypass | App reachable without any re-auth after 7 days | Consistent with the "returning user never sees sign-in" decision — confirm it is a conscious trade-off | |

### 21.8 Privacy & DPDP Act 2023 compliance

| ID | Case | Expected | P/F |
|---|---|---|---|
| SEC-PRIV-01 | Data minimisation | Only name, phone, goal, height, weight, activity, measurements. Nothing else is collected anywhere | |
| SEC-PRIV-02 | No health data | §20 query 10 returns zero rows; no UI field asks for injuries/conditions/medications (CLI-18) | |
| SEC-PRIV-03 | Consent for fitness metrics | Intake makes clear what's captured; consent is recorded or the copy states it | |
| SEC-PRIV-04 | Report link not enumerable | If the weekly report is a shareable URL, it must be unguessable (long random token), not `/report/{sequential-id}`; and it must expose only that client's data | |
| SEC-PRIV-05 | Client never sees the split | Q6 — sweep every client screen and the client sync payload (SEC-WALL-03) | |
| SEC-PRIV-06 | Trainer's UPI VPA | Reaches the client device for the deep link but is **never rendered** | |
| SEC-PRIV-07 | Deletion honoured | A deletion request results in real removal or documented anonymisation, not just `deleted_at` forever (NFR-8) | |
| SEC-PRIV-08 | Retention | `otp_request`, `nudge_log` and soft-deleted rows have a stated retention window | |
| SEC-PRIV-09 | Cross-client inference | No aggregate anywhere (counts, leaderboards, averages) from which another client's identity or numbers can be inferred | |
| SEC-PRIV-10 | Notification content | Lock-screen pushes don't expose amounts or health-adjacent detail unnecessarily (PUSH-16) | |
| SEC-PRIV-11 | Third-party sharing | WhatsApp BSP receives only the phone + template variables needed; nothing extra | |
| SEC-PRIV-12 | Nudge log contents | Contains other clients' names → trainer-only forever (SEC-WALL-03) | |

### 21.9 Business-logic abuse (the expensive bugs)

| ID | Case | How | Expected | P/F |
|---|---|---|---|---|
| SEC-BIZ-01 | Double-decrement a pack | Mark the same session done on two offline devices, then sync both | Net **one** decrement. Two is an S1 money bug | |
| SEC-BIZ-02 | Negative sessions remaining | Mark more sessions done than the pack holds | Blocked, or clamped and surfaced as `pack empty` — never a silent negative that reads as "0 left" | |
| SEC-BIZ-03 | Double payment | Client and trainer both mark the same payment paid, offline, then sync | One payment row, revenue counted once (PAY-29) | |
| SEC-BIZ-04 | Revenue inflation via overpayment | Record ₹99,99,999 against a ₹3,000 pack | Refused or clearly flagged; the Deck must not show a fantasy number | |
| SEC-BIZ-05 | Negative payment | Post a payment of `-5000` via the API | Rejected server-side, not just in the UI | |
| SEC-BIZ-06 | Split manipulation | Set `trainer_split_percent` to `150` / `-20` via the API | Rejected; the Deck's split must never exceed the total | |
| SEC-BIZ-07 | Write-off abuse | Write off, then record a payment against the same pack | The month's figures still reconcile (billed = collected + outstanding + written off) | |
| SEC-BIZ-08 | Retroactive revenue | Backdate payments into a closed month via the API | Allowed or refused deliberately; a "hisaab clear" month must not silently reopen | |
| SEC-BIZ-09 | Clock-forward LWW poisoning | Set the device clock a year ahead → edit a client → sync → set it back → edit on another device | The future `updated_at` wins forever, so later honest edits appear to be ignored. Record the actual behaviour and whether the server clamps `updated_at` to server time | |
| SEC-BIZ-10 | Sync replay | Capture a valid `/v1/sync/push` body and replay it 10× | Idempotent (client UUIDs + upsert); no duplicated payments, packs or set logs | |
| SEC-BIZ-11 | Replay another tenant's captured push | Replay T2's captured body with `$T1` | Rescoped to T1 or refused; never applied to T2 | |
| SEC-BIZ-12 | Nudge cost abuse | Send the same nudge 100× via the API | Rate-limited or at least visible in the nudge log — each message costs money | |
| SEC-BIZ-13 | Report job abuse | `POST /v1/clients/{id}/report/weekly` 100× | Idempotent per week; no 100 WhatsApp sends | |
| SEC-BIZ-14 | Free-tier scraping | With `$T1`, pull with `lastPulledAt=0` repeatedly | Works but should be bounded; note the cost | |
| SEC-BIZ-15 | Pack transfer | Move a pack/payment to another client via the API | Refused or fully audited — the ledger is append-only | |
| SEC-BIZ-16 | Deleted-client money | Soft-delete a client with an outstanding balance | Documented behaviour; the Deck's owed total and the client's ledger agree afterwards | |

---

## 22 · Non-functional checks

### 22.1 The state matrix sweep

For **every** screen in the inventory, record a verdict per state: first-run/empty · emptied · loading ·
populated · offline · queued · syncing · sync-failed · saving · validation error · destructive confirm ·
permission denied · capability missing · stale · long content. A screen is not "done" until all fifteen
have a defined, designed answer. Track this as a grid in the test sheet, one row per screen.

### 22.2 Performance

| ID | Case | Target | P/F |
|---|---|---|---|
| PERF-01 | Cold start, 30 clients, 6 months of logs | A few seconds on mid-range Android (NFR-3) | |
| PERF-02 | Set confirm latency | Imperceptible; optimistic local write | |
| PERF-03 | Roster scroll, 100 clients | 60fps-ish, no blank rows | |
| PERF-04 | Exercise picker, 1,324 rows + search | No dropped keystrokes; thumbnails decode off the JS thread | |
| PERF-05 | Full sync of a week of offline logs | Completes without timeout; UI stays usable | |
| PERF-06 | Progress charts with 500 sets | Renders under a second | |
| PERF-07 | Battery over a 60-min offline session | No abnormal drain / retry storm | |
| PERF-08 | Memory | No growth that gets the app killed mid-session | |

### 22.3 Reliability

| ID | Case | Expected | P/F |
|---|---|---|---|
| REL-01 | Force-close at 20 random points | No data loss anywhere (NFR-11) | |
| REL-02 | Kill during sync push | Queue intact, no duplicates | |
| REL-03 | Storage full | Graceful failure with a message, not a corrupt DB | |
| REL-04 | App upgrade over existing data | Migrations run once; data intact (SYNC-22) | |
| REL-05 | Downgrade / reinstall old build | Doesn't corrupt a newer local DB (or refuses cleanly) | |
| REL-06 | Backend redeploy mid-session | App recovers on next sync | |
| REL-07 | DB restart mid-request | Clean error, retry succeeds | |

### 22.4 Localisation readiness (NFR-10)

| ID | Case | Expected | P/F |
|---|---|---|---|
| L10N-01 | No hard-coded user-facing strings | Spot-check screens against the string source | |
| L10N-02 | ~40% text growth | Substitute long strings; no layout break, no meaning-losing truncation | |
| L10N-03 | Tamil input in every text field | Stores, syncs, renders, and survives the weekly report and WhatsApp templates | |
| L10N-04 | Currency and dates | ₹ and IST dates everywhere; no locale-dependent parsing bug | |
| L10N-05 | Numerals | Device set to Tamil locale → numbers still parse (no Devanagari/Tamil digit crash) | |

---

## 23 · Priority order for a single-pass manual run

If you only have a day, run in this order — highest consequence first:

1. **AUTH 1.1–1.3** (nothing else is reachable without it)
2. **LOG** (the highest-frequency screen; data loss here is fatal)
3. **SYNC** + all 📵 cases (the product's core promise)
4. **PAY** (money is the second-worst thing to get wrong)
5. **SEC-AUTH, SEC-IDOR, SEC-WALL** (cross-tenant leaks are unrecoverable reputationally)
6. **CLI + DIA + PRG** (the daily loop)
7. **CLNT + ROLE** (the second half of the product)
8. **TEAM §16A.4 + SEC-TEAM-09/13/17** — only if the trainer under test is in a team.
   Reassignment is the one place in the product where a bug is invisible on the
   screen that caused it, and SEC-TEAM-09 is the money promise
9. **PRO, NDG, RPT, PUSH**
10. **The rest of TEAM §16A**
11. **XCUT / state matrix sweep**
12. **SEC-CFG / SEC-DEV / SEC-PRIV** before any real-user pilot

---

## 24 · 30-minute smoke suite (run on every build)

| # | Step | Pass condition |
|---|---|---|
| 1 | Sign in with OTP as T1 | Deck loads |
| 2 | Wrong OTP once | "2 attempts left" inline |
| 3 | Add a client with the radio **off** | Appears in the roster instantly |
| 4 | Turn the radio on | Queue drains; row appears in Postgres |
| 5 | Build a 1-day template, assign it | Program created, template unchanged |
| 6 | Book a session today | Appears on the Deck |
| 7 | Log 3 sets offline, force-close, reopen | All 3 sets present |
| 8 | Mark the session done | Pack decrements by exactly 1 |
| 9 | Record a payment | Ledger + Deck revenue update |
| 10 | Open the pay sheet with no VPA | No broken UPI button |
| 11 | Sign in as the new client on a second device | Accept/decline screen — **not** the app |
| 12 | `curl` that invited token against both sync doors | `403` both (SEC-WALL-19) |
| 13 | Accept | Client lens opens; sees the plan, the session, the amount owed |
| 14 | `curl` the client's token against `/v1/clients` | `403` |
| 15 | `curl` T1's token against T2's client id | `403` |
| 16 | Put T1's own number on T2's roster, sync | Row survives, tagged **Can't invite**; T1 still signs in as a trainer |
| 17 | Archive the client, sign in as them | Removal notice names T1 and the date; OK wipes locally, server row stays |
| 18 | Sign out T1, sign in T2 | Zero trace of T1's data |
| 19 | T1 creates a team and invites TA | WhatsApp opens; the invite shows as waiting even if you cancel the share sheet |
| 20 | TA accepts on a second device | TA's own clients and money are untouched (TEAM-21) |
| 21 | `curl` T1's token at `/v1/team/clients` and grep for `payment` | Nothing (SEC-TEAM-09) |
| 22 | Hand a client from TA to T1, sync both | T1 gains the plan; TA loses the plan but still sees the client's name on their old payment (TEAM-57) |
| 23 | Radio **off**, open Team, try to invite | Team list still draws; the invite button is disabled with a reason, and nothing queues (TEAM-107/109) |

---

## 25 · Bug report template

```
ID:            XREP-###
Title:         <what breaks, in one line>
Severity:      S1 / S2 / S3 / S4        Type: functional / security / privacy / perf / copy
Test case:     <e.g. SEC-WALL-09>
Build:         app <version/commit> · backend <commit> · device <model / Android version>
Role:          trainer / client / pending      Network: online / offline / 2G / flapping
Preconditions: <accounts, seed state>
Steps:         1. … 2. … 3. …
Expected:      <from this document, quote the case>
Actual:        <what happened>
Evidence:      screenshot / screen recording / backend log excerpt / psql output / curl transcript
Data impact:   none / local only / server rows affected (name them)
Requirement:   FR-x.y / NFR-z
Notes:         reproducibility (n/n attempts), workaround
```

For security findings add: **attacker model** (unauthenticated / another trainer / a client / device thief),
**what was obtained**, and whether it is exploitable without the JWT secret.

---

## 26 · Traceability

| Requirement | Test IDs |
|---|---|
| FR-1 clients & intake | CLI-01–88, SEC-PRIV-01/02 |
| FR-2 scheduling | DIA-01–28, PUSH-07 |
| FR-3 plans & templates | PRG-01–22, EXR-01–13 |
| FR-4 workout logging | LOG-01–32, REL-01/02 |
| FR-5 progress & PRs | PRO-01–17 |
| FR-6 packages & payments | PAY-01–60, SEC-BIZ-01–08/15/16 |
| FR-7 dashboard | HOME-01–18 |
| FR-8 sync & push | SYNC-01–24, PUSH-01–16 |
| FR-9 WhatsApp nudges | NDG-01–17, SEC-BIZ-12 |
| FR-10 weekly report | RPT-01–14, SEC-INJ-16, SEC-PRIV-04 |
| FR-11 client role | CLNT-01–30, ROLE-01–11, SEC-WALL-01–26 |
| V18 one phone one role | AUTH-40/42/42a/43a/56, CLI-52–59a, ROLE-10/11, §20 q11–13 |
| V18 consent & removal | AUTH-60–75, CLNT-26–30, CLI-50/51/71–73, SEC-WALL-19–26, §20 q14–16 |
| V26 team coaching · membership | TEAM-01–36, SEC-TEAM-01/02/13/15/16/18/22, §20 q18–q22 |
| V26 team coaching · client reads | TEAM-37–46, SEC-TEAM-03/09, §20 q20 |
| V26 team coaching · reassignment | TEAM-47–66, SEC-TEAM-07/08/17, §20 q23/q24 |
| V26 team coaching · shared library | TEAM-67–76, SEC-TEAM-05/21 |
| V27 team coaching · admin editing | TEAM-77–96, SEC-TEAM-06/19/20, §20 q25 |
| V27 team coaching · owner's earnings | TEAM-97–106, SEC-TEAM-10/11/12, §20 q26 |
| NFR-2 offline-first | every 📵 case, SYNC-*, **except TEAM §16A.8 — which asserts the opposite on purpose** |
| NFR-3 performance | PERF-01–08 |
| NFR-4 sync integrity | SYNC-13/16/17/21, SEC-BIZ-09/10 |
| NFR-8 security & privacy | all of §21 |
| NFR-10 localisation | L10N-01–05, XCUT-08 |
| NFR-11 reliability | REL-01–07, LOG-19 |

---

## 27 · Known gaps to expect (do not re-file as new bugs without checking)

| Area | Observation | Where |
|---|---|---|
| ~~API rate-limit counters are per process~~ **CLOSED** | Now Bucket4j buckets in Redis, shared across instances. `RateLimiter` remains as the fallback when Redis is unreachable, where the old per-process limitation applies for the length of the outage only | `ratelimit/Bucket4jLimiter.java` · SEC-CFG-15e |
| Foreign/unknown client id on nudge → 500 | `EmptyResultDataAccessException` escapes as a 500 where 403/404 belongs. No leak, but the wrong contract and a stack trace per miss | `nudge/NudgeService.java` · SEC-IDOR-10 |
| ~~OTP attempt counting races~~ **CLOSED** | `HINCRBY` on the Redis path is atomic; the Postgres fallback now takes `@Lock(PESSIMISTIC_WRITE)` via `findLatestUnverifiedForUpdate`. Both paths fixed, not just the fast one | `auth/RedisOtpStore`, `JpaOtpStore` · SEC-OTP-06 |
| OTP send limit is per-number only | 30/60/120s ladder + 10/day. Still no per-IP limit — many numbers from one host is bounded only by the AUTH tier's own ceiling | `auth/OtpSendLimiter` · SEC-OTP-04e |
| `otp_request` is no longer cleaned up — and never was | V1 claimed "cleaned up by a scheduled job"; no such job was ever written, so the table has grown since the first sign-in. Redis TTLs the live path, but the fallback still writes rows and the historical backlog is still there. A one-off delete of expired rows is owed | `V1__init_schema.sql` · §20 q17 |
| Send history does not survive a Redis failover | The two stores do not share state, so a number mid-ladder when Redis drops reads as having no history and the ladder restarts — one extra code, once, per affected number. The LOCK does not have this problem: it is mirrored to Postgres and sign-in takes the later of the two | `auth/DelegatingOtpStore` · SEC-OTP-04f |
| Daily ceiling recovers smoothly, not on a cliff | Bucket4j refills greedily, so a number that burned 10 codes gets one back every ~2.4h rather than all ten after 24h. Same ceiling, gentler edge — but `retryAfterSeconds` differs from the old rolling-window arithmetic | `ratelimit/Bucket4jLimiter` · SEC-OTP-04g |
| OTP printed to logs in dev | Only while `sms-enabled: false` | `OtpService#send` · SEC-OTP-13 |
| No token revocation | Sign-out is client-side only; tokens live 7 days | `JwtService` · SEC-AUTH-15 |
| Tokens with no `role` claim = trainer | Deliberate pre-V14 compatibility | `JwtService#extractRole` · SEC-AUTH-07 |
| Pre-V18 clients default to `accepted` | Deliberate. Every row that existed when V18 ran is a live arrangement whose trainer has been billing against it; defaulting them to `invited` would wall people who have trained for months | `V18__unified_user_and_membership.sql` · AUTH-75 |
| Removal wipe is whole-database | `resetLocalDatabase()` is not per-membership, so a client of two trainers removed by one loses the local copy of both until the next sync repopulates. Server data is untouched, so it recovers — but the intermediate state is not designed | `RemovedScreen` · CLNT-30 |
| Un-invitable clients are silent to the client | The person whose number it is is never told a trainer tried to add them. Deliberate — they own a trainer account and it is not their problem — but worth confirming nobody expects a notification | `SyncService#pushClients` · CLI-52 |
| `gym_admin` is a reserved value only | No `gym` table, no UI, nothing mints one. Reaching it needs a hand-written psql UPDATE | `AppUser.ROLE_GYM_ADMIN` · AUTH-56 |
| Trainer→client lens switch is now dead code | `AppTabs` and `ClientDrawer` still call `switchLens` across roles; both degrade to absent because the lists they read are always empty. Harmless, but it is unreachable code | `store/AuthContext#switchLens` · ROLE-10/11 |
| Client devices can't register for push | `/v1/devices/**` is trainer-gated; only `trainer.fcm_token` exists | `push/DeviceController.java` · PUSH-05 |
| Clients cannot write payments | By design — "tell your trainer" | `ClientSyncService.ACCEPTED` · CLNT-16, SEC-WALL-09 |
| Dev defaults in config | `JWT_SECRET`, DB password, `http://10.0.2.2:8080`, `com.xrep: DEBUG` | `application.yml`, `api/client.ts` · SEC-CFG-01/03/09/10 |
| Errors are native system alerts | Being replaced in the design pass | interaction map §03 · XCUT-05 |
| Status carried by colour alone | Known defect | interaction map §05 · XCUT-13 |
| Batches switched off | `BATCHES_ENABLED` — frame 3d must not be reachable | DIA-28 |
| Team seats are not wired to billing | `seat_limit`, the accept-time check and the owner's editor all exist; nothing makes a seat cost anything, because there is no billing system. Not a team-coaching gap | `AppProperties.Team` · TEAM-16–19 |
| A teammate's template cannot be edited, only copied | Deliberate, and it is §3.1 of the PRD: a template two coaches use and one coach edits is a template that changed under the other's clients | `TeamLibraryService` · TEAM-75 |
| A handed-over client stays on the old coach's phone as `archived` | Deliberate. Their `payment` and `workout_session` rows for that person are still theirs and resolve a name through `client_id`, so tombstoning the client would leave the money book drawing payments with nobody's name on them. psql still says `active`; the projection is per-caller | `SyncService#fetchClients` · TEAM-57/58 |
| The owner sees per-coach monthly totals | Deliberate as of Phase 3, and the copy on 6a/6d was changed in the same commit to stop claiming otherwise. **If either screen still says "not the admins, not the owner", that is a regression in the copy, not a gap** | `TeamRevenueService` · TEAM-104 |
| Team-wide screens have no offline mode at all | Deliberate — an offline copy leaves with the phone when an admin is removed. They are honest dead ends that point at the offline thing that does work | §16A.8 |
| Drawer frames 6a–8c prose-only | Weekly report / share / delivery state / sync queue screens not drawn | interaction map — expect gaps, not bugs |

---

*XRep Manual Test Plan · v1.2 · 20 Aug 2026 · traced to Final Requirements & Delivery Plan v2.0 and the MVP Interaction Map v1.0.*
*v1.1 covers schema V18 — one phone one role, and consent as a first-class state.*
*v1.2 adds §16A, §20.1 and §21.3b for schema V26–V27 — team coaching, traced to Team Coaching PRD v1.4.*

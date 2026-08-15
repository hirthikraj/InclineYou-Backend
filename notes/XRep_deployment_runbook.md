# XRep — End-to-End Deployment Runbook (iOS + Android)

**Stack:** React Native (Expo + EAS) app · Java + Spring Boot backend on **Railway (managed)** · Redis (managed, AOF on) · PostgreSQL (managed) · object storage (R2/S3) · WhatsApp BSP · FCM · UPI deep link · phone OTP.
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

## 3. Object storage & media
- Create an R2 (or S3) bucket; set CORS; generate keys → into the Railway env.
- Upload the **seeded exercise images once**; serve via the bucket's public/CDN URL. (Progress photos and report PDFs land here later; R2 has no egress fees.)

---

## 4. Third-party services (production config)
- **FCM (push):** Firebase project → **service-account JSON** into the backend → `google-services` / `GoogleService-Info` config into the app (both platforms).
- **WhatsApp BSP:** account → API key into the backend → templates pre-approved (Part 1).
- **SMS / OTP:** MSG91 (needs DLT) or **WhatsApp OTP** (no DLT) → key into the backend.
- **UPI:** nothing to deploy — a `upi://` deep link; just capture each trainer's VPA at onboarding.

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
- **Secrets:** Railway's secret store; rotate keys; never in git.
- **Cost alerts:** set billing alerts on Railway, Apple, and your BSP.

---

## 10. First-launch checklist (dual-platform, org account)

1. [ ] **D-U-N-S number obtained** (unlocks both org accounts).
2. [ ] Google Play **organization** account + Apple Developer account set up.
3. [ ] Privacy policy published; **Play Data Safety** + **Apple App Privacy** completed.
4. [ ] WhatsApp templates approved; DLT done (or WhatsApp OTP chosen).
5. [ ] Backend on **Railway**; managed Postgres; HTTPS live; `/health` green; **backups + restore-tested**.
5b. [ ] **Redis provisioned with `appendonly yes` verified** — an OTP lock that a restart clears is not a lock.
6. [ ] Object storage bucket live; exercise images uploaded.
7. [ ] FCM, BSP, OTP wired with prod keys.
8. [ ] Prod smoke test passed (OTP → create client → sync → survives restart).
9. [ ] `eas build --platform all` → **.aab + .ipa**; app points at prod API.
10. [ ] Play listing **and** App Store Connect listing complete.
11. [ ] Internal testing on real **Android** devices; **iOS partners on TestFlight**.
12. [ ] iOS subscription billing routed **via website** (not in-app), guidelines checked.
13. [ ] Submit **both** to store review.
14. [ ] Sentry + uptime monitoring live.
15. [ ] Android staged rollout + iOS release → **live on both**.

---

*Critical path: the **D-U-N-S number and Apple org enrollment** (start today), then store review. With the organization account there's no 14-day Android test to wait on — the wiring and the approvals are what set your launch date, not the code.*

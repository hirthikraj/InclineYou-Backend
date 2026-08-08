# TrainDesk — Developer Getting-Started Playbook

**For:** the founding developer (Java + React background) building the MVP solo, with a designer (brother).
**Reads alongside:** the PRD, the Dev/Designer Handover, and the Phase 0 Interview Script.
**Stack (decided):** React Native (Expo + EAS) · Java + Spring Boot · PostgreSQL · SQLite (WatermelonDB) on-device · phone-OTP auth · UPI Intent deep link (MVP) · WhatsApp via a BSP · exercise data seeded from free-exercise-db.

> **The golden rule of this build:** ship the smallest thing that makes a trainer abandon their spreadsheet. Anything not in the 9 MVP features gets parked, not built.

---

## Part 1 — Before you write any code

Do these in the first 1–3 weeks. Some run in parallel with environment setup (Part 3).

### 1.1 Validate first (this gates everything)
- [ ] Run 12–15 Phase 0 trainer interviews (use the script). **Do not build features until the two assumptions hold:** (A) trainers will log on the floor if it beats a notebook, and (B) enough of them collect fees directly for UPI to matter.
- [ ] Recruit 3–5 of those trainers as design partners who'll test early builds.
- [ ] If assumption B fails for gym-employed trainers (their gym collects the money), note it and plan to lead with freelancers — but keep building; the core loop serves both.

### 1.2 Lock the open decisions (so they don't block you mid-build)
- [ ] **App structure:** one app with a trainer/client role toggle (faster to ship solo) **or** two separate app targets sharing a backend (cleaner store presence). Recommendation for a solo dev: **start as one app with a role toggle**, split later if store clarity demands it. Decide now — it shapes your repo.
- [ ] **Exercise data:** confirmed — seed from free-exercise-db into Postgres, mirror images to your own storage.
- [ ] **Payments (MVP):** confirmed — UPI Intent deep link to the trainer's own VPA. No payment gateway, no KYC for launch.
- [ ] **WhatsApp BSP:** pick one to trial later (Gupshup / WATI / Interakt / Twilio). Not needed until the nudges phase.
- [ ] **Hosting:** pick a simple managed host for the backend (Railway / Render / Fly.io) to start.

### 1.3 Write down the contracts (even though you're building both ends)
- [ ] **Data model** — finalize the entity list and fields (from the handover §6). Put it in the repo as a schema doc + migrations.
- [ ] **API contract** — list the endpoints and request/response shapes (handover §8), especially the `/sync` batch contract. A written contract keeps your app and backend in sync and makes the offline logic sane.
- [ ] **Definition of done for the MVP** — one sentence, pinned: *"A trainer can run 10–30 in-person clients — program, log on the floor offline, track progress, take UPI payments, and nudge over WhatsApp — without a spreadsheet."*

### 1.4 Set up how you'll work
- [ ] Create a project board (GitHub Projects / Linear / Trello). Turn the 9 features into epics; break each into small tickets.
- [ ] Agree a weekly cadence with your designer. **Design must stay ahead of build on the three hot flows** (session logging, dashboard, payment).
- [ ] Agree shared design tokens + a component list so Figma → React Native maps cleanly.

### 1.5 Legal / ops basics (light for MVP, don't over-invest)
- [ ] Plan for **minimal PII only** (name, phone) and write a short privacy policy — you'll need one to publish on Play, and DPDP expects consent + deletion. **Store no health/medical data.**
- [ ] Register a **Google Play Developer account** (one-time ~$25) early — approval can take a couple of days.
- [ ] Company entity / GST / a business PSP account are **not** blockers for MVP development (the UPI deep-link approach routes money directly to the trainer). Defer until you add a payment gateway.

---

## Part 2 — Prerequisites

### 2.1 Skills to top up (you already have Java + React)
- **React Native + Expo** — the biggest new area; do the official Expo tutorial end to end.
- **Offline-first patterns** — SQLite on device + a sync engine (read WatermelonDB's sync docs).
- **Spring Data JPA / Hibernate** — if you've mostly done plain Java, get comfortable with JPA entities + repositories.
- **EAS builds & Play internal testing** — how to get a build onto a real device and to testers.

### 2.2 Tools to install
- [ ] **JDK** — current LTS (21 or newer LTS).
- [ ] **Node.js** — current LTS.
- [ ] **Expo CLI + EAS CLI** (`npm i -g eas-cli`).
- [ ] **Android Studio** — for the SDK + an emulator.
- [ ] **A real, low-cost Android phone** — essential. Your users are on cheap Androids in bad lighting with poor signal; the emulator won't tell you the truth.
- [ ] **Docker** — run PostgreSQL locally via Docker Compose.
- [ ] **Git**, plus IntelliJ IDEA (backend) and VS Code (React Native).

### 2.3 Accounts to create
- [ ] **GitHub** (monorepo).
- [ ] **Expo / EAS** (builds).
- [ ] **Google Play Console** (publishing + internal testing track).
- [ ] **Firebase** — for FCM push (and optionally phone-OTP auth).
- [ ] **Object storage** — AWS S3 or Cloudflare R2 (exercise images, report PDFs).
- [ ] *Later, not now:* an OTP/SMS provider (MSG91) if not using Firebase Auth; a WhatsApp BSP; a payment gateway.

### 2.4 Repo layout (monorepo)
```
traindesk/
  backend/        # Spring Boot API
  app/            # React Native (Expo) — trainer + client (role toggle) or two targets
  shared/         # shared TS types, design tokens, components
  docs/           # data model, API contract, this playbook
  docker-compose.yml
```

---

## Part 3 — Environment & scaffolding (Milestone 0, ~week 1–2)

Goal of M0: a working skeleton and **one vertical slice through the hardest part** — not features.

### 3.1 Backend skeleton
1. Generate a Spring Boot project (Spring Initializr) with: Web, Spring Data JPA, PostgreSQL driver, Validation, Security.
2. Bring up PostgreSQL with Docker Compose.
3. Add a migration tool (Flyway or Liquibase) and create the core tables from the data model (Trainer, Client, Exercise, Program, WorkoutSession, SetLog, Package, Payment, ScheduledSession, NudgeLog).
4. Build **phone-OTP auth**: request-OTP + verify-OTP endpoints, issue a JWT. (Stub SMS in dev; wire a real provider later.)
5. Implement the **`/sync` endpoint** contract: accept a batch of changed records (client-generated UUIDs + `updated_at`), return server changes since the client's cursor. Use soft deletes.

### 3.2 App skeleton
1. Scaffold the Expo app; set up navigation and a basic role toggle (trainer/client).
2. Add on-device **SQLite (WatermelonDB)** and model the same core tables locally.
3. Implement the OTP login screen against the backend; store the JWT securely.
4. Build a minimal **sync layer**: local writes apply immediately, queue for push, reconcile on foreground/reconnect. Generate **UUIDs on the client**.

### 3.3 The M0 acceptance test (prove the spine)
> Log in via OTP → create a "client" **with the network off** → turn network on → it syncs → the record appears in Postgres → force-close and reopen the app → the record is still there and consistent.

When that round-trip works, offline + auth + sync — the riskiest 20% — is done. Everything after is incremental.

### 3.4 Also in M0
- [ ] Seed the **exercise library**: import free-exercise-db's combined JSON into Postgres; copy its images to your object storage; map its fields to your muscle-group / equipment / movement-pattern taxonomy.
- [ ] Basic CI (build + test on push).
- [ ] Get a dev build onto your real Android phone via EAS.

---

## Part 4 — Phase-by-phase feature build

Build **vertical slices** — each feature end to end (DB → API → sync → UI), offline-capable from the start. Rough solo-dev durations are indicative; adjust to your pace.

### Phase 1 — The core loop (M1–M3) · the heart of the product
| Milestone | Features | Done when… |
|---|---|---|
| M1 | **F1 Client roster + client detail** | You can add/edit clients offline; dashboard shows status chips; it all syncs |
| M2 | **F2 Program builder + templates + exercise library** | You can build a weekly program from the library, add a custom exercise, and save/reuse a template |
| M3 | **F3 Session logging (trainer + client), offline** | You can log load/reps/sets/RPE in a few taps with the network off, and it syncs later |

Watch: M3 is the hero. Log a real session in an actual gym on your phone before calling it done — if it's slower than a notebook, iterate until it isn't.

### Phase 2 — Money + retention (M4–M5)
| Milestone | Features | Done when… |
|---|---|---|
| M4 | **F4 Progress & PR tracking + charts** | PRs auto-detect; a client's trend charts render legibly on a phone and are screenshot-friendly |
| M5 | **F5 UPI payments + package/session-pack tracking** | Trainer generates a UPI deep link to their VPA; client pays in their UPI app; trainer marks it received; sessions-remaining and overdue flags update |

Watch: keep the UPI flow to "generate link → client pays → mark received." No gateway, no KYC. Reconciliation is manual by design for the MVP.

### Phase 3 — Scheduling + comms (M6–M7)
| Milestone | Features | Done when… |
|---|---|---|
| M6 | **F9 Scheduling / calendar** | Day/week view; add a session; mark done (decrements the pack) or no-show |
| M7 | **F6 WhatsApp nudges + F7 Shareable report** | Utility templates (reminder, payment-due, renewal) send via the BSP; a one-tap progress report shares to WhatsApp / PDF |

Watch: get your WhatsApp templates pre-approved by Meta early in M7 — approval takes time. Utility templates in India are cheap or free-in-window, so cost isn't the concern; approval lead time is.

### Phase 4 — Polish + pilot (M8)
- [ ] **F8 Client app** finished and clean (it reflects on the trainer).
- [ ] **Offline hardening:** kill the network at every step and confirm nothing breaks or double-writes.
- [ ] Real-device testing across a couple of cheap Android models.
- [ ] Push a build to the **Play internal testing track** for your 3–5 design-partner trainers.
- [ ] Instrument the **north-star metric** (weekly-active trainer–client relationships) plus activation (added ≥5 clients + logged ≥1 session in week 1).
- [ ] Iterate on partner feedback until they've genuinely dropped their spreadsheet.

### Post-MVP (not now)
iOS build · payment-gateway auto-reconciliation · AI program generation · Tamil localization · progress photos · trainer web dashboard · the gym-owner tier.

---

## Part 5 — Working practices for a solo build

- **Vertical slices, not horizontal layers.** Finish one feature through every layer before starting the next. It keeps you shippable and motivated.
- **Offline + sync is a first-class citizen.** Never "add it later." Test offline on every feature.
- **Live on a real cheap phone.** Test in a real gym, standing, one-handed. That's the product's true environment.
- **Get it in trainers' hands early.** The internal testing track beats guessing. Real usage > your assumptions.
- **Ruthless scope.** A tempting idea outside the 9 features → straight to a "later" list.
- **Design stays ahead.** Your brother prototypes the next hot flow while you build the current one.
- **Small commits / small PRs, even solo.** Future-you will thank present-you.
- **Don't gold-plate the exercise library or animations.** Text + optional image is enough (the trainer teaches the movement).

---

## Part 6 — Indicative timeline (solo, part-to-full-time)

| Weeks | Focus |
|---|---|
| 1–3 | Phase 0 interviews **+** environment setup + M0 vertical slice (in parallel) |
| 4–9 | Phase 1 — client roster, program builder, session logging (core loop) |
| 10–13 | Phase 2 — progress/PR + UPI payments |
| 14–17 | Phase 3 — scheduling + WhatsApp nudges + report |
| 18–22 | Phase 4 — client app, offline hardening, design-partner pilot, beta |

Treat these as a shape, not a promise — solo velocity varies. The one sequencing rule that isn't negotiable: **M0's offline/auth/sync slice comes before any feature.**

---

## First two weeks — literally what to do

- **Days 1–2:** Line up and start booking Phase 0 interviews. Install the toolchain (JDK, Node, Android Studio, Docker, Expo/EAS). Create GitHub, Expo, Play Console, Firebase accounts.
- **Days 3–4:** Init the monorepo. Scaffold Spring Boot + Postgres via Docker. Create the data-model migrations. Write down the API contract + `/sync` shape in `docs/`.
- **Days 5–7:** Build phone-OTP auth (stub SMS) and JWTs. Scaffold the Expo app, navigation, SQLite/WatermelonDB, and the OTP login screen.
- **Week 2:** Build the sync layer and pass the **M0 acceptance test** (offline create → sync → Postgres → survives restart). Seed the exercise library. Get a build on your real phone. Keep running interviews.

When both are true — interviews confirm A and B, and the M0 slice works — start Phase 1.

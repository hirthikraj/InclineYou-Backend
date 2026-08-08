# TrainDesk — Final Requirements & Delivery Plan (MVP)

**Version:** 2.0 (final for MVP) · **Date:** 6 Aug 2026
**Decision locked:** single app with a trainer/client role toggle · Android-first · phone-only · English-first · Chennai/Tamil Nadu launch.
**Companion docs:** Core Data Model & Schema-Evolution Guide (source of truth for the schema); Dev/Designer Handover; Getting-Started Playbook.

> Borrowed from Akton (adapted to our wedge, not copied wholesale): the per-session **split ratio** for gym-employed trainers (FR-7.3), the **trainer↔client live bridge** (FR-8), and the **automated weekly report** (FR-10). Their engagement layer (streaks/leaderboard/live crowd) is deliberately **deferred** to post-MVP — it needs member density we won't have yet.

---

## 1. Users & roles
- **Trainer** — freelance and/or gym-employed *at the same time* (no trainer-level type). Manages clients, plans, sessions, payments.
- **Client** — the trainer's client; uses the same app in the client role.
- **Single app, role toggle.** One codebase, one backend, one shared component library — architected so a separate member app can be split out later cheaply.

---

## 2. Functional requirements

### FR-1 Client management & intake
- **FR-1.1** Add, edit, and list clients (name, phone, goal, status).
- **FR-1.2** Capture baseline intake at onboarding: height, activity level, and additional free-form questions (extensible via metadata — no schema change per new question).
- **FR-1.3** Log body metrics over time (weight, measurements) as append-only entries that feed progress charts.
- **FR-1.4** Set a **payment mode per client** (trainer collects / gym front office collects) when the client is added.
- **FR-1.5** For gym-collected clients, set a **split ratio** (the trainer's revenue share %); freelance clients default to 100%.
- **FR-1.6** Roster dashboard with at-a-glance status chips: active, payment due, session-pack low, plan expiring.

### FR-2 Scheduling / calendar
- **FR-2.1** Calendar of sessions in day / week / month views.
- **FR-2.2** Create, reschedule, and cancel sessions; mark a session **done** (decrements the session pack) or **no-show**.
- **FR-2.3** Client sees upcoming sessions; rescheduling notifies the client (push).

### FR-3 Personalised & reusable training plans (goal-based)
- **FR-3.1** Build goal-based plans from the exercise library, with sets, reps, rest, and target load per exercise.
- **FR-3.2** Save any plan as a **reusable template** and apply it across clients.
- **FR-3.3** Assigning a template creates a **per-client program**; the trainer can then **tweak exercises for that client** without affecting the template or other clients.
- **FR-3.4** Exercise library (pre-seeded, categorised) plus custom exercises (name, muscle group, optional image, optional video link).

### FR-4 Workout logging (offline)
- **FR-4.1** Log each session's sets — load, reps, RPE, optional note — with last values prefilled and minimal taps.
- **FR-4.2** Works **fully offline**; syncs automatically when back online.
- **FR-4.3** Either the trainer or the client can log a session.

### FR-5 Progress & PR tracking (both roles)
- **FR-5.1** Auto-detect PRs (computed on read from logged history); track body metrics over time.
- **FR-5.2** Progress charts (volume, top set, bodyweight) **visible to both the trainer and the client**.
- **FR-5.3** Trainer sees adherence at a glance across all clients.

### FR-6 Packages & payments (dual-mode)
- **FR-6.1** Define a package per client (session-pack or monthly): sessions, amount, dates.
- **FR-6.2** Sessions-remaining decrements when a session is marked delivered.
- **FR-6.3 Trainer-collects:** generate a **UPI Intent deep link to the trainer's own UPI ID**; the client pays; **either the client or the trainer marks it paid** (optional UPI reference).
- **FR-6.4 Gym-collects:** no UPI link; the trainer marks the client paid/unpaid (client pays the front office) and can send a payment reminder.
- **FR-6.5** Overdue and expiring clients are surfaced in **both** modes.

### FR-7 Dashboard
- **FR-7.1** Total active clients.
- **FR-7.2** Total revenue this month (from confirmed payments / packages).
- **FR-7.3** For gym-collected clients, show the **split** — the trainer's share vs the gym's share — using each client's split ratio.
- **FR-7.4** Renewals due and payments pending, at a glance.

### FR-8 Instant sync & notifications (trainer↔client live bridge)
- **FR-8.1** Near-real-time two-way sync of plans, logs, and progress between trainer and client. *(Best-effort when online; offline-first means eventual consistency, not a guaranteed live socket.)*
- **FR-8.2** Push notifications (FCM) on key events: a new/updated plan assigned, session reminder, payment confirmed, weekly report ready.
- **FR-8.3** A plan assigned or edited on the trainer side appears on the client side after sync, announced by a push.

### FR-9 WhatsApp reminders
- **FR-9.1** Send WhatsApp utility templates via a BSP: session reminder, weekly check-in, payment reminder (mode-aware), plan renewal/expiry.
- **FR-9.2** Prefilled, editable templates — one-tap manual send plus automated triggers.

### FR-10 Automated weekly progress report
- **FR-10.1** Auto-generate a weekly progress report per active client (progress, PRs, adherence).
- **FR-10.2** Auto-send it to the client (WhatsApp link / PDF) on a weekly schedule (server-side job).
- **FR-10.3** The trainer can also generate and share a report on demand.

### FR-11 Client experience (client role in the app)
- **FR-11.1** View today's / this week's plan, log a workout, see progress and PRs, and see upcoming sessions.
- **FR-11.2** Pay via UPI, mark paid, view payment history, and receive reminders and the weekly report.
- *(Engagement layer — streaks, leaderboard, live gym crowd — is post-MVP.)*

---

## 3. Non-functional requirements

- **NFR-1 Platform.** Single Android app with a trainer/client role toggle; iOS later; phone-only (no web dashboard in v1).
- **NFR-2 Offline-first.** Logging, viewing today's plan, and recent client data work offline; sync on reconnect and app foreground. First-class, not optional.
- **NFR-3 Performance.** Logging a set is a few taps with optimistic local writes; cold start under a few seconds on mid-range Android.
- **NFR-4 Sync integrity.** Client-generated UUIDs; `updated_at` incremental pull/push; soft deletes; idempotent writes; last-write-wins per record.
- **NFR-5 Notifications.** FCM for push; WhatsApp Business API via a BSP (utility templates; pre-approved with Meta).
- **NFR-6 Payments.** UPI Intent deep link (zero MDR, no gateway/KYC for MVP); PSP-based auto-reconciliation is a later add-on.
- **NFR-7 Scheduled jobs.** Server-side scheduler (cron) for weekly report generation/sending and for renewal/expiry/overdue checks.
- **NFR-8 Security & privacy (DPDP Act 2023).** Minimal PII (name, phone); fitness metrics (height, weight, activity) captured with consent; **no medical/health-condition data**; TLS in transit, encryption at rest; deletion honoured.
- **NFR-9 Extensibility.** Additive-only schema and API per the data-model contract — add columns (nullable), tables, or metadata keys; never rename, retype, drop, or repurpose. String-based statuses; tolerant-reader API; versioned base path (`/v1`).
- **NFR-10 Localisation.** English for MVP; architected for Tamil then Hindi — no hard-coded strings, layouts tolerate ~30–40% text growth.
- **NFR-11 Reliability.** No data loss on force-close mid-session; safe retry on failed sync/payment writes.
- **NFR-12 Hosting/scalability.** Start on a simple managed host; revisit hosting and scale once the app converges (per team decision).
- **NFR-13 Maintainability.** Monorepo (Spring Boot backend + single React Native app + shared components); small PRs; basic CI.

---

## 4. Data model (final — additive changes only)

The full field-level schema is in the Core Data Model doc. This feature set required only **additive** changes, exactly as the schema-evolution contract intends:

- `client` gained `height_cm`, `activity_level`, and `trainer_split_percent` (all nullable). Extra intake questions live in `client.metadata`.
- A new **`body_metric`** table (append-only) stores weight and measurements over time for progress charts.
- The **split ratio** (FR-1.5 / FR-7.3) is `client.trainer_split_percent`; the **dual payment mode** (FR-6) is `payment.method` + `collected_by`; the **live bridge** (FR-8) rides the existing sync engine + FCM. No rework, no breaking changes.

Twelve core entities plus `body_metric`: `trainer`, `client`, `exercise`, `program`, `program_exercise`, `template`, `workout_session`, `set_log`, `package`, `payment`, `scheduled_session`, `nudge_log`, `body_metric`.

---

## 5. Phased delivery plan (start with project setup)

Each phase lists the requirements it **completes** and its definition of done. Build vertical slices — each feature end-to-end (DB → API → sync → UI), offline-capable from the start.

### Phase 1 — Project setup & foundation *(start here)*
- Monorepo; Spring Boot skeleton; PostgreSQL via Docker; **Flyway migration for the full schema**; phone-OTP auth + JWT; **sync scaffold**; exercise-library seed (free-exercise-db → Postgres, images to object storage); FCM setup; dev build on a real Android phone.
- **Done when:** the vertical slice works — log in via OTP → create a client **offline** → it syncs → appears in Postgres → survives an app restart.

### Phase 2 — Clients, intake & plans
- **FR-1** (clients, intake, body metrics, payment mode, split ratio), **FR-3** (goal-based plans, reusable templates, per-client tweak, exercise library + custom).
- **Done when:** you can add a client with intake, build and save a template, assign it to a client, and tweak that client's exercises without touching the template.

### Phase 3 — Logging, progress & the live bridge
- **FR-4** (offline workout logging), **FR-5** (progress + PR, both roles), **FR-8** (near-real-time sync + push on plan-assign/log).
- **Done when:** a session logged offline syncs up; the client sees an assigned plan via push; PRs and charts render for both roles.

### Phase 4 — Payments, packages & dashboard
- **FR-6** (packages + dual-mode UPI + mark paid by client or trainer), **FR-7** (dashboard: total clients, revenue, and the gym split).
- **Done when:** a trainer-collects client pays via UPI and it's marked paid; a gym-collects client is marked paid; the dashboard shows totals plus the trainer/gym split.

### Phase 5 — Scheduling & communications
- **FR-2** (calendar/scheduling), **FR-9** (WhatsApp reminders), **FR-10** (automated weekly report + scheduler).
- **Done when:** sessions can be scheduled and marked done/no-show; WhatsApp reminders send; the weekly report auto-generates and sends to clients.

### Phase 6 — Client experience, hardening & pilot
- **FR-11** polish; offline hardening across every feature; Play internal-testing beta with the design-partner trainers; instrument north-star (weekly-active trainer–client relationships) and activation (≥5 clients + ≥1 logged session in week 1).
- **Done when:** design-partner trainers have genuinely dropped their spreadsheets.

### Post-MVP (not now)
Gym entity (+ `gym_id` on trainer, multi-branch, staff assignment); **separate member app** split; engagement layer (streaks, leaderboard, live crowd); PSP auto-reconciliation; AI plan generation; Tamil localisation; iOS; trainer web dashboard; expense/lead-pipeline modules (Akton-style, for the gym tier).

---

## 6. Traceability — your feature list → requirements

| Your ask | Requirement |
|---|---|
| Add clients + intake (activity, kg, height, …) | FR-1.1–FR-1.3 |
| 1. Calendar / scheduling | FR-2 |
| 2. Personalised reusable plans, tweak per client | FR-3 |
| 3. Instant trainer↔client sync (push) | FR-8 |
| 4. Dashboard: clients, revenue, split ratio | FR-7 (split = FR-1.5 + FR-7.3) |
| 5. Workout logging per session (offline) | FR-4 |
| 6. UPI pay; client or trainer marks paid | FR-6.3 |
| 7. Progress & PR visible to both | FR-5 |
| 8. WhatsApp reminders | FR-9 |
| 9. Automated weekly progress report | FR-10 |

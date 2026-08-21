# XRep — AI Feature Spec

**Version:** 1.0 · **Dated:** 20 Aug 2026 · **Status:** design agreed, not yet built.

**Purpose:** turn XRep from a record-keeping app into an AI product, using three
features and no more. Everything here is buildable against the schema that exists
today (Flyway `V1`…`V25`, WatermelonDB schema v18); where a new table is needed it
is called out as an additive migration.

**Scope decision.** Fourteen AI features were considered (see Part 6). Three were
selected because each one is *load-bearing* — remove it and the product is not
credibly AI-first — and because together they cover the three things a trainer
does: plan the training, understand the business, keep the clients.

| # | Feature | One-line job | Runs |
|---|---|---|---|
| 1 | **Program generator** | Turn a plain-language brief into a draft template | Online, on demand |
| 2 | **Ask-your-business chat** | Answer questions about the trainer's own data | Online, on demand |
| 3 | **Churn risk scoring** | Rank the roster by who is about to leave | Batch nightly, **read offline** |

---

## Part 0 — The governing principles

Four rules that apply to all three features. They are not style preferences; each
one closes a failure mode that would otherwise be discovered in production.

### 0.1 AI drafts, the trainer decides

No AI output is ever acted on automatically. A generated program is a draft in an
editor. A chat answer is information. A churn flag is a suggestion. Nothing is
assigned to a client, and nothing is sent to a client, without an explicit human
tap.

This is simultaneously the safety story, the liability story, and the product
story. It is also what keeps us clear of the locked *no health data* decision: a
trainer who types "bad shoulder" is giving context for a draft that a certified
professional reviews — the product is not issuing medical advice.

### 0.2 The model never touches numbers or identifiers

Three hard prohibitions, each with a concrete reason:

- **The model never does arithmetic on money or counts.** SQL computes; the model
  phrases. A model that sums a trainer's monthly revenue will eventually be wrong
  by a few hundred rupees, and a money book that lies once is finished.
- **The model never writes SQL.** Ownership in this codebase *is* a query filter —
  every trainer-scoped read is safe only because it carries
  `AND trainer_id = :tid`. A generated `SELECT` is one omitted predicate away from
  showing trainer A trainer B's roster. A tenancy boundary cannot rest on prompt
  discipline.
- **The model never names an exercise freely.** It selects from a candidate list of
  real `exercise.id` values, and every returned id is validated against that list.
  Hallucinated exercises are impossible by construction rather than unlikely.

### 0.3 Offline is a per-feature decision, not a blanket one

Inference runs server-side only — an API key cannot ship inside an Expo bundle —
so every live AI call needs connectivity. That is consistent with the existing law
that REST is the *online complement* and sync is the write path, but each feature
still needs a defined behaviour on a gym floor with no signal.

| Feature | With no signal | Why that is acceptable |
|---|---|---|
| Program generator | Unavailable, explicit empty state | Programming happens sitting down, once per client |
| Business chat | Unavailable, explicit empty state | A lean-back moment, not a mid-session one |
| Churn scoring | **Fully available** | Scores are computed nightly server-side and pulled down as ordinary synced rows |

Churn is the feature a trainer most needs while standing in front of the client,
which is exactly why it is designed as synced data rather than a live call.

### 0.4 Client data is pseudonymised at the boundary

Names, phone numbers and goals leaving Postgres for a third-party model is a
DPDP-Act-relevant decision, not an implementation detail.

The rule: **the provider receives `Client A`, `Client B` and the numbers.** Real
names are re-substituted inside our own service before the response is returned.
Phone numbers are never sent at all. Free-text a trainer typed themselves (the
program brief, a chat question) goes as-is, because they authored it.

This costs almost nothing to build, removes the entire objection, and is worth
saying out loud in marketing.

---

## Part 1 — The shared substrate

Build this once, before any feature. All three need the same plumbing.

### 1.1 Endpoints and authorization

A new `/v1/ai/**` prefix, `ROLE_TRAINER` only — no client-facing AI in this spec.
Path rules go in `config/SecurityConfig.java` (first match wins) and the
authorization table in `API.md` gains the rows in the same commit as the code.

### 1.2 A new rate-limit tier: `AI`

None of the four existing tiers fits. `STANDARD` at 120/min on an endpoint that
spends real money per call is a bill waiting to happen; `MESSAGING` at 10/min is
the right order of magnitude but its semantics are "this spends a WhatsApp
message" and conflating the two makes both budgets unreadable.

`AI`: a low per-minute limit (start at **6/min**) **plus a per-trainer daily
call/token ceiling**. The daily ceiling must be persistent for the same reason
`V17` moved the OTP wrong-attempt lock out of memory — a restart must not reset a
trainer's spend. Redis-first with a Postgres fallback, matching `DelegatingOtpStore`.

Tier selection lives in `ratelimit/RateLimitFilter.java` alongside the existing
prefix checks. Config sits with its siblings under `app.rate-limit`.

### 1.3 New error codes

Added to `exception/GlobalExceptionHandler.java` and to the `code` catalogue in
`API.md` — the app cannot branch on prose.

| Code | HTTP | Meaning | What the app does |
|---|---|---|---|
| `AI_UNAVAILABLE` | 503 | Provider down, timing out, or globally disabled | Show a retry affordance. **Never** a fabricated answer. |
| `AI_QUOTA_EXCEEDED` | 429 | Trainer's daily AI ceiling reached | Explain, show when it resets |
| `AI_UNSUPPORTED` | 422 | Chat could not map the question to a known intent | Say what it *can* answer |

### 1.4 Configuration and kill switches

Under `app.ai.*` in `application.yml`, every key env-overridable, following the
`REDIS_ENABLED` / `FCM_CREDENTIALS` precedent:

- `AI_ENABLED` — global off switch
- one flag per feature, so any one can be dark-launched or pulled independently
- provider credentials — **blank disables the feature and hides it in the UI**,
  the way blank `FCM_CREDENTIALS` disables push, rather than crashing on boot
- model id per call site (a cheap model for classification, a stronger one for
  generation), request timeout, and the daily token ceiling

### 1.5 Provider abstraction and CI

The provider sits behind an interface with a deterministic fake, the same shape as
`DelegatingOtpStore`. Two reasons, and the second is not optional:

- **CI has no Redis and must have no live model calls.** Anything that only works
  with a real provider present passes locally and fails — or silently skips —
  under `./mvnw -B verify`.
- Prompt and parsing logic must be unit-testable against fixed fixtures, or every
  behaviour change becomes a manual test.

### 1.6 Cost shape

Honest order of magnitude, so the business model is not a surprise:

| Feature | Per call | Frequency | Verdict |
|---|---|---|---|
| Program generator | A few thousand input tokens (the candidate list dominates), under a thousand out | 5–20 times in a trainer's *lifetime* | Effectively free |
| Business chat | Small in, small out — but two calls (classify, phrase) | Recurring, daily for engaged trainers | **This is where the bill lives** |
| Churn scoring | Zero at v0; one small call per at-risk client at v1 | Nightly batch | Negligible |

Given the ARPU this product targets, chat is the only feature that needs real cost
engineering: a cheap model for intent classification, a stronger one only for
phrasing, short-window caching of identical questions, conversation history capped
at the last few turns rather than resent whole, and the `AI` tier's daily ceiling
as the backstop.

---

## Part 2 — Feature 1: Program generator

**The job:** collapse the twenty-minute chore of programming a new client into
thirty seconds of review. This is the demo feature.

### 2.1 What the trainer sees

A *Generate with AI* entry point on the template list. One screen:

- Goal — fat loss / muscle / strength / general
- Days per week — becomes the count of **ordinal day slots**
- Session length — bounds the exercise count per day
- Equipment available — gym / home / minimal, mapped onto the library's
  `equipment` values
- Free text — *"45 min, bad left shoulder, beginner, no barbell"*

Output lands in the **existing template editor**, pre-filled and fully editable:
day slots with labels ("Push", "Pull", "Legs"), each holding exercises with sets,
reps, rest and notes. The trainer edits, then saves through the existing
`POST /v1/templates`. Assignment stays exactly as it is today — the existing apply
flow chooses each client's weekdays and times.

**The generator produces a template, not a program.** It bolts onto the top of a
pipeline that already works rather than running beside it, which is why it needs
no new write path and no new sync surface.

### 2.2 What feeds it

`src/main/resources/seed/exercises.json` — **1,324 exercises**, each carrying
`bodyPart`, `target`, `synergist`, `secondaryMuscles`, `equipment` and
step-by-step `steps` text, across roughly two dozen equipment classes. This data
is MIT-licensed and stays; it is the reason the feature is buildable at quality.

Plus the trainer's own `is_custom = true` rows, so generated programs speak the
trainer's own movement vocabulary.

**The library is text-only and stays that way.** `image_url` and `video_url` were
cleared by `V22` because the artwork is © Gym visual. Nothing in this feature
reintroduces media.

### 2.3 How it works

1. **Retrieve.** Filter `exercise` in SQL by equipment and body part →
   60–120 candidates, each reduced to `id`, `name`, `target`, `equipment`.
2. **Select.** One model call receives the trainer's brief plus that candidate
   list and returns a selection: which ids, in which day slot, in what order,
   with sets / reps / rest.
3. **Validate hard.** Every id must exist in the candidate set; day slots
   contiguous from 1; counts inside the bounds implied by session length; no
   exercise repeated within a day. Invalid output is repaired or the call retried —
   never surfaced.
4. **Map.** Into the existing `TemplateExerciseInput` shape — `exerciseId`,
   `sets`, `reps`, `restSeconds`, `targetLoad`, `notes`, `dayOfWeek` **as the
   ordinal slot**, `orderIndex` — plus `dayLabels`.

Step 1 plus step 3 is what separates this from a demo. See §0.2.

### 2.4 Guardrails

- **`targetLoad` is left null.** Suggesting a starting weight for a client the
  model has never seen is the one place this feature can embarrass us. The trainer
  fills it, or the first session's `set_log` does.
- Deterministic rules layered on the model's choice: an exercise-count ceiling per
  session length, at least one compound movement per day, and no two consecutive
  day slots loading the same `bodyPart`.
- Injury text steers selection *away* from a region. It never produces rehab
  guidance. Screen copy states plainly that this is a starting point for the
  trainer to adjust.
- Trainer review is mandatory — there is deliberately no path from this screen
  directly onto a client.

### 2.5 Phasing

- **v0** — the flow above: brief in, draft template in the editor.
- **v1** — scoped edits: *"regenerate day 3"*, *"swap this exercise"*, *"make it
  harder"*. Much stickier than one-shot generation, and the natural follow-on.
- **v2** — generate from a client's real profile (`client.goal`,
  `activity_level`, recent `set_log` history) instead of a typed brief.

### 2.6 Success measure

Share of generated templates **saved rather than discarded**, and the number of
exercises edited before saving. More than roughly a third edited means the
retrieval filter is wrong, not the model.

---

## Part 3 — Feature 2: Ask-your-business chat

**The job:** replace navigating five screens with one question. This is the
feature that makes the product *feel* AI-powered, and the one most likely to be
built badly.

### 3.1 What the trainer sees

A chat entry in the drawer, opening with 4–5 suggested questions — discovery is
the hard part, trainers will not guess what it can do.

Every answer is a short sentence **plus a rendered result**: a tappable client
list, a number, a small table. Not a wall of prose.

> *"Who hasn't come in two weeks?"* →
> "6 clients. Rahul (18 days), Priya (16 days)…" — each row taps through to the
> client screen, each row carrying a **Nudge** button that drops into the existing
> WhatsApp flow.

**Every answer ends in an action the trainer can take right there.** That is the
difference between a product and a toy.

### 3.2 Architecture: an intent catalogue, not text-to-SQL

The model is given a fixed set of hand-written, parameterised, always
trainer-scoped queries as tools. Its only job is choosing which one and filling
its parameters. All SQL is ours — reviewed, indexed, and scoped by `trainer_id`.
See §0.2 for why this is not negotiable.

Opening catalogue, all answerable from tables that exist today:

| Intent | Reads |
|---|---|
| Clients with no session in N days | `workout_session`, `client` |
| Revenue in a period, by method | `payment` — `amount`, `status`, `paid_at`, `method` |
| Outstanding / pending payments | `payment` where `status = 'pending'` |
| Packages expiring or low on sessions | `package` — `sessions_remaining`, `end_date`, `status` |
| Attendance rate, per client or overall | `scheduled_session.status` ∈ `scheduled` / `done` / `cancelled` / `no_show` |
| Progress on an exercise for a client | `set_log` — `load_kg`, `reps`, `rpe` |
| Body metric trend | `body_metric` — `metric_type`, `value`, `recorded_at` |
| Today's / this week's schedule | `scheduled_session` |
| Roster counts by status | `client.status` |
| Nudges sent recently | `nudge_log` |

The model sees only the pseudonymised *results* of these queries and writes the
sentence around them.

**When nothing matches:** return `AI_UNSUPPORTED` and have the UI say what it can
answer. A confidently wrong answer is far worse than an honest miss.

### 3.3 Language

Trainers will type Hinglish, and Tamil-English. Intent classification handles that
essentially for free — a real advantage over any rules-based search box, and worth
designing the suggested questions to showcase.

### 3.4 Phasing

- **v0** — roughly 8 intents, single-turn, no memory. This is most of the value;
  ship it.
- **v1** — follow-ups (*"and last month?"*), which requires turn state.
- **v2** — chat can **act**: *"send all six a check-in"* hands off to the
  `MESSAGING` tier behind a confirmation screen. High value, and the point at
  which confirm-before-send becomes mandatory rather than polite.

### 3.5 Success measure

Chat sessions per trainer per week, and the **unsupported-question rate**. Log the
text of every `AI_UNSUPPORTED` question: that log *is* the intent backlog, and it
is the most valuable dataset this feature produces.

---

## Part 4 — Feature 3: Churn risk scoring

**The job:** turn the roster from a list into a worklist. This is the feature
trainers pay for, and it is barely AI at all — which is a feature, not a
criticism.

### 4.1 What the trainer sees

An *At risk* section at the top of the roster (or a filter chip). Three bands —
high / medium / low — each flagged client showing one human-readable line:

> **Rahul** · High risk — no session in 18 days, 2 of the last 5 sessions
> cancelled, package expires in 6 days.

Tapping opens the client with the suggested action already selected: nudge, call,
or offer a renewal.

### 4.2 What feeds it — all of it already in the schema

| Signal | Source |
|---|---|
| Days since last logged session | `workout_session.session_date` |
| Attendance trend | `scheduled_session.status` — `no_show` and `cancelled` are already distinct values |
| Attendance *decay* (recent 4 weeks vs. prior 4) | same |
| Package burn-down rate vs. time remaining | `package.sessions_remaining`, `end_date` |
| Payment lateness, pending balance | `payment.status`, `paid_at` |
| Renewal history — has this client renewed before? | `package` count per client |
| Nudge fatigue — messaged repeatedly, still quiet | `nudge_log` |
| Stalled progress | `set_log` volume trend, `body_metric` flatness |
| Tenure | `client.created_at` |

There is no missing data here. That is unusual, and it is why this feature is
buildable now at real quality rather than after a data-collection project.

### 4.3 How it works: weights, not a model

A weighted, deterministic score over those signals → three bands. Optionally, one
cheap model call turns the *contributing factors* into the one-line reason.

Why deterministic, explicitly:

- **Explainable.** A score a trainer cannot understand is a score they ignore.
- **Testable in CI** with no provider and no Redis.
- **Free** to compute for every client on every roster, nightly.
- **Better than a model at this job.** An LLM asked to score churn from a row of
  numbers is worse than arithmetic, and it cannot tell you why it said 0.7.

The honest framing: this is analytics with an AI presentation layer, and it is the
highest-ROI item on the whole list precisely because of that.

### 4.4 Where it runs, and why that matters

Batch, nightly, per trainer — mirroring `report/WeeklyReportJob`, which already
proves the pattern.

Output goes to a **new table** (additive migration, `V26`): client id, score,
band, contributing factors, computed-at. It is exposed through `/v1/sync/pull`, so
scores land on the phone and are readable **with no signal** — the moment a
trainer most needs to know the client in front of them is drifting.

### 4.5 The path to real ML

Every night a score is recorded. Every day, clients either return or do not.
Within a few months there are labelled outcomes — churned vs. retained against the
score that predicted it. *Then* fit a real model and measure its precision.

Starting with weights is not a shortcut that gets thrown away; it is how the
training set gets generated. There is no way to skip to a model we have no data to
fit.

### 4.6 Guardrails

- **Never show the score to the client**, and never let it reach a client-facing
  message. *"Our system flagged you as likely to quit"* ends a relationship.
- **Suppress for clients under ~3 weeks' tenure.** There is no baseline, and a
  false alarm on every new client destroys trust in the feature itself.
- **Bands, not a naked percentage.** "0.73" claims a precision we do not have yet.

### 4.7 Phasing

- **v0** — weights, bands, a templated reason string. **No model call at all.**
- **v1** — model-written reason lines and a suggested action.
- **v2** — a trained model once outcome data exists; surface "why" from feature
  contributions.
- **v3** — roll the same signals into a revenue forecast. Churn risk × package
  value is *next month's cash at risk*, which is the number that actually
  converts a trainer to a paid plan.

### 4.8 Success measure

**Precision on the high band** — of clients flagged high, how many stopped within
30 days. And the **action rate**: do trainers do anything after seeing a flag? A
score nobody acts on is a vanity feature.

---

## Part 5 — Build order and cross-cutting changes

### 5.1 Order, and the reasoning

1. **Churn v0.** No provider integration, no prompt work, no cost; ships in days.
   It starts accumulating the outcome data every later version depends on, and it
   establishes the compute-nightly-and-sync-down pattern.
2. **Program generator.** Best demo, near-zero running cost, plugs into an
   existing pipeline. It forces the provider abstraction, the `AI` tier, the kill
   switches and the pseudonymisation boundary to be built cleanly — on a
   low-traffic endpoint where mistakes are cheap.
3. **Chat.** Highest ongoing cost, most repeat usage, most product risk. It also
   benefits from an intent catalogue informed by trainers who have already used
   the first two.

### 5.2 Schema and contract changes, in lockstep

Per the additive-only law, in both halves, in the same commit:

- **Flyway `V26`** — the churn score table. Append only; nothing existing is
  edited, dropped or repurposed.
- **A new appended WatermelonDB migration** (`app/src/db/migrations.ts`, schema
  v18 → v19) for the same table on the device side.
- **`backend/API.md`** — the `/v1/ai/**` endpoints, the `AI` rate-limit tier row,
  the authorization-table rows, and the three new `code` entries.
- **No column is ever removed, and no response field is ever removed.** Trainers'
  phones carry data we cannot refetch, and old builds must keep working.

### 5.3 Interaction map

The new screens — generate-program, chat, and the roster's at-risk section — need
frames in `XRep_MVP_interaction_map.md` before they are built, and the design
system is the source of truth for their tokens. Note the existing precedent that
the map has indexed frames that were never drawn; do not repeat it here.

---

## Part 6 — Deliberately excluded

Eleven other AI features were considered and set aside. Recorded here so they are
not re-litigated, and so a good idea is not lost.

| Feature | Why not now |
|---|---|
| **Auto-progression from set logs** | Genuinely strong — arguably feature 4. Mostly rules plus a thin explanation layer. Deferred only because the three above cover more ground; revisit immediately after. |
| **Weekly report → narrative** | Cheapest thing on the list; `WeeklyReportJob` already computes the numbers. A one-paragraph add-on to feature 2's phrasing layer rather than a feature of its own. |
| **Client message drafting** | Overlaps the existing `nudge_rule.message` templating. Fold into chat v2 when chat can act. |
| **Renewal & revenue forecast** | Churn v3. Needs churn's signals first. |
| **Payment follow-up copilot** | A special case of message drafting; same reasoning. |
| **Voice session logging** | Highest UX value of anything considered, and it fights offline-first hardest — needs an on-device model or an online-only path. Its own project. |
| **Exercise substitution on the fly** | Small and delightful; falls out of program generator v1's "swap this exercise" almost for free. |
| **Client-side check-in summariser** | Good data flywheel, but needs the client app half to be a habit first. |
| **Onboarding intake summariser** | Becomes worthwhile at program generator v2, which reads the client profile. |
| **Content / marketing generator** | Strong perceived value, weak strategic fit. Not our data, not our moat. |
| **Schedule optimiser** | Real but modest. After the revenue forecast. |

---

## Appendix — Measurement summary

| Feature | Primary metric | Health metric | Failure signal |
|---|---|---|---|
| Program generator | Generated templates saved / generated | Exercises edited before save | >⅓ edited → retrieval filter wrong |
| Business chat | Sessions per trainer per week | Unsupported-question rate | Rising unsupported rate → intent catalogue too narrow |
| Churn scoring | Precision on the high band at 30 days | Action rate after a flag | Flags with no action → reasons not credible |

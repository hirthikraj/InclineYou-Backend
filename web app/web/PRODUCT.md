# Product

<!-- impeccable:product-schema 1 -->

Scope: the InclineYou **web app** (`web app/web/`) only. The Spring backend and the Expo phone app are context, not subjects of this record.

## Platform

web

## Users

**Primary: the independent personal trainer in India** (a coach on their own, not a gym employee), running a roster of roughly 16–24 in-person clients. They coach on a gym floor, one hand usually busy, often with no signal. On the web they work mostly **at a laptop or desktop** — planning programs, reading the roster, keeping the money book, reviewing the week — and also log sessions live on a laptop or tablet at the gym. Their phone is the offline-first sibling; the web is online-only.

**Second: the client**, an adult whose number a trainer entered. They train three to five times a week, use the portal for two to four minutes at a time, often mid-workout and on a phone, and are not fitness enthusiasts. The portal is simpler than the trainer app, not equivalent to it: Home, Progress, Plan, Me, with the workout as a flow. Their failure mode is *too complicated, or shamed, so they stop opening it*. The product treats the trainer as present in it (their note, their cue, their WhatsApp) and never sends a message of its own.

Other audiences, **not yet** (later rings): team coaches and owners, and gym admins.

Clients are **adults only (18+)**. No guardian-consent flow exists, and the portal must not become a way round the rule: only a number a trainer added can sign in.

## Product Purpose

A trainer-first coaching app: a roster, workout programs, a session diary, and a cash/UPI money book that keeps working with no signal on a gym floor. It exists so an independent trainer stops running a business out of notebooks and WhatsApp. Success means a trainer can sign in, add clients, book and log sessions, and see who owes them money without ever feeling the tool slow a session down, and that a client they invite can open the portal, know what to do today and see that it is working. The number to watch is the share of a trainer's clients who logged a workout in the last 7 days: above 60% the trainer renews, below 30% they churn.

**The v1 engineering priority is making session logging extremely fast.**

## Positioning

Built for the trainer, not the gym or the client: the trainer's own books stay theirs. Four commercial rules bind product decisions as much as pricing ones: never price per client, never price on collections, never sell unlimited trainers, never gate the money book. Nudges and client invites are `wa.me` drafts the trainer reviews and sends from their own number. The one exception (decided 10 Oct 2026, PRD D-17) is a session reminder the platform sends by WhatsApp for a session the trainer booked, only if the trainer switched it on and the client has not opted out.

## Operating Context

- Trainer's phone number is the account; sign-in is an OTP delivered over WhatsApp only (no SMS). OTP delivery is not yet wired, so nothing signs in off a development machine.
- Online-only on the web. No offline banner, sync pill or sync queue is built there, and the design set's offline chrome is deliberately ignored.
- Money is rupees: cash, UPI, packs of sessions, gym revenue share, GST. The money book is a core retention hook.
- The browser never talks to the Spring backend directly; screens go through Next server actions.
- Sessions are one-to-one, in person, often at a gym that is not on InclineYou.

## Capabilities and Constraints

- Scope (decided 10 Oct 2026, reversing the 24 Sep cut): the **full trainer-client product is built first** — the trainer web app and the client portal, with nothing held back inside them: GST summary, blood pressure and resting heart rate in assessments, notes shared with the client, assessments sent to a client. The PRD is `release/prd-trainer-client-product.html`. **Still later:** phone app, team coaching, workspace switcher, gym platform, AI chat; Google sign-in is a pending extension.
- Built: auth and setup, Today, Schedule, Clients (with the full client file and workout console), Fitness (programs, templates, workouts, exercises), Business (overview, transactions, packages, gym share, GST, reports), Settings and profile.
- **No health inference**: no injuries, conditions or medications recorded as such. The medical flag is a neutral "Has a note" chip. The assessment catalogue is the one recorded exception — visceral fat, blood pressure, resting heart rate and a *did anything hurt* question, by the product owner's decision of 23 Sep 2026, isolated in `AssessmentCatalogue`, named in the privacy policy and kept out of logs. Assessments are taken by the trainer in the session or sent to the client to answer, and the body is measured only in assessments (so the portal has no loose weigh-in; PRD decision D-02).
- **No progress photos** and no profile photo; there is no image store.
- The exercise library is **text-only**; no exercise artwork or video.
- Terminology that must stay stable: **pack** is what a trainer offers, **package** is what one client bought; **assessment** is a questionnaire, never "check-in" on the trainer side; **Business**, not "Money".
- Undecided or unbuilt: billing (a 30-day trial and the payment rail — the tables exist, nothing uses them), **the client portal's backend** (`portal/` was deleted in `41710f0`; `/v1/me/*` does not exist), the invite and consent screen for clients, the paused/removed walls. Pricing is a proposal (`PRICING.md`) with nothing wired. Open decisions that touch the portal (offline workouts, notifications, trainer-who-is-also-a-client, the lawyer's answer on the Data Fiduciary) are D-02…D-12 in the PRD.
- Wire contract lives in `release/api-contract-v1.1.html` (it wins) and `backend/API.md`; schema evolution is additive-only. The use cases are in `release/prd-trainer-client-product.html`.

## Brand Commitments

- Name: **InclineYou**. The mock's wordmark sets *You* in the brand lime.
- Voice: plain, active, in the trainer's own words. Errors state a fact, a consequence and a count (*"That code isn't right. 2 tries left."*), without apology or blame. Money copy says *₹2,400 pending*, not storage language.
- **Never shame** (client-facing rule, kept as a house principle): a missed session is shown at the same weight as a rest day, counts replace streaks, and weight carries no good-or-bad tone.
- The design system's visual rules are owned by the mock UI at `InclineYou-MockUI/mock-ui/design-system/webapp/webapp/` and its `UIUX-SKILL.md`; they are the incumbent system, not decided here.

## Evidence on Hand

- Product docs: root `CLAUDE.md`, `web app/web/AGENTS.md` (and `AGENTS-ARCHIVE.md`), `WEB_LAUNCH.md`, `PRICING.md`, `backend/API.md`.
- The client portal: `InclineYou-MockUI/mock-ui/InclineYou-Client-Portal-Spec.md` (a design opinion, not a decision — see PRD D-02…D-08 for where it collides with standing rules) and `webapp-client-portal.html` in the design set.
- The mock design set: 28 screen and component pages plus `webapp.css` and `UIUX-SKILL.md`, at `/home/incline-you/InclineYou/InclineYou-MockUI/mock-ui/design-system/webapp/webapp/`.
- A seeded dev database with a roster and returned assessments (e.g. a sample trainer number and clients named in the docs).
- **Absent, so never fabricate:** testimonials, customer logos, press, usage benchmarks, published pricing, real device testing (no phone width has been tried on a real device), and a grievance address for the DPDP Act card (placeholders only).

## Product Principles

1. **Speed on the gym floor beats completeness.** If a rule makes logging a set slower, it loses.
2. **The books never get worse for being honest.** Don't gate the money book or price anything that gives a trainer a reason to record less.
3. **Say it where the question occurs.** A sentence at the point of doubt beats a help page nobody opens.
4. **Don't judge the person.** No health inference, no streak penalties, no tone on a body measurement.
5. **The trainer decides; the product drafts.** Nudges and invites are drafts the trainer sends; the only message the platform sends for them is an opt-in session reminder they switched on. Nothing is irreversible without saying so first.

## Accessibility & Inclusion

- **English only for v1.** No localisation commitment yet.
- Standard: **WCAG 2.2 AA**, including 24px minimum targets (SC 2.5.8), 4.5:1 text contrast in both themes, a keyboard route for every drag (SC 2.5.7), and visible focus.
- Both light and dark themes are supported. Reduced motion and reduced transparency preferences are honoured.

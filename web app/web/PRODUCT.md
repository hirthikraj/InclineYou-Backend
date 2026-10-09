# Product

<!-- impeccable:product-schema 1 -->

Scope: the InclineYou **web app** (`web app/web/`) only. The Spring backend and the Expo phone app are context, not subjects of this record.

## Platform

web

## Users

**Primary: the independent personal trainer in India** (a coach on their own, not a gym employee), running a roster of roughly 16–24 in-person clients. They coach on a gym floor, one hand usually busy, often with no signal. On the web they work mostly **at a laptop or desktop** — planning programs, reading the roster, keeping the money book, reviewing the week — and also log sessions live on a laptop or tablet at the gym. Their phone is the offline-first sibling; the web is online-only.

Other audiences, **not in v1** (the code exists and is hidden, not deleted):
- the **client**, who reads a portal of their own plan, progress and check-ins (next release);
- team coaches and owners, and gym admins (later rings).

Clients are **adults only (18+)**. No guardian-consent flow exists.

## Product Purpose

A trainer-first coaching app: a roster, workout programs, a session diary, and a cash/UPI money book that keeps working with no signal on a gym floor. It exists so an independent trainer stops running a business out of notebooks and WhatsApp. Success for v1 means a trainer can sign in, add clients, book and log sessions, and see who owes them money without ever feeling the tool slow a session down.

**The v1 engineering priority is making session logging extremely fast.**

## Positioning

Built for the trainer, not the gym or the client: the trainer's own books stay theirs. Four commercial rules bind product decisions as much as pricing ones: never price per client, never price on collections, never sell unlimited trainers, never gate the money book. Nothing in the product sends a message on the trainer's behalf; reminders are `wa.me` drafts the trainer reviews and sends from their own number.

## Operating Context

- Trainer's phone number is the account; sign-in is an OTP delivered over WhatsApp only (no SMS). OTP delivery is not yet wired, so nothing signs in off a development machine.
- Online-only on the web. No offline banner, sync pill or sync queue is built there, and the design set's offline chrome is deliberately ignored.
- Money is rupees: cash, UPI, packs of sessions, gym revenue share, GST. The money book is a core retention hook.
- The browser never talks to the Spring backend directly; screens go through Next server actions.
- Sessions are one-to-one, in person, often at a gym that is not on InclineYou.

## Capabilities and Constraints

- v1 is the **trainer web app alone**. Out of v1 and hidden rather than removed: client portal, phone app, team coaching, workspace switcher, Google sign-in, GST summary page, blood pressure and resting heart rate in assessments, notes shared with the client.
- Built: auth and setup, Today, Schedule, Clients (with the full client file and workout console), Fitness (programs, templates, workouts, exercises), Business (overview, transactions, packages, gym share, GST, reports), Settings and profile.
- **No health data**: no injuries, conditions or medications anywhere. The medical flag is a neutral "Has a note" chip. Assessments are taken by the trainer in the session, and the body is measured only in assessments.
- **No progress photos** and no profile photo; there is no image store.
- The exercise library is **text-only**; no exercise artwork or video.
- Terminology that must stay stable: **pack** is what a trainer offers, **package** is what one client bought; **assessment** is a questionnaire, never "check-in" on the trainer side; **Business**, not "Money".
- Undecided or unbuilt: billing (a 30-day trial and the payment rail), the invite and consent screen for clients, the paused/removed walls. Pricing is a proposal (`PRICING.md`) with nothing wired.
- Wire contract lives in `backend/API.md`; schema evolution is additive-only.

## Brand Commitments

- Name: **InclineYou**. The mock's wordmark sets *You* in the brand lime.
- Voice: plain, active, in the trainer's own words. Errors state a fact, a consequence and a count (*"That code isn't right. 2 tries left."*), without apology or blame. Money copy says *₹2,400 pending*, not storage language.
- **Never shame** (client-facing rule, kept as a house principle): a missed session is shown at the same weight as a rest day, counts replace streaks, and weight carries no good-or-bad tone.
- The design system's visual rules are owned by the mock UI at `InclineYou-MockUI/mock-ui/design-system/webapp/webapp/` and its `UIUX-SKILL.md`; they are the incumbent system, not decided here.

## Evidence on Hand

- Product docs: root `CLAUDE.md`, `web app/web/AGENTS.md` (and `AGENTS-ARCHIVE.md`), `WEB_LAUNCH.md`, `PRICING.md`, `backend/API.md`.
- The mock design set: 28 screen and component pages plus `webapp.css` and `UIUX-SKILL.md`, at `/home/incline-you/InclineYou/InclineYou-MockUI/mock-ui/design-system/webapp/webapp/`.
- A seeded dev database with a roster and returned assessments (e.g. a sample trainer number and clients named in the docs).
- **Absent, so never fabricate:** testimonials, customer logos, press, usage benchmarks, published pricing, real device testing (no phone width has been tried on a real device), and a grievance address for the DPDP Act card (placeholders only).

## Product Principles

1. **Speed on the gym floor beats completeness.** If a rule makes logging a set slower, it loses.
2. **The books never get worse for being honest.** Don't gate the money book or price anything that gives a trainer a reason to record less.
3. **Say it where the question occurs.** A sentence at the point of doubt beats a help page nobody opens.
4. **Don't judge the person.** No health inference, no streak penalties, no tone on a body measurement.
5. **The trainer decides; the product drafts.** Nothing sends on their behalf and nothing is irreversible without saying so first.

## Accessibility & Inclusion

- **English only for v1.** No localisation commitment yet.
- Standard: **WCAG 2.2 AA**, including 24px minimum targets (SC 2.5.8), 4.5:1 text contrast in both themes, a keyboard route for every drag (SC 2.5.7), and visible focus.
- Both light and dark themes are supported. Reduced motion and reduced transparency preferences are honoured.

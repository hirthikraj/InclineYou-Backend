# InclineYou — monorepo notes

InclineYou is a trainer-first coaching app for independent personal trainers in India:
a roster, workout programs, a session diary, and a cash/UPI money book that works
with no signal on a gym floor.

Three parts, each with its own agent notes — **read the one for the part you're
working in**; this file only covers what spans them.

| Path | What it is | Its notes |
| --- | --- | --- |
| `backend/` | Spring Boot 4.1 · Java 21 · Postgres 16 · Redis 7 | `backend/CLAUDE.md` |
| `app/` | Expo SDK 54 · React Native 0.81.5 · WatermelonDB | `app/CLAUDE.md` |
| `web app/web/` | Next.js 16 App Router · React 19 · TypeScript | `web app/web/AGENTS.md` |

The web half started 23 Aug 2026 and is the desktop sibling, not a port: its
design set is `web app/Design/webapp/webapp/`. The gym admin console and the
client portal are slated to live in that same project, which is why it is Next
rather than a static bundle.

## Shipping the web first

`WEB_LAUNCH.md` at this level is the launch book for the web half — the
must-do items standing between the current tree and a production
deployment, an
India-first hosting analysis for all three layers with alternates, and the
security checklist to sign off before release. **Read it before any deployment
or infrastructure work.** One of its blockers is worth knowing even if you
never deploy: no OTP delivery is wired, so nothing can sign in off a development
machine. (The other — the web never sending `X-InclineYou-Client: web`, and so
holding an unrevocable JWT — was fixed on 27 Sep 2026: `lib/auth/api.ts` sends it,
and a not-yet-claimed number gets a 15-minute JWT that can only claim, because
`web_session` needs an `app_user` row.) **OTP goes over
WhatsApp only, no SMS** (decided 24 Sep 2026).

**v1 is the trainer web app alone** (decided 24 Sep 2026, `WEB_LAUNCH.md` §3).
The client portal, which was to ship in v1, moved to the next release — most of
`/me` and the client REST under it (V16–V19) are built since, and the invite +
consent screen and the paused/removed walls are what remain (§5.13). Also out
of v1: the phone app, team coaching, the workspace switcher, Google sign-in,
the GST summary page, the assessment catalogue's blood pressure and resting
heart rate, and notes shared with the client. Their code stays; hiding it is
MUST-19. With no portal, **assessments are taken by the trainer in the
session** — a write path that does not exist yet (MUST-21). **The v1 engineering
priority is making session logging extremely fast.** **Clients are adults only** (decided 25 Sep
2026): no client under 18 is accepted, so there is no guardian-consent flow —
the Terms and the *Add client* notice say 18+, and a date of birth under 18 is
refused (`WEB_LAUNCH.md` MUST-22).

`PRICING.md` beside it is the pricing proposal built on that running cost:
**flat on clients, per seat on trainers** — Free (3 clients) · **Pro ₹499/mo,
unlimited clients** · **Team ₹499 per trainer** — anchored on *one PT session a
month*. The two axes get opposite answers from one test: *does charging for this
give somebody a reason not to record what the product depends on?* **Clients:
yes** — in-person coaching caps a roster at 16–24 (the 48-session week the seed
scripts derive), so the axis has no range anyway, and a band boundary is a reason
to keep client eleven in a notebook. **Trainers: no** — V26's *a team widens
reads, never moves ownership* means a coach left off a team corrupts nothing;
the owner simply forgoes the visibility they were buying. `team.seat_limit`
already exists in `TeamService` (`defaultSeatLimit = 5`), so the meter is built
and merely unconnected to money. Four rules bind product decisions and not
merely commercial ones: **never price per client**, **never price on
collections** (both make an incomplete money book rational), **never sell
unlimited trainers** (it prices a studio below a solo trainer for the same
software), and **never gate the money book**, the wedge and the retention hook.
Settled 30 Aug 2026 on top of that: **one free non-coaching admin seat per
team** (the test is coaching, not role — a `team_member` with no clients is
free), **no volume discount to ten seats and a support conversation above ten**,
a **30-day free trial**, and **GST registration with compliant invoices from the
first paying customer** — which makes the **₹499 tag inclusive of GST** (decided; nets
₹422.88) and makes the OIDAR GST on hosting reclaimable. ₹599 inclusive is held
as headroom for a later cohort — price rises apply to new signups only. AI chat pricing is deliberately
deferred; gym pricing is out of scope until Ring 2 exists. Nothing is wired —
there is no billing in the product, and as of 30 Aug 2026 that is tracked as a
blocker rather than as a later phase: `WEB_LAUNCH.md` §5.16 (MUST-16…18) and the
runbook's §4b. The split to keep in mind is that **the 30-day trial clock blocks
the launch and the payment rail does not** — the rail is due on day 31, but a
trainer signed up against a schema with no trial start has no honest expiry ever,
and billing tables must carry **no `tenant_id`**, because a seat is a coaching
trainer and V37 lets one coach in two workspaces. The gateway is **Razorpay**
(Cashfree as the alternate), picked on UPI-Autopay maturity rather than price —
**UPI and RuPay debit are 0% MDR by regulation** and cards are ~2%, so
collection costs ₹0–10 per seat per month and the real number is mandate
success, not MDR. Integrate behind a `BillingProvider` interface (the
`AuthTokenIssuer` pattern) and through a **hosted redirect, not the gateway's
JS SDK** — an embedded `checkout.js` would put a third-party script and frame
into the CSP on the money screen and break the web's *no browser talks to
anything but Next* property.

## The contract between them

`backend/API.md` is the source of truth for the wire format — endpoints, the
authorization table, rate-limit tiers, and the error `code` catalogue the app
branches on. Change an endpoint, change that file in the same commit.

**Both sides were flattened to a baseline on 11 Sep 2026, and the law resumes
from there.** The rename to InclineYou changed the database name, the two
database roles and the phone's WatermelonDB name, so no database and no device
anywhere had a schema to carry forward — which made it the one safe moment to
collapse the history. The backend's forty-two Flyway migrations are now a single
`V1__init_schema.sql`, verified to produce a schema byte-identical to what the
forty-two produced; the app's eighteen WatermelonDB steps are now schema v1 with
an empty migrations list. Both sets of old files are in git history, and the
V-numbers quoted throughout these notes (V26, V30, V33 …) are **historical
labels for decisions, not files on disk** — they still name the argument, they
no longer name a migration you can open. **Rebuilt again on 25 Sep 2026 as a fresh v1.** The schema was redesigned table by table and approved in `release/proposed-schema.html` (41 tables); `backend/src/main/resources/db/migration/V1__init_schema.sql` now builds exactly those, and the previous baseline plus `V2`–`V22` are archived, never run, in `backend/db-archive/pre-v1-2026-09-25/`. Tables held for a later release are in `release/later-schema.html`. The local database was dropped and rebuilt from the new V1. **`V2` (28 Sep 2026) added `client_schedule_slot.program_day` and `scheduled_session.cancel_reason`; `V3`–`V6` followed (V5, 30 Sep, adds `certified_program_count_use()`; V6 the exercise trigram index and custom-name uniqueness); the next backend migration is `V7`.** The application code is being adapted to the new schema module by module, so until that is done `SCHEMA.md`, `API.md`, the seed scripts and much of the service code describe the OLD schema, `spring.jpa.hibernate.ddl-auto` is temporarily `none`, and the backend CI job is expected to fail.

**From the baseline, schema evolution is additive-only, on both sides, in
lockstep.** The backend's Flyway migrations
(`backend/src/main/resources/db/migration`) and the app's WatermelonDB
migrations (`app/src/db/migrations.ts`) follow the same law: append a new
version, never edit one that has run, never drop or repurpose a column, never
remove a response field. Trainers' phones carry data we cannot refetch, and old
builds must keep working.

**One recorded exception: `V22__drop_body_metric.sql` (24 Sep 2026).** Body
measurements are taken **only through assessments** — no loose weigh-in, no
standalone tape reading — so `body_metric` had no writer left and was dropped,
along with `body_metrics` in both sync directions,
`POST /v1/clients/{id}/body-metrics`, its `PUT` / `DELETE` correction routes and
the portal's `POST /v1/me/metrics`. It was allowed because the phone build and
sync are out of v1 scope and nothing was in production; it is **not** a
precedent. The two history reads (`GET /v1/clients/{id}/body-metrics`,
`GET /v1/me/metrics`) keep their shape and read V5's six ids out of completed
assessments through `MetricReadings`.

**Offline-first is the architecture, not a feature — on the phone.** `app/`
writes to local SQLite and reconciles through `/v1/sync/pull` + `/v1/sync/push`.
Treat REST as the online complement. Ids are client-generated UUID v4 so an
offline write has a key the server accepts as-is.

**`web app/` is the exception: it is online-only and writes straight to the
server.** Decided 23 Aug 2026. Its own design set disagrees — it was authored
offline-first and says so in `webapp-dashboard.html`, `webapp-rail.html` and
`webapp-settings.html`, which gives the sync queue a whole screen — so on the
web none of that chrome gets built: no offline banner, no sync pill, no sync
queue. `web app/web/AGENTS.md` carries the list.

Rules that touch both halves:

- The OTP resend ladder now has **three** copies — `app.otp.resend-ladder-seconds`
  in `application.yml` (the only one enforced), `RESEND_LADDER` in
  `app/src/api/auth.ts`, and `RESEND_LADDER` in
  `web app/web/lib/auth/policy.ts`. Change all three or a countdown lies. The
  same goes for the rest of `app.otp`: the server says **3 attempts, 10-minute
  lock**, and the mobile design document's "5 and 5" is wrong.
- The exercise library is **text-only**. The upstream artwork is © Gym visual and
  unlicensed for us; V22 dropped the media columns on 17 Aug 2026. Every "free"
  GIF dataset is the same artwork re-uploaded.
- **A team widens reads; it never moves ownership.** V26 added team coaching
  (`backend/agent/InclineYou_team_coaching_prd.md`). No table gained a `team_id`, no
  existing endpoint changed what it returns, and only `team` + `team_member` enter
  sync — teammates' clients are online-only REST, and no role ever sees a
  teammate's money book — except an owner-only, totals-only revenue roll-up, whose
  arrival changed the app's copy in the same commit. All three phases are built on
  both halves (drawer 6a–6l).
  The team screens are the one place in the app that writes online instead of to
  SQLite, because a permission change must never be queued — and reassignment is
  the one place a client row is *projected* per caller rather than mirrored.
- **A package has a life, and `paused` is not a status.** V30 gave the sold
  package pause / resume / extend and a `package_adjustment` log, plus a
  lifecycle sweep that runs on every read — nothing had ever moved a package off
  `active`, so a twelve-session block finished in March was still `active` in
  August. `paused_at` is a **column** so every `WHERE status = 'active'` read
  keeps counting a client who is on holiday; the one thing it gates is the
  charge, in `markDone`. Two consequences for anything touching money: read
  `amountDue > 0`, not `status = 'active'`, when you want packs with money on
  them — a client can finish twelve sessions and still owe for four — and a
  collected payment is `paid` **or** `confirmed`, because REST writes the first
  and sync has carried the second since V1. **V30 is backend + web only.** The
  three new columns are absent from `pushPackages`' upsert and nothing enters
  sync, so no phone build notices; the phone therefore does not know about pause
  and will still decrement a paused pack from its own SQLite until it adopts the
  REST routes.
- **A nudge belongs next to the thing that triggered it, and nothing sends.**
  V32 gave the message library a table (`nudge_template`, one row per trainer per
  template name, an *override* of the built-in wording) and made `nudge_log`
  readable over REST for the first time. There is no Nudges destination on either
  half: the buttons are on the rows — Today's cards, the attention queue, the
  roster, the dues list, the packs that are ending, a no-show — and the wording is
  a settings screen. Delivery is a `wa.me` deep link the trainer reviews and sends
  from their own number; the WhatsApp Business API is v2, and a platform number
  would be a worse product, not merely a later one. **The
  once-per-client-per-7-days cap is now readable by both halves and enforced by
  neither** — the queue goes quiet about somebody already contacted rather than a
  server refusing a button, because a refusal teaches the trainer to open WhatsApp
  directly and that loses the log for everybody. `COOLDOWN_DAYS` has **four**
  copies (`app/src/nudges/rules.ts`, `NudgeReadService`, `lib/nudges/cooldown.ts`,
  imported by `lib/today/deck.ts`). **V32 is backend + web only**, like V30:
  nothing enters sync, and `nudge_rule` — the phone's five *when to raise it*
  rules, which carry a message of their own — is deliberately untouched, so a
  trainer editing both has two strings until the phone adopts `nudge_template`.
- **A profile has an audience, and it is not the trainer.** V33 added
  `trainer.headline`, `trainer.bio` and `trainer.intro_video_url` — the first
  columns on that table since V8 that **nothing in the product branches on**.
  They exist for the person deciding whether to accept an invite. Three
  consequences: `intro_video_url` is stored **canonical**
  (`https://www.youtube.com/watch?v=<id>` — every share-sheet shape is reduced on
  write, and `introVideoId` rides the wire so no consumer re-implements the
  parse); `headline` (80) and `bio` (1200) are **refused over the cap, not
  truncated**, unlike every other string on `/v1/trainers/me`, because dropping
  the last sentence of somebody's prose while answering 200 is worse than saying
  no; and **there is no profile photo** — the backend has no image store of any
  kind, so it is a pass of its own and the initials avatar stands in, which the
  setup step says out loud. **V33 is backend + web only**, like V30 and V32:
  nothing enters sync, the web asks for the headline on setup step 1 and the
  other two on `/settings/profile`, and the phone's flow is untouched. The setup
  flow stayed **eight steps** deliberately — a 200-word bio inside a flow that
  promises about a minute is the surprise its pre-flight screen exists to prevent.
  **`/settings/profile` became a tab strip on 29 Aug 2026** — `lib/profile/
  tabs.ts`, one real route per section, because the brief for that screen is
  seven sections and seven headings in a scrolling column is a page whose
  seventh nobody sees. Each tab saves only its own fields, which the backend's
  *null means leave it alone* contract is exactly shaped for: a tab that PATCHes
  four keys cannot clobber a fifth it never drew. **Only its first tab is V33.**
  Tabs 2–5 — certifications, experience, specialities, languages — are the V8
  columns the setup flow already collects, so they are **not web-only**: the
  phone edits the same four over the same endpoint at drawer 2a and
  `mergeProfileIntoDraft` folds the server's copy back into the local setup
  draft, which makes them the only things on that screen a web edit puts on the
  trainer's phone. Each was **extracted from its setup step** into
  `components/profile/` (`CertificationPicker`, `ExperiencePicker`,
  `SpecialityPicker`, `LanguagePicker`) and is now rendered by both halves,
  because two copies of a picker is how one answer set ends up with two
  spellings. Both sections that were missing got their columns within the day —
  training modes and locations as V34 and social links as V35, the two bullets
  below — so the strip is **seven tabs and complete**. **The setup flow
  is unchanged in shape and still eight steps**; what changed is that Settings
  can now clear a list, which steps 3 and 5 deliberately cannot.
  Two catalogue bugs came out of it, and they are fixed on opposite sides.
  `acsm_cpt` is written by both seed scripts and was in neither catalogue, so a
  seeded profile rendered the raw id where a label belongs — **the web's
  certification catalogue is now one entry ahead of the phone's**; the id is
  unchanged and shared, so nothing diverges in the column, but the phone shows
  the raw id until the same one-line entry lands in `app/src/setup/options.ts`,
  which nobody has done. `fat_loss` and `post_natal` are the mirror image: both
  seed scripts write them and **both** catalogues correctly say `weight_loss` and
  `natal`, so there the **seeds** were fixed — adding the invented ids would have
  created a second spelling of an existing answer, which is the thing the
  catalogue mirroring exists to prevent. A database seeded before 29 Aug 2026
  still holds the old pair, and the pickers now draw any stored id they do not
  recognise rather than hiding it, so it is visible and removable instead of
  invisible and silently re-saved.
- **Where you work is not how you are paid.** V34 added `trainer.map_link`,
  `.training_modes` and `.service_areas` and made *Work & hours* the profile's
  **sixth tab** — the section `lib/profile/tabs.ts` had been saying needed a
  migration first. It deliberately does not reuse `work_mode` (V23) or
  `gym_name` (V11): those two are the money book's defaults hint — which price
  lists exist, who collects — and V23 says in bold that they must never gate a
  feature. A trainer whose `work_mode` is `gym` may still take home visits on
  Sundays, so neither answer is derivable from the other and the tab asks both.
  Modes are `gym_floor` · `home_visit` · `online` · `hybrid`, ids in JSONB with
  `custom:` like every V8 list, GIN-indexed like `languages`; `map_link` is
  stored **verbatim** — there is no `MapLink.java` beside `YouTubeLink`, because
  a maps URL has no single canonical shape and a normaliser would eventually
  break a working link, so the only check is that it is an http(s) URL at all;
  `service_areas` is free text, since no locality list would be right in two
  Indian cities. **V34 is backend + web only**, like V30, V32 and V33 — nothing
  enters sync — which is why `TRAINING_MODES` lives in `lib/profile/work.ts` and
  **not** in `lib/setup/options.ts`, the file that is a character-for-character
  copy of the phone's.
  The tab is also the one place in the profile that is not only `trainer`
  columns: **the working week came into it**, so `/settings/hours` is now a
  redirect rather than a *Soon* row. That week is rows in `working_hours`, read
  from `GET /v1/working-hours` and written through **`/v1/sync/push`** — the one
  path that has ever written that table, because `WorkingHoursService` is
  deliberately read-only and a table the phone also writes offline is not one to
  give a second write path to. It is still **one form with one Save**, which calls
  only the endpoints whose answers changed — two primaries on one screen make the
  worse failure, because pressing the wrong one leaves half the edits silently
  behind — and hence `lib/profile/actions.ts` now reads two error classes and
  reports a half-landed save by naming both halves. Two rules for
  anything touching that week: the editor keeps **one set of windows for every
  day picked**, which is lossy in the reading, so it says so when the stored week
  is one it cannot spell and **the push is only reached when that half is
  actually dirty** — a Save pressed to change the gym name must not be able to
  flatten a differing Saturday on the way past; and moving a trainer to *on my own* clears `gym_name`
  **and `gym_share_percent` with it**, which is correct and is therefore named in
  the save confirmation rather than discovered on the Money screen — *after*, not
  before, because warning about it in `.fld__e` painted the app's validation red
  over a perfectly valid answer and left a red block where a whole section had
  just correctly disappeared.
- **A client is measured on a cycle; an assessment is a questionnaire.** V5
  gave the measuring cycle three columns on `client` (`assessment_interval_days`,
  `next_assessment_on`, `assessment_metrics`) and two defaults on `trainer`.
  **As first written it also created an `assessment` table for a trainer-taken
  tape "sitting" and a `body_metric.assessment_id`; both were removed from V5
  before it ever shipped (23 Sep 2026)**, the sitting routes with them, and the
  one local database it had run on was reset. The name went to **V14**: an
  `assessment_template` a trainer builds (catalogue measurements + questions) and
  an `assessment` sent to one client, who answers it in the portal — called
  *assessment* everywhere, never *check-in*. Rules that survive: **the cadence is
  a COLUMN and not a derivation** — `/today` reads `GET /v1/clients`
  trainer-wide, so a due-check from last-reading-per-client would be one request
  per client on the screen a trainer opens every morning; **the prompt fires on
  the SESSION, not on the date**, and Today's `assessment-due` band gets **no
  nudge template**; **the six metric ids are fixed** — `weight` · `body_fat` ·
  `chest` · `waist` · `hip` · `arm` — and V14's catalogue uses the same six ids
  for the measurements it shares, because free text is how one measurement gets
  two spellings (`acsm_cpt`, `fat_loss`); and **a body is measured in an
  assessment and nowhere else** — `body_metric` was dropped in V22 (file), so a
  correction is an edit to the assessment's readings. **Nothing
  advances `next_assessment_on` automatically any more** — the removed sitting
  route did; wiring a returned V14 assessment to it is an open product call.
  V14's rules: status (`booked` · `waiting` · `missed` · `done`) is **derived,
  never stored**; readings live on the assessment row and **nowhere else** — the
  measurement history, the report's latest weight and the portal's progress all
  read them from there (`MetricReadings`); a sent assessment **outlives its template**
  (`template_id` nulled on delete); and its timestamps are **ISO strings**, the one
  deliberate exception to epoch ms. **Its catalogue includes health items** —
  Vitals (`resting_hr`, `bp`), visceral fat, a *did anything hurt* question —
  **by the product owner's recorded decision (23 Sep 2026)**, an exception to the
  no-health-data rule kept isolable in `AssessmentCatalogue` so it can be
  withdrawn in one change. V5 and V14 are backend + web only: nothing enters sync.
  There are **no progress photos** and there will not be: this backend has no
  image store of any kind (V33 said so about the profile photo) and photographs of
  a client's body are a different consent problem under the DPDP Act.
- **Where a client goes to check — and it points off this product.** V35 added
  `trainer.instagram_url` and `trainer.youtube_url` and made *Social links* the
  profile's **seventh and last tab**. Six tabs are the trainer's own account of
  themselves and none of it is checkable; this is the evidence, and a client
  looks for it on Instagram whether or not we link it — so we link it, and the
  trainer's audience stays the trainer's. **Two named columns, not a
  `social_links` list**: a generic list cannot be validated per platform and
  needs a platform catalogue to render, so a third platform is a migration and
  that is the honest price. Both are **canonicalised** (`SocialLink.java`), which
  puts them with `intro_video_url` and *not* with V34's `map_link` one tab to the
  left — a profile reduces to a handle and a video to an id, both whole facts,
  while a place reduces to nothing. A bare `@handle` is accepted because it is
  what a trainer knows by heart, and share tokens (`igsh=`, `si=`) are dropped.
  What the canonicaliser must never do is rewrite the identifying part: a YouTube
  channel keeps whichever of `/@handle`, `/channel/UC…`, `/c/…`, `/user/…` it
  arrived as, because resolving between them needs a call to YouTube and this
  write path never reaches the network. `youtube_url` is a **channel** and
  `intro_video_url` is one video — two promises, so a watch URL pasted into the
  first is refused with a sentence naming the field that wants it, as is an
  Instagram post or reel. `instagramHandle` / `youtubeHandle` ride the wire
  derived, like `introVideoId`, and are null for a `/channel/UC…` URL that has no
  handle. **V35 is backend + web only**, like V30, V32, V33 and V34 — nothing
  enters sync — so `lib/profile/social.ts` holds the web's two loose *before the
  request* checks and `lib/setup/options.ts` stays a copy of the phone's.
- **The account is not a section of the profile.** V36 added `trainer.email` and
  the routes that change a phone number and close an account — the first work on
  this product about the trainer rather than about their coaching. Three rules
  come out of it. **`email` is a contact detail and not a credential**: there is
  no mail transport in this backend, no verification token and nothing that could
  send one, so it is stored, shown back and branched on by nothing, and it is
  deliberately *not unique and not indexed* because uniqueness is a property of a
  login. **Changing a number proves BOTH numbers** — the old one because a
  seven-day bearer token would otherwise be enough to walk an account onto a
  thief's phone, the new one because a mistyped last digit is an account moved to
  a stranger with no way back — and it needed no schema at all: two codes through
  the existing `OtpService`, one transaction over `trainer.phone` and
  `app_user.phone`, and a ten-minute signed ticket rather than a row for the *you
  proved the old number* step. **Deleting is `deleted_at` on both rows and the
  number is NOT released**, because both phone columns are plain UNIQUE indexes
  rather than partial on `deleted_at` — deliberate, since the trainer's clients,
  packages and payments all still point at that row, and the confirm step says so
  before the button works. **V36 is backend + web only**, like V30 and V32–V35;
  the phone has no account screen, and a phone signed in on a number changed here
  keeps a valid token because a trainer token's subject is the trainer id.
  On the web it also **reshaped `/settings`**, which had been an index of three
  rows into other screens and is now a tab strip like `/settings/profile` — one
  route per tab, Account first. *Your profile* and *Your working week* came off
  it: the profile is what a **client** reads and Settings is what only the
  **trainer** reads, so the first is reached from the account menu and the second
  is a section of the profile's *Work & hours* tab. The strip's layout lives in a
  `(sections)` route group precisely so it does not wrap `/settings/profile`,
  which has seven tabs and a layout of its own.
- **A row belongs to a workspace, and it never moves.** V37–V42 added `tenant`,
  `tenant_member` and an **immutable** `tenant_id` on 29 tables, plus Postgres
  row-level security. The point is that `trainer_id` ("who coaches") and
  `tenant_id` ("whose books") are now **independent**: one person can coach
  privately *and* at a gym with different clients, and one human can be a client
  under two arrangements — which is two `client` rows in two workspaces.
  Consequences that reach past the backend: **`PHONE_ON_ANOTHER_ROSTER` narrowed**
  to mean "another coach *in this workspace*", so the app's copy for that error is
  now wrong on the phone; the money book is **always the active workspace alone**,
  enforced by the database, while the diary spans them all (`X-InclineYou-View`); and
  **nothing entered sync**, so no phone build notices — the same shape as V30 and
  V32–V36. A trainer in two workspaces does pull both onto one phone, mixed, until
  the app adopts the column. `backend/TENANCY.md` is the whole argument. **The backend's dev runtime now
connects as the non-owning `inclineyou_app`, so the policies are live locally**;
production is one variable behind. The database has **two identities and two
pairs of environment variables** — `APP_DB_USERNAME` / `APP_DB_PASSWORD` for
every request, `MIGRATION_DB_USERNAME` / `MIGRATION_DB_PASSWORD` for Flyway, the
seeds and the test suite, sharing one `DATABASE_URL`. `.env.example` at this
level is the checklist and is also what `docker compose` reads.
- **The web signs in with a session, the phone with a JWT.** V41 put both behind
  one interface (`AuthTokenIssuer`): the phone is offline half the time and needs
  a self-contained token, the browser is not and needs a revocable one. Send
  `X-InclineYou-Client: web` to get a session; absence means mobile, and that default is
  load-bearing for every build already in the field. Switching workspace costs the
  web an `UPDATE` and the phone a new token — `POST /v1/tenants/{id}/activate`
  returns `token: null` when the existing credential still works, and the client
  must **not** read that as a sign-out.
- Template days are **ordinal slots**. Weekdays and times are chosen per client at
  apply time into `program.schedule`; the count must match or apply 400s.
- **A gym is a visibility grant too — designed, not built.**
  `notes/InclineYou_gym_platform_prd.md` (Ring 2 of the growth roadmap) extends the team
  law one rung up: a gym never owns a client, `client.trainer_id` stays `NOT NULL`,
  and `client.gym_id` is provenance and the money wall — inside it the gym sees
  everything because it *collected* it, outside it the gym sees nothing, not even a
  count. **Two states, and today's is the majority one:** if the gym is not on
  InclineYou the trainer manages the whole arrangement themselves (`trainer.gym_name` as
  free text, `gym_share_percent`, `payment_mode`, the self-computed
  `gym_settlement`) and **none of that is being deprecated**; only when a trainer
  accepts a gym-org invite does the gym start authoring the commercial facts for
  that gym's clients. What crosses over is *authorship*, not ownership — the
  coaching half never changes hands. So `gym_id IS NULL` means **trainer-managed**,
  not "independent": it covers clients at gyms that never signed up. Two things a change made today must respect: **`app_user.role` stops being
  the authority** (that PRD's first migration re-reads it as the *home* role and
  moves authority to a new `user_role` table, reversing the "one phone = one role"
  decision of V18 — it is written up as V28, and since the forty-two migrations
  were flattened into one baseline its numbers are a **dependency order, not
  file names**: the next free number is `V7`, and `IDENTITY.md`'s plan wants the
  same range, so whichever lands first takes it and the other gets renumbered),
  and
  **a gym-sent reminder has to be a `nudge_log` row**, because the
  once-per-client-per-7-days cap is computed on the phone from that table
  (`app/src/nudges/rules.ts`). Nothing gym-owned will enter sync; the admin console
  is a web app.

## Local development

```bash
docker compose up -d                      # Postgres + Redis for the backend
cd backend && ./mvnw spring-boot:run      # API on :8080
cd app && npm start                       # Expo dev server (needs a dev client)
```

`docker-compose.yml` runs Redis with `--appendonly yes` deliberately: the OTP
wrong-attempt lock and daily send ceiling are abuse controls, and a Redis without
AOF turns "three attempts" into "three attempts per deploy". Don't drop the flag.

## CI

`.github/workflows/ci.yml`, two jobs, both must pass:

- **backend** — `./mvnw -B verify` against a Postgres service container.
  Note there is **no Redis in CI**, so the suite runs on the Postgres OTP store
  and in-process rate-limit buckets. Anything that only works with Redis present
  will pass locally and fail — or silently skip — here.
- **app** — `npm ci` then `npm run typecheck`. There is no test suite and no
  linter on the app side; typecheck is the whole gate.

## Product docs — three copies, kept identical

The nine source-of-truth docs (requirements and plan, core data model,
interaction map, developer getting-started, manual test plan, growth roadmap,
deployment runbook, AI feature spec, gym platform PRD) exist in **three
places**, and as of
20 Aug 2026 all three are byte-identical:

- `notes/` — the tracked copy, and the only one under version control
- `backend/agent/` and `app/agent/` — untracked working copies

**Edit one, copy to the other two, and make sure `notes/` is among them** — it is
the only copy git protects. The drift that existed before (`InclineYou_core_data_model.md`
was a version behind in `notes/`, missing the V24/V25 notes on `program.schedule`,
`duration_seconds`, and ordinal day slots) is resolved; keep it that way.

Each location also carries extras the others lack:

- `notes/` only — `core_data_model_erd.html`, `interaction-map/gen_flow.py` (the
  script that renders the flow diagrams), `PushMore_waitlist_copy.html`
- `notes/design system/` and `app/agent/design system/` — `inclineyoudesignsystem.html`,
  the source of truth for `app/src/design/tokens.ts`, plus the 11 screen designs
  the interaction map's frame numbers refer to. Now tracked via `notes/`.

## Stray paths

`out/` is IntelliJ compile output, now gitignored — it had committed a stale
`application.yml` and a duplicate `V1__init_schema.sql`. Nothing builds from it;
don't edit it and don't mistake that migration for the real one in
`backend/src/main/resources/db/migration/`. `system/screens/` is empty and untracked.

<!--
ARCHIVE — the full pass-by-pass build log of the web app, 23 Aug – 12 Sep 2026.

This is the unabridged text that AGENTS.md held until 12 Sep 2026, when it was
condensed. AGENTS.md is loaded into every session by CLAUDE.md, so it now carries
only the rules; this file carries the arguments, the measurements and the defect
tables behind them. Nothing here was deleted, only moved.

Read this when you need the WHY behind a rule in AGENTS.md, or when a section of it
reads as arbitrary. Grep it by screen name or by CSS class.
-->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# InclineYou — web app

## READ THIS FIRST — where this tree came from · 12 Sep 2026

**This file, and every screen it describes, was ported wholesale from the
mock-UI repo (`InclineYou-MockUI/mock-ui/web`) on 12 Sep 2026 and re-pointed at
the real Spring backend.** Three things follow, and they are the difference
between this tree and the one this document was written in:

1. **There is no mock, and there must not be one.** The mock UI served the whole
   `/v1` surface to itself from `app/v1/[...path]/route.ts` over a `mock/`
   directory, with `INCLINEYOU_API_URL` pointed at its own port. Neither the
   route nor the directory was copied. `.env.local` points at Spring on `:8080`,
   which is what every `lib/*/api.ts` has always read. **No product file ever
   imported `@/mock`** — that is why the port was a copy rather than a rewrite,
   and it is a property worth keeping.

2. **Comments throughout still point at `mock/portal.ts`, `mock/types.ts`,
   `mock/router.ts` and `mock/seed.ts`.** Those files are real and they are in
   the sibling mock-UI repo. They are the reference implementation of endpoints
   the backend does not have yet, and they are the best statement of what each
   one must answer and why. Deliberately not copied here: a mock that answers
   alongside the real backend is a mock somebody eventually ships.

3. **Seven things this document describes as working do not work**, because the
   backend has no route for them. `BACKEND_GAPS.md` is the list and it is the
   input for the next backend pass. The largest by a distance is **the entire
   client portal** — thirty endpoints under `/v1/me`, against a backend whose
   whole client-facing API is the offline phone's sync envelope. Then: the
   trainer's notification feed, certified programs, writing off a payment,
   `GET /v1/exercises/{id}`, `PUT /v1/programs/{id}/exercises`, and two exercise
   columns. One of them — `client.metadata.health` — is **not a gap to close but
   a decision to take**: four documents forbid health fields, and that entry
   says why this case may be different and why nobody should write the migration
   on the strength of the gaps file alone.

**Verified on the real stack**, not asserted: `/today`, `/clients`, `/schedule`,
`/programs`, `/programs/exercises`, `/business`, `/sessions`, `/settings`,
`/settings/profile`, `/team` and the client file's tabs all render 200 with real
Postgres rows behind a real JWT. `npx tsc --noEmit`, `npx next build` and
`npx eslint .` are clean (0 errors).

---

The desktop half. Trainer web app today; the **gym admin console and the client
portal ship in this same project**, which is why this is Next rather than a
static bundle.

Its design set is `../Design/webapp/webapp/` — one HTML file per screen, each
one an argument as well as a picture. Read the file for the screen you are
building; the `<p class="unit__note">` under every frame says why the markup is
what it is, and those reasons are load-bearing.

## THE RULE THAT REVERSES A DOC

**The web app is ONLINE-ONLY. Everything writes straight to the server.**

The root `CLAUDE.md` says "offline-first is the architecture, not a feature" —
that is true of `app/` and **false here**. The design set is worse: it was
authored offline-first and says so all over
(`webapp-dashboard.html` "writes to this browser first", "6 entries held on this
browser"; `webapp-rail.html` "this is an offline-first product";
`webapp-settings.html` gives the sync queue a *full screen*). Decided 23 Aug
2026. So on web, **do not build**: the dashboard's offline banner, the top-bar
sync pill, the Settings sync-queue screen, or `webapp-c-status.html`'s offline
states. In `webapp-auth.html` frame 1a the line "Everything after it works
offline" is dropped for the same reason.

## The two stylesheets

`app/styles/webapp.css` is the design system, **copied verbatim** from
`../Design/webapp/webapp/assets/webapp.css` and never edited — its values are
the same tokens as `app/src/design/tokens.ts` on the mobile side, and a value
edited here drifts from the phone. Only the review-page chrome was dropped
(§02's `.doc__*`/`.unit`/`.viewport`/`.bench`, §05, §22, §23); section numbering
is preserved so it still lines up with the original.

`app/styles/app.css` holds every delta, each with the reason in a comment. To
change a colour, radius or spacing step: re-copy webapp.css from the design
folder. To change how the app uses one: edit app.css.

Two traps the setup screens hit, both now noted in app.css: `.affix` is a
**prefix only** (`.affix .ctl` hard-codes `0 r2 r2 0`, so there is no suffix
variant — put the unit in the label), and `app.css`'s own affix delta pins the
prefix to sign-in's 44px field, so it does not fit a 34px one.

The one rule the stylesheet opens with, because it has caused four real bugs:
**`#C6F24E` is a FILL, never a stroke and never text on a light ground.** On
light it steps to `--tx-accent-text` (`#4F6B0A`).

## Talking to the backend

The browser NEVER reaches Spring. `lib/auth/api.ts` is `server-only` and calls
`INCLINEYOU_API_URL` from the Next server; screens reach it through server actions.
Two consequences worth keeping:

- **The backend has no CORS configuration and needs none.** Do not add a
  `NEXT_PUBLIC_` API URL and fetch from a client component — that breaks the
  moment it leaves localhost, and the fix would be a backend change.
- **The JWT is in an httpOnly cookie and is absent from browser JS.** It is a
  7-day token (`app.jwt.expiry-minutes: 10080`). Never return it to the client;
  `VerifyResult` deliberately carries a destination instead of a token.

`backend/API.md` is the wire contract. Both 429s on `/v1/auth/**` mean opposite
things — branch on the `code` field, never the status. See `lib/auth/api.ts`.

## Policy numbers

`lib/auth/policy.ts` mirrors `app.otp` in the backend's `application.yml`, which
is the only copy that is enforced. `app/src/api/auth.ts` is the third copy.
Change one, change all three. Note the mobile *design document* says 5 attempts
and a 5-minute lock; the server says **3 and 10**, and the server wins.

## Built so far

`/sign-in` and `/sign-in/verify` (frames 1a, 1b, 1c) — all four OTP refusals,
the resend ladder, and §06's second paths.

**`/sign-in/new`** (frame 3a) — *we don't know this number yet*. The likeliest
first launch in the product: trainers create clients, so the most probable first
experience is a client typing their number before their trainer has added them.
Two exits, and **this is where a trainer account is created — not at sign-in**.
Verifying used to mint one for any number that passed, which handed a coaching
workspace to every client who tried the app first; `claimTrainer` in
`lib/auth/actions.ts` is called from this screen and nowhere else. The second exit
is a modal that says the true thing — their trainer adds them, nothing here can —
and names the number to send.

Three things about it that are web-only:

- **The pending token is in the cookie, and the phone's is deliberately not.**
  The phone keeps it in navigation params because "a stored token is what the app
  reads as signed in, and nobody is signed in until they have chosen which of the
  two things on 7a they are." The web has no navigation params and a cookie is the
  only thing that survives the redirect *and a reload of the URL*. So it is
  stored — and two things follow.
- **`lib/auth/claims.ts` reads the cookie's own role and phone**, without
  verifying the signature and without granting anything: it picks a screen and
  prints a number back. Every permission is still the server's — a pending token
  cannot read `/v1/trainers/me` however this file describes it. The alternative
  was a request, and the only call a pending token can make is the one with the
  side effect.
- **`/` forks on the role now, not on whether a token exists.** It was
  `token ? '/today' : '/sign-in'`, which sent a client who reloaded frame 3a to
  `/today`, where all eight deck requests 401 — losing the screen and the code
  they spent to reach it. And *Use a different number* **clears the token**, which
  the phone does not have to do, for the same reason.

**`/sign-in/role`** (frame 2a) — *whose book to open*. One person sees it: a
client training with more than one trainer. Everybody else resolves silently,
which is why `verifyCode` writes the roster cookie itself for the single-roster
case rather than routing here.

**The design's frame 2a is stale and this screen deliberately does not build it.**
It draws *Trainer · Anbu R* against *Client · with Meera K* — a choice between the
two halves of the product. `RoleScreen.tsx` on the phone carries the decision:
trainer↔client duality is allowed again (23 Aug 2026) but "does NOT come back
through this screen … a trainer's own account is not ambiguous — it is simply the
default, with the other mode one tap away." Two consequences for the copy:

- the design's trust line ("your own sessions never appear in a client's report")
  is about trainer/client separation and is the wrong promise. What a multi-roster
  client needs is that their two trainers cannot see each other's rosters.
- the design's greeting **cannot be built as written**. It reasons "by now the
  server has answered with `trainerName`" — true of a trainer's sign-in, and
  `clientView` returns `trainerName: null`. What is available is `clientName`, per
  roster, and on real data the two rosters disagreed ("Hariharan" vs "Hari H") —
  so the greeting uses it only when every roster agrees and falls back to a plain
  *Welcome back*.

### The trigger is currently unreachable, and that is worth knowing

`ClientPhoneGuard` rule 2 refuses a number already on another trainer's roster —
`invited`, `accepted` and `paused` all block — with a stated reason: "a second
trainer claiming the same number splits that person's pack, their history and
their weekly report across two books that will never agree." So **a client with
two live memberships cannot be created through the API today.** The screen is
reachable for rows written before that guard, for an import, and for whenever the
rule relaxes; `destinationFor`'s branch and the phone's own `RoleScreen` are both
already written for it, which is why it is built rather than deferred. It was
verified against a hand-made two-roster fixture.

### Where the chosen roster lives

`inclineyou_client`, a 7-day httpOnly cookie (`lib/auth/session.ts`). A client token's
subject is the PHONE, not a client id — `JwtService` says why — so the token cannot
say which roster is open, and `/v1/client/sync/pull` takes `clientId` as a
parameter for the same reason. It is not a permission: the sync controller
re-checks it against the token's phone on every request.

`/me/today` must work without it (a cleared cookie, a second browser, a link from
a message), so **resolving an unambiguous roster is the portal's job, not this
screen's** — this page redirects and writes nothing.

### Two bugs this screen produced, both the same shape

`cookies()` cannot be written during a render — only in a Server Action or Route
Handler. `loadRosters` called `setToken` and the page called `setActiveClient`, so
one silently redirected and the other 500d. The token write turned out to be
unnecessary (the minted client token has the same scope as the one in the cookie,
so it is discarded), and the roster write belonged to the portal.

The first was invisible because `loadRosters` caught *everything* and returned
"the server said no". `isApiFailure` in `lib/auth/api.ts` now draws the line, and
anything that is not a refusal or an unreachable server is rethrown — the same
lesson as `/today`'s error path, which is why it is a shared predicate.

**`/sign-in/unattached`** (§08 · 7e) — *nobody is coaching you right now*.
Reached by declining the only invite, acknowledging the only removal, or signing
in later with every membership already answered. Its whole job is not to read as a
failure: nothing went wrong, and the fix is on somebody else's phone.

**No "I'm a trainer" button, and the reason changed.** §08 gives two — the door
"would either fail at the server, or quietly convert somebody who declined one
invite into a trainer with an empty roster." The first half is **no longer true**:
`claimTrainer` was widened for duality and its comment is explicit that "a phone
that is already somebody's client can claim a trainer account too … the existing
`app_user` row is updated to `role = 'trainer'` rather than refused." So the server
would take it, and the second reason is now the only thing standing between a
declined invite and an accidental coaching account. Worth knowing before anybody
adds the button back.

### The guard is a cookie, and it has to be

`clientView` mints `generateInvited(phone)` for a real invite, an unacknowledged
removal **and** a fully unattached number. Three destinations, one `role` claim —
so unlike `/sign-in/new` and `/sign-in/role`, this screen cannot verify itself from
the token, and guessing is actively harmful: telling somebody who has an invite
waiting that nobody is coaching them is how they give up instead of accepting.

So `verifyCode` records which wall it sent them to in `inclineyou_wall` (30 minutes,
httpOnly — a fact about a sitting, same argument as `lib/setup/skipped.ts`), and
the wall pages read it back. No cookie means a stale bookmark, and the answer there
is a fresh sign-in: one code for a screen that is certainly true beats no code for
one that is probably true. `WallKind` in `types.ts` carries the reasoning; the
value is derived from `roleOf(session)` rather than from the route string, so it is
a narrowing the compiler checks rather than a lookup that can miss.

`/sign-in/paused`, `/sign-in/removed` and `/invite/[clientId]` are still
`NotBuilt` — and the first two will reuse `inclineyou_wall`, which is why it is a
`WallKind` and not a boolean.

**One pre-existing gap this uncovered:** `destinationFor` routes the legacy
`paused` role to `/sign-in/paused`, but `verifyCode` bails with `unknown` first
because that response carries **no token** (`if (!next || !session.token)`). So
that screen is currently unreachable from a verify. It only matters during a
rolling deploy of a pre-fix backend, which is why it is recorded rather than fixed
here.

**Trainer onboarding** — `/setup` (4a and 4b) and the eight steps `/setup/name`
… `/setup/payment` (5a–5e drawn, the other three built from the phone's
screens), then `/setup/done` (6a). `lib/setup/` holds the model: `steps.ts` is
the web's `app/src/setup/draft.ts`, `options.ts` and `meter.ts` are copies of the
phone's files of the same names, and `api.ts` is the only place that talks to the
authenticated backend.

**Today** — `/today` (`webapp-dashboard.html` frames 1a–1d and 2a). Four *states*
of one route rather than four screens, chosen by the deck and not by the URL: a
session running, a session started and never opened, the day closed, and no
clients at all. `lib/today/` holds the model — `deck.ts` **was** a port of the
phone's `app/src/home/deck.ts` and is now deliberately ahead of it, `time.ts` and
`mode.ts` are copies of its files of the same names, `day.ts` is the web-only
geometry (the hole between shifts, the sellable gaps and the day's money), and
`api.ts` is the only place that talks to the backend.

**Restructured 27 Aug 2026 into three blocks** — *Next up*, *Needs you today*,
*Today at a glance* — which unmounted the ribbon and the two `.kv` cards, added
five bands and re-ranked the ladder against the phone's. **Read *Today,
restructured* below before changing this screen**; it supersedes a good deal of the
four Today sections above it.

Frame 3a — offline, with a sync queue in the hero slot — is **not built**, per the
rule above. So is the top bar's sync pill.

**Sign out** — `webapp-rail.html` frame 2b, the rail's foot menu
(`components/shell/AccountMenu.tsx`). The account button was drawn `disabled`
until now, so the only way out of a session was clearing cookies.

There is **no server call and nothing to call**: the JWT is a self-contained
7-day token with no session behind it and no revocation list, so
`signOut` in `lib/auth/actions.ts` clears the cookie jar and redirects. It clears
*all five* — `inclineyou_token`, `inclineyou_client`, `inclineyou_wall`, `inclineyou_pending_phone` and
`inclineyou_setup_skipped` — because the next person on a shared gym desktop may be a
different trainer, and a 24-hour `inclineyou_setup_skipped` left behind makes *their*
onboarding skip steps they never saw.

**The ellipsis is kept, and it now means something else.** §2b explains *Sign
out…* as leading "to a screen that lists what is still queued"; the phone builds
exactly that (`SignOutScreen.tsx`) because sign-out there wipes the local
database. Online-only means there is no queue and no such screen — but signing
out is still not free, because **getting back in costs an SMS code** against a
ceiling of ten a day. So the ellipsis leads to a confirm step that names *that*
cost instead. The confirm replaces the menu's contents in the same box rather
than opening a second surface, for §2a's reason (248px cannot hold one, and it
would cover the account it is asking about); the header stays in both views.

**Two of §2b's four rows are not built.** Profile and Help have no route at all,
and "nineteen live buttons pointing at a screen that did not exist" is the defect
this file already names — they arrive with their screens. Settings is built, on
the usual `NotBuilt` placeholder, and it is the row that could least afford to
wait: §2b moved Settings *off* the rail to free a row, so this menu is its only
entry point. Its `,` accelerator is **not** drawn, because nothing binds it.

The arrow keys are implemented rather than assumed: the design emits
`role="menu"`, which takes the rows out of the tab sequence, so a menu without
them would announce two items and offer one. The confirm view is deliberately not
a menu.

One field was threaded through for it — `phone` on `TrainerWire` in
`lib/today/api.ts`. It was already on `TrainerResponse`; the header prints it so a
trainer with two accounts can see which one they are about to leave.

**Schedule** — `/schedule` (`webapp-schedule.html` frames 1a–6a). The week, the
day and the month as three *views* of one route, the booking form, the session
panel, and a move with its ten seconds. See *The schedule* below.

**Packages · V30 · a package now has a life.** `paused_at` is a **column, not a
status**, so every `WHERE status = 'active'` read on this half keeps counting a
client who is on holiday; the one thing it gates is the charge, server-side in
`markDone`. Two rules for anything here that touches money: ask **`amountDue > 0`,
never `status === 'active'`**, when you want packs with money on them — a
lifecycle sweep now closes a pack the moment its sessions run out, and a client
can finish twelve sessions and still owe for four (`RecordPanel` is the caller
that had to change) — and a **collected payment is `paid` OR `confirmed`**,
because REST writes the first and the sync envelope has carried the second since
V1. `PaymentsTab`, `OverviewTab` and `Header` each read only `'confirmed'` and so
showed every paid-up client as owing the full amount; they read the server's
figure now. Assigning and renewing live on the **client's file**
(`components/clients/file/PackPanel.tsx`, `PackLife.tsx`); recording money stays
in the money book. Paused packs raise no attention row in `deck.ts` or
`roster.ts` — the end date is frozen and today is not, so the row would get
louder every morning about an expiry that has stopped running.

**Packages** — `/packages`, the **price list**. No frame owes it: the design set
draws packages as a tab of `webapp-money.html`, and this half gave them a route,
which is what the phone does too (§ 06 · 4b is a screen there, not a tab). See
*The price list, and the one letter that is the whole screen* below.

**The workout console** — `/sessions/new`, `/sessions/:id/log`,
`/sessions/:id/bests`, `/sessions/:id/finish`, `/clients/:id/exercises/:exerciseId`
(with `?edit=`) and `/clients/:id/progress` (`webapp-workout.html`, fifteen
frames). `lib/log/` holds the model: `log.ts` is a port of the phone's
`app/src/log/log.ts` — `judge`, `previousFor`, `topSet`, `volumeOf` and
`walkForward` branch for branch — `api.ts` is the only place that talks to the
backend, and `actions.ts` is every write. See *The console* below.

Frame 6a — the basement, the offline banner, the six-row waiting card and the
amber ring on a set this machine wrote — is **not built**, per the rule above.
`.sets tr.queued` is unused on this half and should stay unused.

**The client portal** — `/me/today`, `/me/progress`, `/me/plan`, `/me/account`
and the workout flow at `/me/workout/:id`, against
`InclineYou-Client-Portal-Spec.md` and `webapp-client-portal.html`. The OTHER
HALF of the product, in this project, which is what the paragraph at the top of
this file has always promised. `lib/portal/` holds the model and `mock/portal.ts`
is every route under `/v1/me/*`. **Sign in as `9840137911` to see it.** See *The
client portal* at the end of this file before changing anything there; it carries
the four rules the spec is insistent about and the twelve defects rendering found.

Every other route under `app/` is a `NotBuilt` placeholder naming the frame that
owes it. `/clients/new` was the first, so frame 6a's primary button lands
somewhere rather than 404ing; the Today pass added the rail's other nine
destinations plus `/settings/hours`, `/clients/[clientId]` and `/sessions/[id]`,
for the same reason and one more: nineteen live buttons pointing at a screen that
did not exist is the defect the schedule design's §08 is *named* after, and the
rail draws ten of them on every screen.

## Today, and the four things it needed that were not on the wire

**The deck needs eight row sets. REST had trainer-wide routes for four.** The
phone builds all eight out of SQLite, so nothing had ever asked the server for
them across a whole roster. `clients`, `sessions` (windowed), `programs` and
`workouts` were fine; the other four were each load-bearing for a whole module,
and all four are now additive reads documented in `backend/API.md`:

| Missing | Was | Now |
| --- | --- | --- |
| `packages` | per-client only — 22 requests for one dashboard, against a 120/min ceiling | `GET /v1/packages` |
| `payments` | per-**package** only, so a month cost one request per package | `GET /v1/payments?from&to&status` |
| the gym's cut | not on `PaymentResponse` at all, so `yours = billed − cut` was uncomputable at any number of requests | `gymShareAmount`, appended last |
| `working_hours` | sync envelope only | `GET /v1/working-hours`, read-only |
| a log's close | not on `WorkoutSessionResponse`, so every log read as permanently open | `endedAt`, appended last |
| a pack's balance | derived per-caller, and three components derived it **wrong** | `amountPaid` / `amountDue` on `PackageResponse`, computed in SQL |
| a pack's life | no `PUT`/`PATCH` at all — a pack could not be paused, extended or renewed | `POST /v1/packages/{id}/renew` · `pause` · `resume` · `extend`, `GET .../adjustments` (V30) |
| selling a pack | `POST /v1/clients/{id}/packages` existed and **the web never called it** — every *Sell a pack* path looped back to a panel that only records payments | the same route, now with `packId`, from `PackPanel` on the client file |

The last one is the one to remember. `buildRunning` decides *in session* by
finding a scheduled session whose workout log has not ended. Without `endedAt`
the hero said **In session** for a session logged four days earlier, and the
*started, nothing logged* state could never fire — the two states this screen is
most often in. It was found by rendering the screen against real data, not by
reading the DTO.

**And the pull is not the answer here.** `/v1/sync/pull?lastPulledAt=0` returns
exactly `DeckInput` in one call, and it also returns the 1,324-row exercise
library and every set log ever recorded. `lib/setup/api.ts` reaches for it and
says why it is allowed to — setup is only reachable while the account is nearly
empty — and its comment names this screen as the thing that must not. `/today`
makes nine scoped requests instead (eight until V28's dismissals joined them),
plus one for the live session's set logs when there is a live session.

Two of the nine are deliberately unwindowed and the reasons are not symmetric.
`GET /v1/workouts` fetches the whole history because *gone quiet* needs the last
workout **per client at any age** — the copy states the number, and bounding the
window would make a client quiet for longer than the window vanish from the queue
entirely, which is the client who most needs chasing. `GET /v1/payments` is
unwindowed because a July invoice is still owed today, and a payment row is one
per invoice — hundreds for a full book, against thousands of set logs.
**`GET /v1/sessions` widened** from Monday-of-this-week to thirty days back on
27 Aug 2026: two of the restructured queue's bands ask about the past, and on a
Monday the old window did not even contain yesterday.

## Today on a phone, and the shell that had to move with it

The second flow on this half to be made responsive, and the first that had to
take the **shell** with it. Setup could be widened field by field because `.stp`
is its own layout; `/today` sits inside `.app`, and `.app` is a grid of
`248px + 1fr` with **no media query anywhere in webapp.css** — every frame in the
design set is drawn at a fixed 1440×900, and the shell inherited that literally.
On a 390px screen the rail took 248 of the 390 and left 142px for the whole day.
Not a degraded screen: an unusable one.

Four widths, each arithmetic rather than a round number, all in `app.css` under
*TODAY, AND THE SHELL, ON A PHONE* and *THE SHELL UNDER 900px*:

| Width | What changes | Why that number |
| --- | --- | --- |
| 1240 | the third row goes 3 → 2 columns | 1.5:1:1 beside a 248px rail puts the queue at 280px — narrower than the phone it was widened *for* |
| 1080 | the hero pair stacks | two columns are under 540px each, and `.hro__w` is a *sentence* |
| 900 | the rail becomes a bar; `.omni` becomes an icon | 248px of navigation stops being affordable |
| 620 | the queue's table reflows to two rows | measured off the longest real row: ~552px before anything is tight |

**The rail becomes a bottom bar, not a drawer** (`TabBar.tsx`). Ten destinations
do not fit, and there were three ways to lose some: a hamburger, a 64px icon
column, or keep four visible and put six one tap away. The first re-creates the
phone's drawer, which the heuristic audit calls "the single largest recognition
win in the port" for having been deleted. The third is what shipped, and the four
that stay are not a fresh choice — `nav.tsx` takes them from `PRIMARY`, which is
the phone's own tab bar in the phone's own order. Behind *More* is a bottom sheet
holding BUILD, GROW, today's pins **and the account**, because the rail's foot is
inside the half that is hidden and sign-out was already the one thing the shell
could not do.

**Both surfaces are always rendered and CSS picks one**, which is `Rail.tsx`'s
call in the setup flow for its reason: a component that branches on a measured
width renders the wrong half for one frame after every resize and cannot be
server-rendered at all. So the ten destinations moved out of `Rail.tsx` into
`nav.tsx` — two copies of a destination list is how a screen ends up reachable
from one surface and not the other. `counts` moved out of the rail's props onto
`Today.tsx` for the same reason.

**Nothing in `.app` becomes `position:fixed`.** It keeps its grid: `100dvh`,
`overflow:hidden`, and a scrolling `.body` between a top bar and a tab bar that
do not move. No `padding-bottom` to remember and no scroll jank — and `100dvh`
was already right for a retracting URL bar.

### Seven bugs the pass found, five of them live at 1440px

| Where | What |
| --- | --- |
| `.omni`'s label | **Live at every width the bar has ever been drawn at.** §03 gives it `width:320px` / `height:34px` and puts ~309px of icon, sentence and ⌘K cap into a 298px content box, so "Search clients, sessions, exercises…" wrapped to a second line **out of the bottom of the pill**. It survived because the design file draws the label as a span of the right length, and a two-line overflow in a dark pill on a dark bar reads as a shadow. |
| `Elapsed` in `Clock.tsx` | The running hero's figure was `${mins}:00` — the phone's `mm:ss` shape without the phone's seconds. The `:00` was frozen punctuation dressed as precision (`TICK_MS` is 30s), and worse, the same slot draws `formatMinute` in the *next* state: **12:00** meaning twelve minutes sat where **17:00** means five in the afternoon. Same slot, same font, opposite units. It is a count now, and the unit says so. |
| the ribbon's first ruler tick | "06:00" read as **36:00**. A tick is `left:<minute>` + `translateX(-50%)`, so the first one straddles the ribbon's origin — and content overflowing the **inline-start** edge of a scroll container is *unreachable* overflow: clipped, with no scroll position that brings it back. Widening the padding changed nothing, because `.dr__ax`'s own left edge *is* the scroll origin. The leading label ranges from the origin instead. |
| `.kv__v` in the month card | *The gym's share* against *−₹49,000* wrapped the **value** at 320px: a bare `−` on one line and `₹49,000` on the next. A minus sign alone is not a minus sign. The key is the half that wraps now; a figure is one token. |
| `.pal__i` | §03 fixes the row at `height:38px`, right for one-line labels on a desk. On a phone "Remind Rajalakshmi Venkataraman" is two lines and its hint is two more, in a row that cannot grow — the text overran its own row into the next. A minimum, and the hint drops under the label. |
| the rail's accelerators | `GROW` printed **`R` twice** — Reports and Nudges. Nothing binds these yet (the same reason §2b's `,` on Settings is not drawn), but a key hint is a promise in print, and two rows claiming one letter is a promise that cannot be kept. `N` in `nav.tsx`. Found by moving the three lists into one file, which is the argument for having done so. |
| the whole page's headings | There were none. The date was a `<p>`, every `card__t` a `<span>`, every hero kicker a `<span>` — so a reader's heading list for a screen with six modules came back **empty**, and the only way through was to walk every element. `<h1>` on the date, `<h2>` on each card. And no skip link: eighteen tabs from the top of the document to the day's first control, on every visit. |

Two more that were mine, both found in a screenshot and worth the shape:
`.tabs__i` had no `position`, so the selected tab's 2px mark resolved against
`.app` and painted a lime bar **at the top centre of the page** with no tab
marked; and `.sheet__i > span:first-of-type` meant "the label" until a *pin* row
put a 24px avatar first, which then took `flex:1` and stretched into a lozenge.

### Three things it deliberately does not do

- **The bar does not hide on scroll.** It buys back 56px and costs the trainer
  the ability to point at where they are going. On a screen whose job is triage,
  the queue is what scrolls and the destinations are what stay.
- **The queue does not get a horizontal scroller.** WCAG 1.4.10 would allow one —
  it exempts content needing a two-dimensional layout — and it is wrong here for
  a reason the reflow rule does not cover: the column a trainer would have to
  scroll to reach is the one holding every action on the screen they came to
  clear. It reflows to two rows instead, one `<table>`, so §22's
  `.tbl tbody tr.crit` and `tr.held` keep working. The cost is stated in the
  component: `display:grid` on a `<tr>` drops the table role, which costs nothing
  because the table has no `<thead>` — there are no column names to lose.
- **The reading order does not change.** The rows stack, but what is happening →
  the shape of the day → who needs a decision → money is `deck.ts`'s order at
  every width. A desk says "money is fourth" with the third column of the third
  row; a phone says it by being fourth down the page.

**Superseded in part.** The stacking described above is still what happens to the
shell, the hero and the queue, but the phone no longer draws the desk's ribbon or
its two `.kv` cards — see *Today on a phone, second pass* below, which replaces
them with the app's own modules and adds the bar's centre +.

`.dr__hint` now has a `--today` variant: the setup flow's trigger is 1400px
because `.stp` gives the band a 332px sibling, and here the column is
`W − 248 − 48 − 34`. Both are generous on purpose, and the sentence is phrased to
hold at the margin — the span is the trainer's own working day, so no single
breakpoint is right for both a 17:00 finish and a 20:30 one.

**Checked by rendering, not by reading.** `/today` needs a JWT and seven backend
calls, so the pass built a throwaway fixture route and screenshotted the real
components at 320, 390, 768, 1024, 1200 and 1440 — plus the sheet and the palette
forced open. Every bug in the table above except the first was found that way, and
the first was found in a screenshot too. The harness is deleted; if this screen is
touched again, rebuild one.

## Today on a large display, and the one number that was literal

The pass above took `/today` down to 320px. This one takes it up, and it reverses
a sentence `DayRibbon.tsx` used to argue for.

The ribbon printed `width:<span>px` on its track — one minute, one pixel,
literally — and its docstring called the consequence a feature: *"at a wider
window it does not stretch, it stays true and the column gets emptier."* True at
1440×900, which is the only size every frame in the design set is drawn at.
06:00–21:00 is 900 minutes and therefore 900px, and it fits. On a 1920px monitor
the same 900px band sits in a ~1,600px card and **a third of the widest module on
the screen is blank**; on a 2560px one it is more than half. A trainer who bought
a big monitor sees a component that looks like it failed to load.

So the offsets are **percentages of the span** now, and the track is `width:100%`
with `min-width:<span>px` (`.dr--fluid` / `.dr__ax--fluid` in app.css). Three
things about that are the point:

- **The scale is still exact.** A 60-minute session is twice a 30-minute one at
  every width, and a block still starts precisely above its own gridline, because
  both are the same fraction of the same span. What stopped being fixed is the
  *constant*, not the proportionality — and the proportionality is what the
  ribbon promises. `day.ts` is untouched: it still computes in minutes, and only
  the unit they are printed in changed.
- **`min-width` keeps the old width as a FLOOR.** The ribbon can never compress.
  Below the width where a minute is a pixel it scrolls exactly as it did, so the
  24px avatar still fits the 30-minute session that sets the floor, `.dr__wrap`'s
  fade pair fires on the same condition at the same width, and nothing measured
  at 390px is now tighter than it was tested at.
- **`components/setup/DayRibbon.tsx` is deliberately NOT changed.** That is why
  this is a modifier class and not a change to `.dr`: `.stp` gives the band a
  332px sibling and has no spare width to hand it, so stretching there would buy
  a divergence and nothing else.

One copy change went with it. The hint read *"Drawn to scale — one pixel a
minute"*, which is a claim about a constant that is no longer one — and it shows
under 1200px, where a short working day can already be stretched. It states the
proportion instead: *every block as wide as it is long*, which is true at any
scale.

**And `--dr-h` steps up with the width.** §22's 52px is right for a band that is
one of six modules competing for 900px of height; at 1600px the ribbon is also
~700px longer, and a 52px band across a very wide card is the same failure in the
other axis. 62px at 1600, 72px at 2000, and it stops there: the blocks are
`top:5px;bottom:5px` around a 24px avatar, so 72 is the point past which the
avatar stops being centred in a band and starts floating in a box. Scoped to
`.dr--fluid`, so setup's ribbon keeps §22's number at every width.

**Both ends of the ruler read the same way now.** The `06:00`/`36:00` fix in the
table above ranged the LEADING label from the origin and left the trailing one
straddling its gridline — which, on a day that ends on the hour, is the ribbon's
right edge, so half of `20:00` sat outside the track in `.dr__wrap`'s 16px of
padding, 1px narrower than the overhang. It was survivable where the leading one
was not, because overflow past the inline-END edge is scrollable rather than
clipped; it just read as a label half off the end of the thing it measures, and
on a wide display it is the last thing on the widest card. It ranges inward now,
with 4px of padding so the digits stop short of the edge rather than against it.

`.dr__t--last` is a class in the markup and not `:last-of-type`, and that is the
part worth remembering: `NowMarker`'s chip is a `<span>` on this same ruler and
renders after the ticks, so the type selector would pick the chip on any day the
clock is inside — matching nothing on exactly the days the screen is used.

**Checked by rendering again** — a throwaway fixture route with a two-shift day,
screenshotted at 390, 900, 1200, 1440, 1920 and 2560, checking that the ruler,
the window ground, the between-shifts hole and the now line all still land on the
same minute. The 30 minutes of hatch past the last tick is not a bug and cost a
few minutes to confirm: `buildRibbon` rounds `toMinute` **up to the hour**, so a
day ending 20:30 draws a 21:00 track. That harness is deleted too.

## Today on a phone, second pass — the app's own home screen, not the desk's narrowed

The pass above answered *"1.5fr 1fr 1fr is unusable at 390px"*, and answered it
correctly: the rows stacked, the queue reflowed, the ribbon scrolled. It never
answered the question behind it. **A trainer opening this on a phone has already
learned `app/src/screens/main/HomeScreen.tsx`**, and the mobile view of this half
is supposed to BE that screen — the app's modules, in the app's order — rather
than a 1440px dashboard that survives being narrowed.

So under 900px four of the app's modules mount and the two that are a desk's idea
of the day step aside. `components/today/PhoneStack.tsx` carries the argument;
this is the table:

| Module | ≤900px | >900px |
| --- | --- | --- |
| Hero | both | both |
| Today's three figures | `PhoneStats` — sessions done/total, collected, pending | — |
| Needs attention | **both**, one component | `AttentionQueue`, reflowed under 620 |
| The day | `SessionList` — rows, with Floor/Remote/Done chips | `DayRibbon` |
| The month's money | `PhoneMoney` — one figure and a two-segment bar | `MonthCard`, five `.kv` rows |
| This week | `PhoneWeek` — seven bars, only once the day is over | `WeekCard` |
| Recent activity | `PhoneActivity` — five rows | — |
| Navigation | `TabBar` — three tabs, a raised +, *More* | `Rail` — ten destinations |

**Superseded in most of its rows by *Today, restructured* below.** The pass was
right that the phone should draw the app's modules; the restructure asked the same
question of the DESK and got the same answer, so `PhoneStats` (now `Glance`) and
`SessionList` (now `TodayList`) are drawn at every width, `PhoneMoney`/`MonthCard`
and `PhoneWeek`/`WeekCard` are unmounted on this route, and *Recent activity* is
the one module still phone-only. The two-stacks argument below is still the right
argument — it just has one component left to apply to.

**They are two stacks, not one that adapts, because the modules are not the same
modules.** A ribbon is a horizontal scroller measuring a day in pixels per
minute; a session list is rows a thumb scrolls. No media query turns one into the
other, and pretending otherwise is how a module ends up being neither. Both are
rendered and CSS picks one (`.today__phone` / `.today__desk`) — this shell's rule
since `Rail.tsx`, for its reason. The cost is stated where it is paid: each half
carries the other's markup behind `display:none`.

**The queue is in neither stack.** It is drawn at every width by one component,
because it holds every ten-second undo on the screen and two copies would be two
copies of those writes. So the phone-only blocks sit around it: the figures
above, the other three below.

**The reading order still does not change.** `deck.ts`'s order — what's next,
where the day stands, who needs chasing, the day, the money, what happened — holds
in both. The app's home says "where the day stands" as three figures where the
desk says it as a ribbon; money is fourth in both.

### Two things the deck had to grow, and one it could not

- **`DeckWeek.days`** — seven Monday-first bars of DELIVERED counts, ported from
  the app's `buildWeek`. The card at a desk states the week as four figures and a
  rate; the bars are the same week as a shape, and no existing field carried a
  per-day count. Indexed off `startOfDay(at)`, not off `at − weekStart`: a 23:30
  and a 00:30 session are sixty minutes apart and belong to different bars.
- **`Deck.activity` + `buildActivity`** — the sixth of `deck.ts`'s six modules,
  and the only one this half never had. `ACTIVITY_DAYS` has been declared at the
  top of that file since it was ported and until now only the attention bands used
  it.
- **It covers workouts and payments, and NOT body metrics.** The app draws three
  kinds; `lib/today/api.ts` does not fetch metrics, so `DeckInput` has no field to
  read and a metric row would mean an eighth request on a screen whose whole budget
  argument is seven. `prSessionIds` is absent for the same reason, which costs the
  `PR` tag. Both gaps are named in the module's own footnote — *"workouts and
  payments from the last 7 days"* — because a feed that silently drops a kind is a
  feed that says nothing happened when something did.

**The app's profile meter is deliberately not here.** It is a card the app draws
until the profile is complete, from `expo-secure-store`'s draft; on this half the
profile is the server's and `/today` does not fetch it beyond the five fields
`TrainerWire` carries. `lib/setup/meter.ts` exists and would need a request to
feed it. Not forgotten — declined, and cheap to add with the request.

**The filter chips persist, through `useSyncExternalStore`.** The app keeps this
choice in `expo-secure-store` because "a filter that resets on every launch has
not been chosen, it has been guessed at"; `localStorage` is the same promise on a
browser. It is NOT `useState` plus a mount effect — that is a second render pass
and React's own lint rule rejects it — and it cannot be a lazy `useState`
initialiser either, because this component is server-rendered and reading
`localStorage` during the first render is a hydration mismatch on the screen a
trainer opens most. `getServerSnapshot` returns the defaults, `getSnapshot` reads
the real value straight after, and the snapshot is cached because the contract
requires a stable reference. The `storage` event is subscribed to as well, so two
tabs never disagree about what the day contains.

### Two things the phone view got wrong, both fixed by looking at it

**The top bar's actions had nothing pushing them right.** §03 puts
`margin-left:auto` on `.omni` — the *search field* is what holds the bar's right
edge, not any rule on `.top__acts`. Below 900px the field is `display:none` and
the icon button takes its place, so nothing pushed: the breadcrumb, the search
icon and the bell sat in a cluster at the left of a bar with ~250px of empty space
beside them, which reads as three controls that failed to lay out rather than as a
design. The `auto` moved to the group that has to hold the edge; on a desk it
changes nothing, because `.omni` comes earlier in the flex line and takes the slack
first.

**And the day's own header stands down under 900px** (`.ph--today`). The earlier
pass made the date *fit* a 390px screen — `white-space:normal` and a clamp — which
answered the wrong question. On a phone:

- the date is said twice. `.ph__sub` already opens *Sat · 29 Aug*, and the crumb
  says which screen this is, so a 22px headline that wraps to two lines at 320px to
  repeat the first eight characters of the line beneath it is the most expensive
  60px on the page;
- both verbs are in the bar now. *The week* is the Schedule tab and *New session*
  is the +, one tap each and on every screen rather than only this one. Under 560px
  `.ph__acts--pair` stacked them full-width and spent ~110px more, which pushed the
  hero — the module that answers *what is happening* — under the fold on a 667px
  phone.

So the phone keeps the day's STATE and the modules, and the desk is untouched: the
whole block is inside the 900px query, and at 901px the date and both buttons are
back. The `<h1>` is **visually hidden rather than dropped**, the identical
declaration `.sch__ph .ph__t` uses and for the identical reason — the date stays in
the heading outline where a reader lands on it first.

**`.ph--today`, not `.ph`.** `/schedule` draws the same header and its two verbs
are *not* duplicated by the bar — *Working hours* is a link into Settings that
nothing else reaches — so it keeps them, and its own `.sch__acts` rule still shapes
them. A class per screen is what stops one screen's answer becoming every screen's.

Checked by rendering at 320, 390, 901 and 1440: crumb left and actions right at
both phone widths, one-line header, the hero ~90px higher, and 901/1440 unchanged.

## The centre +, and the two dead links it turned live

`webapp-rail.html` has no + anywhere — the design set's create actions are per
screen. `NavBar.tsx` on the phone does, between tabs 2 and 3, and states the rule
this copies: *"the centre + is not a fifth tab and never takes the selected state
— it opens a sheet and the tab you were on is still the tab you are on."* So it is
the one control in the bar that is not a `<Link>`, carries no `aria-current`, and
has no label — a labelled 46px FAB pushes the two tabs to its right under their
minimum width, which is the app's arithmetic and holds here.

**Five slots, and the + is raised.** `Today · Schedule · (+) · Clients · More` —
two tabs, the action, two more. The first version kept all four destinations and
put the + between them: six targets at ~62px, which fits and reads as a row of six
things rather than four tabs around one action. **A centre action only looks
centred if what flanks it is symmetrical**, so one destination had to come off the
bar, and the three tabs now get 80px each at 390px and 63px at 320px — where six
slots gave 65 and 51.

**Money is what came off, and it went into the sheet's new *Daily* group**, first
and above *Build*. `nav.tsx`'s `BAR` carries the ranking: Today is the screen,
Schedule is the other half of the day, and Clients is the roster every row on both
points into, while the money book is a visit rather than a glance — it is the one
of the four a trainer does not pass through on the way to something else.

**The cost was one thing and it is paid in `moreBadge`.** Money carries the only
`alert`-toned count in the shell — clients who owe — and a hidden alert is the one
thing a queue-shaped product cannot afford. `moreBadge` sums money in with the
three already behind *More*, so the dot on it is red exactly when somebody owes
money: the figure is gone from the bar, the fact that there is one is not.
`HIDDEN_FROM_BAR` is the single list both the bar and the sheet read, so a
destination the bar drops is one the sheet gains by construction.

**Raised rather than inline**, which is what "not a fifth tab" looks like when the
row is otherwise four identical columns: 52px, lifted 13px above the bar's top
edge, with a 3px ring in `--w-rail-bg` doing the work a notch would do — the bar's
1px top border passes behind it and the ring hides the crossing. Three
consequences, all deliberate: `.tabs` may never take `overflow:hidden`; `.body`
gains bottom padding under 900px because 13px of the day passes under the button;
and the slot needs `z-index:2`, because the overhang leaves the bar's own box.

**And one measured bug in the raising.** `.tabs__i` is a COLUMN flex container, so
the button is a flex item on the vertical main axis and shrank to the bar's own
48px — a 52px square rendered ~42px and the FAB read as a small lime chip rather
than an action. `flex:0 0 auto`. Invisible in the CSS, obvious at 3× zoom.

**The sheet is the app's 3d, four rows, and three of them say *Soon*.**
`/clients/new`, `/money` and `/sessions` are `NotBuilt`, so three actions have
nowhere to land. A one-row sheet is what `NavBar.tsx` names as the reason the
client role has no + at all; four rows that navigate spend a tap to teach the
trainer nothing they did not already know. So the rows are `<button disabled>` —
in the accessibility tree, out of the tab order — with the word beside them, and
the sheet's shape is final: each row becomes a `<Link>` when its screen lands.

**`?new=1` and `?book=<minute>` are read now.** They never were. `/today`'s *New
session* button and the ribbon's gap chips have both pointed at `/schedule?…`
since they were written, and `app/schedule/page.tsx` reads only `view` and `d` —
so both landed on a grid with nothing open. `Schedule.tsx` resolves them through
the same `defaultSlot` its own toolbar button and `N` accelerator call, so all four
openings agree on the slot.

It takes three pieces rather than one, and the second is the one worth knowing:

- **a `useState` initialiser** for a trainer arriving from `/today` — not an
  effect, which would paint the un-opened grid for a frame first, and seeded from
  `serverNow` so the first render agrees with the server's HTML;
- **a render-time adjustment** for arriving here *from here*. The bar's + is on
  this screen too, and its *Book a session* row links to `/schedule?new=1` — same
  segment, so Next soft-navigates and this component stays mounted. The initialiser
  cannot fire again. The parameter change is compared against the previous value
  held in state and handled during render, which is React's documented pattern for
  adjusting state when an input changes. It reads the ticking `now`, not
  `serverNow`: a page open for two hours should offer the next hour;
- **and then the parameter is stripped** with `router.replace(hrefFor(view,
  anchor))`. This reverses a decision made earlier in the same pass — keeping it
  looked more honest, until the + made it a one-shot: press it twice and the second
  navigation is to an identical URL, which the router correctly treats as nothing at
  all. The form is a transient action; the view is what `view` and `d` are for.

The fresh-load path is checked by rendering (`?new=1` opens the booking sheet on a
390px phone, on the next whole hour, with the outside-hours warning firing
correctly). The soft-navigation path is **not** — a fixture route cannot sit on
`/schedule`, which is where that transition happens, and `/schedule` itself needs a
JWT and six backend calls. It rests on the type checker and on the pattern being a
documented one. Worth a look the first time the real screen is opened with a
backend up.

**One correction went with the pass, in `nav.tsx`.** It claimed `PRIMARY` was
"the phone's own tab bar in the phone's own ORDER", and `TabBar.tsx` repeated it.
Same four destinations, **not the same order** — the app draws *Home · Clients ·
Diary · Money*, this draws *Today · Schedule · Clients · Money* — and two of the
words differ, *Home*→*Today* and *Diary*→*Schedule*. The web's order and words are
kept: `/today` and `/schedule` are the two screens this half has built and the two
a desk opens in sequence, the route and the crumb already say Today, and a bar
labelled *Home* pointing at `/today` would be a third name for one screen. The
file now says which is which, because a comment that is wrong about the other half
is worse than no comment.

### Checked by rendering, and one defect it found that is NOT mine

Same harness convention as the two passes above: a throwaway fixture route
building `DeckInput` from synthetic rows through the real `buildDeck`, screenshot
at 320, 390, 768 and 1440 in the day's *next session* and *day closed* states,
plus `/schedule?new=1` on a phone. **The harness is deleted; rebuild one if this
screen is touched.**

The bar's two sheets were opened by a real tap rather than forced open in a
fixture, which is worth copying: headless Chrome's `--screenshot` cannot click, so
a ~30-line CDP driver over `--remote-debugging-port` (`Runtime.evaluate` to click a
selector, `Page.captureScreenshot` to shoot, `Emulation.setDeviceMetricsOverride`
for the viewport — Node's global `WebSocket`, no dependency added) drove it. That
is what caught the FAB's flex-shrink, because a fixture rendering `.fab` outside
`.tabs` would never have shown it.

Two more notes for whoever rebuilds this:

- put the fixture route somewhere that is not `_`-prefixed. `app/__fx/…` returned
  a 404 for a while because an underscore-prefixed folder is a **private folder**
  in the App Router and never becomes a route.
- a fictional server instant makes the hero's countdown read *"starts in 89 h"*.
  That is the harness, not the screen: `useNow` seeds from the server's instant and
  then ticks off `Date.now()`, so a fixture whose "now" is four days from the real
  clock disagrees with itself by four days. Anchor the fixture to `Date.now()` if
  the countdown matters to what is being checked.

**Open, and pre-existing: the queue's action column overflows its own column at
1440.** `.today__row3` gives the queue `minmax(0,1.5fr)` — 480px at 1440 with the
rail up — and the table inside was measured as needing ~552px before anything is
tight. The reflow that answers that is a **viewport** query at 620px, so it cannot
fire for a 480px column inside a 1440px window: *Remind* and *Renew* sit under
`.q__scroll`'s `overflow-y:auto`, which computes `overflow-x` to `auto` too, so the
buttons are half a scroll away rather than clipped. Nothing in this pass touched
that path — the desk stack is unchanged but for two wrapper `<div>`s around cards
in `minmax(0,…)` tracks — and the fix is the one the schedule pass already learned
and wrote down: *a viewport breakpoint cannot see that*. Make the queue card a
container and hang `.tbl--stack` off a `@container` query, exactly as `.ev` became
a container. It is left open because deciding whether a 1440px desk should show
the queue as a table or as stacked rows is a design call, not a bug fix.

## Three things the phone's rules could not be copied straight

`lib/today/deck.ts` is a port, and the bands, weights, thresholds and phrasings
are copied to the character — both halves show this screen to the same person at
the same minute, so a disagreement about who to chase first is two answers and no
way to tell which is the product's. Three places it deliberately differs:

- **`ATTENTION_VISIBLE` is ignored, and then bounded anyway.** Three is a 390px
  finding: a fourth alert pushes the day below the fold, so the module competes
  with what it should be read beside. Here the queue is full-width with the whole
  day already above it, and six rows move nothing. Hiding half the list on the
  screen a trainer came to the desk to clear is worse — **but nothing capped it
  either, and three conditions across a full book is forty rows, not six.**
  `QUEUE_CAP` is 6 since 27 Aug 2026 and the rest are FOLDED behind a disclosure
  that states the count. Bounded, never truncated.
- **The week card counts the *elapsed* week.** `buildWeek` on the phone divides
  delivered by everything scheduled, which on a Tuesday morning is a denominator
  mostly in the future. Survivable as seven bars; not survivable as a headline
  percentage. So the rate is delivered over what has *settled*, and everything
  else is its own number.
  Its third row is **`unmarked`, never "running"** — real data read *Running now:
  11*, because a trainer who forgets to mark a session done leaves a `scheduled`
  row in the past. `buildWeek` sees no workout logs, so it cannot tell a live
  session from a forgotten one, and the honest name describes the row.
- **The queue commits in place.** `actOn` on the phone *navigates* — §04 is
  explicit that nothing sends silently. Six rows each costing a navigation makes
  the queue a menu, so the web sends, and **the ten seconds are the price of that
  promotion, not a patch on an oversight.** The hold attaches to the verb:
  `Remind` and `Nudge` message somebody and wait; `Renew` writes a package row and
  is instant. The *sending* is held, not the row's appearance, so Undo is an undo.
  Six verbs now, not four, and the line is unchanged: `Remind`, `Check in` and
  `Wish` hand a message to a client and wait; `Renew`, `Mark` and `Close` write a
  row and tell nobody. `Assign` is a `<Link>` and is held by nothing.
  One rule this half cannot enforce and says so in `actions.ts`: `COOLDOWN_DAYS`
  ("never twice in seven days") is computed on the phone from `nudge_log`, which is
  sync-only. A web reminder is logged, so the phone honours it from then on, but it
  is not checked against one the phone sent this morning. The fix is the cap moving
  to the backend, where a promise to a client belongs.

**The server owns the deck; the browser owns the clock.** `useDeck` re-derives
everything every 30 seconds because on a phone that is free. Here it would mean
shipping every client, session and payment to the browser to keep two strings
current. Only the countdown, the minutes-left figure and the now line tick
(`components/today/Clock.tsx`); the facts refresh on `revalidatePath` after every
action, plus a five-minute heartbeat that skips a hidden tab.

## Today, restructured — three blocks, and the ladder that now disagrees with the phone

*27 Aug 2026, and it supersedes a good deal of the four Today sections above.*

The brief: **if a trainer opens the app once a day, this is the screen they see, and
it should answer *what must I do today, in order of what it costs me to ignore*.**
That is a narrower question than the screen was answering, and the layout changed to
match it.

| | Block | What it is |
| --- | --- | --- |
| 1 | **Next up** | the session in front of the trainer, large, one primary verb, on a washed `card--lead`; beside it the session after that, plain. Two cards at a desk, one on a phone — and below them the rest of the day as compact rows, which is where the third session onwards lives |
| 2 | **Needs you today** | the ranked action queue, capped at six with the rest folded, every row a one-tap verb and a way to say *not now* |
| 3 | **Today at a glance** | three numbers: sessions today, collected this month, clients at risk |

### The queue's ladder, and the half it now disagrees with

`lib/today/deck.ts` was character-identical to `app/src/home/deck.ts`, and its own
docstring says why that mattered: "if the phone ranks a ₹9,000 six-day debt above a
₹3,000 four-day one and the laptop does not, the trainer has two answers to *who do
I chase first* and no way to know which is the product's."

**It is no longer identical, and the divergence was a decision rather than a
drift.** Two separate changes:

1. **Five bands were added** — `pack-expiring`, `missed`, `no-program`, `unmarked`,
   `milestone`. Additive; the phone simply does not raise them yet, which the
   existing law already allows ("a screen may decline to show a band").
2. **The ladder was re-ordered.** A package running out now outranks money owed,
   reversing `overdue-late` > `pack-empty`. This is the part the law forbade, and it
   was taken with the product owner's explicit decision on 27 Aug 2026.

The reasoning, so it can be argued with: an overdue invoice is money already earned
and very likely still collectable — the client is still training and the debt does
not expire. A pack about to run out is money **not yet** earned, on a client with no
reason to come back once it is empty. Ignoring the first delays revenue; ignoring
the second ends it.

**The consequence, stated rather than hidden:** until `app/src/home/deck.ts` takes
the same change, a trainer's phone and their laptop order the same roster
differently. `app/` is not edited from this half without being asked. Whoever closes
the gap moves both halves in one commit and deletes the block at the top of
`ATTENTION_BANDS`.

`lib/clients/roster.ts` reads `attentionWeight` too, so the roster's ranking moved
with this one — which is correct: two screens on the same half disagreeing would be
the original bug at a smaller scale.

### The ten rows, and what each one needed

| # | Band | Line | Verb | What it needed |
| --- | --- | --- | --- | --- |
| 1 | `pack-empty` · `pack-ending` · `pack-expiring` | *Pack is empty* · *Pack ends in 2 sessions* · *Pack expires Sunday · 3 days* | Renew | `endDate` read off `PackageResponse` — on the wire since V1, never read here, so a monthly pack with 14 sessions left and four days to run was invisible on the screen whose first priority it is |
| 2 | `overdue-late` · `due-soon` | *₹6,000 overdue · 11 days* | Remind | already there |
| 3 | `missed` | *Missed the last 2 sessions* | Check in | the sessions window widened, and a `missed_session` nudge template |
| 4 | `quiet` | *No workout logged in 9 days* | Check in | already there; the verb was *Nudge* |
| 5 | `no-program` | *Training with no program assigned* | **Assign** — a `<Link>` | nothing on the wire. There is no request that gives a client a program, so the row navigates |
| 6 | `unmarked` | *Yesterday's session not marked* | Mark | the window, and `POST /v1/sessions/{id}/done` per session, **sequentially** |
| 7 | `milestone` | *100th session delivered* | Wish | a `well_done` template |
| 8 | `log-open` | *Log still open · 2 days ago* | Close | already there, and still last |

Three notes on the rows that are worth more than the table:

- **`Check in` replaced `Nudge`.** Two bands now answer with a message asking after
  somebody, and two rows reading *Nudge* and *Check in* for the same act is exactly
  what the phrasing helpers at the top of `deck.ts` exist to prevent. The template
  differs though — `missed_session` names the absences, `check_in` asks how the week
  is going — because sending the general one to somebody who has missed two reads as
  not having noticed.
- **`unmarked` is not free housekeeping**, which is why it outranks `log-open`:
  `POST /v1/sessions/{id}/done` is what decrements the pack, so an unmarked session
  is a pack quietly one session wrong. `markAttended` fires the calls **one at a
  time** — in parallel against a pack with one left, two requests both read
  `sessions_remaining = 1` and both write 0.
- **`no-program` and `milestone` are both guarded**, and for opposite reasons.
  `no-program` waits until the client is paying or booked, or it fires on every
  client the moment they are created. `milestone` has a three-day freshness window,
  or the row is true forever — the count never goes back down, so without one it
  could only be cleared by sending the message.

### Two-thirds of priority 7 is not built, and neither gap is an oversight

The brief asked for "Birthday / milestone (100th session, 10kg lost)".

- **Birthday: impossible.** There is no date of birth anywhere in this schema. V12
  declares a `birthday` nudge *kind* and no column to feed it ever landed. Adding
  one is a migration plus an intake field on both halves.
- **10kg lost: not without an eighth-request-shaped hole.** Body metrics are not on
  this screen's wire, and `GET /v1/clients/{id}/body-metrics` is the only route —
  one request per client on the screen a trainer opens every morning, which is the
  mistake `GET /v1/packages` was added to fix.

So the band raises what the wire can prove, and `milestoneLine` names the count
rather than the achievement.

### The medical flag was asked for and is deliberately a note flag instead

Block 1 asked the hero for "the injury/medical flag if there is one".
`notes/InclineYou_MVP_interaction_map.md` forbids it in as many words — "**No medical or
health-condition fields anywhere** — no injuries, no conditions, no medications …
Do not design an 'injuries / health notes' field into intake" — and lists health
data under "legally excluded, not deferred" against the DPDP Act 2023.
`InclineYou_core_data_model.md` says the client note is "free text; **no medical
fields**".

What the hero draws instead is a neutral **Has a note** chip: a boolean over
`scheduled_session.notes` and `client.goal`, two columns that have always been the
trainer's own free text, linking to the file where the text is. It says nothing about
what the text is, and **it must never grow a variant that means "medical"** — the
moment a flag distinguishes a health note from any other note, the product holds
health data whatever the column is called. `DeckSession.hasNote` carries this.

"Location" has the same shape of answer: there is no location column, so the chip is
the delivery mode plus `trainer.gym_name` — *Floor · Anytime Fitness Koramangala* /
*Remote*.

### Dismissal has memory, and the memory is on the server

**V28 · `attention_dismissal`**, three routes under `/v1/attention/dismissals`
(`backend/API.md`). *Snooze a week* and *Dismiss* per row, plus *Restore*.

`localStorage` was the cheaper option and it is the wrong one here. The filter chips
on this screen do live in `localStorage`, and the difference is what kind of fact
each is: a filter is a preference of a device, a dismissal is a fact about a client.
A gym desktop is shared, so a browser key silences the row for whoever sits down
next and for nobody's second machine — and a snooze has to expire against a clock
both halves agree on.

Three things about it that are load-bearing:

- **The band travels with the write**, and it is what stops a dismissal becoming a
  blindfold. "Pack ends in 2 sessions" dismissed on Monday must not hide the row
  when the pack hits zero on Thursday. `isSilenced` compares the live band against
  the recorded one; the comparison is the client's, because the ladder lives in
  `deck.ts` and the table stores a name from it rather than a rank out of it.
- **`dismissRow` is the one write on this screen that does NOT `revalidatePath`.**
  Every other verb leaves its row in place, so the row survives the refresh
  carrying its receipt. A dismissed row does not — revalidating takes the receipt
  and its Undo with it, and the trainer watches the row vanish with no way back.
  `restoreRow` does revalidate, because bringing a row back IS a change to the
  queue.
- **The silenced rows are returned, not just counted.** `Deck.silenced` carries each
  one with the `dismissalId` that *Restore* deletes, and the card's foot lists them.
  A queue that can be silenced is only trustworthy if it admits to being silenced
  and offers the way back; otherwise "you're all caught up" is a sentence the
  product cannot honestly say.

### What was unmounted, and why nothing was deleted

`DayRibbon`, `WeekCard`, `MonthCard`, `PhoneMoney` and `PhoneWeek` are no longer
drawn on `/today`.

The ribbon's question — *where is the two-hour hole* — is a planning question, and
`/schedule` draws the same day at one minute to one pixel with a booking form
attached. The week and the month are a report, and Block 3 is "three numbers, no
more"; five `.kv` rows beside five more is ten.

**All five are still in the tree**, each with a docstring naming the route that owes
it, and the two phone ones are `export`ed so an unreferenced local is not a lint
error. `/money` and `/reports` are `NotBuilt` placeholders — deleting a built module
whose route has not arrived is losing work with nowhere to put it.

`.today__desk` is gone from `app.css` with them. `.today__phone` survives for the
one module still phone-only, *Recent activity*.

**And there is one component per module now**, where the phone pass had two behind a
`display:none` each. `Glance` and `TodayList` are the app's own modules and they are
what the desk draws too. The only thing CSS still decides is the hero's card count.

### Two things it closed that AGENTS.md had recorded as open

- **The queue's action column overflowed its own column at 1440.** `.today__row3`
  gave the queue `minmax(0,1.5fr)` — 480px against a table measured at ~552px — and
  the reflow that answers it is a *viewport* query at 620px, so it could not fire
  for a 480px column in a 1440px window. The recorded fix was a container query.
  Full width closes it by arithmetic instead: ~1,140px at 1440 with the rail up,
  measured to zero overflow at every width from 320 to 2560.
- **The hero stopped wasting a wide display.** Two cards is right for 1144px and
  still two at 2560, where the row is ~2,300px. Three cards are 747px each there.

### The hero went back to two, and the lead card got a ground · 27 Aug 2026

The bullet directly above is the one this reverses, and it was right about the
width and wrong about the card. Three cards did fit at 2560. What they held was
the 15:00 and the 17:00, each given a full-height card — figure, name, plan line,
chips, band, verb — when the session list directly beneath already draws both in
one line each, and below 1441px the third was `display:none` anyway. So on every
desk narrower than that it was markup nobody saw, and on the ones wider it was
*what is my morning* answered in the most expensive form available.

**The hero is the next session and the one after it. The third onwards is a
`.srow`.**

| | Before | Now |
| --- | --- | --- |
| cards built | `deck.upNext` entire, CSS capped it | `deck.upNext.slice(0, 2)` — and `.slice(0, 1)` after a running card |
| columns | 1 ≤1080, 2 ≤1440, 3 above | 1 ≤1080, 2 above |
| duplicate-row markers | `.srow--h2` at 1081, `.srow--h3` at 1441 | `.srow--h2` at 1081. `.srow--h3` deleted from markup and sheet |
| the first card's ground | none, or flat `card--acc` when late | `card--lead` |
| the second card's ground | none | none, deliberately — see below |

`.card--lead` is a new modifier in `webapp.css` beside `.card--acc`, and the two
are **different claims that were being made with the same paint**:

- `card--acc` is a flat `--tx-accent-soft` fill and it means *a log is open right
  now*. `Running` wears it, with the pulsing dot in the kicker.
- `card--lead` is `linear-gradient(135deg, var(--tx-accent-soft), transparent 62%)`
  over `--tx-surface` — the accent in the top-left corner, gone by two-thirds of
  the diagonal. It means *start reading here*, and it is emphasis rather than
  status.

The gradient is stated **over `--tx-surface` explicitly** rather than letting the
card's own background show through, because `--tx-accent-soft` is 12% alpha on
dark but an opaque `#EDF6D6` on light — on light there would be nothing to show
through.

`card--acc`'s dim-text step-up (`--tx-ink-3` → `--tx-ink-2`, there because a flat
tint drops the small print to 4.45:1) is **not** repeated for the wash. The
gradient is transparent long before it reaches the plan line or the band; the
kicker is the only dim text over any tint, and at the corner it is the same 4.58:1
the flat card measures.

**The trailing card takes nothing, and that is load-bearing.** Two identically
grounded cards side by side is how a trainer starts the wrong one — the same
argument the `After that` / `Then` kickers were written for. The lack of a ground
on the second card is doing as much work as the wash on the first.

**One behaviour change beyond the layout:** the late/unopened hero — a session
whose start time has passed with nothing logged — was drawn `live`, so it took the
running card's accent tint *and* its pulsing dot while the warn band underneath
said "Nothing logged". A green ground arguing *in session* above a band arguing
the opposite is the wrong half to believe. It wears `lead` now, and the tone lives
entirely in the band and the two verbs.

### Three bugs the rendering pass found, and one of them is this file's own trap

| Where | What |
| --- | --- |
| `.srow--h2` / `.srow--h3` (`--h3` since removed) | **The rules did nothing.** They hide the list rows for the hero's second and third cards, and `.srow{display:grid}` is declared ~2,000 lines further down at the *same specificity* — a later declaration at equal specificity wins. Identical to the `.body--flush` trap already in this file. The classes were in the markup and the duplicate row was still drawn. `.slist .srow--h2` is (0,2,0) against (0,1,0), so it wins wherever it sits and the pairing can stay next to the hero breakpoints it has to move with. |
| the same rows, before they existed | Found at 1920: the hero drew Kavya R and Rajalakshmi as cards two and three, and the list beneath repeated both — the same client twice inside 400px. The hero's card count is CSS's decision, so the list cannot know how many are visible; the first row is dropped outright and the other two are marked and hidden by the same two breakpoints. Verified: **cards + rows = 5 at 390, 1200 and 1441.** |
| `.srail .stat__k` | All three glance labels ellipsised on a phone — `SESSIONS TOD…`, `COLLECTED TH…`, `CLIENTS AT R…`. The `nowrap` was measured for *Sessions* / *Collected* / *Pending*; the brief's labels are up to 2.4× that. Shortening the copy loses the change — *Collected* alone is the figure this pass moved from the day to the month. It wraps to two lines with a reserved `min-height`, so all three tiles stay level; the desk step keeps one line, where 372px holds them. |

**Checked by rendering, per this file's own convention.** A throwaway fixture route
building `DeckInput` from synthetic rows through the real `buildDeck`, inside the
real `AppShell`, screenshotted at 320, 390, 620, 621, 768, 1200, 1441, 1920 and 2560
— plus the confirm strip, the folded rows and the silenced foot driven by a CDP
click. **The harness is deleted; rebuild one if this screen is touched.**

Four notes for whoever rebuilds it, on top of the ones the earlier passes left:

- the fixture takes `?h=9` to shift its instant to the morning, because at 22:00
  there is nothing left in the day to draw two cards from. The cost is the
  clock disagreement this file already records — `useNow` seeds from the server's
  instant and ticks off the browser's — so the countdown text is checked without
  the override and the geometry with it.
- **wrap the fixture in `AppShell`.** Measuring the hero's columns in a
  shell-less 1440px page overstates every one by 82px.
- newer Chrome refuses `GET /json/new` — "This action supports only PUT verb" — and
  the refusal arrives as plain text, so the `JSON.parse` is the error you see first.
  `/json/close/{id}` answers plain text too and must not be parsed.
- the invariant worth asserting rather than eyeballing is **visible hero cards +
  visible `.srow` rows = the day minus the done sessions the filter is hiding**. It
  is one `getComputedStyle` filter and it catches both duplication and loss.

### Two pre-existing lint errors this pass did not touch

`npx eslint .` fails on `app/(main)/team/page.tsx` (`Date.now()` during render) and
`components/clients/ClientFile.tsx` (a component declared inside a render). Both
predate this work and both are in other screens' files. `npx tsc --noEmit`,
`npx next build` and `eslint` over `components/today`, `lib/today` and
`components/shell` are all clean.

## The schedule, and the one number that is the whole screen

`webapp-schedule.html` is an eight-point audit of its own first pass, and every
finding has the same cause: the week was a **matrix** of 48px hour cells, so all
102 of its sessions carried the identical inline style `top:2px;height:42px`.
Every one exactly sixty minutes, every one exactly on the hour — while the app it
documents has stored `session_duration_minutes` per client since schema V2, steps
its time field by 15 minutes, and sells 30, 60 and 90.

There are no cells here. **One minute is one pixel** — `--cw-hour:60px`, and
webapp.css says it is not a tuning value but the geometry: a block's `top` is its
start minute and its `height` is its duration. `lib/schedule/grid.ts` therefore
computes in minutes and never multiplies by anything.

That identity is why **the responsive pass never touches `--cw-hour`.** The
moment an hour is worth fewer pixels on a phone, two sessions of the same length
stop being the same size, and the one thing this screen exists to show is gone.
A narrow screen gets narrower columns and scrolls sideways; it never gets a
shorter hour.

### What is built, and the three things that are not

Frames 1a–4c and 6a. Frames 5a/5b — the drag and its undo — are built as
**select-then-place** rather than as a drag; see below. Not built:

- **frame 7a**, the eight-week bulk pattern. It writes a series, and it belongs
  with `/settings/hours`, which is frame 8a and still a placeholder.
- **the month's dated hole** (`.mo__blk`). `time_blocks` **has no REST
  endpoint** — it reaches the wire only inside the sync envelope, exactly as
  `working_hours` did before Today added `GET /v1/working-hours`. Drawing it
  means either `/v1/sync/pull`, which `lib/today/api.ts` forbids on a built
  screen and which a *month* view would abuse worst, or a backend change in a
  commit that also updates `backend/API.md`. `MonthGrid.tsx` records it.
- **`role="grid"`**. §01.5 is about a keyboard contract published and never
  built, and this declines to publish rather than half-build: a `role="grid"`
  promises a rectangular table walked cell by cell, and a week is not one — an
  empty day has no cell, a clash shares one, and a 90-minute block spans an hour
  and a half of an axis with no rows. What *is* built is the part that costs a
  keyboard user time: one tab stop for the whole grid, ↑/↓ within a day, ←/→ to
  the nearest session in the next day that has one, Home/End, ↵ to open.

### The line the URL is drawn at

**The URL carries the view and the anchor, and nothing else.** They decide what
is *fetched* — `rangeFor` turns them into the window `GET /v1/sessions` is asked
for — so changing either has to be a navigation, and there it is also linkable,
reloadable and in the back button's history.

The mode filters, the gap overlay, the open panel and the open booking form
change only what is *drawn* from rows the browser already holds. In the App
Router a search-param change is a server round trip, so putting them in the URL
would mean re-reading the roster, the programs, the packages and the working
hours to un-tick *Remote*. The stated cost: a link cannot carry "with remote
hidden", and a reload drops the filters to their defaults.

**No width ever changes the view.** It is tempting to open a phone on Day and a
desk on Week, and it is `Rail.tsx`'s mistake one level down — plus a worse one
here, because the view is a thing the trainer *chose*.

### Six requests, and the two Today makes that this one does not

`/v1/trainers/me`, `/v1/clients`, `/v1/sessions?from&to`, `/v1/programs`,
`/v1/packages`, `/v1/working-hours`. Only sessions are windowed, and the window
is the view's own.

Deliberately **not** fetched: `/v1/workouts` and `/v1/payments`. Today needs both
for the attention queue and both are unwindowed reads over a whole account; this
screen has no queue — it draws what is *planned*, which is `scheduled_session`.
So a month costs six bounded reads rather than a full history.

The honest consequence, stated in `lib/schedule/api.ts`: a block here cannot know
whether a log was opened against it. `live` is therefore always false, and `late`
means *ran and still unmarked*, which the trainer can check against the now-line.
The block's label says **"not marked"** where Today's says "not started" — the
same word at two resolutions, and each true at its own.

### Moving a session is select-then-place

The component library specifying frames 5a/5b already wrote down the problem with
a drag: a keyboard move has to be cut and paste *"because drag alone would fail
SC 2.5.7"*. That is normally met by building a drag and bolting a second, worse
mechanism beside it. This builds only the second one, for everybody. It works on
a touch screen (a drag on a 390px week that also scrolls in two axes is a gesture
fighting two scrollers), it is one code path, and the target is a click so it can
be read before it commits.

**The ten seconds are kept in full**, because they are not about drags. The
design's own session history reads *"Moved from Monday 17:00 · Nikhil asked. He
was told automatically"*, so a mis-placed move sends a WhatsApp. Here the *whole
write* waits rather than just the message — a move is one `PUT` that does both,
so there is no seam to hold half of. `MOVE_HOLD_SECONDS` carries the cost:
nothing is on the server during those ten seconds, so a tab closed inside them
moved nothing, which is the correct reading of an undo that has not expired.

`.ev--sp1`/`.ev--sp2` were generalised for the same honesty. webapp.css concedes
its own limit — *"Two covers every case a one-to-one trainer can produce; the
third is a rounding error and gets the same rule"* — and "the same rule" paints a
third block on top of one of the other two, which is §01.4 again. `laneStyle`
computes n lanes and **reproduces `.ev--sp1`/`.ev--sp2` to the pixel at n = 2**.

### The schedule on a phone

The hardest of the three responsive passes on this half, because a calendar is
the one screen whose content is genuinely two-dimensional: the queue on `/today`
could reflow to two rows per record, and a week cannot reflow to anything —
Tuesday is left of Wednesday and 07:00 is above 08:00, and neither statement
survives being stacked.

**WCAG 1.4.10 exempts "content which requires two-dimensional layout", and this
is the case it is written for** — where `/today`'s queue explicitly was not, for
the reason app.css already records. So the week scrolls sideways, and four things
make that navigation rather than hunting: the gutter and the corner are sticky in
the inline axis, the day heads stay sticky in the block axis, the columns snap
(`proximity`, never `mandatory` — mandatory fights a two-axis scroller), and Day
is one tap away in a control on screen at every width.

| Width | What changes | Why that number |
| --- | --- | --- |
| — | a day column has a 124px floor | measured off `.ev--m30`: 124 − 4 − 14 − 2 leaves 104px, which is ~34px of `07:00`, a 7px gap and 63px of name. Expressed as `minmax(124px,1fr)` and therefore **not a breakpoint** — 162px at 1440 with the rail up, exactly 124 and scrolling at the width `1fr` would have gone under |
| 900 | gutter 58 → 48; the toolbar becomes three named groups; the panel becomes a bottom sheet | 58px of gutter is 15% of a 390px screen spent on four digits, and 48 still clears `06:00` at 10.5px tabular |
| 760 | the day view drops its context lane | `.dtl` is a five-column grid needing ~380px; at 200px it is five columns of ellipsis, and everything in it is one tap away on the panel |
| 560 | the views become a full-width segmented control; the filters become a scrolling strip | a chip row that *wraps* changes the toolbar's height as the week changes, which moves the grid under a trainer who only pressed Next |
| 420 | the gutter drops to 44 — **the column floor stays 124** | 112 was tried and reverted. It was measured against an *unsplit* block, and on a real week four of eighty-one blocks are unsplit: three lanes of a 112px column are 34.7px, and a `06:00` needs 32px before any padding, so 112 bought back a swipe by taking the start time off the tightest thing on the screen |

**The date leads on a phone and the view group leads on a desk**, and that is a
rank rather than a preference: at 1440 everything is on one line and the group is
the leftmost thing a calendar is expected to open with; at 390 only the first row
is reliably above the grid, and the first row has to say *which week this is*.

**Touch: the session block is deliberately NOT padded.** WCAG 2.5.8 asks 24px in
each dimension; the shortest session sold is 30 minutes, which at one minute to
one pixel is 30px tall in a column that is never narrower than 124. Hit-slop
would be actively harmful: two back-to-back sessions are 0px apart, so any
vertical slop makes the upper block steal the lower one's first pixels, and the
split lanes are adjacent targets by definition.

**That claim used to carry a worked example, and the example was wrong** — it is
kept here because the way it was wrong is the useful part. It read: *"the tightest
thing this screen can draw is a three-lane split at 390px: 34 × 45px."* Three
lanes was an assumption about a one-to-one trainer, not a measurement, and the
first week of real rows broke it in both directions: **four clients at 06:00 and
six at 19:00, every week, on purpose.** Six lanes of a 156px column is **20.7px**,
under the floor the paragraph was asserting — and the same pass counted **150
clipped text nodes** across 81 blocks. The floor is now held by construction
rather than by argument: the week caps its lanes at three (`MAX_WEEK_LANES`) and
folds the rest into a `+N` chip, so the narrowest block the week can draw is
38.3px wide, measured at every width from 320 to 2560.

### Seven bugs the pass found, and every one of them by rendering

`/schedule` needs a JWT and six backend calls, so the pass built a throwaway
fixture route and screenshotted the real components at 320, 390, 768, 1024, 1440,
1920 and 2560, plus the panel, the booking sheet, the gap overlay and a move in
flight. The harness is deleted; **if this screen is touched again, rebuild one.**

> **And then a second pass rebuilt it against the DEV DATABASE, and that is the
> one to copy.** The first fixture was hand-written, and a hand-written fixture
> encodes the same assumptions as the code it is checking — it had a two-way
> clash and a three-way clash because three was the number the code believed in.
> The second one is `scheduled_session` joined to `client` and `program` for one
> real trainer, dumped to JSON and fed to `<Schedule>` unchanged: 521 sessions,
> 44 clients, a 26-session Tuesday, six overlapping at 19:00 on Thursday, 75- and
> 45-minute durations, and a Wednesday with no working hours at all. **Nine more
> defects fell out of it in one afternoon, and seven of them were invisible to
> the hand-written one** — see the table below. Rendering is the convention;
> rendering against rows nobody wrote for the test is the version that pays.

| Where | What |
| --- | --- |
| the day view's context lane | Cards were positioned at `top:startMinute`, which is §01.4 again in the one place the spine had already solved it: three sessions at 16:30, 17:00 and 17:15 printed three plan lines, three rupee figures and three *Open* buttons inside 45px. The lane has no sideways to split into, so it keeps alignment wherever the day allows it and gives it up exactly where it cannot — a clashing card takes one row's height and is pushed below the one above. |
| a move that clicked a block | **A dead end reachable by tapping anywhere the week is busy.** A click on an existing block during a move opened *that* block's panel and left the move bar up with nothing to place. While a move is in flight the grid is a surface for choosing a minute, so the blocks and the gaps stop taking pointer events and every click reaches the column underneath. |
| `.body--flush` under 900px | This file's own phone rule, `@media (max-width:900px){ .body{padding:12px} }`, is a later declaration at the same specificity as webapp.css's `.body--flush{padding:0}` — so it **wins**, and the flush body quietly gained a 12px gutter. Found by measuring the sticky band, which came back sitting at x=13 on a 390px screen. Right for a body of cards, wrong for a calendar, and it made every `100vw` cap inside the grid off by that much. |
| the quiet band's sentence | `.cw__bandin` is capped at `max-width:100%`, and its parent spans `grid-column:1/-1` — which on a phone is the whole 930px week, not the viewport. The percentage capped nothing, and the sentence explaining why a band was held open ran off the side of a row that is sticky *precisely so it never has to be*. Shorter sentence, the long one on `title`, and the cap in viewport units. |
| the month's thin week | It marked the thinnest week of any month with two weeks of working hours — which, on a month with one week of bookings, is a week with **nothing in it**. Five identical empty rows and one marked in warn reads as arbitrary, which is worse than silence. Two weeks must hold sessions before there is a thinnest one to name. |
| the month grid's height | Six 84px rows stop at ~510px, so a 900px window showed 150px of empty canvas below the last week — a grid that reads as having failed to load. The rows take the height that is going; `min-height:100%` and not `height`, so a tall month on a short window still scrolls. |
| the page header on a phone | `.ph__acts--pair` stacks both buttons full-width under 560px, which is right on `/today` where both are the day's own actions. Here the secondary is a link into Settings, and it spent 60px of a 390px screen pushing the grid 260px down the page. They share the row and the secondary drops its words — the label survives as its accessible name. |

### Nine more, found by rendering against the dev database

| Where | What |
| --- | --- |
| the month's utilisation figure | **Two views, one Tuesday, two different answers.** `month.ts` ran the figure and the bar through one clamped helper, so a day carrying 26 sessions in nine working hours drew a full bar and printed **100%** — while the week, whose totals come from `grid.ts` and are not clamped, printed **294%**. The clamp is the lie: it says a day is exactly full at the moment it is three times oversold, which is the one fact a month grid exists to surface. `rate` is now the honest ratio and `barFor` is geometry — the track fills, keeps its floor/remote proportions and raises `over`. |
| the week's lanes | Real rows need four to six, and equal lanes at six are 20.7px — under WCAG 2.5.8 and narrower than the start time being printed in them. The week caps at three and folds the rest into a `+N` chip that opens the day, where the column is 3× wider and nothing is capped. `hidden` keeps the folded sessions in `placed`, so every count, rupee and gap still sums over all of them. |
| a held-open quiet band | A band is held open as soon as **one** session sits anywhere inside it, and it was unfolding the whole range: a single 10:30 session running ten minutes past eleven expanded 11:00–17:00 in full — **six hours, 360px, of empty hatched track** on the row whose entire purpose is to spend no pixels on dead time. A band opened by its contents now unfolds only where its contents are; one opened by hand still unfolds completely. |
| a block crossing a band | Blocks were filtered by `startMinute`, so the 10:30 session was drawn once, clipped at 11:00, and the segment the band had been *held open to reveal* was empty — the band's own sentence naming a client directly above blank track. Blocks are now drawn in every segment they overlap, with the continuation half silent in the accessibility tree and out of the keyboard walk. |
| the day view's context lane | The alignment fallback from the first pass gives up alignment where it must, and on a 26-session day it must almost everywhere: 22 cards at one row each need 748px inside a 300px segment. Nothing clipped them, so the last third printed straight over the quiet band and the segment below it. The lane is now **dropped** when it cannot be drawn where each card belongs — the same trade the 760px rule already makes, for the same stated reason — and the width goes to the spine, which takes those 26 blocks from ~93px to ~290px each. |
| the clash triangle, twice | `<triangle/>{count}` in one span rendered as **"⚠ 26"**, which has no reading other than *twenty-six warnings*. The count never changed meaning; its neighbour did, and the eye attributes the neighbour's tone to the figure. Both the week's day head and the month cell now keep the figure plain in every state and put the marker somewhere day-level — the head's existing 2px danger underline, and beside the date in the month. |
| the delivery glyph | The clash outranked `remote` in the block's glyph chain, so a remote session sharing a minute with a floor one lost its glyph to a warning triangle — and floor-against-remote is the single colour axis this design set is built on. A Thursday evening of five remote check-ins and one floor session showed six triangles. Delivery now outranks the clash, which is said three other times in places the triangle was not. |
| the now-line | `border-top:1px solid var(--tx-ink)` at `z-index:5` is drawn over the blocks, which is right — a line occluded by a booked hour is invisible on the days it matters. The colour is not: ink is the text colour, and a 1px ink rule crossing an 11.5px ink name at its x-height **is a strikethrough**, which on a schedule means cancelled. Dashed, so it stays a line wherever it crosses. |
| the length chips | `session_duration_minutes` is a free integer, so a roster holds 75-minute clients whatever the chip row offers. The panel drew four chips with **none pressed** under a note reading "usually trains for 75 minutes" — and an unpressed row reads as *nothing is set*, so the obvious repair is to press 60 and silently truncate the session by a quarter of an hour. `lengthChoices` adds the current value as a chip when it is not one of the four; `LENGTHS` itself is untouched, because its docstring pins it to `BookSheet.tsx` "to the character". |

Three more that are wording rather than geometry, and all three only appear at
scale: a phone showed the same date **three times** in the 330px above the grid
(top-bar crumb, page title, toolbar label — the title now stands down under 900px
and stays in the accessibility tree); the booking form's clash warning read
*"draws both, side by side"* while naming five people; and the held band's markup
ran its sentence into its affordance as `…booked in itheld open` for anything
reading text rather than layout. A fourth was investigated and is **not a bug** —
the circle overlapping the bottom sheet's foot on a phone is the Next.js dev-tools
badge, which does not exist in a production build.

**One thing was deliberately not changed.** On this trainer's data every block
carries the danger ring, because `hasClash` is `lanes > 1` and they run four to
six clients at once on purpose — 68 of 81 blocks ringed red is alert fatigue by
any reading. But whether concurrent sessions are an *error* is a product
question, not a rendering one: this is a one-to-one product (`BATCHES_ENABLED` is
off), so on that reading the ring is correct and the seed data is the outlier.
What was fixed is the duplication around it — the glyph, the count, and the lane
tag, which said "Clash" 26 times down a single column and now say what state each
session is in. **If the product decides overlap is normal, `hasClash` is the one
line to change.**

Two more from the first pass, both in the same family as `/today`'s ruler bug and
fixed the same way:
the gutter's **first and last tick labels** are `translateY(-50%)` and therefore
straddle their segment's edges, so each was half-covered by the row beyond it;
they range inward instead. And the hour rulings had `pointer-events` on, so a
1px-tall `<span>` swallowed the click that books on the exact minute a trainer
aimed at.

### The hour is a measurement now, and the column floor is gone

*Third pass, and the one the previous two got backwards.* Both had defended the
grid's geometry as a law: `--cw-hour:60px` was "ONE MINUTE IS ONE PIXEL, at every
width, on every device", and `minmax(124px, 1fr)` was "a MINIMUM and not a
breakpoint … nothing changes on a desk". Neither survived being measured.

**`--cw-hour` had no consumers.** `grep -rn 'var(--cw-hour)'` over `app`,
`components` and `lib` returns nothing. Every vertical measurement on this screen
is an inline unitless number React serialises as px — `top: tick.minute -
seg.from`, `height: gap.minutes - 4` — so the 1:1 mapping lived at fourteen JS
call sites and the token that claimed to own it governed none of them. The law was
written on a variable that could not enforce it.

**And 60px was one screen's answer, not a law.** A thirteen-hour working day at
60px/hour is 780px; a 1440×900 laptop has ~800px of track under the toolbar and
the day heads. That is the calibration. The same constant leaves ~200px of a
1920×1080 monitor idle and overflows a 1366×768 laptop, so the evening was below
the fold on the smaller machine and the page was part-empty on the larger one.

What actually mattered was never "one minute is one pixel" — it was **two sessions
of the same length are the same size, and a block's height IS its duration**. That
is proportion, and a shared scale factor preserves it exactly. So `useCwScale`
divides the scroll container by this trainer's own track and clamps the quotient:

| bound | value | why |
| --- | --- | --- |
| floor | **0.8** (48px/hour) | 30 minutes is the shortest session `LENGTHS` can express, and at 0.8 it is a 24px target — WCAG 2.5.8's minimum, exactly. Blocks are flush neighbours so the spacing exception cannot be claimed. |
| ceiling | **1.5** (90px/hour) | past it a short block is mostly padding. |

It is owned in TypeScript and not as a CSS `clamp(48px, 6.7vh, 90px)` — which was
the first attempt — for one reason that is not a matter of degree: **the track is
not the viewport.** What has to fit is this trainer's working day minus its
collapsed quiet bands, which is data, and `vh` cannot see it. Three call sites
outside CSS need the number too: `rung()`, `laneFits`, and the click-to-book
inverse that would otherwise write the wrong minute.

**The column floor was costing a desktop bug, not a phone one.** Measured with the
rail expanded at 248px: 1440 → 162px a column, 1280 → 139px, and **1024 → the
floor bites and the grid becomes 58 + 7×124 = 926px inside a 776px box.** A 13"
laptop scrolled sideways to reach Sunday. The floor was buying almost nothing to do
it: the natural column at 1024 is 102.6px, which leaves 82px of text — `06:00`, the
gap, and 43px of name. "Meera" fits at 102px. And 124 was measured against the
wrong specimen — a block with the column to itself, which four of this trainer's
eighty-one blocks are. What decides legibility is the **lane**, and a lane is the
column divided by the clash depth, so a 162px column at 1440 with three lanes is
54px — tighter than any phone. A viewport breakpoint cannot see that.

So the floor is gone (`minmax(0,1fr)`), and the width ladder replaces it: `.ev`
becomes a container and its children answer to their own room. `.ev--sp3` above it
still shaves the padding at three lanes, and the division is not stylistic —
**a `@container` rule cannot set padding on its own container**, because the query
reads the content box and the padding is what decides it. The lane count sets the
box; the box sets the content.

Container queries measure the **content** box, which the first version of the
ladder got wrong by ~18px at every rung — a 50.9px block has a 44.9px content box,
matched a threshold written for the border box, and 40 of 48 blocks dropped to bars
on a screen where they had room for the time. The thresholds are now measured text:

| measured in Chrome | width |
| --- | --- |
| `06:00` | **42.0px** — and the note this replaces claimed 32px |
| `07:00 – 08:00` | 98.3px |
| shortest name in the roster | 54.4px ("Irfan Ali") |
| longest | 114.0px ("Vikram Chandra") |
| plan lines | 65–115px |

≤95px drops the plan, ≤55px drops the name, ≤41px drops the time and the block
becomes a **bar** — state in colour, which is the axis the whole design set is
built on. `.ev--m30` is the one flex rung, so its name shares the line and needs
42 + 7 + 55 = 104px. Nothing is lost but ink: `aria-label` is built from the
session and never from what survived the ladder, and a `title` was added so a
sighted mouse user has the same sentence the screen reader always had.

Two consequences that fell out of the same change:

- **`rung()` is a line count now, not a length.** The boundaries were 45/60/90
  read as pixels because an hour was worth sixty of them. At scale 0.99 a
  45-minute session is 44.6px, falls under `< 45`, and every 45-minute block on
  the screen drops a rung on a viewport one pixel off the reference one. The
  boundaries are 38/54/70, derived from `.ev`'s own 15.5px line box — and at scale
  1 the four canonical lengths land on exactly the rungs they did before.
- **`.ev--split .ev__p{display:none}` is gone.** It held that "half a column
  cannot hold a plan line", true of the column it was written against. With the
  floor removed and the context lane dropped on a dense day, Tuesday's five lanes
  are **236px each** at 1440 — fourteen wide blocks were drawing two short lines
  in a box with room for three. `split` was always a proxy for `narrow`, and
  something now measures narrow directly.

**The date was printed three times, and it was never a narrow-screen problem.**
The shell's top bar says "Week of 24 August", the page title says "24 — 30 August
2026", and the toolbar says "24 — 30 August 2026" — the last two are the identical
string. That was found at 390px and fixed only below 900px, under a rule claiming
"above 900px all three coexist comfortably". The duplication costs **width** on a
phone and **height** everywhere: at 1024×768 the chrome above the grid was 285px of
768 — **37% of the page** — and the header holding the duplicate was 64px of it.
The reclaim is not only an overflow fix, because the scale divides available height
by the track: 64px of header handed back is a taller hour on *every* screen. A
duplicated line was capping the resolution of the whole grid. The `<h1>` stays in
the accessibility tree; only its ink stands down.

Measured before → after, week view, rail expanded:

| | before | after |
| --- | --- | --- |
| horizontal overflow @1024 | **150px** | **0** |
| horizontal overflow, 1024→2560 | 150px at ≤1174 | **0 at every width** |
| vertical overflow @1366×768 | ~110px | **0** |
| vertical overflow @1440×900 | 0 | **0** |
| px per minute @1440 | 1.00 fixed | **1.02** |
| px per minute @1920 | 1.00 fixed | **1.32** |
| px per minute @2560 | 1.00 fixed | **1.50** |
| hard-clipped start times | 38–150 | **0 at every width** |
| targets under WCAG 2.5.8's 24px | 7 @1440 | **0 everywhere** (min block height is 24px, at the floor) |
| plan lines drawn, day view @1440 | 0 of 26 | **26 of 26** |

Verified functionally at scales 0.80, 1.02 and 1.50: **click-to-book lands on the
minute aimed at** in 10 of 11 probes, the eleventh landing on an exact 7.5-minute
snap midpoint where either answer is arbitrary — this is the conversion that
*writes*, and at 90px/hour an unscaled ordinate turns a click on 12:00 into a
booking at 08:00. One tab stop with arrows and `Home`/`End` walking blocks and
`+N` chips alike, `Enter` opening and `Escape` restoring focus; the band toggle
still adds track and the grid re-fits to it; the ResizeObserver settles in one
pass and returns to the same scale after a resize round trip; no page errors; the
month view untouched.

One thing that looked like a bug and is not: a day with **no** working-hours rows
draws **no** hatch rather than a fully hatched column — `offRunsIn` says why, and
it is the same rule as `utilisation` being null rather than 0.

### The month needed a foot, and it was the earlier fix that took it away

An older pass gave `.mo` `min-height:100%` with stretching rows, to close 150px of
dead canvas below the last week. It overshot: the rows then filled the container to
the pixel, and `gapBelowLastRow` measured **0** at 1024, 1440 and 1920 alike — the
last week's bottom rule landing exactly on the window edge.

Flush is not neutral, it is ambiguous. The one thing this month is certain of is
that it always has six week rows (`gridDays` returns 42, never 28–35), and it had
no way to show that it had ended; six rows of utilisation figures sitting on the
edge read as a seventh row cut off. The week and the day stay flush on purpose —
their last edge is the last working minute, a boundary that means something. A
month's last edge is only where the sixth row happened to land.

The foot sits on the scroll container rather than on `.mo`, for two reasons:
`.mo` carries `border-left`, so padding there hangs a 1px stub below the last row;
and a percentage `min-height` resolves against the containing block's **content**
box, so the container's padding is subtracted before `100%` is computed — the rows
shrink to make room and nothing overflows, which is the whole trick.

But the rows are paying, so they set the ceiling. `.mo__c` is `min-height:84px`,
and at 1024×768 the six rows plus the weekday strip leave **20.5px** of slack
before the cells hit that floor. Fixed 32px — the `.body` bottom rhythm — was the
first choice and overflows 1024×768 by ~11px, trading a missing terminus for a
scrollbar. So it is `clamp(12px, 2.2vh, 28px)`, and `vh` is the right basis for
once because what is being divided IS the window and not the trainer's data.

Measured with the foot forced to 0 and then restored:

| viewport | pad 0 | with foot | delta |
| --- | --- | --- | --- |
| 1024×600 | 147px over | 147px over | **0** |
| 1024×700 | 47px over | 47px over | **0** |
| 1280×720 | 0 | 0 | **0** |
| 1024×768 | 0 | 0 (16.9px foot) | **0** |
| 1440×900 | 0 | 0 (19.8px foot) | **0** |
| 2560×1440 | 0 | 0 (28px foot) | **0** |

The first version of the rule was ungated and cost 1280×720 six pixels of scroll,
because at 720px tall the cells already sit on their floor and the slack is zero.
The fix is not a smaller foot but **no foot**: a grid that scrolls does not need a
terminus, since the ambiguity the rule exists to remove — *has the month ended, or
is it cut off?* — is one a scrollbar already answers. So it is gated on
`@media (min-height:768px)`, which is exactly the case where the month fits
exactly.

### And then the same foot on the day and the week, which needed a different mechanism

The note above claimed the week and the day should stay flush because *"their last
edge is the last working minute, a boundary that MEANS something."* It does mean
something, and it still cannot be read when it is drawn on the edge of the glass —
and `useCwScale` fits the track to the container, so it lands there by
construction. Same defect, same fix.

Not the same mechanism, though. The month can use `padding-bottom` on its scroll
container because `.mo` is `min-height:100%` and a percentage resolves against the
containing block's **content** box: the padding comes off before `100%` is
computed, so the rows shrink on their own. This grid's height is not a percentage,
it is `useCwScale`'s arithmetic — and `clientHeight` **includes** padding. Padding
the container would size the track to fill the padding box and then push it past
the border box by exactly the foot: a scrollbar bought with the fix for a
scrollbar. Subtracting it back out inside `fit()` is worse, because the function
would then be reading a value it is also the cause of, one frame behind, through a
ResizeObserver.

So the foot is a **spacer** — a real element after `.cw`, whose height the hook
reserves *before* it divides. `clientHeight` never sees it, there is no loop, and
`.cw`'s `border-left` stops with the last segment instead of hanging a 1px stub
down the side of the gap (the same reason the month's foot went on the container
and not on `.mo`).

And the month's height gate becomes a measurement rather than a breakpoint: the
foot is reserved **only if the track still clears the 0.8 floor with it
reserved**. That makes it free everywhere — it never buys a scrollbar; on a screen
with room it costs a slightly shorter hour, and on a screen without room it is
simply not there. Measured, all three views:

| viewport | day/week foot | day/week overflow | month foot | month overflow |
| --- | --- | --- | --- | --- |
| 1024×600 | 0 | 200 / 237 (unchanged) | 0 | 147 (unchanged) |
| 1280×720 | 0 | 42 (unchanged) | 0 | 0 |
| 1024×768 | 0 | 32 / 69 (unchanged) | 17px | 0 |
| 1366×768 | 0 | **0** | 17px | 0 |
| 1440×900 | **20px** | **0** | 20px | 0 |
| 1920×1080 | **24px** | **0** | 24px | 0 |
| 2560×1440 | **28px** | **0** | 28px | 0 |

Every row with a foot has zero overflow, and every row without one is byte-for-byte
what it was before. The hour pays for it where it can: 1440×900 goes 1.02 → 0.99
px/minute, an hour of 61.2px becoming 59.4px. Click-to-book re-verified at the new
scales — 10 of 11 probes exact, the eleventh the same 7.5-minute snap midpoint.

**Still open at 2560×1440:** the day and week leave ~259px of canvas below the
grid, because `MAX_SCALE` caps the hour at 90px and 540 minutes of track cannot
fill 1160px. That is down from ~620px before the hour was measured at all, but it
is not zero. Raising the ceiling is a one-constant change; at 2.0 a 30-minute block
would be 60px and the gap would close to ~80px.

### Three places it deliberately differs from the design, and one from Today

- **Nothing is refused.** A clash is *named* — "Arjun S is already booked across
  this slot" — and the button still books, reading *Book anyway*. The rule is
  `WorkingHoursScreen`'s own and it holds for the whole product: working hours
  constrain what a **client** can self-book and have never constrained the
  trainer. A wall they cannot pass is a wall they work around by guessing.
- **A quiet band holding a session is HELD OPEN and says why.** It is not a
  control, because there is nothing to decide: collapsing it would hide a
  booking that was allowed to be there.
- **The roster in the booking form is ranked, not alphabetical.** `BookSheet.tsx`
  lists six clients alphabetically because a phone opens it from a floating
  button with no hour attached; here *the click is the hour*, so band one is
  "trains around this hour on Wednesdays" and the row says so. Never ranked by
  recency or volume — a ranking that reorders itself as the week fills is one a
  trainer cannot learn, and band one is only worth having because the same face
  is in the same place.
- **`utilisation` is null, never 0, when no hours are answered.** A trainer who
  never told us when they work is not 0% utilised, and printing that would be
  this screen inventing the denominator `GET /v1/working-hours` refuses to
  invent.


## Setup, and the two things about it that are not in the design set

**1 · There is no draft. Every step writes to the server as it is answered.**

The phone holds eight answers in `expo-secure-store` and PATCHes the lot at the
end, because its flow has to work with no signal. Online-only means the profile
IS the record here, so each step is its own committed write and the rail reads
back from `/v1/trainers/me`. Three consequences:

- resume is exact on any browser, any machine, and the trainer's own phone;
- §16's open item **"two drafts, one flow"** does not arise on this half. There
  is one record, so nothing races. Frame 4b's rule — *whichever finishes first
  wins* — is not needed here and is not implemented;
- frames 4a and 4b's offline promises are **dropped**, the same call `AGENTS.md`
  already records for the dashboard's banner and frame 1a. *"It saves on this
  browser and syncs when you are back on"* and *"your answers live on this
  browser, not on the server"* are false here; `lib/setup/copy.ts` carries what
  replaces them, and the replacement is the stronger promise.

One thing the profile has no column for is **which optional steps were
skipped** — and skipping is not answering, so without it `Continue` sends a
trainer back to the step they just declined. It lives in a 24-hour cookie
(`lib/setup/skipped.ts`), because *"I passed on that in this sitting"* is a fact
about a sitting, not profile data and not a preference. The cost is stated
there: skip a step here and your phone will ask it once more.

**2 · Two of the eight steps have no REST endpoint, and go through
`/v1/sync/push`.**

`working_hours` and `packs` existed on the wire **only** inside the WatermelonDB
envelope — grep the controllers and `SyncController` was the only hit. So steps 6
and 7 write through `/v1/sync/push` and read through `/v1/sync/pull`, from the
Next server, in `lib/setup/api.ts`.

> **`packs` has one now** — `GET`/`POST`/`PATCH /v1/packs`, added for `/packages`.
> This flow was deliberately **not** migrated onto it: it already reads
> `working_hours` from the same single pull, so moving the packs half would buy a
> second request and remove nothing. `working_hours` is still sync-only, and the
> paragraph below still governs this flow. **A new screen uses
> `lib/packs/api.ts`.**

That is a wire format, not a reversal of the online-only rule: no local
database, no stored cursor, no queue — one request per answer, and the trainer is
told when it fails. `pushWorkingHours` and `pushPacks` are trainer-scoped and
idempotent on the row id, which is what a single online write needs.

The reads are a full pull because there is no narrower one, and that is
affordable **here and nowhere else**: setup is only reachable while
`setupComplete` is false, so the account is new and the envelope is nearly
empty. **Do not reach for `pull()` on a built screen.**

A finished profile is Settings' to edit, so `/setup` and the eight steps redirect
a `setupComplete` trainer to `/today`. `/setup/done` deliberately does not — the
request that stamps the profile navigates there.

**3 · It is the first flow on this half that works on a phone, and webapp.css
has no media query in it.**

Every frame in the design set is drawn at a fixed 1440×900 so a reviewer can
compare twenty of them down one page, and `.stp` inherits that literally:
`grid-template-columns:332px minmax(0,1fr)`, which on a 390px phone leaves 58px
for the form. Only `.authwrap` had ever been made responsive (`app.css`, for
sign-in). Everything below is in `app.css` under *THE SETUP FLOW ON A PHONE*,
tested against the real components from 320px to 1440px.

- **The rail becomes a bar; it is never dropped.** `.authwrap__l` is the half
  that disappears because it carries no controls. The rail carries the only
  thing telling a trainer where they are, so under 900px it re-shapes: the
  count, the step's name and a meter across the top, with the eight-row record
  one tap behind *All steps*. **That meter is not the second progress system §10
  forbids** — that rule is about two being visible at once, and exactly one ever
  is: the bar on a phone, the rows on a desk. `Rail.tsx` is a client component
  for that one piece of state, and CSS overrules the toggle above 900px rather
  than JSX branching on width, so there is one rail and it cannot drift.
- **`.stp__ft` is a sticky dock.** §10's `margin-top:auto` puts Continue at the
  bottom of the *content*, which on hours and packs is a screen below the fold
  on a laptop and two on a phone. Sticky changes nothing on a step that fits and
  pins it on one that does not. Under 560px it stacks, and the order is §10's
  own argument in the other axis: Continue takes the whole bottom row, Back and
  Skip share the row above at opposite ends — out of the thumb's arc rather than
  merely to the left of it.
- **Every field in setup was 13.5px, and iOS zooms under 16.** `layout.tsx`
  declines `maximumScale` deliberately, so the fix is the field: `.ctl` goes to
  44px/16px under 900px. Only sign-in's two fields had been raised by hand.
- **The touch sizing is scoped to `.stp`, deliberately.** §03 puts the button
  height at 34 because "a 48px button in a desktop toolbar reads as a mobile app
  in a window", and an 880px browser window on a laptop is a desktop with a
  mouse. Unscoped, those rules would thin out `/today`'s queue for a trainer who
  merely narrowed their window. ~~When `/today` gets its own responsive pass,
  lift them out of `.stp` and pair them with `(pointer:coarse)`~~ — **done, see
  *Today on a phone* below.** They are now an application-wide
  `@media (pointer:coarse)` block, so a narrowed laptop window keeps §03's
  density and a tablet gets the targets it needs; the width-based rule had it
  backwards in both directions.

Four bugs the pass found, three of which were already live at 1440px:

| Where | What |
| --- | --- |
| `DayRibbon`'s scroller | `.stp__r` is a flex column, and flex shrinks before it scrolls. A scroll container's `min-height:auto` is **zero**, so the ribbon was squeezed to 0px on any step tall enough to overflow — the week the trainer just described, absent. `.stp__r > *{flex:0 0 auto}`. |
| `HoursForm`'s windows | Two 84px time inputs, "to" and a 32px button in a `width:190px` `.fld` — 232px of content in a 190px box, so both fields were shrunk to ~60px and `HH:MM` was clipped. `.fldrow` + no fixed width. |
| `NameForm`'s dock | The step wraps its field and dock in a `<form>`, so `margin-top:auto` never reached the column and Continue floated mid-page. `.stp__r > form` is the column now. |
| `CertificationsForm`'s results | Each result row is a button drawn with `all: unset`, which removes the **focus ring** — a searchable list a keyboard user cannot see themselves inside. `.rowpick` puts it back. |

Three smaller calls, each with its reason in `app.css`: a capped speciality chip
is `aria-disabled`, never `disabled` (a real `disabled` tabs a screen-reader user
straight past the seven chips they were not told about); the weekday row becomes
a seven-column grid under 560px rather than wrapping Sunday onto its own line;
and `.dr`/`.tblwrap` both say they scroll — the ribbon in words, at the width the
arithmetic says it is cut, and the price list with the `local`/`scroll` gradient
pair, coloured `--tx-line-strong` because a black shadow is invisible on a
`#101216` surface.

**4 · One design system, and eight places the flow had stopped using it.**

A second pass, this one about consistency rather than width. The rule it applies:
if webapp.css already ships the thing, the component uses it — an inline copy of
a class's values is a second definition that drifts on the next change, and in
three cases here it had already drifted into a bug.

Five that were bugs, not preferences:

| Where | What |
| --- | --- |
| `PacksForm`'s three work-mode cards | Set `border` **inline**, which outranks every selector — so `button.card:hover`'s border change never fired and all three were **hover-dead**. This is verbatim the defect `app.css` documents for frame 3a's two exits, and `.card--pick` / `.card--pick-accent` exist because of it. They also restated `border-color` over `.tinted`, which already sets it. |
| Every bare `.btn` in the column | `.stp__r` is a flex column and `align-items` defaults to `stretch`, which overrules `display:inline-flex` on the cross axis. *Add a pack* / *Add another* rendered as 1,000px secondary blocks — louder than the step's own Continue. A hierarchy inversion, live at 1440 since the step was written. |
| The work-mode row's width | The design draws those cards `flex:1` with no cap, invisible on a 1440×900 frame: in a browser the cards ran the full 1,050px column while the tables under them stopped at 560, so the step read as two columns of different widths. `--stp-measure` (620px, the widest card already in the flow) now names the measure. |
| `HoursForm`'s window label | A `<label>` with no `htmlFor` and no control inside it — the two time inputs carry their own `aria-label`, because one label cannot name two controls. A `<span>` now. |
| `app/setup/error.tsx`'s headline | Inline `fontSize: 26` pinned the longest headline in the flow at 26px on a 320px phone, defeating the clamp. |

Three where the flow disagreed with itself:

- **Step 8's chips had their own pressed state.** §16's frame draws the picked
  UPI chip with `accent-soft` / `accent-line` / `accent-text` set inline, so a
  chosen chip was a soft tint on step 8 and a solid lime `.chip[aria-pressed]`
  on steps 2–6. One flow, one pressed state — and on the screen whose whole job
  is *read this back to yourself*, the unambiguous fill is the better of the
  two. `.wk` went with it: that is the schedule sheet's week-key row, and a chip
  row here is `ChipRow` like every other. `PackSheet`'s type chips became `Chip`
  for the same reason.
- **Three cards, three ways of putting a heading on a card.** `PackSheet` used
  `.card__hd` + `.card__t`; `HoursForm` hand-rolled §17's `.h5` values inline;
  `Done` put `.card__t` inside the body with no rule under it. All three use
  `.card__hd` now.
- **Boxes that were already classes.** `NameForm`'s initials preview was six
  inline declarations adding up to `.card`; `Done`'s meter ticks were a
  hand-rolled 16px square duplicating §07's `.check` (now `.check--static` — the
  pointer cursor and the 32px hit slop come off an indicator, and the state is
  `data-done` rather than an `aria-checked` on a span with no checkbox role);
  `Preflight`'s five rows declared 13.5/ink and 12.5/ink-3 where `.h5` and
  `.small` say exactly that; and ten `.small` elements restated the
  `--tx-ink-3` the class already sets.

**And four steps quietly asked twice.** `saveList` only marks a step answered
when the list is non-empty, and `leavePacks` never marks one at all — so Continue
with nothing picked *wrote, navigated, and left the step unsettled*, which means
`nextStep` sends the trainer back to it on their next sign-in. The flow's own
promise is that nothing in this product asks twice. Continue now refuses an empty
answer on specialities, languages, certifications and packs, with **one legible
rule for the tone**: red when the step cannot be left without an answer (name,
experience, specialities, languages), amber when a Skip exists (certifications,
hours, packs, payment). Two costs, stated: a resumed trainer can no longer clear
every speciality from inside setup — clearing an answer is Settings' job — and
"I quote per client" is now spelled *Skip*, which is the button that means it.

**`PacksForm` also dropped a pack on the floor.** Open the panel, type a name, a
count and a price, press Continue: `leavePacks` navigates and the panel's fields
are local state on a screen that has gone. Continue now says which button they
meant.

**Step 2 stopped navigating on a click.** `ExperienceForm` wrote and moved on the
click itself, which contradicts the reason its own comment gives for not porting
the phone's 200ms auto-advance — *"a trainer who mis-clicked has no way to see
they did before the page has gone"* is equally true at 0ms. It also made step 2
the one chip step of four that behaved differently, on the step where a trainer
has just learnt the pattern. The click selects; Continue advances. **The cost is
real and deliberate:** on the three short steps the dock sits at the bottom of a
mostly empty column, so that click is a long way from the chips. A wizard's
action bar being in the same place on all eight steps is worth more than the
travel, and the dock is sticky now, so it is never out of sight.

**Copy: the design-rationale footers were trimmed, and this is a judgment
call worth knowing about.** Every step ended in a paragraph arguing for itself —
the teardown's eight platforms, the 38% dim, the endowed-progress study's 34%
against 19%, *"there is no greeting on this screen because we do not know your
name yet"*. Addressed to a reviewer rather than to a trainer, and on a phone the
difference between a step fitting and not. The reasoning is unchanged and still
lives where it belongs, in the components' and `meter.ts`'s comments. **What was
kept is every promise made to a trainer** — *We don't check these*, *We checked
the shape, not the account*, *Skipping is fine*, *If you skip this*. One line had
to change rather than shrink: frame 4b said *"the rail on the left is the
record"*, and under 900px there is no left.

## The price list, and the one letter that is the whole screen

`/packages` reads **`pack`**. The Money book reads **`package`**. One letter, and
it is the entire domain: a pack is what the trainer *offers* (a 12-session block
at ₹9,000); a package is what one client *bought*. Changing a price must never
rewrite a sale, and it cannot, because they are different rows in different
tables.

**Money's Packages tab is still there and still lies a little.** `computePackages`
groups *sold* rows by `(type, sessionsTotal, amount)` and calls each cluster a
price point, so a pack nobody has bought yet does not appear and a one-off
discount invents one; its gym card is hardcoded to *"aren't on file yet"*. That
was the only thing possible when `pack` was unreachable over REST. The tab is
deliberately left alone — it answers *what sells*, from sales — and the new route
answers *what do you sell*, from the list.

### The rule the screen exists for

**An independent trainer has one list. A trainer who does both has two.** They are
separated rather than mixed because only one of them is theirs to change: a gym's
counter price is one the trainer can neither set nor discount, and their cut of it
is the gym share, not a margin. Add-client asks which of the two applies before it
asks anything else, so the two lists have to be two lists all the way down.

`buildPacks` in `lib/packs/compute.ts` owns it, in two lines and one asymmetry:

```
showsOwn = mode !== 'gym' || selling.length > 0
showsGym = mode === 'gym' || mode === 'both'
```

The asymmetry is deliberate. *At a gym* still draws the trainer's own list
**whenever they have prices on it**, because hiding a list somebody has already
filled in is losing their data behind a radio button they can change back. The
phone infers the second list from `gym.name` alone; this reads `workMode` as
well, which is the same answer asked out loud instead of guessed at.

**And *How you work* is on this screen, not only in setup.** That is a departure
from the phone, and the reason is `/settings` — it is `NotBuilt`, and setup
redirects a `setupComplete` trainer away. Without the control here, a trainer who
answered *On my own* in onboarding and later started at a gym could never reach
the second list at all. It is a **defaults hint, never a gate**, the same words
`lib/setup/options.ts` uses: who actually collects is still decided per client.

A gym with no name is refused rather than saved, on both halves. An unnamed price
list belongs to nobody — the group would have nothing to head itself with, and a
package on it could never be attributed.

### Four requests, and the pull this screen is the reason for

`lib/setup/api.ts` allows itself a full `/v1/sync/pull` and says why — setup is
only reachable while the account is nearly empty — and ends *"do not reach for
`pull()` on a built screen."* A price list opened by a trainer with a year of set
logs behind it is exactly the screen that comment forbids, so **three endpoints
were added**: `GET /v1/packs`, `POST /v1/packs`, `PATCH /v1/packs/{id}`
(`payment/PackController.java`, documented in `backend/API.md`). Additive: no
schema change, and `pushPacks` in `SyncService` is untouched, so no phone build
notices.

The screen costs four scoped reads — `/v1/trainers/me`, `/v1/packs`,
`/v1/packages?status=active`, `/v1/clients`. The last two are only for *Ending
soon*, which is here rather than on the roster because renewing is a money
decision and this is where the prices are.

**`activeClients` comes down on the pack, counted in SQL.** Every caller wants
"3 clients are on this" — it is what makes retiring a decision rather than a
click — and deriving it in the browser would mean shipping every sold package to
a screen with no other use for them.

### Three things about the writes

- **Retiring is `status`, never a delete.** Everyone already on a pack keeps
  exactly what they bought; it simply stops being offered. The confirmation says
  that in those words, because the button otherwise reads like a delete — and
  `package.pack_id`'s foreign key would refuse the delete anyway.
- **`owner` cannot be changed after creation, and is not in the PATCH body.**
  Moving a pack between the two lists would re-attribute every package sold from
  it. `pushPacks` refuses the same move, by `COALESCE`ing a null owner to what is
  already stored rather than letting an old build flatten it.
- **The 400s are sentences, not statuses.** `PackService` answers *"A pack needs
  a price."*; `lib/packs/api.ts` reads `detail` off the body and `actions.ts`
  prefers it over anything it could invent, because the server owns the rule.

### Two components are shared rather than copied

`components/setup/PackSheet.tsx` grew an optional `seed` and a `submitLabel` and
now serves both screens — the phone's own `PackSheet` carries the identical note
and the identical reason: *setup and the packs screen are the same question asked
at two moments.* `seed` is read **once, at mount**, so a caller editing a list
must `key` it by the pack's id or clicking a second row re-opens the first one's
numbers. The work-mode row uses `Chip`/`ChipRow` for the same reason, which also
settles the a11y — `aria-pressed` on a toggle button, never `role="radio"`, which
does not support it.

### Where it sits in the rail

`BUILD`, as an eleventh destination with a `K` accelerator — beside Programs,
Exercises and Sessions rather than beside Money, because BUILD holds the
catalogues a trainer authors once and applies many times, and a price list is
that shape. **Not in `PRIMARY`**: `BAR` is derived from it, and a fifth
destination there is a sixth target on a 390px screen, which is the one thing the
centre + cannot survive.

Its `Wallet` glyph is **the one icon in `components/shell/Icons.tsx` that is not
from the design set**, because the set has no such destination. Same 24-box, same
1.6 stroke.

### Not built, and worth knowing

- **The panel is an inline card, not the money book's right-hand `aside`.** The
  form is the setup flow's, and it was already a card there for a stated reason:
  adding two or three packs in a row is the common case, and a modal opened and
  dismissed three times is three dismissals a desk does not need to spend.
- **Reordering.** `order_index` is read, respected and sent, and nothing on the
  screen changes it — the phone has no reordering either. A new pack lands at the
  end of the list it joins.
- **The gym's share percentage** is displayed on the gym group's head when it is
  on file, and cannot be edited here. It belongs with the rest of the arrangement
  on Money's *Gym share* tab.
### Checked by rendering, against the dev database

The convention this file sets, honoured: the backend was built and run on
**:8090** beside the one already on :8080, a production build served on **:3100**
from a COPY of the tree, and both screens screenshotted at 390, 768, 1024 and
1440 through a ~40-line CDP driver. Two trainers were used and they are the
two cases the screen exists to tell apart — one `work_mode='both'` with a gym and
two lists, one `independent` **who also has a gym name on file**, which is the
case that proves the rule reads `workMode` and not `gymName`.

Three things about the harness, because the first two cost an hour each:

- **Copy the tree.** `next dev` refuses a second server in one directory, and
  `next start` in the real one fights the running dev server for `.next` — the
  symptom is a screen that renders the PREVIOUS build intermittently, which reads
  exactly like a component that half-works. `node_modules` must be **copied, not
  symlinked**: Turbopack rejects a symlink pointing out of the project root.
- **A fresh CDP target per shot**, and set the cookie with `Storage.setCookies`
  and a `url` rather than `Network.setCookie` with a domain — the domain form
  silently set nothing and every capture came back as `Unavailable`. Reusing one
  tab left the previous `setDeviceMetricsOverride` half-applied, so a 390px shot
  came back holding a 1440px rail.
- **Pace the captures.** Each page load is four requests against the STANDARD
  tier's 120/min, and a tight loop of screenshots rate-limits itself into
  `Unavailable`.

Seven defects, and **five of them were invisible to the type checker and the
linter, which both passed on every one**:

| Where | What |
| --- | --- |
| the two-column grid | Set `gridTemplateColumns` **inline**, which outranks every selector — so `app.css`'s own `@media (max-width:1080px){.grid2{…1fr}}` never fired and a 390px phone drew two columns: a price table in 190px with *Price*, *Per session* and every action off the end. Verbatim the defect this file already records for `PacksForm`'s three work-mode cards, which is the argument for never reaching for the style attribute here. `.pk__grid`. |
| the price table on a phone | Even stacked, `.tblwrap`'s horizontal scroll put *Edit* and *Retire* off the right edge — the exact thing `/today`'s queue refused ("the column a trainer would have to scroll to reach is the one holding every action"). It reflows to labelled blocks now. **Not `.tbl--stack`:** that rule drops the header, which the queue can afford because it has none and a table of four bare rupee figures cannot. |
| …and then the reflow showed no money | `.tblwrap > .tbl{min-width:420px}` held the table at 420px inside a 366px card, so a `space-between` cell put its label at x=0 and its figure at x=420 — three labels, no figures. The table has to stop being a table box, not just its rows. |
| *Ending soon* | `.kv` is `align-items:baseline` on a two-item flex line, right for a key and a figure. With an avatar, two lines and a button, the wrapped text pulled *Renew* to the FIRST line's baseline and the button sat **on top of** "2 sessions left · 10-session pack". `.pk__end`, start-aligned. |
| the honesty note | `.why` has no BOX rule on this half — webapp.css defines only `.why .small`/`.why .kv__k`'s tinted text — so it rendered as bare paragraphs on the canvas. **Pre-existing, and not this screen's to fix:** `RecordPanel` and `AddClientDrawer` use it too, and adding a `.why` box would restyle three components in a pass about a fourth. This one uses a `.card`. |
| the subtitle | Read **"1 yours · 1 the gym's"** — the phone's `buildPacks` phrasing, and "1 yours" is not English. It echoes the two group headings now: "1 you sell · 1 Revoke Gym sells · 6 active". |
| `POST /v1/packs`, a 500 | A session pack posted with no count answered **500**, not the 400 the validation was written to give: `a ? null : b ? 1 : req.sessions()` has one `int` arm, so Java unboxes the whole expression and a null `sessions` is an NPE before any check runs. if/else. Found by curling the endpoint, not by reading it. |

And one that only a real response body could show: **every refusal was landing
with its sentence stripped.** `ResponseStatusException` serialises through the
servlet error page as `{timestamp,status,error,path}` because this backend sets
no `spring.mvc.problemdetails.enabled` — so *"A pack needs a price."* reached the
log and never the trainer, and `lib/packs/api.ts` reading `detail` off the body
got nothing. `PackRuleException` + a handler, the shape `TeamRuleException`
already established, and every 400 now carries `detail` and a `code`.

**Still open:** at 1440 the left column ends well above the right one on a short
price list, leaving dead canvas. Cards are top-aligned in both tracks, which is
the same shape `/today`'s third row has, and evening it out is a design call
rather than a bug.

## Programs — the shelf, the builder, and the copy · 29 Aug 2026

`/programs` and `/programs/:id`, against `webapp-programs.html` (nine frames) and
the product brief of the same day. `lib/programs/` holds the model:
`blueprint.ts` is the pure half — every write on the builder is a function from
one entry list to another — `api.ts` is the only place that talks to the backend,
and `actions.ts` is every write.

**The page it replaces was drawing nothing, and had been since it was written.**
`GET /v1/templates` answered with the storage spelling (`exercise_id`,
`day_of_week`) while `TemplateExerciseWire` declared camelCase, so every field
read `undefined`: six templates on the shelf, each "0 days a week · 1 wk", none
with an exercise in it. It typechecks on both sides — a Java `Map` serialises
whatever keys it holds and a TypeScript interface is a claim the JSON never has
to satisfy — so nothing but looking at the screen could catch it.
`BACKEND_GAPS.md` 9 has the whole entry.

### The four laws, and three are older than this screen

1. **A day is an ordinal slot, never a weekday.** "Day 1" is the first day this
   program trains. Which weekday it lands on is the CLIENT's, chosen once at
   assign time into `program.schedule` — V24's law. Hence no Rest column
   anywhere: rest is the absence of a slot and the absence is already drawn by
   there being no column.
2. **A day exists when the trainer lays it out, not when something lands on it.**
   `trainingDays` is the authority; the union with wherever exercises sit is a
   FALLBACK for templates authored before the column was writable. Deriving the
   list from the blueprint alone has the trap the design names — the first
   exercise goes on Day 1, Day 1 becomes the only day the program has, and
   there is nowhere to put Day 2's first exercise.
3. **A week with nothing of its own repeats week 1.** That is the whole model of
   a multi-week block, and it is what lets an eight-week program exist without
   the blank twelve-week grid the phone refuses. A ghost chip in the week strip
   is a repeating week; a solid one was authored.
4. **Sets is a list, not a count.** "Four sets, the last two to failure" is an
   ordinary prescription and an exercise-level mode cannot say it. `setDetail`
   is the list; `sets` and `reps` stay authoritative *while the sets agree*, so a
   straight 4 × 12 is exactly what every pre-V31 build reads.

### A copy is a copy, and that is the point

`POST /v1/templates/{id}/apply` writes an independent `program` with its own
`program_exercise` rows. **Nothing reaches back through `program.template_id`**,
so editing a blueprint six people are on changes the blueprint and nothing else —
which is what makes *Duplicate* the most-used action on the screen rather than a
nervous one.

The deliberate override is `POST /v1/programs/{id}/resync`, one program at a
time, from the *Who is on this* panel, behind a confirm that names what it will
not touch: **the client's weekday and time stay exactly as they are**, and every
set already logged is untouched, because history keys on the program and the
exercise and never on a `program_exercise` row id.

`behindTemplate` on the assignments read is a FACT, not a warning. A copy that
differs from its blueprint is the normal state of a good coaching business.

### The progression rule is the one thing with no frame

The design set draws the weeks-across view — how you *read* a progression — and
stops there. The brief asks for the other half: *"week 1: 3×8, week 2: 3×10,
week 3: 3×12. Set once instead of typing 36 cells."* Nine exercises across eight
weeks is seventy-two edits, and a builder that costs that to express an ordinary
block is one a trainer abandons for a spreadsheet.

`ProgressionPanel` is one row per week, because that is the thing being written:
a generator ("+2 reps a week") cannot say "weeks 5 and 6 deload". The four quick
fills are SEEDS for the grid, not its replacement. It names the weeks it is about
to overwrite before it runs, and it only writes the weeks in the plan — laddering
1–4 of an eight-week block leaves 5–8 repeating week 1, which is law 3 rather
than a gap.

### Three things this screen does differently from the design

- **The builder autosaves; there is no Save button.** The design's reason is the
  sync pill — *"adding, removing and reordering are local writes, and the sync
  pill answers 'is this safe yet'"* — and this half has no pill because it has no
  queue. The honest equivalent is a debounced autosave with the state said in the
  header and a retry when it fails. Debounced rather than per-keystroke because
  `template.structure` is one jsonb column: every save rewrites the whole
  blueprint. **The row panel keeps its explicit Save**, which the design also
  draws and gives the reason for.
- **The undo stack is real, at 20.** The design's *still open · 01* is "the undo
  stack itself — specified at 20 steps and drawn here at one". Every write is a
  pure function from one entry list to another, so the stack is a stack of arrays
  and costs nothing.
- **`targetLoad` is offered, empty.** §22 refuses a load on a template and says
  why — *"a load is not a field a template has"* — which is true of the phone's
  blueprint and false of the wire: `targetLoad` has been on
  `TemplateExerciseInput` since templates existed and `apply` has always copied
  it. The brief asks for it. So it is an optional starting point with a sentence
  saying whose number it becomes, rather than one the screen invents.

### And one thing it deliberately does not build

**Circuits, EMOM and AMRAP-as-a-format** — the design's *still open · 03*, and
its reasoning is unchanged: a superset costs one nullable field and a timed
circuit is "a container with its own duration, holding exercises whose rest is
the container's. That is a table, not a column, and it should wait until somebody
asks."

### Checked by rendering, against the DEV DATABASE

The convention this file sets, honoured: the backend built and run on **:8090**,
a production build served on **:3100** from a COPY of the tree, a JWT minted
against the dev secret, and a ~70-line CDP driver clicking the real controls at
1920, 1440, 1024 and 390. **The harness is deleted; rebuild one if this screen is
touched.** Two notes on top of the ones the earlier passes left: a template's
`updated_at` is what `list()` sorts on, so a write moves a row on the shelf
mid-session; and restore anything you write to the seed data — one run here took
a set to failure on *Push / Pull / Legs* and the row had to be put back.

Eight defects, and **none of them was visible to `tsc`, `eslint` or
`next build`, all three of which passed on every one**:

| Where | What |
| --- | --- |
| `GET /v1/exercises?ids=` | Read as a bare array. It is a filter on the SEARCH route, so it answers `{exercises, total}` — a 200 that throws on the spread, and the first thing that happened when the screen met a real backend. `lib/sessions/api.ts` had unwrapped it correctly all along. |
| `ORDER BY t.updated_at DESC` | **The shelf reshuffled between page loads.** The seed stamped all six templates with an identical `updated_at`, and an ORDER BY with ties may return any order it likes. A shelf picked from by position as much as by name cannot do that. Total sort: `updated_at DESC, created_at ASC, id`. |
| the tab strip | Drawn in the shelf-only branch and nowhere else, so **opening a program took the exercise library off the screen** — which is the exact argument `tabs.ts` makes for it being a tab at all ("trainers only visit it while building") running backwards. |
| the FAILURE column | `.check` in §17 is a styled box keyed on `[aria-checked="true"]` holding a tick it reveals. A native `<input type="checkbox">` matches `:checked` and not that, so it drew the design's empty box with the browser's widget on top and never filled. A `<button role="checkbox">` instead, which also gets §17's 32px hit slop that `.check--static` deliberately removes. |
| the assign form's seed | The comment said "three days a week means Mon/Wed/Fri, not Mon/Tue/Wed"; the arithmetic under it spread evenly across seven and produced **Mon/Thu/Sun**. The comment was the half that was right. A table now. |
| the library's filter chips | `.slice(0, 8)` over an alphabetical list meant *abductors, abs, adductors, biceps, calves, cardiovascular system, delts, forearms* — and a trainer building a Push day found neither chest nor back. A truncated filter row is worse than none, because it looks complete. |
| the day-count `<select>` | A `<select>` sizes to its widest option and then draws the platform chevron INSIDE that box, so "3 days a week" ran under the arrow. |
| `.pg .rowpick` | Fifteen client names in the assign panel, every one a button, and nothing said so — `.rowpick` is `all:unset` plus a focus ring, right for search results under a field being typed in and not for a list. And `space-between` put the meta under the scroll container's own scrollbar: *"2× a wee"*. |

The end-to-end check worth repeating: take set 4 of *Barbell bench press* to
failure and save. The row should read **`3 × 6, 1 × F · 120s rest`** with the F
in `--tx-danger`, and the stored blueprint should hold `set_detail` with
`to_failure` on the fourth, `reps` **null** and `sets` still **4** — incomplete
but true for a pre-V31 reader, which is the whole additive-only argument in one
row.

### The grip was inert, and now it drags · 29 Aug 2026

§22 draws `.dayc__h` — the six-dot handle on every builder row — with
`cursor:grab` and a hover step-up, and **nothing had ever been attached to it.**
The column shipped with the two pointer-free paths the design set argues for (the
row menu's *Move up* / *Move down*, and select-then-*Move to*) and the one
affordance a mouse actually reaches for did nothing. A grab cursor over a row
that will not move reads as a broken feature rather than as a missing one, which
is how it was reported.

It is a real HTML5 drag now, and the two keyboard paths are untouched — they are
still what satisfies SC 2.5.7, and this is the pointer shorthand for them. Five
things about it are load-bearing:

- **`dropEntries` is a new write, not a run of `nudge`s.** `moveEntries` appends
  to the end of a day and `nudge` swaps two neighbours; neither can say "this one
  goes third". Twelve swaps would also be twelve undo steps for one gesture. It
  takes a `beforeUid` (null for the tail) and returns **the same array** when the
  drop changes nothing, so `commit`'s `value === prev` guard keeps a thought-better-of
  drag off the undo stack and out of the autosave.
- **A block is the drag unit.** A superset is one target and one payload — a drop
  indicator between 4a and 4b would offer to put a row *inside* a pair, which
  `blocksOf` would then split into two blocks nobody asked for. Grabbing either
  member carries both, via `expandToWholeGroups`.
- **The drop is measured once, on `.dayc__b`,** against the rendered
  `[data-block]` elements — not per row. The marker sits on the group wrapper for
  a superset and on the row itself for a single, which is the same distinction the
  block model already makes.
- **Whether a drag is ours is asked of the PAYLOAD, not of React state.**
  `dragstart` and the first `dragover` land in the same task, so a gate on the
  `dragUid` prop misses that one — found by rendering, where the drop worked and
  the indicator never appeared. `dataTransfer.types` is readable during a drag
  where `getData` is not, so the private `application/x-inclineyou-row` type is the
  gate. `dragUid` survives for the payload and the dimming, which are both read
  a frame later.
- **The row is `draggable` only while the grip is held**, armed on the handle's
  `mousedown` and disarmed on a window `mouseup`. A permanently draggable row
  turns a click that wanders two pixels into a move, on a row whose click already
  means *select*.

A repeating week neither drags nor accepts a drop: it is showing week 1's rows,
and a drop there would silently edit week 1.

**Touch is deliberately not covered.** HTML5 drag does not fire on a touch
screen, and select-then-*Move to* already works there — the same trade
`/schedule` made when it built its move as select-then-place for everybody.

Checked by rendering, per this file's convention: a throwaway `app/fxdrag` route
holding two days, a superset and six rows, driven by a ~60-line CDP driver that
**synthesises the DragEvents in the page with a real `DataTransfer`** — Chrome
cannot be told to drag from `Runtime.evaluate`, and React's handlers cannot tell
the difference. Five moves verified end to end (reorder, a pair moved whole,
a pair grabbed by its second member, and both directions across two columns),
plus the indicator's position on each and a screenshot of it mid-drag. **The
harness is deleted; rebuild one if this screen is touched.** One note for
whoever does: address a superset member by the name it renders, not by
`[data-block]` — that marker is on the group.

## Nudges — no screen, buttons everywhere, and a log that stops the nagging · 29 Aug 2026

The brief opens with a deletion: **remove the tab.** A nudge belongs next to the
thing that triggered it, and making a trainer navigate somewhere else to follow
up is exactly the friction that stops the follow-up happening.

`/nudges` was already off the rail — the five-destination pass moved it, calling
it "buttons where the nudge is sent; the template library in Settings" — and left
both halves of that sentence unbuilt. This builds them.

| | Where |
| --- | --- |
| **the sending** | Today's hero (the trailing card and the evening card), the attention queue, the roster's action column, the pending list, the price list's *Ending soon*, a no-show session, the client's file |
| **the wording** | `/settings/nudges`, the only nudge screen in the product |
| **the record** | `nudge_log`, readable over REST for the first time |

### Delivery is a `wa.me` deep link, and that is the feature

The server renders the message, logs that it was drafted, and hands back
`https://wa.me/91XXXXXXXXXX?text=…`. The browser opens it; WhatsApp opens with
the text in the box; the trainer reads it and presses send. **Nothing in this
product has ever sent a message and nothing here starts.**

That is the right answer for v1 rather than a scoping compromise. It costs
nothing, needs no Business API approval, no Meta trust tier and no template
review — and a message from the trainer's own number lands in a thread the client
already has open, where one from a platform number lands beside the delivery
notifications and is ignored. **Automation would make this worse.** Scheduled and
automatic nudges are v2, and `nudge_rule.action = 'auto'` is the column already
waiting for them.

One consequence worth carrying: `window.open` runs after an `await`, so a popup
blocker may refuse it and `noopener` makes the return value `null` either way —
there is nothing to test. So the sent state **always** renders a real *Open
WhatsApp* link beside the receipt. `AttentionQueue` learned this the hard way and
its comment is the one to read: a row that says *Sent* when nothing opened is the
worst outcome on the screen, because the nudge IS logged and the cooldown then
suppresses the reminder that never went.

### The template library — an override table, and the web holds no copy

`nudge_template` (V32) is one row per trainer per template name, holding an
override of `NudgeTemplateCatalog`'s built-in wording. Eight templates: the
brief's six plus `check_in` and `session_reminder`, which already existed.

**A trainer who has never opened the library has no rows at all.** Seeding eight
on signup was the obvious alternative and it is wrong — it freezes today's copy
into every account, so improving a default sentence would reach nobody. Reset is
a soft delete for the same reason: it puts them back on the LIVE default, not on
a copy of whatever it was the day they joined.

**`lib/nudges/` holds no wording, no labels and no variable meanings.** All three
come down from `GET /v1/nudge-templates`. The root `CLAUDE.md` opens with what
happens when a policy number lives in three files; eight message bodies is a
worse version of the same trap, because a drifted sentence is one a client
actually receives. The only thing declared on this half is the set of NAMES, as a
union TypeScript can check a call site against.

**`{count}` means a different number in every template, on purpose.** The brief
writes it twice and means two things — "you have {count} sessions left" and
"that's your 50th session". Splitting it into `{left}` and `{done}` was the first
attempt and it is worse: a trainer editing the renewal template should not have
to remember which of five count-shaped variables this one takes. There is exactly
one count per template and the editor prints what it means. `{nth}` exists
separately because `"your {count}th session"` produces *your 111th* and *your
3th* — an ordinal is not a number with two letters after it, and a template
language that lets a trainer discover that by shipping a typo to a client has a
bug in it.

**An unknown token is left as itself**, on the server and in the preview, rather
than blanked. A trainer who typed `{nmae}` sees `{nmae}` in their own WhatsApp
composer before they press send; blanking it is how a client receives "Hi , you
owe .".

**The preview is a sample and says so.** `lib/nudges/preview.ts` substitutes
fictional values with a name nobody on the roster has. It is not the renderer —
the server renders against live figures, so the amount in a payment reminder is
the same number the money book shows — and if a second renderer ever appears on
this half the first symptom will be a WhatsApp quoting a figure the trainer
cannot find anywhere in the app.

### The cooldown — read at last, and enforced by silence

`COOLDOWN_DAYS` ("never twice in seven days to the same person") has been
computed **on the phone** from its local `nudge_log` since the drawer was
designed, and `lib/today/actions.ts` recorded the consequence in its own
docstring: the table reached the wire only inside the sync envelope, so a
reminder sent from a laptop was invisible to the phone's cap and vice versa. `GET
/v1/nudges` closes it — both halves read the same rows.

**It silences the prompt. It does not block the button.** A contacted client's
queue row sorts below every uncontacted one — whatever band either is in — so on
a normal morning it is behind `QUEUE_CAP`'s disclosure and the trainer never sees
it. When they open the fold it reads *messaged 2 days ago*, and the verb still
works.

Blocking was the first design and it is wrong: a trainer pressing *Remind* on
somebody they messaged on Monday knows something the product does not — the
client replied, or asked to be chased again on Thursday — and a refusal teaches
them to open WhatsApp directly, which loses the log for **every** client rather
than enforcing the cap for one. `lib/nudges/cooldown.ts` carries the argument.

Three details in `deck.ts`'s ranking that are load-bearing:

- **it is per client, never per template.** The cap is a promise to a person: a
  client who got a payment reminder on Monday and a check-in on Tuesday has been
  messaged twice by somebody they pay. Keying it on `(client, template)` would
  let six bands each spend their own weekly message on the same person.
- **only the message-shaped bands are quietened.** `MESSAGE_KINDS` is `pack`,
  `overdue`, `missed`, `quiet`, `milestone`. `unmarked`, `no-program` and `log`
  are the trainer's own housekeeping — messaging Meera does not mark her Tuesday
  session done, so demoting that row would be the cooldown reaching into work it
  has nothing to do with.
- **contacted rows tie-break on who was contacted LONGEST ago**, so the queue
  refills in the order the cooldowns lapse.

`COOLDOWN_DAYS` now exists in four places — the phone's `rules.ts`, the backend's
`NudgeService`, `lib/nudges/cooldown.ts`, and `deck.ts` **imports** the third
rather than restating it. Change all four.

### The buttons, and the three surfaces that changed shape

`components/nudge/NudgeButton.tsx` is one component everywhere. It reads
`LastContactProvider` for "when was this client last messaged" rather than taking
it as a prop, because on three surfaces it lives four rows deep inside a screen
whose rows are nested functions — and a screen whose author forgot to thread the
prop would draw a button with no note under it, which looks exactly like a client
nobody has messaged. A screen with no provider draws no note and still sends;
`/packages` and `/sessions` deliberately do not spend a request on the history.

| Surface | What changed |
| --- | --- |
| the roster's action column | **it used to be a button that did nothing.** Every row with an attention band drew `{row.attention.action}` as a bare `<button>` with no handler — *Remind*, *Check in*, *Renew*, live since the screen was written. The three message-shaped bands send now; the other three state the verb as a tag rather than offering a second dead button |
| the pending list | *Remind* opened a right-hand panel that explained what a reminder is and then offered a button that drafted one — three surfaces for one act, on the screen a trainer opens to chase eight people. `components/money/RemindPanel.tsx` is **deleted** and the row drafts directly |
| *Ending soon* on the price list | had *Renew* and nothing else, so a trainer looking at six packs about to run out had to open six files to have six conversations. `renewal` beside it — the conversation comes first, the sale second |
| the hero's trailing card | gained a second verb. Not the lead card: its verb is *Start session*, the client is about to walk in, and a WhatsApp button beside it is one pressed by accident |
| the evening card | *Confirm*, which is the one hour of the day `session_reminder`'s wording is right |
| a no-show session | the card stated the fact and stopped. `missed_session` — which names what happened without a reproach in it, where `check_in` would read as not having noticed |
| the client file | a *Follow-ups* card on Overview: the history, plus the seven templates a trainer might choose deliberately. `re_engagement` is offered **here and nowhere else**, because nothing on this half raises a lapsed row |

**The header's WhatsApp button stays a plain link and still logs nothing.**
`Header.tsx` already carried the argument and it is unchanged: routing it through
the nudge endpoint would spend the client's weekly message on "are we on for
Tuesday" and quiet the overdue reminder three days later. What is drafted from a
nudge button is logged; a chat opened from the header is not.

**They are not held for ten seconds and the queue's verbs still are.** The
queue's hold is about the queue: six rows cleared fast, from a list whose purpose
is to be emptied. These are one button about one person, and the review step is
already the delivery — the composer opens with the draft in it. `lib/today/
actions.ts` keeps its own `remind`/`checkIn`/`wish` for the same reason, and
`lib/nudges/actions.ts` says why merging them would cost more than it saves.

### Settings became a real screen, because the library lives under it

`/settings` was a `NotBuilt` placeholder **outside the `(main)` group**, so it
drew no rail and no tab bar — and §2b made it the account menu's only entry point
when it moved Settings off the rail. All three settings routes moved inside the
group and the index lists what is there, honestly: *Nudge messages* built,
*Your working week* marked *Soon* and not a link, per the centre +'s own rule
that a tap teaching the trainer nothing is worse than a word that does.

### Not built, and neither gap is an oversight

- **Scheduled / automatic nudges.** v2, behind the Business API's trust tiers —
  and see the delivery argument above for why the manual version is not a
  stepping stone to it but the better product for v1.
- **A nudge button on `/today`'s session rows and `/sessions`' list rows.** Both
  rows are a single `<Link>` wrapping every cell, so a nested `<button>` is
  invalid markup and the fix is a stretched-link restructure of a layout this
  pass did not open. The same clients are reachable one row away — the hero, the
  queue, the session's own page — so it is a convenience, not a hole.
- **`{birthday}` / a birthday template.** There is no date of birth anywhere in
  this schema. V12 declares a `birthday` nudge kind and no column to feed it ever
  landed; this is the third place in this file that records it.

### Checked by

`npx tsc --noEmit`, `npx next build` and `npx eslint` clean on every file this
pass created or edited (`app/(main)/team/page.tsx`, `Palette.tsx`,
`NewClient.tsx`, `ExerciseLibrary.tsx` and `Team.tsx` were failing before it and
are untouched). Backend: `./mvnw -B verify`, 207 tests, including
`NudgeTemplateTest` — thirteen cases covering the override/reset cycle, the
per-trainer isolation of both the wording and the history, the rendered message
carrying the client's real balance, and the two formatting rules that only fail
on real data (**the teens take "th"**, and **`DecimalFormat("#,##,##0")` does not
do Indian grouping** — it honours only the last group size, so it emitted
₹120,000 and the grouping is written out by hand).

**Not verified by rendering.** No signed-in session could be driven — the OTP is
bcrypt-hashed in Redis — so nobody has yet LOOKED at the template library, the
follow-up card, the settings index or any of the seven buttons on a real page.
That is the convention this file sets everywhere else; rebuild a fixture harness
the first time this is touched.

## Checks

`npx next build` typechecks and builds; `npx eslint .` is the linter. There is
no test suite on this half — the backend's `ProgramAuthoringTest` covers the wire
casing, the `week` round trip, the snapshot rule and the resync.

## The console, and the four things it is arranged around

The workout log is the phone's screen, and this half must not become the place
logging happens. What the desk adds is three things a 390px screen cannot do,
and the layout is those three: **the history beside the entry** (twelve weeks of
top sets while you type today's load), **catching up a session logged on paper**
(a keyboard beats a stepper by an order of magnitude for twelve sets), and
**correcting the past** (a set typed wrong in November, two clicks, and because a
record is computed on read it fixes nine months in the same frame).

### The route's `:id` is whatever identifies the session

`/sessions/:id` is a **booking**. `/sessions/:id/log` takes the same id where
there is one, so a trainer moves between the read and the write without the URL
changing shape. Frame 5a's third group is the exception — *everybody else · no
booking needed* — and a log started from there is named after itself. `resolve`
in `lib/log/api.ts` tries both against one list already fetched, which is one map
lookup rather than a second request; the alternative was a second route for
unbooked logs and a branch on every link into the screen.

`?ex=` is the exercise in focus and `?plus=` every exercise added to today's grid
that has no set in it yet. Both are in the URL because *a place gets a URL, a
moment does not* — and the exercise in focus **is** a place: a trainer with a
half-typed row and an accidental reload should land back on it. The drafts are
not, which is the honest split: a half-typed row survives a scroll and does not
survive leaving the session.

### The rule this screen is most likely to break

**Finishing the log does not move the pack. A pack moves on *done* or *no-show*,
never on *booked*.** So starting a log is `POST /v1/workouts` and never
`POST /v1/sessions/{id}/done` — the second creates the same log AND decrements
the pack. The strip's fourth figure says what the pack is *now* and frame 5b's
sentence says what marking it done will do to it, which is status about something
that did **not** happen and the harder kind to remember to show. `markDone` reuses
a log that already exists against the booking, so the two paths never make a
second row.

### And the mark is not optional — 28 Aug 2026

Frame 5b used to offer three ways out: *Mark the session done*, *They didn't
train*, and **Later**. Later is gone, and this is a deliberate reversal of what
this file said before.

**The attendance mark is the pivot of the product.** It feeds the balance, the
balance feeds the expiry warning, the warning feeds `/today`, and `/today` is
what drives a renewal. An unmarked session breaks that chain silently — and the
proof it happened is already in this file: the `unmarked` attention band (row 6
of the deck table) exists precisely because trainers took *Later* and never came
back, so the product ended up building a second screen to chase the escape hatch
the first screen offered.

What did **not** change: a pack still moves on *done* or *no-show* and never on
*booked*, and the three outcomes still mean exactly what they meant. Forcing the
mark does not change what a mark is; it stops the product suggesting the trainer
skip the one tap nobody can reconstruct later.

**It is not a lock, and the copy does not pretend it is.** The rail is there and
so is the back button — a browser tab cannot be held hostage, and a screen that
claimed otherwise would be lying to the one trainer who tests it. What is removed
is the *offered* escape.

`/sessions/:id` carries the other half: a booking whose time has passed with no
outcome on it draws a `why--warn` naming the state and linking to frame 5b. The
diary's `unmarked` band still exists and is now the second net rather than the
first.

### Three things the model does that the phone's does not have to

- **`workout_exercises` is not on the wire**, so today's grid is reconstructed
  from the program's rows plus every exercise with a set in this log
  (`buildRows`). An exercise added on frame 3a is a place to type until the first
  tick, which is what makes frame 3a's *today's log only* literally true.
  BACKEND_GAPS 7.
- **There is no bulk set-log read**, so the console reads a window of the
  client's recent sessions and takes the all-time maximum load per exercise from
  `GET /v1/clients/{id}/progress` as `judge`'s floor. Without the floor a bounded
  window would hand out gold for beating a number that was never the best — which
  is the one thing the record must never do. BACKEND_GAPS 3 has the two holes
  that remain.
- **`exercise.log_type` is not on `ExerciseResponse`**, so `readLogType` infers
  from the client's own sets first and equipment second. BACKEND_GAPS 5.

### Where the design's copy is deliberately not used

Frame 5c says *a no-show costs a session* and calls it the single difference
between its three outcomes. Nothing on the wire moves a pack for a no-show —
`markDone` is the only endpoint that touches `sessions_remaining`, and there is no
package write at all. §14 of the design settles it: *where a document disagrees
with the code, the code wins*. `NotTrained` in `components/log/Finish.tsx` says
what each option actually writes and carries the reason, so nobody restores the
design's line. BACKEND_GAPS 6.

### `.why` is a component and it was dropped by accident

`webapp.css`'s header lists §02's review-page chrome as removed and the list is
right about `.doc__*`, `.unit`, `.viewport` and `.bench`. `.why` — *"the callout
that carries a design decision"* — is declared in the same block and is not one of
them: six frames on this screen use it, plus the schedule's. It is restored in
`app.css`, byte for byte, minus `max-width:var(--w-measure)` (a reading measure is
right in a document column and does nothing in a 380px sidebar).

### And the grids are classes, not inline styles

Every frame in the design set is drawn at a fixed 1440×900, so its grids are
`style` attributes with pixel tracks in them, and an inline style cannot carry a
media query. `.wkc` and `.wk2--*` in `app.css` carry the console's three, with the
breakpoints and their arithmetic beside them: 1180 (the history column moves under
the grid rather than disappearing — the reason to look at history is still to
decide today's load), 980 (the exercise list is navigation, so it stops being a
column), 760 (measured off `.stats--4`: 4×180 + 3×12 = 756px), and 820 for the set
table, which **scrolls inside its own container rather than dropping a column** —
§09 protects Previous by name and RPE is the column the desk exists to add.

### The rest clock runs now · 29 Aug 2026

`.rst2` was built as the design set draws it — a **label**: `2:00`, *rest after a
bench press set*, and **Change**. That is what the rest IS, and until now it was
all the console had. Ticking a set started nothing, so the strip named a number
nobody was counting.

The frames could not have drawn otherwise: a still cannot draw a countdown, and
`webapp-workout.html` names per-exercise rest autostart only in the competitor
table (*"Take Strong's per-exercise rest"*), which is a decision recorded and not
a frame owed. So the running state is a delta, in `app.css` beside the others —
`.rst2--run` plus `.rst2__bar` / `.rst2__fill` — and never in `webapp.css`.

Four things about it are load-bearing:

- **It is the same strip.** The trainer has already found that row; the number
  they were reading starts moving. A clock appearing elsewhere on the tick is a
  second thing to learn and a second thing to look for. The sentence goes while
  it runs — *per exercise, not per trainer* is an argument you read once, and the
  seconds are the only thing worth the width when the client is standing there.
- **`endsAt` is wall-clock, not a counter** — the phone's rule
  (`app/src/screens/main/log/LogScreen.tsx`), and it matters more here: a browser
  throttles `setInterval` in a background tab, so a trainer who spends forty
  seconds in WhatsApp must come back to a clock that spent them. The interval
  ticks at 250ms and re-derives from `Date.now()`, which also makes `+15` land in
  the digits at once instead of up to a second later.
- **It starts on a tick that logged something new, never on an edit.** `commit`
  branches on `row.setId` for the `logSet` / `updateSet` choice already, and rest
  starts only on the first. Catching up Tuesday's paper log at nine in the
  evening must not start a 90-second clock for a set lifted three hours ago —
  and that catch-up is one of the three things this console exists for.
  Un-ticking takes the rest back with it.
- **No rest set starts nothing.** `startRest` returns on a falsy `restSeconds`,
  and the strip goes on saying *no rest set for … yet*. This is the phone's rule
  and the honest one: the trainer has not said how long, and a defaulted 60
  seconds is a guess we would then have to defend. **It is also the first thing
  to check when somebody reports the timer not starting** — the exercise has no
  `rest_seconds`, on its program row or its `workout_exercise` row, and
  **Change** is the fix.

The clock is owned by `Console` rather than `SetGrid`, keyed by `exerciseId`, and
handed down filtered to the open card. So opening another exercise does not
inherit its clock and does not stop it either: a trainer reading ahead is not a
trainer finishing the rest.

**Zero is a state, not an ending** — and this is the one place the console
deliberately does NOT copy the phone. `LogScreen.tsx` deletes the rest at zero,
which is right in a hand: you were holding the thing and watching it. At a desk
the trainer is looking at the client, and a clock that removes itself exactly
when it matters has told nobody anything. So `Rest.over` flips instead, the
interval stops (the effect returns early on it, so nothing counts what is not
being counted), and the strip turns `--tx-ok` green and carries an
**instruction**: *Rest over. Set 3 of bench press is up.* — or, when no slot is
left, *and that was the last bench press set*, which is the more useful sentence
at the end of an exercise and the only thing on the card that knows.

*Rest over* alone would be a fact about the past that the trainer half knows
already; the set number is what they cannot see without counting rows. It stays
until the next tick replaces it, **+15 more** (which buys fifteen seconds from
*now*, not from an end already receding into the past) or **Got it** clears it.

Two things it deliberately does not do. **It does not move** — `webapp.css` and
`app.css` between them define zero `@keyframes`, the system is still on purpose,
and a pulsing strip would be the only moving thing on the screen. **It does not
sound** — a chime is a product decision no frame authorises, and a desk that
beeps in a gym office is a worse product, not merely a later one. What it does
instead is announce: a **persistent** `.vh` `role="status"` lives in `card__b`
whether or not it has text, because a live region inserted at the same moment as
its content is read unreliably across screen readers. The running clock is
`role="timer"` and stays silent; its end is the one thing worth interrupting for.

### Load and reps step · 29 Aug 2026

A `−` / `+` pair flanks each of the two entry fields — **2.5 kg** on load, **1**
on reps. `.stp` / `.stp__b` in `app.css`; §09 draws six inputs and no buttons,
because on a phone the field IS the stepper: a numeric keypad is one tap away
and the thumb is already there. A desk has a mouse and no keypad, and the two
numbers that change between sets are the load, by a pair of 1.25 plates, and the
reps, by one. RPE gets no pair — it is judged and typed once, not nudged.

- **The pair flanks its own field, not the gap between the columns.** One pair
  in the gap could not say which number it moved, and the two steps differ.
- **It steps from what is SHOWN**, which on an untouched row is last time's
  number — so `+` on a row offering 60 kg claims 62.5 in one press, which is the
  progression the column is for. §09's *never put a number in a row nobody
  lifted* still holds: the trainer pressed the button, and the field loses
  `.said` the moment they do.
- **Reps floor at 1, load at 0.** A bare bar is a real set; a 0-rep row is not,
  and `commit` would post it, since it only refuses a row where load **and**
  reps are both absent.
- **`tabIndex={-1}`, deliberately.** Tab order down the row is Load → Reps →
  RPE and that is what makes *catching up a session logged on paper* fast —
  four more stops per row would make the keyboard path 2.3× longer to serve a
  control a keyboard user does not need. WCAG 2.1.1 is met by the input: the
  function is keyboard operable where it always was. Same argument `app.css`
  makes for dropping the accelerator bar on a touch screen, pointing the other
  way.
- The set table's 820px `min-width` went 520 → **620**, and the buttons go
  entirely below 560px, where they would be under a 44px target anyway and the
  field wants the width back.


## The roster, restructured — one derived tag per row · 27 Aug 2026

The list view of `/clients`, on the product owner's brief. The design is the one
`webapp-clients.html` draws and it is unchanged in shape: header, filter chips,
summary strip, tools row, table on the desk and cards on a phone. What changed is
what each row *says* and what order the rows arrive in.

**Nothing new was asked of the backend.** `endDate` on `PackageResponse` and
`no_show` on `SessionResponse` were both already on the wire and simply unread by
this screen; `PackageWire` in `lib/clients/api.ts` gained one field to read the
first, and that is the whole wire change.

### The tag is derived, and the order it is derived in is the decision

`ClientTag` in `lib/clients/roster.ts` — *At risk · Expiring · Lapsed · Prospect ·
Paused · Active*. A trainer sets none of them, which is the point: a status
somebody has to maintain is a status that is wrong by the second week, and all six
facts are already in the response.

Four of the five thresholds are a `deck.ts` constant rather than a new number,
because the brief's numbers and the ladder's turned out to be the same numbers —
and a tag reading *Expiring* at a different count from the row reading *Pack ends
in 2 sessions* would be one client described twice. `LAPSED_DAYS = 30` is the one
new one.

A client qualifies for three of these at once on a normal Tuesday, so `readTag`
is ordered, and two steps of it are arguable:

- **`lapsed` above `at-risk`.** Being at risk means there is something left to
  save; a month of silence is past that. A roster that files a client last seen in
  July under *At risk* never tells the trainer who has actually gone.
- **`at-risk` above `expiring`.** A pack running out on somebody still turning up
  is a renewal conversation; the same pack on somebody who has stopped is a
  leaving one. Renewing a pack for a client who is drifting away is not a
  conversation that happens.

`paused` wins over everything derived, and it is the one tag that is not derived —
a trainer pausing a client is stating a fact, and a paused client who has not
trained for three weeks is not drifting, they are paused.

### "Missed 2+" is read twice, and the row says which reading fired

`deck.ts`'s `missed` band is a STREAK — two no-shows in a row over *settled*
sessions — and it stays exactly that, because it writes the row's sentence and two
screens on this half phrasing one client differently is the bug those helpers
exist to prevent. The TAG also fires on `MISSED_RECENT` no-shows inside
`MISSED_WINDOW_DAYS`, consecutive or not, which is the brief's own reading.

The first fixture run showed why the second reading needs its own row: a client
tagged *At risk* by two scattered absences sat under a *What's up* column reading
*Base · Week 5*, with no action button. A tag making a claim about somebody the
trainer knows, with no evidence beside it, is a tag they stop believing. So the
scattered case raises the band too, with its own sentence — *Missed 2 sessions in
30 days* — and that phrasing lives in `roster.ts` rather than in `deck.ts`,
because a helper added to a file that is a port of the phone's is drift.

While it was there: the roster's `quiet` verb became **Check in**, which is what
Today has said since the ladder pass. Two rows offering *Nudge* and *Check in* for
the same act — asking after somebody — was about to be live on one screen.

### The sort is a tier above the weight, not a replacement for it

`attentionTier` in `roster.ts`: at risk → expiring → **dues** → lapsed → prospect
→ everyone else → paused. `attentionWeight` then orders rows *inside* a tier, so
every phrasing, severity and within-band ordering is still Today's, and no row is
worded or coloured differently on the two screens.

Which means this screen and Today deliberately order the same clients differently
now, and the reason is what each list is: Today is a queue of things to **do**, and
a package running out outranks money owed there (the decision of 27 Aug 2026).
This is a list of **people**, ordered by who is closest to leaving.

**Dues is a tier without being a tag.** Money owed is a state of an invoice, not a
state of a client; it has its own axis in the filter panel and a column on every
row, so a seventh chip saying it again would be the third place on one screen.

### The chips are the tags, and two of them went away

*Needs attention* and *Invited* are gone from the filter row. Attention is not a
state a client is in — it is the union of four of them, and it is already what the
default sort and the group header say; *Invited* is the same set of clients as
*Prospect* under the name the product uses for them. The group header stays,
because grouping the list and filtering it are different acts — and it now counts
what is **on screen** rather than what is on the roster, since a header reading 11
above four rows is a number that costs the rest of the screen its credibility.

### Search is in the list, and it is not the palette

`SearchBox` is rendered twice against one piece of state — the desk tools row and
over the phone card list — because the two views are a CSS swap and a query typed
at 1440px has to survive the window being narrowed.

It does not replace ⌘K. The palette **jumps** to one client from anywhere in the
app; this **narrows** the list in place, which is the only one of the two that
answers "who owes me money in the morning batch". Phones are matched on digits on
both sides — a trainer reads a number off a WhatsApp thread as `+91 98410 22119`
and the column holds `9841022119` — and only from two digits in, so a name never
becomes a phone search.

### The columns, and the one that was traded

Name · what's up · **status** · sessions left · pending · last attended. Eight
columns, the same eight as before: *Where* gave up its column to *Status* and the
mode moved onto the client cell's meta line beside the phone, which also keeps the
number visible on every row — it is half of what the search matches.

Two smaller ones: **Last logged became Last attended**, which is a workout log OR
a session someone ticked off, whichever is later, because an unlogged session a
client turned up to is still a session they turned up to (the `quiet` band keeps
reading logs only — that one is a fact about the trainer's logging, and the deck
already says so). And the **Pending** cell is toned rather than plain, red past
`OVERDUE_DAYS` and amber before it, which is `moneyBand`'s own threshold so the
colour and the sentence cannot disagree.

### Checked by rendering, against a fixture of ten

A temporary route rendered the component over ten synthetic clients, one per tag
plus the two edge readings, and was deleted after. It is worth restating what it
caught, because none of it was visible in the source: the evidence-free *At risk*
row above, and the group header counting the roster instead of the screen.

The phone card's tag is a **sibling** of `.crd-row__main`, never a child:
`.crd-row__main span` sets `display:block` on every span inside it and outranks
`.tag`, so a tag nested in there renders as a full-width block.

### The divergence from the phone, stated

`app/src/clients/roster.ts` has no tags and still sorts by weight alone. `app/` is
not edited from this half without being asked, so this is a known divergence, not
drift — and it is the second one now, after the ladder. Whoever closes either
moves both halves in one commit.

## The client file, restructured — six tabs, a header that answers two questions, and a strip that is not a tab · 27 Aug 2026

On the product owner's brief. The design set draws frames 3a–3e of
`webapp-clients.html` — overview, sessions, package, programs, body — and three of
those five are unchanged in substance. What changed is the arrangement, and one
thing arrived that had nowhere to live before.

| | Before | Now |
| --- | --- | --- |
| tabs | Overview · Programs · Sessions · Package | Overview · Progress · Sessions · Program · Payments · Notes |
| progress | a route of its own, off the workout console | a tab |
| body metrics | a ghost button beside the tab strip, going nowhere | inside Progress |
| the money | *Package* — the live pack only | *Payments* — every pack, every payment, lifetime totals |
| notes | nowhere. **There was no storage for them** | a tab, plus a pinned strip above the tabs |
| the header | name, status, three verbs | + the pack, the pending amount, WhatsApp and call |
| the component | one 1,103-line file with a component declared inside a render | `components/clients/file/`, nine files |

### The health strip was asked for, and it is a NEUTRAL NOTE STRIP

The brief asked for "a pinned health strip — injuries, conditions, PAR-Q flags …
always visible, never buried. This is a safety feature as much as a UX one."

**The safety affordance is built. The health fields are not, and must not be.**
Four documents forbid them and none of them is a preference:

- `notes/InclineYou_MVP_interaction_map.md`: "**No medical or health-condition fields
  anywhere** — no injuries, no conditions, no medications … Do not design an
  'injuries / health notes' field into intake", filed under *legally excluded, not
  deferred*, against the DPDP Act 2023;
- `InclineYou_final_requirements_and_plan.md` NFR-8: "no medical/health-condition data";
- `InclineYou_core_data_model.md` §3.2: the client note is "free text; **no medical
  fields**";
- this file, above: the deck's *Has a note* chip "must never grow a variant that
  means 'medical' — the moment a flag distinguishes a health note from any other
  note, the product holds health data whatever the column is called."

So `.cfpin` is the trainer's own **pinned notes**, headed *Before every session*,
in `--tx-warn`'s ground and with no medical iconography anywhere near it. A
trainer types "left knee — no deep squats" and the product stores the characters
and shows them back at the top of every tab. It classifies nothing, indexes
nothing and flags nothing, and **that is what keeps it a note rather than a health
record.** The decision was put to the product owner on 27 Aug 2026 with the
alternative — build the structured version and do the DPDP work — and this is the
option they took.

The sanctioned path to structured health data is unchanged and is §5 of the data
model: a separate `health_note` table with its own consent and access controls. A
different feature, not a wider version of this one.

### V29 · `client_note`, because there was no storage at all

`InclineYou_core_data_model.md` §3.2 has listed `client.note` since the first draft and
**`V1__init_schema.sql` never created it.** No column, no endpoint, nothing on the
wire. The doc now says so and points at the table that replaced it.

`V29__client_note.sql` — `client_id`, `trainer_id`, `body`, `pinned`, soft delete.
Four routes under `/v1/clients/{id}/notes` (`backend/API.md`). Three things about
it are load-bearing:

- **`trainer_id` is the privacy rule.** A team widens reads over a teammate's
  client and must not widen this, for the same reason no role sees a teammate's
  money book. Every read narrows by the author, so a coach holding a client
  somebody else wrote notes on gets an **empty list**, and editing one is a `404`
  rather than a `403` — asking about somebody else's note should not confirm it
  exists. `ClientNoteTest` pins both, with the client row reassigned to the other
  trainer so that every client-level check passes and only the author predicate
  stands.
- **`pinned` is one flag, not a second table.** The strip and the tab are two
  prominences of one thing, and two stores would drift and need two writes.
- **Both `PUT` fields are optional and absent means unchanged.** That is what lets
  the strip's *Unpin* send `{pinned:false}` without the text, and the tab's editor
  send `{body}` without the pin, through one route.

Not in sync, per V26's and V28's argument. **`app/agent/InclineYou_core_data_model.md`
was deliberately not updated** — it is under `app/`, which is not edited from this
half without being asked. `notes/` and `backend/agent/` are in step; that third
copy is one `cp` behind.

### Every tab is a route now, and that fixed a real defect

The strip was `useState` seeded from an `initialTab` prop, so five routes rendered
one component and four of them forgot which one they were the moment anything else
set the state. Six `<Link>`s: the back button works between tabs, a Payments tab
is linkable, and the active tab cannot disagree with the URL because there is only
one of them. `force-dynamic` already re-fetched per request, so the round trip
costs nothing that was being saved.

`/package` and `/programs` **redirect** to `/payments` and `/program` rather than
404ing.

### `ProgressBody` is extracted, not re-implemented

`components/log/Progress.tsx` now exports `ProgressBody`, `ProgressRanges` and
`useProgressQuery`; the standalone route is the shell around them. The Progress tab
renders the same component the console does, so the volume bars and the top-set
sequence cannot drift into a second rendering of the same numbers. `range` and
`focus` stay in the query string — a chosen range is a *place*, and a trainer
showing a client six months should be able to send that link.

### Two decisions in the header worth keeping

- **WhatsApp here is a conversation, not a nudge.** `POST /v1/clients/{id}/nudge`
  writes a `nudge_log` row, and the phone computes a once-per-client-per-7-days
  cooldown from that table (`app/src/nudges/rules.ts`). Routing this button through
  it would spend the trainer's weekly reminder on "are we on for Tuesday" and
  silently cap the real overdue-payment reminder three days later. It is a plain
  `wa.me` link that logs nothing. **The money book's *Remind* should stay the only
  thing that nudges.**
- **The pack and the pending amount moved out of Overview into the header**, so they are
  visible from all six tabs — and Overview's two stat cards came out with them. A
  figure drawn twice on one screen is a figure the reader has to check against
  itself.

Adherence also went from `kept/total` over **7 days** to a rate over **30**. On a
two-sessions-a-week client the old denominator was two, so one missed session read
as 50%. The seven-day figure is kept beside it.

### Checked by rendering — six tabs × nine widths, and it found six defects

The convention this file sets, honoured. A throwaway fixture route under
`app/(main)/fx/`, inside the real `AppShell`, with a client carrying 26 sessions,
two packs, three payments, two programs, five measurements and four notes; driven
by a ~60-line CDP driver at 320, 390, 620, 621, 768, 1024, 1440, 1920 and 2560.
**54/54 clean at the end. The harness is deleted; rebuild one if this screen is
touched.**

| Where | What |
| --- | --- |
| `.ph__tabs` | **Two tabs were not on the page.** It is a bare `display:flex` with no wrap and no scroll, measured for the four tabs this file used to have. With six, *Payments* and *Notes* rendered at x=495 and x=586 on a 390px screen — clipped by `.ph`, unreachable, and `documentElement` reported **zero** horizontal overflow throughout, which is why the type checker, the linter and the build all passed. It scrolls under 900px, gutter to gutter, with the `local`/`scroll` fade pair. **Not wrapping:** a wrapping tab row changes the header's height with the labels in it, so the body would start somewhere different on every client. |
| `Row`'s two spans in `OverviewTab` | They carried `flex:1` and `text-align:right` **inline**, which outranks every selector — so the 320px rule that stacks the row was firing and losing, and *PACKAGE BALANCE* clipped under it. Verbatim the defect this file already records for `PacksForm`'s work-mode cards and `/packages`' two-column grid. The inline styles are gone and the sheet says it. |
| `.stats--3` / `.stats--4` | Both are pinned counts with no breakpoint — and webapp.css says why the count is pinned, in this file's own words: "auto-fit left a single orphan tile on its own row in the client file." True at 1440. At 320 it is three 109px tiles with **every figure in them clipped**. Two rungs, scoped to `.cfstats` and `.cfprog` rather than to the shared classes, because a pass about this screen does not get to restyle one it did not open. |
| the tables, at 620 | First attempt was `grid-template-columns:auto 1fr auto` with later cells forced to `grid-row:2` — which works for three cells and not for the session row's six, so cells four to six auto-placed onto a third row and left a hole a line high. A wrapping flex row serves all three tables without any of them declaring a column count. |
| the payments table's method cell | `text-transform:capitalize` title-cases every word, so it read **"Upi · You Collected"** — an acronym lower-cased and a plain phrase shouting. The method is a proper noun and the rest is not, so they are cased separately in TS and the CSS does nothing. |
| the composer's hint | `⌘↵` came back as tofu — both glyphs fall outside the mono face. It says `CTRL + ENTER`. |

**Not verified by rendering: the four note writes end to end.** The fixture holds a
synthetic client id, so a save would 404 against the real API, and driving the real
screen needs a signed-in trainer. `ClientNoteTest` covers all four verbs and the
privacy rule at the HTTP layer, and the server actions are thin wrappers whose
shapes the type checker holds against `ClientNoteWire` — but nobody has yet clicked
*Add note* against a live backend.

### One thing left open

At 1440 the Overview and Progress tabs leave dead canvas below the shorter column.
Cards are top-aligned in both tracks, which is the same shape `/today`'s third row
and `/packages`' price list have, and evening it out is a design call rather than a
bug.

## A session is a destination now · 28 Aug 2026

`/sessions/:id` was a placeholder for most of this project's life, and five
surfaces routed around the hole by pointing at the client file instead. Three of
them said so in a comment — *"because `/sessions/{id}` is still a placeholder and
a client's file is where the answer actually is"*. It is not a placeholder any
more: it carries the prescription, the log, the client's pinned notes and, on a
session nobody closed, the sentence saying so. So every surface that draws one
session now addresses that session.

| Surface | Was | Is |
| --- | --- | --- |
| `today/PhoneStack.tsx` · deck rows | `/clients/{id}` | `/sessions/{id}` |
| `today/DayRibbon.tsx` · ribbon blocks | `/clients/{id}` | `/sessions/{id}` |
| `today/Hero.tsx` · the four session cards | no target at all | the card's **name**, via `nameHref` |
| `shell/Rail.tsx` · session pins | `/clients/{id}` | `/sessions/{id}` |
| `clients/file/SessionsTab.tsx` · rows | nothing, except *Mark it* on unmarked rows | the whole row, `role="link"` |
| `sessions/Sessions.tsx` · list rows | `/sessions/{id}` when done or no-show, `/schedule` otherwise | `/sessions/{id}`, every row |
| `schedule/*` · blocks | the side panel, always | the panel if it has not happened; `/sessions/{id}` if it has |

The hero cards take the link on the **name** rather than as a third button. Each
is tuned to two verbs — *Start session*, *Open the log*, *Move Meera* — and this
file already records why the trailing cards get no *Start* at all: a third verb
down a row blunts the one that matters. A name is what a trainer points at when
they mean "that one", and it costs the card no weight.

Two of those are worth more than a table row.

**The rail's pin reads as a client and is addressed as a session**, and that is
the honest split rather than an inconsistency. The pin exists *because* there is
a session today; the time beside the name and the tick that replaces it are that
session's, and only one of the two things the slot could open explains what the
tick is about.

**The schedule splits on which side of *now* the block is**, and this is the one
place the answer was not obvious. An upcoming session is a set of decisions —
length, delivery, a note, move it, cancel it, mark it no-show — and every one of
them is a conversation with the grid behind the panel; sending the trainer to
another page to change a duration and back to see what it did to Thursday is the
wrong trade. A past session has nothing left to decide and a record that does not
fit beside a week. So `openSessionById` in `Schedule.tsx` routes on
`done || noShow || dead || late`, and the panel gains an *Open the session* link
for the sessions that still reach it. `late` is
`!done && !dead && scheduledAt + minutes <= now`, so what is left on the panel is
a session still to come or one running right now.

### And the panel's edits are staged behind one Save

Length and delivery used to `PUT` on the chip press and the note had a Save of its
own, so editing all three was three round trips and two of them were invisible.
`updateSession` is a `PUT` that **replaces** the row, which makes three separate
writes of one edit wrong twice over: three chances to leave a half-applied
session, and the second write is built from a row the first has already changed.

The three controls now hold local state, `dirty` compares it against the row, and
one Save sends the lot. The button exists **only while something is unsaved**,
which makes its presence the answer to the question a staged form owes the person
leaving it. Two details that are not incidental:

- **The panel is keyed on `session.id`.** Clicking a second block while the first
  is open has to remount, or the first session's unsaved note is sitting in the
  second one's box. That bug already existed for the note before any of this.
- **The length chips are listed from `session.minutes`, not from the staged
  value.** `lengthChoices` drops its odd fifth chip "the moment the trainer picks
  one of the four", which was right when the pick was the write — staged, it would
  take *40 min* off the screen before anything was saved and leave Discard as the
  only way back to it.

A note on a settled session was always allowed and still is: length and delivery
lock, the note does not.

## Primary navigation, restructured — eleven destinations to five · 28 Aug 2026

The rail carried **eleven** rows in three groups — `PRIMARY`, `BUILD`, `GROW` —
and the groups were the tell. A navigation column that needs headings has stopped
being a list of places and started being a taxonomy of them.

It is **five** now, and the change was mostly a deletion:

| Tab | Purpose |
| --- | --- |
| Today | What needs doing right now |
| Clients | Who they train, and each person's full picture |
| Schedule | When |
| Programs | What the clients do |
| Business | Money, packages, reports |

Six of the eleven were not destinations at all. They were **tabs that had
escaped**, and every one of them is now one level closer to the screen that wants
it — not further away:

| Was a rail row | Is now | Old route |
| --- | --- | --- |
| Exercises | a tab inside **Programs** — trainers only visit it while building | `/exercises` → `/programs/exercises` |
| Packages | a tab inside **Business**, plus *Assign a package* on the client file | `/packages` → `/business?tab=packages` |
| Sessions | **not a destination.** A flow, launched from Today or Schedule; the history lives on the client's timeline | `/sessions/*` unchanged, out of the nav |
| Reports | a tab inside **Business** | `/reports` → `/business?tab=reports` |
| Nudges | buttons where the nudge is sent; the template library in Settings | `/nudges` → `/settings/nudges` |
| Team | Settings and the account menu — a permissions surface, not a daily one | `/team` unchanged, out of the nav |
| Money | renamed **Business** and widened to hold packages and reports | `/money/[month]` → `/business` |

`components/shell/nav.tsx` is still the one place the destinations are declared,
and it now carries a `purpose` per row — the rail hangs it on `title=`, the sheet
draws it, and `Palette.tsx` reads `PRIMARY` instead of the four rows it used to
hand-type (which had already drifted: it offered `G M` for a rail whose
accelerator was `M`, and no way to reach the exercise library at all).

### Money became Business, and the rename is not cosmetic

*Money* named a table. A trainer looking for their price list or their retention
did not think to open it. **Business names the question**, which is the same move
*Today* made over *Home*, and it is what let two rail rows and a stub become tabs
instead of three destinations competing for one slot on a phone.

Seven tabs, flat: *Payments · Pending · Packages · Gym share · GST · Write-offs ·
Reports*. The alternative — three tabs (Money · Packages · Reports) with the money
book's six underneath the first — was rejected because two stacked strips is the
`BUILD`/`GROW` taxonomy again, one level down.

**The tab is in the URL now.** `Money.tsx` held it in `useState` seeded from a
prop and moved it with `router.replace`, so the param and the state could
disagree and nobody could link anyone to *Pending*. It has to be a real param
regardless: *Packages* is a different fetch (`requirePacks()`, four calls), and a
strip where six tabs are state and one is a fetch is a strip with two behaviours.

**And the month is not.** See *The period is state, and the URL is `/business`*
below — that came later and reverses half of what this section originally said.

**One duplicate died in the merge.** The money book had its OWN *Packages* tab,
which grouped SOLD rows into price points it inferred; `/packages` read the `pack`
table, which is where the prices actually are. Two screens with one name, drawn in
different rail groups so nobody had to notice. Putting them on one strip made it
impossible to miss. `components/money/PackagesTab.tsx` is deleted and
`components/packages/Packages.tsx` is the tab. Nothing is lost — what a given
client BOUGHT was always better answered on their file's Payments tab.

### *Assign a package* is the client half of that fold-in

`?record=<clientId>` on `/business` opens the record panel with that person
already chosen, and their pack and amount filled in when they have exactly one
running (two is ambiguous and left blank rather than guessed). The client file's
*Sell a pack* and *Renew the pack* were bare links to `/money`, which landed the
trainer on a month view with the panel shut and the name in their head rather than
in the form.

### The period is state, and the URL is `/business`

Business shipped as `/business/[month]`, with `/business` redirecting to today's
month. The segment is gone; the route is flat.

**The argument for it was factually wrong.** It said the month "decides what is
FETCHED" and the tab decides what is DRAWN, so only the month belonged in the
path. But `getMoney()` has never windowed: `/v1/payments` with no `from`/`to`, on
purpose, because a full book is a couple of hundred rows — and `computeLedger`
slices it in the browser. The segment named a filter over a payload the page
already had, and charged a redirect on every bare `/business` plus a `YYYY-MM` to
parse and validate on every render.

**And one month is the wrong unit for half the questions on the screen.** *Is
collection getting worse*, *did the gym's cut move*, *is this a bad month or a bad
quarter* are answered by a span, and the old picker made the trainer open three
URLs and hold three numbers in their head. A path segment can hold one calendar
month; "the last 3 months" is a moving window with no date of its own.

So `lib/money/period.ts` defines a `Period` — `{kind:'month', year, month}` or
`{kind:'recent', months: 3|6}` — and `components/money/PeriodPicker.tsx` (which
is `MonthPicker` with two rows above the grid; `MonthPicker.tsx` is deleted) picks
one. The spans go first, above the year stepper, because coarse-then-fine is how a
trainer narrows. They are anchored to **today**, never to the year the grid is
parked on, and the current month is always whole — a span's upper bound is the end
of the month `now` falls in, so a payment recorded later today is inside the range
that claims to include today.

Consequences worth knowing:

- `computeLedger`, `computeGymShare` and `computeWriteOffs` take a half-open
  `{from, to}` instead of `(year, month)`. `monthBounds` survives for `computeGst`
  and nothing else; `monthSlug` and `parseMonthSlug` are deleted with the route.
- **Nothing is persisted.** A reload lands on the current month. A tab change
  keeps the period, because a tab change is a soft navigation and React keeps the
  client component's state across it.
- `MONTHLESS_TABS` is `PERIODLESS_TABS`, same three members. *Pending* still draws
  the picker even though `computeOwed` ignores it — a debt is owed as of now
  whichever month you look at, but a control that vanishes on one of four
  neighbouring tabs reads as a bug rather than as a statement about debt.
- Every tile that said "this month" now says what it means: `periodTag` on stat
  keys (*Billed · Aug*, *Billed · 3 months*), `periodProse` in sentences (*No
  write-offs in the last 6 months*).
- `/business/[month]` and `/money/[month]` still redirect, but they can no longer
  carry the month — the destination has no place to put it — so an old link to an
  old month lands on the current one. The tab rides along.

### The bar drops two now instead of one

`Today · Clients · (+) · Schedule · More`. `HIDDEN_FROM_BAR` is `['prog', 'biz']`
— Programs is authored at a desk in a sitting, the money book is read at the end
of a shift, and the other three are what every row on the day points into. The
sheet went from a three-group taxonomy to two rows, today's pins and the account,
which is the restructure arriving on the surface that had least room for it. The
*More* dot still sums the counts behind it, and `biz` carries the only `alert`
tone in the shell.

### Shared pieces this pass added

- **`components/shell/PageTabs.tsx`** — the tab strip, written down once. Four
  screens drew it four ways and only one set `role="tablist"`. These are `<Link>`s
  with `aria-current="page"`: a tablist promises arrow-key movement between panels
  that do not exist until the server sends them. `app.css` adds
  `.tab[aria-current="page"]` beside webapp.css's `[aria-selected]` rule rather
  than editing the copied stylesheet.
- **`components/business/tabs.ts`** and **`components/programs/tabs.tsx`** — one
  vocabulary per destination, so a tab cannot exist on one of its two screens.

### Redirects, and where they live

All six old paths redirect, all `permanentRedirect` — including `/business/[month]`,
which used to be the live route and whose `/business` parent used to be the
uncacheable "resolve today's month" redirect. That asymmetry is gone with the
segment. They were moved **out of the `(main)` group** so a redirect does not pay for the layout's `getTrainerName()`
round trip on its way to throwing — which is why `currentFor` in `AppShell.tsx`
has no branch for `/money`, `/packages`, `/reports` or `/exercises`. Nothing under
them ever renders the shell.

`currentFor` also refuses to guess for `/sessions`: there is no *Sessions* row to
light, and lighting *Schedule* would claim the console is part of a screen the
trainer did not open. It falls through to `today`.

### Verified

`npx tsc --noEmit` and `npx next build` clean; `npx eslint` clean on every file
this pass created or edited (the pre-existing errors in `Team.tsx`,
`Palette.tsx`'s `lastGroup` and `Programs.tsx`'s effects are untouched and were
failing before it; `MonthPicker`'s `Date.now()` went away with the file). All six
redirects checked against a running dev server — `/money/2026-08?tab=owed` →
`/business?tab=owed`, `/business/2026-08` → `/business`, `/exercises` →
`/programs/exercises`, and the rest.

**Not verified by rendering.** The OTP is bcrypt-hashed in Redis, so no signed-in
session could be driven, and every screen behind the shell 307s to `/sign-in`.
Nobody has yet LOOKED at the five-row rail, the three-tab bar, the seven-tab
Business strip or the Programs strip on a real page.

## The money book, restructured — three questions, a trend, and a payment that is actually collected · 29 Aug 2026

The Payments tab of `/business` was drawn against the money book's own vocabulary —
*Billed · Collected · Gym share · Yours* — and a trainer does not open this screen
holding any of those four words. They open it holding one of three questions, and
this pass makes the top of the screen answer exactly those three:

| Tile | The question | Where the figure comes from |
| --- | --- | --- |
| **You earned** | how much did I earn this month? | `computeLedger().yours` — collected in the period, gym's cut out |
| **Pending** | who owes me? | `computeOwed()`, **whole book as of now** — a link, not a filter |
| **Still to deliver** | what's coming? | `computeUpcoming()` — new, and it had no answer anywhere before |

### The tiles stopped filtering, and the chips started

The old tiles did two jobs — summary and table filter — which is why *Yours*, the
one figure a trainer most wants, had to be the inert fourth one that could not be
pressed. Splitting them frees all three to be questions and moves *Collected ·
Pending · Gym share* into chips on the payments card, beside the rows they narrow.
**No filter was dropped.** Billed, Collected and the gym's cut are all still on
screen in the side summary card, where they were already drawn, which is what
keeps the headline figures argue-with-able.

*Pending* is the one tile that is a link rather than a filter, and the reason is the
same one `PERIODLESS_TABS` gives: a debt does not stop being owed because you
looked at July. It counts the whole book as of now, so filtering the period's rows
by it would answer a narrower question than the tile asks.

### `computeUpcoming` — the question the product could not answer at all

**The value of coaching already sold and not yet delivered.** *Billed* is history
and *Pending* is a debt; the work standing between a paid-up client and their last
session appeared on no screen in either half of this product. A trainer with
₹40,000 on the books and a quiet week is in a different position from one with
neither.

Pro-rata by sessions where there are sessions to count — a ₹12,000 twelve-pack
with five left is ₹5,000 — and the whole amount for a monthly pack, which is a
duration with no smaller unit to divide into. **Paused packs are counted**, for
the reason `paused_at` is a column and not a status, and counted *separately* as
well so the tile can say so: the same figure made mostly of paused packs is a
different month.

### The trend chart dates by `paid_at`, and the payments table does not

Six bars, and the brief's ceiling — "a simple bar chart of the last 6 months.
Nothing more" — is the feature. The one thing to know before touching it:

> `computeLedger` and `GET /v1/payments` window on **`created_at`**, deliberately:
> a month's *billing* is what was raised that month, and dating by settlement
> would move an invoice into whichever month it was paid in and drop every unpaid
> one — which is what *still pending* is made of. `computeTrend` windows on
> **`paid_at`**, falling back to `created_at`, because "is my income going up" is
> a question about money that **arrived**. Two readings of the same rows, both
> right, and a screen that mixes them produces two totals that will not agree.

The fallback is not defensive coding: every payment the phone has ever pushed, and
every one REST wrote before `paidAt` became a field, carries no settlement date.
Without it the chart reads as six empty months on any existing book. The current
month is drawn in the accent and kept **out of the average**, because an average
dragged down by the 2nd lies for four weeks.

### Recording a payment recorded a debt

The defect worth knowing about, closed in `BACKEND_GAPS.md`: `RecordPanel` wrote
`status = 'pending'` and nothing on the web could confirm one, so a trainer handed
cash in a gym recorded money they were still owed. The panel now sends `paidAt`
and the row is written `paid` with the gym's cut stamped. It also gained the three
fields the brief names and this half did not have — a **date** (defaulted to
today, so the common path skips it), a **note** on every method rather than a UPI
reference on one, and **bank transfer** as a fourth mode, which needed no
migration because `payment.method` is free text.

*Save & send receipt* is **gone**. It called `handleSave(true)`, the argument was
never read, and there is no receipt route on the wire — a button that promises a
client will be messaged and silently does not is worse than no button.

### CSV export, and why it is the whole tax feature

`lib/money/csv.ts`. The *Export for my CA* button was drawn on five tabs with no
`onClick` at all, and the payments card's *CSV* button likewise. Both are live, and
what they export is what the tab in front of the trainer is showing — *Pending* gives
the chase list, GST gives the rolling twelve months a filing needs, everything
else gives the period's payments.

The brief draws a hard line here — *no invoicing engine, no tax computation, no
GST filing; offer a CSV and let their CA handle it* — and that is the correct
product, not a scoping compromise: the trainer already has a CA and the CA already
has software. **The GST tab is not on the wrong side of that line**; it computes
no tax and files nothing, it tracks headroom against the ₹20L registration
threshold, which is a *when do I have to register* answer and not a return.

Two formatting decisions in that file that look like fussiness and are not:
amounts are bare numbers (a `₹` makes a spreadsheet read the column as text), and
dates are `YYYY-MM-DD` (Excel reads Indian `DD/MM/YYYY` as American on a US locale
and silently turns 6 August into 8 June).

### Expenses are not built, and that is the brief

Gym rent, equipment and certifications are marked *optional, v1.5*. They are the
only part of this screen with no table behind them — `payment` is a client paying
a trainer and carries a `client_id`, a package and a receipt, which is exactly the
argument V11 used when it gave `gym_settlement` its own table rather than a
`direction` flag on `payment`. An expense needs its own table, and the real
net-income figure needs it first.

## Reports — two audiences on one tab, and a card that leaves the building · 29 Aug 2026

The seventh tab of `/business` was a notice saying it was not built. It is built,
and the brief it is built to opens with the instruction the whole shape follows:
**"Two distinct audiences. Don't mix them."**

| | What | Where |
| --- | --- | --- |
| the trainer's | revenue, sessions, clients, retention, attendance, acquisition vs churn | `/business?tab=reports` |
| the client's | a 12-week progress card built to be sent | `/clients/:id/report` |

They share a tab and **no figure**. The Reports tab's foot is a list of clients
ranked by sessions in the window, each row a link into the second screen — a
door, not a report. `lib/business/report.ts` and `lib/reports/build.ts` are two
files for the same reason.

### The practice report, and the ceiling that is the feature

*"Keep it to one screen. A trainer is not an analyst."* Four headline figures,
each with a direction on it, then three shapes that say whether the figures are
normal. Twelve months, because a year is the shortest window that can show a
trainer their own seasonality — Indian floors empty in December and fill in
January, and six months cannot say so.

**The windows are deliberately not all the same.** Money and adherence are over
ninety days; clients and retention over thirty. A quarter is what makes a noisy
figure readable, and *how many people am I training* is a question about **now**
that a 90-day answer pads with everybody who left in June. Each tile says its
own window.

Three definitions that will be argued with, so they are written down:

- **Delivered is a marked booking OR a workout log**, folded on `(client, day)`.
  That is the roster's own rule for *last attended* and it is right here for the
  same reason: an unlogged session a client turned up to is still a session they
  turned up to. Counting one and not the other shows a trainer who logs without
  booking an empty year.
- **Churn is inferred, because nothing records a client leaving.** `status =
  'archived'` exists and almost nobody sets it. A client is lost in the month of
  their last delivered session, provided nothing since and `ACTIVE_DAYS` have
  passed — without that last clause everybody who trained on Tuesday is "lost
  this month" and the chart shows a catastrophe every month. **So the most recent
  month or two reads zero rather than guessing, and the card says so.** A
  `paused` client is not lost either: V30 gave a pause a whole lifecycle
  precisely so a holiday stops looking like an exit.
- **Retention is the 30 days ending 90 days back, against the last 30.** The base
  is a month of evidence rather than an instant, because "training with you" is
  not a state anything stores. A break is not a departure.

**Every rate is a rate of what is KNOWN.** `webapp-reports.html`'s rule —
*"a past session nobody closed off is evidence the trainer was on a gym floor,
not evidence the client stayed away"* — so unmarked sessions are in no
denominator, and the count is drawn as a banner with a way to close them off.
One wrong red figure is all it takes for a trainer to stop believing a tile.

**Reports is the second tab that decides what is fetched**, after Packages, and
it is the more expensive: a year of the diary plus every workout log, the largest
read on this half after the exercise library. `lib/business/report-api.ts` argues
for paying it here and nowhere else — this tab is opened at a month end, and
`/today` is the screen that windows its own sessions to thirty days because it
cannot afford this. Payments and packages are **not** re-fetched; the page
already holds them from `requireMoney()`.

### The client card, and why it is a PNG

The brief asks for something specific and it is not a web page: *"a progress card
posted to Instagram or WhatsApp status"*. Both take an image. A `wa.me` link
carries text and nothing else — there is no attachment parameter and never has
been — so the artefact that travels is a 1080×1350 PNG, painted on a canvas by
`lib/reports/card-image.ts`.

**Painted, not screenshotted.** html2canvas is a 200 kB dependency in a project
with four; a DOM screenshot inherits a desk's layout when the card has to be 4:5;
and it is only ever as good as the machine it was taken on. Painting means every
trainer's card is the same card.

**The preview IS the artefact.** `CardPreview` shows the real PNG in an `<img>`,
so what is on screen is byte-for-byte what gets sent and there is one renderer to
keep right. Two renderings would drift, and the one that drifts is the exported
file — the only one that leaves. The `alt` carries the message text, and the
column beside it draws every figure again as real markup: that column is the
TRAINER's view, and it holds the two things the client is never sent — what went
unmarked, and how the window was measured.

**Four ways out, because "one tap" means different things on a phone and a desk.**
`navigator.share` with the file attached (a phone: the image and the message go
together), `wa.me` with the text (a desk: send, then paste), copy the PNG to the
clipboard, and download. Both halves are real rather than one being simulated;
the failure mode of pretending is a trainer who thinks they sent a picture.

**Nothing on that screen writes.** The WhatsApp button is a plain `wa.me` link
exactly as the client file's is, and for its reason: `POST /v1/clients/{id}/nudge`
writes a `nudge_log` row and the phone computes a once-per-client-per-7-days
cooldown from that table. Sending somebody their progress must not spend the
weekly reminder an overdue invoice needs three days later.

Four rules the figures follow, each of which a client could challenge:

- **Strength is the first day of the window against the best day in it**, not
  against the last: a block often closes on a deload, and a real gain would read
  as a loss. Ranked by proportion — +5 kg on a 20 kg curl beats +5 kg on a 140 kg
  deadlift, and the client who did the first one is the one who needs to see it.
- **A personal best is a claim about the whole history**, so `GET
  /v1/workouts/sets?clientId=` is read unwindowed (its own docs: *"a window is
  what produced the wrong answer"*), and counted once per exercise per day —
  working up 40 → 45 → 50 is one best, not three.
- **A measurement's baseline can be older than the window.** A client weighed in
  January and again last week has one reading inside twelve weeks and would
  otherwise report no change; `baselineIsOlder` makes the screen say where the
  number came from.
- **No colour on any change, on the card or beside it.** `ProgressTab.tsx` states
  it for bodyweight and it is sharpest here: a green arrow on a card the client
  keeps is the product taking a side in a conversation it was not in.

**A thin report is refused rather than generated.** A card with a name on it and
no figures under it reads as *you have done nothing*, and a retention tool has
then cost a renewal.

**No health data, and the report is the worst possible place to start.** `body_metric`
is a measurement and is exactly what this may draw. There is no injury field, no
condition field and no PAR-Q flag anywhere near it — the whole feature is about
the file leaving the building.

**Two-thirds of the brief's own list is deliberately absent** and neither gap is
an oversight: there is no date of birth in this schema (V12 declares a `birthday`
nudge kind and no column ever landed), and a public shareable LINK would need a
token route on the backend plus the client portal — the image is what ships.
`GET /v1/clients/{id}/report` still exists and still returns a four-week plain-text
summary; nothing calls it, and it is the thing to retire or re-point when the
portal lands.

### Checked by rendering, and it found five things

A throwaway `app/finclineyouort` route building both screens' data from synthetic rows
through the real builders, inside the real `AppShell`, driven by a ~60-line CDP
driver at 390, 1024 and 1440, plus the card extracted at full resolution in five
states (4 / 12 / 24 weeks, no measurements, no lifts, and the thin refusal).
**The harness is deleted; rebuild one if either screen is touched.**

| Where | What |
| --- | --- |
| `app.css`'s roster block | **`.ph__id{display:none}` was UNSCOPED**, inside a `max-width:900px` block whose every other rule is scoped, with a comment about the Clients screen. `.ph__id` is the header identity on **sixteen** screens, so under 900px Business, Programs, the client file, the console, the team screen and the sessions list all lost their `<h1>` *and* their subtitle — the exact defect this file records for `/today` ("a reader's heading list came back empty"), reintroduced globally by one selector. It also sat later in the file than `.ph--today .ph__t` and `.sch__ph .ph__t`, so it silently defeated the two screens that *had* answered the question properly by removing the whole container. Now `.ph--clients .ph__id`. |
| the card's layout | The first version DROPPED a block that would not fit. Rendering showed why that is the wrong rule: on a full card the lifts — the most persuasive thing on it — were dropped for being third in the queue, and the space they would have used sat empty above the footer. The caps now SHRINK until the set fits, and the leftover is spread between the blocks. |
| the card's name | `fit()` gave *"Rajalakshmi Venkatara…"*. Right for a plan line, wrong for the thing the card is about — a trainer will not send a card that gets the client's name wrong. The size steps down to 46px before it truncates. |
| `.msg` in the share card | `display:flex` with a gap, built for an icon beside a sentence — so every inline child became a flex ITEM and the explanation rendered as four narrow columns. One `<span>`. Same shape as the `.kv` and `.who` traps already in this file. |
| the whole tab at 390px | `style={{gridTemplateColumns}}` on both card rows, which outranks every media query — **verbatim** the defect recorded three times already (`PacksForm`, `/packages`, `OverviewTab`). Both rows stayed two columns, so a twelve-bar chart was drawn in ~170px and the client list had its buttons off the card. Classes now, plus: `.rptstats` scoping `.stats--4` (four 85px tiles clipped `₹2,54,400` to `₹2,54,`), a `@container` query thinning the axis to every third label and hiding the bar figures (a viewport breakpoint cannot see a chart sized by its grid track), and a grid on the candidate row — releasing `.tblwrap > .tbl{min-width:420px}` was not enough on its own, because a table cell is sized by its content and `.who b`'s ellipsis never fires. |

Three notes for whoever rebuilds the harness, on top of the ones the earlier
passes left: `next dev` refuses a second server in one directory, so a fixture is
served by whatever dev server is already running; a `'use client'` page using
`useSearchParams` needs a `<Suspense>` wrapper or `next build` fails to prerender
it (the real route is a server component and needs none); and the canvas must read
its font stacks off `--tx-font` / `--tx-brand` / `--tx-mono` at paint time, because
`next/font` self-hosts under a generated family name and a canvas asked for
`'Inter'` silently paints in Times — a bug that only shows up in the exported file.

**One pre-existing defect found and NOT fixed:** `.chart__x` carries
`transform:translateX(-50%)`, correct for a label positioned at a bar's centre
with no width, and `TrendChart` and `GstTab` both give it a column width and
centre the text inside it — so every axis label on those two charts sits half a
column to the left of the bar it names. `MonthBars` sets `transform:none`; the
other two are other screens' files.

## Identity, and the field that is deliberately missing · 29 Aug 2026

The trainer profile's first section — **Identity**: name, profile photo,
headline, bio, intro video. Four of the five are built. The photo is not, and
that is a decision rather than a gap.

**There is no image store in the backend at all.** Not "no endpoint yet" — no
multipart handler, no object-store configuration, no credentials, no resize
pipeline, nothing. A photo that is *"resized server-side"* is that whole
apparatus, and hanging it off a pass that otherwise adds three text columns
would have made the smallest part of the section the largest part of the work.
So V33 is `headline`, `bio` and `intro_video_url`, and the initials avatar
`NameForm` has always drawn goes on standing in — which it already promised it
would: *"until profile photos arrive"* was in that file before this pass.
`/settings/profile` repeats the promise under its preview card. The consumer
that would show a photo does not exist yet either; `/invite/[clientId]` is still
a `NotBuilt` stub.

### Where the five fields went, and why the flow is still eight steps

| Field | Where | Why |
| --- | --- | --- |
| Name | `/setup/name` (unchanged) + `/settings/profile` | Already step 1, already mandatory |
| Headline | `/setup/name` + `/settings/profile` | One more line on a step already being paid for |
| Bio | `/settings/profile` only | 100–200 words does not belong in "about a minute" |
| Intro video | `/settings/profile` only | Needs a link the trainer has to go and find |
| Photo | nowhere yet | No store |

**The setup flow did not gain a ninth step, and that was the whole question.**
`SETUP_STEPS` is eight, the rail says eight, `secondsLeft` divides by eight and
two screens say "four of the eight" in prose. A ninth row is cheap to write and
expensive to mean: the flow's pre-flight screen exists because *the most-named
onboarding complaint across every platform in the teardown was not form length,
it was SURPRISE*, and every step's cost is stated before the trainer reaches it.
A 200-word bio arriving inside that promise is exactly the surprise. So the
headline — one line, optional, on a step already open — rides on step 1, and the
two heavy fields go where a finished profile is edited anyway.

Which produced the second half of this pass, because that place did not exist.

### `/settings/profile`, and the rule it is the first to implement

`AGENTS.md` has said since the setup pass that **a finished profile is Settings'
to edit** — it is the reason `/setup` and all eight steps redirect a
`setupComplete` trainer to `/today`. Nothing implemented it. Before this screen a
trainer who wanted to change the name on their own invites had **nowhere at all**
to do it, and `lib/setup/meter.ts` carried the tell in a comment: *"the place to
add a skipped answer later is Settings, which is not built."*

So the screen edits **all four** identity fields, not the two setup never asks
for. A Settings screen that could edit half of an idea and sent the trainer back
into a redirecting flow for the rest would be a dead end wearing a link.

**`lib/profile/api.ts` is a separate module from `lib/setup/api.ts`, and the
reason is the pull.** Both PATCH `/v1/trainers/me`, so folding them together was
the obvious move and is wrong: `getSetupState` reads a **full `/v1/sync/pull`**
alongside the profile, because two setup steps have no REST endpoint. That file's
own header says the cost is affordable *in setup and nowhere else* and warns in
bold — *do not reach for `pull()` on a built screen*. Importing `getSetupState`
here to reach four columns would pull a live trainer's entire database to draw a
bio. One request, its own module, a shared wire shape rather than a shared
function.

### Four decisions inside the fields

- **The bio's placeholder is a whole example bio.** The brief named the failure
  exactly — *trainers write nothing or an essay* — and a
  `placeholder="Tell clients about yourself"` produces both: it says what to type
  and nothing about how much. Seventy words of a real introduction sets the
  length, the register and the subject matter in the one place a blank field is
  actually read.
- **The counter reports words, then characters.** The ask is 100–200 *words*; the
  enforcement is 1200 *characters*. A person writes to the first and a column can
  only promise the second, so it says whichever is useful at that moment rather
  than showing two numbers. Under the guidance it reads *"aim for 100–200"*,
  never *"too short"* — nothing here is refused for being brief, and a warning on
  an optional field is an accusation for having answered it.
- **The headline's counter appears at 60 of 80, not at 0.** A character count
  under an empty field is a limit presented as a warning, and it teaches people to
  write to the number instead of to the reader.
- **The video stays a link.** No embedded player and no thumbnail: this screen
  writes a profile, and a preview needing an outbound request would make a
  settings form depend on somebody else's uptime. What it shows instead is that
  the server *understood* it — the canonical URL comes back on save and is
  visibly a different string from the paste.

### Two traps in the writes, both the same shape

Both are about a multi-field PATCH where the server refuses the whole thing.

- **`saveName` cuts the headline to 80 before sending.** The server refuses an
  over-long headline with a 400 for the entire patch — which on step 1 would take
  the trainer's **name** down with it, on the one step that cannot be skipped. A
  pasted headline must never cost somebody their name.
- **`saveIdentity` cuts both.** Same reasoning, four fields deep.

The server refusing rather than truncating is itself deliberate and is documented
in `API.md`: every other string on that endpoint truncates silently, which is
right for a pasted name and wrong for prose.

And the rule the whole endpoint rests on holds here: **omitting a field leaves it
alone, `''` clears it.** `/settings/profile` sends all four every time, empties
included, because a screen that could add a bio and never remove one is broken in
a way nobody reports.

### Checked by rendering, against the dev database

A real trainer, a real token, all three screens fetched and parsed:

- `/settings/profile` — preview card drew `RK · Ravi Kannan · Strength &
  fat-loss coach · Indiranagar`; the bio counter read *"8 words — aim for
  100–200"*; the video hint read back the canonical URL.
- `/setup/name` — headline field present with `maxLength=80` and
  `autoCapitalize="sentences"` (not `words`: a headline is a sentence fragment
  and `words` fights the trainer on every word after the first), preview card
  carrying both lines, initials note intact.
- `/setup/done` — the new line lands and links to `/settings/profile`.
- `/settings` — the row is first and `built: true`.

And the canonicaliser end-to-end: `https://youtu.be/dQw4w9WgXcQ?t=42&feature=share`
went in, `https://www.youtube.com/watch?v=dQw4w9WgXcQ` came back, offset and
tracking parameter dropped.

### Not built, and worth knowing

- **The profile photo**, above. It is the one Identity field outstanding.
- **The remaining profile sections.** Identity is the first of seven the brief
  names; certifications, experience, specialities and languages already have
  columns from V8 and setup steps, but **no Settings editor** — this pass built
  one only for identity. Training modes & locations and social links have no
  columns at all. *(All six followed later the same day: the four V8 sections
  got tabs, training modes & locations became V34, and social links V35.)*
- **`/settings/hours`** is still `Soon`, unchanged by this pass.

### The whole `/settings` subtree was blank, and it was one missing class

Reported as *"`/settings/profile` and `/settings` is empty"*, and both were —
along with `/settings/nudges`, which had been shipped broken and never rendered.
The server HTML was complete and correct the whole time; `curl` returned every
row. It only failed **in a browser**, which is why a build, a typecheck and a
lint had all passed over it.

`.app` is a **grid**:

```css
.app{ display:grid;
      grid-template-columns:var(--w-rail) minmax(0,1fr);
      grid-template-rows:var(--w-top) minmax(0,1fr);
      grid-template-areas:"rail top" "rail main";
      overflow:hidden }
.main{ grid-area:main; display:flex; flex-direction:column; overflow:hidden }
.body{ flex:1; min-height:0; overflow-y:auto; padding:20px 24px 32px }
```

`.main` is the only class carrying `grid-area:main`. All three settings pages
opened with `<main className="body">` — and `.body` has **no grid area at all**,
so it was auto-placed into the next free cell, which is the **`top` row**:
`var(--w-top)` tall, clipped by `.app`'s `overflow:hidden`. The page header
rendered as two cropped words in a 56px strip and everything below it was cut
off. Sixteen other screens do `TopBar` + `.main > .ph + .body`; these three were
the only ones that did not, and `/settings/profile` inherited it by being modelled
on `/settings/nudges`.

All three now match the rest of the app. Three things came with the fix:

- **`SettingsBar`** — `TopBar` takes an `onSearch` callback, so it must be
  rendered by a client component, and every settings page is a server component.
  One `'use client'` boundary beats turning three pages client-side. The no-op
  `onSearch` follows `Team.tsx` and `Business.tsx`, which already pass `() => {}`.
- **The crumb carries the hierarchy** — *Settings / Your profile* — the way
  `ClientFile` does, which matters here because the rail lights nothing under
  `/settings`.
- **The back link moved inside `.ph`**, above the title. It belongs to the fixed
  header rather than the scrolling body, and `.ph`'s own padding places it
  without the hand-rolled wrapper guessing at the number.

**The lesson worth keeping: this class of bug is invisible to every gate this
project has.** It is not a type error, not a lint error, not a build error, and
not visible in the served HTML. Only rendering finds it — which is what
*"Checked by rendering"* in the sections above is for, and this pass proved the
cost of skipping it: a screen shipped blank and stayed blank.

### And *Your profile* is on the account menu

`AccountMenu.tsx` carried the reason it was missing, in its own comment: *"§2b
lists Profile, Settings, Help, Sign out. **Profile** and **Help** have no route in
this project at all … a row that 404s is worse than a row that is missing, so
they arrive with the screens they open."* The screen exists now, so the row
arrived — first, in §2b's order, above Settings and above Sign out.

It is not a duplicate of Settings. The four things a *client* reads about a
trainer are not "the things every screen reads", and `ACCOUNT`'s Settings row had
been promising `Your profile, hours, payment and nudge templates` while leading
nowhere near one; that line now reads `Your working week, payment and nudge
wording`.

Three details:

- **It went into `ACCOUNT` in `nav.tsx`, not just into the menu.** `TabBar` maps
  that array for its account group precisely so the two widths cannot disagree,
  so the phone sheet got the row for free.
- **`currentFor` tests `/settings/profile` before `/settings`.** The longer path
  falls into the shorter prefix otherwise, and the sheet would mark *Settings* as
  the current page while the trainer is looking at their profile.
- **A new `User` glyph**, deliberately not `Users` — that one is the roster's and
  means *the people you coach*. Same circle-and-arc geometry with the second
  figure removed, so the two read as a pair rather than as unrelated drawings.

**Help is still missing**, on the same terms as before.

### Certifications, brought over whole · 29 Aug 2026

`/settings/profile` has two **tabs** now — **Identity** and **Certifications** —
and the second one is not a new screen. It renders `CertificationPicker`, which
is the body the setup step used to hold: the five common chips, the search over
the rest of the catalogue, *Add your own*, and the callout saying we have not
checked any of it.

**It was extracted, not copied**, and `CertificationsForm` now renders the same
component. `lib/setup/options.ts` opens by explaining what happens when the two
halves of this product disagree about an answer set — one profile carrying two
spellings of one certificate, and `labelFor` rendering the loser as raw text.
Two copies of the *picker* is that same bug arriving from inside one half: a
chip whose wording drifts, an exclusivity rule fixed in one place, a cap added
to one screen. What is left in `CertificationsForm` is what is genuinely the
step — the heading, the empty-answer message, and a foot with a Skip on it.

Four things worth keeping:

- **The chips do not save on toggle**, which is what a chip usually implies.
  Every tab here needs a button, and a section that wrote itself mid-click would
  make one tab behave unlike its neighbours for no reason a trainer can see. It
  would also fire a request per click on a control whose whole shape invites
  four in a row.
- **`cleanCertifications` runs server-side too**, in the action, not only in the
  picker. Over `MAX_CERTIFICATIONS` the server refuses the *whole* PATCH rather
  than truncating, so an over-long list would take the trainer's name and bio
  down with it — the same argument `saveName` already makes about the headline.
  It also re-applies the *Not certified yet is exclusive* rule at the last point
  before the column.
- **The Identity tab's preview card shows them, and says "Self-declared".** The
  callout under the picker promises we say so on the profile too; before this
  that promise had nothing behind it. It is the one thing that tab draws which it
  does not edit — a preview answering *how clients see you* that quietly omitted
  half the profile would be a preview that cannot be trusted. *Not certified yet* is deliberately **not** rendered as a
  tag — a badge reading *Not certified yet* beside somebody's name turns an
  honest answer into a mark against them — it gets a quiet line instead.
- **`AddOwn` takes an `id` now.** It hard-coded `add-own`, which is fine on a
  step that opens one hatch and wrong on a profile page that will grow one per
  catalogue section: two fields sharing an id leaves the second unlabelled to a
  screen reader with nothing visibly wrong.

#### The catalogue was missing the demo trainer's own certificate

Both seed scripts write `acsm_cpt`, and it was in **neither** half's catalogue —
so `labelFor` fell through to its last resort and the chip rendered the literal
string `acsm_cpt`. Not two spellings of one answer; one answer with no spelling
at all, sitting on the profile of every trainer the seed creates.

`lib/setup/options.ts` now has it and `app/src/setup/options.ts` does not, so
**the web catalogue is one entry ahead of the phone's.** That does not break the
mirroring that file's header is about, which is about *ids*: the id is the one
the server, the seed and both halves already store, and only the label is new,
so nothing diverges in the column — the phone simply still shows the raw id
until the same entry is added to its copy.

#### Checked by rendering

Both screens, in a browser, signed in — the lesson from the settings pass
directly above. `/settings/profile`: both section headings, the seven chips with
the trainer's two pressed, the search finding `spefl_l4` from a fragment
(`nsqf`) that is in neither of the first two words of its label, a custom entry
round-tripping through the server as
`custom:Kettlebell L1 — Agatsu`, the blank-name guard, and the preview updating
after the save. `/setup/certifications`, unpicked to empty: still refuses with
*"Nothing picked yet"* and stays on the step.

### The profile is a tab strip, not a long page · 29 Aug 2026

Two sections stacked in one scrolling column was already a page you had to
scroll to reach the bottom of, and the brief for this screen is **seven**:
identity, certifications, experience, specialisations, languages, training modes
and locations, social links. Seven `<h2>`s in a column is a page whose seventh
section nobody has ever seen, and a trainer who wants to change their bio should
not scroll past their certificates to reach it.

**Every tab is a real route** — `/settings/profile` is Identity, and each further
section is a folder under it. Same call `components/clients/file/shared.tsx`
makes for the client file's six, for the same reasons: the back button works
between them, a tab can be linked to, and each one loads only its own panel.
`PageTabs` draws the strip, so this screen inherits the `aria-current` and
links-not-`tablist` argument written down there rather than restating it.

The pieces:

- **`lib/profile/tabs.ts`** is the vocabulary and `profileTabHref`. Adding the
  next section is a row here, a folder, and a panel. **Nothing unbuilt goes in
  the list**: the settings index can afford a row tagged *Soon*, because a list
  of what settings exist is useful even where one is not ready, but a tab strip
  is navigation — a tab that opens nothing is a destination that lies, and the
  trainer pays a page load to find out.
- **`layout.tsx` holds the chrome**, not each page. React keeps a layout across a
  navigation between its children, so the bar, the title and the strip do not
  re-mount and a keyboard user does not lose their place in the strip.
- **`ProfileTabs` is a client component** for one reason: a server layout cannot
  read the pathname — Next gives it to the page, not to the layout above it.
  It tests the longer prefix first, the same ordering bug `AppShell.currentFor`
  documents: `/settings/profile/certifications` starts with `/settings/profile`,
  so a shorter-first check lights *Identity* on every tab.

#### One save per tab, and each sends only its own fields

`saveIdentity`, `saveCertifications`, `saveExperienceBand`, `saveSpecialities`
and `saveLanguages` are five actions, and that is not tidiness. Every field on the backend's `UpdateRequest` is nullable and means
*leave it alone*, so a tab that PATCHes four keys cannot disturb a fifth it never
drew. If both sent the whole profile, the Identity tab would be writing back a
certification list it read on page load — and a trainer with two tabs open, or a
phone that edited drawer 2a in between, would have the older of the two silently
win. Checked by doing it: saving certifications left the name, headline and bio
alone, and saving identity left `cpr` on the list the other tab had just added.

**The unsaved marker beside Save earns its place now and would not have before.**
On one page with one button there was nowhere to go with edits in hand. Now
*Certifications* is a navigation away from a half-typed bio. It compares
certifications as **sets** rather than by order — the catalogue's order is the
meaningful one, so a toggle that puts a chip back where it started goes clean
again, which it does.

#### Checked by rendering

All five tabs, in a browser, signed in. The strip marks the right tab on each,
clicking one is a real navigation, and each panel draws only its own control —
the Identity panel no chips, the four others no fields. Certifications,
Experience, Specialities and Languages each fit their viewport exactly
(`scrollHeight === clientHeight`), which was the complaint; Identity is 990px
against a 692px viewport in a 1000px-tall window and always will be, because
most of it is an eight-row bio textarea.

The isolation was proved one column at a time, reading the server between each:
the experience save moved `experienceBand` and left the three lists alone, the
specialities save left the band, the languages save left both, and the identity
save left all four. The Identity preview then read back every one of them.

### The other three setup answers, and two bugs the real data found · 29 Aug 2026

Experience, specialities and languages are now tabs three, four and five, which
finishes every profile section that has a column behind it. **No migration.**
`trainer.experience_band`, `.specialities` and `.languages` are V8, and
`TrainerService.update` has accepted all three since the app's end-of-setup
PATCH — the same shape certifications was in.

Each one was **extracted from its setup step** into `components/profile/`
(`ExperiencePicker`, `SpecialityPicker`, `LanguagePicker`), leaving the step
holding only what is genuinely the step: a heading, an empty-answer message and
a foot. Same call as `CertificationPicker` and the same reason —
`lib/setup/options.ts` opens by explaining what happens when two halves disagree
about an answer set, and two copies of the *picker* is that bug arriving from
inside one half. A trainer editing an answer in Settings now meets the control
that collected it, down to the cap meter and the escape hatch.

One thing the tabs can do that setup cannot: **clear a list.** Steps 3 and 5 have
no Skip and refuse to continue on an empty answer, which leaves them unable to
remove an answer already given — `SpecialitiesForm`'s own comment says so and
names Settings as where that belongs. This is Settings, and `[]` on the wire is
what the server reads as *clear it*.

That leaves **two sections that are not tabs and should not be**: training modes
and locations, and social links. Neither has a column — `work_mode` and
`gym_name` are the money book's defaults hint, not a client-facing fact — so
under the additive-only law each needs a V34 on both halves before it is worth
drawing. *(Training modes and locations got its V34 later the same day, and is
the sixth tab, and social links its V35 — the seventh. See the two sections
below.)*

#### The seed writes two speciality ids that exist in neither catalogue

`seed-realistic-20.sql` and `seed-full-demo.sql` both write
`["strength","fat_loss","post_natal"]`. The catalogues — web and phone, which
agree — hold `weight_loss` and `natal`. So two of the demo trainer's three
specialities were ids nothing could produce and nothing could label.

This is the `acsm_cpt` bug again with the fix on the other side. There the seed's
id was the real one and the *catalogue* was missing its label, so the label was
added. Here the catalogue is right and the *seed* invented two ids: adding
`fat_loss` would create a second spelling of *Weight loss*, which is precisely
the failure `options.ts`'s header exists to prevent. **Both seed scripts are
fixed.** A database seeded before today still holds the old pair — the screen now
shows them honestly rather than hiding them, which is the next item, and
`UPDATE trainer SET specialities = '["strength","weight_loss","natal"]'::jsonb`
is the correction where it is wanted.

#### A picker must draw every id it was given, not every id it knows

MEASURED, and it only bites on the profile. In setup a value can only have come
from the chips on screen or from `AddOwn`, so drawing *catalogue + `custom:`
entries* covered every case, and that is what all three steps did. On
`/settings/profile` the value comes from the **server**, which holds whatever the
phone, an older catalogue or a seed last wrote.

Drawn that way, `fat_loss` and `post_natal` were **invisible and still counted**:
the meter read 3/5 above one pressed chip, the trainer could not remove what they
could not see, and Save wrote both straight back. `CertificationPicker` already
had this right — it appends anything chosen that is not in its chip list — so
`SpecialityPicker` and `LanguagePicker` now do the same, which also subsumes the
`custom:` handling they each had. An id with no label renders as itself: ugly,
honest and removable, where hiding it was none of the three.

The fix reaches setup too, because it is one component. That is the point of
extracting it.

#### And the preview grew to match

`IdentityForm`'s card already argued that a preview omitting half the profile is
one that cannot be trusted, which is why it drew the *next* tab's certifications
read-only. It now draws every tab's answer — the band and the languages as one
line, the specialities as tags above the certificates. 59px of a 990px panel.

Read-only, and deliberately not shortcuts into the other tabs: a chip that both
previewed an answer and edited it would make this tab able to write four columns
it does not own, which is the cross-tab clobber the split actions exist to
prevent.

### Work & hours, the sixth tab — and the week that had been editable once · 29 Aug 2026

`/settings/profile/work`, V34, and the tab that answers a question the profile
could not: **where**.

#### The three new columns, and why they are not the two that were there

`trainer` already had `work_mode` (V23) and `gym_name` (V11), and the obvious
move was to draw those and call the section done. That would have been wrong,
and both of those migrations say so themselves: `work_mode` is *"a HINT, not a
type"*, the money book's defaults hint — which price lists exist on the packs
step, who is pre-selected to collect at add-client — and *"it must never gate a
feature"*.

**How a trainer is paid and how they coach are not the same answer.** A trainer
whose `work_mode` is `gym` may still take home visits on Sundays and run two
people online; an `independent` trainer may work out of a studio they do not
own. Neither answer is derivable from the other in either direction, so V34 adds
three columns beside them rather than reinterpreting them:

- `training_modes` — `gym_floor` · `home_visit` · `online` · `hybrid`, ids in
  JSONB with `custom:` for anything typed, so `TrainerService.clean()` applies
  unchanged. GIN-indexed like `languages`, because a client filtering on *can I
  be coached online* is the same shape of query as filtering on Tamil.
- `map_link` — TEXT, stored **verbatim**. The asymmetry with `introVideoUrl` is
  deliberate and is the whole reason there is no `MapLink.java`: a YouTube link
  has one canonical form and one field that matters, while a maps URL is a short
  `maps.app.goo.gl` redirect from one share sheet, a long
  `/maps/place/…@lat,lng,z/data=` string from another, and something else again
  from Apple or OpenStreetMap. A normaliser would eventually break a link that
  worked. The only check is that it is an http(s) URL at all — refused over 500
  characters rather than truncated, because a URL cut short is broken, not short.
- `service_areas` — free-text localities. Not a catalogue: no locality list this
  product could ship would be right in two Indian cities, and a dropdown missing
  somebody's neighbourhood is worse than a field. It exists because `home_visit`
  with no answer to *how far* is not information a client can act on.

Backend + web only, like V30, V32 and V33. Nothing enters sync and the phone's
flow is untouched. `TRAINING_MODES` therefore lives in **`lib/profile/work.ts`,
not `lib/setup/options.ts`** — that file is a character-for-character copy of
`app/src/setup/options.ts`, and adding a catalogue the phone has no counterpart
for would make it stop being a copy of anything, which is the divergence it
exists to prevent, arrived at from the other direction. `WORK_MODES` is still
imported from there, because that one *is* a shared column.

#### Hybrid is not the other three added together

The obvious objection to a fourth mode, and the reason its note answers it on
screen. Picking `gym_floor` and `online` says *some of my clients come in and
others are remote*. `hybrid` says something a client cares about far more:
*your programme is both* — you come in twice a week and the third is a call. One
is a mix of clients, the other a mix inside one client's week, and a trainer who
offers the second has to be able to say so.

#### One Save, and it calls only what changed

The tab shipped with **two** Save buttons, one per card, and that was wrong. The
reasoning for it was real — the halves are two records, columns on `trainer` over
`PATCH /v1/trainers/me` and rows in `working_hours` over `/v1/sync/push`, with
two ways of failing — but **it is an argument about how a failure is worded, and
it was used to settle a question about what a screen is.** A trainer does not
know or care that their gym's name and their Tuesday morning live in different
tables; they changed two things on one page and expect one Save.

Two primaries also make a *worse* failure than the one they avoid: press the
wrong one and half your edits are silently still sitting there — the "guess which
half landed" problem, moved from the error message to the moment before it.

So one button, with the partial failure written out instead of designed around.
`placeDirty` and `weekDirty` are computed separately and each gates its own
request: editing the gym name makes one PATCH and no push, editing Tuesday makes
one push and no PATCH, editing both makes both. Each half adopts the server's
answer only on its own success, and **a half that failed stays dirty**, so the
button is still there and the next press retries only that half. Measured:

```
Where you work saved. Your working week did not.
Injected: the week write failed. Your unsaved changes are still on
screen — press Save again to retry just that half.
```

…after which the row read *"Saving writes your working week."* and nothing else.

**Only sending the dirty half is a correctness rule, not an optimisation.**
`WeekPicker` shows one set of windows standing for every day, so writing the week
back when nobody touched it would flatten a Saturday that genuinely differs. A
Save pressed to change the map link must not be able to do that — and here it
cannot, because the push is never reached. Proved both ways against the database:
a week-only save left `trainer.updated_at` untouched, and a place-only save
landed 19 seconds *after* the newest `working_hours.updated_at`.

#### And the button is only there when there is something to save

`SaveRow` now draws no button at all when nothing is dirty — on **all six** tabs,
not just this one, because a profile whose sixth tab behaved differently from the
other five would be its own inconsistency.

An always-live primary on a settings screen has to have an answer for being
pressed with no edits in hand, and every available answer is bad: write the
unchanged values back (which on this tab is the flattening bug above), answer
"Saved." having saved nothing, or print the *Nothing to save* notice this screen
used to — a screen explaining a button it drew itself. **Nothing to do is better
said by there being nothing to press.**

This is *not* the greyed-out primary `NameForm` argues against, and the
difference is what the button would have said. In setup, Continue stays live on
an incomplete step because pressing it is how a trainer finds out *what is
missing* — the click has work to do. Here, with nothing edited, it has none.

#### Where the two records still show

Nowhere in the trainer's model of the screen, and in exactly one place in the
copy: the unsaved line names what the press is about to write — *"Saving writes
where you work"*, *"…your working week"*, or *"…both"* — because on this tab that
genuinely is two things and the seam is otherwise invisible.

**Read narrow, write through sync.** `lib/setup/api.ts`'s `getHours()` reads the
same rows out of a full `/v1/sync/pull`, which is affordable in setup and
nowhere else, and its own header says so in bold. This is a built screen on a
live account, so it uses the narrow route Today already reads. The *write* reuses
that file's `saveWorkingHours` — a push, with nothing to drag down — because
`/v1/working-hours` is deliberately read only: `WorkingHoursService`'s header
records that a table the phone also writes offline is not one to give a second
write path to. So `messageFor` in `lib/profile/actions.ts` now reads two error
classes; without that a rejected push would have fallen through to *"That didn't
save"* and dropped the server's own reason.

#### The lossy read, guarded twice

`WeekPicker` keeps **one set of windows for every day picked** — the model setup
has always had, and the fifth control extracted rather than copied (`HoursForm`
is now a wrapper around it, keeping only the Skip, the seed promise, and the
sentences that can offer that Skip as a way out).

That model is lossy in the **reading**: a trainer whose Saturday is a half day
gets Monday's hours drawn for it. In setup that cost nothing, because setup runs
before there is anything to lose. In Settings it would have written Monday's
hours over that Saturday, silently, by way of a button pressed to change
something else. So it is guarded twice — a line on the card when the stored week
is one this control cannot spell, and a `submit` that **refuses to write when
nothing changed.** A no-op save has to be a no-op.

#### One destructive edit, reported after the fact rather than warned about before

Moving to *on my own* clears `gymName`, and the server clears `gymSharePercent`
in the same statement — deliberately, because a percentage with nobody to take
it is an arrangement with no counterparty. The quiet alternative is worse:
keeping a hidden gym name because its field left the screen, so a client reads a
gym the trainer no longer works at.

The first version said so *before* the click, as a `.fld__e` under the vacated
fields. **That was wrong and it was the styling that made it wrong.** `.fld__e`
is the app's validation red, so choosing *on my own* — a perfectly valid answer
— painted an error on the screen and left a red block where a whole section had
just correctly disappeared. A section that is not part of the answer should
leave entirely, and it now does: the fields, the `THE GYM OR STUDIO` label and
that sentence all go together.

The fact is not lost, it moved to where it is a fact: the success message names
the gym that came off and says the share went with it, and wins that line over
the training-modes summary when it happens. `losesGym` still exists — it makes
the form dirty, so the unsaved marker stays honest — but nothing is drawn from
it. The gym name is read into `clearedGym` *before* the request, because by the
time there is a response the server's copy no longer has a gym in it to name.

#### And `/settings/hours` is a redirect now

It was a *Soon* row for as long as Settings has existed, and the working week
was editable exactly once — inside a flow that redirects anybody who has
finished it. So a trainer who took a Sunday off had no way to say so on a laptop
at all. The route is kept and redirects rather than being deleted: it is frame
2a, the settings index has pointed at it since it existed, and
`app/(main)/schedule/page.tsx` names it in a comment. What is still unbuilt is
the eight-week bulk pattern (frame 7a), which belongs to `/schedule` and never
was what this route promised.

#### Checked by rendering

All six profile tabs draw with the right `<CURRENT>`. On the work tab: the three
arrangement cards with *Both* pressed, the gym fields present, the four mode
cards, the area chips, the day strip, both window pairs at 06:00–11:00 and
17:00–22:00, and the ribbon reading *"Mon, Tue, Wed, Thu, Fri, Sat: 06:00 –
11:00 and 17:00 – 22:00"*.

Behaviour, one at a time: picking *On my own* removes both gym fields and raises
the clearing warning by name; picking *Both* puts them back and drops the
warning; the escape hatch adds an area and raises the unsaved marker. Save on an
untouched week answers *"Nothing to save. This is already your week."* and writes
nothing; adding Sunday and saving writes 14 rows; removing it writes 12, with
Monday to Saturday's original row ids untouched because those days matched.
Editing one Saturday row in the database directly raised the *"your days are not
all the same"* line, naming Monday as the day being shown.

Isolation proved against the server between each save: the place card's PATCH
left `specialities`, `certifications`, `languages`, `experienceBand`, `name`,
`headline` and `gymSharePercent` exactly as they were. A non-URL `mapLink` is a
400 from the backend and a sentence from the panel before that. Setup step 6
still renders correctly through the shared picker — rail, band, skip card, trust
row and both feet.


## Social links, the seventh tab — and the profile is complete · 29 Aug 2026

`lib/profile/tabs.ts` had said since the strip was built that this one *needs a
migration before it needs a tab*. **V35** — `trainer.instagram_url` and
`trainer.youtube_url` — so it is now a tab, and the strip is the seven the brief
named.

### Why the section is worth building at all

The six tabs before it are the trainer's own account of themselves — what they
coach, where, for how long, in which languages — and **this product cannot check
a word of it**. A client deciding whether to reply to an invite wants evidence,
and they will go and look for it on Instagram whether or not we link it.

So it links it. A trainer's feed is years of gym-floor video shot by somebody who
was not trying to sell that particular client anything, and it settles the
question the bio can only assert. **Clients following their trainer is a good
outcome for everybody**: the audience is the trainer's, this product has no
business between them, and omitting the one link every client looks for would
only teach them to go and search.

### Two named columns, not a list of links

`social_links JSONB` — a label and a URL, any number of rows — is the obvious
generalisation and it is the wrong shape here, for the same reason
`service_areas` is right as free text and `training_modes` is right as ids: **a
column should be as specific as its question.** A generic list needs a platform
catalogue to draw an icon by, collects one trainer's *insta* beside another's
*Instagram*, and cannot answer *is this row a real profile URL?* because the
shape does not say which platform the row is for. Two named columns can be
validated, canonicalised and rendered exactly.

A third platform is a migration, and that is the honest price. It is the price
already paid twice without regret — V33's three columns, V34's three.

### Canonical here, verbatim there, and the seam between them

V34 stores `map_link` exactly as pasted and argues at length that a normaliser
would eventually break somebody's working link. V35 goes the other way, with
`intro_video_url`. Both are right, and the seam is:

> **A profile reduces to a handle and a video reduces to an id — each is the
> whole fact. A place reduces to nothing.**

`instagram.com/ravi.trains?igsh=MXY3…`, the desktop URL, and `@ravi.trains` typed
bare are three spellings of one account, and the `igsh=` is a **share token** on
a profile a client reads, in a column that will outlive it. A maps URL's place
id and coordinates are not redundant in the same way.

What the canonicaliser is **not** allowed to do is rewrite the identifying part,
which is why a YouTube channel keeps whichever of `/@handle`, `/channel/UC…`,
`/c/…` and `/user/…` the trainer has: those four are not interchangeable, and
resolving between them needs a lookup against YouTube. `SocialLink.java`
validates shape and never reaches the network — the same discipline
`YouTubeLink` states, and for the same reason: a dead link is a support
conversation, a profile that will not save is a lost trainer.

### The two refusals name the mistake

Both are the most likely paste in their field, and both look completely right
until a client taps them:

- an Instagram **post or reel** (`/p/`, `/reel/`, `/stories/`, …) — a link to one
  video, stored as though it were an account;
- a **watch URL** in the YouTube field — which is a real string the trainer has,
  one tab away from `introVideoUrl`, the field that actually wants it. The
  refusal says so, on both halves: *"That is a link to one video. This field
  wants your channel — a single video goes on the Identity tab."*

`lib/profile/social.ts` holds the web's two checks and they are deliberately
**loose where the server is strict** — a stricter copy here would refuse links
the server would have taken, which is the worse failure. There is no normaliser
on this half: `SocialLink.java` is the parser, the PATCH returns the canonical
value, and the field shows what was actually stored rather than leaving the paste
sitting there looking authoritative. `instagramHandle` and `youtubeHandle` ride
the wire derived, the same call `introVideoId` made, so nothing here parses a URL
to render `@ravi.trains`.

### Where it shows, and what it does not do

The Identity tab's preview card gained a last line, and it is the **only borrowed
answer on that card that is a real link** — a trainer checking their own preview
is exactly the person who should find out that the handle they typed opens the
wrong account, and following it is the only way to find that out. A
`/channel/UC…` URL has no handle, so it draws *YouTube* rather than forty
characters of channel id.

There is **no share-my-profile anywhere on the screen**, because there is nothing
to share yet: the client-facing profile page is not built, and these columns are
read today by an invite and by nothing else. Like V33's bio and V34's modes, the
answer is collected for the moment that page exists, and nothing in the product
branches on it.

### Checked by rendering, against the dev database

Clean tab: seven tabs in the strip, **no Save button**, both hints in place.
Typing `@ravi.trains` raises Save; saving replaces the paste with
`https://www.instagram.com/ravi.trains` and the hint gains *"Saved as
@ravi.trains."*; the button disappears again. Blur checks, one at a time: a
`youtu.be` link raises the video sentence, an Instagram reel raises the post
sentence, a Facebook URL raises the generic one, and a half-typed `@ra` raises
nothing. A Vimeo URL got past a field that had not been blurred and the action
refused it with its own sentence.

Against the live endpoint: the share-sheet paste with its `igsh=` token, the
bare handle and the desktop URL all stored one string; `youtube.com/@ravitrains
?si=…` stored `https://www.youtube.com/@ravitrains`; a `/channel/UC…` URL stored
unchanged with a **null** handle; a watch URL and a reel were 400s; `""` cleared
one link and left the other, `introVideoUrl`, `mapLink` and `trainingModes`
untouched. Six backend tests in `TrainerSocialTest`, and V34's seven still pass.

**One thing this pass did not fix, and it is not V35's:** the dev backend answers
a 400 with `{timestamp,status,error,path}` and **no `detail`** — Spring Boot's
default `include-message: never` — so the server's own sentence never reaches
`messageFor`. That is true of every refusal on this endpoint, V33's and V34's
included, and it is why the two checks on this half are worth having rather than
a nicety.

## Settings became a tab strip, and the account is its first section · 29 Aug 2026

`/settings` was an **index**: a card of three rows — *Your profile*, *Nudge
messages*, *Your working week* — each one a link to a screen with its own bar,
its own back link and its own header. That was the right shape while Settings
had nothing of its own. It stops being the right shape the moment it does: a
page whose only content is a table of contents charges a page load per row to
find out the row was not the one you wanted.

So Settings is a **tab strip**, the same one `/settings/profile` is —
`PageTabs`, one real route per tab, the chrome in a layout. `lib/settings/tabs.ts`
is the vocabulary. Two tabs today: **Account** at `/settings`, **Nudge messages**
at `/settings/nudges`.

**Two of the three index rows are gone from Settings entirely.** *Your profile*
is reached from the account menu, which already had a row for it; *Your working
week* is a section of the profile's *Work & hours* tab. Neither is orphaned and
neither is a tab here, and the reason is not tidiness:

> **The profile is what a CLIENT reads. Settings is what only the TRAINER
> reads.** The old index said the first half itself, in the row's own copy.
> Seven tabs of client-facing profile behind tab one of a strip of
> trainer-facing settings is a trainer holding two positions at once, and a tab
> strip whose first tab opens a second tab strip is a shape nobody can navigate.

### The layout is in a route group, and it has to be

`app/(main)/settings/layout.tsx` was the obvious place and is wrong: it wraps
everything under `/settings`, **including `/settings/profile`**, which has seven
tabs and a layout of its own. A trainer on the profile would have got two top
bars, two headings and two tab strips — the second marking *Account* as the
current page.

`app/(main)/settings/(sections)/layout.tsx` costs nothing in the URL and draws
the line exactly where `lib/settings/tabs.ts` draws it: what is in that list is
in the group, and `profile/` and the `/settings/hours` redirect are outside it.
A redirect that paid for the layout's chrome on its way to throwing is the same
waste six other redirects were moved out of `(main)` to avoid.

**And the back links went with the index.** Both pages under here drew one,
pointing at `/settings` — correct when `/settings` was above them, and a control
that does nothing now that `/settings` IS the first tab.

## The account · V36 · a number, an email, and the way out

`/settings` — **Account**, and the only screen in this product that is about the
trainer rather than about their work. Three cards, because they are three
different kinds of act: **You** (a name and an email, one Save, reversible),
**Signing in** (the number, and the flow that moves it), **Delete your account**.

`lib/account/` holds the model: `api.ts` is the only place that talks to the
backend, `actions.ts` is every write, `rules.ts` is the caps and the one shape
check, `clients.ts` is a single integer for the delete confirmation.

### The email is not a login, and the field says so

There is no email anywhere else in this product. Sign-in is a phone number and a
six-digit code; the backend has no mail transport, no verification token and
nothing that could send one. So `trainer.email` (V36) is a **contact detail** —
stored, shown back, branched on by nothing, the position V33's bio is in — and it
is deliberately **not unique and not indexed**, because uniqueness is a property
of a credential and two trainers sharing a studio inbox is not an error.

The hint under the field says it out loud. A field that looks exactly like a
login and is not one is a field somebody will try to sign in with, and they will
find out on the day they lose their SIM — the worst possible moment to learn it.

**The shape check is loose on purpose, and looser than the server's is strict.**
One `@`, something either side, a dot in the domain, no whitespace. No attempt at
RFC 5322: a regex that tries costs several hundred characters, still gets quoted
local parts wrong, and rejects addresses that work. The only check that ever
settles an address is sending to it, and this product cannot send. A copy that
refused what the server would have taken is the worse failure — the trainer has
no way to appeal past the half that said no, which is the call
`lib/profile/social.ts` already makes for its two link checks.

### Changing the number is four steps and TWO codes

```
challenge → a code to the number they are on
verify    → that code back; the server answers a ticket
request   → the new number; a code goes to IT
confirm   → that code; both tables move, and a fresh token comes back
```

The **old** number is proved because the brief asks for it and because a bearer
token is seven days long and lives in a cookie: without this step anybody holding
one could re-point the account at a number they control and lock the trainer out
of their own book permanently.

The **new** number is proved, and that half is not in the brief. It is there
because the failure it prevents is worse than the one it costs: a mistyped last
digit is an account moved to a stranger's phone with no way back — the old number
no longer signs in and the new one is not theirs. One extra code against an
account that cannot be recovered is not a close call.

**The ticket never reaches browser JavaScript.** It is a ten-minute signed JWT,
`role: phone_change`, and it lives in an httpOnly cookie (`inclineyou_phone_change`) —
the same job `inclineyou_pending_phone` does between two sign-in screens.
`lib/auth/session.ts` opens by saying the JWT is *absent* from browser JS rather
than merely hard to read, and a second factor that is easier to steal than the
first is not a second factor. It is also never an `Authorization` header:
`SecurityConfig`'s `anyRequest().hasRole("TRAINER")` refuses a `phone_change`
role outright, so a ticket presented as a bearer authenticates nothing.

**It is inline, not a modal.** The number being replaced is on the row above and
a dialog would cover it; every step reads back either the number a code went to
or the number about to be taken, so the two are on screen together at the point
the trainer commits. The final button *names the target* — *Move my account to
+91 97000 00002* — which is the last place a wrong digit is still free.

**Resending is the server's answer, not a countdown here.** `/sign-in/verify`
draws the ladder because it owns the wait; this screen does not, and
reconstructing it would be a **fourth** copy of `RESEND_LADDER` — the root
`CLAUDE.md` opens with what three copies of a policy number already cost. *Send
another code* simply asks, and the server answers with the wait it is actually
enforcing.

### Deleting is a soft delete, described honestly

`deleted_at` on `trainer` and `app_user`, in one transaction. There is no hard
delete and there cannot be a cheap one: `client.trainer_id` is NOT NULL and
twenty tables hang off `client` in turn. What the stamp does is what a trainer
means by *delete* — the number stops resolving, every route stops loading, and
nothing in the product reaches any of it again.

**The number is not released, and that sentence is directly above the field.**
Both phone columns are plain UNIQUE indexes rather than partial on `deleted_at`.
Deliberate: the trainer's own rows still point at that row, and handing the
number to a second person would put a stranger's sign-in next to a year of
somebody else's money. It is the one consequence a trainer cannot discover by
trying it once, which is exactly why it is not in a help page.

**The confirmation is the number, typed**, matched on the last ten digits so
`+91 98416 57291` — which this very screen prints one card up — is an accepted
answer. Not a checkbox and not a second *Are you sure*: both are pressed by the
same reflex that pressed the first button, and typing ten digits is not. It is
also the only confirmation that names WHICH account is going, which matters on a
shared gym desktop.

**There is no OTP on the delete**, and the asymmetry with the flow above is
considered: changing a number is an attacker's goal, because it takes the account
over. Deleting is nobody's goal but the owner's — it destroys what an attacker
would want and hands them nothing. What it needs protection from is a mis-tap.

The delete runs **before** the sign-out, never after: signing out first drops the
token the delete needs, so it 401s and the trainer lands on `/sign-in` believing
they closed an account that is still open.

### Checked by rendering, against the dev database

The convention this file sets, honoured: the backend built and run on **:8090**
beside the one on :8080, a production build served on **:3100** from a COPY of
the tree, a JWT minted against the dev secret, and a CDP driver clicking the real
controls. **The harness is deleted; rebuild one if this screen is touched.**

What was driven end to end, not just fetched: both codes through the real
`OtpService`, a wrong code (*"That code isn't right. 2 tries left."*), a taken
number, the resend ladder, the full move across both tables, and a delete
through to `/sign-in` — the last two on a **throwaway trainer created and removed
for the purpose**, so the seed data was never touched.

Five defects, and the last two were only ever going to be found by looking:

| Where | What |
| --- | --- |
| the email refusal | **The server's sentence never arrived.** `TrainerService` threw `ResponseStatusException`, which serialises through the servlet error page as `{timestamp,status,error,path}` — the trap this file already records twice, most recently as *"not V35's to fix"*. Measured: `{"status":400}` and no `detail`. It throws `AccountRuleException` now, so *"That doesn't look like an email address."* reaches the trainer. **`headline`, `bio` and `gymSharePercent` still answer a bare 400** — pre-existing, and the next pass to touch one should move it the same way. |
| the throttle message | `mmss(6752)` rendered **`112:32`**, which does not read as one hour fifty-two — it reads as a clock time, and the one thing a wait must never be mistaken for is a time of day. `mmss` is right on `/sign-in/verify`, where the figure is TICKING beside a resend button; here it is frozen in a sentence, and the two waits this screen can quote differ by two orders of magnitude (a ten-minute lock, a twenty-four-hour ceiling). `waitPhrase` says it in words, rounded up below an hour so the message never expires before the wait does. |
| the delete card's first bullet | *"Your **0** clients, and every package, payment and session against them, stop being reachable."* A count works as a warning only while it is a quantity of something; at zero it is arithmetic in a sentence trying to give somebody pause. Zero takes the general sentence now, and so does a roster that failed to load — both mean *we cannot name it*. |
| the delete card's four facts | `webapp.css`'s reset is `ul,ol{list-style:none}`, so four separate claims about something irreversible rendered as one grey paragraph the eye takes in as a single sentence and skips. `listStyle:'disc'` inline on this one list — its two siblings in this codebase (`PackLife`, `PaymentsTab`) are asides and are right without markers. |
| — | And one that was NOT a bug, recorded because it cost twenty minutes: the email's blur check appeared dead in the harness. React's `onBlur` listens for **`focusout`**, and a synthesised `new Event('blur')` does not bubble. Dispatch `FocusEvent('focusout',{bubbles:true})`, not `blur`, and not `.focus()` on a neighbour. |

Three notes for whoever rebuilds the harness, on top of the ones earlier passes
left:

- **`pkill -f "next start -p 3100"` kills the shell that launched it, not the
  server** — the process is `next-server`. The symptom is the worst one
  available: the page still answers, from the PREVIOUS build, so a fix you just
  made appears not to work. Find the pid on the port instead.
- **read the OTP out of the backend log AFTER the click that sends it.** Opening
  the panel is what sends the code, so anything scraped beforehand is the
  previous sitting's and comes back *"that code isn't right"* — a harness bug
  wearing a product bug's face.
- **the rate limits are real and they are not in the transaction.** Ten codes per
  number per day, through Redis when it is up, so a second run of the same
  fixture on a developer's machine is refused for twenty-four hours.
  `TrainerAccountTest` answers this with a random per-JVM phone base and says
  why; a browser harness has to clear the `otp:*` keys or use fresh numbers.

### Backend, and what is NOT built

`trainer/AccountService.java`, `AccountController.java`,
`AccountDeleteController.java`, `AccountRuleException.java`, `V36`, and
`TrainerAccountTest` — thirteen cases, and the six properties they pin are listed
at the top of that file. `backend/API.md` documents all five routes.

- **The email is never verified and never sent to.** Wiring that is a mail
  transport, a token table and a template — not a column.
- **There is no export button**, which `webapp-settings.html` draws beside the
  delete and argues for in the same breath: *"Everything is exportable, and
  everything is deletable. Both are buttons, not an email request."* Half of that
  promise is now kept. `lib/money/csv.ts` exports the money book and nothing
  exports a roster, a program or a session history, so the honest version is a
  pass of its own rather than a button that exports a third of an account on a
  card about leaving.
- **Nothing in V36 enters sync**, like V30, V32, V33, V34 and V35, and there is
  no account screen on the phone. One consequence worth knowing: a phone signed
  in on a number that was changed here **keeps a valid token**, because a trainer
  token's subject is the trainer id and only the `phone` claim goes stale, and
  nothing on a trainer's path reads that claim. A phone signed in to a deleted
  account keeps working offline until its next sync, which then 404s.

## The component library's 2026 pass — and the stylesheet moved under the product · 30 Aug 2026

The design set's library (`../Design/webapp/webapp/webapp-components.html` and
its seven `webapp-c-*.html` pages) was audited against what production systems
ship in 2026 and re-worked; **`app/styles/webapp.css` was updated in the same
pass with the identical edits**, so the product renders all of it now. §-section
numbering is preserved and every change is inside §01 (tokens), §04
(components) and §24 (glass) — the re-copy rule still holds for the next pass.

What the audit found, so nobody re-finds it: dark `--tx-e1`/`--tx-e2` were
`none` (every card FLAT on the theme the product ships in), dark
`--tx-field-inset` was `none` (and `none` inside a composite shadow list
invalidates the declaration), `--tx-skeleton` had never been used, and there
was not a single `:active` state or `@keyframes` rule in 3,200 lines.

What is new and available to screens, all additive: press physics on `.btn`
and `.chip`; `.btn--loading` (label yields to a ring, width holds,
`aria-busy`); focus that lifts `.ctl`'s fill; spring knobs on switch / check /
radio; `.card--raise` for card-shaped links; `.stat__delta` + `.spark` on the
stat tile; `.skel` (six shapes, container carries `aria-busy`); `.toast` /
`.toasts` (LAST resort — the row is still the receipt; `role="status"`,
danger is `role="alert"` and sticky); `.tip` (inverse tooltip; the control
still carries `aria-label`); `.ring` (conic pack progress, `--ring-v`);
`.av--ring`; entrance choreography on panel / modal / palette / menu / scrim.
Glass now also covers the row menu and the toast — §24's overlay-only line,
which Apple's Liquid Glass (iOS 26) landed on too. Everything collapses under
`prefers-reduced-motion` / `prefers-reduced-transparency`.

Two rules the pass sets: the motion vocabulary is the eight `tx-*` keyframes
and nothing more (anything else is a transition), and `backdrop-filter` is
never animated. The usability gate for new components is
`../Design/webapp/webapp/UIUX-SKILL.md` — NN/g's heuristics in this product's
vocabulary. Colours are untouched; the brand question is a separate, later
pass. Verified by rendering both themes headless against the real stylesheet;
`npx next build` passes.

### The affix and the select, rebuilt — caught by looking at 1:1 · 30 Aug 2026

The 2026 pass above shipped without rendering these two at 1:1, and the review
that did caught both. Recorded here because each is a class of bug, not an
instance.

**`.affix` contradicted its own spec table** ("one border, shared, never
doubled"): input and affix each carried a border, so the seam doubled; a
TRAILING affix collided with `.affix .ctl`'s hard-coded right radius and lived
on per-instance inline styles; focus ringed the input and orphaned the affix
outside the halo; disabled dimmed one half of one control. Rebuilt on the
group-owns-the-chrome model (shadcn/Untitled UI/HeroUI input addons): `.affix`
carries border, fill, radius, inset and the `:focus-within` halo; the inner
`.ctl` is flat in every state; a trailing `.affix__p` after the input flips the
seam automatically — **trailing affixes work now**, so `PackSheet.tsx`'s
"prefix only" comment is stale, and Team's previously unstyled `.affix__pre` is
styled by the same rule. `.fld--err` rings the group; `:has(.ctl[disabled])`
dims the whole control. Sign-in's 44px inline heights still land: the group is
46px outer, exactly what the old model measured.

**`select.ctl`'s chevron was two 4px gradient triangles** pinned 15px from the
top — off-centre, and at 1:1 they read as dirt. It is a real glyph now via a
per-theme `--tx-chevron` data URI (a background-image cannot take
currentColor), centred to any field height, with `cursor:pointer`.

Two more findings from the same review, both already fixed: the library page's
select Focus and Disabled specimens had **duplicate `style` attributes** (HTML
ignores the second, so those states had never rendered), and §24's
`[data-glass] .panel .ctl{background:var(--tx-surface-2)}` used the
**shorthand**, which resets `background-image` and silently deleted the
select's chevron inside every glass panel — it is `background-color` now.
The rule this sets for the next pass: **a component is not delivered until it
has been rendered and looked at, at 1:1, in both themes, resting and focused.**

### The dropdown — the select's popup, claimed · 30 Aug 2026

The user opened a select on the forms page and the popup was the OS's: a white
list with a blue hover, on either theme — correctly filed as *looks like a
bug*. It was the last piece of platform chrome left in a form, and it could
never be styled before because the popup lived outside CSS. Chromium 135+
ships customizable selects (`appearance:base-select` + `::picker(select)`), so
**the popup is drawn by webapp.css now** — component 47, *Dropdown*, FORMS
group — as pure progressive enhancement: no new markup, the same `<select>`,
and every other browser keeps the platform popup, which the doc names as a
state rather than a failure. The picker wears the row menu's anatomy (32px
rows, `--w-hover`, selected answer in `--tx-accent-text` with `::checkmark` on
the right edge, optgroup headings in the `.lgrp` mono voice), `:open` reads as
focus plus a flipped chevron (`--tx-chevron-up`), the entrance is 140ms via
`@starting-style`, and glass applies under §24's overlay rule with both
accessibility exits. Verified OPEN, not just closed: a stdlib CDP driver
(`scratchpad/cdp.py` pattern — /json/list, raw WebSocket frames,
Input.dispatchMouseEvent, Page.captureScreenshot) clicked the real control in
headless Chrome 151 and screenshotted plain, grouped and light-theme pickers.

The same pass finished the FORMS category's state coverage against the text
field's eight: **Affixed field** gained Hover and Error rows, **Select** gained
Hover, Open and Error, **Textarea** gained Hover and Error — and Textarea's
Focus and Disabled specimens had the duplicate-`style`-attribute bug the
selects had (HTML drops the second attribute silently), so those two states
had never rendered either. That bug has now been found on FIVE specimens in
one page; when touching any faked state in this design set, check the
attribute count first.

### The shorthand strikes the pass that named it · 30 Aug 2026

The user opened a select on the light forms page and the button was a row of
tiled chevrons. Root cause: `.ctl:focus` — MY rule from this same pass — used
the `background` SHORTHAND, which resets `background-image/repeat/position`;
it outranks `select.ctl`'s longhands, so focus wiped the chevron closed and
tiled it from 0,0 while open. That is the third occurrence of one bug class in
one day (§24's panel rule, the library's specimens, now the focus rule), so it
is now a stated law: **a state rule touches `background-color`, never the
`background` shorthand — on anything, because you do not know which element
carries an image.** Base rules that DEFINE a resting background may keep the
shorthand. Gate: `grep -n 'background:var(--tx-field-hover)' app/styles/*` must
come back empty.

The verification lesson is blunter: the dropdown pass screenshotted the open
POPUP and never looked at the BUTTON, and never shot closed-plus-focus at all.
The gate is therefore stated harder: **every state × both themes, and the
WHOLE control in frame — a state change on one part of a composite control is
verified on all of its parts.** (The "bad alignment" half of the report was
the same bug plus the 3px focus halo, which probes as a 3px offset but is the
ring, not the box: the popup's border aligns with the button's border exactly.)


## The bell, and the alignment bug that had been live at every desk width · 31 Aug 2026

Two things, and the first one is why the second was asked for.

### `.top__acts` was never at the right of the bar, above 900px

The section *Two things the phone view got wrong* above records this bug at
phone widths and states the desk case explicitly: *"on a desk it changes
nothing, because `.omni` comes earlier in the flex line and takes the slack
first."*

**That sentence is wrong, and the bar has been left-clustered on every screen
above 900px for as long as the search box has been a `<button>`.** §03 aligned
the bar by putting `margin-left:auto` on `.omni`; `app.css` then adds a UA reset
for the button form, ending `margin:0`, which is `(0,1,1)` against that rule's
`(0,1,0)` and later in the cascade. The auto margin was cancelled — a correct
reset silently deleting a layout it had no idea it was part of. The breadcrumb,
the search box and the bell sat in a cluster at the left of a 1707px bar with
~950px of empty space beside them.

It survived because the design set draws the bar at 1440 as a picture, and
because nothing in the bar looks broken on its own.

**The fix moves the slack to `.crumbs`** — `margin-right:auto`, in §03 — which is
the one child of the bar that is always rendered and that no reset touches. One
auto margin, one rule, and the bar aligns the same way at every width: the
`.top__acts{margin-left:auto}` patch inside the 900px query is deleted, because
it existed only to put back what the field stopped doing when it was hidden.

The general lesson is worth more than the bug: **the element that happens to sit
in the middle should not be carrying the alignment.**

### And the bell now opens something

It was drawn on all twenty screens with `aria-label="Notifications"`, a hover
state and no handler — the same defect this file records for `.omni` on fifteen
screens, and worse on this control, because *a bell with no count reads as "you
have missed nothing"*, which is a claim rather than an absence. It is dropped
entirely outside the shell now, on the search box's terms.

| | |
| --- | --- |
| the surface | `.ntf`, §03, a 400px popover under the bar's right edge |
| the component | `web-components/ui/NotificationPanel.tsx` — catalogue entry 48, `c-notify` |
| the state | `components/shell/NotificationsHost.tsx`, mounted by `AppShell` |
| the model | `lib/notifications/` — `types.ts`, `copy.ts`, `api.ts`, `actions.ts` |
| the wire | `GET /v1/notifications`, `POST /v1/notifications/{id}/read`, `POST /v1/notifications/read` |

**It holds EVENTS, and Today's queue holds STATE.** That line is the whole
design. `deck.ts` computes eleven attention bands — a pack that is empty, an
invoice eleven days late — which did not happen at a moment, are true until
somebody fixes them, and carry the verb that fixes them. The bell holds things
somebody else did, each at a time, read once and then history: a payment taken
at the gym counter, a cancellation, a weight recorded, a client moved to another
coach. **A notification never carries a verb that changes the book.**

`AttentionItem.at` invites the opposite reading in its own docstring — *"so a
notification centre can date it"* — and that is the one thing the bell must not
be. Two surfaces listing the same rows means every verb in the product has two
homes and the trainer has to clear both to know what is left.

**Four kinds, and the test for a fifth is whether the product can observe it.**
That is the sync pill's test, applied again: there is no *client replied to your
reminder*, because nudges go out through `wa.me` and WhatsApp tells this app
nothing about what came back — `lib/nudges/types.ts` says so itself.

Two of the four — `cancelled` and `metric` — are things a CLIENT does, and they
were kept while the client half was one `NotBuilt` route, on a call deliberately
different from the sync pill's: the pill described an architecture the web app
has **decided against**, so "6 queued" could never be true, where the portal was
a screen the design set had already drawn and the product had not reached.

**`metric` is produced now** — 7 Sep 2026. The client portal's quick log writes
a `body_metric` row and unshifts a `metric` notification, so the kind has stopped
being decorative and the bell's feed carries something a client did. `cancelled`
still has no producer: a client cannot cancel a session from `/me/*`, because
§4 of the client spec refuses a booking engine — *"Request reschedule — a button
that opens WhatsApp to the trainer"* — and a `wa.me` link tells this app nothing
about what was agreed. Same test, same answer as the reminder above it.

**No `/notifications` route, and no sixth destination.** *What did I miss* is a
question about the other five rather than a sixth one, and a solo trainer with
two dozen clients generates a handful of events a day. The panel holds
everything, bounded to three weeks, and its footer says so — which is the only
thing that makes "everything is in here" honest.

Three smaller decisions, each with the argument at the call site:

- **Opening the panel does not mark anything read.** A count that clears itself
  on being looked at is a count nobody can trust. A row is read when it is
  opened; the header carries an explicit *Mark all read*, and it is **absent**
  rather than disabled when there is nothing to mark.
- **The feed is sorted by time, never unread-first.** A list whose order changes
  as rows are read is a list that moves under the pointer.
- **The panel is a sibling of `.top`, not a child.** §24 gives the bar a
  `backdrop-filter`, which makes it a stacking context — a dropdown inside it is
  trapped, and `.main` (`position:relative`, later in the DOM) paints over it at
  any z-index.

### Four defects found by rendering, three of them in the light theme

| Where | What |
| --- | --- |
| `.ntf__dot` | Was `--tx-accent`, which is **this stylesheet's opening rule broken**: *#C6F24E is a FILL, never a stroke and never text on a light ground*. A 7px disc carrying meaning wants 3:1 under 1.4.11 and the lime measures ~1.35:1 on white — invisible, on the one mark that says whether a row has been read. `--tx-accent-text`. |
| `.ntf__i:focus-visible` | §02's global ring is `outline-offset:2px`, which on a full-width row inside a panel with `overflow:hidden` puts three of its four sides outside the scroller — a focused row drew as one green line beneath it, which reads as a rule and not as focus. `-2px`. |
| `/library`'s specimens | Three of the four frames were shorter than the panel they held. `.ntf`'s max-height then makes the **list** scroll rather than clipping the panel, which on a bench looks exactly like a panel that fits — so the two-row block demonstrating the read/unread pair was showing one row. `Frame`'s `h` is required now, with no default. |
| `mock/db.ts` | The book lives on `globalThis` to survive a hot reload, so a table added to `seed.ts` is a table the stored book does not have: `GET /v1/notifications` answered **200 with an empty body** while the seed on disk was visibly correct, and survived a save, a reload and a hard refresh. `SEED_VERSION` now rebuilds a book built by an older module, dirty or not. |

Checked by rendering, per this file's convention: the real shell at 1707px and
at 390px (in a same-origin iframe — the window would not resize), both themes,
resting / hovered / focused / open, all four panel states, and the four
behaviours driven as real clicks — toggle, click-outside, the *Unread* filter,
a row opened (navigates, count 5 → 4, and the stamp verified on the server),
and *Mark all read*.

**`npx tsc --noEmit` and `npx eslint` are clean on every file this pass touched.
`next build` was NOT run** — it writes `.next/` under a dev server that was
already running, which this file records as producing a screen that renders the
previous build intermittently.

Two lint rules cost a design change each, and both were right. `react-hooks/refs`
refuses a ref handed across a context boundary — once any member of the context
object flows into a `ref` prop, a consumer reading `unread` during render is
reading a ref during render — so the trigger is found by `.top__bell` instead.
And `react-hooks/set-state-in-effect` refuses syncing the server's list in an
effect, so it is adjusted during render, the pattern `Schedule.tsx` already uses
for `?new=1`.

## A team is a WORKSPACE, not a screen — the switcher in the top bar · 31 Aug 2026

The product owner's framing, and it reverses a filing decision this file has made
twice: **a trainer can work in three tenants at once** — their own book, a team's,
a gym's — and *Team* had been sitting on the account menu as a permissions
surface, "read about as often as Settings".

That premise held and the conclusion did not. A team is not a setting. It is a
different set of clients, a different money book and a different roster, and
which one is open is the scope of every figure on every screen. **A question that
scopes the whole app cannot live three clicks inside a menu about the account.**

| | Was | Is |
| --- | --- | --- |
| the door to a team | a row in `AccountMenu`, and in `nav.tsx`'s `ACCOUNT` | the top bar's workspace switcher, at every width |
| the bar's first slot | `.crumbs` — the breadcrumb | `.wsw` — the switcher |
| `/team` | that row | **nothing yet** — see *The menu carries no link to the team screen* below |
| the shell's account shelf | Your profile · Settings · Team | Your profile · Settings |

### The breadcrumb was replaced, and that is the trade

`TopBar`'s docstring argues the crumb's case and is right about the question:
*"on the web a trainer can arrive anywhere from a URL, so where-am-I has to be
written down."* What changed is that **with three tenants, *where am I* is two
questions** — which book and which screen — and the bar has room for one.

The screen is already written down twice: the rail carries `aria-current="page"`
on the destination, and every screen under this bar opens with its own `.ph`
header and an `<h1>` in it (the pass that scoped `.ph__id{display:none}` to
`.ph--clients` is what makes that reliably true). The **book** was written down
nowhere. So the slot goes to the answer nothing else in the chrome was giving.

`crumb` stays a required prop and is still drawn wherever there is no host — the
component library, and any bar outside the shell — so the control degrades to
exactly what it replaced rather than to a gap.

### Only the switch is built, deliberately

Every workspace draws the same five destinations and the same data. The tenanted
reads are a backend change and this half cannot invent them, so **the switcher
changes which book you are in and says so honestly; it does not yet change what
the book says.** The screens inside a team workspace come next.

That ordering is not laziness: the navigation model is the part a trainer has to
learn, the part a design review can judge, and the part that decides what every
tenanted screen has to look like afterwards.

### The list is derived, never configured

There is no workspaces table. `lib/workspace/api.ts` builds the three rows off
things the API already answers — the trainer, and `/v1/team` — so the list is TRUE
the moment the data is, and it collapses to a single row for a trainer with
neither. When the backend grows a real tenant list, that function is the one place
that changes.

- **Solo first**, because it is the one that always exists and the one a trainer
  owns outright; a list whose first row can disappear is a list whose rows move
  under the pointer. Team before gym: a team is a book they help run, a gym is a
  floor they work on.
- **`/v1/team` answering 404 is the ANSWER**, not a failure — it is the commonest
  case. A refusal or a timeout also drops the row, deliberately: a switcher that
  omits a workspace it cannot confirm beats one that offers a team leading nowhere.
- **The gym is derived from `trainer.gym_name`**, because there is no gym row to
  point at, and `work_mode` is deliberately not consulted — V23's own rule is that
  it is a defaults hint and "must never gate a feature".
- **The cookie is resolved AGAINST the list, never trusted.** A trainer who leaves
  a team holds a cookie for a workspace that no longer exists, and a chrome
  rendering an active workspace nobody can switch away from is worse than one that
  quietly returns them to their own book.

`getTrainerIdentity` in `lib/shell/api.ts` is `cache()`d so the rail's name and the
switcher's gym are **one** round trip, not two — the layout's fourth read is
`/v1/team` and nothing else.

### Three decisions inside the control

- **One workspace draws no menu.** A dropdown whose list has one row takes a click,
  opens a panel and offers nothing — the dead control this shell keeps deleting
  (`.omni` on fifteen screens, the bell on twenty). It is a plain label, and the
  caret arrives the day a second book does.
- **The menu carries no link to the team screen** — it did for one pass, and the
  row is gone. See the section of that name below; the short version is that
  managing a team is a screen *inside* the team workspace, and `/team` is doorless
  until those screens land.
- **Switching is a server action, not a `document.cookie` write.** The switcher's
  state is rendered by the layout from that cookie, so a browser write would leave
  the menu saying one book and every screen under it still the other until
  something happened to re-render. `revalidatePath('/', 'layout')` makes the write
  and the re-render one response. The action **validates the id** — it is a public
  endpoint, and an unchecked write would let a cookie name a workspace
  `getActiveWorkspaceId` then discards on every read, giving the trainer a switch
  that appears to do nothing.

### Two defects found by rendering, and they are one defect

Per this file's convention, and they were both in a single screenshot: **a
transparent panel with the day's heading drawn straight through it.**

§24 gives `.top` a `backdrop-filter`, which makes it a **stacking context** — and a
containing block for fixed-position descendants too. A panel rendered inside it is
trapped twice over: `.main` is `position:relative` and later in the DOM, so it
paints over the menu at any z-index; and the menu's own glass fill has nothing
behind it to blur, because its backdrop is the bar's already-filtered layer.

**This file already records that trap**, for `.ntf` — "a dropdown inside it is
trapped, and `.main` paints over it at any z-index" — and this pass walked into it
anyway, which is the argument for the rendering convention rather than against it.

`.ntf`'s fix does not transfer: it mounts as a sibling of `.top` at a constant
offset, which works because the bell is pinned to an edge that never moves. This
trigger is at the LEFT edge, behind a rail that collapses, so a constant offset is
wrong in one of the two rail states. The panel **portals to `document.body`** and is
placed from the trigger's own rect, measured in the same handler that opens it — an
effect would paint it once at the viewport's top-left first — and clamped to a 12px
gutter so a narrow window cannot push its right edge off screen. It closes on
`resize` rather than re-measuring: a portalled panel holds a position rather than
an anchor, and re-measuring every frame is the wrong side of the trade for a menu
that is open for two seconds.

### Checked by rendering, both themes, desk and phone

The convention, honoured: a stdlib CDP driver against the running dev server, at
1440×900 and 390×844, dark and light, with the switch, Escape and the account menu
driven as real clicks. **The harness is deleted; rebuild one if this is touched.**

Verified: three rows with the right `menuitemradio` / `aria-checked`; the switch
writing the cookie and the trigger reading back *Iron Yard Coaching* after the
layout revalidates; Escape closing and returning focus to `.wsw__b`; the account
menu down to *Your profile · Settings · Sign out*; `docOverflowX` **0** at both
widths; 44px rows; the role line correctly dropped under 900px and present above
it. The library's `c-topbar` entry gained a specimen with both shapes — three
workspaces and one — over local state through `WorkspaceHost`'s `onSwitch`, because
a design review that cannot click the control is reading a screenshot.

**One note for whoever rebuilds the harness**, and it cost half an hour: Next 16's
dev server answers **403 to every `_next/static/chunks/*.js`** when the request
carries `Origin: http://127.0.0.1:3100` — so the page renders server-side, looks
completely correct, and **nothing is interactive**, which reads exactly like a
component whose handlers are not attached. Drive it at **`http://localhost:3100`**,
and set the cookie for that host.

### A default workspace, and the two cookies it takes · 31 Aug 2026

The product owner's follow-up: **mark a workspace as default, so that opening the
application loads it.** The switcher shipped with a single year-long cookie
holding the last book opened, which answered *open where I left off* — a
different question, and the one that was in the way.

**The control is a per-row toggle, not one switch**, and that was the question
asked. A switch is binary about one thing; a default is one-of-N. There is no
*no default* state — with nothing stored the answer is the solo book, which every
trainer has — so a switch would be offering a state the model does not have, and
a trainer who turned it off would be asking a question the product cannot answer.
Pressing one star releases the others, which is a radio's behaviour on a control
whose job is still *do this to this row*.

| | Answers | Lifetime |
| --- | --- | --- |
| `inclineyou_workspace` | which book is open in this sitting | **session** — dies with the browser |
| `inclineyou_workspace_default` | which book opens the app | a year |

**They are split by lifetime rather than ranked**, and that is the whole design.
There is one *open the app* moment and only one setting can own it: a default
that yields to last-used fires only on a browser that has never been used, and a
last-used that yields to a default is written on every switch and read on none.
Whichever loses is a dead control. So the default owns the launch, the active
choice owns the sitting, and `resolveWorkspaces` reads *active, then default, then
the first row* — where the session cookie's mere presence IS the question "am I
mid-session". Both ids come out of one cookie read and are returned together,
because the menu marks the current row and stars the default in one pass. Both are
still resolved against the list, so a starred team a trainer has left heals back to
their own book rather than starring a row that is not drawn.

**The star is `menuitemcheckbox`, not `menuitem` + `aria-pressed`** — that pair is
invalid and `jsx-a11y` is right to refuse it. `menuitemradio` would say the
exclusivity out loud and would put a second ungrouped radio set into a menu that
already has one, announcing "radio, 1 of 6" over three rows that are three pairs.
The row wrapper is `role="none"` so both halves stay direct items of the menu, and
the arrow-key walk covers all six plus the foot. It is deliberately **not disabled**
on the row that is already default: a disabled control drops out of that walk, and
this mark is how a keyboard user finds out which book opens the app.

The label does not change with the state — `aria-checked` already says whether it is
set, and a name flipping between *Open X…* and *X opens…* reads as a different
control appearing. A one-line hint under the rows says what the star does, because
a star is read as *favourite* at least as often as *default* and this is the one
control on the menu whose effect happens tomorrow.

### The bug rendering found: starring a row switched to it

Live, and it was the exact thing `setDefaultWorkspace`'s own docstring promised
not to do.

`resolveWorkspaces` answers `activeId` with the session cookie **and falls back to
the default when there is none** — which is the point of the default, and which
means that for a trainer who has not switched during this sitting the two ids are
one value read from one cookie. Move the default and the active moves with it:
star the gym while sitting in your own book and the screen you are reading changes
underneath you. The file said "it writes one cookie, not two" and was wrong about
which cookie.

So the sitting is **pinned before the preference is written**: the active
workspace is resolved as it stands and stored in the session cookie, making
explicit what was until then merely implied — *this browser is open in this book*
— and leaving the default free to mean only what it says. Clearing the session
cookie so the change lands at once is still wrong for the reason it always was: a
trainer setting a preference about tomorrow must not be moved out of the book they
are reading today.

The star also does not close the menu, where picking a row does. The only thing
that changed is a mark two rows away, and closing the panel would hide the one
piece of feedback the press produces.

### Checked by rendering

Driven as real clicks at 1440×900 and 390×844, dark and light, with the cookie jar
read back at each step. **The harness is deleted; rebuild one if this is touched.**

Verified end to end: solo starred and current on a fresh browser; starring the gym
moving the star and **leaving the trigger, the current row and the open menu
alone**, with `inclineyou_workspace=solo` written as the pin; switching to the team for
the sitting; dropping every session cookie (what closing the browser does) and
reloading into **the starred gym**, not the team; a bogus `inclineyou_workspace_default`
healing back to solo; 32px star targets and zero horizontal overflow at both
widths; the six-item arrow walk. The library's `c-topbar` specimen drives the same
control over local state through `onDefault`, so a reviewer can watch one star
release another.

**One note for whoever rebuilds the harness:** give the fake `inclineyou_token` an
explicit expiry. The real cookie has a 7-day `maxAge`; set without one it is a
session cookie, so the "close the browser" step signs the trainer out and the test
measures a redirect to `/sign-in` instead of the thing it is about.

### The menu carries no link to the team screen · 31 Aug 2026

The switcher shipped with a *Manage team* / *Create a team* row in its foot, on
the argument that moving *Team* off the account menu had taken away its only
entry point and a live route with no door is the defect this file names by name.

**The argument was right about the hole and wrong about where the door belongs.**
A team is a workspace, and managing one — seats, invitations, who reads what — is
that book's own settings, the same way the solo book's settings live under
`/settings`. A row in the switcher pointing at `/team` was the old filing
surviving one level up: a link *out* of the menu, to a screen not scoped to the
workspace the menu is about, drawn identically beside the two rows it has nothing
to do with. The menu does one thing now — it names the book and moves between
books — and the door moves inside the team workspace with the screens that pass
is waiting on.

**So `/team` is a live route with no entry point in the chrome.** Checked, not
assumed: `grep` for `/team` across `app/`, `components/` and `lib/` returns
`currentFor`'s prefix test and `lib/team/actions.ts`'s `revalidatePath`, and no
link anywhere. It is reachable by typing the URL and by nothing else. That is a
**known gap with an owner** — the team-workspace pass closes it — rather than the
accident this file has recorded before, and it is written down here so that pass
does not have to rediscover it.

`nav.tsx`'s `ACCOUNT` is unchanged and still two rows: putting *Team* back on the
account shelf would undo the whole framing, not patch it.

### Not built, and worth knowing

- **Tenanted reads.** Every workspace shows the same book — see above.
- **A count on the switcher.** `RailCounts.team` is kept as a field and nothing sets
  it; it is deliberately **out of `moreBadge`** now, because *Team* is no longer
  behind the phone's *More* slot and a dot marking a slot the thing it counts does
  not live behind is a dot that lies.
- **Creating or joining a gym tenant.** The gym row is derived from a string on the
  trainer's profile, which is all the schema has. A real gym tenant is a table.
- **The default is per BROWSER, not per account.** It is a cookie, like every
  other view preference on this half, so a trainer who signs in on the gym desktop
  starts in their own book there until they say otherwise. Making it follow the
  account is a column on `trainer` and a field on `/v1/trainers/me` — worth doing
  when a second device is a real complaint, and not before.

## The certified shelf — a catalogue to copy from · 31 Aug 2026

The product owner's brief: **predefined trainer-certified programs for ready use,
alongside the builder.** Three decisions were taken with them before any of it
was written, and every shape below follows from them: the programs are authored
**in-house** (one publisher, no marketplace), **using one copies it** onto the
trainer's shelf first, and the **certified shelf lands before builder speed**.

| | Where |
| --- | --- |
| the catalogue | `/programs/certified` — a filter rail beside a card grid |
| one program | `/programs/certified/:id` — the real columns, read-only |
| first run | `/programs` with an empty shelf — three cards instead of a blank page |
| the model | `lib/programs/certified.ts` (pure), wire in `api.ts`, one write in `actions.ts` |
| the handoff | `BACKEND-CERTIFIED-PROGRAMS.md` at the repo root — schema V37, four routes, the rules the server owns |

### The law it turns on is the one the product already enforces

**Handing a program over makes a copy.** `apply` copies a blueprint onto a
client; *Use this* copies a certified one onto a trainer. Both copies have
exactly one owner, and editing the original reaches neither.

Which is why **there is no *Assign* on that shelf.** A certified blueprint has no
owner a trainer can edit, so assigning it directly produces a client plan whose
*edit this program* button leads nowhere. And why a certified revision is a
**notice and never a merge** — the same refusal already recorded against
TrueCoach's template-sync toggle, one level up.

`copied_from.updatedAt` is the whole mechanism for that notice: it stores the
original's stamp **as at copy time**, not now. Storing the current stamp makes
the comparison always equal and the notice unreachable — which is exactly the
bug the first seed shipped.

### Three things it does differently from the plan

- **Certified is a card grid; `/programs` stays a list.** `.lrow` is the right
  density for six programs a trainer wrote and knows by name. The deciding
  information about forty they have never seen is a **sentence**, and a sentence
  does not fit on a 44px row beside a shape strip and a week count.
- **The preview is NOT `Builder` with a `readOnly` prop**, which was the plan.
  `DayColumn` already takes `readOnly` and honours it in all eight places, so the
  column is reused verbatim and `CertifiedPreview` draws no exercise row of its
  own. What is not reused is `Builder`'s other 900 lines, which are almost
  entirely the draft — the 20-deep undo stack, the debounced autosave and its
  `beforeunload`, four panels, the drag payload, the selection and the bulk bar.
  A preview can write nothing, so threading a flag through them would leave all
  of that allocated and make every future `Builder` change responsible for a
  branch nothing on that screen can reach.
- **The filters are client-side and stay out of the URL.** Five groups is
  thirty-one URLs nobody will link to, and a round trip to un-tick a chip is the
  cost `/schedule` already refuses for its mode filters. Stated cost: a link
  cannot carry "3 days, intermediate", and a reload drops them. The thing a
  trainer *does* link to is one program, and that is a route.

### `/programs` now has TWO static children, and the first one left a note

`programs/page.tsx` warned that `/programs/exercises` wins over `[templateId]` by
the App Router's own precedence and added *"worth knowing before anybody adds a
second static child."* This is that child. Safe for the identical reason — a
template id is a uuid and can never be either literal string — and the mock's
router carries the same ordering manually, where `templates/certified` **must** be
matched before `templates/:id` or `certified` is read as an id.

### Four defects found by rendering, and two were mine in this pass

Per this file's convention: a stdlib CDP driver against the dev server, at 1440
and 390, **both themes**, four screens each. **The harness is deleted; rebuild one
if this is touched.**

| Where | What |
| --- | --- |
| `DayColumn`'s grip | **The read-only preview drew a `cursor:grab` handle on every row and moved none of them** — verbatim the defect this component was already fixed for once (*"a grab cursor over a row that will not move reads as a broken feature"*), reintroduced from the other side by a caller that suppresses the drag rather than by a handler never attached. `<Grip/>` is now conditional and `.dayc__h--static` drops the cursor. The **span stays**, because `.dayc__ex` is a three-track grid and dropping the track would shift every ordinal a few pixels left of where the editable view puts them. |
| `mock/router.ts` · `certifiedView` | A **brand-new trainer was told "You have a copy"** on the first-run screen. It scanned the one shared book while `GET /v1/templates` correctly answers `[]` for that persona via `isEmptyBook`. The real backend cannot produce it — `mine` is narrowed by `owner_trainer_id` — so the mock now takes `empty` and spells that narrowing out. |
| `.cert__first` at 920px | Three cards at ~286px clamped `.certc__s` to three lines **mid-clause** — *"…and nothing th…"* — on the one screen whose whole argument is that the deciding information is a sentence. 1120px now, where a card's content box is ~330px and the longest summary fits with its last clause intact. |
| `.cert__rail` under 1080px | `.pg .split__l{max-height:38vh}` is right for the program shelf, which is a list you scroll to browse; this rail is six groups of controls and all six are wanted. At 390px it cut *Equipment* through its own label with nothing saying there was more. The cap stays (un-capped puts ~500px of chips above the first card) and it gets the `local`/`scroll` gradient pair `.dr__wrap` and `.tblwrap` already use. |

**The clamp was invisible to the overflow probe** and that is the lesson worth
keeping: `-webkit-line-clamp` truncates without ever making `scrollWidth` exceed
`clientWidth`, so the standing check could not see it. It was found by reading the
screenshot, and the probe now asserts `scrollHeight` too.

### Verified, and what is not

`tsc --noEmit` and `eslint` clean. `next build` **not run** — this file records
that it writes `.next/` under a running dev server and produces a screen that
renders the previous build intermittently.

Driven end to end against the fake backend: the copy write (20 blueprint rows,
`source: own`, provenance recorded, nobody assigned, `used_count` +1), all three
ownership states on the card (*Used by 214* / *Copied 31 Aug* / *Copied 1 Jul ·
revised since*), and first run for a genuinely empty book.

**Not verified: a superset surviving the copy.** The seeded catalogue has no
`group_id` and no `set_detail`, so that path is correct by construction and
untested against data. It is test 1 in the handoff doc, and it is the one thing
in this pass that could silently corrupt a blueprint.

**One lint rule cost a rename and was right:** the action was `useCertified`, and
a `use` prefix is a React Hook by convention, so `rules-of-hooks` rejects every
call site inside a `startTransition`. It is `copyCertified`; the button still says
*Use this*.

### Not built, and neither is an oversight

- **The revision notice on the builder header.** The card says *revised since*
  from `mine.stale`, which costs nothing. The same line on the trainer's own copy
  needs the origin's current stamp on the builder read, which `getBuilder` does
  not fetch — a wire addition worth stating rather than sneaking in.
- **Forty programs.** Five, and it is a content job. Five lights every filter
  group at least twice and is few enough to write properly.
- **Builder speed**, which is the next slice: the inline type-ahead that
  `LibraryPanel`'s own header documents and nothing implements, inline
  `sets x reps · rest` on the row, multi-target day paste, visible undo/redo, and
  a flush on client-side navigation — today a draft edited inside the 900ms
  debounce is dropped silently when the Exercises tab is clicked.

## What an exercise is — the target on the row, and one panel behind two doors · 2 Sep 2026

The first slice of the prototype in `mock-ui/prototypes/week-sheet.html` to reach
product code. A trainer picking from the library could not tell two movements
apart, could not see what one targets or how it is performed, and could not see
what adding it would do to the week they were filling.

### The change that mattered most was not the panel

`Barbell Bench Press` and `Close-Grip Bench Press` printed the identical meta
line — *Chest · Barbell · intermediate* — on every row of the library panel. The
catalogue has always known that one targets the **pectoralis major** and the
other the **triceps brachii**; `ExerciseWire` has always carried it; the row drew
`equipment ?? muscleGroup` and threw it away.

**The target is on the row now**, and no panel is a substitute for that: a panel
is opened one row at a time, and a list is read all at once. Dozens of pairs in
77 rows are in that position, and the library is specified to grow to ~1,300.

It also became a search axis. `GET /v1/exercises?q=` matched `name` and `target`;
the mock now matches `movement_pattern` and `body_part` too, because a trainer
who knows what they want by SHAPE — *horizontal push* — got nothing back.

Three surfaces gained it, and one of them was **lying**: `DayBand`'s column is
headed **Target** and printed `muscleGroup`, with a comment explaining that the
wire had nothing better. It has now, so *Goblet Squat* and *Romanian Deadlift*
stop both reading *Legs* on the preview a trainer reads to decide whether to copy
a program.

### One panel, two doors

`components/programs/ExerciseInfo.tsx` is the body. `ExerciseInfoView` is the
library panel's detail VIEW; `ExerciseInfoPanel` is what a row's menu opens.
Both render the same component, so a second detail view cannot drift from the
first — the discipline `prescribe` and `blocksOf` already enforce.

**Verified by comparing the rendered text, not by eye.** The two doors produce
identical bodies for the same exercise except for one affordance: *Show them* is
absent from the row's panel, because `onFindPattern` is supplied by the component
that owns a search box and there is not one there. That is `ProgramContext`'s
documented contract rather than a drift.

**Not `.panel`.** 420px, `aria-modal` and a scrim would cover the column the
trainer is filling — which is the thing they opened the panel to decide about.
The library panel flips in place and `‹ Library` returns with the search and the
filters intact; below 1180px it inherits the full-screen mode that panel already
had.

### Ordered for choosing, not for teaching

Identity → **Targets** → Movement → **In this program · week N** → Instead of
this → Form cues → How to do it → Your note on this row.

**Section four is the one worth arguing for.** Any exercise database gives you
cues and a how-to; only the builder can say *"On Day 1 · Upper A — 4 sets. Chest
is 7 sets this week — under the 10-set floor."* It reads `lib/programs/balance.ts`
— the same function a balance panel will read — so the numbers cannot disagree
with a panel drawn beside them. **MEV and MAV are a band, never a target**: every
sentence says *under the floor* or *above the ceiling*, and never *you should do
15*, which the numbers cannot support.

**Section five leads somewhere.** *8 others share the horizontal push pattern →
Show them* sets the search, which works because the search now matches on
pattern. The panel counts its own alternatives so no caller has to know that.

**Section seven keeps two owners apart.** `notes` is on the blueprint wire,
belongs to THIS program, and the trainer wrote it. A form cue belongs to the
movement and is identical in every program there is. Same word, two owners,
labelled apart — and only the row's door can pass one.

An empty section draws **nothing**, never an empty heading.

### The content is filler and says so

`mock/exercise-info.ts` writes cues, steps and secondary targets per **movement
pattern** — seventeen, covering all 77 rows, because a cue true of the pattern is
true of every member — plus **eight movements by hand** so the prose can be judged
as prose. Per-exercise filler at this size is one sentence with the name swapped
in, which teaches nobody whether the panel works. Same trick `TEMPLATE_SPECS`
uses: generate along a real axis.

It is deliberately **kit-free**: interpolating equipment into a generic sentence
produces *"set up under the bodyweight"*, and a tag at the top already says
Barbell.

**`description` finally has something to split.** `ExercisePanel` has done
`description.split('\n\n')` since it was written and the column held a generated
one-liner. It now holds the steps, one per paragraph, and that panel renders them
with no change to it — though it did need two: it drew no **Targets** and, once
the data existed, no **Form cues**.

### Six defects, and the gates caught one of them

`tsc` and `eslint` passed on five of these six at the moment they were live.

| Where | What |
| --- | --- |
| `.pg__opt`'s two lines | **The whole row right-aligned and rendered in 10px mono.** `.dayc__opt span` is (0,1,1) and sets `margin-left:auto`, the mono face and 10px — right for a row whose meta is one trailing word of kit. My rules were (0,1,0) and lost. Fixed at (0,2,0) rather than by source order, which is how `.body--flush`, `.srow--h2` and §24's panel rule each broke. |
| …and then the name alone | `margin-left:0` on the container was not enough: the auto margin reaches EVERY span, and inside a column flex an auto inline margin shrink-wraps the item and pushes it to the end. So the name right-aligned above a meta line that was already full width and therefore looked correct. **Two lines of one block disagreeing is what made it findable**; a one-line row would have looked deliberate. |
| `contextFor` | **Every exercise not yet in the program reported *Chest is 0 sets this week*** under a day carrying seven — silently, on the one section that is the reason to open the panel. It looked the group up in `names`, which holds only the exercises the template already uses, so the case the panel exists for was the case it could not answer. It takes the exercise now, not its id. |
| Escape | **One keypress spent two rungs.** `Builder` already owns a ladder — moving, copy-a-day, the open panel, the selection — and the library panel carried a second handler that also closed the panel, so opening the detail view and pressing Escape closed the lot. The panel consumes Escape only when it has an inner step, in the CAPTURE phase, which runs before every bubble listener on `window` whatever order they were added in. |
| the panel footer at 390px | Four fields, a toggle, a primary and a sentence is ~380px of a full-screen panel, which left the prose a **150px scroller** on the phone this feature is most for. The numbers stand down while the detail view is open; the BUTTON does not, because a batch half-picked is still half-picked. 150px → 710px. |
| `secondaryTargets` | **A muscle was its own secondary.** *Close-Grip Bench Press* is a horizontal push whose primary target is the triceps, and the horizontal push pattern lists the triceps among its secondaries — so the panel read *"Triceps brachii … also Anterior deltoid, Triceps brachii, Serratus anterior"*. The hazard is inherent in generating along a pattern. Filtered in the data, so every reader gets it right. Found by opening the one exercise the whole feature is argued from. |

The lint rule that refused `setState` in an effect was **right**, and the fix is
better than the code it rejected: the alternatives count is keyed to its pattern
and read during render, so a hinge count can never sit under a horizontal push
for a frame.

### Checked by rendering

The convention this file sets, honoured — the running dev server on :3100, the
real components, both themes, and every behaviour driven as a real click.

Verified: 77 rows / 17 patterns / **0 missing a target, 0 without cues, 0 pattern
without content, 0 orphan content, 0 duplicate lists**; the two bench presses
reading apart on the row and in both panels; `ⓘ` opening detail and **adding
nothing**, with the row still picking on click; Escape unwinding one rung; *Show
them* returning 9 for a count that said 8 others; both doors byte-identical but
for *Show them*; the batch surviving a read (*Add 2 to Day 1 · Upper A*) and the
fields returning with their values; add and undo intact (15 → 16 → 15); the
builder unchanged at 4 columns / 23 rows; **0 controls under 24px, 0 horizontal
overflow, 0 clipped text** at 1600 and at 390 in a same-origin iframe; light
contrast on the one accent control measured at **6.1:1**, which is
`--tx-accent-text` doing exactly what the stylesheet's opening rule requires;
console clean on every route touched.

`npx tsc --noEmit` and `npx eslint` clean. **`next build` was NOT run** — this
file records that it writes `.next/` under a running dev server and produces a
screen that renders the previous build intermittently.

**`SEED_VERSION` is 7.** The book lives on `globalThis`, so a field added to
`catalog.ts` is a field the stored book does not have — the trap already recorded
for `notifications`, and it bites the same way here: correct source on disk, stale
rows in memory, surviving a hard refresh.

### Not built, and none of it an oversight

- **Media.** Text-only by decision. No column, no CDN, and the panel is not
  waiting for one.
- **Editing cues.** That belongs to the exercise library, not to the builder.
- ***Show them* from a row's panel.** It would have to open the library panel for
  that row's day mid-read, which is a different surface arriving under the
  reader. The count still informs.
- **The rest of the prototype.** §18's inline `sets × reps · rest` on the row,
  multi-target day paste, visible undo/redo and the flush on client-side
  navigation are the named next slice and are untouched here.

## The week sheet — the builder replaced, on both shells · 2 Sep 2026

The rest of `mock-ui/prototypes/week-sheet.html`, in product code. The column
board is gone; `/programs/:id` draws days down the page with a docked library
and a balance panel beside them at a desk, and a three-level shell on a phone.

### What replaced what

| | Was | Is |
| --- | --- | --- |
| the board | `DayColumn` — four 236px lanes, side by side | `WeekBoard` — day cards that flow into as many tracks as fit, the open one spanning them all |
| editing a number | open `RowPanel`, change it, Save, close — once per number | type into the cell; `RowPanel` keeps everything a grid cannot hold |
| adding | a 380px modal over the day you were filling | `LibraryDock` in the rail, **one click adds**, the day is the review |
| volume | nothing anywhere | `BalancePanel`, under the dock, fed by `lib/programs/balance.ts` |
| across weeks | a board-wide view mode + a focus-day picker | the open day's second tab |
| copying a day | a mode: arm *Copying Day 1*, then click a column | the day menu lists the targets; one click |
| the phone | the desk's board, narrowed | `PhoneProgram` — L1 the week, L2 a day, L3 an exercise |

**Both shells are in the tree and CSS picks one at 900px** — the width the shell
already swaps its rail at. They are two designs rather than one that adapts,
because a day at a desk is a card beside two panels and on a phone it is a tile
that opens a screen; no media query turns one into the other. `Rail.tsx`'s
argument for not branching on a measured width applies unchanged.

### The prototype's delta rule deliberately did not port

`week-sheet.html` writes a typed number as a **delta across every week**, and
that is right *there*: it GENERATES weeks 2–8 from a progression rule, so typing
65 into week 3 would flatten a computed ladder into one repeated load, silently,
by an edit that looked local.

This model has no generated weeks. Law 3 says a week with nothing of its own
repeats week 1, and every other week is rows a trainer or `applyProgression`
actually wrote. **So a number typed against week 3 belongs to week 3's row and to
nothing else** — porting the delta would have made every edit reach seven weeks
the trainer could not see. `lib/programs/weeksheet.ts` carries the argument where
the write happens.

That is the shape of this whole port: the CSS transferred nearly verbatim, and
every piece of *behaviour* had to be re-argued against a model the prototype did
not have.

### Seven defects, and the two worst were older than this pass

`tsc` and `eslint` passed on all seven while they were live.

| Where | What |
| --- | --- |
| the template-reload effect | **Every autosave emptied the undo stack.** `flush` refreshes after a write so the shelf picks up the new `updated_at`; that arrives as a template whose stamp differs from the one we loaded, which is indistinguishable from somebody else's edit — so the effect reloaded rows IDENTICAL to the draft on screen and, on the way, cleared 20 steps of undo and closed everything open. Invisible before, because the rows never changed; **a 20-deep undo stack that resets every 900ms is not 20 deep**. The guard that was there set the stamp to `:pending`, which *guaranteed* the reload rather than preventing it. `selfSaved` now skips exactly one reload; a second tab's edit still lands, because it arrives without the flag. |
| `names`, again | A row added from the dock read **“Exercise not in your library”** and the balance did not count it — `names` is fetched for the exercises the template ALREADY uses. The old screen hid this behind the reload after every autosave, so fixing the bug above **exposed** this one. Relying on a round trip to learn a name we were handed in the click is the wrong shape anyway: the dock passes the whole row and it is merged into a local overlay. Same root cause as the §19 pass's *Chest is 0 sets*, from the other side. |
| L3 on the phone | **The stepper did not move the number.** The sheet held the `Entry` itself, so it was a SNAPSHOT: the write landed in the model and the sheet went on drawing the copy it captured. A trainer presses + four times and nothing happens — while four writes land. It holds `{day, uid}` now and looks the row up live, which also closes it if the row is removed underneath. |
| the phone, top of screen | Before a single exercise: the program header, the tab strip, **38vh of other programs**, a week strip, a days-a-week select and a Progression button. Three of those stand down under 900px, and each is a duplicate rather than a sacrifice — the shelf is the Programs tab one tap away, the toolbar's week strip is drawn again inside `.wsm` sized for a thumb, and `.wsm__hd` printed the program name a second time 80px under `.ph`'s. |
| `NumCell` | Committed on every keystroke, so typing `12` over `8` put a **1-rep set** on the undo stack and into the autosave on the way. It holds a draft; blur and Enter commit, Escape abandons. |
| the Escape ladder | The old ladder had rungs for *moving* and multi-select, both gone with the columns. Every surface with an inner step — the dock, a menu, the phone's three levels — consumes Escape in **capture**, so one press spends one rung. |
| the editor's grid | Mapped rows flat with `i + 1` ordinals, so a superset showed `3a`/`3b` on the card and **dissolved into two straight sets when you opened the day to edit it**. Ported straight from the prototype, where it was also a bug. Both levels read `blocksOf` now. |

Two lint rules cost a design change each and both were right: a component
declared during render (`AcrossWeeks`, now its own file) and a ref read during
render (`NumCell`'s editing flag, now state — and correct, because a ref does not
re-render, so the first render after focus was reading the previous value).

### Checked by rendering

The running dev server, the real components, every behaviour driven as a click.

Desktop: 4 day cards / 23 rows; the open card spans the board at 1300px with 18
editable cells and SETS/REPS/LOAD/REST headers; typing 4 → 5 moved the day figure
20 → 21 sets **and** Chest 7 → 8 in the panel in one render, because both read one
`balance()`; undo restored it and **survived the autosave**; the dock opened in
the rail *above* the balance with *ADDING TO · DAY 1 · UPPER A*, 40 rows and
`on · N` counts; one click added *Pec Deck*, named, with Chest 10 → 13; the
across-weeks tab said honestly that only week 1 was authored, then drew
`Exercise / Wk 1 / Wk 2` with the current column marked once a second week was
made its own.

Phone, at a 357px viewport: the desk half `display:none` and the phone half
`block`; 4 tiles with volume bars and muscle summaries; *Balance · 4 flags*
collapsed to one line; L2 with the day name, `Week 1 · 6 ex · 20 sets` and the
next-day arrows in the header; L3 pinned to the bottom with four steppers, a
**dead Load** on a row that carries none, and the same seven menu items as the
desktop. **0 controls under 44px, 0 horizontal overflow, 0 clipped text.**

Console clean; `tsc` and `eslint` clean on everything this pass touched. **`next
build` not run** — this file records that it writes `.next/` under a running dev
server. Seed data restored: the sets I typed are back at 4 and the week I
authored is a ghost chip again.

### What came out, and what deliberately stayed

**Deleted with the columns:** multi-select and the bulk bar, the *moving* mode,
HTML5 drag-and-drop, the `Days across / Weeks across` toggle and the focus-day
picker that existed only to feed it. Two dead controls is what that toggle would
be now that days run down the page.

**The drag is the real loss and it is stated rather than hidden.** `dropEntries`
and `moveEntries` are still in `blueprint.ts`, unused by this screen. Reordering
is *Move up* / *Move down* in the row menu — which was always the keyboard path
and the only one that ever worked on a touch screen — and a pointer drag on the
new board is a fair thing to want back. It needs a drop model for a card that
spans tracks, which is a design question rather than a re-wire.

**`DayColumn` and `RowPanel` both stay.** `DayColumn` is `CertifiedPreview`'s,
read-only, and has nothing to do with the builder any more. `RowPanel` is where a
tempo, a note, an alternate, per-set detail and sets-to-failure live: four columns
hold the four numbers that change constantly, and putting the rest in the grid
would make the common case pay for the rare one.

### Not done

- **A pointer drag on the new board**, above.
- **The ~1,100 lines of CSS are in `app.css`, not the design system.** It is one
  screen's layout rather than a value or a catalogue component, so it sits with
  the other screen deltas and the copy-verbatim rule holds. It is a candidate for
  promotion once the design stops moving; the day it is promoted, that block is
  deleted rather than duplicated.
- **§17's per-exercise prescription step.** The dock adds at 3 × 10 · 60s and the
  trainer edits in the grid, which is the desk answer; the phone's picker is
  still the old `LibraryPanel`. Worth revisiting with a trainer.

## The programs section on a phone — the shelf, and the header that was a third of the screen · 2 Sep 2026

Entirely `@media (max-width:900px)`. **Nothing above 901px changed**, and that is
measured rather than asserted — see *Checked by rendering* below.

### `.ph--today` had already written the argument; Programs never applied it

Measured at 390×844, with the bottom bar's 53px already spent:

| Screen | `.ph` | chrome | of 844 |
| --- | --- | --- | --- |
| `/programs/:id` | **225** | **281** | **33%** |
| `/programs/certified` | 156 | 212 | 25% |
| `/programs` · `/programs/exercises` | 118 | 174 | 21% |
| `/schedule` | 75 | 131 | 16% |
| `/today` | **31** | 87 | 10% |

The bottom two rows are the answer and it was already in this file: *"the date is
said twice … a 22px headline that wraps to two lines on a 320px screen to repeat
the first eight characters of the line under it is the most expensive 60px on the
page"*, plus the identical call `.sch__ph .ph__t` makes. Programs is the one
section that never got it, and it has the tallest header in the app.

Inside the builder the 225px is 14 padding + 71 identity (a 29px headline over a
subtitle that wrapped to 38) + 12 gap + **76 of actions** + 53 of tab strip. The
76 is the tell: three buttons fit one row and the 32px overflow control wrapped
onto a second, so **42px of a 390px screen went on one icon**.

Three classes, because a class per screen is what stops one screen's answer
becoming every screen's:

| | Screens | headline | actions | tab strip |
| --- | --- | --- | --- | --- |
| `.ph--pglist` | my programs · certified · exercises | stands down | kept | kept |
| `.ph--pgshelf` | my programs · first run | stands down | stand down | kept |
| `.ph--builder` | a program open | **replaced** | two of four | dropped |

`/programs/certified/:id` is deliberately in none: its `<h1>` is a program's NAME,
which nothing else on that screen says. Every `<h1>` is **visually hidden, never
dropped** — the same declaration and the same reason.

### The shelf was not hidden on a phone, it was gone — and the reason given was wrong

`app.css` drops `.split__l` inside the builder under 900px on the grounds that
*"the Programs tab IS that way back, one tap away in the bar"*. **`nav.tsx`'s
`HIDDEN_FROM_BAR` is `['prog','biz']`** — Programs is not in the bar at all, it is
behind *More*. The only real door was the *My programs* tab in `.ph`, which is a
page navigation: it leaves the draft and asks the trainer to find their place
again.

And on its own route the shelf was a 321px band capped at `38vh` whose inner
scroller measured **128px** — two of six programs, nested inside the page's
scroller — above **296px** of *Pick a program to open it.* A list-detail split is
a shape for choosing between two panes; a phone has one. The empty pane is gone
under 900px and the list takes the screen: **128px → 497**.

**The name is the switcher.** `components/programs/ProgramSwitcher.tsx` — the
program's name in `.ph` with the count and a chevron, opening a bottom sheet
holding `<Shelf variant="sheet">`: the same component the desk draws, same search,
same goal chips and counts, same `.lrow` rows, same *New program* foot. One
renderer, two shells.

The two alternatives were priced. A sticky chip strip switches in one tap and
costs 44px permanently — on the shell three rules in this file already fought to
reclaim height from — and a chip carries only the name, losing the clients count,
the day shape and the week count, which are the three facts the shelf exists to
show. A back arrow costs nothing and makes every switch a round trip. The name
costs **zero permanent pixels**, and it is not a new idiom: `TopBar` already makes
the workspace name a switcher with this chevron, and `PhoneProgram`'s menus are
already bottom sheets over a scrim.

**The count and the chevron are one box.** A bare `6` beside a program's name
reads as a fact about that program — six weeks, six days.

*13 on this* and *Duplicate* become rows in the program menu, which is where
§13.5's IA table already files them. **Assign stays visible**: a primary behind an
unlabelled ⋯ is one a trainer has to already know about.

Measured after: the builder's chrome **281 → 132** (33% → 16%) and its content
window **510 → 659**; `/programs` **174 → 139**; certified **212 → 176**. At
360×780 the builder's `.ph` is the same 76px.

### One defect found by rendering, and it predates this pass

**A folded shelf rendered the entire builder 44px wide on a phone.** The 1080px
block gives a folded shelf a two-track `44px minmax(0,1fr)` template so the spine
stays a left column; the 900px block hides the shelf outright. `display:none` does
not leave an empty track — it removes the element from the grid, so `.split__r`
auto-places into column one and the week strip, the balance line and every day
tile stack into a 29px column with the page scrolling sideways.

Reachable on one device with nothing unusual: `collapse.ts` keeps the fold in
`localStorage`, so a trainer who folds the shelf at 1200px and then narrows the
window gets it, and it survives every reload until they reach a desk width to
unfold something they cannot see. The builder's split is one track now, at a
specificity that holds whatever order the two rules end up in.

The smaller one is worth the shape: the count pill's `--tx-ink-3` measures
**3.01:1** against the hover ground on light. That is the system's own small-print
step, fine at `.ph__sub`'s 13px and not at 10.5px tabular on the one figure in the
control that carries information. `--tx-ink-2` — 6.88:1.

### Checked by rendering

The real components in same-origin iframes at **360×780 and 390×844**, both
themes, every behaviour driven as a real event. **The harnesses are deleted;
rebuild one if this is touched.**

Verified: the sheet opening from the name; search inside it narrowing to one row;
tapping it switching the program end to end with the sheet closed and the header
naming the new one; the scrim closing it; **Escape spending exactly one rung** —
sheet, then L3, then L2 — with the day behind untouched; the menu's two phone
rows; the strip and both desk secondaries `display:none` with *Assign* and *⋮* the
only visible actions; the `<h1>` present at 1px; the subtitle **one 17px line**
where it was 38; a 52-character name ellipsizing with the header still 76px; **0
horizontal overflow, 0 controls under 24px** everywhere; console clean.

The desk at 1440, after every change: `400px 976px`, `.pg__ph` still `flex` and
not `grid`, `.pgsw` `none`, the strip `flex`, the `<h1>` 949px, four visible
actions, six shelf rows, the menu carrying only *Undo* and *Remove*, zero
overflow.

`tsc --noEmit` clean; `eslint components/programs` clean.
`components/exercises/ExerciseLibrary.tsx:76` fails `set-state-in-effect` and was
failing before this pass. **`next build` NOT run**, per this file's note that it
writes `.next/` under a running dev server.

**Not rendered: the first-run branch.** `FirstRun` needs an empty shelf, which
means the mock's `fresh` persona, and the harness could not get a fresh token
past the httpOnly `inclineyou_token` a real sign-in had already set. What it gets from
this pass is the same `ph--pglist ph--pgshelf` pair as the shelf branch, and its
two header buttons are repeated in `.cert__first` below — *See all N certified
programs* and *Write your own from scratch* — which is read off the JSX rather
than seen. Worth ten seconds the next time somebody signs in on a new number.

**One note for whoever rebuilds the harness:** drive it at
**`http://localhost:3100`**, never `127.0.0.1` — this file already records that
Next 16 answers 403 to every `_next/static/chunks/*.js` carrying an
`Origin: http://127.0.0.1:3100` header, so the page renders server-side, looks
completely correct, and **nothing is interactive**. Half an hour went on a switcher
that appeared not to open.

### Not done

- ~~**The certified route's filter rail at ≤900px**~~ — **closed**, in the
  section directly below, and it measured worse than this bullet guessed.
- **L2 keeps the program-level header.** At 76px it is no longer expensive, and
  *which program am I in* is worth saying while a day is open — but *Assign* above
  a single day's rows is the wrong verb for that moment. A level-aware header is
  the next thing to look at with a trainer.
- **A drag on the phone**, unchanged from the week-sheet pass.

### The certified filter rail — a bar and a sheet, not a column · 2 Sep 2026

The one thing the pass above left open, and the measurement is why it could not
stay open. At 390×844 the rail took **321px — 38% of the screen** — and did not
even hold itself: `.cert__rail`'s content is 386px, so *Equipment* and *Yours*
were reachable only by scrolling a box nested inside the page's scroller, with
nothing above the fold saying two groups existed. The catalogue got **294px**,
and the first card began at **y=536 — 63% down the screen**, on the screen whose
whole job is showing programs.

**The shelf's answer does not transfer**, and that is the interesting part. The
program shelf's goal chips became one horizontally-scrolling row at this width;
a filter set cannot, because **`3`, `8 wks` and `Beginner` are ANSWERS and the
question each answers is its group's own label.** Strip the labels to win a row
and twenty chips are a word search; keep them and it is six stacked rows, which
is the 321px.

So the column becomes **one 59px bar** — the search, which is the fastest filter
on the screen, plus a counted *Filter* control — and the six groups move into a
bottom sheet. Neither half is new: `Clients.tsx` put filters behind a control
reading *Filter · 2* before this screen existed, and `.pgsheet` is the section's
sheet from the pass above. The scrim was renamed `.pgsw__scrim` →
`.pgsheet__scrim` in the same edit, because it belongs to the sheet rather than
to the switcher that happened to open the first one.

| | before | after |
| --- | --- | --- |
| the rail | **321px · 38%** | **59px · 7%** |
| the catalogue | 294 | **556** |
| first card at | y=536 · **63%** | y=274 · **32%** |
| groups reachable | **4 of 6** | **6 of 6** |

**The sheet needed a head and a foot the switcher's did not.** That one opens on
a search field and a goal row, which say what it is, and every row in it is a way
out; six groups of chips say neither. So: a *Filter* title with a ✕, and a foot
that says what the sheet did — every chip narrows the grid the instant it is
pressed and the sheet is *over* that grid, so without it the trainer is ticking
chips at a surface that answers nothing until dismissed. *Show 3 programs* is the
answer and the way out in one control.

**At zero the foot's two controls swap**, which is `NoMatch`'s own rule arriving
in the foot: a lime primary reading *Show 0 programs* invites a trainer to
dismiss a sheet in order to look at nothing. The count becomes *Nothing matches
all of these.* and **Clear all filters becomes the primary** — and clearing
leaves the sheet open, because clearing is what you do to keep looking.

**The early-return trap, caught a second time.** `FilterRail` returned early for
the folded state without drawing the phone's half — the same shape as the split
bug in the pass above and with the same consequence, since `collapse.ts` keeps
the fold in `localStorage`: a trainer who folds this column at a desk and then
opens the same browser at phone width would get a spine that is `display:none`
and **no filters at all**. The desk's fold and the phone's sheet are different
questions about different surfaces, so neither branch may drop the other's
control; the search, the button and the sheet are built once above the branch.
The split is stated as one track for `.cert__l` by name so no remembered `--min`
can hand the catalogue a 44px track. Verified with the flag actually set.

**One instance, not two.** The groups are declared once and rendered once at any
width: the column is `display:none` under 900px and the *Filter* button is
`display:none` above it, so this pays neither the duplicated markup nor the
duplicated accessibility tree `.pgw__desk`/`.pgw__phone` accepts. The sheet reuses
`.cert__rail` for its body, cancelling only the two things that were about being
a column — the 1080px scroll-gradient pair (which painted a false edge under the
header) and the 400px column's padding. `shownCount` comes from `CertifiedShelf`
rather than a second `applyFilter`, because it is the same list `.cert__count`
prints from.

**Checked by rendering** at 360×780 and 390×844, both themes, driven as real
events: the sheet opening with six groups in order; ticking *3 days a week*
moving the foot to *Show 3 programs* live while the sheet is open; dismissing by
the primary and finding the chip reading *Filter 1*, the pane reading *3 of 5 · 3
days a week*, three cards; three chips accumulating to *Filter 3*; the zero state
and its clear; Escape and the scrim both closing; 0 horizontal overflow and 0
controls under 24px everywhere; console clean. The desk at 1440 after:
`400px 976px`, six groups in the column, the fold control `flex`, the *Filter*
chip `none`, no sheet in the document, five cards, zero overflow.

`tsc --noEmit` and `eslint components/programs` clean. `next build` not run.

**Found and deliberately not changed:** two chips pressed inside the same frame
lose one, because each `onChange` builds the next filter from the `filter` prop
and React has not re-rendered between them. It is the shape every chip row in
this codebase uses, a finger cannot produce it, and it turned up as a harness
artifact rather than a report — recorded so the next person driving this with CDP
does not chase it.

## The phone shell, finished — a title, a search bar, and the + that means it · 3 Sep 2026

The product owner's brief for the mobile view, in their own order: *a bottom
navigation bar with today, schedule, client and more; in more, programs and
business; an add button at the centre for quick adding clients, sessions,
exercises; a header with search bar, notifications, screen title; a scrollable
body with the page content — for all pages.*

**Four of those already existed** and this pass did not rebuild them: the bar,
the raised centre +, *Programs* and *Business* behind *More*, and `.body` as the
one thing that scrolls between two bars that do not move. What was missing was
the header's three, the + landing anywhere real, and one order.

| | Was | Is |
| --- | --- | --- |
| the bar | `Today · Clients · (+) · Schedule · More` | `Today · Schedule · (+) · Clients · More` |
| the header's title | **nothing** — the workspace switcher held the slot | `.top__title`, the screen's name, on every page |
| the header's search | a 24px icon button | `.omni`, the field, full width on its own row |
| `--w-top` ≤900px | 56px, one row | **90px**, two rows |
| the + sheet | five rows, **three of them `Soon` and disabled** | five `<Link>`s, each landing on an open form |
| the icon search button | `.top__search`, drawn at one width | **deleted** |

### The bar's order is not the rail's, and that reverses a line in `nav.tsx`

`PRIMARY` puts *Clients* second and argues for it at length — it is the one
destination that answers a question about a PERSON. That is an argument about a
column of five labelled rows read top to bottom at a desk. `BAR_ORDER` is three
slots around a raised action, and the two surfaces differ in the way that
matters: **the rail is read, the bar is aimed at.** *Today* and *Schedule* are
the two halves of one question, so they belong on the same side of the +, and
the pair a thumb travels between most should not have an action between them.

It is a list of **keys**, looked up in `PRIMARY` and throwing on a miss, so the
bar still cannot name a place the rail does not — the reason those lists were
put in one file. `SPLIT` is untouched: two tabs, the action, a tab and the door.

### The header is two rows, and `--w-top` is the only number that moved

```
┌──────────────────────────────────────────────┐
│ [plate]  Today                        [bell] │  44px
│ [ ⌕  Search clients, sessions, exercises… ]  │  38px
└──────────────────────────────────────────────┘
```

**`.top` becomes a grid and the TSX does not move.** The four controls are
authored in the order a 1440px bar wants them — book, title, field, actions —
and `grid-template-areas` re-seats three of them here. One component, one
markup, and the row the field moves to costs nothing in TSX.

**Raising `--w-top` is the whole of "the header is taller here".** §03's `.app`
is `grid-template-rows: var(--w-top) …`, so `.main` takes the remaining `1fr`,
`.body` scrolls inside it, and the notification panel — anchored at
`calc(var(--w-top) + 6px)` — followed on its own. Measured at 96px with no rule
touching it. 90 is arithmetic: 44 for a row whose tallest control is a 44px icon
button (WCAG 2.5.5), 38 for the field, 6 of gap and 2 of border.

**The title is derived from the crumb, not a twenty-first prop.** Twenty screens
already pass a `crumb`, and a crumb is a PATH — `Clients / Meera K`,
`Programs · Certified · Upper/Lower`. `screenTitle()` takes the last segment,
which is the thing the path arrived at. `title` overrides it, and **nine screens
pass one**, because six of them share the crumb *Sessions*: the workout console's
`<h1>` is whose session it is, and a bar reading *Sessions* over it would be
naming the flow instead of the screen. Business states *Business* for the
opposite reason — its crumb's last segment is the TAB, and the tab strip is drawn
two rows below saying which one is open.

**It is `aria-hidden`.** The `<h1>` in `.ph` is the document's heading and is
kept in the accessibility tree even where it is visually hidden, so a reader that
announced this too would say the screen's name twice before the first control.

### The search box is a bar on a phone, and that reverses this file's own note

*Two things the phone view got wrong* records the field as `display:none` below
900px with an icon button standing in, because `.omni` is a fixed 320px and
pushed the breadcrumb and the bell off a 390px bar. **Correct arithmetic, wrong
conclusion:** 320px was the desk's number and the field's own, so the fix was to
stop pinning the width rather than to stop drawing the control.

The field is the better control at that size for the reason `TopBar` already
gives about the palette — it is MORE useful small, not less, because twenty-two
clients are four taps deep through the roster and one search away. A 24px glyph
does not say that; a field with the sentence in it does.

**The icon button is deleted rather than hidden at a second width.** With the
field drawn at every width there is no width where the icon appears, and a
control that can never render is markup promising a second way to do the one
thing the field already does. `.top__search` is gone from the TSX and from
`app.css`; the `<kbd>` chord goes on a phone, because it advertises a key most of
them do not have, while `aria-keyshortcuts` stays for the ones that do.

### The switcher keeps the plate and loses its name

The title took the slot the workspace switcher took from the breadcrumb, and the
docstring's own argument settles who gets what: on a desk the bar has room for
one of *which book* and *which screen*, and the screen is written down twice
over. On a phone **neither** of those is on the bar's row and one is gone — the
rail is a tab bar at the other end of the screen, and `.ph` scrolls away with the
page. So both questions are answered in 44px: the title says the screen, the
plate says the book.

Nothing is lost to a reader — the button's accessible name is already
*Workspace: &lt;name&gt;. Switch workspace* — and nothing is lost to an eye either:
the plate is tinted per kind, and the menu names every book with its role one tap
away, verified by opening it. **`.wsw--one` is hidden outright**: a plate that
cannot be pressed, beside a title, is decoration holding 44px of the only row the
title has, and the solo trainer's book is the only book.

**`.top .crumbs`, not `.crumbs`.** The bar's fallback crumb is a path and does
not fit a 366px row, so it stands down — but **eight screens draw a `.crumbs` of
their own inside `.ph`** (the seven console screens and the session detail), and
those are the real way out of a flow with no rail row to light. A bare rule would
have taken all eight and left the console doorless at the width it is most used
at. Found by reading the markup, because the console needs a live session.

### `.ph--named` — the header already said this

A `.ph` whose `<h1>` is the same string the bar now draws is spending ~40px of a
667px phone to say it a second time, 90px lower, in a block that scrolls away.
`/today` and `/schedule` each reached that conclusion for themselves and wrote
their own rule; this is the same declaration with the reasoning stated once, and
it is the rule those two were special cases of.

**It is opt-in, and that is the part that matters.** Hiding `.ph__t` by default
in one line is a trap: the client file's is the name PLUS the status and mode
tags — *Ramya Rao · Active · Floor* — and `screenTitle` can only ever produce the
name, so a blanket rule would have deleted the two facts that decide what a
trainer does next, at 390px and nowhere else. The console's is whose session it
is under the crumb *Sessions*. So the class goes on the eight screens where the
two strings are the same string, and a screen added later gets a repeated word
rather than a silently swallowed heading. The heading is **visually hidden, never
dropped** — `.vh`'s declaration, the one `.ph--today` and `.sch__ph` already use.

### The + sheet has no `Soon` left, and that is five screens arriving

`AddSheet` shipped four rows with three `<button disabled>` because
`/clients/new`, `/money` and `/sessions` were all `NotBuilt`. The argument for
marking them was right and has expired. Two of the five needed only an href, and
three needed a reader for a parameter that was already the screen's own way in:

| Row | Lands on | What made it live |
| --- | --- | --- |
| Add a client | `/clients/new` | the screen shipped; the row was stale |
| Book a session | `/schedule?new=1` | already read by `Schedule.tsx` |
| Log a workout | `/sessions/new` | already live |
| Add an exercise | `/programs/exercises?new=1` | `ExerciseLibrary` reads it now |
| Record a payment | `/business?record=` | `Business` already read `?record=<id>` |

The last one is the one worth knowing: **`?record=` with nothing after it is a
STRING**, so `recordFor` is `''` — truthy enough to open the panel and falsy
enough that no client and no pack are seeded. That is the right shape for this
caller, because the + is pressed with an amount in mind and not a client.

Both new readers are `Schedule.tsx`'s three pieces verbatim — an initialiser, a
render-time adjustment for arriving here *from here*, and then the parameter is
**stripped**. The strip is what stops the + being a one-shot: the sheet's row is
on the screen it points at, so pressing it twice is a navigation to an identical
URL, which the router correctly treats as nothing at all. `Business` had the
initialiser and neither of the other two.

The brief asks the + for *clients, sessions, exercises*; the two rows already
there are kept rather than cut, and the order is when each thing happens — a
client is added before they are booked, a booking is logged after it happens, an
exercise is written while a program is being built, money can wait until the
shift ends. *Add an exercise* takes `Grid` and not a second `Dumbbell`: two
identical glyphs would make the two rows a trainer is most likely to confuse —
logging a movement and writing one — look like the same action twice.

### One measured bug, and it is the fifth of its exact shape in this file

**Two `max-height` rules were shrinking the phone's two-row bar to 50px.**
`@media (max-height:820px){.app{--w-top:50px}}` and its 700px sibling were
written for a short DESK window — the comment says so, in terms of "the 34px omni
field and the 32px icon buttons" — and they are **width-blind**, so they fired on
every phone shorter than 820px, which is most phones in landscape and a good many
in portrait. They sit later in this file than the 900px block, so at equal
specificity they won, and `align-content:center` then overflowed the bar in both
directions.

Measured at 320×780: the bar 50px tall, the plate and the bell at **y = −19** —
nineteen pixels above the top of the page — and the title at −9. **390×844 missed
it by 24 pixels**, which is why the shape is worth stating: this is the fifth time
a rule at equal specificity, later in the cascade, has silently won an argument it
was not part of, after `.body--flush`, `.srow--h2`, `.ph__id` and §24's panel
rule. The fix is **scope, not specificity** — `and (min-width:901px)` — because a
short desk window and a short phone are different questions, and the answer that
shortens a one-row toolbar is not an answer about a two-row one. Verified both
ways: 1366×768 → 50px, 1024×690 → 46px, every phone → 90px.

The smaller one: the bar's `column-gap` was charged for the `ws` track even when
that track is empty — a solo trainer, or any bar outside the shell — so the title
sat 8px in from the gutter on those screens and flush on the rest. The row gap is
the grid's; the column gaps travel with the two controls that need them.

### Checked by rendering

The convention this file sets, honoured: the running dev server, the real
components, and every behaviour driven as a real click through a CDP driver.
**The harness is deleted; rebuild one if this is touched.**

Nine routes at 390×844 — today, schedule, clients, programs, business, team,
settings, clients/new, programs/certified — plus 320×780, 360×640 and 390×667:
**`overflowX` 0 and no control under 24px on every one**, `--w-top` 90 at all
four sizes, the title present with the right text on each (*Iron Yard Coaching*
on `/team`, from an explicit prop), the field 366×38 on its own row, the bell
44×44 on the right edge, the plate 44×44 on the left, and `.ph__t` measuring 1×1
on the seven `ph--named`/equivalent screens and 0×0 on `.ph--clients`.

The desk, after: 1440×900 → bar 56px, title `display:none`, `.omni` 320×34 at
x=1056, actions at x=1390 (the right edge — the `.crumbs` alignment fix still
holds), `.ph__t` full width and visible, zero overflow.

Behaviour: **all five + rows clicked**, each landing on its screen with its form
OPEN and its parameter already stripped — `/clients/new`, `/schedule` with *New
session* up, `/sessions/new`, `/programs/exercises` with the create form up, and
`/business` with *Record payment* up; the *More* sheet still holding
`Programs · Business · Your profile · Settings`; the notification panel at y=96,
378px wide, no overflow; the workspace menu at (12, 51) 320px naming all three
books with their roles; the client file's header reading *Ramya Rao* in the bar
with *Active* and *Floor* still on the `<h1>` under it, which is the case
`.ph--named` is opt-in for. Light theme rendered at 390: title in ink, field on
the light fill. Console clean.

`npx tsc --noEmit` clean. `npx eslint` clean on every file this pass touched
except the two errors that were failing before it — `NewClient.tsx:213` and
`ExerciseLibrary.tsx:77`, both `set-state-in-effect` in code this pass did not
open, and `Team.tsx`'s five, which this file already records. **`next build` was
NOT run**, per this file's own note that it writes `.next/` under a running dev
server and produces a screen that renders the previous build intermittently.

**One note for whoever rebuilds the harness**, and it is the one this file
already gives twice: drive it at **`http://localhost:3100`**, never
`127.0.0.1`. Next 16 answers **403 to every `_next/static/chunks/*.js`** carrying
an `Origin: http://127.0.0.1:3100`, so the page renders server-side, looks
completely correct, and **nothing is interactive** — half an hour went on a bar
whose sheets appeared not to open.

### Not done

- **The bell is a 44px target that the Next dev-tools badge sits on top of** at
  390px. Dev-only, and this file already records that badge as not a bug; worth
  one look in a production build.
- **`/programs/certified`'s title is *Certified***, derived from the crumb, where
  its hidden `<h1>` says *Certified programs*. The Programs tab strip is directly
  under it saying the same thing, so it reads correctly — but it is the one
  derived title in the app that is a word short of its heading.
- **`.ph--named` is on eight screens and could be on more.** `ClientReport`,
  `SessionDetail` and the client file are deliberately out (their `<h1>` says
  more than the bar can), and the console's seven are out for the same reason
  now that they pass a real title. Anything added later starts out repeating a
  word, which is the recoverable direction.
- **The per-page content inside `.body` is not this pass's.** `/business`'s stat
  tiles still overflow their row at 390px — `₹1,30,35…` clipped — which is a
  screen's own responsive work rather than the shell's, and it was true before
  this pass and after it.

## The chrome budget on a phone — 273px reclaimed, and one gutter instead of four · 3 Sep 2026

Reported as *"half the screen is taken by Day/week/month, floor, remote, 42
booked, 22 done… the main area which is month view is only provided minor part.
When it comes to app design, we need to use screen area smartly."* Measured at
390×844 before anything was touched, and the report was exact:

| Screen | chrome above content | content | content share |
| --- | --- | --- | --- |
| `/schedule` · week | **383px** | 327 | **39%** |
| `/schedule` · day | 315 | 442 | 52% |
| `/today` | 121 | 744 | 88% |

### `/today` and `/schedule` were each saying the same number three times

Two passes, one argument. Every band removed was a **duplicate**, and the one
fact in each that had no second home was moved rather than dropped.

| Band | px | Where its facts already were |
| --- | --- | --- |
| `.ph--today`'s subtitle | 34 | *In session with Karthik Menon · 9 sessions, 1 done* — the live hero card directly beneath draws the status pill, the elapsed clock and the client's name at 22px, and the list header carries the tally |
| `.sch__ph`'s subtitle | 75 | *42 sessions* → the stat strip's **42** BOOKED; *23 sellable hours free* → the `Show gaps · 23` chip, which states the number AND turns the hatching on |
| `WeekPips`' tally pill | 44+12 | drawn on one of three views, inside the pip container, scrolling with the grid it summarised |
| `.sch__tools`' date row | 44 | the toolbar label and the top-bar crumb are the **identical string** on day and month |

**`ScheduleStats` (`.schs`) is what the two subtitles collapsed into** — 47px, on
all three views, each fact once: **booked · done · % of hours · clash days**.
`utilisation` and `clashDays` lived only in the prose, which is why it could not
simply be deleted the way `/today`'s was. The free hours went to the chip, which
is the most duplicated fact on the screen and the only one with a control of its
own. `clash` is conditional — a clean week draws three cells, not a fourth
reading *0*.

**The toolbar's date label is clipped, not dropped**, and the table is the whole
argument:

| view | top-bar crumb | toolbar label |
| --- | --- | --- |
| day | Thursday 3 September | Thursday 3 September |
| month | September 2026 | September 2026 |
| week | Week of 31 August | 31 August — 6 September 2026 |

Day and month are one string 90px apart; the week's is a longer form of it, and
the pip grid's own column heads read *Mon 31 … Sun 6* — the exact range, stated
by the thing being ranged over. So the two arrows join the view switcher on one
row and the whole nav row goes. It stays in the DOM because it is the toolbar's
`aria-live` region and the only thing that announces the new range when the step
accelerators are pressed. This **reverses** the rank *the schedule on a phone*
records — "the date leads on a phone" — which was right that the date must lead
and never asked whether it had to be IN THE TOOLBAR to do so.

`MAX_PIPS` went 6 to 7 in the same pass, because `.wkp__grid` is `flex:0 0 auto`
and a pip is a fixed 44px: **space given back to a screen has to land on
something or it was not given back.** Eight measured 16px over, and a grid that
scrolls by 16px reads as broken in a way one fewer pip does not.

### The top bar: one row was tried, measured, and put back

*The phone shell, finished* argues the two-row bar from "those three plus the
workspace plate do not share a line". That premise was doubted — *Today* is 53px,
so where does 366 go? — and the field was moved onto the title's row behind
`minmax(96px,1fr)`. Measured at 390px on `/schedule?view=day`:

    plate 44+8 · title 156 · field 96 · bell 44+8   = 366

The field sat on its floor with a 50px label slot against a 242px sentence, i.e.
***Sear…*** — the exact failure the original paragraph predicts. Two things the
doubt had missed: **`.wsw--one` hides the plate only for a SOLO trainer**, and
this one has three books, so the plate is 52px and not 0; and the longest title is
not *Today* but *Thursday 3 September* at 156px. **One row cannot hold plate,
title, sentence and bell at this width.** The two-row bar is restored verbatim.

### So the height comes back on scroll instead — and that is NOT the rule this file forbids

> **SUPERSEDED the same day — see *The search became a glyph* below.** The
> product owner asked for the field to become an icon beside the bell, which
> takes the whole second row permanently, so this mechanism had nothing left to
> collapse and was deleted. The subsection is kept because the reasoning about
> destinations, capture-phase listening and clipped-not-hidden controls is what
> a future scroll-collapse anywhere in this shell would have to re-derive.

`[data-omni="off"]` on `.app`, written by `useOmniCollapse` (`omniCollapse.ts`):
once any scroller is past 48px and travelling down, `--w-top` eases 90 to 46 and
`.main` grows into the 44px. An upward gesture of 12px brings it back,
asymmetric on purpose — reaching for search is deliberate, hiding it should not
happen by accident.

*Today on a phone* lists **"the bar does not hide on scroll"** among three things
that pass declined, and its reason is the distinction: it "costs the trainer the
ability to point at where they are going … the queue is what scrolls and the
destinations are what stay." That is an argument about **destinations**, and they
are untouched — `.tabs` never moves (verified: `tabsTop` 791 in every state), and
neither do the title, the plate or the bell. What stands down is a **search
field**, which points at nothing.

Four things in it are load-bearing:

- **It listens on the document in the CAPTURE phase.** There is no single
  scroller: `.body` on most routes, `.dag` / `.wkp` / `.cw__scroll` on
  `/schedule` depending on the view. `scroll` does not bubble but it does
  capture, so one listener sees every scroller without any screen registering
  itself.
- **Offsets are per element, in a `WeakMap`.** A single `lastY` reads the
  difference between two unrelated boxes as a gesture: scroll the agenda to 400,
  nudge the horizontal chip strip at 0, and the delta is −400 — an upward flick
  that never happened. Horizontal-only scrollers are skipped outright
  (verified against `.ph__tabs`).
- **`--w-top` is the app grid's own first row**, so nothing is `position:fixed`
  and nothing is overlaid. `grid-template-rows` is the animated property — a
  custom property cannot transition without `@property`, and the grid's rows can
  — which is why `.top`'s open state states `44px 38px` explicitly rather than
  letting both tracks size from content.
- **The field is CLIPPED, never hidden.** The first version wrote
  `visibility:hidden` and paired it with a `:focus-within` escape hatch for a
  keyboard tab. **That rule could never fire:** `visibility:hidden` makes an
  element unfocusable, so it leaves the tab order, `:focus-within` never matches,
  and the hatch written for a keyboard user was the one thing they could not
  reach. Measured — focused, and the bar stayed 46px with the field still hidden.
  Nothing hides it now; the 0px row plus `.top{overflow:hidden}` clips a control
  that is still focusable, still in the tab order and still announced.
  `aria-hidden` would have been the same mistake wearing a different attribute.

**And a route change opens it**, which `popstate` does not cover: an App Router
`<Link>` is a `pushState`, so every forward navigation went unheard and a trainer
who scrolled the roster and tapped a client landed at the top of an unscrolled
page with the bar collapsed and no gesture available to open it. `usePathname()`
is the signal, **adjusted during render** rather than in an effect —
`set-state-in-effect` refuses the effect and is right, since that is a second
render pass and the collapsed bar would paint once on the new route first.

### `--w-underbar` — one gutter under the bar, and it was four numbers

Reported as *"fix padding issues below search bar"*. Measured at 390px, bar's
bottom edge to the first thing that paints:

| | | set by |
| --- | --- | --- |
| `/clients` | **6px** | `.ph--clients{padding-top:6px}` |
| `/schedule` | 10px | `.sch__tools`' own internal padding |
| `/today` | 13px | `.body`'s `--w-scrollpad-t` |
| `/business` | 14px | `.ph{padding-top:16px}` |

6 against 14 is not a rhythm, and **the 6 is the one that broke**: the bar's
bottom row is now a 38px FIELD, so `/clients`' three icon buttons sat 6px under a
control they are not part of and read as a fourth row of it. Each number had been
tuned at a different time against a bar that has since changed height twice.

One token on `.app` inside the 900px query, `12px` — `.body`'s own phone gutter,
so a screen whose `.ph` has stood down and one whose `.ph` is live land on the
same line. Every consumer carries a `12px` fallback, so a `.ph` outside the shell
is never left at 0. `.ph--clients`' 8px/6px overrides are deleted; the strip's own
margin and foot stay halved, because that gap is between two things inside that
header and is its rule's to tune.

### Measured after

| Screen | chrome | content | share | at rest to scrolled |
| --- | --- | --- | --- | --- |
| `/schedule` · week | **255px** | 503 | **60%** | 255 to 211 |
| `/schedule` · day | 255 | 503 | 60% | 255 to 211 |
| `/today` | 103 | 744 | 88% | 103 to 59 |

**128px** reclaimed on the week, 60 on the day, 42 on the month, plus **44 more
on every route in the app** while a trainer is reading. The gutter under the bar
is 12–13px on all seven routes at 320, 360 and 390.

### Checked by rendering

Same-origin iframes at 320 / 360 / 390 / 430 / 700, both directions of the
collapse driven as **real wheel events** (see the note below), plus the desk at
1000 and 1440 after every change.

Verified: the collapse state machine at rest, down, up and back to top with
`tabsTop` constant throughout; the field focusable and `:focus-within` opening
the bar while collapsed; a horizontal strip collapsing nothing; a real click
through to a client file landing with the bar open; `.schs` fitting at
320/360/390/430 with **zero horizontal overflow on all seven routes**; the week
grid fitting with no scroll; the gutter uniform. Desktop at 1440:
`--w-underbar` unset, `.ph` still `20px 24px 0`, `.sch__tools` still
`12px 24px`, the subtitle back, `.schs` hidden, the date label visible, the time
grid drawn, `--w-top` 56, `.omni` 320px.

`npx tsc --noEmit` and `npx eslint` clean on every file this pass touched. **`next
build` NOT run**, per this file's own note. The shorthand gate comes back empty.

**One note for whoever rebuilds the harness, and it cost half an hour:**
`requestAnimationFrame` **does not fire in a backgrounded tab**, and this feature
coalesces its scroll reads through one. Driving a synthetic `scroll` event from
`Runtime.evaluate` backgrounds the tab as a side effect, so the collapse appeared
completely dead — `data-omni` never set, five states measured identical — while
the code was correct. `document.hidden` was `true` the whole time. Drive it with
real input (`Input.dispatchMouseEvent` / the wheel), and read the attribute back
in a separate call.

### The search became a glyph, and the second row went with it · 3 Sep 2026

*"Move the search bar left to the notifications tab with the small search icon."*
The bar is one 46px row again:

    ┌──────────────────────────────────────────────┐
    │ [plate]  Today                      [⌕][bell]│  44px
    └──────────────────────────────────────────────┘

**This block has now argued both sides, and both are in `TopBar.tsx`.** The field
was argued from DISCOVERY — "twenty-two clients are four taps deep through the
roster and one search away. A 24px glyph does not say that; a field with the
sentence inside it does" — which is a real argument priced at a whole second row,
**44px on every route in the app, forever, so that a control is advertised rather
than merely present.** The product owner priced it and took the glyph.

Two things make the trade cheaper than when the icon was first refused: the bar
**draws a title now**, so the row is a cluster rather than the three controls
with ~250px of dead space beside them that *Today on a phone* records as a
defect; and search and notifications are the two controls that open a surface
from anywhere, so putting them in one corner groups them by what they do.

Measured at 390px: plate 44+8, title **214px** (the longest in the app,
*Thursday 3 September*, is 156), search 44, bell 44, gaps 12 — and at 300px the
title ellipsizes to 124px with everything else intact and zero overflow.

**One control, not two.** The `.top__search` icon button that was deleted when
the field arrived is NOT restored — `.omni` is the same `<button>` at both
widths, and app.css drops its label and key cap below 900px and gives it the
bell's 44px square. A second element would be "markup in the accessibility tree
promising a second way to do the one thing the field already does", which is the
rule that deleted it in the first place, and it is why nothing in the JSX reads a
width.

**`[data-omni]` and `useOmniCollapse` are deleted.** They bought exactly the 44px
the glyph now buys unconditionally, so there was nothing left for them to
collapse: the row they hid does not exist, and the first row may not be hidden —
the title, the plate and the bell answer *where am I* and *which book*, and this
file forbids taking the destinations on scroll. Left inert they would have been
the dead control this shell keeps deleting. `--w-underbar` **stays**; the gutter
under the bar is still one token and still 12px.

#### The bug this introduced, caught on the first render

**`display:none` on the label left the button with no accessible name.** The span
holding *Search clients, sessions, exercises…* is the button's only text and
therefore its name, and `display:none` takes an element out of the accessibility
tree rather than only out of the layout — so a 44px icon button announced as
"button", on the one control in this app that reaches every screen from every
screen. The commit message for the pass had already claimed "the accessible name
does not change", which was wrong when it was written.

`.vh`'s declaration instead — `position:absolute` + `clip-path:inset(50%)`, out
of the visual flow and still in the tree, and out of flow so it takes no part in
centring the glyph. It is the same trade `.ph--named`, `.sch__ph .ph__t` and
`.sch__label` each make. **This is the fourth control in this shell to need
clipped-not-dropped**, and the pattern is now: if hiding a thing would remove the
only text a control has, clip it.

The `<kbd>` stays `display:none` — a chord printed on a phone advertises a key
most of them do not have, and `aria-keyshortcuts` on the button carries it for
the ones that do.

#### Measured after

| | before this pass | after |
| --- | --- | --- |
| `--w-top` ≤900px | 90px | **46px** |
| `.main` at 390×844 | 701 at rest, 745 scrolled | **745 always** |
| `/schedule` week chrome | 255 at rest | **211 always** |
| `/today` chrome | 103 at rest | **59 always** |

The 44px the scroll-collapse handed back only while reading is now handed back
permanently, which is the whole of the change.

#### Checked by rendering

Same-origin iframes at 300 / 320 / 360 / 390 / 430 / 700, plus the desk at 1440.

Verified: the bar 46px at every phone width with **zero horizontal overflow on
all three routes at four widths**; the glyph centred 11/11 in its square; the
label clipped but present, `accName` reading back the full sentence; the title
taking 214px at 390 and ellipsizing to 124 at 300 with the plate, search and bell
all intact; the gutter under the bar still 12–13px (16 on `/schedule`, which is
the view switcher's own 3px pill padding inside the 12px gutter). Desk at 1440
untouched: 56px bar, `.omni` **320×34** with its label static and its `<kbd>`
drawn, title `display:none`, rail `flex`, `.ph` still `20px 24px 0`, no overflow.
Tablet at 700 correctly gets the glyph.

`npx tsc --noEmit` and `npx eslint` clean; the shorthand gate comes back empty.
**`next build` NOT run**, per this file's own note.

#### And then the cluster was measured properly · 3 Sep 2026

Reported as *"fix the spacing issues around search icon"* and *"make the
notification icon size apt to the mobile screen — not too big and not too
small"*. Three defects, and the first one is why the row looked wrong.

**1 · The search was still wearing the FIELD's skin.** The rule that turns
`.omni` into a glyph reset `background` and neither of the other two things that
make a field look like a field:

| | border | ink |
| --- | --- | --- |
| search | `0.8px solid rgba(255,255,255,.1)` | `--tx-ink-3` |
| bell | `0.8px solid transparent` | `--tx-ink-2` |

Two adjacent identical squares, one boxed and dimmer than the other. **No amount
of margin fixes that** — it reads as an input that has been shrunk rather than as
the second half of a pair, and the eye then blames the space around it because
the shape is wrong. `border-color:transparent` and `color:var(--tx-ink-2)`, and
the two now compute identically in both themes.

**2 · The pair was not a pair.** Measured at 390px glyph-edge to glyph-edge,
which is the only measurement an eye takes:

    title text → search glyph   21.1px
    search glyph → bell glyph   24.2px

The two controls meant to be one cluster sat FURTHER APART than the cluster sat
from the thing it is not part of. The box gaps said the opposite — 10px and 2px
— which is the trap: **a 44px target around a 22px glyph carries 11px of its own
padding per side, so 2px of margin is 24px of white space, and the number in the
stylesheet is not the number on the screen.** Fixed at the glyph: the buttons go
flush (radius separates them on hover, targets stay 44px) and the space before
the search widens to 18px, giving **28px / 20px**. The pair is now the tightest
gap on the row, which is what makes it one.

**3 · `--w-topicon`, and it is 24.** The glyphs were `clamp(20px,5.6vw,24px)` —
20px on a 320px phone, 21.85 at 390, the full 24 only past 430. A header icon is
a fixed touch affordance, not typography, so scaling it with the viewport buys
nothing and costs the two smallest screens the legibility they need most. 24px is
where both platforms land (Material 3's top-app-bar icon is 24dp; iOS
navigation-bar glyphs are 22–25pt in the same 44pt target) and it is the top of
the clamp it replaces, so 430px is unchanged and 320–390 gains 2–4px.

**One token for the search and the bell together.** The ask was for the bell, and
sizing it alone would have put a 24px glyph beside a 22px one in two adjacent
identical squares — which does not read as emphasis, it reads as a mistake.

Measured after, identical at 320 / 360 / 390 / 430: glyphs **24/24**, title text
to search glyph **28px**, glyph to glyph **20px**, both boxes **12px** from their
own edge of the bar, both targets **44×44**, zero horizontal overflow on four
routes. Desk at 1440 untouched — `.omni` still 320×34 with its border, its
`--tx-ink-3` and its `<kbd>`, glyphs still 15 and 18, `--w-topicon` unset above
900px. Light theme checked: both glyphs resolve to the same ink. The focus ring
still reaches the search button at 44×44.

#### The notification panel's height, and the tab bar it was covering · 3 Sep 2026

Asked to check the panel's spacing and size on a phone. The margins were right —
6px a side, full width, exactly as *the notification centre, on a phone* claims —
and the height was wrong in two ways, one of them a bug this panel's own design
had explicitly refused.

**1 · It stopped short of the tab strip.** The rule was
`min(72dvh, calc(100% - var(--w-top) - 20px))`, which keeps a viewport cap the
comment above it says goes, and subtracts the header while **never subtracting
the tab bar** — the one thing "whatever the window has between the bar and the
tab strip" has to account for. 72dvh was what bound:

| | panel ended above the tab bar | list still to scroll |
| --- | --- | --- |
| 390×844 | **131px** | ~1,000px |
| 310×616 | **68px** | ~1,000px |

The pass that took `--w-top` from 90 to 46 made it worse without touching this
rule: the panel's TOP moved up 44px and its height did not grow.

**2 · Between 641 and 900px it COVERED the tab bar.** The mobile rule is scoped
to 640px, but the strip exists at every width up to 900 — so in the range where
the panel is still §03's 400px card its height came from
`min(560px, calc(100% - var(--w-top) - 28px))`, which does not know the strip is
there:

    700×600   overhangs the tab bar by 31px
    820×640   overhangs by 25px

Two of the five destinations under an opaque card, on the panel whose comment
reads *"a sheet would cover the tab bar … the way out has to still be visible"*.
**The layout refused to be a sheet and the height formula made it one anyway**,
on any short window in that range — a narrowed laptop window, or a tablet in
landscape.

#### `--w-tabs`, because something had to subtract it

Declared on `.app` in the 900px block the way `--w-top` declares the header's
height — a number the bar is built to rather than one read back off it. Measured:
7 of padding, an 18px glyph, a 3px gap, a 14.5px label and 8 of padding is 52,
plus the 1px top border. `calc(53px + env(safe-area-inset-bottom))`, with the
home-gesture strip added on top rather than folded in because that inset is 0 on
most devices and ~34 on the ones that have it.

The grid row is `minmax(var(--w-tabs), auto)` and not a flat `var(--w-tabs)`: the
token is a **floor**, so a wrapped label or a taller font grows the row instead of
spilling out of it. `.tabs` may never take `overflow:hidden` — the raised centre
+ overhangs its top edge by 13px on purpose.

The panel then reads: the window, less the header, less the tab bar, less the 6px
it sits off each. The dvh cap is gone below 640px rather than kept alongside —
two limits where one is always binding is how the first version drifted from its
own comment. **The 560px cap is KEPT between 641 and 900**, because a 400px-wide
dropdown 800px tall is a different mistake: a card that is not full width should
not be full height either.

Measured after — **no overlap at any size**, and 6px above the strip wherever the
space is the constraint:

| | gap above tab bar | panel |
| --- | --- | --- |
| 320×568 | 6px | 308 × 457 |
| 390×844 | 6px | 378 × **733** (was 583) |
| 430×932 | 6px | 418 × 821 |
| 700×600 | 6px (was **−31**) | 400 × 489 |
| 820×640 | 6px (was **−25**) | 400 × 529 |
| 700×900 | 235px | 400 × 560 (capped) |

The list gained **144px at 390×844** — two more notification rows before a
scroll. Desk at 1440 untouched: 400px card at `right:14`, `top:62`,
`min(560px, 100% - 84px)`, `--w-tabs` unset, `.tabs` still `display:none`.

#### Two things checked and deliberately not changed

- **The filter chips are 26.9px, and every `.chip` in the app is 28px** with the
  same 29px of content in it — `/today`, `/clients` and `/schedule` all report it.
  It is a global line-height condition in the design system, not something this
  panel introduced, and correcting `.chip` is a change to every screen rather
  than to this one.
- **`.ntf__i` rows are 80.7px** because the label wraps to two lines at this
  width. `min-height:44px` is doing its job as a floor; the rows are tall because
  the sentences are long, which is the honest rendering.

#### One note for whoever verifies this next

**CSS animations freeze in a backgrounded tab, exactly like `requestAnimationFrame`.**
`.ntf` has `animation:tx-pop .18s` with `transform-origin:top right`, so a panel
measured from `Runtime.evaluate` — which backgrounds the tab as a side effect —
reads back **stuck at the animation's first frame**: `scale(.96)`, which with a
top-right origin puts the left margin at 21px against a right margin of 6px and
looks exactly like a lopsided panel. It is not. Set `el.style.animation='none'`
before measuring, or drive it with real input; with the animation killed the same
panel measures 6px / 5.6px. This is the second time background throttling has
produced a convincing phantom defect in this shell.

#### The palette on a phone, and three rules that had been overruled · 3 Sep 2026

Asked to check the palette's spacing and size on a phone. The margins and the
anchor were right — 6px a side, full width, `top:calc(var(--w-top) + 6px)`. Four
defects behind them, and **three were rules that already said the right thing and
had been silently defeated.**

**1 · `.pal__i{height:44px}` undid the fix documented six lines above it.** The
mobile block sets `height:auto;min-height:44px` with a MEASURED BUG comment
explaining why — *"'Remind Rajalakshmi Venkataraman' is two lines and the hint
beside it is two more, inside a row that cannot grow: the text overran its own
row and collided with the next one"* — and then four rules later, in the same
media block, put `height:44px` back. Same specificity, later in the file, so the
fixed height won and **the bug was live again from the moment it was written down
as fixed.** Measured at 390px: 4 of 9 rows reporting `scrollHeight 46` in a 44px
box. The 44 that line wanted was already guaranteed by the `min-height` on the
rule it was overruling; it had nothing to add. Deleted. Rows now measure 58.4 and
54px where the label wraps, 44 where it does not, and none overflows.

**This is the sixth instance** of the trap in this stylesheet, after
`.body--flush`, `.srow--h2`, `.ph__id`, §24's panel rule and `.ctl:focus`'s
background shorthand.

**2 · `.pal__h{margin-left:0}` was overruled from OUTSIDE the media query.**
*The hint's desk position* forty lines below the phone block is a bare
`.pal__h{margin-left:8px}` — (0,1,0), same as the mobile rule, later in the file,
and **a media query adds no specificity**. So the hint kept the desk's 8px
indent. It matters because `flex:1 1 100%` puts the hint on its own line under
the label, where 8px is not a gap between two things on a row — it is the second
line of a two-line row failing to align with anything. `.pal .pal__h` at (0,2,0)
wins wherever either sits, which is the fix `.slist .srow--h2` already used.

**3 · The list's cap was a fraction of the window taken before the chrome.**
`min(340px, 52dvh)` — a proportion of the WINDOW for a box that starts 104px down
it (`--w-top`, the 6px it hangs off the bar, and a 52px field). So one rule was
wrong at both ends. Against a keyboard taking ~40%:

| window | cap it gave | room above the keyboard |
| --- | --- | --- |
| 568 | 295px | ~237 ← last rows sat UNDER the keyboard |
| 844 | 340px | ~402 ← 62px unused |
| 932 | 340px | ~455 ← 115px unused |

`calc(52dvh - var(--w-top) - 58px)` subtracts the chrome first, so the list takes
the same proportion of what is left at every height: **335px at 844 — within 5px
of the number it replaces**, which is the size this was tested at — 191 at 568 and
381 at 932. The sheet's bottom now lands at a constant 52.2% of the window,
measured at five heights, and cannot reach the tab bar by construction.

**The 52% is a heuristic and is now labelled as one.** `dvh` does not shrink for
a virtual keyboard — that is the visual viewport, which only JS can read — so a
fraction has to stand in, and this pass kept the one already in the file rather
than inventing a better-looking number it had no device to test. **A real phone is
what settles the fraction; the shape of the calc is what was wrong.**

**4 · Its top followed the bar from 640px down, not 900.** §03's `top:92px` is 56
of desk header plus 36 of air. The 641–900 band keeps that number and the 620px
card, and the bar in that band is the phone's — so when `--w-top` went 90 → 46
earlier today the gap under it went from a snug 2px to **46px of nothing**.
Measured at 700×600: the card hanging clear of the bar it is attached to. The
anchor moves to `--w-top` at 900; the width and centring stay the desk's there.
Two surfaces dropping from the same bar now drop the same 6px.

#### And the coarse-pointer block was enumerated around both overlay lists

`@media (pointer:coarse)` raises `.rail__i`, `.rail__pin`, `.rail__acct`,
`.menu__i` and table cells to 44px, under a comment reading *"a rail row, a sheet
row and a table row are not"*. **The palette's result row and the notification row
are neither, and each is the only way to act on the surface it belongs to.** Both
ship at 38/41px from §03 and are raised to 44 only by their own ≤640px rules — so
every touch device WIDER than that, a portrait tablet included, got the desk's row
height on the two surfaces reachable from every screen in the app.
`.pal__i,.ntf__i{min-height:44px}` in that block, which is its own argument
applied twice more: `pointer:coarse` is the question and the width never was.
`min-height` beats a fixed `height` in the used-value calculation, so §03's
numbers are untouched.

#### Measured after

| | top / gap under bar | rows overflowing | min row | overflow-x |
| --- | --- | --- | --- | --- |
| 320×568 | 52 / 6px | 0 | 44 | 0 |
| 390×844 | 52 / 6px | 0 | 44 | 0 |
| 430×932 | 52 / 6px | 0 | 44 | 0 |
| 640×360 | 52 / 6px | 0 | 44 | 0 |
| 700×600 | 52 / 6px (was 46) | 0 | 38 (fine pointer) | 0 |
| 1440×900 | 92 / 36px — unchanged | 0 | 38 | 0 |

Never overlaps the tab bar at any size. Field 52px with a 16px input at every
phone width, `<kbd>` hidden on all five rows, hint aligned to the row's content
edge, group headers flush at the row box.

#### Not done

- **The hint aligns with the row's content edge, not with the label it
  captions.** The leading element is a 24px avatar on a client row and a 16px
  glyph on an action row, so no single margin aligns the second line with the
  name on both; doing it properly means wrapping label and hint in a shared
  column in `Palette.tsx` and keeping the desk's inline layout working. Flush at
  the content edge is at least a real gridline — the 8px it replaces aligned with
  nothing — and it is what the rule always intended.
- **The coarse-pointer raise is not verified on a device.** The harness has a
  fine pointer, so the new rule was checked by reading the cascade and confirming
  no change on a mouse. A tablet settles it.

#### The *More* sheet, measured and left alone · 3 Sep 2026

The fourth overlay checked in this pass and **the only one that needed no code
change** — recorded so the next person does not re-measure it.

It is content-sized rather than stretched: 427.6px on every portrait phone
(50.7% of an 844px window, 75.3% of a 568px one), with `.sheet__b` reporting a
scroll distance of **0** at all four. The `max-height:78dvh` cap is inert there
and does exactly its job in landscape — 640×360 clamps to 280.8px and the body
scrolls 129px, which is the case the cap was written for. The bottom sits on the
window edge at every size, with `padding-bottom:env(safe-area-inset-bottom)`
present (0 in this harness, untestable without a device).

Checked and correct:

| | |
| --- | --- |
| rows | 48px minimum everywhere — `.sheet__i` sets it unconditionally rather than via `pointer:coarse`, and its comment says why |
| stacking | the sheet (z 50) paints over the raised centre + (`.tabs__i` z 2). `elementFromPoint` at the FAB's centre returns `sheet__note` |
| clipping | 0 elements overflowing at 320 / 360 / 390 / 430 / 640×360 / 700×600 |
| overflow-x | 0 at every width |
| the ways out | Escape closes, scrim tap closes, `role="dialog"` + `aria-modal` + `aria-label="More sections"`, focus lands on the first row |
| the grip | a bare `<div>` with no role — right, because it is not draggable and both real dismissals exist |

**The circle over the sheet's foot is the Next.js dev-tools badge**, which this
file already records as not a bug. It caught the eye again in this pass; it does
not exist in a production build.

#### One finding, and it is copy rather than layout

`.sheet__l--two i` is `nowrap` + ellipsis by design, and its comment scopes the
variant to *"exactly the two destinations the bar had no room for"* — Programs
(19 chars) and Business (24), both of which fit at every width. The **account**
rows use the same variant with purposes written for a different budget:

| | 320 | 360 | 390 | 430 |
| --- | --- | --- | --- | --- |
| Programs · Business | fits | fits | fits | fits |
| *Your name, headline, bio and intro video — what a client sees* (61) | cut 96px | cut 56px | cut 26px | fits |
| *Your number, your email, and the wording InclineYou sends* (57) | cut 83px | cut 43px | cut 13px | fits |

So the two rows a trainer reads to decide whether to make the extra tap are cut
mid-word on the three commonest phone widths, and whole only on the widest.

**The layout has nothing left to give and was not changed.** Measured at 390px:
the hint spans 325.4px of a 374.4px row, there is no sibling to its right, and
the 10px to the row's edge is the row's own padding — it already has the full
width. The budget is **~52 characters at 390px, ~44 at 360, ~38 at 320.**

Left as a finding rather than fixed, because the fix is either product copy —
which `nav.tsx` shows is actively curated (Settings' purpose was deliberately
rewritten when it "used to promise your profile") — or letting these two rows
wrap to a third line, which breaks the variant's own argument that the *More*
sheet and the + sheet must share a row height or "read as two different
components".

### Not done

- **The bar's one row is 44px on every route** and is now the whole header. It
  holds the title, the plate, the search glyph and the bell; the first three were
  each argued for one section up and the fourth is this pass. There is nothing
  duplicated left in it to take.
- **`/business`'s stat tiles still overflow their row at 390px**, unchanged from
  the shell pass and still a screen's own responsive work.
- **`MAX_PIPS` is a constant, not a measurement.** Seven fits 844px exactly and a
  667px phone scrolls `.wkp`, which it already did at six. Deriving it from the
  container would need the count in JS for the `+N` chip, which is a real change
  rather than a tune.

## Business on a phone — M1 and M2 of `BUSINESS-UX-HANDOFF.md` · 5 Sep 2026

The handoff's mobile plan, phases M1 (*the money actions work at all*) and M2
(*the chrome budget*), with the two open questions answered by the product owner:
**both verbs stay visible on Pending's phone row**, and **M1 + M2 only**.

**Re-measured before anything was written, and one of the handoff's four numbers
had already been overtaken.** *The search became a glyph* took `--w-top` from 90
to 46 after the handoff was drafted, and `.ph--named` was already on this screen:

| | handoff | measured | after |
| --- | --- | --- | --- |
| chrome at 390×844 | 236px | **183px** | **156px** |
| Payments hidden behind a scrollbar | 312px | 312px | **0** |
| Pending hidden | 490px | 490px | **0** |
| stat figures clipped | 3-across at 109px | 3 · 4 · 8 across three tabs | **0** at 320/360/375/390/430 |
| Record panel | 420px at x = −30 | confirmed | **full-width sheet, 88dvh** |

### The two tables reflow, and the number is 900 for both

`.mny__tbl` + `data-l`, `.pk__tbl`'s mechanism rather than `.cftbl`'s — these two
tables have a `<thead>` and columns of bare figures, so the labels move into the
rows instead of the head being dropped. app.css carries the full derivation.

The breakpoint is worth restating because the curve is odd. Measured crossovers,
where each table stops fitting its card: **Pending ~890px, Payments ~703px** — and
Pending does **not** fit again until **1160**, because above 900 the 248px rail
takes back more than the window gives. 900 is the shell's own line and is within
10px of Pending's content line; Payments is therefore reflowed between 703 and 900
where its table would still have fitted, which is the cheaper error. `tabs.ts`
already wrote the argument, about the period picker: *"a control that vanishes on
one of them reads as a bug rather than as a statement"*, and Payments and Pending are
the two tabs a trainer moves between all day.

**The row is a flex COLUMN so the client's name can take `order:-1`.** The
payments table's first cell is the DATE and Pending's is the client; `.pk__tbl` makes the row
a `block` and takes the DOM order, which here would open every payments row with
*29 Aug* and only then say whose ₹9,000 it is. Ordering in CSS leaves date-first
correct at a desk.

### Three things found by rendering that the handoff had not

- **The Pending card header ran 91px past its own card** — *Remind all 3*, the
  primary verb of the whole tab — and the Payments card's ran 24px past. `.card__hd` is
  `flex-wrap:nowrap` with `.card__acts{margin-left:auto}`, and **`.main` is
  `overflow:hidden`, so the surplus is CLIPPED rather than scrolled**: the
  document's `overflowX` read 0 throughout, which is why the geometry probe
  missed it and a screenshot caught it. `.ph`'s own comment records the same trap
  for the tab strip. `.mny__hd` wraps the acts onto their own line, keeping the
  `margin-left:auto` so they stay ranged right. Four headers needed it; two more
  (the trend chart, Reports' revenue card) only clip at 320.
- **`₹20,00,000` on GST still clipped after the grid rungs were right** — and
  that one is the statutory threshold, a CONSTANT, so it is not a figure the
  screen *might* draw. Ten characters at 27px Archivo is 145px against 136px of
  2-up tile. `.mnystats .stat__v{font-size:clamp(21px,6vw,27px)}` — the cap is the
  design system's own number, so **nothing changes above 450px**.
- **The 1-up stat rung could never fire.** Written as a bare `.mnystats` (0,1,0)
  against this pass's own two 2-up rules at (0,2,0), and a media query adds no
  specificity — so at 320px the 2-up rule went on winning and `₹20,00,000` was
  still 12px over a rule written to give it the whole width. **The seventh
  instance** of this trap, after `.body--flush`, `.srow--h2`, `.ph__id`, §24's
  panel rule, `.ctl:focus` and `.pal__i`. Fixed by specificity, never by moving it
  down the file.

### The export became a glyph rather than a deletion

M2 proposes dropping *Export for my CA* below 900px. **Measured, dropping it
saves nothing**, and neither does shrinking it: `.ph__id` is `flex:1 1 auto`, so
its basis is the subtitle's max-content (264px), and flex wrapping is decided on
BASES before any shrinking — 264 + 12 + anything over 90 breaks the line whatever
the acts weigh. `.ph__id{flex:1 1 0}` alone is worse (185px), because the
full-width export then squeezes the subtitle to four lines.

It takes both, and then the two are worth the same 27px — so the glyph wins
outright, because the handoff's own table of the trainer's phone moments files the
CA export under *"must work; must not set the layout budget"*, and a control that
is not on the screen does not work. The label is **clipped, not `display:none`** —
`.omni`'s rule and the bug that taught it. **The fifth control in this shell to
need clipped-not-dropped.**

`.ph--biz` scopes the basis change: it alters how every page header breaks, and
the six other screens with a `.ph` each want measuring on their own screen first.

### The record panel is the fourth bottom-sheet opt-in

After `.sch__panel` (which `BookPanel` and `SessionPanel` share) and
`.crd-fpanel`, whose comment says why there was a queue. The inline `width:420`
went to `.rp-panel` first — an inline declaration outranks every selector
including a media query, which is the shape of five bugs in this file — and
`position:fixed` and `height:100dvh` moved with it unchanged, because this panel
renders as a sibling of `<main>`.

`.sch__panel`'s model rather than `.crd-fpanel`'s: it **covers the tab bar**,
because that rule's own argument is *"a navigation row under a form the trainer is
filling in is a mis-tap that loses the form"*. One thing diverges — a fixed
`height:88dvh` rather than a `max-height`, because **this form grows** from one
select to eight fields as it is filled, and under a cap `.panel__foot` (which
holds the primary) would walk down the screen under the thumb. Measured: the foot
sits at y=781 before and after a package is chosen, and `.panel__body` takes the
243px of growth.

### Checked by rendering

Same-origin iframes at 320 / 360 / 375 / 390 / 430, all seven tabs, both themes,
plus 899 / 901 / 1000 / 1120 / 1440.

Verified: **zero horizontal overflow and zero hidden table columns on the two
money tables at every phone width**; every stat figure whole; zero card headers
past their card at 320/360/390/430; the reflowed rows leading with the client's
name; the foot one line with its empty cell dropped; both verbs level on every
Pending row **including the messaged one** (the desk bug `.owd__acts` was written
for cannot occur in a column); the row menu opening from a reflowed row fully on
screen, left-aligned, focus on the first item; the sheet 390×743 at x=0 with its
foot and both buttons on screen, and correct at 320×568 and 430×932; the
`data-l` label ink **6.17:1** on white.

**End to end on a phone row:** Priya's ₹9,000 marked paid by cash removed the row,
moved the subtitle ₹28,500/3 clients → ₹19,500/2, and printed the receipt.
`pay_0018` was restored to `pending` afterwards and the book read back at 45 paid
/ 3 pending / 1 write-off, which is its seeded state.

The desk at 899 → 901 flips cleanly in every respect: table, unclipped head,
`nowrap` header, 156px export with a static label, `flex-basis:auto`. 1440 is
byte-identical to before this pass.

`npx tsc --noEmit` and `npx eslint` clean; the shorthand gate comes back empty.
**`next build` NOT run**, per this file's own note.

### And then the wrapped header was the wrong fix · 5 Sep 2026

Reported from a screenshot as *"Payments · Append-only · CSV · Record payment —
this doesn't look good as UI"*, and it was right: `.mny__hd` above stopped the
clipping and stopped there, which treats the symptom.

Measured at 390px, the wrapped header is **81px of two RAGGED rows**: the title
and its tag end at x=173 with 189px of empty card beside them, and the buttons
then start at x=132 on the row below, ending at 349. Ink in opposite corners,
which is what reads as *wrapped* rather than as *designed*.

**The cause is four controls in a 350px header, and three of them are
duplicates** — so the fix is the one *the chrome budget on a phone* used for
every band it removed, rather than a better alignment for a row that should not
be there:

| | second home on a phone |
| --- | --- |
| Payments · *CSV* | the **same** `handleExport` the page header's export glyph calls, 90px above it |
| Payments · *Record payment* | the tab bar's raised + → *Record a payment* → `/business?record=`, a live `<Link>` in `AddSheet`, two taps from **any** screen and in the thumb's arc |
| Pending · *Record payment* | the same + |
| Pending · *Remind all 3* | **none — nothing else in the product sends these.** It stays |

`display:none`, not `.vh`'s clip: the clipped-not-dropped rule is for a control
whose only TEXT is being hidden, and these are whole controls removed because
there is a better door. `.ph--today .ph__acts{display:none}` is the same call.

**The class is on the Payments card's whole `.card__acts` and on Pending's one button**,
which is the difference between the two cases said in the markup. Marking the
The Payments card's two buttons individually was the first version and left an empty flex
item behind — a `.card__hd` reporting two rows for one row of content, which
`.cftbl` already warns about (*"an empty flex item still spends a gap"*).

And `.card__acts{margin-left:0}` at this width, so whatever is left wraps to the
**card's own gutter under the title** instead of keeping the desk's
`margin-left:auto` and hanging in the opposite corner. That is what turns a wrap
into a second line.

| | before | after |
| --- | --- | --- |
| Payments header | 81px, 2 ragged rows, 4 controls | **45px, one row** — `Payments` `Append-only` |
| Pending header | 81px, 2 ragged rows | 81px, and the two rows now share a left edge at x=26: the title, then its one verb |
| the trend chart | *₹75,000/month average* ranged right | the same fact at x=26, under the title |

Verified at 320 and 390 on all seven tabs: **zero controls past their card, zero
horizontal overflow, zero `.mny__dup` visible**. At 901 and 1440 every dropped
control is back, headers 57px, nothing past a card — provable rather than
measured, since every `.mny__hd` rule is inside the 900px query.

`npx tsc --noEmit` and `npx eslint` clean.

### And the row became a card, because the name had nothing to align to · 5 Sep 2026

Reported from a screenshot as *"client profile is not aligned"*, and measured at
390px the row had **three left edges**:

| x | what sat there |
| --- | --- |
| **26.8** | the avatar, three of the four labels, the action button |
| **39.8** | the `DATE` label |
| **59.8** | the client's **name** |

**The 39.8 is a specificity defeat, and it is the seventh in this file.**
`webapp.css`'s `.card__b--flush .tbl tr > :first-child{padding-left:var(--w-cardpad)}`
is right for a flush TABLE — the first column has to line up with the card's own
gutter — and it is 13px of stray indent once the row has taken a padding of its
own. At (0,3,0) it outranked the reflow's `.mny__tbl tbody td` at (0,1,2). Stated
now at **(0,3,2)** rather than relying on being later in the file. `.pk__tbl` has
the same latent indent on its own name cell and was not touched here.

**The 59.8 is the report, and it is not a padding to tune.** `.who` is
`avatar + 9px gap + name`, so the name starts 33px in while every line under it
starts at 0 — two different kinds of line, and no single number reconciles them.

So the gutter became the **ROW's**: `padding-left: 14px + var(--mny-gut)`, with
the `who` cell alone pulling back out by the gutter with a negative margin. The
avatar lands at 26.8 inside the gutter and the name at 59.8, **which is where
every other line now begins by construction rather than by a number kept in
step**. `--mny-gut` is 33px because `.av--sm` is 24 and `.tbl .who` sets a 9px
gap; change either and the alignment follows.

#### The labels are gone, and that reverses this pass's own first version

The reflow ported `.pk__tbl`'s `data-l` labels on that rule's argument —
*"₹12,000 beside ₹750 beside 2 is unreadable without Price, Per session and On it
now."* **The argument does not transfer.** The price list is four BARE FIGURES in
one row and is genuinely ambiguous; a payments row is one figure, one date, one tag
and one method, and every one of them labels itself:

    4 Sep            a date, and reads as one
    ₹10,500          the only money on the row, with `.dirn`'s arrow and colour
    Paid             a tag, which is its own label
    12-session pack  ·  Cash · floor        prose

Applying it anyway produced a five-line stack of 10px mono labels for facts that
needed none. So the cells are placed by **what they are** — a `data-cell` role in
the JSX, never the header's text, so a copy change cannot move a cell — and the
row says the same things in three lines:

    (KM)  Karthik Menon                    ↑ ₹10,500
          4 Sep · Cash · floor              [ Paid ]
          [ Mark paid ▾ ]

Identity and prose read down the left; the money and the state form a right rail,
which is the column a trainer actually scans. Both meta cells take row 2 with no
column stated, so they auto-place in markup order and Pending — which has only one —
simply leaves the middle column empty.

**And the `<thead>` goes rather than being clipped**, which reverses this block's
first version too. It argued *"there ARE column names to lose here"*, true of the
labelled list and false of a card whose values label themselves — and
`display:grid` on a `<tr>` drops the table role either way (the trade `/today`'s
queue and `.cftbl` both record), so a clipped head is five column names announced
before a list of rows that no longer has columns.

#### Measured after

| | before | after |
| --- | --- | --- |
| distinct left edges in a row | **3** (26.8 · 39.8 · 59.8) | **1** (59.8), avatar in the gutter at 26.8 |
| a Pending row | 171 / 188 / 170px | **113 / 130 / 112** |
| a settled payments row (no menu) | 5 lines | **2 lines, 72px** |
| the pending list | scrolled | fits one screen |

Verified at 320 / 360 / 390 / 430 on both tables, both themes: **one content edge
at 59.8 and the avatar at 26.8 at every width**, the figure ending a constant
15px inside the card, zero horizontal overflow, nothing hidden. Light theme —
name **18.58:1**, meta **6.17:1** on white. Desk at 901 and 1440 untouched and
provably so, since every rule is inside the 900px query: a real `<table>`, the
head back, webapp's 16px first-cell gutter back, the name at 13.5px, the action
column right-aligned.

`npx tsc --noEmit` and `npx eslint` clean; the shorthand gate comes back empty.

**Left alone, and it is D4's:** `— · floor` on a row whose method is null. The
em-dash is drawn at the desk too, and the handoff files it under *fix `— · floor`*.

### Gym share — the one money table that keeps its labels · 5 Sep 2026

The last of the three, and it is where the card row's argument gets tested from
the other side. Measured at 390px: **120px hidden, and it is the whole `You keep`
column** — the figure the tab exists to produce, on the tab that answers *what
does the floor cost me*. `Billed` and `Gym's cut` were readable; the answer was
not.

**It takes the card SHELL and not the card's row 2.** The block above drops the
payments table's labels because a payments row is one figure, one date, one tag and one
method, each of which labels itself. This row is **three money columns**:

    ₹16,300        −₹3,150        ₹13,150

which is `.pk__tbl`'s case exactly — *"₹12,000 beside ₹750 beside 2 is unreadable
without Price, Per session and On it now"* — and the split IS the subject, so the
three stay side by side and comparable rather than becoming three lines of prose.
Same shell, same 33px gutter, same avatar at 26.8, so a trainer moving between
the three money tabs meets one row shape; a different row 2, because the content
is a different kind of thing.

    (VR)  Vikram Rao                              2 Sep
          BILLED         GYM'S CUT        YOU KEEP
          ₹16,300         −₹3,150          ₹13,150

The label sits **above** its figure rather than beside it, which is what lets
three fit a phone: beside, a pair is ~150px and only two would. The date takes
the head's right, where the payments table puts its amount — this table has no single
amount, and the date is what tells two entries for one client apart.

**Three across does not hold at 320.** Measured: the columns are 91px at 390 and
hold everything; at 320 they are 67 and `₹1,13,408` at 13px mono is **72 — over
by 5**, which is not an edge case on the tab about a gym. Below 360 the three
become label/value ROWS — `.pk__tbl`'s own layout, which needs no width at all.
**360 is `.mnystats`' rung and this is the same question**, so it is the same
number rather than a second one to keep in step.

#### Two defects found by looking at it, and the second was on all three tables

- **The foot's totals sat 1–3px off the columns they total.** `.mny__tbl tfoot tr`
  carried the `gap:12px` a flex line wanted while the body rows use 8. The column
  gap is now stated for body and foot in one rule rather than inherited from two.
- **`.tbl tfoot td`'s band broke into chips.** §11 gives the foot cell the
  `--tx-surface-2` fill and the strong top rule, which reads as one band only
  while the cells are contiguous TABLE cells. As flex or grid items with a gap
  the same fill paints **one box per cell** — *SHOWING* and *4 of 4* as two
  chips on Payments, and a label above three boxes on Gym share. The band moves
  to the `<tr>` and the cells go transparent, with `background-color` and never
  the shorthand, per this file's own law. **This was live on Payments and the
  pending list too** and had been since their reflow; a screenshot caught it.

#### Measured after

| | before | after |
| --- | --- | --- |
| Gym share, hidden at 390 | **120px** — all of `You keep` | **0** |
| the row | a table scrolled sideways | 88px card, three labelled figures |
| at 320, a six-figure amount | over by 5px | stacked, 0 over |
| the foot | totals 1–3px off, painted as chips | aligned to the columns, one band |

**All seven tabs at 390: zero horizontal overflow, zero hidden table columns,
zero clipped text.** Same at 320, where the only truncation left is a
17-character client name taking `.tbl .who b`'s ellipsis — whole at 360, 390 and
430, and still whole in the accessible name at 320.

Light theme on Gym share: the figure labels **6.17:1** on white, the foot band
`#EDEFEC`, zero overflow. Desk at 901 and 1440 untouched — a real `<table>`, the
head back, the foot band back on the cells where §11 puts it.

`npx tsc --noEmit` and `npx eslint` clean; the shorthand gate comes back empty.

**Left alone, and both are D4's:** the demo book has no floor payments in the
period, so *Where the 30% went* lists rows whose cut is `—` and totals `−₹0` —
the handoff files that under *retitle the card or give it a real empty state* —
and the payments table's `— · floor` em-dash is the same D4 entry.

### *Add a pack* docks to the bottom · 5 Sep 2026

Reported as *"in Packages, when I click add a pack in mobile view the input opens
at the bottom, but it is not scrolled down to it."* Measured at 390px, pressing
*Add a pack*:

| | |
| --- | --- |
| `.body` scrollHeight | 2019 → **2656** — the form is 597px tall |
| `.body` scrollTop | 0 → **0**, nothing moved |
| the form's top | y = 923, **132px below the fold** |
| its first field | y = 1171, **380px below the fold** |

So the loudest control on the tab did nothing a trainer could see.

**A scroll was the smaller half of the answer.** `scrollIntoView` fixes the
symptom and leaves a 597px form in a 654px content area with no way out but
hunting for *Cancel*. Docking it is what every other input surface on this
destination already does — *Record payment* is a sheet one tab over — and it is
what the app itself does, which is this half's standing rule for the phone view:
**the mobile web should BE the app's screen, not the desk's narrowed.** THE FIFTH
OPT-IN of this shape, after `.sch__panel`, `.crd-fpanel` and `.rp-panel`.

`PackSheet`'s own docstring argues the other way — *"a panel rather than the
phone's bottom sheet. Adding two or three packs is the common case, and a modal
that has to be opened and dismissed three times is three dismissals a desk does
not need to spend."* **That is an argument about a desk, and on this screen it
does not hold even there:** `submit` calls `setEditing(null)`, so the form
already closes on every add and the three openings are already paid for. The dock
does not add a dismissal; it makes the second and third ones visible.

#### It stays where it is in the DOM, and that is what keeps the desk right

The form renders inside whichever card it writes to — only one of the two lists
draws it at a time, and at a desk it belongs under the list it edits.
`position:fixed` moves where it PAINTS and not where it sits, so the phone gets a
sheet and the desk keeps the card, from one instance and one branch.

Checked rather than assumed, because this shell has twice been bitten by a fixed
child trapped in an ancestor: walking every ancestor for a `transform`, `filter`,
`backdrop-filter`, `perspective`, `will-change` or `contain` came back **empty**,
and a fixed child measured x=0, bottom=844 in a 390×844 viewport. §24 is why — it
lists `.card` among the elements glass explicitly does NOT go on, *"as real
declarations rather than as a comment"*.

#### Three defects found while building it

- **The inline `style={{marginTop:12,maxWidth:620}}` had to come off first.** An
  inline declaration outranks every selector including a media query, so with the
  width inline the sheet rule could never have applied — the shape of six bugs
  this project has already recorded. `.pk__panel` carries both numbers unchanged,
  so setup step 7 renders exactly as it did.
- **`display:contents` cannot take focus.** The wrapper was written that way to
  add no box of its own; an element with `display:contents` generates no box and
  Chrome refuses to focus it, so `activeElement` stayed on `<body>` and the one
  thing the wrapper exists for was the one thing it could not do. A plain block
  costs nothing — the panel inside is `fixed` at this width, so it collapses to
  zero height.
- **`focus()` scrolled the page 447px behind the sheet.** Focus scrolls its
  target into view, which is right while the form is in the flow and wrong once
  it is docked: the wrapper is a zero-height box left deep in the page, so
  focusing it moved `.body` 447px behind a sheet that had not moved, and
  dismissing left the trainer 447px down a list they never scrolled.
  `focus({preventScroll:true})`, and the scroll is then done by hand **only when
  the panel is not `fixed`** — which also gives the DESK the scroll-into-view it
  never had.

#### And the sheet rule is scoped to the wrapper, which is not a detail

`.pk__panel` is `PackSheet`'s own root and `PackSheet` is **shared with setup step
7** — *"setup and the packs screen are the same question asked at two moments"*.
A bare `.pk__panel` rule would have docked the setup step's form too, with no
scrim and no Escape, because `Packages.tsx` renders those and the form does not.
`.pk__sheet` is the wrapper only `/packages` draws, so `.pk__sheet .pk__panel` is
the exact scope and setup cannot be caught by anything written here. Verified by
grep: `.pk__sheet` and `.pk__scrim` appear in `Packages.tsx` and nowhere else.

#### Checked by rendering

390×844 and 320×568, both themes, every behaviour driven as a real click.
Verified: the sheet docked at x=0 with its bottom on the viewport edge, **541px
of form at 844 and capped to 500 at 568 where it scrolls 97px internally with the
primary reachable**; focus landing on the wrapper and **`.body` scrollTop 0
before, during and after**; Escape closing and restoring focus to *Add a pack*;
the scrim closing and restoring focus; the gym list's own add docking identically
and still rendered inside the gym card; light theme — white panel, 42% scrim.

Desk at 901 and 1440 after: `position:static`, `max-width:620px`,
`margin-top:12px`, scrim `display:none`, still inside `.card__b`, zero overflow —
identical to before, with the form now scrolled into view on open.

All seven tabs at 390 still report zero horizontal overflow, zero hidden table
columns and zero clipped text. `npx tsc --noEmit` and `npx eslint` clean; the
shorthand gate comes back empty.

### Every table row in the product was half height on every touch device · 5 Sep 2026

Reported as *"can we provide proper padding and spacing to this month-by-month
tab?"* from a phone screenshot of `/business?tab=gst`. **The spacing was correct
in the stylesheet and halved on the device**, which is why no harness on this
project could ever have seen it.

`@media (pointer:coarse)` carried
`.tbl tbody td{height:auto;min-height:var(--w-row)}` under a comment claiming
*"`--w-row` is the density dial for the whole application and 44 is what it
already says — this only stops a cell's own `height` from undercutting it."*

**`min-height` has no defined effect on a `display:table-cell`, and Chrome
discards it.** `getComputedStyle` on a cell under that rule reports
`min-height: 0px`. So the only declaration that survived was `height:auto`, and
the rule written to GUARANTEE a 44px row collapsed every row in the product to
its content — on exactly the devices it existed to protect.

| | fine pointer | coarse pointer |
| --- | --- | --- |
| GST · month by month, 390px | 44px | **19.6px** |
| Payments, 1440px (a tablet) | 44px | **24.8–28.8px** |

Note the second row: this was **not** a phone bug. Any touch device at any
width — a tablet in landscape, a touchscreen laptop — got collapsed rows on every
`.tbl` in the app: the roster, the client file, the money book, the price list.

**Nothing replaces it.** §11's `.tbl tbody td{height:var(--w-row)}` already does
the job correctly, because **`height` on a table cell is a MINIMUM by
specification** — CSS 2.1 §17.5.3, the used height is the maximum of the cell's
`height` and its content. Verified by giving a cell four lines of text: its row
grew to 76.2px against the 44 it declares. A row could always be taller than
`--w-row`; it could never be shorter. The one thing the coarse rule added was the
breakage.

`.rail__i`, `.rail__pin`, `.rail__acct`, `.menu__i`, `.chip`, `.pal__i` and
`.ntf__i` keep their `min-height` and are unaffected — every one of them is a
block or a flex box, where `min-height` means what the comment says. Checked for
the same mistake elsewhere: `.mo__c` is the only other `min-height` near a grid
of cells and it is a `<div>` inside `.mo__r`, not a table.

**This is the third defect in this file found only on the coarse-pointer side**,
and the block's own note had already warned it in capitals: *"THAT COUNT WAS
TAKEN WITH A MOUSE."* It was right about counting targets and did not consider
that a rule written for touch could itself be wrong in a way only touch shows.

#### How it was verified, given the harness has a fine pointer

The fix cannot be seen in this harness — nothing changes there, because the
deleted rule never applied to a mouse. So it was proved from the other end: the
**broken** state was reproduced by re-applying the deleted declaration and
measuring the collapse (the table above), and the **fixed** state is what the
harness already renders. The direction is safe by construction: with the rule
gone a row can only return to §11's 44px, never fall below it.

`npx tsc --noEmit` and `npx eslint` clean; the shorthand gate comes back empty.

**Not changed:** the month table draws six future months as `—`. That is the
financial year the tab is about, and the remaining months are the headroom it
exists to show — not the `—`-on-9-of-12 defect `MonthBars` was fixed for, which
was empty months BEFORE the first with data.

### Not done, and one of them is a defect this pass did not cause

- **Pending's table scrolls horizontally between 901 and 1159, and Payments'
  between 901 and 980.** Measured, hidden columns: Pending **258px at 901**, 159 at
  1000, 39 at 1120, 0 at 1160; Payments 80px at 901, 0 by ~981. It is pre-existing —
  above 900 the 248px rail takes back more than the window gives — and it is now
  the sharpest edge in the screen, because 899 is perfect. **The fix is the one
  this file has already recorded twice**, for `/today`'s queue and for
  `MonthBars`: *a viewport breakpoint cannot see a container's width*, so
  `.tblwrap` becomes a container and the reflow hangs off an `@container` query,
  which would close the phone case and the desk band with one rule. Not done here
  because it changes the mechanism for the desk, which this pass was scoped out
  of.
- **M3 is mostly untouched**: GST's chart has no ₹20L line, Reports scrolls
  ~3,500px, and Packages' work-mode card is unexamined. Gym share's table and all
  five stat rows are done — see the two sections above. M4 needs a real device — the coarse-pointer rules a desktop
  harness cannot see.
- **D1 and D4 from the handoff are untouched** — `aria-sort` on tables with no
  sortable header, the period picker on Pending, *Export for my CA* enabled with
  nothing to export, and the GST subtitle's mislabelled figure.
- **`.card__hd`'s no-wrap is a generic condition** and is almost certainly true of
  other screens at phone width. `.mny__hd` is scoped deliberately — those are
  screens this pass did not open — and it is the same call this file already makes
  about `.chip` being 26.9px app-wide.

## `/sessions/:id` on a phone — M1–M3 of `SESSION-VIEW-UX-HANDOFF.md` · 5 Sep 2026

The handoff's mobile plan. The desk pass in that file was already built and
verified; this is §5, and the two open questions in §5.8 are answered by what
the components turned out to be rather than by a preference.

**Re-measured first, and the §5.2 numbers still held** — 620px of table in a
350px card body, 296px hidden, at both 390 and 360.

| | before | after |
| --- | --- | --- |
| plan table, hidden behind a sideways swipe @390 | **296px** | **0** |
| the six exercise set tables @390 | **296px each** | **0** |
| *Before this session* @390 | y=979, 188px below the fold | **y=273, whole card above it** |
| chrome @360×640 | 226px = **35%** | 198px = 31% — **206px = 32.2% on a real phone**, see M4 |
| chrome @390×844 | 228px = 27% | 200px = 23.7% — **208px = 24.6%** on a real phone |
| the strip | 74–80px, a label and a value wrapping | **59px**, and 31px of it was outside its own border |

### M1 · the `min-width` was scoped to the wrong thing

One rule caused all of it: `@media (max-width:820px){.card__b>.sets{min-width:620px}}`.
Its own comment says what it is for — *"the two entry columns each gained a 24px
stepper"*, *"RPE is the column the desk exists to add"* — and it was written for
the CONSOLE's editable set row. The selector caught every `.sets` in the
product, including this page's two read-only tables.

It is `.sets--entry` now, carried by `SetGrid` and `ExerciseHistory` — the two
tables whose columns hold controls. Released, the exercise set tables settle at
**324px with 0 hidden and get SHORTER** (73px against 88), because the 620 was
stretching rows that never needed it. A trainer was swiping sideways to reach
numbers that fit on the screen all along.

**The plan table needed more than the release**, and that is the difference
between it and the other six: its own min-content is 393px (upcoming) and 484px
(logged) against a 350px body. So it reflows below 620px on `.pk__tbl`'s
mechanism and `.pk__tbl`'s argument — this table has a `<thead>` and columns of
bare figures, so the labels move INTO the row as `::before` off `data-l` rather
than the head being dropped. `4 × 5` under `3:00` under `70 kg × 5` is three
unlabelled strings and the middle one is a clock face.

Horizontal scroll was the alternative and it is what shipped: the trainer swiped
to reach **`Last time`, which is the column this page exists for** — verbatim
what this codebase already refused for `/today`'s queue and the price list.

The cost is stated where it is paid: 115px per row against a 51px table row, so
a six-movement plan goes 343 → 681px. That is content rather than chrome, and
nothing is hidden.

### M2 · the actions come up, and the two views need the SAME rule

§5.8 Q2 asked whether upcoming and logged want different stacking orders. They
do not, and the reason is that **only one of them has an actions card**:
`QuickActions` is drawn on the upcoming view only. The logged view's side column
is the trainer's notes, the client's notes and the details, and its main column
is the LOG — which is the answer somebody opened a past session for.

So ordering the whole of `.sesh__side` first, which is what M2 proposed, is
wrong on the logged view: it would put four cards of context above the thing
they are context for. One rule moves one card that only one view draws, and the
logged view reorders nothing because all its cards are `order:0`.

`display:contents` on the column below 900px so its cards become items of
`.sesh` and `order` can reach them — a rule on `.sesh__side` cannot move a card
OUT of `.sesh__side`. `.sesh` already sets the same `gap:12px`, and the 640px cap
is re-stated on the children because selectors still match through a contents
box.

### M3 · the header's three rows become two, and what came out is a duplicate

The crumb reads `Sessions / Arjun Subramanian · Thu · 1 Oct` and every token of
its trailing half is drawn again within 60px — the name is the `h1`, and
`Thu · 1 Oct` opens `.ph__sub`. So the trailing segment stands down and **the
LINK does not**: `AppShell.currentFor` refuses to guess for `/sessions` and falls
through to `today`, so this crumb is the only control on the screen that reaches
the sessions list, and the top bar's *Sessions* is a title rather than a door.
Dropping the whole crumb saves the same 24px and is what this file means by
leaving a flow doorless.

The 24px comes back by **sharing a row** instead: `Sessions` is 55px and the two
verbs 207, which fit a 336px row with room. It is also the better shape — a way
back at the top left and the actions at the top right is what `.top` itself does
one row up.

**And one strip tile went**, for the same reason: `outcome` prints
`Done` / `No-show` / `Not marked`, which is exactly the `.tag` beside the `h1`
and, on an unmarked session, the alarm card as well. It was also what forced the
strip to 80px — `Not marked` will not fit an 80px tile on one line, so the VALUE
wrapped, which is the defect `.kv__v` is already fixed for. The other three tiles
stay whatever it costs: `DetailsCard` deliberately dropped its Duration and Type
rows *because the strip prints them*, so `booked` and `where` are their only
copy. **A duplicate may go; a sole copy may not.**

### Four defects found by rendering, and two of them were this pass's own

| Where | What |
| --- | --- |
| `.sets--plan tbody td.num` | **Every value cell was a 3px box.** `.sets--plan .num{width:1%}` is the shrink-to-fit idiom that sizes the desk's numeric columns — correct against a table, and against a GRID ITEM it is 1% of the track. So `space-between` had nothing to spread and every figure rendered hard against its own label: three cells, three different left edges, none of them a column — while the CSS comment claimed the value was right-ranged. It survived a screenshot and every height measurement, because the content of a 3px box still paints in the right order and the row was wide enough that nothing clipped. Found by reading the cells' own rects back — `w: 3` on all three, at the same x. `width:auto`. |
| the same cells | Then the nowrap written to stop `SETS × REPS` wrapping inside its own label was over-applied to the VALUES, and at 320 an unbreakable `107.5 kg × 12 · 12 days ago` pushed 18px past the card and broke the column into five right edges. `.sets__last` is the one value that may wrap — it is two tokens, not one — between the figure and its age, each of which stays whole. |
| `.strip>div` | **31px of the last tile drawn outside its own rounded border** at 360. `flex:1` is `flex:1 1 0%` and a flex item's automatic minimum is its MIN-CONTENT, so four equal tiles stop shrinking and start overflowing. `.main`'s `overflow:hidden` clips it, so the document reported no horizontal overflow — the same shape as the hidden table columns, and invisible to every gate for the same reason. `min-width:0`, 8px of side padding, eased tracking, and `flex:1 1 auto` so the SLACK is what gets shared rather than the space. |
| `.sesh .kv__v` | `.kv__v{white-space:nowrap}` is right and its comment says why — *a minus sign alone on a line is not a minus sign*. That argument is about FIGURES. `DetailsCard`'s three values are sentences (*Saturday 5 September, 02:39 PM*), and held unbreakable they ran 4px past the card at 360 and 36px at 320. The key cannot take the wrap here the way it does on the month card, because `.kv__k` is `min-width:80px;flex-shrink:0` — one word in a fixed track, with nothing to give. |

### Checked by rendering

Same-origin iframes at 320 / 360 / 390 / 430, all three states (`ses_0255`
upcoming, `ses_0196` done, `ses_0578` not marked), both themes, plus the desk at
901, 1000, 1120 and 1440.

Verified: **0 hidden table columns, 0 horizontal overflow, and nothing painting
past `.sesh`'s right edge** at every phone width in every state; one cell width
and one value right edge per table, landing on the row's own right edge; the
actions card whole above the fold on the upcoming view and the log first on the
logged one; the strip 59px with one-line labels; **no horizontal scroller with
hidden content left anywhere in the body**, in either theme; the `data-l` label
ink `--tx-ink-3` at **6.17:1** on white.

The desk at 901 and 1440 is byte-identical in behaviour: two columns 640/491, a
real `<table>` (`table-row`), the `<thead>` back in flow, `.num` at its 109.5px
shrink-to-fit, the full crumb, the outcome tile drawn, and the strip's tiles back
to `flex:1 1 0%`.

`npx tsc --noEmit` and `npx eslint components/sessions components/log` clean; the
background-shorthand gate comes back empty; `sync-design --check` reports both
stylesheets up to date, so `webapp.css` is untouched. **`next build` NOT run**,
per this file's own note that it writes `.next/` under a running dev server.

### Not done

- ~~**M4 needs a real device**~~ — **done, in the section below**, by simulating
  the coarse-pointer cascade exactly rather than a device. It found that this
  bullet's own reasoning was half wrong: the harness under-reports as well as
  over-reports, and M3's chrome figure was 8px light.
- **D4 from the handoff is untouched** — the logged view is still one exercise
  card per row at a desk, and a 2-up grid at the 686px main column needs
  measuring.
- ~~**App-wide `her`**~~ — **closed, in the section directly below.** It was far
  wider than §5.9's six strings.
- **320px is below the stated floor and is honest rather than clean**: nothing is
  hidden and nothing overflows, but the upcoming header wraps its chip to a
  second line (`.sesh__title`'s own `flex-wrap`, deliberate) so chrome is 227px,
  and `sets planned` takes two lines in the strip.

### The gendered pronouns are gone, app-wide · 5 Sep 2026

`SESSION-VIEW-UX-HANDOFF.md` §5.9 has carried this as an open item since the
desk pass fixed four instances on `/sessions/:id`, with a list of six more and
the gate `grep -rn "her pack\|her notes\|Her programs" components/`.

**The list was a sixth of the problem and the gate was matching three phrases.**
A sweep for `\b(her|Her|hers|she|She|his|His|him|Him)\b` across `components/`,
`lib/`, `app/`, `mock/` and `web-components/` returned **104 hits in 23 files**.
Both sweeps come back empty now.

The rule, which is the product's own and not a style preference: **a name does
not tell you somebody's pronouns.** Every client in this schema is a row with a
`name` on it and nothing else, so any pronoun the product prints about them is a
guess it had no basis for — and it prints them to the trainer who knows the
answer, which is the reading where a wrong guess is most obviously wrong.

Three substitutions, in this order of preference:

1. **The client's own first name**, wherever the component has it in scope. It
   is what the desk pass did and it reads *better* than the pronoun did — *This
   did not touch Karthik's pack* is a stronger sentence than *…her pack*, because
   it names who is owed. `Finish.tsx` takes a `first` const for this; `StartLog`,
   `ExerciseHistory` and `Progress` interpolate theirs.
2. **The definite article**, where the sentence is about a thing rather than a
   person — *her program* → *the program*, *on her plan* → *on the plan*. This
   is most of `SwapModal`, `SetGrid` and `lib/log/actions.ts`'s four refusal
   messages, and in every case it is what the sentence meant.
3. **Singular *they***, where a person is genuinely being referred to twice —
   *the actual session they did*, *a client turning up on a day they do not
   normally train*, *it stays on their file*. `Finish.tsx` already shipped a
   button reading **They didn't train**, so the register was already in the
   product.

Four decisions inside that worth keeping:

- **`Her first` is `First time`**, in `SetGrid` and `ExerciseHistory`, and that
  is not a neutral rewording — it is the phrasing `LastTimeCell` already uses on
  `/sessions/:id` for the identical fact, chosen there because *"a dash says 'no
  data'; this says 'watch this one', and the two are not the same instruction to
  somebody about to load a bar."* One concept, one word, on all three surfaces.
- **`RecordCard`'s two headings changed subject.** They read `{name}, her
  history` where `name` is the EXERCISE — so the pronoun was the client, who is
  not in scope there (only `clientId`). They are `{name}, no history yet` and
  `{name}, the last {n}`: the card is about the exercise, so it says so.
- **The library specimens use the fictional client's name**, not *they*. *Keep
  her* → **Keep Meera**, which is also better button copy on its own terms —
  `Modal.entry`'s own rule row says *"Cancel says what it keeps"*, and a name
  keeps it better than a pronoun.
- **Two are deliberately untouched**: `Schedule.tsx:69` and
  `lib/schedule/result.ts:23` both quote the design set verbatim — *"Moved from
  Monday 17:00 · Nikhil asked. He was told automatically"*. Editing a quotation
  to fix the thing it is evidence of is misquoting the source. Fix it in
  `webapp-schedule.html` and the quotes follow.

**Comments were swept too, not just user-visible copy.** The gate's own wording
(*"should return only comments"*) conceded them, and that was the wrong line:
these comments are the argument the next person reads before changing the copy,
and a comment reasoning about *her pack* is what reintroduces *her pack*.

### Checked by rendering

Nine routes against the running dev server — `/sessions/:id`, `/sessions/:id/log`
in both the un-started and live states, `/finish`, `/bests`, `/clients/:id/progress`,
`/schedule`, `/today` and `/library` — each asserted for **zero gendered
pronouns in `innerText`, zero `undefined`/`NaN`/`[object Object]`/unexpanded
`${`, and zero error messages**. The *They didn't train* modal and its no-show
checkbox were driven open, because three of the rewrites are inside it.

The interpolations were read back rather than assumed: *This did not touch
Karthik's pack*, *the difference is what happens to Karthik's pack*, *Take a
session off Karthik's pack*, *Starting one seeds the grid from Arjun's program*,
*Arjun has never logged …*, *Back Squat, the last 5*.

`npx tsc --noEmit` clean; `npx eslint` clean on every touched area (the one
remaining warning, `roster.ts:42`'s unused `OVERDUE_DAYS`, is in a file this pass
never opened). **`next build` NOT run**, per this file's own note.

**One trap for whoever does the next bulk copy edit**, which cost two rounds
here: `perl -pi -e 's/…/…/'` **interpolates `$` in the REPLACEMENT**, so a
replacement containing `${data.focus.name}` silently produces an empty string —
the substitution appears to work and the template literal comes out gutted. It
also breaks on `//` inside a pattern, because that closes the `s///` delimiter.
Pass both sides through the environment instead:

```sh
p() { A="$1" B="$2" perl -0pi -e 's{\Q$ENV{A}\E}{$ENV{B}}g' "$3"; }
```

`\Q…\E` makes the pattern literal, `{}` sidesteps the delimiter, and a value
read from `%ENV` is never re-interpreted.

### M4 · the coarse-pointer pass, simulated exactly rather than guessed · 5 Sep 2026

`SESSION-VIEW-UX-HANDOFF.md` §5.7 files M4 as *"verify on a real device — the
`pointer:coarse` rules a desktop harness cannot see, plus the horizontal-swipe
affordance."* There is no device here. **One of those two is a cascade question
and a cascade can be simulated exactly; the other stopped existing in M1.**

#### How, and why it is not a screenshot of a guess

`Emulation.setEmulatedMedia` is not reachable through this harness, so the
condition is rewritten instead:

```js
if (/pointer:\s*coarse/.test(r.media.mediaText)) r.media.mediaText = 'all';
```

**In place, via `media.mediaText`, and that detail is the whole method.** The
rule keeps its own index in its own stylesheet, so every equal-specificity tie
resolves exactly as it does on a phone. Lifting the declarations into an appended
sheet — the obvious alternative — moves them to the end of the cascade and can
hand a rule a win it does not actually have, which is the trap this file has now
recorded seven times under its own name.

Three blocks, 23 declarations. Confirmed live: **the quick-action buttons go
34px → 44px**, which is §5.5's retracted finding proved from the other side
rather than argued.

#### The trap runs BOTH ways, and it had caught this pass

§5.5 warns that a desktop harness over-reports a defect — 34px buttons that are
44 on a phone. **It under-reports too, and M3's headline number was wrong
because of it.** `.btn--sm` is 28px on a mouse and **36px** under
`pointer:coarse`, and the header draws two of them:

| | fine (what M3 measured) | coarse (what a phone gets) |
| --- | --- | --- |
| `.ph` @360 | 99px | **107px** |
| chrome @360×640 | 198px = 30.9% | **206px = 32.2%** |
| chrome @390×844 | 200px = 23.7% | **208px = 24.6%** |

So M3 claimed *"31%, under the 32% bar"* and the true figure at the floor is
**32.2% — at the bar, not under it.** The 35% → 32.2% improvement is real and
the claim about clearing the bar was not. Corrected in the table above.
`MOBILE-UX-PHASES.md`'s 32% is what `/clients/:id` ACHIEVED rather than a
ceiling, so this is parity with the reference screen; there is no cheap 8px left
in that header, because the 8px is touch targets getting bigger, which is the
right direction.

#### Two targets that were wrong, and one this pass made load-bearing

| | box | why it matters |
| --- | --- | --- |
| the crumb link | **55 × 24** | clears WCAG 2.5.8's 24×24 and nothing more — on the control M3 made the ONLY way from this page to `/sessions` |
| `DetailsCard`'s title | **132 × 20** in a 350 × 49 header | and the `ChevronIcon` beside it is a SIBLING of the link, so the row draws an arrow saying *open this* and the only thing that answers is 20px of text |

The second is the defect this file already names for `DayColumn`'s grip — *"a
grab cursor over a row that will not move reads as a broken feature"* — with the
cursor swapped for a chevron.

Both fixed with `::before` overlays, which is the pattern the coarse block
already uses twice (`.who::before{inset:-10px 0}`, `.tag--link::before`), and
both cost **zero layout**: `.ph` is 107px and the details card 134px with them on
and with them off.

- **The crumb takes slop** — `inset:-10px -6px`, so 55×24 becomes **67×44**
  effective. Scoped to `.ph--sesh` rather than added to the coarse block's
  44px list, because a crumb is usually one of several ways back and here it is
  not.
- **The card title takes a stretched link** — `inset:0` resolving against the
  HEADER, not slop against the link, because the fix is not a bigger target but
  the RIGHT one: the whole row, chevron included, which is what the chevron has
  been promising. Safe because that header holds no other interactive child.
  The link must stay `position:static` for the overlay to resolve against the
  header, which is the one thing to not "tidy" later.

#### The swipe affordance question is closed, not deferred

M4's second half asks for a touch judgement about signalling the horizontal
swipe. **There is nothing left to signal**: M1 removed every horizontal scroller
from this page, verified again under coarse — 0 hidden columns and 0 document
overflow in both states at 360 and 390.

The console at `/sessions/:id/log` still scrolls sideways and that is untouched
and correct: `.sets--entry` keeps its 620px floor (620px table, 350px body, 296px
of scroll inside `overflow-x:auto`), which is the WCAG 1.4.10 exemption its own
rule argues for. Verified under coarse that its inputs are **44px tall at 16px**
— no iOS zoom — and that the page itself still never scrolls sideways.

#### What was checked and is fine

- **No hover-only affordance anywhere on this page.** 15 `:hover` rules in the
  sheet touch `display`/`visibility`/`opacity`/`transform`/`max-height`; **none
  of their selectors matches anything on this route**, so nothing here is
  reachable only by a pointer that touch does not have.
- **No sticky hover ground on the plan rows.** `.sets--plan tbody tr:hover` is
  neutralised in the reflow and the computed background is transparent — which
  was written for the phone's sake and turns out to matter, because **there is no
  `@media (hover:none)` block anywhere in this stylesheet**, so nothing else
  would have cleared it.
- **The desk is provably inert.** Every M4 rule is inside `pointer:coarse`;
  measured at 1440 the `::before` content is `none` on both, `.card__hd` is
  `static`, the crumb is its original 55×24, and the two columns are unchanged.

#### Still under 24px, and left alone on purpose

*Close it out* (79×18) in the unmarked alarm, and *All notes* (51×19). Both are
inline links inside a sentence, which is WCAG 2.5.8's own inline exemption, and
both predate this pass. **The first is worth a product decision rather than a CSS
one**: it is the only route out of the state that costs money, drawn as 18px of
inline text, and the desk pass chose the sentence deliberately. Slop would help
and would also make a mid-paragraph inline box that mis-fires on the lines above
and below it; a button is a copy change to a verified screen. Recorded rather
than taken.

#### What a real device would still be for

This simulates the CASCADE, which is what M4 named. It does not simulate a
finger: real hit-testing against a 9mm contact patch, thumb reach on the actual
handset, momentum scrolling over a 681px reflowed table, or whether the plan
block reads at arm's length on a gym floor. Those are the judgements the phase
is ultimately for, and the geometry they would be judged on is now known-good.

**One caveat on the method, for whoever repeats it:** flipping `mediaText`
mutates the live stylesheet object for that document. It is per-iframe and dies
with the probe, but never run it against a document you are also going to
screenshot as "the desktop state".

## The console on a phone — the tick was off the screen · 5 Sep 2026

The brief, in the product owner's words: *this screen should be completely
trainer friendly in mobile view. Trainers must be able to quickly log the
workouts in one hand and swap the exercises easily if needed. Also, they must be
able to see the last rep and weight and also the PR of that exercise in one
click.* Mobile first, desk second.

Measured at 390×844 and 360×640 in same-origin iframes, with every
`(pointer:coarse)` condition rewritten to `all` **in place** — §M4's method, and
this pass is the second to confirm it is the only honest way to measure a phone
from a desk. `ses_0578` (a log in progress) is the state a trainer is actually
in and is what most of the numbers below come from; `ses_0196` (logged, closed)
is the other.

### The headline: the button that saves the set was 224px off the screen

In a 390px viewport, the set row rendered:

| | x range | on screen? |
| --- | --- | --- |
| set number | 26 → 70 | yes |
| `Last time` | 70 → 194 | yes |
| Load input | 227 → 331 | barely |
| Reps input | 380 → 484 | **no** |
| RPE input | 522 → 578 | **no** |
| **the tick** | **614 → 646** | **no — 224px past the edge** |

620px of table in a 350px card body, 296px hidden at 390 and 327 at 360. So
logging one set was: type the load, swipe right, type the reps, tap the tick,
swipe back to read last time for the next one. Twelve sets a session, one-handed,
with a client standing there.

**This reverses `.card__b>.sets--entry{min-width:620px}` below 620px**, and the
reversal is scoped rather than total: that rule's argument — *"six columns is
what a desk is for … the table scrolls inside its own container instead, which is
WCAG 1.4.10's own exemption"* — is still right for a **desk window narrowed** to
the 620–820 band, where there is a mouse, a keyboard and a reason to want six
columns at once. It was never an argument about a phone on a gym floor. And this
codebase has already refused this exact trade three times in its own words —
*"the column a trainer would have to scroll to reach is the one holding [the
thing] they came to clear"* (`/today`'s queue, the price table, `.sets--plan`).
Here the column behind the swipe is not a value at all; it is the control that
writes the row.

### Measured, before → after

| | before | after |
| --- | --- | --- |
| hidden behind a sideways swipe @390 | **296px** | **0** |
| hidden @360 | **327px** | **0** |
| the tick's x range @390 | 614 → 646 | **305 → 349** |
| the tick's target, coarse pointer | **32 × 32** | **44 × 44** |
| the exercise list, stacked | **441px** of page | **44px** rail |
| the entry card starts @390 | y = 565 | **y = 325** |
| the PR / last 3 | y = 1367 / 1554 | **one tap, a sheet** |
| chrome @390×844 | 244 = 28.9% | **216 = 26%** |
| chrome @360×640 | 226 = **36%** | **214 = 33%** |
| `.body` scroll @390 (live) | 2.85 screens | **2.44** |
| clipped text / unexpected h-scrollers | — | **0 / 0** at both widths |
| desk `.body` scrollHeight @1536 | 792 | **792** |

### The six changes

**M1 · the row becomes two lines**, on `.pk__tbl`'s mechanism — the same one
`.sets--plan` used the day before, so the product has one phone-table shape and
not two:

```
 1   LAST TIME              102.5 kg × 5
     [−] [  105  ] [+]   [  5  ]      ( ✓ )
     · RPE and a note
```

**RPE leaves the row**, which restores what `SetGrid`'s own header always said —
*"RPE is a column here and a sheet there; the phone is fixed at five columns
because that is what fits at 360dp with Previous intact."* The console had it in
the row at every width and it is what pushed the tick off the screen. The pointer
path is the `RPE and a note` button, now drawn for **open** slots too rather than
only for logged ones, and stood down above 620 where the column is present.

**Only the load keeps its steppers**, and against what shipped that is a gain:
`.stp__b{display:none}` below 560 meant the phone had **no** stepper at all. Both
pairs at a legal size do not fit beside a 44px tick — measured, they leave ~37px
a field at 360, which will not hold `112.5` — so the pair goes to the number that
moves between sets by a pair of 1.25 plates, and reps is typed. Same split
`webapp.css` already makes for RPE: *judged and typed once, not nudged.*

**M2 · the tick is 44px on a touch device.** `webapp.css:3761` sizes it from
`--w-tap` (32px), whose own comment reads *"pointer-only controls: icon buttons,
chips"* — right for the desk it was written for, and it is the most-pressed
control in the product. The application-wide `(pointer:coarse)` block enumerated
around it: forced on, `.ctl` correctly became 104×44 and `.tk` stayed **32×32**,
the only control in `.body` under 40px. It is that block's own argument applied
once more.

**M3 · the exercise list becomes a rail, not a stack.** `.wkc`'s 980px comment
already had the diagnosis — *"the list is navigation, it is what you leave, not
what you work in"* — and stacking is the wrong conclusion from it: navigation
that has stopped being a column should become a BAR, the way the shell's own rail
does at 900. 441px → 44. Every fact the chips give up (the summary, the volume,
the verdict) is drawn in the open card's header instead, where it describes the
exercise the trainer is in rather than six they are not.

**M4 · the PR and the last three, one tap away.** `HistorySheet` in
`RecordCard.tsx` — **the sixth opt-in** of the bottom-sheet shape, after
`.sch__panel`, `.crd-fpanel`, `.rp-panel` and `.pk__sheet`. It covers the tab bar
(`.sch__panel`'s call: a mis-tap under a form loses the form — here it would lose
the log) and it caps with `max-height` rather than fixing a height, which is
`.rp-panel`'s divergence run backwards and for that rule's own reason: this
content does **not** grow. Measured 438px for an exercise with no record and 628
with one, against a 774px cap.

`ExerciseTimeline`'s closing line — *"this is the half a 390px phone cannot do"* —
was true of the LAYOUT and never of the content. `?hist=` carries the exercise id,
because this screen keeps its panels addressable and `?ex=` can change under it.

**M5 · Swap is promoted**, at every width, from a `btn--ghost` third in a wrapping
row below a 360px table (y=1196 at 390) to a `btn--secondary` in the card header.
And the swap modal becomes a sheet below 620 — it was a 329×749 **centred** dialog
in an 844px viewport with its confirm button at y=736.

**M6 · the chrome budget**, 36% → 33% at the 360 floor and 28.9% → 26% at 390.
The crumb and the three verbs share a row; *Client history* becomes a glyph (the
trade `.biz__export` already made); the crumb's trailing segment, the duplicated
program name and the live state's explainer clause all stand down.

### Six defects this pass introduced and caught, and every one by measuring

The gates were green on all six. `tsc`, `eslint` and the shorthand grep passed at
the moment each was live.

| Where | What |
| --- | --- |
| `.sets--entry td.num .stp__b` | Restored the steppers on **both** entry cells, which is what this block's own header had just finished arguing against. The reps field came out **24px wide with its value clipped by 10px**. Scoped to `.sets__load`. |
| `.wkc>:first-child .exr` | `flex:0 0 auto` made every chip **351px — the full width of the rail** — so seven of them were a 2,494px track and the second exercise was already off screen. **`flex-basis:auto` is not a width; it delegates to `width`**, and `button.exr{width:100%}` five thousand lines up is still in force — at (0,1,1) it did not even have to beat the new selector, because that selector never declared a width for it to lose to. `flex:0 0 max-content` measures 150px a chip. |
| `.log-strip i` | Added `white-space:nowrap` on the argument that a two-word label should not wrap. Measured, it did not fit and did not wrap — it **CLIPPED**, on three tiles of four: `no session pac`. A clipped label is worse than a wrapped one and worse than the 88px the rule was reclaiming. Tracking and padding eased instead, and the wrap left available so the 360 floor degrades to two lines rather than to a lie. |
| `.log-strip b` | And then the **figure** clipped where the label no longer did: `18,463` at §03's 19px is 63px against a 58px box, cut by 6 — the strip's headline number rather than its caption. `.mnystats .stat__v`'s clamp, whose ceiling is the design system's own number so nothing changes above ~432px. **And the clamp alone was not enough**, which only the CLOSED session showed: the live one's volume is `2,065` and the closed one's is `18,463`, so a pass that checked one state and not the other would have shipped it — even at the 15.84px floor the figure needed 53px against 49. The tile padding went 6px → 4. |
| `.sets--entry tbody tr` | The header's own arithmetic sized the load FIELD and forgot the field's 22px of padding: at 360 a 60px input with a 38px content box, `102.5` **clipped by 11px**. The reps track went `0.42fr` → `0.30fr`, which is what it always should have been — reps is one or two digits where load is five and a point. |
| `.setg__acts` | **The equal-specificity trap, and the eighth instance in this stylesheet** — after `.body--flush`, `.srow--h2`, `.ph__id`, §24's panel rule, `.ctl:focus`, `.pal__i` and `.mnystats`. The media rule and the base rule are both (0,1,0) and the base is later in the file, so it won `flex-basis` and the action bar rendered 255px inside a 324px header. Committed by someone who had just read that list. Fixed at (0,2,0), never by moving a rule down the file. |

And one thing measured, reversed, and measured again: the action pair shipped as a
row at the top of `.card__b`, which cost the **desk** ~40px it gained nothing for.
Moving it into `.card__hd` — a flex row with 14px of padding around a 20px title —
costs the desk ~8px, and the desk's `.body` scrollHeight came back to **792, the
exact number measured before this pass began.**

### Checked by rendering

Both states (`ses_0578` live, `ses_0196` closed) at 390×844 and 360×640 with the
coarse cascade simulated, both themes, plus the desk at 1440, 1000, 901, 621 and
at a real fine pointer on 1536.

Verified: **0 hidden table columns, 0 clipped text nodes and 0 unexpected
horizontal scrollers** at both phone widths in both states; the tick at 305–349
(390) and 275–319 (360) at 44×44; `Finish the log` ending 12px inside the edge on
a shared row with the crumb; the chip rail scrolling with the open exercise
marked; both sheets driven open by a real click — the history sheet content-sized
at 438/628 against its cap with the record card and three timeline entries in it,
Close returning, and the swap sheet docked with both foot buttons 44px and spread.
Light theme: the `LAST TIME` label **6.17:1** on white and the open chip's ink
`#4F6B0A` — `--tx-accent-text`, which is the stylesheet's opening rule holding.

The desk at a fine pointer is unchanged in every respect that matters: `.tk`
**32×32**, `.ctl` 104×32, steppers 24×24, the RPE column present at 88×38, rows
`table-row`, `.wkc` `300px 754.8px 330px`, `.ph` 87px with the *Client history*
label static, and `scrollHeight` 792.

`npx tsc --noEmit` clean; `npx eslint components/log components/sessions` clean;
`sync-design --check` reports both stylesheets up to date, so `webapp.css` is
untouched; the background-shorthand gate comes back empty. The one `eslint` error
under `app/` is `team/page.tsx:29`, which this file already records as
pre-existing. **`next build` NOT run**, per this file's own note that it writes
`.next/` under a running dev server.

### Not done

- **The two entry fields carry no visible unit on a phone.** The `<thead>` is
  clipped by the reflow, so `[105] [5]` are two unlabelled boxes — legible from
  the `LAST TIME 102.5 kg × 5` directly above them, which is in the same order,
  and from the `−`/`+` pair marking the load. `aria-label` is correct on both
  (`Load, set 3` / `Reps, set 3`), so it is a recognition question rather than an
  a11y one, and it is the one thing here worth putting in front of a trainer
  before adding a third line per row to answer it.
- **Chrome is 33% at the 360 floor**, against the 32% `MOBILE-UX-PHASES.md`
  treats as worth fixing — which is what `/clients/:id` ACHIEVED rather than a
  ceiling. What is left in `.ph` is a crumb sharing a row with three verbs, the
  `h1` and a one-line subtitle; the next 8px would have to come from the `h1`,
  and the top bar draws only the client name where the `h1` also carries the
  program.
- **The strip's labels wrap to two lines at 360.** Four labels need ~302px of
  text and 321px of strip has 51 of border and padding in it. Honest, and the
  alternative is either clipping or shorter copy.
- **`.setg__meta` stands down below 620** — *32 sets before today* — because the
  header was four lines deep above the sets. It is a headline for the sheet the
  button under it opens, and it stays at every width above 620.
- **No real device.** This simulates the CASCADE, which is what the coarse-pointer
  half of the question is. It does not simulate a finger on a 9mm contact patch,
  thumb reach on the actual handset, or whether the reflowed row reads at arm's
  length on a gym floor. The geometry those would be judged on is now known-good.
- **The desk's own faults are untouched and are the next pass**: the history
  column is 330px with 669px of content running 238px below the fold at 1536×695
  while the two entry columns hold 210px cells for 152px of content; and the
  strip spends 1,409px on four figures, one of which is a dash.

### And then the desk, where the column it exists for was the one that never grew · 5 Sep 2026

The second half of the same brief. **Two of the three findings were not the ones
this pass went looking for**, and the worst of them had been live at ordinary
desk sizes for as long as the screen has existed.

**One correction to the mobile section above before the numbers:** it closes by
naming the desk's fault as *"the history column runs 238px below the fold"*,
measured at 1536×**695**. That is a real window and an unusually short one, and
at normal heights the picture is different — `ses_0578` is 1.00 screens at every
size from 1366×768 up. **The desk's problem is width, not height**, and stating
it as height sent the first ten minutes of this pass in the wrong direction.

### What was actually wrong

`.wkc` gave the history column a **fixed 330px from 980 to 2560** and handed
every pixel of a wide display to the one column that wanted none of them:

| viewport | list | entry grid | history | the entry TABLE |
| --- | --- | --- | --- | --- |
| 1366 | 300 | 585 | 330 | 552 |
| 1512 | 300 | 731 | 330 | 697 |
| 1920 | 300 | 1154 | 330 | 1120 |
| 2560 | 300 | 1760 | 330 | **1760** |

The entry table's **max-content is 641px**. So at 2560 it was drawn **1,119px
wider than it has content for**, with `Load kg` and `Reps` reaching **559px each
to hold 152px** of stepper, input and stepper — half a metre of empty cell
between a load and the reps it was done for, inside a row being typed into. It
is the defect the `/sessions/:id` desk pass named on the plan table (*"616px of
nothing, crossed once per row"*) with the numbers doubled.

Meanwhile the timeline beside it needs **397px to put a session on one line** and
its box was 270, so `102.5 kg × 5 · 105 kg × 5 · 107.5 kg × 5 · 110 kg × 4`
wrapped to two lines at 1366 **and still wrapped at 2560**, in a 330px column,
with 1,119px of unused table beside it. That column is the screen's stated reason
for existing — *"what the desk adds is … the history beside the entry."*

### The defect that was not on the plan: a 29px input at 1280, and a 50px one at 1512

`.wkc`'s ladder was calibrated against the **viewport**, and its own 1180 comment
states the arithmetic it used — *"300 + 330 of fixed track beside a 248px
rail"* — which is the rail **expanded**. Minimised it is 64, so the same viewport
hands `.wkc` 184px more and the ladder fires at the wrong moment in both
directions:

| | container | entry grid | load input | clipped |
| --- | --- | --- | --- | --- |
| 1280, rail minimised | 1153 | 499 | **29px** | **9 elements** |
| 1512×982, rail **expanded** | 1201 | 547 | **50px** | 2 fields |

Both measured against what shipped. The second is the one that matters: a 1512
laptop with the navigation rail open is an entirely ordinary setup, and the field
a trainer types a load into was rendering at 50px with `102.5` cut.

### The fix is a container query, and this is the third time this file has said so

The width that decides all of this is the width `.wkc` **gets**, which is the
viewport minus a rail the trainer expands and minimises. This file already
prescribes the answer twice — for `/today`'s queue and for `MonthBars`: *a
viewport breakpoint cannot see a container's width.* `.wkcw` is a wrapper whose
only job is to be the container; a grid cannot query its own inline size to
decide its own tracks.

So the third column became **opt-in rather than opt-out**: the base is the
two-column shape and the third track arrives on a container query.

| threshold | tracks | arithmetic |
| --- | --- | --- |
| base | `300px minmax(0,1fr)` | the third child spans both |
| `@container ≥1220` | `300px minmax(0,1fr) 330px` | 300 + **600** + 296 + 24 — 600 is the entry grid's floor, measured: at 560 the load input is 55px and clips `102.5` by two, at 585 it is 66 and clean |
| `@container ≥1380` | `300px minmax(0,1fr) 460px` | 300 + 596 + **460** + 24 — 460 is 397px of mono plus the `.tl` rail's 26 and the card's 28 |
| `max-width:1444px` | — | 300 + 660 + 460 + 24; past it nothing on this screen wants more |

**1380 and not 1390**, which was the first number and was five pixels too high: a
1512×982 laptop with the rail minimised hands `.wkc` **1385**, so the most common
desk this product runs on missed the rule written for it. Caught by measuring
rather than by arithmetic.

**Both rules are `min-width` on purpose.** A `max-width` container query here
would sit later in this file than the phone's `@media (max-width:980px)` rule at
equal specificity and silently win it — the trap this file has now recorded eight
times — and would have put the stacked phone layout back into two columns at
390px.

The strip takes the same 1444 measure, so the page has **one right edge instead
of two** — verified equal at 1920 and 2560. That is the defect `/sessions/:id`
opened with: *"1225 / 640 / 540, all left-ranged. That is not a layout, it is
three components each guessing."*

### Measured, before → after

| | before | after |
| --- | --- | --- |
| entry table @1920 / @2560 | 1120 / **1760** | **626 / 626** |
| `Load kg` cell @2560 | **559px** for 152 of content | **177px** |
| load input @1280 | **29px, clipping** | **104px** |
| load input @1512, rail expanded | **50px, clipping** | **104px** |
| timeline lines @1512 / 1920 / 2560 | 2 / 2 / 2 | **1 / 1 / 1** |
| history column @1512 / 1920 | 330 / 330 | **460 / 460** |
| clipped elements, 1180→2560 | up to 9 | **0 at every width** |
| the page's right edges | strip and grid disagree ≥1468 | **equal at 1920 and 2560** |
| the phone, 390 / 360 | — | **unchanged**: one column, tick 44×44 at x=349/319, 0 clipped, 0 overflow |

### Checked by rendering

`ses_0196` at 1180, 1280, 1366, 1440, 1512, 1920 and 2560, plus the rail-state
case the container query exists for — **the same 1512×982 viewport measured with
the rail minimised (container 1400, three columns, timeline one line) and
expanded (container 1201, two columns, input 104px, nothing clipped)**, which no
viewport media query could have distinguished. The old ladder was re-injected at
that size to confirm the 50px input it produced rather than asserting it.

Zero clipped elements, zero unexpected horizontal scrollers and zero document
overflow at all seven widths. The phone was re-audited after the base track
change and is byte-identical.

`npx tsc --noEmit` and `npx eslint components/log components/sessions` clean;
`sync-design --check` reports both stylesheets up to date; the background-
shorthand gate comes back empty. **`next build` NOT run**, per this file's note.

### Not done

- **1440×900 still wraps the timeline.** Its container is 1313, and three columns
  with a 460px history would leave the entry grid 529 — below the 600 floor its
  own controls need. The two cannot both be had at that width and the entry grid
  wins, which is the right way round.
- **`.exr__s` ellipsises 2 of 7 rows in the 300px list column** — *"4 of 4 sets ·
  top 112.5 kg × …"*, losing the rep count. It needs ~350px and is `text-overflow:
  ellipsis` by design in `webapp.css` (*"without this the verdict tag squeezes the
  subtitle"*), so it is pre-existing and cosmetic; widening the list costs the
  entry grid 50px it has better uses for.
- **The strip is still four equal tiles**, ~350px each for figures whose ink is
  44 / 63 / 50 / 19px. It reads as a band rather than as broken, and it now shares
  the console's measure so it stops growing where the console does. The fourth
  tile drawing `—` / `no session pack` is **correct and deliberate** — AGENTS.md
  argues that figure is *"status about something that did NOT happen"*, and on a
  client with no pack it is telling the trainer that marking this done will
  decrement nothing.
- **The 1180 and 980 viewport rules are left in place.** The first now says the
  same thing as the base and costs nothing; deleting a breakpoint whose comment
  carries the original reasoning loses more than it tidies. The second is still
  the phone's and is unambiguous there.
## The roster's row menu has no `Soon` left · 6 Sep 2026

Four of the six rows on `/clients`' overflow menu shipped as `<button disabled>`
with a *Soon* tag: **Assign a plan, Message, Pause, Archive**. Same shape, same
resolution and the same sentence as the + sheet three passes ago — *the argument
for marking them was right and has expired*. Nothing here is a new feature. Three
of the four are a reader that has been on the screen since it was written finally
being handed a writer.

| Row | What made it live |
| --- | --- |
| Assign a plan | an href. `/clients/{id}/program` — the destination the file's own *Quick actions* card already uses for the same words |
| Message | `NudgeButton`, plus one new prop |
| Pause / Resume | `pauseClient` / `resumeClient` in a new `lib/clients/status-actions.ts` |
| Archive | `archiveClient`, behind a confirm |

### The two writes were the only missing half

This is the part worth stating, because it is the reason the pass is small. Every
DERIVED half of both states was already built and had been for as long as the
roster has existed:

- `buildRoster` filters `archived` out before it builds a single row, and still
  counts them into `Roster.archived`;
- `deriveTag` ranks `paused` **above** every tag it could otherwise compute, on
  the stated rule that a trainer's own statement outranks anything read from the
  data;
- `buildRow` writes *Paused 6 Sep · 6 sessions left* from `metadata.pausedAt`,
  falling back to `updatedAt`;
- `SEGMENTS` carries a *Paused* filter and `TAGS` its hint, *Paused by you*;
- `attentionTier` puts a paused row last, below plain *Active*.

All of it unreachable, because nothing on this half could set `client.status`.
The endpoints were there too — `PUT /v1/clients/{id}` is the partial update
`updateClientSchedule` has always used, and `DELETE /v1/clients/{id}` sets
`status = 'archived'` with `membership_status = 'removed'` and deletes nothing.

**Pausing a client is not pausing their pack, and the two must not be folded.**
`POST /v1/packages/{id}/pause` is a money event: it stops an expiry clock, hands
the days back on resume, writes a `package_adjustment` and is refused if the pack
is already paused. This is a roster statement with no money in it. A trainer who
pauses somebody for a fortnight has not asked anybody for a refund of a
fortnight.

**Pause reads before it writes.** `metadata` is one JSON object, so a `PUT`
carrying `{ pausedAt }` alone would take `mode` with it — the legacy key
`lib/today/mode.ts` still falls back to. Verified on the wire after a pause:
`{"mode":"floor","source":"referral","pausedAt":…}`. Resume does not clear the
stamp; it is dead the moment `status` moves, and deleting it would cost a request
to say nothing.

### The Message row picks its template from the row

Not a fixed `check_in`. The action column beside it already sends the band's own
template through `templateForKind` — the table shared with the deck so two
screens cannot phrase one client differently — and a menu offering a generic
*how is your week going* to somebody whose row reads *₹10,500 due · 1 day* would
be the second phrasing that table exists to prevent. So the order is: the band's
template where there is a band, `re_engagement` for a `lapsed` row (the one tag
that raises no band, and the register `check_in` is too light for at a month),
`check_in` for a calm row — which is the case this menu is really for. Confirmed
by rendering: Ramya Rao's *Message* drafted the **payment reminder**, quoting her
₹10,500, not a check-in.

`NudgeButton` grew ONE prop for this — `role`, passed as `'menuitem'`. The menu's
arrow keys walk `[role="menuitem"]:not([disabled])`, so a nudge dropped in
without one is a row the keyboard silently steps over. Passing the role rather
than rebuilding `wa.me` here is the whole point of that component existing once:
the popup-block recovery, the cooldown note and the error sentence all come with
it. It lands on the sent state's anchor too, because that anchor is the same row
in the same list a moment later.

`.menu__nudge` in `app.css` undoes only the LAYOUT: `.ndg` is an inline-flex
column aligned `flex-end`, right in a table cell where the note hangs under a
right-aligned button and wrong in a 196px list where every row starts on the same
left edge. The sent state's `<a>` needs the width and the underline by hand,
because `.menu__i`'s rules were written for a `<button>` — without it the row
changes shape the moment it has been pressed.

### Archive asks first; Pause does not

Archive is the one row here a trainer cannot undo from this screen. **This is not
a backend gap** — `GET /v1/clients?status=archived` answers and `Roster.archived`
is already counted. What is missing is the eighth segment. Until it exists the
row leaves and there is nowhere to bring it back from, so the menu BECOMES the
confirm — `AccountMenu`'s sign-out shape — with the cost named in prose:
*"Ramya comes off the roster. Their sessions, payments and history all stay —
nothing is deleted."* A modal for one row is heavier than the thing it protects,
and a `window.confirm` cannot say that sentence. Pause is not confirmed: it is
one click to undo from the same menu.

A refusal keeps the menu OPEN with the server's own sentence in it. Closing on an
error would be a menu reporting that nothing happened by vanishing, which is
indistinguishable from it having worked.

### Two defects this pass introduced and caught by measuring

**The confirm was 32px wider than the menu it replaced.** `.menu__note`'s 216px
measure was written for `.menu--acct`, which is 214px wide and wants the room.
The roster's menu is 196px and RIGHT-anchored, so pressing *Archive* grew it
leftward and slid every row out from under the pointer at the one moment the
trainer is being asked to read something. `.menu--confirm .menu__note` caps it at
a row's width; the sentence takes a third line instead. Measured 188 → 188 after,
identical box.

**The error line drew grey.** `<p class="menu__note fail">` — `.fail` is §33's
danger sentence at `0,1,0`, `.menu__note` is later in the cascade at the same
specificity, so the note's `--tx-ink-3` won and every refusal on this menu would
have been quiet grey text. Restated at `0,2,0` rather than by reordering, because
the quiet size, the 9px hang and the measure are all still wanted. This is the
same equal-specificity-later-in-the-cascade shape this file has now recorded six
times. Probed live: `rgb(255, 90, 90)` = `--tx-danger`.

### Checked by rendering

The running dev server, the real components, every action driven as a real click.

- **Menu geometry**: all six rows 184×32 at the same x, in both the idle state and
  after *Message* has been pressed — the nudge row does not change the menu's
  shape when it becomes *Open WhatsApp*.
- **Keyboard**: ArrowDown walks *Open Ramya's file → Book a session → Assign a
  plan → Open WhatsApp → Pause → Archive* and wraps. Escape closes. The confirm
  view takes focus on its first row (*Archive Ramya*) rather than dropping it on
  `<body>`.
- **Pause**: Ramya Rao *At risk · ₹10,500 due · 1 day* at position 1 → **Paused ·
  Paused 6 Sep · 6 sessions left** at position 9, menu closed. The date is
  `metadata.pausedAt`, and `mode` and `source` survived the write.
- **Resume**: the same row back to *At risk · ₹10,500 due · 1 day* at position 1.
  The suppressed tag was suppressed, not lost.
- **Archive**: confirm, then 24 rows → 23 with Ramya gone. Restored to her seeded
  state afterwards.
- **Message**: `window.open` stubbed to catch the URL rather than open a third
  party — `wa.me/919843034042?text=Hi Ramya, a quick reminder that ₹10,500 is
  still open…`, the payment template, not a check-in.
- **Assign a plan**: lands on `/clients/cli_022/program`.

`npx tsc --noEmit` clean. `npx eslint` on every file this pass touched clean —
`Clients.tsx`'s three warnings are all pre-existing and in code this pass did not
open (`aria-checked` on line 197, two unused vars). `sync-design --check` reports
both stylesheets up to date; only `app.css` was edited, which is where a delta
belongs. **`next build` NOT run**, per this file's note.

One thing the mock is left holding: the *Message* verification logged a real
nudge against Ramya Rao, so her row will say *Messaged just now* until the dev
server restarts and reseeds.

### Not done

- **There is still no *Archived* segment**, so archive remains one-way from this
  screen and the confirm is carrying that weight. The data is all there — the
  filter, the count and the endpoint — and the eighth segment is the pass that
  deletes the confirm.
- **The phone's `PhoneRow` has no menu at all**, so none of these four reach
  ≤900px. That is unchanged by this pass and is a real gap: the card row opens
  the file and nothing else.
- **`AttentionQueue.runVerb` still switches on `item.action`.** Untouched, and
  `lib/nudges/verbs.ts` already carries the argument for why.

## The toast deck — the confirm that survives its own navigation · 6 Sep 2026

The design system has shipped `.toast` / `.toasts` and a `web-components/ui/Toast.tsx`
since the 2026 pass, and **nothing had ever mounted one.** `BUSINESS-UX-HANDOFF.md`
said so in as many words — *"there is no toast system"* — and a grep for `<Toast`
outside the library came back empty. The component was a design artifact.

The gap it left is lopsided, and the sweep that found it is worth restating: across
~60 server actions, **failure has an inline sentence and success is silent.**
`BookPanel.tsx:407`, `PackLife.tsx:190`, `Team.tsx:302`, `NotesTab.tsx:229`,
`RecordPanel.tsx:206`, `Clients.tsx:656` all draw a `role="alert"`; the `ok` branch
closes a panel, calls `revalidatePath` and says nothing. That silence is **correct**
wherever the row is the receipt (`UIUX-SKILL.md:23`) and wrong wherever the row it
changed is off-screen, behind a closing panel, or on another route.

### Two motions, because there are two kinds of news

Ported from `motion.dev`'s `react-toast-stack` and `react-radix-toast`. Their source
is Motion+ gated, so the numbers were **read off the shipped chunks and the live
computed transforms** rather than guessed — and they are exact:

| | `notice` — the deck | `receipt` — the single fact |
| --- | --- | --- |
| enter | `y +60 → 0`, `scale .85 → 1` | `x +100 → 0` |
| exit | the same, reversed | `scale → .9` — **not** its entrance retraced |
| life | until dismissed | 5,000ms |
| gesture | none | right-swipe, 50px, `dragElastic .1` |
| depth `i` | `y −10i` · `scale 1−.06i` · `opacity 1−.2i` · `z 20−i` | shares it |
| drawn | 4; the 5th waits at `opacity 0` | — |
| spring | `stiffness 400, damping 30`, stagger `20ms × i` | shares it |

The asymmetry in the receipt's exit is the point: arriving from off-screen says *this
just happened somewhere else*, leaving by shrinking says *it is done*, and a card
that retraced its entrance would read as **undone**.

### It is CSS, and the spring is a `linear()` token

`package.json` has three runtime dependencies and none of them animate anything. A
toast library brings its own portal, stylesheet, z-index and opinion about what a
confirm looks like — four things this design system already has written down.

`--tx-ease-real-spring` is `spring(400, 30, 1)` — ζ = 0.75, ω₀ = 20 rad/s — sampled
at 21 points as a native `linear()`, with `--tx-t-spring: 520ms`. **It is not a new
default:** anything smaller than the deck keeps `--tx-ease`, and the reason this one
earns a curve of its own is that the deck is the only thing in the system where
several boxes move at once, each a beat behind the last — a bezier reshuffling four
cards reads as four things sliding rather than one stack settling.

**No ninth keyframe.** Both entrances are transitions with `@starting-style` supplying
the state they transition *from* — `.pgsheet`'s mechanism, for its reason — and the
exit cannot be a keyframe at all, because the element has to survive its own removal.
**`tx-rise` went out with the column it was written for**: it was the toast's whole
entrance, nothing else used it, and 10px on a 340px card was never a spring. The
vocabulary is SEVEN names now and eight is still the budget; the two comments that
cited `tx-rise` are corrected.

### `.toasts` stopped being a column

It was `flex-direction:column` with an 8px gap — four confirms meant four full-height
cards up the right edge, and by the fourth the trainer is reading a sidebar they did
not ask for. It is `height:0` with absolutely-positioned children sharing one origin
and `pointer-events:none` on the region, so the corner is a hit-testing hole and only
the cards in it are not.

**On a phone it is full-bleed and lifted clear of the tab bar** — `bottom: calc(var(--w-tabs,
20px) + 12px)`. `--w-tabs` is the shell's own token for that row, which is why the host is
mounted **inside `.app`** rather than in `layout.tsx` around `<AppShell>`: outside that
declaration the fallback applies and four confirms sit behind the navigation. Measured at
390×844: 366px wide, 12px gutters, **12px above `.tabs`**, zero overflow.

### Three things the stylesheet could not do, and they are all of `lib/toast/store.ts`

1. **A card has to survive its own removal.** Dismissing marks it `leaving`, the host
   renders it once more with `data-leaving`, and it is dropped after 560ms —
   `--tx-t-spring` plus a frame, because a card unmounted *on* the last frame of its
   own transition flickers.
2. **Depth is counted over LIVE cards only** (`depthOf`). A leaving card must not hold
   a slot; the deck closing over it as it goes is what makes the motion read as a
   stack settling rather than a gap appearing. Measured mid-exit: the leaving card at
   `scale .89 / y +45` while the survivor is already mid-spring from depth 1 to 0.
3. **A receipt has a deadline**, and the timer belongs with the state — a re-render
   must not restart it and an unmount must not leak it.

`MAX` is **5, not the four the deck draws**: the fifth is mounted at zero opacity so
it can fade *up* into the deck when the front card goes, and appearing is the thing
this component exists to stop. Over the cap the **oldest live card is dismissed rather
than spliced**, so it leaves the way every other card leaves.

`useToast()` **throws** outside the host rather than no-oping: a confirm that silently
does not appear is the exact failure the deck was built to fix, and it would only ever
be noticed in support.

### `?copied=1` and `.pg__flash` are gone

`CertifiedCard.tsx` pushed `/programs/{id}?copied=1`, the page read it back into a
`notice` prop, and `Builder.tsx:1170` painted a full-width green band above the board.
Three files and a query parameter to carry one sentence across one navigation — and
the band was `--tx-ok-soft` whatever it said, so `setFlash(result.message)` printed
**failures in the success colour**. The deck is above the router's children, so the
card raised on the shelf is still on screen when the builder paints. `searchParams` is
off that route entirely.

### The eight call sites, and the one that was deliberately left alone

| Action | Variant | Why it has no row |
| --- | --- | --- |
| `copyCertified` — *Use this* ×2 | notice | navigates into the builder |
| `duplicateTemplate` | notice | navigates to the copy |
| `createTemplate` | notice | the dialog closes on the navigation |
| `removeTemplate` | notice | navigates to `/programs` |
| `assignTemplate` | notice | **the row it wrote is a CLIENT's, on another route** |
| `copyTemplate` (team) | notice | the copy lands under `/programs`; this row is unchanged |
| `bookSession` | **receipt + Undo** | panel closes over the grid; `cancelSession` is a real inverse |
| `cancelSession` | **receipt**, no action | the block leaves and the panel goes with it |

`removeTemplate` gets **no Undo** and therefore no receipt: it has no inverse on the
wire, and a five-second window offering one would be a button the screen cannot
honour. `cancelSession` gets no Undo either — the confirm above it says in as many
words that this cannot be undone, and a card offering Undo five seconds later would
contradict the sentence the trainer just agreed to.

**The action always dismisses its own card**, in the host rather than at eight call
sites: every one of these is an Undo, and an Undo that leaves the confirm of the thing
it just undid on screen is a contradiction in the corner of the room.

**`AddClientFlow` was in the plan and is not wired.** Both its exits `router.push` to
the client's own file — the file *is* the row — so a card there is the redundant
confirm this design system argues against. Recorded rather than silently dropped.

**Still excluded, and each for a reason already written down:** `AttentionQueue`'s
`checkIn`/`wish` (`:47` — in place, in the row that changed), `NudgeButton`'s sent
state (`:171` — it holds a real WhatsApp link and must persist), pause/resume on the
roster (the tag flips in place), `SessionPanel`'s staged Save (`dirty` settles it —
the panel is the receipt), every `Builder` autosave, and every field error
(`UIUX-SKILL.md:163` — *a toast never carries a field error*).

### Checked by rendering, and it found two defects

Driven against the running dev server as real clicks and real drags, both themes, desk
and a 390×844 same-origin iframe.

| Where | What |
| --- | --- |
| `Bay` in `Toast.entry.tsx` | **`.bench` is a flex column**, so the bay was a flex ITEM and shrink-wrapped — to **zero**, because everything inside it is absolutely positioned. The cards took `width:100%` of nothing and rendered as a **30px ribbon of vertical text**. `width:100%` on the wrapper. Found by reading the rects back rather than from the screenshot, where a 30px column of ink still looks like *something*. |
| the same file | Two presses inside one tick both read `next` out of the render's closure, so both cards got **id 1** — duplicate React keys, and dismissing one took the other with it. A ref, read and bumped in one statement. The store never had this: its ids carry a random suffix. |

Verified: the depth arithmetic at `i` 0–4 matching the reference **to the digit**
(`scale 1/.94/.88/.82/.76`, `y 0/−10/−20/−30/−40`, `opacity 1/.8/.6/.4/`**`0`**, `z 20−i`,
delay `20ms × i`, `data-buried` + `aria-hidden` on the fifth); the `linear()` easing and
`0.52s` on the card; the exit sampled every 80ms — `scale → .845` overshooting and
settling to `.85`, `y → 61.7` settling to 60, `opacity → 0`, unmounted at 560ms; a
140px swipe dismissing the receipt and a 30px one springing back to `--tx-dx: 0px`;
a 180px drag across a **notice** dismissing nothing; the 5,000ms timer firing on the
real booking; and the card **surviving the navigation** from `/programs/certified` into
the builder with **zero `.pg__flash`** in the document.

Contrast, both themes: title 15.84 / 18.58, body 5.63 / 6.17, and the Undo action
stepping to `#4F6B0A` on light — 6.10:1, the stylesheet's opening rule holding.

**Reduced motion**, with the nine `prefers-reduced-motion` blocks rewritten in place
(M4's method, so every equal-specificity tie resolves as it does on a device): the
**depth transform survives** — `scale .88 / y −20 / opacity .6` at `--i:2` — and only
the travel between states goes. That is deliberate: the depth pose is not decoration,
it is how four confirms fit where one card does.

`sync-design --check` up to date, `tsc --noEmit` clean, `eslint` clean on every file
this pass touched (`Team.tsx`'s five errors are the pre-existing ones this file already
records — 267, 1370, 1389×2, 1560 — and none is in the 21 lines added there), the
background-shorthand gate empty, console clean on every route driven. **`next build`
NOT run**, per this file's own note. Seed data restored: the copied template deleted
and the booked session cancelled, with the week back to **42 booked**.

### Not done

- **Tier 3, the Undo family.** `deleteSet` — whose `lib/log/actions.ts:345` already
  says *"the toast's Undo needs something to put back"* and whose tombstone has been
  waiting since it was written — plus `deleteNote`, `archiveClient`, `markDone` and
  `markNoShow`. Each needs its inverse decided, not just a card.
- **Tier 2's panel closes**: `recordPayment`, `assignPackage`/`renewPack`/`extendPack`,
  `inviteMember`/`revokeInvite`/`reassignClient`, `sendReminder`, `closeLog`.
- **`shareCard` / `copyCard` / `downloadCard`** still use `ClientReport.tsx:193`'s
  transient inline string.
- **No `role="log"` on the region.** Each card carries its own `role="status"` /
  `role="alert"`, which is what the tone mapping is for; whether a deck of four wants
  one live region above them all rather than four is worth asking a screen-reader user
  before changing.
- **No real device.** The swipe was driven as a mouse drag, which is the same
  `pointerdown` / `pointermove` / `pointerup` path — it does not settle whether 50px is
  the right threshold for a thumb on a gym floor.

## The client portal — the other half of the product, in the same project · 7 Sep 2026

`InclineYou-Client-Portal-Spec.md`, items 1–6 of its build order. This file has
said since its first line that **"the gym admin console and the client portal
ship in this same project, which is why this is Next rather than a static
bundle"**, and `/me/today` has been a `NotBuilt` stub for as long as that
sentence has been there. It is four screens and a flow now.

| | |
| --- | --- |
| the routes | `app/(portal)/me/` — `today` · `progress` · `plan` · `account` · `workout/[workoutId]` |
| the shell | `components/portal/PortalShell.tsx` — the same `Rail` and `TabBar`, four destinations |
| the model | `lib/portal/` — `api.ts`, `guard.ts`, `home.ts`, `progress.ts`, `plan.ts`, `visibility.ts`, `actions.ts` |
| the wire | `mock/portal.ts` — every route under `/v1/me/*` |
| the seed | `mock/seed.ts`'s last section, plus four tables in `mock/types.ts` |
| the sign-in | **unchanged.** `destinationFor` has routed a client token to `/me/today` since sign-in was built |

**The login number is `9840137911` — Karthik Menon (`cli_001`).** OTP `123456`.
Fourteen months in, three mornings a week, a live session pinned to now − 35 min
with an open log against it, so the portal opens on its most interesting state
rather than its emptiest. `9840275822` (Divya Krishnan) is the second cast
member and is the one that reaches *Start* and the pre-workout overview;
`9840551644` (Meera Reddy, Tue/Fri) is a rest day.

### Almost nothing about the auth half had to change

Worth stating first, because it is the reason this pass is four screens rather
than a project: **the plumbing was already here and already argued for.**
`personaFor` (`mock/db.ts`) has resolved a client's number to
`persona: 'client'` since the mock was written; `verifyCode` mints the token;
`destinationFor` sends it to `/me/today`; `app/page.tsx` forks on the role;
`/sign-in/role` resolves a single roster and deliberately writes nothing,
because *"resolving an unambiguous roster is the PORTAL's job"*. Every one of
those sentences is in this file above, written before there was a portal to
honour them. Two things follow:

- **`inclineyou_client` is a request parameter, not a permission.** `lib/auth/session.ts`
  promises that tampering with that cookie "buys nothing", and `lib/portal/api.ts`
  is the half of the promise that lives on the request: every `/v1/me/*` call
  carries `clientId`, and `resolve()` in `mock/portal.ts` re-derives the real
  answer from the token's PHONE and answers 403 on a mismatch. That mirrors
  `ClientSyncController`, which re-checks the same parameter on every request.
- **A missing cookie is the common case**, not an error — see the `/sign-in/role`
  note above — so every read treats it as optional and the server resolves the
  single roster itself.

### `/v1/me/*` and not `/v1/clients/{id}`

The prefix is the audience, and it is the one decision in `mock/portal.ts` worth
reading twice. `/v1/clients/{id}` is the TRAINER's route: it answers about
somebody on your roster and its guard is *is this client yours*. A client
calling it needs a second, opposite guard on the same path — *is this client
YOU* — and the day those two branches sit in one handler is the day one of them
wins for the wrong caller. `lib/clients/client-api.ts` and `lib/portal/api.ts`
are two fetchers for the same reason.

**Reads are scoped, with one deliberate exception.** `lib/today/api.ts` refuses
`sync/pull` on a built screen and makes nine narrow requests instead; every
portal read is that shape, except `GET /v1/me/workouts/{id}`, which returns the
movements, their targets, their cues, their clips, what is logged and what was
logged last time in one response. That is not the mistake `pull()` is refused
for — `pull()` returns the whole ACCOUNT to draw one screen and this returns one
workout's own rows — and the caller is a client standing at a rack on a gym's
wifi, where five round trips to draw one screen is the difference between
logging a set and giving up.

**`GET /v1/me/sets` is unwindowed**, and `lib/reports/build.ts`'s rule is why:
a personal best is a claim about the whole history, so "a window is what
produced the wrong answer." Progress' headline is *Squat 40kg → 62.5kg*, which
is a statement about a beginning, and the beginning is older than any window a
screen would pick.

### Four tables the trainer half never needed

`mock/types.ts` carries the argument for each; the short version is that the
portal asks four questions the trainer's book cannot answer from its own rows.

- **`client_message`** — a line from the trainer TO one client, and it is
  emphatically **not** a `NoteRow`. A note is the trainer's private file on
  somebody, candid *because* it is not addressed to anybody; this has an author
  who is named on the client's screen, is written to be read, and has a `readAt`.
- **`workout_feedback`** — §2's three taps. Its own row rather than a column on
  `WorkoutRow` because it is the client's answer and not the trainer's record:
  written from `/me/*`, arriving after `endedAt`, and the one field on this
  surface the trainer cannot edit.
- **`milestone`** — stored rather than derived, because a milestone's value is
  that it fired ON a day. The RULE lives in the seed (which back-fills) and in
  the finish handler (the only thing that can mint a new one).
- **`client_prefs`** — the client's own settings, which the trainer never sees.
  One row per client rather than a blob on `ClientRow`, because `ClientRow` is a
  row the TRAINER writes: a client hiding weight from their own progress screen
  must not be a field on the record their trainer edits, or the next roster save
  silently un-hides it.

Plus `Db.clips`, a map rather than a column on `ExerciseRow`: the 77 rows in
`catalog.ts` are the GLOBAL library and a clip belongs to whoever shot it. The
absence of a key is a real product state and the portal draws it.

**And two fields that already existed and had never been written.**
`program_exercise.notes` is the trainer's cue for THIS client — §2 calls it the
place "trainer presence lives" — and `program_exercise.alt_exercise_id` is the
approved swap. `blueprintOf` set both to `null` on every row, correctly, because
a blueprint is written for nobody in particular. They are attached at the
program-COPY step now, which is `ProgramRow`'s own argument about labels and
weeks arriving one field further down.

### The four destinations, and where they differ from the drawn frame

`webapp-client-portal.html` draws *Today · My progress · Sessions · Payments*
and opens with the right sentence — *"A client's web app could show everything
the trainer sees. It shows four things."* The spec is newer and asks for *Home ·
Progress · Plan · Me*, and it is followed. `nav.tsx`'s `CLIENT_PRIMARY` carries
the table; the substance of it:

- **Sessions → Plan.** The frame's Sessions is a HISTORY; §4 asks for what is
  coming, which is a different question and the anxious one. The history is on
  Progress, where it is evidence.
- **Payments folds into Me.** §5 lists *My package* as one of five rows on that
  screen, and a whole destination for a balance a client reads monthly is the
  fifth slot the spec's own "four tabs, no more" rule refuses.
- **The route is still `/me/today`** and the label is *Home*. Renaming it would
  have touched `destinationFor`, `app/page.tsx` and `/sign-in/role` for a word.

**The rail, the tab bar and the account menu are the trainer's components with a
destination list as a parameter.** Forking them was the obvious move and it is
exactly what `nav.tsx` exists to prevent one level up: two rails is two places
`.rail__i`'s markup, its `aria-current`, its collapsed tooltip and its badge
live, and the second one drifts. The drawn frame agrees — its own note reads
*"Same four. The client role never needed a drawer."*

**And the rail collapses on this half too, which reverses what `PortalShell`
used to say.** The old note refused `.app--rail-min` here: a trainer trades
navigation for canvas on a week of a diary, and four rows beside a 920px column
is not that trade. Two things were wrong with it. `.portal` centring its column
is an argument FOR the collapse rather than against — the column keeps its cap
and re-centres in a wider frame, so the 184px becomes air around what is being
read, not a shove to the left. And the collapse is a CHOICE (§05, remembered per
device); a control that exists on one half of the product and not the other is
not a smaller decision, it is the same control missing.

It cost the class, two props and the `[` binding, and **no CSS at all** — the
64px group, the tooltips and the interpolated grid track are already generic to
`.app--rail-min`, and `Rail` already draws them for `CLIENT_PRIMARY`'s four rows.
Two things moved in `railCollapse.ts` to pay for it: the storage key is a
parameter (`TRAINER_RAIL_KEY` · `PORTAL_RAIL_KEY` — one browser can hold both
halves since duality came back, and the two rails are not one choice), which
means the module's cache had to become a `Map` keyed the same way rather than a
single `cached` boolean that would hand one rail the other's answer. The `[`
handler is now `useRailCollapseShortcut`, shared, so the field-and-caret guard
list lives once instead of in both shells.

**The client's bar has no `+` and no *More*.** A trainer CREATES — clients,
sessions, exercises, payments — and a client creates exactly one thing, a
workout, started from the one button Home is arranged around. `NavBar.tsx` on
the phone reached this first: it draws no + for the client role at all. Four
labelled slots and no action fit 320px, which is the "four, no more" rule paying
for itself a second time.

**`PortalShell` is a second composition rather than a flag on `AppShell`**,
because the client role does not have the three things that shell mounts:
`PaletteHost` (⌘K over a roster a client does not have), `NotificationsHost`
(item 8 of the build order, not built — and `TopBar` drops the bell on its own
when there is no host, which is what makes leaving it out a working screen
rather than a dead glyph), and `WorkspaceHost` (a client's two rosters are
arrangements, not tenants). `ToastHost` is the one of the four that transfers
unchanged.

### The three rules the spec is most insistent about, and where each one lives

**1 · Never shame.** §1: *"No red 'you missed 3 workouts.' Guilt-based design
produces uninstalls, not attendance."*

`WeekDots` is the component this is built into rather than remembered around: a
`miss` cell is drawn at exactly the weight of a `rest` cell — hollow, on the
canvas, reading as *nothing happened here*, which is true — and `--tx-danger`
appears nowhere in its block. `buildHero` produces **no fourth hero** for a
missed session, because a state whose whole content is an absence would be the
accusation the rule forbids dressed as information; what a missed yesterday
changes is one line of copy on the rest-day hero. And the finish confirm says
*"A short session counts."*

The same rule chose the **count over a streak** — §1's own reasoning is that
"streaks punish one bad week by erasing months of effort" — so the figure is
*3 of 4*, it resets on Monday, and there is nothing in the component to break.
The DENOMINATOR is the arrangement (`sessionsPerWeek`) and not the diary, so a
trainer's cancellation cannot silently shrink the target.

**2 · Weight carries no tone, anywhere.** §3 is four separate constraints and
each one is a branch:

| §3 asks | where it lives |
| --- | --- |
| smoothed, never raw | `TrendChart` takes the RAW readings and there is no prop that makes it draw them as a line — the raw series becomes a band |
| the prose must agree with the chart | `smooth()` is exported, and `buildWeight` reads the same smoothed endpoints the line is drawn from |
| hideable | `hideWeight` removes it from the summary, the chart list AND Home's quick log. Absent, never greyed |
| never celebrate a rate | there is no kg-per-week figure in `lib/portal/progress.ts` and there must never be one — `WEIGHT_HAS_NO_TONE` states it |
| something else always visible | `buildSummary` puts strength, consistency and the tape in front of weight *by construction* |

`WEIGHT_HAS_NO_TONE` extends to the tape as well, which is worth knowing before
somebody adds a green arrow to it: a waist going up on a client putting on
muscle is the plan working, the same number on a client cutting is not, and this
product does not hold the field that tells them apart — `client.goal` is the
trainer's free text.

**3 · Make the trainer present.** The cue is the highest-value thing on an
exercise card and it is labelled apart from the library's generic `formCues`,
because a client who reads *"keep your chest up"* and believes their trainer
wrote it for them has been misled about the one thing this product sells.
Everything that leaves the app is a `wa.me` link that **logs nothing** —
`Header.tsx` on the trainer half already made that call and stated it: routing a
conversation through `POST /v1/clients/{id}/nudge` would spend the client's
weekly reminder on *are we on for Tuesday* and quiet the overdue reminder three
days later.

### The workout flow, and the two refusals in it

Three stages, and **two of the three boundaries are the server's**: `pre` until
*Begin* is pressed (local state — whether somebody has READ the overview is a
fact about a moment), `run` while `endedAt` is null, `done` after. That is what
makes it survivable: a client who locks their phone between sets, or opens the
link on a laptop, lands back in `run` on the same workout with the same sets in
it, because the stage is a fact about the data.

**Sets save one at a time, on the tick** — not on a Next and not on a Finish. A
workout is the one screen in this product somebody puts down mid-use, and a
batch that flushed at the end would lose a session to a locked screen. That is
why `SetRows` grew a per-row commit.

**One movement at a time**, where the trainer's console draws every exercise in
a column with a list rail beside it. A trainer is running somebody else's
session and reading ahead; a client is DOING it, and §2's user "hired a trainer
*because* they don't know what they're doing" — a screen showing six movements
at once asks them to decide which is next, a decision the program already made.

Two refusals, and the second was found by driving it:

- **A swap must be the trainer's.** §2 says *"offer trainer-approved
  alternatives rather than letting them skip"*, and the approval lives on
  `program_exercise.alt_exercise_id`. Anything else is a 422 with a sentence,
  and where the trainer named none there is **no control at all** — a button
  that exists to be refused is worse than a line saying who to ask.
- **A movement you have started cannot be swapped.** Found by rendering, and
  both other answers are wrong: re-pointing the logged sets puts reps of a lat
  pulldown into the client's pull-up history, and leaving them against the old
  movement ORPHANS them — the view lists exercises by the row's current id, so a
  client who logged a set, swapped, and watched that set disappear has been shown
  their own work being deleted. Refusing costs them nothing, because §2's swap is
  for a problem that happens BEFORE the first set: nobody discovers the machine
  is taken on set three.

**The feedback is optional and the log closes without it.** Making it mandatory
means a log that cannot be closed, and an unclosed log is the `log-open` band on
the TRAINER's queue: a nag for the trainer produced by a question the client
ignored.

**Finishing marks the session done and decrements the pack** through the same
`packDelta` field the trainer's console sets, so the two halves cannot disagree
with the money book. Verified end to end: 8 of 12 → **7 of 12**.

### §5 is built in full, and the delete really deletes

All four rights. The **visibility screen** is the one §5 says most products skip;
`lib/portal/visibility.ts` derives each row from the ROUTE or TABLE it is a
promise about, and that `sources` field is not rendered — it exists so somebody
adding a reader for `body_metric` finds this file by grepping the table, where
they would never find a paragraph of prose.

The `no` list is the half that does the work, and three of its four entries are
facts about the architecture rather than policy: there is no health-platform
integration to grant, client rows are per trainer so two trainers cannot see
each other, and nutrition, photos and wearables are all out of scope.

One row on that screen is about the TRAINER's privacy — `TRAINER_KEEPS_NOTES` —
because a client reading *what can my trainer see* will assume the answer is
symmetrical and it is not.

**The export is generated from the same rows the screens read**, because an
export that quietly omits a table is worse than none: it is a claim of
completeness. It withholds exactly two things and both are named — the trainer's
private notes, and `collectedBy`/`gymShareAmount`, which are the trainer's
arrangement with their gym. The payment fields are listed one by one rather than
spread-minus-two, so a column added to `PaymentRow` tomorrow cannot silently
join the export.

**`DELETE /v1/me` removes the rows.** §5 asks for "a real, working flow, not an
email address", and a delete that answered 200 and left the book untouched would
make the one screen built to be trusted the one screen that lies. Three things
about it: the MEMBERSHIP goes and not the human (a second roster the same phone
is on is untouched); the trainer's **payments stay with `clientId` nulled**,
because that is their accounting record and it outlives a client's account; and
the typed-number confirmation is checked **on the server as well as in the
form**, because a confirmation that lives only in a client component is one a
mis-wired button skips.

Verified against the book: 24 clients → 23, the token then answering 403
`NOT_A_CLIENT`, and two orphaned payment rows surviving in the trainer's ledger.

### Three components were added to the design system, and two were extended

The user's instruction for this pass was that only design-system components may
be used, and that anything new goes INTO the design system. Each addition was
checked against what already existed first, which is the test `registry.ts`
exists to enforce.

| | why nothing already did it |
| --- | --- |
| `c-clip` · `ClipThumb` · `.clip` | the catalogue had **no component that drew a piece of media** — the nearest thing to a video was `Avatar`. §2 calls the demo clip "non-negotiable for this audience" |
| `c-weekdots` · `WeekDots` · `.wkd` | `.wkp` in app.css is the TRAINER's week (seven columns of other people's sessions, sized for a desk) and `.spark` is 24px of bars with no day labels |
| `c-trend` · `TrendChart` · `.trend` | `.spark` draws bars, `.vb` draws a column set, and neither can draw a line at all — §3 requires a smoothed trend and forbids the raw one |

**`SetRows` was extended rather than copied, and that entry had never been
used.** `c-setrow` has been in the catalogue since the beginning and **nothing in
the product imported it**: the trainer's console has its own `SetGrid`, so the
file was a specimen the library rendered and the app did not — the exact
condition `registry.ts` tracks. It has two modes now: `onChange` absent is the
read-only specimen, byte-identical to before; present makes the inputs
controlled, and `onCommit` adds the tick column. `showRpe` defaults true so the
library keeps its five columns, and the portal passes false — a client does not
judge RPE, which `webapp.css`'s own note calls "judged and typed once, not
nudged".

**`ModalHost` joins the `c-modal` family**, and its absence had a real cost:
`Modal` is deliberately "the surface and its semantics, not a dialog manager",
so **every modal in the product hand-writes its own scrim, its own `keydown`
listener and its own focus handling** — `SwapModal.tsx`, `AddClientFlow.tsx` and
the rest. Three copies of a behaviour, and the third one to be written is the
one that forgets the Escape key. One family, two parts: nothing should render
one without the other outside a bench.

### Twelve defects found by rendering, and the gates were green on all of them

`tsc`, `eslint` and the shorthand grep passed at the moment each of these was
live. Four are in the three new components, which is the argument for the
convention rather than against it.

| Where | What |
| --- | --- |
| `.trend svg` | Was `height:auto`, and a CSS `height` outranks the `height` ATTRIBUTE the component sets — so the viewBox's 320:130 ratio took over and a 130px chart rendered **374px tall** in the portal's 920px cap. An explicit height is what `preserveAspectRatio="none"` is FOR: the width stretches, the height does not, and a monotonic line stays monotonic. |
| `.trend__p` | An `r="4"` `<circle>` under that same non-uniform stretch is a **22 × 8.6 ELLIPSE** — x scales 2.77 and y scales 1.08. `vector-effect` fixes a stroke and cannot fix a radius. It is an HTML element positioned in percentages now, which is exact under any stretch. |
| `.trend__p`, again | Then the percentages resolved against `.trend`, whose box includes the axis captions — so `top:50%` was 50% of 162px instead of 140 and a mid-range point sat **20.5px below its own line**. Zero error at the top of the box and worst exactly in the middle, which is why three charts looked right and the weight one did not. `.trend__plot` wraps the svg alone. **Found by sampling the rendered path with `getPointAtLength` and measuring to the dot's centre** — at 5px it reads as a dot on a line. |
| the strength mark | The dot marked the LAST reading while the headline named the BEST, on a bench curve that peaked in August and closed on a deload. A mark and a sentence disagreeing about one series is worse than either alone: the client trusts the picture and concludes the number is wrong. `markIndex` is a parameter now, and `'peak'` resolves against the SMOOTHED line rather than the raw readings — a raw index landed half-way up a deadlift curve that was still rising. |
| `buildStrength`'s order | Ranked purely by proportion, the summary led with **Hammer Curl 17.5 → 20** and **Lateral Raise 22.5 → 25**, with *Back Squat at 60 kg* in the milestone row directly underneath. The report's proportional rule is about which CLIENT's gain to lead with and does not transfer whole; §3 asks for the squat. The lifts somebody says out loud come first, from the same list the milestone rule uses. |
| `mock/seed.ts`'s `altFor` | Matched on `muscleGroup` + pattern, so *Triceps Pushdown* and *Barbell Curl* are both `Arms` + `Isolation` on different kit — and the generator offered a **bicep curl as the approved substitute for a tricep pushdown**. A trainer would never sign that off, and a swap list a client cannot trust is worse than none: they skip the movement, which is what the feature exists to prevent. Matched on `target` now. |
| four `.tbl`s | §11 gives every cell `white-space:nowrap` and a 44px height, which is right for the roster and wrong for anything with prose in it. Putting the trainer's cue in a cell made the name column **909px** and the table 1113 inside a 920px portal. Three more of the same: the notes card at **907px**, and the two visibility lists at 688 and 820 inside a 350px card at 390px. A `nowrap` cell does not look broken, it looks wide — every one was found by measuring. |
| Plan's *Coming up* | Three nowrap columns need **475px** and the card is 350 on a phone. `ListRow` instead: these are three facts about one appointment, read one at a time, and it needs no media query at either width because `.lrow__t`/`.lrow__s` ellipsise. |
| the notify rows | `.kv` is `flex-wrap:nowrap` with an 80px `min-width` key and a nowrap value — right for a key and a figure, and it cannot hold a label, a sentence and a switch: **227px of content in a 147px slot**. |
| `.switch` | 38 × 22, and 22 is two pixels under WCAG 2.5.8 — with FIVE of them on one phone screen on `/me/account`. A `min-height` is the wrong instrument (the thumb is positioned against the track's height, so growing the box slides it off centre); hit-slop instead, which costs zero layout. |
| the Plan day thumbs | Drew a play disc over a **`disabled` button**, because a server component could not hand `ClipThumb` an `onPlay`. That is the dead affordance `ClipThumb`'s own docstring refuses for the unfilmed state, arriving from the other direction — and `DayColumn`'s inert grip is the same defect this file has already fixed once. The fix is not to hide the disc: §2's clip is most useful the night before, so Plan opens it too, through the shared `HowTo`. |
| `Home.tsx` | `Date.now()` during render — the purity rule, and also the clock disagreement this file records for `useNow`: a relative stamp computed in the browser against a page rendered on the server can say *in 3 minutes* about something four minutes old. The server's instant is threaded from the guard. |

**And the project's own guard caught five more that no amount of looking
would.** `npm run check:components` reported hand-written design-system markup
ADDED in five files — four `.tbl`s and one `.crumbs` — with the message *"a new
component belongs in the design system, not at a call-site."* All five are
`<Table>`/`<Row>` and `<Crumbs>` now, which also gained them the hidden captions
and the `scope` attributes those components exist to guarantee. **Run that
script; it sees what a screenshot cannot.**

### Checked by rendering

The real components against the running dev server, signed in as a real client,
every behaviour driven as a real click. Same-origin iframes for the phone
widths, per this file's own note that the window will not resize.

**Driven end to end:** sign-out → sign-in as `9840137911` → the portal; a set
logged (meter 40% → 45%, tick green, rest started); the rest clock ticking
(2:11 → 2:09) and its bar draining (99.3% → 86%); the rest **run out** to
`.rst2--over` with *"Rest over. Set 3 of barbell curl is up."* and its live
region; the finish confirm; the effort answer saved with a *Sent* tag; the pack
decrementing 8 → 7 and the hero flipping to *done*; the clip modal from both
doors with Escape closing it and focus returning to the trigger; the weight
switch removing weight from the summary, the chart AND Home's quick log, and
restoring it; the export intercepted and parsed (**165KB, 13 sections, 430
sets, zero gym fields, no trainer notes**); the delete guard refusing a wrong
number and accepting both `9840137911` and `+91 98401 37911`; and — as a second
client, `9840275822` — *Start*, the pre-workout overview, and *Begin* landing on
a grid **pre-filled with last time's exact per-set numbers** (62.5 × 10, 65 ×
10, 67.5 × 8).

**Measured:** zero horizontal overflow, zero elements past the body and zero
clipped text on all five routes at **390px and 1440px**; the phone bar 390 × 53
with four 98 × 52 targets and `aria-current` on one; `.portal` capping at 920
from 1280 up and shrinking cleanly to 590 at 901; the rail/bar swap at 900; and
every chart mark within **0.6px** of its own line. Light theme: the trend line
strokes `#4F6B0A` at **6.1:1** on white while the dot keeps the lime as a fill —
which is the stylesheet's opening rule holding, and the defect the design frame
itself has.

`npx tsc --noEmit`, `npx eslint`, `npm run check:design`, `npm run
check:components` and the background-shorthand grep are all clean. Console clean
on every route. **`next build` was NOT run**, per this file's own note that it
writes `.next/` under a running dev server and produces a screen that renders
the previous build intermittently.

One trap for whoever verifies this next, on top of the ones this file already
records: **a programmatic `.click()` does not move focus**, so `ModalHost`'s
focus-return measured as `BODY` and looked broken. Call `.focus()` first, the
way a pointer click does. And React's controlled inputs ignore a plain
`el.value = x` — use the native setter (`Object.getOwnPropertyDescriptor(
HTMLInputElement.prototype, 'value').set`), or the delete confirmation appears
not to validate.

### Not done, and none of it is an oversight

- **Items 7 and 8 of the build order** — the shareable progress card, and the
  client notification set. Both were scoped out of this pass deliberately. The
  card is a PNG job the trainer half already solved once in
  `lib/reports/card-image.ts` and is largely reusable; the notification
  *preferences* ARE built (four categories, `client_prefs.notify`), and what is
  missing is anything that sends. `TopBar` drops the bell on its own until a
  `NotificationsHost` is mounted here.
- **Offline and the PWA.** §"Architecture notes" asks for an offline-first
  workout flow and a PWA; this half is **online-only** by the decision at the
  top of this file, and that was confirmed for the portal rather than assumed.
  So there is no local set queue, no service worker and no manifest, and the
  divergence from the spec is recorded here rather than hidden.
- **There is no video file anywhere.** `Db.clips` models the FACT of a clip — a
  length in seconds, on the movements a trainer would film first — and `HowTo`
  says so in as many words rather than showing a broken `<video>`. The poster,
  the duration and the unfilmed state are all real; the file is not.
- **A dropped lift has no name on Progress.** `getPortalSets` returns
  `exerciseId` only and the names come off the program, so a movement logged for
  months and then taken off the plan reads as *That movement*. Fixing it properly
  is `GET /v1/exercises?ids=`, a real request for a rare row, and the honest
  trade is to leave the gap visible until somebody meets it.
- **`buildWeek` counts a session in progress as trained.** A client mid-session
  is at the gym, which is the reading `last attended` already takes — but it does
  mean the week's count moves at the START of a session rather than the end.
  Worth a trainer's opinion.
- **No real device.** The phone widths are same-origin iframes in a desktop
  Chrome, so `pointer:coarse` does not match: the `.switch` hit-slop was checked
  by reading the cascade and confirming no change on a mouse. M4's method in
  `SESSION-VIEW-UX-HANDOFF.md` — rewriting the coarse conditions in place — is
  how to settle it without a handset.

## The client portal's Home, enhanced — the trainer half's components, and five defects · 7 Sep 2026

The brief: *fix all frontend UI/UX issues; the client portal should look similar
to the trainer portal in terms of UI components and design; enhance the
components; first focus on the home page, do competitor analysis and see how we
can enhance this page.*

So this pass is `/me/today` only, and it is two halves — the defects rendering
found on a screen this file recorded as verified, and three blocks the survey
said every client home has and this one did not.

### What other client portals lead with, and the two things this had none of

| Product | What its client home opens on |
| --- | --- |
| **ABC Trainerize** (the 2025 app) | greeted by name; **Things to Do Today** — the day's calendar as a checklist; a **progress row** of bodyweight, body fat and resting heart rate "with the latest entries visible and tappable to view graphs"; **personal bests and unlocked badges** below |
| **Everfit** | a high-contrast mobile-first dashboard, modular engagement blocks, challenges and leaderboards |
| **TrueCoach** | fewer things done well — the workout is the centrepiece |

Five blocks, and this screen had three of them and had them better: the greeting
is `.ph`'s, *what to do today* is the hero — and it is a real appointment with a
named person rather than a checklist — and *the coach, present* is the note,
which is the differentiator and which none of the three has an equivalent of.

**The two that were missing were figures and recognition.** There was no figure
anywhere on Home, so *how is it going* was a tab away; and this product MINTS
milestones — `milestone`, back-filled by the seed and minted by the finish
handler — and drew them only on Progress, which is the screen a client opens on
purpose rather than by habit.

**And one from our own spec rather than theirs: what is coming.** `nav.tsx`'s
table says Sessions became Plan because *"§4 asks for what is coming, which is a
different question and the anxious one"* — and Home then said nothing about
tomorrow at all, so on a rest day, or after today's session was in the book, the
answer to *when do I see my trainer next* was a navigation.

**The one thing every competitor has that this still refuses is a streak.** §1's
reasoning is unchanged and is the reason the foot's attendance tile is over
ninety days: a rate over a long window cannot be broken by one bad week, and
*"streaks punish one bad week by erasing months of effort"*.

### One component added to the design system, and one extended

The standing rule for this project — only design-system components, and anything
new goes INTO the design system first.

| | why nothing already did it |
| --- | --- |
| `c-coachnote` · `CoachNote` · `.cnote` | the note §1 calls *"the single highest-value element on the screen"* was assembled at the call-site from a `.row.row--top`, an `<Avatar>` and **three inline style declarations on the quote**. `check-components.mjs` could not see it, because there was no class for the check to own — the gap its own header calls "a brand-new component invented at a call-site". `Message` is the app in its own voice, `Why` is a rationale callout and `Toast` is a receipt; none of the three is somebody else's words, attributed |
| `Stat` gained **`href`** and `.stat--link` | the trainer's `Glance` has hand-written `<Link className="stat">` since it shipped, and it had to reset the figure to `--tx-ink` in `app.css` because §01's base rule paints every anchor `--tx-accent-text`. Two screens writing an anchor with a component's class on it is the drift the catalogue exists to stop, so it is a prop — and the reset belongs to the component. `color` is on the ROOT, so `--acc`/`--warn`/`--danger` still win for a toned tile |

`Stats` also gained `className`, which is the hook the four existing narrow rungs
(`.cfstats`, `.cfprog`, `.rptstats`, `.mnystats`) each had to hand-write a
`.stats` div for.

### What the screen is now, and where each insertion went

Hero → note → **week | weigh-in** → *Coming up* → package → **the figures** →
the promise. §1's order is intact and both insertions are siblings of what they
belong beside: *Coming up* is a fact about the diary and sits next to the week,
and the figures are at the FOOT, which is the trainer's own position for them and
`Today.tsx`'s own argument — *"what you check after the work, not what greets you
before it."*

- **the hero gained its `band`**, which `HeroCard` has had since it was extracted
  and the client's hero never passed. `buildHero` returns the sentence and the
  tone and the CALL-SITE picks the glyph, because a model file holds no JSX. Three
  of the four heroes get §4's arc — *Week 5 of 12 · Push Pull Legs*, the one fact
  about the plan that was nowhere on Home — and the fourth gets the one `acc` band
  in the file: *8 sets in already — pick up where you left off*, which is the
  question *Carry on* raises and could not answer. `warn` is in the type and
  unused, and `danger` is not in the type: a band scolding a client for a session
  they know they missed is the accusation §1 forbids.
- **the pack gained a `Meter`**, which is the portal's own idiom twice over
  (`/me/plan`'s arc card, the workout flow's set counter). It fills with what is
  LEFT rather than with what is spent — the opposite direction from those two, and
  deliberately, because the line directly above it reads *8 of 12 sessions left*
  and a bar disagreeing with its own sentence is the defect this file records for
  the strength mark on Progress.
- **the *Coming up* row is a `ListRow`**, which is this file's own recorded fix
  for the identical row on Plan: three `nowrap` columns need 475px and the card is
  350 on a phone. It is not a link — `/sessions/:id` is the TRAINER's screen — and
  it is ABSENT when nothing is booked, because Plan's *Nothing in the diary yet*
  is right on a screen somebody opened to look at the diary and would be the home
  screen apologising for it to a client who cannot book anyway.
- **the three tiles are linked**, which is Trainerize's own call for its own
  reason: a figure a client cannot open is one they have to take on trust.
- **the milestone is ONE `Tag` with a date**, because §"What to cut" caps the
  whole idea — *"gamification beyond simple milestones — badges wear off in two
  weeks"* — and Progress' row of six is the history. Nothing at all for a client
  who has not reached one, which is the never-shame rule arriving as a
  compliment's absence rather than as a card explaining that none has fired.

### Seven requests, and the read that is deliberately not the eighth

`getPortalWorkouts` and `getPortalMilestones` join the five, in the same
`Promise.all`, so the page costs one round trip's latency rather than seven. One
windowed session read now serves the hero, the week, *Coming up* AND the
attendance figure — `PORTAL_LOOKBACK_DAYS` is `CONSISTENCY_DAYS` exactly, which
is what lets Home call **`buildConsistency`** rather than deriving attendance a
second time: two functions answering *how often did I turn up* is how one ends up
a point off the other on two screens a client can put side by side.

`getPortalSets` is **not** here and is the obvious eighth: it is unwindowed by
design and it is the largest response on this half. A figure worth that is a
figure that belongs on Progress.

### Five defects, and `tsc`, `eslint` and both project guards were green on all five

| Where | What |
| --- | --- |
| `.wkd` | **`.wkd__c` is `width:100%` on an `aspect-ratio:1`, so the CELL SIZE was a function of whatever box the row was dropped into and nothing stopped it.** The library specimen wraps it at 300px and gets 37px cells, which is what it was drawn at; Home puts it in half of `.grid2`, which is 454px on a 1536px laptop, and the same seven cells rendered **55 × 55** — and in a full-width portal card they would be **120 × 120**, seven empty squares of ink for seven bits of information. Capped on the ROW at 330px and not on the cell: capping the cell leaves `.wkd__d`'s `flex:1` columns at full width with a small square centred in each, which spreads the week out instead of drawing it as a strip. 42px cells now, which is the phone's own size — a component sized for a thumb does not get bigger on a desk, it just stops |
| `blockquote` | **§02's reset is `h1,h2,h3,h4,h5,p,ul,ol,figure,dl,dd,table{margin:0}` and `blockquote` was not in it.** `CoachNote` is the product's first one, so it kept the UA's `margin:1em 40px` — and the FORTY is the half that bites: the quote rendered **40px in from the avatar beside it**, in a card whose whole point is that the trainer's face and their words are one object, and the card measured 74px instead of 45. Added to the reset rather than zeroed on the class, because it is a gap in the reset and the next `<blockquote>` should not rediscover it |
| the `.ph` subtitle | It read `hero.kicker === 'Today' ? hero.headline : hero.kicker` — so on the commonest state it printed *Today with Arun* sixty pixels above a card whose first line is *TODAY WITH ARUN*, and on the others printed *Rest day* or *Upper A* directly above the same string at 62px. `.ph--today`'s rule is written about exactly this ("the date is said twice … the most expensive 60px on the page") and this header was making the mistake with the hero's own text. It says the DATE now, which is the one fact nowhere else on the screen — the trainer's Today makes it the `<h1>`, and here the `<h1>` is the greeting §1 asks for |
| `.cnote__q` | The quote measured a **760px line holding 108 characters** inside the portal's 920px cap — ~105 characters a line where 45–75 is the band a reader can track, on the one paragraph of real prose on the screen. `max-width:62ch` on the quote PART and not on the card, because the card also holds a name, a tag and a stamp |
| the foot's three tiles | **`.stats--3` is a pinned count with no breakpoint, and this is the fifth time this codebase has met it** (`.cfstats`, `.cfprog`, `.rptstats`, `.mnystats`). `.stat__k` is 10.5px mono at 0.11em, and the first version wrote *You turned up* (96.9px), *Workouts logged* (111.8px) and *Sessions left* (96.9px) into an **82px content box at 390px**, with a 30-character sentence in one detail: every label on two lines, one detail on FOUR, and three tiles holding `91%`, `21` and `8` rendered **174px tall**. Copy fixed most of it — measured, not written — and `.pstats` catches 360px, which is `.rptstats`' number for the same measurement |

**And one that was not geometry.** The middle tile was *Workouts logged* — **21**,
beside an attendance tile reading *21 of 23*. Two of three tiles printing the same
figure under different labels does not read as two facts, it reads as one of them
being wrong. It is total **volume** now, which the same read makes free and which
answers a question nothing else in the portal answers: Progress draws per-lift
curves and the week draws attendance, and neither says *how much work is behind
me*. §3 has no objection — `WEIGHT_HAS_NO_TONE` is about BODYweight, and a running
total is the one shape that cannot go down.

### Checked by rendering

Signed in as `9840137911`, the real components against the running dev server,
both themes, every state driven.

**Measured:** `.wkd__c` 55 → **42px** at a desk and 41/37/31 at 390/360/320; the
quote 760px/1 line → **567px/2 lines** with a 62ch cap; `.cnote` 74 → **45px**
once the UA margin went; the tile row 174 → **138px** at 390 and 104 at 360 where
the rung fires; **zero horizontal overflow, zero elements past `.portal` and zero
clipped text** at 1536, 390, 360 and 320 — the one truncation at 320 is
`.lrow__s`'s deliberate ellipsis, which is what `ListRow` was chosen for.

**The linked tile, in full:** three `<a class="stat stat--link">`, figure
`--tx-ink` and **not** the anchor lime; hover measured `--tx-line-strong` /
`--w-hover` and focus a 2px `--tx-focus` ring at offset; and the tone precedence
proved by adding each class to a live tile — `--warn` `rgb(255,176,32)` and
`--acc` `rgb(198,242,78)` both still win over the link's ink.

**Light theme:** the tile figure **18.58:1** and its label and detail **6.17:1** on
white, 5.70:1 with the hover ground composited under them; the hero band 6.72:1;
the `.wkd` letter 6.17:1; zero overflow and zero clipped text.

**The library renders both:** `/library/c-coachnote` draws four blocks and three
real `CoachNote`s (the do/don't's *don't* is the old hand-written markup, so the
40px indent is visible beside the fixed one), and `/library/c-stat` draws the new
*A tile can be a door* block with three linked tiles including a toned one. The
catalogue is 57.

`npx tsc --noEmit` clean; `npx eslint` at the recorded baseline (**8 errors / 9
warnings, all pre-existing**, none in a file this pass opened);
`node ../scripts/sync-design.mjs --check` reports both stylesheets up to date;
`node ../scripts/check-components.mjs` reports **299 known, none added**; the
background-shorthand law holds on every rule this pass wrote — `.stat--link:hover`
uses `background-color`. Console clean but for `app/layout.tsx`'s pre-existing
no-flash `<script>` warning, which fires on every route in the app.
**`next build` NOT run**, per this file's own note that it writes `.next/` under
a running dev server.

### Not done

- **`/me/progress`, `/me/plan` and `/me/account` are untouched.** The brief said
  Home first, and the three defect classes this pass found are all likely to be
  there too: a `.stats`-shaped row on Progress, a `.tbl` measure, and the same
  `.ph` subtitle question.
- **A `.ph--portal` narrow rung.** The header is 65px on a phone drawing a
  greeting and a date, neither of which is duplicated, so nothing is being said
  twice — but it has not been measured against `MOBILE-UX-PHASES.md`'s budget the
  way `/today` and `/schedule` have.
- **No real device.** The phone widths are same-origin iframes in a desktop
  Chrome, so `pointer:coarse` does not match — the three linked tiles are 109px
  wide and 138px tall at 390, which clears 2.5.8 in both axes on a mouse and was
  not re-measured with the coarse cascade rewritten in place. That method is in
  `SESSION-VIEW-UX-HANDOFF.md`'s M4 and is what would settle it.
- **`129 t` is honest and untested on a reader.** `volumeKg` is load × reps summed
  in `mock/portal.ts`, so 21 workouts at ~6.1 t each is a plausible strength
  block — but whether a client reads *129 t* as impressive or as a bug is a
  question for a trainer, not for a measurement.

## The client portal's Progress — one spelling, and the history it was promised · 7 Sep 2026

The second screen of the portal pass, on the same brief. Progress was the
screen this file recorded as verified and it held **two links, both of them
escape hatches** — *Back to today* in the bare state and *Me* in the
weight-hidden one. It holds nine now, and the reason is the finding the whole
pass turns on.

### The two spellings

§3's instruction is *"show change, not data"*, which makes `25 kg → 27.5 kg`
the portal's most-repeated shape. It was drawn **four times on this one screen
with nothing underneath it**, and two of the four disagreed:

| where | what it wrote |
| --- | --- |
| `buildSummary`, in the model | `${g.from}kg → ${g.to}kg` — **no space** |
| the strength card, in the JSX | `{g.from} kg → {g.to} kg` — **a space** |

So *25kg → 27.5kg* sat **300px above** *25 kg → 27.5 kg*, on one screen, about
one lift. Neither is wrong and a reader cannot know that: one figure in two
typographies reads as two figures. **The disagreement lived in the STRING**, so
no stylesheet and no class could have caught it — which is the argument for the
component rather than for a rule.

`c-change` · `Change` · `.chg` is that component, and `buildSummary` returns the
PARTS now (`SummaryLine`) instead of pre-formatted prose. Three things it
absorbed on the way:

- **three inline font sizes** — `fontSize: 17` on the summary lines,
  `fontSize: 19` on two card headlines, and `fontSize: 15, marginLeft: 8` on the
  accent delta. Every one of them an inline style at a call-site, which this file
  records as the cause of six separate bugs because it outranks every selector
  including a media query.
- **the unit's own spacing.** The first version had callers pass `' kg'`, and the
  tape's rows carry `'cm'` off the wire — so one array of five lines would have
  spaced two one way and three the other. `.chg__u{margin-left:.18em}` owns it,
  which means there is nothing left for a caller to get wrong.
- **the arrow's accessible reading.** A `→` between two numbers is announced as
  "right arrow" or as nothing; the glyph is `aria-hidden` and a clipped `.vh`
  span supplies *to*. Measured: the span is a 1×1 absolute box, so a reader gets
  *25 kg to 27.5 kg* and an eye gets the arrow.

**And it deliberately has no `direction` and no `good`**, which is the near miss
worth naming: `c-stat`'s `delta` has both and *argues* for both, because on a
trainer's dashboard "up" is not always welcome. This is a client reading a number
about their own body, and `WEIGHT_HAS_NO_TONE` is the rule — so the figure is
plain ink at every size and the accent is available only on the separate delta
clause, which `Progress` passes for a **strength gain and nothing else**. §3's
*never celebrate a rate* is a missing prop now rather than a line of prose.

### The history, which `nav.tsx` promised and nothing built

That file's own table says why the fourth destination was renamed: *"Sessions →
Plan. The frame's Sessions is a HISTORY; §4 asks for what is coming… **the
history is on Progress, where it is evidence.**"* Progress then shipped with
charts, figures and a tape and **no list of what the client had actually done**,
so the history was moved off one screen and never landed on the other.

It is also the block every tracker has and this did not — Hevy's own docs
describe *"History — your performance from workout to workout, and tap on any to
see the entire session"* — and the tap is the half that matters here, because
every figure above it on this screen is a claim and this is the only place a
client can go and check one.

- **`ListRow` and not `Timeline`.** `Timeline`'s docstring reads *"what happened,
  newest first"* and looks like the obvious fit; it has no `href`, and a history
  whose rows do not open is a list of numbers nobody can verify. `ListRow` is
  also what Plan's *Coming up* and Home's next-session row already are, so the
  portal has ONE row shape for a session whether it is behind or ahead.
- **Six rows, and twelve was measured first.** At twelve the card rendered
  **775px** against neighbours of 134, 218, 244, 329 and 360 — the second-tallest
  thing on the screen, and the page went 4.2 → 6.0 screens. Six is **439px**,
  inside that distribution, and it is the cap `milestones.slice(0, 6)` already
  uses one card up.
- **The head and foot say what is hidden**: *the last 6 of 21*, and *15 more
  before these*. `historyTotal` exists for that sentence — a cap that will not
  say what it is withholding is the shape `AttentionQueue` refuses on the trainer
  half ("bounded, never truncated").
- **Closed logs only.** An open one is a session in progress and belongs to
  Home's hero, which is already drawing it with a *Carry on* button.
- **The effort is read back with no tone** — *felt hard* is a fact about a
  session, not a mark against it, and §2 stores it in its own row precisely
  because it is the client's answer rather than the trainer's record.

Each strength card also names its own peak day — *See the day you hit 27.5 kg* —
resolved through `workoutByDate` against the SMOOTHED series, the same way
`TrendChart` resolves `markIndex="peak"`, so the link and the dot cannot point at
different sessions.

### Four defects, and one fix that was reverted after reading the stylesheet

| Where | What |
| --- | --- |
| the page header | **`.ph__sub` and the summary card's own head were both `summary[0]`**, so *61 weeks with Arun* rendered twice inside 58px — the third instance of `.ph--today`'s rule in two passes. Fixed structurally rather than by editing one of the two: `lead` is its own field, the header renders it, the card lost its head entirely, and there is no index either of them can get wrong again |
| `.stats--3`, again | **The SIXTH time** this codebase has met the pinned count — and the first that CLIPPED rather than wrapped. Measured at 360px: three tiles on a 321px portal are 90px each with a 56px content box, and `91%` needs 58 while `Sessions` needs 60. Two truncated figures on the card whose whole job is to be believed. `.pgrstats`, one rung at 360 |
| the tape, at 320px | The four-column table is **298px inside a 279px card**, so 19px of the *Change* column — the one the card exists for — was **clipped and not scrolled**: `.card__b--flush` is `overflow-x:visible` and `.main` is `overflow:hidden`, so `documentElement` reported zero overflow throughout. Fixed with 8px cell padding at ≤372, which takes the table to **exactly 279 with zero clipped cells** and leaves the type alone |
| …and the probe that nearly caused a type shrink | The first measurement of that fix reported that reducing the cell padding changed **nothing** and that only a font-size drop helped. It was wrong: the probe wrote `.tbl th,.tbl td` at (0,1,1) against §11's own rule at equal specificity and later in the file, so it lost — **the trap this stylesheet records by name, this time inside the measurement rather than in the code.** Re-probed at (0,2,1) the padding alone was sufficient. *A specificity defeat can invalidate a measurement as easily as a rule* |

**And the milestone tags are deliberately still not links, which was built and
reverted.** A milestone's whole value is that it fired ON a day, so opening that
day was the obvious move and `Tag` takes an `href`. Then `.tag--link` was read:
its affordance is the HOVER — its own note refuses the underline, because "a
20px lozenge with an underline inside it reads as a typo" — and that hover is
`background:var(--tx-surface-2);color:var(--tx-ink)`, which **flattens whatever
tone the tag carries**. Its only caller today is Today's hero, whose *Has a note*
chip is untoned, so nothing has ever shown it; a `pr`-toned milestone would have
been the first, and a tag that turns grey when you point at it has lost the one
thing saying what kind of milestone it was. **Recorded rather than fixed** —
correcting it is a change to a trainer surface — and the history block is the
better door anyway, because it reaches every day rather than the six with a
milestone on them.

### What was deliberately NOT changed

**The repetition.** The summary states *Overhead Press 25 kg → 27.5 kg* and the
strength card below states the same change again. That looks like a defect and is
the design: §3's own words are that the summary leads and *"charts go below"*, so
the line is the CLAIM and the card is the PROOF — the card adds the delta, the
shape, the dates and the session count. What was actually wrong is that the two
were typographically indistinguishable AND spelled differently, and `Change`
fixes both; deleting either would have broken §3's rule 4, which is the rule that
keeps something other than weight in front of a client whose scale has not moved.

### Checked by rendering

Signed in as `9840137911`, both themes, every width driven in a same-origin
iframe.

**Measured:** the duplicate gone (`.ph__sub` *61 weeks with Arun* against a first
card head of *Along the way*); the summary card 306 → **244px**; the history
**439px / 6 rows**; **9 links where there were 2**; zero horizontal overflow,
zero elements past `.portal` and zero clipped text at **1536, 430, 390, 373, 372
and 360**, and the tape's rule handing over cleanly across its own boundary
(331px at 8px padding, 332px at 12px, both fitting). At 320 — below the stated
floor — the only truncation left is `.lrow__s`'s deliberate ellipsis, which is
what `ListRow` was chosen for.

**Driven end to end:** a history row clicked through to `/me/workout/wo_0280`,
which drew *WORKOUT DONE · 20 sets · Lower A · 55 minutes* and a **TOTAL LIFTED
of 9.5 t** — the same figure the row it was clicked from prints, which is the
cross-check worth having: two derivations of one workout's volume agreeing.

**Contrast, both themes:** the figure **17.00:1** dark and **18.58:1** light; the
unit the same; the arrow 6.05 / 6.17; the delta lime at 14.47 dark and stepping
to `#4F6B0A` at **6.10:1** on light, which is §01's opening rule holding. The
history rows 17.00/6.05/7.92 and 18.58/6.17/7.52.

**The library renders it:** `/library/c-change` draws four blocks and ten real
`Change` instances, including the do/don't whose *don't* is the old markup — so
the two spellings are visible side by side — and the contrast block putting
`c-stat`'s toned `delta` next to a figure that refuses one. The catalogue is 58.

`npx tsc --noEmit` clean; `npx eslint` at the recorded baseline (**8 errors / 9
warnings**, all pre-existing); `sync-design --check` clean; `check-components`
reports **299 known, none added**. **`next build` NOT run**, per this file's own
note.

### Not done

- **`/me/plan` and `/me/account` are untouched.** Two of the four defect classes
  found here are likely on both: a `.ph__sub` that repeats a card, and a `.stats`
  row with no narrow rung.
- **`.tag--link` flattens a tone on hover.** Recorded above. The fix is a
  trainer-surface change and belongs to whoever next opens `.tag`.
- **`formatVolume` is declared twice**, in `Home.tsx` and `Progress.tsx` — four
  lines each, in one folder. Worth a `lib/portal/format.ts` the day a third
  caller wants it, and worth knowing until then that they must not drift: a
  client can read the same tonnage on both screens.
- **The three strength charts are still 962px of the screen**, which is the
  tallest block on it. §3 asks for the number and the shape and this draws both;
  whether three charts or one chart plus two figures is the better answer is a
  question for a trainer rather than a measurement.
- **No real device.** `pointer:coarse` does not match in a desktop harness, so
  the six history rows were measured at 56px — above 2.5.8's minimum on a mouse —
  and not re-measured with the coarse cascade rewritten in place, which is the
  method `SESSION-VIEW-UX-HANDOFF.md`'s M4 records.

### And Progress got a range · 7 Sep 2026

The gap the competitor pass named and the previous section left in *Not done*.
Every window on this screen was fixed and each one was DIFFERENT — attendance
over 90 days, strength since the first ever set, the tape from first reading to
last — and a client could not ask *what about the last month?*

The tell was already in the copy. The summary's caption read *"Attendance is
over the last 90 days. Everything else is since you started with Arun."* A
screen that has to explain its own axes has more than one; that sentence was a
range control's absence, written out. It reads **"Everything here is the last 8
weeks."** now, and there is one axis to explain.

Trainerize and TrueCoach both let a client change it, the design press treats
range controls as mattering *"almost as much as the chart itself"*, and this
product's own TRAINER half has had exactly this control on the same client's
progress tab since it was built.

### The three keys are the trainer's, imported rather than restated

`ProgressRange` is `lib/log/log.ts`'s — `'8w' | '6m' | 'all'` — and it is a type
IMPORT. `/clients/:id/progress` is the trainer looking at the same client's
progress with the same three chips, and two halves offering different windows
onto one client's lifts is the failure `lib/setup/options.ts` opens by
describing: one answer set, two spellings, and no way to compare the screens. A
type erases at runtime and couples nothing, which is the line
`lib/portal/api.ts` draws for the FETCHERS (*"the two must not share a
fetcher"*) and deliberately does not draw for a shared word.

**The labels are the client's**, though: *8 weeks · 6 months · **Since you
started***, where the trainer's third chip says *All*. A trainer is filtering a
dataset; a client is being told how far back the screen is looking.

### The default is `all`, and `buildStrength` is why

`AGENTS.md` states the rule twice and it is about exactly that read: *"a
personal best is a claim about the whole history, so a window is what produced
the wrong answer"*, and §3's headline is *Squat 40kg → 62.5kg*, which "is a
statement about a beginning, and the beginning is older than any window a screen
would pick."

A narrower range does not make that claim wrong — it makes it a **different**
claim, *what has moved in the last eight weeks*, which is a fair question and
the one the control is for. What would be wrong is that being what the screen
opens on. So `DEFAULT_RANGE = 'all'`, and `?range=all` is never written into the
URL — a URL carrying its own default cannot be shortened by hand, which is
`Schedule.tsx`'s own reason for stripping `?new=1`.

### What windows, and the two things that deliberately do not

| | |
| --- | --- |
| **windowed** | consistency (all three tiles), strength (series, from, to, session count), the tape, weight, the history list and its total |
| **`milestones`** | **not windowed.** A lifetime record is not a period figure, and filtering *Along the way* to eight weeks would empty the card for most clients — which reads as the records having been lost rather than as a range having been narrowed |
| **`lead`** | not windowed. *61 weeks with Arun* is a fact about the arrangement. `weeks` does not read the window at all, so one `buildConsistency` call serves both |
| **`workoutByDate`** | **not windowed, and this one is load-bearing.** It is what lets a claim link to its day, and the claims outlive the range: on *8 weeks* the strength cards still name a peak that may be a year old, and a map built inside the window would leave those links dead on exactly the ranges a client narrows to |

### Four things that had to be got right, and each is a way a range can lie

- **The span is clamped to `startedAt`.** *8 weeks* on a client three weeks in is
  three weeks. Without the clamp `buildConsistency` divides attendance by eight
  weeks of which five did not exist, and prints a beginner's first fortnight as a
  third of the sessions a week they are actually doing — a lie in the one
  direction that matters, to the client with least evidence to argue with it.
  Measured: 1.6 a week over all time, **2.5 a week** over eight.
- **The tape reaches back out of the window.** `lib/reports/build.ts` found this
  first and `AGENTS.md` records it: *"A measurement's baseline can be older than
  the window. A client weighed in January and again last week has one reading
  inside twelve weeks and would otherwise report no change."* A range control
  does exactly that to a tape, because a trainer measures every few weeks. So
  where the window holds one reading, `buildMeasures` reaches for the nearest one
  before it and sets `baselineIsOlder`, **and the card says so** — reaching back
  silently would be its own lie, since the dates printed are then outside the
  window the header claims.
- **Weight does NOT reach back**, and the asymmetry is the point: weight is
  logged from Home's own two-second box, so a range holding one reading holds one
  because the client stopped weighing themselves. Pairing that with a January
  baseline would draw a smoothed line between two points eight months apart and
  call it the last eight weeks. `change` is null and the card says nothing.
- **An empty range is not an empty account.** `bare` is computed over the
  windowed data, so it would have fired for a client sixty-one weeks in who
  pressed *8 weeks* and told them *"After two or three sessions it will show what
  is getting stronger"*. `emptyRange` is checked first and says the other
  sentence — the one the trainer's own progress tab already uses: *"Nothing
  logged in this range yet."*

### And the chips are the design system's pressed state, which the trainer's are not

`components/log/Progress.tsx` draws the same three chips and overrides
`aria-pressed`'s appearance with an **inline** `background` / `borderColor` /
`color` triple — a soft accent tint where §04's rule is a solid lime fill. That
is the defect the setup flow already had and fixed: *"Step 8's chips had their
own pressed state … One flow, one pressed state — and on the screen whose whole
job is read this back to yourself, the unambiguous fill is the better of the
two."*

This screen's whole job is read this back to yourself, so it passes **no
`style` at all** and takes the fill. Measured: `rgb(198, 242, 78)` on dark ink,
and `inline=""` on all three. The trainer's copy is left alone — a trainer
surface this pass did not open — but it must not be copied from, which is why
the note is in `ProgressRanges.tsx` rather than in a commit message.

**And the chip set is a fact about the data**, not a constant: `rangeChoices`
offers a bounded range only once the client has been training longer than it,
because *6 months* on somebody eight weeks in redraws the screen identically to
*Since you started* — the dead control this codebase keeps deleting, wearing a
filter's clothes. One choice draws nothing at all, which is `.wsw--one`'s rule.

### The defect this pass caused, and it is the worst kind

**A blank screen, with `tsc`, `eslint` and both project guards green.**

The range vocabulary went into `lib/portal/progress.ts` first. That file opens
with `import 'server-only'` and the labels are read by the CHIPS, which are a
client component — so the whole route rendered nothing:

```
./lib/portal/progress.ts
Error: You're importing a module that depends on server-only
```

Same class as the `/settings` subtree that "rendered blank for a week", and this
file's own lesson about it holds exactly: *"this class of bug is invisible to
every gate this project has… Only rendering finds it."* It was found on the
first page load after the change.

The fix is not a `'use client'` shim, it is the right home: **`lib/portal/range.ts`**,
which is neither. A range is a vocabulary, and a vocabulary both sides of the
boundary read belongs in a module that reads no request, no cookie, no database
and no clock — the way `lib/today/time.ts` and `lib/log/log.ts` are both
written. `progress.ts` re-exports it, so a server caller still has one import.

### Checked by rendering

Signed in as `9840137911`, both themes, driven as real clicks.

**All five URL states at 1440**: default, `?range=8w`, `?range=6m`,
`?range=all`, and `?range=nonsense` — which correctly draws the default, the
same call `parseTab` makes on `/business`. Three chips on each, the right one
pressed, seven blocks, **zero horizontal overflow and zero clipped text on every
one**.

**The window verified figure by figure**, all → 8 weeks:

| | all | 8 weeks |
| --- | --- | --- |
| Sessions | 21 | **20** |
| A week | 1.6 | **2.5** ← the span clamp |
| History | the last 6 of 21 | **the last 6 of 20** |
| Chest | 98.5 → 102.3 cm | **101.2 → 102.3 cm** |
| Tape dates | 10 Jan → 7 Sep | **8 Aug → 7 Sep** |
| Weight | 82 → 81.3 kg | **81.3 → 81.2 kg** |
| Overhead Press | 10 Jul → 4 Sep, 7 sessions | **24 Jul → 4 Sep, 6 sessions** |
| Milestones | 4 | **4** — correctly untouched |
| Links | 9 | **9** — `workoutByDate` still reaching outside the window |

**The tape's reach-back was exercised on purpose**, because **no seeded client
triggers it**: all six metric types hold exactly two readings in eight weeks for
every one of the five clients checked (verified by minting a mock token per
phone and reading `/v1/me/metrics`). So `RANGE_DAYS['8w']` was temporarily set
to 21 days, the screen rendered, and the branch fired correctly — the tape kept
**all four rows** where a naive window would have dropped every one of them, and
the foot read *"Some of those first readings are older than the last 8 weeks —
Arun takes the tape every few weeks, so the comparison reaches back to the last
one before it rather than showing you no change at all."* **Restored to 56 and
re-verified.**

**The phone**: 390 and 360 clean — zero overflow, zero clipped text, the right
chip pressed. `.ph` grows **65 → 105px** at 390, which puts total chrome at 151
of 844 (**17.9%**), well inside the budget the session-view pass worked to.

`npx tsc --noEmit` clean; `npx eslint` at the recorded baseline (**8 errors / 9
warnings**, all pre-existing); `sync-design --check` clean; `check-components`
**299 known, none added** — the chips are `ui/Chip`, so nothing was hand-written.

### Not done

- **`.ph` wraps its chip row at 320px**, taking the header to 136px. No overflow
  and nothing clipped, and 320 is below the stated floor — but the fix if it is
  ever wanted is the one `/schedule` already uses for its filters: a scrolling
  strip rather than a wrap, because *"a chip row that wraps changes the toolbar's
  height"*. Left because this chip set is stable for a given client, so the
  height does not move under the reader the way the schedule's did.
- **One range for the whole screen**, where Trainerize and TrueCoach range each
  chart. A per-card range is four more controls on a screen whose §3 brief is a
  summary with evidence under it, and it is the trainer half's own choice
  (`PeriodPicker` is screen-level on Business).
- **No `4w`.** The seed measures every four weeks, so a monthly range is the one
  where the tape's reach-back would fire constantly rather than rarely — worth
  offering, and worth deciding with a trainer whether a tape that always reaches
  back is a tape worth drawing at that width.
- **`.tag--link` still flattens a tone on hover**, unchanged from the previous
  section and still a trainer-surface fix.

### The summary card, reworked — a lead, five rows, and four quick links · 7 Sep 2026

Reported as **"this is not appealing to see"** with a screenshot of the card,
plus the brief: *"Order the components priority wise on what clients should see
first. Low priority informations can be moved to down. Or have quick links on
the top to access those informations quickly."*

The report was right in a way the pass two sections up **half-missed**. That
pass found the defect — its own notes read *"no hierarchy in the summary — six
identically-weighted 17px lines"* — then fixed the SPELLING with
`ui/Change.tsx` and left the flatness. **Consistent and flat is still flat**, and
a found-then-unfixed defect is worse than an unfound one, because the next
reader assumes it was considered.

What was on screen: six figures of four different kinds — an attendance rate,
two lifts, two tape sites and a bodyweight — at one size, in one column, longest
line 380px inside an 886px card. No entry point and 500px of dead card.

### Three changes, and the first is the one §3 asked for

**1 · A LEAD.** §3's table is an instruction, not a list: *"Strength — 'Your
squat is up 22kg.' The most motivating number for beginners, and the one most
apps bury. **Lead with it.**"* So one figure is 19px with its delta in the
accent, and **`buildSummary` picks it** — the screen should not be deciding
which of six figures matters, and `buildStrength`'s own ranking (the lifts a
beginner names out loud ahead of proportional gains on accessories) already
answers it. That ranking is shared with the milestone rule, so the lead and the
chips cannot disagree about which movement is the one worth talking about.

**2 · THE REST ARE ROWS.** `KeyValueList` — a 13px key and a right-ranged 13.5px
tabular value, against a 19px lead. That is the hierarchy. Ordered §3's way:
consistency, the other lift, the tape, and **weight last**, which is rule 4 of
`progress.ts`'s header — a client whose scale has not moved must not find the
number that has not moved at the top.

**3 · IT USES THE WIDTH.** `.grid2`, the pattern Home already puts *This week*
and *Weigh in* in, so the lead sits beside its figures instead of above 500px of
empty card. Collapses to one column on a phone with no rule of its own. **203px
at a desk, from 306 before the pass and 244 after it.**

And the window moved to the top as the lead's kicker — *THE LAST 8 WEEKS* —
where it frames what follows. It had been a grey trailing line, the weakest
position on a card for the one fact that qualifies every figure on it.

### The quick links are the rows themselves

The other half of what was asked for, and it earns its place on a screen five
desktop screens tall: every row's key links into the section that draws that
figure in full, so a client who wants the tape does not scroll past three
charts. `#strength`, `#turning-up`, `#tape`, `#weight`.

**The targets are `<section>` wrappers, not a `Card` prop.** `Card` takes `as`,
`className` and `style` and deliberately not `id` — its own note calls the `as`
union "the whole union" rather than a general escape hatch — and a `<section>`
with an `aria-label` is the honest element for a region a reader can be sent to,
where a bare `<div id>` is a jump target with no name.

**`.pgsec{scroll-margin-top:14px}` is the one rule they need**, and §02's
`scroll-padding-top` is why: that is set on `html` and this portal does not
scroll the document. `.body` is an inner scroller inside `main.main`, so a
fragment jump scrolls THAT box and `html`'s padding never applies — the card
would land flush against the page header. Verified: clicking *Chest* moved
`.body.scrollTop` to 2042, left `document.documentElement.scrollTop` at **0**,
and landed the tape section **14px** below the body's top edge.

### Three defects this rework caused, all three caught, two of them mine twice over

| Where | What |
| --- | --- |
| the Weight row | It printed `81.3kg → 81.2kg` while the weight card 400px below printed `81.3 kg → 81.2 kg` — **the two-spellings defect, reintroduced by the pass that built `ui/Change.tsx` to prevent it**, in a row hand-built as a template string. The lesson is not "remember the space": a from→to belongs to `Change` and nowhere else. The row is a **delta** now (`−0.1 kg`), which also makes it the same shape as the tape and lift rows, so the right column is five figures of one kind instead of four deltas and a pair |
| `Also stronger` | Value *"Barbell Bench Press, +2.5 kg"* — **192px of nowrap in a `.kv` value, running 15px past its own card at 320px**. `.kv` is `flex-wrap:nowrap` with an 80px min-width key, and `AGENTS.md` records the identical failure for the notify rows ("227px of content in a 147px slot") — which this pass had **quoted in its own docstring** before walking into it. Fixed by the right split rather than a shorter phrase: the key column is already the *what* column, so the movement and the tape site moved INTO it and the value is only ever a figure. *Barbell Bench Press → +2.5 kg* |
| the row links | Started as `.lnk`, which is `--tx-accent-text`. Measured at **14.47:1 — the identical lime as the lead's own delta**, five more times, on the screen where §3 says the strength delta is *"the ONE figure that carries a tone"*. So the right column was competing with the lead it exists to support. `.tag--link` had already settled the principle for the same kind of control: *"it keeps `--tx-ink-2` rather than going accent: it is a way in, not a call to action"* |

**And then the fix for the third had a defect of its own, which is the one worth
keeping.** Taking the colour off means the UNDERLINE carries the affordance, and
the first choice for it was `--tx-line-strong` — the sheet's "a rule you can
see" token, and it had been *measured* in the browser as `rgb(42, 47, 57)` and
read as a visible dim rule.

Computed against the card it is **1.40:1 on dark and 1.63:1 on light.** A border
token doing what a border token does, and invisible as INK in both themes — so
that version took the colour off five links and replaced it with nothing.
`--tx-ink-3` instead, which is one step dimmer than the text in both directions
by construction: **6.05:1 under 7.92 on dark, 6.17:1 under 7.52 on light.**

Two traps in that, both worth more than the bug:

- **A computed style tells you what a colour IS, not whether anybody can see
  it.** The dark value had been read out of the browser and believed.
- **Poking `data-theme` on `<html>` is reverted by the app's own theme sync.** A
  light-theme probe taken that way silently measures the dark palette: this pass
  produced a *"light: 2.37:1"* reading that was pure artifact — `:root` reported
  the light token while the element resolved the dark one, and an ancestor walk
  showed `<html data-theme="dark">` a moment later. **Drive the theme switch.**

### The screen order, checked and left alone

`summary > Along the way > strength > turning-up > What you did > tape > weight`.

The brief asked for priority order and this is already §3's, once the summary
leads with strength: recognition, then the lead metric's evidence, then the
thing a client controls, then what they did, then the tape, then weight last.
Milestones staying second was considered and kept — the card's own note argues
it (*"a milestone IS a summary line — it is the one thing on this screen that
names a day"*), and with the summary now leading on the strength gain, strength
does lead the screen.

### Checked by rendering, and where it stops

Driven as real clicks at 1440, then measured in same-origin iframes at 1440,
390, 360 and 320: **zero horizontal overflow and zero clipped text at every
width** (the five at 320 are `.lrow__s`'s deliberate ellipsis, which is what
`ListRow` was chosen for), the card 203px at a desk and 336 stacked, all five
rows fitting with `kvOverflow=0`, all four section ids present, and the `#tape`
jump landing where `scroll-margin-top` says.

**The browser harness disconnected before the light theme could be re-checked**,
so the underline correction is **computed and not rendered**: the arithmetic
above is exact, and what has not been looked at is whether a 6.17:1 rule under
7.52:1 text reads as an affordance or as an underline somebody wants to remove.
That is the one open item, and it is one screenshot.

## The client portal's Plan — three tabs, a day that is a place, and no video · 10 Sep 2026

The brief: *the page should carry the current workout plan the trainer assigned, a
way to see the old plans, a way to see the exercises under each day, and upcoming
sessions — and videos are not supported, so remove them.*

`/me/plan` was built in the 7 Sep portal pass and not revisited. Home and Progress
have each had a UX pass since; Plan had not, and it carried three of the defect
classes those passes were written to fix.

### What was wrong, measured

| | |
| --- | --- |
| **One page, everything expanded** | four blocks plus a card per training day with every movement in it — ~25 exercise rows a client scrolled past to find out when their next session was. Verbatim the shape `lib/portal/progress-tabs.ts` was written to fix, on the screen §4 calls *"a reference screen, not a working one."* |
| **The structure said three times, joined up nowhere** | the arc card said *Week 5 of 8*, the week table said `Monday → Upper A → 6:30 AM`, and a card much further down said `Upper A — 6 exercises`. A client asking *what am I doing Monday, and what is in it* read a label off a table row and then scrolled hunting for the card carrying it. **Recognition over recall, failed by a page that had every piece of the answer on it.** `PortalSessionWire.templateDay` had been on the wire the whole time, unread. |
| **The header repeated the arc card verbatim** | `.ph__sub` was `${n} sessions booked · Week 5 of 8 · Strength` and the card's head was `Week 5 of 8 · Strength`, ~60px apart. `.ph--today`'s own rule, and the **third** instance in this portal after Home and Progress. |
| **The demo clip was fiction and the modal apologised for it** | `HowTo` drew a `Message tone="warn"` reading *"The clip itself is not wired up in this prototype."* A play disc over a placeholder is the dead affordance this codebase keeps deleting. |
| **The trainer's cue was not reachable from Plan at all** | `ClipRow`'s own comment recorded the decision — *"the cue is NOT here … `.lrow__s` ellipsises, and a truncated instruction is worse than none."* Correct about the component and wrong about the answer: §"Make the trainer present" calls notes and cues *"what separate you from a free workout app"*, and the screen a client reads the night before showed none of them. |
| **No earlier plans** | one `active` program per client and no `status` on the wire, so the portal could answer *what did I used to buy* (packages have history on `/me/account`) and not *what did I used to do*. |

### Competitor analysis, and the one trade it forced

ABC Trainerize's client day view carries the exercises with sets, reps, rest and RPE,
**the trainer's notes**, and a demo video. TrueCoach is deliberately thinner — *"the
workout and the exercise video library"*. Everfit adds engagement blocks and
challenges, which §"What to cut" already refuses. Hevy and Strong both go routine
list → routine detail → exercise detail.

All three PT platforms put the video at the centre of the client's exercise view. So
**removing it moved that weight onto the written cue** — which is what the spec says
the differentiator is anyway. The video's removal and the missing-cue fix are one
change, not two.

### The shape

Three tabs, `progress-tabs.ts`'s pattern and its three rules — every tab a real
route, the first tab the bare route, nothing unbuilt in the list.

```
/me/plan                       Schedule    the bare route
/me/plan/workouts              Workouts    the days
/me/plan/workouts/[day]                    one day, in full
/me/plan/history               Past plans
/me/plan/history/[programId]               one earlier plan
```

**Three and not four**, and the candidate for a fourth was answered rather than
added: *Your week* belongs beside *Coming up*, because *what is booked* and *what my
week normally looks like* are two readings of one question and a client compares
them. Splitting them would make the comparison a navigation.

**The first tab is *Schedule*, not *This week***: it holds a 28-day window and the
typical week, so a tab named for one week would be wrong about its own contents.

**A day is a ROUTE, not a disclosure.** `planDayHref` carries it: a cue is a sentence
and sometimes two, and it needs a page rather than a second line. There is also no
Accordion in this design system, and `registry.ts` records a `c-secnav` jump-nav
added and removed the same day — so the route is the answer the system already has.
**An earlier plan gets no per-day route**: it is browsed rather than performed, so its
days are sections on one page and the third level of nesting is not spent.

Where the duplication went:

| String | Was | Is |
| --- | --- | --- |
| `Week 5 of 8 · Strength` | `.ph__sub` **and** the arc card's head | `.ph__sub` only — a frame over all three tabs |
| `${n} sessions booked` | `.ph__sub` | the *Coming up* card's own count |
| the program's name | the arc card's head and its body | the *Workouts* tab's head |
| the `Meter`'s caption | `Week 5 of 8` a third time | `3 weeks to go`, or the head's `Last week` tag |

### Video is gone from the whole portal, and `ClipThumb` is kept

`ClipRow` deleted; `HowTo` keeps the cue, the steps and *Watch for* and loses the
poster and the apology; `ExerciseCard` loses its 260px thumb and gains a *How it's
done* button; `Flow`'s pre-workout table loses a 96px column; `clip` is off
`PortalExerciseWire` and `Db.clips` is out of the seed. **The field is GONE rather
than nulled** — a nullable `clip` is a promise that one arrives.

`web-components/ui/ClipThumb.tsx` is **kept**, on the terms `DayRibbon` and `c-setrow`
are kept on, with a docstring saying the portal no longer consumes it and why. Do not
wire it back up without files.

**And the cue is attributed by name now**, on the day screen, in the flow and in the
panel — *"Chest up, shoulder blades pinched." — Arun*. `formCues` stays labelled as
the library's. `AGENTS.md` already states the cost of blurring them and it matters
more now that the cue is the whole of the demo.

### Two blocks behind every client, and §1 on the first backward-looking screen

`GET /v1/me/programs` (summaries) and `GET /v1/me/programs/{id}` (the full object);
`me/program` stays the bare route for the live block. Summaries on the list because
three programs × three days × six movements, each with a cue, a paragraph of steps
and a list of pointers, is a payload a list has no use for.

The seed lays **up to two** finished blocks backwards from the active one, gated on
the client's own join date — forcing two on everybody would date a program before its
client existed, and the screen PRINTS those dates. `'completed'` is not invented here:
`router.ts`'s assign handler already writes it.

**There is no adherence figure on that tab and there must not be.** §1: *"No red 'you
missed 3 workouts.' Guilt-based design produces uninstalls, not attendance."* A
percentage against a block somebody finished in March is a mark for work they cannot
go back and do. What a row carries is what the plan WAS, plus a session COUNT — and
`workoutCount` is **null rather than 0** wherever the block ended before the oldest
workout on record, because printing *0 sessions* against a plan somebody trained is
the screen accusing them of a gap in its own data. `utilisation`'s rule, one screen
over.

### Eight defects found by rendering, and four of them were older than this pass

`tsc`, `eslint`, `sync-design` and `check-components` were green on every one.

| Where | What |
| --- | --- |
| `mock/seed.ts` · `weeklySchedule` | **A client's Friday claimed to be a program day that does not exist.** `templateDay: si + 1` — 1, 2, 3 down the slots — is right only for a program whose training days are numbered from one with no gaps. `Upper / Lower · 4 day` trains days **1, 2, 4, 5**, and the SESSION generator resolved the same Friday to day 4 through `trainingDays[i % len]`. The diary and the client's own arrangement disagreed about which workout Friday is. It survived because nothing read the number — `buildPlan` looked the label up, missed, and printed *Training*. **Making a day a route is what made it visible: a week row linking at a 404.** One `templateFor` helper now, used by both. |
| `lib/portal/plan.ts` | And the guard that makes it not matter: anything not in `program.trainingDays` is nulled once in `buildPlan`, so no consumer can build a link to it. A row that cannot be opened is drawn as a statement, which is what `ListRow` does with no `href`. |
| `mock/seed.ts` · the portal pin | **`programs.find(pr => pr.clientId === …)` returned the OLDEST COMPLETED block** once a client could have more than one. So the pin that exists to put `/me/plan` at *week 5 of 8* landed on the wrong row, the portal went back to reading *week 8 of 8* — the empty case the pin exists to avoid — and the finished blocks, laid backwards from the un-pinned start, **overlapped the live one**. Visible on the client file as a completed block dated after the live one. The start is decided inside the loop now; the post-hoc block keeps only `updatedAt`, and its `find` requires `status === 'active'`. |
| `components/clients/file/ProgramTab.tsx` | **A finished plan read *"week 9 of 6"*.** `weekOf` measures from `startDate` to **now**, unconditionally — right for the live block above it and nonsense for a finished one. Unreachable until there were completed programs to draw. A live block states its week; a finished one states its LENGTH. |
| …and the same function | It was also **unclamped where `/me/portal` clamps**, so the trainer and their client read *week 9 of 8* and *week 8 of 8* about one program. One client, one program, two answers. |
| `PlanSchedule` · the lead card | Committed inside the fix for it: `<Tag tone="acc">Today</Tag>` beside a `CardHead` reading *Today*. The tag says `Under way` now, which is the one thing the head cannot — the window keeps a day of slack on the near end, so the lead card can be a session that started forty minutes ago and *at 8:04 AM* is then the wrong tense. |
| …and the same card | The lead card and row one of the list printed the identical sub, ~200px apart. The list starts at the session AFTER the lead now. The count is untouched — *13 booked* is the diary, not the rows under a heading. |
| `Meter` | **Its `label` is `aria-label` and paints no ink.** So the arc card rendered a bar with no figure near it while this file's own note claimed the label *"says what is left"* — true only for a screen reader. A drawn caption, and only while there IS something left; at the end the head's tag says it. |

Two more that were geometry:

- **`.tbl`'s `nowrap`, again.** A fourth column on *Your week* (the exercise count)
  ran **20px past the card at 360 and 60px at 320** — and `.main` is
  `overflow:hidden`, so it was CLIPPED rather than scrolled and
  `documentElement.scrollWidth` read **zero** throughout. Found by measuring cell
  rects against the card. `.plnwk__c` stands the column down under 389, which is a
  measurement: the row fits at 390 with room and does not at 360.
- **A `ListRow` sub with four facts in it.** *Aug – Sep 2026 · 6 weeks · 3 days a week
  · 12 sessions logged* was **34px over at 430, 74 at 390, 104 at 360** — and the
  clause `.lrow__s` was eating is the one a client might feel good about. Two facts in
  the sub, the count in the trailing slot, the rest on the plan's own page.

### `.plnstats` is the seventh `.stats--n` rung

After `.cfstats`, `.cfprog`, `.rptstats`, `.mnystats`, `.pstats` and `.pgrstats`. Here
the LABELS bind rather than the figures — `Exercises` is ~62px against a 56px content
box in a 90px tile — so it wraps where `.pgrstats` clipped, and a three-line label
under a one-character figure has stopped being a tile. 360, scoped, `(0,2,0)`.

### Checked by rendering

Headless Chrome over CDP against the dev server on **`localhost:3100`**, both themes,
every behaviour driven as a real click. **The harness is deleted; rebuild one if this
screen is touched.**

Measured at **1440, 430, 390, 360 and 320**, all five routes: zero horizontal
overflow, zero elements past their card, zero clipped text and zero targets under
24px — the one exception being `.lrow__s`'s deliberate ellipsis at 320, which is
below the stated floor and is what `ListRow` was chosen for.

Driven: every tab; the strip lighting *Workouts* on a DAY route and *Past plans* one
level in (`startsWith`); the back button out of a day and out of a tab; the lead
card's button, a diary row and a week-table row all landing on the right day; the cue
drawn in full and attributed; *How it's done* opening with **no `ClipThumb` and no
apology**, Escape closing it and focus returning to its trigger; an exercise name
into `/me/progress/exercises/ex_001`; a past plan opening with a `Finished` tag and
no figure of shame anywhere in its text. Refusals: `workouts/3` (a day this program
does not have), `workouts/abc`, `history/prg_999`, another client's `programId`, and
the client's **own active** program under `/history` — all 404, never 403, so asking
does not confirm existence.

Contrast, both themes: `.pln__time` 17.00 / 18.58, `.pln__grpk` and `.plnex__n` 6.05
/ 6.17, `.plnex__rx` 17.00 / 18.58, and the cue's accent stepping to `#4F6B0A` at
**6.10:1** on light — §01's opening rule holding.

Four personas: `9840137911` (the live-session client), `9840275822`, `9840551644`,
and **`9841654932` — a `no-program` client WITH history**, which is the state worth
having: *nothing on right now, and here is what you did*. `NO_PROGRAM_GAP_DAYS` is 14
rather than 21 because the gate that refuses a block starting before its client did
leaves that persona with nothing at anything over 19.

The workout flow re-verified at 1440, 390 and 360 after `ExerciseCard` and `Flow`
changed: no `ClipThumb`, the trigger present, the cue attributed, the panel opening
clean, zero overflow.

### The trainer's half is byte-identical, and that took a second pass

The seed change is the only thing that reaches it. Every reader either filters
`DEAD_PROGRAM` (which contains `completed`) or, in `AssignedList`, already splits live
from past — so the counts were safe. **The RNG was not.** `rand` is one deterministic
stream over the whole book, so pinning the portal client by simply not drawing
re-rolled every client after it: measured, the roster showed *Week 8 of 8* where it
had shown *Week 4 of 8*.

So the draw order is exactly what it was: every client that used to draw still draws,
the portal client draws and then overrides, and a `no-program` client draws nothing.
Verified by restoring `git show HEAD:…/seed.ts`, snapshotting `/clients`, `/today` and
`/business`, and diffing: **the only difference is the wall clock advancing between
the two captures.** Template counts unchanged at 21 active, and every template with a
completed assignment still has a live one — so `Builder`'s `assignedCount === 0` guard
cannot flip a shelf row from *Not assigned yet* to *0 on this*.

### Verified

`npx tsc --noEmit` clean. `npx eslint` at the recorded baseline — **17 problems, 8
errors and 9 warnings, none in a file this pass touched**. `sync-design --check` up to
date, so `webapp.css` is untouched. `check-components` reports 299 known, none added.
The background-shorthand gate comes back empty. **`next build` was NOT run**, per this
file's own note that it writes `.next/` under a running dev server.

**`SEED_VERSION` is 15.** The book lives on `globalThis`, so a change to the seed's
LOGIC needs a bump as much as a change to its shape does — this pass learned that the
hard way twice, editing the seed and watching a hard refresh serve the old rows.

### Not done, and none of it an oversight

- **Chrome is 33% of a 360×640 phone**, against `MOBILE-UX-PHASES.md`'s 30%. Measured
  against the reference screen: `/me/progress` is **223px at 390×844 and 213 at
  360×640 — the identical figures**. This is the portal's tabbed-screen budget rather
  than anything this pass added, and the fix (standing `.ph__t` down under 900, which
  `.ph--named` exists for) belongs to both screens or neither. Making two sibling tabs
  differ in header height is the worse outcome.
- **A program day the client's fixed schedule never reaches** draws no weekday —
  `Lower B · 5 exercises` with no *Mon & Thu*. Honest: `Upper / Lower · 4 day` has four
  workouts and this client trains three times a week. Whether a client reads that as
  informative or as missing is a question for a trainer.
- **`Fat Loss · 3 day full body` sits beside a goal reading `Fat loss`** on the past
  list. Data, not layout — the template's own name contains its goal — and it is why
  the goal moved off the row and onto the plan's page.
- **No real device.** The phone widths are a desktop Chrome with device metrics, so
  `pointer:coarse` does not match. `SESSION-VIEW-UX-HANDOFF.md`'s M4 method —
  rewriting the coarse conditions in place via `rule.media.mediaText` — is what would
  settle the touch targets without a handset.
- **`/v1/me/programs` has no backend behind it**, like every other `/v1/me/*` route on
  this half. It is a mock route and `backend/API.md` does not document it yet.

## The client portal's Me — three tabs, two codes, and five rights · 11 Sep 2026

`ACCOUNT-VIEW-UX-HANDOFF.md`, implemented. That file is analysis only — thirteen
ranked findings, each with the evidence it came from — and it opens by saying the
house rule was only half-kept: the session that wrote it had **no browser**, so
every pixel figure in it is an estimate off the rendered HTML.

**So the first move was to rebuild the harness and re-measure, and the estimates
held.** Headless Chrome over CDP, `localhost:3100`, at 390×844:

| | handoff estimate | measured |
| --- | --- | --- |
| `.body` scrollHeight | 4,258px | **4,075px** |
| usable window | ~600px | **680px** |
| *What Arun can see* starts | 2,400 | **2,215** — screen 4 |
| *Your data* starts | 3,621 | **3,495** — screen 6 |
| cards / `.card__b` | 7 / 26 | **7 / 26** ✓ |
| real `h3`–`h6` | — | **0**, against 18 `.h5` ✓ |
| sign-out at 390px | absent | **0 found**, `.rail` is `display:none` ✓ |

§7.1 set the threshold — *"if the total is materially under ~3,000px the tabs
argument weakens"*. It is 4,075. So F4 proceeded.

### Three product decisions were taken before anything was written

The handoff's §7 open questions, answered: the grievance route is a **config
module with placeholder values** (`lib/portal/grievance.ts`, one file to edit at
launch, with a ⚠ saying Rule 9 is a publication obligation); notifications name
**SMS and WhatsApp** with **no permission row**, because nothing push-related is
wired and a row reading *Turn on* against no service worker is the dead
affordance this codebase keeps deleting; and the split is **three tabs**, not
two, because *Settings* and *Privacy* as one tab puts the notification switches
in the same place as the delete flow — the pairing the single page was being
criticised for, one level down.

### The shape

`progress-tabs.ts`'s pattern and its three rules — every tab a real route, the
first tab the bare route, nothing unbuilt in the list.

```
/me/account                Me         the bare route
/me/account/settings       Settings
/me/account/privacy        Privacy
```

| tab | carries | scroll at 390 |
| --- | --- | --- |
| **Me** | trainer, arrangement, package, payments, notes | 1,737 |
| **Settings** | the number, the health note, the switches, the theme, sign out | 1,536 |
| **Privacy** | what the trainer can see, download, grievance, nominee, delete | 2,542 |

The old page's docstring refused a tab strip and **half of its argument is
kept**: *"a client opens this screen to look their trainer up — the most-used
element on this screen by a wide margin"*, so the trainer card is first on the
default tab, above the fold, with the only primary button on the destination.
The other half — *"a tab strip here would be a fifth navigation the spec
refuses"* — **was true when written and is not now**: `/me/progress` grew four
tabs and `/me/plan` three, both with `PageTabs` inside a single destination.

### The finding that could permanently cost a client their account

`MyDetails` gave the sign-in credential a `TextField` with a shared Save, and
`correctMyDetails` validated exactly one thing — ten digits. **A client has no
email and no password: the phone number IS the account**, it is what `resolve()`
in `mock/portal.ts` matches to find them, and there is no way back from moving
it wrongly.

**The codebase had already argued this on the other half.**
`components/settings/PhoneChange.tsx` gives the identical field a four-step,
two-code flow and defends the second code even though its brief did not ask for
one: *"the failure it prevents is worse than the one it costs … One extra code
against an account that cannot be recovered is not a close call."*
`DataRights.tsx` even names the asymmetry from the other direction — its delete
has no OTP, *"and that asymmetry with the phone-change flow is deliberate"* — so
this screen's own neighbour was already assuming a phone change was protected
here.

So that component is **shared rather than copied**: it grew a `wire` prop (four
server actions) and an `intact` clause, and both call-sites pass their own. The
actions are props rather than imported by the component because importing both
sets would register the trainer's writes in the portal's bundle and the portal's
in the trainer's.

**And the client's ladder moves every roster**, which is the part that is not
obvious: `resolve()` and `personaFor()` both key on the phone, so a number on two
trainers' lists is one sign-in reading two books. Moving one row would leave the
other answering to a number its owner no longer has. `MyDetails` says so before
the flow starts, and only where it is true.

### Where §14's nominee is stored is the interesting half of F3

Two rights were missing and one is mandatory — Rule 9 of the DPDP Rules 2025
requires a grievance officer appointed, their contact **published**, and stated
timelines, and a data principal must exhaust that route before the Board. Before
this, a client who believed their record was wrong had one route on the screen:
WhatsApp, to the person the complaint might be about.

The nominee's obvious home was `client.metadata`, beside the health text. **It
cannot go there**: `metadata` is one JSON object on the row the TRAINER edits, it
is projected to every trainer read, and `status-actions.ts` read-modify-writes
the whole blob when a trainer pauses somebody — so a nominee stored there would
be visible to the trainer and would travel through a write the client never made.

`client_prefs` is the only table in this book the trainer's half never reads
(verified: `store.clientPrefs` appears in `mock/portal.ts` and `mock/seed.ts` and
nowhere else), which is what lets the visibility card say *"your trainer cannot
see it"* and be telling the truth. It is also two facts about a **third person**
who never agreed to be in this product — the strongest of the three reasons.
`visibility.ts`'s existing `client_prefs` row names it explicitly rather than
leaving it under "settings", and carries `client_prefs.nominee` in `sources`.

### The rest of the thirteen

| | |
| --- | --- |
| **F2** · a client on a phone could not sign out | `.rail{display:none}` below 900px and the client's `TabBar` takes an early return — four tabs, no *More*, no sheet. **Deleting that return is not the fix**: `MoreSheet` builds from the trainer's `PRIMARY`/`ACCOUNT`. `ThisDevice` is a card at the foot of *Settings*, pairing sign-out with the theme on one argument — neither writes anything about the account, which is what the line under the button already says |
| **F5** · 18 paragraphs dressed as headings | Counted out of the rendered HTML: **7 real headings against 18 `.h5`/`.h4`**, six of the seven being card titles, twelve of the eighteen inside one card. `.h5` is pure type and the reset zeroes heading margins, so the element swap moves nothing. Now **33 real headings across the three tabs and zero `p.h5`** |
| **F6** · the destination was thinner than the Home card linking to it | `Home` draws a `Meter`, a nudge and *See your package and payments*; the destination had no meter, no start date, no days remaining, no total. Meter brought across (filling with what is LEFT, per Home's stated rule that a bar must not disagree with its caption), *Started*, days-remaining folded into *Runs until* as two readings of one fact, and a total row |
| **F8** · the notes list re-implemented `CoachNote` | It typed its own `&ldquo;` — the second of the two call-sites that component's docstring names. `kind` was dropped, and the threshold was `> 1`, so **a client whose trainer had written to them exactly once had no notes card at all**. `CoachNote` per row, `kind` back as a `Tag`, `> 0`, capped at ten with the count said |
| **F9** · `me.rosters` reached the component and changed one sentence | `setActiveClient` and `chooseRoster` both existed and `/sign-in/role` was the only screen calling them. One row under the trainer card now, and nothing at one roster |
| **F10** · the header described the screen | *"Training with Arun Prakash"* above a card whose first line is *Arun Prakash* — `PageHeader`'s own docstring forbids it. `buildAccountLead` derives *Since Jul 2025 · nothing owing*, and **the package card's head gave up its `₹ owing` tag** so the duplicated string goes to the header once |
| **F11** · both external links navigated the portal away | `newTab` through `InlineLink` and `Button`'s spread — the one place in this product that pairs `target="_blank"` with `rel="noopener noreferrer"`. The trade is named rather than hidden: an orphan tab on a `wa.me` hand-off is a tidiness problem, losing the screen is a navigation problem |
| **F12** · the card the spec calls the hero | `tone="lead"` — `.card--lead` is the corner wash meaning *start reading here*, deliberately not `.card--acc`. Plus a `tel:` secondary, which `Button` already routes to a plain anchor. `HeroCard` was the obvious component and is the wrong shape: it has no avatar slot |
| **F13** · the empty package was a bare `<p>` | `EmptyState`, copy unchanged — it already refuses to become a storefront |
| **§9** · four facts on the wire and on no screen | *Your arrangement* — goal, sessions a week, session length, where. Read-only, with the sentence that makes `mock/portal.ts`'s refusal visible: *"a training arrangement is agreed between two people"* |

`Table` gained a **`foot` prop**, per the catalogue rule. It had none, and **ten
call-sites had each answered that by abandoning the component** — `OwedTab`,
`LedgerTab`, `GymShareTab`, `WriteOffsTab`, `Team` and the rest hand-write a raw
`<table className="tbl">` with a `<tfoot>`, while §11 has styled `.tbl tfoot td`
from the beginning. The design system had the picture and the component had no
prop for it.

**This pass wrote no CSS.** Every layout is existing DS components and §04
utilities. The one thing it wanted and could not have was an `mb*` step — there
is none, and adding one means editing `webapp.css`, which is copied verbatim — so
it is `mt3` on the following element instead.

### Three defects found in the MOCK, and two of them broke the trainer's half

None was visible to `tsc`, `eslint`, `sync-design` or `check-components`, all of
which were green.

| Where | What |
| --- | --- |
| `/v1/trainers/me/phone/verify` and `/confirm` | **Both answered `json(null, 204)`, and `lib/account/api.ts` reads `res.ticket` off the first and `changed.token` off the second.** `request()` turns an empty body into `null`, so **steps 2 and 4 of the trainer's phone change each threw `TypeError: Cannot read properties of null`** and the panel reported *"that did not save"* on a request the mock had accepted. Found by reading the wire contract against the handler and confirmed with curl, because the failure is indistinguishable from a refusal. Both answer their documented shapes now — and `confirm` re-mints, without which the trainer's next request signs in as a FRESH trainer with an empty book |
| `POST /v1/auth/mode/client` | `clients.find(...)` where `GET /v1/me` answers `clients.filter(...)`. So on a two-roster number **the two routes disagreed about how many rosters exist**: the portal correctly drew a switch for both, and `chooseRoster` — which checks the picked id against what this route names, deliberately — refused every press on the second. The component reported *"that trainer is not on your number any more"*, which was the honest sentence for the answer it got and a lie about the book. Found by manufacturing the two-roster state, since no seeded client has one |
| `mock/db.ts`'s book on `globalThis` | Learned again: a change to the seed's LOGIC needs a `SEED_VERSION` bump as much as a change to its shape. **`SEED_VERSION` is 16** |

And one trap that is the harness's rather than the product's, worth the space
because it cost twenty minutes: **`OtpInput` is one real input under six slots** —
its docstring says *"one real input under six slots, never six inputs"* — so a
driver writing one digit per `.otp input` sets only the first character and the
ladder appears to stall at step 1 with no error. `.otp__in`, the whole code at
once.

### Checked by rendering

Headless Chrome over CDP against the dev server on **`localhost:3100`**, every
behaviour driven as a real mouse event. **The harness is deleted; rebuild one if
this screen is touched.**

Measured at **1440, 430, 390, 360 and 320**, all three tabs: **zero horizontal
overflow, zero elements painting past their card, zero clipped text and zero
targets under 24px effective**. The `.switch` is 38×22 and its `::before` carries
`inset:-5px`, so the effective target is **48×32** — WCAG 2.5.8 met by the
existing hit-slop rule, which costs zero layout.

Driven end to end: every tab, with the strip's `startsWith` lighting the right
one; **the whole phone ladder, both codes** — a wrong code refused, a taken
number refused, the button naming its target (*Move my account to +91 98401
37912*), the move landing, **the portal still resolving after the token was
re-minted**, and the reverse move restoring the original; the nominee named,
withdrawn and re-named; the grievance officer, both timelines, the Board and the
retention sentence; the delete guard refusing a wrong number and accepting both
`9840137911` and `+91 98401 37911`; **sign out at 390px, landing on `/sign-in`**;
and the roster switch re-scoping every panel — *Strength / 3 / 60* → *Fat loss /
2 / 45*, with the meter correctly disappearing for a client with no session pack.

**The trainer's half re-verified after `PhoneChange` changed**: `/settings`
renders, all four steps run, the *intact* clause reads the trainer's nouns, and
the roster is intact after the re-mint. Restored to `9841022119`.

Four personas, covering every branch: `9840137911` (full — meter, table with a
total, two past packs, four notes), `9840275822` (**exactly one note**, which is
F8's threshold, plus the `₹5,250 owing` header branch), `9843171953` (**no pack
at all** — the `EmptyState` and the *no package running* header branch), and
`9843309864`, who correctly redirects to `/sign-in/removed` because their
membership has ended — the guard's own rule that *"the portal is not the place to
find out an arrangement has ended"*.

Contrast, both themes, driven through the real `ThemeSwitch` (poking
`data-theme` is reverted by the app's theme sync, which this file records as
producing a pure artifact): every measured pair clears 4.5:1 — the header line
6.42 / 5.64, the trainer name 17.00 / 18.58, row titles 17.00 / 18.58, reasons
6.05 / 6.17 — and the links step from `#C6F24E` on dark to **`#4F6B0A` at 6.10:1
on light**, which is §01's opening rule holding.

### Verified

`npx tsc --noEmit` clean. `npx eslint` at the recorded baseline — **17 problems,
8 errors and 9 warnings, none in a file this pass touched**. `sync-design
--check` up to date, so `webapp.css` is untouched. `check-components` reports
**299 known, none added**. The background-shorthand gate comes back empty for
every rule this pass wrote, which is all of none. **`next build` was NOT run**,
per this file's own note that it writes `.next/` under a running dev server.

Seed data restored: the trainer's number, the second client's number, and the
nominee are all back to their seeded values.

### Not done, and none of it an oversight

- **The grievance contact is a placeholder and the screen cannot ship on it.**
  Rule 9 is a publication obligation, so a card printing an address nobody reads
  is worse than no card — it is a promise of a route made to somebody who has
  been told they must exhaust it. `lib/portal/grievance.ts` carries the ⚠ and is
  the only place the three fields are written down.
- **The two DPDP periods are from the handoff's reading of the Rules**, not from
  the notified text. They are printed as a commitment to a person who is being
  told to rely on them, so they are named constants with the citation and a note
  to check both before launch.
- **Web push is not wired** — no manifest, no service worker, no
  `requestPermission` — so the notification copy names SMS and WhatsApp. When
  push lands the permission row goes **above** the switches and shows the grant's
  real state; a switch whose delivery depends on a browser permission must show
  the permission or it is reporting a setting rather than a fact.
- **No *show earlier* control on the notes.** The cap says what it withholds, but
  `/v1/me/messages` returns the lot and there is no notes screen to route to.
  Adding one is a decision, not a fix.
- **Chrome is 223px at 390×844 — 26%.** That is `/me/progress` and `/me/plan`'s
  identical figure, so it is the portal's tabbed-screen budget rather than
  anything this pass added, and the fix (standing `.ph__t` down under 900, which
  `.ph--named` exists for) belongs to all three screens or none.
- **Both rosters in the two-roster fixture belong to one trainer**, because this
  book has one. So the switch was proved by the panels re-scoping rather than by
  the trainer's name changing.
- **No real device.** The phone widths are a desktop Chrome with device metrics,
  so `pointer:coarse` does not match — the `.switch` slop was verified by reading
  the cascade and measuring the pseudo-element's inset. `SESSION-VIEW-UX-HANDOFF.md`'s
  M4 method (rewriting the coarse conditions in place via `rule.media.mediaText`)
  is what would settle the targets without a handset.
- **`/v1/me/phone/*` has no backend behind it**, like every other `/v1/me/*`
  route on this half. It is a mock route and `backend/API.md` does not document it
  yet — and the real one needs the signed ten-minute ticket `AccountService`
  already mints for the trainer.

## The client portal's bell — item 8, and one panel for two feeds · 11 Sep 2026

`InclineYou-Client-Portal-Spec.md`'s build order has eight items and the portal
shipped with seven. `PortalShell` recorded the eighth as a deliberate omission —
*"§"Notifications" of the client spec is item 8 of an eight-item build order and
is not built. `TopBar` drops the bell when there is no host, which is what makes
leaving it out a working screen rather than a dead glyph"* — and that was the
right call while there was no feed. There is one now.

| | |
| --- | --- |
| the surface | `.ntf`, the same §03 popover the trainer's bell opens |
| the component | `web-components/ui/NotificationPanel.tsx`, **made generic** |
| the state | `components/shell/NotificationsHost.tsx`, **made generic** |
| the adapters | `components/shell/notificationViews.tsx` · `components/portal/notificationViews.tsx` |
| the words | `lib/portal/notifications.ts` — kinds, tones, routes, every sentence |
| the wire | `GET /v1/me/notifications`, `POST .../{id}/read`, `POST .../read` |
| the table | `client_notification` (`mock/types.ts`), built by the seed's last block |
| the mint | `mintClientNotification`, exported from `mock/portal.ts`, called by **`mock/router.ts`** |

### The panel is one component, and making it so is most of this pass

The brief — *"all trainer actions will be pushed in this notification"* — is a
feed, and the product already had one. The wrong way to reach it is a second
`.ntf`: this file's rule for `web-components/` is that a BEM family is ONE
component with parts, and a portal copy would be the same twelve classes in a
second file that drifts. **The design system committing the defect the design
system exists to prevent.**

So `NotificationPanel` lost four imports — `KIND_TONE`, `hrefFor`, `lineFor`,
`detailFor` — and gained `NotificationView`: a row already reduced to a tone, a
glyph, a bolded name, the rest of a sentence and somewhere to go. Every one of
those four is a decision about **whose feed this is**: `payment` means a client
paid *you*, `hrefFor` lands on `/clients/{id}/payments`, and the empty state
names *"changes your team makes"*. None of it is true on the client half.

What stayed in the component is everything true of a feed whoever is reading it —
the day grouping, the *Unread* filter, the arrow keys, the two empty states, the
horizon, and the two shapes a row can take. What left is in two adapters, one
beside each shell, which never import each other.

`NotificationsHost` went the same way and got **simpler** for it. It used to hold
the server's rows in state and reset them on a render-time `served !==
notifications` comparison; with views built by an adapter the parent hands down a
new array every render, so that comparison would have fired every time and thrown
away every stamp. It holds **only what it knows and the server does not** — a map
of id → when it was read here, merged over whatever the server last said. The
reset is not clever any more, it is unnecessary.

Two things came out of `lib/notifications/` on the way: `byDay` and `unreadCount`
are generic over `{at}` and `{readAt}`, because nothing about grouping by day or
counting what is unread is a fact about whose feed it is. `labelFor` was replaced
by `longAgo`, and the screen-reader sentence is assembled **in the panel** — two
of its four pieces are things only the panel knows, since a row's read state
changes in the browser after the adapter has run and the clock is the one the
host fixed when the panel opened.

### Five kinds, and the one the spec's table does not name

§"Notifications" states the rule the whole surface rests on in four words —
**notifications come from the trainer, not the platform** — so four of the five
are literally a trainer's write landing on this client's book, and the fifth is
the one thing the product observes about the client themselves.

| kind | tone | what it is | its switch |
| --- | --- | --- | --- |
| `note` | `reply` | they wrote to you | `trainerNote` |
| `plan` | `floor` | they changed your programme | `programUpdated` |
| `session` | `diary` | they booked, moved or called off a session | `sessionReminder` |
| `pack` | `money` | they sold, renewed or took money against your pack | `packChanged` |
| `best` | `win` | you hit a milestone | `personalBest` |

**`packChanged` is new and it is the rule rather than an exception to it.**
`NotifySwitches` argued for four switches because the spec's *Send* column has
four rows, and re-reading it, that argument was about the **`Don't send` column**
— no streak warnings, no nags, nothing the platform invents. It was never a cap
on how many things a trainer can do. The feed draws five kinds, so there are five
switches: a category that reached a client's feed with no way to turn it off
would break the promise §5 makes about that card — *"granular, and genuinely
respected"*.

**There is deliberately no `reminder` kind**, though the spec's Send column names
one. `lib/notifications/types.ts` draws the line the whole bell rests on — **a
notification is an EVENT; the queue is a STATE** — and *"Session tomorrow,
6:30am"* is neither: it is a message about the future, it goes stale by itself,
and Home's hero already says it bigger and sooner. `sessionReminder` still
governs what SMS and WhatsApp send, and in the feed it governs `session` rows,
which are things that happened.

**And no row ever notices that a client has stopped.** §1's rule is unchanged and
this feed is built so that the absence of a row is the only thing an absence
produces.

### The switch gates the MINT, not the read

The only reading of *genuinely respected* that survives contact with a record. A
filter on the read means turning a switch back on **refills three weeks of
history the client was never told about**, and turning it off rewrites the past.
So `mintClientNotification` refuses a category that is off, the rows already in
the feed stay, and the seed goes through the same gate rather than around it — a
fixture that can produce rows the running server never would is a fixture that
hides the bug.

Proved both ways: with `packChanged` off a recorded payment minted **nothing**
while the two `pack` rows already in the feed stayed; turning it back on
refilled **nothing**.

### `mock/router.ts` is what makes "all trainer actions" true

A feed seeded at boot and never appended to would demo correctly and be wrong
about the one thing it is for. So the TRAINER's handlers each end by telling the
client what just happened to them — and because the mock holds both books in one
process, that is the honest shape rather than a simulation of one.

Nine call sites: a pack sold, a pack renewed, money against a pack,
`POST /v1/payments`, a session booked, a session `PATCH`ed (which reads the row
**before** the assign, because a move and a cancellation and an edit that changed
neither are three different pieces of news), a session `DELETE`d (minted before
the splice, or the row it describes is gone before it is read), a programme
applied and a programme rewritten. Plus the one the CLIENT's own write mints —
`best`, in the portal's finish handler, beside the milestone it is about.

Two refusals worth keeping:

- **A `pending` payment mints nothing.** That is an invoice the trainer has
  raised, and telling a client *your trainer recorded ₹12,000* about a debt they
  have not settled is a bill dressed as a receipt.
- **`collectedBy` and `gymShareAmount` never travel.** `/v1/me/payments` already
  withholds both, because the trainer's arrangement with their gym is not this
  client's business — and a notification that leaked them would be the same
  disclosure through a smaller door.

`subjectAt` carries the fact `at` cannot. On a `session` it is the SLOT, so a
booking made on Sunday for a Thursday does not date itself to Thursday; on a
`plan` it is the block's own birthday, so `subjectAt === at` means *wrote you a
new plan* and anything earlier means *changed your plan* — **without a second
kind and without a boolean the wire would then have to define.**

### The copy, and the one place it inverts the trainer's

The trainer's feed bolds the CLIENT, because that is what a trainer scans a list
of twenty-four people for. A client has one trainer, so the name is not a
disambiguator — it is the point. §"Notifications" turns it into a test: *"a
notification that reads as coming from a real person who knows them gets opened;
a generic nag gets the app deleted."* A row opening *Your programme was updated*
is the generic nag, written by a product about itself.

`best` is the one row the trainer did not do, so it does not claim they did — it
is second person, *You hit a new best*, the only row on this feed about the
reader.

Every row has somewhere to go, which the trainer's cannot promise: `hrefFor`
returns `null` for a row with no client and the panel draws a fact you cannot
click. Every row here is about the person reading it.

### `.ntf__ic--win` is the one line of CSS, and it is an alias

§04 ships five plate tones; the trainer's four kinds use four and the client's
five want all five plus one. The values ARE `--team`'s — `--tx-remote` on
`--tx-remote-soft`, the one distinct plate left — and what was wrong is the NAME:
a milestone wearing `ntf__ic--team` is this half calling purple "team", and the
next reader greps `--team` to find rows about a coach being reassigned and finds
every personal best in the client's feed.

In `app.css` with its reason beside it, never `webapp.css`, and
`background-color` rather than the shorthand — this stylesheet's own law, written
after the shorthand silently deleted `select.ctl`'s chevron on focus.

### And `NotifySwitches` was saying something that is no longer true

Its line read **"Nothing is sent to this browser."** True when written, and the
bell made it false: every category now also lands in the panel behind the top
bar, on this browser, on every `/me/*` screen. It names the bell first, then SMS
and WhatsApp.

**There is still no push and still no permission row.** Sweeps for
`Notification.requestPermission`, `serviceWorker`, `pushManager` and `web-push`
come back empty and there is no manifest in `public/`. A row reading *Reminders
on this device — Turn on* against no service worker is the dead affordance this
codebase keeps deleting. When push lands the row goes ABOVE the switches and
shows the grant's real state.

### The bell is on the workout flow too, and that is deliberate

`/me/workout/:id` renders inside this shell. The alternative is a shell that
drops a control on one route, which is the thing this codebase keeps deleting
from the other direction — and the feed carries no verb, so the worst it can do
is be read.

### Checked against the running server, and NOT by rendering

**The house convention was only half-kept, and the half that was missed is the
important one.** The Chrome extension was not connected in this session, so
**nothing here has been looked at**: no geometry, no contrast pass, no phone
widths, no click-driven behaviour, no light theme. This file records the cost of
skipping that step — *"a screen shipped blank and stayed blank"* — and the defect
classes this portal's own passes keep finding (a `.stats--n` with no narrow rung,
a `.tbl` measure, a `.ph__sub` repeating a card, a child clipped inside
`overflow:hidden`, a coarse-pointer rule that is itself the bug) are every one of
them invisible to the gates below. **Rebuild a harness and open the panel before
this ships.**

What WAS driven, against `localhost:3100` over HTTP:

- **the feed** — 24 clients, **76 rows, all five kinds** (`plan` 24, `pack` 21,
  `note` 13, `session` 11, `best` 7), newest-first, inside 21 days, no
  `clientId` in any response; a second client's rows with **zero** overlap with
  the first; **an empty feed** (Aditya Pillai) and a one-row feed (Divya
  Krishnan), so the empty state and a quiet bell are both reachable;
- **the copy layer over those same 76 rows**, through the real
  `clientLineFor` / `clientDetailFor` / `CLIENT_KIND_TONE` / `clientHrefFor` —
  **23 distinct shapes, zero defects**, no `undefined`, no `NaN`, no unexpanded
  template, no empty sentence, no missing tone;
- **every mint site**: apply → `NEW`, patch → `CHANGED`, pack sold, money against
  a pack, renew, book, move, cancel, `DELETE`; a **pending** payment minting
  nothing; the gate closing and the past not refilling;
- **read, idempotently** (a second press keeps the first `readAt`), another
  client's id answering **404 and never 403**, and mark-all taking 10 unread to 0;
- **both bells server-side**: the client's on all five `/me/*` routes reading
  *Notifications, 10 unread* with a `9+` badge, and the trainer's **unchanged at
  5 unread**.

`npx tsc --noEmit` clean. `npx eslint .` at the recorded baseline — **17 problems,
8 errors and 9 warnings, every one pre-existing and none in a file this pass
touched**. `check-components` reports **299 known, none added**.
**`next build` NOT run**, per this file's own note.

**`sync-design --check` reports `webapp.css` STALE, and that is NOT this pass** —
the working tree already carried two uncommitted edits to it (the `.tbl .num`
font-family removal and the `.mono` comment) when this session began. Nothing
here touched that file; the delta went to `app.css`, which is where a delta
belongs.

**`SEED_VERSION` is 17.** A table was added and the book lives on `globalThis`.

### Not done, and one of them is a demo gap

- **No rendering pass**, above. It is the first thing to do.
- **`best` is not on the demo client's feed.** `9840137911` has `note`, `plan`,
  `session` and `pack` and no milestone inside 21 days, so the `win` plate — the
  one tone this pass added — cannot be seen on the screen the demo opens.
  `9841654932` (Ananya Balaji) has two and is where to look. The data is
  deliberately not fabricated to fix it: a milestone's whole value is that it
  fired ON a day, and seeding one that did not happen is the book asserting
  something.
- **The demo book holds this pass's test writes** — a few sessions, payments and
  programmes against Karthik Menon and Meera Reddy. `mock/db.ts` marks a written
  book dirty and never rebuilds it, so **restart the dev server to reseed**.
- **Nothing is pushed anywhere.** The switches are honoured at the mint and the
  bell is the only channel that exists; SMS and WhatsApp are named in the copy
  because that is what the product intends, not because anything sends.
- **`/v1/me/notifications` has no backend behind it**, like every other
  `/v1/me/*` route on this half, and `backend/API.md` does not document it yet.
- **No real device.** `pointer:coarse` was not exercised — `.ntf__i`'s 44px raise
  lives in the application-wide coarse block and was not re-measured.

## The client's own copy, on the real stack · 12 Sep 2026 · V2

The feature designed in the mock repo (`InclineYou-MockUI` — *Assigning is a
CLONE, and the clone has a screen*, and the three passes under it) landed here,
**and the backend gap it needed was closed in the same change** rather than
recorded. `BACKEND_GAPS.md`'s entry for `PUT /v1/programs/{id}/exercises` is now
under *Resolved*, with what shipped beside it.

| | |
| --- | --- |
| the copy, editable | `/clients/:clientId/program/:programId` · `components/clients/plan/` |
| the draft, shared with the builder | `lib/programs/draft.ts` |
| opening a day, animated, shared too | `lib/programs/reflow.ts` |
| what a copy says that its blueprint does not | `lib/programs/diff.ts` (pure) · `program/PlanDiff.java` (the same rules, server-side) |
| the push, per client | `components/programs/AssignedList.tsx` |
| the prompt after a blueprint edit | `Builder.tsx` · `.pg__push` |
| the schema | `V2__program_shape.sql` — four columns on `program` |

### The one thing the port had to learn, and it is not in the mock

**A template's day is an ORDINAL SLOT and a client's copy's is a CONCRETE
WEEKDAY.** `copyBlueprintInto` has translated the rows through
`program.schedule` since V24 — the mock's `apply` does not, it copies the slot
through — so three things the mock got away with are wrong here, and each would
have been silent:

- **the shape.** Copying `template.day_labels` onto a copy verbatim puts the
  blueprint's name for slot 3 on a Wednesday a Mon/Tue/Thu/Fri client never
  trains, and leaves their Thursday unnamed. `TemplateService.shapeFor` re-keys
  every label through the schedule, and `V2`'s backfill does the same in SQL for
  the programs that already existed.
- **the diff.** Comparing an unmapped blueprint against a copy reports every row
  on both sides of the ledger for a plan nobody has touched. `PlanDiff.between`
  translates first.
- **the board's own day words.** `DAY 2` on a copy is not the second day of the
  plan, it is Tuesday — which on a Tue/Fri client is the FIRST session of their
  week. `blueprint.ts` grew `ordinalDayWord` and `weekdayWord`, and `WeekBoard`,
  `DayCard`, `PhoneProgram` and `LibraryDock` take one optional `dayWord` prop.
  The builder passes nothing and keeps the ordinal; this screen passes
  `weekdayWord` and names the real day.

**The mock repo deliberately still passes `ordinalDayWord`**, because on that
wire a copy's days really are slots — its `ClientPlan.tsx` carries the whole
note. That is the one line where the two trees differ on purpose, and the better
end state is fixing the MOCK: a mock whose wire disagrees with the product's
will eventually teach a screen something false. It is a seed-and-router change
there, not a UI one.

### What the backend gained

- **`V2` · `program.day_labels`, `.weeks`, `.training_days`, `.synced_at`.**
  Backfilled: the shape translated through each client's schedule, `synced_at`
  from `created_at`. `updated_at` is deliberately untouched by every statement in
  that file — it drives the sync cursor, and moving it would push every program
  on the server to every phone as though a trainer had edited it.
- **`PUT /v1/programs/{id}/exercises`** — the builder's save, one transaction,
  rows and shape together, and it does **not** move `synced_at`: tuning a copy is
  not the same act as taking the blueprint.
- **`behindTemplate` reads `synced_at`**, where it read `updated_at`. That was
  sound only while `updated_at` could not move for another reason, and an
  editable copy moves it on every save — so a copy tuned this morning reported
  itself up to date having never received the blueprint's edit.
- **`AssignmentResponse.divergence`**, computed by `PlanDiff`: what each copy
  says that the blueprint does not. `behindTemplate` is a clock and cannot tell a
  copy nobody has touched from one a trainer rewrote for an injury, while the
  push replaces the whole prescription either way.

### Verified

**Backend:** `./mvnw test` — **260 tests, 0 failures**, including
`TenantIsolationTest`. `ProgramAuthoringTest` gained four cases and one of its
existing ones was rewritten, because ageing `updated_at` no longer fakes
staleness — which is the improvement, and the new case asserts the other half:
editing a copy leaves `behindTemplate` false.

**On real rows**, against a second instance on `:8090` (this repo's own
convention) with a minted dev JWT, over the seeded demo data:

- the V2 backfill on a real copy: `day_labels {"1":"Push","3":"Pull","6":"Legs"}`
  — Mon/Wed/Sat — against a blueprint keyed `{"1":"Push","2":"Pull","3":"Legs"}`.
  The translation, visible.
- the builder's save: one PUT, 9 rows, `weeks` 8 → 9, a label renamed, a movement
  swapped and a cue added — with **`synced_at` unmoved** and the blueprint
  unchanged.
- the push panel then read *total 3 · shape "Runs 9 weeks, not 8" · note
  "Monday · Push (Meera) · … " · swapped "Monday · Push (Meera) · Barbell bench
  press → Dumbbell arnold press"*.
- `POST /resync`: 9 removed, 9 added, the shape back to the blueprint's, the
  client's own weekdays (1, 3, 6) intact, `syncedAt` moved, and the row back to
  **LEVEL** with divergence 0.
- a malformed row in a bulk save is a 500 that rolls the whole transaction back
  — the copy still had its 9 rows afterwards. It is the same behaviour the
  per-row `POST` has always had for a bad uuid; worth a 400 one day, and worth
  knowing the delete-then-insert cannot strand a plan.

**And one defect found on real rows that no test data would have produced:** two
seeded copies have **no `schedule`**, so the blueprint's slots pass through
untranslated — correct for pairing, because both sides are then in the same
numbering — and the sentences printed slot 1 as *Monday* for a client nobody had
ever scheduled. `PlanDiff` only names a weekday where a schedule says which
weekday it is; without one it says `Day 1`, which is the same word the
blueprint's own board draws.

**Contract check**, rather than a claim: every field the real API sends on
`ProgramResponse`, `AssignmentResponse`, `PlanDiff` and its lines is in the
matching TypeScript interface, and the `kind` values are in the union.

**Web:** `npx tsc --noEmit` clean, `npx eslint .` at the recorded baseline (9
warnings, 0 errors, none in a file this pass touched).

### Not verified, and what it needs

**Nobody has LOOKED at these screens against the real backend.** The components
are byte-identical to the mock's, where every one of them was driven and
measured — and the `dayWord` prop path was driven there too — but the real tree's
own convention is rendering, and two things stand between here and it:

1. **the backend on `:8080` is running pre-V2 code.** It was started before this
   change; `spring-boot:run` does not reload. Restart it and the feature is live
   for the `:3000` dev server, which already points at it.
2. `next dev` refuses a second server in one directory, so a browser pass
   against `:8090` needs the copied-tree harness this file's earlier sections
   describe.

Until (1), `/clients/:id/program/:pid` renders against a backend with no shape
columns and no divergence — which degrades honestly (the builder derives days
and weeks from the rows, and the push panel treats a missing `divergence` as
*unknown* rather than as *nothing*) but saves will 405.

## Adding a client books the week and assigns the plan · 12 Sep 2026

The product owner's flow, in their own words: *we sell a session and choose the
days the client is willing to have a session; on Continue, book sessions on
those days here itself; then list plans according to the client's workout days
and let the trainer pick one; on Continue, assign it and open
`/clients/{clientId}/program/{programId}`.*

**Two of those four steps could not work, and one of them had never worked.**
The flow's own `applyTemplate` posted `/v1/templates/{id}/apply` with a client
id and nothing else — and a template's days are ORDINAL SLOTS, so
`validateSchedule` refuses the apply outright unless the request carries exactly
one weekday and time per slot. Verified against the running backend: **every
assignment from this flow was a 400**, and the handler discarded the
`ProgramSummary` it would have been answered with, which is why its last press
landed on the roster rather than on the plan.

### What each step does now

| | |
| --- | --- |
| **3 · Week** | *Continue* is what books the sessions — it always was, and the screen now says so before the press and again after it |
| **4 · Plan** | the blueprints that train the number of days this client actually trains, the mapping read back, and *Assign and open the plan* |

**The booking was never missing; the sentence was.** `PUT /v1/clients/{id}` with
a `weeklySchedule` runs `DiaryService.reconcile` in the same transaction — V3 —
so this press has been writing a client's next twelve mornings into the diary
since it was built. It reported nothing, so the one write on this screen that
produces something a client will turn up for looked like a form saving a
preference. It now says both halves:

- **before**, from `layoutSessions` — the module that exists to be run on both
  sides of the wire, and the read-out `PackPanel` already makes for its own
  reason: *"Continue books 12 sessions · First on Mon · 14 Sep, last on Fri ·
  9 Oct — 3 a week against 12 sessions."* Bounded by the pack step 2 sold, so a
  session pack owes its count, a monthly is an uncounted rhythm, and a skipped
  pack lays the week four weeks ahead — which is `SessionPlanner.OPEN_ENDED_WEEKS`
  and is a real booking, not a promise. `short` is drawn when the validity window
  closes before the pack is used up, because that is a conversation to have while
  the terms can still change.
- **after**, from the server — `ClientResponse.sessionsBooked` and
  `.firstSessionAt`, appended last, the pair `PackageResponse` carries for the
  sale. It is `DiaryService.Result`'s own count of what THAT request wrote and
  never a count of the diary afterwards: a client with four sessions already on
  the board would otherwise come back as sixteen. **Null** when the write did not
  touch the rhythm; **zero** is a real answer and gets its own sentence.

**A day with no hour is refused, not dropped.** `selectedSlots` is keyed by
weekday and only ever holds the answered days, so a trainer who tapped Mon/Wed/Fri
and forgot Friday's time saved a TWO-day week in silence — and then met step 4
offering only two-day plans, with nothing on either screen explaining where
Friday went. The refusal names the days, and **answering clears it**: found by
rendering, where the sentence stayed up in the app's validation red directly
above a green card reading *Continue books 12 sessions*.

### Step 4, and the one translation it exists to make

The shelf is filtered against **`agreedSlots`, not the day chips** — the schedule
that was SAVED is what the apply has to cover, so offering a three-day plan to a
client whose third day has no hour on it is offering a 400.

`scheduleFor` pairs the plan's ordinal days with the client's mornings **in
order**: the plan's first training day is their first morning of the week.
`AssignPanel` seeds its grid the same way and states the same rule; both sides
are 1 = Monday, so nothing translates, only pairs. **The pairing is drawn** —
*Push → Day 1 of the plan → Mon 07:30* — because a mapping nobody can see is one
nobody can correct, and it is the whole of what `program.schedule` will hold.

**With no week agreed the shelf is not drawn at all.** Every plan on it would be
a control that answers with the server's refusal, so the step says *the days come
first* and its button is one step back. `Assign and open the plan` is offered
only when `scheduleFor` returns a pairing, which makes the server's sentence a
backstop rather than the thing a trainer reads — and that matters here, because
this backend answers `ResponseStatusException` with a bare 400 and no `detail`,
so `validateSchedule`'s own wording never reaches the browser.

### Three defects it found, and none was visible to a gate

`tsc`, `eslint` and the backend compile were green on every one.

| Where | What |
| --- | --- |
| `TemplateWire.dayLabels` | Declared `string[]`; `/v1/templates` sends a Java `Map<String,String>`. So `dayLabels.length` was `undefined` on every blueprint and the *plans that fit this client's week* filter was `0 === weekdays.size` — **nothing on the shelf the moment a trainer picked any days**, and a count tag reading a bare " days". `trainingDays` is what the filter actually wanted and was never fetched. The `TemplateExerciseWire` bug again: a Java map serialises whatever keys it holds and a TypeScript interface is a claim the JSON never has to satisfy. |
| `lib/programs/diff.ts` | **A freshly assigned plan reported 15 changes.** The browser's diff compares a blueprint against a copy and had no way to line them up — ordinal slots against weekdays — so on a Mon/Wed/Fri client every row landed on both sides of the ledger: *Tuned for Vijay — 15 changes · 6 added · 6 removed · 3 to the shape*, under a line reading *this copy is level with the plan it came from*. `PlanDiff.java` takes that map and says so in its header; this half had no parameter for it, because `program.schedule` was not on the wire. `ProgramResponse.schedule` is appended; `bySlot` translates once at the top of `diffPlans`. **`Builder` passes none and is unchanged** — it diffs a blueprint against its own draft, where both sides are already in one numbering. |
| the error banner | A hand-written `.why why--warn` with no role — which is `Message`'s own docstring: `.why` is a rationale callout and this is what went wrong with the press. Every error on this flow used to follow a failed REQUEST, so *Saving…* at least implied something had happened; step 3 refuses locally and stays exactly where it is. `Message tone="err" alert`. |

### The prop both shells had taken and neither passed

`now`. `NewClient` destructured it as `_now` and `AddClientDrawer`'s own note said
it "is still taken and still unused". The preview wanted it: the dates a pack
will book start from *now*, and `Date.now()` during a render is an impure call
the compiler refuses — `react-hooks/purity` caught it, and it is the clock
disagreement this file already records for `useNow`. It does not tick and does
not need to: the preview is an arrangement in days, and what lands is counted by
the server on the press.

### Checked by rendering, against the dev database

The convention this file sets, honoured. The backend rebuilt and restarted on
:8080, the dev server on :3000, a JWT minted against the dev secret, and a
stdlib CDP driver clicking the real controls at **1440×980 and 390×844**. **The
harness is deleted; rebuild one if this flow is touched.**

Driven end to end on a real trainer with 20 clients, 6 blueprints and 12
working-hours rows: the phone check; a 12-session pack sold; three days picked;
the refusal for a day with no hour and its clearing; the preview; the press;
`12 SESSIONS BOOKED · Mon, Wed and Fri at 07:00, starting Mon · 14 Sep`; the
shelf narrowing to *2 fit 3 days a week*; the mapping; and the landing on
`/clients/{id}/program/{id}` reading **Matches the plan**. Plus the two branches:
a two-day week with **no pack** (*2 a week, four weeks ahead*, six booked, three
2-day plans offered) and a **skipped** week (*the days come first*). Zero
horizontal overflow and zero clipped text at both widths — the three `.rad` nodes
a probe reports are its 32px hit-slop, not ink.

Verified on the wire first, which is what proved the 400: the old request shape
answers `HTTP 400`, the new one answers a `ProgramSummary`, and the diary comes
back named by the plan — *Mon Push · Wed Pull · Fri Legs*.

**Backend:** `./mvnw -B test` — **273 tests, 0 failures**, including three new
cases in `SaleBooksSessionsTest` (the figure and the first date, a week with no
pack behind it, and a write that is not about the week claiming nothing).
`npx tsc --noEmit` clean; `npx eslint` at the recorded baseline — 4 warnings,
0 errors, none in a file this pass touched. **`next build` NOT run**, per this
file's own note that it writes `.next/` under a running dev server. Every client
this pass created has been deleted; the roster is back at 20.

### Not done

- **The server's refusal sentence still does not reach the browser.** This
  backend sets no `spring.mvc.problemdetails.enabled`, so a `ResponseStatusException`
  serialises as `{timestamp,status,error,path}` — the trap this file records for
  V33's, V34's and V35's refusals. `validateSchedule`'s wording is good and
  nobody can read it. The fix is `TemplateRuleException` + a handler, the shape
  `PackRuleException` already established, and it is a pass of its own.
- **Nothing here enters sync**, like V30 and V32–V36: two appended response
  fields and no schema change, so no phone build notices.
- **No real device.** Both widths are a desktop Chrome with device metrics, so
  `pointer:coarse` does not match — the flow's own 44px slot rule
  (`.acflow .slot{min-height:44px}`) was read out of the cascade rather than
  measured on a handset.

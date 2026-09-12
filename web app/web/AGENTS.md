<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# InclineYou — web app

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
| **the sending** | Today's hero (the trailing card and the evening card), the attention queue, the roster's action column, the dues list, the price list's *Ending soon*, a no-show session, the client's file |
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
| the dues list | *Remind* opened a right-hand panel that explained what a reminder is and then offered a button that drafted one — three surfaces for one act, on the screen a trainer opens to chase eight people. `components/money/RemindPanel.tsx` is **deleted** and the row drafts directly |
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

Name · what's up · **status** · sessions left · owes · last attended. Eight
columns, the same eight as before: *Where* gave up its column to *Status* and the
mode moved onto the client cell's meta line beside the phone, which also keeps the
number visible on every row — it is half of what the search matches.

Two smaller ones: **Last logged became Last attended**, which is a workout log OR
a session someone ticked off, whichever is later, because an unlogged session a
client turned up to is still a session they turned up to (the `quiet` band keeps
reading logs only — that one is a fact about the trainer's logging, and the deck
already says so). And the **Owes** cell is toned rather than plain, red past
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
| the header | name, status, three verbs | + the pack, the dues, WhatsApp and call |
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
- **The pack and the dues moved out of Overview into the header**, so they are
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
| the ledger's method cell | `text-transform:capitalize` title-cases every word, so it read **"Upi · You Collected"** — an acronym lower-cased and a plain phrase shouting. The method is a proper noun and the rest is not, so they are cased separately in TS and the CSS does nothing. |
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

Seven tabs, flat: *Ledger · Owed · Packages · Gym share · GST · Write-offs ·
Reports*. The alternative — three tabs (Money · Packages · Reports) with the money
book's six underneath the first — was rejected because two stacked strips is the
`BUILD`/`GROW` taxonomy again, one level down.

**The tab is in the URL now.** `Money.tsx` held it in `useState` seeded from a
prop and moved it with `router.replace`, so the param and the state could
disagree and nobody could link anyone to *Owed*. It has to be a real param
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
- `MONTHLESS_TABS` is `PERIODLESS_TABS`, same three members. *Owed* still draws
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

The Ledger tab of `/business` was drawn against the money book's own vocabulary —
*Billed · Collected · Gym share · Yours* — and a trainer does not open this screen
holding any of those four words. They open it holding one of three questions, and
this pass makes the top of the screen answer exactly those three:

| Tile | The question | Where the figure comes from |
| --- | --- | --- |
| **You earned** | how much did I earn this month? | `computeLedger().yours` — collected in the period, gym's cut out |
| **Owed to you** | who owes me? | `computeOwed()`, **whole book as of now** — a link, not a filter |
| **Still to deliver** | what's coming? | `computeUpcoming()` — new, and it had no answer anywhere before |

### The tiles stopped filtering, and the chips started

The old tiles did two jobs — summary and table filter — which is why *Yours*, the
one figure a trainer most wants, had to be the inert fourth one that could not be
pressed. Splitting them frees all three to be questions and moves *Collected ·
Pending · Gym share* into chips on the ledger card, beside the rows they narrow.
**No filter was dropped.** Billed, Collected and the gym's cut are all still on
screen in the side summary card, where they were already drawn, which is what
keeps the headline figures argue-with-able.

*Owed* is the one tile that is a link rather than a filter, and the reason is the
same one `PERIODLESS_TABS` gives: a debt does not stop being owed because you
looked at July. It counts the whole book as of now, so filtering the period's rows
by it would answer a narrower question than the tile asks.

### `computeUpcoming` — the question the product could not answer at all

**The value of coaching already sold and not yet delivered.** *Billed* is history
and *Owed* is a debt; the work standing between a paid-up client and their last
session appeared on no screen in either half of this product. A trainer with
₹40,000 on the books and a quiet week is in a different position from one with
neither.

Pro-rata by sessions where there are sessions to count — a ₹12,000 twelve-pack
with five left is ₹5,000 — and the whole amount for a monthly pack, which is a
duration with no smaller unit to divide into. **Paused packs are counted**, for
the reason `paused_at` is a column and not a status, and counted *separately* as
well so the tile can say so: the same figure made mostly of paused packs is a
different month.

### The trend chart dates by `paid_at`, and the ledger does not

Six bars, and the brief's ceiling — "a simple bar chart of the last 6 months.
Nothing more" — is the feature. The one thing to know before touching it:

> `computeLedger` and `GET /v1/payments` window on **`created_at`**, deliberately:
> a month's *billing* is what was raised that month, and dating by settlement
> would move an invoice into whichever month it was paid in and drop every unpaid
> one — which is what *still owed* is made of. `computeTrend` windows on
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
`onClick` at all, and the ledger card's *CSV* button likewise. Both are live, and
what they export is what the tab in front of the trainer is showing — *Owed* gives
the chase list, GST gives the rolling twelve months a filing needs, everything
else gives the period's ledger.

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

A throwaway `app/fxreport` route building both screens' data from synthetic rows
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# InclineYou — web app

The desktop half of a trainer-first coaching app. The **trainer console** and the
**client portal** both live here; the gym admin console is slated for it too,
which is why this is Next rather than a static bundle.

Its design set is `../Design/webapp/webapp/` — one HTML file per screen, each an
argument as well as a picture. Read the file for the screen you are building: the
`<p class="unit__note">` under every frame says why the markup is what it is, and
those reasons are load-bearing.

> **`AGENTS-ARCHIVE.md` beside this file is the unabridged build log** — every
> pass from 23 Aug to 12 Sep 2026, with the measurements, the defect tables and
> the full argument behind each rule below. This file carries the rules; that one
> carries the why. Grep it by screen name or CSS class when a rule here reads as
> arbitrary.

---

## Where this tree came from

Ported wholesale from the mock-UI repo (`InclineYou-MockUI/mock-ui/web`) on
12 Sep 2026 and re-pointed at the real Spring backend. Three consequences:

1. **There is no mock, and there must not be one.** The mock served `/v1` to
   itself from `app/v1/[...path]/route.ts`. Neither that route nor `mock/` was
   copied. `.env.local` points at Spring on `:8080`. **No product file ever
   imported `@/mock`** — that is why the port was a copy rather than a rewrite,
   and it is a property worth keeping.
2. **Comments throughout still point at `mock/portal.ts`, `mock/types.ts`,
   `mock/router.ts`, `mock/seed.ts`.** Those files are real, in the sibling repo,
   and are the reference implementation of endpoints this backend does not have
   yet. Deliberately not copied: a mock that answers alongside the real backend
   is a mock somebody eventually ships.
3. **`BACKEND_GAPS.md` is the list of what does not work yet** and is the input
   for the next backend pass. Largest by a distance is the **client portal** —
   ~30 endpoints under `/v1/me`, against a backend whose whole client-facing API
   is the offline phone's sync envelope.

**Re-ported on 23 Sep 2026** from mock commit `0975f18` plus its uncommitted
tree, the same way: the mock's `app/`, `components/`, `lib/` and
`web-components/` copied whole, `mock/` and `app/v1/` left behind, `XREP_*` /
`xrep_*` renamed to `INCLINEYOU_*` / `inclineyou_*` (case-sensitive — `maxReps`
contains `xReps`), and this repo's `package.json` kept. **The mock won every
collision.** Local work done here between the two ports and never made in the
mock — V5's Settings › Measuring tab and Body card, sessions under
`/clients/:id/sessions`, `lib/clients/packs.ts`'s multi-pack balance, the
Program tab's `PlanShelf` — was dropped; it is recoverable from the git ref
`refs/backup/pre-mock-redesign`. **`backendGaps-latest.md` is the current gap
list**, route by route against the Spring controllers, and supersedes
`BACKEND_GAPS.md` as the input for the next backend pass.

Also absent here and referenced by the archive: `../scripts/sync-design.mjs` and
`check-components.mjs`, and the `check:design` / `check:components` npm scripts.
**Those gates live in the mock repo and do not exist in this tree** — if you want
them, port them; do not claim to have run them.

---

## THE RULE THAT REVERSES A DOC

**The web app is ONLINE-ONLY. Everything writes straight to the server.**

The root `CLAUDE.md` says "offline-first is the architecture, not a feature" —
true of `app/`, **false here**. The design set is worse: authored offline-first
and says so all over (`webapp-dashboard.html` "writes to this browser first";
`webapp-settings.html` gives the sync queue a full screen). Decided 23 Aug 2026.

So **do not build**: the dashboard's offline banner, the top-bar sync pill, the
Settings sync-queue screen, `webapp-c-status.html`'s offline states, the
console's `.sets tr.queued`, or frame 1a's "everything after it works offline".

The portal is online-only too — so no service worker, no manifest, no local set
queue, despite `InclineYou-Client-Portal-Spec.md` asking for a PWA.

---

## Talking to the backend

**The browser NEVER reaches Spring.** `lib/auth/api.ts` is `server-only` and
calls `INCLINEYOU_API_URL` from the Next server; screens reach it through server
actions. Two consequences:

- **The backend has no CORS configuration and needs none.** Do not add a
  `NEXT_PUBLIC_` API URL and fetch from a client component.
- **The JWT is in an httpOnly cookie and is absent from browser JS.** 7-day token
  (`app.jwt.expiry-minutes: 10080`). Never return it to the client;
  `VerifyResult` carries a destination instead of a token.

`backend/API.md` is the wire contract — change an endpoint, change that file in
the same commit. Both 429s on `/v1/auth/**` mean opposite things: **branch on the
`code` field, never the status.**

`isApiFailure` in `lib/auth/api.ts` draws the line between a refusal / unreachable
server and a bug. Anything else is rethrown — a `catch` that swallows everything
turns a crash into "the server said no", which cost two silent redirects.

**Never reach for `/v1/sync/pull` on a built screen.** `lib/setup/api.ts` allows
itself one and says why — setup is only reachable while the account is nearly
empty. Everywhere else it means shipping the 1,324-row exercise library and every
set log ever recorded to draw one screen. `/today` makes nine scoped requests.

### Cookies

| | |
| --- | --- |
| `inclineyou_token` | the JWT, httpOnly, 7 days |
| `inclineyou_client` | the chosen roster. A **request parameter, not a permission** — the sync controller re-checks it against the token's phone every time |
| `inclineyou_wall` | which wall a verify sent them to (30 min) |
| `inclineyou_pending_phone` | the pending token between two sign-in screens |
| `inclineyou_setup_skipped` | 24h — "I passed on that in this sitting" |
| `inclineyou_phone_change` | the 10-min signed ticket, httpOnly, never in JS |
| `inclineyou_workspace` | **session** — the book open in this sitting |
| `inclineyou_workspace_default` | a year — the book that opens the app |

`signOut` clears **all** of them: the next person on a shared gym desktop may be a
different trainer, and a leftover `inclineyou_setup_skipped` makes *their*
onboarding skip steps they never saw.

---

## Policy numbers

`lib/auth/policy.ts` mirrors `app.otp` in the backend's `application.yml`, which
is the only enforced copy. `app/src/api/auth.ts` is the third. **Change one,
change all three.** The mobile *design document* says 5 attempts and a 5-minute
lock; the server says **3 and 10**, and the server wins.

`COOLDOWN_DAYS` (never nudge one client twice in seven days) has **four** copies:
`app/src/nudges/rules.ts`, the backend's `NudgeService`, `lib/nudges/cooldown.ts`,
and `deck.ts` — which **imports** the third rather than restating it.

---

## The two stylesheets

`app/styles/webapp.css` is the design system, **copied verbatim** from
`../Design/webapp/webapp/assets/webapp.css` and never edited — its values are the
same tokens as `app/src/design/tokens.ts` on mobile, and a value edited here
drifts from the phone. Only the review-page chrome was dropped (§02's `.doc__*`,
`.unit`, `.viewport`, `.bench`; §05; §22; §23); section numbering is preserved.

`app/styles/app.css` holds every delta, each with its reason in a comment. To
change a colour, radius or spacing step: re-copy webapp.css. To change how the
app uses one: edit app.css.

**The one rule the stylesheet opens with, because it has caused four real bugs:
`#C6F24E` is a FILL, never a stroke and never text on a light ground.** On light
it steps to `--tx-accent-text` (`#4F6B0A`).

Other standing facts:

- `.affix` carries the chrome (border, fill, radius, focus halo) and the inner
  `.ctl` is flat. A trailing `.affix__p` after the input flips the seam — **the
  "prefix only" note in `PackSheet.tsx` is stale.**
- `.why` is restored in app.css (webapp.css's header wrongly lists it among the
  removed review chrome). It has no BOX rule on this half — callers wrap it.
- The motion vocabulary is **seven `tx-*` keyframes and nothing more**; anything
  else is a transition. `backdrop-filter` is never animated. Everything collapses
  under `prefers-reduced-motion` / `prefers-reduced-transparency`.
- Entrances use a transition plus `@starting-style`, not a new keyframe.
- `--tx-ease-real-spring` (a sampled `linear()`) is the toast deck's alone.

---

## Cross-cutting traps — the bugs this codebase keeps re-finding

Every one of these shipped at least once. Most were invisible to `tsc`, `eslint`
and `next build`. Read this section before writing CSS or a probe.

### CSS

1. **Equal specificity, later in the cascade, wins — and a media query adds no
   specificity.** Nine-plus instances: `.body--flush`, `.srow--h2`, `.ph__id`,
   §24's panel rule, `.ctl:focus`, `.pal__i`, `.mnystats`, `.setg__acts`,
   `.menu__note`, `.asmv__bar--here`. **Fix by specificity
   (`.slist .srow--h2`), never by moving a rule down the file.** A specificity
   defeat can also invalidate a *measurement* — a probe rule written at the
   wrong weight silently loses. **A SHORTHAND is the form that hides:** the
   check-in's marked row lost only its `padding-inline`, because `.asmv__bar`'s
   `padding:9px 0` sat thirty lines below the modifier and reset the inline
   axis while the negative margin meant to be cancelled by it applied — so the
   row drew 10px left of every other row and its bar 10px wider, with nothing
   overflowing and no gate failing. Reported from a screenshot.
2. **An inline `style` outranks every selector, including a media query.** Six
   instances (`PacksForm`'s work-mode cards, `/packages`' `gridTemplateColumns`,
   `OverviewTab`'s `Row`, `.rp-panel`'s width, `PackSheet`'s measure, Reports'
   two card rows). **Never set layout from the style attribute.**
3. **A `background` SHORTHAND in a state rule resets `background-image`.** It
   deleted `select.ctl`'s chevron three separate times. **A state rule touches
   `background-color`, never the shorthand** — base rules that define a resting
   background may keep it. Gate:
   `grep -n 'background:var(--tx-field-hover)' app/styles/*` must come back empty.
4. **A viewport breakpoint cannot see a container's width.** The rail expands and
   collapses, so the same viewport hands a component two different boxes. Use a
   `@container` query (`.wkcw`, `.ev`, the Reports chart). A `@container` rule
   also **cannot set padding on its own container** — the query reads the content
   box and the padding decides it.
5. **`display:none` removes the accessible name** when the hidden span is the
   control's only text. Use `.vh`'s clip instead (`position:absolute` +
   `clip-path:inset(50%)`). Five controls in this shell need clipped-not-dropped:
   `.omni`'s label, `.ph--named`'s `<h1>`, `.sch__label`, `.biz__export`'s label,
   `.sch__ph .ph__t`.
6. **`.app` / `.main` are `overflow:hidden`, so a child that overflows is CLIPPED,
   not scrolled** — and `documentElement.scrollWidth` then reads **zero**. Every
   overflow probe must measure element rects against their card, not the document.
   `-webkit-line-clamp` is invisible to a width probe too; assert `scrollHeight`.
7. **`min-height` has no effect on `display:table-cell`** — Chrome discards it. A
   `pointer:coarse` rule using it collapsed every table row in the product to
   ~20px. §11's `height:var(--w-row)` is already a minimum, by spec.
8. **`.stats--3` / `--4` are pinned counts with no breakpoint.** Seven screens
   have needed a narrow rung: `.cfstats`, `.cfprog`, `.rptstats`, `.mnystats`,
   `.pstats`, `.pgrstats`, `.plnstats`. Scope the rung; never edit `.stats--n`.
9. **`.tbl` cells are `nowrap` by design** — right for the roster, wrong for
   anything with prose in it. A cue, a note or a sentence in a cell makes a 900px
   table inside a 350px card. Use `ListRow`, or the `data-l` reflow.
10. **`.kv` is `flex-wrap:nowrap` with a fixed 80px key** — right for a key and a
    figure, wrong for a label, a sentence and a control.
11. **A fixed-position child inside a `backdrop-filter` ancestor is trapped.**
    §24 gives `.top` a filter, which makes it a stacking context AND a containing
    block — `.main` then paints over any dropdown at any z-index. `.ntf` mounts as
    a sibling of `.top`; the workspace menu portals to `document.body` and is
    placed from the trigger's rect.
12. **`display:contents` cannot take focus** and generates no box.
12a. **A hit-slop `::before` on a WRAPPER eats the clicks it was meant to
    enlarge.** An absolutely positioned pseudo-element on a positioned parent
    paints above static-positioned children, so without `pointer-events:none`
    it is the topmost hit target across the whole control. `.facet::before`
    (`inset:-2px 0`, added to cover a 30px trigger and its ✕) made all three
    filters on `/clients/assessments` inert to a real pointer while every gate
    stayed green — the rows filtered correctly from a URL and a scripted
    `.click()` opened the menu, because **a dispatched click skips hit
    testing**. `document.elementFromPoint` at the control's centre is the only
    probe that reports it; it returned `SPAN.facet`, never the `<button>`.
    Slop belongs on the TARGET (`.facts__lk`, `.switch`) — and cannot go there
    when the wrapper is `overflow:hidden`, which clips a child's `::before` and
    its hit area with it. Then the control has to reach the floor on its own.
13. **A `<tr>` set to `display:grid` drops the table role.** Acceptable where the
    table has no `<thead>` to lose; otherwise reflow the labels into the row with
    `data-l` rather than dropping the head.
14. **`.tbl tfoot td`'s band paints one box per cell** once the cells are flex or
    grid items with a gap. Move the fill to the `<tr>`.
15. **`.card__hd` is `flex-wrap:nowrap`** — four controls in a 350px header spill
    past the card and get clipped by (6).
16. **`scroll-padding-top` on `html` does nothing here.** `.body` is an inner
    scroller; a fragment jump scrolls that box. Targets need
    `scroll-margin-top`.
17. **Duplicate `style` attributes in the design HTML** — HTML ignores the second,
    so that "state" has never rendered. Found on five specimens in one page. When
    touching a faked state in the design set, check the attribute count first.

### React / Next

18. **A module that imports `server-only` cannot be read by a client component.**
    Putting a shared vocabulary in one renders the whole route blank, with every
    gate green. Vocabularies (`lib/portal/range.ts`, `lib/today/time.ts`,
    `lib/log/log.ts`) read no request, cookie, database or clock and live in their
    own module.
19. **`cookies()` cannot be written during a render** — only in a Server Action or
    Route Handler. One such write silently redirected; another 500'd.
20. **No `Date.now()` during render.** `react-hooks/purity` refuses it, and the
    server's instant must be threaded down or the browser's clock disagrees with
    the HTML.
21. **No `setState` in an effect to sync a prop.** Adjust during render, the
    documented pattern (`Schedule.tsx`'s `?new=1`, `NotificationsHost`).
22. **A ref handed across a context boundary** is refused by `react-hooks/refs` —
    find the trigger by selector instead.
23. **An underscore-prefixed folder is a PRIVATE folder** and never becomes a
    route. Fixture routes must not be `_`-prefixed.
24. **A static child of a dynamic segment wins by App Router precedence.**
    `/programs/exercises` and `/programs/certified` both beat `[templateId]` —
    safe only because a template id is a uuid.
25. **A search-param change is a server round trip.** The URL carries what is
    *fetched* (view, anchor, tab, range, client id); filters, open panels and
    sheets stay in state. Stated cost: a link cannot carry "with remote hidden".
26. **Strip a one-shot param after reading it** (`router.replace`). Pressing the
    same entry twice is otherwise a navigation to an identical URL, which the
    router treats as nothing at all.
27. **A `'use client'` page using `useSearchParams` needs a `<Suspense>` wrapper**
    or `next build` fails to prerender it.

### Data and the wire

28. **A TypeScript interface is a claim the JSON never has to satisfy.** A Java
    `Map` serialises whatever keys it holds. Two live bugs: `TemplateExerciseWire`
    declared camelCase against snake_case storage (six templates rendered empty);
    `TemplateWire.dayLabels` declared `string[]` against a map (the plan filter
    matched nothing). **Check a DTO against a real response, not against its
    Java type.**
29. **`ORDER BY` with ties may return any order.** The shelf reshuffled between
    page loads. Total-sort every list a human picks from by position.
30. **A filter on the SEARCH route answers `{items, total}`, not a bare array.**
31. **This backend answers `ResponseStatusException` with
    `{timestamp,status,error,path}` and no `detail`** — it sets no
    `spring.mvc.problemdetails.enabled`. So a service's own sentence never reaches
    the trainer. The fix is a typed exception plus a handler, the shape
    `PackRuleException` and `TeamRuleException` established. **Still outstanding
    for `headline`, `bio`, `gymSharePercent` and `validateSchedule`.**
32. **`null` means "leave it alone" and `''` means "clear it"** on
    `PATCH /v1/trainers/me`. That is what lets one tab PATCH four keys without
    clobbering a fifth it never drew — so each profile tab has its own action.
33. **A multi-field PATCH is refused whole.** `headline` and `bio` are refused
    over the cap rather than truncated, so an over-long paste would take the
    trainer's **name** down with it. Clip before sending.
34. **`metadata` is one JSON object** — read before you write, or a `PUT` carrying
    `{pausedAt}` drops `mode` and `source`.

### The harness

35. **Drive it at `http://localhost:3100`, never `127.0.0.1`.** Next 16 answers
    **403 to every `_next/static/chunks/*.js`** carrying an
    `Origin: http://127.0.0.1:…` header — the page renders server-side, looks
    perfect, and **nothing is interactive**. Cost half an hour twice.
36. **`requestAnimationFrame` and CSS animations freeze in a backgrounded tab**,
    and `Runtime.evaluate` backgrounds the tab as a side effect. Two convincing
    phantom defects came from this. Kill the animation before measuring, or drive
    with real input.
37. **Poking `data-theme` on `<html>` is reverted by the app's theme sync** — a
    light-theme contrast probe taken that way measures the dark palette. **Drive
    the theme switch.**
38. **A computed style tells you what a colour IS, not whether anyone can see it.**
    `--tx-line-strong` measures 1.40:1 as ink.
39. **`pointer:coarse` is invisible to a desktop harness, in BOTH directions** —
    it over-reports (34px buttons that are 44 on a phone) and under-reports
    (`.btn--sm` is 28 on a mouse, 36 on a phone; a header measured 8px light).
    Simulate it exactly by rewriting the condition **in place**:
    `if (/pointer:\s*coarse/.test(r.media.mediaText)) r.media.mediaText = 'all'`.
    Lifting the declarations into an appended sheet moves them to the end of the
    cascade and hands them wins they do not have.
40. **A programmatic `.click()` does not move focus** — call `.focus()` first.
    **React's controlled inputs ignore `el.value = x`** — use the native setter.
    **React's `onBlur` listens for `focusout`** — a synthesised `blur` does not
    bubble. **`OtpInput` is one real input under six slots** — target `.otp__in`.
41. **`next dev` refuses a second server in one directory**, and `next start` in
    the real one fights the dev server for `.next` — the symptom is a screen
    rendering the *previous* build intermittently. Serve from a COPY, with
    `node_modules` **copied, not symlinked** (Turbopack rejects a symlink out of
    the project root).
42. **`pkill -f "next start -p 3100"` kills the launching shell, not the server**
    (the process is `next-server`). Find the pid on the port.
43. **A fresh CDP target per shot**, and set the cookie with `Storage.setCookies`
    and a `url` — the `Network.setCookie` domain form silently sets nothing.
    Reusing one tab leaves the previous `setDeviceMetricsOverride` half-applied.
    Give a fake `inclineyou_token` an explicit expiry, or "close the browser"
    tests measure a redirect to `/sign-in`.
44. **Pace the captures** — four requests a page against the STANDARD tier's
    120/min rate-limits a tight screenshot loop into `Unavailable`.
45. **Newer Chrome refuses `GET /json/new`** ("supports only PUT") and answers
    `/json/close/{id}` as plain text — do not `JSON.parse` either.
46. **`perl -pi -e 's/…/…/'` interpolates `$` in the replacement**, so a
    replacement containing `${x}` silently empties it, and `//` closes the
    delimiter. Pass both sides through the environment with `\Q…\E` and `{}`.
47. **OTP rate limits are real and outside the transaction** (ten per number per
    day, through Redis) — a second run of a fixture is refused for 24 hours. Clear
    `otp:*` or use fresh numbers.
48. **Restore what you write.** The dev database is shared. Seeded rows edited by
    a harness have to be put back.
49. **`stopImmediatePropagation` in the CAPTURE phase does NOT let an inner popup
    keep the Escape key.** Two capture listeners on `window` fire in the order
    they were ADDED, and the `ModalHost` around them was mounted first — so the
    dialog closed and took the half-written form with it while the menu that
    "consumed" the key never saw it. Three popups carried a comment claiming the
    opposite. The repair is `useEscapeGuard(open)` from `ui/Modal.tsx`: the host
    ignores Escape while any popup declares itself open, and the popup's own
    listener — any phase — closes it. `covered` stays for a modal over a modal,
    where one owner holds both pieces of state.

---

## The design system

`web-components/` is the catalogue; `registry.ts` is the index and
`/library/[id]` renders every entry.

- **Only design-system components at a call-site.** A brand-new component
  invented in a screen is the defect the catalogue exists to prevent — it is
  invisible to review and it drifts. If a screen needs something new, it goes
  **into** the design system first.
- **A BEM family is ONE component with parts.** The client portal's bell reuses
  `NotificationPanel` with a `NotificationView` adapter per half rather than a
  second `.ntf`.
- **Extend rather than copy.** `SetRows` grew an editing mode; `Stat` grew `href`;
  `Table` grew `foot` (ten call-sites had each answered its absence by
  hand-writing a raw `<table className="tbl">`); `PhoneChange` grew a `wire` prop
  and serves both halves; the five profile pickers were **extracted** from their
  setup steps and are rendered by both.
- **A component is not delivered until it has been rendered and looked at, at
  1:1, in both themes, resting and focused — the WHOLE control in frame.** A
  state change on one part of a composite control is verified on all of its parts.
- The usability gate for new components is `../Design/webapp/webapp/UIUX-SKILL.md`.

Components whose only consumer was removed are **kept with a docstring saying
so**, not deleted: `DayRibbon`, `WeekCard`, `MonthCard`, `PhoneMoney`,
`PhoneWeek`, `ClipThumb`, `DayColumn` (now `CertifiedPreview`'s), `RowPanel`.
Deleting a built module whose route has not arrived is losing work with nowhere
to put it.

`ModalHost` is the other half of `c-modal`: `Modal` is deliberately "the surface
and its semantics, not a dialog manager", so before `ModalHost` every modal
hand-wrote its own scrim, `keydown` listener and focus handling. Nothing should
render one without the other outside a bench.

---

## Verification: checked by rendering

**The convention of this project.** Four of the defect classes above are
invisible to `tsc`, `eslint` and `next build` — a screen shipped blank and stayed
blank once because the step was skipped. **Build a throwaway fixture route, drive
the real components with CDP, measure, then delete the harness.**

What to assert, every time:

- **zero horizontal overflow, zero elements painting past their card, zero
  clipped text nodes, zero targets under 24px** at 320 / 360 / 390 / 430 and at
  the desk widths the screen has a rung for;
- **both themes**, driven through the real theme switch;
- **contrast** on anything carrying meaning — and remember the accent steps to
  `--tx-accent-text` on light;
- **the behaviours driven as real clicks**, not forced open in a fixture.

Render against the **dev database**, not a hand-written fixture, wherever the
screen has a real shape to meet. A hand-written fixture encodes the same
assumptions as the code it is checking — the schedule's first one believed in
three-way clashes because the code did; real rows had six at 19:00 every week,
and nine defects fell out in one afternoon.

Anchor a fixture's "now" to `Date.now()` if a countdown matters: `useNow` seeds
from the server's instant and then ticks off the browser's.

---

## What is built

| | |
| --- | --- |
| **Auth** | `/sign-in`, `/verify`, `/new` (3a — and **the only place a trainer account is created**), `/role` (2a), `/unattached` (7e) |
| **Setup** | `/setup` + eight steps + `/setup/done` |
| **Trainer** | `/today` · `/schedule` · `/clients` (+ the file's eight tabs, `/new`, `/report`, a client's plan, **and the console at `/clients/:id/sessions/:sid{,/log,/finish,/bests}`**) · **Fitness**, whose three pane pages are `/programs` (+ the **Templates** tab at `/programs/certified`, the builder, and a client's copy) · `/programs/workouts` · `/programs/exercises` · `/sessions/new` (the picker; `/sessions` redirects to `/programs/workouts` and every other `/sessions/*` is a lookup redirect) · **Business**, whose six pane pages are `/business` (the Overview) · `/business/transactions` · `/business/packages` · `/business/gym` · `/business/gst` · `/business/reports` · `/team` · `/settings` (three tabs) + `/settings/profile` (seven tabs) |
| **Portal** | `/me/today` · `/me/progress` (**four** tabs) · `/me/plan` (three tabs) · `/me/account` (three tabs) · `/me/workout/:id` · `/me/checkin/:id` |
| **Library** | `/library`, `/library/[id]` |

Still `NotBuilt`: `/sign-in/paused`, `/sign-in/removed`, `/invite/[clientId]`.
`/money/*`, `/packages`, `/reports`, `/exercises`, `/nudges` are
`permanentRedirect`s, **outside the `(main)` group** so a redirect does not pay
for the layout's round trip. `/sessions` is the one that is **inside** it, and
says why in its own file: taking it out means taking the whole `/sessions/*`
subtree out, and five of those are live shell screens.

---

# The trainer half

## Auth

- **A trainer account is created on `/sign-in/new`, never at sign-in.** Verifying
  used to mint one for any number that passed, handing a coaching workspace to
  every client who tried the app first. `claimTrainer` is called from that screen
  and nowhere else.
- **The pending token is in a cookie here** (the phone keeps it in nav params).
  `lib/auth/claims.ts` reads the cookie's own role and phone **without verifying
  the signature and without granting anything** — it picks a screen and prints a
  number back. Every permission is still the server's.
- **`/` forks on the role, not on whether a token exists**, or a client who
  reloaded 3a lands on `/today` where all eight deck requests 401.
- **`/sign-in/role` is for a client on two rosters only.** Everybody else resolves
  silently. The design's frame 2a is stale — trainer↔client duality does not come
  back through this screen. Its greeting cannot be built as drawn (`clientView`
  returns `trainerName: null`), so it uses `clientName` only when every roster
  agrees. **The trigger is currently unreachable**: `ClientPhoneGuard` rule 2
  refuses a number already on another trainer's roster.
- **`/sign-in/unattached`'s whole job is not to read as a failure.** No "I'm a
  trainer" button: `claimTrainer` would now accept it, so the only thing standing
  between a declined invite and an accidental coaching account is the absence of
  the door.
- **The wall is a cookie and has to be.** `clientView` mints one `invited` role
  for three destinations, so these screens cannot verify themselves from the
  token, and guessing is actively harmful. `verifyCode` records the wall in
  `inclineyou_wall`; no cookie means a stale bookmark and a fresh sign-in.
- **Known gap:** `destinationFor` routes a legacy `paused` role to
  `/sign-in/paused`, but `verifyCode` bails first because that response carries no
  token — so the screen is unreachable from a verify.

## Setup

- **There is no draft. Every step writes to the server as it is answered**, so
  resume is exact on any browser. The design's offline promises are dropped.
- **Which optional steps were skipped has no column** — it lives in a 24-hour
  cookie, because "I passed on that in this sitting" is a fact about a sitting.
  Cost: skip a step here and the phone will ask once more.
- **Steps 6 and 7 (`working_hours`, `packs`) go through `/v1/sync/push`**, the
  only path that has ever written those tables. `packs` has REST now
  (`GET`/`POST`/`PATCH /v1/packs`) and this flow deliberately still does not use
  it — it already reads hours from the same single pull. **A new screen uses
  `lib/packs/api.ts`.**
- **`working_hours` is still sync-only for writes.** `GET /v1/working-hours` is
  read-only by design: a table the phone also writes offline is not one to give a
  second write path.
- **Continue refuses an empty answer** on specialities, languages, certifications
  and packs — `saveList` only marks a step answered when the list is non-empty, so
  an empty Continue used to write, navigate and leave the step unsettled, and the
  trainer was asked again on their next sign-in. Tone: **red where there is no
  Skip, amber where there is one.** Cost: a resumed trainer cannot clear a list
  from inside setup — clearing is Settings' job.
- **A chip click selects; Continue advances.** No auto-advance: a trainer who
  mis-clicked has no way to see it before the page has gone.
- **Eight steps, and it stays eight.** The pre-flight screen exists because the
  most-named onboarding complaint is *surprise*, not length. A 200-word bio inside
  a flow that promises about a minute is exactly that surprise — so the headline
  rides on step 1 and the bio goes to Settings.
- **A finished profile is Settings' to edit** — `/setup` and all eight steps
  redirect a `setupComplete` trainer to `/today`. `/setup/done` deliberately does
  not.

## Today

`/today` is three blocks: **Next up** (the hero pair, `card--lead` on the first),
**Needs you today** (the ranked queue), **Today at a glance** (three figures).

- **The deck needs eight row sets and REST had trainer-wide routes for four.**
  Now additive and documented in `backend/API.md`: `GET /v1/packages`,
  `GET /v1/payments?from&to&status`, `gymShareAmount`, `GET /v1/working-hours`,
  `endedAt` on `WorkoutSessionResponse`, `amountPaid`/`amountDue` on
  `PackageResponse`, the four package-lifecycle routes.
- **`endedAt` is the one to remember.** Without it `buildRunning` said *In
  session* for a log closed four days ago, and the *started, nothing logged* state
  could never fire — the two states this screen is most often in.
- **Two reads are deliberately unwindowed, for different reasons.**
  `GET /v1/workouts` because *gone quiet* needs the last workout per client **at
  any age** — bounding it makes the client who most needs chasing vanish.
  `GET /v1/payments` because a July invoice is still owed today. Sessions widened
  to thirty days back: two bands ask about the past, and on a Monday the old
  window did not contain yesterday.
- **The ladder now disagrees with the phone, deliberately.** Five bands were
  added (`pack-expiring`, `missed`, `no-program`, `unmarked`, `milestone`) and
  **a package running out outranks money owed** — taken with the product owner on
  27 Aug 2026. An overdue invoice is money already earned and still collectable;
  a pack about to run out is money not yet earned on a client with no reason to
  come back. **Whoever closes the gap moves both halves in one commit and deletes
  the block at the top of `ATTENTION_BANDS`.** `lib/clients/roster.ts` reads
  `attentionWeight` too, so the roster moved with it.
- **The queue commits in place; the phone navigates.** Six rows each costing a
  navigation makes the queue a menu. **The ten seconds are the price of that
  promotion** — the hold attaches to the verb: `Remind`, `Check in` and `Wish`
  message somebody and wait; `Renew`, `Mark` and `Close` write a row and tell
  nobody. `Assign` is a `<Link>`.
- **V5 · `assessment-due` is raised on the SESSION, never on the date.** Two
  conditions: a sitting is owed, and the client is in today. Either alone
  produces a row nobody can clear — a date alone asks a trainer to measure
  somebody who is at work, a session alone asks them to measure everybody every
  day. It sits below `no-program` (a client training to nothing is worse than a
  client measured a fortnight late) and above `unmarked` (that one is the
  trainer's own housekeeping). **The verb navigates**, like `Assign`: six numbers
  off a tape is not a one-click commit, and `?measure=1` lands on an open sheet.
  **It gets no nudge template** — `TEMPLATE_FOR_KIND` says so with a `null` and a
  reason: a reminder to measure is addressed to the wrong person, because on this
  product the trainer holds the tape. The band is **not on the phone**: V5 is
  backend + web only and the app has no cadence column to read.
- **`unmarked` fires `POST /v1/sessions/{id}/done` one at a time** — in parallel
  against a pack with one left, two requests both read `sessions_remaining = 1`.
- **`QUEUE_CAP` is 6 and the rest are folded behind a disclosure that states the
  count.** Bounded, never truncated. `ATTENTION_VISIBLE` (the phone's 3) is
  ignored — the queue is full-width here.
- **The week card counts the *elapsed* week.** The phone divides delivered by
  everything scheduled, which on a Tuesday is a denominator mostly in the future.
  Its third row is **`unmarked`, never "running"** — `buildWeek` sees no workout
  logs, so it cannot tell a live session from a forgotten one.
- **Dismissal has memory and the memory is on the server** (V28,
  `/v1/attention/dismissals`). A gym desktop is shared, and a snooze must expire
  against a clock both halves agree on. **The band travels with the write**, so a
  row dismissed at "ends in 2" comes back at zero. `dismissRow` is the one write
  here that does **not** `revalidatePath` — revalidating takes the receipt and its
  Undo with it. Silenced rows are **returned, not just counted**: a queue that can
  be silenced is only trustworthy if it admits to it.
- **The medical flag is a neutral *Has a note* chip** and must never grow a
  variant that means "medical" — see *No health data* below.
- **The server owns the deck; the browser owns the clock.** Only the countdown,
  the minutes-left figure and the now line tick; facts refresh on
  `revalidatePath` plus a five-minute heartbeat that skips a hidden tab.
- **The day-off card answers *when am I next on*, and every slot on it says
  something different.** It used to say one fact four times — *A day off* ·
  *not a working day* · *You do not work this day* · *Your working week does not
  cover it* — with `—` in the figure slot, which is the slot this card is built
  around. A card that repeats itself four times is not emphatic; it is a card
  with nothing in it. Now: the KICKER states it, the FIGURE is the next day with
  working hours on it (`nextWorkday` in `lib/today/day.ts` — the first thing on
  this screen to look past today, derived in `Today.tsx` off the SERVER's
  instant), the NAME is the reassurance and the DETAIL is the reason. The name
  is **“nothing to sell”, never “nothing booked”**: this card is also drawn at
  the end of a day that HAD sessions (branch 3, nothing booked tomorrow), and a
  card claiming an empty day beside a `DayClosed` reporting five would be
  plainly wrong — nothing to sell is true either way, since gaps are cut out of
  working windows. The band is untouched: *your hours stop clients self-booking,
  never you* is the only non-obvious fact on the card. **No next working day at
  all draws no figure rather than a dash** — that trainer has the *no working
  week yet* card instead, and an empty slot is honest where `—` is furniture.
  `.hro__c` now wraps (`app.css`), because a figure that is a WORD leaves its
  unit a 60px column at 360 and §04's row does not wrap.
- **Not built, and not an oversight:** a birthday band (there is no date of birth
  anywhere in this schema — V12 declares the nudge kind and no column ever
  landed) and a body-metric milestone (one request per client on the screen a
  trainer opens every morning — the mistake `GET /v1/packages` was added to fix).

## Schedule

**One minute is one pixel was a calibration, not a law.** `--cw-hour` had **no
consumers** — every vertical measurement is an inline unitless number at fourteen
JS call sites. What actually matters is **two sessions of the same length are the
same size, and a block's height IS its duration**, which a shared scale factor
preserves exactly.

- `useCwScale` divides the scroll container by the trainer's own track and clamps:
  **floor 0.8** (48px/hour — 30 minutes is 24px, WCAG 2.5.8 exactly) and
  **ceiling 1.5**. Owned in TypeScript, not a CSS `clamp()`: **the track is not
  the viewport** — what has to fit is this trainer's day minus its collapsed quiet
  bands, which is data, and three call sites outside CSS need the number
  (`rung()`, `laneFits`, and the click-to-book inverse that would otherwise write
  the wrong minute).
- **`rung()` is a line count, not a length** (38/54/70 off `.ev`'s 15.5px line
  box) — read as pixels, a 45-minute block dropped a rung at scale 0.99.
- **The column floor is gone** (`minmax(0,1fr)`): 124px made a 13" laptop scroll
  sideways, and legibility is decided by the **lane**, not the column. `.ev` is a
  container and its children answer to their own room — **container queries
  measure the CONTENT box**, which the first ladder got wrong by ~18px a rung.
  ≤95px drops the plan, ≤55px the name, ≤41px the block becomes a bar.
- **The week caps at three lanes** (`MAX_WEEK_LANES`) and folds the rest into a
  `+N` chip. Real rosters run four to six at once; six lanes is 20.7px.
  `hidden` keeps folded sessions in `placed`, so every count and total still sums.
- **The URL carries the view and the anchor and nothing else** — they decide what
  is fetched. **No width ever changes the view**; it is a thing the trainer chose.
- **Six bounded reads**, and deliberately not `/v1/workouts` or `/v1/payments`.
  Consequence: a block cannot know whether a log was opened against it, so `live`
  is always false and `late` means *ran and still unmarked* — the label says **not
  marked** where Today's says *not started*.
- **Moving is select-then-place, for everybody** — a keyboard move has to be cut
  and paste anyway (SC 2.5.7), it works on touch, it is one code path, and the
  target is a click so it can be read before it commits. **The whole write waits
  ten seconds**, not just the message: a move is one `PUT` that does both.
- **Nothing is refused.** A clash is named and the button reads *Book anyway*.
  Working hours constrain what a **client** can self-book and have never
  constrained the trainer.
- **A quiet band holding a session is held open and says why** — and unfolds only
  where its contents are, not across the whole range. **Blocks are drawn in every
  segment they overlap**, with the continuation silent to a reader.
- **`utilisation` is null, never 0**, when no hours are answered — and a day with
  no working-hours rows draws no hatch rather than a fully hatched column.
- **Delivery outranks the clash** in a block's glyph chain: floor-against-remote
  is the colour axis this design set is built on.
- **The now-line is dashed** — a 1px ink rule crossing an 11.5px ink name at its
  x-height is a strikethrough, which on a schedule means cancelled.
- **`lengthChoices` adds the stored value as a chip when it is not one of the
  four.** `session_duration_minutes` is a free integer; four chips with none
  pressed reads as *nothing is set*, and the obvious repair truncates the session.
- **`hasClash` is `lanes > 1`**, which rings 68 of 81 blocks red on a roster that
  runs concurrent sessions on purpose. Whether overlap is an error is a product
  question — this is a one-to-one product (`BATCHES_ENABLED` is off), so the ring
  is correct and the seed is the outlier. **If that changes, `hasClash` is the one
  line.**
- **Not built:** frame 7a (the eight-week bulk pattern — it writes a series and
  belongs with `/settings/hours`), the month's dated hole (`time_blocks` has **no
  REST endpoint**), and `role="grid"` (a week is not a rectangular table; what is
  built is the part that costs a keyboard user time — one tab stop, arrows,
  Home/End, ↵).

## Clients

### The roster

- **One derived tag per row** — *At risk · Expiring · Lapsed · Prospect · Paused ·
  Active*. A trainer sets none of them: a status somebody has to maintain is wrong
  by the second week. Order matters: **`lapsed` above `at-risk`** (a month of
  silence is past saving) and **`at-risk` above `expiring`** (renewing a pack for
  somebody drifting away is not a conversation that happens). **`paused` wins over
  everything derived** — it is the one tag a trainer states.
- **Thresholds are `deck.ts` constants**, so a tag and a row cannot describe one
  client two ways. `LAPSED_DAYS = 30` is the only new one.
- **"Missed 2+" is read twice.** `deck.ts`'s band is a *streak*; the tag also
  fires on scattered absences in a window. The scattered case raises the band too,
  with its own sentence, because a tag with no evidence beside it is a tag the
  trainer stops believing. That phrasing lives in `roster.ts` — a helper added to
  a file that is a port of the phone's is drift.
- **`attentionTier` is a tier above `attentionWeight`**, so wording and colour
  stay Today's while the *order* differs: Today is a queue of things to **do**,
  this is a list of **people**, ordered by who is closest to leaving.
- **Dues is a tier without being a tag** — money owed is a state of an invoice.
- **Search narrows in place; ⌘K jumps.** Phones match on digits from two in, so a
  name never becomes a phone search.
- **Last logged became Last attended** — a workout log OR a ticked session,
  whichever is later. The `quiet` band still reads logs only: that one is a fact
  about the trainer's logging.
- **The row menu has no `Soon` left.** Assign a plan, Message, Pause/Resume,
  Archive. Pause/resume was the only missing half — every derived reader
  (`buildRoster`, `deriveTag`, `SEGMENTS`, `attentionTier`) was already built and
  unreachable. **Pausing a client is not pausing their pack** — that is a money
  event with a `package_adjustment` behind it. **Message picks the band's own
  template**, falling back to `re_engagement` for a lapsed row and `check_in` for
  a calm one. **Archive asks first** because there is no *Archived* segment yet, so
  the row leaves with nowhere to bring it back from; pause does not.
- **A refusal keeps the menu open** — closing on an error is a menu reporting
  failure by vanishing.
- **The phone card's tag is a SIBLING of `.crd-row__main`**: that selector sets
  `display:block` on every span inside it.
- **Divergence from the phone:** `app/src/clients/roster.ts` has no tags and sorts
  by weight alone.

### Adding a client — the flow books the week and assigns the plan · V3

Four steps: phone check → sell a pack → **pick the days** → **pick a plan**.

- **Step 3's Continue is what books the sessions.** `PUT /v1/clients/{id}` with a
  `weeklySchedule` runs `DiaryService.reconcile` in the same transaction — it
  always did, and reported nothing, so the one write that produces something a
  client will turn up for looked like a form saving a preference. It now says both
  halves: `layoutSessions` reads out the plan **before** the press (the module
  exists to run on both sides of the wire), and `sessionsBooked` /
  `firstSessionAt` on `ClientResponse` report what **that request** wrote —
  never a count of the diary afterwards, or a client with sessions already on the
  board comes back as sixteen. **Null** where the write did not touch the rhythm;
  **zero** is a real answer with its own sentence.
- **A day with no hour is refused, not dropped.** `selectedSlots` is keyed by
  weekday and only holds answered days, so a forgotten Friday used to save a
  two-day week in silence — and then step 4 offered only two-day plans with
  nothing explaining where Friday went.
- **V3 · `from_schedule` — NULL means "booked by hand", and that is the
  deliberate reading.** The reconcile has to know which rows are its own; without
  the column the only available rule is *delete every future scheduled session and
  re-lay them*, which eats the extra Saturday before somebody's wedding. A trainer
  who MOVES a rhythm session takes ownership of it —
  `ScheduledSessionService.update` clears the flag — so a deliberate 7pm Thursday
  is not swept back to 6am Tuesday. Hand-booked rows still **occupy** their
  instants: a standing slot that lands on one books nothing rather than doubling.
- **V5 · step 5 is the baseline, it is optional, and the skip SCHEDULES.**
  Skipping discards; *Take it at the first session* writes a date — the first
  session step 3 just booked, which is the day the trainer will have a tape in
  their hand. With nothing booked it falls back to the server's own today +
  interval, which is honest because there is no session to point at. The cadence
  is prefilled from the trainer's default, so nobody answers it twenty times. The
  rung is labelled **Body** and not *Baseline* because `.rung` is
  `justify-content:center` with no wrap and a fifth column is 72px at 360.
- **Step 4 no longer leaves the flow.** *Assign and open the plan* became *Assign
  and continue* and the destination is step 5's exit instead — one press later,
  with the baseline in between.
- **Step 4 filters against `agreedSlots`, not the day chips** — the schedule that
  was SAVED is what the apply has to cover, and offering a three-day plan to a
  client whose third day has no hour is offering a 400.
- **`scheduleFor` pairs the plan's ordinal days with the client's mornings in
  order, and DRAWS the pairing** — a mapping nobody can see is one nobody can
  correct, and it is the whole of what `program.schedule` will hold. Both sides
  are 1 = Monday, so nothing translates; it only pairs.
- **With no week agreed the shelf is not drawn at all** — every plan on it would
  answer with the server's refusal, and `validateSchedule`'s wording never reaches
  the browser (trap 31).

### The client file

Eight tabs, each a real route: **Overview · Calendar · Progress · Assessments ·
Sessions · Plan · Payments · Personal information**. `/package` and `/programs`
redirect, and the `notes` key still spells the last one's route — a trainer with
`/clients/abc/notes` bookmarked should not meet a 404 over a rename.

- **Assessments (`/clients/:id/assessments`) sits beside Progress, and the pair
  is the point.** They are the same subject read two ways: Progress is what the
  TRAINER recorded — their own tape, their own set logs — and a check-in is what
  the CLIENT sent back, on a date, against questions somebody wrote in advance.
  Half of one of them is not a number, which is why it is not folded into the
  other: eleven sentences about somebody's sleep under a chart of their waist
  would read as an annotation on it. Two sections, `SessionsTab`'s split and for
  its reason — **Outstanding** soonest-first (what to act on) over **Answered**
  newest-first (the record) — and neither is capped, because a client on a
  check-in every eight weeks has three a year.
- **The read is the ROUTE's, not the payload's.** `loadClientAssessments` runs
  in parallel with `requireClientFile`, which is `/progress`'s arrangement: the
  file's payload is ten requests every tab shares, and a list only one tab draws
  has no business in it. It answers `null` rather than throwing, and the tab
  draws the difference — an empty list where the request fell over is the screen
  inventing a fact about somebody's coaching.
- **The pinned strip is the trainer's own notes, headed *Before every session*** —
  see *No health data*.
- **V29 `client_note` exists because there was no storage at all**: the data model
  has listed `client.note` since the first draft and `V1__init_schema.sql` never
  created it. `trainer_id` is the privacy rule — a team widens reads and must not
  widen this, so a teammate gets an **empty list** and editing is a **404, not a
  403**. `pinned` is one flag, not a second table. Both `PUT` fields are optional.
- **The pack and the pending amount live in the header**, visible from all six
  tabs; Overview's two stat cards came out with them. Both figures are the
  **balance across every live pack** (`packBalance`), not one row's — see the
  multi-pack rule under *Standing product rules*. `low` is computed on the sum,
  so six sessions bought on top of one remaining stops asking to be renewed.
- **The Sessions tab is two tables with a boundary between them, and the column
  model is the point.** MEASURED 19 Sep 2026 on `cli_008` at 1536×695: five
  columns in 1,407px, of which **Program was 714** — 51% of the table holding
  **one** distinct string down all 26 rows — and *Edited on* another 150 for a
  date that was a copy of its neighbour on 15 of the 18 past rows. 947 of 1,407
  pixels went to the three columns carrying almost nothing, which is the defect
  `sessions-table.ts` had already deleted the `pack −1` column for.
  - **The future and the past are SECTIONS, not a sort.** Eight of twenty-six
    rows were bookings and they sorted first, so the tab opened on 15 Oct — four
    weeks out — with the last session trained below the fold. *Upcoming* runs
    forwards (the next session is the most useful row on the page and is now the
    first one), *History* runs back under a month rule. The diary shows four and
    discloses the rest: the content window here is **470px**, and eight rows plus
    two heads is 512.
  - **The columns follow the SECTION, never the filter.** The old table changed
    its column set when the dropdown changed, which is a table moving under the
    reader. A booked session has no duration because it has not happened — that
    is a property of the rows, so it is the section that decides.
  - **The plan is a heading where every row shares one** (`onePlanFor`), and the
    session cell's second line where they do not. The trainer's own note
    (`workout.notes`, drawn nowhere before) rides on that same second line.
    **It was a column first and measured 2 of 22** — a heading over 347px of
    nothing on twenty rows is the 714px Program column in a better word.
  - **`table-layout:fixed`, every track capped at its widest ink, one `auto`
    track taking the rest.** Under `auto`, a cell asking for `width:100%` does
    not take the remainder — it wins the whole negotiation: probed at
    1440/1536/1920 the 168px date came back **151**, the 176px session **76** and
    the 44px chevron **28**. The gate is `sum(headerCellWidths) === tableWidth`.
  - **It reflows at 1080, not 620, and that is a measurement of the CARD.** The
    rail and the section pane take a flat 339px down this route, so a 1024px
    window leaves the card **685px** and a 960px window **621** — eight tracks in
    621 is 77px a column. The rest of the file reflows at 620 because those
    tables have four to six columns.
  - **The old table overflowed on a phone and nothing reported it.** `.cftbl`'s
    620 rule releases the width of a `td` and says nothing about a `th`, on its
    own stated grounds that "none of these tables has a `<thead>`". This one grew
    one. MEASURED at 390: the table stood at **478px inside a 363px card**, with
    Status and *Edited on* clipped away by `.main`'s `overflow:hidden` while
    `documentElement.scrollWidth` read zero. `.cftx`'s answer, on `.cftx`'s
    argument: clip the head, carry the names into the cells as `data-l`.
  - **The month band reports the month, not the filter.** Computing *kept of
    spent* from the drawn rows reads **0 of 2 kept** over August under *Missed*
    — true of the two rows under it and false about August, which kept four of
    six. `monthRecords` is built from the unfiltered history for that reason.
  - **The filter chips came back, and the original objection was answered rather
    than ignored.** They became a `<select>` on 14 Sep because *a row of toggles
    that behaves as a radio group is a radio group drawn wrong*. What brought
    them back is the COUNTS — *has this client been missing sessions* is the
    question the tab is opened with, and a `<select>` can show one option at a
    time and only once you open it. `c-segment` has a `single` mode now:
    `role="radiogroup"`, `aria-checked`, one tab stop, arrow keys.

- **The Personal information tab is a RECORD column and a WALL of notes, and
  every number in that sentence was a defect.** MEASURED 19 Sep 2026 on
  `cli_012`, the densest client the seed makes, at 1536×695: the notes card was
  **974px wide and 288px tall** beside a **423×571** record column — so a
  **283px step** ran down the middle of the tab, and **432px** on `cli_008`,
  which is the ordinary case. The text column inside a note row was **705px**
  holding a 72-character sentence, a ~120-character measure with ~255px of
  nothing after it. And `.body` gave 367px of window against 623px of content,
  so *Contact information* and *Remove* — the two cards a trainer opens this tab
  to correct — started 257px below the fold.
  - **A note is not a row.** A row is for records that share a schema and are
    read down a column; a note shares nothing with the note above it except its
    author, and the reader is reading a sentence, not scanning a column.
    `c-notecard` (`ui/NoteCard.tsx`) is the object, `.cfnw` tiles them:
    `repeat(auto-fill,minmax(min(340px,100%),1fr))` — two ~481px tracks at a
    desk, three stacked, one at 390, and no breakpoint of its own. **The
    `min(340px,100%)` is load-bearing**: a bare `minmax()` floor is a floor even
    when the container is under it, so the track stayed 340px inside a 281px
    card and every note painted 73px past its own border — clipped by trap 6,
    with `documentElement.scrollWidth` reading **0**.
  - **`align-items:start` is gone from `.cfgrid--pi`.** Its comment argued that
    a column shorter than the notes list should stop where it stops — correct
    about a case that never happens, since the wall is the SHORT column on every
    seeded client. Stretched, both columns end on one line (410 = 410 measured)
    and the surplus falls inside the notes card where `.cfnw`'s
    `align-content:start` keeps it quiet. `.cfgrid--ov` made the same call one
    tab over.
  - **Remove spans the foot** (`.cfdz`, `grid-column:1/-1` + `order:2`), the
    shape `.cfgrid--ov > .cffup` already had. A danger zone is what a screen
    ENDS with, not a peer of the phone number above it — and it was costing the
    record column 161px the wall then had to match.
  - **The composer is an invitation in the wall, not a button in the header.**
    An always-open field reads as the screen's main input; a *Create a new note*
    button 900px away in the card's far corner is not where the thing it makes
    appears. `.cfnw__add` is a real `<button>` with a real sentence, in the cell
    the note will land in, one press to open.
  - **A sparse wall leaves two holes, and they want opposite fixes.** MEASURED
    on `cli_008` — one note, which eleven of the twenty-four seeded clients
    have: an empty **418×128** track beside the note, and **824×145** of card
    floor under the wall. The one beside it is a grid cell, closed by giving the
    wall a second thing to put in the row — `.cfnw__new` stops spanning and
    becomes an ordinary cell, so one note plus the invitation is exactly one
    row. It still spans while it is OPEN and on a client with no notes, both
    set by the call-site because both are facts about the list rather than the
    width. The one below is not a cell and no number of tracks reaches it;
    `.cfhint` takes `flex:1` of it, which is why `.cfnw` is pinned to
    `flex:0 0 auto` — two `flex:1` siblings split the surplus and leave half the
    hole open. Measured after: **0 empty cells and 0px of floor** at one and at
    three notes, at every width from 320 to 1920. Two notes leave one cell,
    which is what a wall does with an odd count and is not worth a parity rule
    that would be right at two tracks and wrong at three.
  - **What fills it is `c-prompts`, and the fourth question was written and
    cut.** Four questions that open the composer with themselves as the
    PLACEHOLDER — never as the draft, which would be text somebody has to
    delete and would put the product's words inside a note the product has
    promised not to read. They are `EmptyState`'s own prose made pressable.
    Drawn at one to three notes and gone at four: the threshold is about
    teaching, and at four the wall is three rows with no floor left anyway.
    **The cut one was *what have they told you they cannot do*** — a prompt for
    an injury, asked by the product, on the screen whose own rule is that a note
    is free text nobody reads. **Nothing in that list may ever ask for a
    condition, a medication or an injury**: a prompt is the one part of a
    free-text field where the product speaks, so what it asks for is what the
    product is collecting.
  - **Pressing *Edit* dropped focus on the floor, and no animation fixes that.**
    MEASURED: `document.activeElement` came back **BODY** after every press on
    both record cards, because React unmounts the button with the readout it
    sits in — a keyboard or screen-reader user was left at the top of the
    document with nothing announced. Opening now puts the caret in the first
    field, closing puts it back on *Edit*, found by id because a ref to an
    unmounted element is a ref to nothing.
  - **The swap stays instant; only the form's ENTRANCE is animated.** A mode
    change is not a journey and a fade over a form delays the caret, which is
    the one thing the button is for. 180ms of opacity and 6px of travel on the
    `<form>` alone, through `@starting-style` — in only, and NOT on the readout,
    which also mounts on every page load and would fade both record cards in on
    arrival. `.stp__rec`'s reduced-motion trap applies verbatim: restate the
    resting values inside the `@starting-style` block or a reader who turned
    motion down gets a 6px flash instead of a fade.
  - **The 155px of layout under it is deliberately NOT animated, and
    `.body` is why.** A view transition is the instrument and this codebase owns
    one (`reflow.ts`, `.vt-days`), but `useDayReflow` scopes to `.pgw` because a
    DOCUMENT-level transition paints its snapshots in the top layer where no
    scroller clips them. MEASURED: `getComputedStyle(div.body).contain` is
    **`none`**, so the shell's scroller is not an eligible scope —
    `element.startViewTransition` aborted every time with *InvalidStateError ·
    Transition was aborted because of invalid state* while a bare document-level
    transition on the same page returned `READY`. The document-level fallback
    buys the animation at the price of a card being painted over the page header
    whenever it sits near the fold, and giving `.body` `contain:layout` to serve
    one card is a change to every screen in the app. **Any screen wanting a
    scoped transition needs containment on its own scroller first.**
  - **`container-type:inline-size` needs a width stated beside it.** It removes
    the box's content contribution on the inline axis, so the same component
    that measured 824px as a stretched column flex item measured **0px** as a
    flex-row item in the library's bench and set four questions one word to a
    line. FOUND BY RENDERING the catalogue page, which is the whole argument for
    the catalogue in one defect. `.prompts` carries `width:100%` with it, which
    resolves in a flex row, a grid cell or a block alike. The containment is on
    the COMPONENT and not on `.cfhint`, or the library draws something that does
    not behave the way the product's copy does.
  - **`PinnedStrip` stands down on this tab alone** (`pinStrip` in
    `ClientFile.tsx`). It is chrome for the seven tabs that do not list notes; here
    the card 250px below it carries the same sentence with a `Pinned` flag, the
    share state and every control that acts on it, and the empty case's
    *Pin a note* link points at the page you are already on. Buys 78px of
    content window back — `.body` went 367 → 445, overflow 257 → 146.
  - **`Tack` is not `Pin`.** `Pin` is the map pin Today's hero uses for *where is
    this*; at 14px beside a note it reads as a location marker. `PinnedStrip`
    moved with it.
  - **`.cffact` is `c-factlist` now** (`ui/FactList.tsx`, `.facts`). It was a
    local `FactRow` drawing a screen-prefixed family — the half of the
    design-system rule `check-components.mjs` cannot grep for. `.facts__lk`
    gained a resting dotted underline: on a card of five identical rows, the one
    that navigates cannot wait for the pointer before admitting it.
  - **The record's phone is `formatPhone`d.** The header drew
    `+91 98416 54932` and this row drew `9841654932` — one credential, two
    spellings, on one screen.
- **The Payments tab draws three standings, not two.** *Current* is the pack the
  next session comes off; *Also bought* is live and waiting behind it; *Past
  packs* is everything closed. A queued pack gets **no verb of its own** except
  *Take a payment* — renewing the one behind the one in play would sell a third.
  With one live pack, which is the ordinary case, nothing on the screen changes.
- **WhatsApp here is a conversation, not a nudge** — a plain `wa.me` link that
  logs nothing. Routing it through `POST /v1/clients/{id}/nudge` would spend the
  weekly reminder on *are we on for Tuesday*.
- **Adherence is a rate over 30 days**, not `kept/total` over 7 — on a
  two-a-week client the old denominator was two.
- **Overview's *This week* card says what the week was SUPPOSED to be.** The
  rhythm agreed at step 3 of the add flow (`client.weeklySchedule`) is what
  `DiaryService.reconcile` books against and the denominator every figure on
  that card is implicitly measured against, and it was visible nowhere but the
  sell panel — so seven anonymous squares reading *no sessions · 7 rest days*
  said the same thing about a client who agreed to two mornings and had a quiet
  week as about one who agreed to four and has had none of them booked. The
  COUNT is the head's `tag--acc` (*3 days a week*); the DAYS are letters under
  the dots, full ink where the arrangement trains; the TIMES are `weekClause`
  on a line below. **The four states the strip already had mean exactly what
  they did** — kept · missed · booked · rest — and a planned day with nothing on
  it is **never drawn in amber**: an unbooked Friday is not a failure on a
  Monday. It has its own quiet state now; see the two bullets below. No week
  agreed gets a NEUTRAL tag — step 3 is optional and a trainer who books by hand
  has not made a mistake.
- **An empty week is NOT seven rest days, and the window does not move.** A
  client added on a Saturday has every session from the following Monday, so
  the window this card names holds nothing and `restDays` read 7 — claiming
  *the plan is working* about days the arrangement did not exist for, on the
  afternoon a trainer had just booked twelve sessions. FOUND ON a real row
  (Dhanush, created 12 Sep, twelve sessions 14 Sep → 8 Oct). *This week* still
  means the calendar week containing today on every client — one meaning a
  trainer learns once — and the SENTENCE is what changed: **the rest-day count
  is drawn only where something was in the week to qualify**, and an empty week
  points at what is coming (*no sessions yet · starts Mon 14 Sep*). **`starts`
  only for somebody who has never trained**; a client with history gets *next
  on*, because an empty week there is a gap and not a beginning. Both reads are
  bounded (`workouts`, the 90-day session window), so a long-lapsed client
  reads as *starts* — the safer way round, since it is the phrasing that claims
  less. And the empty case is **not drawn as a figure**: `.dots u` is 10px mono
  ranged beside the squares, right for *2/3 kept* and wrong for a sentence about
  a week that has not started, so it moved to its own line (`.cfwk__e`) in the
  card's own type.
- **And the SQUARES were the other half of that same claim.** The sentence was
  fixed and the row was not: an empty week still drew seven identical rest
  rings, saying *the plan asked for nothing* about the three mornings the client
  agreed to in the same shape it said it about the four days they never train.
  **`plan` is the fifth dot state** — the arrangement trains here and the diary
  is empty — and it is a **dashed ring in `--tx-ink-3`**, never a tone, for the
  reason the bullet above gives. A **cancelled** day that is in the agreed week
  is `plan` and not `rest`: the slot was given back, the arrangement still
  stands. Two consequences. `restDays` is **counted off the dots**
  (`dots.filter(d => d === 'rest')`) rather than off the diary a second time, or
  the figure and the squares describe one week two ways — the old
  *7 − days with something in them* drew four rest rings beside *6 rest days*.
  And **`rest` gives up its ring inside this card** (`.dots.cfwk i.rest`, a flat
  `--tx-surface-3` fill): §16 argues that ring on contrast, which is right where
  the ring is the whole signal and wrong here, where the letter names the day
  and the line beneath carries the finding — drawn that way the four days a
  client never trains were the loudest marks on the card. `c-weekdots` settles
  it the same way (`.wkd__c--rest` is a flat fill and `--plan` is the ring).
- **`weekClause` and `WEEKDAY_LABELS` live in `lib/clients/booking.ts`**, which
  the add flow (writes the week) and the client file (reads it back) both
  import. They were private to `AddClientFlow`; one arrangement described in two
  sentences is two arrangements to whoever reads them.
- **The card keeps `title`/`aside` rather than composing** — `Card` renders NO
  head at all once one of its children is a `Card.Head`/`Card.Body`, so the
  clause is a plain line inside the one body. A second `divided` body is a rule
  plus two lots of `--w-cardpad`, ~40px for one 12px sentence, on the column
  whose height decides whether *Quick actions* lands above the fold.
- **`ProgressBody` is extracted, not re-implemented**, so the tab and the console
  cannot draw two renderings of one number.
- **⚠ Backend change, 23 Sep 2026: V5's sitting is gone.** The `assessment` sitting table, `body_metric.assessment_id` and `GET`/`POST /v1/clients/{id}/assessments` were removed from V5 before it shipped; the cadence columns and `PUT`/`DELETE /v1/clients/{id}/body-metrics/{metricId}` remain. *Assessment* now means V14's questionnaire (`/v1/assessments`, `/v1/assessment-templates`, `/v1/assessment-catalog`). The Body card below can still draw readings from `GET /v1/clients/{id}/body-metrics`, but "the last sitting" is no longer a server concept — see `backend/API.md` → *Measuring cycle and body readings*.
- **V5 · the Body card is Overview's, and it replaced a dead *Weight* row.** That
  row said one number with no date to compare it against and nothing indicating
  anything was meant to follow it; the quick action beside it read *Record a
  measurement* and went to a chart that cannot record one. The card carries the
  last sitting, the movement since the one before it **with no colour** (a
  trainer cutting and a trainer bulking read the same −2.4 kg in opposite
  directions), the cadence, and when the next sitting is owed. The verb is on the
  card, which is why the quick action is now *See progress*: a verb drawn twice
  is worse than a figure drawn twice, because a figure only has to agree with
  itself and a verb has to be chosen. **No rate, ever** — no kg-per-week figure
  here any more than in the portal.
- **`?measure=1` opens the sheet on arrival**, the same three-piece one-shot
  `Schedule`'s `?new=1` settled: a `useState` initialiser, a render-time
  adjustment for arriving here from here, then `router.replace` strips it.
- **One sitting is NOT one row.** `body_metric` is one row per number;
  `assessment_id` groups the ones taken at a sitting and is **null on a loose
  reading** — the portal's quick weigh-in, or anything the phone writes. So the
  card's empty state says *readings on file, none of them from a full sitting*
  rather than *nothing measured*, which would be wrong in the one direction that
  matters.
- **The Plan tab ASSIGNS, and it offers only the plans that fit their week.**
  Both of its buttons used to go to `/programs` — the shelf, which answers
  *which blueprint next* and throws the client away on the way there.
  `PlanShelf` is the shelf on this screen: `planFitsWeek` against
  `client.weeklySchedule`, so every row is a plan the apply can actually take
  (`validateSchedule` refuses a day count mismatch as a 400, and trap 31 means
  that sentence never reaches the trainer). Three consequences. The pairing is
  **drawn before the press**, as step 4 draws it. It pairs from the week the
  client ALREADY has, so **assigning cannot move a booked session** — MEASURED
  on a three-morning client: `weekly_schedule` byte-identical, sixteen sessions,
  zero moved, zero re-labelled; what it does do is `reconcile`'s third pass,
  which laid six future sessions forward, and the card says so without a number
  because `ProgramSummary` carries none. And the per-row link to
  `/programs/{id}` is **one link on the chosen plan, labelled as the
  BLUEPRINT** — that URL is not this client's copy (the sentence at the top of
  `ProgramTab`), and `ListRow`'s acting form is a `<button>`, which an anchor
  may not sit inside.
- **`apply` never ends the plan already running**, so a second assign leaves two
  `status = 'active'` programs. The timeline's *Live* tag reads
  `p.id === active?.id` rather than the status for that reason — one live row,
  the one the card above is about — and `PlanShelf` says the old block is not
  ended **before** the press. Ending it properly is a backend change.
- **The pairing rule has one home: `lib/programs/schedule.ts`.** `pairSchedule`,
  `normaliseWeek`, `planFitsWeek` and `toPlanOption`, pure and `server-only`-free
  so both halves read them (trap 18). It was written three times — step 4,
  `AssignPanel`'s seed, and this shelf — and three implementations is three
  answers to what Day 2 means for one person.


### One check-in — `/clients/assessments/:id`

The list answers *who owes me twenty minutes and a tape*; this is the screen
behind a row of it. Two tabs: **Summary** (every reading and every answer this
check-in came back with) and **Measurements** (one measurement across every
check-in the client has ever had back).

- **There is no *Progress pictures* tab, and it is not a gap.** The reference
  this was drawn from has three. **No progress photos** is a standing rule
  (`AssessmentTemplateRow` states it, filed beside *no BMI category*): a
  photograph of somebody's body is a consent problem of a different kind from a
  tape measurement, and there is no image store anywhere in this schema to put
  one in. A tab with no bytes behind it is a promise a screen eventually draws.
- **Nothing on either tab carries a tone.** `lib/assessments/detail.ts` opens
  with it and it is `ProgressMeasurements`' rule applied to the trainer's half:
  a waist going up on a client adding muscle is the plan working and the same
  number on a client cutting is not, and this product holds no field that tells
  them apart. Every change is a signed figure in ink-2 — no green, no red, no
  arrow, no rate.
- **The tab is in the address and the measurement picker is not**, which is
  trap 25 applied twice. A tab is a destination — it is what gets sent, what the
  back button returns to, and why `PageTabs` is a strip of links. Which
  measurement the panel is showing is a filter over a payload the screen already
  has, so it is state; in the address it would spend a round trip and a history
  entry per twitch of a dropdown.
- **The list's Status facet is FOUR filters over four states, and they are not
  the same four.** *All · Done · Missed · Incoming*, single-select.
  `incoming` is `booked` + `waiting` collapsed, because the difference between
  those two is whether the email has gone out and a trainer filtering a list is
  asking about the twenty minutes — `STATUS_TONE` already treats them as one
  axis ("neither is a thing to act on"), so a filter that split them split
  something the rest of the screen does not. The row's own tag still says
  which. `STATUSES_FOR` is the single copy of that mapping, undone in
  `listPath` on the way to the wire; a stale `?status=waiting` from the old
  multi-select address falls back to *All* rather than to an empty screen.
- ***Compare with* is in the address, and that reverses the first answer.** It
  was state, on the rule above, until it had to be on BOTH tabs — and a tab
  change here is a navigation, so state is exactly what the trainer loses on the
  way to the panel they picked a comparison to look at. `?cmp=` now, both tab
  links carry it, one `CompareSelect` renders it in two places, and picking a
  check-in redraws the tape bars, the Measurements headline and the marked row
  in its record together. It writes with `replace`, not `push`: four
  comparisons tried is one question asked four ways, not four places visited.
- **`GET /v1/assessments/{id}` is a FAT read and the list's rows are thin.**
  `assessmentDetail` joins the client, the template, every reading to the
  catalogue, every answer to its question, and the whole history behind each
  measurement — one request instead of three plus a copy of a derivation that
  already exists on the server. `assessmentView` strips `readings`/`answers` off
  the list's rows for the mirror-image reason: twenty rows × 15 readings × 11
  answers is 660 values to draw a table that shows two of them.
- **The history is assessment readings only, never `body_metric`.** A tape the
  trainer took at the gym and a number that came back inside a check-in are two
  different claims, and a chart that silently mixed them could not say which it
  was drawing.
- **The three states that are not `done` are not an empty screen.** A booked,
  waiting or missed check-in draws what it ASKS — which is what a trainer
  opening one dated next Tuesday is usually checking.
- **The way back is a two-segment `Crumbs` row inside `.ph`**, and there is no
  *Client file* button: the client's own name in the subtitle is that door,
  ~20px from where the button would sit. The session console's crumb carries the
  client because those five screens name them nowhere else; this one does.
- **Neither select passes `width`.** It lands as an inline style and trap 2 is
  that an inline style outranks the rung written to release it — MEASURED at
  320, the compare picker stood 6px past its card. The widths are in `app.css`.
- **The tapes are BARS, and what the bar is of took two attempts.** A tape has
  no maximum, no target and no healthy band — this product refuses to hold one
  — so the only honest track is the client's own record, lowest to highest. The
  first draft filled that track TO the reading and MEASURED 0% or 100% on
  fifteen rows out of fifteen: the newest check-in of a measurement that has
  moved one way all year is always AT an end of its own range, so the column
  carried one bit. The lit stretch is the MOVE now — from the previous reading,
  or from the compared one — which is both the interesting number and the one
  that varies. `MIN_MARK` keeps a still measurement findable.
- **Only a rating gets a bar in the Answers card.** `options` is documented as
  "in the order they are SHOWN", not ranked, so a bar at two-of-four would claim
  *Illness* is twice *Travel* on a question that takes both at once. A scale is
  a scale; the other three kinds are read.
- **Both tabs draw the SAME row, and there is no table left on the screen.**
  The Summary lists fifteen measurements of one check-in; the Measurements tab
  lists one measurement across every check-in. Different axis, identical row —
  a label, a figure, what it moved, a bar — so it is one `ReadingBar` imported
  twice rather than two spellings to drift apart. On the record every row
  shares ONE track, which is what makes that column read as the series: the
  bars climb the card as a staircase and the smoothed line above says the same
  thing a different way. `ends` is off there (four rows scaled to one pair of
  numbers, and the card states them once as *Lowest* and *Highest*) and on in
  the Summary, where every row has a range of its own.
- **Which took the `@container` out with it.** The card was a query container
  so the record TABLE could reflow on the card's width rather than the window's
  (trap 4, and it had to be — at a 901px window with the pane open the two
  cards are 289px each, narrower than the same cards at 900 where the grid has
  already collapsed). A row of bars is the same shape at 320 and at 1920, so the
  clipped `<thead>`, the `data-l` labels, the reflow and the containment all
  came out together. The one rung inside it that still mattered — the card head
  wrapping — is a plain unconditional `flex-wrap:wrap` now, which needs no
  number at any width.
- **The chart has a Y axis, and it is the one call-site that does.**
  `TrendChart`'s three grid lines are labelled with the top of the range, its
  middle and its bottom. Off everywhere else on purpose: the portal's tape
  cards print the figures in the card head and a client is being asked to read
  a shape. Here the panel's whole question is *what did the waist do between
  March and today*, and without the axis a 300px plot's only figures are the
  two dates under it. The axis is a flex SIBLING of the plot, never padding on
  it — `.trend__p` resolves its percentage against the padding box, so padding
  moves the dot and not the line it marks.
- **`.meter`'s base fill was invisible on light and this screen found it.**
  `#C6F24E` against `--tx-surface-3` measures **1.03:1** — same hue distance,
  no luminance distance — so every `tone:'acc'` bar in the app (this screen's
  two, the client file's block meter, the portal's volume bars) had no readable
  extent. app.css rings it in `--tx-accent-text` on light, which is `.wsbal__f`'s
  answer to the identical defect moved up to the component.
- **Four components grew a prop for this screen** — `FactList.stack`,
  `Change.from` nullable plus a third `size`, `Meter.describe`,
  `TrendChart.yAxis`. The size is `--tx-fig-sm`, the scale `c-figures` already
  uses, because the panel inverts what `.chg`'s two shipped sizes were drawn
  for: here the change is not a line ABOUT the card's subject, it IS the
  subject, with the chart under it. The second was
  caught by `check:components` rather than volunteered: a first reading is not a
  change, and the screen had hand-written a `.chg` paragraph for it. The third
  is for a bar whose segments are geometry — the default announcement appended
  *below 59%, this block 41%, above 0%* to a sentence that had already said the
  reading, the move and the range in words.
- **The seed writes a RUN of returned check-ins, not one.** One per tenured
  client was enough to draw the list and not enough to draw anything a returned
  check-in is for — a chart with one point, a *previous* that says nothing, a
  one-row history. `MEASURE_DRIFT` in `seed.ts` walks each client's anchor
  against the drift their goal implies, and every answer on a check-in is rolled
  against one `mood` so a client who says they missed sessions does not also
  rate their energy 8.

## Fitness

The rail row was *Workout plans* until 13 Sep 2026 and named one of the four
screens under it — accurate while it led to a shelf of plans, a lie once it also
led to a workout history and 1,324 exercises. **The key is still `prog` and the
routes are still under `/programs`**: the label is what a trainer reads, the key
is what four surfaces index on, and renaming both at once is two migrations for
one decision.

**Workouts** (`/programs/workouts`) is `/sessions`, moved. That list was built and
then orphaned — the five-destination pass correctly took *Sessions* off the rail
(a session is a flow, not a place) and the LIST went with the row, leaving a
screen reachable only from a breadcrumb on the console inside it. It is not a
destination and not a flow; it is a page of a section, and the pane is the surface
that was missing.

It is now drawn as `/programs` is drawn, class for class: the `PageHeader` block,
a `PageTabs` strip with the search ranged right on its row (`.pgtabs`), and the
`.pgt` table below it. The date-grouped cards are gone — `Shelf.tsx`'s
cards-to-columns argument holds here too. The row is `c-workoutrow`
(`ui/WorkoutRow.tsx`), `c-programrow`'s sibling and a `<div>` rather than an
anchor, because it carries a checkbox and an overflow menu and an `<a>` may wrap
neither.

**Its four tabs are LINKS, and `?view=` is the tab.** `lib/sessions/tabs.ts` owns
the strip the way `lib/programs/tabs.ts` owns *Programs · Templates*. They point
at ONE route — all four views still come out of one `requireSessions()`, which is
`/business`'s own rule read backwards — so the parameter selects a panel rather
than a fetch. It was a one-shot that named the tab to OPEN on and was then
stripped, which meant a reload or a back press dropped a trainer on *Completed*;
Today's hero link into *Missed* works unchanged.

### The workout template — `/v1/workout-templates`

**Templates** is the fourth tab, and the model behind it now exists. A workout
template is **one session, written once and reusable in any program** — a rung
below `TemplateRow`, which is a whole block with weeks and training days. Its own
table and not `templates` with `weeks: 1`: a program template is placed on a
CALENDAR (`dayOfWeek`, `week`, `trainingDays`, `dayLabels`) and this one
deliberately has no calendar at all, which is exactly what makes it droppable
into any of them. Folding it in would mean every read filtering the calendar
fields out, and the first screen that forgets is the one offering to assign a
single session to a Tuesday it does not have.

- **The sets are a LIST, not a count and a pair of numbers.** `TemplateExercise`
  carries `sets: 3` with one `reps` for all of them and bolts `setDetail` on for
  the row that varies. Inside a session that is backwards — a pyramid, a drop set
  and a top set with back-offs are the normal cases — so the rows ARE the sets
  and `sets: 3` is their length. Each carries its own load kind, effort kind,
  rest, tempo and note.
- **The note on a set is written in a dialog, and the dialog asks WHICH sets.**
  It was a one-line input unfolding inside the set row, which gave a cue about
  four words before it scrolled under its own caret and pushed the densest line
  on the canvas apart every time one was written. `NoteDialog` is a box with
  room in it plus a `Sets:` row — **All** writes the sentence to every set of
  the movement in one `onPatchSets` (one undo step), a number writes it to that
  set alone — and the note is then DRAWN under its set as the sentence somebody
  wrote, `.wks__cue`, which is `.wsmx__cue`'s treatment of the same text on the
  week sheet. Its state lives in `WorkoutBuilder` and not on the card, because
  two `ModalHost`s both bind Escape in capture and the outer one answers first:
  a dialog owning its own state would close the BUILDER on the first press.
- **The toolbar is honest because the format exists.** The design draws
  **B / I / U / H** and an emoji over the box, and a toolbar over a plain text
  column is the audio note's problem — a control drawn over something that does
  not exist — unless the column has a format and every reader can draw it. So
  `lib/text/markup.ts` defines one (`**bold**`, `*italic*`, `__underline__`,
  `# heading`, and nothing else in CommonMark), `c-markup` is the ONLY reader of
  it, and `c-markupfield` is the box that writes it. **The two ship together**:
  a field edited with markers and printed as a bare string anywhere shows the
  asterisks to whoever reads it, and on this field that is the client. Two
  deliberate deviations, both argued in that file: `__x__` is underline rather
  than CommonMark's second spelling of strong, because underline has no markdown
  spelling and the design draws the button; and **a marker cannot open inside a
  word**, because `3*4 sets` is written in a gym every day and standard pairing
  lets that asterisk swallow the sentence up to the next one. Emoji are plain
  text and needed none of it. **Text ▾** is dropped, not deferred: its two
  entries would be *Text* and *Heading*, and **H** is already both.
  **The box shows the marks, and that took a second pass.** It was a textarea
  with the markers left visible and a rendered *Reads as* line under it, on the
  argument that a textarea keeps the browser's undo, paste and selection for
  free. All true, and it failed the only test that counts: a trainer presses B
  and nothing in the box changes. The first question asked of it was *why are
  the buttons not working*, which is the right reading of a toolbar whose
  effect appears elsewhere on the screen — a preview is not feedback. A
  highlight overlay behind a transparent textarea cannot fix it either: bold
  glyphs are wider, so the painted text and the textarea's own wrapping drift
  apart and the caret lands in the wrong place. So the box is a
  `contenteditable` that serialises back to the four markers on every
  keystroke; nothing downstream ever sees HTML. Its keyboard is ⌘B/I/U for the
  marks, **⌘Z and ⌘⇧Z (Ctrl+Y) for undo and redo of the writing** — the note's
  own history, kept off the builder's structural stack — and ⌘⏎ to save. The
  four controls are TOGGLES and they light (`aria-pressed`) while the caret is
  inside their mark, off `selectionchange` plus `queryCommandState`: a toolbar
  that only acts is one you have to press to find out what it did, and the lamp
  is also what makes a second press legible as *take it off*.
- **A circuit is `groupId` on a run of ADJACENT rows**, which is how
  `TemplateExerciseRow` already models a superset. The archive's *"circuits… a
  container with its own duration — a table, not a column, and it should wait
  until somebody asks"* stands for a **timed** circuit (EMOM, AMRAP). This is the
  chain: drop a movement onto another and they run as a round. `estimateSeconds`
  charges the rest ONCE per round, not once per member.
- **The builder is a dialog, and it is the one place the week sheet's argument
  reverses.** `LibraryDock` rejects a modal because the board it serves is what
  the trainer is filling and a scrim takes it away. Nothing on
  `/programs/workouts` is being filled — it is a list of sessions that already
  happened — so the scrim covers the frame and the dialog is the screen.
- **It does not autosave.** The week sheet has no Save button, which is right for
  a template that already exists. A workout written from nothing has no row on
  any shelf until the trainer says so, autosaving would put half-written sessions
  on it, and *Close* has to be able to mean *forget this*. One Save; a dirty
  close asks.
- **`lib/workouts/estimate.ts` has no `server-only`, deliberately** (trap 18).
  The builder prints a duration for a draft that has never been saved and the
  shelf prints it for a row that has; one module both halves import is the only
  arrangement where those two figures cannot disagree. Both figures are drawn as
  estimates — `~37 min`, and calories as a BAND — because nothing here knows the
  client's bodyweight.
- **The undo stack is a REDUCER, and two defects say why.** Three library clicks
  in one tick added one movement (three `write`s against one captured draft), and
  undoing a set count wiped the name a trainer had just typed (the snapshots
  carried a stale one). So: actions queue against the state they land on, and
  `undo`/`redo` keep the current name and note — the stack holds the structure of
  the session, and the two text fields have the browser's own undo inside them.
- **No thumbnails and no audio note**, both of which the design set draws. The
  poster because *the exercise library is text-only* — V22 dropped the media
  columns, so a still frame is a box over a file that does not exist. The
  microphone because there is no audio store, player or transcript anywhere in
  this product; the note beside it writes to a column that exists.
- **Mock-only.** Spring has no `workout_template` table. `mock/router.ts` serves
  `GET`/`POST`/`PUT`/`DELETE` and this is owed in `BACKEND_GAPS.md`.

**`SessionsData` has three buckets and the third fixed a real hole.** No-shows
were dropped by `DEAD` alongside `cancelled`; past-dated still-`scheduled` rows
matched neither filter while the comment above them claimed they were in `past`.
Both are *Missed* now. `CANCELLED` is the narrowed set.

### The five laws

1. **A day is an ordinal SLOT on a template, never a weekday.** Which weekday it
   lands on is the client's, chosen at assign time into `program.schedule` (V24).
   Hence no Rest column: rest is the absence of a slot.
2. **A day exists when the trainer lays it out**, not when something lands on it.
   `trainingDays` is the authority; the union with wherever exercises sit is a
   fallback for older templates.
3. **A week with nothing of its own repeats week 1.** A ghost chip is a repeating
   week; a solid one was authored.
4. **Sets is a list, not a count.** `setDetail` is the list; `sets` and `reps`
   stay authoritative *while the sets agree*, so a straight 4 × 12 is exactly what
   every pre-V31 build reads.
5. **Every row is inside a WORKOUT, and a day may hold several.** `workoutId` /
   `workoutName` on the row, same storage contract as `groupId` a level down:
   adjacent rows, one key. `reindex` keeps the invariant — every write goes
   through it — and a row dropped inside somebody else's session JOINS it
   (`adoptWorkout` decides from what the drop was aimed at, because the sequence
   alone cannot tell a split from an insertion). **Both wire fields are
   optional**: a blueprint written before law 5 comes back without them and
   `toEntries` reads that day as one unnamed container (`w-seed-{week}-{day}`,
   derived and never minted — a counter would desync across the two renders).

### The workout container

The desk board draws each container as a box with its own name, figures and `⋯`.
**The day header is `DAY 1` and nothing else** — no name, and its figures
only when the day holds two or more containers. A day used to be one session, so
the day header was the only place a session could be called anything; now every
workout carries its own name and an unnamed one falls back to the day's, so
drawing both was the same string twice in a 145px lane. `dayLabels` is NOT
removed from the model — it is the name of a SLOT, still on the wire, still read
by the phone's week tiles, the rest card, *Across weeks* and the progression
panel, still edited by the day menu's *Name this day* — and what renaming a day
now does on this board is rename the unnamed container in it.

- **Clicking the container opens the workout dialog; dragging it moves it, and
  those are the only two gestures a collapsed container answers.** The rows
  inside carry no `⋯` and no grip, and the box has no `+` of its own — a
  collapsed day is a SUMMARY of what a session is, and every write against it
  is in the dialog behind one click, where the whole session is on one screen
  to be ordered against. The two are separated by the browser (a completed
  HTML5 drag fires no `click`) plus two guards in `WorkoutCard`: a press or a
  click inside a control of its own is that control's, and a live text
  selection stands the open down. **Not a `role="button"`** — the box holds the
  `⋯` — so the keyboard and AT route into the same dialog is that menu's *Edit
  workout*, exactly as the day's drop handler is the pointer shorthand for
  *Move to…* (SC 2.5.7).
- **The container's whole box is the drag handle**, and the drag carries
  `WORKOUT_MIME`. It was the header strip alone, on the argument that a box
  draggable everywhere cannot hold a selectable rep count; nothing inside it
  competes for a press any more, so the surface a trainer aims at to MOVE a
  session is the surface they aim at to OPEN one. Arming is `mousedown` on the
  box, skipped over any `button`/`a`/menu, so the `⋯` never arms a drag. The
  `e.target !== e.currentTarget` guard in `onDragStart` stays: it was written
  for a row drag bubbling out of the container (one exercise dragged onto
  another day moved the whole session, because the payload gains
  `WORKOUT_MIME` before `stopPropagation` can help). No row on this board
  carries a grip any more — see *The day card is one level* — and the guard
  stays anyway, because it is one line and the next draggable thing put inside
  a container would do it again. A day tests the payload's TYPE, never carrying
  state: `dragstart` and the first `dragover` land in the same task.
- **Every container write that re-places a card is animated** through
  `DayReflow.reflow` — a view transition scoped to the `.pgw` scroller.
  **`names:false` for a cross-day move, and that is a measurement**: a container
  that changes day is a different DOM node afterwards, both nodes briefly carry
  the same `view-transition-name` inside the update callback, and Chrome refuses
  the whole transition (`InvalidStateError · aborted because of invalid state`)
  — every cross-day drop animated nothing while the identical write from *Move
  down* or *Paste* animated fine. Without the container names the day cards are
  still named (`.vt-days`) and the board morphs around the change. Arming also
  waits a task: React flushes a discrete event synchronously, so arming inside
  `onDrop` put the capture inside the drop's own task.
- **Dragging MOVES. *Copy to day…* arms a clipboard** and every other day draws
  *+ Paste {name}*; the source day draws the cancel. Escape clears it.
- **An unnamed container is named the moment it stops being alone on its day**
  (`nameTheUnnamed`), from the day's own label — *Workout 1* / *Workout 2* is a
  position, not a name, and it is all two legacy boxes would have left.
- **Editing a container does not touch the shelf.** `WorkoutBuilder`'s
  `onLocalSave` hands the draft back instead of saving a template: the rows on
  the day are a copy, and *a copy is a copy* holds one level up too. The round
  trip is `workoutWireOf` → `fromWire` → `toWire` → `entriesFromWorkout`, so one
  pair of translators serves both directions and an edited session cannot come
  back different from a saved one.
- **A copy is a copy here as well**: `copyWorkoutTo` re-mints the container id
  and every `groupId`, and a half-session dragged onto an empty day gets a new
  id carrying the old name — two days sharing one container id would make
  *Delete Upper A* delete both.
- The **phone draws containers as headings, not boxes** (`.wsm__wkh` — `.wsm__wk`
  is the week strip): there is no drag there and no room for a second border.
- **The day's own *+ Create workout*** writes a NEW session, which is a
  question about the day rather than about any container on it.
### The day card is ONE level

**A `DayCard` is a summary and nothing else: clicking a day expands nothing, and
every day is fixed in the week.** It used to have a second level — the header was
a toggle, `DayEditor` replaced the summary with a four-column input grid spanning
every track of the board, one card grew ~400px and the other six re-placed
themselves around it. Removed (14 Sep 2026), and `DayEditor.tsx` with it.

- **The writes it held have a better home.** Law 5 put every session in a
  container, and clicking a container opens `WorkoutBuilder` — the whole session
  on one screen, with its rows, its numbers and its ordering. The inline level
  was a second, narrower route to those writes and the only one that cost the
  board its shape: seven lanes dropped to a stack for as long as a day was open,
  so *which days does this program train* was a picture the trainer lost the
  moment they went to write one of them. `weekLanes` no longer reads an open day
  and `.wsd--open` is gone from `app.css`.
- **The header is an `h3`, not a button** — unless the board hands it `onPick`,
  which only the DAY axis does (click a week card to make it the live one). A
  control that answers a press with nothing is the false affordance §22 records,
  so the element is chosen by the handler and the two cannot drift.
- ***Name this day* writes where it is asked for.** The `DAY NAME` field was in
  the editor, so the menu item did not rename anything — it opened a day and left
  a trainer in front of an input. The card's header strip becomes the field now
  (`.wsd__nmin`), committing on Enter or blur and reverting on Escape, which it
  consumes so the shell's ladder does not spend a rung on it.
- **Row drag is gone with the grip that started it** (`ROW_MIME`, `useGrip`,
  `WeekBoard.onDropRow`, `carryingRow`). The editor's grid was the only surface
  that ever made a row draggable; reordering inside a session is the dialog's.
  What a day still takes is a movement out of the library dock and a whole
  CONTAINER off another day.
- ***Across weeks* survives on the phone only** (`AcrossWeeks`, `.wsp`) — it was
  the open day's second tab on the desk. `useDayReflow` keeps `reflow` and its
  reveal effect (now keyed on the library's day alone) and lost `openWithReflow`.

- **Not yet wired**: the client's own copy (`ClientPlan`) and the certified
  preview draw containers but hand over no container actions — so nothing on
  those boards opens the dialog, and they keep the day-level *+ Add exercise*.

### A copy is a copy

`POST /v1/templates/{id}/apply` writes an independent `program` with its own
rows. **Nothing reaches back through `program.template_id`** — which is what makes
*Duplicate* the most-used action on the shelf rather than a nervous one. The
deliberate override is `POST /v1/programs/{id}/resync`, one program at a time,
behind a confirm naming what it will not touch: **the client's weekday and time
stay exactly as they are**, and every logged set is untouched because history keys
on the program and the exercise, never on a `program_exercise` row id.

### The client's own copy — V2

`/clients/:clientId/program/:programId`. `V2__program_shape.sql` added
`day_labels`, `weeks`, `training_days`, `synced_at` to `program`, plus
`PUT /v1/programs/{id}/exercises` (the builder's save, one transaction).

- **`copyBlueprintInto` translates rows through `program.schedule`** — so a
  template's slot 3 is a concrete weekday on the copy. Three things follow, and
  each would otherwise be silent: `TemplateService.shapeFor` re-keys the labels;
  `PlanDiff.between` translates before comparing; and the board draws
  `weekdayWord`, not `ordinalDayWord` — `DAY 2` on a Tue/Fri client's copy is
  their FIRST session of the week. `WeekBoard`, `DayCard`, `PhoneProgram` and
  `LibraryDock` take one optional `dayWord`; the builder passes nothing.
- **The mock repo deliberately still passes `ordinalDayWord`** — on that wire a
  copy's days really are slots. The better end state is fixing the mock.
- **The crumb is the only way back to the client on a desk, and there was
  none.** `TopBar` takes a `crumb` and a `titleHref` and draws NEITHER above
  900px — the workspace switcher holds the bar's first slot wherever there is a
  host, and `.top__title` is declared inside the 900px block. So a trainer who
  opened one client's copy on a 1440px screen had no control on it that named
  the person the plan belongs to. `.pg__phm` now carries
  `Clients / {client} / {program}`, the same three segments `Progress` and
  `ExerciseHistory` draw, the middle one the client's FILE rather than this
  screen's parent tab. **It stands down at 900px**, where `top__title--back` is
  a 44px control with a chevron and already built — which is the trade
  `TopBar`'s own note makes when it rejects *a crumb row inside `.ph`* at ~22px
  on the tallest header in the app. Above 900px the bar draws nothing, so the
  trade inverts. Measured cost on the desk: a flat **24px**.
- **Here the PROGRAM's name gives and the client's does not** —
  `.ph--plan .crumbs>b{min-width:0;flex-shrink:9999}`, the inverse of the
  session screens. The trailing `<b>` is the program, drawn again as the `<h1>`
  24px below; the client's name is the only thing in this header naming the
  person. §03 gives `<b>` an ellipsis and no `min-width:0`, so it floored at its
  longest word while `.crumbs__who` collapsed — MEASURED at 901 the name was
  **33px** (`D…`) and `Push/ Pull/ Legs` kept every pixel. Weights, not a
  breakpoint, so nothing needs a rung the next time the action row grows a verb.
- **`.ph--plan .pg__phm` has a 180px floor, and it fixes the `<h1>` too.**
  `flex:1` + `min-width:0` let the identity half collapse while `.ph__acts` kept
  its content width. MEASURED with a 53-character plan name (which makes the
  *Tuned · N changes* and origin buttons 662px): `.pg__phm` was **11px at 981**,
  the heading clipped to nothing, the subtitle wrapped to 207px of header, and
  the crumb's link drew at **0px wide** — a focusable control that cannot be hit.
  The row only wrapped at 960, two hundred pixels late. With the floor the
  header is 146px there instead of 288. Pre-existing for the heading; the crumb
  is what made it visible. **1081–1280 still squeezes** (no wrap above 1080) —
  the name clips to 33px and stays hittable, and that band is untouched.
- **`behindTemplate` reads `synced_at`, not `updated_at`.** An editable copy moves
  `updated_at` on every save, so a copy tuned this morning reported itself up to
  date having never received the blueprint's edit. Tuning a copy does not move
  `synced_at`.
- **`AssignmentResponse.divergence`** is what each copy says that its blueprint
  does not, computed by `PlanDiff` — a clock cannot tell an untouched copy from
  one rewritten for an injury, and the push replaces the prescription either way.
- **`PlanDiff` only names a weekday where a schedule says which weekday it is.**
  Two seeded copies have no schedule; without one it says `Day 1`.
- **`V2` deliberately does not touch `updated_at`** — that drives the sync cursor,
  and moving it would push every program to every phone as though a trainer had
  edited it.
- **The web's `diffPlans` takes `program.schedule`** (appended to
  `ProgramResponse`) and translates once at the top. `Builder` passes none — it
  diffs a blueprint against its own draft, both already in one numbering.

### The week sheet (the builder)

Days down the page with a docked library and a balance panel; three levels on a
phone (week → day → exercise).

- **The builder autosaves; there is no Save button.** Debounced, not
  per-keystroke: `template.structure` is one jsonb column and every save rewrites
  the whole blueprint. The row panel keeps its explicit Save.
- **The undo stack is real, at 20.** Every write is a pure function from one entry
  list to another, so the stack is a stack of arrays.
- **The strip's second control is *Duplicate week*, not *Set a rule*.** Copying
  this week forward is what a trainer does far more often than laddering one,
  and it was reachable only from a day menu, one destination week at a time.
  `DuplicateWeekPanel` asks three questions — which weeks (the next, every
  second, all of them), what happens to weeks that already hold something
  (replace · keep both · skip), and whether the copies climb — and the four
  ladder seeds ride along inside it, word for word from `ProgressionPanel`. The
  climb is by DISTANCE from the source week, so week 5 reads the same whether
  or not week 3 was written. `overloadLine` is still drawn in the strip, as a
  READING beside the repeat line; `ProgressionPanel` keeps its other two doors
  (the phone's week menu, `/clients/[id]/plan`) for the case it is better at —
  editing week 6 of a ladder by hand. The phone's week menu carries the copy
  too, above the copy-onto chips.
- **The prototype's delta rule deliberately did not port.** It writes a typed
  number across every week because it GENERATES weeks 2–8; here law 3 means every
  other week is rows somebody wrote, so a number typed against week 3 belongs to
  week 3 alone.
- **`selfSaved` skips exactly one reload after a flush.** The refresh returns a
  template whose stamp differs from the loaded one, which is indistinguishable
  from another tab's edit — so it reloaded identical rows and cleared 20 steps of
  undo every 900ms.
- **The dock passes the whole row; `names` is a local overlay.** `names` is
  fetched for the exercises the template already uses, so a freshly added row read
  "Exercise not in your library" and the balance did not count it.
- **`blocksOf` everywhere.** Mapping rows flat with `i + 1` shows `3a`/`3b` on the
  card and dissolves a superset into two straight sets when the day is opened.
- **Deleted with the columns:** multi-select, the bulk bar, the *moving* mode,
  HTML5 drag, the days/weeks toggle. **The drag is the real loss and is stated
  rather than hidden** — `dropEntries` and `moveEntries` are still in
  `blueprint.ts`, unused. Reordering is *Move up* / *Move down*, which was always
  the keyboard path and the only one that worked on touch.
- **`targetLoad` is offered, empty.** §22 refuses a load on a template; the wire
  has carried it since templates existed and `apply` has always copied it.
- **MEV and MAV are a band, never a target.** Every sentence says *under the
  floor* or *above the ceiling*, never *you should do 15*.
- **Not built:** EMOM and AMRAP-as-a-format. A superset is one nullable field; a
  TIMED circuit is a container with its own duration — a table, not a column, and
  it should wait until somebody asks. The untimed chain is built, one level down,
  on the workout template — see *The workout template* above.

### The certified shelf

In-house authored, one publisher, no marketplace. **Using one COPIES it** onto the
trainer's shelf first — which is why **there is no *Assign* on that shelf**: a
certified blueprint has no owner a trainer can edit, so assigning it directly
produces a client plan whose *edit this program* button leads nowhere. A certified
revision is a **notice, never a merge**.

`copied_from.updatedAt` stores the origin's stamp **as at copy time**; storing the
current stamp makes the comparison always equal and the notice unreachable.

The catalogue is a card grid where `/programs` is a list: the deciding information
about forty programs nobody has seen is a **sentence**, and a sentence does not fit
a 44px row. Filters are client-side and out of the URL (thirty-one URLs nobody
will link to); the thing a trainer links to is one program, and that is a route.

### What an exercise is

- **The target is on the row.** `Barbell Bench Press` and `Close-Grip Bench Press`
  printed the identical meta line; the catalogue has always known one targets the
  pectoralis major and the other the triceps. A panel is opened one row at a time;
  a list is read all at once. `DayBand`'s column is headed **Target** and drew
  `muscleGroup` — so two different movements both read *Legs*.
- **Search matches `name`, `target`, `movement_pattern` and `body_part`** — a
  trainer who knows what they want by shape got nothing back.
- **One panel, two doors.** `ExerciseInfoView` (in the library panel) and
  `ExerciseInfoPanel` (from a row's menu) render one component. Not `.panel`: 420px
  with a scrim would cover the column the trainer is filling.
- **Ordered for choosing, not teaching**: identity → targets → movement → **in
  this program, week N** → instead of this → form cues → how to → your note.
  Section four is the one only the builder can write. An empty section draws
  **nothing**, never an empty heading.
- **`contextFor` takes the exercise, not its id** — looked up in `names` it
  reported *Chest is 0 sets this week* for every exercise not yet in the program,
  which is the case the panel exists for.
- **Two owners, labelled apart:** `notes` belongs to this program and the trainer
  wrote it; a form cue belongs to the movement and is identical everywhere.
- **The exercise library is text-only.** The upstream artwork is unlicensed;
  V22 dropped the media columns.

## The workout console

Three things a 390px screen cannot do, and the layout is those three: **the
history beside the entry**, **catching up a session logged on paper**, and
**correcting the past** (a record is computed on read, so one fix corrects nine
months in the same frame).

- **A session lives at `/clients/:clientId/sessions/:id`.** It was `/sessions/:id`
  — a flat id with the owning row nowhere in the URL, on a product where a
  session has exactly one client. All four screens moved (the view, `/log`,
  `/finish`, `/bests`); **`/sessions` and `/sessions/new` did not**, because the
  list is a view across everybody and the picker is where a client is chosen.
  `lib/sessions/href.ts` is the only place that builds one — no `server-only`, so
  both halves can (trap 18). Three consequences: the old paths are **lookup
  redirects**, not `permanentRedirect`s, since the client is not in them and has
  to be read; `refresh()` in `lib/log/actions.ts` revalidates the **route
  pattern** with `type: 'page'` rather than a literal path, because eleven call
  sites hold the session id without the client's; and `currentFor` now lights
  **Clients** for the whole console with no branch, since the path starts
  `/clients`.
- **`/sessions/:id` is a booking and `/log` takes the same id.** `resolve` tries
  both against one already-fetched list. `?ex=` and `?plus=` are in the URL because
  *a place gets a URL, a moment does not*; the drafts are not.
- **Finishing the log does not move the pack. A pack moves on *done* or
  *no-show*, never on *booked*.** Starting a log is `POST /v1/workouts` and never
  `POST /v1/sessions/{id}/done` — the second creates the same log AND decrements.
  `markDone` reuses an existing log so the two paths never make a second row.
- **The attendance mark is not optional.** *Later* is gone: the mark feeds the
  balance, the balance feeds the expiry warning, the warning feeds `/today`, and
  `/today` drives a renewal. The `unmarked` band exists precisely because trainers
  took *Later*. It is not a lock — the rail and the back button are still there;
  what is removed is the *offered* escape.
- **Three things the model does that the phone's does not have to:**
  `workout_exercises` is not on the wire (the grid is reconstructed from the
  program's rows plus anything with a set in this log); there is no bulk set-log
  read (so the all-time max per exercise comes from
  `GET /v1/clients/{id}/progress` as `judge`'s floor — without it a bounded window
  hands out gold for beating a number that was never the best); and
  `exercise.log_type` is not on `ExerciseResponse`, so `readLogType` infers.
- **The design's *a no-show costs a session* is not used.** Nothing on the wire
  moves a pack for a no-show. §14: where a document disagrees with the code, the
  code wins.
- **The client is a SEGMENT of the crumb, not half of a label.** Five screens in
  this flow — the session view, the console, Finish, Top sets and the
  not-yet-started booking — drew `Sessions / Dhanush · Thu · 8 Oct` in one inert
  `<b>`, so a trainer who reached a session from Dhanush's file had no way back
  to it but the browser's Back. It is now `Clients / {client} / {stamp}`, the
  middle one a link to `/clients/:id` — and the ROOT is `Clients`, not
  `/sessions`: a session lives on a person, and `/sessions` is a view across
  everybody rather than the place any row came from. `TopBar`'s `crumb` moved
  with it on all five, since `screenTitle` derives the phone's header from it. **Nothing reads a referrer**: a session
  HAS a client, so the path is the same through all four doors (the list, the
  schedule, Today's queue, the client's own Sessions tab), and a crumb that
  changes shape with the door you used is a crumb nobody can learn. **It is the
  path at every width**, phone included — see the two bullets below for what
  that cost. On Finish and Top sets the middle segment used to point at the
  LOG — three segments still, so the row is the width it was measured at, and
  the way back to the log is the labelled verb in the action row.
- **`Client file` is GONE from both action rows, and the crumb is why.** The
  session view's labelled button and the console's ⋯ both pointed where the
  crumb's middle segment now points, eight pixels away — the sentence that took
  *All sessions* off the same header. **The removal is what pays for the phone
  crumb**: MEASURED at the 360 floor, the session view's acts drop 208 → 121 and
  the console's 205 → 165, which is the difference between `Clients` alone up
  there and `Clients / Dhanush`. So the trailing `<b>` stands down below the
  shell's line and the PATH does not — the date is said properly in `.ph__sub`
  two rows down, the name is the only way back to the person. `:last-of-type` on
  the separator, or two drawn links run together as `ClientsDhanush`. Client
  HISTORY stays on the console: a different screen, a different question, and
  the one a trainer reaches for mid-set.
- **The name is the segment that gives, and THREE rules make it give.**
  `.crumbs a.crumbs__who` is `min-width:0` plus an ellipsis at (0,2,1), so it
  beats §03's `.crumbs a` on `display` — an `inline-flex` box has no line box for
  `text-overflow` to clip. Both phone headers then needed the other two:
  **`minmax(0,1fr) auto` and not `auto minmax(0,1fr)`** (a bare `auto` track's
  minimum is its item's automatic minimum size and cannot be lowered from inside
  the track) and **`margin-right:0` on `.crumbs`** (§03's `margin-right:auto`
  makes a grid item shrink-to-fit instead of stretching, so the box being
  constrained was never the one overflowing). With either missing, MEASURED at
  390 with a 37-character name: the crumb sat at its 335px max-content, no
  ellipsis, and `.ph__acts` was pushed **101px past the row** — the screen's only
  primary verb off the right edge. Every real name in the dev database is short
  enough to hide it, which is the argument for the harness in one line.
- **The rest clock is wall-clock (`endsAt`), not a counter** — a browser throttles
  `setInterval` in a background tab, so forty seconds spent in WhatsApp must be
  forty seconds spent. It ticks at 250ms and re-derives from `Date.now()`.
- **Rest starts on a tick that logged something NEW, never on an edit** — catching
  up Tuesday's paper log at nine in the evening must not start a 90-second clock.
- **No rest set starts nothing**, and that is the first thing to check when
  somebody reports the timer not starting: the exercise has no `rest_seconds`, and
  **Change** is the fix.
- **Zero is a state, not an ending** — the phone deletes the rest at zero, which
  is right in a hand and wrong at a desk. The strip turns green and carries an
  *instruction* (*Rest over. Set 3 of bench press is up.*). It does not move and
  does not sound; it announces, through a **persistent** `.vh` `role="status"` —
  a live region inserted at the same moment as its content is read unreliably.
- **Steppers on load (2.5 kg) and reps (1), `tabIndex={-1}`.** Tab order stays
  Load → Reps → RPE, which is what makes catching up fast. Reps floor at 1, load
  at 0 (a bare bar is a real set).
- **`.sets--entry` keeps a 620px floor between 620 and 820px** (a desk window
  narrowed) and releases it below — on a phone the column behind the swipe was the
  TICK, the control that writes the row.

## Business

**Six pages in the section pane**, not seven tabs: *Overview · Transactions ·
Packages · Gym share · GST · Reports*. The rename from *Money* is not cosmetic —
*Money* named a table and **Business names the question**, which is what let two
rail rows and a stub become tabs in the first place; the split of 20 Sep 2026 is
that argument finished, because a tab that changes what the SERVER fetches is a
page. `components/shell/nav.tsx` carries it.

- **Two of the seven were never pages, and they are chips now.** *Pending* and
  *Write-offs* were `WHERE` clauses over the ledger's rows, and `LedgerFilter`
  had already spelled two of the three before the split — so one slice of one
  table had two controls at two altitudes. Transactions draws
  `All · Collected · Pending · Written off · Gym share`, each with its count.
  `OwedTab.tsx` and `WriteOffsTab.tsx` are deleted; the chase list's nudge button
  is on the Overview's *Needs you*, and the write-off card's one unique figure —
  *% of billed* — is in the summary card beside the table. **Gym share survives
  the same test** because it is not a subset of those rows: it is the floor's
  arithmetic, read through the split percentage.
- **The Overview is the page that did not exist**, and it is built to one rule:
  **no figure is stated twice**. Enforcing it MOVED three things rather than
  copying them — the six-bar trend and the *You earned / Pending / Still to
  deliver* tiles came off the ledger, and GST's *Best month* tile (the peak of
  the same rolling twelve) became *this financial year*, which is the figure only
  that page can state. Where two pages want one number, the Overview links.
  Every section head on it is a door. `components/business/Overview.tsx`.
- **The period lives in `app/(main)/business/layout.tsx`.** It was `useState` in
  the one component that drew all seven tabs, which unmounts on every move
  between six routes. A layout does not re-render when the segment under it
  changes, so `PeriodScope` outlives every navigation inside Business and dies on
  the way out — the same lifetime the old state had. **Not a search param**: the
  period changes nothing the server fetches, and a param would cost a round trip
  per glance at a different month.
- **The money book is deliberately NOT fetched in that layout.** Packages wants
  the `pack` table and nothing else; a layout fetch would make a price list pay
  for the whole payments book. `getMoney` is `cache()`d, so the four pages that
  do want it pay once each wherever the call is written.
- **The export finally means one thing.** `Business.tsx`'s `handleExport` was a
  five-branch switch on the open tab — pending gave the chase list, GST silently
  widened the window to twelve months — so one button produced a different file
  depending on a control 200px away. Transactions exports the rows the chips have
  left on screen; GST has its own *Export the year*.
- **`/business?tab=…` still works.** Five of the seven `permanentRedirect` to
  their page; `owed` and `writeoffs` take a temporary `redirect` to
  `?filter=`, because those two are not gone — they are chips, and a 308 would
  cache a mapping a later pass could reasonably change. `?record=` forwards to
  Transactions, which is where `RecordPanel` lives now.
- **The period is state and the URL is `/business`.** `getMoney()` has never
  windowed — `/v1/payments` unwindowed, `computeLedger` slices in the browser — so
  the old `[month]` segment named a filter over a payload the page already had. And
  one calendar month cannot express *the last 3 months*. `lib/money/period.ts`
  defines `{kind:'month'|'recent'}`; spans are anchored to **today** and the
  current month is always whole. Nothing is persisted.
- **`PERIODLESS_TABS` is `showPeriod={false}` on `BizHeader` now.** Packages has
  no period at all and GST is a rolling twelve months against a statutory
  threshold, so a picker above either offers a choice that changes nothing.
  Reports joins them — it spans its own fixed year.
- **The three tiles that opened the ledger are the Overview's**, and two of the
  three were never about the ledger: pending is the whole book as of now, and
  undelivered coaching is a fact about packs. Transactions keeps only figures
  that total the rows in front of you.
- **`computeUpcoming` answers a question the product could not.** Pro-rata by
  sessions; the whole amount for a monthly pack. **Paused packs are counted**, and
  counted separately so the tile can say so.
- **`computeLedger` windows on `created_at` and `computeTrend` on `paid_at`**
  (falling back to `created_at` — the phone has never sent one). Billing is what
  was raised; income is what arrived. **Two readings of the same rows, both right,
  and a screen that mixes them produces two totals that will not agree.** The
  current month is drawn in the accent and kept out of the average.
- **Recording a payment used to record a debt** — `RecordPanel` wrote
  `status:'pending'` and nothing on the web could confirm one. It sends `paidAt`
  now and the row is written `paid` with the gym's cut stamped.
- **CSV is the whole tax feature** — no invoicing engine, no tax computation, no
  filing. Amounts are bare numbers (a `₹` makes a spreadsheet read the column as
  text) and dates are `YYYY-MM-DD` (Excel reads Indian `DD/MM/YYYY` as American).
  The GST tab computes no tax; it tracks headroom against the ₹20L threshold.
- **Expenses are not built** — `payment` is a client paying a trainer and carries a
  `client_id`. An expense needs its own table, and the real net-income figure needs
  it first.

### Reports

Two audiences on one page and **no shared figure**: the practice report at
`/business/reports`, the client's 12-week card at `/clients/:id/report`. The
page's foot is a list of clients ranked by sessions, each row a door. It is the
expensive read in the section — a year of the diary plus every workout log — and
being a route is what keeps that cost off the other five.

- **Windows deliberately differ**: money and adherence over 90 days, clients and
  retention over 30. Each tile says its own.
- **Delivered is a marked booking OR a workout log**, folded on `(client, day)`.
- **Churn is inferred** — `status='archived'` exists and almost nobody sets it. A
  client is lost in the month of their last delivered session **provided
  `ACTIVE_DAYS` have passed**, so the most recent month or two reads zero rather
  than guessing, and the card says so. A `paused` client is not lost.
- **Every rate is a rate of what is KNOWN** — unmarked sessions are in no
  denominator, and the count is drawn as a banner with a way to close them off.
  One wrong red figure is all it takes for a trainer to stop believing a tile.
- **The client card is a painted 1080×1350 PNG**, not a screenshot: html2canvas is
  a 200 kB dependency in a project with four, a DOM screenshot inherits a desk's
  layout, and it is only as good as the machine it was taken on. **The preview IS
  the artefact** — two renderings drift, and the one that drifts is the file that
  leaves. The canvas must read its font stacks off `--tx-font` at paint time, or
  `next/font`'s generated family name silently paints Times.
- **Strength is the first day against the BEST day, not the last** — a block often
  closes on a deload. Ranked by proportion.
- **A personal best is a claim about the whole history**, so the sets read is
  unwindowed, counted once per exercise per day.
- **No colour on any change**, on the card or beside it: a green arrow on a card
  the client keeps is the product taking a side in a conversation it was not in.
- **A thin report is refused rather than generated** — a card with a name and no
  figures reads as *you have done nothing*.

## Nudges

**No screen. Buttons next to the thing that triggered them, the wording in
Settings, the record in `nudge_log`.**

- **Delivery is a `wa.me` deep link and nothing sends.** The server renders the
  message, logs that it was drafted, hands back a URL; the trainer reads it and
  presses send. That is the right answer for v1, not a scoping compromise: no
  Business API approval, no template review, and a message from the trainer's own
  number lands in a thread the client already has open. **Automation would make
  this worse.**
- **`window.open` runs after an `await`**, so a popup blocker may refuse it and
  `noopener` makes the return value `null` either way. **The sent state always
  renders a real *Open WhatsApp* link** — a row that says *Sent* when nothing
  opened is the worst outcome, because the nudge IS logged and the cooldown then
  suppresses the reminder that never went.
- **`nudge_template` is an OVERRIDE table.** A trainer who has never opened the
  library has no rows. Seeding eight on signup freezes today's copy into every
  account; reset is a soft delete so it returns to the LIVE default.
- **`lib/nudges/` holds no wording, no labels and no variable meanings** — all
  three come from `GET /v1/nudge-templates`. Only the set of NAMES is declared
  here, as a union.
- **`{count}` means a different number per template, on purpose** — splitting it
  into `{left}`/`{done}` makes a trainer remember which of five count-shaped
  variables this one takes. `{nth}` exists separately because *your 3th* is a bug.
- **An unknown token is left as itself**, not blanked — blanking is how a client
  receives "Hi , you owe .".
- **The preview is a sample and says so.** It is not the renderer; the server
  renders against live figures.
- **The cooldown silences the prompt; it does not block the button.** A contacted
  client's row sorts below every uncontacted one. Blocking teaches a trainer to
  open WhatsApp directly, which loses the log for **everybody**. It is **per
  client, never per template**, and only `MESSAGE_KINDS` (`pack`, `overdue`,
  `missed`, `quiet`, `milestone`) are quietened — `unmarked`, `no-program` and
  `log` are the trainer's own housekeeping.
- **The header's WhatsApp button stays a plain link and logs nothing.**
- **Nudge buttons are not held for ten seconds** — the queue's hold is about the
  queue; these are one button about one person, and the review step is already the
  delivery.
- **Not built:** scheduled/automatic nudges (v2; `nudge_rule.action = 'auto'` is
  the column waiting), a nudge on `/today`'s session rows (a single `<Link>` wraps
  every cell, so a nested `<button>` is invalid markup), and a birthday template.

## Profile, settings, account

`/settings` is a tab strip (**Account · Measuring · Nudge messages**) in a
`(sections)` route group — **which it has to be**, or the layout would also wrap `/settings/profile`
and give it two bars and two strips.

`/settings/profile` is **seven tabs**, one route each: Identity · Certifications ·
Experience · Specialities · Languages · Work & hours · Social links.

**The profile is what a CLIENT reads. Settings is what only the TRAINER reads.**
That is why the profile is reached from the account menu and the working week is a
section of *Work & hours*.

- **The whole strip is ONE screen: a form column and a sticky preview beside
  it** (`c-sidecar`, `ui/Sidecar.tsx`, in `layout.tsx`). *How clients see you*
  used to be drawn inside the identity form, which put it inside one of the
  seven tabs — so the six tabs whose answers it shows could not see it, and on
  the tab that could it scrolled away as soon as the bio got long. MEASURED at
  1536×695 before: a **560px column of fields in a 1409px content area** (849px,
  60% of the page, empty), 1046px of content in a 510px window, and the card
  gone by the time the field it previews was being typed. After: 600 + 380 in
  1008, overflow 536 → 231, and both columns starting on one line.
- **`.body` is the LAYOUT's, not each page's.** A sticky aside cannot stick
  inside a scroller a sibling page owns, so the seven pages render their panel
  and nothing else. `getIdentity` is `cache()`d for it: the layout and the page
  both read the profile and that is one `/v1/trainers/me`.
- **`ProfileDraftProvider` is what makes the card live, and it is an OVERLAY.**
  `{...server, ...patch}` — never `useState(initial)`, because React keeps a
  layout across a navigation between its children, so `initial` changes under a
  provider that is mounted once. Every panel publishes what the CARD draws (and
  only that) from an effect, never a change handler. The overlay carries the
  pathname it was typed on and is read as empty from anywhere else: `SaveRow`
  warns that switching tab loses unsaved edits, and a preview that survived the
  thing it was previewing would make that warning a lie. Trap 21 — the clear is
  a render-time read, not a `setState` in an effect.
- **The empty-section card is a CHECKLIST, not a score.** No percentage and no
  ring: a trainer with no certificates and no YouTube channel has an honest
  finished profile, and a bar calling that 71% is the product naming it a
  deficiency. It is drawn only while something is empty, and the sections are
  chips rather than rows — MEASURED with all seven empty, which is a trainer who
  has just finished setup, the row form put **979px of sticky column in a 454px
  window** and the form beside it only had 231px of scroll to push it with.
- **One save per tab, each sending only its own fields** — the backend's *null
  means leave it alone* contract is exactly shaped for it. Two tabs sending the
  whole profile means the older of two open tabs silently wins.
- **`SaveRow` draws no button when nothing is dirty**, on all seven tabs. An
  always-live primary has to answer being pressed with no edits, and every answer
  is bad. (This is *not* the greyed-out primary `NameForm` argues against: in
  setup, pressing Continue is how a trainer finds out what is missing.)
- **The pickers are extracted, not copied** — `CertificationPicker`,
  `ExperiencePicker`, `SpecialityPicker`, `LanguagePicker`, `WeekPicker`, all
  rendered by both setup and Settings. Two copies of a picker is how one answer
  set ends up with two spellings.
- **A picker draws every id it was GIVEN, not every id it knows.** In setup a
  value can only come from the chips; on the profile it comes from the server,
  which holds whatever the phone, an older catalogue or a seed last wrote. Drawn
  the other way, an unknown id was **invisible and still counted** — and Save
  wrote it straight back. An id with no label renders as itself: ugly, honest and
  removable.
- **Settings can clear a list; setup deliberately cannot.** `[]` is *clear it*.
- **`lib/profile/api.ts` is separate from `lib/setup/api.ts`** even though both
  PATCH one endpoint — `getSetupState` reads a full `/v1/sync/pull` beside the
  profile.
- **V33 Identity:** `headline` (80) and `bio` (1200) are **refused over the cap,
  not truncated** — dropping the last sentence of somebody's prose while answering
  200 is worse than saying no. `intro_video_url` is stored **canonical** and
  `introVideoId` rides the wire. **There is no profile photo** — this backend has
  no image store of any kind, and the initials avatar says so.
- **The bio's placeholder is a whole example bio.** "Tell clients about yourself"
  produces nothing or an essay: seventy words sets the length, the register and
  the subject. The counter reports words, then characters, and never says *too
  short* — a warning on an optional field is an accusation for having answered it.
- **V34 Work & hours:** `training_modes`, `map_link`, `service_areas`. It
  deliberately does **not** reuse `work_mode` (V23) or `gym_name` (V11) — those are
  the money book's defaults hint and must never gate a feature. **Where you work is
  not how you are paid**: a `gym` trainer may still take Sunday home visits.
  `map_link` is stored **verbatim** (no `MapLink.java`) because a maps URL has no
  canonical shape and a normaliser would eventually break a working link;
  `service_areas` is free text because no locality list is right in two Indian
  cities. **Hybrid is not the other three added together** — it means one client's
  week is both.
- **One Save on that tab, calling only what changed.** Place is a PATCH and the
  week is a `/v1/sync/push`; `placeDirty` and `weekDirty` gate each. **Only
  sending the dirty half is a correctness rule** — `WeekPicker` keeps one set of
  windows for every day picked, so writing the week back when nobody touched it
  flattens a differing Saturday. A half that failed stays dirty and says so.
- **Moving to *on my own* clears `gymName` AND `gymSharePercent`.** Said in the
  success message **after**, not as a `.fld__e` before — the app's validation red
  over a perfectly valid answer, beside a section that had just correctly
  disappeared.
- **V35 Social links:** two named columns, not a `social_links` list — a generic
  list cannot be validated per platform and needs a catalogue to render. Both are
  **canonicalised** (`SocialLink.java`), unlike `map_link`: *a profile reduces to
  a handle and a video to an id, both whole facts; a place reduces to nothing.*
  The canonicaliser must never rewrite the identifying part — a channel keeps
  whichever of `/@handle`, `/channel/UC…`, `/c/…`, `/user/…` it arrived as.
  `youtube_url` is a **channel** and `intro_video_url` is one video, so a watch URL
  in the first is refused with a sentence naming the field that wants it.
- **`lib/profile/social.ts`'s checks are deliberately LOOSER than the server's** —
  a stricter copy refuses links the server would have taken, which is the worse
  failure. Same call as `lib/account/rules.ts`'s email shape check.
- **V5 Measuring:** the cadence and the sheet a NEW client is offered. Its own
  tab and not a section of the profile, on the strip's own line — the profile is
  what a client reads, and how often a trainer gets a tape out is nobody's
  business but theirs. It is also the only place the sheet can be chosen, since
  every client inherits it. **Changing it does not reach existing clients**, and
  the screen says so: a cadence is an arrangement with one person, and rewriting
  every client's because a default moved would silently reschedule a roster.
- **V36 Account:** `trainer.email` is a **contact detail, not a credential** — no
  mail transport exists, so it is stored, shown back, branched on by nothing, and
  deliberately **not unique and not indexed**.
- **Changing a number proves BOTH numbers.** The old one because a 7-day bearer
  token would otherwise walk an account onto a thief's phone; the new one because
  a mistyped last digit is an account moved to a stranger with no way back. The
  ticket is a 10-minute signed JWT in an **httpOnly cookie** and is never an
  `Authorization` header. Resending asks the server rather than reconstructing a
  **fourth** copy of `RESEND_LADDER`.
- **Deleting is `deleted_at` on both rows and the number is NOT released** — both
  phone columns are plain UNIQUE indexes, deliberately, since the trainer's
  clients, packages and payments all still point at that row. The confirmation is
  **the number, typed**, matched on the last ten digits. **No OTP on the delete**:
  changing a number is an attacker's goal, deleting is nobody's but the owner's.
  **The delete runs before the sign-out**, or it 401s.
- **`waitPhrase`, not `mmss`, for a frozen wait.** `mmss(6752)` renders `112:32`,
  which reads as a clock time.
- **A count works as a warning only while it is a quantity** — *your 0 clients*
  takes the general sentence, and so does a roster that failed to load.
- **`webapp.css`'s reset is `ul,ol{list-style:none}`** — four claims about
  something irreversible rendered as one grey paragraph the eye skips.

## The shell and navigation

**Five destinations**: Today · Clients · Schedule · **Fitness** · Business. Eleven
was the tell — a navigation column that needs headings has stopped being a list of
places and started being a taxonomy of them. Six of the eleven were **tabs that
had escaped** and are each now one level closer to the screen that wants them.

**Three of the five are SECTIONS and draw a second column** — `SectionPane.tsx`,
212px, between the rail and the content. Today and Schedule are single screens and
draw none.

- **The pane is derived from the route, never from a click.** No open state
  anywhere: a deep link, the back button and a click on the rail produce the same
  chrome, so there is nothing to fall out of step with the URL.
- **A section's pages are `Destination.pages` in `nav.tsx`**, and the first page's
  href IS the destination's href — clicking the rail row and clicking the top row
  of the pane it opens are one navigation, not two answers to one press.
  `undefined` (not `[]`) is what makes a destination a single screen.
- **`pages` is absent on Today and Schedule, six rows long on Business and one
  row long on Clients** — deliberately, so the chrome does not grow a 212px column on the
  release that adds a second link. Those two lists are not finalised.
- **A tab strip above a page is now only ever *views of this page*.** That is what
  the split bought: section navigation went to the pane, `ProgramsTabs` was
  deleted, and `Completed · Scheduled · Missed` on Workouts means what it says.
  **`Programs · Templates` is the one strip that crosses a route**, and it is a
  view rather than an exception: both answer *which blueprint do I start from*,
  of two shelves, with the same row and a different verb — *Open* on the
  trainer's own, *Use this* on one they must copy first. `lib/programs/tabs.ts`
  owns the list so the two screens cannot disagree about what is on it.
- **The pane is `display:none` under 900px and `TabBar`'s sheet carries the pages**
  — as a headed group per section, replacing that destination's own row. Both
  surfaces read `pages` through `sectionFor`, so neither can name a page the other
  does not.
- **`.app.app--pane` is two classes on purpose.** §03's `.app--rail-min` sets
  `grid-template-columns` at one, and the 900px reset restates the pane rule at
  the same two — a media query adds no specificity (trap 1).

`components/shell/nav.tsx` is the one place destinations are declared, with a
`purpose` per row that the rail hangs on `title=`, the sheet draws and `Palette`
reads. **Two copies of a destination list is how a screen ends up reachable from
one surface and not the other.**

- **The bar's order is not the rail's** — `Today · Schedule · (+) · Clients ·
  More`. The rail is read; the bar is aimed at. `BAR_ORDER` is a list of keys
  looked up in `PRIMARY`, throwing on a miss, so the bar cannot name a place the
  rail does not.
- **The centre + is not a fifth tab**, never takes the selected state, carries no
  `aria-current` and has no label. Raised 13px with a 3px ring in `--w-rail-bg`;
  three consequences: `.tabs` may never take `overflow:hidden`, `.body` gains
  bottom padding under 900px, and the slot needs `z-index:2`. It is
  `flex:0 0 auto` — a column flex container shrank a 52px square to 42.
- **All five + rows land on an open form.** `?new=1` / `?record=` are read by
  `Schedule`, `ExerciseLibrary` and `Business` through three pieces: a `useState`
  initialiser (not an effect, which paints the un-opened screen for a frame), a
  render-time adjustment for arriving here *from here*, and then the parameter is
  stripped.
- **Both surfaces are always rendered and CSS picks one.** A component that
  branches on a measured width renders the wrong half for one frame after every
  resize and cannot be server-rendered.
- **The workspace switcher holds the bar's first slot.** With three tenants
  *where am I* is two questions — which book and which screen — and the bar has
  room for one. The screen is written down twice already (`aria-current`, the
  `.ph` `<h1>`); the book was written down nowhere. `crumb` stays a required prop
  and is still drawn where there is no host.
- **The workspace list is derived, never configured** — built from the trainer and
  `/v1/team`. `/v1/team` answering 404 IS the answer. The cookie is resolved
  against the list, never trusted.
- **Two cookies, split by LIFETIME.** There is one *open the app* moment and only
  one setting can own it: the year-long default owns the launch, the session
  cookie owns the sitting. Whichever loses would be a dead control. **Starring a
  row pins the sitting first** — `activeId` falls back to the default, so moving
  the default moved the screen underneath the reader.
- **Only the switch is built.** Every workspace still draws the same data; the
  tenanted reads are a backend change.
- **`/team` is a live route with no entry point in the chrome** — a known gap with
  an owner: managing a team is a screen *inside* the team workspace.
- **The bell holds EVENTS; Today's queue holds STATE.** A notification is
  something somebody else did, at a moment, read once and then history. **A
  notification never carries a verb that changes the book.** Two surfaces listing
  the same rows means every verb has two homes.
- **Opening the panel does not mark anything read** — a count that clears itself
  on being looked at is a count nobody can trust. Sorted by time, never
  unread-first: a list whose order changes as rows are read moves under the
  pointer.
- **The test for a new notification kind is whether the product can OBSERVE it.**
  There is no *client replied to your reminder*: nudges go out through `wa.me` and
  WhatsApp tells this app nothing.
- **`currentFor` tests the longer prefix first** (`/settings/profile` before
  `/settings`) and **refuses to guess for `/sessions`** — lighting *Schedule*
  would claim the console is part of a screen the trainer did not open.
- **The toast deck is for a confirm whose row is off-screen**, behind a closing
  panel, or on another route. Where the row IS the receipt, stay silent
  (`UIUX-SKILL.md`). Two variants: `notice` (until dismissed, for a confirm that
  survives a navigation) and `receipt` (5s, swipeable, for an Undo). **The action
  always dismisses its own card** — an Undo that leaves the confirm of the thing
  it undid on screen is a contradiction. **A toast never carries a field error**,
  and a verb with no inverse gets no Undo.
- **`.toasts` is `height:0` with absolutely-positioned children and
  `pointer-events:none`** — a column of four confirms is a sidebar nobody asked
  for. Depth is counted over LIVE cards only, so the deck closes over a leaving
  one. Mounted **inside `.app`**, where `--w-tabs` is declared.
- **`useToast()` throws outside its host** rather than no-oping: a confirm that
  silently does not appear is the failure the deck was built to fix.

---

# The client portal

`InclineYou-Client-Portal-Spec.md` and `webapp-client-portal.html`. Sign in as
`9840137911` (Karthik Menon) to see it. `lib/portal/` is the model;
`components/portal/` the screens; `PortalShell` the composition.

**Almost nothing about the auth half had to change** — `destinationFor` has routed
a client token to `/me/today` since sign-in was built, `/sign-in/role` deliberately
writes nothing because *resolving an unambiguous roster is the portal's job*, and
`personaFor` has resolved a number to `persona:'client'` from the start.

## The four destinations

**Home · Progress · Plan · Me** (`CLIENT_PRIMARY`), against the frame's *Today ·
My progress · Sessions · Payments*. Sessions → Plan because §4 asks for what is
**coming**, which is the anxious question; the history is on Progress, where it is
evidence. Payments folds into Me. The route is still `/me/today`.

**No `+` and no *More*.** A trainer creates; a client creates exactly one thing,
from the one button Home is arranged around. Four labelled slots fit 320px.

`PortalShell` is a second composition rather than a flag on `AppShell`: the client
role has no palette (no roster), no workspace host (two rosters are arrangements,
not tenants). `ToastHost` and the bell transfer unchanged. The rail collapses on
both halves — the collapse is a *choice*, and a control that exists on one half and
not the other is the same control missing.

## `/v1/me/*`, never `/v1/clients/{id}`

**The prefix is the audience.** `/v1/clients/{id}` is the trainer's route and its
guard is *is this client yours*; a client calling it needs the opposite guard on
the same path, and the day those two branches sit in one handler is the day one
wins for the wrong caller. `lib/clients/client-api.ts` and `lib/portal/api.ts` are
two fetchers for the same reason.

Reads are scoped, with one deliberate exception: `GET /v1/me/workouts/{id}` returns
the movements, cues, prescriptions and last-time figures in one response — the
caller is a client at a rack on gym wifi. `GET /v1/me/sets` is unwindowed, because
a personal best is a claim about the whole history.

## Four tables the trainer half never needed

- **`client_message`** — a line from the trainer TO one client. Emphatically not a
  `NoteRow`: a note is private *because* it is not addressed to anybody.
- **`workout_feedback`** — its own row, because it is the client's answer and the
  one field on that surface the trainer cannot edit.
- **`milestone`** — stored rather than derived, because its value is that it fired
  ON a day.
- **`client_prefs`** — the client's own settings, one row per client rather than a
  blob on `ClientRow`, because `ClientRow` is a row the **trainer** writes. It is
  **the only table in this book the trainer's half never reads**, which is what
  lets the visibility card tell the truth — and why the §14 nominee lives there.

## The three rules the spec is most insistent about

1. **Never shame.** A `miss` cell is drawn at exactly the weight of a `rest` cell
   — hollow, reading as *nothing happened here*, which is true — and
   `--tx-danger` appears nowhere in `WeekDots`. **No hero is built for a missed
   session**, because a state whose whole content is an absence is the accusation
   dressed as information. **A count, never a streak** (*3 of 4*, resets Monday) —
   streaks punish one bad week by erasing months. The denominator is the
   arrangement, not the diary, so a cancellation cannot shrink the target. No
   adherence figure anywhere on the past-plans tab.
2. **Weight carries no tone, anywhere.** The chart draws the SMOOTHED line and
   there is no prop that draws the raw one (raw becomes a band); the prose reads
   the same smoothed endpoints; hiding it removes it from the summary, the chart
   list AND Home's quick log — absent, never greyed; **there is no kg-per-week
   figure and there must never be one**; and `buildSummary` puts strength,
   consistency and the tape in front of weight by construction. This extends to
   the tape: a waist going up on a client adding muscle is the plan working.
3. **Make the trainer present.** The cue is labelled apart from the library's
   generic `formCues` and **attributed by name** — a client who reads a generic
   cue and believes their trainer wrote it has been misled about the thing this
   product sells. Everything that leaves is a `wa.me` link that **logs nothing**.

## The workout flow

Three stages, and **two of the three boundaries are the server's**: `pre` until
*Begin* (local), `run` while `endedAt` is null, `done` after. So a client who locks
their phone lands back in `run` with the same sets in it.

- **Sets save one at a time, on the tick** — a workout is the one screen somebody
  puts down mid-use.
- **One movement at a time.** A trainer runs somebody else's session and reads
  ahead; a client is DOING it, and a screen showing six movements asks them to
  decide which is next — a decision the program already made.
- **A swap must be the trainer's**, on `program_exercise.alt_exercise_id`. Where
  the trainer named none there is **no control at all** — a button that exists to
  be refused is worse than a line saying who to ask.
- **A movement you have started cannot be swapped.** Re-pointing logged sets puts
  a lat pulldown's reps into a pull-up's history; leaving them orphans them.
  Refusing costs nothing — the swap is for a problem that happens before set one.
- **The feedback is optional** — mandatory means a log that cannot be closed, and
  an unclosed log is the `log-open` band on the **trainer's** queue.
- **Finishing marks the session done and decrements the pack** through the same
  `packDelta` the console sets.

## The check-in — the client answers, one ask at a time

`/me/checkin/:id`, and it is the client's half of the trainer's Assessments tab.
The trainer builds a template, sends it, and reads what came back; until this
pass there was no screen anywhere that let the person it was addressed to write
anything in it. `BACKEND_GAPS.md` carries the four routes.

- **`/me/checkin`, not `/me/assessments`, and the words differ all the way
  down.** An assessment is something done TO you; a check-in is something you
  send. `lib/portal/checkin.ts` holds the client's three states — `open` ·
  `late` · `done` — against the trainer's four, and the two that do not survive
  the crossing are the argument: **`booked`** is a row that was never sent, and
  a client must not be shown somebody else's planning; **`waiting`** names the
  trainer's state, not theirs. *Late* is never *Missed* or *Overdue* for §1's
  never-shame rule, and a late check-in is still answerable.
- **ONE ASK PER STEP, measurements first, twenty-six of them on the seeded block
  template.** The workout flow's argument, stronger here: a client taking their
  own measurements has a tape in one hand, and a grid of fifteen fields asks
  them to find their place in the list every time they look up. The protocol is
  the whole point of the closed catalogue — *Waist, at the navel* — and on its
  own step it is a sentence rather than a label. Measurements lead because they
  are the block with a physical object in it; the other order asks somebody to
  fetch the tape eleven questions in.
- **Every answer saves as it is given, and the stage is the server's.** One
  `POST …/answers` a step. `completedAt` decides `done` on both halves at once,
  so a locked phone or a second device resumes on the first unanswered ask
  (`openAt`). The intro stands itself down once anything is answered.
- **Nothing is required and nothing nags.** *Next* is stood down until the step
  has an answer, and *Skip this one* sits at the other end of the foot — a live
  primary on an empty step is a skip nobody chose. **Skipping CLEARS**, or a
  client who typed 88, thought better of it and skipped would have sent a number
  they withdrew. The review lists every ask, *Not given* in ink-off italics with
  **no tone on it**, and the model has always allowed it: `got` of `asked`
  exists "to find the client who answered the questions and skipped the tape".
- **One tap answers a rating, a yes/no and a single choice, and advances.** The
  kinds that are complete the moment they are touched commit themselves; a
  multiple choice, a sentence and a tape reading commit on *Next*, because the
  screen cannot know when somebody has finished typing. A control that advanced
  on the first tick of a multiple choice would take the screen away mid-answer.
- **The record lives on Progress → Assessments**, with the tape it was taken
  with. It was a `Check-ins` tab of its own until 23 Sep 2026 — the strip read
  *Summary · Exercises · History · Measurements · Check-ins* — and the last two
  are one subject drawn twice: **a check-in is WHEN the tape came out**, and the
  tape is **what the readings say across all of them.** A client who wanted to
  know whether their waist had moved read one tab, a client who wanted to know
  what they had told their trainer in July read the other, and the reading taken
  on the day of that check-in appeared on both with nothing saying they were the
  same sitting. Two sections sorting in opposite directions — *To fill in*
  soonest-first because it is work, *Answered* newest-first because it is a
  record — which is `SessionsTab`'s split on the trainer's half, with the tape
  between them. **An answered row links to `/me/checkin/:id` in its `done`
  state** rather than to a second read-only renderer: two spellings of one
  record is how one of them learns to draw a skipped tape and the other does
  not. And nothing on it is a score — the size is what was SENT (*15
  measurements and 11 answers*), never a fraction of what was asked, because the
  fraction is a mark out of twenty-six to the person it is about.
- **The crumb on a check-in is decided by its STATE, not by a referrer.** Open →
  *Home*, because that is where the task is drawn; sent → *Assessments*, because
  that is the only screen that lists records. So the way back is the same
  wherever somebody arrived from, which is the session console's own rule.
- **Home draws it second, under the hero, and it is not a second primary.** §1's
  order is not negotiable and this does not displace it: the hero answers *what
  am I doing today* and an open check-in is the only other thing on that screen
  the client is being ASKED to do. The verb is a `secondary`. The block is
  ABSENT where nothing is open — never an empty state — and the *N of 26
  answered* line appears only once they have started, for the reason
  `blockCount` refuses `0 / 11` on the trainer's list.
- **Two components went into the design system for it**, because the catalogue
  had nothing that answers a question: `c-choicelist` (full-width options, real
  radios where the choice is exclusive and boxes where it is not) and `c-scale`
  (a point on a fixed range, drawn whole). The near misses are named in
  `registry.ts` — `c-segment` in `single` mode is the same control at pill
  density and stops working at the length of a real question's answers, and
  `.lgl` + `.lrow` is the same picture with a different grammar.
- **THREE DEFECTS THIS PASS MEASURED, AND TWO WERE IN CSS EVERY GATE PASSED.**
  A refused write destroyed the stored answer (the row was filtered before the
  value was validated — `BACKEND_GAPS.md`). `:hover` at (0,2,0) beat the picked
  modifier at (0,1,0), so pointing at a chosen option drew it as unchosen —
  trap 1, fixed by pairing the modifier with its own `:hover` form and never by
  moving a rule down the file. And the picked state was drawn with a **lime
  border**, which is the rule this stylesheet opens with: MEASURED at **1.16:1**
  against its own ground on light, with the soft ground itself 1.04:1 against
  the surface, so the only thing telling a picked row from a plain one was a
  font weight. `--tx-accent-text` is the stroke form of the accent — 5.45:1 on
  light, the lime itself on dark — and `.rad`'s checked ring had the identical
  defect and took the same fix.
- **`.scale__r` is a GRID and that is a measurement too.** Ten 34px plates and
  nine gaps is 394px against a 330px column at 390, so something wraps — and
  MEASURED with `flex-wrap` the two that fell through were handed **166px
  each**, because a wrapped flex line distributes its free space among the items
  on that line. A grid sizes every track the same whatever row it is on.

## §5 — the five rights, and the delete really deletes

The **visibility screen** derives each row from the route or table it is a promise
about; `sources` is not rendered — it exists so somebody adding a reader for a
table finds the file by grepping it. The `no` list does the work, and three of its
four entries are facts about the architecture. One row is about the **trainer's**
privacy, because a client will assume the answer is symmetrical.

- **The export is generated from the same rows the screens read** — an export that
  quietly omits a table is a claim of completeness. It withholds exactly two things
  and names both. Payment fields are listed one by one, so a column added tomorrow
  cannot silently join it.
- **`DELETE /v1/me` removes the rows.** A delete that answered 200 and left the
  book untouched would make the one screen built to be trusted the one that lies.
  The **membership** goes, not the human; the trainer's payments stay with
  `clientId` nulled; the typed-number confirmation is checked **on the server**
  too.
- **The grievance route is a config module with PLACEHOLDER values**
  (`lib/portal/grievance.ts`). Rule 9 of the DPDP Rules 2025 is a publication
  obligation — **a card printing an address nobody reads is worse than no card**,
  and the two stated timelines are a reading of the Rules, not the notified text.
  **Check all of it before launch.**
- **The phone number IS the account**, so `MyDetails` uses the shared
  `PhoneChange` ladder — two codes. A client's number moves **every roster** it is
  on, and the screen says so where it is true.

## The portal's own rules

- **Home leads with strength** (§3: *the most motivating number for beginners, and
  the one most apps bury*), and `buildSummary` picks the lead — the screen should
  not decide which of six figures matters. Then rows: consistency, the other lift,
  the tape, **weight last**.
- **`Change` is the component for `25 kg → 27.5 kg`.** It was drawn four times on
  one screen with nothing underneath it and two of the four disagreed about the
  space before `kg` — **the disagreement lived in the STRING**, so no stylesheet
  could have caught it. It deliberately has **no `direction` and no `good`**: the
  accent is available only on the separate delta clause, which only a strength
  gain passes.
- **The range control's default is `all`.** A narrower range is a different claim,
  not a wrong one — but §3's headline is a statement about a beginning, and the
  beginning is older than any window a screen would pick. `?range=all` is never
  written into the URL.
- **The span is clamped to `startedAt`** — otherwise a beginner's fortnight is
  divided by eight weeks that did not exist, which lies in the one direction that
  matters, to the client with least evidence to argue.
- **The tape has no window at all, and the reach-back went with it.** It used
  to: a trainer measures every few weeks, so an eight-week range routinely held
  ONE reading, and `buildMeasureSeries` grew a reach-back to the nearest reading
  before the window plus a *which is older than the last 8 weeks* line to stay
  honest about the dates under it — a window papering over itself. The tape is
  on **Assessments** now, which is a RECORD and draws every reading; the range
  chips belong to Summary, whose headline figures genuinely change with them.
- **Progress is exercise progress, and the body is Assessments — 23 Sep 2026.**
  The portal taking the split the trainer's half settled on 20 Sep, asked for in
  those words: *"in the trainer's view we show the body measurements via
  assessments and we show exercise progress alone as progress."* So the Summary
  tab lost its weight chart and its tape row, `buildProgress` stopped taking
  `metrics` at all, and `buildSummary` lost two parameters — the tab now reads
  five requests and none of them is about the client's body. What arrived in
  their place is `lib/portal/training.ts`: the trainer's own four figures, the
  weekly volume chart (`VolumeBars`) and the top-set sequence, which is folded
  onto the rows of *What is getting stronger* rather than drawn as a card of its
  own — measured at **291px** and two sets of numbers about the same movement
  300px apart. The Exercises tab's state groups became the trainer's *Every
  movement* table, with `Records` and `Lifted` read off the same builder the
  Summary's tiles are counted off.
- **V5 · the next check-in is SHOWN, and never as a deadline.** *Next check with
  Arun · 12 Oct*, read straight off the trainer's own column so there is no
  second copy to go stale. A client does nothing about it — but one who knows a
  tape is coming out is not surprised by it, and §5's whole argument is that
  nothing about them should be. Absent where there is no cycle rather than drawn
  as a dash: a client nobody has put on a cycle has not been let down.
- **Milestones are never windowed** — filtering a lifetime record to eight weeks
  reads as the records having been lost. Neither is `workoutByDate`, which is what
  lets a claim link to its day when the day is older than the range.
- **An empty range is not an empty account** — `emptyRange` is checked before
  `bare`.
- **The chips take the design system's pressed state** (a solid fill), where the
  trainer's `Progress.tsx` overrides it inline with a soft tint. One flow, one
  pressed state — and on a screen whose job is *read this back to yourself*, the
  unambiguous fill wins. **Do not copy the trainer's version.**
- **`rangeChoices` offers a bounded range only once the client has trained longer
  than it** — *6 months* on somebody eight weeks in redraws the screen identically.
- **A day is a ROUTE on Plan, not a disclosure** — a cue is a sentence and needs a
  page. An earlier plan gets no per-day route: it is browsed, not performed.
- **Anything not in `program.trainingDays` is nulled once in `buildPlan`**, so no
  consumer can build a link to a day the program does not have.
- **There is no video anywhere in the portal.** `clip` is GONE from the wire
  rather than nulled — a nullable field is a promise that one arrives.
  `ClipThumb` is kept with a docstring saying the portal no longer consumes it.
- **The bell's switches gate the MINT, not the read.** A filter on the read means
  turning a switch back on refills three weeks of history the client was never
  told about, and turning it off rewrites the past. The seed goes through the same
  gate.
- **The client's copy bolds the trainer's NAME**, inverting the trainer's feed: a
  client has one trainer, so the name is not a disambiguator, it is the point. A
  row opening *Your programme was updated* is the generic nag. `best` is the one
  row about the reader and is second person.
- **Every portal notification row has somewhere to go**, which the trainer's
  cannot promise.
- **No `reminder` kind** — *Session tomorrow* is neither an event nor a state, it
  goes stale by itself, and Home's hero says it bigger and sooner.

---

# Responsive

**`webapp.css` has no media query in it** — every frame in the design set is drawn
at a fixed 1440×900 and the shell inherited that literally. Every rung is in
`app.css`.

| | |
| --- | --- |
| **1240** | `/today`'s third row goes 3 → 2 columns |
| **1180 / 980 / 820 / 760** | the console's columns; the schedule's context lane |
| **1080** | `/today`'s hero pair stacks; the programs split folds |
| **900** | **the shell's own line** — the rail becomes a bar, `.omni` becomes a glyph, panels become bottom sheets, `--w-top` drops to 46px, `--w-tabs` and `--w-underbar` are declared |
| **620 / 560 / 420 / 389 / 372 / 360** | per-screen table reflows, stacked feet, column drops |

- **`--w-top`, `--w-tabs` and `--w-underbar` are the shell's three tokens.** The
  app grid's rows ARE `--w-top`, so raising it moves `.main`, `.body` and the
  notification panel with no rule touching them. `--w-tabs` is a **floor**
  (`minmax(var(--w-tabs), auto)`), plus `env(safe-area-inset-bottom)` on top.
  `--w-underbar` replaced four different gutters (6/10/13/14px) under one bar.
- **Nothing in `.app` becomes `position:fixed`.** It keeps its grid: `100dvh`,
  `overflow:hidden`, a scrolling `.body` between two bars that do not move.
- **The bar does not hide on scroll**, and the destinations never move — that is
  an argument about destinations, and it is why a scroll-collapse of the *search
  field* was allowed and then deleted when the field became a glyph.
- **A max-height media query is width-blind.** Two rules written for a short DESK
  window fired on every phone under 820px and rendered the bar's controls at
  **y = −19**. Scope them `and (min-width:901px)`.
- **The phone view is the app's screen, not the desk's narrowed.** Where the two
  modules are genuinely different things — a ribbon measuring a day in pixels per
  minute against a list a thumb scrolls — they are two components and CSS picks
  one. No media query turns one into the other.
- **`.ph--named` stands the `<h1>` down where the top bar already says it**, and it
  is **opt-in**: the client file's `<h1>` is the name PLUS the status and mode
  tags, and the console's is whose session it is. A blanket rule deletes the two
  facts that decide what a trainer does next. The heading is **visually hidden,
  never dropped**.
- **A chip row that WRAPS changes a toolbar's height as the content changes**,
  which moves the grid under a trainer who only pressed Next. Scroll it instead.
- **WCAG 1.4.10 exempts content requiring a two-dimensional layout** — the week
  qualifies and scrolls sideways with sticky heads and snapping columns; the
  queue and the price table do not, because the column behind the swipe holds
  every action on the screen.
- **Touch: session blocks are deliberately NOT padded.** Two back-to-back sessions
  are 0px apart, so any vertical slop makes the upper block steal the lower one's
  first pixels.
- **`@media (pointer:coarse)` is the question; width never was.** It enumerates
  around each control (`.rail__i`, `.menu__i`, `.chip`, `.pal__i`, `.ntf__i`,
  `.tk`, `.crumbs`) rather than raising `.tbl` globally — see trap 7.
- **Hit-slop via `::before` costs zero layout** and is the fix for an inline link
  or a switch that cannot grow (`.switch` is 38×22 and 48×32 effective).
- **iOS zooms any field under 16px** — `.ctl` goes to 44px/16px under 900px, and
  `layout.tsx` declines `maximumScale` deliberately.

---

# Standing product rules

- **No health data, anywhere.** `notes/InclineYou_MVP_interaction_map.md` forbids it
  in as many words — *no injuries, no conditions, no medications* — filed under
  *legally excluded, not deferred*, against the DPDP Act 2023; NFR-8 and the core
  data model repeat it. **The moment a flag distinguishes a health note from any
  other note, the product holds health data whatever the column is called.** The
  sanctioned path is a separate `health_note` table with its own consent and
  access controls — a different feature, not a wider version of this one.
- **There IS a date of birth now, as of 15 Sep 2026 — and it survived the thing
  it was added for.** This rule read *"there is no date of birth in this schema;
  V12 declares a `birthday` nudge kind and no column ever landed"* and had been
  true and recorded in four places. It was overruled deliberately.
  `client.date_of_birth` arrived with `client.sex` for the physical card's two
  metabolism rows — Mifflin-St Jeor needs an age and a sex — **and those rows
  were then cut the same week.** `sex` went with them, because it had no other
  reader and a sex field nothing reads is personal data held for no stated
  purpose. `date_of_birth` stayed, because *Birth day* is a row on the card in
  its own right. The `birthday` nudge kind can now be built, and has not been.
  **None of this reopened health data**: the standing rule above is *no
  injuries, no conditions, no medications*, `body_metric` has held weight and
  body fat since the mock was written, and the sanctioned path to a medical
  record is still a separate `health_note` table with its own consent. A height
  and a birth date do not open it. **The backend column landed as V7 on 23 Sep
  2026** (`client.date_of_birth`, `""` clears; `heightCm: 0` clears the height),
  and still without `sex`.
- **`pack` is what the trainer OFFERS; `package` is what one client BOUGHT.** One
  letter, and it is the entire domain: changing a price must never rewrite a sale.
- **A client can hold MORE THAN ONE live pack, and that is the right shape.**
  Every renewal taken before the current one ran out, and every mid-pack *Add
  sessions*, leaves two rows `active` — because a sale may not be edited, so more
  sessions are a second row rather than a bigger first one. The server spends
  them **oldest first** (`markDone`: `ORDER BY created_at ASC`) while the wire
  hands them over **newest first** (`ORDER BY p.created_at DESC`), so
  `packages.find((p) => p.status === 'active')` picks the one that is NOT being
  spent. It was written that way on four screens and froze the header at `12/12`
  while the other pack drained. **`lib/clients/packs.ts` is the one reading of
  it** — `currentPack` mirrors the server's predicate, `packBalance` sums the
  live packs, and the whole argument is in that file's header.
- **Renew is for a pack that is ending; *Add sessions* is for one that is not.**
  `renewalVerb` asks `packBand` — empty, ≤2 left, or ≤7 days to run — the same
  three thresholds Today's queue and the roster rank on. Both write through
  `POST /v1/packages/{id}/renew`; the only difference on the wire is that an
  addition sends `startDate` as today, because sessions sold on top of a running
  pack have to be live now rather than when it lapses. Deliberately **not called
  *top up***: in India that is recharge language and implies a balance of money,
  and `PRICING.md` puts the trainer's own subscription on the roadmap, which is
  the thing that will need the word.
- **A sale is irreversible and therefore asks first.** `PackageController` has
  renew, pause, resume, extend and a V4 correction, and **no delete** — nothing
  in this product can undo a package. So the client file's primary confirms, and
  it states the two facts the card cannot show: the date it starts and what the
  balance becomes. The roster's Archive is the same argument in the same words.
  Today's queue row is the deliberate exception — see `lib/today/actions.ts`.
- **Correcting a count is not selling sessions.** V4's
  `POST /v1/packages/{id}/sessions` moves `sessionsTotal` and `sessionsRemaining`
  by the same delta and never `amount`; it is the sibling of `extend`, which
  gives days and never touches the price. If money changed hands, it is a sale.
- **Read `amountDue > 0`, never `status === 'active'`**, when you want packs with
  money on them — a client can finish twelve sessions and still owe for four.
- **A collected payment is `paid` OR `confirmed`** — REST writes the first, sync
  has carried the second since V1.
- **`paused_at` is a column, not a status**, so every `WHERE status='active'` read
  keeps counting a client on holiday; the one thing it gates is the charge, in
  `markDone`. Paused packs raise no attention row — the end date is frozen and
  today is not.
- **A measurement is a sitting on a cycle** (V5). Six metric ids and only six —
  `weight · body_fat · chest · waist · hip · arm` — mirrored in
  `lib/assessments/metrics.ts` from the backend's `MetricCatalogue`; a seventh is
  a deploy, because free text in `metric_type` is how one measurement gets two
  spellings. The cadence is a **column** on `client`, not a derivation. A
  correction is a **soft delete plus a new row**. The web may **back-date 14
  days** and the phone may not — the desk exists to catch up paper. `assessment_id`
  **null means a loose reading**.
- **No BMI category, no health-risk band, no progress photos.** Body composition
  is consented data this schema already holds; a number rendered as a *judgement*
  is a health inference, and a photograph of somebody's body is a different
  consent problem with no image store to put it in. BMI itself is derived at read
  time from `height_cm` and never stored — height is editable, and a stored BMI
  would stay wrong forever after a correction.
- **A team widens reads; it never moves ownership.** No role ever sees a
  teammate's money book, except an owner-only, totals-only roll-up.
- **A row belongs to a workspace and never moves.** `trainer_id` (who coaches) and
  `tenant_id` (whose books) are independent. The money book is always the active
  workspace alone; the diary spans them all.
- **The web signs in with a session, the phone with a JWT** (V41). Send
  `X-InclineYou-Client: web` to get a session — **and this app does not yet**, which
  is a launch blocker in `WEB_LAUNCH.md`.
- **Schema evolution is additive-only, on both halves, in lockstep.** Never edit a
  migration that has run, never drop or repurpose a column, never remove a
  response field. The next backend migration is **`V6`**.
- **Retiring is `status`, never a delete** — everyone on a pack keeps what they
  bought, and the foreign key would refuse the delete anyway.
- **`owner` cannot change after a pack is created** — moving a pack between lists
  would re-attribute every package sold from it.

---

# Checks

```
npx tsc --noEmit          # clean
npx eslint .              # see the baseline below
npx next build            # do NOT run under a live dev server
```

**`next build` writes `.next/` under a running `next dev` and produces a screen
that renders the previous build intermittently.** Stop the dev server or build
from a copy.

There is no test suite on this half — the backend's `ProgramAuthoringTest`,
`ClientNoteTest`, `NudgeTemplateTest`, `TrainerAccountTest`, `TrainerSocialTest`
and `SaleBooksSessionsTest` cover the wire.

**The eslint baseline drifts and must be re-measured, not assumed.** Long-standing
offenders in files nobody has re-opened: `components/team/Team.tsx`,
`components/exercises/ExerciseLibrary.tsx`, `components/clients/NewClient.tsx`,
`components/shell/Palette.tsx`, `lib/clients/roster.ts`. Record what fails
**before** a pass, so a claim of "clean" is a comparison rather than an assertion.

The one gate that costs nothing and catches a real class:
`grep -rn 'background:var(--tx-' app/styles/app.css` — a state rule must use
`background-color`.

---

# Open, and not an oversight

- **The client portal has no backend.** Every `/v1/me/*` route is a mock route in
  the sibling repo; `backend/API.md` documents none of them. This is the largest
  entry in `BACKEND_GAPS.md` and the largest thing between here and a launch.
- **`X-InclineYou-Client: web` is never sent**, so this app holds an unrevocable
  7-day JWT rather than the session V41 built for it.
- **`ResponseStatusException`'s sentence never reaches the trainer** — trap 31.
- **`/sign-in/paused`, `/sign-in/removed` and `/invite/[clientId]` are stubs.**
  The invite screen is where a client's consent has to be captured
  (`WEB_LAUNCH.md` §5.13).
- **`/team` has no entry point in the chrome** — owned by the team-workspace pass.
- **There is no *Archived* segment on the roster**, so archive is one-way from
  that screen and its confirm is carrying the weight.
- **`PhoneRow` has no row menu**, so none of the roster's four verbs reach ≤900px.
- **No export of a roster, program or session history.** `webapp-settings.html`
  promises *everything is exportable* and only the money book is.
- **No push anywhere** — no manifest, no service worker. The portal's notification
  switches are honoured at the mint and the bell is the only channel that exists.
- **`ClientReport` still uses a transient inline string** where the toast deck
  should carry the confirm; Tier 2 and Tier 3 toast call-sites are unwired.
- **`.tag--link` flattens a tone on hover** — its hover sets
  `background`/`color` outright, so a toned tag loses what kind of tag it was.
- **No real device has ever been used.** Every phone width in this project is a
  desktop Chrome with device metrics, so `pointer:coarse` never matched — see
  trap 39 for the only honest way to simulate it, and its own caveat: it
  simulates the cascade, never a finger.

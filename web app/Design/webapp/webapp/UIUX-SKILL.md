# UI/UX skill — the usability gate every X REP component passes

Created 30 Aug 2026, alongside the library's 2026 pass. This file is the
**checklist a component or screen is judged against before it ships**, on either
half of the product. It compresses the published usability canon — Jakob
Nielsen's ten heuristics ([NN/g, ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/),
and their [application to complex apps](https://www.nngroup.com/articles/usability-heuristics-complex-applications/)) —
into dos and don'ts stated in this product's own vocabulary, so applying it
never needs a translation step. Where a rule already lives in the stylesheet or
a design page, this file points there instead of restating it.

The one-line version: **a trainer on a gym floor, mid-session, one hand busy —
every rule below is that person's side of the argument.**

---

## The ten heuristics, as this product applies them

### 1 · Visibility of system status
The user always knows what just happened and what is happening now.

- **Do** answer every write on the row it changed — the roster row is the
  receipt. A toast (`.toast`) is the LAST resort, for the confirm with no row
  on screen.
- **Do** put the working state on the control itself: `.btn--loading` between
  click and answer; `.skel` while structured content loads; nothing at all
  under ~300ms.
- **Don't** let a click land in silence. Zero `:active` states was this
  library's biggest audit finding; press physics are now in the base `.btn`.
- **Don't** report progress in a place the user isn't looking.

### 2 · Match between system and the real world
Speak the trainer's language, not the schema's.

- **Do** say *Owes ₹2,400*, *Pack ends in 3 sessions*, *Move my account to
  +91 …* — the money book's words, in the money book's order.
- **Don't** surface storage facts (`status = 'active'`, `paused_at`) as UI copy.
  The phone/web copy rules in the screen designs' `unit__note`s are canon.

### 3 · User control and freedom
Every action has an exit; destructive ones have a typed one.

- **Do** give a move its ten-second take-back (the schedule already does), a
  toast its Undo, a panel its Escape.
- **Do** confirm destruction with the thing itself — the delete-account screen
  asks for the phone number typed, not a checkbox, because a checkbox is
  pressed by the same reflex that pressed the button.
- **Don't** confirm the routine. A second *Are you sure* on an ordinary save
  teaches people to click through the one that matters.

### 4 · Consistency and standards
One answer set, one spelling, one control per question — everywhere.

- **Do** reuse the extracted pickers (`components/profile/`) rather than
  re-drawing a step's control; two copies of a picker is how one answer set
  ends up with two spellings (the `acsm_cpt` lesson).
- **Do** keep policy numbers in every copy they have (`RESEND_LADDER` ×3,
  `COOLDOWN_DAYS` ×4) — or a countdown lies.
- **Don't** invent a new colour. `New colours: 0` is a stat the library prints
  on purpose.

### 5 · Error prevention
Make the wrong thing hard before making the error message good.

- **Do** disable-with-reason, constrain inputs (`.affix` puts ₹ outside the
  field), and match template day-count at apply time rather than 400 after.
- **Do** keep loose client-side checks *looser than the server's* — refusing
  what the server would take is the worse failure (the email rule).
- **Don't** warn in red about a valid state. Red is for errors only —
  the `gym_name` clearing was moved to the save confirmation for this reason.

### 6 · Recognition rather than recall
Show, don't quiz.

- **Do** keep the ledger visible behind the payment panel — a payment is
  decided while looking at it; that is the panel's whole argument (and §24's
  glass makes the argument literal).
- **Do** name the target in the final button (*Move my account to +91 97000
  00002*) — the last place a wrong digit is still free.
- **Don't** hide load-bearing content in a tooltip. A tooltip is a reminder,
  not a hiding place (`.tip`, "when not to use").

### 7 · Flexibility and efficiency of use
Accelerators for the tenth use that don't punish the first.

- **Do** keep the keyboard contract (design system §07): ⌘K palette, single-key
  hints in `.btn kbd`, arrow-key movement where a `tablist` promises it.
- **Do** let a keyboard beat a stepper — the workout console's whole reason.
- **Don't** make the accelerator the only route (SC 2.5.7: dragging always has
  a keyboard route; the hours editor documents its own).

### 8 · Aesthetic and minimalist design
Density is a feature; decoration is not.

- **Do** hold the measured densities: 34px desk controls, 44px rows, 248px
  rail. A 48px button in a desktop toolbar reads as a phone app in a window.
- **Do** spend glass only on the overlay layer (§24's rule; Apple's Liquid
  Glass across iOS 26 landed on the same line). Content — tables, cards,
  money — stays flat and opaque.
- **Don't** add a container to a plain value. "Not everything needs a
  container" — the tag's own don't.

### 9 · Recognize, diagnose, recover from errors
An error names what went wrong and what to do, in a sentence.

- **Do** branch on the error `code`, never the HTTP status — both 429s on
  `/v1/auth/**` mean opposite things.
- **Do** let the server's sentence reach the trainer (the
  `AccountRuleException` lesson: `ResponseStatusException` serialises to a
  bare `{"status":400}` and the trainer reads nothing).
- **Don't** apologise, and don't blame. *"That code isn't right. 2 tries
  left."* is the house style: fact, consequence, count.

### 10 · Help and documentation
The best help is a sentence where the question occurs.

- **Do** use `.fld__h` hint lines and `.why` callouts at the point of doubt —
  the delete card states the number-is-not-released consequence directly above
  the field, because it is the one consequence a trainer cannot discover by
  trying.
- **Don't** move an explanation to a help page a gym-floor user will never open.

---

## The component quality gate (run before a component is called done)

From the library's own doc spec plus the 2026 pass. A component ships when
every line answers yes:

1. **States** — default · hover · active/pressed · focus-visible · disabled ·
   loading (if it can wait) · error (if it can refuse). *Zero `:active` rules
   and zero `@keyframes` in 3,200 lines was the audit's headline finding.*
2. **Targets** — 24px minimum (WCAG 2.2 SC 2.5.8), 32px preferred, met with
   `::before` slop rather than by inflating the visual (the chip's mechanism).
3. **Contrast** — 4.5:1 for text in *both themes*, measured **after** the
   material behind it (the §24 tinted-ground lesson: 4.58:1 flat became
   4.45:1 over glass).
4. **Keyboard** — reachable, operable, escapable; focus ring visible
   (`:focus-visible`, never bare `:focus`).
5. **Announcement** — the right role and nothing extra: a tag has no role, a
   toast is `role="status"`, a failure `role="alert"`, a loading region
   `aria-busy` with skeletons `aria-hidden`.
6. **Motion** — under 400ms, entrance curve on entrances, spring only on
   knob-sized state changes, and the whole vocabulary collapses under
   `prefers-reduced-motion`. `backdrop-filter` is never animated.
7. **Meaning** — colour never alone (the word carries it); lime `#C6F24E` is a
   fill, never a stroke, never text on light.
8. **Copy** — active voice, the trainer's words, the consequence before the
   button that causes it.
9. **When not to use** — written down. A component without a refusal list
   grows into its neighbours.

---

## Form dos and don'ts (the distilled NN/g set, product-flavoured)

- Label above the field, always visible — never placeholder-as-label.
- One column; related fields grouped (`.fld`, form-group rules on the forms page).
- The unit lives outside the input (`.affix` — and it is a *prefix only*).
- Validate on blur, re-validate on change; never on every keystroke of a
  first entry.
- Error text under the field it belongs to (`.fld__e`), in words that say how
  to fix it. A toast never carries a field error.
- Preserve what was typed. A textarea "never loses what was typed" is its
  one-line definition in this library.
- One Save per screen, dispatching only what changed — two primaries make the
  worse failure (the Work & hours lesson).
- Ask at the moment the answer matters, not before (setup's eight steps
  promise a minute; a 200-word bio has no place inside that promise).

## Sources

- [NN/g — 10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [NN/g — Usability Heuristics Applied to Complex Applications](https://www.nngroup.com/articles/usability-heuristics-complex-applications/)
- [Microinteractions UI Best Practices: A 2026 Guide — CreateBytes](https://createbytes.com/insights/microinteractions-ui-best-practices)
- [Loading States & Skeleton Screens (2026) — cpcloudhosting](https://cpcloudhosting.com/how-to-design-loading-states-and-skeleton-screens/)
- [Skeleton Screens vs Loading Spinners — The Hangline](https://www.thehangline.com/skeleton-screens-vs-loading-spinners-which-improves-perceived-performance/)
- [Why Everything Is Going Glassmorphism — Clay](https://clay.global/blog/glassmorphism-ui)
- [Glassmorphism vs Liquid Glass — Design Signal](https://designsignal.ai/articles/glassmorphism-vs-liquid-glass)
- WCAG 2.2 — SC 2.5.7 (Dragging Movements), SC 2.5.8 (Target Size Minimum)
- `webapp-heuristics.html` in this folder — the product's own UX audit, which
  this checklist extends rather than replaces.

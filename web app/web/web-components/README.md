# web-components

The components the web app is made of, and the library that shows them.

One folder, imported by both halves — which is the whole point. The application
renders `ui/Button.tsx`; `/library` renders the same import. Change the file and
both change on the same save, because there is only one file.

## THE RULE

**A screen uses components from here. It does not write markup for one that
already exists, and it does not invent a new one in place.**

Two halves, and the second is the one that gets skipped:

1. **Reach for `ui/` first.** If a control exists in the catalogue, import it.
   Hand-written `.btn` markup next to a `ui/Button.tsx` is not a shortcut — it
   is a second definition that no longer changes when the first one does.
2. **A new component is added HERE, before it is used.** A screen that needs
   something the catalogue does not have gets a file in `ui/`, an entry in
   `registry.ts`, and a page under `library/entries/`. It does not get a
   one-off written at the call-site and left there — that is exactly how a
   catalogue ends up complete on paper and absent from the product.

The styling still is not this folder's to own: colour, size and spacing stay in
`design-system/webapp/webapp/assets/webapp.css`, where a designer can reach
them, and `scripts/sync-design.mjs` carries them here. A component file decides
which class combinations are legal and what will not compile. See **What a
component file decides, and what it does not** at the bottom.

**Converting existing markup is not a free edit.** The rendered element has to
come out the same, and the app cannot be stood up locally to check it — see
**Confirming a conversion changed nothing** below for what to do instead, and
read it before the first swap rather than after.

### It is checked, because for months it was not

```
npm run check:components          fails if a file grew a new hand-written one
npm run check:components -- --list        every occurrence, and what owns it
npm run check:components -- --update      record the floor after converting
```

A **ratchet, not a wall.** `scripts/component-baseline.json` records what is
hand-written today — **300 elements across 92 files** — and the check fails
only when a file goes *up*. Converting call-sites makes numbers fall; `--update`
locks them there. Nobody is blocked on the backlog, and nobody can add to it.

It does not count markup that is being TALKED about: a `className` inside a
comment is skipped, because `Hero.tsx` explains its note chip by quoting
`<Link className="tag tag--link">` and the check was reading that prose as a
hand-written tag in a file it had already converted. A backlog number that can
never reach zero is one people stop believing.

It cannot see the other half of the rule. A genuinely new component invented at
a call-site under a new class name looks like ordinary markup to a grep — and
roughly **821 class families in `app/styles/app.css` are exactly that**,
authored in the app with no design-system counterpart. Those need a `ui/` file
and a `registry.ts` entry written before the screen uses them, and only review
catches it.

```
web-components/
├── registry.ts            the catalogue — 59 components
├── ui/                    the shared components. THE source of truth. 54 files.
│   ├── Button.tsx  Tag.tsx  Chip.tsx  Avatar.tsx  Field.tsx  Select.tsx …
│   └── (one file per component; a few cover two catalogue entries —
│        Button also serves Icon button, Select also serves Dropdown)
└── library/
    ├── chrome/            the library's own furniture (Lib, Blk, Docs, Sec)
    ├── system/            the design system's OTHER nine parts
    │   ├── parts.ts       the ten-part taxonomy, one list, three readers
    │   └── tokens.ts      reads app/styles/webapp.css so no token is ever retyped
    └── entries/           one page per component, grouped as the design file groups them
        ├── index.tsx      which components have a page written
        ├── actions/ forms/ status/ data/ containers/ nav/ domain/
        └── …
```

## THE LIBRARY IS PART 3, NOT THE WHOLE SYSTEM

`/library` was a component catalogue for as long as it existed, which told every
reader that components ARE the design system. They are one part of ten. The
other nine — principles, style guide, interaction patterns, accessibility,
iconography, motion, grid, documentation, tokens — are written under
`library/system/` and rendered at `/library/<part>`, and the catalogue moved
down a level to `/library/components`. Component URLs did not move: every
comment in this codebase that cites `/library/c-button` still resolves.

The taxonomy is the UXDT division's published one, kept in its order. Anything
on those pages that is a VALUE is read out of the stylesheet at build time
rather than typed — a tokens page written by hand is a second spelling of every
number on it.

Served by the same dev server as the app:

```
http://localhost:3100/today                 the product
http://localhost:3100/library               the design system, in ten parts
http://localhost:3100/library/components    the catalogue
http://localhost:3100/library/c-button      one component
http://localhost:3100/library/tokens        one part
```

## Why it lives inside `web/` and not beside it

It was tried at `mock-ui/web-components/` first. TypeScript resolved the alias,
but nothing could render:

```
error TS2875: This JSX tag requires the module path 'react/jsx-runtime'
              to exist, but none could be found.
```

`node_modules` is at `mock-ui/web/node_modules`, and a file one level up
resolves `react` by walking *away* from it. Fixing that needs a symlink or an
npm workspace — machinery that would also have to survive the re-mirror in the
parent README. One level in, and the existing `@/*` alias covers it.

## The two tiers, and the work between them

`registry.ts` records an `impl` per component, and it is the honest part:

| `impl` | what it means |
| --- | --- |
| `component` | a shared module. The library renders the **same import** the app does. Editing it changes both. |
| `css` | still a class in §04, written as raw markup at the call-site. Styling syncs from the design system; **structure does not.** |

`/library` counts these itself rather than reading a hand-kept list, so the
number on the index is the real one. It is **53 of 53**, every one with a written
page.

**It read 48 of 50 for a while, and that dip is the honest part.**
`c-balancestrip` and `c-programrow` were built in the program builder and have
no anchor in the design file. They were registered `impl: 'css'` first — which
is what they were — and extracted to `ui/` after, which is the order that keeps
the label meaning something. A catalogue that only ever counts up is one nobody
adds work to; the denominator is a measurement, not a score.

Each extraction was checked the way this file prescribes below, and both came
back **byte-identical** rather than merely equivalent: six `.ptrow` on
`/programs` at `41899c8c:5240`, and `.wsbal__sum` on `/programs/tpl_001` at
`437a1f35:788`, comparing tag, sorted class tokens, every attribute and merged
text, before and after the swap.

**Three** of them are the application's own components, imported rather than
reimplemented: `Rail`, `TopBar` and `PageTabs`, all from `components/shell/`.
Those are the strongest form the guarantee takes — there is no file in `ui/` to
drift from, because the entry is nothing but the import.

`Palette` is the one entry that documents rather than renders. It takes a slice
of the deck — clients, attention rows, the day — and standing it up here would
mean inventing a book for it to search. The page says so and links to it running
on Today.

**The remaining work is the call-sites.** A `ui/` component only reaches the
product where the product imports it. Converting a screen is: swap the markup
for the component, confirm the rendered DOM did not move.

### Button is collected: 329 call-sites in 90 files

`.btn` was the largest of these by an order of magnitude — 347 hand-written
occurrences against one file importing `<Button>` — and it is now the other way
round. **29 remain**, listed below, each refused for a stated reason rather than
left over.

Every converted element was checked to render the same class list it did
before, with token ORDER discarded because no stylesheet can see it — the one
difference the component is allowed to make. `<Link className="btn …">` was part
of the sweep: the component's link branch already picks `next/link` for an
in-app href and a plain anchor for an off-site one, which is the choice those
64 call-sites were making by hand.

Two changes to the component came out of it, both forced by real call-sites:

- **`ref` is now in the props.** `ComponentPropsWithoutRef` refused the three
  buttons that need the element itself, all of them focus management — a modal
  footer that takes focus on open, a panel close, a menu trigger that takes
  focus back on close. React 19 passes `ref` as an ordinary prop, so it reaches
  the element through `...rest` with no `forwardRef`.
- **`aria-label` on a *labelled* button is the call-site's, not the
  component's.** The component emits one only on the icon-only branch. Several
  buttons with visible text carry an `aria-label` that says more
  (`` aria-label={`Copy ${row.name} again`} `` on a button reading "Use again"),
  and it stays.

One deliberate suppression is visible in converted code: an icon-only button
that had no `title` gets `title={undefined}`, because the component would
otherwise newly give it a tooltip from `label`. That is an improvement being
held back to keep this sweep a no-op — dropping those lines is a separate,
reviewable change.

### Card is collected: 102 of 126, and the component grew two forms

`.card` was the second-largest, and it is not a tag swap — it is a subtree, so
the component had to learn what a card actually is before the call-sites could
move. 65 fitted `<Card title=… >` and the other 45 did not, which is why
`Card.Head`, `Card.Body` and `Card.Band` exist. See the component's own header
for the reasoning; the short version is that a prop per exception
(`headClassName`, `bodyClassName`, `bodyStyle`, and nothing that could ever
express two bodies) is how a component gets to fourteen props and still cannot
draw the screen.

Three other changes came out of the sweep:

- **`danger` joined the tone union.** `.card--danger` is a real §04 class and
  the union simply did not list it. `card--pick` and `card--pick-accent`
  deliberately did NOT join: they live in `app/styles/app.css`, and a tone in
  this API that a designer cannot reach in the design system is a lie.
- **`bare` was added**, for a card whose children are its ground with no body —
  `FirstRun`, whose `.empty` brings its own padding and would otherwise get
  `.card__b`'s on top.
- **The heading lost its inline `margin: 0`**, which was dead: `webapp.css`'s
  reset already zeroes heading margins, and the inline copy was the one thing
  stopping a converted `<h2 class="card__t">` being byte-identical.

**24 remain**, all needing a judgement: three heads whose `card__acts` carries
an extra class, three titles with attributes of their own, two whose actions sit
inside a `{cond && (…)}` (what the prop should be when the condition is false is
a real question), one whose title is a `<Link>`, and the rest across
`SessionDetail`, `Team`, `ReportsTab`, `LedgerTab` and `TrendChart`.

### The two error styles, settled — they were never two spellings of one idea

`.fld__e` and `.form-err` looked like a duplicate. They are not:

- **`.fld__e`** is what went wrong with THIS CONTROL. It hangs off one input,
  it is named by that input's `aria-describedby`, and a reader hears it on
  arriving at the field. 13 call-sites, §04. `ui/Field.tsx` now renders it —
  see below for the defect that fixed.
- **`.form-err`** was what went wrong with THE SUBMISSION. 10 call-sites, all in
  `Team.tsx`, and **not one of them inside a `.fld` block** — they sit between
  the last field and the button, which is exactly where a form-level error goes.

So the question was never which of the two wins. It was: does the design system
already have a form-level message? **It does. `.msg` / `.msg--err`, §04, used
twenty-nine times** across the auth screens and the setup flow, paired with a
15px glyph because colour alone is gone for anyone who cannot separate two hues.

**And `.msg` had no component and no registry row.** One of the most-used
classes in the set, invisible to the catalogue and to `check:components`. So
every screen that needed one copied the markup, and the one screen that did not
copy it wrote `.form-err` in `app.css` instead. The duplicate was a symptom; the
missing component was the cause.

Settled by:

- **`ui/Message.tsx`** — `c-message`, with a written library page. The catalogue
  is 52 now.
- **`Team.tsx`'s ten `.form-err` converted to it**, gaining the warning glyph
  the product's other twelve form-level errors already carry. That is a visible
  change on one screen, and it is the point: Team was the odd one out.
- **`.form-err` deleted from `app.css`**, with the reason left in its place.
- **`.msg` added to the guard's owned list**, which is why the backlog reads 301
  rather than 271: thirty hand-written messages that were never being counted.
  The number went up because the check got honest, not because the code got
  worse.

### The programs gap, and the first component out of it

The backlog this README counts is call-sites hand-writing a component that
EXISTS. There is a second, larger list nobody had counted: classes the app
renders that the design system has never heard of. Measured:

```
app-only class families rendered in code    152
  ├─ root IS a design-system class (drift)   26
  └─ root is NOT in the design system       126
       ├─ component-shaped (BEM, or 2+ files) 74   <- to author
       └─ one class in one file (a tweak)      52
```

Those 74 account for **792 rendered elements** — more than double the 300 this
file's ratchet knows about. `programs` holds 23 of the 74, the largest share,
and `.pg` alone was 51 classes across 14 files with no component and no page.

**`.pg` is not one component.** Its 51 classes are eight or nine: a panel, a
pick-list option, a labelled slot, an assignment row, a progression ladder, a
dialog, a shelf, and the page scaffolding proper. A prefix is not a component.

#### DockPanel — `c-dock`, and the name was lying twice

`.pg__panel*` was wrong on both halves of its name:

- **Not a `.pg` element.** The week builder's `LibraryDock` wears it, and `.pg`
  is the programs screen. BEM said it was a child of something it is not.
- **Not `.panel` either.** `.panel` is `position:absolute` with a shadow and an
  entrance animation — it FLOATS. `.dock` is a grid track: `.split:has(> .dock)`
  opens a third 380px column and the plane gives up the width. It PUSHES.

That second distinction was already written down — `ExerciseInfo.tsx` carried a
comment saying it "wears `.pg__panel` rather than `.panel`" and why. A design
decision explained in a comment at one of six copies is a component that was
never made.

Settled by:

- **`ui/DockPanel.tsx`** with `Head` / `Body` / `Filters` / `Foot` / `Fine` as
  parts, the way `Card`'s are — six call-sites and no two bodies alike, so a
  `title`/`body`/`foot` component would need a prop each and still not draw the
  week builder's dock. The head IS one shape (five of six draw a title, a
  `.small` line and a close button), so `sub` is a prop, and the wrapping
  `<div>` that `.dock__hd > div` styles appears only when there is a subtitle —
  which reproduces the sixth head, that has neither.
- **`actions` rather than `onClose`.** Every close button is a ghost icon-only
  `Button` whose glyph each screen imports itself. A component that rendered one
  would be choosing an icon module for six files.
- **The CSS moved to `design-system/webapp/webapp/assets/webapp.css`**, under a
  new `── the docked panel` band beside the `.panel` it is not. `.split--solo`
  went with it: it is a `.split` modifier, and a `.split` modifier living in
  `app.css` was one of the 26 drift families. The responsive deltas stay in
  `app.css` — under 1180px the dock becomes a full-screen sheet — which is the
  one thing about this component still described in two files.
- **`dock` added to the guard's owned list**, so a seventh screen cannot write
  it by hand.

**A real defect the audit caught.** `LibraryPanel` had
`class="pgsheet__scroll pg__panelb--list"` — the modifier with **no base
class**. `.pgsheet__scroll` is defined only under `@media (max-width:900px)`, so
above 900px that element carried the gutter rule and nothing else. Rendering
`DockPanel.Body` there would have added `flex:1`, `min-height:0`,
`overflow-y:auto` and a flex column to it at every desktop width. It stays
hand-written, with the reason in place: it is the phone sheet's scroller
borrowing one rule, not a dock's body.

**Verified**: declaration parity per class across both stylesheets, compared at
the same specificity AND in the same media context (this is what caught the
`--list` case); reconstructed class parity and an identifier census over all
eight converted files; the union of classes defined across both stylesheets is
1491 before and 1491 after, none lost, none added beyond the rename.

**AND THE FAMILY COUNT DID NOT MOVE, WHICH IS THE LESSON.** `pg__panel*` were
classes *inside* the `.pg` family, not a family of their own, so carving them
out took `.pg` from 51 classes to 43 and left the to-author list at 74. A
component was added and the gap did not close.

So the boundary is the FAMILY, not the cluster: `.x` and every `.x__part` is
**one** component with parts attached, the way `Card.Head` and `DockPanel.Body`
are — never one component per element, and never a count that treats elements
as separate work. The dock is the exception that needs justifying, and it has
one: the week builder wore `.pg__panel`, so it was never a `.pg` element.
Absent that kind of evidence, the family stays whole.

#### Folding `.pg` into its hosts, and what that turned up

`.pg` is **not a component's family. It is a page's namespace**, and roughly
twenty-five of its forty-three classes were deltas riding on design-system
components that already existed:

| class | what it is | worn by |
| --- | --- | --- |
| `.pg__wide` | `width:100%` | `<Button>`, all nine call-sites |
| `.pg__gap` | `margin-top:8px` | `.fld`, `.small`, `.tools`, buttons |
| `.pg__hd-act` | `opacity:0` hover-reveal | `.btn btn--icon btn--ghost` |
| `.pg__ph` · `.pg__phm` | flex deltas | `.ph__row` — PageHeader |
| `.pg__assign` · `.pg__confirm` | row layout | `.card__b` — Card |
| `.pg__builder` | flex column | `.split__r` — Split |
| `.pg__opt` | a tick gutter | `.dayc__opt`, whose own comment says that IS the option row |
| `.pg--cert` | `.pg--cert .ph__tabs{margin-top:10px}` | reaches *into* PageHeader from outside |

So the work here is not authoring a component. It is giving each class back to
the component it was already modifying — no new catalogue entry, and one fewer
page reaching into another component's internals.

**Done: `.pg__wide` → `.btn--wide`.** All nine call-sites were already
`<Button>`, so this was the button's own modifier wearing the programs screen's
prefix. It is now `wide` on `Button`, the CSS sits in the design system's buttons
band, and `.btn` has no app-only extensions left at all.

**AND THE REST IS BLOCKED BEHIND THE OTHER BACKLOG, WHICH IS THE FINDING.**
`.pg__assign` cannot become a `Card.Body` variant while `AssignedList` writes
`<div className="card__b">` by hand. `.pg__ph` cannot become a `PageHeader` prop
while `Builder` writes `<div className="ph__row">`. `.pg__builder` cannot become
a `Split` prop while `Builder` writes `<div className="split__r">`. Every one of
those hand-written hosts is a row in `component-baseline.json`.

The two ledgers are therefore one job in two halves, and the order is fixed:
**convert the call-site to the host component first, then the delta folds into
it.** Doing them in the other order is what produced `.pg__panel` — a class
named as a child of a component the markup was not using.

`.pg` is **43 → 42** classes; the family count is unchanged at 74, and it stays
unchanged until the family is empty. That is the honest unit.

#### `AssignedList` → `Card`, and the rule the card never carried

The order the section above sets: convert the call-site to the host, then the
delta folds into it. `AssignedList` hand-wrote one `.card` and four `.card__b`,
so five elements had to move before three classes could.

**The finding is in the host, not the call-site.** `Card`'s docstring has said
since it was written that "ten cards have TWO bodies with a rule between them" —
and **the stylesheet has no such rule.** `.card__b` is `padding` and nothing
else. So the line between two bodies was being supplied by whichever screen
needed it, and `app.css` held three classes doing it:

```
.pg__confirm{border-top:1px solid var(--tx-line)}
.pg__good{border-top:1px solid var(--tx-line);color:var(--tx-ok)}
.pg__bad{border-top:1px solid var(--tx-line);color:var(--tx-danger)}
```

`.pg__confirm` carried **nothing but the border**, which is the tell: it was the
card's line wearing a page's prefix. All three are now
`.card__b--divided` / `--ok` / `--bad` in the design system, and `Card.Body` has
`divided` and `tone`.

**Opt-in, not `.card__b + .card__b`.** The sibling selector is the tidier rule
and it would draw a line inside every two-body card already shipped without one
— a change to screens nobody in this pass was looking at. The call-site says
when a body is a second thought.

**`Card` gained `as?: 'div' | 'section'`.** Nine cards in the programs panels
are `<section className="card">`, and this file's own rule is that a conversion
leaves the DOM identical. A nameless `<section>` is exposed as a generic
container by every browser and no CSS in the project selects a bare `section`,
so the change would have been inert — but inert is not identical, and the union
is those two elements so it cannot become a general escape hatch.

**One defect I introduced and caught before the audit.** The non-confirming body
was a plain `.card__b` with **no** border while its sibling in the same slot
carried one; I gave it `divided` on the way past, which would have drawn a line
that was never there. Reverted, with the asymmetry left in place and a comment
saying which one is probably wrong — that is a design call, not a conversion.

`.pg` is **42 → 41** classes; the guard is **300 → 299**; `Card`'s only
remaining app-only extensions are `card__hd--btn` and `card__hd--wrap`.

### The three avatar colour functions, settled — and one of them was a bug

There were three hashes deciding what colour a person is, over **two different
keys**:

| where | key | hash |
| --- | --- | --- |
| `lib/today/time.ts` · `avatarToken` | the **id** | `*31 + charCodeAt`, `% 1_000_003`, then `% 12` |
| `lib/setup/options.ts` · `avatarTint` | the **name** | `*31 + codePointAt`, `% 12` **inside the loop** |
| `components/team/Team.tsx` · `avatarColor` | the **name** | `*31 + charCodeAt`, `>>> 0`, then `% 12` |

Taking the modulo inside the loop is not the same function with a different key,
so these were three unrelated answers, not one answer keyed three ways.

**The visible defect.** `Team.tsx` drew a client in their coach's roster with
`avatarColor(c.name)`. `Clients.tsx` drew the same client with
`avatarToken(row.id)`. The same person was a different colour depending on which
screen you were on — which is *precisely* what `avatarToken`'s own doc comment
says the id key exists to prevent. The rule was written down and never enforced
by a single call, and `TeamClientRow` had carried an `id` the whole time.

Settled on **`avatarToken`**: 49 existing uses, and `ui/Avatar` already called
it.

- **`Team.tsx`'s local `avatarColor` and local `Avatar` are gone**, replaced by
  `ui/Avatar` at all seven call-sites — the same "a component invented at a
  call-site" shape as Hero's local `Card`. Where a real id exists it is now
  passed: `c.id` for the client, `trainerId` / `ownerTrainerId` for coaches, so
  one coach is one colour in the member list, their roster header, the templates
  table and the revenue table. An activity row carries no admin id — `r.id` is
  the row, not the person — so that one stays keyed on the name.
- **`avatarTint` deleted**; its two call-sites (the setup name step, the profile
  identity form) call `avatarToken`. Both are the trainer's *own* avatar, where
  no id exists, so they key on the name through the one surviving hash.
- **The initials on the team screen change too.** The local component took the
  first letter of the first two words; `initials` takes first + last. A
  three-part name read `MK` there and `MI` everywhere else.

**Avatars change colour on the team screen and on the two setup/settings
screens. That is the fix, not a side effect** — it is what "one person, one
colour" costs the first time it is actually true.

**`initialsOf` in `lib/setup/options.ts` stays, and is *not* a duplicate of
`initials`.** It returns `M` where `initials` returns `ME`, and the function's
own comment says why: it mirrors what the phone shows for the field the trainer
is typing into, and `RA` on web beside `R` on the phone would make one of them a
lie. That is the reason the two setup call-sites keep hand-written `.av` rather
than moving to `ui/Avatar` — the component would change the letters.

Still hand-written in `Team.tsx`: **two `.av--pending` seats**, because both
hold a `<Mail>` glyph and `Avatar`'s `pending` branch renders an empty span.
Giving that branch children is the fix, and it is a component change nobody has
asked for yet.

### The `.ctl` backlog, and a defect it turned up

Seventy-three `.ctl` controls sit inside the 54 `.fld` blocks the Field pass
could not convert. Going back for them converted **nothing more** — but it
found something worth more than the conversions would have been.

**`Field` rendered its error as a hint.** The `error` prop came out as
`<span className="fld__h">`, and `.fld--err` restyles only the control's border
— nothing in §04 makes a `.fld__h` look like an error. So a field in error was
announced correctly to a screen reader and, on screen, looked exactly like a
field with a hint: grey, 12px, normal weight. The one visual signal that says
something went wrong was missing.

§04 has `.fld__e` for precisely this — `color: var(--tx-danger)`, weight 600,
`display: flex` with a gap for an icon — and **thirteen call-sites already use
it**. The component now does too. Nothing already converted changes: none of
the twenty converted fields passes an `error`.

**And there is a third spelling.** `.form-err` is defined only in
`app/styles/app.css` and used ten times, alongside `.fld__e`'s thirteen. Two
error styles for one idea, one of them invisible to the design file. Which wins
is a design decision, so it is recorded rather than settled.

**Why the 54 still do not convert**, precisely: 16 hold a child that is none of
label/control/hint — six of those are an `.affix` wrapper, which belongs to
`AffixField` and would need its own pass; 13 have an expression between the
parts; 9 are the label-as-hint pattern (`<label className="fld__h">`) rather
than a `.fld__l`; and three are one-offs. None is a missing prop. They are
different shapes wearing the same class.

### ListRow: 0 of 13, and the component was still wrong

This pass converted **nothing**, and the number is the point.

`ListRow` rendered a `<Link>` and only a `<Link>`, with `role="option"` for the
`role="listbox"` its `ListRows` wrapper supplies. The product's rows are not
that: **six are `<button>`** — the exercise picker, the swap sheet, the log's
*repeat this* — three are `<div>`s that state a fact and go nowhere, and four
are links.

So the component now picks its element the way `Chip` does: `href` navigates,
`onClick` acts, neither is a statement. **The roles do not come along** —
`aria-selected` and `role="option"` are emitted for the link form only, because
an `option` is valid only inside a `listbox`, and a picker made of buttons is
not one. Telling a reader they can arrow through a selection that does not
exist is worse than saying nothing.

**And it still converts nothing**, for five small reasons rather than one big
one: five rows put a `style={{ flex: 1 }}` on the `.lrow__m` (redundant — §04
already gives the class `flex: 1` — but dropping it silently is not this pass's
call), three build their children as an expression, three are links with no
`aria-selected` that the component would newly give one, one carries
`aria-current`, and one has a bare trailing icon that would gain an `.lrow__r`
wrapper — a real flex container, so a real layout change.

**A codemod bug this caught.** The first version DID convert two, by silently
dropping that `style={{ flex: 1 }}`. The identifier census flagged it —
`style 10→9, flex 1→0` — and the fix took the count to zero. Two conversions
bought by a silent deletion are worth less than none.

The component change is kept: it is grounded in nine measured call-sites and it
removes the barrier. What is left is per-call-site tidying, not a shape problem.

### EmptyState is collected: 13 of 17

`.empty` went from 17 hand-written to **4**. `style` was added for the ten panes
that position themselves inside a scroller §04's 64px padding does not account
for.

**One DOM change, counted rather than absorbed: ten icons move from `<div>` to
`<span>`.** The component renders a span; ten call-sites write a div. They are
indistinguishable on screen — §04 gives `.empty__ic` an explicit
`display: grid`, so the tag decides nothing — and one tag is better than a prop
for choosing between two that look the same. The codemod reports the count.

The codemod also refuses any pane whose parts are out of icon/title/body/action
order, because the component renders them in that order and would silently
reshuffle a screen that did something else.

**4 remain**: two with attributes on the body paragraph, one with an expression
among the children, one the scanner could not parse.

**A contradiction worth knowing about, left alone.** The component's own header
says "the title is a real heading, so the empty state is a landmark in the
outline" — and it renders `<p className="empty__t">`. `Card` and `PageHeader`
both make that claim and keep it; this one does not. Fixing it would change the
heading outline of seventeen screens, which is a decision about the outline
rather than a conversion, so it is recorded here.

### Why is collected: 15 of 21, and its CSS is in the wrong file

`.why` went from 21 hand-written to **6**, and every conversion is
byte-identical — because the component stopped adding a `<div>`.

**That wrapper was the whole obstacle.** `Why` rendered its children inside a
bare `<div>`, and no call-site has one. It changed no styling: `.why` is a plain
block (border-left, background, padding) with no flex and no gap, and every
rule that reaches inside is a DESCENDANT selector — `.why p`, `.why b`,
`.why code`, `.why .small` — so the wrapper was invisible and did nothing but
make a converted callout differ from the markup it replaced. It is gone.
`style` was added for the seven callouts that set their own margin.

**And the pass found `.why` living in the wrong stylesheet.** `.why` is defined
in the design file at §02 — the review-page chrome that `sync-design.mjs`
deliberately strips, because §02 exists to PRESENT the design rather than to be
it. So it never reaches `web/app/styles/webapp.css`, and somebody re-added it by
hand in `app/styles/app.css`. **The two copies have drifted:** the design file
has `max-width: var(--w-measure)` that the app does not, and the app has
`.why b`, `.why strong` and `.why code` that the design file does not. This is
exactly the drift the sync script exists to prevent, happening in the one region
it is told to throw away. `.why` is a product component and belongs in §04;
moving it is a design-file edit, so it is recorded here rather than done.

**6 remain**: four whose heading carries attributes of its own, and two whose
`why__k` is not the first child — the component always renders the heading
first, so converting those would reorder them.

### Table: the component was extended, and the conversion is hand work

**Two of twenty-eight** tables fitted `ui/Table.tsx` as written. That is the
lowest of any component here, and the reason is that the entry described one
table — a sortable roster with a header column — while the product's tables are
mostly composed by hand.

The extension changed that: **19 of 28 are now expressible.** `Cell` gained
`className`, `style` and `colSpan`; `columns` became optional; `Table` gained a
`style`; `Row` gained a `header` that can be absent and passes the rest of a
`<tr>`'s props through. None of that is prop soup — twenty-two tables put a
class on a cell (`mono` for a figure, `strong` for a total, `wrap` for a note),
nine span columns, nine have no `<thead>` at all, and one makes each row a
`role="link"`. A table's cells genuinely differ from one another; that is what a
table is.

`.tbl` turned out to be `font-size: 13.5px` and nothing else — no width, no
border-collapse — so the hardcoded `style={{ width: '100%' }}` was covering for
the stylesheet and silently missing the `borderCollapse: 'collapse'` six tables
set. It is a prop now, defaulting to what it used to hardcode.

**The conversion itself cannot be a codemod, and the reason is `caption`.** It
is required, deliberately — a table with none is announced as "table, 9 columns,
23 rows" with no idea what of — and **26 of the 28 have no caption to carry
over**. Writing nineteen screen-reader captions is authoring, not refactoring,
and a script that invented them would be putting words in the product's mouth.

**11 are converted by hand**, each with a caption written from what the table
actually shows and each verified to render the same cells and classes. `Column`
gained a `className` on the way — sixteen header cells carry something beyond
`num`, `tbl-col--hide-mobile` on a column that folds away at 620px being the
common one.

**11 remain, and every one is blocked by a shape rather than by a caption.**
Three were only found by trying: `ExerciseLibrary` has a `<colgroup>` and
renders its rows through a sub-component; `Packages`' price list puts `data-l`
on every cell for the narrow reflow; `AttentionQueue` declares its own `Row`,
which collides with this one, and passes the table no `style` at all — where
the component would supply its `width: 100%` default. The other eight are the
`tfoot`, `data-cell` and header-`colSpan` cases already known.

Captions for all eleven are drafted and recorded with the work; they are a
sentence each and are the easy part. The shapes are not.

### PageHeader: 10 of 25, after the component learned two things

**One** header of twenty-five fitted this component before the pass. That is
the finding, and it was not a code-quality problem — it was the component
describing a screen the product does not have.

Two slots were added because the markup asked for them:

- **`crumbs`.** Seven headers draw a path above the title — *Sessions / Meera K
  / Top sets* — and it belongs INSIDE the title block, above the h1, so the
  actions on the right stay level with the heading rather than with the
  breadcrumb. There was nowhere to put it, and those seven were the single
  largest group the component could not describe.
- **`children`.** Four headers put a tab bar under the row, and `PageTabs`
  renders its OWN `<nav className="ph__tabs">`. Passing that as `tabs` — which
  wraps its argument in a `.ph__tabs` div — would nest one inside the other.
  `children` wraps nothing, so `tabs` keeps its meaning for raw markup (which
  is what the library specimen passes) and the product's tab bars go in
  `children`.

The h1 also lost its inline `margin: 0`, dead for the same reason it was dead
in `ui/Card.tsx`: `webapp.css`'s reset already zeroes heading margins, and the
inline copy was the only thing stopping a converted header being identical.

**15 remain**, and they are conditionals and shapes rather than gaps: nine have
an expression among the children or inside the row, five put a `.ph__id` beside
the title block, and one passes a raw `.ph__tabs` div, which is ambiguous
between the two slots and so is a hand edit on purpose.

### Avatar: 11 of 29, and it found a split in the design system

`Avatar` does not TAKE a colour — it derives one with `avatarToken(id ?? name)`,
which is the rule that keeps a person the same colour on the rail, in the
ribbon and in the queue. So a call-site only converts when its colour and its
initials are the ones the component would have computed anyway. Eleven were.

**What the other eighteen are is the interesting part.** Seven hold a
precomputed `token` or `av` variable, three paint a FIXED `var(--tx-av-N)`,
two use `avatarTint`, one uses `avatarColor`, and the rest carry an extra
`opacity` or `flexShrink`. Converting any of those would change the colour a
person is shown in, which is the one thing this component exists to keep
stable, so all of them are refused.

**There are three avatar-colour functions in this codebase, and only one is in
`lib/today/time.ts`.** `avatarTint` lives in `lib/setup/options.ts` and
`avatarColor` is declared inside `components/team/Team.tsx` — a third hash,
private to one screen. That is the same finding as `Hero.tsx`'s local `Card`,
one layer down: the same question answered three times because the answer was
never put anywhere shared. Recorded rather than merged, because deciding which
hash wins changes what colour people appear in.

Two of the eleven **gain an `aria-hidden`** they did not have. The component
sets it on purpose — the initials are a picture of a name written in full
beside them, and announcing "M K" before "Meera K" is two readings of one fact.

### Stat is collected: 31 call-sites in 9 files

`.stat` went from 35 hand-written to **11**. A tile is three paragraphs and the
component emits the same three, so every conversion is DOM-identical.

Seven of the 31 had a **conditional tone** — `` `stat${late ? ' stat--danger' : ''}` ``
— which is not a class list a codemod can read but is exactly a `tone` prop:
the same ternary with the class names swapped for tone names. Only that shape
is accepted (a template that is `stat` plus one `${…}` whose every branch is a
single `stat--x` or empty), so anything doing more is left alone.

One change to the component: **`label` widened from `string` to `ReactNode`**.
A third of the labels interpolate — *You earned · {periodTag(period)}*, *The
gym's {stats.gymCutPercent}%* — so the narrower type was a claim the product
had already disproved.

**11 remain**, in two groups that are both about the element rather than the
props: seven tiles in `Team.tsx` built from `<div>`s where the component emits
`<p>`s, and three `<Link className="stat">` on the phone rail, a navigating
variant the component has no `href` for. Re-tagging either quietly is exactly
what these passes refuse to do.

### KeyValue is collected: 49 call-sites in 14 files

`.kv` went from 66 hand-written to **16**, and every conversion is
DOM-identical: `KeyValueRow` renders the same `div` and the same two spans.

**It converts to `KeyValueRow`, not `KeyValueList`, and that is a decision.**
`KeyValueList` is the semantically better home for the 34 rows that sit in a run
of 2–6 — a `<dl>` says the pairing out loud, which is the whole argument in its
header. It is not a mechanical swap. It introduces a wrapper element
(`<dl class="col">`, and `.col` is `display:flex`), and §04 has
`.kv:last-child{border-bottom:0}` — resolved against the PARENT, so wrapping a
run changes which row draws its rule. Promoting a run is a per-screen decision
with a visible outcome, not a refactor.

The component gained `valueClassName`, because twenty-nine values carry a §04
utility — `mono` for a machine-readable figure, `acc` / `warn` / `ink3` for
tone. A class and not a style, deliberately: those live in `webapp.css` where a
designer can change what `warn` looks like everywhere. There is no `valueStyle`
to go with it, so the four rows that colour their value inline stay
hand-written rather than have the component grow a hole that puts colour back
at the call-site.

**16 remain**: six with an inline style on the value, three with an expression
between the key and the value, three whose key is not a plain span, and two
odd ones.

### Field: 20 of 74, and the honest number is low

`.fld` is the first pass where most call-sites did NOT convert, and that is the
finding rather than a shortfall. A field is a subtree — label, control, hint —
and the product's are structurally varied in a way buttons and tags are not:
**24 hold a child that is none of those three** (a `Button`, a `Chip`, a second
paragraph), and **13 have an expression between the parts** (`{err && …}`).
Neither is misuse; both need a person to decide what the prop should be.

**The ids were the real question.** 53 controls already carry a name a human
chose — `nc-phone`, `pp-amount`, `ac-name` — and `useId()` would have replaced
every one with `:r7:-ctl`. So `Field` gained an optional `id`, and derives the
hint's as `${id}-h`, which is not invented: it is the convention all ten
hand-wired fields already use, checked before the prop existed. It also gained
`style`, MERGED with `width` rather than replacing it, because seventeen `.fld`
divs carry a `marginTop` that would otherwise vanish.

**Five of the twenty are DOM-identical; fifteen gain wiring they did not have.**
That split is counted by the codemod, not estimated: a field that already had
`htmlFor` and a hint id comes out byte-identical, and one that had neither now
gets a label that moves focus when clicked and a hint a screen reader can
reach. That is the fix this component exists for — see its header — but it IS a
change, so it is reported as one.

Two refusals worth keeping: `fld--err` (the component owns that state, so a
hand-written one means the hint span IS the error, and deciding that is not a
script's job), and a `style` on the input, since `TextField` gives `style` to
the field block rather than the control.

### Chip is collected: 85 call-sites in 26 files

`.chip` went from 71 hand-written to **5**. The component needed the most
widening of the four, and the reason is worth stating plainly: **a chip is a
control**. `Tag` names two harmless props and shuts the door on `onClick`
because a tag that can be pressed has become a chip; `Chip` IS the pressed
thing, so refusing DOM props buys nothing and costs the call-sites that need
`role="menuitem"`, `aria-haspopup`, `aria-expanded`, `aria-label`. It now
spreads them, and gained `href` for the schedule toolbar's *Hours* pill — a
hand-written `<Link className="chip …">` for as long as the toolbar has existed.

`chip--sm` and `chip--active-status` are NOT props, for the same reason
`card--pick` is not: both live only in `app/styles/app.css`, and a prop in the
catalogue's API for a class a designer cannot reach in the design file would be
a lie about where that class lives.

**The refusal that mattered was about the element.** `Chip` renders a `<span>`
when there is neither a pressed state nor a handler and a `<button>` otherwise,
so the codemod refuses any call-site where that choice would differ from the
markup already there. A `<button className="chip">` quietly returned as a span
would leave the tab order — the exact bug the component's header says the
reference has.

**Two files declared their own `Chip`** — the filter rail's (`on`, `ghost`) and
the setup flow's (`label`, `dimmed`, `mono`). Neither is a duplicate to delete:
each carries a real decision. What was wrong is that they reached past the
catalogue to raw markup, so the wrappers stay and their INSIDES are now
`ui/Chip`, imported as `UiChip` because the local name is what their call-sites
use.

**The 5 that remain** are conditional classNames — `` `chip${x ? ' chip--ghost' : ''}` ``
in `SessionsTab` and `PhoneProgram` (×2), `Team`'s `chip--active-status`, and
`FilterRail`'s one `.chip` that is not its wrapper.

### Tag is collected: 93 call-sites in 38 files

`.tag` went from 99 hand-written and one import to **8 left**. A leaf conversion
like Button's, and it ran clean: 86 in the sweep, then five by hand whose tone
is computed rather than literal — `` tag--${session.mode} `` is not a class a
codemod can read, but it is `tone={session.mode}`, and that `DeliveryMode` is a
valid `TagTone` is a claim tsc checks rather than one the script has to be
trusted on.

**The component gained `style` and `title`, and nothing else.** Ten call-sites
needed them; every `style` in the product is a margin, five of them
`marginLeft: 'auto'` pushing a tag to the end of a row. Spreading
`ComponentPropsWithoutRef<'span'>` would have been shorter and would have handed
back `onClick` — the one prop this component's doc-comment exists to refuse. A
tag that needs pressing is a `Chip`. So the two props are named and the door
stays shut, and the codemod refuses any call-site carrying anything else rather
than routing it through.

**The 8 that remain are one shape.** A variable holds a whole modifier class —
`` `tag ${stCls}` ``, `` `tag ${closed.cls}` ``, `` `tag ${trend.tone}` `` — so
converting means changing what the variable holds at its definition, which is a
source change rather than a call-site swap: `Header` (×2), `PaymentsTab`,
`LedgerTab`, `OwedTab`, `SessionDetail` (×2).

### Hero card: the catalogue is 51 now, and the new one came from a screen

The Card sweep found `components/today/Hero.tsx` declaring its OWN `Card` — 115
lines of it, used eight times, never exported. That is the second half of the
rule at the top of this file, and the half that had no example until now: a
component invented at a call-site. It is `ui/HeroCard.tsx`, `c-herocard` in the
registry, and a page under `library/entries/domain/`.

**Renamed, and nothing else.** The body is byte-identical to the 115 lines that
were in `Hero.tsx`, comments included — checked by diffing the extracted block
against the original with the rename applied. Two changes only: `Card` →
`HeroCard`, because `ui/Card.tsx` is a different component and two things called
Card in one folder is how the wrong one gets imported; and the inline `band`
type lifted out as an exported `HeroCardBand`. The rest of `Hero.tsx` is
unchanged line for line apart from `<Card>` → `<HeroCard>` at the eight
call-sites — `<Cards>`, a third component in the same file, is untouched, which
is why that rename was a script with a negative lookahead rather than a sed.

**It wears `.card` and it is deliberately NOT a `<Card>`.** `Card` is a head and
a body; this has neither. It is one `.hro` stack whose heading *is* the kicker
and whose figure is the point, so composing it would add `.card__b`'s padding to
a stack that already sets its own.

**And it arrived carrying a gap.** `.hro`, `.hro__k`, `.hro__c`, `.hro__n`,
`.hro__d`, `.hro__w` and `.hro__a` are all in the design system's own
stylesheet — but **`.hro__c2`, the chip row, is defined only in
`app/styles/app.css`**. A component in the catalogue with a class a designer
cannot reach in the design file is exactly the drift this folder exists to
prevent. Recorded on the component's page rather than quietly promoted, because
moving a class into the design file is the designer's call.

### Button: what is left, and why

None of the 29 is a leftover; each needs a decision that a conversion is not
allowed to make.

- **12 icon-only buttons whose `aria-label` is computed**, not a literal. The
  component needs a `label` string, and picking one is a judgement about what
  the control is called — `Header`, `Toolbar`, `TopBar`, `NotesTab`, `Clients`,
  `PaymentRowMenu`, `WeekPicker`, `DayColumn`, `RowPanel`, `ExerciseLibrary`.
- **5 whose glyph is more than one element.** `icon` takes a node, and these
  pass two, so each is a small rewrite: `PackPanel`, `PeriodPicker` (×2),
  `RecordPanel`, `LibraryPanel`.
- **3 bare `.btn` with no variant** — `Toolbar` (×2) and `ClientReport`. The
  component's default would add `btn--secondary`, which changes how they look.
  That is a design decision, not a conversion.
- **8 `<NudgeButton className="btn …">`.** The class is being handed to another
  component, which renders the button itself. The conversion belongs inside
  `NudgeButton`, not at these call-sites.
- **1 `<span className="btn btn--primary btn--sm">`** in `Console` — a span
  wearing the button's clothes inside a `<Link>`, deliberately not a control.

## Confirming a conversion changed nothing

The conversion is only safe if the DOM is identical afterwards. Capture the page
before and after and compare the elements, ignoring attribute order:

```bash
# a token for the seeded trainer
curl -s -X POST localhost:3100/v1/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"9841022119","otp":"123456"}'

curl -s localhost:3100/today -H "Cookie: inclineyou_token=$TOK" -o before.html
# …convert…
curl -s localhost:3100/today -H "Cookie: inclineyou_token=$TOK" -o after.html
```

`AttentionQueue.tsx` was checked this way: 14 `.btn` elements before, 14 after,
same tags, same classes, same attributes. Only the *order* of the class tokens
moved (`btn btn--sm btn--secondary` → `btn btn--secondary btn--sm`), which no
CSS can see.

### When the page will not come up, check one level higher

That recipe needs the backend, and for a sweep across ninety files it needs it
for every screen at once. When it is not available, compare the SOURCE — but
compare two things, not one:

1. **The class list each element emits**, reconstructed before from the raw
   `className` and after from the component's own class function, compared as
   sorted token sets. Order is the one difference a component is allowed to
   make.
2. **Every identifier in the file**, counted before and after, failing on any
   loss outside the vocabulary the component absorbs (`button`, `className`,
   `btn`, the modifiers, `type`, and `Link` where a link became a `href`).

**The second is not optional, and the Button sweep is why.** A parser bug
dropped `onClick` and `disabled` from `SetPanel`'s Delete button while keeping
its classes exactly. It type-checked, it rendered, and the button did nothing;
the only symptom anywhere was an unused-prop lint warning in a different file.
Class parity alone would have shipped it.

Then the ordinary gates, all four: `tsc --noEmit`, `eslint` **compared against a
count recorded before the change** (this tree sits at 8 errors and 9 warnings,
every one pre-existing — a conversion that changes the number has done
something), `next build`, and `node ../scripts/sync-design.mjs --check`.

Two local traps worth knowing before writing any codemod. These files are
**CRLF**, so emitting `\n` marks every line of the diff as changed and buries
the real edit. And several call-sites keep **prose comments inside the JSX
attribute list**, so an attribute parser has to treat a comment as an item
rather than as the end of the list — that was the exact bug above.

## The styling stays in the design system

None of these files carry colour, size or spacing. `.btn` and its modifiers live
in `design-system/webapp/webapp/assets/webapp.css`, where a designer can reach
them, and `scripts/sync-design.mjs` carries them to both stylesheets:

```
assets/webapp.css ──┬─▶ web/app/styles/webapp.css         the product
                    └─▶ web/app/styles/library-chrome.css  §02 + §23, /library only
```

The second output is the **inverse of the strip** — the review chrome
(`.page`, `.bench`, `.cell`) and the component library (`.lib`, `.cmp`, `.blk`,
`.mtx`, `.anat`, `.dd`, `.st`) that the application stylesheet deliberately
throws away. It is imported by `app/library/layout.tsx` and by nothing else, so
`.page` and `.cell` never reach a product route — which is the collision the
strip existed to prevent in the first place.

Both are found by the same section anchors, so a restructured design file breaks
them together and loudly, rather than quietly emitting a stylesheet with a hole.

## What a component file decides, and what it does not

`ui/Button.tsx` is a good template for the rest. It decides:

- **which class combinations are legal** — `variant`, `size`, `iconOnly`
- **the element** — `<button>`, `next/link` for an in-app `href`, a plain `<a>`
  for an off-site one (prefetching `wa.me` on scroll is not wanted)
- **the defaults that were being forgotten** — `type="button"`, so a button in a
  form stops submitting it
- **what will not compile** — `iconOnly` requires `label`, so an icon button
  cannot ship without an accessible name

It does not decide what any of it looks like. That is still §04's job.

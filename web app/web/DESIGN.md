---
name: InclineYou Web
description: A dense, warm-paper working ledger for independent personal trainers, with one lime highlighter for the next action.
colors:
  highlighter-lime: "#C6F24E"
  highlighter-lime-press: "#B2DE3A"
  lime-ink: "#0A0B0D"
  dark-lime-text: "#4F6B0A"
  dark-lime-wordmark: "#64850A"
  lime-wash: "#EDF6D6"
  lime-wash-line: "#CFE39A"
  paper-white: "#FFFFFF"
  paper: "#F6F5F1"
  paper-deep: "#F1EFE9"
  paper-deepest: "#E9E5DD"
  paper-rule: "#E2DDD5"
  paper-rule-strong: "#CDC7BC"
  paper-ink: "#171512"
  paper-ink-2: "#59544A"
  paper-ink-3: "#676156"
  slate-rail: "#0A0B0D"
  slate-canvas: "#0D0E11"
  slate-surface: "#16181C"
  slate-surface-2: "#1D2025"
  slate-surface-3: "#262A30"
  slate-rule: "#272B32"
  slate-rule-strong: "#363B44"
  slate-ink: "#F2F4F6"
  slate-ink-2: "#A2A9B4"
  slate-ink-3: "#8B939F"
  ok-on-paper: "#0E7034"
  ok-on-slate: "#3DDC84"
  warn-on-paper: "#8F5100"
  warn-on-slate: "#FFB020"
  danger-on-paper: "#C0281E"
  danger-on-slate: "#FF5A5A"
  info-on-paper: "#1B5FA8"
  info-on-slate: "#6FB6FF"
  floor-on-paper: "#1B5FA8"
  floor-on-slate: "#9FD3FF"
  remote-on-paper: "#6B3FC4"
  remote-on-slate: "#C9A8FF"
  record-on-paper: "#8A6000"
  record-on-slate: "#FFC861"
typography:
  display:
    fontFamily: "Archivo, Inter, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  figure:
    fontFamily: "Archivo, Inter, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "44px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "'tnum'"
  figure-sm:
    fontFamily: "Archivo, Inter, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.04em"
    fontFeature: "'tnum'"
  headline:
    fontFamily: "Inter, 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.011em"
  title:
    fontFamily: "Inter, 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Inter, 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.4
  meta:
    fontFamily: "Inter, 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12.25px"
    fontWeight: 400
    lineHeight: 1.45
  micro:
    fontFamily: "Inter, 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.02em"
  stat-label:
    fontFamily: "Inter, 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.35
  data-mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "10.5px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.11em"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.highlighter-lime}"
    textColor: "{colors.lime-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.highlighter-lime-press}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.paper-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.paper-ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-danger:
    backgroundColor: "{colors.danger-on-paper}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  field:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 11px"
    height: "34px"
  chip:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.paper-ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 11px"
    height: "28px"
  chip-pressed:
    backgroundColor: "{colors.highlighter-lime}"
    textColor: "{colors.lime-ink}"
  tag:
    backgroundColor: "{colors.paper-deepest}"
    textColor: "{colors.paper-ink-2}"
    typography: "{typography.micro}"
    rounded: "{rounded.xs}"
    padding: "0 7px"
    height: "20px"
  tag-accent:
    backgroundColor: "{colors.lime-wash}"
    textColor: "{colors.dark-lime-text}"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  stat:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.figure-sm}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  menu:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "5px"
  rail-item:
    textColor: "{colors.paper-ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 9px"
    height: "40px"
  rail-item-current:
    backgroundColor: "{colors.lime-wash}"
    textColor: "{colors.dark-lime-text}"
---

# Design System: InclineYou Web

## Overview

**Creative North Star: "The Gym-Floor Ledger"**

A trainer's logbook made precise. The ground is warm paper in light and cool slate in dark; ink is warmed onto the same hue as its ground so text and surface never pull against each other. Everything is dense and measured: 34px controls, 44px rows, a 248px rail, tabular figures wherever a number changes. One colour does the marking: **Highlighter Lime**, spent only on the thing a trainer is most likely to press next, the way a coach underlines the next set.

The system serves a person with one hand busy, mid-session, often at a laptop or tablet in a gym. So it is a working tool before it is a brand: scanability, a stable layout, and quick, quiet feedback outrank expression. The brand lives in precise details: the lime top edge on a primary button, the wordmark's *You* that changes lightness and never hue, a tinted tag that says the one thing a row needs to say.

It rejects, explicitly, three looks: **generic fitness-app neon** (gradient hero cards, glowing lime everywhere, streak flames), **enterprise SaaS grey** (anonymous cards and blue-grey indistinguishable from any CRM), and **consumer wellness pastel** (soft, rounded, airy).

**Key Characteristics:**
- Warm-paper light theme and cool-slate dark theme, both first-class and driven through the real theme switch.
- Flat by default: hairline borders and tonal steps carry structure; glass is for overlays only.
- Lime is a fill, never a stroke, never text on a light ground.
- Compact density that stays at or above the 24px WCAG target floor, via hit-slop instead of inflated visuals.
- Colour never carries meaning alone; the word does.

## Colors

Warm paper and cool slate for the ground, one lime for the mark, and four earned semantic hues that each step darker on paper and lighter on slate so contrast holds in both themes.

### Primary
- **Highlighter Lime** (#C6F24E): the fill for the primary action, the pressed chip, the current-rail bar, a single progress meter, and the one highlighted bar in a list or chart (the leader, or the month in progress). The same value in both themes. Press state is **Lime Press** (#B2DE3A). Anything laid on it is **Lime Ink** (#0A0B0D, 15.2:1).
- **Dark Lime** (#4F6B0A): the *stroke and text* form of the accent on paper. Used for the current rail label, accent tags, accent figures and the focus ring on light. On slate the accent text is the lime itself.
- **Wordmark Dark Lime** (#64850A): the *You* in the wordmark on paper. Same hue and saturation as the lime at lower lightness; one colour lit two ways, not two colours.
- **Lime Wash** (#EDF6D6) and **Lime Wash Line** (#CFE39A): the soft ground and edge for accent tags and the selected row on paper. On slate the equivalents are the lime at 12% and 34% alpha.
- **Today Wash** (`--w-today`: #F7FAEE on paper, lime at 4.5% on slate): today's column on the calendars, half the strength of a selected row, because a selection is one row and today is a whole column.

### Neutral
- **Paper White** (#FFFFFF): cards, the rail, the section pane and the top bar on light — everything you read and act on (26 Nov 2026: grey page, white cards).
- **Paper** (#F6F5F1): the page (`--tx-canvas`) on light — barely off-white, so a 1px Paper Rule border, not the tone step alone, separates a card from it. Also the inset search field in the white top bar.
- **Paper Deep** (#F1EFE9): a card's own header, quiet fills.
- **Paper Deepest** (#E9E5DD): tags, meter tracks and the deepest surface step.
- **Paper Rule** (#E2DDD5) and **Paper Rule Strong** (#CDC7BC): hairlines and control borders.
- **Paper Ink** (#171512), **Paper Ink 2** (#59544A), **Paper Ink 3** (#676156): body, secondary and quiet text, all warmed onto the ground's hue (7.5:1 and 6.1:1 on the surface for the last two).
- **Slate Canvas** (#0D0E11), **Slate Rail** (#0A0B0D, one step below the canvas), **Slate Surface** (#16181C), **Slate Surface 2** (#1D2025), **Slate Surface 3** (#262A30): a lifted graphite, each step roughly twice the last (23 Nov 2026): the dark ramp.
- **Slate Rule** (#272B32) and **Slate Rule Strong** (#363B44): dark hairlines.
- **Slate Ink** (#F2F4F6), **Slate Ink 2** (#A2A9B4), **Slate Ink 3** (#8B939F): dark-theme text.

### Semantic and domain
- **OK** (#0E7034 on paper, #3DDC84 on slate), **Warn** (#8F5100 / #FFB020), **Danger** (#C0281E / #FF5A5A), **Info** (#1B5FA8 / #6FB6FF): each paired with a soft tint for tags and callouts. Red means an error and nothing else.
- **Floor** (#1B5FA8 / #9FD3FF) and **Remote** (#6B3FC4 / #C9A8FF): the delivery-mode axis, the colour split the schedule is built on. **Record** (#8A6000 / #FFC861): personal bests.
- Avatars use twelve fixed mid-tones, each clearing 5.9:1 under white initials.

### Named Rules
**The Fill-Not-Stroke Rule.** `#C6F24E` is 1.17:1 on a light surface and 1.3:1 on white. It is a field with ink knocked out of it, never a border and never text on light. This rule has caused four real bugs in this project; on light, every stroke and every word steps to Dark Lime.

**The Ground-And-Ink Rule.** Warm paper is paired only with warm ink, slate only with cool ink. Mixing tints makes both read as flat grey.

**The No-New-Colour Rule.** The library prints `New colours: 0` on purpose. A screen that needs a colour the system does not have adds it to the system first.

**The One-Lime-Bar Rule.** In a list of bars or a chart, every bar is neutral (`--tx-ink-off`, the 3:1 shape step) and one is lime: the leader, or the period in progress. Twelve lime bars say nothing about any one of them. Reference lines (averages) are dashed `--tx-ink-off`, never lime: lime is never a stroke.

**The Meaning-Is-Words Rule.** Tone is never the only carrier: a tag says *Pending*, not just amber. A body measurement carries no tone at all.

## Typography

**Display Font:** Archivo (Inter fallback), 800, for page titles and figures.
**Body Font:** Inter (SF Pro Text, system fallbacks), 400 to 700, for all interface text.
**Mono Font:** JetBrains Mono, for data only: number entry, table column heads, chart figures and menu group keys. Never for a label that names something.

**Character:** Archivo's heavy, tightly tracked display sets the headline numbers apart the way a scoreboard does; Inter carries everything a trainer reads at a glance. Mono is for data a trainer lines up and compares, not for labels or decoration. The wordmark itself is Inter 800 at −0.038em, not Archivo.

### Hierarchy
- **Figure** (Archivo 800, 44px, 1.0, −0.04em, tabular): the one number a hero card exists to state.
- **Figure Small** (Archivo 800, 30px, 1.05): a stat tile's value.
- **Display** (Archivo 800, 22px, −0.025em): page titles in `.ph`.
- **Headline** (Inter 700, 17px, 1.3): section headings.
- **Title** (Inter 600, 15px, 1.35): a person's name, a card title (14px 700 in card headers).
- **Body** (Inter 400, 13.5px, 1.5): everything else; prose is capped at 72ch.
- **Label** (Inter 600, 12.5px): field labels, buttons and menu items.
- **Meta / Micro** (Inter 12.25px and 11px): secondary lines and tags.
- **Stat label** (Inter 500, 12.5px, sentence case, ink-3): stat keys, `Strip` captions, the `.micro` utility, the hero card's key, section labels (`.sh__l`, 600 in ink-2) and callout heads (`.why__k`, 700 in accent text). Replaced the uppercase mono eyebrow on 24 Nov 2026, along with 48 screen-level captions (fact-list `dt`s, group heads, step counters, the setup flow's `GroupLabel`). Label text is written in sentence case in the source too, never typed in capitals. A label is never painted in `--tx-ink-off`, which is a 3:1 shape colour, not a text colour.
- **Data mono** (JetBrains Mono 500, 10.5px, +0.11em, uppercase): table column heads and group keys only.

### Named Rules
**The Tabular Rule.** Every figure that can change is tabular; a running clock whose digits change width makes the card twitch once a second.

**The Tracking Rule.** Large display type takes negative tracking, micro type positive. The scale has six steps and no seventh.

**The 16px Rule.** Form controls go to 16px under 900px width so iOS does not zoom.

## Layout

An application shell, not a page. Under it: a rail (248px expanded, 64px icon-only) with up to five destinations, an optional 212px section pane for the three sections that have pages (Clients, Fitness, Business), a 56px top bar (46px under 900px), and a scrolling `.body` between them. Nothing in the shell is `position:fixed`; it is a grid of `100dvh` with `overflow:hidden`. The page header (`.ph`) has no bottom padding when it carries a tab strip, so the active tab's underline lands on the rule; **a header with no tabs gets 14px (12px on a phone)** so its last line or buttons never sit on the hairline. `.main` is `overflow:clip` where supported, not only `hidden`, so no `focus()` or `scrollIntoView()` can scroll it and slide the page header away: `.body` is the only scroller. Content in the client file's Overview grid fills the width like every other tab; there is no max-width ceiling above 1240px.

Density is a dial: `--w-row` 44px (56px for two-line rows), `--w-tap` 32px for pointer-only controls and 40px for anything plausibly touched on a convertible laptop. The base spacing is a 4pt scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64); a card's internal gutter is one inherited value (16px) so every band inside stands on the same left edge.

Responsive behaviour is rungs, each argued in its own comment: **900px is the shell's own line** (the rail becomes a bar, panels become bottom sheets, the pane moves into the tab bar's sheet); 1080 stacks Today's hero pair and folds the programs split; 620 and below handle per-screen table reflows. The viewport cannot see a container's width, so anything inside a collapsible rail uses a container query. Mobile is not the desk narrowed: where the two are different things (a pixel-per-minute day ribbon versus a thumb-scrolled list) they are two components and CSS picks one.

### Named Rules
**The Specificity-Not-Order Rule.** When two rules tie, the fix is higher specificity, never moving a rule down the file.

**The No-Inline-Layout Rule.** Layout is never set from a `style` attribute; an inline style outranks every media query written to release it.

## Elevation & Depth

Flat by default. Hairline borders and a barely-there ambient shadow (e1) carry structure; a card at rest has one hairline on one fill. Shadows appear on overlays and on state. Glass, the one deliberate material, is reserved for the layer that sits on top of content: the top bar, the right panel, the modal, the command palette and the bulk bar. It never touches tables, cards, stat tiles, money or the rail, and it never stacks on itself.

### Shadow Vocabulary
- **Ambient** (`0 1px 2px rgba(23,21,18,.05)` light, `0 1px 2px rgba(0,0,0,.30)` dark): a card or stat tile at rest (e1).
- **Raised** (`0 1px 3px rgba(23,21,18,.07), 0 6px 16px -8px rgba(23,21,18,.12)`): a hovered raisable card (e2).
- **Floating** (`0 10px 30px -8px rgba(23,21,18,.22)` light, `0 10px 30px rgba(0,0,0,.6)` dark): menus, popovers, the toast (e3).
- **Sheet** (`0 -8px 40px -12px rgba(23,21,18,.25)`): a bottom sheet (e4).
- **Lime glow** (`0 6px 18px -6px rgba(150,190,40,.5)` light, `0 0 24px rgba(198,242,78,.16)` dark): the primary button's hover only.
- **Glass** (fill `rgba(22,26,32,.64)` dark / `rgba(243,242,236,.68)` light, `blur(20px) saturate(170%)`, a lit 1px top edge): overlays; falls back to solid under `prefers-reduced-transparency`. The blur is never animated.

### Named Rules
**The Glass-On-Overlay-Only Rule.** Content stays flat and opaque. A payments row must never be a judgement call about legibility, and the product has no photographs, so the ground behind glass stays a predictable uniform surface.

**The Contrast-After-The-Blur Rule.** Text over glass measures 4.5:1 after the material, in both themes. One glass sheet per view; controls inside glass sit on solid fills.

## Shapes

An 8pt radius system. 4px for tags and menu items, 8px for buttons, fields and menus, 12px for cards and stat tiles, 18px for the largest surfaces, and full for chips, meters and switches. Borders are 1px hairlines; lines get stronger (not thicker) to emphasise an edge. The rail's current destination carries a 2px lime bar bleeding off the rail's edge, a deliberate hit of the accent in shape form. Silhouettes are rectangles and pills; there are no decorative blobs, no diagonal cuts and no oversized rounding.

## Components

Every component passes the same nine-point gate: states (hover, active, focus-visible, disabled, loading, error), a 24px minimum target, 4.5:1 text in both themes, keyboard operation with a visible focus ring, the right accessibility role and nothing extra, motion under 400ms, colour never alone, active-voice copy, and a written-down "when not to use".

### Buttons
Compact, tactile, confident.
- **Shape:** 8px radius, 34px tall (32px pointer floor; 40px `lg`; 28px `sm`), Inter 600 at 13px, 7px gap to an icon that never deforms.
- **Primary:** Highlighter Lime fill with Lime Ink text at 700 weight, with a 1px lit top edge. Hover steps to Lime Press and adds the lime glow; active drops the glow for an inner shadow.
- **Secondary:** transparent, with a strong hairline border and ink text; hover lays the translucent hover tint and firms the border to `--tx-ink-off`, so it shows on a white page and on a card alike.
- **Ghost:** transparent and borderless in ink-2; hover fills with the quiet hover tint.
- **Danger:** solid danger fill with white text.
- **Press physics:** every button moves 1px and scales to 98.5% on `:active`; "felt, not watched". Loading replaces the label with a ring and holds the width; the button refuses a second press without greying to disabled.

### Chips
28px pill, hairline border on Paper Deep with ink-2 text. Pressed state is a solid Highlighter Lime fill with Lime Ink text, never a tint. The visual stays 28px; a `::before` hit-slop brings the target above the floor.

### Segment (filter pills)
30px pills with a hairline and ink-3 text. In toggle mode (`aria-pressed`, several can be on) a pressed pill takes a surface-3 fill, ink text **and a check mark**, because the fill alone was too close to rest to read as a state. In single-choice mode (`aria-checked`) the fill alone is enough. Never lime: a filter takes no action. Every filter row uses it, including the Clients status row (pick-one) and the Filter panel's groups: Today's day filters and the Schedule's *In Person · Online · Show gaps* (which were lime chips until 24 Nov 2026). A view switcher (Day · Week · Month) is not lime either: on desktop the chosen button takes the surface-3 fill, and on a phone the chosen segment is raised (canvas on paper, surface-3 on slate, with the ambient shadow).

**View links that act as filters** (Joining's *In progress · To invite · Joined · Declined*) take the same look as link chips (`.jn-views .chip`), and a sideways-scrolling row brings the chosen one into view on load. **The logging console spends its one lime on the next set.** On a desk that is the active row's tick (`tr[data-state="active"] .tk`); on a phone it is the dock's *Log set N · 25 kg × 9* bar, and the row tick stays outlined. *Take last time's numbers* is a secondary shortcut, the rest label is neutral (only the running timer keeps its accent edge), and *Finish the log* turns lime only once every planned set is in. On a desk with a fine pointer the cursor starts in the first open set, **selected**, and moves there again when another movement is picked; it never takes focus from anything else, and never on a phone. Every programmatic focus into a set field selects it. A run of sets is joined with `\u00a0· ` and each set is `.nowrap`, so lines break between sets, not inside one.

**A queue of things a trainer must act on is one row per client.** Today's attention queue and Business → *Needs you* both lead with the client's most urgent item, put the rest behind *+N more* with their kinds named, and open them in place as indented rows with their own verb (`useFlipRows`). Counts and headings count clients, not items.

**Two owners, two lists.** Where rows belong to two owners the trainer treats differently (their own packs and a gym's counter prices), the owner is the top level: a single-select segment with counts picks the list, and any further grouping (service) is a sub-heading inside it. One add button adds to the list on screen and its form shows the owner pre-answered. A card carries *Edit* and a ⋯ `RowMenu`; removing confirms inside the card, leading with a red *Delete it* when nothing was sold and *Retire it* when something was (`/business/packages`, 25 Nov 2026).

**A page's *yours* is about that page's subject.** On Gym share, *your share* is the other half of the gym's sales (sold minus the gym's cut), never the trainer's whole income, which is the Overview's figure. A split, such as the gym's cut, is never toned amber: tone is for something to act on. A printable statement that repeats figures shown in the tiles above it keeps them for print only (`.gstm__split`), and lays its facts out in two columns at a desk so a label sits near its figure. Rarely-changed set-up (pack-by-pack terms) comes after the money history, with a door to where it is edited (25 Nov 2026).

**A ranking table earns its width with the ranking.** *Who the income comes from* (Reports) is sorted by what reached the trainer and carries a neutral share bar: the percentage is the true share of the year, and the bar is scaled to the top row (`RankList`'s rule), so ten people can be told apart. Its spoken label is the name, not the bar's geometry. A tile with nothing to show says so in words (*Too early*, *Not yet*), never a bare dash. Counts of joins and archives are neutral ink: a join is not a lime win and an archive is a decision, not a red loss. Phone reflows key cells by class, never `nth-child`, because a column added later shifts every position (25 Nov 2026).

**A payment method is a card led by its mark.** Payment setup lists *Ways clients pay you* one card a method: the rail's mark (`c-brandmark`, always on a white tile in both themes), its name, one line on what it does, and its state as a tag on the same row (*On*, *Not set up*, *Coming soon*). A tool that belongs to a method lives inside its card (the gym till is UPI's), and a rule about payments sits apart under *Rules*. A method not built yet shows its steps and a disabled connect button, never a paragraph alone. **One payment code on screen at a time:** UPI's ₹1 test code shows by itself only for a new or changed ID; a saved ID keeps it behind *Test with ₹1*, and typing an amount for the gym till closes it. Nothing records that a test was done, so the screen never says *verified*. The marks are stand-ins until the official NPCI and Razorpay artwork replaces the SVG bodies (25 Nov 2026).

**The day strip is neutral, and on a client's plan it is their real week.** `.shape` cells are ink on the off cell, never lime, wherever they appear (program list, template shelf, builder): a lit day is a fact, and a list of lime strips buries the one lime action. On `/programs` the strip draws the client's actual weekdays (Mon…Sun, column *Week*); a template's slots stay ordinal (*Shape*). Templates have no strip at all (their slots are ordinal, so it only repeated *Days*), and a template's second line shows its day names only when a day is named, never *Day 1 · Day 2 · Day 3*. A grid of cards never carries a lime button per card: the catalogue's *Copy* is secondary and *Preview* ghost, so the page's one primary stays *New template*. A row's last column is the same control on every row: a ⋯ `RowMenu`, which leaves out an item it cannot offer rather than swapping to a different control (25 Nov 2026).

**The builder (25 Nov 2026), found by building a program from scratch.**
- *Set values carry forward.* Typing into set *n* fills the later sets that still held its old value and stops at the first that differs, so *3 × 10 @ 40* is typed once and a pyramid survives (`carryForward` in `lib/workouts/draft.ts`). Notes are scoped by their own dialog and do not carry.
- *A load is per set all the way through.* The flat row's set detail carries an optional `load`, so a back-off (32 / 27.5 / 27.5) survives saving onto a program day and reopening; the board prints `@ 32 / 27.5 / 27.5 kg` instead of set 1's load as the row's.
- *A shut exercise card shows its prescription* (`3 × 8 · 30 kg · 1m 30s rest`) in place of the library line, at every width.
- *Library search is re-ranked for trainers:* names that end with the typed phrase (the movement is the last word), then gym-floor kit, then the plainer name. One helper (`lib/exercises/rank.ts`) serves the builder and `/programs/exercises`, so the two searches cannot disagree.
- *The next thing to press is the strongest thing on the board:* an empty training day's *Create workout* is a real button; a rest day's *Make it a workout* is ghost. On a phone, an empty day reads *+ Create workout*, not *Name this day · 0 ex*.
- *No lime on states:* View, Week, Day and Detail chips, the phone's week chips, the New template dialog's goal and day count, and the per-day volume bars are neutral. Labels are sentence case (*Day 1*, *Week*, *Sets per muscle group*).
- *The balance panel tells the truth:* push : pull folds patterns case-blind (it always read 0 : 0), and an exercise with no load is *with no load*, never *bodyweight*.

**A client's plan opens where the client is.** A running plan's board opens on the client's current week (the rail's `weekOf`, clamped), not week 1. Day cards fill their grid track (cap 640px, not 440, which left a gutter beside every card). A control that names a comparison (*Matches the plan*, *Tuned · 3 changes*) is drawn only when there is a template to compare with. On a phone the subtitle keeps *for {first name}*, the one place the screen says whose plan it is (25 Nov 2026).

**A row that lights on hover opens on a click anywhere.** Where a list row's one link is its name (Workouts' sessions), the link is stretched over the row and the action cell passes clicks through to it except on its own button, so the hover never promises a target that isn't there. The date band (`c-dayrule`) is sentence case (*Sat · 21 Nov*) and its relative day (*Today*, *4 days ago*) is ink, never lime (25 Nov 2026).

**A category opens onto its exercises.** On `/programs/exercises` a body part lists at once, with its muscles as pills over the list (*All muscles* first); it no longer opens onto a page of muscle tiles that listed nothing, whose own *All muscles* pill jumped back to the tiles. A selected table row paints its row-header cell (`th`) as well as its `td`s (25 Nov 2026).

**A picked answer is a state, never lime — in the design system itself.** `.chip[aria-pressed="true"]` (webapp.css) is a raised fill with an ink edge and ink text, and `.card--pick-accent` an ink-edged raised card; a ranked chip's badge is an ink plate. Before this, every picker (profile certifications, specialities, languages, *Work & hours*, the setup flow, the builder's strip) lit its answers lime, up to eight lime marks on one screen against its one lime action. Lime stays for `.btn--primary` and the page's one highlight (25 Nov 2026).

**A status tag is not a control.** In a `c-fold` head, `control` is for a real control (a switch) and sits after the chevron; a status (*Yours*, *Unsaved*) rides beside the title, so every chevron in a list stays on one edge (Settings → Nudge messages, 25 Nov 2026).

**Text sent as WhatsApp is written in WhatsApp's syntax.** The nudge editor is `c-markupfield` with `dialect="whatsapp"`: **B · I · S · H · emoji**, stored as `*bold*` / `_italic_` / `~strike~`, with a heading written as a whole bold line (WhatsApp has no underline and no heading, so S takes U's place and H is the line in bold), so the message arrives formatted; the app's own `**bold**` would arrive as asterisks. Markers only count at a word boundary, as in WhatsApp, so `{pay_by_upi}` and `meera_k@okaxis` stay plain (`lib/text/whatsapp.ts`). The preview renders through `Markup dialect="whatsapp"`; token chips insert at the caret through the field's `apiRef` (25 Nov 2026).

**A fold opens and closes, it never blinks.** `c-fold` keeps its body mounted for a ~220ms closing phase and grows it in on opening: a `grid-template-rows` transition between `minmax(0,0fr)` and `minmax(0,1fr)` with a fade (`@starting-style` for the entrance), clipped only while moving so popups inside are never cut, `inert` while closing, and still unmounted when shut. Reduced motion skips it (25 Nov 2026).

**One word, one meaning: *next*.** On the client's Home, *Next* is the next BOOKED session (the hero card). The week list therefore never says *Up next* for an unbooked plan day; it says *Next in your plan · not booked*, and other unbooked days *Not booked yet*, so the page cannot name two different workouts as next. Plan (`/me/plan`) uses the same wording, and its block meter is the data tone, not lime. A workout's preview (`/me/workout/:id`) is a day of the plan: it lights *Plan* and opens with a *Plan / {workout}* crumb. A standalone text link (alone in its line, or the card's only way onward) gets a hit area of ~25px through an `::after` on the link itself, without adding line height (25 Nov 2026).

**Weekly bars fill their plot, and count axes count.** `c-vbars` spaces its capped (96px) bars around the plot width, with the label row on the same spacing, so a short series fills the chart instead of crowding its left half; bar figures are upright. A whole-number series with a small odd peak gets a box one taller (3 → 4) so its half-way tick is a whole number, never *1.5 sessions*. On the client's Assessments, a check-in already waiting under *To do* is not offered again under *Start a new one* — one door per check-in (25 Nov 2026).

**A disabled primary is neutral.** `.btn--primary[disabled]` is a raised neutral fill with ink-3 text at full opacity — never the lime at 50%, which reads as a broken olive. The sign-in screen's kicker and foot line are sentence case in ink (no mono capitals, no lime text), the fixed *+91* affix has no chevron (it is not a picker), and the subtitle says the page is for new and returning numbers alike. On a phone the card stays a card — border, all four corners, a 16px gutter each side — rather than a full-bleed sheet, by the owner's call (25 Nov 2026).

**Trainer routes check who is asking, once.** `app/(main)/layout.tsx` reads the session before any trainer data: no session → sign-in, an unfinished signup → `/sign-in/new`, a client → `TrainerOnly` (*This page is for trainers*, with *Go to your home* and *Sign out*), anything else → sign-in. A page must never depend on the backend's refusal to keep a client out — that refusal became a 500 on `/settings/nudges` (25 Nov 2026).

**A progress report shows every part of the client that changed, each with its proof (26 Nov 2026).** `/clients/:id/report` opens with *At a glance*: one line per part that moved (turning up, strength, body, fitness test, how they feel), each the top row of its own card below. A part with nothing to show is left out, never drawn as a dash. The body and fitness tests come from the client's returned assessments, with vitals and visceral fat left out. The client's own 1–10 ratings are on the trainer's screen only, tagged *Only you see this*. A personal best is named on its lift's row (*personal best 15 Nov*); it is not a second list. Changes stay uncoloured.

**On a phone, a table with many number columns becomes one block per row (26 Nov 2026).** The report's *Every movement trained* has seven columns and scrolled sideways at 390, cutting off *Top set* and *Change*. Under 620px each row is the name on its own line, then the figures in a 3-column grid, each under its column name (`label` → `data-l`), left-aligned (`.rptcensus`). Use a grid rather than one label/value line per figure, which would make each row six lines tall.

**A row menu is measured, never estimated, and stays attached to its trigger.** A fixed-position menu is placed from the trigger's edges and the panel's real height, taken before paint: below if it fits, directly above if not, pinned to the gutter otherwise. Placing it from a height constant flipped a short menu above and left it hanging ~170px off its row on a phone (`PaymentRowMenu`, 25 Nov 2026). On a phone a table row drawn as a grid card is hovered or open as one row: the fill goes on the `tr` and the cells stay clear, or the hover shows as scattered blocks.

**Adding and removing a movement mid-session.** The Add panel asks *Where does it go?* before the pick, as Swap asks how far a swap reaches: **Today only** (default) or **Today and the plan** (disabled, with the reason, when the session is not from the client's program); each added row says *Added* or *Added · on the plan*. Every exercise card's menu ends with **Remove from today** (danger), which hides the movement from today's log only — its sets stay and leave the totals — and offers **Undo** for ten seconds.

**The finish page leads with its one decision.** Figures, then a neutral *Close out {name}'s session* card (the pack fact, *Mark the session done* in lime and *They didn't train*, one line of help), then *Not logged* as a list. Closing out is the ordinary end of every session, so it is never an amber warning. The WhatsApp message is shown with its *Open WhatsApp* button; no switch stands in front of it. Same grid as the session page; figures 2 × 2 on a phone.

**A session page has one shape in every state** (upcoming, done, no-show, unmarked): the main column takes the width and the rail is capped at 400px. Lime goes on the header's *Log this session* only while the session is still to come; an unmarked session's lime is *They came · Done* in its alarm, beside *No-show · −1*; a done or no-show session has no lime verb. A session with nothing logged shows its plan once as the plan table, never as a stack of "Not logged" cards.

**A form sheet has one lime mark: its submit.** Choices inside it (delivery, length, billing chips) take the neutral pick; a chosen day or time in `SlotPicker` is an **ink plate** (ink fill, canvas text), the same answer `SubTabs` gives to "strongly selected, not an action"; a day with nothing open dims its date. Panel headers are `min-height`, so a wrapped subtitle grows the header rather than pushing the title out of it. A panel or dialog focused on open (`tabindex=-1`) draws no ring round itself.

**A setting that blocks something is a `NoticeBar`** with its one verb as a button, not amber text: amber means a problem.

**An applied filter is a removable token,** a neutral chip with an × and an accessible name that says it removes the filter, never a pressed or lime chip. **Never restyle a shared chip inline** (`style={{ background: … }}`): seven Clients chips did, which is how a lime wash outlived the rule against it.

**Legends name every colour on screen.** A calendar key lists only what the grid is currently drawing (*Free gap* with the gaps toggle, *Not marked* while a past unmarked session is visible), and no colour is drawn that the key cannot name.

### Lists of repeated answers
When every row of a list carries the same verb (the close-out list's *Done*), the verb is a secondary button, with an icon if it is the expected answer. Lime on every row would make the list louder than the one primary action on the screen.

### Tags
A 20px read-only label with a 4px radius and a 700 11px caption. Neutral by default; tone variants (ok, warn, danger, info, accent, floor, remote, record) are a soft tint with the tone as text. Never clickable, with one named exception: `tag--link` (Has a note), which holds its tone on hover.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Paper on light (the page is white and a card is a step deeper), Slate Surface on dark.
- **Shadow Strategy:** ambient only at rest; raisable cards lift on hover.
- **Border:** 1px hairline.
- **Internal Padding:** 16px (13px on phones), a header band of 14px with a bottom hairline.
- **Variants:** `card--lead` for the one hero, `card--acc` (lime wash), `card--danger`.
- **Stat tile:** 12px radius, a sentence-case Inter key (12.5px, ink-3), a tabular 27px Archivo figure in ink and a meta line. Only `warn` and `danger` colour the figure; `acc` leaves it ink, because a lime figure reads as a status. A value that is words, not a number (*Nothing due*), is detected by `Stat` and set as a 17px Inter answer in ink-2, not a 27px figure: on a phone the figure size wrapped it to two huge lines.

### Inputs / Fields
- **Style:** 34px, 8px radius, a hairline border on a field fill with a faint inset shadow; the label sits above, always visible (12.5px 600 in ink-2), hint and error beneath (12px).
- **Focus:** the border goes to the focus colour and a 3px halo rings the field; the fill lifts one step so it visibly opens. State rules touch `background-color`, never the shorthand, or a select loses its chevron.
- **Affix:** units such as ₹ live outside the input in a shared chrome with a flat inner control.
- **Error:** text under the field in danger, in words that say how to fix it; never in a toast. A bare field with `aria-invalid="true"` draws the same danger border and halo as one inside `.fld--err`.
- **Disabled:** 55% opacity on a surface-2 fill, no inset, a not-allowed cursor, and no hover change.
- **Boundary:** a second token carries the 3:1 boundary WCAG 1.4.11 asks of a field with no other edge; its first call-site is the workout console's entry grid.

### Navigation
- **Rail:** 248px, five destinations, 40px rows at 13.5px 500. The current item is a Lime Wash ground, Dark Lime label and a 2px lime bar; a filled lime row is refused because it would put 14px text on lime. Collapsed, the mark survives and a count becomes a dot.
- **Section pane:** 212px, derived from the route, never from a click.
- **Tab bar (under 900px):** Today, Schedule, a raised centre **+**, Clients, More. The centre plus is not a fifth tab and never takes the selected state.
- **Menus:** 5px padding, 32px items, an 8px radius and the floating shadow; destructive items are danger.
- **Tabs above a page** are views of that page, links in a strip.

### Meters, charts and timelines
- **Meter:** 6px (9px `lg`) pill on a surface-3 track. Tones: `acc` (lime, a single progress bar or the one highlighted row), `data` (neutral, the rest of a ranked list), and `ok`, `warn`, `danger`, `dim`. On paper a lime fill carries a 1px dark-lime inner ring, since lime has no edge against the track.
- **Rank list** (`ui/RankList.tsx`, `.rank`): a ranking on one 44px line a row (name ≤220px · bar · figure), the bar scaled to the largest row; the first is the lime bar, the rest `--tx-ink-off`. Under 620px the bar drops beneath the name and figure. Use it instead of a key-value row with a meter under it.
- **Chart geometry** (`.chart`): no frame of its own (it always sits in a card). Each bar is centred in its month slot inside the gridlines' 12px inset and capped (56px on a six-month chart, 40px on the reports' charts), and its label shares that centre; anything printed per month under a chart (the reports' gained/archived row) uses the same columns. Figures over the bars are 10.5px mono, upright.
- **Chart bars** (`.chart__b`): neutral by default (`--tx-ink-off` on slate, `--tx-line-strong` on paper, where taupe columns were the heaviest blocks on the page; the printed figure carries the value); `.chart__b--now` is the lime month in progress, ringed on paper like the meter.
- **Timeline** (`.tl`): a `--tx-line-strong` spine and 9px `--tx-ink-off` dots ringed in the ground they sit on (canvas, or surface inside a card); the date mark is 12px Inter, tabular.
- **Section count** (`.slab__n`): a 20px neutral chip (surface-3, ink-2), the same shape as a tab count. Never lime.

### Callouts (`.why`)
A 2px accent left border on a soft ground with a short bold head in accent text. It appears at the point of doubt, never on a help page; warn and danger variants use the same shape. This is the system's one deliberate side-border, and it is a callout, not a card or a row.

### Overlays
Panels slide from the right at 420px; modals pop from 96%; the command palette (⌘K) drops from the top. **Under 900px a form modal is a bottom sheet** (`<Modal sheet>`, `.modal--sheet`): full width, 18px top corners, the sheet shadow, the body scrolls and the foot clears the home indicator, rising on a 320ms transition from `@starting-style`. A dialog whose scrim covers the frame sits on the screen's floor over the tab bar; one that covers `main` sits on `main`'s. A short confirm stays a centred question. Used by every form and document dialog: Schedule an assessment, Invite, Take a payment / Settle, Refund, Correct a payment, Confirm a payment, the portal's *I paid*, the template editor and the invoice. **Every dialog animates out** (`ModalHost` plays a copy of itself out on unmount, so Escape, the scrim, Cancel and a parent's own close all get it): a sheet slides back down over 240ms on the exit curve, a centred dialog fades and settles to 97% over 180ms, and the scrim fades. Nothing plays under reduced motion. All are glass over a scrim. A panel is deliberately paired with the table it acts on staying visible behind it, because a payment is decided while looking at the payments.

### Motion
Seven `tx-*` keyframes and nothing else; anything further is a transition. 120/180/240/320ms with one entrance curve (`cubic-bezier(.2,.8,.2,1)`), one exit curve and an overshoot curve reserved for knob-sized state changes (switch, check, radio). The toast deck alone uses a sampled real spring over 520ms. Entrances use a transition plus `@starting-style`. **Rows that open and close in a table** (Today's *+N more*, *Show N more clients*) use `useFlipRows` (`lib/ui/flip-rows.ts`): a row cannot animate its height, so the rows that stay slide from their old position to their new one (240ms, entrance curve), arriving rows fade and drop 6px in with a 35ms stagger, and leaving rows fade out over 140ms on the exit curve before the change applies (never later than 260ms, so a paused clock cannot stop a disclosure closing). Mark each row `data-flip="<stable key>"`. Transform and opacity only; nothing moves under reduced motion. Everything collapses under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** use Highlighter Lime (#C6F24E) as a fill with Lime Ink knocked out of it; on light, step every stroke and every word to Dark Lime (#4F6B0A).
- **Do** answer a write on the row it changed; a toast is the last resort, for a confirm whose row is off-screen.
- **Do** keep controls at 34px on a desk and meet the 24px target floor with `::before` slop, not by inflating the visual.
- **Do** make every changing figure tabular and every theme measured at 4.5:1 after the material behind the text.
- **Do** state the consequence before the button that causes it, in the trainer's words (*₹2,400 pending*, *Pack ends in 3 sessions*), in active voice.
- **Do** build the dense case first: a table row has real data, 44px, and truncates with an ellipsis.
- **Do** add any missing component to `web-components/` first; only design-system components appear at a call-site.

### Don't:
- **Don't** use lime as a border, a stroke, or text on a light ground.
- **Don't** build the generic fitness-app look: no gradient hero cards, glowing lime everywhere, streak flames or rings.
- **Don't** build enterprise SaaS grey: no anonymous blue-grey cards, no default 8px-radius-and-shadow dashboard.
- **Don't** build consumer wellness pastel: no soft, airy, oversized-radius surfaces.
- **Don't** put glass on content: tables, cards, stat tiles, money and the rail stay flat and opaque.
- **Don't** show red on a valid state; red is for errors only.
- **Don't** give a body measurement a tone: no green, no red, no arrow, no rate.
- **Don't** hide load-bearing text in a tooltip, or add a container to a plain value.
- **Don't** animate `backdrop-filter`, add an eighth keyframe, or use a `background` shorthand in a state rule.
- **Don't** set layout from an inline `style` attribute.
- **Don't** build offline chrome on the web: no sync pill, offline banner or sync queue.

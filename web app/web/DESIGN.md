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
  paper: "#F7F6F2"
  paper-deep: "#F1EFE9"
  paper-deepest: "#E9E5DD"
  paper-rule: "#E2DDD5"
  paper-rule-strong: "#CDC7BC"
  paper-ink: "#171512"
  paper-ink-2: "#59544A"
  paper-ink-3: "#676156"
  slate-rail: "#060709"
  slate-canvas: "#08090B"
  slate-surface: "#101216"
  slate-surface-2: "#171A20"
  slate-surface-3: "#1F232B"
  slate-rule: "#1E222A"
  slate-rule-strong: "#2A2F39"
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
  eyebrow:
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
- **Highlighter Lime** (#C6F24E): the fill for the primary action, the pressed chip, the current-rail bar and the meter. The same value in both themes. Press state is **Lime Press** (#B2DE3A). Anything laid on it is **Lime Ink** (#0A0B0D, 15.2:1).
- **Dark Lime** (#4F6B0A): the *stroke and text* form of the accent on paper. Used for the current rail label, accent tags, accent figures and the focus ring on light. On slate the accent text is the lime itself.
- **Wordmark Dark Lime** (#64850A): the *You* in the wordmark on paper. Same hue and saturation as the lime at lower lightness; one colour lit two ways, not two colours.
- **Lime Wash** (#EDF6D6) and **Lime Wash Line** (#CFE39A): the soft ground and edge for accent tags and the selected row on paper. On slate the equivalents are the lime at 12% and 34% alpha.

### Neutral
- **Paper White** (#FFFFFF): the content plane on light; the only white thing on screen.
- **Paper** (#F7F6F2): cards, the section pane and the top bar on light.
- **Paper Deep** (#F1EFE9): the rail, a card's own header, quiet fills.
- **Paper Deepest** (#E9E5DD): tags, meter tracks and the deepest surface step.
- **Paper Rule** (#E2DDD5) and **Paper Rule Strong** (#CDC7BC): hairlines and control borders.
- **Paper Ink** (#171512), **Paper Ink 2** (#59544A), **Paper Ink 3** (#676156): body, secondary and quiet text, all warmed onto the ground's hue (7.5:1 and 6.1:1 on the surface for the last two).
- **Slate Canvas** (#08090B), **Slate Rail** (#060709, one step below the canvas), **Slate Surface** (#101216), **Slate Surface 2** (#171A20), **Slate Surface 3** (#1F232B): the dark ramp.
- **Slate Rule** (#1E222A) and **Slate Rule Strong** (#2A2F39): dark hairlines.
- **Slate Ink** (#F2F4F6), **Slate Ink 2** (#A2A9B4), **Slate Ink 3** (#8B939F): dark-theme text.

### Semantic and domain
- **OK** (#0E7034 on paper, #3DDC84 on slate), **Warn** (#8F5100 / #FFB020), **Danger** (#C0281E / #FF5A5A), **Info** (#1B5FA8 / #6FB6FF): each paired with a soft tint for tags and callouts. Red means an error and nothing else.
- **Floor** (#1B5FA8 / #9FD3FF) and **Remote** (#6B3FC4 / #C9A8FF): the delivery-mode axis, the colour split the schedule is built on. **Record** (#8A6000 / #FFC861): personal bests.
- Avatars use twelve fixed mid-tones, each clearing 5.9:1 under white initials.

### Named Rules
**The Fill-Not-Stroke Rule.** `#C6F24E` is 1.17:1 on a light surface and 1.3:1 on white. It is a field with ink knocked out of it, never a border and never text on light. This rule has caused four real bugs in this project; on light, every stroke and every word steps to Dark Lime.

**The Ground-And-Ink Rule.** Warm paper is paired only with warm ink, slate only with cool ink. Mixing tints makes both read as flat grey.

**The No-New-Colour Rule.** The library prints `New colours: 0` on purpose. A screen that needs a colour the system does not have adds it to the system first.

**The Meaning-Is-Words Rule.** Tone is never the only carrier: a tag says *Pending*, not just amber. A body measurement carries no tone at all.

## Typography

**Display Font:** Archivo (Inter fallback), 800, for page titles and figures.
**Body Font:** Inter (SF Pro Text, system fallbacks), 400 to 700, for all interface text.
**Label/Mono Font:** JetBrains Mono, for eyebrows, `.stat` keys and number entry.

**Character:** Archivo's heavy, tightly tracked display sets the headline numbers apart the way a scoreboard does; Inter carries everything a trainer reads at a glance. Mono is a labelling voice, not decoration. The wordmark itself is Inter 800 at −0.038em, not Archivo.

### Hierarchy
- **Figure** (Archivo 800, 44px, 1.0, −0.04em, tabular): the one number a hero card exists to state.
- **Figure Small** (Archivo 800, 30px, 1.05): a stat tile's value.
- **Display** (Archivo 800, 22px, −0.025em): page titles in `.ph`.
- **Headline** (Inter 700, 17px, 1.3): section headings.
- **Title** (Inter 600, 15px, 1.35): a person's name, a card title (14px 700 in card headers).
- **Body** (Inter 400, 13.5px, 1.5): everything else; prose is capped at 72ch.
- **Label** (Inter 600, 12.5px): field labels, buttons and menu items.
- **Meta / Micro** (Inter 12.25px and 11px): secondary lines and tags.
- **Eyebrow** (JetBrains Mono 500, 10.5px, +0.11em, uppercase): stat keys and `why` heads.

### Named Rules
**The Tabular Rule.** Every figure that can change is tabular; a running clock whose digits change width makes the card twitch once a second.

**The Tracking Rule.** Large display type takes negative tracking, micro type positive. The scale has six steps and no seventh.

**The 16px Rule.** Form controls go to 16px under 900px width so iOS does not zoom.

## Layout

An application shell, not a page. Under it: a rail (248px expanded, 64px icon-only) with up to five destinations, an optional 212px section pane for the three sections that have pages (Clients, Fitness, Business), a 56px top bar (46px under 900px), and a scrolling `.body` between them. Nothing in the shell is `position:fixed`; it is a grid of `100dvh` with `overflow:hidden`.

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
- **Secondary:** transparent, with a strong hairline border and ink text; hover fills with the surface step.
- **Ghost:** transparent and borderless in ink-2; hover fills with the quiet hover tint.
- **Danger:** solid danger fill with white text.
- **Press physics:** every button moves 1px and scales to 98.5% on `:active`; "felt, not watched". Loading replaces the label with a ring and holds the width; the button refuses a second press without greying to disabled.

### Chips
28px pill, hairline border on Paper Deep with ink-2 text. Pressed state is a solid Highlighter Lime fill with Lime Ink text, never a tint. The visual stays 28px; a `::before` hit-slop brings the target above the floor.

### Tags
A 20px read-only label with a 4px radius and a 700 11px caption. Neutral by default; tone variants (ok, warn, danger, info, accent, floor, remote, record) are a soft tint with the tone as text. Never clickable, with one named exception: `tag--link` (Has a note), which holds its tone on hover.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Paper on light (the page is white and a card is a step deeper), Slate Surface on dark.
- **Shadow Strategy:** ambient only at rest; raisable cards lift on hover.
- **Border:** 1px hairline.
- **Internal Padding:** 16px (13px on phones), a header band of 14px with a bottom hairline.
- **Variants:** `card--lead` for the one hero, `card--acc` (lime wash), `card--danger`.
- **Stat tile:** 12px radius, a mono uppercase key, a tabular 27px Archivo figure and a meta line. A linked tile resets its figure to ink so a lime figure is never mistaken for a status.

### Inputs / Fields
- **Style:** 34px, 8px radius, a hairline border on a field fill with a faint inset shadow; the label sits above, always visible (12.5px 600 in ink-2), hint and error beneath (12px).
- **Focus:** the border goes to the focus colour and a 3px halo rings the field; the fill lifts one step so it visibly opens. State rules touch `background-color`, never the shorthand, or a select loses its chevron.
- **Affix:** units such as ₹ live outside the input in a shared chrome with a flat inner control.
- **Error:** text under the field in danger, in words that say how to fix it; never in a toast.
- **Boundary:** a second token carries the 3:1 boundary WCAG 1.4.11 asks of a field with no other edge; its first call-site is the workout console's entry grid.

### Navigation
- **Rail:** 248px, five destinations, 40px rows at 13.5px 500. The current item is a Lime Wash ground, Dark Lime label and a 2px lime bar; a filled lime row is refused because it would put 14px text on lime. Collapsed, the mark survives and a count becomes a dot.
- **Section pane:** 212px, derived from the route, never from a click.
- **Tab bar (under 900px):** Today, Schedule, a raised centre **+**, Clients, More. The centre plus is not a fifth tab and never takes the selected state.
- **Menus:** 5px padding, 32px items, an 8px radius and the floating shadow; destructive items are danger.
- **Tabs above a page** are views of that page, links in a strip.

### Callouts (`.why`)
A 2px accent left border on a soft ground with a mono eyebrow. It appears at the point of doubt, never on a help page; warn and danger variants use the same shape. This is the system's one deliberate side-border, and it is a callout, not a card or a row.

### Overlays
Panels slide from the right at 420px; modals pop from 96%; the command palette (⌘K) drops from the top. All are glass over a scrim. A panel is deliberately paired with the table it acts on staying visible behind it, because a payment is decided while looking at the payments.

### Motion
Seven `tx-*` keyframes and nothing else; anything further is a transition. 120/180/240/320ms with one entrance curve (`cubic-bezier(.2,.8,.2,1)`), one exit curve and an overshoot curve reserved for knob-sized state changes (switch, check, radio). The toast deck alone uses a sampled real spring over 520ms. Entrances use a transition plus `@starting-style`. Everything collapses under `prefers-reduced-motion`.

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

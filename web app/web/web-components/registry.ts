/**
 * The catalogue — every component the web app is made of.
 *
 * Lifted from webapp-components.html rather than retyped, so the ids, the names
 * and the seven groups are the design file's own. That matters for one reason:
 * every existing comment in this codebase that cites a component cites THAT
 * page's anchor, and a library with its own private ids would be a third naming
 * scheme nobody asked for.
 *
 * `impl` is the honest part. It records whether a component is a real shared
 * module both halves import, or still only a CSS class the application writes as
 * raw markup — which is exactly the list of work between here and "edit the
 * component, the app changes".
 *
 *   'component'  a file in ui/. The library renders the SAME import the app does.
 *   'css'        a class in §04. The library mirrors the markup; styling syncs,
 *                structure does not. These are the ones still to extract.
 *
 * ── TWO ENTRIES ARE NOT THE DESIGN FILE'S ───────────────────────────────────
 *
 * `c-balancestrip` and `c-programrow` were built in the program builder and
 * have no anchor in `webapp-components.html`. They are here because the
 * alternative is worse: a pattern that answers a general question and lives at
 * exactly one call-site is a pattern the next screen solves again, differently,
 * and the catalogue is what stops that. Their ids follow the same `c-` scheme
 * so a future design-file anchor can adopt them unchanged.
 *
 * Both were registered `css` first and extracted to `ui/` after, which is the
 * order that keeps the label honest: the catalogue recorded what they were,
 * and only then did the work that changed it.
 */

/** One of the design file's seven groups, in its order. */
export type Group =
  | 'ACTIONS'
  | 'FORMS'
  | 'STATUS & IDENTITY'
  | 'DATA'
  | 'CONTAINERS'
  | 'NAVIGATION'
  | 'DOMAIN';

export type Impl = 'component' | 'css';

export type Entry = {
  /** The design file's anchor, e.g. `c-button`. The library's route segment too. */
  id: string;
  name: string;
  group: Group;
  /** Which webapp-c-*.html page documents it, for cross-reference. */
  page: string;
  /** The one-line definition from the library index. */
  desc: string;
  /** `NEW` / `BETA` as the design file marks them. */
  badge: string | null;
  impl: Impl;
  /**
   * The CSS class this component is drawn by, without its dot.
   *
   * Present only where it differs from the id's own stem — `c-button` is drawn
   * by `.btn`, `c-table` by `.tbl` — which is 35 of the 58 entries, so the stem
   * is a guess that is wrong more often than it is right. Anything reading a
   * class from the catalogue takes `cls ?? id.replace(/^c-/, '')`.
   *
   * It is here rather than derived because there is nowhere to derive it FROM:
   * the fact lives in the component's own markup, and the only machine-readable
   * copy was the `Class` row each entry page happens to print. `/library/[id]`
   * needs it to say which breakpoints restyle a component, and a page that
   * cannot find a class reports that it could not rather than reporting that
   * the component is viewport-independent.
   */
  cls?: string;
  /**
   * The day this component ENTERED the catalogue, `YYYY-MM-DD`.
   *
   * Separate from `updated` and not inferred from `badge`, because `NEW` here
   * is historical: `c-herocard` has carried it since it was catalogued without
   * a design-file anchor, and reading that badge as "added today" labelled a
   * rewrite as a new component.
   */
  added?: string;
  /**
   * The day this component was last REWRITTEN, `YYYY-MM-DD`, and only that.
   *
   * Not a modified-time: a file's mtime moves when somebody fixes a typo in a
   * comment, and a catalogue that flags every one of those teaches people to
   * ignore the flag. This is set by hand when a component's markup, API or
   * measurements actually change, so `Upgraded` on a card means the specimen
   * above it is genuinely not what it was.
   *
   * Absent on everything that has never been through one, which is most of the
   * catalogue and is the honest default.
   */
  updated?: string;
};

export const ENTRIES: Entry[] = [
  { id: 'c-button', name: 'Button', group: 'ACTIONS', page: 'actions', badge: null, impl: 'component', desc: '' , cls: 'btn' },
  { id: 'c-iconbutton', name: 'Icon button', group: 'ACTIONS', page: 'actions', badge: null, impl: 'component', desc: '' , cls: 'btn--icon' },
  { id: 'c-btngroup', name: 'Button group', group: 'ACTIONS', page: 'actions', badge: null, impl: 'component', desc: '' },
  { id: 'c-link', name: 'Inline link', group: 'ACTIONS', page: 'actions', badge: null, impl: 'component', desc: '' },
  { id: 'c-field', name: 'Text field', group: 'FORMS', page: 'forms', badge: null, impl: 'component', desc: '' , cls: 'ctl' },
  { id: 'c-affix', name: 'Affixed field', group: 'FORMS', page: 'forms', badge: null, impl: 'component', desc: '' },
  { id: 'c-select', name: 'Select', group: 'FORMS', page: 'forms', badge: null, impl: 'component', desc: '' },
  /* NOT THE DESIGN FILE'S, like `c-balancestrip` and `c-programrow` above it.
     A searchable list with a two-line row was hand-written three times before
     it was a component — the palette, the schedule's client picker and the
     exercise library each carry their own `role="listbox"` — and the fourth
     copy is the one that forgets `aria-activedescendant`. Same `c-` scheme, so
     a future anchor can adopt it unchanged. */
  { id: 'c-searchselect', name: 'Searchable select', group: 'FORMS', page: 'forms', badge: 'NEW', impl: 'component',
    desc: 'A closed list too long, or too rich, to be a select: a search box and rows that carry a second line.' },
  { id: 'c-dropdown', name: 'Dropdown', group: 'FORMS', page: 'forms', badge: 'NEW', impl: 'component', desc: '' },
  { id: 'c-textarea', name: 'Textarea', group: 'FORMS', page: 'forms', badge: null, impl: 'component', desc: '' },
  /* THE TWO HALVES OF ONE FEATURE, and they are two entries because they are
     two components: one is a control a form places, the other is a run of text
     any screen displays, and the screens that do the second far outnumber the
     first. The pairing is the part to protect, so each docstring names the
     other and the format they share lives in neither — `lib/text/markup.ts`.
     Neither has an anchor in `webapp-components.html`: they were built for the
     workout builder's set note, which is the same road `c-balancestrip` and
     `c-programrow` came down, and the ids follow the same `c-` scheme so a
     future design-file anchor can adopt them unchanged. */
  { id: 'c-markupfield', name: 'Markup field', group: 'FORMS', page: 'forms', badge: 'NEW', impl: 'component',
    desc: 'A textarea with four marks and an emoji over a plain text column — a toolbar that is honest because the format and its reader exist.' , cls: 'mkpf' },
  { id: 'c-checkbox', name: 'Checkbox', group: 'FORMS', page: 'forms', badge: null, impl: 'component', desc: '' , cls: 'check' },
  /* `c-switch` is the TRACK and its ROW form (`Switch`, `SwitchRow`, `.switch`,
     `.swrow`), one family with parts rather than two entries — `AGENTS.md`'s
     rule, and they draw the same control in the same two states. The row form
     was added 23 Sep 2026 off a measurement on `/me/account/settings`: six
     switches, each a 46x30 target at the end of a 324px row whose label and
     example were inert, on the card that is the whole point of that tab. In the
     row form the button IS the row and the track is an `aria-hidden` span, so
     the accessible name is the text on screen rather than an `aria-label`
     repeating it.

     The state lives on the ROW there, which is the one thing to remember when
     touching either: `.switch[aria-checked="true"]` matches the element carrying
     the attribute, so the lit track has to be restated as
     `.swrow[aria-checked="true"] .switch`. Without it every row draws the OFF
     track with `aria-checked` perfectly correct — invisible to the
     accessibility tree and to every geometry probe, and caught only by looking
     at it. */
  { id: 'c-switch', name: 'Switch', group: 'FORMS', page: 'forms', badge: null, impl: 'component', desc: '' },
  /* Registered the day it was written. Checked against what draws a date first:
     `TimeField` is the same segmented box for a time of day and has no calendar and
     no year; `c-field` is a text field and would take a date as free text; and
     `<input type="date">` — what six screens used — is an OS control that ignores
     the theme and opens on today. A birth date is thirty years from today, so the
     calendar's title opens a year grid and then a month grid. Its first call-site
     is the Add client flow's date of birth (MUST-22). */
  { id: 'c-datefield', name: 'Date field', group: 'FORMS', page: 'forms', badge: 'NEW', impl: 'component',
    desc: 'A date you can type in three segments, and a calendar that gets to 1990 in two taps — a popover on a desk, a bottom sheet on a phone.', cls: 'dfld' },
  { id: 'c-search', name: 'Search field', group: 'FORMS', page: 'forms', badge: null, impl: 'component', desc: '' },
  { id: 'c-formgroup', name: 'Form group', group: 'FORMS', page: 'forms', badge: null, impl: 'component', desc: '' },
  /* THE TWO CONTROLS A QUESTION IS ANSWERED WITH, and neither has an anchor in
     `webapp-components.html` — the same road `c-markupfield` above came down.
     Written 23 Sep 2026 for the client's check-in, which is the first screen in
     this product where a question is the WHOLE screen rather than a field in a
     form. Both were checked against what already existed before they were
     registered, and the near misses are worth naming because both are close:

     `c-segment` in `single` mode is a radio group of pills and is the right
     control for five outcomes with a count on each. It is the wrong one for
     four sentences of 28 characters, which is what a trainer's question bank
     actually holds. `.lgl` + `.lrow` is the same PICTURE as the choice list —
     a column of bordered rows that select — and a different grammar: that one
     is `<button aria-pressed>`, a set of toggles behaving as a group, where a
     question with four answers is one tab stop and arrow keys.

     `c-meter` and `c-weekdots` were the near misses for the scale, and both
     fail the same way round: they DRAW a value somebody else decided. This one
     is a control, and the number it carries is the answer. */
  { id: 'c-choicelist', name: 'Choice list', group: 'FORMS', page: 'forms', badge: 'NEW', impl: 'component',
    added: '2026-09-23', cls: 'chl',
    desc: 'One question and its answers, each the width of the sentence it holds — radios where the choice is exclusive, boxes where it is not.' },
  { id: 'c-scale', name: 'Scale', group: 'FORMS', page: 'forms', badge: 'NEW', impl: 'component',
    added: '2026-09-23',
    desc: 'A point on a fixed range, drawn whole and answered with one tap — never a slider, because the answer is a label rather than an aim.' },
  /* NOT THE DESIGN FILE'S, like `c-programrow` and `c-balancestrip`. `.menu` and
     `.menu--row` were always in §33; the BEHAVIOUR was not — measure the
     trigger, flip when the room is above, close on Escape / an outside press /
     a scroll, roving arrows, restore focus — and it had been hand-written twice
     (`money/PaymentRowMenu.tsx`, `programs/WorkoutRowMenu.tsx`) before a third
     list wanted one. The two copies already disagreed about `resize`, which is
     the shape of the defect a third would add. Same `c-` scheme, so a future
     design-file anchor can adopt it unchanged. */
  { id: 'c-rowmenu', name: 'Row menu', group: 'ACTIONS', page: 'actions', badge: 'NEW', impl: 'component',
    added: '2026-09-17',
    desc: 'The overflow verbs at the end of a list row. Fixed to the viewport, so the last row’s menu is not clipped by the scroller it lives in.' , cls: 'menu--row' },
  { id: 'c-tag', name: 'Tag', group: 'STATUS & IDENTITY', page: 'status', badge: null, impl: 'component', desc: '' },
  { id: 'c-chip', name: 'Chip', group: 'STATUS & IDENTITY', page: 'status', badge: null, impl: 'component',
    updated: '2026-09-19',
    desc: 'A pressable pill: a filter, or a token. The token form may now carry a ×, which `.chip__x` had been styling for a form nothing rendered.' },
  { id: 'c-facet', name: 'Facet', group: 'ACTIONS', page: 'actions', badge: 'NEW', impl: 'component',
    added: '2026-09-19',
    desc: 'A filter that says what it is set to. A chip is on or off; this one names its axis, so a bar with nothing set still teaches what can be narrowed.' },
  { id: 'c-segment', name: 'Filter segment', group: 'ACTIONS', page: 'actions', badge: 'NEW', impl: 'component',
    added: '2026-09-15',
    desc: 'Pills that shape a list, in two grammars: toggles (aria-pressed, several on) and one-of-a-set (radiogroup, arrow keys). Deliberately NOT a Chip: its resting state is mostly-on, so it is the one control that must stay quiet when everything is selected.' },
  { id: 'c-avatar', name: 'Avatar', group: 'STATUS & IDENTITY', page: 'status', badge: null, impl: 'component', desc: '' , cls: 'av' },
  { id: 'c-avatar-stack', name: 'Avatar stack', group: 'STATUS & IDENTITY', page: 'status', badge: 'NEW', impl: 'component', desc: '' },
  { id: 'c-count', name: 'Count badge', group: 'STATUS & IDENTITY', page: 'status', badge: null, impl: 'component', desc: '' , cls: 'rail__n' },
  { id: 'c-meter', name: 'Meter', group: 'STATUS & IDENTITY', page: 'status', badge: null, impl: 'component', desc: '' },
  /* NOT THE DESIGN FILE'S, like `c-balancestrip` below it. It was `.crd-pk` in
     `app.css` — CSS-only, at exactly one call-site, the roster's phone card —
     while the DESK roster four hundred lines away drew the same fact as a bare
     `20/24`. That is the shape the catalogue exists to catch: one screen had
     solved it, one view of that same screen had not, and nothing connected
     them. Registered `component` from the start because the extraction and the
     second call-site were the same change. Near neighbour checked first:
     `c-meter` draws parts of a whole and needs a `label`; this draws ONE part
     and carries its own figure, so the figure is the name. */
  { id: 'c-packgauge', name: 'Pack gauge', group: 'STATUS & IDENTITY', page: 'status', badge: 'NEW', impl: 'component',
    desc: 'Sessions left over the pack they came from: a count, a short bar, and a tone that turns at two and at none.' , cls: 'pk' },
  { id: 'c-toast', name: 'Toast', group: 'STATUS & IDENTITY', page: 'status', badge: 'NEW', impl: 'component', desc: '' },
  { id: 'c-balancestrip', name: 'Balance strip', group: 'STATUS & IDENTITY', page: 'status', badge: 'NEW', impl: 'component',
    desc: 'A panel that will not fit, folded to one line: the week’s size, and whether anything is out of band.' , cls: 'wsbal__sum' },
  /* The fourth entry with no anchor in `webapp-components.html`, and the one
     whose absence cost the most: `.msg` is used twenty-nine times in §04 and
     had no component, so every screen copied its markup and one screen invented
     `.form-err` in app.css instead. A class that popular with no catalogue row
     is a gap the catalogue could not see. */
  { id: 'c-message', name: 'Inline message', group: 'STATUS & IDENTITY', page: 'status', badge: 'NEW', impl: 'component',
    desc: 'One line about the screen rather than about a field — what the submission did, not what a control refused.' , cls: 'msg' },
  /* The fifth with no anchor, and registered under the same condition as
     `c-message` one line up: a bar that existed twice in app.css as
     `.sch__moving` and `.sch__nohours`, with a third copy about to be written
     beside them for an empty schedule range. Checked against what existed
     first, because three near neighbours is why this needed an argument rather
     than a file: `Message` answers a SUBMISSION and lives inside a form,
     `Toast` is a receipt for an event that has finished, and `EmptyState`
     REPLACES a surface. This one belongs to a surface that still draws and
     states a condition of it — which is why an empty week gets this and not an
     empty state: the grid under it is still the fastest way to book. */
  { id: 'c-noticebar', name: 'Notice bar', group: 'STATUS & IDENTITY', page: 'status', badge: 'NEW', impl: 'component',
    updated: '2026-09-16',
    desc: 'A band above a surface that still draws, saying what is true of it — a mode the reader can leave, or a standing condition.' , cls: 'ntc' },
  { id: 'c-table', name: 'Data table', group: 'DATA', page: 'data', badge: null, impl: 'component', desc: '' , cls: 'tbl' },
  { id: 'c-listrow', name: 'List row', group: 'DATA', page: 'data', badge: null, impl: 'component', desc: '' , cls: 'lrow' },
  { id: 'c-orderrow', name: 'Order row', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    added: '2026-09-19', cls: 'orow',
    desc: 'A row in a list somebody arranged: a grip, the position it is in, the row, and its verbs. The position is a label and never a control.' },
  { id: 'c-stat', name: 'Stat tile', group: 'DATA', page: 'data', badge: null, impl: 'component', desc: '' },
  /* WRITTEN BECAUSE IT WAS ALREADY LIVE AT FIVE CALL-SITES AND HAD NO ENTRY.
     `.strip` is in `webapp.css` from the original design set and no component
     was ever made for it, so the roster, the client file's header, the session
     view, Top sets and the workout console each hand-wrote the markup — and
     two of them disagreed about the size of a denominator, in an inline style
     no stylesheet could reach. Checked against the three neighbours first, the
     order this file asks for: `c-stat` is one figure on its own ground and a
     row of them is four independent questions; `c-figures` is deliberately
     boxless and is what a page ENDS with; `c-kv` is a label and a value
     stacked, which is a list. This is the BOUNDED band saying four facts about
     one object, and the border is what makes it one statement. */
  { id: 'c-strip', name: 'Figure strip', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    added: '2026-09-21', cls: 'strip',
    desc: 'Three to five figures about one object, under one border with a hairline between them — and optionally the filter that narrows the list to the rows each one counts.' },
  { id: 'c-figures', name: 'Figure row', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    added: '2026-09-15',
    desc: 'Three numbers on one ruled line, with no boxes. Three equal cards in a row is the most generated dashboard layout there is, and these are three numbers.' },
  { id: 'c-kv', name: 'Key-value row', group: 'DATA', page: 'data', badge: null, impl: 'component', desc: '' },
  /* THE OTHER HALF OF `c-kv`, and it is a second entry because it is a second
     component. `.kv` is `flex-wrap:nowrap` with a fixed 80px key track and its
     key set in the body face at the value's own size — right for a settings
     list, where the label is the content and the value is a state. A stored
     RECORD reads the other way: *170 cm* is the content and *Height* is the
     index to it. The two were one class for a week and the 80px track was the
     tell — *Mobile number* wrapped to three lines inside it while
     `+91 98411 03288` had 200px of room.

     Registered on the day it was extracted, off a local `FactRow` in
     `PersonalTab.tsx` drawing a `.cffact` family — a component invented at a
     call-site under a screen's own prefix, which is exactly the half of the
     rule `check-components.mjs` cannot grep for. The rename to `.facts` is the
     other half of the extraction: a family named after the one screen that
     happens to have it first is a family the next screen writes again. */
  { id: 'c-factlist', name: 'Fact list', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    added: '2026-09-19',
    desc: 'A stored record read back, one line per field: the figure takes the weight and the right-hand edge, the label is what is allowed to wrap.' , cls: 'facts' },
  /* The fifth entry with no anchor in `webapp-components.html`, and it arrived
     the way `c-message` did: not from a gap somebody spotted, but from a screen
     that had been writing the markup for as long as the screen existed. The
     pre-flight's list was five `.kv` rows — a class whose job is a label left
     and a value right — carrying four inline style properties each to stop
     behaving like one. Registered here before the call-site was converted, so
     the catalogue records what it is rather than what it became. */
  { id: 'c-brief', name: 'Brief', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    desc: 'What a flow is about to ask, named before anything is asked — a contents page, with no state and no way in.' , cls: 'brf' },
  { id: 'c-programrow', name: 'Program row', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    desc: 'A blueprint as columns, with what it is made of on the name’s second line. A whole-row link, so not a table.' , cls: 'ptrow' },
  /* `c-programrow`'s sibling, and registered rather than written into the
     screen for that entry's reason: the sessions list asked the same question
     as the shelf — *which of these* — and was answering it with cards. What it
     could not borrow is the ELEMENT. A row carrying a checkbox and an overflow
     menu cannot be one anchor, so the name is the link and the row is a div. */
  { id: 'c-workoutrow', name: 'Workout row', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    desc: 'One session as columns: who, which day of which program, when, how long, and whether it happened. The name is the link; the day is `c-dayrule` above the run.' , cls: 'wkrow' },
  /* `c-workoutrow`'s sibling one rung up, and registered for the reason both of
     those were: the Templates tab was a `c-listrow` shelf sitting one keystroke
     from three tables with a select column, so switching tabs changed what kind
     of thing a list is. The two stamps are what the sentence could not carry. */
  { id: 'c-templaterow', name: 'Workout-template row', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    desc: 'One blueprint as columns: what is in it, how long it runs, and when it was written and last touched. Selectable; the name is the way in.' , cls: 'wtrow' },
  /* THE 51st, AND IT CAME OUT OF A COLUMN RATHER THAN A GAP. `c-workoutrow`
     carried a 108px Date track; measured on the seeded book, the Completed tab
     ran 361 rows across 52 days, so that column printed `Thu - 17 Sep` seven
     times, then `Wed - 16 Sep` eight, then `Mon - 14 Sep` nine. A column whose
     value is constant within a run holds exactly one piece of information —
     where the runs change — and that is a heading, not a cell.

     It is not `c-agenda`, which was the first thing checked. That draws the
     rest of ONE day as a ruled list and has no day in it at all, because the
     screen it serves has the date in its `<h1>`. This is the band between two
     days of many, and the two would compose rather than replace each other.

     No anchor in `webapp-components.html`: the design set draws every list
     inside a single day or short enough not to need cutting, so it never had
     to answer what the boundary between two of them looks like. Registered on
     `c-pager`'s precedent — the catalogue records the component. */
  { id: 'c-dayrule', name: 'Day rule', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    added: '2026-09-18',
    desc: 'The day a run of rows belongs to, ruled across a long list. Replaced a date column that printed the same string seven, eight and nine times running.' , cls: 'dayr' },
  /* Two entries the CLIENT PORTAL added, and neither has an anchor in
     `webapp-components.html` for the same reason `c-herocard` did not: the
     design set drew the portal as one frame and one frame does not need a
     catalogue. Both follow the `c-` scheme so a future anchor can adopt them.

     They were checked against what already existed before being added, which
     is the test this file exists to enforce: `.wkp` in app.css draws seven
     columns of the TRAINER's week, `.spark` draws 24px of bars, and `.vb`
     draws a column set. None of the three can draw one client's own week with
     four states, and none of them can draw a line at all. */
  { id: 'c-weekdots', name: 'Week dots', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    desc: 'One person’s seven days, and a count rather than a streak — a number that resets on Monday and cannot be lost.' , cls: 'wkd' },
  { id: 'c-trend', name: 'Trend chart', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    desc: 'Takes the raw readings and cannot draw them as a line: the series becomes a band, and the smoothed mean is the only stroke.' },
  /* `c-trend`'s opposite number, and added 20 Sep 2026 for the reason that
     component's own docstring gives: anything wanting more than a smoothed
     line wants a different argument. `.vb` was that argument, hand-written on
     two surfaces with no entry — so the axis and the per-bar readout the
     client file's Progress tab needed could only have been added to ONE of
     them. A class with a component belongs here from the day the component
     exists; this is that day. */
  { id: 'c-vbars', name: 'Volume bars', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    added: '2026-09-20',
    desc: 'A week of work per column, from zero — the one shape reserved for a figure that is a SUM. A labelled axis, and every bar readable.' , cls: 'vb' },
  /* THE ONE ENTRY THAT CAME BACK. `c-timeline` was in this list with
     `impl: 'component'` until 16 Sep 2026, when the purge deleted the thirteen
     components no screen imported and took `ui/Timeline.tsx` and its page with
     it. Deleting a module nothing uses is right. What it could not do is
     delete the PATTERN: `.tl` is drawn in `webapp-clients.html`, in
     `webapp-workout.html` and in §04, three screens hand-wrote it, and with no
     component to own the class `check-components` could not see any of them.

     What that cost is on the record. Two of the three copies were
     byte-identical, forty lines apart in `components/log/RecordCard.tsx`, and
     both carried the same inline `style` attribute putting the title in the
     mono face — a modifier nobody had written down, which is now
     `.tl__t--mono`. `.tl__a` is the other half of a rule app.css had already
     argued for and not implemented: the note over `.tl__l` said "the link is
     the row", and what shipped made the link the title.

     Registered `NEW` rather than restored silently, because the API is not the
     one that was deleted — an `items` array became parts. `updated` and not
     `added`, which is the split those two fields exist for: the catalogue has
     carried this id since it was written, and what happened on 19 Sep 2026 is
     a rewrite. The `<ol>` and the `<time datetime>` are the deleted version's
     and are kept; `ui/Timeline.tsx` says so in its own words.

     `page: 'data'` with no anchor at `#c-timeline`, as before — the family is
     documented in the SCREEN files rather than on a component page. */
  { id: 'c-timeline', name: 'Timeline', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    updated: '2026-09-19',
    desc: 'A spine, a dot per entry and three lines against it — a history where the rows are ordered but not evenly spaced. The row is the door, not the title.' , cls: 'tl' },
  { id: 'c-markup', name: 'Markup', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    desc: 'The only thing that reads the four markers `c-markupfield` writes — elements, never an HTML string, so nothing on the path needs sanitising.' , cls: 'mkp' },
  /* The sixth entry with no anchor in `webapp-components.html`, and it was
     checked against what already draws a month before it was added — which is
     the test this file exists to apply. `.mo` (the schedule's month) encodes
     UTILISATION: a bar per cell measuring booked minutes against the trainer's
     own working minutes, and an eighth column totalling the week. Every channel
     in it is about the trainer's capacity and none of them survives being
     pointed at one person — a client's Tuesday holds one session, and *11% of
     your hours* is arithmetic about somebody else's diary. `.wkd` draws one
     client's week and cannot draw a month. Neither can carry OUTCOMES, which
     is the whole of what this one is for. */
  { id: 'c-sessioncalendar', name: 'Session calendar', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    desc: 'One person’s month as outcomes rather than as capacity — a pill per session, toned by what happened to it, and a key that names the tones.' , cls: 'scal' },
  /* Registered the day the component was written, which is the order this
     file's header asks for. It was checked against what already exists first:
     `c-stat` draws one figure on its own ground and a row of them is a
     dashboard — four independent questions — where this is seven facts about
     ONE object whose first field is a name; `.strip` is the three-figure
     summary above a table and has no slot for an identity or a status tag;
     `c-kv` is a label left and a value right, stacked, which is a list and not
     a bar. The client file's Payments tab is its first call-site. */
  { id: 'c-subbar', name: 'Subscription bar', group: 'DATA', page: 'data', badge: 'NEW', impl: 'component',
    desc: 'One live agreement folded to a single line: what was bought, what state it is in, and the figures owed against it.' },
  /* ── FOUR ENTRIES FROM THE 15 SEP 2026 `/today` PASS ──────────────────────
     None has an anchor in `webapp-components.html`, the same standing as
     `c-balancestrip` and `c-programrow`: they answer general questions, they
     were about to live at exactly one call-site, and the catalogue is what
     stops the next screen solving them again differently. */
  { id: 'c-slab', name: 'Slab', group: 'CONTAINERS', page: 'containers', badge: 'NEW', impl: 'component',
    added: '2026-09-15',
    desc: 'A section grouped by a rule instead of a box. Four stacked cards say "four equal things"; a heading and a hairline can rank them.' },
  { id: 'c-card', name: 'Card', group: 'CONTAINERS', page: 'containers', badge: null, impl: 'component', desc: '' },
  { id: 'c-pageheader', name: 'Page header', group: 'CONTAINERS', page: 'containers', badge: null, impl: 'component', desc: '' , cls: 'ph' },
  { id: 'c-dock', name: 'Docked panel', group: 'CONTAINERS', page: 'containers', badge: 'NEW', impl: 'component',
    desc: 'A third grid track, not an overlay. It pushes the plane instead of covering the rows the numbers in it are set against.' },
  { id: 'c-modal', name: 'Modal', group: 'CONTAINERS', page: 'containers', badge: null, impl: 'component', desc: '' },
  { id: 'c-empty', name: 'Empty state', group: 'CONTAINERS', page: 'containers', badge: null, impl: 'component', desc: '' },
  /* ── THREE ENTRIES FROM THE 19 SEP 2026 ASSESSMENTS PASS ──────────────────
     Same standing as the four above: no anchor in `webapp-components.html`,
     each about to live at exactly one call-site, each answering a question the
     next screen would otherwise answer again differently. `c-fold` is the one
     worth naming here — `.disc` already folds, and it is a native `<details>`
     with a triangle for a quiet aside inside a card. This is a container with a
     border and a second control in its head, which a `<summary>` cannot hold. */
  { id: 'c-fold', name: 'Fold', group: 'CONTAINERS', page: 'containers', badge: 'NEW', impl: 'component',
    added: '2026-09-19',
    desc: 'A block that folds, and can be switched off. Two states, both drawn — off keeps the count, because the contents are still there.' },
  /* THE 52nd, AND §24 WROTE ITS SPEC TWO YEARS BEFORE IT EXISTED. That pass
     recorded the rule — *skeletons for structured content, spinners for single
     actions, nothing under ~300ms* — cited its sources, and shipped no
     component, so every list waiting on a request has been answering with a
     sentence in `--tx-ink-3`. `LibraryPane` is the one that forced it: 1,324
     movements fetched on mount INSIDE the builder dialog, against one 11.5px
     line in a 329x428px column.

     Grouped with CONTAINERS beside `c-empty`, which is the component it is the
     other half of: one draws the shape of content that is not coming, the other
     the shape of content that is. */
  { id: 'c-skeleton', name: 'Skeleton', group: 'CONTAINERS', page: 'containers', badge: 'NEW', impl: 'component',
    added: '2026-09-18',
    desc: 'The shape of the content that is coming, while it comes. Owns its own 300ms delay, and spends no keyframe budget — the plate pulses on `tx-fade`.' , cls: 'skel' },
  { id: 'c-why', name: 'Reason callout', group: 'CONTAINERS', page: 'containers', badge: null, impl: 'component', desc: '' },
  /* Registered the day `/settings/profile` stopped being a 560px column in a
     1409px page. It is NOT `c-split`, and the near miss is worth naming
     because the two would otherwise be one entry with a modifier: `.split`
     REPLACES `.body`, takes the full height of `.main`, draws a border down
     the middle and gives each column its own scrollport — it is the frame you
     pick a row in on the left and read on the right. This is a block INSIDE
     `.body`: one scroller, one reading order, no border, and a right column
     that is a standing reference rather than a detail you navigated to.

     Checked against what else existed. `c-dock` is the other two-column
     answer and it is a third thing again — a grid TRACK that opens and closes
     on a press, pushing the plane aside while something is being edited;
     this one neither opens nor closes and holds no controls. `Card` beside
     `Card` in a `.grid2` is what the screens that needed this were already
     doing, and it is what leaves the reference behind the fold. */
  { id: 'c-sidecar', name: 'Sidecar', group: 'CONTAINERS', page: 'containers', badge: 'NEW', impl: 'component',
    added: '2026-09-21', cls: 'sdc',
    desc: 'A form, beside the thing the form is about: a capped measure, a sticky reference, and one column under 1180 with the reference read first.' },
  /* THE THIRD HALF OF `c-empty`, and it arrived from the other side of the
     same problem. `c-empty` answers *there is nothing here* and `c-skeleton`
     answers *it is coming*; neither answers **what do you want me to put in
     it**, which is the question a free-text field on a training app actually
     gets. The client file's notes tab had the answer and had it as PROSE — the
     empty state's *the things that never fit in a field: how they like to
     train, what their week looks like, what to ask about next time* — and
     prose is the one form of that sentence a reader cannot act on.

     Checked against what existed first. `c-brief` is the near miss and its own
     note is why it is not this: it is *a contents page, with no state and no
     way in*, naming what a flow is about to ask. These are the way in. `c-why`
     is a rationale for something already on the screen, and `c-segment` shapes
     a list that exists.

     Registered on the day the notes tab drew it, where it also closes 824×145
     of card floor on a one-note client — but the component takes no `count`
     and no threshold: whether a surface is still being taught is the surface's
     own question. */
  { id: 'c-prompts', name: 'Prompt list', group: 'CONTAINERS', page: 'containers', badge: 'NEW', impl: 'component',
    added: '2026-09-19',
    desc: 'The questions a blank free-text field is really asking, as controls. Seeds the placeholder and never the draft — a hint written into the value is text somebody has to delete.' , cls: 'prompts' },
  { id: 'c-rail', name: 'Navigation rail', group: 'NAVIGATION', page: 'nav', badge: null, impl: 'component', desc: '' },
  { id: 'c-topbar', name: 'Top bar', group: 'NAVIGATION', page: 'nav', badge: null, impl: 'component', desc: '' , cls: 'top' },
  { id: 'c-crumbs', name: 'Breadcrumb', group: 'NAVIGATION', page: 'nav', badge: null, impl: 'component', desc: '' },
  { id: 'c-tabs', name: 'Tabs', group: 'NAVIGATION', page: 'nav', badge: null, impl: 'component', desc: '' , cls: 'ph__tabs' },
  { id: 'c-subtabs', name: 'Sub-tabs', group: 'NAVIGATION', page: 'nav', badge: 'NEW', impl: 'component',
    added: '2026-09-22', cls: 'subtabs',
    desc: 'A SECOND level of tabs, each one a route. Pills rather than a second underline strip, because an underline under an underline marks nothing — and links rather than a Segment, because these are page loads.' },
  { id: 'c-palette', name: 'Command palette', group: 'NAVIGATION', page: 'nav', badge: 'BETA', impl: 'component', desc: '' , cls: 'pal' },
  { id: 'c-bulkbar', name: 'Bulk bar', group: 'NAVIGATION', page: 'nav', badge: null, impl: 'component', desc: '' , cls: 'bulk' },
  /* Registered with the 21 Sep 2026 mobile pass on the workout console. It is
     next to `c-bulkbar` on purpose: they are the two bars in the system that
     carry actions rather than navigation, and the comment in each says why
     they are not one component. No anchor in `webapp-components.html` — the
     design set draws twenty screens at 1440x900 and has never had to answer
     what the bottom edge of a phone is for. */
  { id: 'c-actionbar', name: 'Action bar', group: 'NAVIGATION', page: 'nav', badge: 'NEW', impl: 'component',
    added: '2026-09-21',
    desc: 'The screen’s live verb pinned to the bottom edge, where a one-handed thumb already is. Touch only: on a desk the same control belongs beside the thing it acts on.' , cls: 'abar' },
  /* The 50th, and another with no anchor in `webapp-components.html` — the
     design set drew every list either short enough to fit or ending in a *Load
     more*, so it never had to answer what a page of a list looks like. The
     exercise library is what forced it: 77 movements today and 1,324 in the
     real catalogue, and *Load more* on a catalogue is a list with no position
     in it. Registered before the call-site was converted, the way `c-brief`
     was, so the catalogue records the component rather than the screen. */
  { id: 'c-pager', name: 'Pager', group: 'NAVIGATION', page: 'nav', badge: 'NEW', impl: 'component',
    desc: 'Numbered pages as links, not a button that appends: a page of a list is a place, so it survives a reload and can be sent to someone.' },
  /* ── A `c-secnav` WAS ADDED HERE AND REMOVED THE SAME DAY ─────────────────
     A sticky in-page jump list, written for the client portal's Progress
     screen when it was one page five screens tall. It worked and it was the
     wrong instrument, which is worth recording so nobody adds it back:

       **A jump list says "this is one long answer, here are its parts."
       Tabs say "these are four different questions."**

     Progress' sections were four different questions, so it became four routes
     on `PageTabs` instead — see `lib/portal/progress-tabs.ts`. The catalogue
     gains nothing from a component with no caller, and this file's own header
     is about keeping `impl` honest, so the entry went with the file. */
  { id: 'c-agenda', name: 'Day list', group: 'DOMAIN', page: 'domain', badge: 'NEW', impl: 'component',
    added: '2026-09-15',
    desc: 'The rest of the day as one ruled list. Replaced nine separately-bordered cards that cost 68px a row against a 586px content window.' },
  { id: 'c-setrow', name: 'Set row', group: 'DOMAIN', page: 'domain', badge: null, impl: 'component', desc: '' , cls: 'sets' },
  /* The third entry with no anchor in `webapp-components.html`, and the first
     one that was already WRITTEN before it was catalogued: it lived inside
     `components/today/Hero.tsx` as a local `Card` used eight times. Same `c-`
     scheme as the other two so a future design-file anchor can adopt it. */
  /* Rewritten in the 15 Sep 2026 `/today` pass. The `.card` wrapper is gone —
     the card IS the surface now — the figure moved to the §25 type scale, the
     live and quiet grounds carry the hierarchy that a tint used to, and
     `tone: 'acc'` is flattened inside a live card rather than removed. The API
     did not move, which is why all eight Today call-sites and the portal's two
     changed nothing. */
  { id: 'c-herocard', name: 'Hero card', group: 'DOMAIN', page: 'domain', badge: 'NEW', impl: 'component',
    updated: '2026-09-15',
    desc: 'The one card on a screen that is HAPPENING. A live ground, a quiet companion, and one primary verb.' , cls: 'hro' },
  /* The catalogue had no component that drew a piece of MEDIA — the nearest
     thing to a video before this was `Avatar`. The client portal cannot ship
     without one: its §2 calls the demo clip "non-negotiable for this audience —
     the trainer isn't standing there; the video is." */
  /* Registered AFTER it had shipped as markup, which is the case this file's
     header calls the honest order arriving late: the client portal's Home
     assembled it from a `.row.row--top`, an `<Avatar>` and three inline style
     properties on the quote, and `check-components.mjs` could not see it
     because there was no class for the check to own. §1 of the client spec
     calls what it draws "the single highest-value element on the screen", so a
     second screen writing it again differently was the expensive kind of
     drift. Checked against what existed first: `Message` is the app speaking
     to a user in its own voice, `Why` is a rationale callout, and `Toast` is a
     receipt — none of the three is somebody else's words, attributed. */
  { id: 'c-coachnote', name: 'Coach note', group: 'DOMAIN', page: 'domain', badge: 'NEW', impl: 'component',
    desc: 'A line from the trainer, attributed and quoted — with a reading measure on the quote and no reply control, because WhatsApp is the reply.' , cls: 'cnote' },
  /* Registered the day the client file's notes tab stopped being a list, and
     found by measuring it: at 1536×695 the notes card was 974px wide and 288px
     tall beside a 571px record column, and the sentence inside a row had a
     705px measure — ~120 characters, twice what anybody reads. The shape was
     wrong, not the ratio; `.cfgrid--ov` had reached the same conclusion one tab
     over.

     Checked against what existed first, and two near misses are worth naming.
     `c-coachnote` is a line FROM the trainer, attributed and quoted for
     somebody else to read; this is a line BY the trainer, for themselves, with
     four controls on it and no attribution because the reader is the author.
     `c-listrow` and `c-table` are the same question at row density, and the
     measurement above is the answer: the deciding content is a SENTENCE, and a
     sentence in a track that wide is not a row, it is a smear. */
  { id: 'c-notecard', name: 'Note card', group: 'DOMAIN', page: 'domain', badge: 'NEW', impl: 'component',
    added: '2026-09-19',
    desc: 'Something somebody wrote down, drawn as an object: a reading measure, a footer pinned to the floor so a wall of them lines up, and two states that are not tones.' , cls: 'ncard' },
  /* Registered after the SAME condition as `c-coachnote`, one screen along, and
     found the same way: by rendering. §3's instruction is "show change, not
     data", so *25 kg → 27.5 kg* is the portal's most-repeated shape — and it
     was drawn four times on Progress with three inline font sizes and **two
     different spellings of one figure**, because the summary formatted it in
     the model and the cards formatted it in the JSX.

     Checked against what existed first, and `c-stat`'s `delta` is the near
     miss worth naming: it carries a `direction` AND a `good`, which is exactly
     right for a trainer's dashboard and exactly wrong for a client reading a
     number about their own body. `WEIGHT_HAS_NO_TONE` is why this one has
     neither. A plain money formatter renders one amount, not a movement
     between two, so it was never the answer either. */
  { id: 'c-change', name: 'Change', group: 'DOMAIN', page: 'domain', badge: 'NEW', impl: 'component',
    desc: 'From one figure to another, in one spelling — and with no tone on the figure, because down is not good and up is not bad.' , cls: 'chg' },
  /* The seventh entry with no anchor in `webapp-components.html`, and the one
     that is a COMPOSITE rather than a new primitive: `c-progrow` is `c-change`
     and `c-trendchart` in one row, and it is registered for the reason the
     file's header gives — a pattern that answers a general question and lives
     at exactly one call-site is a pattern the next screen solves again,
     differently.

     The general question is *what did this one thing do, and how*. The progress
     report drew it as a four-column table and the table had two defects at
     once: 973px spread over four short cells, and — worse — `73.6 → 73.4` is
     two readings out of the three the row admits to, with the middle one
     carrying the whole story. Every screen in this product that shows a
     measurement or a lift over time has that second problem. `DOMAIN` and not
     `DATA` because the row knows what it is about: it inherits `c-change`'s
     `WEIGHT_HAS_NO_TONE` rule, which is a fact about coaching and not about
     charts. */
  { id: 'c-progrow', name: 'Progress row', group: 'DOMAIN', page: 'domain', badge: 'NEW', impl: 'component',
    desc: 'One thing that moved, with the shape of how it moved — the pair is the claim and the series beside it is the evidence.' , cls: 'pgr' },
  /* The sixth entry with no anchor in `webapp-components.html`, and one of the
     `.certc` — a class family that shipped in §04 with no component behind it, so
     `/programs/certified` hand-wrote the header, the meta line and the split
     footer for every card. `check-components.mjs` could not see it: its OWNED
     map only lists roots that still have a component, which is exactly the
     blind spot a CSS-only family sits in.

     Registered AFTER the markup shipped, like `c-herocard` and `c-coachnote`,
     and extracted in the same pass that redesigned the card — which is why the
     entry page below is a specimen of the NEW card and not of the old one.
     The whole BEM family is this one entry with parts, never one component per
     `__element`: `.certc__ft` is not a component, it is this card's footer.

     Checked against what existed first. `Card` is a titled container a screen
     puts anything into; this is a fixed record with six named slots in a fixed
     order and a footer pinned to the bottom of a stretched grid track.
     `ListRow` and `ProgramRow` are the same question at row density, and the
     component's own note says why a row is the wrong density here: the
     deciding information is a SENTENCE. */
  { id: 'c-templatecard', name: 'Template card', group: 'DOMAIN', page: 'domain', badge: 'NEW', impl: 'component',
    added: '2026-09-17', updated: '2026-09-17',
    desc: 'A blueprint nobody has read yet: the sentence that decides it, three figures with their nouns, and who has stood behind it.' , cls: 'certc' },
  /* ── 19 Sep 2026 · THE PAYMENTS PASS ──────────────────────────────────────
     No anchor in `webapp-components.html`, the same standing as `c-slab` and
     `c-balancestrip`. Checked against what already exists before it was
     written, which is this file's standing requirement: `c-card` is a surface
     with a head and a body and would have had to grow a masthead, a two-party
     block and a ruled total; `c-table` compares rows, and an invoice is one
     row nine times out of ten; `c-kv` is a label-and-value list, which is what
     the two parties are NOT — a name under its label is how every printed bill
     states this and it is the shape a stranger can read without tracking left
     to right. It is also the only component in the set with a print rule, and
     the reason is in its CSS block: the shortest path from this screen to a
     PDF is the browser's own print dialogue. */
  { id: 'c-invoice', name: 'Invoice', group: 'DOMAIN', page: 'domain', badge: 'NEW', impl: 'component',
    added: '2026-09-19',
    desc: 'One bill, as a document: two parties named in full, what was bought, and a total for a reader who was not in the room.' , cls: 'inv' },
  /* Registered after the markup shipped, like `c-herocard` and `c-coachnote`,
     and extracted for a reason no screenshot shows: every rule this card
     needed — the 13px avatar gap, the `min-width:0` that stops a long headline
     shoving the avatar off its own card, the ellipsis on the one line, the
     10px above each borrowed row — was a `style={{…}}` at the call-site.
     Twelve of them, in a JSX file, which is the only place that design existed.

     It also hand-wrote an `.av av--lg` with its own `initialsOf`, so a trainer
     with a single-word name got ONE initial here and two everywhere else in
     the product. `check-components.mjs` counts `av` as `Avatar`'s; this is
     what that count was for.

     Checked against what existed first. `c-herocard` is the trainer's own view
     of their next hour and carries verbs; this is the trainer as somebody ELSE
     reads them and carries none. `c-listrow` and `c-factlist` are the same
     question at row density, and the deciding content here is a name and a
     headline at card weight with six borrowed lines under them, which is an
     object rather than a row. */
  { id: 'c-profilecard', name: 'Profile card', group: 'DOMAIN', page: 'domain', badge: 'NEW', impl: 'component',
    added: '2026-09-21', cls: 'pfc',
    desc: 'A trainer as a client meets them, before they have accepted the invite. Every field optional, absent means absent, and nothing on it can be typed into.' },
];

/** The groups in the design file's order, each with its members. */
export const GROUPS: { group: Group; entries: Entry[] }[] = [
  ...new Set(ENTRIES.map((e) => e.group)),
].map((group) => ({ group, entries: ENTRIES.filter((e) => e.group === group) }));

export const byId = (id: string): Entry | undefined => ENTRIES.find((e) => e.id === id);

/** How much of the catalogue is a real shared component. The number to move. */
export const extracted = () => ENTRIES.filter((e) => e.impl === 'component').length;

/** `15 Sep 2026`, for a card's Upgraded stamp. Hyphens, never an en dash. */
export function updatedLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

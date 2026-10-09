import { Check } from '@/components/shell/Icons';
import { Remote, WarnTriangle } from './Icons';
import type { ScheduleView } from '@/lib/schedule/view';

/**
 * WHAT THE GRID'S COLOURS MEAN, SAID ONCE, IN THE ROW THAT ALREADY EXISTS.
 *
 * The week grid encodes five things in colour and shape and named none of them.
 * A trainer could see that some blocks were green and some were outlined in red
 * and had no way to learn which was which except by opening one — the legend was
 * the session panel, three clicks deep, one session at a time.
 *
 * ── EACH SWATCH IS THE THING, NOT A DOT THE COLOUR OF THE THING ─────────────
 *
 * `.kysw` is a miniature `.ev`: same `--tx-r1`, same 3px left bar, same fill
 * token, same hatch, same dashed accent border for the gap. A round dot in
 * `--tx-ok` would be a SECOND encoding of the same fact — the reader would have
 * to learn that the dot maps to the bar, which is the exact lookup the legend is
 * here to remove. The clash swatch carries the 45° hatch and the danger ring
 * because that is literally what `.ev--conflict` draws.
 *
 * ── AND THE TWO RUNS ARE THE TWO AXES, ONE PER ROW ──────────────────────────
 *
 * A block says two independent things and webapp.css now gives each its own
 * channel — fill is delivery, the 3px bar is status. The legend is split on the
 * same seam and `.sch__key__sep` is where they part: *In person · Online* read the
 * fill, *Same time · Done · Free gap* read the edge. Listing all five in one run
 * would imply they are five alternatives, and they are not — every block on the
 * screen is one from the left group and, if anything, one from the right.
 *
 * The seam is a ROW BREAK and no longer a hairline. `.sch__key` draws two 15px
 * lines because one line could not hold three terms at the width this screen is
 * actually used at — MEASURED at 237px of leftover against the 273 the first row
 * would have needed — and a 1px rule that ends up at the start of the second row
 * reads as a stray mark rather than a division. See app.css: the element is the
 * same one, in the same place, expressed by the layout instead of drawn on it.
 *
 * ── THE MONTH GETS A DIFFERENT KEY, BECAUSE IT DRAWS A DIFFERENT THING ──────
 *
 * FOUND BY COUNTING NODES on `?view=month`: **zero** `.ev` elements and zero
 * `.gapb`. The month is not a small week — a day is a 6px stacked bar (`.mo__bar
 * i` floor, `.mo__bar s` remote) and a `.mo__cl` triangle, and it has no
 * lifecycle state and no minute axis at all.
 *
 * Shipping the block key there would have been the exact failure this component
 * exists to fix, one level up: miniatures of a shape the visible grid never
 * draws, two of them — *Done*, *Free gap* — naming states the month cannot
 * express. So the month gets three keys drawn as BAR SEGMENTS, which is what it
 * actually puts on the screen, and `Toolbar` needs no second condition because
 * the branch is here.
 *
 * The same rule governs `Free gap`, one axis down: it is drawn only while the
 * `Show gaps` chip is pressed, because that is the only time the grid contains a
 * dashed outline to explain. It is also the one term the two rows can still fail
 * to hold — a pressed `Show gaps` on the week at 237px puts it on a third line
 * that `overflow:hidden` takes, and a third line would cost the grid real height
 * for the least surprising of the five. The other four always draw.
 *
 * ── AND THE WEEK BY CLIENT DROPS THE SAME TERM THE MONTH DROPS ──────────────
 *
 * The pivot's chips are the block's own fill and 3px bar — that is the whole
 * argument for the toggle costing no re-learn — so the first four terms are as
 * true of that table as of the grid. `Free gap` is not: a gap is a free
 * interval INSIDE a day, and a pivot cell IS a whole day. `Toolbar` stands the
 * chip down for the same reason, so the term would also be describing a control
 * that is no longer on the screen.
 *
 * ── WHAT IT LEAVES OUT ──────────────────────────────────────────────────────
 *
 * `no-show` and `not marked` are states with colours of their own and neither is
 * here. Both are self-evident where they appear — a red block with a cross
 * through the corner needs no gloss — and both are rare, where the five that are
 * listed are on the screen every week. A legend long enough to need scanning is
 * a legend nobody scans.
 *
 * ── DESKTOP ONLY, AND THAT IS NOT A BUDGET DECISION ─────────────────────────
 *
 * `.sch__key` is hidden at ≤900px, where `.sch__tg` is hidden too: the phone
 * draws `WeekPips` and `DayAgenda`, and `DayAgenda` already writes *In Person* /
 * *Online* on every row in words. A key to a grid that is not on the screen is
 * the dead control §01 exists to catch — the same call `Toolbar` makes when it
 * drops `Show gaps` on the month.
 *
 * It costs no height at the widths it IS drawn at, two rows included: MEASURED,
 * `.sch__tools` is 59px with the key at 15px and 59px with it at 34, because the
 * row was already that tall for the 28px controls in it. The toolbar was a flex
 * row with `.sch__filters` pushed right by `margin-left:auto`, which left 570px
 * of measured dead space in the middle of a 1472px bar. The legend goes there —
 * and what it actually gets is 237px of that, once `.sch__layout` and the date
 * have taken theirs, which is the number the two rows exist to fit inside.
 */
export function ScheduleKey({
  view, gaps, pivoting,
}: {
  view: ScheduleView;
  gaps: boolean;
  /** The week by client. See `Toolbar`'s own note, and the block below. */
  pivoting: boolean;
}) {
  const month = view === 'month';

  return (
    // `<dl>` and not a list of spans: these are terms and their definitions,
    // which is the one structure HTML has a tag for. The swatch is the term's
    // decoration and is hidden, so a screen reader reads the words and not a run
    // of empty boxes.
    <dl className="sch__key" aria-label="What the calendar's colours mean">
      <Key swatch={month ? 'mbar' : 'floor'} label="In person" />
      <Key swatch={month ? 'mbar-remote' : 'remote'} label="Online">
        {!month && <Remote size={9} />}
      </Key>

      {/* The seam between the two axes, drawn as the row break. The month draws
          only the first of them, so it has nothing to separate and does not
          break — its three terms sit on one line. */}
      {!month && <div className="sch__key__sep" aria-hidden="true" />}

      {/* The data model and every other surface call this a *clash*; the word
          here is the one a trainer says out loud looking at the grid, and on the
          week the two blocks are drawn side by side directly below it.

          Ahead of `Done`, and the order is a reading one now that the second
          row holds both — it led the shedding order too, and the shedding order
          was still dropping it: the one line the key used to draw ended after
          `Online`. A clash is a thing already wrong and it is the rarest of the
          three states drawn here, which is exactly the combination that makes a
          key worth having; `Done` is on nine blocks in ten and its green edge is
          the easiest of the three to infer unaided. */}
      <Key swatch={month ? 'bare' : 'clash'} label="Same time">
        <WarnTriangle size={month ? 11 : 9} />
      </Key>

      {/* THE MONTH'S AMBER. A day's count and its percentage turn warn when the day is
          full or over the trainer's own hours, and nothing said so — the same
          amber read as decoration on a heat map. One term, drawn as the figure it
          colours, so a trainer meets the colour and its meaning in one place. */}
      {month && (
        <Key swatch="bare" label="Full or over your hours">
          <b className="ky__warn">%</b>
        </Key>
      )}

      {/* No lifecycle state on the month at all — a `.mo__c` says how many
          sessions a day holds and how full it is, never whether they happened. */}
      {!month && (
        <Key swatch="done" label="Done">
          <Check size={9} />
        </Key>
      )}

      {/* Follows the `Show gaps` chip rather than the view, which is the same
          rule the month branch is applying and not a second one: the key
          describes what is ON THE SCREEN. Gaps are off by default, so for a
          trainer who has never pressed that chip this line was naming a dashed
          outline the grid was drawing nowhere.

          It appears with the hatching and disappears with it — which also makes
          it the one item in the key that teaches what a control does, because
          the chip that draws it is nine pixels to the right. */}
      {!month && !pivoting && gaps && <Key swatch="gap" label="Free gap" />}
    </dl>
  );
}

/** One term and its definition. `<div>` groups rather than bare `dt`/`dd` pairs,
 *  so each can be its own flex row — `<dl>`'s content model takes either shape
 *  but not the two mixed, which is also why the separator is a `div`. */
function Key({
  swatch, label, children,
}: {
  swatch: string;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="sch__key__i">
      <dt>
        <i className={`kysw kysw--${swatch}`} aria-hidden="true">{children}</i>
      </dt>
      <dd>{label}</dd>
    </div>
  );
}

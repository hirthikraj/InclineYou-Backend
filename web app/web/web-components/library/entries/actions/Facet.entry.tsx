import { byId } from '../../../registry';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { FacetSpecimen } from './FacetSpecimen';

/**
 * Facet — a filter that says what it is set to.
 *
 * Written 19 Sep 2026 for the assessments list. The specimen is live and its
 * popup is `RowMenu`'s, which is most of the argument for the component.
 */
export function FacetEntry() {
  const entry = byId('c-facet')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Facet.tsx</code> },
        { k: 'Class', v: <code>.facet</code> },
        { k: 'Element', v: <><code>&lt;span&gt;</code> around two buttons</> },
        { k: 'Popup', v: <code>c-rowmenu</code> },
        { k: 'Find field', v: <><code>search</code> → <code>.menu--find</code></> },
        { k: 'Used in', v: '/clients/assessments' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Three axes, one of them set. Press a facet to open its list; tick two statuses and the
            menu <b>stays open</b> — <i>what is outstanding</i> is two states, not one, and a
            trainer asking it should not read the list twice. <code>single</code> closes it, for an
            axis where a second value is meaningless.
          </>
        }
      >
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="a filter bar, one axis set" stretch>
            <FacetSpecimen />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="An axis whose values are people gets a find field"
        lede={
          <>
            <i>Status</i> is four words and <i>Read status</i> is two. <i>Client</i> is the whole
            roster — a hundred and forty people in the real one — and a menu that can only be
            scrolled asks a trainer to <b>read</b> a list to find somebody whose name they already
            know. <code>search</code> puts a <code>SearchField</code> at the head of the panel and
            filters the rows under it; an option may carry <code>find</code>, so a phone or an
            email matches as well as the label, without either being drawn on the row.
          </>
        }
      >
        <p className="blk__p">
          Three behaviours come with it, and none of them is a style. The panel stops being a{' '}
          <code>menu</code> — one may own menu items and nothing else, and this one now holds a
          textbox — so the panel takes <code>dialog</code> and the rows keep the menu inside{' '}
          <code>.menu__list</code>. Focus opens <b>in the field</b>: Down and Up leave it for the
          rows, Home and End stay with the caret, and Enter takes the first row left standing.
          And the close-on-scroll listener, which is a capture listener on <code>window</code>, had
          to learn to ignore the panel&rsquo;s own scroll — without the guard the first flick
          through a capped list shut the list it was scrolling.
        </p>
        <p className="blk__p">
          Nothing matched is a <b>line</b>, not a <code>c-empty</code>: a heading, a sentence and an
          action is right in a card somebody landed on and is a wall in a 280px popup. The answer to{' '}
          <i>no client matches your search</i> is to type fewer letters, and the box that takes them
          is directly above it.
        </p>
      </Blk>

      <Blk
        title="Why this is not a Chip"
        lede={
          <>
            A chip is a filter that is on or off and says so by being filled. That is right for a
            short fixed list a screen can draw all of — the roster&rsquo;s six segments — and it
            stops working the moment the axis has a name. A row of chips reading{' '}
            <i>Done · Missed · Unread · Read</i> cannot say which two belong to <i>Status</i> and
            which to <i>Read status</i>, and it cannot draw an axis nobody has set.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <span className="facet facet--on">
                <span className="facet__t" style={{ pointerEvents: 'none' }}>
                  <span className="facet__k">Status</span>
                  <span className="facet__v">Done</span>
                </span>
              </span>
            ),
            caption:
              'The axis is always drawn and only the value changes, so a bar with nothing set is still a list of what can be narrowed.',
          }}
          no={{
            figure: (
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="chip">Done</span>
                <span className="chip">Unread</span>
              </div>
            ),
            caption:
              'Two pills with no axis between them. Nothing on the bar says these belong to two different filters, and neither one can be cleared without knowing which.',
          }}
        />
      </Blk>

      <Blk
        title="The popup is the row menu's, not a second one"
        lede={
          <>
            Measure the trigger, flip when the only room is above, close on Escape, on an outside
            press, on a scroll and on a resize, rove with the arrows, restore focus.{' '}
            <code>RowMenu</code>&rsquo;s own header records that this ladder had been hand-written
            twice before it existed and that the two copies already disagreed about{' '}
            <code>resize</code>. So it grew a <code>trigger</code> slot and checkable items instead,
            and this component is <b>the pill plus the items</b> — about forty lines, none of them
            a popup.
          </>
        }
      />

      <Blk
        title="Set is the accent's soft pair, never the fill"
        lede={
          <>
            <code>#C6F24E</code> is a fill, never text on a light ground — the rule the stylesheet
            opens with, and the one that has caused four real bugs. A set facet carries text inside
            it, so it takes <code>--tx-accent-soft</code> with <code>--tx-accent-text</code> on top
            and <code>--tx-accent-line</code> round it, which is what <code>.tag--acc</code>{' '}
            already does.
          </>
        }
      />

      <Blk
        title="The wrapper’s hit slop was eating every click, and only a pointer probe said so"
        lede={
          <>
            §22 gives <code>.facet</code> a <code>::before</code> at{' '}
            <code>position:absolute; inset:-2px 0</code>, on the reasoning that the wrapper &ldquo;is where
            the two children meet and therefore covers both&rdquo;. It covers both in PAINT ORDER as well: an
            absolutely positioned pseudo-element on a positioned parent paints above static-positioned
            children, and it carried no <code>pointer-events</code>, so it was the topmost hit target across
            the whole pill and neither the trigger nor the &times; ever received a pointer event.
          </>
        }
      >
        <p className="blk__p">
          It was reported as <i>the filter buttons are not working</i>, and every gate was green:{' '}
          <code>tsc</code>, <code>eslint</code>, the rows filtering correctly from a URL, and a scripted{' '}
          <code>button.click()</code> opening the menu — a dispatched click skips hit testing entirely.{' '}
          <code>document.elementFromPoint</code> at the centre of each facet is the probe that reports it, and
          it came back <code>SPAN.facet</code> on all three. The slop cannot move to the children either:{' '}
          <code>.facet</code> is <code>overflow:hidden</code>, so a <code>::before</code> on the trigger is
          clipped and its hit area goes with it. app.css makes the pseudo-element inert and takes the trigger
          to 32px, which is the floor the slop existed for.
        </p>
      </Blk>

      <SpecTable
        rows={[
          { property: 'Height', value: '32px', token: undefined, note: '38 under `pointer:coarse`. The wrapper’s slop is inert — see above' },
          { property: 'Axis name', value: '12.5px / 500', token: '--tx-ink-2', note: 'Always drawn' },
          { property: 'Value', value: '12.5px / 700', token: '--tx-ink', note: 'Two weights, not two colours — a second ink at 12.5px is a smudge' },
          { property: 'Set', value: 'soft fill + line', token: '--tx-accent-soft', note: 'Ink steps to --tx-accent-text' },
          { property: 'Clear', value: '26px, ruled left', token: undefined, note: '34 under `pointer:coarse`. Also a row in the menu, for the keyboard' },
          { property: 'Summary', value: '`Done +1`', token: undefined, note: 'Two full labels is a pill wider than the search field beside it' },
          { property: 'Menu row', value: '`menuitemcheckbox`', token: undefined, note: '14px tick column, reserved, so labels do not shift as they are ticked' },
          { property: 'Find field', value: '`.search`, 32px', token: undefined, note: 'Fixed at the head; the list scrolls under it' },
          { property: 'List cap', value: '256px', token: undefined, note: 'Eight rows. `RowMenu`’s `LIST_MAX` repeats it — the panel is measured before it opens' },
          { property: 'Nothing matched', value: '12.5px, centred', token: '--tx-ink-3', note: 'A line, not a `c-empty`' },
          { property: 'Single', value: 'closes the menu', token: undefined, note: '`closeOnPick` — one client is the whole answer, and focus goes back to the pill' },
        ]}
      />
    </Cmp>
  );
}

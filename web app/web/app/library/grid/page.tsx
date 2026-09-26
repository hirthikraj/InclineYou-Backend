import { Fragment } from 'react';

import { Blk } from '@/web-components/library/chrome/Blk';
import { Sec, Tbl, Tk } from '@/web-components/library/chrome/Sec';
import { Viewport } from '@/web-components/library/chrome/Viewport';
import { bySlug } from '@/web-components/library/system/parts';
import { root, value } from '@/web-components/library/system/tokens';
import { atRuleCounts, census, declared, loadBearing } from '@/web-components/library/system/viewports';

/**
 * Part 8 — grid and layout.
 *
 * ── WHY THIS PRODUCT DOES NOT HAVE A 12-COLUMN GRID ─────────────────────────
 *
 * The published version of this part says "use a 12-column grid for
 * flexibility", and that is right for a page — a document whose content is
 * poured into columns. This product is not a page. It is a shell with fixed
 * furniture and one fluid plane inside it, and the fixed part is fixed on
 * purpose: a rail that is 248px on every screen is a rail whose destinations
 * are in the same place every time, which is what makes navigation muscle
 * memory rather than a search.
 *
 * So the layout system here is a small set of named widths plus one density
 * dial, and the honest thing to document is those numbers and what depends on
 * them — not a column count nothing in the product uses.
 *
 * Every figure below is read out of the stylesheet.
 */
export const metadata = { title: 'Grid and layout · Design system' };

const SHELL = [
  ['--w-rail', 'The navigation rail, expanded.'],
  ['--w-rail-min', 'The rail, icon-only.'],
  ['--w-top', 'The top bar.'],
  ['--w-panel', 'The right-hand editing panel.'],
  ['--w-list', 'The list pane in a list-detail split.'],
  ['--w-gutter', 'The content plane’s own padding.'],
  ['--w-measure', 'Prose width — an empty state’s explanation, a callout. 72ch, because a line longer than that loses the reader on the return sweep.'],
];

const DENSITY = [
  ['--w-row', 'The standard list or table row. This is the density dial for the whole application: change it and every list re-tunes together.'],
  ['--w-row-lg', 'A row carrying two lines — a name over a meta line.'],
  ['--w-tap', 'A pointer-only control: icon button, chip, row menu.'],
  ['--w-tap-touch', 'Anything plausibly touched on a convertible laptop.'],
];

/**
 * The shell tokens whose value depends on the viewport.
 *
 * Four, and they are not an arbitrary four: they are every `--w-` token the
 * application's stylesheet re-declares inside a width query. The note is only
 * reached when a token has no phone override at all, which is the case worth
 * stating out loud rather than leaving as a blank cell.
 */
const SHELL_X: [string, string][] = [
  ['--w-top', 'The same bar at both widths.'],
  ['--w-tabs', 'Desktop has no bottom tab bar, so the token is never declared there.'],
  ['--w-underbar', 'Declared with the tab bar, for the same reason.'],
  ['--w-rail', 'Replaced by the tab bar rather than resized, so its value never moves.'],
];

/**
 * What each load-bearing width is the line FOR.
 *
 * The one hand-written thing on this page, and it has to be: a count says 900px
 * is used fifty-nine times, and no amount of parsing says what 900px MEANS. The
 * sentences are the design decision; the numbers beside them are measured, so a
 * width that stops being load-bearing drops out of the table on its own and
 * takes its sentence with it.
 */
const BP_MEANS: Record<number, string> = {
  900: 'The shell’s own line. The rail becomes a bottom tab bar, panels become sheets, search becomes a glyph.',
  901: 'The desk side of the same line, for rules that must NOT reach a phone — a short-window height query among them.',
  640: 'The narrow rung for screens whose content is a single column of rows.',
  620: 'Tables stop scrolling sideways and stack into rows.',
  560: 'Feet and toolbars stack; the pane collapses.',
  420: 'The last rung before the floor — card padding tightens, columns drop.',
  360: 'The budget-Android floor. Nothing below this is designed for.',
  1080: 'The hero pair stacks and the programs split folds.',
};

/** The census in rows of three, for a table that is a list rather than a shape. */
function rows3<T>(xs: T[]): (T | null)[][] {
  const out: (T | null)[][] = [];
  const n = Math.ceil(xs.length / 3);
  for (let i = 0; i < n; i += 1) out.push([xs[i] ?? null, xs[i + n] ?? null, xs[i + 2 * n] ?? null]);
  return out;
}

export default function Page() {
  const r = root();
  const at = atRuleCounts();
  const mediaCount = at.media;
  const containerCount = at.container;

  /* The top bar's drop, subtracted rather than stated: the two values are read
     out of the stylesheets a line above, and a third spelling of "10px" here
     would be the one that goes stale. */
  const topAll = declared('--w-top');
  const topBase = Number(topAll.find((d) => !d.media)?.value.replace('px', '') ?? 0);
  const topPhone = Number(
    topAll.find((d) => /max-width:\s*900px/.test(d.media))?.value.replace('px', '') ?? topBase,
  );
  const topDrop = `${topBase - topPhone}px`;

  /* Read once: `census()` walks both stylesheets, and calling it in four places
     inside the JSX below would walk them four times per render. */
  const all = census();
  const top = all[0];

  return (
    <Sec part={bySlug('grid')!}>
      <Blk
        title="The shell"
        tag="fixed furniture, one fluid plane"
        lede={
          <>
            Above 900px: a rail down the left, a bar across the top, and everything else is the content
            plane. The two fixed tracks do not resize with the window; the plane takes the rest, and every
            screen in the product is drawn inside it. Below 900px it is a different shell, not a narrower
            one &mdash; the next block draws both.
          </>
        }
      >
        <div className="sec__sh" aria-hidden="true">
          <div className="sec__sh-r">Rail {value('--w-rail', r)}</div>
          <div className="sec__sh-t">Top bar {value('--w-top', r)}</div>
          <div className="sec__sh-m">Content plane &middot; fluid</div>
        </div>
        <p className="blk__p" style={{ marginTop: 14 }}>
          The rail sits one step below the canvas rather than above it, so the content plane reads as the
          thing in front. That is a colour decision doing a layout job: it means the shell can hold its
          ground without a border loud enough to cut the screen in half.
        </p>
        <Tbl
          cols={['Token', 'Value', 'What it sizes']}
          rows={SHELL.map(([t, use]) => ({ key: t, cells: [<Tk key="t">{t}</Tk>, value(t, r), use] }))}
        />
      </Blk>

      <Blk
        title="Both shells"
        tag="the same screen, two viewports"
        lede={
          <>
            The phone is not the desktop with the rail taken out. It is a second shell: the rail is
            replaced by a bottom tab bar, the top bar loses {topDrop}, and the content plane becomes the
            only thing that scrolls. Below are real screens, live, framed at their own viewports &mdash;
            not screenshots, and not a narrow column on this page.
          </>
        }
      >
        <Viewport src="/today" title="Today" />
        <p className="blk__p" style={{ marginTop: 20 }}>
          The frames are <code>&lt;iframe&gt;</code>s, and that is load-bearing rather than convenient. A{' '}
          <code>@media</code> rule tests the viewport, never the element, so a 390px-wide{' '}
          <code>&lt;div&gt;</code> on this page would be handed desktop CSS at phone width &mdash; a {value('--w-rail', r)}{' '}
          rail crushed against a 390px plane, and no tab bar at all. That is a picture of a layout no
          device has ever drawn. {mediaCount} of this product&rsquo;s responsive rules are{' '}
          <code>@media</code>; {containerCount} are <code>@container</code>, and those are local to a
          chart or an event block. A frame with a viewport of its own is the only honest way to show the
          other half.
        </p>
        <Tbl
          cols={['Token', 'Desktop', 'Phone', 'Where the phone value is set']}
          rows={SHELL_X.map(([t, note]) => {
            const all = declared(t);
            const base = all.find((d) => !d.media);
            const phone = all.find((d) => /max-width/.test(d.media));
            return {
              key: t,
              cells: [
                <Tk key="t">{t}</Tk>,
                base ? base.value : <i>not declared</i>,
                phone ? phone.value : base ? <>same</> : <i>&mdash;</i>,
                phone ? <code>{phone.media}</code> : note,
              ],
            };
          })}
        />
      </Blk>

      <Blk
        title="Density"
        tag="one dial"
        lede={
          <>
            Density is a feature here, not a compromise: a trainer needs a day on one screen. The numbers are
            measured rather than chosen by feel — a 48px button in a desktop toolbar reads as a phone app in
            a window.
          </>
        }
      >
        <Tbl
          cols={['Token', 'Value', 'What it sizes']}
          rows={DENSITY.map(([t, use]) => ({ key: t, cells: [<Tk key="t">{t}</Tk>, value(t, r), use] }))}
        />
        <div style={{ marginTop: 18, border: '1px solid var(--tx-line)', borderRadius: 'var(--tx-r2)', overflow: 'hidden' }}>
          {['Meera K', 'Arun S', 'Divya R'].map((n, i) => (
            <div
              key={n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                height: 'var(--w-row)',
                padding: '0 14px',
                background: 'var(--tx-surface)',
                borderTop: i ? '1px solid var(--tx-line)' : undefined,
                fontSize: 'var(--tx-body)',
              }}
            >
              <span style={{ fontWeight: 600 }}>{n}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--tx-mono)', fontSize: 11, color: 'var(--tx-ink-3)' }}>
                {value('--w-row', r)}
              </span>
            </div>
          ))}
        </div>
      </Blk>

      <Blk
        title="Content widths"
        tag="what the plane holds"
        lede={
          <>
            Inside the plane there is no column grid. There are three arrangements, and a screen picks one:
            a single ruled column, a list beside a detail, or a plane with a panel docked to its right.
          </>
        }
      >
        <Tbl
          cols={['Arrangement', 'How it is built', 'When']}
          rows={[
            {
              key: 'column',
              cells: [
                <b key="k">One ruled column</b>,
                'Sections separated by a rule rather than by boxes, each one a slab.',
                'A screen that is a sequence — a day, a workout, a file. Four stacked cards say “four equal things”; a heading and a hairline can rank them.',
              ],
            },
            {
              key: 'split',
              cells: [
                <b key="k">List and detail</b>,
                <>
                  A {value('--w-list', r)} list pane, the rest to the detail.
                </>,
                'A catalogue you work through: exercises, programs, clients.',
              ],
            },
            {
              key: 'dock',
              cells: [
                <b key="k">Plane plus docked panel</b>,
                <>
                  A third grid track at {value('--w-panel', r)} that pushes the plane.
                </>,
                'Editing one thing while its context stays readable — a payment decided while looking at the payments table.',
              ],
            },
          ]}
        />
        <p className="blk__p" style={{ marginTop: 16 }}>
          The docked panel <i>pushes</i> rather than covering, and that is the whole argument for it: an
          overlay hides the rows the numbers in the panel are set against, which are exactly the rows the
          reader is deciding from.
        </p>
      </Blk>

      <Blk
        title="Breakpoints"
        tag="behaviour, not devices"
        lede={
          <>
            The product does not have a device table. It has things that give way in order, each at the width
            where it stops being useful rather than at a number borrowed from a phone. That is still the
            rule &mdash; but a rule with no numbers under it is not a specification, so the numbers are
            counted here rather than described. Every figure below is read out of the two stylesheets at
            build time.
          </>
        }
      >
        <Tbl
          cols={['As the window narrows', 'What gives']}
          rows={[
            { key: '1', cells: [<b key="k">First</b>, <>The rail collapses to icon-only ({value('--w-rail-min', r)}). Its destinations stay in the same order and the same place.</>] },
            { key: '2', cells: [<b key="k">Then</b>, 'A docked panel stops pushing and becomes an overlay — below a certain plane width, pushing leaves nothing worth reading behind it.'] },
            { key: '3', cells: [<b key="k">Then</b>, 'A list-detail split becomes one pane at a time, with the list as the route back.'] },
            { key: '4', cells: [<b key="k">Tables</b>, <>Stack into rows rather than scrolling sideways &mdash; and never with a <code>colgroup</code>, which silently shrinks every row under 620px.</>] },
            { key: '5', cells: [<b key="k">At 900</b>, 'The rail is gone. This is the one that is not a degradation but a different shell — see Both shells above.'] },
          ]}
        />

        <p className="blk__p" style={{ marginTop: 22 }}>
          <b>The widths that carry the system.</b> Counted as at-rule blocks rather than as rules: a width
          opened {top ? top.uses : 0} separate times is {top ? top.uses : 0} separate decisions to treat it
          as a boundary, which is what tells a load-bearing number from one somebody reached for once.
        </p>
        <Tbl
          cols={['Width', 'Blocks', 'What it is the line for']}
          rows={loadBearing().map((b) => ({
            key: `${b.feature}${b.px}`,
            cells: [
              <code key="w">{`${b.feature}: ${b.px}px`}</code>,
              String(b.uses),
              BP_MEANS[b.px] ?? <i>&mdash;</i>,
            ],
          }))}
        />

        <p className="blk__p" style={{ marginTop: 22 }}>
          <b>And the rest of them.</b> {all.length} distinct widths in all, {all.length - loadBearing().length}{' '}
          of them used fewer than eight times. This is not presented as a clean system, because it is not
          one yet &mdash; several sit within forty pixels of a neighbour that means the same thing. The
          table exists so that the next person to add a rung reaches for a width already in it, and so the
          normalisation pass has a list to work from rather than a grep.
        </p>
        <div className="sec__tw">
          <table className="st">
            <thead>
              <tr>
                <th>Width</th>
                <th>Blocks</th>
                <th>Width</th>
                <th>Blocks</th>
                <th>Width</th>
                <th>Blocks</th>
              </tr>
            </thead>
            <tbody>
              {rows3(all).map((row, i) => (
                <tr key={i}>
                  {row.map((b, n) =>
                    b ? (
                      <Fragment key={`${b.feature}${b.px}`}>
                        <td className={n > 0 ? 'v' : undefined}>
                          <code>{`${b.feature.startsWith('min') ? '≥' : '≤'}${b.px}`}</code>
                        </td>
                        <td className="v">{b.uses}</td>
                      </Fragment>
                    ) : (
                      <Fragment key={`pad${n}`}>
                        <td />
                        <td />
                      </Fragment>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Blk>
    </Sec>
  );
}

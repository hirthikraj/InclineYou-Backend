import * as Icons from '@/components/shell/Icons';
import { Blk, Bench, Cell } from '@/web-components/library/chrome/Blk';
import { DoDont } from '@/web-components/library/chrome/Docs';
import { Sec, Tbl } from '@/web-components/library/chrome/Sec';
import { bySlug } from '@/web-components/library/system/parts';
import { Button } from '@/web-components/ui/Button';

/**
 * Part 6 — iconography.
 *
 * ── THE SET IS ENUMERATED, NOT LISTED ───────────────────────────────────────
 *
 * The grid below is every export of `components/shell/Icons`, read off the
 * module. A hand-kept list on this page would answer the question "which icons
 * did somebody remember to document" — which is not the question anybody opens
 * an iconography page to ask. Add a glyph to the module and it appears here;
 * the only way to have an undocumented icon is to keep it somewhere else.
 *
 * ── AND WHY THE STROKE IS A CONSTANT, NOT A PROP ────────────────────────────
 *
 * `stroke-width: 1.6` lives in one object inside the module. Eleven copies of
 * it would be eleven places it can drift, and a set where one glyph is 1.5 and
 * the rest are 1.6 does not read as a bug — it reads as that one glyph being
 * slightly wrong in a way nobody can name.
 */
export const metadata = { title: 'Iconography · Design system' };

/** Every named glyph in the shell set, minus the primitive they are built on. */
const SET = Object.entries(Icons)
  .filter(([name]) => name !== 'Glyph')
  .sort(([a], [b]) => a.localeCompare(b)) as [string, (p: { size?: number }) => React.ReactNode][];

const GEOMETRY = [
  ['Canvas', '24 × 24, always. A glyph drawn on a different grid cannot share the set’s optical weight.'],
  ['Stroke', '1.6, from one shared constant. Never per-icon.'],
  ['Ends', 'Round cap, round join.'],
  ['Fill', 'None. Every glyph in this set is a stroke drawing.'],
  ['Colour', '`currentColor`. An icon takes the ink of the thing it sits in, so it is correct in both themes without a second table.'],
  ['Default size', '18px in the flow of a row; the `size` prop exists for the rail and for a figure-scale glyph.'],
];

export default function Page() {
  return (
    <Sec part={bySlug('iconography')!}>
      <Blk
        title="The set"
        tag={`${SET.length} glyphs`}
        lede={
          <>
            One table, drawn verbatim from the design set&rsquo;s own generator. Verbatim matters: an icon
            that shifts by a pixel between two files is a diff nobody can read, and these same paths are
            drawn across every screen in the product. The auth flow keeps its own four in{' '}
            <code>components/auth/Icons.tsx</code>, deliberately apart — nothing in sign-in should pull in
            the navigation rail&rsquo;s icon table.
          </>
        }
      >
        <div className="sec__ic">
          {SET.map(([name, Icon]) => (
            <div key={name}>
              <Icon size={22} />
              <b>{name}</b>
            </div>
          ))}
        </div>
      </Blk>

      <Blk title="Geometry" tag="the values that make it one set">
        <Tbl
          cols={['Property', 'Value']}
          rows={GEOMETRY.map(([k, v]) => ({ key: k, cells: [<b key="k">{k}</b>, v] }))}
        />
        <Bench style={{ gap: 30, marginTop: 6 }}>
          <Cell label="16 · INSIDE A DENSE ROW">
            <Icons.Clock size={16} />
          </Cell>
          <Cell label="18 · DEFAULT">
            <Icons.Clock size={18} />
          </Cell>
          <Cell label="22 · A RAIL DESTINATION">
            <Icons.Clock size={22} />
          </Cell>
          <Cell label="INHERITS ITS INK">
            <span style={{ color: 'var(--tx-danger)', display: 'inline-flex', gap: 10 }}>
              <Icons.Warn size={22} />
              <Icons.No size={22} />
            </span>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Rules of use"
        lede={
          <>
            An icon is a second encoding of something the interface already says in words — never the only
            one. The exception is the icon-only button, and it earns the exception by carrying a real
            accessible name.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <Bench plain style={{ gap: 10 }}>
                <Button icon={<Icons.Plus />} variant="primary">
                  Add client
                </Button>
                <Button iconOnly label="More actions" icon={<Icons.Ellipsis />} variant="ghost" />
              </Bench>
            ),
            caption: (
              <>
                The glyph supports a word, or the button carries a name the eye never sees. Both are
                announced correctly.
              </>
            ),
          }}
          no={{
            figure: (
              <Bench plain style={{ gap: 10 }}>
                <span style={{ display: 'inline-flex', gap: 14, color: 'var(--tx-ink-2)' }}>
                  <Icons.Star size={20} />
                  <Icons.Pin size={20} />
                  <Icons.Eye size={20} />
                </span>
              </Bench>
            ),
            caption: (
              <>
                A row of bare glyphs as the only label for three different actions. Two of the three are
                guesses, and a guess in a toolbar is a mis-click.
              </>
            ),
          }}
        />
        <p className="blk__p" style={{ marginTop: 16 }}>
          Every glyph in the set is <code>aria-hidden</code>, because the name belongs to the control rather
          than to the drawing. A decorative icon that announces itself is one more thing a screen reader has
          to say before it reaches the thing that matters.
        </p>
        <p className="blk__p">
          Use the universally recognised shape where one exists — a magnifier for search, a bell for
          notifications — and do not invent a glyph for a concept the product names in one short word. A
          drawing nobody can name is slower to read than the word it replaced.
        </p>
      </Blk>
    </Sec>
  );
}

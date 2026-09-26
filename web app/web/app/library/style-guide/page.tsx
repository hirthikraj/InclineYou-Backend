import { Blk } from '@/web-components/library/chrome/Blk';
import { Sec, Tbl, Tk } from '@/web-components/library/chrome/Sec';
import { bySlug } from '@/web-components/library/system/parts';
import { group, root, theme, value } from '@/web-components/library/system/tokens';

/**
 * Part 2 — the style guide.
 *
 * ── EVERY NUMBER ON THIS PAGE IS READ, NOT WRITTEN ──────────────────────────
 *
 * A style guide is the page most likely to be quietly wrong, because every
 * entry on it is a copy of a value that lives somewhere else. So the sizes are
 * read out of the stylesheet, the specimens are SET in the tokens they
 * describe, and the swatches are painted with the token rather than with its
 * hex. A swatch that disagrees with the product is not possible here: it is the
 * same declaration.
 *
 * ── WHY TYPE IS SHOWN AT ITS OWN SIZE ───────────────────────────────────────
 *
 * A scale printed as a table of numbers is a table, not a scale. The thing a
 * reader needs to judge is whether 17px and 15px are far enough apart to rank
 * two lines of text, and that question has no answer in the abstract. Each step
 * is set in its own token, at its own line-height and tracking.
 */
export const metadata = { title: 'Style guide · Design system' };

const SCALE: { token: string; lh: string; use: string }[] = [
  { token: '--tx-fig', lh: '--tx-fig-lh', use: 'The one figure a screen is about — the clock on Today, the money figure on a card.' },
  { token: '--tx-fig-sm', lh: '--tx-fig-sm-lh', use: 'A secondary figure, or the primary one where two share a row.' },
  { token: '--tx-head', lh: '--tx-head-lh', use: 'A section heading. The largest thing that is still words rather than a number.' },
  { token: '--tx-name', lh: '--tx-name-lh', use: 'A person, a workout, a row’s subject — the thing the row is about.' },
  { token: '--tx-body', lh: '--tx-body-lh', use: 'Everything read at length. The default, and the size the application’s base is set at.' },
  { token: '--tx-meta', lh: '--tx-meta-lh', use: 'The line under the name: dates, counts, the quiet half of a row.' },
  { token: '--tx-micro', lh: '--tx-micro-lh', use: 'Labels and units. Uppercase, tracked, mono — never a sentence.' },
];

/** The palette rows worth showing side by side. The rest live on part 10. */
const PALETTE: { token: string; role: string }[] = [
  { token: '--tx-canvas', role: 'The page behind everything, and the only step that is white.' },
  { token: '--tx-surface', role: 'A card, a panel, a row. One step DOWN from the page, not lifted above it.' },
  { token: '--tx-surface-2', role: 'One step deeper again: a header inside a card, a hover ground, anything set into a surface.' },
  { token: '--tx-line', role: 'The hairline that does the structural work instead of a shadow.' },
  { token: '--tx-line-strong', role: 'The rule that separates two sections rather than two rows.' },
  { token: '--tx-ink', role: 'Text that is the point.' },
  { token: '--tx-ink-2', role: 'Text that supports it.' },
  { token: '--tx-ink-3', role: 'The quiet step — 6.1:1 light, 6.0:1 dark. Still words.' },
  { token: '--tx-ink-off', role: 'Not a text colour. A rest dot, a grab handle, a glyph — the 3:1 floor for a shape, held on all four grounds rather than on white alone.' },
  { token: '--tx-accent', role: 'The lime. A FILL, and only ever a fill.' },
  { token: '--tx-accent-text', role: 'Lime as words. Dark on light, because #C6F24E on white is 1.5:1.' },
  { token: '--tx-ok', role: 'Done, paid, synced.' },
  { token: '--tx-warn', role: 'Due, pending, about to matter.' },
  { token: '--tx-danger', role: 'Failed, overdue, destructive.' },
  { token: '--tx-info', role: 'Neutral emphasis that is not a state.' },
];

export default function Page() {
  const r = root();
  const dark = theme('dark');
  const light = theme('light');
  const spacing = group(['--tx-s'], r).filter((t) => /^--tx-s\d+$/.test(t.name));
  const radius = group(['--tx-r'], r);

  return (
    <Sec part={bySlug('style-guide')!}>
      <Blk
        title="Typefaces"
        tag="three, with one job each"
        lede={
          <>
            Three families, and the rule is which question each one answers rather than which looks better.
            The brand face is never used for anything read at length, and the mono face is never used for
            prose — it is here so a figure keeps its column when its digits change.
          </>
        }
      >
        {/* `minmax(0,1fr)`, not the default `auto`. A grid item's min-width is
            min-content, and the specimen below is `white-space:nowrap` — so its
            min-content is the whole line, the card refuses to be narrower than
            it, and at 375px the page grew a 534px sideways scroll. The ellipsis
            was already there; it had nothing to clip against. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 14, marginTop: 4 }}>
          {[
            { tk: '--tx-brand', name: 'Archivo', job: 'Figures, page titles, the wordmark. Set tight and heavy — it is the product’s voice, not its text.' },
            { tk: '--tx-font', name: 'Inter', job: 'Everything read at length: rows, labels, copy, controls.' },
            { tk: '--tx-mono', name: 'JetBrains Mono', job: 'Anything tabular or technical — times, units, tracked micro labels, a running clock whose digits must not change width.' },
          ].map((f) => (
            <div className="card" key={f.tk} style={{ padding: '14px 16px' }}>
              <p className="cell__l">{f.name}</p>
              <p
                className="sec__ty"
                style={{ fontFamily: `var(${f.tk})`, fontSize: 25, fontWeight: 700, margin: '5px 0 7px' }}
              >
                Sessions today &middot; ₹2,400 pending
              </p>
              <p className="libcard__d">{f.job}</p>
              <p className="libcard__d" style={{ marginTop: 6 }}>
                {/* No `opacity` here. Fading text fades it against whatever is behind it,
                    so the declared colour stops predicting the rendered one: at .7 this
                    line measured 3.38:1 while its token says 6.1:1. The stack the font
                    resolves to is quieter than the token name because it is set in
                    --tx-ink-3, which is the step that MEANS quiet, and which holds its
                    contrast wherever the line is painted. */}
                <Tk>{f.tk}</Tk> <span style={{ color: 'var(--tx-ink-3)' }}>{value(f.tk, r)}</span>
              </p>
            </div>
          ))}
        </div>
      </Blk>

      <Blk
        title="The type scale"
        tag="seven steps, each set at its own size"
        lede={
          <>
            Seven steps, each with the line-height it is meant to be set at, because a size without its
            leading is half a specification. Before this scale existed the same screen set 36 / 16 / 12.5 /
            10.5 / 13 / 11.5px with no ratio between the steps and no shared line-height rule, so nothing
            lined up against anything.
          </>
        }
      >
        <Tbl
          cols={['Step', 'Size', 'Line-height', 'Specimen', 'Where it is spent']}
          rows={SCALE.map((s) => ({
            key: s.token,
            cells: [
              <Tk key="t">{s.token}</Tk>,
              value(s.token, r),
              value(s.lh, r),
              <span
                key="s"
                className="sec__ty"
                style={{
                  fontSize: `var(${s.token})`,
                  lineHeight: `var(${s.lh})`,
                  fontFamily: s.token.startsWith('--tx-fig') ? 'var(--tx-brand)' : 'var(--tx-font)',
                  fontWeight: s.token.startsWith('--tx-fig') ? 800 : 600,
                  letterSpacing: s.token.startsWith('--tx-fig') ? 'var(--tx-track-fig)' : undefined,
                  textTransform: s.token === '--tx-micro' ? 'uppercase' : undefined,
                }}
              >
                {s.token === '--tx-micro' ? 'Next session' : '18:30'}
              </span>,
              s.use,
            ],
          }))}
        />
        <p className="blk__p" style={{ marginTop: 14 }}>
          Every figure on the scale is tabular. A running clock whose digits change width makes the card
          twitch once a second, which is the kind of bug that is felt long before it is seen.
        </p>
      </Blk>

      <Blk
        title="Colour"
        tag="two complete themes"
        lede={
          <>
            Both themes are complete — neither falls back to the other, and there is no second stylesheet.
            {' '}<code>[data-theme]</code> redefines the {dark.length} tokens and everything downstream
            follows. The swatches below are painted with the token, not with a hex copied from it.
          </>
        }
      >
        <Tbl
          cols={['Token', 'Dark', 'Light', 'What it is for']}
          rows={PALETTE.map((p) => ({
            key: p.token,
            cells: [
              <Tk key="t">{p.token}</Tk>,
              <span key="d" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="sec__sw" data-theme="dark" style={{ background: `var(${p.token})` }} />
                <span style={{ fontFamily: 'var(--tx-mono)', fontSize: 11 }}>
                  {dark.find((t) => t.name === p.token)?.value}
                </span>
              </span>,
              <span key="l" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="sec__sw" data-theme="light" style={{ background: `var(${p.token})` }} />
                <span style={{ fontFamily: 'var(--tx-mono)', fontSize: 11 }}>
                  {light.find((t) => t.name === p.token)?.value}
                </span>
              </span>,
              p.role,
            ],
          }))}
        />
        <p className="blk__p" style={{ marginTop: 16 }}>
          <b>The lime is a fill.</b> <code>#C6F24E</code> holds 1.5:1 against white, so lime as TEXT on a
          light ground is unreadable — which is why <Tk>--tx-accent-text</Tk> is a different colour in each
          theme ({light.find((t) => t.name === '--tx-accent-text')?.value} on light) while{' '}
          <Tk>--tx-accent</Tk> stays the brand value in both. Accent as a ground takes{' '}
          <Tk>--tx-accent-ink</Tk> over it, never plain ink.
        </p>
        <p className="blk__p">
          <b>The ramp runs one way: down.</b> The page is white and every surface is a step deeper than
          the thing behind it — a card below the page, a card&rsquo;s header below the card. It used to run
          the other way, a white card on a tinted page, and that version had nowhere to go: white is the
          top of the range, so a card painted white could not be lifted any further, and every step
          &ldquo;above&rdquo; it had to travel back down through the canvas. The canvas stopped meaning
          anything. Running it downward gives each step one direction and one meaning, and it is why
          <Tk>--tx-surface</Tk> is darker than <Tk>--tx-canvas</Tk> rather than lighter.
        </p>
        <p className="blk__p">
          <b>The neutrals have one hue per theme, and the ink shares it.</b> Light is a warm family at
          40° — a paper ground rather than a grey one — and dark is a cool family at 220°. The rule is
          that the ink agrees with the ground it sits on, because the version of this palette before it
          broke that rule: the light grounds were a green-grey at 90–100° while every ink on them was a
          blue-grey at 215–222°. Two opposing tints at 9% saturation do not read as either one, they
          cancel — which is the whole of why the light theme read as flat grey, and why the fix was a
          hue and not a lightness. 40° also sits next to the lime’s 76°, so the accent is now the warm
          end of a warm system instead of a cold spot on a cold one.
        </p>
        <p className="blk__p">
          <b>Colour is never alone.</b> Every state that is coloured is also worded: a danger row says what
          failed, a done chip says done. The colour is the second encoding, never the only one.
        </p>
      </Blk>

      <Blk
        title="Spacing and radius"
        tag="4pt and 8pt"
        lede={
          <>
            A 4pt spacing ramp and an 8pt radius system. Ten spacing steps is more than most screens need and
            exactly as many as the ones that hold a day&rsquo;s worth of rows do.
          </>
        }
      >
        <Tbl
          cols={['Step', 'Value', 'Shown']}
          rows={spacing.map((t) => ({
            key: t.name,
            cells: [
              <Tk key="t">{t.name}</Tk>,
              t.value,
              <span
                key="s"
                style={{
                  display: 'block',
                  height: 12,
                  width: `var(${t.name})`,
                  background: 'var(--tx-accent)',
                  borderRadius: 2,
                }}
              />,
            ],
          }))}
        />
        <div style={{ marginTop: 20 }}>
          <Tbl
            cols={['Radius', 'Value', 'Shown', 'Where']}
            rows={radius.map((t) => ({
              key: t.name,
              cells: [
                <Tk key="t">{t.name}</Tk>,
                t.value,
                <span
                  key="s"
                  style={{
                    display: 'block',
                    width: 46,
                    height: 26,
                    borderRadius: `var(${t.name})`,
                    background: 'var(--tx-surface-3)',
                    boxShadow: 'inset 0 0 0 1px var(--tx-line-strong)',
                  }}
                />,
                {
                  '--tx-r1': 'A chip, a tag, a small inset shape.',
                  '--tx-r2': 'A button, a field, a panel.',
                  '--tx-r3': 'A card, a stat tile.',
                  '--tx-r4': 'A modal, a sheet — the largest thing on screen.',
                  '--tx-rfull': 'A pill or an avatar, where the radius is the shape.',
                }[t.name] ?? '',
              ],
            }))}
          />
        </div>
      </Blk>
    </Sec>
  );
}

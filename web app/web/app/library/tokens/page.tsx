import { Blk } from '@/web-components/library/chrome/Blk';
import { Sec, Tbl, Tk } from '@/web-components/library/chrome/Sec';
import { bySlug } from '@/web-components/library/system/parts';
import { group, paletteNames, root, theme } from '@/web-components/library/system/tokens';
import { responsiveTokens } from '@/web-components/library/system/viewports';

/**
 * Part 10 — tokens.
 *
 * ── THE WHOLE PAGE IS READ OUT OF THE STYLESHEET ────────────────────────────
 *
 * Every row below is parsed from `app/styles/webapp.css` at build time. Nothing
 * is retyped, and the families are selected by PREFIX rather than by a list of
 * names — so a token added to the design system in a family this page already
 * shows appears here without anybody editing this file. That is the difference
 * between a page that documents the system and a page that documents what
 * somebody remembered about it.
 *
 * ── AND WHY var() IS NOT RESOLVED ───────────────────────────────────────────
 *
 * A token whose value is another token is printed as written, because that is
 * the fact worth showing: `--tx-brand` is `'Archivo',var(--tx-font)`, and
 * flattening it would hide that the brand face falls back to the body stack
 * rather than to a system default.
 *
 * ── THE SWATCHES ARE PAINTED, NOT PRINTED ───────────────────────────────────
 *
 * Each colour cell carries `data-theme` and fills with `var(--token)`, so the
 * browser resolves it exactly as the product will. A swatch that disagrees with
 * the application is not possible: it is the same declaration.
 */
export const metadata = { title: 'Tokens · Design system' };

/** The families, in the order a reader needs them. */
const FAMILIES: { title: string; tag: string; prefixes: string[]; lede: string }[] = [
  {
    title: 'Type',
    tag: 'scale, faces, tracking',
    prefixes: ['--tx-font', '--tx-brand', '--tx-mono', '--tx-fig', '--tx-head', '--tx-name', '--tx-body', '--tx-meta', '--tx-micro', '--tx-track'],
    lede: 'Seven steps, each with the line-height it is meant to be set at, plus the three faces and the tracking the large and small ends need.',
  },
  {
    title: 'Spacing and radius',
    tag: '4pt and 8pt',
    prefixes: ['--tx-s', '--tx-r'],
    lede: 'Ten spacing steps on a 4pt base; five radii on an 8pt system, where the largest is the shape itself.',
  },
  {
    title: 'Motion',
    tag: 'durations and curves',
    prefixes: ['--tx-t-', '--tx-ease'],
    lede: 'Four durations and four curves. What each one is for is part 7 — this is the table of values.',
  },
  {
    title: 'Layout',
    tag: 'the shell, and the density dial',
    prefixes: ['--w-'],
    lede: 'The fixed furniture of the application shell, the row heights that set its density, and the review frame the design file draws in.',
  },
  {
    title: 'Identity',
    tag: 'the avatar palette',
    prefixes: ['--tx-av-'],
    lede: 'Twelve grounds for initials, keyed from a name so one person is the same colour everywhere. White initials on every one, and every one clears 5.9:1.',
  },
];

export default function Page() {
  const r = root();
  const dark = theme('dark');
  const light = theme('light');
  const names = paletteNames();

  return (
    <Sec part={bySlug('tokens')!}>
      <p className="doc__lede" style={{ marginTop: 20, fontSize: 15 }}>
        {r.length} tokens on <code>:root</code> and {dark.length} per theme, read out of{' '}
        <code>app/styles/webapp.css</code> when this page was built. Nothing here is a copy: change a value
        in the design system, run the sync, and this page moves with the product because it has no opinion of
        its own.
      </p>

      <Blk
        title="Colour"
        tag={`${names.length} tokens, both themes`}
        lede={
          <>
            Both themes are complete — neither falls back to the other, and there is no second stylesheet.{' '}
            <code>[data-theme]</code> redefines these and everything downstream follows. Each swatch is
            filled with <code>var()</code> inside the theme it reports, so the browser resolves it exactly as
            the application will.
          </>
        }
      >
        <Tbl
          cols={['Token', 'Dark', 'Value', 'Light', 'Value']}
          rows={names.map((n) => {
            const d = dark.find((t) => t.name === n)?.value;
            const l = light.find((t) => t.name === n)?.value;
            const paintable = (v?: string) => !!v && !v.startsWith('url(') && !v.startsWith('linear(');
            return {
              key: n,
              cells: [
                <Tk key="t">{n}</Tk>,
                paintable(d) ? (
                  <span key="ds" className="sec__sw sec__sw--wide" data-theme="dark" style={{ background: `var(${n})` }} />
                ) : (
                  '—'
                ),
                <span key="dv" style={{ fontFamily: 'var(--tx-mono)', fontSize: 11, wordBreak: 'break-all' }}>
                  {d ? clip(d) : '—'}
                </span>,
                paintable(l) ? (
                  <span key="ls" className="sec__sw sec__sw--wide" data-theme="light" style={{ background: `var(${n})` }} />
                ) : (
                  '—'
                ),
                <span key="lv" style={{ fontFamily: 'var(--tx-mono)', fontSize: 11, wordBreak: 'break-all' }}>
                  {l ? clip(l) : '—'}
                </span>,
              ],
            };
          })}
        />
        <p className="blk__p" style={{ marginTop: 16 }}>
          A shadow, a gradient and a data-URI chevron all live in this table because they are all{' '}
          <i>theme-dependent values</i>, which is what a theme token is. The ones that cannot be shown as a
          filled square say so rather than drawing a misleading one.
        </p>
      </Blk>

      {FAMILIES.map((f) => {
        const rows = group(f.prefixes, r);
        return (
          <Blk title={f.title} tag={f.tag} lede={f.lede} key={f.title}>
            <Tbl
              cols={['Token', 'Value']}
              rows={rows.map((t) => ({
                key: t.name,
                cells: [
                  <Tk key="t">{t.name}</Tk>,
                  <span key="v" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--tx-mono)', fontSize: 11.5, wordBreak: 'break-all' }}>
                      {clip(t.value)}
                    </span>
                    {t.name.startsWith('--tx-av-') ? (
                      <span className="sec__sw" style={{ background: `var(${t.name})` }} />
                    ) : null}
                  </span>,
                ],
              }))}
            />
          </Blk>
        );
      })}

      <Blk
        title="Across viewports"
        tag="the values that move"
        lede={
          <>
            Every table above reports a token&rsquo;s value on <code>:root</code> — which is its value on a
            desk, and on a phone is sometimes not its value at all. These are the tokens the stylesheets
            redeclare inside a width query, with each value and the query that sets it. Found by searching
            both stylesheets rather than listed here, so a token given a phone value tomorrow appears
            without anybody editing this page.
          </>
        }
      >
        <Tbl
          cols={['Token', 'Base', 'Overridden to', 'Where']}
          rows={responsiveTokens().map((t) => {
            const base = t.at.find((d) => !d.media);
            const over = t.at.filter((d) => d.media);
            return {
              key: t.name,
              cells: [
                <Tk key="t">{t.name}</Tk>,
                base ? (
                  <span key="b" style={{ fontFamily: 'var(--tx-mono)', fontSize: 11.5 }}>{clip(base.value)}</span>
                ) : (
                  <i key="b">never — phone only</i>
                ),
                <span key="o" style={{ fontFamily: 'var(--tx-mono)', fontSize: 11.5 }}>
                  {over.map((d, i) => (
                    <span key={i} style={{ display: 'block' }}>{clip(d.value)}</span>
                  ))}
                </span>,
                <span key="w" style={{ fontFamily: 'var(--tx-mono)', fontSize: 11 }}>
                  {over.map((d, i) => (
                    <span key={i} style={{ display: 'block' }}>
                      {d.media} &middot; <b style={{ fontWeight: 500 }}>{d.selector}</b>
                    </span>
                  ))}
                </span>,
              ],
            };
          })}
        />
        <p className="blk__p" style={{ marginTop: 16 }}>
          <b>A token with no base value is the one worth looking at.</b> <code>--w-tabs</code> is the bottom
          tab bar&rsquo;s whole height and it is declared nowhere but inside a <code>max-width</code> block,
          so on a desk it does not exist — <code>var(--w-tabs)</code> there resolves to nothing at all. That
          is correct, and it is the kind of fact a tokens page reporting only <code>:root</code> cannot
          state: it would have shown this token as absent from the system rather than as present on half of
          it.
        </p>
      </Blk>

      <Blk
        title="Using a token"
        lede={
          <>
            A value typed at a call-site is a value the system cannot move. Anything that could be named here
            and is not is a place the product will have to be changed twice.
          </>
        }
      >
        <Tbl
          cols={['Do', 'Don’t']}
          rows={[
            { key: '1', cells: ['color: var(--tx-ink-2)', 'color: #A2A9B4 — right today, wrong in the other theme'] },
            { key: '2', cells: ['padding: var(--tx-s3) var(--tx-s4)', 'padding: 12px 16px — off the ramp the moment the ramp moves'] },
            { key: '3', cells: ['transition: … var(--tx-t-fast) var(--tx-ease)', 'transition: … .18s ease-out — a fifth curve nobody agreed to'] },
            { key: '4', cells: ['background: var(--tx-accent); color: var(--tx-accent-ink)', 'color: var(--tx-accent) as text — 1.5:1 on white'] },
          ]}
        />
      </Blk>
    </Sec>
  );
}

/** A long value, kept to one readable line. The full text is in the stylesheet. */
function clip(v: string) {
  return v.length > 78 ? `${v.slice(0, 78)}…` : v;
}

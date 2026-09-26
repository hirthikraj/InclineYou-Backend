import Link from 'next/link';

import { Blk, Bench, Cell } from '@/web-components/library/chrome/Blk';
import { Sec, Tbl, Tk } from '@/web-components/library/chrome/Sec';
import { bySlug } from '@/web-components/library/system/parts';
import { root, theme, value } from '@/web-components/library/system/tokens';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';

/**
 * Part 5 — accessibility.
 *
 * ── WHY THIS PAGE IS A LIST OF NUMBERS ──────────────────────────────────────
 *
 * Because the alternative is a list of intentions, and intentions are what an
 * accessibility page usually is: a paragraph about inclusivity, a promise to
 * care about contrast, and no number anybody can fail. Every row here is a
 * threshold with a measurement against it, which is the only form of this page
 * that can be wrong — and therefore the only form worth writing.
 *
 * ── THE ONE THAT WAS WRONG ──────────────────────────────────────────────────
 *
 * The quiet ink step is the honest example and it is kept on the page for that
 * reason. `--tx-ink-off` was #A9AFB8 on light and #4A505A on dark: 2.21:1 and
 * 2.31:1 against the surfaces they sat on. That is under 1.4.11's 3:1 for a
 * non-text thing carrying meaning, and nowhere near 1.4.3's 4.5:1 for the
 * eleven places that were using it as WORDS. The stylesheet had already settled
 * the same argument once, in `.slot`, and the ramp still carried the bug.
 *
 * A page that only lists the rules the product passes is a page that teaches
 * nobody where the failures come from.
 */
export const metadata = { title: 'Accessibility · Design system' };

const TARGETS = [
  ['--w-tap', 'Pointer-only controls: icon buttons, chips, row menus.'],
  ['--w-tap-touch', 'Anything plausibly touched on a convertible laptop.'],
  ['--w-row', 'The standard list or table row.'],
  ['--w-row-lg', 'Rows carrying two lines of text.'],
];

const ROLES = [
  ['A tag', 'No role at all. It is a label, and a label that announces itself as something is a label that lies.'],
  ['A toast', '`role="status"` — polite. It is news, not an interruption.'],
  ['A failure', '`role="alert"` — assertive, and only for something that just happened in response to an action.'],
  ['A loading region', '`aria-busy` on the container.'],
  ['The current page', '`aria-current="page"` — the same fact the highlight states, in the form a screen reader can read.'],
  ['An icon-only button', 'A real accessible name in `label`. The component will not compile without one.'],
];

export default function Page() {
  const r = root();
  const light = theme('light');
  const dark = theme('dark');

  return (
    <Sec part={bySlug('accessibility')!}>
      <Blk
        title="Contrast"
        tag="4.5:1 for text, in both themes"
        lede={
          <>
            Text clears 4.5:1 in both themes, and it is measured <i>after</i> the material behind it — the
            overlay lesson: 4.58:1 flat became 4.45:1 over glass, which is a fail that no flat measurement
            would ever have caught.
          </>
        }
      >
        <Tbl
          cols={['Step', 'Dark', 'Light', 'Rule']}
          rows={[
            {
              key: 'ink',
              cells: [
                <Tk key="t">--tx-ink</Tk>,
                <Sw key="d" t="dark" v={dark.find((x) => x.name === '--tx-ink')?.value} />,
                <Sw key="l" t="light" v={light.find((x) => x.name === '--tx-ink')?.value} />,
                'Text that is the point. Well past 4.5:1 in both.',
              ],
            },
            {
              key: 'ink3',
              cells: [
                <Tk key="t">--tx-ink-3</Tk>,
                <Sw key="d" t="dark" v={dark.find((x) => x.name === '--tx-ink-3')?.value} />,
                <Sw key="l" t="light" v={light.find((x) => x.name === '--tx-ink-3')?.value} />,
                '5.9:1 light, 5.6:1 dark. The quiet step that is still words.',
              ],
            },
            {
              key: 'off',
              cells: [
                <Tk key="t">--tx-ink-off</Tk>,
                <Sw key="d" t="dark" v={dark.find((x) => x.name === '--tx-ink-off')?.value} />,
                <Sw key="l" t="light" v={light.find((x) => x.name === '--tx-ink-off')?.value} />,
                'NOT a text colour. A rest dot, a grab handle, a glyph — held to 1.4.11’s 3:1 floor for a shape that carries meaning.',
              ],
            },
            {
              key: 'acc',
              cells: [
                <Tk key="t">--tx-accent-text</Tk>,
                <Sw key="d" t="dark" v={dark.find((x) => x.name === '--tx-accent-text')?.value} />,
                <Sw key="l" t="light" v={light.find((x) => x.name === '--tx-accent-text')?.value} />,
                'Lime as words. #C6F24E holds 1.5:1 on white, so light gets a different colour rather than a lighter rule.',
              ],
            },
          ]}
        />
        <p className="blk__p" style={{ marginTop: 16 }}>
          <b>Colour is never the only encoding.</b> A danger row says what failed; a done chip says done. The
          colour is the second signal — which is also what keeps the product readable for the third of the
          audience reading it outdoors on a phone at midday.
        </p>
      </Blk>

      <Blk
        title="Targets"
        tag="24px floor, 32px practical"
        lede={
          <>
            WCAG 2.2 SC 2.5.8 sets 24px for a pointer target. The application floor is 32px, and it is met
            with invisible slop — a <code>::before</code> that extends the hit area — rather than by
            inflating the visual, because a 32px dashed square would out-shout the content it sits between.
          </>
        }
      >
        <Tbl
          cols={['Token', 'Value', 'What it sizes']}
          rows={TARGETS.map(([t, use]) => ({
            key: t,
            cells: [<Tk key="t">{t}</Tk>, value(t, r), use],
          }))}
        />
      </Blk>

      <Blk
        title="Keyboard"
        tag="reachable, operable, escapable"
        lede={
          <>
            Everything interactive is reachable, operable and escapable from the keyboard, and the ring that
            proves it is <code>:focus-visible</code> — never a bare <code>:focus</code>, which puts a ring on
            a control somebody clicked.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="THE RING">
            {/* The declarations §04 applies on `:focus-visible`, written inline:
                a static specimen cannot be focused, and a ring nobody can see
                on the page that documents it is the wrong kind of accurate. */}
            <Button
              variant="primary"
              style={{
                outline: '2px solid var(--tx-focus)',
                outlineOffset: 2,
                boxShadow: '0 0 0 5px var(--tx-focus-halo)',
              }}
            >
              Record payment
            </Button>
          </Cell>
          <Cell label="TAB ORDER">
            <span style={{ fontSize: 13, color: 'var(--tx-ink-2)', maxWidth: '34ch', display: 'block' }}>
              Document order, always. No positive <code>tabindex</code> anywhere in the product.
            </span>
          </Cell>
          <Cell label="ESCAPE">
            <span style={{ fontSize: 13, color: 'var(--tx-ink-2)', maxWidth: '34ch', display: 'block' }}>
              Closes the panel, the modal and the palette, and returns focus to whatever opened it.
            </span>
          </Cell>
        </Bench>
        <p className="blk__p" style={{ marginTop: 16 }}>
          An accelerator is never the only route (SC 2.5.7): every drag has a keyboard equivalent, and the
          hours editor documents its own on the screen it lives on.
        </p>
      </Blk>

      <Blk
        title="Announcement"
        tag="the right role, and nothing extra"
        lede={
          <>
            The commonest accessibility bug in a component library is not a missing role — it is an extra
            one. A live region that re-reads a standing note on every unrelated update is noise, and noise is
            what makes people switch the screen reader’s verbosity down.
          </>
        }
      >
        <Tbl cols={['Thing', 'What it announces']} rows={ROLES.map(([k, v]) => ({ key: k, cells: [<b key="k">{k}</b>, v] }))} />
        <Bench style={{ gap: 18, marginTop: 4 }}>
          <Cell label="NO ROLE — IT IS A LABEL">
            <Tag>Online</Tag>
          </Cell>
          <Cell label="NO ROLE — IT IS A LABEL">
            <Tag tone="warn">Pack ending</Tag>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Reduced motion"
        tag="the whole vocabulary collapses"
        lede={
          <>
            Under <code>prefers-reduced-motion</code> states still change — they simply stop travelling.
            Nothing is removed, nothing becomes unreachable, and no information is carried only by the
            movement that is now gone. The full list is on{' '}
            <Link href="/library/motion">part 7</Link>.
          </>
        }
      />
    </Sec>
  );
}

/** A swatch and its value, painted in the theme being reported. */
function Sw({ t, v }: { t: 'dark' | 'light'; v?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="sec__sw" data-theme={t} style={{ background: v }} />
      <span style={{ fontFamily: 'var(--tx-mono)', fontSize: 11 }}>{v}</span>
    </span>
  );
}

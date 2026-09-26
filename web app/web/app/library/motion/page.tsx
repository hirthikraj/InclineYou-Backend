import { Blk } from '@/web-components/library/chrome/Blk';
import { Sec, Tbl, Tk } from '@/web-components/library/chrome/Sec';
import { bySlug } from '@/web-components/library/system/parts';
import { group, root, value } from '@/web-components/library/system/tokens';

/**
 * Part 7 — motion.
 *
 * ── WHY THE SPECIMENS MOVE ON HOVER AND NOT ON A LOOP ───────────────────────
 *
 * A page of eight bars all looping is a page nobody can read, and the reader
 * who wants to compare two curves wants to start them himself — otherwise they
 * are never in phase and the comparison is impossible. Hover and focus both
 * trigger, so the comparison is available from the keyboard too.
 *
 * ── AND WHY THE DURATIONS ARE SHOWN AS DISTANCE ─────────────────────────────
 *
 * 180ms and 240ms are indistinguishable as numbers and obvious as movement.
 * That is the whole reason this part is a page rather than a row in the tokens
 * table: the values are only meaningful in motion.
 */
export const metadata = { title: 'Motion · Design system' };

const WHAT_GETS_WHICH = [
  ['A knob changing state', '--tx-t-instant', 'A switch, a checkbox, a chip going selected. It has already happened; the movement only says so.'],
  ['A hover or a colour change', '--tx-t-fast', 'Border, ground, ink. Fast enough that the pointer does not outrun it.'],
  ['Something arriving or leaving', '--tx-t-base', 'A panel, a menu, a modal. The default for anything that travels.'],
  ['Something large, or a measured value', '--tx-t-slow', 'A meter filling, a docked panel pushing the plane.'],
  ['The toast deck resettling', '--tx-t-spring', 'The one place a real spring is spent — see below.'],
];

const CURVES = [
  ['--tx-ease', 'Everything that arrives or changes in place. The house curve.'],
  ['--tx-ease-exit', 'Things leaving. It starts fast: an exit that eases in reads as reluctance.'],
  ['--tx-ease-spring', 'Small state knobs only — switch, check, radio. Overshoot on a layout-sized move reads as lag.'],
  ['--tx-ease-real-spring', 'The toast deck, and nothing else.'],
];

export default function Page() {
  const r = root();
  const durations = group(['--tx-t-'], r);

  return (
    <Sec part={bySlug('motion')!}>
      <Blk
        title="Durations"
        tag="four, plus the deck’s"
        lede={
          <>
            Nothing in the product is slower than 400ms except the toast deck, which has a reason. Hover a
            bar to run it; two bars run in phase if you start them together, which is the only way to judge
            the difference between them.
          </>
        }
      >
        <Tbl
          cols={['Token', 'Value', 'Run it']}
          rows={durations.map((t) => ({
            key: t.name,
            cells: [
              <Tk key="t">{t.name}</Tk>,
              t.value,
              <span
                key="m"
                className="sec__mo"
                tabIndex={0}
                style={
                  {
                    display: 'block',
                    '--d': t.value,
                    '--e':
                      t.name === '--tx-t-spring'
                        ? 'var(--tx-ease-real-spring)'
                        : 'var(--tx-ease)',
                  } as React.CSSProperties
                }
              >
                <i />
              </span>,
            ],
          }))}
        />
      </Blk>

      <Blk
        title="Curves"
        tag="four, with one rule each"
        lede={
          <>
            A duration says how long; a curve says what kind of thing moved. The two that matter most are the
            pair: things arrive on <Tk>--tx-ease</Tk> and leave on <Tk>--tx-ease-exit</Tk>, because an
            exit that eases in reads as the interface being reluctant to let go.
          </>
        }
      >
        <Tbl
          cols={['Token', 'Value', 'Where', 'Run it']}
          rows={CURVES.map(([name, use]) => ({
            key: name,
            cells: [
              <Tk key="t">{name}</Tk>,
              <span key="v" style={{ fontFamily: 'var(--tx-mono)', fontSize: 11 }}>
                {name === '--tx-ease-real-spring'
                  ? 'linear(…21 samples)'
                  : value(name, r)}
              </span>,
              use,
              <span
                key="m"
                className="sec__mo"
                tabIndex={0}
                style={
                  {
                    display: 'block',
                    '--d': name === '--tx-ease-real-spring' ? value('--tx-t-spring', r) : value('--tx-t-base', r),
                    '--e': `var(${name})`,
                  } as React.CSSProperties
                }
              >
                <i />
              </span>,
            ],
          }))}
        />
        <p className="blk__p" style={{ marginTop: 16 }}>
          <b>The real spring, and the one place a bezier could not stand in.</b> The toast deck is the only
          thing in this system where several boxes move at once, each a beat behind the last, and a bezier
          reshuffling four cards reads as four things sliding rather than one stack settling. So{' '}
          <Tk>--tx-ease-real-spring</Tk> is <code>spring(stiffness 400, damping 30, mass 1)</code> —
          ζ = 0.75, ω₀ = 20 rad/s — sampled at 21 points and written as <code>linear()</code>, which is a
          native easing function and costs nothing at runtime. Overshoot peaks at 1.028 and it is settled by{' '}
          {value('--tx-t-spring', r)}: long for a knob, right for a card that travelled 60px. Nothing smaller
          than the deck gets it.
        </p>
      </Blk>

      <Blk
        title="What gets which"
        lede={<>The table a component author actually needs: the thing that moved, and what it moves on.</>}
      >
        <Tbl
          cols={['What moved', 'Duration', 'Why']}
          rows={WHAT_GETS_WHICH.map(([what, token, why]) => ({
            key: what,
            cells: [<b key="w">{what}</b>, <Tk key="t">{token}</Tk>, why],
          }))}
        />
      </Blk>

      <Blk
        title="Reduced motion"
        tag="the vocabulary collapses, the information does not"
        lede={
          <>
            Under <code>prefers-reduced-motion</code> states still change — they stop travelling. Nothing
            becomes unreachable and no fact is carried only by the movement that is now gone.
          </>
        }
      >
        <Tbl
          cols={['What', 'Under reduced motion']}
          rows={[
            { key: 'overlay', cells: [<b key="k">Panels, modals, the palette, menus, the scrim</b>, 'No entrance animation. They are simply there.'] },
            { key: 'press', cells: [<b key="k">Press physics</b>, 'No transform on `:active`. The ground still changes, so a press is still felt.'] },
            { key: 'raise', cells: [<b key="k">A card that lifts on hover</b>, 'No lift. The border still strengthens.'] },
            { key: 'deck', cells: [<b key="k">The toast deck</b>, 'Still stacks — the depth transform is how four confirms fit where one card does — but it stops travelling.'] },
          ]}
        />
        <p className="blk__p" style={{ marginTop: 16 }}>
          One rule that is not about preference: <code>backdrop-filter</code> is never animated. It is the
          single most expensive thing on the overlay layer, and animating it drops frames on exactly the
          hardware least able to spare them.
        </p>
      </Blk>
    </Sec>
  );
}

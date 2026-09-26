import { WeekDots, type WeekDay } from '../../../ui/WeekDots';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const L = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const N = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const week = (states: WeekDay['state'][], today?: number): WeekDay[] =>
  states.map((state, i) => ({ letter: L[i], name: N[i], state, today: i === today }));

export function WeekDotsEntry() {
  const entry = byId('c-weekdots')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/WeekDots.tsx</code> },
        { k: 'Class', v: <code>.wkd</code> },
        { k: 'Cells', v: '7, always' },
        { k: 'States', v: '4, plus today' },
        { k: 'Used in', v: 'the client portal’s Home' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            One client&rsquo;s own week. Seven cells, a letter each, and a figure over it that resets
            every Monday.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="MID-WEEK · TRAINED MON AND WED, FRIDAY TO COME" stretch>
            <div style={{ width: 300 }}>
              <WeekDots
                done={2}
                planned={3}
                days={week(['done', 'rest', 'done', 'rest', 'plan', 'rest', 'rest'], 3)}
              />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="A count, and deliberately not a streak"
        lede={
          <>
            The client spec is explicit: <em>&ldquo;Prefer a weekly count over a streak. Streaks
            punish one bad week by erasing months of effort, and a broken streak is a common quit
            trigger.&rdquo;</em> So the figure is <b>3 of 4</b> — a number that cannot be lost — and
            there is no flame, no multiplier and no days-in-a-row anywhere in the component. There is
            nothing here to break, which is the feature.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 210 }}>
                <WeekDots
                  done={3}
                  planned={4}
                  days={week(['done', 'rest', 'done', 'miss', 'done', 'rest', 'rest'])}
                />
              </div>
            ),
            caption: (
              <>
                A missed Thursday leaves the count at <b>3 of 4</b>. Next Monday it is 0 of 4 again
                and nothing was destroyed.
              </>
            ),
          }}
          no={{
            figure: (
              <div style={{ width: 210 }}>
                <p className="wkd__n">
                  0 <span>day streak — lost!</span>
                </p>
                <div className="wkd">
                  {week(['done', 'rest', 'done', 'miss', 'plan', 'rest', 'rest']).map((d, i) => (
                    <div key={i} className="wkd__d">
                      <div
                        className="wkd__c"
                        style={
                          d.state === 'miss'
                            ? { background: 'var(--tx-danger-soft)', boxShadow: 'inset 0 0 0 1px var(--tx-danger)' }
                            : undefined
                        }
                      />
                      <span className="wkd__l">{d.letter}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
            caption: (
              <>
                A streak counter, and a red cell for the day it broke. Both are uninstall design —
                the brief&rsquo;s <em>&ldquo;never shame&rdquo;</em> rule in one figure.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="Four states, and two of them are the same weight on purpose"
        lede={
          <>
            <code>done</code> is the only lime cell in the row. <code>plan</code> is dashed rather
            than tinted, because a tint reads as a weaker version of done and <em>not yet</em> is not
            a weaker version of anything. And <code>miss</code> is drawn at exactly the weight of{' '}
            <code>rest</code>: hollow, on the canvas, reading as <em>nothing happened here</em> —
            which is true. <code>--tx-danger</code> appears nowhere in this block, and a pass adding
            it would be reversing the brief rather than filling a gap.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="ALL FOUR, LEFT TO RIGHT · DONE · PLAN · REST · MISS" stretch>
            <div style={{ width: 200 }}>
              <div className="wkd">
                {(['done', 'plan', 'rest', 'miss'] as WeekDay['state'][]).map((s) => (
                  <div key={s} className="wkd__d">
                    <div className={`wkd__c wkd__c--${s}`} />
                    <span className="wkd__l">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </Cell>
          <Cell label="TODAY IS A RING, SO IT COMPOSES WITH ALL FOUR" stretch>
            <div style={{ width: 200 }}>
              <div className="wkd">
                {(['done', 'plan', 'rest', 'miss'] as WeekDay['state'][]).map((s) => (
                  <div key={s} className="wkd__d wkd__d--now">
                    <div className={`wkd__c wkd__c--${s}`} />
                    <span className="wkd__l">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The denominator is the plan’s number, not the diary’s"
        lede={
          <>
            <code>planned</code> is what the week was <em>meant</em> to hold, and not{' '}
            <code>days.filter(…).length</code>. A client whose trainer cancelled Wednesday still
            reads <b>3 of 4</b>: four is what they signed up for, and the count is a fact about the
            week rather than about the diary. Deriving it from the cells would silently reward a
            cancellation by shrinking the target.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="TRAINER CANCELLED WEDNESDAY — STILL OF 4" stretch>
            <div style={{ width: 300 }}>
              <WeekDots
                done={3}
                planned={4}
                days={week(['done', 'rest', 'rest', 'done', 'done', 'rest', 'rest'])}
              />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="tokens">
        <SpecTable
          rows={[
            { property: 'Columns', value: '7', note: 'Always. A shorter week is a bug in the caller’s date maths.' },
            { property: 'Cell', value: 'aspect-ratio 1, r1', token: '--tx-r1' },
            { property: 'Gap', value: '6px', note: 'Under --tx-s2, because seven cells at s2 will not hold 320px.' },
            { property: 'done', value: 'accent fill + dark tick', token: '--tx-accent' },
            { property: 'plan', value: '1px inset ring', token: '--tx-accent-line' },
            { property: 'rest', value: 'flat surface-2', token: '--tx-surface-2' },
            { property: 'miss', value: 'canvas + line ring', token: '--tx-line', note: 'Identical weight to rest. See above.' },
            { property: 'today', value: '2px outline, offset 2', token: '--tx-accent-line', note: 'Outside the cell, so it composes with all four states.' },
            { property: 'Figure', value: 'Archivo 800 / 19px', token: '--tx-brand' },
          ]}
        />
      </Blk>

      <Blk
        title="What a reader hears"
        lede={
          <>
            Each cell is a <code>role=&quot;img&quot;</code> naming its day and its state —{' '}
            <em>&ldquo;Thursday, today: no session&rdquo;</em> — and the letters are{' '}
            <code>aria-hidden</code>. Without that, a reader walking the row gets{' '}
            <em>&ldquo;M, Monday trained, T, Tuesday rest day&rdquo;</em> and hears the week twice.
          </>
        }
      />
    </Cmp>
  );
}

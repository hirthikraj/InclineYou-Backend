import type { MeWire } from '@/lib/portal/api';
import {
  STATE_HEADING,
  STATE_LABEL,
  STATE_ORDER,
  unitFor,
  type ExerciseProgress,
  type ExerciseState,
} from '@/lib/portal/exercises';
import { shortDate } from '@/lib/log/log';
import { exerciseHref } from '@/lib/portal/progress-tabs';
import type { TrainingMovement } from '@/lib/portal/training';
import { dayStamp } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { Meter } from '@/web-components/ui/Meter';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { Row, Table, type Column } from '@/web-components/ui/Table';

/**
 * §3 · Progress → **Exercises** — the overview.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS WAS SEVENTEEN FULL CARDS, AND IT WAS WORSE THAN THE PAGE IT CAME FROM
 *
 * Reported as *"all exercises are listed, but there is no overview on which is
 * improving and which is stagnant"*, and measured before anything was changed:
 *
 *   | | old Progress, one page | this tab, first version |
 *   | desk  | 5.0 screens | **7.85 screens** |
 *   | phone | —           | **11.5 screens** |
 *
 * Seventeen near-identical 299px cards (347 on a phone), each with its own
 * chart. **The four-tab split fixed the summary and moved the problem in
 * here** — two full screens of scrolling showed a client two of their
 * seventeen movements.
 *
 * And the thing it was worst at was the thing it existed for. A tab whose whole
 * subject is *which of these has stalled* answered it with a sentence at the
 * top and then made you scroll eight screens to find out which two. Sorting
 * holding-first helped and was invisible: with every card the same size and the
 * same shape, an order is not a signal.
 *
 * ── SO THE CARD BECAME A ROW, AND THE CHART MOVED TO ITS OWN SCREEN ─────────
 *
 * A chart was ~60% of every card and is the one thing on it a client cannot
 * read at a glance — it needs looking AT, one movement at a time, which is a
 * different act from scanning a list. So the overview carries what scanning
 * needs (name, state, the figure, how long) and `/me/progress/exercises/:id`
 * carries what looking needs (the curve, every session, the day of the best).
 *
 * That is the same argument the tab split itself was made on, one level down —
 * and the same one `/clients` makes against opening every client's file inline.
 *
 * ── AND THE GROUPING IS THE HIGHLIGHT ──────────────────────────────────────
 *
 * *"If we are stuck in same load or rep in any exercise, that should be
 * highlighted."* A per-row tag was the first answer and it is the weaker one:
 * seventeen rows each carrying a chip is seventeen chips, and the two that
 * matter are no easier to find than they were.
 *
 * Sections are the highlight. The stalled movements are under their own heading
 * at the top of the page, with the reason beside them, and the heading names
 * the action rather than the state — see `STATE_HEADING`.
 */
export function ProgressExercises({
  me,
  rows,
  counts,
  figures,
}: {
  me: MeWire;
  /**
   * Every movement with a logged set, ever — NOT a window's worth.
   *
   * The range chips used to window this tab and they belong to Summary now:
   * the card below promises *every movement you have logged*, and a window is
   * what hides some of them. `resting` carries recency instead, which says a
   * lift has gone quiet rather than dropping it off the screen.
   */
  rows: ExerciseProgress[];
  counts: Record<ExerciseState, number>;
  /**
   * The two figures `buildExercises` does not compute — records and kilos
   * lifted — keyed by movement.
   *
   * ── WHY IT IS A SECOND BUILDER RATHER THAN TWO MORE FIELDS ────────────────
   *
   * `buildExercises` owns what a movement is DOING: the states, the holding
   * run, the rep progression, the staleness rule. `buildTraining` owns what the
   * training WAS: volume, records, the weeks. They read the same rows and
   * answer different questions, and the Summary tab reads the second one for
   * its own tiles — so taking these two columns from it is what makes *8
   * records* on the Summary and the records column here the same number by
   * construction rather than by two rules agreeing.
   *
   * A movement missing from the map is drawn as zero and bodyweight rather than
   * as a gap: the two builders skip the same rows (a set with neither a load
   * nor a rep count), so a miss means a movement with nothing measurable in it.
   */
  figures: Map<string, TrainingMovement>;
}) {
  const first = me.trainer.name.split(' ')[0];

  /* ── THE BAR'S SCALE IS THE BIGGEST MOVEMENT, ACROSS EVERY GROUP ──────────

     Computed here and not per group, which is the whole of what makes the
     column readable: scaled inside its group, a 2,100 kg movement would draw a
     full bar under *Just started* and a third of one under *Climbing*, so the
     same figure would have two lengths depending on which heading it fell
     under. A bar has to mean one thing. `ProgressHistory` states the identical
     rule about its own session bars.

     The TOTAL is carried separately because the accessible name says the share
     of the whole, which is the honest number in words even though it is not
     what the bar is drawn against. */
  const peakVolume =
    [...figures.values()].reduce((max, m) => Math.max(max, m.volumeKg), 0) || 1;
  const volumeTotal =
    [...figures.values()].reduce((sum, m) => sum + m.volumeKg, 0) || 1;

  if (rows.length === 0) {
    return (
      <div className="portal col gap4">
        <Card>
          <CardHead title="Nothing logged yet" />
          <CardBody>
            <p className="small">
              Every movement you log shows up here with its own trend — what
              you lifted, how it has moved, and every session behind it.
            </p>
            <p className="small mt3">
              <InlineLink href="/me/today">Back to today</InlineLink>
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  /* Grouped in `STATE_ORDER`, which is `buildExercises`' own sort written down
     — so the sections and the rows inside them cannot disagree about order. */
  const groups = STATE_ORDER.map((state) => ({
    state,
    rows: rows.filter((r) => r.state === state),
  })).filter((g) => g.rows.length > 0);

  /* Which count tiles are worth a column — see the note at the tile row. */
  const tiles = STATE_ORDER.filter(
    (s) => s === 'holding' || s === 'climbing' || counts[s] > 0,
  ).slice(0, 4);

  return (
    <div className="portal col gap4">
      {/* ══ the overview, in four figures ══════════════════════════════════

          What was missing: the page said *2 of your 17* in prose and nothing
          told a client the shape of the other fifteen. Four counts do, in one
          glance, and they are the first thing on the tab.

          NOT links. Each one has a section forty pixels below it carrying the
          same word, so a tile that scrolled the page would be a control whose
          whole effect is invisible on a page this short — and a tile that
          FILTERED would hide the fifteen the client just came to see counted.

          Only `holding` is toned, and `warn` is deliberately not the tone:
          amber is what this product uses for something going wrong. `acc` on
          the healthy count and a plain figure on the rest. */}
      <Card level={2}>
        <CardBody>
          {/* ── THE TILE COUNT IS THE LIST'S LENGTH, NOT A CONSTANT ──────────
              MEASURED: `up={4}` with `new` and `resting` both at zero drew two
              tiles in a four-column grid — a card half full of nothing, which
              reads as two tiles that failed to load rather than as two facts.
              `Stats` takes 2 | 3 | 4, so the visible set is resolved first and
              the grid is told how many it is actually holding.

              `holding` and `climbing` are always drawn even at zero, because
              *0 holding* is the good news this tab exists to deliver and an
              absent tile cannot say it. The other two are drawn only when they
              have something in them — nobody needs to be told they have no
              movements they have just started. */}
          <Stats up={tiles.length as 2 | 3 | 4} className="pgxstats">
            {tiles.map((s) => (
              <Stat
                key={s}
                label={STATE_LABEL[s]}
                value={String(counts[s])}
                detail={s === 'holding' ? 'same level a while' : undefined}
                tone={s === 'climbing' && counts[s] > 0 ? 'acc' : 'neutral'}
              />
            ))}
          </Stats>
          <p className="small mt3">
            {counts.holding > 0 ? (
              <>
                {counts.holding === 1 ? 'One movement has' : `${counts.holding} movements have`}{' '}
                held the same level for a few sessions — they are first below.
                Everything else is moving.
              </>
            ) : (
              <>
                Every movement you have logged. Open one for its curve and
                every session behind it.
              </>
            )}
          </p>
        </CardBody>
      </Card>

      {groups.map((g) => (
        <Card key={g.state}>
          <CardHead
            /* The holding group names the trainer, because the heading is the
               action: *Worth a word with Arun*. The other three are states. */
            title={g.state === 'holding' ? `${STATE_HEADING.holding} ${first}` : STATE_HEADING[g.state]}
            level={3}
          >
            <span className="small ink3">
              {g.rows.length} {g.rows.length === 1 ? 'movement' : 'movements'}
            </span>
          </CardHead>

          {g.state === 'holding' && (
            <CardBody>
              <p className="small">
                Sometimes that is exactly what a block is doing. It is also when
                a step up is usually due — worth raising at your next session.
                Nothing here needs you to change anything on your own.
              </p>
            </CardBody>
          )}

          <CardBody flush>
            {/* ── THE ROWS BECAME A TABLE — 23 Sep 2026 ────────────────────

                They were `ListRow`s: a name, a state-specific sentence and the
                latest figure. That is the right shape for FINDING and the wrong
                one for what this tab is actually asked, which is *which of
                these is moving* — `ui/Table.tsx` draws the line in one
                sentence: **a table is for comparing, a list row is for
                finding.** Six facts about a movement rendered as prose in a
                subtitle cannot be read down a column, so a client comparing two
                lifts had to read two sentences and hold one in their head.

                What is drawn is the trainer's own `Every movement` table, which
                is the point: *"in the trainer's view we show exercise progress
                alone as progress — the same kind of UI should be applied for
                the client."* Five of the seven columns are figures this tab
                already had and spent in prose; **Records** and **Lifted** are
                new here and come from `buildTraining`, the same walk the
                Summary's tiles are counted off — so the two tabs cannot
                disagree about what one client lifted.

                Grouped by state rather than ranked by volume, which is the one
                thing this version does not copy. The trainer's table is one
                list sorted by kilos because a trainer is auditing; the group
                headings are this tab's whole feature — *"if we are stuck in
                same load or rep in any exercise, that should be highlighted"* —
                and a sort is not a highlight. Inside a group the order is
                `buildExercises`' own. */}
            <Table
              caption={`${STATE_LABEL[g.state]} — ${g.rows.length} movements`}
              className="pgmv"
              columns={COLUMNS}
            >
              {g.rows.map((row) => {
                const unit = unitFor(row);
                const t = figures.get(row.exerciseId) ?? null;
                return (
                  <Row
                    key={row.exerciseId}
                    header={
                      <span
                        className="pgmv__nm"
                        /* ── A NAMELESS MOVEMENT IS NAMED HONESTLY ──────────
                           `resolveNames` reaches the program first and the bulk
                           route second, so this is rare — but reachable, and
                           the first version of this screen printed *That
                           movement*, which reads as a bug rather than a fact. */
                        title={row.name ?? 'A movement no longer on your plan'}
                      >
                        {row.name ?? 'A movement no longer on your plan'}
                      </span>
                    }
                    cells={[
                      {
                        key: 'seen',
                        numeric: true,
                        label: 'Sessions',
                        content: row.sessions,
                      },
                      {
                        key: 'last',
                        label: 'Last done',
                        /* ‘21 Sep’, not ‘Mon · 21 Sep’. `dayStamp` leads with the
                           weekday, which is right for a BOOKING — *am I in on
                           Tuesday* — and noise in a column headed *Last done*,
                           where the question is how long ago. MEASURED at 1536:
                           the weekday form is 104px against this track’s 94,
                           and `.tbl`’s `nowrap` ran it straight over the top-set
                           column on every row. Read off `lastOn`, the ISO day
                           the builder already carries, so no timestamp is
                           re-derived here. */
                        content: (
                          <span className="ink3 mono">
                            {t ? shortDate(t.lastOn) : dayStamp(row.lastAt)}
                          </span>
                        ),
                      },
                      {
                        key: 'top',
                        label: 'Top set',
                        content: (
                          <span className="tnum">
                            {row.first !== null &&
                            row.latest !== null &&
                            row.first !== row.latest ? (
                              <>
                                <span className="ink3">{row.first} → </span>
                                <b className="ink">{row.latest}</b>
                              </>
                            ) : (
                              <b className="ink">{row.latest ?? '—'}</b>
                            )}{' '}
                            <span className="ink3">{unit}</span>
                          </span>
                        ),
                      },
                      {
                        /* ── THE CHANGE IS THE BEST AGAINST THE FIRST, NOT THE
                             LAST ─────────────────────────────────────────────
                           `ExerciseProgress.delta` is `best − first` and its own
                           field note says why: a block often closes on a deload,
                           and a real gain read off the last session prints as a
                           loss. The `Top set` column beside it prints first →
                           LATEST, which is what the movement is doing now. Two
                           different questions, and the column heads say which is
                           which.

                           A rep gain is the OTHER progression and it is not a
                           kilo, so it is said in its own words rather than
                           folded into this number. `repsProgress` is null unless
                           the LOAD is the half that stood still, so a row can
                           never claim both. */
                        key: 'chg',
                        numeric: true,
                        label: 'Change',
                        content:
                          row.delta !== null && row.delta !== 0 ? (
                            signed(row.delta)
                          ) : row.repsProgress ? (
                            <span className="tnum">+{row.repsProgress.gain} reps</span>
                          ) : (
                            <span className="ink3">—</span>
                          ),
                      },
                      {
                        key: 'pr',
                        numeric: true,
                        label: 'Records',
                        /* The accent, and it is the ONLY tone in this table. A
                           record is unambiguous in one direction, which is the
                           same test §3 applies to a strength gain — and nothing
                           else here is coloured, because a session count a
                           client reads about themselves is a figure rather than
                           a score. */
                        content: t?.records ? (
                          <b className="acc">{t.records}</b>
                        ) : (
                          <span className="ink3">0</span>
                        ),
                      },
                      {
                        /* THE FIGURE AND ITS SHARE, IN ONE CELL. The bar is
                           measured against the BIGGEST movement, never the
                           total: against the total a seventeen-movement table
                           draws seventeen bars between 2% and 14% and the column
                           reads as empty. The accessible name still says the
                           share of the whole, because that is the honest number
                           in words. */
                        key: 'vol',
                        label: 'Lifted',
                        className: 'pgmv__vol',
                        content: t && t.volumeKg > 0 ? (
                          <>
                            <span className="tnum">
                              {inr(t.volumeKg)} <span className="ink3">kg</span>
                            </span>
                            <Meter
                              size="md"
                              describe={false}
                              label={`${row.name ?? 'This movement'}: ${inr(t.volumeKg)} of ${inr(
                                volumeTotal,
                              )} kg lifted`}
                              total={peakVolume}
                              segments={[{ tone: 'acc', value: t.volumeKg }]}
                            />
                          </>
                        ) : (
                          /* A movement with no load to sum — a pull-up, a plank
                             — is a real state and not a missing figure. Saying
                             so is not the same as `—`, which reads as *we lost
                             it*. */
                          <span className="ink3">bodyweight</span>
                        ),
                      },
                      {
                        key: 'go',
                        className: 'pgmv__act',
                        content: (
                          <Button href={exerciseHref(row.exerciseId)} variant="ghost" size="sm">
                            Every session
                          </Button>
                        ),
                      },
                    ]}
                  />
                );
              })}
            </Table>
          </CardBody>

          {/* ── THE SENTENCE THAT WAS THE SUBTITLE ──────────────────────────
              A holding row's second line used to say HOW LONG it had held, which
              is the one fact a table of figures cannot carry: it is a property
              of the run rather than a column. The *Last done* column answers the
              resting case exactly, and the holding case gets this line, where it
              is said once instead of once per row. */}
          {g.state === 'holding' && holdingClause(g.rows) && (
            <CardBody divided>
              <p className="small ink3">{holdingClause(g.rows)}</p>
            </CardBody>
          )}
        </Card>
      ))}
    </div>
  );
}

/**
 * The column model, declared once so the four groups cannot drift apart.
 *
 * `.pgmv` caps every text track and leaves the trailing action track elastic —
 * `wide-table-void`'s rule. The surplus falls in FRONT of *Every session*, which
 * is the one gap on a table row nobody reads as a void: an edge control is
 * expected to sit at the edge.
 */
const COLUMNS: Column[] = [
  { key: 'name', label: 'Movement' },
  { key: 'seen', label: 'Sessions', numeric: true },
  { key: 'last', label: 'Last done' },
  { key: 'top', label: 'Top set' },
  { key: 'chg', label: 'Change', numeric: true },
  { key: 'pr', label: 'Records', numeric: true },
  { key: 'vol', label: 'Lifted' },
  { key: 'go', label: '', bare: true },
];

/** `13375` → `13,375`. */
function inr(n: number): string {
  return n.toLocaleString('en-IN');
}

/**
 * `+7.5` / `−2.5`, and NEVER coloured.
 *
 * The app has no opinion about which way a number should go here: a load coming
 * down inside a deload week is the plan working. The trainer's own table makes
 * the identical refusal in the identical words.
 */
function signed(n: number): string {
  return `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
}

/**
 * *3 of these have been at the same level for up to 5 sessions.*
 *
 * Said once under the group rather than once per row — see the note at its
 * call-site. Null where no row in the group is on a flat run long enough to
 * quote: `holdingFor` can be 1 or 2 on a movement that has bounced between two
 * loads without ever beating its first session, which is holding without being
 * on a run, and a sentence quoting `1 session` about it would say nothing.
 */
function holdingClause(rows: ExerciseProgress[]): string | null {
  const runs = rows.map((r) => r.holdingFor).filter((n) => n >= 3);
  if (runs.length === 0) return null;
  const longest = Math.max(...runs);
  return runs.length === 1
    ? `One of these has been at the same level for ${longest} sessions.`
    : `${runs.length} of these have been at the same level for up to ${longest} sessions.`;
}

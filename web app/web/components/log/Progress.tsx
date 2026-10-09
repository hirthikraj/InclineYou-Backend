'use client';

import { useState } from 'react';

import { shortDate, type ProgressMovement, type ProgressRange, type ProgressView } from '@/lib/log/log';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Change } from '@/web-components/ui/Change';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Segment, SegmentButton } from '@/web-components/ui/Segment';
import { Select } from '@/web-components/ui/Select';
import { Tag } from '@/web-components/ui/Tag';
import { Stat } from '@/web-components/ui/Stat';
import { Meter } from '@/web-components/ui/Meter';
import { Table, Row } from '@/web-components/ui/Table';
import { VolumeBars } from '@/web-components/ui/VolumeBars';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * FRAME 4b — VOLUME GETS A CHART. THE LOAD DOES NOT.
 *
 * Volume is a sum, so a bar from zero tells the truth about it, and it is the
 * only figure on this screen that gets one. A load is not a sum: from a zero
 * baseline a {2.5} kg week is two pixels, and from a 50 kg baseline it is
 * everything. So the top set is **written out as the sequence of numbers it
 * actually is** — which is also what a coach says out loud.
 *
 * ── WHAT THE 20 Sep 2026 PASS CHANGED, AND WHY ──────────────────────────────
 *
 * Four things, and the first one is a defect the screen shipped with.
 *
 * 1 · **The default card said `0 → 0 → 0 → 0 → 0 kg`.** On Priya Pillai — and
 *     on any client whose most-logged movement is a timed one — the picker's
 *     first choice was the Assault Bike, whose sets carry no load and no reps
 *     because there is nowhere in this schema to put a time. `buildProgress`
 *     now requires a choice to have written a number down; the fix is in the
 *     model, because a component cannot tell an honest zero from an absent one.
 *
 * 2 · **Nine of the ten exercises were a number in a tile.** *Sets: 149 across
 *     10 exercises* and then one of them drawn, chosen by a chip. Every figure
 *     the movements table prints was already being computed for the record
 *     count and thrown away. It is the widest thing on the tab because it is
 *     the only thing here that wants the width — see `.pmv`.
 *
 * 3 · **The chart could not be read.** Two of seven bars carried a figure and
 *     there was no axis, so week four was *taller than that one* and nothing
 *     else. `VolumeBars` is the class family promoted to a component with the
 *     axis and the readout on it.
 *
 * 4 · **The range chips were three buttons that behaved as a radio group.**
 *     `Segment`'s `single` mode is that control, with `role="radiogroup"`, one
 *     tab stop and arrow keys — and it needs no inline `style` override to show
 *     which is on, which the chips did at the call-site.
 *
 * ── THE EXERCISE IS A CHOICE HERE, AND ON THE PHONE IT IS NOT ───────────────
 *
 * §14 records the gap: `ProgressView.topSet` on the phone is the client's
 * MOST-LOGGED exercise. On a Push A client that is a press; on somebody
 * rehabbing a knee it might be a band walk, and the card will say so with a
 * straight face. The desk has room to let the trainer pick which exercise the
 * sequence is about, so it does — and most-logged is only the default.
 */

const RANGES: { key: ProgressRange; label: string }[] = [
  { key: '8w', label: '8 weeks' },
  { key: '6m', label: '6 months' },
  { key: 'all', label: 'All' },
];

/**
 * The range chips and the exercise picker, as a hook.
 *
 * Both write to the query string of `/clients/:id/progress`, which is now a TAB
 * of the client file rather than a screen of its own — so the URL it patches is
 * the same one either way, and the caller does not have to know which surface it
 * is rendering into.
 */
export function useProgressQuery(clientId: string) {
  const router = useRouter();
  const params = useSearchParams();

  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const query = next.toString();
    router.replace(`/clients/${clientId}/progress${query ? `?${query}` : ''}`, { scroll: false });
  };
}

/**
 * The range picker on its own, so the client file can put it in its tools row
 * where the standalone screen put it in its page header.
 *
 * ── IT WAS THREE CHIPS WITH AN INLINE STYLE ON THE PRESSED ONE ──────────────
 *
 * Three `Chip`s with `aria-pressed`, plus a `style={{background, borderColor,
 * color}}` at the call-site overriding the design system's own pressed state —
 * which is trap 2 (an inline style outranks every selector) written on purpose,
 * and the portal's own `ProgressRanges` carries a note saying *do not copy the
 * trainer's version*. Three toggles that behave as a radio group ARE a radio
 * group, and `c-segment`'s `single` mode is it: `role="radiogroup"`,
 * `aria-checked`, ONE tab stop, arrow keys, Home and End. The override goes
 * with it, because `.seg__b[aria-checked]` already draws the chosen one.
 */
export function ProgressRanges({
  range,
  go,
}: {
  range: ProgressRange;
  go: (patch: Record<string, string | null>) => void;
}) {
  return (
    <Segment label="How far back" mode="single">
      {RANGES.map((r) => (
        <SegmentButton
          key={r.key}
          mode="single"
          pressed={range === r.key}
          onClick={() => go({ range: r.key })}
        >
          {r.label}
        </SegmentButton>
      ))}
    </Segment>
  );
}

/* ── THE DESIGN ARGUMENT COMES OFF THE CARD FACES ───────────────────────────
   MEASURED at 1536×695 on the client file's Progress tab: six paragraphs, 252px,
   explaining to the reader WHY each card is drawn the way it is. A trainer
   opening this tab mid-session is asking what the client lifted, not why volume
   gets a bar and a top set does not. It is the same species as the rest-day
   footnote the overview used to carry in its `This week` card, and it goes the
   same way — onto `title` of the element it is about, where the seven week-dots
   already keep theirs.

   NOT ALL OF THEM. The volume card keeps one clause visible — *a week with
   nothing in it keeps its bar* is how to READ the chart, and a reader who
   misses it reads a flat week as a missing one. What leaves is the argument for
   the decision, not the instruction for using it. */
const VOLUME_RULE =
  'Volume is a sum, so a bar tells the truth about it — and this is the only figure on ' +
  'the screen that gets one. A week with nothing in it keeps its bar, because a gap that ' +
  'closes up is a gap that never happened.';

const SEQUENCE_RULE =
  'Written out, never charted. From a zero baseline a small week is two pixels; from a ' +
  '50 kg baseline it is everything. This is also what a coach says out loud.';

const PICKER_RULE =
  'The phone picks the most-logged exercise and cannot be told otherwise. On somebody ' +
  'rehabbing a knee that is a band walk, and the card would say so with a straight face — ' +
  'so the desk lets you say which. Only movements with a number written down are offered.';

const MOVEMENTS_RULE =
  'Ranked by the kilos moved, because that is what the training was made of. A change is ' +
  'the first top set of the range against the last, and it carries no colour: the app has ' +
  'no opinion about which way a number should go.';

const RECORDS_RULE =
  'Judged on read against the whole history, never stored — correct one set from November ' +
  'and every session after it re-judges. Counted inside the range you are looking at.';

/** `13375` → `13,375`, and the same formatter on the axis and the bar. */
function inr(n: number): string {
  return n.toLocaleString('en-IN');
}

/** `+7.5` / `−2.5`. Never coloured — see `MOVEMENTS_RULE`. */
function signed(n: number): string {
  return `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
}

type MovementSort = 'volume' | 'change' | 'recent';

const SORTS: { key: MovementSort; label: string; caption: string }[] = [
  { key: 'volume', label: 'Volume', caption: 'kilos moved' },
  { key: 'change', label: 'Change', caption: 'change in top set' },
  { key: 'recent', label: 'Last done', caption: 'last done' },
];

/** The relative size of a move, so a +2.5 kg on a 20 kg press outranks +2.5 on a 120 kg pull. */
function growth(m: ProgressMovement): number {
  if (m.delta === null || m.delta <= 0) return 0;
  return m.delta / (m.from && m.from > 0 ? m.from : m.to || 1);
}

/** Total orders only — a tie must never reshuffle between loads (AGENTS trap 29). */
function sortMovements(list: ProgressMovement[], by: MovementSort): ProgressMovement[] {
  const byName = (a: ProgressMovement, b: ProgressMovement) => a.name.localeCompare(b.name);
  return [...list].sort((a, b) => {
    if (by === 'change') return growth(b) - growth(a) || b.volumeKg - a.volumeKg || byName(a, b);
    if (by === 'recent') return b.lastOn.localeCompare(a.lastOn) || b.volumeKg - a.volumeKg || byName(a, b);
    return b.volumeKg - a.volumeKg || byName(a, b);
  });
}

/**
 * Everything below the page header: the four figures, the volume bars, the
 * top-set sequence with its picker, and the movements table.
 *
 * Extracted so the client file's Progress tab draws exactly this screen rather
 * than a second, drifting rendering of the same numbers.
 */
export function ProgressBody({
  data,
  go,
}: {
  data: ProgressView;
  go: (patch: Record<string, string | null>) => void;
}) {
  /* The share bar is measured against the BIGGEST movement, not against the
     total. Against the total a ten-movement table draws ten bars between 4%
     and 18% and the column reads as empty — the question the bar answers is
     *how does this compare with the one above it*, and the tallest is the
     only reference that makes that visible. The accessible name still says
     the share of the whole, because that is the honest number in words. */
  const [sort, setSort] = useState<MovementSort>('volume');
  const ranked = sortMovements(data.movements, sort);
  /* THE ANSWER THIS TAB IS OPENED FOR: *is this client getting stronger*. It was a 96px
     column in the middle of a table and read `—` on every row of a client in their first
     fortnight, while four counts led the page. Three movements, ranked by how far their top
     set moved relative to where it started; a lift that held is not on it, and it carries no
     colour except the accent `Change` already reserves for a strength gain. */
  const risers = sortMovements(data.movements, 'change').filter((m) => growth(m) > 0).slice(0, 3);
  const latestWeek = data.weeks.length ? data.weeks[data.weeks.length - 1] : null;
  const peakVolume = data.movements.reduce((max, m) => Math.max(max, m.volumeKg), 0) || 1;
  const volumeTotal = data.movements.reduce((sum, m) => sum + m.volumeKg, 0) || 1;

  return (
    <>
      {data.movements.length > 0 && (
        <Card
          title="Getting stronger"
          aside={
            data.records > 0 ? (
              <Tag tone="pr" className="pgs__pr">
                {data.records} {data.records === 1 ? 'record' : 'records'}
              </Tag>
            ) : null
          }
        >
          {risers.length > 0 ? (
            <ul className="pgs">
              {risers.map((m) => (
                <li key={m.exerciseId} className="pgs__r">
                  <span className="pgs__n" title={m.name}>
                    {m.name}
                  </span>
                  <Change from={m.from} to={m.to} unit={m.unit} delta={m.delta === null ? undefined : signed(m.delta)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="small ink3">
              Nothing has moved yet. A change shows once a movement has been logged in two
              sessions, so the first fortnight is the baseline rather than a result.
            </p>
          )}
        </Card>
      )}

      <div className="stats stats--4" style={data.movements.length > 0 ? { marginTop: 12 } : undefined}>
        <Stat label="Sessions" value={data.sessions} detail="with sets logged" />
        <Stat label="Sets" value={data.sets} detail={<>across {data.exerciseCount} exercises</>} />
        <Stat
          label="Records"
          value={data.records}
          detail={
            <span title={RECORDS_RULE}>
              {data.records ? 'beaten in this range' : 'the first sessions set the baseline'}
            </span>
          }
          tone={data.records ? 'acc' : undefined}
        />
        {/* ── *VOLUME THIS WEEK* WAS NOT ALWAYS THIS WEEK ──────────────────
            `volumeNow` is the LAST week in the series, and the series stops at
            the last week with something in it — so on a client who trained
            last in early September the tile read *Volume this week: 13,375 kg*
            on 20 September, about a week in which they had done nothing. It is
            the same class of claim `This week` on the Overview tab was fixed
            for: the window may not move, so the SENTENCE has to.

            `weeks.at(-1).current` is the test and it is already computed. */}
        <Stat
          label={latestWeek?.current ? 'Volume this week' : 'Volume, latest week'}
          value={inr(data.volumeNow)}
          detail={
            <>
              kg
              {latestWeek && !latestWeek.current ? <> &middot; week of {shortDate(latestWeek.weekOf)}</> : null}
              {data.volumeDelta ? <> &middot; <b>{data.volumeDelta}</b></> : null}
            </>
          }
        />
      </div>

      {/* ── THE GRID HOLDS TWO CARDS NOW, NOT FOUR ──────────────────────────
          MEASURED at 1536×695 before this pass: the left track was Volume at
          347px and the right was three stacked cards — top set 148, picker 179,
          bodyweight 126 — and the void under the shorter track was **147px** on
          every seeded client. Two changes close it and both are content
          decisions rather than `fr` values, which is the lesson
          `odd-child-in-a-two-track-grid` records:

          · **Bodyweight is gone from this tab.** It is a body measurement, it
            was drawn a second time in the measurements table 400px below it,
            and body progress has its own surface. The Progress tab is exercise
            progress.
          · **The picker moved INSIDE the card it controls.** *Which exercise*
            and *the last five of it* were a question and its answer in two
            boxes with a 12px gap between them, which is one card with a
            control in it drawn as two — and `CardHead` over one chip row is
            ~60px of furniture around 30px of content.

          Left 347 against right ~300. */}
      <div className="wk2 wk2--wide" style={{ marginTop: 12 }}>
        <Card
          title={<>Volume, {data.weeks.length} week{data.weeks.length === 1 ? '' : 's'}</>}
          aside={<span className="small mono" style={{ marginLeft: 'auto' }}>kg moved per week</span>}
        >
          {data.weeks.length ? (
            <VolumeBars
              /* A series of one or two weeks has nothing to be tall about: 190px of empty plot beside
                 one bar left a 100px void under the top-set card. The short chart is the one the
                 progress report already uses for small series. */
              size={data.weeks.length < 3 ? 'sm' : 'md'}
              label="Volume per week"
              unit="kg"
              format={inr}
              weeks={data.weeks.map((w) => ({
                label: w.label,
                value: w.volumeKg,
                fraction: w.fraction,
                current: w.current,
                when: shortDate(w.weekOf),
              }))}
              note={
                data.weeks.length < 3 ? (
                  <span title={VOLUME_RULE}>
                    <b>The start of the record.</b> Two or three weeks make a trend; until then
                    each bar is a baseline to measure the next one against.
                  </span>
                ) : (
                  <span title={VOLUME_RULE}>
                    <b>Bars, from zero.</b> A week with nothing in it keeps its bar. Point at one
                    to read it.
                  </span>
                )
              }
            />
          ) : (
            <p className="small ink3">Nothing logged in this range yet. A bar needs a set behind it.</p>
          )}
        </Card>

        <Card
          title={
            data.focus ? `${data.focus.name}, the last ${data.focus.sequence.length}` : 'Top set'
          }
          aside={
            data.focus ? (
              <span className="small mono" style={{ marginLeft: 'auto' }}>top set</span>
            ) : null
          }
        >
          {data.focus && data.focus.sequence.length ? (
            <>
              {/* THE LATEST IS BOLD IN INK, AND ONLY A RECORD IS GOLD — and the first point never is:
                  `best` is `figure > running` from zero, so the opening session of any sequence beats
                  nothing and is flagged. That is a baseline, not a record. It was `<b>` on the last number
                  and `.seq b` was the PR amber, so a plateau (27.5 → 27.5 → 27.5) read as a record,
                  or as a caution, beside a Records tile that said 0. The arrows are hidden from a
                  reader and replaced by a spoken *then*; `→` is announced as "rightwards arrow". */}
              <p className="seq" title={SEQUENCE_RULE}>
                {data.focus.sequence.map((p, i, all) => (
                  <span key={`${p.value}-${i}`}>
                    {i > 0 ? (
                      <>
                        <span aria-hidden="true"> → </span>
                        <span className="vh">, then </span>
                      </>
                    ) : null}
                    {p.best && i > 0 ? (
                      <b className="seq__pr">
                        {p.value}
                        <span className="vh"> (record)</span>
                      </b>
                    ) : i === all.length - 1 ? (
                      <b>{p.value}</b>
                    ) : (
                      p.value
                    )}
                  </span>
                ))}{' '}
                {data.focus.unit}
              </p>
              <Button
                href={`/clients/${data.clientId}/exercises/${data.focus.exerciseId}`}
                variant="secondary"
                size="sm"
                style={{ marginTop: 10 }}
              >
                Every session on it
              </Button>
            </>
          ) : (
            <p className="small ink3">
              Nothing has two sessions behind it yet, so there is no sequence to write out.
            </p>
          )}

          {data.choices.length > 1 ? (
            /* A SELECT, NOT EIGHT CHIPS. The chips were `aria-pressed` toggles standing in for a
               one-of-N choice, silently stopped at the eighth movement (a client with twelve could
               not focus the other four), and a long custom name made a chip 494px wide in a 363px
               card. A native select is all of that for free, and on a phone it is the OS's own
               picker. */
            <div className="pfoc" title={PICKER_RULE}>
              <Select
                label="Which exercise"
                value={data.focus?.exerciseId ?? ''}
                onChange={(e) => go({ focus: e.target.value })}
                options={data.choices.map((c) => ({
                  value: c.exerciseId,
                  label: `${c.name} · ${c.sessions} sessions`,
                }))}
              />
            </div>
          ) : null}
        </Card>
      </div>

      {/* ── EVERY MOVEMENT, WHICH IS WHAT THE TILE WAS COUNTING ─────────────
          The columns are capped and the surplus falls into the trailing
          action column — `wide-table-void`'s rule, and the reason this is a
          table rather than a grid of cards: eight to fifteen movements read
          down a column, and *which of these moved* is a comparison. */}
      <Card title="Every movement" style={{ marginTop: 12 }}
        aside={
          <span className="small mono" style={{ marginLeft: 'auto' }} title={MOVEMENTS_RULE}>
            top set, first → last
          </span>
        }
      >
        {data.movements.length === 0 ? (
          <EmptyState
            title="Nothing logged in this range"
            body="A movement appears here the first time a set of it is written down."
            inCard
          />
        ) : (
          <>
            {data.movements.length > 1 && (
              <div className="pmv__sort">
                <span className="micro">Sort by</span>
                <Segment label="Sort movements by" mode="single">
                  {SORTS.map((x) => (
                    <SegmentButton
                      key={x.key}
                      mode="single"
                      pressed={sort === x.key}
                      onClick={() => setSort(x.key)}
                    >
                      {x.label}
                    </SegmentButton>
                  ))}
                </Segment>
              </div>
            )}
          <Table
            caption={`${data.movements.length} movements, ranked by ${SORTS.find((x) => x.key === sort)?.caption}`}
            className="pmv"
            columns={[
              { key: 'name', label: 'Movement' },
              { key: 'seen', label: 'Sessions', numeric: true },
              { key: 'last', label: 'Last done' },
              { key: 'top', label: 'Top set' },
              { key: 'chg', label: 'Change', numeric: true },
              { key: 'pr', label: 'Records', numeric: true },
              { key: 'vol', label: 'Volume' },
              { key: 'go', label: <span className="vh">Open</span>, bare: true },
            ]}
          >
            {ranked.map((m) => (
              <Row
                key={m.exerciseId}
                header={<span className="pmv__nm" title={m.name}>{m.name}</span>}
                cells={[
                  { key: 'seen', content: m.sessions, numeric: true, label: 'Sessions' },
                  {
                    key: 'last',
                    label: 'Last done',
                    content: <span className="ink3 mono">{shortDate(m.lastOn)}</span>,
                  },
                  {
                    key: 'top',
                    label: 'Top set',
                    content:
                      m.to > 0 ? (
                        <span className="tnum">
                          {m.from !== null && m.from !== m.to ? (
                            <>
                              <span className="ink3">{m.from} → </span>
                              <b className="ink">{m.to}</b>
                            </>
                          ) : (
                            <b className="ink">{m.to}</b>
                          )}{' '}
                          <span className="ink3">{m.unit}</span>
                        </span>
                      ) : (
                        /* A timed movement has no figure at all — see
                           `buildProgress`. Saying so is not the same as `—`,
                           which reads as *we lost it*. */
                        <span className="ink3">timed &middot; no load</span>
                      ),
                  },
                  {
                    key: 'chg',
                    numeric: true,
                    label: 'Change',
                    content: m.delta === null ? <span className="ink3">—</span> : signed(m.delta),
                  },
                  {
                    key: 'pr',
                    numeric: true,
                    label: 'Records',
                    content: m.records ? <b className="acc">{m.records}</b> : <span className="ink3">0</span>,
                  },
                  {
                    /* THE FIGURE AND ITS SHARE, IN ONE CELL.
                       The table is SORTED by this column, so the one thing it
                       has to show is how far apart the rows are — and ten
                       right-ranged five-digit numbers do not show that. The
                       bar is the ranking made legible, and it is what the
                       260px this column was widened to is for. `Meter` takes
                       amounts rather than a percentage, so the share is
                       computed nowhere. */
                    key: 'vol',
                    label: 'Volume',
                    className: 'pmv__vol',
                    content: m.volumeKg ? (
                      <>
                        <span className="tnum">
                          {inr(m.volumeKg)} <span className="ink3">kg</span>
                        </span>
                        <Meter
                          size="md"
                          describe={false}
                          label={`${m.name}: ${inr(m.volumeKg)} of ${inr(volumeTotal)} kg moved`}
                          total={peakVolume}
                          segments={[{ tone: 'acc', value: m.volumeKg }]}
                        />
                      </>
                    ) : (
                      <span className="ink3">—</span>
                    ),
                  },
                  {
                    key: 'go',
                    className: 'pmv__act',
                    content: (
                      <Button
                        href={`/clients/${data.clientId}/exercises/${m.exerciseId}`}
                        variant="ghost"
                        size="sm"
                      >
                        Every session
                      </Button>
                    ),
                  },
                ]}
              />
            ))}
          </Table>
          </>
        )}
      </Card>
    </>
  );
}

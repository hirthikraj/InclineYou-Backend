import { Plus } from '@/components/shell/Icons';
import { DAY_MS, startOfDay, startOfWeek } from '@/lib/today/time';
import type { ClientProgramWire, ClientSessionWire } from '@/lib/clients/client-api';

import { ListIcon, dateStr, rangeStr } from './shared';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Figure, Figures } from '@/web-components/ui/Figures';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { Meter } from '@/web-components/ui/Meter';
import { Tag } from '@/web-components/ui/Tag';
import { Timeline } from '@/web-components/ui/Timeline';

/**
 * PLAN — WHAT THEY ARE ON, WHETHER IT IS STILL GOOD, AND EVERYTHING BEFORE IT.
 *
 * Singular now. It was *Programs*, which named the timeline rather than the
 * question: a trainer opening this tab wants the plan the client is following
 * today, and the history is the supporting evidence beside it.
 *
 * ── THE CARD USED TO STOP TELLING THE TRUTH ON THE DAY THE BLOCK ENDED ──────
 *
 * MEASURED 19 Sep 2026 across the seeded roster: **five of the twenty-two
 * clients with a plan were past its end date**, and every one of them drew the
 * identical card a client three weeks into a block draws — a lime *Live* tag, a
 * full meter, and `Week 6 of 6`. `weekOf` clamps the current week into the
 * block (it has to; the portal clamps too, and the two halves must not read one
 * week apart), so the figure freezes on the last week and **stays there for
 * ever**. Nothing else on the card moves either. On `cli_008` the block had run
 * out **thirteen days** earlier and the only evidence anywhere on the screen was
 * an `Ends 6 Sep` row four lines down, in the same ink as *Goal*.
 *
 * So the block states its STATE and not just its week: `blockOf` below returns
 * one of four, the tag says which, a sentence under the figure says it in words,
 * and the meter draws the overrun rather than pretending the bar is simply full.
 * The primary verb moves with it — *Open the plan* while the block is running,
 * *Assign the next plan* once it is not — because a screen that knows a client
 * has been training to nothing for a fortnight and offers two secondary buttons
 * has reported a problem and hidden the fix.
 *
 * ── THE FIGURES ARE THE BLOCK'S, NOT THE MONTH'S ────────────────────────────
 *
 * Overview already draws this week's seven cells and adherence over thirty
 * days. Neither answers *how has this BLOCK gone*, which is the question you
 * open a plan to ask and the one whose window is the block's own dates. Drawn
 * as `c-figures` — three numbers on one ruled line — and never as a rate with a
 * colour on it below 70: the same never-shame rule Overview's adherence meter
 * makes, because a rate is a conversation to have and not a failure to flag in
 * red on somebody's file.
 *
 * ── THE GAP IS A ROW ────────────────────────────────────────────────────────
 *
 * A client who trained for six weeks before anyone wrote them a plan has a real
 * period with no program in it, and a timeline that skips it implies a plan that
 * was never there. So it gets its own row, drawn quiet — the design's frame 3d,
 * "including the gap". It is also the row that found `rangeStr`: on this client
 * it printed **19 Aug – 17 May**, nine months drawn backwards, because the two
 * ends are in different years and neither said so.
 */

/* ────────────────────────────────────────────────────────────── the block ── */

/**
 * Where a program is in its own run, and whether that run is over.
 *
 * `scheduled` is a block that starts later — assignable ahead of time, and a
 * card claiming *week 1* for it would be wrong by however many days.
 * `open` is a block with no end date at all: it has a current week and no
 * total, so it can be behind nothing and is never late.
 */
type BlockState = 'scheduled' | 'running' | 'ending' | 'overrun' | 'open';

type Block = {
  state: BlockState;
  startMs: number;
  endMs: number | null;
  /** Clamped into the block. See the note below. */
  week: number | null;
  weeks: number | null;
  /** Whole days from today to the end date. Negative once it has passed. */
  daysLeft: number | null;
};

/** A block is in its last week when this many days or fewer remain. */
const ENDING_DAYS = 7;

function blockOf(p: ClientProgramWire, now: number): Block | null {
  if (!p.startDate) return null;
  const startMs = new Date(p.startDate).getTime();
  const endMs = p.endDate ? new Date(p.endDate).getTime() : null;
  const weeks = endMs === null ? null : Math.max(1, Math.round((endMs - startMs) / (7 * DAY_MS)));

  if (startMs > now) {
    return { state: 'scheduled', startMs, endMs, week: null, weeks, daysLeft: null };
  }

  const raw = Math.max(1, Math.floor((now - startMs) / (7 * DAY_MS)) + 1);
  /* ── CLAMPED INTO THE BLOCK, AND IT WAS NOT ─────────────────────────────

     A plan run past its end date read *week 9 of 8*, which makes the one
     figure on the card absurd — and worse, `/me/plan` clamps (`mock/portal.ts`
     says why in the same words), so the trainer and their client were looking
     at the same program and reading weeks one apart. One client, one program,
     two answers, and no way to tell which is the product's.

     What the clamp cannot do is say the block is OVER, which is why it is
     `state` below and not another number. */
  const week = weeks ? Math.min(raw, weeks) : raw;

  if (endMs === null) return { state: 'open', startMs, endMs, week, weeks, daysLeft: null };

  /* Whole days between two midnights, so a block ending today is 0 and not a
     fraction that rounds either way depending on the hour it is read at. */
  const daysLeft = Math.round((startOfDay(endMs) - startOfDay(now)) / DAY_MS);
  const state: BlockState = daysLeft < 0 ? 'overrun' : daysLeft <= ENDING_DAYS ? 'ending' : 'running';
  return { state, startMs, endMs, week, weeks, daysLeft };
}

/** `in 3 days` · `today` · `13 days ago`. The unit is always days here. */
function dayPhrase(days: number): string {
  if (days === 0) return 'today';
  const n = Math.abs(days);
  const unit = n === 1 ? 'day' : 'days';
  return days > 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`;
}

/* ─────────────────────────────────────────────────────────────── the tab ── */

export function ProgramTab({
  programs,
  sessions,
  client,
  now,
}: {
  programs: ClientProgramWire[];
  sessions: ClientSessionWire[];
  client: { createdAt: number };
  now: number;
}) {
  const sorted = [...programs].sort((a, b) => b.createdAt - a.createdAt);
  const active = sorted.find((p) => p.status === 'active') ?? null;

  const weekStart = startOfWeek(now);
  const thisWeek = active
    ? sessions.filter(
        (s) =>
          s.scheduledAt >= weekStart &&
          s.scheduledAt < weekStart + 7 * DAY_MS &&
          s.programId === active.id,
      )
    : [];
  const loggedThisWeek = thisWeek.filter((s) => s.status === 'done').length;
  const plannedThisWeek = thisWeek.filter((s) => s.status !== 'cancelled').length;
  const dayLabels = [
    ...new Set(thisWeek.filter((s) => s.dayLabel).map((s) => s.dayLabel as string)),
  ].join(', ');

  const block = active ? blockOf(active, now) : null;

  /* ── THE BLOCK'S OWN ADHERENCE, WINDOWED BY DATE AND NOT BY `programId` ───

     `sessions` carries one, and counting on it would be the obvious reading.
     It is also the one that cannot be checked: the assign handler does not end
     the program already running (see the timeline's `isLive` below), so a
     client can hold two `active` rows and the diary's attribution between them
     is whatever the last write said. What is not in doubt is WHEN a session
     was, and a block is a stretch of dates — so the window is the block's, from
     its start to today, and the figure is *of the sessions booked since this
     block started, how many were kept*.

     The floor is the fetch's. `getClientSessionsWindowed` reads ninety days
     back, so a block longer than that would silently lose its opening weeks and
     report a count for a period it cannot see. Clamping the window to what was
     fetched keeps the COUNT true and moves the date in the label instead — the
     one that says which period the number is about. */
  const adherenceFrom = block ? Math.max(block.startMs, now - 89 * DAY_MS) : 0;
  const inBlock = block
    ? sessions.filter(
        (s) =>
          s.scheduledAt >= adherenceFrom &&
          s.scheduledAt <= Math.min(now, block.endMs ?? now) &&
          s.status !== 'cancelled',
      )
    : [];
  const kept = inBlock.filter((s) => s.status === 'done').length;
  const spent = inBlock.length;

  const firstStart = sorted.length > 0 ? sorted[sorted.length - 1].startDate : null;
  const showGap = firstStart && new Date(firstStart).getTime() > client.createdAt + 3 * DAY_MS;

  return (
    /* NO `gridTemplateColumns` IN A STYLE ATTRIBUTE. It was set here, and an
       inline declaration outranks every selector including a media query — so
       the 1240 rung that stacks this file had to carry an `!important` for the
       three tabs that did it. `.cfgrid--pl` sets the tracks in the sheet; the
       rung's note names the two that are left. */
    <div className="cfgrid cfgrid--pl">
      {active && block ? (
        <Card>
          <Card.Head title={active.name}>
            <BlockTag state={block.state} daysLeft={block.daysLeft} />
          </Card.Head>
          <Card.Body className="cfpl__hd">
            {/* THE DATES, AND THEY WERE A ROW FOUR LINES DOWN. `Assigned 26 Jul`
                sat above the figure and `Ends 6 Sep` below three other facts,
                so the one thing that decides whether the block is still good
                was split across the card in two different weights. One line,
                one range, in the meta face. */}
            <p className="cfpl__range">
              {rangeStr(block.startMs, block.endMs, 'open ended')}
              {block.weeks ? ` · ${block.weeks} weeks` : null}
            </p>
            {block.week === null ? (
              <p className="cfpl__wk">
                Starts <em>{dateStr(block.startMs)}</em>
              </p>
            ) : (
              <p className="cfpl__wk">
                Week {block.week}
                {block.weeks ? <em>of {block.weeks}</em> : null}
              </p>
            )}
            {block.weeks && block.week !== null && (
              /* THE OVERRUN IS A SEGMENT, NOT A FULL BAR. A block a fortnight
                 past its end drew 100% in the accent, which is the same picture
                 a block finishing this Sunday draws and the same one a block
                 that ended in March will draw next year. The second segment is
                 the days it has run OVER, capped at the block's own length so a
                 plan forgotten for six months does not draw a bar six times too
                 long. `warn` and never `danger`: an expired block is the
                 trainer's housekeeping, not an emergency. */
              <Meter
                size="lg"
                label={`Week ${block.week} of ${block.weeks}`}
                segments={
                  block.state === 'overrun'
                    ? [
                        { tone: 'acc', value: block.weeks, label: 'the block' },
                        {
                          tone: 'warn',
                          value: Math.min(
                            block.weeks,
                            Math.abs(block.daysLeft ?? 0) / 7,
                          ),
                          label: 'run over',
                        },
                      ]
                    : [
                        { tone: 'acc', value: block.week, label: 'done' },
                        { tone: 'dim', value: block.weeks - block.week, label: 'to run' },
                      ]
                }
              />
            )}
            <p
              className={
                block.state === 'overrun' || block.state === 'ending'
                  ? 'cfpl__say cfpl__say--warn'
                  : 'cfpl__say'
              }
            >
              <BlockSentence state={block.state} daysLeft={block.daysLeft} endMs={block.endMs} />
            </p>
          </Card.Body>
          <Card.Body divided flush className="cfpl__figs">
            <Figures>
              <Figure
                /* THE LABEL NAMES THE WINDOW ONLY WHERE THE WINDOW IS NOT THE
                   BLOCK. `Kept since 26 Jul` is exact and it is also the
                   longest label in a 211px column — and on every block shorter
                   than thirteen weeks, which is all of them on this roster, it
                   repeats the start date the range line already carries two
                   rows up. It says `this block` where the two agree and names
                   the date where the fetch's ninety days cut the window short,
                   which is the only case the reader could be misled by. */
                label={
                  adherenceFrom > block.startMs
                    ? `Kept since ${dateStr(adherenceFrom)}`
                    : 'Kept this block'
                }
                value={spent > 0 ? kept : '—'}
                of={spent > 0 ? spent : undefined}
                /* Never `danger`. See the note at the top of this file. */
                tone={spent > 0 && kept / spent < 0.7 ? 'warn' : 'neutral'}
              />
              <Figure
                label="This week"
                value={plannedThisWeek > 0 ? loggedThisWeek : '—'}
                of={plannedThisWeek > 0 ? plannedThisWeek : undefined}
              />
              <Figure
                label={block.state === 'overrun' ? 'Days over' : 'Days to run'}
                value={block.daysLeft === null ? 'Open' : Math.abs(block.daysLeft)}
                tone={block.state === 'overrun' ? 'warn' : 'neutral'}
              />
            </Figures>
          </Card.Body>
          {(active.goal || dayLabels) && (
            /* TWO COLUMNS, AND THAT IS A MEASUREMENT. `.kv` is a label left and
               a value right with `space-between` between them; in this card's
               755px it drew the key at x=105 and the value at x=775 — **590px
               of nothing** between *Goal* and *Fat loss*, which is a row the
               eye has to track across rather than read. The rule the roster's
               tables already follow: cap the COLUMN, never the row. Two tracks
               puts each pair in ~350px. */
            <Card.Body divided className="cfpl__facts">
              {active.goal && <KeyValueRow k="Goal">{active.goal}</KeyValueRow>}
              {dayLabels && <KeyValueRow k="This week">{dayLabels}</KeyValueRow>}
            </Card.Body>
          )}
          {/* ── *OPEN THE PLAN* NOW OPENS THE PLAN ──────────────────────────

              It went to `/programs` — the SHELF, which is the trainer's list of
              blueprints and not this client's plan at all. A trainer following
              it to change Meera's Thursday landed on the blueprint Meera's copy
              was made from, and every edit they made there reached everybody
              except Meera.

              `/clients/:id/program/:programId` is the copy, editable, and it is
              the route the two-table design has implied since templates
              existed. *Assign another* still goes to the shelf, because that IS
              a shelf question: which blueprint next.

              WHICH OF THE TWO IS PRIMARY FOLLOWS THE BLOCK. While it is running
              the plan is the thing to open; once it is not, the plan is the
              thing to replace, and leaving both secondary was the screen
              declining to say which. `Card.Band` rather than a row inside the
              body, so the verbs sit on the card's floor and line up with the
              foot of the history beside them. */}
          <Card.Band>
            {block.state === 'overrun' || block.state === 'ending' ? (
              <>
                <Button href="/programs/templates" variant="primary" icon={<Plus size={15} />}>
                  Assign the next plan
                </Button>
                <Button
                  href={`/clients/${active.clientId}/program/${active.id}`}
                  variant="secondary"
                  icon={<ListIcon />}
                >
                  Open the plan
                </Button>
              </>
            ) : (
              <>
                <Button
                  href={`/clients/${active.clientId}/program/${active.id}`}
                  variant="primary"
                  icon={<ListIcon />}
                >
                  Open the plan
                </Button>
                <Button href="/programs/templates" variant="secondary">
                  Assign another
                </Button>
              </>
            )}
          </Card.Band>
        </Card>
      ) : (
        /* A SENTENCE IN A BARE CARD WAS NOT A STATE. `c-empty` is the component
           every other pane reaches for, and what it adds here is the two things
           the paragraph could not: a mark that this is an empty case rather
           than a card that failed to load, and the verb in the place a reader
           is already looking. The body keeps the original sentence — it is the
           honest half, and a client with no plan is not a client with nothing. */
        <Card>
          <EmptyState
            inCard
            icon={<ListIcon size={20} />}
            title="No plan running"
            body={
              <>
                Sessions can still be logged — they just will not be measured
                against one.
              </>
            }
            action={
              <Button href="/programs/templates" variant="primary" icon={<Plus size={15} />}>
                Assign a plan
              </Button>
            }
          />
        </Card>
      )}

      <Card title="Every plan, newest first">
        {sorted.length === 0 && !showGap ? (
          <p className="small ink3">Nothing assigned yet</p>
        ) : (
          <Timeline label="Every plan this client has been on, newest first">
            {sorted.map((p, i) => {
              const b = blockOf(p, now);
              /* `p.id === active?.id`, NOT `p.status === 'active'`. The assign
                 handler does not end the block already running, so a client can
                 hold two rows with that status and the list drew *Live* on
                 both. One live row: the one the card beside this list is
                 about. */
              const isLive = p.id === active?.id;
              return (
                <Timeline.Item
                  key={p.id}
                  live={isLive}
                  /* EVERY BLOCK IS A COPY OF ITS OWN, so every row is a door to
                     it. *What were they on in March* is answered by opening
                     March's plan, and before this the answer was "it is in the
                     database". The whole row is the door now and not the name
                     inside it — see `.tl__i--link`. */
                  href={`/clients/${p.clientId}/program/${p.id}`}
                  mark={sorted.length - i}
                  title={p.name}
                  aside={
                    isLive ? (
                      <Tag tone="acc" style={{ marginLeft: 6 }}>
                        Live
                      </Tag>
                    ) : null
                  }
                  /* ── A FINISHED BLOCK HAS NO CURRENT WEEK ──────────────────

                      `blockOf` measures from `startDate` to **now**, which is
                      right for the live plan above and nonsense for a finished
                      one: this row read **"12 Jul – 23 Aug · week 9 of 6"** —
                      a week past the end of a block that ended a fortnight ago.

                      It was unreachable until there were completed programs to
                      draw, and `/me/plan`'s *Past plans* tab is what put them
                      in the book. Same rule as the portal's, so the two halves
                      agree about the tense: the live block states its week, a
                      finished one states its LENGTH, and its dates say when it
                      ran.

                      The GOAL is on the row now as well. It is the one field a
                      past block carries that answers the question the history
                      is read with — *what were they working on then* — and it
                      was drawn nowhere but inside the plan. */
                  meta={
                    b && (
                      <>
                        {rangeStr(b.startMs, b.endMs, 'now')}
                        {isLive
                          ? b.week !== null &&
                            ` · week ${b.week}${b.weeks ? ` of ${b.weeks}` : ''}`
                          : b.weeks && ` · ${b.weeks} weeks`}
                        {p.goal ? ` · ${p.goal}` : null}
                      </>
                    )
                  }
                />
              );
            })}
            {showGap && (
              <Timeline.Item
                dim
                mark="—"
                title="No plan"
                meta={
                  <>
                    {rangeStr(
                      client.createdAt,
                      firstStart ? new Date(firstStart).getTime() : null,
                    )}{' '}
                    · sessions logged as you went
                  </>
                }
              />
            )}
          </Timeline>
        )}
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────────────── the block's state ── */

/**
 * The tag beside the plan's name, and the only place on the card that says
 * the state in one word.
 *
 * `warn` and never `danger` on the two that need marking, for the reason the
 * meter's own note gives. `scheduled` takes the neutral tag: a block starting
 * on Monday is not a problem, it is a booking.
 */
function BlockTag({ state, daysLeft }: { state: BlockState; daysLeft: number | null }) {
  if (state === 'overrun') return <Tag tone="warn">Ran out</Tag>;
  if (state === 'ending') {
    return <Tag tone="warn">{daysLeft === 0 ? 'Ends today' : 'Last week'}</Tag>;
  }
  if (state === 'scheduled') return <Tag>Starts later</Tag>;
  return <Tag tone="acc">Live</Tag>;
}

/** The same fact as a sentence, because a tag cannot carry the date. */
function BlockSentence({
  state,
  daysLeft,
  endMs,
}: {
  state: BlockState;
  daysLeft: number | null;
  endMs: number | null;
}) {
  if (state === 'scheduled') return <>Nothing is being measured against it yet.</>;
  if (state === 'open') return <>No end date, so this block runs until it is replaced.</>;
  if (state === 'overrun') {
    return (
      <>
        Ran out {dayPhrase(daysLeft ?? 0)}, on {endMs === null ? '—' : dateStr(endMs)}, and
        nothing has replaced it.
      </>
    );
  }
  if (state === 'ending') {
    return (
      <>
        Ends {dayPhrase(daysLeft ?? 0)}. The next block is the conversation to have this week.
      </>
    );
  }
  return <>Running to {endMs === null ? '—' : dateStr(endMs)}.</>;
}

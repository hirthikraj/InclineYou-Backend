'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { CertifiedPreviewData } from '@/lib/programs/api';
import { copyCertified } from '@/lib/programs/actions';
import { balance } from '@/lib/programs/balance';
import {
  authoredWeeks,
  daysOf,
  effectiveWeek,
  entriesFor,
  overloadLine,
  repeatLine,
  toEntries,
  weekCountOf,
  type Entry,
} from '@/lib/programs/blueprint';
import { EQUIPMENT, LEVELS } from '@/lib/programs/certified';
import { useToast } from '@/lib/toast/store';
import { useForClient, withClient } from '@/lib/programs/for-client';
import { TopBar } from '@/components/shell/TopBar';
import { ExerciseInfoPanel } from './ExerciseInfo';
import type { Detail } from './Builder';
import { WeekBoard } from './week/WeekBoard';
import { PhoneProgram } from './week/PhoneProgram';
import { PlusIcon } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { Chip } from '@/web-components/ui/Chip';
import { Crumbs } from '@/web-components/ui/Crumbs';

/**
 * `/programs/certified/:id` — one certified program, read-only.
 *
 * ── IT IS THE SAME SCREEN AS `/programs/:id`, WITH EVERY WRITE STOOD DOWN ───
 *
 * That was the original plan, abandoned twice, and both retreats produced the
 * same defect from a different direction.
 *
 * The first attempt reused `DayColumn` and inherited the BUILDER's geometry:
 * `.dayc` is `flex:0 0 236px` because *"a day is a LANE, and the empty part of
 * a lane is the drop target"* — true where you can drop, and this screen cannot,
 * so it bought a target nobody can hit with a third of its plane. The second
 * attempt wrote `DayBand` instead: a full-width table with a Target column, and
 * a genuinely good read. But it was a SECOND RENDERING of a day, and the drift
 * arrived exactly where a second rendering always puts it — the day header, the
 * ordinals, the superset footer, the figures line and the duplicate-movement
 * note were each two authors' versions of one thing, and the board underneath
 * them was replaced wholesale by `WeekBoard` while the band was not.
 *
 * So the third answer is the first one done properly: `WeekBoard` with
 * `readOnly`, which is a flag on the components that already draw a day rather
 * than a parallel set of them. What that costs is stated in `DayCard`'s prop —
 * the affordances go and no information does — and what it buys is that every
 * future change to a day reaches this screen for free.
 *
 * ── WHAT IS *NOT* SHARED WITH THE BUILDER, AND WHY ─────────────────────────
 *
 * The HEADER. `Certified`, the summary sentence, *Reviewed Aug 2026*, *Used by
 * 214*, *Use this — copy to my programs*: every one of those is a fact about
 * the CATALOGUE and not about the blueprint, so there is nothing on the
 * builder's header for them to disagree with. The builder's own header says
 * what the draft is doing — the save state, who is on it, Assign — and none of
 * that has a meaning here.
 *
 * The 900-odd lines of `Builder` are not shared either, and that half of the
 * old argument still holds: they are the DRAFT. The twenty-deep undo stack, the
 * debounced autosave and its `beforeunload`, the row / library / progression /
 * assign panels, the drag payload. A preview can write nothing, so threading a
 * flag through all of it would leave every one of those allocated and make
 * every future `Builder` change responsible for a branch nothing here can
 * reach. The line is drawn at the BOARD, which is the part that draws a
 * program, and not at the machinery that edits one.
 *
 * ── THE BALANCE PANEL IS THE POINT OF DOING THIS AT ALL ────────────────────
 *
 * It comes with the board and it only ever reads. *Legs 26 — above the 20-set
 * ceiling* is the fact a trainer wants before they put somebody else's program
 * on a client, and the screen whose entire job is answering *should I copy
 * this* did not have it.
 */
export function CertifiedPreview({ data }: { data: CertifiedPreviewData }) {
  const router = useRouter();
  const forClient = useForClient();
  const { template, names } = data;
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();

  const entries = useMemo(() => toEntries(template.exercises), [template.exercises]);
  const days = useMemo(() => daysOf(template, entries), [template, entries]);
  const weeks = useMemo(() => weekCountOf(template, entries), [template, entries]);

  const [week, setWeek] = useState(1);
  /**
   * ── AND THE OTHER AXIS, WHICH IS THE READING THIS SCREEN WAS MISSING ─────
   *
   * `Builder` has had *View · Week | Day* since the transpose landed, and the
   * preview did not — so the one question a trainer asks before putting
   * somebody else's eight-week block on a client, *does week 5 differ from week
   * 1 at all, and is the bench going up*, could be answered on the screen where
   * you own the program and not on the screen where you are deciding whether to.
   *
   * It costs nothing to offer here. The day axis is `WeekBoard` transposed —
   * one renderer, two arrangements — and every write on it is already behind
   * `readOnly`: no `onPickWeek` (there is no live week to move), no drags, no
   * card menus. The week strip stands down on this axis exactly as it does on
   * the builder, because eight cards ARE the eight weeks and a strip that
   * picked one of them would be picking nothing.
   */
  const [axis, setAxis] = useState<'week' | 'day'>('week');
  /** Which slot the day axis is on. A SLOT, not a weekday — law 1. Falls back
   *  to the first trained day, which is what `WeekBoard` would pick anyway. */
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const dayShown = focusDay !== null && days.includes(focusDay) ? focusDay : days[0] ?? 1;
  /**
   * ONE DAY OF ONE WEEK, WITH LAW 3 ALREADY RESOLVED — `Builder.weekOfDay`,
   * verbatim, and the two lines are the whole reason it cannot be
   * `effectiveWeek` alone: a week that repeats week 1 comes back holding week
   * 1's rows, so the SLOT has to be read out of week 1 while the card still
   * reports the week as a repeat. Written the other way the board draws every
   * day of the week in each card — measured as *Workout 1*, *Workout 2* and
   * *Workout 3* stacked in all eight columns of a board whose only job is to
   * put ONE day beside itself.
   */
  const weekOfDay = useCallback(
    (w: number) => {
      const eff = effectiveWeek(entries, w);
      return { rows: entriesFor(eff.rows, eff.repeat ? 1 : w, dayShown), repeat: eff.repeat };
    },
    [entries, dayShown],
  );
  /* FULL BY DEFAULT, AND THAT IS THE BAND'S TARGET COLUMN ARRIVING BY ANOTHER
     ROUTE. `DayBand` gave a certified day a *Target* column, and its argument
     was right: a trainer deciding whether a day is a push day should read that
     rather than infer it from five exercise names. The builder's row carries
     the same information as the `Full` density's second line — muscle · target
     · equipment · level — so nothing is lost by sharing the renderer, PROVIDED
     this screen opens on the density that shows it. The builder opens Compact
     because its reader wrote the program and knows what is in it; this one
     opens Full because its reader has never seen it. */
  const [detail, setDetail] = useState<Detail>('full');
  /** *What Barbell Row is* — the only row action that survives read-only, and
   *  the one a trainer reading somebody else's program reaches for most. */
  const [info, setInfo] = useState<string | null>(null);

  const shown = effectiveWeek(entries, week);
  const sourceWeek = shown.repeat ? 1 : week;
  const authored = authoredWeeks(entries);
  const weekBalance = useMemo(
    () => balance(shown.rows, days, sourceWeek, names),
    [shown.rows, days, sourceWeek, names],
  );
  const infoRow: Entry | undefined = info ? entries.find(e => e.uid === info) : undefined;

  const meta = template.certified;
  const mine = template.mine;

  function use() {
    setError(null);
    start(async () => {
      const result = await copyCertified(template.id);
      if (result.ok) {
        /* The card's confirm, from the other door — see `CertifiedCard`, which
           carries the argument for why this is a toast that outlives the
           navigation rather than the `?copied=1` band it replaces. */
        show({
          tone: 'ok',
          title: <>Copied into your programs</>,
          body: <>{result.value.name} &mdash; the certified original is untouched.</>,
        });
        router.push(withClient(`/programs/${result.value.id}`, forClient));
      } else setError(result.message);
    });
  }

  return (
    <>
      {/* THE BAR NAMES THE SECTION AND IS THE WAY BACK TO IT — the builder's
          own arrangement, and this screen had it the other way round.

          It used to pass `title={template.name}`, which put the program's name
          in a 208px slot that truncates and then made `.ph--named` hide the
          `<h1>` that had the full width to draw it properly. That is the exact
          defect the builder's TopBar comment records — *"MEASURED at 390px
          neither copy was complete: 208px in the bar, 184px in the switcher, of
          a string needing 244. Two truncations of one name."*

          So the name goes where it can wrap — `.ph`'s `<h1>`, and NO
          `.ph--named`, which is why `app.css`'s own note says this route is
          deliberately in none of the `ph--*` classes — and the bar takes the
          one thing nothing else on the screen says: which section this is.
          `titleHref` makes that word a back control, which is what its own doc
          asks for: *"pass it with a `title` naming the SECTION."*

          The crumb keeps the full path for the desk, where the bar draws no
          title at all and a path is a path. */}
      <TopBar
        crumb={`Fitness · Templates · ${template.name}`}
        title="Templates"
        titleHref="/programs/certified"
      />

      <main className="main body--flush pg pg--cert" id="main-content">
        {/* ONE HEADER, WHERE THERE WERE FOUR BANDS. The banner that used to sit
            above this — *Preview. This is InclineYou's copy…* — was a 49px strip
            carrying the only two buttons on the screen, so the buttons are the
            header's actions and the sentence is a line beside the tags. */}
        <div className="ph ph--cert">
          <div className="ph__row">
            <div className="pg__phm">
              {/* ── THE PATH BACK TO THE SHELF, AND IT IS THE BUILDER'S ──────
                  `/programs/:id` answers *where am I and how do I leave* with a
                  crumb row above its `<h1>`; this screen answered it with a
                  *Back to templates* `Button` in `.ph__acts`, and two adjacent
                  screens answering one question two ways is what heuristic 4
                  forbids. Both notes said so and both deferred, because the
                  choice between the two controls was a MEASUREMENT: the builder
                  has no room in `.ph__acts` (358px of actions, `.pg__phm`
                  `flex:1`, −6px of spare at every width) and this screen does.
                  Room is what makes the button POSSIBLE here, not what makes it
                  right — so the two screens agree on the crumb.

                  TWO LEVELS, the builder's own rule: its note drops *Fitness*
                  because the rail's Fitness icon already points at `/programs`,
                  and a third level here would be *Programs*, which is that same
                  destination. `Programs` and `Templates` are two TABS of one
                  shelf rather than two levels of a path — `lib/programs/tabs.ts`
                  owns the pair — so nesting one inside the other would draw a
                  hierarchy the routes do not have.

                  `pg__crumbs` and not a class of its own: `.pg .pg__crumbs`
                  already takes `flex:1 0 100%` under `@media (max-height:700px)`,
                  which is the query that makes `.pg__phm` a wrapping flex row —
                  and `.main` here carries `pg`, so the rule that keeps the
                  builder's crumb off the title's line keeps this one off it too,
                  with nothing restated. */}
              <Crumbs
                className="pg__crumbs"
                items={[
                  { label: 'Templates', href: withClient('/programs/certified', forClient) },
                  { label: template.name },
                ]}
              />
              <div className="row">
                <h1 className="ph__t">{template.name}</h1>
                <Tag tone="acc">By InclineYou</Tag>
              </div>
              {/* the summary takes the subtitle slot, because it is the thing a
                  trainer reads to decide. The figures it displaced became tags
                  below — they are counts, which is what the tag row is. */}
              {meta && <p className="cert__sum">{meta.summary}</p>}
            </div>

            <div className="ph__acts">
              {/* *BACK TO TEMPLATES* USED TO STAND HERE and the crumb is why it
                  does not. It pointed exactly where the crumb's first segment
                  now points, ~40px above it — the same duplicate the session
                  screens removed when their crumb arrived (*Client file* left
                  both action rows for this reason). A row is not the place to
                  keep a second door to the room the path already names.

                  Below 900px nothing is lost either: that button was
                  `display:none` there, and `TopBar`'s `titleHref` draws
                  `‹ Templates` in the bar — which is also why the crumb row
                  itself stands down at that width rather than being a second
                  control 100px under the first. */}
              {mine ? (
                <Button href={withClient(`/programs/${mine.id}`, forClient)} variant="primary" size="sm">
                  Open your copy
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={use}
                >
                  {busy ? (
                    'Copying…'
                  ) : (
                    <>
                      <PlusIcon size={13} />
                      Use this
                      {/* dropped under 620px, where the pair would otherwise
                          take a row each. The accessible name keeps both halves
                          — the same trade `/schedule`'s secondary makes. */}
                      <span className="cert__long">— copy to my programs</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* NINE TAGS, ONE ROW, AND UNDER 900px IT SCROLLS — see
              `.cert__meta` in `app.css`, which takes `overflow-x:auto` and the
              `local`/`scroll` fade pair rather than wrapping to four lines. */}
          <p className="cert__meta">
            {meta && <Tag>{LEVELS[meta.level]}</Tag>}
            {meta && <Tag>{EQUIPMENT[meta.equipment]}</Tag>}
            {template.goal && <Tag>{template.goal}</Tag>}
            <Tag>
              {days.length} day{days.length === 1 ? '' : 's'} a week
            </Tag>
            <Tag>
              {weeks} week{weeks === 1 ? '' : 's'}
            </Tag>
            <Tag>
              {template.exerciseCount} exercise{template.exerciseCount === 1 ? '' : 's'}
            </Tag>
            {meta && <Tag>Reviewed {monthYear(meta.reviewedAt)}</Tag>}
            {meta && <Tag>Used by {meta.usedCount}</Tag>}
            {/* THE BANNER'S PROMISE, IN FOUR WORDS. It was a sentence on its own
                line, and measuring said the line cost 20px at every width to
                restate what the primary button one row up already says — *Use
                this — copy to my programs*. Inside the row it is the last item,
                which is where a fact about the SCREEN belongs among facts about
                the program. */}
            <span className="cert__note">Read-only · copy it to edit</span>
          </p>

        </div>

        {error && (
          <p className="pg__flash" role="status">
            {error}
          </p>
        )}

        {/* `.split--solo` — ONE TRACK, AND THE CLASS IS WHY IT IS NOT `.split`
            WITHOUT IT. `.split` is `var(--w-list) minmax(0,1fr)`, so a single
            child auto-places into the 400px column and the whole board renders
            400px wide. The builder has a shelf to put there; this screen's list
            pane is the certified grid it came from, which is a route. */}
        <div className="split split--solo">
          <div className="split__r pg__builder">
            <ReadToolbar
              weeks={weeks}
              week={week}
              setWeek={setWeek}
              authored={authored}
              repeats={repeatLine(entries, weeks)}
              overload={overloadLine(entries)}
              detail={detail}
              setDetail={setDetail}
              axis={axis}
              onAxis={setAxis}
              days={days}
              focusDay={dayShown}
              onFocusDay={setFocusDay}
            />

            {/* BOTH SHELLS, AND CSS PICKS ONE AT 900px — the builder's own
                arrangement, for the reason `WeekBoard` states: a day at a desk
                is a card beside two panels and on a phone it is a tile that
                opens a screen, and no media query turns one into the other.

                `.pgw--read` USED TO BE HERE and is gone. It kept the desk board
                at phone widths because there was no read-only `PhoneProgram` to
                swap in, and a board is better than the blank screen the
                inherited swap would have produced — but it was never this
                design. What it could not draw is exactly what a trainer
                deciding whether to copy a block wants: a volume bar and a
                muscle summary per day, and *Across weeks* as a line that
                opens. */}
            <div className="pgw">
              <div className="pgw__desk">
                <WeekBoard
                  readOnly
                  /* SEVEN LANES, THE BUILDER'S OWN WEEK. The prop's doc carries
                     the argument and the measurement; the short board's two
                     552px tracks holding 440px cards were this screen's largest
                     single piece of dead plane. */
                  fullWeek
                  /* ONE DAY, EVERY WEEK — see the `axis` state above. The three
                     props below are what make that axis reachable; hand it any
                     two of them and `WeekBoard` falls back to the week board,
                     which is the guard its own `axis` line states. */
                  axis={axis}
                  weekCount={weeks}
                  focusDay={dayShown}
                  weekOf={weekOfDay}
                  days={days}
                  labels={template.dayLabels}
                  detail={detail}
                  rows={shown.rows}
                  names={names}
                  week={week}
                  repeat={shown.repeat}
                  balance={weekBalance}
                  entriesForDay={day => entriesFor(shown.rows, sourceWeek, day)}
                  /* REQUIRED BY THE INTERFACE AND UNREACHABLE: `readOnly`
                     renders the library dock not at all, so nothing on this
                     screen can call these. They are not optional on the props
                     because the builder must not be able to forget them. */
                  library={null}
                  onOpenLibrary={() => {}}
                  onAddExercise={() => {}}
                  /* THE ONE ROW ACTION THAT READS. Every other item in
                     `RowMenuItems` writes, and `hasRowActions` is what keeps
                     the `⋯` from opening an empty box once they are all gone. */
                  onInfoRow={entry => setInfo(entry.uid)}
                />
              </div>

              <div className="pgw__phone">
                <PhoneProgram
                  readOnly
                  programName={template.name}
                  days={days}
                  labels={template.dayLabels}
                  weeks={weeks}
                  week={week}
                  authored={authored}
                  onWeek={setWeek}
                  repeat={shown.repeat}
                  balance={weekBalance}
                  names={names}
                  entriesForDay={day => entriesFor(shown.rows, sourceWeek, day)}
                  entries={entries}
                  /* THE EXERCISE PANEL IS A SURFACE OVER THESE LEVELS, and
                     that is exactly what `covered` is for. `PhoneProgram`'s
                     Escape ladder runs in CAPTURE and would otherwise swallow
                     the press and close the DAY underneath a panel that stayed
                     open — the defect its own prop doc records, arriving here
                     from a third caller. The panel is `position:fixed;inset:0`
                     under 1180px and carries its own Escape. */
                  covered={info !== null}
                  /* Unreachable read-only, and required so the builder cannot
                     forget them — see the desk board's own note. */
                  onAdd={() => {}}
                  onField={() => {}}
                  freeSlots={[]}
                  onInfoRow={entry => setInfo(entry.uid)}
                />
              </div>
            </div>
          </div>

          {/* INSIDE THE SPLIT, not beside it. `.split:has(> .dock)` is
              what gives the panel its 380px track, and it reads a DIRECT child
              — as a child of `.main` the panel would have had no track at all
              and laid itself over the board. `.split--solo:has(> .dock)`
              carries the two-track version of that in `app.css`. */}
          {info && infoRow && (
            <ExerciseInfoPanel
              key={info}
              exerciseId={infoRow.exerciseId}
              fallbackName={names[infoRow.exerciseId]?.name}
              /* NO `context`, and the omission is the honest answer. That block
                 says *on Day 2 of YOUR program, 3 sets, and here is your note*
                 — facts about a blueprint the trainer owns. On somebody else's
                 catalogue entry the same sentence would be a claim about a
                 program they have not copied. */
              onClose={() => setInfo(null)}
            />
          )}
        </div>
      </main>
    </>
  );
}

/* ─────────────────────────────────────────── the control strip ── */

/**
 * THE BUILDER'S `Toolbar`, WITH THE TWO WRITES REMOVED.
 *
 * `.wsc` and every class in it are shared, so the strip is the same 47px band
 * in the same place saying the same two things. What is gone is the `+` chip
 * that adds a week and the *Progression · Set a rule* chip that writes
 * thirty-six cells — both of which edit a program, and neither of which has a
 * read-only reading. What stays is which week, and how much of a row to draw.
 *
 * The GHOST chip stays too, and it is the whole model drawn: a solid chip is a
 * week somebody authored, a ghost one repeats week 1. *Is week 6 different from
 * week 1* is the question a trainer wants answered before they copy anything,
 * and twelve identical chips would be the blank grid the model exists to refuse.
 */
function ReadToolbar({
  weeks,
  week,
  setWeek,
  authored,
  repeats,
  overload,
  detail,
  setDetail,
  axis,
  onAxis,
  days,
  focusDay,
  onFocusDay,
}: {
  weeks: number;
  week: number;
  setWeek: (w: number) => void;
  authored: Set<number>;
  /** "weeks 2–8 repeat week 1", or empty when nothing does. */
  repeats: string;
  /** The ladder the authored rows actually carry, or null when none is. */
  overload: string | null;
  detail: Detail;
  setDetail: (d: Detail) => void;
  /** Which way the board is laid — see `CertifiedPreview`'s own `axis` state. */
  axis: 'week' | 'day';
  onAxis: (axis: 'week' | 'day') => void;
  /** The trained slots, and which one the day axis is on. Drawn only on that
   *  axis: on the week axis every day is already a card. */
  days: number[];
  focusDay: number;
  onFocusDay: (day: number) => void;
}) {
  return (
    <div className="wsc">
      {/* THE AXIS, FIRST ON THE STRIP — the builder's order, and for the
          builder's reason: it decides what the strip beside it MEANS. A control
          that changes the reading of its neighbour goes to its left. */}
      <div className="wsc__g">
        <span className="wsc__k">View</span>
        <div className="tools" role="group" aria-label="How the board is laid out">
          {(['week', 'day'] as const).map(a => (
            <Chip pressed={axis === a} key={a} onClick={() => onAxis(a)}>
              {a === 'week' ? 'Week' : 'Day'}
            </Chip>
          ))}
        </div>
      </div>

      {axis === 'week' && (
        <div className="wsc__g">
          <span className="wsc__k">Week</span>
          <div className="wk">
            {Array.from({ length: weeks }, (_, i) => i + 1).map(w => (
              <button
                key={w}
                className={authored.has(w) ? 'chip' : 'chip chip--ghost'}
                type="button"
                aria-pressed={week === w}
                onClick={() => setWeek(w)}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* WHICH DAY THE BOARD IS ON, and only on the day axis — where the eight
          cards are the eight WEEKS and nothing else names the slot they share.
          The builder's own strip, minus nothing: it was already a pure view
          control there. */}
      {axis === 'day' && (
        <div className="wsc__g">
          <span className="wsc__k">Day</span>
          <div className="wk" role="group" aria-label="Which day the board is on">
            {days.map(d => (
              <Chip
                key={d}
                pressed={focusDay === d}
                aria-label={`Day ${d}`}
                onClick={() => onFocusDay(d)}
              >
                {d}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* ── WHAT THE OTHER SEVEN WEEKS ARE, AND WHETHER ANYTHING CLIMBS ─────
          This said *this week repeats week 1* — true of the week on screen, and
          the wrong sentence for this reader. A trainer deciding whether to put
          somebody else's block on a client is asking whether *8 weeks* on the
          tag row is eight weeks of PROGRAMMING or one week written eight times,
          and on week 1 the old line said nothing at all: the whole fact was
          carried by which chips happened to be drawn as ghosts.

          `repeatLine` states it up front and `overloadLine` answers the other
          half — the shape week 1 opens on against the shape the last authored
          week reaches. Both are the builder's own readings, computed by the
          same two functions, so the screen you evaluate a program on and the
          screen you edit it on cannot describe one block two ways.

          Not on the day axis: eight cards each saying *repeats week 1* is that
          sentence already told eight times, which is the point of the axis. */}
      {axis === 'week' && repeats && <span className="wsc__rep">{repeats}</span>}
      {axis === 'week' && overload && <span className="wsc__rep">{overload}</span>}

      <span className="wsc__sp" />

      <div className="wsc__g">
        <span className="wsc__k">Detail</span>
        <div className="tools" role="group" aria-label="How much of each row to draw">
          {(['compact', 'full'] as const).map(d => (
            <Chip
              pressed={detail === d}
              key={d}
              onClick={() => setDetail(d)}
            >
              {d === 'compact' ? 'Compact' : 'Full'}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

/** `Aug 2026`. A review date is a claim about a month, not a day. */
function monthYear(at: number): string {
  return new Date(at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

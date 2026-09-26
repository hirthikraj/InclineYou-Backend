'use client';

import { useMemo, useState } from 'react';

import type { ClientProgramsData, ClientWire, ProgramWire } from '@/lib/programs/api';
import { GOALS, dayNamesOf, goalKeyOf, type GoalKey } from '@/lib/programs/blueprint';
import { planHref } from '@/lib/programs/plan-origin';
import { programsTabs } from '@/lib/programs/tabs';
import { PageTabs } from '@/components/shell/PageTabs';
import { TopBar } from '@/components/shell/TopBar';
import { SearchIcon } from './Icons';
import { Chip } from '@/web-components/ui/Chip';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Facet } from '@/web-components/ui/Facet';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { ProgramRow, ProgramRowHead } from '@/web-components/ui/ProgramRow';
import { RowMenu } from '@/web-components/ui/RowMenu';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';

/**
 * `/programs` — **who is training on what**, which is the question the word
 * names and the one this section could not answer.
 *
 * ── WHAT THIS REPLACES, AND WHY IT IS NOT A RENAME ──────────────────────────
 *
 * This route drew the trainer's shelf of BLUEPRINTS, which is now the Templates
 * tab. The distinction is the section's oldest rule and the one it kept
 * breaking on this screen: `POST /v1/templates/{id}/apply` copies a blueprint
 * into `program` and from that moment **a copy is a copy** — nothing reaches
 * back through `program.template_id`, the trainer tunes it for a shoulder or a
 * Tuesday, and what the client is actually doing is the copy. So a page called
 * Programs that listed templates was naming the wrong table, and the right one
 * was reachable nowhere: one client at a time, through that client's file,
 * twenty-four files to answer *is everybody on something*.
 *
 * ── IT IS THE SAME ROW, WITH ONE COLUMN SWAPPED ─────────────────────────────
 *
 * Not a new table and not a new list component: `c-programrow`, the head that
 * ships with it, and `.pgt`'s card — the same eight columns the shelf draws,
 * because a copy and its blueprint have the same shape, the same week count,
 * the same goal and the same stamp. What changes is the fifth column. On a
 * blueprint it is *how many are on this*, which is the only cell on the row
 * that moves without anybody editing the program; on a copy that figure is `1`
 * for the life of the row, so the same 176px track carries the NAME instead —
 * which is the width it was sized for. `ProgramRow`'s `client` prop carries the
 * argument and the head flips the one word over it.
 *
 * ── THE FILTERS ARE STATE, NOT THE URL ──────────────────────────────────────
 *
 * Trap 25 draws the line at what is FETCHED: the tab is in the address because
 * it is a different read, and the client, the status and the goal are not,
 * because every one of them narrows a payload the browser already holds. A
 * `?clientId=` here would spend a server round trip and a history entry on each
 * twitch of a facet. `/clients/assessments` puts the identical three axes in
 * its URL and is right to — that list re-fetches.
 *
 * `Facet` and not `Chip` for the client: its own header names this exact axis
 * as the case its find field was written for. A roster is not a vocabulary of
 * four statuses; it is every person the trainer coaches, and a menu that can
 * only be scrolled asks them to read a list to find somebody whose name they
 * already know.
 */
export function ClientPrograms({
  data,
  now,
  /** For the Templates tab's badge. `null` on a read that failed — `PageTabs`
   *  omits it rather than drawing a zero. */
  templateCount,
}: {
  data: ClientProgramsData;
  now: number;
  templateCount: number | null;
}) {
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusKey>('active');
  const [goal, setGoal] = useState<GoalKey | null>(null);

  /* The roster, keyed, so a row can name its own client without scanning. It is
     the whole list and not the filtered one: a programme belonging to somebody
     who has since been archived still has to draw their name, or the row reads
     as a plan assigned to nobody. */
  const byId = useMemo(() => {
    const m = new Map<string, ClientWire>();
    for (const c of data.clients) m.set(c.id, c);
    return m;
  }, [data.clients]);

  const rows = useMemo(
    () =>
      data.programs
        .map(p => ({ program: p, client: byId.get(p.clientId) ?? null }))
        /* TOTAL-ORDERED, and the tie-break is not decoration — trap 29: an
           `ORDER BY` with ties may answer in any order, and this list has one
           row per client per block, so two programmes written in the same
           minute would reshuffle between page loads. Newest first, then the
           name, then the id, which no two rows share. */
        .sort(
          (a, b) =>
            b.program.updatedAt - a.program.updatedAt ||
            (a.client?.name ?? '').localeCompare(b.client?.name ?? '') ||
            a.program.id.localeCompare(b.program.id),
        ),
    [data.programs, byId],
  );

  /* THE COUNTS ARE OFF THE OTHER AXES, NOT OFF WHAT IS ON SCREEN. A facet whose
     figures counted the rows the facets had already left would answer *Ended 0*
     while filtering to Active — which is a filter reporting on itself. Each
     axis counts the list with its OWN filter lifted and the others applied,
     which is what makes the numbers a forecast of pressing it. */
  const forClient = useMemo(
    () => rows.filter(r => matchStatus(r.program, status) && matchGoal(r.program, goal) && matchText(r, query)),
    [rows, status, goal, query],
  );
  const forStatus = useMemo(
    () => rows.filter(r => matchClient(r, clientId) && matchGoal(r.program, goal) && matchText(r, query)),
    [rows, clientId, goal, query],
  );
  const forGoal = useMemo(
    () => rows.filter(r => matchClient(r, clientId) && matchStatus(r.program, status) && matchText(r, query)),
    [rows, clientId, status, query],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        r =>
          matchClient(r, clientId) &&
          matchStatus(r.program, status) &&
          matchGoal(r.program, goal) &&
          matchText(r, query),
      ),
    [rows, clientId, status, goal, query],
  );

  const goalCounts = useMemo(() => {
    const m = new Map<GoalKey, number>();
    for (const r of forGoal) {
      const k = goalKeyOf(r.program.goal);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [forGoal]);

  const narrowed = clientId !== null || status !== 'active' || goal !== null || query.trim() !== '';

  return (
    <>
      <TopBar crumb="Fitness · Programs" title="Programs" />

      <main className="main body--flush pg" id="main-content">
        {/* `ph--pglist` is the shelf's class and this screen wears it for the
            same reason: on a phone it stands the headline down, because the
            crumb and the active tab both already say *Programs*. `ph--pgshelf`
            is NOT worn — that one stands a primary button down, and there is no
            primary here. Nothing on this page creates a programme: a copy is
            made by assigning a blueprint, which is the Templates tab's verb and
            the client file's, and a *New program* button here would offer to
            make one with nobody to give it to. */}
        {/* `PageHeader`, not a hand-written `.ph` — the shelf next door writes
            its own and is the call-site `check-components` records; a second
            copy is how the two headers on one tab strip drift apart.

            `ph--pglist` is the shelf's class and this screen wears it for the
            same reason: on a phone it stands the headline down, because the
            crumb and the active tab both already say *Programs*.
            `ph--pgshelf` is NOT worn — that one stands a primary button down,
            and there is no primary here. Nothing on this page creates a
            programme: a copy is made by assigning a blueprint, which is the
            Templates tab's verb and the client file's, and a *New program*
            button here would offer to make one with nobody to give it to.

            The strip goes in `children` and not in `tabs`: that prop wraps what
            it is given in a `.ph__tabs`, and `PageTabs` renders its own — the
            prop's note says so and names the component. What goes in here is
            `.pgtabs`, the row that holds the strip AND the search field, which
            is `/programs/templates`' arrangement and its argument: the field
            that narrows the list belongs beside the tabs that change it. */}
        <PageHeader
          title="Programs"
          /* `headerLine` — THE SENTENCE IS ABOUT PEOPLE, NOT ABOUT ROWS.
             *24 programmes* restates the list under it; what no column answers
             by being scanned is how many of the roster are training to
             something at all, which is the figure a trainer opens this page
             for. Its own header carries the arithmetic. */
          sub={headerLine(rows, data.clients)}
          className="ph--pglist"
        >
          <div className="pgtabs">
            <PageTabs
              label="Fitness"
              current="programs"
              tabs={programsTabs('programs', { templates: templateCount })}
            />

            <label className="search pgtabs__q">
              <SearchIcon />
              <input
                type="search"
                placeholder="Search programs and clients"
                aria-label="Search programs and clients"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>
          </div>
        </PageHeader>

        <div className="pgt">
          <div className="pgt__hd">
            <div className="pgt__sort">
              <span className="pgt__sortk">Filter</span>
              <Facet
                label="Client"
                single
                /* THE AXIS WHOSE VALUES ARE PEOPLE, and the only one here wide
                   enough to hold a find field — `Facet`'s own note names it as
                   the case the field was written for. `find` carries the phone,
                   because a trainer who has just had a message often has the
                   number and not the spelling. */
                width={288}
                search={{
                  placeholder: 'Search by name or phone',
                  empty: 'No client matches your search',
                  noun: 'clients',
                }}
                selected={clientId ? [clientId] : []}
                onChange={next => setClientId(next[0] ?? null)}
                options={clientOptions(forClient, data.clients)}
              />
              <Facet
                label="Status"
                /* SINGLE, with *All* in the list, and the pill stays OFF on the
                   default. `Facet` draws `facet--on` from a non-empty
                   selection, so passing `[]` for the value that is not
                   filtering is what stops a filter lighting up to say it is not
                   one. *Active* is the default rather than *All* because a list
                   that opens on every block anybody has ever finished is a list
                   whose first screen is history. */
                single
                selected={status === 'all' ? [] : [status]}
                onChange={next => setStatus((next[0] as StatusKey) ?? 'all')}
                options={STATUSES.map(s => ({
                  value: s.key,
                  label: s.label,
                  count: forStatus.filter(r => matchStatus(r.program, s.key)).length,
                }))}
              />
            </div>

            {/* The goal chips are the shelf's, verbatim in shape: a short fixed
                vocabulary a screen can draw all of is exactly what a `Chip` row
                is for, and unlike the two axes above it needs no name — every
                value in it is a goal and reads as one. Drawn only where it
                narrows anything: two goals across a whole book is a filter that
                cannot separate it. */}
            {goalCounts.size > 1 && (
              <div className="tools" role="group" aria-label="Filter by goal">
                <Chip pressed={goal === null} onClick={() => setGoal(null)}>
                  All {forGoal.length}
                </Chip>
                {GOALS.filter(g => (goalCounts.get(g.key) ?? 0) > 0).map(g => (
                  <Chip
                    key={g.key}
                    pressed={goal === g.key}
                    onClick={() => setGoal(goal === g.key ? null : g.key)}
                  >
                    {g.label} {goalCounts.get(g.key)}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="pgt__body">
            {filtered.length === 0 ? (
              /* TWO EMPTIES, NOT ONE — `EmptyState`'s own rule, and the shelf's
                 note beside its own pair. *Nothing matches* over a book of
                 forty and *nobody is on a program* are the same shape and
                 completely different claims, and only the first is arrived at
                 by typing, which is why only the first is a `role="status"`:
                 the rows vanish silently and a reader is left in a region that
                 has gone blank. */
              <EmptyState
                kind={narrowed ? 'filtered' : 'first-run'}
                title={narrowed ? 'No programs match' : 'Nobody is on a program yet'}
                body={
                  narrowed
                    ? `Nothing here matches${query.trim() ? ` “${query.trim()}”` : ' the filters you have set'}. ${rows.length} program${rows.length === 1 ? ' is' : 's are'} on the book.`
                    : 'A program is a copy of one of your templates, made when you assign it to somebody. Assign one and it appears here.'
                }
                action={
                  narrowed ? (
                    <Button variant="secondary" onClick={clearAll}>
                      Clear the filters
                    </Button>
                  ) : (
                    <Button href="/programs/templates" variant="primary">
                      Browse your templates
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <ProgramRowHead client actionable />
                <ul className="pgt__l" role="list">
                  {filtered.map(r => (
                    <li key={r.program.id}>
                      <CopyRow row={r} now={now} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );

  /* BACK TO THE DEFAULT, NOT TO NOTHING. *Active* is where this list opens and
     `narrowed` is measured against that, so clearing to *All* would leave the
     button standing under an empty state offering to clear filters it had just
     set. The verb means *put it back the way it opened*. */
  function clearAll() {
    setQuery('');
    setClientId(null);
    setStatus('active');
    setGoal(null);
  }
}

/* ══════════════════════════════════════════════════════════ one row ══ */

interface Copy {
  program: ProgramWire;
  client: ClientWire | null;
}

/**
 * ONE CLIENT'S COPY, AS COLUMNS — and every figure on it comes off the copy's
 * own row rather than off the blueprint it was taken from.
 *
 * That is `V2__program_shape.sql`'s whole point: `day_labels`, `weeks` and
 * `training_days` are columns on `program` precisely so a copy can be drawn,
 * and named, without reading its exercises or reaching back through
 * `template_id` — which by then may be a blueprint the trainer deleted, or one
 * that has moved three times since.
 */
function CopyRow({ row, now }: { row: Copy; now: number }) {
  const { program, client } = row;
  const days = daysOfCopy(program);
  const ended = program.status !== 'active';

  return (
    <ProgramRow
      name={program.name}
      /* THE COPY'S OWN ROUTE, never `/programs/{templateId}`. `ProgramTab`'s
         own note says it in one line — that URL is not this client's copy —
         and a row that linked there would open the blueprint under the name of
         the person whose tuned version the trainer was looking for. */
      /* `?from=programs`, WHICH IS THE ONE THING THIS ROW KNOWS AND THE
         SCREEN IT OPENS CANNOT. A copy hangs off two shelves — this list and
         the client's own file — and the plan screen is byte-identical from
         either, so without the parameter its crumb would send a trainer who
         came off THIS page into a stranger's file. See `plan-origin.ts`. */
      href={planHref(program.clientId, program.id, 'programs')}
      sub={dayNamesOf(program, days)}
      days={days}
      /* Unused on this row: `client` takes the column. Passed as 1 because the
         prop is the count of who is on the thing, and one person is. */
      clients={1}
      client={client ? { id: client.id, name: client.name } : undefined}
      weeks={program.weeks ?? 1}
      goal={program.goal}
      edited={editedAgo(program.updatedAt, now)}
      /* ENDED IS DRAWN AND ACTIVE IS NOT. A tag on every row of a list filtered
         to Active is a tag saying nothing; the one that has to be visible is
         the block that is over, because the *All* filter is where a trainer
         goes looking for what somebody did last time and every row there would
         otherwise read as current. NEUTRAL, and it is the only tone that is
         right: a finished block is not a warning, not a success and not
         provenance — `--acc` beside it is what *From templates* means on a
         shelf row, and two accent tags on one row would be two claims about
         where the plan came from. */
      tag={ended ? <Tag>{endedWord(program.status)}</Tag> : undefined}
      actions={
        <RowMenu
          label={program.name}
          items={[
            { label: 'Open the client file', href: `/clients/${program.clientId}` },
            /* THE BLUEPRINT, WHERE ONE IS STILL THERE. Null once it has been
               deleted, which is survivable and not an error — the copy is
               whole on its own, `ProgramWire.templateId`'s own note — so the
               row is dropped rather than drawn dead. */
            ...(program.templateId
              ? [{ label: 'Open the template it came from', href: `/programs/${program.templateId}` }]
              : []),
          ]}
        />
      }
    />
  );
}

/* ═══════════════════════════════════════════════════════ the filters ══ */

type StatusKey = 'all' | 'active' | 'ended';

const STATUSES: { key: StatusKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  /* ONE WORD FOR THREE COLUMN VALUES. `program.status` is free text on the wire
     and the seed writes `completed` and `cancelled` beside `active`; the
     difference between a block somebody finished and one that was called off
     is a fact about that programme and belongs on its row, not on a filter. A
     trainer narrowing a list is asking *is this still running*, which is one
     axis with two values. The row's own tag says which. */
  { key: 'ended', label: 'Ended' },
];

function matchStatus(p: ProgramWire, key: StatusKey): boolean {
  if (key === 'all') return true;
  return key === 'active' ? p.status === 'active' : p.status !== 'active';
}

function matchClient(r: Copy, clientId: string | null): boolean {
  return clientId === null || r.program.clientId === clientId;
}

function matchGoal(p: ProgramWire, goal: GoalKey | null): boolean {
  return goal === null || goalKeyOf(p.goal) === goal;
}

/**
 * The field matches the PROGRAMME and the PERSON, which is why it says both.
 *
 * A trainer looking for *Meera's block* has one of those two words, and which
 * one it is depends entirely on whether they are thinking about the plan or the
 * client. A field that took only the first would send them to the facet for a
 * name they had already typed.
 */
function matchText(r: Copy, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    r.program.name.toLowerCase().includes(q) ||
    (r.client?.name ?? '').toLowerCase().includes(q) ||
    (r.program.goal ?? '').toLowerCase().includes(q)
  );
}

/**
 * The client facet's rows, counted against the OTHER axes — see the call-site.
 *
 * Only clients who have a programme are offered: a facet listing the whole
 * roster would offer twenty-four names of which nine answer an empty list, and
 * an option that is guaranteed to yield nothing is one a trainer learns to
 * distrust the rest of the list for. Sorted by name, which is how somebody
 * scans for one they already know — never by count, which reorders the list
 * every time another axis moves.
 */
function clientOptions(rows: Copy[], clients: ClientWire[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.program.clientId, (counts.get(r.program.clientId) ?? 0) + 1);

  return clients
    .filter(c => counts.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(c => ({ value: c.id, label: c.name, count: counts.get(c.id) ?? 0 }));
}

/* ═══════════════════════════════════════════════════════════ prose ══ */

/**
 * *18 clients training · 6 with nothing on* — two clauses, counted separately.
 *
 * Neither is derived from the other and neither is a row count: a client may
 * hold two programmes (a live one and the block behind it), so summing the list
 * would over-count people, and the figure under the word *Programs* that a
 * trainer actually wants is how much of their roster is covered.
 *
 * The second clause is the actionable one and is dropped at zero. Archived
 * clients are out of both — somebody who has left is not a gap in the coaching.
 */
function headerLine(rows: Copy[], clients: ClientWire[]): string {
  const live = new Set(
    rows.filter(r => r.program.status === 'active').map(r => r.program.clientId),
  );
  const roster = clients.filter(c => c.status !== 'archived');
  const on = roster.filter(c => live.has(c.id)).length;
  const off = roster.length - on;

  const first =
    on === 0
      ? 'Nobody is on a program yet'
      : `${on} client${on === 1 ? '' : 's'} training on a program`;

  return off > 0 && on > 0 ? `${first} · ${off} with nothing assigned` : first;
}

/**
 * The slots this copy trains.
 *
 * `trainingDays` is the authority — law 2, *a day exists when the trainer lays
 * it out* — and the fallback is `dayLabels`' own keys rather than a scan of the
 * exercises, because this screen deliberately does not read them. A copy
 * written before `V2` has neither and draws an empty strip, which is honest:
 * the shape of that block is not on the wire.
 */
function daysOfCopy(p: ProgramWire): number[] {
  if (p.trainingDays && p.trainingDays.length > 0) return [...p.trainingDays].sort((a, b) => a - b);
  const keys = Object.keys(p.dayLabels ?? {})
    .map(Number)
    .filter(n => Number.isFinite(n) && n >= 1 && n <= 7);
  return keys.sort((a, b) => a - b);
}

/** `cancelled` is the one status worth naming apart: a block that was called
 *  off and one that ran its course are the same *ended* to a filter and two
 *  different things on a row. Anything else the wire invents reads as *Ended*,
 *  which is true of every non-active value by construction. */
function endedWord(status: string): string {
  return status === 'cancelled' ? 'Cancelled' : 'Ended';
}

/**
 * The stamp, against the SERVER's instant — trap 20, and `ProgramRow`'s own
 * closing note: a relative date computed off the browser's clock disagrees with
 * the HTML that was sent. Same ladder the shelf uses, deliberately not
 * imported from it: that copy is private to a client component two files over,
 * and the two will not drift because neither is a rule — they are both *how
 * long ago*.
 */
function editedAgo(at: number, now: number): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 28) return `${Math.floor(days / 7)}w ago`;
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

'use client';

import { useMemo, useState } from 'react';

import type { CertifiedShelfData } from '@/lib/programs/api';
import {
  applyFilter,
  describeFilter,
  emptyFilter,
  filterIsEmpty,
  rank,
  readRows,
  topUsedId,
  type CertifiedFilter,
} from '@/lib/programs/certified';
import { TopBar } from '@/components/shell/TopBar';
import { CertifiedCard } from './CertifiedCard';
import { FilterRail } from './FilterRail';
import { PageTabs } from '@/components/shell/PageTabs';
import { SubTabs } from '@/web-components/ui/SubTabs';
import { programsTabs, templateTabs } from '@/lib/programs/tabs';
import { SearchIcon } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { PageHeader } from '@/web-components/ui/PageHeader';

/**
 * `/programs/certified` — the catalogue a trainer copies from.
 *
 * The filter rail beside a card grid. Read-only: nothing on this screen edits a
 * certified program, and nothing on it assigns one, because a certified
 * blueprint has no owner a trainer can edit — *Use this* copies it first and the
 * copy is what gets assigned. `lib/programs/actions.ts` carries that argument.
 *
 * ── THE WHOLE CATALOGUE COMES DOWN ONCE ──────────────────────────────────────
 *
 * Five programs today and forty eventually, each one a name, a sentence and six
 * figures — a couple of hundred rows, which is the payload `GET /v1/payments`
 * is deliberately unwindowed for. So the filters run in the browser and a chip
 * press is instant rather than a round trip, and the query string stays out of
 * the URL: five filter groups is thirty-one URLs nobody will link to, and a
 * server round trip to un-tick *Remote* is the cost `/schedule` already refuses
 * to pay for its mode filters.
 *
 * The stated cost is the same one: a link cannot carry "certified, 3 days,
 * intermediate", and a reload drops the filters. The thing a trainer DOES link
 * to is one program, and that is a route.
 *
 * ── AND THE ORDER IS A FACT THE SCREEN NOW STATES ────────────────────────────
 *
 * `rank()` has always sorted this grid most-used-first, tie-broken on the name,
 * and the screen said nothing about it — so five cards read as five arbitrary
 * cards, and the thing the catalogue actually knows about them was spent on
 * their order alone, where nobody could see it. Two lines carry it now and they
 * are the same claim said twice on purpose: `.cert__count` says *most used
 * first* over the grid, and the leading card wears *Most used*. Neither would
 * be worth much on its own — a badge with no stated ordering is an assertion,
 * and an ordering with nothing marking its head is a sentence about a list you
 * then have to count.
 *
 * Both stand down under a filter, and for different reasons. The line stands
 * down because `4 of 5 · 3 days a week` is what a trainer needs the instant
 * they tick a chip. The BADGE does not move: it rides the row that leads the
 * whole catalogue, not the row that happens to lead the filtered grid, because
 * *most used of the four things still on screen* is a claim nobody asked for.
 * If the filter hides that row, nothing is badged.
 */
export function CertifiedShelf({ data }: { data: CertifiedShelfData }) {
  const [filter, setFilter] = useState<CertifiedFilter>(emptyFilter);

  const rows = useMemo(() => readRows(data.certified), [data.certified]);
  const shown = useMemo(() => rank(applyFilter(rows, filter)), [rows, filter]);
  const mineCount = rows.filter(r => r.row.mine).length;
  /* Computed over EVERY row, never over `shown` — see the block above. `null`
     when the lead is shared, which is the only honest answer to *which one is
     the most used* when two are. */
  const topId = useMemo(() => topUsedId(rows), [rows]);

  return (
    <>
      <TopBar crumb="Fitness · Templates · InclineYou" />

      <main className="main body--flush pg" id="main-content">
        {/* `ph--pglist` — the headline stands down on a phone. The crumb
            reads *Programs · Certified* and the active tab reads *Certified*;
            a third copy at 22px cost 29px of a 844px screen. The subtitle
            stays, because it is the sentence that decides whether a trainer
            trusts a blueprint somebody else wrote. */}
        <PageHeader
          title="InclineYou templates"
          sub="Written and reviewed by certified trainers. Copy one and it is yours to edit — nothing you change reaches anybody else&rsquo;s copy."
          className="ph--pglist"
        >
          {/* THE SAME STRIP AS `/programs`, FROM THE SAME LIST. This screen was
              a page of the Fitness pane and is now a view of the shelf, so the
              way back to the trainer's own programs is the tab beside this one
              rather than a row in a column that no longer carries it.

              `children` AND NOT `tabs`: the `tabs` prop wraps what it is given
              in a `.ph__tabs`, and `PageTabs` renders its own — the prop's note
              says so and names this exact component. `children` is the slot for
              a strip that arrives with its element, and it puts the nav inside
              `.ph`, where its bleed margin has the gutter it was sized to
              cancel. MEASURED as a sibling at 390: −24 → 414 inside a 390px
              box, against 390/0 everywhere else in the product.

              The count rides on *Programs* and not on this tab — the page below
              already states its own total in `.cert__count`, and a strip that
              repeats the figure under it has spent a badge saying nothing. */}
          <PageTabs
            label="Fitness"
            current="templates"
            tabs={programsTabs('templates')}
          />
        </PageHeader>

        {/* THE SECOND LEVEL, and this is the tab that reaches the trainer's own
            shelf. It sits OUTSIDE `PageHeader` for `.ph`'s reason — the active
            `.tab` carries `margin-bottom:-1px` so its underline lands on the
            rule under the header, and a row inside would push it off. The count
            is the trainer's own shelf, which `getCertifiedShelf` already reads
            for exactly this: a tab that counts nothing on one of its pages is a
            tab that looks broken on that page. */}
        <SubTabs
          label="Template shelves"
          current="certified"
          tabs={templateTabs('certified', { mine: data.ownCount })}
        />

        <div className="split">
          <FilterRail
            rows={rows}
            filter={filter}
            onChange={setFilter}
            mineCount={mineCount}
            /* For the phone sheet's foot only — it covers the grid it narrows,
               so it has to say what it did. Passed rather than recomputed
               there: this is the same list `.cert__count` prints from. */
            shownCount={shown.length}
          />

          <div className="split__r">
            <div className="cert__pane">
              {/* `aria-live="polite"`: ticking a chip re-renders the grid and a
                  screen reader is otherwise told nothing at all. */}
              <p className="cert__count" aria-live="polite">
                {shown.length === rows.length ? (
                  <>
                    {rows.length} template{rows.length === 1 ? '' : 's'}
                    {/* Plain text, never a `<b>` — see `.cert__count` in
                        app.css for the contrast measurement that took the
                        second colour back off this clause. */}
                    {topId !== null && ' · most used first'}
                  </>
                ) : (
                  `${shown.length} of ${rows.length} · ${describeFilter(filter).join(' · ')}`
                )}
              </p>

              {shown.length === 0 ? (
                <NoMatch filter={filter} onClear={() => setFilter(emptyFilter())} />
              ) : (
                /* A list, so a screen reader can say "4 of 40" — which a bare
                   grid of divs does not. */
                <ul className="cert__grid" role="list">
                  {shown.map(({ row }) => (
                    <li key={row.id}>
                      <CertifiedCard row={row} topUsed={row.id === topId} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * THE TERM THAT FAILED, NAMED.
 *
 * The house rule, and the reason `describeFilter` exists: a no-results state
 * names the term rather than the word *results*. "No certified program is 5 days
 * a week and bodyweight only" is a sentence a trainer can act on; "0 results" is
 * one they decode by un-ticking chips one at a time.
 *
 * A search that matched nothing gets the exercise library offered, because a
 * trainer typing "kettlebell" is looking for a movement and kettlebell movements
 * do exist — one tab away.
 *
 * ── AND IT IS `EmptyState kind="filtered"`, WHICH IT WAS NOT ─────────────────
 *
 * It was hand-written `.pg__firstrun` markup — literally the FIRST-RUN class on
 * a FILTERED state, which is the exact confusion `ui/EmptyState.tsx` was written
 * to prevent and names in its first paragraph: *"A filtered list that says 'No
 * clients yet' tells a trainer with twenty-two clients that their book is empty.
 * It is the same six words and a completely different lie."* The class was the
 * lie here; the words were already right.
 *
 * The component also brings what the hand-written block had no way to have: the
 * `filtered` kind is a `role="status"` live region, so a trainer who ticks a
 * chip and empties the grid is TOLD the grid is empty. Before, the cards
 * silently vanished and a screen reader read on into nothing.
 */
function NoMatch({ filter, onClear }: { filter: CertifiedFilter; onClear: () => void }) {
  const terms = describeFilter(filter);
  const searched = filter.query.trim();

  return (
    <EmptyState
      kind="filtered"
      icon={<SearchIcon />}
      title={
        searched ? (
          <>
            Nothing certified matches <b>{searched}</b>
          </>
        ) : (
          <>No template is {terms.join(' and ')}</>
        )
      }
      body={
        searched
          ? 'The exercise library holds 1,324 movements and is the better place to look for one of those.'
          : 'Loosen a filter, or write the program yourself — the builder is two clicks away.'
      }
      action={
        <div className="tools">
          {!filterIsEmpty(filter) && (
            <Button variant="secondary" onClick={onClear}>
              Clear all filters
            </Button>
          )}
          {searched && (
            <Button href="/programs/exercises" variant="secondary">
              Search exercises instead
            </Button>
          )}
        </div>
      }
    />
  );
}

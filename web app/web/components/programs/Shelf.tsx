'use client';

import Link from 'next/link';

import { ProgramRow, ProgramRowHead } from '@/web-components/ui/ProgramRow';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { TemplateWire } from '@/lib/programs/api';
import { duplicateTemplate, removeTemplates } from '@/lib/programs/actions';
import { useToast } from '@/lib/toast/store';
import {
  GOALS,
  dayNamesOf,
  daysOf,
  goalKeyOf,
  toEntries,
  weekCountOf,
  type GoalKey,
} from '@/lib/programs/blueprint';
import { Panel } from '@/components/shell/Icons';
import { PlusIcon, SearchIcon, TrashIcon } from './Icons';
import { useShelfCollapsed } from './collapse';
import { Button } from '@/web-components/ui/Button';
import { BulkBar } from '@/web-components/ui/BulkBar';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { Tag } from '@/web-components/ui/Tag';
import { Chip } from '@/web-components/ui/Chip';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { RowMenu } from '@/web-components/ui/RowMenu';

/**
 * THE SHELF — the left half of "the list and the builder are one screen".
 *
 * The IA's own row, and what the page this replaces did not do: it had three
 * template chips in a toolbar and no way to see six programs, their shape, or
 * who was on them.
 *
 * ── THE SHAPE IS THE THING BEING CHOSEN BETWEEN ──────────────────────────────
 *
 * Ported from the app's `WeekShape`: seven cells, the filled ones being the
 * slots this template trains. "8 weeks, 9 clients" says nothing about whether it
 * trains five days or three, and *how many days a week* is the first question a
 * trainer answers when they pick a block for somebody.
 *
 * The cells are ordinal slots, not weekdays — the same law that gives the
 * builder no Rest column. So the strip is "three of seven possible days", drawn
 * left-packed, and it deliberately does not claim to be Mon–Sun.
 *
 * ── AND IT FOLDS TO A SPINE, BUT ONLY WITH A PROGRAM OPEN ────────────────────
 *
 * `collapse.ts` carries the why. The control is offered only when
 * `selectedId` is set, because 400px spent on the list is only a cost when
 * there is a board behind it — on `/programs` with nothing open the shelf IS
 * the page, and a screen whose only content can be folded away to a 44px bar is
 * a screen with a way to show nothing at all. The remembered state is ignored
 * there rather than cleared, so folding it in the builder and navigating back to
 * the shelf shows the list, and returning to a program shows the spine again.
 *
 * ── AND ON ITS OWN ROUTE IT IS A TABLE, NOT A COLUMN ──────────────────
 *
 * `/programs` drew this list in a 400px column beside a **976 x 717 pane holding
 * one sentence** — *Pick a program to open it.* Measured, that is 70% of the
 * working area, and the left column was itself 280px of rows in a 717px box: on
 * the landing screen of the whole section, roughly four fifths of the pixels
 * said nothing.
 *
 * A list-detail split is a shape for choosing between two panes and the detail
 * half here is a WHOLE ROUTE — `/programs/:id` — so the pane could never fill.
 * `app.css` already made exactly this argument to delete the split under 900px
 * (*"a list-detail split is a shape for choosing between two panes; a phone has
 * one"*); it arrives at the desk a width later.
 *
 * What the width buys is not a bigger list, it is COLUMNS. The row used to mash
 * three unlike facts into one 12px sentence — *13 clients on this · 4 days a
 * week · Strength* — with nothing aligned, so five rows could not be compared
 * and thirty could not be scanned. Aligned, the same facts answer *which of
 * these trains four days*, *which has nobody on it* and *which did I touch last*
 * by running the eye down one edge.
 *
 * ONE COMPONENT, THREE SHELLS, and the reason is the one this file already
 * gives for the second: the search, the goal chips, their counts, the sort and
 * the filtering are the whole of this file, and duplicating them is how the
 * shells start disagreeing about what a program is. Only the ROW renderer
 * differs, and the table's row reflows to the column's shape under 900px —
 * `.pk__tbl`'s pattern, whose note argues the mechanism at length.
 */
/** How the list is ordered, and the control that sets it says which is on. */
export type ShelfSort = 'edited' | 'name' | 'clients';

const SORTS: { key: ShelfSort; label: string }[] = [
  /* `edited` FIRST AND DEFAULT, because it is what the server already does —
     `ORDER BY t.updated_at DESC, created_at ASC, id`. The list has always been
     in this order and never said so, which is the worst of both: a trainer who
     does not know cannot rely on it, and one who guesses cannot check. */
  { key: 'edited', label: 'Recently edited' },
  { key: 'name', label: 'Name' },
  { key: 'clients', label: 'Most clients' },
];

export function Shelf({
  templates,
  selectedId,
  onNew,
  now,
  variant = 'pane',
  search,
}: {
  templates: TemplateWire[];
  selectedId: string | null;
  onNew: () => void;
  /**
   * THE SERVER'S CLOCK, and it is a prop for the reason `buildRoster(input,
   * now)` takes one: this component is server-rendered, so a `Date.now()` read
   * during render is read twice — once in the HTML and once on hydration — and
   * the two can fall either side of a day boundary. *Edited today* becoming
   * *edited yesterday* between the paint and the hydrate is a text mismatch
   * React reports and a fact the screen gets wrong.
   */
  now: number;
  /**
   * WHERE THIS COPY IS BEING DRAWN, and it changes three things and no more.
   *
   * `pane` is the desk's left column. `sheet` is the same list inside
   * `ProgramSwitcher`'s bottom sheet on a phone: it carries no fold control —
   * there is no board beside it to fold away FROM — and its outer box is the
   * sheet's rather than the split's, so the sheet owns the scrolling and the
   * foot sits on the sheet's edge.
   *
   * `table` is `/programs`' own route, where there is no board to sit beside
   * and the width goes to COLUMNS instead of to an empty pane — the header
   * block's argument. It reflows to `pane`'s two-line shape under 900px.
   *
   * A prop and not a second component, because the rows, the search, the goal
   * chips and their counts are the whole of this file and duplicating them is
   * how the three shells start disagreeing about what a program is.
   */
  variant?: 'pane' | 'sheet' | 'table';
  /**
   * THE SEARCH, LIFTED — and only where a caller asks for it.
   *
   * Pass both and this component stops owning the query AND stops drawing the
   * field: the caller has put it somewhere this component cannot reach, which
   * on `/programs` is the tab strip's own row. Pass neither and nothing changes
   * — the pane and the sheet keep the field in their header and their own
   * `useState`, because in a 400px column there is nowhere else for it to go.
   *
   * Both or neither, never one: a `query` with no `onQuery` is a field that
   * cannot be typed in, and an `onQuery` with no `query` is one that forgets
   * every keystroke. The signature says so by pairing them in a single
   * optional object rather than as two optional props.
   */
  search?: { query: string; onQuery: (q: string) => void };
}) {
  /* The fallback owner. Held unconditionally — a hook cannot be called behind a
     condition — and simply ignored when the caller brought its own. */
  const [ownQuery, setOwnQuery] = useState('');
  const query = search ? search.query : ownQuery;
  const setQuery = search ? search.onQuery : setOwnQuery;
  const [goal, setGoal] = useState<GoalKey | null>(null);
  const [sort, setSort] = useState<ShelfSort>('edited');
  const [collapsed, toggleCollapsed] = useShelfCollapsed();

  /* WHAT IS TICKED, AND IT IS ONLY EVER THE TABLE'S.
     The pane is a SWITCHER — you are choosing the program beside the one you
     have open — and a checkbox column in a 400px list beside a board is a
     second way to press a row that already means *open this*. The sheet is the
     same list on a phone. So the whole of this block is dead in both, which is
     why every read of it below is behind `table`. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const router = useRouter();
  const { show } = useToast();

  const rows = useMemo(
    () =>
      templates.map(t => {
        const entries = toEntries(t.exercises);
        return {
          template: t,
          days: daysOf(t, entries),
          weeks: weekCountOf(t, entries),
          goalKey: goalKeyOf(t.goal),
        };
      }),
    [templates],
  );

  /* The chips count what they would show, and they are drawn only for goals
     something is filed under. Five chips over an empty shelf is five ways to
     find nothing. */
  const counts = useMemo(() => {
    const out = new Map<GoalKey, number>();
    for (const row of rows) out.set(row.goalKey, (out.get(row.goalKey) ?? 0) + 1);
    return out;
  }, [rows]);

  /* THE CHIPS ARE DRAWN ONLY WHEN THEY CAN NARROW ANYTHING. Six chips over five
     programs, one program under each goal, is 60px of wrapped chrome whose every
     press turns five rows into one — a filter set that can only ever isolate is
     a filter set doing the job the row already does by being readable. Nothing
     is lost: `filtered` searches `goal` as well as `name`, so a unique goal is
     still one word away in the field above. */
  const useful = useMemo(() => [...counts.values()].some(n => n > 1), [counts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter(row => {
      if (goal && row.goalKey !== goal) return false;
      if (!q) return true;
      return (
        row.template.name.toLowerCase().includes(q) ||
        (row.template.goal ?? '').toLowerCase().includes(q)
      );
    });
    /* A TOTAL ORDER IN EVERY MODE, and the tie-breaks are not decoration: the
       shelf reshuffling between page loads is a defect this section has already
       had once — the seed stamped six templates with an identical `updated_at`
       and an ORDER BY with ties may return any order it likes. A list picked
       from by position cannot do that, and neither can a re-sort. */
    const byName = (a: typeof out[number], b: typeof out[number]) =>
      a.template.name.localeCompare(b.template.name) || a.template.id.localeCompare(b.template.id);
    return [...out].sort((a, b) => {
      if (sort === 'name') return byName(a, b);
      if (sort === 'clients') {
        return b.template.activeAssignedCount - a.template.activeAssignedCount || byName(a, b);
      }
      return b.template.updatedAt - a.template.updatedAt || byName(a, b);
    });
  }, [rows, query, goal, sort]);

  /* Only foldable with a board behind it — see the note above. And never in the
     sheet: folding a sheet to a 44px spine leaves a sheet showing nothing. */
  const sheet = variant === 'sheet';
  const table = variant === 'table';

  /* ── WHAT IS ACTUALLY SELECTED ────────────────────────────────────────────
     DERIVED FROM `filtered`, NEVER READ STRAIGHT OFF THE SET, and both halves
     of that matter.

     Against `filtered`, because a tick that scrolls out of sight when the
     trainer types in the search box must not be in the count on the bar, and
     must not be in the DELETE: ticking two, searching for something else and
     pressing Delete has to remove what the bar says it will remove and what
     the screen has drawn a tick beside. The ticks are remembered rather than
     cleared — clearing the set on every keystroke would lose a selection to a
     typo — so narrowing hides them and widening brings them back.

     And derived rather than pruned in an effect, which is trap 21: a template
     deleted by the write below leaves its id in the set, and the next render
     simply stops finding it. Nothing has to remember to tidy up. */
  const pickedRows = useMemo(
    () => (table ? filtered.filter(row => picked.has(row.template.id)) : []),
    [table, filtered, picked],
  );
  const pickedIds = pickedRows.map(row => row.template.id);

  function togglePick(id: string, on: boolean) {
    setPicked(prev => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /* ALL OF WHAT IS ON SCREEN, and off again if it already is. The bar's own
     checkbox is `checked` when every visible row is ticked, so the press it
     answers is *put them all back*. Rows hidden by the search are left exactly
     as they were, for the reason above. */
  function toggleAll() {
    const visible = filtered.map(row => row.template.id);
    setPicked(prev => {
      const next = new Set(prev);
      const all = visible.every(id => next.has(id));
      for (const id of visible) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  /**
   * THE BULK DELETE, and the confirm is where the honest sentence lives.
   *
   * `removeTemplates` reports the count that went and names what did not, so
   * the toast can answer a partial failure with something a trainer can act
   * on. A bar that emptied and said *Deleted* while three rows were still
   * there is the failure this shape exists to prevent.
   *
   * The selection is cleared whatever happened: the ids that went are gone,
   * and the ids that did not are redrawn by `router.refresh()` unticked —
   * which is the safer state to leave a destructive control in.
   */
  /**
   * DUPLICATE, FROM THE ROW ITSELF.
   *
   * `duplicateTemplate` already existed and was reachable only from inside the
   * builder — so copying a blueprint before editing it, which is the move this
   * whole section is built around ("trainers build one good program and tweak
   * it per client, and a blueprint six people are already on is one they will
   * not touch"), cost opening the program you were trying not to touch.
   *
   * It does NOT navigate to the copy. The trainer is on the shelf comparing
   * programs; the copy appears at the top of the list on `revalidatePath`, named
   * and with nobody on it, and they open it when they mean to. The toast is
   * what says where it went.
   */
  function duplicate(id: string, name: string) {
    startDelete(async () => {
      const result = await duplicateTemplate(id);
      if (!result.ok) {
        show({ tone: 'danger', title: <>Could not duplicate</>, body: result.message });
        return;
      }
      show({
        tone: 'ok',
        title: <>{result.value.name}</>,
        body: <>A copy of {name}, with nobody on it. It is at the top of the shelf.</>,
      });
      router.refresh();
    });
  }

  /**
   * DELETE ONE, THROUGH THE SAME DIALOG THE BAR OPENS.
   *
   * The row's verb TICKS the row and opens the confirm rather than running its
   * own write: one delete path, one sentence about copies, one place a partial
   * failure is reported. The tick is not a side effect to apologise for — it is
   * the screen showing what the dialog is about to remove, which is the whole
   * job of a confirm.
   *
   * It REPLACES the selection rather than adding to it, because the dialog
   * names what will go and *Delete…* on one row must not quietly take three
   * others with it.
   */
  function deleteOne(id: string) {
    setPicked(new Set([id]));
    setConfirming(true);
  }

  function confirmDelete() {
    const ids = pickedIds;
    startDelete(async () => {
      const result = await removeTemplates(ids);
      setConfirming(false);
      setPicked(new Set());

      if (!result.ok) {
        show({ tone: 'danger', title: <>Could not delete</>, body: result.message });
        return;
      }

      const { deleted, failed } = result.value;
      if (failed.length > 0) {
        show({
          tone: 'danger',
          title: (
            <>
              {deleted} deleted, {failed.length} could not be
            </>
          ),
          /* The server's own sentence, which names the fix — the whole reason
             `Result` carries a message at all. One is printed rather than a
             list: eight refusals are eight copies of the same sentence. */
          body: failed[0].message,
        });
      } else {
        /* No Undo, and therefore not a receipt — the builder's own note on the
           single delete, for the same reason: the wire has no inverse. */
        show({
          tone: 'ok',
          title: (
            <>
              {deleted} template{deleted === 1 ? '' : 's'} deleted
            </>
          ),
          body: <>Anyone already on a copy of one keeps theirs.</>,
        });
      }
      router.refresh();
    });
  }
  /* Never in the table either: on its own route the shelf IS the page, and a
     screen whose only content folds to a 44px bar is a screen with a way to
     show nothing at all — the note above, unchanged, now with a third shell to
     exclude. */
  const foldable = selectedId !== null && !sheet && !table;

  if (foldable && collapsed) {
    return (
      <div className="split__l split__l--min">
        <button
          className="pgspine"
          type="button"
          aria-label="Show your templates"
          aria-expanded="false"
          onClick={toggleCollapsed}
        >
          <span className="pgspine__i">
            <Panel size={15} />
          </span>
          {/* The count comes with it, because the one thing the spine has to say
              is that there ARE other programs behind it. */}
          <span className="pgspine__t">
            My templates <b>{templates.length}</b>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={sheet ? 'pgsheet__b' : table ? 'pgt' : 'split__l'}>
      <div className={table ? 'pgt__hd' : 'split__hd'}>
        {/* NOT DRAWN WHERE THE CALLER DREW IT — `search`'s own note. On
            `/programs` the field sits on the tab strip's row, beside
            *Programs · Templates*, and a second one here would be two fields
            filtering one list with only one of them holding the text.

            The wrapper goes with it rather than staying as an empty box: it is
            a flex row with a gap, so left behind it would put 8px of nothing
            above the sort chips. The fold control is safe inside it — `foldable`
            is false in the table variant by construction, which is the note two
            blocks down. */}
        {!search && (
        <div className="pgsh__q">
          <label className="search">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search your templates"
              aria-label="Search your templates"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          {/* Always drawn, never hover-revealed — `Rail.tsx`'s rule for its own
              twin of this control, for its reason: a control that appears when
              the pointer arrives is a control a keyboard user has to already
              know about. */}
          {foldable && (
            <Button
              variant="ghost"
              iconOnly
              label="Hide your templates"
              className="pgsh__col"
              aria-expanded="true"
              onClick={toggleCollapsed}
              title={undefined}
              icon={<Panel size={16} />}
            />
          )}
        </div>
        )}

        {/* THE SORT, AND ONLY WHERE THERE IS ROOM TO STATE IT. The 400px column
            is a switcher — you are choosing the program next to the one you
            have open, and *recently edited* is the right and only order for
            that. The table is a place a trainer BROWSES thirty programs, which
            is where *who has the most clients* and *what is it called* become
            real questions.

            CHIPS AND NOT A `<select>`, for the reason this section already
            recorded: a select sizes to its widest option and then draws the
            platform chevron inside that box, so *Recently edited* ran under the
            arrow. Chips also state the answer permanently, which a closed
            dropdown does not — and saying what the order is was the point. */}
        {/* THE BAR TAKES THE CONTROLS' PLACE, WHICH IS `BulkBar`'S OWN
            SPECIFICATION: *in place, so nothing on the screen moves when a
            checkbox is ticked*. Drawn above the sort chips instead, the table
            under the pointer would drop 44px on the first tick and the row the
            trainer meant to tick second would be a different row.

            The sort and the goal filters are what it replaces, and losing them
            for the length of a selection costs nothing: a trainer who has
            ticked two rows is not mid-browse. The SEARCH is untouched — it
            lives on the tab strip's row, outside this header — which is also
            why the selection is derived against `filtered` rather than frozen.

            It carries the select-all and the count; the head row below opens
            the same gutter and puts nothing in it, so there is exactly one
            select-all on the screen. */}
        {table && pickedRows.length > 0 ? (
          <BulkBar
            className="pgt__bulk"
            count={pickedRows.length}
            total={filtered.length}
            noun="templates"
            one="template"
            onSelectAll={toggleAll}
            actions={
              <Button
                variant="danger"
                size="sm"
                icon={<TrashIcon size={13} />}
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            }
          />
        ) : (
          <>
        {table && (
          <div className="pgt__sort">
            <span className="pgt__sortk">Sort</span>
            <div className="tools" role="group" aria-label="Sort the list">
              {SORTS.map(o => (
                <Chip
                  pressed={sort === o.key}
                  key={o.key}
                  onClick={() => setSort(o.key)}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {useful && (
          <div className="tools" role="group" aria-label="Filter by goal">
            <Chip
              pressed={goal === null}
              onClick={() => setGoal(null)}
            >
              All {templates.length}
            </Chip>
            {GOALS.filter(g => (counts.get(g.key) ?? 0) > 0).map(g => (
              <Chip
                pressed={goal === g.key}
                key={g.key}
                onClick={() => setGoal(goal === g.key ? null : g.key)}
              >
                {g.label} {counts.get(g.key)}
              </Chip>
            ))}
          </div>
        )}
          </>
        )}
      </div>

      <div className={sheet ? 'pgsheet__scroll' : table ? 'pgt__body' : 'split__scroll'}>
        {filtered.length === 0 ? (
          /* THE TWO EMPTIES ARE NOT ONE EMPTY, which is the whole of
             `EmptyState`'s own header: *No programs match* over a shelf of six
             and *No programs yet* over a shelf of none are the same six words
             and completely different claims. It was one `<p>` that branched on
             the text and on nothing else — no heading, no landmark, no live
             region, and no way back from the filter that caused it.

             `filtered` is the kind that matters here, because it is the one a
             trainer arrives at by TYPING: the rows vanish silently and a screen
             reader is left in a region that has gone blank, which is why that
             kind alone is a `role="status"`. The verb clears whatever caused it
             — the query and the goal chip together, since either can be the one
             that emptied the list and a trainer should not have to work out
             which. `inCard` outside the table, where the shelf is a 400px
             column and the full pane's air is the column. */
          <EmptyState
            kind={templates.length === 0 ? 'first-run' : 'filtered'}
            inCard={!table}
            title={templates.length === 0 ? 'Nothing on the shelf yet' : 'No templates match'}
            body={
              templates.length === 0
                ? 'A template is days, weeks and the exercises in them — written once and given to as many clients as you like.'
                : `Nothing here is called ${query.trim() ? `“${query.trim()}”` : 'that'}${goal ? ' under this goal' : ''}. ${templates.length} template${templates.length === 1 ? ' is' : 's are'} on the shelf.`
            }
            action={
              templates.length === 0 ? (
                <Button variant="primary" onClick={onNew}>
                  <PlusIcon />
                  New template
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setGoal(null);
                  }}
                >
                  Show all {templates.length}
                </Button>
              )
            }
          />
        ) : table ? (
          <>
            {/* `aria-hidden`, and the row is what makes that legal: every cell
                carries its own noun as text — clipped at desk width, shown
                again under 900px — so a screen reader hears *4 days a week*
                off the row itself and never has to associate it with a header
                it met six rows ago. `.wsx__hr` is the same call for the same
                reason. */}
            <ProgramRowHead pickable actionable />
            <ul className="pgt__l" role="list">
              {filtered.map(row => (
                <li key={row.template.id}>
                  <TableRow
                    template={row.template}
                    days={row.days}
                    weeks={row.weeks}
                    now={now}
                    picked={picked.has(row.template.id)}
                    onPick={on => togglePick(row.template.id, on)}
                    onDuplicate={() => duplicate(row.template.id, row.template.name)}
                    onDelete={() => deleteOne(row.template.id)}
                    busy={deleting}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ul className="pg__shelf">
            {filtered.map(row => (
              <li key={row.template.id}>
                <ShelfRow
                  template={row.template}
                  days={row.days}
                  weeks={row.weeks}
                  selected={row.template.id === selectedId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* THE FOOT IS THE PHONE'S *New program* AND ONLY THE PHONE'S, on this
          route. `.ph--pgshelf` stands the header button down under 900px on the
          grounds that "the shelf's foot already carries a full-width *New
          program* inside the thumb's arc" — so dropping the foot outright would
          leave a phone with no way to make one at all. Above 900px the header's
          primary is three inches away and this is the second of two, which is
          the duplication; `.pgt > .pg__shelffoot` is `display:none` there. */}
      {/* ONE VERB, AND *ALL PROGRAMS* IS NOT IT ANY MORE.
          This foot carried an *All programs* link for one pass, on the finding
          that the builder on a phone had no route back to the shelf at all —
          `.ph--builder` hides the tab strip and `HIDDEN_FROM_BAR` keeps
          Programs out of the bar's five slots. The finding was real; the place
          was wrong. The top bar's title is that route now (`titleHref`), which
          is one tap from anywhere on the screen instead of two through a sheet,
          and is visible without opening anything.

          So the link came out rather than both shipping. A foot whose primary
          verb shares its row with a link to the screen the bar already points
          at is the duplicated affordance this shell keeps deleting — same call
          as the workspace menu's team row, which "did for one pass, and the row
          is gone." */}
      <div className="pg__shelffoot">
        <Button variant="secondary" size="lg" wide onClick={onNew}>
          <PlusIcon />
          New template
        </Button>
      </div>

      {/* THE CONFIRM, AND IT SAYS THE TWO THINGS THE BAR CANNOT.
          *A sale is irreversible and therefore asks first* is this product's
          standing rule for a write with no inverse, and `removeTemplates` has
          none — so the dialog is the last place the count can be read back.

          The second sentence is the one a trainer actually wants: **a copy is
          a copy**. `apply` wrote an independent `program` with its own rows and
          nothing reaches back through `program.template_id`, so deleting the
          blueprint cannot touch anybody who is training on one. Said here
          rather than in the toast, because it is what decides the press. */}
      {confirming && (
        <ModalHost onClose={() => (deleting ? undefined : setConfirming(false))}>
          <Modal
            title={
              pickedRows.length === 1
                ? 'Delete this template?'
                : `Delete these ${pickedRows.length} templates?`
            }
            width={460}
            cancel={{ label: 'Cancel', onClick: () => setConfirming(false) }}
            confirm={{
              label: deleting ? 'Deleting…' : 'Delete',
              danger: true,
              onClick: () => (deleting ? undefined : confirmDelete()),
            }}
          >
            {/* NAMED WHERE NAMING IS POSSIBLE. One program deleted by name is
                a trainer checking they ticked the right row; eight names is a
                paragraph nobody reads, so past three it is the count and the
                list stays on the screen behind the dialog. */}
            <p className="small">
              {pickedRows.length <= 3
                ? pickedRows.map(row => row.template.name).join(', ')
                : `${pickedRows.length} templates`}{' '}
              will be removed from your shelf. This cannot be undone.
            </p>
            <p className="small mt3 ink3">
              Anyone already training on a copy of one keeps theirs — a copy is
              its own program and editing or deleting this one never reaches it.
            </p>
          </Modal>
        </ModalHost>
      )}
    </div>
  );
}

/**
 * ONE PROGRAM, AS COLUMNS.
 *
 * Every cell is `<b>figure</b>` plus its own noun, and the noun is CLIPPED at
 * desk width rather than dropped: it is what makes the header row safe to hide
 * from the accessibility tree, and it is what the row reflows to under 900px,
 * where there are no columns to align and `13` on its own is not a fact.
 *
 * `.pk__tbl`'s note argues the whole mechanism — "the labels move INTO the rows
 * … nothing is lost and nothing scrolls" — and the one thing done differently
 * is that these labels are real text and not `::before` off `data-l`, because
 * this list is a list of LINKS and not a `<table>`: the whole row is the target,
 * which is one tab stop per program instead of one per cell.
 */
function TableRow({
  template,
  days,
  weeks,
  now,
  picked,
  onPick,
  onDuplicate,
  onDelete,
  busy,
}: {
  template: TemplateWire;
  days: number[];
  weeks: number;
  now: number;
  picked: boolean;
  onPick: (on: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  /* `certified` is PROVENANCE and it is permanent — the shelf row's own note. */
  return (
    <ProgramRow
      name={template.name}
      href={`/programs/${template.id}`}
      /* THE DAY NAMES, ON THE NAME'S SECOND LINE. `ProgramRow`'s own `sub`
         bullet argues the space; what it says here is the one thing a trainer
         comparing two four-day blocks actually needs and no column carried —
         *Upper A · Lower A · Upper B · Lower B* against *Push · Pull · Legs*.
         Computed off the SAME `days` the strip is drawn from, so the two
         cannot disagree about which slots this program trains. */
      sub={dayNamesOf(template, days)}
      days={days}
      clients={template.activeAssignedCount}
      /* The faces. A SAMPLE and not the roster — `activeAssignedCount` above
         stays the count, and `TemplateWire.assignedClients` carries why. The
         `?? []` is for a wire that predates the field: the row then draws the
         figure it always drew. */
      assigned={template.assignedClients ?? []}
      weeks={weeks}
      /* THE TABLE ROW KEEPS THE GOAL AND ONLY THE GOAL, and the sheet row two
         hundred lines down does not — the difference is the COLUMN. This row
         is under a head that says `GOAL`, and a description printed there is a
         sentence filed under the wrong word. The sheet's row has no columns:
         its second line is a meta clause, which is where the description
         legitimately stands in. MEASURED with a goal-less template: drawn
         here it read as a paragraph in the Goal column. */
      goal={template.goal}
      edited={editedAgo(template.updatedAt, now)}
      certified={Boolean(template.copiedFrom)}
      /* The name, not *Select* — `CheckboxCell`'s rule, and on thirty rows it
         is the difference between thirty identical controls and thirty
         programs in a screen reader's list. */
      select={{ checked: picked, onChange: onPick, label: `Select ${template.name}` }}
      /* ONE PROGRAM'S OWN VERBS, WHICH THE ROW DID NOT HAVE. Duplicating a
         blueprint six people are already on is the move this section is built
         around — `duplicateTemplate`'s own header says so — and until now it
         was reachable only from inside the builder. Delete is here beside it
         because the bulk bar is the only other place it lives, and a trainer
         should not have to enter a selection mode to throw one draft away.

         *Open* is NOT on the menu. The whole row is already that link, and a
         menu item restating the control it is drawn inside is the duplicated
         affordance this shell keeps deleting. */
      actions={
        <RowMenu
          label={template.name}
          items={[
            { label: 'Duplicate', onSelect: onDuplicate, disabled: busy },
            { separator: true },
            { label: 'Delete…', onSelect: onDelete, danger: true, disabled: busy },
          ]}
        />
      }
    />
  );
}

/**
 * WHEN THIS BLUEPRINT LAST MOVED.
 *
 * Relative near the present and absolute past it, which is the split every
 * relative stamp needs: *3d ago* is the useful reading of last week and a
 * useless one of last March, where the trainer wants a date they can place
 * against something else. `roster.ts` draws the same line in the same place.
 *
 * `now` is the server's, per the prop's own note.
 */
function editedAgo(at: number, now: number): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 28) return `${Math.floor(days / 7)}w ago`;
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function ShelfRow({
  template,
  days,
  weeks,
  selected,
}: {
  template: TemplateWire;
  days: number[];
  weeks: number;
  selected: boolean;
}) {
  const active = new Set(days);
  const clients = template.activeAssignedCount;

  return (
    <Link
      className="lrow"
      href={`/programs/${template.id}`}
      aria-current={selected ? 'page' : undefined}
    >
      <span className="lrow__m">
        <span className="lrow__t">
          {template.name}
          {/* PROVENANCE, AND IT IS PERMANENT. Not a status — six months later it
              answers "where did this come from and can I trust it", and it is
              what makes the revision notice on the builder comprehensible. */}
          {template.copiedFrom && <Tag tone="acc">From templates</Tag>}
        </span>
        <span className="lrow__s">
          {/* The figure the brief calls "times assigned", and it is the ACTIVE
              count rather than the lifetime one. A trainer reading this row is
              deciding whether it is safe to edit, and a client who finished this
              block in March is not somebody an edit can reach. The lifetime
              figure is on the builder's header, where there is room to say which
              is which. */}
          {clients === 0
            ? 'Nobody on this yet'
            : `${clients} client${clients === 1 ? '' : 's'} on this`}
          {' · '}
          {days.length} day{days.length === 1 ? '' : 's'} a week
          {/* THE GOAL, OR THE DESCRIPTION WHERE THERE IS NO GOAL. This is a
              meta CLAUSE and not a column — see the table row's note on why
              the fallback belongs here and not there — and it is the reading
              `AddClientFlow`'s plan list already takes (`t.goal ??
              t.description`). The new-program dialog asks for both and
              neither is required; without this, a trainer who wrote a
              sentence instead of picking a tag sees nothing of it anywhere,
              and the dialog's own preview draws this exact line. */}
          {(template.goal ?? template.description)
            ? ` · ${template.goal ?? template.description}`
            : ''}
        </span>
      </span>
      <span className="lrow__r">
        <span className="shape" aria-hidden="true">
          {/* The bare `.shape__c` IS the off state — a `--off` modifier was in
              the page this replaces and is in no stylesheet, so every cell drew
              filled.

              ONE TONE, AND THE THREE WERE A FALSE LEGEND. The claim was that
              cycling them "so Push/Pull/Legs is legible without a legend" — but
              the cycle is `(slot - 1) % 3`, a function of POSITION and nothing
              else, so lime/blue/violet said only *first, second, third*. On a
              4-day program it drew lime, violet, off, lime, violet: a trainer
              reading three deliberate colours on a strip about training days
              reads them as day TYPES, which is the one thing they cannot mean.
              A mapping that looks informative and is not costs more than no
              mapping at all. */}
          {[1, 2, 3, 4, 5, 6, 7].map(slot => (
            <i key={slot} className={active.has(slot) ? 'shape__c shape__c--1' : 'shape__c'} />
          ))}
        </span>
        <span className="lrow__n">{weeks} wk</span>
      </span>
    </Link>
  );
}

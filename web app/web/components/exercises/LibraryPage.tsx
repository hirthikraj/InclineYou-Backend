'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import type { ExerciseWire, LibraryMeta } from '@/lib/exercises/api';
import type { LibraryData } from '@/lib/exercises/guard';
import { libraryHref, libraryTabs, type LibraryQuery } from '@/lib/exercises/tabs';
import { TopBar } from '@/components/shell/TopBar';
import { PageTabs } from '@/components/shell/PageTabs';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';
import { CountBadge } from '@/web-components/ui/CountBadge';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Facet } from '@/web-components/ui/Facet';
import { Pager } from '@/web-components/ui/Pager';
import { SearchField } from '@/web-components/ui/SearchField';
import { Row as TableRow, Table } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';
import { CreateForm } from './CreateExercise';
import { ChevronRightIcon, ExercisePanel, FilterIcon, PlusIcon, XIcon } from './ExerciseLibrary';
import { activeFilters, BODY_ORDER, SearchFilters, title } from './SearchFilters';
import { BodyArt, EquipmentArt, hasMuscleArt, hasOwnArt, LibraryTile, MuscleArt, type BodyPartId } from './TileArt';

/**
 * THE EXERCISE LIBRARY, IN THREE WAYS IN.
 *
 * It was one list with a muscle-group tab, built for a library nobody could
 * browse. The library is now 655 exercises with a body part, a muscle, kit, a
 * movement, a level and a way of counting each, and the page lets a trainer arrive
 * from whichever of those they are thinking in: **Categories** (a body part, then
 * its muscles), **Equipment** (a kind of kit, then which one) or **Search**, every
 * filter at once.
 *
 * The first two open as TILES with a picture, because they are doors and not
 * results: the picture says what is behind each one before it is opened, and the
 * count says how deep. Only when a door is opened does a list of exercises appear
 * (`wantsList`), so the front page of each tab is a few big targets, not 655 rows.
 *
 * Every choice is in the address (`lib/exercises/tabs.ts`), the server reads it,
 * and what React holds is only what is not a place: the text in the box between
 * keystrokes and which overlay is open.
 */
export function ExerciseLibraryPage({ data }: { data: LibraryData }) {
  const { initial, meta, query, size } = data;
  const router = useRouter();
  const [pending, startNav] = useTransition();

  const [draft, setDraft] = useState(query.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qSeen, setQSeen] = useState(query.q);
  if (query.q !== qSeen) {
    setQSeen(query.q);
    setDraft(query.q);
  }

  const [selected, setSelected] = useState<ExerciseWire | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* `?new=1` opens the create form: the bar's + lands on a form, not a grid. The same
     three pieces `Schedule` settled — an initialiser, a render-time adjustment for
     arriving here from here, then the parameter is stripped. */
  const params = useSearchParams();
  const asked = params.get('new') === '1';
  /* an initialiser, not an effect: an effect would paint the un-opened library for a frame first */
  const [showCreate, setShowCreate] = useState(asked);
  const [askedSeen, setAskedSeen] = useState(asked);
  if (asked !== askedSeen) {
    setAskedSeen(asked);
    if (asked) setShowCreate(true);
  }
  useEffect(() => {
    if (asked) router.replace(libraryHref(query), { scroll: false });
  }, [asked, router, query]);

  /** Every change of state is a replace: refining one thought is not four history entries. */
  function go(next: Partial<LibraryQuery>) {
    startNav(() => {
      router.replace(libraryHref({ ...query, page: 0, ...next }), { scroll: false });
    });
  }

  function search(value: string) {
    setDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => go({ q: value }), 300);
  }

  const bodyCount = meta.bodyParts.length;
  const kitCount = meta.equipmentGroups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <TopBar crumb="Fitness · Exercise library" />

      <main className="main body--flush pg" id="main-content">
        <div className="ph ph--pglist">
          <div className="ph__row" style={{ alignItems: 'center' }}>
            <div>
              <h1 className="ph__t">Exercise library</h1>
              <p className="ph__sub">
                {meta.total.toLocaleString()} exercises · {bodyCount} body parts · {kitCount} kinds of kit
              </p>
            </div>
            <div className="ph__acts">
              <Button variant="primary" className="exl__desk" onClick={() => setShowCreate(true)}>
                <PlusIcon />
                Create exercise
              </Button>
            </div>
          </div>
          <div className="pgtabs">
            <PageTabs tabs={libraryTabs()} current={query.view} label="Ways into the exercise library" />
          </div>
        </div>

        {query.view === 'categories' && (
          <CategoriesView meta={meta} query={query} data={data} pending={pending} onOpen={setSelected} selectedId={selected?.id ?? null} />
        )}
        {query.view === 'equipment' && (
          <EquipmentView meta={meta} query={query} data={data} pending={pending} onOpen={setSelected} selectedId={selected?.id ?? null} />
        )}
        {query.view === 'search' && (
          <SearchView
            meta={meta}
            query={query}
            exercises={initial?.exercises ?? []}
            total={initial?.total ?? 0}
            size={size}
            pending={pending}
            draft={draft}
            onSearch={search}
            onFilter={go}
            onOpen={setSelected}
            selectedId={selected?.id ?? null}
            onFilters={() => setFiltersOpen(true)}
          />
        )}

        <div className="pg__shelffoot exl__foot">
          <Button variant="secondary" size="lg" wide onClick={() => setShowCreate(true)}>
            <PlusIcon />
            Create exercise
          </Button>
        </div>
      </main>

      {filtersOpen && (
        <FilterSheet
          meta={meta}
          query={query}
          total={initial?.total ?? 0}
          onFilter={go}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {showCreate && (
        <CreateForm
          meta={meta}
          onCreated={ex => {
            setShowCreate(false);
            setSelected(ex);
            router.refresh();
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {selected && <ExercisePanel exercise={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

/* ─────────────────────────────────────────────────────────── the results ── */

function ResultList({
  exercises,
  total,
  size,
  page,
  hrefFor,
  noun,
  pending,
  onOpen,
  selectedId,
  empty,
}: {
  exercises: ExerciseWire[];
  total: number;
  size: number;
  page: number;
  hrefFor: (page: number) => string;
  noun: string;
  pending: boolean;
  onOpen: (ex: ExerciseWire) => void;
  selectedId: string | null;
  empty?: React.ReactNode;
}) {
  if (exercises.length === 0) {
    return <div className="lib-empty">{empty ?? <EmptyState kind="filtered" title="Nothing here" body="No exercise matches." />}</div>;
  }
  return (
    <>
      <div aria-busy={pending || undefined} style={{ opacity: pending ? 0.55 : 1, transition: 'opacity var(--tx-t-fast) var(--tx-ease)' }}>
        <Table
          caption={`${total} exercises, ${size} to a page`}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'equipment', label: 'Equipment' },
            { key: 'muscle', label: 'Muscle' },
            { key: 'level', label: 'Level' },
            { key: 'go', label: '', bare: true, className: 'sel' },
          ]}
          className="tbl--exlib tbl--exlib5"
        >
          {exercises.map(ex => (
            <ExerciseRow key={ex.id} exercise={ex} selected={selectedId === ex.id} onClick={() => onOpen(ex)} />
          ))}
        </Table>
      </div>
      <Pager page={page} size={size} total={total} href={hrefFor} label={`${noun} pages`} noun="exercises" />
    </>
  );
}

function ExerciseRow({ exercise, selected, onClick }: { exercise: ExerciseWire; selected: boolean; onClick: () => void }) {
  return (
    <TableRow
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      selected={selected}
      style={{ cursor: 'pointer' }}
      header={
        <>
          <span className="strong">{exercise.name}</span>
          {/* the phone's second line: the columns beside the name are not drawn there */}
          <span className="exl__sub">
            {[exercise.equipment, exercise.target ?? exercise.muscleGroup, exercise.level].filter(Boolean).join(' · ')}
          </span>
          {exercise.isCustom && <>{' '}<Tag tone="acc">Yours</Tag></>}
          {exercise.status === 'draft' && <>{' '}<Tag tone="warn">Draft</Tag></>}
        </>
      }
      cells={[
        {
          key: 'equipment',
          content: exercise.equipment ? (
            <span style={{ color: 'var(--tx-ink-2)', fontSize: 13 }}>{title(exercise.equipment)}</span>
          ) : (
            <span style={{ color: 'var(--tx-ink-3)', fontSize: 12 }}>&mdash;</span>
          ),
        },
        {
          key: 'muscle',
          content: exercise.target || exercise.muscleGroup ? (
            <Tag>{title(exercise.target ?? exercise.muscleGroup ?? '')}</Tag>
          ) : (
            <span style={{ color: 'var(--tx-ink-3)', fontSize: 12 }}>&mdash;</span>
          ),
        },
        {
          key: 'level',
          content: <span style={{ color: 'var(--tx-ink-2)', fontSize: 13 }}>{exercise.level ? title(exercise.level) : '—'}</span>,
        },
        { key: 'go', content: <ChevronRightIcon />, style: { textAlign: 'right' } },
      ]}
    />
  );
}

/**
 * WHERE YOU ARE, AND THE WAY UP FROM EACH LEVEL.
 *
 * Equipment › Cardio machine › Treadmill. A single *All equipment* button only said
 * how to go back to the top; the trail says how deep you are and takes you to ANY
 * level above in one press, which on a phone — where there is no room for a side
 * rail — is the only orientation there is. The chips below stay: they are the
 * way to move SIDEWAYS to a sibling (Treadmill → Stationary bike) without climbing
 * up and down, so the trail is the vertical axis and the chips the horizontal one.
 */
function DrillHeader({
  crumbs, heading, count, aside,
}: {
  crumbs: { label: string; href?: string }[]; heading: string; count: number;
  /** A control that belongs to the heading's own row — the machines' kind filter — so it costs no row of its own. */
  aside?: ReactNode;
}) {
  return (
    <div className="lib-hd">
      <Crumbs className="lib-crumbs" items={crumbs} />
      <div className={`lib-hd__row${aside ? ' lib-hd__row--aside' : ''}`}>
        <h2 className="lib-hd__t">{heading}</h2>
        <span className="lib-hd__n">
          {count.toLocaleString()} exercise{count === 1 ? '' : 's'}
        </span>
        {aside}
      </div>
    </div>
  );
}

/**
 * The kind of kit, for a category with too many kinds to draw — the machines. Twenty-odd tiles under one family
 * picture said nothing and twenty-odd chips were a wall, so the kind is one `Facet`: the axis is named, the chosen kind
 * is printed in the pill, a find field copes with the length, and clearing it is the pill's own ×. Picking a kind is a
 * navigation like every other choice on this page.
 */
function KindFilter({
  category, current, items,
}: {
  category: string;
  current: string;
  items: { value: string; label: string; count: number }[];
}) {
  const router = useRouter();
  return (
    <div className="facets lib-kind">
      <Facet
        label={`Kind of ${category}`}
        single
        width={288}
        search={{ placeholder: `Find a ${category}`, empty: `No ${category} matches`, noun: 'kinds' }}
        selected={current ? [current] : []}
        onChange={next => router.replace(libraryHref({ view: 'equipment', ecat: category, ekey: next[0] ?? '' }), { scroll: false })}
        options={items}
      />
    </div>
  );
}

/** A row of links narrowing a drill-down, with the one in force marked — a muscle, or a kind of kit. */
function NarrowRow({
  dense = false,
  label,
  allLabel,
  allHref,
  allCount,
  current,
  items,
}: {
  /** A long set (twenty kinds of machine) is drawn tighter, so it reads as two rows and not a wall. */
  dense?: boolean;
  label: string;
  allLabel: string;
  allHref: string;
  allCount: number;
  current: string;
  items: { value: string; label: string; count: number; href: string }[];
}) {
  return (
    <nav className={`lib-narrow${dense ? ' lib-narrow--dense' : ''}`} aria-label={label}>
      <Link href={allHref} scroll={false} className="lib-narrow__c" aria-current={current === '' ? 'true' : undefined}>
        {allLabel} <i>{allCount}</i>
      </Link>
      {items.map(it => (
        <Link key={it.value} href={it.href} scroll={false} className="lib-narrow__c" aria-current={current === it.value ? 'true' : undefined}>
          {it.label} <i>{it.count}</i>
        </Link>
      ))}
    </nav>
  );
}

/* ───────────────────────────────────────────────────────── view · categories ── */

function CategoriesView({
  meta, query, data, pending, onOpen, selectedId,
}: {
  meta: LibraryMeta; query: LibraryQuery; data: LibraryData; pending: boolean;
  onOpen: (ex: ExerciseWire) => void; selectedId: string | null;
}) {
  const parts = [...meta.bodyParts].sort((a, b) => BODY_ORDER.indexOf(a.id) - BODY_ORDER.indexOf(b.id));

  if (!query.group) {
    return (
      <div className="lib-body">
        <div className="lt-grid lt-grid--lib">
          {parts.map(p => {
            const muscles = meta.muscles.filter(m => m.bodyPart === p.id).length;
            return (
              <LibraryTile
                key={p.id}
                title={title(p.id)}
                count={p.count}
                note={muscles > 1 ? `${muscles} muscles` : undefined}
                art={<BodyArt part={p.id as BodyPartId} />}
                href={libraryHref({ view: 'categories', group: p.id })}
              />
            );
          })}
        </div>
      </div>
    );
  }

  const muscles = meta.muscles.filter(m => m.bodyPart === query.group).sort((a, b) => b.count - a.count);
  const groupTotal = parts.find(p => p.id === query.group)?.count ?? 0;
  const muscle = muscles.find(m => m.target === query.muscle) ?? null;
  const many = muscles.length > 1;

  /* LEVEL 2 — a body part with several muscles opens onto them, as tiles, and lists nothing yet. Drawn throughout
     or text throughout: see `MuscleArt` for why a mixed set is never drawn. */
  if (many && !muscle) {
    const drawn = muscles.every(m => hasMuscleArt(m.target));
    return (
      <div className="lib-body">
        <DrillHeader
          crumbs={[{ label: 'Categories', href: libraryHref({ view: 'categories' }) }, { label: title(query.group) }]}
          heading={title(query.group)}
          count={groupTotal}
        />
        <div className={`lt-grid ${drawn ? 'lt-grid--lib' : 'lt-grid--plain'}`}>
          {muscles.map(m => (
            <LibraryTile
              key={m.target}
              title={title(m.target)}
              count={m.count}
              art={drawn ? <MuscleArt target={m.target} /> : undefined}
              href={libraryHref({ view: 'categories', group: query.group, muscle: m.target })}
            />
          ))}
        </div>
      </div>
    );
  }

  /* LEVEL 3 — one muscle's exercises (or the only muscle a body part has). The trail reads
     Categories / Upper legs / Quads; the chips move sideways to a sibling. */
  const ex = data.initial?.exercises ?? [];
  const total = data.initial?.total ?? 0;

  return (
    <div className="lib-body">
      <DrillHeader
        crumbs={[
          { label: 'Categories', href: libraryHref({ view: 'categories' }) },
          { label: title(query.group), href: muscle && many ? libraryHref({ view: 'categories', group: query.group }) : undefined },
          ...(muscle && many ? [{ label: title(muscle.target) }] : []),
        ]}
        heading={muscle ? title(muscle.target) : title(query.group)}
        count={muscle ? muscle.count : groupTotal}
      />
      {many && muscle && (
        <NarrowRow
          label={`Other muscles in ${query.group}`}
          allLabel="All muscles"
          allHref={libraryHref({ view: 'categories', group: query.group })}
          allCount={groupTotal}
          current={query.muscle}
          items={muscles.map(m => ({ value: m.target, label: title(m.target), count: m.count, href: libraryHref({ view: 'categories', group: query.group, muscle: m.target }) }))}
        />
      )}
      <ResultList
        exercises={ex}
        total={total}
        size={data.size}
        page={query.page}
        hrefFor={p => libraryHref({ ...query, page: p })}
        noun={muscle ? title(muscle.target) : title(query.group)}
        pending={pending}
        onOpen={onOpen}
        selectedId={selectedId}
        empty={
          <EmptyState
            kind="filtered"
            title={total > 0 ? 'That page is past the end' : `Nothing in ${query.group}`}
            body={total > 0 ? 'The link you followed points past the last page.' : 'No exercise in the library is in this group.'}
            action={<Button variant="secondary" href={libraryHref({ view: 'categories' })}>Back to the categories</Button>}
          />
        }
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────── view · equipment ── */

function EquipmentView({
  meta, query, data, pending, onOpen, selectedId,
}: {
  meta: LibraryMeta; query: LibraryQuery; data: LibraryData; pending: boolean;
  onOpen: (ex: ExerciseWire) => void; selectedId: string | null;
}) {
  const groups = meta.equipmentGroups.map(g => ({ ...g, count: g.items.reduce((n, i) => n + i.count, 0) }));

  /* LEVEL 1 — the kinds of kit. */
  if (!query.ecat) {
    return (
      <div className="lib-body">
        <div className="lt-grid lt-grid--lib">
          {groups.map(g => (
            <LibraryTile
              key={g.category}
              title={title(g.category)}
              count={g.count}
              note={g.items.length > 1 ? `${g.items.length} kinds` : undefined}
              art={<EquipmentArt category={g.category} />}
              href={libraryHref({ view: 'equipment', ecat: g.category })}
            />
          ))}
        </div>
      </div>
    );
  }

  const group = groups.find(g => g.category === query.ecat);
  const kit = group?.items.find(i => i.key === query.ekey) ?? null;
  const many = (group?.items.length ?? 0) > 1;

  /* LEVEL 2 — a category with several kinds, every one drawn, opens onto them as tiles and lists nothing yet.
     A category where only some kinds are drawn (the machines: twenty-odd kinds, one family picture) has no tile
     level at all: `wantsList` sends it straight to the list and the kind is chosen from a filter below. */
  const allDrawn = !!group && group.items.every(i => hasOwnArt(i.key));
  if (group && many && !kit && allDrawn) {
    return (
      <div className="lib-body">
        <DrillHeader
          crumbs={[{ label: 'Equipment', href: libraryHref({ view: 'equipment' }) }, { label: title(group.category) }]}
          heading={title(group.category)}
          count={group.count}
        />
        <div className="lt-grid lt-grid--lib">
          {group.items.map(i => (
            <LibraryTile
              key={i.key}
              title={i.name}
              count={i.count}
              art={<EquipmentArt equipmentKey={i.key} category={group.category} />}
              href={libraryHref({ view: 'equipment', ecat: group.category, ekey: i.key })}
            />
          ))}
        </div>
      </div>
    );
  }

  /* LEVEL 3 — one kind's exercises (or the only kind a category has). The trail reads
     Equipment / Cardio machine / Treadmill; the chips move sideways to a sibling. */
  const ex = data.initial?.exercises ?? [];
  const total = data.initial?.total ?? 0;
  return (
    <div className="lib-body">
      <DrillHeader
        crumbs={[
          { label: 'Equipment', href: libraryHref({ view: 'equipment' }) },
          { label: title(query.ecat), href: kit && many ? libraryHref({ view: 'equipment', ecat: query.ecat }) : undefined },
          ...(kit && many ? [{ label: kit.name }] : []),
        ]}
        heading={kit ? kit.name : title(query.ecat)}
        count={kit ? kit.count : group?.count ?? 0}
        aside={group && many && !allDrawn ? (
          <KindFilter
            category={group.category}
            current={query.ekey}
            items={[...group.items]
              /* the commonest kinds first, then alphabetical: the list arrived in seed order, which read as
                 13, 6, 3, 2, 3, 2, 1, 3 and gave nobody a reason to look where they did */
              .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
              .map(i => {
                /* the heading already says the category: *Leg press machine* under *Machine* is the word twice.
                   A kind that is only its category (*Smith machine*) keeps the word, or it reads as *Smith*. */
                const short = i.name.replace(new RegExp(`\\s+${group.category}$`, 'i'), '');
                return { value: i.key, label: short.includes(' ') ? short : i.name, count: i.count };
              })}
          />
        ) : undefined}
      />
      {group && many && kit && allDrawn && (
        <NarrowRow
          label={`Other kinds of ${group.category}`}
          allLabel="All kinds"
          allHref={libraryHref({ view: 'equipment', ecat: group.category })}
          allCount={group.count}
          current={query.ekey}
          items={group.items.map(i => ({
            value: i.key,
            label: i.name,
            count: i.count,
            href: libraryHref({ view: 'equipment', ecat: group.category, ekey: i.key }),
          }))}
        />
      )}
      <ResultList
        exercises={ex}
        total={total}
        size={data.size}
        page={query.page}
        hrefFor={p => libraryHref({ ...query, page: p })}
        noun={kit ? kit.name : title(query.ecat)}
        pending={pending}
        onOpen={onOpen}
        selectedId={selectedId}
        empty={
          <EmptyState
            kind="filtered"
            title={total > 0 ? 'That page is past the end' : `Nothing uses ${kit ? kit.name : query.ecat}`}
            body={total > 0 ? 'The link you followed points past the last page.' : 'No exercise in the library uses this kit.'}
            action={<Button variant="secondary" href={libraryHref({ view: 'equipment' })}>Back to the equipment</Button>}
          />
        }
      />
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── view · search ── */

function SearchView({
  meta, query, exercises, total, size, pending, draft, onSearch, onFilter, onOpen, selectedId, onFilters,
}: {
  meta: LibraryMeta; query: LibraryQuery; exercises: ExerciseWire[]; total: number; size: number; pending: boolean;
  draft: string; onSearch: (v: string) => void; onFilter: (next: Partial<LibraryQuery>) => void;
  onOpen: (ex: ExerciseWire) => void; selectedId: string | null; onFilters: () => void;
}) {
  const chips = activeFilters(meta, query, onFilter);
  const any = chips.length > 0 || query.q !== '';
  const clear = () => onFilter({ q: '', body: [], muscles: [], also: [], kit: [], pattern: [], level: [], counted: [], type: [], source: 'all' });

  return (
    <div className="lib-search">
      <aside className="lib-search__rail" aria-label="Filters">
        <SearchFilters meta={meta} query={query} onChange={onFilter} />
      </aside>

      <section className="lib-search__main">
        <div className="lib-search__bar">
          <SearchField
            className="lib-search__q"
            label="Search by name or alternate name"
            value={draft}
            onChange={e => onSearch(e.target.value)}
            count={{ shown: exercises.length, total, noun: 'exercises' }}
          />
          {/* The phone's way into the filter sheet, drawn as the roster draws its own: a `Chip`, the funnel, and the
              count as a `CountBadge`. The number is the badge's alone and the sentence is the label's, so a screen
              reader hears *Filters, 2 in force* and not *Filters 2*. Hidden on a desk, where the rail is the filters. */}
          <Chip
            className="lib-search__fb"
            onClick={onFilters}
            aria-haspopup="dialog"
            aria-label={chips.length > 0 ? `Filters, ${chips.length} in force` : 'Filters'}
          >
            <FilterIcon />
            Filters
            <CountBadge n={chips.length} tone="acc" label={`${chips.length} ${chips.length === 1 ? 'filter' : 'filters'} in force`} />
          </Chip>
        </div>

        {any && (
          <div className="lib-chips" role="group" aria-label="Filters in force">
            {chips.map(c => (
              <button key={c.key} type="button" className="lib-chip" onClick={c.remove} aria-label={`Remove ${c.label}`}>
                {c.label}
                <XIcon size={11} />
              </button>
            ))}
            <button type="button" className="lib-chips__clear" onClick={clear}>Clear all</button>
          </div>
        )}

        <p className="lib-search__n" aria-live="polite">
          {total.toLocaleString()} of {meta.total.toLocaleString()} exercises
        </p>

        <ResultList
          exercises={exercises}
          total={total}
          size={size}
          page={query.page}
          hrefFor={p => libraryHref({ ...query, page: p })}
          noun="Search results"
          pending={pending}
          onOpen={onOpen}
          selectedId={selectedId}
          empty={
            <EmptyState
              kind="filtered"
              title={total > 0 ? 'That page is past the end' : 'No exercise matches all of that'}
              body={total > 0 ? 'The link you followed points past the last page.' : 'Filters narrow together: widen one of them, or clear them and start again.'}
              action={any ? <Button variant="secondary" onClick={clear}>Clear all filters</Button> : undefined}
            />
          }
        />
      </section>
    </div>
  );
}

/** The phone's filters: the same panel, as a sheet over the results. Each change applies at once, behind it. */
function FilterSheet({
  meta, query, total, onFilter, onClose,
}: {
  meta: LibraryMeta; query: LibraryQuery; total: number; onFilter: (next: Partial<LibraryQuery>) => void; onClose: () => void;
}) {
  const { closing, dismiss, ref } = useDismiss<HTMLDivElement>(onClose);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss, ref]);

  return (
    <>
      <button className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`} type="button" aria-label="Close filters" onClick={dismiss} />
      <div ref={ref} tabIndex={-1} className={`panel xl-panel pkx-panel${closing ? ' panel--out' : ''}`} role="dialog" aria-modal="true" aria-label="Filters">
        <div className="panel__hd">
          <span className="panel__t">Filters</span>
          <Button variant="ghost" iconOnly label="Close" onClick={dismiss} title={undefined} icon={<XIcon />} />
        </div>
        <div className="panel__body">
          <SearchFilters meta={meta} query={query} onChange={onFilter} />
        </div>
        <div className="panel__foot">
          <Button variant="primary" onClick={dismiss}>
            Show {total.toLocaleString()} exercise{total === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </>
  );
}

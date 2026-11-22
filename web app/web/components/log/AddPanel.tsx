'use client';

import { useEffect, useMemo, useState } from 'react';

import { Plus } from './Icons';
import { Check, Search } from '@/components/shell/Icons';
import { useDismiss } from '@/lib/ui/dismiss';
import { usePhone } from '@/lib/ui/phone';
import { ScreenSheet } from '@/web-components/ui/ScreenSheet';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';

/**
 * FRAME 3a — THE RACK WAS BUSY.
 *
 * **Recents first**, because the answer to a busy rack is nearly always
 * something already done — and every recent row carries what was last
 * lifted on it, so the choice is made on numbers rather than on a name. That is
 * the difference between this and a search box over 1,324 rows.
 *
 * **Yours is a first-class chip.** A movement invented for one client's shoulder
 * is the one a trainer hunts for hardest, and Hevy buries it in the same
 * alphabetical list as the other four hundred.
 *
 * ── WHAT PRESSING A ROW ACTUALLY DOES, ON THIS HALF ─────────────────────────
 *
 * It writes a `workout_exercise` row — a real card, on the server, before a
 * single set is typed into it.
 *
 * It used not to. `workout_exercises` reached the server only inside the sync
 * envelope, so a card with no sets in it had nothing to be written to and rode
 * in the URL as `?plus=` until the first tick made it real. That was honest on
 * an online-only half — the card was a place to type and the type was the write
 * — and it was also lossy: the card existed in one browser tab and nowhere else,
 * so a trainer who added three exercises and reloaded lost all three.
 *
 * The route landed on 28 Aug 2026 and the card is written on the press. The
 * foot still says *today's log only, the program does not change* and still
 * means it literally — `source: 'unplanned'` is a tag on today's session and
 * touches no plan.
 */
export function AddPanel({
  recents,
  library,
  already,
  complete = true,
  search,
  onPick,
  onClose,
}: {
  recents: { exerciseId: string; name: string; meta: string; isCustom: boolean }[];
  library: { id: string; name: string; muscleGroup: string | null; isCustom: boolean }[];
  already: Set<string>;
  /** False until the whole library has arrived; until then typing also asks the server (typed-ahead). */
  complete?: boolean;
  search?: (q: string) => Promise<{ id: string; name: string; muscleGroup: string | null; isCustom: boolean }[]>;
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'recent' | 'yours' | 'all' | string>('recent');
  /* PICK SEVERAL, THEN DONE (22 Nov 2026). A day with no plan is built here a
     movement at a time, and closing the panel on every press made six
     exercises six trips. A press now writes the card (as it always did) and the
     panel stays: the row turns to *Added*, the foot counts, and Done closes it
     on the first card added. A second press on an added row does nothing — the
     card is already written, and removing it is the card's own job. */
  const [picked, setPicked] = useState<string[]>([]);
  const pick = (exerciseId: string) => {
    if (picked.includes(exerciseId)) return;
    setPicked((p) => [...p, exerciseId]);
    onPick(exerciseId);
  };
  const addedMark = (id: string) => (picked.includes(id)
    ? <span className="small ink3" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Check size={14} />Added</span>
    : <Plus size={16} />);

  /* `dismiss`, not `onClose`, on all three ways out. `lib/ui/dismiss.ts` has
     the argument: `onClose` unmounts this box, and a panel that is already gone
     has nothing left to animate away. */
  const { closing, dismiss, ref: panelRef } = useDismiss<HTMLDivElement>(onClose);
  const phone = usePhone();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss]);

  const groups = useMemo(() => {
    const seen = new Set(library.map((e) => e.muscleGroup).filter(Boolean) as string[]);
    return [...seen].sort().slice(0, 3);
  }, [library]);

  const mine = useMemo(() => library.filter((e) => e.isCustom), [library]);

  /* Typed-ahead, ONLY while the library is incomplete. With the whole library here the list above
     answers every query locally (and the chips and the count are over the same list); this is the
     fallback for the moment before it arrives, or if it never does. */
  const [remote, setRemote] = useState<typeof library>([]);
  useEffect(() => {
    const q = query.trim();
    if (complete || !search || q.length < 2) return;
    let off = false;
    const timer = setTimeout(() => { void search(q).then((rows) => { if (!off) setRemote(rows); }); }, 200);
    return () => { off = true; clearTimeout(timer); };
  }, [query, complete, search]);

  /* Searching is the fallback, not the front door — so it only takes over the
     list when there is something typed in it. */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length >= 2) {
      const local = library.filter((e) => e.name.toLowerCase().includes(q));
      const seen = new Set(local.map((e) => e.id));
      const ahead = complete ? [] : remote;
      return [...local, ...ahead.filter((e) => !seen.has(e.id))].slice(0, 40);
    }
    if (filter === 'yours') return mine.slice(0, 40);
    if (filter === 'all') return library.slice(0, 40);
    if (filter !== 'recent') {
      return library.filter((e) => e.muscleGroup === filter).slice(0, 40);
    }
    return null;
  }, [query, filter, library, mine, remote, complete]);

  const recentRows = recents.filter((r) => !already.has(r.exerciseId) || picked.includes(r.exerciseId));

  const body = (
    <>
          <label className="search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${library.length.toLocaleString('en-IN')} exercises`}
              aria-label="Search the exercise library"
            />
          </label>

          <div className="wk" style={{ marginTop: 10 }} role="group" aria-label="Filter">
            <Chip pressed={filter === 'recent' && !query} onClick={() => { setFilter('recent'); setQuery(''); }}>
              Recent
            </Chip>
            <Chip pressed={filter === 'yours'} onClick={() => { setFilter('yours'); setQuery(''); }}>
              Yours<span className="rail__n">{mine.length}</span>
            </Chip>
            {groups.map((g) => (
              <Chip pressed={filter === g} key={g} onClick={() => { setFilter(g); setQuery(''); }}>
                {g}
              </Chip>
            ))}
            <Chip pressed={filter === 'all'} onClick={() => { setFilter('all'); setQuery(''); }}>
              All
            </Chip>
          </div>

          {results === null ? (
            <>
              <p className="micro" style={{ margin: '18px 0 7px' }}>Done before</p>
              {recentRows.length ? (
                <div className="lgl">
                  {recentRows.map((r) => (
                    <button className="lrow" type="button" key={r.exerciseId} aria-pressed={picked.includes(r.exerciseId)} onClick={() => pick(r.exerciseId)}>
                      <span className="lrow__m" style={{ flex: 1 }}>
                        <span className="lrow__t">{r.name}</span>
                        <span className="lrow__s">{r.meta}</span>
                      </span>
                      {addedMark(r.exerciseId)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small ink3">
                  Nothing logged with this client yet. Search, or pick from <b className="ink">Yours</b>.
                </p>
              )}
              <p className="small" style={{ marginTop: 7 }}>
                Recents first, and every one carries what was last lifted on it — so the choice is
                made on numbers rather than on a name.
              </p>

              {mine.length ? (
                <>
                  <p className="micro" style={{ margin: '18px 0 7px' }}>Yours</p>
                  <div className="lgl">
                    {mine.slice(0, 6).map((e) => (
                      <button className="lrow" type="button" key={e.id} aria-pressed={picked.includes(e.id)} onClick={() => pick(e.id)}>
                        <span className="lrow__m" style={{ flex: 1 }}>
                          <span className="lrow__t">{e.name}</span>
                          <span className="lrow__s">yours{e.muscleGroup ? ` · ${e.muscleGroup}` : ''}</span>
                        </span>
                        {addedMark(e.id)}
                      </button>
                    ))}
                  </div>
                  <p className="small" style={{ marginTop: 7 }}>
                    A movement invented for one client&rsquo;s shoulder is the one a trainer hunts
                    for hardest.
                  </p>
                </>
              ) : null}
            </>
          ) : (
            <div className="lgl" style={{ marginTop: 14 }}>
              {results.map((e) => (
                <button className="lrow" type="button" key={e.id} aria-pressed={picked.includes(e.id)} onClick={() => pick(e.id)}>
                  <span className="lrow__m" style={{ flex: 1 }}>
                    <span className="lrow__t">{e.name}</span>
                    <span className="lrow__s">
                      {e.isCustom ? 'yours' : e.muscleGroup ?? 'library'}
                    </span>
                  </span>
                  {addedMark(e.id)}
                </button>
              ))}
              {results.length === 0 ? (
                <p className="small ink3" style={{ padding: 12 }}>Nothing in the library matches that.</p>
              ) : null}
            </div>
          )}
    </>
  );

  /* ── ON A PHONE, A SCREEN AND NOT A SIDE PANEL (21 Nov 2026, from a screenshot) ──
     A 420px panel on a 390px phone ran off the left edge — the title read *dd an
     exercise* — with a foot holding one sentence and Cancel. The console's other
     sheets' answer: `c-screensheet`, the back chevron as Cancel, and the sentence
     that was in the foot as a note at the top, where it is read before the pick. */
  if (phone) {
    return (
      <ScreenSheet
        title={picked.length ? `Added ${picked.length}` : 'Add an exercise'}
        backLabel={picked.length ? 'Done' : 'Cancel'}
        onBack={dismiss}
        closing={closing}
        surfaceRef={panelRef}
      >
        <p className="small ink3 addx__note">Goes into today&rsquo;s log only. The program does not change.</p>
        {body}
      </ScreenSheet>
    );
  }

  return (
    <>
      <div
        className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`}
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={`panel${closing ? ' panel--out' : ''}`}
        style={{ width: 420 }}
        role="dialog"
        aria-label="Add an exercise"
      >
        <div className="panel__hd">
          <span className="panel__t">Add an exercise</span>
          <span className="small mono" style={{ marginLeft: 'auto' }}>today only</span>
        </div>

        <div className="panel__body">{body}</div>

        <div className="panel__foot">
          <span className="small" style={{ marginRight: 'auto', maxWidth: '26ch' }}>
            Goes into today&rsquo;s log only. The program does not change.
          </span>
          {picked.length > 0
            ? <Button variant="primary" onClick={dismiss}>Done · {picked.length} added</Button>
            : <Button variant="ghost" onClick={dismiss}>Cancel</Button>}
        </div>
      </div>
    </>
  );
}

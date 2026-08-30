'use client';

import { useEffect, useMemo, useState } from 'react';

import { Plus } from './Icons';
import { Search } from '@/components/shell/Icons';

/**
 * FRAME 3a — THE RACK WAS BUSY.
 *
 * **Recents first**, because the answer to a busy rack is nearly always
 * something she has already done — and every recent row carries what she last
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
 * foot still says *today's log only, her program does not change* and still
 * means it literally — `source: 'unplanned'` is a tag on today's session and
 * touches no plan.
 */
export function AddPanel({
  recents,
  library,
  already,
  onPick,
  onClose,
}: {
  recents: { exerciseId: string; name: string; meta: string; isCustom: boolean }[];
  library: { id: string; name: string; muscleGroup: string | null; isCustom: boolean }[];
  already: Set<string>;
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'recent' | 'yours' | 'all' | string>('recent');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const seen = new Set(library.map((e) => e.muscleGroup).filter(Boolean) as string[]);
    return [...seen].sort().slice(0, 3);
  }, [library]);

  const mine = useMemo(() => library.filter((e) => e.isCustom), [library]);

  /* Searching is the fallback, not the front door — so it only takes over the
     list when there is something typed in it. */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length >= 2) {
      return library.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 40);
    }
    if (filter === 'yours') return mine.slice(0, 40);
    if (filter === 'all') return library.slice(0, 40);
    if (filter !== 'recent') {
      return library.filter((e) => e.muscleGroup === filter).slice(0, 40);
    }
    return null;
  }, [query, filter, library, mine]);

  const recentRows = recents.filter((r) => !already.has(r.exerciseId));

  return (
    <>
      <div className="scrim scrim--soft" onClick={onClose} aria-hidden="true" />
      <div className="panel" style={{ width: 420 }} role="dialog" aria-label="Add an exercise">
        <div className="panel__hd">
          <span className="panel__t">Add an exercise</span>
          <span className="small mono" style={{ marginLeft: 'auto' }}>today only</span>
        </div>

        <div className="panel__body">
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
            <button className="chip" type="button" aria-pressed={filter === 'recent' && !query} onClick={() => { setFilter('recent'); setQuery(''); }}>
              Recent
            </button>
            <button className="chip" type="button" aria-pressed={filter === 'yours'} onClick={() => { setFilter('yours'); setQuery(''); }}>
              Yours<span className="rail__n">{mine.length}</span>
            </button>
            {groups.map((g) => (
              <button className="chip" type="button" key={g} aria-pressed={filter === g} onClick={() => { setFilter(g); setQuery(''); }}>
                {g}
              </button>
            ))}
            <button className="chip" type="button" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setQuery(''); }}>
              All
            </button>
          </div>

          {results === null ? (
            <>
              <p className="micro" style={{ margin: '18px 0 7px' }}>She has done these</p>
              {recentRows.length ? (
                <div className="lgl">
                  {recentRows.map((r) => (
                    <button className="lrow" type="button" key={r.exerciseId} onClick={() => onPick(r.exerciseId)}>
                      <span className="lrow__m" style={{ flex: 1 }}>
                        <span className="lrow__t">{r.name}</span>
                        <span className="lrow__s">{r.meta}</span>
                      </span>
                      <Plus size={16} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small ink3">
                  Nothing logged with her yet. Search, or pick from <b className="ink">Yours</b>.
                </p>
              )}
              <p className="small" style={{ marginTop: 7 }}>
                Recents first, and every one carries what she last lifted on it — so the choice is
                made on numbers rather than on a name.
              </p>

              {mine.length ? (
                <>
                  <p className="micro" style={{ margin: '18px 0 7px' }}>Yours</p>
                  <div className="lgl">
                    {mine.slice(0, 6).map((e) => (
                      <button className="lrow" type="button" key={e.id} onClick={() => onPick(e.id)}>
                        <span className="lrow__m" style={{ flex: 1 }}>
                          <span className="lrow__t">{e.name}</span>
                          <span className="lrow__s">yours{e.muscleGroup ? ` · ${e.muscleGroup}` : ''}</span>
                        </span>
                        <Plus size={16} />
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
                <button className="lrow" type="button" key={e.id} onClick={() => onPick(e.id)}>
                  <span className="lrow__m" style={{ flex: 1 }}>
                    <span className="lrow__t">{e.name}</span>
                    <span className="lrow__s">
                      {e.isCustom ? 'yours' : e.muscleGroup ?? 'library'}
                    </span>
                  </span>
                  <Plus size={16} />
                </button>
              ))}
              {results.length === 0 ? (
                <p className="small ink3" style={{ padding: 12 }}>Nothing in the library matches that.</p>
              ) : null}
            </div>
          )}
        </div>

        <div className="panel__foot">
          <span className="small" style={{ marginRight: 'auto', maxWidth: '26ch' }}>
            Goes into today&rsquo;s log only. Her program does not change.
          </span>
          <button className="btn btn--ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}

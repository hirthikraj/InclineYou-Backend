'use client';

import { useEffect, useMemo, useState } from 'react';

import type { SwapScope } from '@/lib/log/result';
import { Search } from '@/components/shell/Icons';

/**
 * FRAME 3b — A SWAP THAT CAN REACH FIVE PEOPLE.
 *
 * `today` · `program` · `template` are three different decisions, and every
 * competitor in the teardown collapses them into one. Each states its own blast
 * radius **on its own row, before the tap** — including the one that reaches
 * somebody who is not in the room, because a change that size should never be
 * discovered afterwards. The widest is drawn in the warn colour and counts the
 * clients it touches.
 *
 * **The only modal in this file**, and that is the reason: `webapp.css` reserves
 * the centre of the screen for a destructive confirm or a two-field form, and
 * everything else goes in the panel. Rewriting a template for five clients is
 * the one thing here that has to be read and answered rather than looked past.
 *
 * The opening sentence is the argument, not decoration: *the rack was busy —
 * that is a Tuesday, not an exception, and an app that scores it as
 * non-adherence is wrong about the gym it is being used in.*
 */
export function SwapModal({
  fromName,
  library,
  hasProgram,
  hasTemplate,
  programWeeksLeft,
  templateReach,
  busy,
  message,
  onSwap,
  onClose,
}: {
  fromName: string;
  library: { id: string; name: string; muscleGroup: string | null; isCustom: boolean }[];
  hasProgram: boolean;
  hasTemplate: boolean;
  programWeeksLeft: number | null;
  templateReach: number | null;
  busy: boolean;
  message: string | null;
  onSwap: (toExerciseId: string, scope: SwapScope) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [to, setTo] = useState<{ id: string; name: string } | null>(null);
  const [scope, setScope] = useState<SwapScope>('today');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return library.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, library]);

  return (
    <>
      <div className="scrim scrim--top" onClick={onClose} aria-hidden="true" />
      <div className="modal" style={{ width: 560 }} role="dialog" aria-modal="true" aria-label="Swap an exercise">
        <div className="modal__hd">
          <p className="modal__t">
            {fromName} → {to?.name ?? 'pick a replacement'}
          </p>
        </div>

        <div className="modal__body" style={{ paddingBottom: 8 }}>
          <p style={{ margin: '0 0 4px' }}>
            The rack was busy. That is a Tuesday, not an exception — and an app that scores it as
            non-adherence is wrong about the gym it is being used in.
          </p>

          <label className="search" style={{ marginTop: 14 }}>
            <Search size={15} />
            <input
              value={to ? to.name : query}
              onChange={(e) => { setTo(null); setQuery(e.target.value); }}
              placeholder="Swap it for…"
              aria-label="Search for a replacement exercise"
            />
          </label>

          {!to && results.length ? (
            <div className="lgl" style={{ marginTop: 8 }}>
              {results.map((e) => (
                <button className="lrow" type="button" key={e.id} onClick={() => setTo({ id: e.id, name: e.name })}>
                  <span className="lrow__m" style={{ flex: 1 }}>
                    <span className="lrow__t">{e.name}</span>
                    <span className="lrow__s">{e.isCustom ? 'yours' : e.muscleGroup ?? 'library'}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <p className="micro" style={{ margin: '16px 0 0' }}>How far does this reach?</p>

          <button
            className={`scp${scope === 'today' ? ' scp--on' : ''}`}
            type="button"
            style={{ marginTop: 8 }}
            aria-pressed={scope === 'today'}
            onClick={() => setScope('today')}
          >
            <span className={`rad${scope === 'today' ? ' rad--on' : ''}`} />
            <span className="scp__m">
              <span className="scp__t">Today only</span>
              <span className="scp__b">
                This log. Her program is untouched and next {"Tuesday"} is unchanged.
              </span>
            </span>
            <span className="scp__n">this log</span>
          </button>

          <button
            className={`scp${scope === 'program' ? ' scp--on' : ''}`}
            type="button"
            style={{ marginTop: 8 }}
            aria-pressed={scope === 'program'}
            disabled={!hasProgram}
            onClick={() => setScope('program')}
          >
            <span className={`rad${scope === 'program' ? ' rad--on' : ''}`} />
            <span className="scp__m">
              <span className="scp__t">Her program</span>
              <span className="scp__b">
                {hasProgram
                  ? `Every session on this plan from now on, for her alone.${programWeeksLeft ? ` ${programWeeksLeft} week${programWeeksLeft === 1 ? '' : 's'} of it left.` : ''}`
                  : 'She has no live program, so there is nothing here to change.'}
              </span>
            </span>
            <span className="scp__n">{hasProgram ? 'her plan' : 'none'}</span>
          </button>

          <button
            className={`scp scp--wide${scope === 'template' ? ' scp--on' : ''}`}
            type="button"
            style={{ marginTop: 8 }}
            aria-pressed={scope === 'template'}
            disabled={!hasTemplate}
            onClick={() => setScope('template')}
          >
            <span className={`rad${scope === 'template' ? ' rad--on' : ''}`} />
            <span className="scp__m">
              <span className="scp__t">The template</span>
              <span className="scp__b">
                {hasTemplate
                  ? `The template itself — so every client on it, which is ${templateReach ?? 'more than one'} ${templateReach === 1 ? 'person' : 'people'}. The one change that reaches somebody who is not in the room.`
                  : 'Her program did not come from a template, so there is nothing wider than her plan.'}
              </span>
            </span>
            <span className="scp__n">
              {hasTemplate ? `${templateReach ?? '?'} client${templateReach === 1 ? '' : 's'}` : 'none'}
            </span>
          </button>

          <p className="small" style={{ marginTop: 12 }}>
            Three different decisions, and every competitor in the teardown collapses them into one.
            Each states its own blast radius <b>before</b> the tap.
          </p>

          {message ? <p className="msg msg--err" role="alert">{message}</p> : null}
        </div>

        <div className="modal__foot">
          <button className="btn btn--ghost" type="button" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={!to || busy}
            onClick={() => to && onSwap(to.id, scope)}
          >
            {busy
              ? 'Swapping…'
              : scope === 'today'
                ? 'Swap for today'
                : scope === 'program'
                  ? 'Swap on her program'
                  : `Swap on the template`}
          </button>
        </div>
      </div>
    </>
  );
}

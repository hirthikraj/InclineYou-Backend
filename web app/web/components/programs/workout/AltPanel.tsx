'use client';

import { useId, useState } from 'react';

import type { DraftExercise, DraftSet } from '@/lib/workouts/draft';
import type { ExerciseWire } from '@/lib/exercises/api';
import { Button } from '@/web-components/ui/Button';
import { MarkupField } from '@/web-components/ui/MarkupField';
import { AltIcon, ArrowUp, CloseIcon } from '../Icons';
import { SetLine } from './ExerciseCard';
import { LibraryPane } from './LibraryPane';

/**
 * THE ALTERNATIVES PANEL — the library on the left, the substitutes on the right.
 *
 * ── WHY IT IS THE BUILDER'S OWN SHAPE AND NOT A LITTLE PICKER ───────────────
 *
 * The first pass at this was a 520px dialog with a search box that set ONE
 * substitute, which is `RowPanel`'s model on the week sheet and is wrong inside
 * a session for two reasons that only show up here:
 *
 * · **A substitute needs its own numbers.** A leg press standing in for a back
 *   squat is not 100kg, and `DraftAlternative` carries the argument. The moment
 *   the substitute has sets, it needs the same seven-control line the movement
 *   has — and that does not fit beside a search box.
 * · **One is not enough.** The rack being busy and the press being busy are two
 *   different Tuesdays. A trainer with one slot names the machine and watches
 *   the client skip anyway, which is the exact outcome §2 is about.
 *
 * So it is the builder's own two-pane layout at one level down: the same
 * `LibraryPane` on the left, the same `SetLine` on the right, and a head that
 * states which movement all of this is standing in for. A trainer who can write
 * a workout can write its alternatives without learning anything new, because
 * there is nothing new to learn.
 *
 * ── WHAT IS NOT DRAWN, AND WHY ──────────────────────────────────────────────
 *
 * · **No thumbnails and no microphone.** The library is text-only and there is
 *   no audio store anywhere in this product; `LibraryPane` and `ExerciseCard`
 *   refuse both in as many words, and a panel that drew them would be drawing
 *   over files that do not exist.
 * · **No *Save as template*.** There is no store of saved alternative sets to
 *   put one in. When there is, this footer is where it goes.
 * · **No Save of its own.** Every edit in here writes straight to the draft and
 *   onto the builder's undo stack, so a *Save* button would be claiming a
 *   commit that already happened. The builder's Save is still the one that
 *   reaches the server, and *Done* says only what it does.
 */
export function AltPanel({
  entry,
  actions,
  onClose,
}: {
  /** Read out of the draft every render, never copied in — an undo behind this
   *  panel must reach it. The builder holds the uid and hands the row over. */
  entry: DraftExercise;
  actions: AltActions;
  onClose: () => void;
}) {
  const id = useId();

  /* WHY A DUPLICATE IS REFUSED HERE AND NOT IN THE REDUCER. It is the only
     refusal on this panel and it has to be readable: the trainer clicked a row
     in a 1,324-strong library and nothing happened, so something has to say
     why. The reducer has nowhere to say it, and a silent no-op there would read
     as a broken list. */
  const [refused, setRefused] = useState<string | null>(null);

  const taken = new Set([entry.exerciseId, ...entry.alternatives.map(a => a.exerciseId)]);

  function add(exercise: ExerciseWire) {
    if (exercise.id === entry.exerciseId) {
      setRefused(`${exercise.name} is the movement itself.`);
      return;
    }
    if (taken.has(exercise.id)) {
      setRefused(`${exercise.name} is already on the list.`);
      return;
    }
    setRefused(null);
    actions.onAdd(exercise);
  }

  return (
    <div className="wkalt" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
      <header className="wkalt__hd">
        <div className="wkalt__ht">
          <h2 className="wkalt__t" id={`${id}-t`}>
            Alternatives for {entry.name}
          </h2>
          <p className="wkalt__sub">
            What your client may swap to when the station is taken. They see these and nothing
            else — anything not on this list, and the app tells them to ask you.
          </p>
        </div>
        <button className="wkalt__x" type="button" aria-label="Close" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </header>

      <div className="wkalt__b">
        <LibraryPane
          onAdd={add}
          /* No drop target in here — `LibraryPane`'s own prop carries why. */
          onCarry={null}
          countFor={exerciseId => (taken.has(exerciseId) ? 1 : 0)}
          countLabel="on"
        />

        <div className="wkalt__pane">
          {/* THE MOVEMENT BEING STOOD IN FOR, drawn as a card and not as a
              heading, because the list below it is cards and the relationship
              between them is *instead of this one*. It is read-only here: this
              panel is about the substitutes, and an editable set line for the
              movement would be a second place to write the same prescription. */}
          <div className="wkalt__of">
            <span className="wkalt__ofc">{entry.sets.length} ×</span>
            <span className="wkalt__ofn">
              {entry.name}
              {entry.meta && <span className="wkalt__ofm">{entry.meta}</span>}
            </span>
            <span className="wkalt__ofl">instead of</span>
          </div>

          {refused && (
            <p className="wkalt__no" role="status">
              {refused}
            </p>
          )}

          {entry.alternatives.length === 0 ? (
            <p className="wkalt__none">
              <AltIcon size={15} />
              Nothing yet. Pick a movement on the left — it starts with this one&rsquo;s sets, and
              you change whatever differs.
            </p>
          ) : (
            entry.alternatives.map((alt, i) => (
              <AltCard
                key={alt.uid}
                n={i + 1}
                alt={alt}
                first={i === 0}
                actions={actions}
              />
            ))
          )}
        </div>
      </div>

      <footer className="wkalt__ft">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Done
        </Button>
      </footer>
    </div>
  );
}

/** What the panel may do to one movement's substitutes. The builder owns every
 *  one of them, for the same reason it owns the note dialog's state. */
export interface AltActions {
  onAdd: (exercise: ExerciseWire) => void;
  onRemove: (altUid: string) => void;
  onRaise: (altUid: string) => void;
  onAddSet: (altUid: string) => void;
  onRemoveSet: (altUid: string, setUid: string) => void;
  onPatchSet: (altUid: string, setUid: string, patch: Partial<Omit<DraftSet, 'uid'>>) => void;
  /** The instructions — one sentence onto every set of this substitute. */
  onInstruct: (altUid: string, notes: string | null) => void;
}

/* ────────────────────────────────────────────────── one substitute ── */

function AltCard({
  n,
  alt,
  first,
  actions,
}: {
  n: number;
  alt: DraftExercise['alternatives'][number];
  first: boolean;
  actions: AltActions;
}) {
  /* The sentence is the same on every set of a substitute — `patchAlternativeSets`
     writes it to all of them — so the first set is where it is read back from. */
  const written = alt.sets[0]?.notes ?? null;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(written ?? '');

  function commit() {
    actions.onInstruct(alt.uid, text.trim() || null);
    setOpen(false);
  }

  return (
    <div className="wkalt__c">
      <div className="wkalt__chd">
        <span className="wkalt__cn">{n}</span>
        <span className="wkalt__cnm">
          {alt.name}
          {alt.meta && <span className="wkalt__cmt">{alt.meta}</span>}
        </span>

        <button
          className={`wkalt__ins${written ? ' wkalt__ins--on' : ''}`}
          type="button"
          aria-expanded={open || Boolean(written)}
          onClick={() => {
            setText(written ?? '');
            setOpen(v => !v);
          }}
        >
          {written ? 'Edit instructions' : 'Add instructions'}
        </button>

        {/* ↑ AND NO ↓ — `raiseAlternative` carries the argument: the order is a
            ranking, every arrangement is reachable with one arrow, and the row
            already has a remove to sit beside. The first card has nowhere to go
            and says so rather than offering a click that does nothing. */}
        <button
          className="wkalt__up"
          type="button"
          disabled={first}
          aria-label={`Move ${alt.name} up the list`}
          onClick={() => actions.onRaise(alt.uid)}
        >
          <ArrowUp size={14} />
        </button>
        <button
          className="wkalt__cx"
          type="button"
          aria-label={`Remove ${alt.name} from the alternatives`}
          onClick={() => actions.onRemove(alt.uid)}
        >
          <CloseIcon size={14} />
        </button>
      </div>

      {(open || written) && (
        <div className="wkalt__note">
          {open ? (
            <>
              <MarkupField
                value={text}
                onChange={setText}
                onCommit={commit}
                placeholder="How to run this one — “half the load, same tempo”"
                label={`Instructions for ${alt.name}`}
              />
              <div className="wkalt__nft">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={commit}>
                  Save the instructions
                </Button>
              </div>
            </>
          ) : (
            /* READ AS PROSE when it is not being written, which is `.wks__cue`'s
               rule on the set line: the markers are a way to type, never a
               thing to show the client or the trainer reading back. */
            <p className="wkalt__nread">{written}</p>
          )}
        </div>
      )}

      <div className="wkalt__sets">
        {alt.sets.map((set, i) => (
          <SetLine
            key={set.uid}
            n={i + 1}
            set={set}
            name={alt.name}
            /* THE LAST SET OF A SUBSTITUTE IS NOT REMOVABLE, for the reason
               `ExerciseCard` gives: it would leave a head with nothing under
               it. Removing the SUBSTITUTE is what the ✕ above is for. */
            onRemove={alt.sets.length > 1 ? () => actions.onRemoveSet(alt.uid, set.uid) : null}
            onPatch={patch => actions.onPatchSet(alt.uid, set.uid, patch)}
            onNote={null}
          />
        ))}
        <button
          className="wke__add"
          type="button"
          onClick={() => actions.onAddSet(alt.uid)}
        >
          <span aria-hidden="true">+</span> Add a new set
        </button>
      </div>
    </div>
  );
}

'use client';

import { useId, useState } from 'react';

import type { DraftSet } from '@/lib/workouts/draft';
import { Button } from '@/web-components/ui/Button';
import { MarkupField } from '@/web-components/ui/MarkupField';
import { CloseIcon } from '../Icons';

/**
 * THE NOTE ON A SET, WRITTEN IN A DIALOG RATHER THAN ON THE LINE.
 *
 * The note used to be a one-line input that unfolded under the set it belonged
 * to, and it was the wrong shape twice over. A cue is a SENTENCE — *pause a
 * beat at the bottom, then drive through the heel* — and a 30px box inside a
 * seven-control row gives it about four words before it scrolls under its own
 * caret. And the row it opened in is already the densest line on the canvas, so
 * the note pushed the set apart every time one was written.
 *
 * ── AND IT IS WHERE THE *WHICH SETS* QUESTION CAN BE ASKED ──────────────────
 *
 * The one thing the inline box could not do at all. A cue is almost never for
 * set three alone — it is how the movement is performed, and on a card with
 * four sets the trainer wrote it once and then copied it three times by hand,
 * or gave up and wrote it on one set hoping it would be read. `Sets:` answers
 * that: **All** writes the same sentence to every set of this movement,
 * `onPatchSets`, one undo step; a number writes it to that set alone. It is
 * drawn only when there is more than one set, because *All* and *1* are the
 * same button on a movement with one.
 *
 * The text is a DRAFT and the chips say where it lands, so switching to set 2
 * keeps what has been typed rather than loading set 2's own note over it — the
 * trainer writing a cue and then deciding it belongs somewhere else is the
 * whole reason the chips are here, and a picker that erased the sentence on the
 * way would defeat it. Saving over a note that set already had is the intent of
 * the gesture; nothing else can be meant by picking it.
 *
 * ── THE TOOLBAR IS `MarkupField`'S, AND SO IS THE FORMAT ────────────────────
 *
 * The design draws **B / I / U / H** and an emoji over the box, and a toolbar
 * over a plain text column is the audio note's problem — a control drawn over
 * something that does not exist — right up until the column has a format and
 * every reader of it can draw one. So `lib/text/markup.ts` defines the format,
 * `Markup` is the only thing that reads it, and this dialog composes the pair
 * rather than owning either: the next note field in this product gets the same
 * four marks by importing the same component, which is the whole argument for
 * putting it in the catalogue instead of in here.
 *
 * The note is drawn under its set line THROUGH `Markup` for that reason. A
 * field edited with markers and printed as a bare string anywhere shows the
 * asterisks to whoever reads it, and on this field that is the client.
 */
export function NoteDialog({
  name,
  sets,
  setUid,
  onSave,
  onClose,
}: {
  name: string;
  /** Every set of this movement — the chips are their ordinals. */
  sets: DraftSet[];
  /** The set whose note button was pressed. The text and the chip open on it. */
  setUid: string;
  /** `null` for the scope is *all of them*. An empty note comes back as null. */
  onSave: (scope: string | null, notes: string | null) => void;
  onClose: () => void;
}) {
  const id = useId();
  const index = Math.max(0, sets.findIndex(s => s.uid === setUid));
  const [text, setText] = useState(sets[index]?.notes ?? '');
  const [scope, setScope] = useState<string | null>(setUid);

  function save() {
    onSave(scope, text.trim() || null);
  }

  return (
    <div className="wknx" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
      <header className="wknx__hd">
        <h2 className="wknx__t" id={`${id}-t`}>
          Edit comment
        </h2>
        <button className="wknx__x" type="button" aria-label="Close without saving" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </header>

      <div className="wknx__b">
        {/* Ctrl/⌘+Enter saves, because Enter is a newline in a box that takes
            more than one line. Escape is the host's and is not touched here. */}
        <MarkupField
          value={text}
          onChange={setText}
          onCommit={save}
          placeholder="Add a comment to the set"
          label={`The note on set ${index + 1} of ${name}`}
        />

        {sets.length > 1 && (
          <div className="wknx__sc">
            <span className="wknx__sk" id={`${id}-s`}>
              Sets:
            </span>
            <div className="wknx__chips" role="group" aria-labelledby={`${id}-s`}>
              <button
                type="button"
                className={`wknx__ch${scope === null ? ' wknx__ch--on' : ''}`}
                aria-pressed={scope === null}
                onClick={() => setScope(null)}
              >
                All
              </button>
              {sets.map((set, i) => (
                <button
                  key={set.uid}
                  type="button"
                  className={`wknx__ch${scope === set.uid ? ' wknx__ch--on' : ''}`}
                  aria-pressed={scope === set.uid}
                  aria-label={`Set ${i + 1} only`}
                  onClick={() => setScope(set.uid)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="wknx__ft">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={save}>
          Save
        </Button>
      </footer>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { Markup } from '@/web-components/ui/Markup';

import { Tack } from '@/components/shell/Icons';
import type { ClientNoteWire } from '@/lib/clients/client-api';
import { setNotePinned } from '@/lib/clients/notes-actions';

/**
 * THE PINNED STRIP — WHAT THE TRAINER SEES BEFORE EVERY SESSION.
 *
 * Above the tabs and inside `.ph`, so it is on all six tabs and does not scroll
 * away with the body. That placement is the whole feature: something a trainer
 * has to open a tab to find is something they will run the session without
 * having found.
 *
 * ── WHAT THIS IS, EXACTLY, AND WHAT IT IS NOT ───────────────────────────────
 *
 * It is the trainer's own pinned notes — free text they wrote, shown back where
 * they asked for it. It is **not** a health record, and the difference is legal
 * rather than editorial.
 *
 * `notes/InclineYou_MVP_interaction_map.md` is explicit and files it under *legally
 * excluded, not deferred*, against the DPDP Act 2023: "**No medical or
 * health-condition fields anywhere** — no injuries, no conditions, no
 * medications … Do not design an 'injuries / health notes' field into intake."
 * NFR-8 says the same, and `InclineYou_core_data_model.md` §3.2 pins the note itself
 * as "free text; **no medical fields**".
 *
 * So there is no injury picker here, no condition list, no PAR-Q checklist and
 * no medical iconography. A trainer types "left knee — no deep squats" and the
 * product stores the characters and shows them back. It classifies nothing,
 * indexes nothing and flags nothing, which is what keeps this a note rather than
 * a health record. `AGENTS.md` makes the same argument about the deck's neutral
 * *Has a note* chip: "the moment a flag distinguishes a health note from any
 * other note, the product holds health data whatever the column is called."
 *
 * The sanctioned path to structured health data is §5 of the data model — a
 * separate `health_note` table with its own consent and access controls — and it
 * is a different feature, not a wider version of this one.
 *
 * ── WHY THE EMPTY STATE IS A LINE AND NOT NOTHING ───────────────────────────
 *
 * A strip that is absent until it has content is a strip nobody knows exists, so
 * nobody pins anything and it stays absent. One quiet line, once, with the way
 * to fill it — and it is quiet on purpose: `.cfpin`'s warn ground is for a real
 * constraint, and an empty prompt wearing it would be the boy who cried wolf on
 * every file with nothing wrong.
 */
export function PinnedStrip({
  clientId,
  notes,
}: {
  clientId: string;
  notes: ClientNoteWire[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const pinned = notes.filter((n) => n.pinned);

  /* NOTHING PINNED DRAWS NOTHING. It was a line of prose — *Nothing pinned. Pin a note
     to keep it above every tab* — on every tab of every client who has never been given
     a note, a permanent invitation to a feature in the 28–38% of the window that is
     already sticky chrome. The Personal information tab teaches the pin where the
     pinning happens (a *Pin to the strip* checkbox on the composer), so the lesson is
     not lost, only no longer repeated. When a note IS pinned the strip below is a live
     constraint and draws at every width. */
  if (pinned.length === 0) return null;

  function unpin(noteId: string) {
    setError(null);
    start(async () => {
      const result = await setNotePinned(clientId, noteId, false);
      if (!result.ok) setError(result.message ?? 'It did not save.');
    });
  }

  /* One line by default — the first note, clipped — and open to every note in full.
     It was a 64px block of amber above all eight tabs; a one-line strip keeps the
     constraint in sight without taking the window. The toggle is only drawn when
     there is more to show. */
  const more = pinned.length > 1 || pinned.some((n) => n.body.length > 90);

  return (
    <div
      className="cfpin"
      data-open={open ? '' : undefined}
      style={pending ? { opacity: 0.6 } : undefined}
    >
      <span className="cfpin__ic" aria-hidden="true">
        {/* `Tack` and not `Pin`: `Pin` is the MAP pin Today's hero uses for *where*, and at
            12px a teardrop reads as a location marker. */}
        <Tack size={12} filled />
      </span>
      <div className="cfpin__l">
        <span className="vh">Before every session</span>
        {pinned.map((note) => (
          <p key={note.id} className="cfpin__i">
            {/* Through `Markup`, like every other place a note is printed — a note that
                came out formatted in one and asterisked in the other would be the same
                bug wearing two faces. */}
            <Markup value={note.body} className="cfpin__b" />
            <button
              className="cfpin__x"
              type="button"
              onClick={() => unpin(note.id)}
              disabled={pending}
              aria-label="Unpin this note"
            >
              Unpin
            </button>
          </p>
        ))}
      </div>
      {more && (
        <button
          className="cfpin__e"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Less' : pinned.length > 1 ? `+${pinned.length - 1} more` : 'More'}
        </button>
      )}
      {error && (
        <p className="small" role="alert" style={{ flexBasis: '100%', color: 'var(--tx-danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

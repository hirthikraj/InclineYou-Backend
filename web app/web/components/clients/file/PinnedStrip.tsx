'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { Pin } from '@/components/shell/Icons';
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

  const pinned = notes.filter((n) => n.pinned);

  if (pinned.length === 0) {
    return (
      <p className="small" style={{ marginTop: 12, color: 'var(--tx-ink-3)' }}>
        Nothing pinned.{' '}
        <Link href={`/clients/${clientId}/notes`}>
          Pin a note
        </Link>{' '}
        to keep it in front of you on every tab — how they train, what to avoid,
        what they told you last week.
      </p>
    );
  }

  function unpin(noteId: string) {
    setError(null);
    start(async () => {
      const result = await setNotePinned(clientId, noteId, false);
      if (!result.ok) setError(result.message ?? 'It did not save.');
    });
  }

  return (
    <div className="cfpin" style={pending ? { opacity: 0.6 } : undefined}>
      <p className="cfpin__k">
        <Pin size={12} />
        Before every session
      </p>
      <div className="cfpin__l">
        {pinned.map((note) => (
          <p key={note.id} className="cfpin__i">
            <span style={{ flex: 1, minWidth: 0 }}>{note.body}</span>
            <button
              className="cfpin__x"
              type="button"
              onClick={() => unpin(note.id)}
              disabled={pending}
            >
              Unpin
            </button>
          </p>
        ))}
      </div>
      {error && (
        <p className="small" style={{ marginTop: 8, color: 'var(--tx-danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

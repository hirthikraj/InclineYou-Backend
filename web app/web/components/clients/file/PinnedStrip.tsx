'use client';

import { useState, useTransition } from 'react';
import { Markup } from '@/web-components/ui/Markup';
import Link from 'next/link';

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

  const pinned = notes.filter((n) => n.pinned);

  if (pinned.length === 0) {
    return (
      /* ONE LINE, AND NOT ON A PHONE AT ALL — `.cfpin--none` in app.css.
         This was three lines of prose teaching a feature, drawn above all six
         tabs of every client, for as long as the trainer chooses not to use it:
         58px on a 844px screen, permanently, for an invitation. The Personal information tab
         already extends it twice — a *Pin to the strip* checkbox beside the
         composer, and a paragraph under the list saying where pinned notes go —
         so the teaching is not lost, it is where the pinning happens.

         What survives on a desk is the one clause that is news rather than
         instruction: nothing is pinned, and here is where you would. When a note
         IS pinned the strip below is a live constraint and draws at every width;
         only the empty case is quiet. */
      <p className="small cfpin--none">
        Nothing pinned.{' '}
        <Link
          href={`/clients/${clientId}/information`}
          title="Pinned notes stay above the tabs on every tab of this file"
        >
          Pin a note
        </Link>{' '}
        to keep it above every tab.
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
        {/* `Tack` and not `Pin`. `Pin` is the MAP pin Today's hero uses for
            *where is this*; the strip's whole subject is *stuck to the top*,
            and at 12px a teardrop reads as a location marker. Solid, because
            the glyph here is a statement and not a control — there IS something
            pinned or this paragraph would not be drawn. */}
        <Tack size={12} filled />
        Before every session
      </p>
      <div className="cfpin__l">
        {pinned.map((note) => (
          <p key={note.id} className="cfpin__i">
            {/* Through `Markup`, like every other place a note is printed.
                The strip draws the same rows the list below it does, and a
                note that came out formatted in one and asterisked in the
                other would be the same bug wearing two faces. */}
            <Markup value={note.body} className="cfpin__b" />
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

'use client';

import { useRef, useState, useTransition } from 'react';

import { Pin } from '@/components/shell/Icons';
import type { ClientNoteWire } from '@/lib/clients/client-api';
import {
  addNote,
  deleteNote,
  saveNote,
  setNotePinned,
} from '@/lib/clients/notes-actions';

import { Blank, TrashIcon, longDateStr } from './shared';

/**
 * NOTES — THE RELATIONSHIP LAYER.
 *
 * "prefers mornings, hates burpees, wife Priya, getting married in Nov — wants
 * to lean out." None of that is a field, none of it will ever be a field, and
 * all of it is what a trainer actually knows about the forty people on their
 * roster. This is the tab that holds it.
 *
 * ── THREE THINGS THAT ARE DECISIONS, NOT LAYOUT ─────────────────────────────
 *
 * **The composer is always open.** A `+` that opens a modal is three
 * interactions for eleven words, and the moment these notes get written is
 * mid-session with a client in front of the trainer. So the box is on the screen,
 * focused-ready, and ⌘/Ctrl+Enter saves without reaching for the mouse.
 *
 * **Pinning is offered at write time, not only after.** The note a trainer most
 * wants in the strip is usually the one they are typing — a constraint they just
 * learned. Making them save it and then find it to pin it is the flow that ends
 * with nothing pinned.
 *
 * **Private is stated, once, plainly.** `GET /v1/clients/{id}/notes` narrows by
 * the author, so a teammate holding the same client sees an empty list rather
 * than these words — that is real, and a trainer will only write the honest
 * version of a note if they believe it. One line, not a banner.
 *
 * ── AND WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────
 *
 * No categories, no tags, no "type of note", and above all no health fields. The
 * interaction map excludes health data outright under the DPDP Act 2023, and a
 * category that tells a medical note apart from any other note would make this a
 * health record whatever the category was called. Free text, and the product does
 * not read it. `PinnedStrip.tsx` carries the full argument.
 */

function NoteRow({
  clientId,
  note,
  busy,
  onBusy,
}: {
  clientId: string;
  note: ClientNoteWire;
  busy: boolean;
  onBusy: (fn: () => Promise<void>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [confirming, setConfirming] = useState(false);

  /* `updatedAt` rather than `createdAt` when they differ, because an edited note
     is about the day it was last true, not the day it was first written. */
  const stamp = note.updatedAt > note.createdAt + 60_000 ? note.updatedAt : note.createdAt;
  const edited = note.updatedAt > note.createdAt + 60_000;

  return (
    <div className={`cfnote${note.pinned ? ' cfnote--pin' : ''}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <>
            <textarea
              className="cfcomp"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Edit this note"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
              <button
                className="btn btn--primary btn--sm"
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() =>
                  onBusy(async () => {
                    await saveNote(clientId, note.id, draft);
                    setEditing(false);
                  })
                }
              >
                Save
              </button>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => {
                  setDraft(note.body);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="cfnote__b">{note.body}</p>
            <p className="cfnote__m">
              {longDateStr(stamp)}
              {edited && ' · edited'}
              {note.pinned && ' · pinned'}
            </p>
          </>
        )}
      </div>

      {!editing && (
        <div className="cfnote__a">
          <button
            className="btn btn--ghost btn--sm btn--icon"
            type="button"
            disabled={busy}
            title={note.pinned ? 'Unpin from the strip' : 'Pin to the strip'}
            aria-label={note.pinned ? 'Unpin from the strip' : 'Pin to the strip'}
            aria-pressed={note.pinned}
            onClick={() =>
              onBusy(async () => {
                await setNotePinned(clientId, note.id, !note.pinned);
              })
            }
            style={note.pinned ? { color: 'var(--tx-warn)' } : undefined}
          >
            <Pin size={14} />
          </button>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          {/* Confirm in place rather than a dialog. A note is one or two
              sentences somebody typed; losing it to a mis-tap should cost a
              second click, and a modal for eleven words is heavier than the
              thing it is protecting. */}
          {confirming ? (
            <>
              <button
                className="btn btn--danger btn--sm"
                type="button"
                disabled={busy}
                onClick={() =>
                  onBusy(async () => {
                    await deleteNote(clientId, note.id);
                  })
                }
              >
                Delete
              </button>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => setConfirming(false)}
              >
                Keep
              </button>
            </>
          ) : (
            <button
              className="btn btn--ghost btn--sm btn--icon"
              type="button"
              disabled={busy}
              title="Delete this note"
              aria-label="Delete this note"
              onClick={() => setConfirming(true)}
            >
              <TrashIcon size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function NotesTab({
  clientId,
  clientName,
  notes,
}: {
  clientId: string;
  clientName: string;
  notes: ClientNoteWire[];
}) {
  const [draft, setDraft] = useState('');
  const [pinNew, setPinNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  /* Pinned first, then newest. The strip's contents should be at the top of the
     list that owns them, or unpinning something means hunting for it. */
  const ordered = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  function run(fn: () => Promise<void>) {
    setError(null);
    start(async () => {
      await fn();
    });
  }

  function submit() {
    if (!draft.trim() || pending) return;
    setError(null);
    start(async () => {
      const result = await addNote(clientId, draft, pinNew);
      if (result.ok) {
        setDraft('');
        setPinNew(false);
        box.current?.focus();
      } else {
        setError(result.message ?? 'It did not save.');
      }
    });
  }

  return (
    <div className="cfgrid" style={{ display: 'grid', gap: 12, alignItems: 'start', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
      <div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card__b">
            <textarea
              ref={box}
              className="cfcomp"
              value={draft}
              placeholder={`Something worth remembering about ${clientName.split(' ')[0]}…`}
              aria-label={`A note about ${clientName}`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 11,
                flexWrap: 'wrap',
              }}
            >
              <button
                className="btn btn--primary"
                type="button"
                disabled={pending || !draft.trim()}
                onClick={submit}
              >
                Add note
              </button>
              <label
                className="row"
                style={{ gap: 7, cursor: 'pointer', fontSize: 13.5, alignItems: 'center' }}
              >
                <input
                  type="checkbox"
                  className="check"
                  checked={pinNew}
                  onChange={(e) => setPinNew(e.target.checked)}
                />
                Keep this one in front of me
              </label>
              <span style={{ flex: 1 }} />
              {/* Written out rather than as ⌘↵. FOUND BY RENDERING: the two
                  glyphs fall outside the mono face and came back as tofu, which
                  is a hint that has to be decoded rather than read. */}
              <span className="small mono" style={{ color: 'var(--tx-ink-off)' }}>
                CTRL + ENTER
              </span>
            </div>
            {error && (
              <p className="small" style={{ marginTop: 9, color: 'var(--tx-danger)' }}>
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="card" style={pending ? { opacity: 0.6 } : undefined}>
          <div className="card__b card__b--flush">
            {ordered.length === 0 ? (
              <Blank>Nothing written down yet</Blank>
            ) : (
              ordered.map((note) => (
                <NoteRow
                  key={note.id}
                  clientId={clientId}
                  note={note}
                  busy={pending}
                  onBusy={run}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__hd">
          <p className="card__t">These are yours</p>
        </div>
        <div className="card__b">
          <p className="small">
            Nobody else reads these. A teammate who can see {clientName.split(' ')[0]} on a
            shared roster does not see this tab&rsquo;s contents — the server narrows
            notes by whoever wrote them, not by who can see the client.
          </p>
          <p className="small" style={{ marginTop: 10 }}>
            <b>Pinned</b> notes move to the strip above the tabs, where they stay in
            front of you whichever tab you are on. Two or three is the right number;
            a strip that fills up stops being read.
          </p>
          <p className="small" style={{ marginTop: 10, color: 'var(--tx-ink-3)' }}>
            Stored as plain text. Write what you would write on a card — how they
            like to train, what they told you last week, what to avoid.
          </p>
        </div>
      </div>
    </div>
  );
}

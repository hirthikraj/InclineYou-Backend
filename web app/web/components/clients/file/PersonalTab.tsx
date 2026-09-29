'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Note, Plus, Tack } from '@/components/shell/Icons';
import type { ClientDetailWire, ClientNoteWire } from '@/lib/clients/client-api';
import { formatPhone } from '@/lib/auth/policy';
import { saveContact, savePhysical } from '@/lib/clients/contact-actions';
import { ageFrom, birthDateStr } from '@/lib/clients/physical';
import { archiveClient, unarchiveClient, type ArchiveReason } from '@/lib/clients/status-actions';
import {
  addNote,
  deleteNote,
  saveNote,
  setNotePinned,
  undeleteNote,
} from '@/lib/clients/notes-actions';
import { useToast } from '@/lib/toast/store';
import { ARCHIVE_REASONS } from '@/components/clients/Clients';

import { TrashIcon, longDateStr, shortDate } from './shared';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Checkbox } from '@/web-components/ui/Checkbox';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { FactList } from '@/web-components/ui/FactList';
import { Markup } from '@/web-components/ui/Markup';
import { MarkupField } from '@/web-components/ui/MarkupField';
import { NoteCard } from '@/web-components/ui/NoteCard';
import { PromptList } from '@/web-components/ui/PromptList';
import { Select } from '@/web-components/ui/Select';
import { TextField } from '@/web-components/ui/Field';
import { Message } from '@/web-components/ui/Message';

/**
 * PERSONAL INFORMATION — THE RECORD, AND THE RELATIONSHIP LAYER BESIDE IT.
 *
 * "prefers mornings, hates burpees, wife Priya, getting married in Nov — wants
 * to lean out." None of that is a field, none of it will ever be a field, and
 * all of it is what a trainer actually knows about the forty people on their
 * roster. This is the tab that holds it — sharing a screen with the fields that
 * say who the person is, which until this tab existed could be typed once on
 * the add-a-client flow and never corrected.
 *
 * ── THE 19 SEP 2026 PASS: A WALL, NOT A LIST ────────────────────────────────
 *
 * MEASURED at 1536×695 on `cli_012`, the densest client the seed makes:
 *
 *   the notes card                974px wide   288px tall
 *   the record column beside it   423px wide   571px tall
 *   the text column in a note      705px — holding a 72-character sentence
 *   .body                         367px of window against 623px of content
 *
 * Every defect on this screen is in those four lines. Each note was one
 * sentence smeared across 705px — a ~120-character measure, twice what anybody
 * reads comfortably — with ~255px of nothing after it. The column holding them
 * was 69% of the screen and the SHORTEST thing on it, so a 432px hole opened
 * down the middle of the tab (139px of notes against 571px of record on
 * `cli_008`, which is the ordinary case). And the two cards the trainer opens
 * this tab to correct started 257px below the fold.
 *
 * Three changes, in the order they matter:
 *
 * 1 · **The notes are a wall of cards** (`NoteCard` + `.cfnw`), not rows in a
 *     flush card. A row is for records that share a schema and are read down a
 *     column; a note shares nothing with the note above it except its author.
 *     Two ~481px tracks at a desk put the measure back to ~75 characters, and
 *     three notes fill two rows instead of leaving a hole.
 * 2 · **The columns stretch** rather than each stopping where its content does,
 *     so the surplus falls inside the notes card where `align-content:start`
 *     keeps it quiet. `.cfgrid--ov` reached the same conclusion one tab over.
 * 3 · **Remove spans the foot of the grid** instead of being the third card in
 *     the record column. A danger zone is what you find at the END of a screen,
 *     not a peer of the phone number above it — and it was costing the record
 *     column 161px that the wall then had to match.
 *
 * ── THREE THINGS THAT ARE DECISIONS, NOT LAYOUT ─────────────────────────────
 *
 * **The composer is an invitation, in the wall, where the note will land.** It
 * was an always-open textarea, then a *Create a new note* button in the card's
 * far corner. The first argument was that a note is eleven words typed
 * mid-session and a `+` that opens a modal is three interactions; the second
 * was that an always-open field reads as the screen's main input and pushes the
 * notes under the fold. Both are right about the other. A real button carrying
 * a real sentence, in the first cell of the wall, is one interaction and no
 * standing field — and ⌘/Ctrl+Enter still saves without reaching for the mouse.
 *
 * **Pinning is offered at write time, not only after.** The note a trainer most
 * wants in the strip is usually the one they are typing — a constraint they
 * just learned. Making them save it and then find it to pin it is the flow that
 * ends with nothing pinned.
 *
 * **Private is stated per note, by the control that decides it.**
 * `GET /v1/clients/{id}/notes` narrows by the author, so a teammate holding the
 * same client sees an empty list rather than these words — that is real, and a
 * trainer will only write the honest version of a note if they believe it.
 *
 * ── AND WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────
 *
 * No categories, no tags, no "type of note", and above all no health fields. The
 * interaction map excludes health data outright under the DPDP Act 2023, and a
 * category that tells a medical note apart from any other note would make this a
 * health record whatever the category was called. Free text, and the product does
 * not read it. `PinnedStrip.tsx` carries the full argument.
 *
 * The same rule governs the contact card: it draws the two columns the client
 * record has and not one box more. `ContactCard` below carries that argument.
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
  const toast = useToast();

  if (editing)
    return (
      <NoteCard
        editing
        /* The card keeps its own identity while it is being written in. It
           dropped both flags on the first pass, so opening an edit on a pinned
           note turned an amber card flat and took the word *Pinned* off it — a
           mode change that reads as a state change. `.ncard--edit` overrides the
           ground and nothing else. */
        pinned={note.pinned}
        meta={longDateStr(stamp)}
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !draft.trim()}
              onClick={() =>
                onBusy(async () => {
                  await saveNote(clientId, note.id, draft);
                  setEditing(false);
                })
              }
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(note.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        }
      >
        {/* The SAME field the note was written in. A box that edits with
            markers and a box that edits without them would let a trainer strip
            the formatting off a note by opening it — and `Markup` below is what
            prints it, so the two have to be the same pair everywhere this text
            appears. */}
        <MarkupField
          value={draft}
          onChange={setDraft}
          onCommit={() =>
            onBusy(async () => {
              await saveNote(clientId, note.id, draft);
              setEditing(false);
            })
          }
          label="Edit this note"
        />
      </NoteCard>
    );

  return (
    <NoteCard
      pinned={note.pinned}
      meta={
        <>
          {longDateStr(stamp)}
          {edited && ' · edited'}
        </>
      }
      actions={
        <>
          {/* `Button` and not a hand-rolled `.btn btn--ghost btn--sm btn--icon`,
              which is what this was: the icon-only branch makes `label` required
              at the type level, so the name this control needs cannot be
              forgotten, and `aria-pressed` rides through with the rest.

              `Tack` and not `Pin`. `Pin` is a MAP pin — a teardrop with a hole
              in it, drawn for Today's *where is this* chip — and at 14px beside
              a note it reads as a location marker and nothing else. The colour
              is `.ncard__a .btn[aria-pressed="true"]` in the sheet, not a style
              attribute: trap 2, and a colour in a style attribute is one no
              theme can reach. */}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            label={note.pinned ? 'Unpin from the strip' : 'Pin to the strip'}
            icon={<Tack size={14} filled={note.pinned} />}
            disabled={busy}
            aria-pressed={note.pinned}
            onClick={() =>
              onBusy(async () => {
                await setNotePinned(clientId, note.id, !note.pinned);
              })
            }
          />
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(true)}>
            Edit
          </Button>
          {/* Confirm in place rather than a dialog. A note is one or two
              sentences somebody typed; losing it to a mis-tap should cost a
              second click, and a modal for eleven words is heavier than the
              thing it is protecting. */}
          {confirming ? (
            <>
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() =>
                  onBusy(async () => {
                    const result = await deleteNote(clientId, note.id);
                    if (!result.ok) return;
                    /* Deleting is soft, and Undo is `…/restore` — one toast,
                       one choice, the few seconds a mis-tap is noticed in. */
                    toast.show({
                      variant: 'receipt',
                      title: 'Note deleted',
                      action: { label: 'Undo', onClick: () => void undeleteNote(clientId, note.id) },
                    });
                  })
                }
              >
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              label="Delete this note"
              disabled={busy}
              title="Delete this note"
              onClick={() => setConfirming(true)}
              icon={<TrashIcon size={14} />}
            />
          )}
        </>
      }
    >
      {/* `Markup` and never the bare string: the field writes markers, and
          anything that prints the raw value shows `**landmine press**`. */}
      <Markup value={note.body} />
    </NoteCard>
  );
}

/* ────────────────────────────────────────────── contact information ── */

/**
 * WHAT THE RECORD ACTUALLY HOLDS, and nothing beside it.
 *
 * `ClientDetailWire` carries a `name` and a `phone` for this card — and no
 * e-mail, and no split name. (It gained `heightCm` and `dateOfBirth` on 15 Sep
 * 2026, which `PhysicalCard` owns; those changed nothing here.) The
 * reference design for this card draws *First name*, *Last name* and *E-mail*,
 * and all three were left
 * off on purpose rather than drawn as inputs that save nowhere: splitting a
 * stored `name` into two boxes invents a surname for everybody filed under one
 * word, and an e-mail box on a record with no e-mail column is a field a trainer
 * types into once and never sees again. `BACKEND_GAPS.md` carries the ask.
 *
 * ── AND THE NUMBER IS NOT A CONTACT DETAIL ──────────────────────────────────
 *
 * It is the credential. `POST /v1/auth/request-otp` matches a client on the last
 * ten digits of this field, so changing it changes which phone can open the
 * portal — which is the whole reason the field is editable at all. A digit
 * mistyped on the add-a-client flow currently strands a client outside their own
 * account with no screen anywhere able to fix it. The hint says what the save
 * does; it does not ask for a confirmation, because the trainer correcting a
 * typo is the common case and a dialog would be in their way every time.
 */
function ContactCard({
  clientId,
  version,
  name,
  phone: e164,
}: {
  clientId: string;
  version: string;
  name: string;
  phone: string | null;
}) {
  /* E.164 on the wire; the box holds the ten digits the trainer types. */
  const phone = e164 ? e164.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '') : null;
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftPhone, setDraftPhone] = useState(phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /* ── FOLLOWING THE SERVER, DURING RENDER AND NOT IN AN EFFECT ─────────

     The server owns these two values and a save revalidates the layout, so when
     the round trip comes back with something other than what was typed —
     trimmed, or a number normalised out of its spaces — the boxes have to
     follow it rather than hold a draft that is no longer true.

     This is React's documented shape for that (`committed` is the last props
     seen; a change adjusts state during the render that noticed it) and NOT a
     `useEffect`, which is what it was first written as: an effect that calls
     `setState` renders the stale values once before correcting them, and
     `react-hooks/set-state-in-effect` refuses it for that reason. */
  /* ── THE CARET, CARRIED ACROSS THE SWAP ───────────────────────────────

     MEASURED before this existed: `document.activeElement` came back `BODY`
     after every press of *Edit*, on both record cards, because the button the
     trainer had just pressed no longer existed — React unmounts it with the
     readout it sits in. A keyboard or screen-reader user was dropped at the top
     of the document with nothing announced and no way to tell that a form had
     opened at all.

     Opening puts the caret in the first field, which is where the press was
     aiming anyway. Closing puts it back on the *Edit* button — found by id,
     because a ref to an element React has unmounted is a ref to nothing, and
     `react-hooks/refs` refuses one handed across a boundary in any case
     (trap 22 answers it the same way: find the trigger by selector). */
  const editId = `cfrec-edit-contact-${clientId}`;
  function open() {
    setEditing(true);
  }
  function close() {
    setEditing(false);
    /* After the state change, not before: the button does not exist until this
       render commits. React 19 flushes a discrete event's updates before the
       next paint, so the node is there by the time this microtask runs. */
    queueMicrotask(() => document.getElementById(editId)?.focus());
  }

  const [committed, setCommitted] = useState({ name, phone: phone ?? '' });
  if (committed.name !== name || committed.phone !== (phone ?? '')) {
    setCommitted({ name, phone: phone ?? '' });
    setDraftName(name);
    setDraftPhone(phone ?? '');
  }

  const dirty = draftName !== name || draftPhone !== (phone ?? '');

  function submit() {
    if (!dirty || pending) return;
    setError(null);
    start(async () => {
      const result = await saveContact(clientId, version, draftName, draftPhone);
      /* A save that came back is a save that is done: the editor closes and the
         readout underneath it is now the new values, which says *saved* more
         plainly than a line of green text under a form would. */
      if (result.ok) close();
      else setError(result.message ?? 'It did not save.');
    });
  }

  function cancel() {
    setDraftName(name);
    setDraftPhone(phone ?? '');
    setError(null);
    close();
  }

  /* ── READ FIRST, AND THE BOXES ONLY WHEN ASKED FOR ───────────────────

     Two fields that get corrected once a year were drawn as two permanently
     open inputs with a live *Save changes* under them — a form, at the top of
     the tab, for data nobody came here to change. It reads as the screen's
     main task and it is the screen's rarest one. Same shape as
     `PhysicalCard` beside it now: the facts, an *Edit* in the header, and the
     inputs with *Save changes* and *Cancel* at the foot of them. */
  if (editing) {
    return (
      <Card as="section" title="Contact information" className="cfrec--cont">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            label="Full name"
            value={draftName}
            /* The caret, where the press was aiming. `TextField` spreads the
               input's own props, so this is the platform's `autoFocus` and not
               a ref reaching into a component that does not expose one. */
            autoFocus
            autoComplete="off"
            maxLength={120}
            disabled={pending}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <TextField
            label="Mobile number"
            hint="Ten digits, no country code. This is the number they sign in with."
            value={draftPhone}
            inputMode="numeric"
            autoComplete="off"
            numeric
            disabled={pending}
            style={{ marginTop: 12 }}
            onChange={(e) => setDraftPhone(e.target.value)}
          />

          <div className="cffm">
            <Button type="submit" variant="primary" disabled={pending || !dirty}>
              Save changes
            </Button>
            <Button variant="ghost" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
          </div>

          {error && (
            <Message tone="err" alert style={{ marginTop: 11 }}>
              {error}
            </Message>
          )}
        </form>
      </Card>
    );
  }

  return (
    <Card
      as="section"
      title="Contact information"
      className="cfrec--cont"
      actions={
        <Button id={editId} variant="secondary" size="sm" onClick={open}>
          Edit
        </Button>
      }
      flush
    >
      <FactList>
        <FactList.Row k="Full name">{name}</FactList.Row>
        {/* `formatPhone`, and not the stored string. The file's own header three
            inches up the page draws `+91 98416 54932` and this row drew
            `9841654932` — the same credential in two spellings on one screen,
            which is a trainer checking a digit against a number that does not
            look like the one they are checking. The header's local
            `prettyPhone` was the wrong copy to reach for: `lib/auth/policy.ts`
            owns the grouping because it owns the ten digits the OTP matches
            on. */}
        <FactList.Row k="Mobile number">
          {phone ? formatPhone(phone) : <FactList.Blank />}
        </FactList.Row>
      </FactList>
    </Card>
  );
}

/* ───────────────────────────────────────────── physical information ── */

/**
 * PHYSICAL INFORMATION — three facts, and no arithmetic.
 *
 * ── THE TWO METABOLISM ROWS WERE BUILT AND THEN CUT ─────────────────────────
 *
 * *Resting* and *Active* were here — Mifflin-St Jeor off height, weight, age and
 * sex, times an activity factor read from the client's agreed rhythm — and were
 * dropped on 15 Sep 2026. Worth recording because the deletion took a column
 * with it: **`sex` was stored for exactly one reason**, the constant that
 * differs between the formula's two forms, and with the formula gone it had no
 * reader at all. A sex field on a training app that nothing reads is not a
 * harmless leftover; it is personal data held for no stated purpose, which is
 * the thing the rest of this file is careful about. So it went.
 *
 * `dateOfBirth` stayed, because *Birth day* is a row on the card in its own
 * right rather than an input to something else.
 *
 * ── WEIGHT IS READ, NOT EDITED ──────────────────────────────────────────────
 *
 * It is the latest weight reading — taken in an assessment — and charted
 * against the ones before it on the Progress tab. Editing it here would write a
 * fourth way to change a number that already has a home, and the two would
 * disagree the moment somebody used the other one. The row links there instead
 * — and the link SAYS so now: `.facts__lk` carries a dotted underline at rest,
 * because on a card of five rows that all look identical the one that navigates
 * cannot wait for the pointer to arrive before it admits it.
 */
function PhysicalCard({
  clientId,
  client,
  weightKg,
  weightAt,
  now,
}: {
  clientId: string;
  client: ClientDetailWire;
  weightKg: number | null;
  weightAt: number | null;
  now: number;
}) {
  const [editing, setEditing] = useState(false);
  const [height, setHeight] = useState(client.heightCm == null ? '' : String(client.heightCm));
  const [dob, setDob] = useState(client.dateOfBirth ?? '');
  const [activity, setActivity] = useState(client.activityLevel ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /* Adjusted during render rather than in an effect, for the reason spelt out
     on `ContactCard` — and here it also closes the editor, because a save that
     came back is a save that is done. */
  /* The caret, carried across the swap — `ContactCard`'s note above carries
     the measurement and the argument. */
  const editId = `cfrec-edit-physical-${clientId}`;
  function open() {
    setEditing(true);
  }
  function close() {
    setEditing(false);
    queueMicrotask(() => document.getElementById(editId)?.focus());
  }

  const [committed, setCommitted] = useState({
    h: client.heightCm,
    d: client.dateOfBirth,
    a: client.activityLevel,
  });
  if (committed.h !== client.heightCm || committed.d !== client.dateOfBirth || committed.a !== client.activityLevel) {
    setCommitted({ h: client.heightCm, d: client.dateOfBirth, a: client.activityLevel });
    setHeight(client.heightCm == null ? '' : String(client.heightCm));
    setDob(client.dateOfBirth ?? '');
    setActivity(client.activityLevel ?? '');
  }

  const age = ageFrom(client.dateOfBirth ?? null, now);

  function submit() {
    if (pending) return;
    setError(null);
    start(async () => {
      const result = await savePhysical(clientId, client.version, {
        heightCm: height, dateOfBirth: dob, activityLevel: activity,
      });
      if (result.ok) close();
      else setError(result.message ?? 'It did not save.');
    });
  }

  /* Cancel puts the boxes back before it closes them. Without the reset, an
     abandoned edit is still sitting there the next time *Edit* is pressed. */
  function cancel() {
    setHeight(client.heightCm == null ? '' : String(client.heightCm));
    setDob(client.dateOfBirth ?? '');
    setActivity(client.activityLevel ?? '');
    setError(null);
    close();
  }

  if (editing) {
    return (
      <Card as="section" title="Physical information" className="cfrec--phys">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            label="Height"
            hint="In centimetres. Leave it empty if you have not measured."
            value={height}
            autoFocus
            inputMode="decimal"
            numeric
            autoComplete="off"
            disabled={pending}
            onChange={(e) => setHeight(e.target.value)}
          />
          <TextField
            label="Birth day"
            type="date"
            value={dob}
            disabled={pending}
            style={{ marginTop: 12 }}
            onChange={(e) => setDob(e.target.value)}
          />
          <Select
            label="Activity level"
            value={activity}
            disabled={pending}
            style={{ marginTop: 12 }}
            options={[{ value: '', label: 'Not set' }, ...ACTIVITY]}
            onChange={(e) => setActivity(e.target.value)}
          />
          <div className="cffm">
            <Button type="submit" variant="primary" disabled={pending}>
              Save changes
            </Button>
            <Button variant="ghost" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
          </div>

          {error && (
            <Message tone="err" alert style={{ marginTop: 11 }}>
              {error}
            </Message>
          )}
        </form>
      </Card>
    );
  }

  return (
    <Card
      as="section"
      title="Physical information"
      className="cfrec--phys"
      actions={
        <Button id={editId} variant="secondary" size="sm" onClick={open}>
          Edit
        </Button>
      }
      flush
    >
      <FactList>
        <FactList.Row k="Height">
          {client.heightCm == null ? <FactList.Blank /> : `${client.heightCm} cm`}
        </FactList.Row>

        <FactList.Row
          k="Weight"
          /* The date is the point of the link, not decoration: a figure read off
             a measurement from March is a figure about March. */
          note={weightKg !== null && weightAt !== null ? shortDate(weightAt) : undefined}
        >
          {weightKg == null ? (
            <FactList.Blank />
          ) : (
            <Link className="facts__lk" href={`/clients/${clientId}/progress`}>
              {weightKg} kg
            </Link>
          )}
        </FactList.Row>

        <FactList.Row
          k="Birth day"
          note={client.dateOfBirth != null && age !== null ? `${age} years old` : undefined}
        >
          {client.dateOfBirth == null ? <FactList.Blank /> : birthDateStr(client.dateOfBirth)}
        </FactList.Row>

        <FactList.Row k="Activity level">
          {client.activityLevel == null
            ? <FactList.Blank />
            : ACTIVITY.find((o) => o.value === client.activityLevel)?.label ?? client.activityLevel}
        </FactList.Row>
      </FactList>
    </Card>
  );
}

/* ──────────────────────────────────────────────── removing a client ── */

const ACTIVITY = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];

/**
 * ARCHIVE, NOT DELETE — and the copy finally says so. The card read *removing
 * this client is permanent* over a button that archived; now the button is the
 * v1 verb (Clients A3) and the sentence is what it does: off the roster, future
 * sessions cancelled, nothing deleted, so Unarchive is a real way back.
 *
 * It asks why, from the roster's own six `client_archive_reason`s, because the
 * reason is what the Archived list reads back later. The confirm stays in place,
 * two presses, no dialog: the file is already open on this one person.
 */
function ArchiveCard({ client }: { client: ClientDetailWire }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState<ArchiveReason>('goal_reached');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const first = client.name.split(' ')[0];

  function write(fn: () => ReturnType<typeof archiveClient>, then?: () => void) {
    setError(null);
    start(async () => {
      /* {client, effects} (R72): all-zero effects is "already done" in another
         tab, which is a success and not a refusal. */
      const result = await fn();
      if (result.ok) then?.();
      else setError(result.message ?? 'That did not save. Nothing changed.');
    });
  }

  if (client.status === 'archived') {
    return (
      <Card as="section" title={`${first} is archived`} className="cfdz">
        <div className="cfdz__r">
          <p className="small">Unarchive to put them back on the roster. Their kept week is booked again.</p>
          <div className="cfdz__a">
            <Button variant="secondary" disabled={pending} onClick={() => write(() => unarchiveClient(client.id))}>
              {pending ? 'Bringing back…' : 'Unarchive'}
            </Button>
          </div>
        </div>
        {error && (
          <Message tone="err" alert style={{ marginTop: 11 }}>
            {error}
          </Message>
        )}
      </Card>
    );
  }

  return (
    <Card as="section" tone="danger" title={`Archive ${first}`} className="cfdz">
      <div className="cfdz__r">
        <p className="small">
          {first} comes off the roster and their future sessions are cancelled. Nothing is deleted.
        </p>
        <div className="cfdz__a">
          {confirming ? (
            <>
              <Select
                label="Why"
                hideLabel
                value={reason}
                disabled={pending}
                options={ARCHIVE_REASONS.map(([value, label]) => ({ value, label }))}
                onChange={(e) => setReason(e.target.value as ArchiveReason)}
              />
              <TextField
                label="Note"
                hideLabel
                placeholder="Note (optional)"
                value={note}
                maxLength={200}
                disabled={pending}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button
                variant="danger"
                disabled={pending}
                /* To the roster: the file of somebody just taken off it is a
                   screen where the button gets pressed twice. */
                onClick={() => write(() => archiveClient(client.id, reason, note), () => router.push('/clients'))}
              >
                {pending ? 'Archiving…' : `Archive ${first}`}
              </Button>
              {/* Dead while the write is away: it cannot be recalled. */}
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                Keep them
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Archive
            </Button>
          )}
        </div>
      </div>
      {error && (
        <Message tone="err" alert style={{ marginTop: 11 }}>
          {error}
        </Message>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────────── what to write down ── */

/**
 * THE FOUR QUESTIONS, AND THE ONE THAT WAS WRITTEN AND THEN CUT.
 *
 * They are `EmptyState`'s own sentence, made pressable. That copy — *how they
 * like to train, what their week looks like, what to ask about next time* —
 * was already the right answer to *what goes in here*, and a reader could do
 * nothing with it but read it.
 *
 * ── THE FOURTH ONE WAS *WHAT HAVE THEY TOLD YOU THEY CANNOT DO* ─────────────
 *
 * Which is a prompt for an injury, asked by the product, on a screen whose own
 * docstring says the interaction map excludes health data outright under the
 * DPDP Act 2023. The standing rule is that a note is free text and the product
 * does not read it — a trainer who writes about a shoulder has written a
 * sentence, and the product asking them to is the product collecting it. So
 * the slot went to the thing this tab's opening example is actually about:
 * *wife Priya, getting married in Nov*.
 *
 * **Nothing here may ever ask for a condition, a medication or an injury.** A
 * prompt is the one part of a free-text field where the product speaks.
 */
function promptsFor(first: string): string[] {
  return [
    `How does ${first} like to train?`,
    'What does their week actually look like?',
    'What should you ask about next time?',
    'What is changing outside the gym?',
  ];
}

/* ──────────────────────────────────────────────────────────── the tab ── */

/**
 * PERSONAL INFORMATION — who they are on the left, what you know about them on
 * the right, and the way to take them off the roster across the foot.
 *
 * The tab was *Notes* and held notes alone; the contact fields lived nowhere at
 * all, which meant a name or a number typed wrong when the client was added
 * stayed wrong forever. Folding the two together puts the record and the
 * relationship on one screen, and the split is deliberate: the left column is
 * short, fixed and rarely touched, the right one is long, growing, and the
 * reason the tab gets opened. So the right column gets the width.
 */
export function PersonalTab({
  client,
  weightKg,
  weightAt,
  now,
  notes,
}: {
  /** The header row: the physical card's fields, the contact card's name and number, and the If-Match `version`. */
  client: ClientDetailWire;
  /** The latest assessment weight reading, already picked out by the file. */
  weightKg: number | null;
  weightAt: number | null;
  now: number;
  notes: ClientNoteWire[];
}) {
  const [composing, setComposing] = useState(false);
  /* The question a prompt asked, as the composer's placeholder and nothing
     else. Seeding the DRAFT was the other option and it is worse twice over: it
     is text the trainer has to delete before they can write, and it puts the
     product's words inside a note the product has promised not to read. */
  const [asked, setAsked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pinNew, setPinNew] = useState(false);
  /* Minted when the composer opens and kept until the save lands, so a retry
     answers the note the first attempt made instead of writing two. */
  const [noteId, setNoteId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { id: clientId, name: clientName, phone: clientPhone } = client;
  const first = clientName.split(' ')[0];

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

  /* No `ref` and no manual focus call. `MarkupField` owns its own
     `contentEditable` node and moving the caret into it from outside is how a
     browser ends up with a selection the toolbar's `selectionchange` listener
     cannot read — the box is mounted by the open and takes the click that
     follows, which is the one interaction this button was there to save. */
  function openComposer(prompt?: string) {
    setError(null);
    setAsked(prompt ?? null);
    setComposing(true);
  }

  function closeComposer() {
    setComposing(false);
    setAsked(null);
    setDraft('');
    setPinNew(false);
    setError(null);
  }

  function submit() {
    if (!draft.trim() || pending) return;
    setError(null);
    start(async () => {
      const result = await addNote(clientId, noteId, draft, pinNew);
      if (result.ok) {
        setNoteId(crypto.randomUUID());
        setDraft('');
        setPinNew(false);
        setComposing(false);
        setAsked(null);
      } else {
        setError(result.message ?? 'It did not save.');
      }
    });
  }

  return (
    <div className="cfgrid--pi">
      {/* The record, in the order a trainer reads a person: what their body is,
          then how to reach them. The third card used to be *Remove* and is now
          across the foot of the grid — a destructive control at the end of a
          column is one the eye lands on while looking for something else. */}
      <div className="cfgrid__col">
        <PhysicalCard
          clientId={clientId}
          client={client}
          weightKg={weightKg}
          weightAt={weightAt}
          now={now}
        />
        <ContactCard clientId={clientId} version={client.version} name={clientName} phone={clientPhone} />
      </div>

      <Card
        as="section"
        title="Notes"
        /* A count, not a filter: a trainer with three notes does not need a
           segment to find one. */
        aside={
          notes.length > 0 ? (
            <span className="small ink3">
              {notes.length === 1 ? '1 note' : `${notes.length} notes`}
            </span>
          ) : null
        }
        flush
        className={pending && !composing ? 'cfnotes cfnotes--busy' : 'cfnotes'}
      >
        <div className="cfnw">
          {/* ── THE INVITATION IS AN ORDINARY CELL, AND THAT IS WHAT CLOSES
                 THE HOLE BESIDE A SINGLE NOTE ─────────────────────────────

              MEASURED on `cli_008` — one note, which is what eleven of the
              twenty-four seeded clients have: the wall left an empty 418×128
              track beside it. Spanning was right while this was a composer at
              the top of a list and wrong once it became a tile in a wall,
              because a wall closes a row by having another thing to put in it.
              One note plus the invitation is now exactly one full row.

              It still spans in the two cases where it is the only thing in the
              wall that matters — open, and on a client with no notes at all. */}
          <div className={`cfnw__new${composing || ordered.length === 0 ? ' cfnw__new--wide' : ''}`}>
            {composing ? (
              <>
                {/* ── B / I / U / H AND AN EMOJI, THE WORKOUT DIALOG'S OWN FIELD ──

                    `MarkupField` is the component the *Edit comment* dialog on a
                    set composes, and this reaches for the same one rather than
                    drawing a second toolbar over a second format. The pairing is
                    the rule stated on `Markup`: a field edited with markers MUST
                    be printed with `Markup` everywhere it is printed, which here
                    is the card below.

                    Ctrl/⌘+Enter still saves; `onCommit` is the component's name
                    for it, because Enter is a new line in a box that takes more
                    than one. Escape is not bound here: the box is a
                    `contentEditable` and the key does not reach this element
                    from inside it. Cancel is the way out, and it is beside Add
                    note where it can be seen. */}
                <MarkupField
                  value={draft}
                  onChange={setDraft}
                  onCommit={submit}
                  placeholder={asked ?? `Something worth remembering about ${first}…`}
                  label={`A note about ${clientName}`}
                />
                <div className="cfnw__acts">
                  <Button variant="primary" disabled={pending || !draft.trim()} onClick={submit}>
                    Add note
                  </Button>
                  <Button variant="ghost" disabled={pending} onClick={closeComposer}>
                    Cancel
                  </Button>
                  <div className="cfnw__opts">
                    {/* Pinning is offered at write time, not only after. The
                        note a trainer most wants in the strip is usually the one
                        they are typing — a constraint they just learned. Making
                        them save it and then find it to pin it is the flow that
                        ends with nothing pinned. */}
                    <Checkbox
                      label="Keep this one in front of me"
                      checked={pinNew}
                      onChange={(e) => setPinNew(e.target.checked)}
                    />
                  </div>
                  {/* Written out rather than as ⌘↵. FOUND BY RENDERING: the two
                      glyphs fall outside the mono face and came back as tofu,
                      which is a hint that has to be decoded rather than read.
                      ink-3, not ink-off: a shortcut nobody can read is a
                      shortcut nobody has. `--tx-ink-off` measured 3.1:1 against
                      this surface. */}
                  <span className="small mono cfnw__key">CTRL + ENTER</span>
                </div>
                {error && (
                  <Message tone="err" alert style={{ marginTop: 9 }}>
                    {error}
                  </Message>
                )}
              </>
            ) : (
              /* A real `<button>` with a real sentence in it, not a field that
                 does nothing until it is clicked. It sits in the first cell of
                 the wall because that is where the note it makes will land. */
              <button type="button" className="cfnw__add" onClick={() => openComposer()}>
                <Plus size={16} />
                Write something worth remembering about {first}…
              </button>
            )}
          </div>

          {ordered.length === 0 ? (
            <EmptyState
              kind="first-run"
              icon={<Note size={22} />}
              title="Nothing written down yet"
              body={`The things that never fit in a field — how ${first} likes to train, what their week looks like, what to ask about next time. Only you can read a note.`}
            />
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

        {/* ── AND THE BAND THAT TAKES THE CARD'S FLOOR ──────────────────────

            The other half of the same measurement: under the wall, `cli_008`
            left 824×145 of card, which no number of tracks reaches because it
            is not a cell — it is what the stretch to the record column's height
            bought and the wall did not spend. `.cfhint` takes `flex:1` of it.

            Drawn at one to three notes, and the threshold is about TEACHING
            rather than geometry: a trainer with four notes has shown what they
            think the field is for, and a standing block of hints on every
            client for the life of the account is the chrome the tile above it
            was moved out of the header to avoid. At four notes the wall is
            three rows and there is no floor left to take anyway.

            Not drawn on an empty client either — `EmptyState` is there, saying
            the same thing in the same words, and the two under one another is
            the screen asking twice. */}
        {ordered.length > 0 && ordered.length < 4 && (
          <PromptList
            className="cfhint"
            kicker="Worth writing down"
            prompts={promptsFor(first)}
            onPick={openComposer}
          />
        )}
      </Card>

      <ArchiveCard client={client} />
    </div>
  );
}

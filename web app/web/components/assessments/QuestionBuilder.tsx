'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

import {
  KIND_LABEL,
  KIND_ORDER,
  SCALES,
  blankQuestion,
  forKind,
  moved,
  optionLetter,
  type AnswerKind,
  type QuestionWire,
} from '@/lib/assessments/vocab';
import { Bin, Plus } from '@/components/clients/assessments/Icons';
import { Button } from '@/web-components/ui/Button';
import { TextField } from '@/web-components/ui/Field';
import { ListRow } from '@/web-components/ui/ListRow';
import { OrderRow, OrderRows } from '@/web-components/ui/OrderRow';
import { RowMenu, type RowMenuItem } from '@/web-components/ui/RowMenu';
import { Segment, SegmentButton } from '@/web-components/ui/Segment';
import { Select } from '@/web-components/ui/Select';
import { Switch } from '@/web-components/ui/Switch';

/*
 * EXTRACTED 22 Nov 2026 from `components/clients/assessments/TemplateEditor.tsx`, unchanged except for three optional
 * props, so the join link's questions (Clients → Join link) are written with the SAME builder an assessment's are: one
 * component, two callers, never a second copy of the family (AGENTS.md, *Extend rather than copy*). `QuestionBody` is
 * exported because the template editor's phone screens draw it on their own.
 */

/**
 * THE ASKED LIST, THEN THE BANK — the picker's arrangement, for its reason.
 *
 * What differs is that a question is EDITED here and a measurement is not: a
 * tape has one right way to be taken and a question has a wording, an answer
 * type and, for a multiple choice, the options themselves.
 *
 * ── TWO VERBS, AND THEY ARE DIFFERENT JOBS ──────────────────────────────────
 *
 * *Write a question* authors a new one. *Edit questions* opens every question
 * already asked, as a card with its wording, its answer type and whatever that
 * type needs. They are not two doors onto one thing: one adds a row, the other
 * changes the eleven that are there, and a trainer doing the second is going
 * through the list rather than fixing one line.
 *
 * ── AND THERE IS ONE EDITING SURFACE, REACHED TWO WAYS ──────────────────────
 *
 * This used to open a private card under whichever row was clicked, which made
 * the row's prompt a second door onto the same job at a different scale —
 * `/clients`' own *sort and filter were two doors to one job* defect, in a
 * dialog. Now the row menu's *Edit this question* turns the MODE on and puts
 * the caret in that question's field: same screen, same card, one place where
 * wording is changed. The compact rows are for ARRANGING — grip, ordinal,
 * remove — which is the job a card is bad at, because eleven open cards is
 * 2,000px of scroller and nothing to drag against.
 */
export function QuestionBuilder({
  items,
  bank = [],
  onChange,
  required,
  max,
  listLabel = 'Questions this assessment asks',
}: {
  items: QuestionWire[];
  /** Suggested questions to add from. Empty draws no "All questions" list and no "Add them all". */
  bank?: QuestionWire[];
  onChange: (next: QuestionWire[]) => void;
  /**
   * A Required switch on each open card, for a form where an answer can be demanded (the join page). Absent, there is no
   * switch: an assessment has no required questions, and its editor is unchanged.
   */
  required?: { of: (id: string) => boolean; set: (id: string, on: boolean) => void };
  /** A cap on how many may be asked; "Write a question" goes grey at it. */
  max?: number;
  /** What the list is, read aloud before it. */
  listLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState<number | null>(null);
  const [carrying, setCarrying] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const patch = (id: string, next: Partial<QuestionWire>) =>
    onChange(items.map((q) => (q.id === id ? { ...q, ...next } : q)));

  /**
   * Open the cards and put the caret in one of them. Both doors call this.
   *
   * FOUND BY ID IN A MICROTASK, which is `PersonalTab`'s pattern twice over and
   * not a convenience. A ref handed across a component boundary is refused by
   * `react-hooks/refs` (trap 22), and a `useEffect` that clears its own trigger
   * is refused by `react-hooks/set-state-in-effect` — so there is no state to
   * hold the intention in. React flushes a discrete event synchronously, so by
   * the time this microtask runs the card is mounted and its field has an id.
   */
  const edit = (id: string) => {
    setEditing(true);
    queueMicrotask(() => document.getElementById(`asm-q-${id}`)?.focus());
  };

  /** The verbs a question carries in both modes. */
  const menuFor = (q: QuestionWire, i: number): RowMenuItem[] => [
    { key: 'edit', label: 'Edit this question', onSelect: () => edit(q.id) },
    { key: 'up', label: 'Move up', disabled: i === 0, onSelect: () => onChange(moved(items, i, i - 1)) },
    { key: 'down', label: 'Move down', disabled: i === items.length - 1, onSelect: () => onChange(moved(items, i, i + 1)) },
    { separator: true, key: 'sep' },
    { key: 'rm', label: 'Do not ask this', danger: true, onSelect: () => onChange(items.filter((x) => x.id !== q.id)) },
  ];

  const bin = (q: QuestionWire) => (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      label={`Do not ask: ${q.text || 'this question'}`}
      icon={<Bin />}
      onClick={() => onChange(items.filter((x) => x.id !== q.id))}
    />
  );

  return (
    <div className="asm-pick">
      <div className="asm-pick__hd">
        {(items.length > 0 || bank.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(items.length > 0 ? [] : bank)}
          >
            {items.length > 0 ? 'Remove all' : 'Add them all'}
          </Button>
        )}
        <span className="asm-pick__n">{max ? `${items.length} of ${max}` : `${items.length} asked`}</span>
      </div>

      {items.length === 0 ? (
        <p className="small" style={{ margin: 0 }}>
          {bank.length > 0 ? 'Nothing is asked yet. Add one from the list below, or write your own.' : 'Nothing is asked yet. Write your own below.'}
        </p>
      ) : editing ? (
        /* ── EDITING: every question is a card ─────────────────────────────
           No grip and no drag here. A card is 120–300px tall, so the two rows
           a drag has to reach are rarely on screen together — and *Move up* /
           *Move down* in the head's own menu is the path SC 2.5.7 wanted
           anyway. Arranging is what the compact list is for. */
        <div role="list" aria-label={listLabel}>
          {items.map((q, i) => (
            <QuestionCard
              key={q.id}
              q={q}
              ordinal={i + 1}
              menu={<RowMenu label={`question ${i + 1}`} items={menuFor(q, i)} />}
              remove={bin(q)}
              onPatch={(next) => patch(q.id, next)}
              required={required ? { on: required.of(q.id), set: (on) => required.set(q.id, on) } : undefined}
            />
          ))}
        </div>
      ) : (
        <OrderRows label={listLabel}>
          {items.map((q, i) => (
            <OrderRow
              key={q.id}
              ordinal={i + 1}
              gripLabel={`Reorder question ${i + 1}`}
              armed={armed === i}
              lifted={carrying === i}
              onto={over === i && carrying !== i}
              onGripDown={() => setArmed(i)}
              onGripUp={() => setArmed(null)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
                setCarrying(i);
              }}
              onDragEnd={() => { setCarrying(null); setOver(null); setArmed(null); }}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDragLeave={() => setOver((v) => (v === i ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData('text/plain'));
                if (Number.isFinite(from)) onChange(moved(items, from, i));
                setCarrying(null);
                setOver(null);
              }}
              actions={
                <>
                  <RowMenu label={`question ${i + 1}`} items={menuFor(q, i)} />
                  {bin(q)}
                </>
              }
            >
              {/* The prompt is the control that opens the editor — a row whose
                  text is the thing being edited should not need a second button
                  beside it saying so. It opens the same cards *Edit questions*
                  does, on this one. */}
              <button
                type="button"
                className="asm-open"
                onClick={() => edit(q.id)}
              >
                {q.text || <i style={{ color: 'var(--tx-ink-3)' }}>Untitled question</i>}
                <span className="asm-open__k">{KIND_LABEL[q.kind]}</span>
              </button>
            </OrderRow>
          ))}
        </OrderRows>
      )}

      {/* ── THE TWO VERBS ────────────────────────────────────────────────────
          *Write* is the primary of the pair and leads, because it is the one
          that produces something. *Edit questions* is drawn at zero questions
          too, greyed rather than dropped: a control that appears and disappears
          as a list fills is a control a trainer has to find twice — the roster
          strip's own rule about its six tiles. */}
      <div className="asm-pick__acts">
        <Button
          variant="secondary"
          size="sm"
          disabled={max !== undefined && items.length >= max}
          onClick={() => {
            const q = blankQuestion(`q_new_${Date.now().toString(36)}`, 'yesno');
            onChange([...items, q]);
            edit(q.id);
          }}
        >
          <Plus size={14} />
          Write a question
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={items.length === 0}
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Done editing' : 'Edit questions'}
        </Button>
      </div>

      {bank.length > 0 && (
        <>
          <p className="asm-rule">All questions</p>
          <ul className="asm-grp__l">
            {bank.map((q) => (
              <li key={q.id}>
                <button type="button" className="asm-add" onClick={() => onChange([...items, q])}>
                  <span className="asm-add__p" aria-hidden="true"><Plus size={15} /></span>
                  {q.text}
                  <span className="asm-add__u">{KIND_LABEL[q.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * ONE QUESTION, OPEN — the prompt, the answer type, and what that type needs.
 *
 * ── FOUR TYPES, AND THE DROPDOWN IS WHERE THE QUESTION IS DECIDED ───────────
 *
 * *Yes/No · Rating · Text · Multiple choice*. The list is closed and it is four
 * rather than six because those are the four CONTROLS a client can be shown;
 * `AssessmentAnswerKind` carries why *A number* and *Several answers* are not
 * among them. Changing it here redraws the body under the rule and keeps
 * whatever the other type was holding — see `forKind`.
 */
function QuestionCard({
  q,
  ordinal,
  menu,
  remove,
  onPatch,
  required,
}: {
  q: QuestionWire;
  ordinal: number;
  menu: ReactNode;
  remove: ReactNode;
  onPatch: (next: Partial<QuestionWire>) => void;
  /** The join page's Required switch; absent in an assessment. */
  required?: { on: boolean; set: (on: boolean) => void };
}) {
  return (
    <div className="asm-q" role="listitem">
      <div className="asm-q__hd">
        {/* The position, so a card can still be told from the one above it
            once the prompt is a field. `OrderRow`'s own reading of the same
            figure: it is where the row IS, never a control. */}
        <span className="orow__l" aria-hidden="true">{ordinal}</span>
        <TextField
          id={`asm-q-${q.id}`}
          className="asm-q__t"
          hideLabel
          label={`Question ${ordinal}`}
          value={q.text}
          placeholder="What do you want to ask?"
          onChange={(e) => onPatch({ text: e.target.value })}
        />
        <Select
          className="asm-q__k"
          hideLabel
          label={`Answer type for question ${ordinal}`}
          value={q.kind}
          onChange={(e) => onPatch(forKind(q, e.target.value as AnswerKind))}
          options={KIND_ORDER.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        />
        {menu}
        {remove}
      </div>

      <QuestionBody q={q} ordinal={ordinal} onPatch={onPatch} />
      {required && (
        <div className="asm-q__b asm-q__flags">
          <ListRow
            title="Required"
            sub="They can’t send the form without answering it."
            right={<Switch checked={required.on} label={`Question ${ordinal} is required`} onChange={required.set} />}
          />
        </div>
      )}
    </div>
  );
}

/**
 * WHAT AN ANSWER TYPE NEEDS — the scale, the options and their two switches, or
 * the sentence saying there is nothing to set. One copy, drawn by the desk's
 * `QuestionCard` under its header and by the phone's question screen under its
 * fields, so the two editors cannot offer a question two different sets of
 * controls.
 */
export function QuestionBody({
  q,
  ordinal,
  onPatch,
}: {
  q: QuestionWire;
  ordinal: number;
  onPatch: (next: Partial<QuestionWire>) => void;
}) {
  return (
    <>
      {q.kind === 'rating' && (
        <div className="asm-q__b asm-q__sc">
          <span className="small">Scale</span>
          {/* A SCALE IS ONLY COMPARABLE AGAINST ITSELF, so the three are a
              closed set and the control is a segmented one rather than a
              number field — see `AssessmentQuestionRow`. `single`, because a
              question has one scale. */}
          <Segment label={`Rating scale for question ${ordinal}`} mode="single">
            {SCALES.map((n) => (
              <SegmentButton
                key={n}
                mode="single"
                pressed={(q.scale ?? 10) === n}
                onClick={() => onPatch({ scale: n })}
              >
                out of {n}
              </SegmentButton>
            ))}
          </Segment>
        </div>
      )}

      {q.kind === 'choice' && (
        <>
          <div className="asm-q__b">
            <OrderRows label={`Answers to offer for question ${ordinal}`}>
              {q.options.map((o, i) => (
                <OrderRow
                  key={o.id}
                  field
                  grip={false}
                  ordinal={optionLetter(i)}
                  actions={
                    <RowMenu
                      label={`option ${optionLetter(i)}`}
                      items={[
                        { key: 'up', label: 'Move up', disabled: i === 0, onSelect: () => onPatch({ options: moved(q.options, i, i - 1) }) },
                        { key: 'down', label: 'Move down', disabled: i === q.options.length - 1, onSelect: () => onPatch({ options: moved(q.options, i, i + 1) }) },
                        { separator: true, key: 'sep' },
                        {
                          key: 'rm',
                          label: 'Remove this answer',
                          danger: true,
                          /* TWO IS THE FLOOR. A multiple choice with one option
                             is not a choice, and one with none is a question
                             nobody can answer — the same pair `blankQuestion`
                             creates and for the same reason. */
                          disabled: q.options.length <= 2,
                          onSelect: () => onPatch({ options: q.options.filter((x) => x.id !== o.id) }),
                        },
                      ]}
                    />
                  }
                >
                  {/* `hideLabel`, not a hand-written `<input className="ctl">`:
                      the letter beside it is what names this field on the row,
                      and the label is still rendered and still clipped rather
                      than dropped — trap 5. */}
                  <TextField
                    hideLabel
                    label={`Answer ${optionLetter(i)}`}
                    value={o.text}
                    placeholder={`Answer ${optionLetter(i)}`}
                    onChange={(e) =>
                      onPatch({
                        options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)),
                      })
                    }
                  />
                </OrderRow>
              ))}
            </OrderRows>
            <Button
              variant="ghost"
              size="sm"
              className="mt2"
              onClick={() =>
                onPatch({
                  options: [
                    ...q.options,
                    { id: `${q.id}_${q.options.length}_${Date.now().toString(36)}`, text: '' },
                  ],
                })
              }
            >
              <Plus size={14} />
              Add an answer
            </Button>
          </div>

          {/* ── THE TWO WAYS A CLOSED LIST OPENS ──────────────────────────────
              Both off by default, both the trainer's to turn on, and both under
              the options rather than beside the type — they are questions about
              the ANSWERS, and neither can be decided before those are written.

              `ListRow`'s unpressable form, which is a `<div>`: a title, a line
              saying what it does, and a control on the right. `.kv` is the
              obvious pair and is wrong here — it is `flex-wrap:nowrap` with an
              80px key, right for a key and a figure and wrong for a label, a
              sentence and a switch (trap 10). */}
          <div className="asm-q__b asm-q__flags">
            <ListRow
              title="They can write their own answer"
              sub="Adds an “Other” line under the options."
              right={
                <Switch
                  checked={q.allowCustom}
                  label={`Let the client write their own answer to question ${ordinal}`}
                  onChange={(on) => onPatch({ allowCustom: on })}
                />
              }
            />
            <ListRow
              title="Allow several answers"
              sub="More than one can be ticked."
              right={
                <Switch
                  checked={q.allowMultiple}
                  label={`Allow several answers to question ${ordinal}`}
                  onChange={(on) => onPatch({ allowMultiple: on })}
                />
              }
            />
          </div>
        </>
      )}

      {q.kind === 'yesno' && (
        <div className="asm-q__b">
          <p className="small" style={{ margin: 0 }}>
            Answered yes or no.
          </p>
        </div>
      )}

      {q.kind === 'text' && (
        <div className="asm-q__b">
          <p className="small" style={{ margin: 0 }}>
            Written in their own words. It is the one kind that cannot be put beside the same answer
            from eight weeks ago, so ask it where that is the point.
          </p>
        </div>
      )}
    </>
  );
}

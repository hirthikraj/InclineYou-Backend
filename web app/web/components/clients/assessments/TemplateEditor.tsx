'use client';

import { useMemo, useState, useTransition } from 'react';
import type { ReactNode } from 'react';

import {
  createTemplate,
  saveTemplate,
  type TemplateDraft,
} from '@/lib/assessments/actions';
import {
  KIND_LABEL,
  KIND_ORDER,
  SCALES,
  blankQuestion,
  forKind,
  moved,
  optionLetter,
  type AnswerKind,
  type CatalogWire,
  type QuestionWire,
  type TemplateWire,
} from '@/lib/assessments/vocab';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';
import { Fold } from '@/web-components/ui/Fold';
import { ListRow } from '@/web-components/ui/ListRow';
import { MarkupField } from '@/web-components/ui/MarkupField';
import { Message } from '@/web-components/ui/Message';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { OrderRow, OrderRows } from '@/web-components/ui/OrderRow';
import { RowMenu, type RowMenuItem } from '@/web-components/ui/RowMenu';
import { Segment, SegmentButton } from '@/web-components/ui/Segment';
import { Select } from '@/web-components/ui/Select';
import { Switch } from '@/web-components/ui/Switch';
import { TextField } from '@/web-components/ui/Field';
import { Bin, Checklist, Plus } from './Icons';
import { Ruler } from '@/components/shell/Icons';

/**
 * THE ASSESSMENT EDITOR — one dialog, the whole blueprint, one save.
 *
 * ── WHY IT IS A DIALOG AND NOT A ROUTE ──────────────────────────────────────
 *
 * `WorkoutBuilder` drew this line and it falls the same way here: the week
 * sheet refuses a modal because the board it serves is what the trainer is
 * filling and a scrim takes it away. Nothing on the Templates tab is being
 * filled — it is a shelf of blueprints — so the scrim covers the shelf and the
 * dialog IS the screen.
 *
 * ── AND IT DOES NOT AUTOSAVE ────────────────────────────────────────────────
 *
 * The week sheet has no Save button, which is right for a template that already
 * exists on a shelf. An assessment written from nothing has no row anywhere
 * until the trainer says so, autosaving would put half-written check-ins on the
 * shelf, and *Cancel* has to be able to mean *forget this*. One Save; a dirty
 * close asks.
 *
 * ── THE WHOLE DRAFT IS HELD HERE AND WRITTEN AS A UNIT ──────────────────────
 *
 * `saveTemplate` is a whole-body replace and there is deliberately no PATCH of
 * one block — the mock's own handler carries the argument: two granularities of
 * write against one jsonb blob is how a half-saved template happens.
 *
 * ── TWO BLOCKS, AND A SWITCH IS NOT AN EMPTY LIST ───────────────────────────
 *
 * Measurements and questions each carry `{on, …}`. A measurements block
 * switched OFF still remembers the fifteen tapes, so switching it back on does
 * not make the trainer choose again — which is why the count stays in the head
 * of a block that is off, and why `Fold` draws those as two different states.
 *
 * ── THERE WAS A THIRD, AND IT IS NOT DEFERRED ───────────────────────────────
 *
 * *Progress photos* was built here on 19 Sep 2026 and removed the same day.
 * **No progress photos** is a standing product rule, filed beside *no BMI
 * category* and *no health-risk band*: a photograph of somebody's body is a
 * consent problem of a different kind from a tape reading, and there is no
 * image store anywhere in this product to put one in. A block drawn over a
 * feature that does not exist is the audio-note defect this codebase already
 * names — a control over something that is not there — so it went out of the
 * model as well as out of this dialog, rather than being switched off.
 */
export function TemplateEditor({
  template,
  catalog,
  onClose,
}: {
  /** The blueprint being edited, or null for a new one. */
  template: TemplateWire | null;
  catalog: CatalogWire | null;
  onClose: (saved: boolean) => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [measurements, setMeasurements] = useState(
    template?.measurements ?? { on: true, keys: [] as string[] },
  );
  const [questions, setQuestions] = useState(
    template?.questions ?? { on: true, items: [] as QuestionWire[] },
  );

  /* WHICH BLOCK IS OPEN, AND ONLY ONE OF THEM IS.
     Both bodies open at once is a twenty-one-row measurement picker above a
     question builder — about 1,300px of dialog, with the Save button that ends
     it somewhere past all of it. A new template opens on its questions, which
     is what a trainer writing one starts with; an existing one opens on its
     measurements, which is what they come back to change. */
  const [open, setOpen] = useState<'measurements' | 'questions' | null>(
    template ? 'measurements' : 'questions',
  );
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const touch = () => setDirty(true);

  /* The catalogue, grouped the way the picker draws it. Built once: it is a
     fixed list of twenty-one rows and re-grouping it on every keystroke in the
     name field is work nobody asked for. */
  const groups = useMemo(() => {
    if (!catalog) return [];
    return catalog.groups
      .map((g) => ({ label: g, rows: catalog.measurements.filter((m) => m.group === g) }))
      .filter((g) => g.rows.length > 0);
  }, [catalog]);

  const byKey = useMemo(
    () => new Map((catalog?.measurements ?? []).map((m) => [m.key, m])),
    [catalog],
  );

  const chosenQuestionIds = new Set(questions.items.map((q) => q.id));
  const bank = (catalog?.questions ?? []).filter((q) => !chosenQuestionIds.has(q.id));

  function save() {
    setError(null);
    const draft: TemplateDraft = { name, description, measurements, questions };
    startSave(async () => {
      const result = template
        ? await saveTemplate(template.id, draft)
        : await createTemplate(draft);
      if (!result.ok) {
        setError(result.message ?? 'That did not save.');
        return;
      }
      onClose(true);
    });
  }

  function close() {
    if (dirty) { setAsking(true); return; }
    onClose(false);
  }

  return (
    <ModalHost
      onClose={close}
      /* `frame`, not `main`: this dialog is 640px of form and the rail beside it
         is a set of destinations that would take the half-written draft with
         them. The scrim over the whole app says that plainly. */
      cover="frame"
      /* The name field, not the close button — `ModalHost`'s own note: the
         default is right for a confirm, whose first control is its cancel, and
         wrong for a form. */
      initialFocus="#asm-name"
      covered={asking}
    >
      <Modal
        title={template ? 'Edit an assessment' : 'New assessment'}
        width={640}
        className="asm-ed"
        foot={
          <>
            <Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : template ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        {error && <Message tone="err">{error}</Message>}

        <TextField
          id="asm-name"
          label="Assessment name"
          value={name}
          placeholder="e.g. Month 3 check-in"
          onChange={(e) => { setName(e.target.value); touch(); }}
        />

        {/* `MarkupField`, and its other half is `Markup` — a field edited with
            the markers and printed as a bare string anywhere shows the
            asterisks to whoever reads it, and on this field that reader is the
            CLIENT. The two ship together; see `ui/Markup.tsx`. */}
        <MarkupField
          label="Description"
          /* Drawn, where this component's default is to hide it — see the prop.
             The field above this one carries a visible label and a form where
             one of two fields is labelled reads as half-written. */
          hideLabel={false}
          value={description}
          onChange={(v) => { setDescription(v); touch(); }}
          placeholder="What this check-in is for, and anything the client should know before they start."
          className="mt3"
        />

        <p className="sh__l" style={{ margin: '18px 0 10px' }}>Assessment content</p>

        <Fold
          icon={<Ruler size={15} />}
          title="Measurements"
          /* THE COUNT STAYS WHEN THE BLOCK IS OFF, and this read
             `measurements.on ? … : null` until it was driven: the head went
             blank the moment the switch was thrown, which is the opposite of
             what both `Fold` and `AssessmentTemplateRow` argue for. A block
             switched off still HOLDS its contents — proved over the wire — so
             the head has to go on saying so, or a trainer who changes their
             mind believes they have lost them. */
          count={measurements.keys.length}
          sub="Measurements to collect"
          open={open === 'measurements'}
          onOpenChange={(next) => setOpen(next ? 'measurements' : null)}
          off={!measurements.on}
          control={
            <Switch
              checked={measurements.on}
              label="Collect measurements"
              onChange={(on) => { setMeasurements({ ...measurements, on }); touch(); }}
            />
          }
        >
          <MeasurementPicker
            groups={groups}
            byKey={byKey}
            keys={measurements.keys}
            onChange={(keys) => { setMeasurements({ ...measurements, keys }); touch(); }}
          />
        </Fold>

        <Fold
          icon={<Checklist />}
          title="Questions"
          count={questions.items.length}
          sub="Questions to ask the client"
          open={open === 'questions'}
          onOpenChange={(next) => setOpen(next ? 'questions' : null)}
          off={!questions.on}
          control={
            <Switch
              checked={questions.on}
              label="Ask questions"
              onChange={(on) => { setQuestions({ ...questions, on }); touch(); }}
            />
          }
        >
          <QuestionBuilder
            items={questions.items}
            bank={bank}
            onChange={(items) => { setQuestions({ ...questions, items }); touch(); }}
          />
        </Fold>
      </Modal>

      {asking && (
        /* A SECOND DIALOG OVER THE FIRST, and `covered` above is the other half
           of it: two `ModalHost`s both bind Escape in capture and the OUTER one
           answers first, so without it a press meant to dismiss this question
           would close the editor and take the draft with it. Trap 49. */
        <ModalHost onClose={() => setAsking(false)} cover="frame">
          <Modal
            title="Close without saving?"
            confirm={{ label: 'Discard it', danger: true, onClick: () => onClose(false) }}
            cancel={{ label: 'Keep editing', onClick: () => setAsking(false) }}
          >
            <p style={{ margin: 0 }}>
              Nothing here has been written yet. Closing now leaves the assessment as it was.
            </p>
          </Modal>
        </ModalHost>
      )}
    </ModalHost>
  );
}

/* ══════════════════════════════════════════════════ the measurement picker ══ */

interface Def { key: string; label: string; group: string; unit: string; metric: string | null }

/**
 * WHAT IS BEING COLLECTED, THEN WHAT COULD BE.
 *
 * Chosen first and as removable tokens, because the question a trainer opens
 * this block with is *what am I already asking for* — a catalogue of twenty-one
 * rows with six of them ticked somewhere down it answers that only by being
 * read end to end.
 *
 * ── THE ORDER OF THE CHOSEN LIST IS THE ORDER OF THE ASK ────────────────────
 *
 * Not the catalogue's. A trainer who adds *Waist* last wants it last, because
 * the list is the order they will take the tape round somebody — and re-sorting
 * their picks into the catalogue's order would silently overrule the one thing
 * about this block that is theirs.
 */
function MeasurementPicker({
  groups,
  byKey,
  keys,
  onChange,
}: {
  groups: { label: string; rows: Def[] }[];
  byKey: Map<string, Def>;
  keys: string[];
  onChange: (next: string[]) => void;
}) {
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  if (groups.length === 0) {
    /* The catalogue is a LENIENT read — `lib/assessments/api.ts` says why — so
       this is a real state rather than a defensive branch, and it says what the
       trainer can still do rather than only what is missing. */
    return (
      <p className="small" style={{ margin: 0 }}>
        The measurement catalogue could not be loaded, so nothing can be added right now. Whatever
        this assessment already collects is untouched.
      </p>
    );
  }

  return (
    <div className="asm-pick">
      <div className="asm-pick__hd">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(keys.length === total ? [] : groups.flatMap((g) => g.rows.map((r) => r.key)))}
        >
          {keys.length === total ? 'Clear all' : 'Select all'}
        </Button>
        <span className="asm-pick__n">{keys.length} of {total}</span>
      </div>

      {keys.length > 0 && (
        <div className="asm-pick__chips">
          {keys.map((k) => {
            const def = byKey.get(k);
            return (
              <Chip
                key={k}
                /* A key with no row behind it is a measurement the catalogue
                   dropped. Drawn as ITSELF rather than hidden — the same call
                   `/settings/profile`'s pickers make about an unknown id: ugly,
                   honest, and removable. */
                title={def ? `${def.group} · ${def.unit || 'no unit'}` : 'Not in the catalogue'}
                removeLabel={`Stop collecting ${def?.label ?? k}`}
                onRemove={() => onChange(keys.filter((x) => x !== k))}
              >
                {def?.label ?? k}
              </Chip>
            );
          })}
        </div>
      )}

      <p className="asm-rule">Available measurements</p>

      {groups.map((g) => (
        <MeasurementGroup
          key={g.label}
          group={g}
          keys={keys}
          onAdd={(key) => onChange([...keys, key])}
        />
      ))}
    </div>
  );
}

/** One heading and its rows, folded. */
function MeasurementGroup({
  group,
  keys,
  onAdd,
}: {
  group: { label: string; rows: Def[] };
  keys: string[];
  onAdd: (key: string) => void;
}) {
  const left = group.rows.filter((r) => !keys.includes(r.key));
  const [open, setOpen] = useState(left.length > 0);

  return (
    <Fold
      flush
      title={group.label}
      count={left.length}
      open={open}
      onOpenChange={setOpen}
      className="asm-grp"
    >
      <ul className="asm-grp__l">
        {group.rows.map((row) => {
          const already = keys.includes(row.key);
          return (
            <li key={row.key}>
              <button
                type="button"
                className="asm-add"
                disabled={already}
                onClick={() => onAdd(row.key)}
              >
                <span className="asm-add__p" aria-hidden="true">
                  {already ? <TickGlyph /> : <Plus size={15} />}
                </span>
                {row.label}
                {/* THE UNIT, AND THE ONE THING THAT SEPARATES THESE ROWS.
                    Six of the twenty-one carry a `metric`, and those six are
                    the ones that reach the client's Progress chart. A picker
                    that drew twenty-one equal rows would hide a real
                    difference; `on the chart` is that difference in three
                    words. See `MeasurementDefRow` for why it is not hidden. */}
                <span className="asm-add__u">
                  {row.unit}
                  {row.metric ? ' · on the chart' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Fold>
  );
}

function TickGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 12 5.5 6L20 6" />
    </svg>
  );
}

/* ═════════════════════════════════════════════════════ the question builder ══ */

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
function QuestionBuilder({
  items,
  bank,
  onChange,
}: {
  items: QuestionWire[];
  bank: QuestionWire[];
  onChange: (next: QuestionWire[]) => void;
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(items.length > 0 ? [] : bank)}
        >
          {items.length > 0 ? 'Remove all' : 'Add them all'}
        </Button>
        <span className="asm-pick__n">{items.length} asked</span>
      </div>

      {items.length === 0 ? (
        <p className="small" style={{ margin: 0 }}>
          Nothing is asked yet. Add one from the list below, or write your own.
        </p>
      ) : editing ? (
        /* ── EDITING: every question is a card ─────────────────────────────
           No grip and no drag here. A card is 120–300px tall, so the two rows
           a drag has to reach are rarely on screen together — and *Move up* /
           *Move down* in the head's own menu is the path SC 2.5.7 wanted
           anyway. Arranging is what the compact list is for. */
        <div role="list" aria-label="Questions this assessment asks">
          {items.map((q, i) => (
            <QuestionCard
              key={q.id}
              q={q}
              ordinal={i + 1}
              menu={<RowMenu label={`question ${i + 1}`} items={menuFor(q, i)} />}
              remove={bin(q)}
              onPatch={(next) => patch(q.id, next)}
            />
          ))}
        </div>
      ) : (
        <OrderRows label="Questions this assessment asks">
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
}: {
  q: QuestionWire;
  ordinal: number;
  menu: ReactNode;
  remove: ReactNode;
  onPatch: (next: Partial<QuestionWire>) => void;
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
              title="The client can write their own answer"
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
              sub="The client can tick more than one."
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
            The client answers yes or no. Nothing here is a health question — see the note on the
            write path.
          </p>
        </div>
      )}

      {q.kind === 'text' && (
        <div className="asm-q__b">
          <p className="small" style={{ margin: 0 }}>
            The client writes an answer in their own words. It is the one kind that cannot be put
            beside the same answer from eight weeks ago, so ask it where that is the point.
          </p>
        </div>
      )}
    </div>
  );
}

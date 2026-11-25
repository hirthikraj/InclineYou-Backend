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
  blankQuestion,
  forKind,
  moved,
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
import { Select } from '@/web-components/ui/Select';
import { Switch, SwitchRow } from '@/web-components/ui/Switch';
import { TextField } from '@/web-components/ui/Field';
import { useDismiss } from '@/lib/ui/dismiss';
import { usePhone } from '@/lib/ui/phone';
import { ChoiceList } from '@/web-components/ui/ChoiceList';
import { ScreenSheet } from '@/web-components/ui/ScreenSheet';
import { SearchField } from '@/web-components/ui/SearchField';
import { Bin, Checklist, Plus } from './Icons';
import { QuestionBody, QuestionBuilder } from '@/components/assessments/QuestionBuilder';
import { Chevron, ChevronDown, ChevronUp, Ruler } from '@/components/shell/Icons';

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
/* ── PHONE OR DESK ─────────────────────────────────────────────────────────────
   One draft, two surfaces: the 640px `Modal` above 620px, a `ScreenSheet` with
   drill-in screens below. `usePhone` (lib/ui/phone.ts) says why a JS media query
   is safe here and nowhere a page draws on arrival. */

/** Which screen the phone editor is showing. The desk ignores it. */
type Screen =
  | { kind: 'summary' }
  | { kind: 'measurements' }
  | { kind: 'questions' }
  | { kind: 'add' }
  | { kind: 'question'; id: string };

/** What each answer type looks like to the client — the *Add a question* screen's second line. */
const KIND_EXAMPLE: Record<AnswerKind, string> = {
  yesno: 'Did anything hurt this week?',
  rating: 'How was your energy, out of 10?',
  text: 'Answered in their own words',
  choice: 'They pick from answers you write',
};

export function TemplateEditor({
  template,
  catalog,
  starters = [],
  onClose,
}: {
  /** The blueprint being edited, or null for a new one. */
  template: TemplateWire | null;
  catalog: CatalogWire | null;
  /**
   * The trainer's own templates, offered as *Start from* on a NEW one. Copying
   * one fills the draft with its measurements and questions; nothing links the
   * copy back to it, so editing either never touches the other.
   */
  starters?: TemplateWire[];
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
  /* Offered to clients on the portal under *Start a new one*. A trainer's own form starts private; the weekly one ships on. */
  const [clientCanStart, setClientCanStart] = useState(template?.clientCanStart ?? false);

  /* WHICH BLOCK IS OPEN, AND ONLY ONE OF THEM IS.
     Both bodies open at once is a twenty-one-row measurement picker above a
     question builder — about 1,300px of dialog, with the Save button that ends
     it somewhere past all of it. It opens on the MEASUREMENTS, new or existing: in v1 the trainer takes
     the assessment with a tape in hand, so the tapes are the substance and the questions the addendum. It
     opened a new template on a bank of eleven questions and *Add them all*, which is the wrong first
     thing to be offered. */
  const [open, setOpen] = useState<'measurements' | 'questions' | null>('measurements');
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const touch = () => setDirty(true);

  const phone = usePhone();
  /* The phone sheet slides out before it unmounts (`useDismiss`); on a desk there is
     no element for the hook to watch, so it closes at once, as the dialog always has. */
  const { closing, dismiss: leave, dismissThen, ref: sheetRef } = useDismiss<HTMLDivElement>(() => onClose(false));
  const [screen, setScreen] = useState<Screen>({ kind: 'summary' });
  const [dir, setDir] = useState<'forward' | 'back' | null>(null);
  const [showDesc, setShowDesc] = useState(Boolean(template?.description));
  const [mQuery, setMQuery] = useState('');
  const [starterId, setStarterId] = useState('');

  const go = (next: Screen) => { setDir('forward'); setScreen(next); };
  const back = () => {
    setDir('back');
    setScreen(
      screen.kind === 'question' || screen.kind === 'add' ? { kind: 'questions' } : { kind: 'summary' },
    );
  };

  /* START FROM ONE OF YOUR OWN. Most new templates are an existing one with a
     change or two, so a new draft can be filled from any template on the shelf:
     its measurements, its questions (fresh copies, so editing them here cannot
     reach the original) and its description where this one has none. The name is
     only filled while still empty, and *Blank* empties the content again. */
  function startFrom(id: string) {
    setStarterId(id);
    touch();
    const from = starters.find((t) => t.id === id);
    if (!from) {
      setMeasurements({ on: true, keys: [] });
      setQuestions({ on: true, items: [] });
      return;
    }
    setMeasurements({ on: from.measurements.on, keys: [...from.measurements.keys] });
    setQuestions({
      on: from.questions.on,
      items: from.questions.items.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })) })),
    });
    if (!description.trim() && from.description) { setDescription(from.description); setShowDesc(true); }
    if (!name.trim()) setName(`${from.name} (copy)`);
  }

  const startField = !template && starters.length > 0 ? (
    <Select
      label="Start from"
      hint="Copy one of your templates and change what you need, or start blank."
      value={starterId}
      onChange={(e) => startFrom(e.target.value)}
      options={[
        { value: '', label: 'Blank' },
        ...starters.map((t) => ({ value: t.id, label: t.name })),
      ]}
    />
  ) : null;

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
    const draft: TemplateDraft = { name, description, measurements, questions, clientCanStart };
    startSave(async () => {
      const result = template
        ? await saveTemplate(template.id, template.version, draft)
        : await createTemplate(draft);
      if (!result.ok) {
        setError(result.message ?? 'That did not save.');
        return;
      }
      dismissThen(() => onClose(true));
    });
  }

  function close() {
    if (dirty) { setAsking(true); return; }
    leave();
  }

  /* Escape steps back a screen on the phone before it closes anything. */
  const dismiss = () => (phone && screen.kind !== 'summary' ? back() : close());

  return (
    <ModalHost
      onClose={dismiss}
      /* `frame`, not `main`: this dialog is 640px of form and the rail beside it
         is a set of destinations that would take the half-written draft with
         them. The scrim over the whole app says that plainly. */
      cover="frame"
      /* The name field, not the close button — `ModalHost`'s own note: the
         default is right for a confirm, whose first control is its cancel, and
         wrong for a form. */
      /* On a phone, the sheet's HEADING: focusing the name field raises the keyboard over
         half the screen before the trainer has seen the template they opened. */
      initialFocus={phone ? '.scrsh__t' : '#asm-name'}
      covered={asking}
    >
      {phone ? (
        <PhoneEditor
          isNew={!template}
          saving={saving}
          error={error}
          screen={screen}
          dir={dir}
          go={go}
          back={back}
          close={close}
          save={save}
          startField={startField}
          name={name}
          setName={(v) => { setName(v); touch(); }}
          description={description}
          setDescription={(v) => { setDescription(v); touch(); }}
          showDesc={showDesc}
          setShowDesc={setShowDesc}
          clientCanStart={clientCanStart}
          setClientCanStart={(v) => { setClientCanStart(v); touch(); }}
          measurements={measurements}
          setMeasurements={(m) => { setMeasurements(m); touch(); }}
          questions={questions}
          setQuestions={(q) => { setQuestions(q); touch(); }}
          groups={groups}
          byKey={byKey}
          bank={bank}
          mQuery={mQuery}
          setMQuery={setMQuery}
          closing={closing}
          sheetRef={sheetRef}
        />
      ) : (
      <Modal
        sheet
        title={template ? 'Edit template' : 'New template'}
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
        {/* `alert`, so a refusal is announced: it sits at the top of a body that scrolls while Create is pinned
            at the foot, so a trainer pressing Create from the bottom neither saw nor heard the failure. */}
        {error && <Message tone="err" alert>{error}</Message>}

        {startField && <div className="asm-ed__start">{startField}</div>}

        <TextField
          id="asm-name"
          label="Template name"
          value={name}
          maxLength={120}
          placeholder="e.g. Month 3 review"
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
          placeholder="What this template is for, and anything to remember when you take it."
          className="mt3"
        />

        {/* THE CLIENT'S SIDE OF THE FORM, one switch. It says what changes — where it shows up and what stays — because a
            switch that moves a form into somebody else's portal is the one control here a trainer should not have to guess at. */}
        <SwitchRow
          className="mt3"
          checked={clientCanStart}
          onChange={(on) => { setClientCanStart(on); touch(); }}
          title="Clients can start this themselves"
          example="It shows under Start a new one in their portal. Turning it off hides it; ones already started stay."
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
          sub="Answers are kept with the assessment"
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
      )}

      {asking && (
        /* A SECOND DIALOG OVER THE FIRST, and `covered` above is the other half
           of it: two `ModalHost`s both bind Escape in capture and the OUTER one
           answers first, so without it a press meant to dismiss this question
           would close the editor and take the draft with it. Trap 49. */
        <ModalHost onClose={() => setAsking(false)} cover="frame">
          <Modal
            title="Close without saving?"
            confirm={{ label: 'Discard it', danger: true, onClick: () => { setAsking(false); leave(); } }}
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

interface Def { key: string; label: string; group: string; unit: string; charted: boolean }

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
                  {row.charted ? ' · on the chart' : ''}
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


/* ═════════════════════════════════════════════════════ the phone editor ══ */

/**
 * THE SAME TEMPLATE, AS SCREENS (21 Nov 2026, from a phone screenshot).
 *
 * The desk dialog on a phone was a box over a page with its own scroller and a
 * pinned foot, and the name, a five-line description and a three-line switch all
 * came before the first measurement. This is the phone's shape for the same
 * draft, held by `TemplateEditor` above and saved by the same one Save:
 *
 *   SUMMARY       the whole template on one screen — name, two rows that say what
 *                 is in each block and open it, who can start it, and the
 *                 description behind *Add a description* (the part edited least).
 *   MEASUREMENTS  a checklist (`c-choicelist`), grouped as the catalogue is, with
 *                 search. Ticking appends, so the order is still the order the
 *                 trainer chose — `MeasurementPicker`'s rule.
 *   QUESTIONS     the asked list; a row opens the question, ↑ ↓ move it (a drag
 *                 is unreliable under a thumb, and SC 2.5.7 wants the
 *                 non-dragging path anyway), *Add a question* opens —
 *   ADD           the four answer types, each with an example of what the client
 *                 sees, then the suggested questions from the catalogue's bank.
 *   QUESTION      the wording, the type, and `QuestionBody` — the desk card's own
 *                 controls — with *Remove this question* last.
 *
 * ── A BLOCK'S SWITCH IS NOT ON THE SUMMARY ──────────────────────────────────
 *
 * Ticking a measurement or adding a question turns its block on, so for most
 * templates the switch is a second way to say what the list already says. It
 * survives where it still means something: a block switched OFF that still holds
 * its picks (the desk's `Fold` keeps them) says so on its row, and its screen
 * opens on the switch to bring them back.
 */
function PhoneEditor(p: {
  isNew: boolean;
  saving: boolean;
  error: string | null;
  screen: Screen;
  dir: 'forward' | 'back' | null;
  go: (s: Screen) => void;
  back: () => void;
  close: () => void;
  save: () => void;
  startField: ReactNode;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  showDesc: boolean;
  setShowDesc: (v: boolean) => void;
  clientCanStart: boolean;
  setClientCanStart: (v: boolean) => void;
  measurements: { on: boolean; keys: string[] };
  setMeasurements: (m: { on: boolean; keys: string[] }) => void;
  questions: { on: boolean; items: QuestionWire[] };
  setQuestions: (q: { on: boolean; items: QuestionWire[] }) => void;
  groups: { label: string; rows: Def[] }[];
  byKey: Map<string, Def>;
  bank: QuestionWire[];
  mQuery: string;
  setMQuery: (v: string) => void;
  closing: boolean;
  sheetRef: React.Ref<HTMLDivElement>;
}) {
  const { screen, measurements: m, questions: qs } = p;
  const keys = m.keys;
  const items = qs.items;

  const setKeys = (next: string[]) => p.setMeasurements({ on: next.length > 0 ? true : m.on, keys: next });
  const setItems = (next: QuestionWire[]) => p.setQuestions({ on: next.length > 0 ? true : qs.on, items: next });

  const done = (
    <Button variant="secondary" size="sm" onClick={p.back}>Done</Button>
  );

  /* ── SUMMARY ─────────────────────────────────────────────────────────── */
  if (screen.kind === 'summary') {
    const labels = keys.map((k) => p.byKey.get(k)?.label ?? k);
    const mSub = keys.length === 0
      ? 'None yet: choose what to measure'
      : `${m.on ? '' : 'Switched off · '}${labels.slice(0, 3).join(' · ')}${labels.length > 3 ? ` · +${labels.length - 3}` : ''}`;
    const qSub = items.length === 0
      ? 'None yet: add a question'
      : `${qs.on ? '' : 'Switched off · '}${items[0].text || 'Untitled question'}${items.length > 1 ? ` · +${items.length - 1}` : ''}`;

    return (
      <ScreenSheet
        closing={p.closing}
        surfaceRef={p.sheetRef}
        className="asm-ph"
        title={p.isNew ? 'New template' : 'Edit template'}
        screen="summary"
        direction={p.dir}
        backLabel="Close"
        onBack={p.close}
        action={
          <Button variant="primary" size="sm" onClick={p.save} disabled={p.saving}>
            {p.saving ? 'Saving…' : p.isNew ? 'Create' : 'Save'}
          </Button>
        }
      >
        {p.error && <Message tone="err" alert>{p.error}</Message>}
        {p.startField && <div className="asm-ed__start">{p.startField}</div>}

        <TextField
          id="asm-name"
          label="Template name"
          value={p.name}
          maxLength={120}
          placeholder="e.g. Month 3 review"
          onChange={(e) => p.setName(e.target.value)}
        />

        <p className="sh__l asm-ph__sec">What it asks for</p>
        <div className="asm-ph__rows">
          <ListRow
            onClick={() => p.go({ kind: 'measurements' })}
            title="Measurements"
            sub={mSub}
            right={<span className="asm-ph__chev"><span className="asm-ph__n">{keys.length}</span><Chevron size={16} /></span>}
            rightInline
          />
          <ListRow
            onClick={() => p.go({ kind: 'questions' })}
            title="Questions"
            sub={qSub}
            right={<span className="asm-ph__chev"><span className="asm-ph__n">{items.length}</span><Chevron size={16} /></span>}
            rightInline
          />
        </div>

        <p className="sh__l asm-ph__sec">Who can start it</p>
        <SwitchRow
          checked={p.clientCanStart}
          onChange={p.setClientCanStart}
          title="Clients can start this themselves"
          example="It shows under Start a new one in their portal."
        />

        {p.showDesc ? (
          <MarkupField
            label="Description"
            hideLabel={false}
            value={p.description}
            onChange={p.setDescription}
            placeholder="What this template is for, and anything to remember when you take it."
            className="mt3"
          />
        ) : (
          <Button variant="ghost" className="mt3" onClick={() => p.setShowDesc(true)}>
            <Plus size={14} />
            Add a description
          </Button>
        )}
      </ScreenSheet>
    );
  }

  /* ── MEASUREMENTS ────────────────────────────────────────────────────── */
  if (screen.kind === 'measurements') {
    const q = p.mQuery.trim().toLowerCase();
    const known = new Set(p.groups.flatMap((g) => g.rows.map((r) => r.key)));
    const unknown = keys.filter((k) => !known.has(k));
    const total = known.size;
    const shown = p.groups
      .map((g) => ({ ...g, rows: q ? g.rows.filter((r) => r.label.toLowerCase().includes(q)) : g.rows }))
      .filter((g) => g.rows.length > 0);

    const option = (r: Def) => ({
      id: r.key,
      text: (
        <>
          <span>{r.label}</span>
          <span className="asm-ph__u">{r.unit}{r.charted ? ' · on the chart' : ''}</span>
        </>
      ),
    });

    return (
      <ScreenSheet closing={p.closing} surfaceRef={p.sheetRef} className="asm-ph" title="Measurements" screen="measurements" direction={p.dir}
        backLabel="Back to the template" onBack={p.back} action={done}>
        {!m.on && keys.length > 0 && (
          <SwitchRow
            checked={false}
            onChange={(on) => p.setMeasurements({ ...m, on })}
            title="Collect measurements"
            example={`Switched off. The ${keys.length} below are kept and come back when it is on.`}
          />
        )}
        {p.groups.length === 0 ? (
          <p className="small" style={{ margin: 0 }}>
            The measurement catalogue could not be loaded, so nothing can be added right now. Whatever this
            template already collects is untouched.
          </p>
        ) : (
          <>
            <SearchField
              label="Search measurements"
              placeholder="Search measurements"
              value={p.mQuery}
              onChange={(e) => p.setMQuery(e.target.value)}
            />
            <div className="asm-ph__bar">
              <span>{keys.length} of {total} selected</span>
              {keys.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setKeys(unknown)}>Clear all</Button>
              )}
            </div>
            {unknown.length > 0 && !q && (
              <div className="asm-ph__grp">
                <p className="sh__l">Not in the catalogue</p>
                <ChoiceList name="m-unknown" label="Not in the catalogue" multiple value={keys}
                  options={unknown.map((k) => ({ id: k, text: k }))} onChange={setKeys} />
              </div>
            )}
            {shown.length === 0 ? (
              <p className="small asm-ph__grp">Nothing matches &ldquo;{p.mQuery}&rdquo;.</p>
            ) : shown.map((g) => (
              <div key={g.label} className="asm-ph__grp">
                <p className="sh__l">{g.label}</p>
                {/* `value` is the WHOLE list, so a tick appends and an untick filters — the order the
                    trainer built is kept across groups, which is `MeasurementPicker`'s rule. */}
                <ChoiceList name={`m-${g.label}`} label={g.label} multiple value={keys}
                  options={g.rows.map(option)} onChange={setKeys} />
              </div>
            ))}
          </>
        )}
      </ScreenSheet>
    );
  }

  /* ── ADD A QUESTION ──────────────────────────────────────────────────── */
  if (screen.kind === 'add') {
    const write = (q: QuestionWire) => {
      setItems([...items, q]);
      p.go({ kind: 'question', id: q.id });
    };
    return (
      <ScreenSheet closing={p.closing} surfaceRef={p.sheetRef} className="asm-ph" title="Add a question" screen="add" direction={p.dir}
        backLabel="Back to the questions" onBack={p.back}>
        <p className="sh__l" style={{ marginTop: 0 }}>Write your own</p>
        <div className="asm-ph__rows">
          {KIND_ORDER.map((k) => (
            <ListRow key={k} onClick={() => write(blankQuestion(`q_new_${Date.now().toString(36)}`, k))}
              title={KIND_LABEL[k]} sub={KIND_EXAMPLE[k]}
              right={<Chevron size={16} />} />
          ))}
        </div>
        {p.bank.length > 0 && (
          <>
            <p className="sh__l asm-ph__sec">Suggested</p>
            <div className="asm-ph__rows">
              {p.bank.map((q) => (
                <ListRow
                  key={q.id}
                  onClick={() => { setItems([...items, q]); p.back(); }}
                  title={q.text}
                  sub={KIND_LABEL[q.kind]}
                  right={<Plus size={16} />}
                />
              ))}
            </div>
          </>
        )}
      </ScreenSheet>
    );
  }

  /* ── ONE QUESTION ────────────────────────────────────────────────────── */
  if (screen.kind === 'question') {
    const i = items.findIndex((x) => x.id === screen.id);
    const q = items[i];
    if (q) {
      const patch = (next: Partial<QuestionWire>) => setItems(items.map((x) => (x.id === q.id ? { ...x, ...next } : x)));
      return (
        <ScreenSheet closing={p.closing} surfaceRef={p.sheetRef} className="asm-ph" title={`Question ${i + 1}`} screen={`q-${q.id}`} direction={p.dir}
          backLabel="Back to the questions" onBack={p.back} action={done}>
          <TextField
            id={`asm-q-${q.id}`}
            label="Question"
            value={q.text}
            placeholder="What do you want to ask?"
            onChange={(e) => patch({ text: e.target.value })}
          />
          <div className="mt3">
            <Select
              label="Answer type"
              value={q.kind}
              onChange={(e) => patch(forKind(q, e.target.value as AnswerKind))}
              options={KIND_ORDER.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            />
          </div>
          <div className="mt3">
            <QuestionBody q={q} ordinal={i + 1} onPatch={patch} />
          </div>
          <div className="asm-ph__end">
            <Button variant="danger" wide onClick={() => { setItems(items.filter((x) => x.id !== q.id)); p.back(); }}>
              <Bin />
              Remove this question
            </Button>
          </div>
        </ScreenSheet>
      );
    }
    /* The question went (removed on another screen); fall through to the list. */
  }

  /* ── QUESTIONS ───────────────────────────────────────────────────────── */
  return (
    <ScreenSheet closing={p.closing} surfaceRef={p.sheetRef} className="asm-ph" title="Questions" screen="questions" direction={p.dir}
      backLabel="Back to the template" onBack={p.back} action={done}>
      {!qs.on && items.length > 0 && (
        <SwitchRow
          checked={false}
          onChange={(on) => p.setQuestions({ ...qs, on })}
          title="Ask questions"
          example={`Switched off. The ${items.length} below are kept and come back when it is on.`}
        />
      )}
      {items.length === 0 ? (
        <p className="small" style={{ margin: '0 0 14px' }}>
          Nothing is asked yet. Write your own, or pick from the suggested ones.
        </p>
      ) : (
        <div className="asm-ph__rows" role="list" aria-label="Questions this template asks">
          {items.map((q, i) => (
            <div key={q.id} className="asm-ph__qr" role="listitem">
              <ListRow
                onClick={() => p.go({ kind: 'question', id: q.id })}
                title={q.text || 'Untitled question'}
                sub={`${i + 1} · ${KIND_LABEL[q.kind]}`}
              />
              <Button variant="ghost" size="sm" iconOnly label={`Move question ${i + 1} up`}
                icon={<ChevronUp size={16} />} disabled={i === 0}
                onClick={() => setItems(moved(items, i, i - 1))} />
              <Button variant="ghost" size="sm" iconOnly label={`Move question ${i + 1} down`}
                icon={<ChevronDown size={16} />} disabled={i === items.length - 1}
                onClick={() => setItems(moved(items, i, i + 1))} />
            </div>
          ))}
        </div>
      )}
      <div className="mt3">
        <Button variant="secondary" wide onClick={() => p.go({ kind: 'add' })}>
          <Plus size={14} />
          Add a question
        </Button>
      </div>
    </ScreenSheet>
  );
}

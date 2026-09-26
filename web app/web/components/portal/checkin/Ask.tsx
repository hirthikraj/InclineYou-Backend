'use client';

import { AffixField } from '@/web-components/ui/AffixField';
import { ChoiceList } from '@/web-components/ui/ChoiceList';
import { Scale } from '@/web-components/ui/Scale';
import { Textarea } from '@/web-components/ui/Textarea';
import { choiceHint, type Step } from '@/lib/portal/checkin';

/**
 * ONE ASK, DRAWN. The control the step's kind calls for and nothing else.
 *
 * Split out of `Flow` because the flow is about MOVEMENT — what is saved, what
 * is next, what happens on a skip — and this is about the five shapes an answer
 * can take. Two subjects in one file is the file nobody can change one half of.
 *
 * ── THE DRAFT IS A STRING, ON EVERY KIND ────────────────────────────────────
 *
 * Even a rating, which is a number. A field mid-typing holds `8.` and `` and
 * `-`, none of which is a number, and a draft typed as one has to invent a
 * value for each — which is how an empty field becomes a 0 the server takes.
 * The flow parses once, at the commit, which is also where the server does.
 */
export type Draft = { text: string; ids: string[]; other: string };

export const BLANK: Draft = { text: '', ids: [], other: '' };

/**
 * The *Other* line's option id.
 *
 * A constant and not `'other'` typed at three call-sites: it must not collide
 * with an option the trainer wrote, and `_` is not a character the editor can
 * put in an id — `blankOptions` in `lib/assessments/vocab.ts` mints
 * `{question}_a`, so the namespace is already this shape.
 */
export const OTHER_ID = '__other';

export function Ask({
  step,
  draft,
  onDraft,
  onCommit,
  busy,
}: {
  step: Step;
  draft: Draft;
  onDraft: (next: Draft) => void;
  /**
   * The kinds that are answered with ONE TAP call this themselves.
   *
   * A rating, a yes/no and a single choice are complete the moment they are
   * touched, so asking for a second press on *Next* is asking somebody to
   * confirm what they just said — twenty-six times. The kinds that are not
   * complete on a tap (a tape reading, several choices, a sentence) commit on
   * the foot's own button, because the flow cannot know when somebody has
   * finished typing.
   */
  onCommit: (next: Draft) => void;
  busy: boolean;
}) {
  if (step.kind === 'measurement') {
    const m = step.measurement;
    return (
      <AffixField
        label={m.label}
        /* The spoken unit and the drawn one are two props on purpose —
           `AffixField` carries why: a reader announcing the affix says
           "centimetres, Waist at the navel, eighty-eight". */
        unit={SPOKEN[m.unit] ?? m.unit}
        affix={m.unit}
        side="trailing"
        hideLabel
        id={`ask-${m.key}`}
        inputMode="decimal"
        autoFocus
        disabled={busy}
        value={draft.text}
        onChange={(e) => onDraft({ ...draft, text: e.target.value })}
      />
    );
  }

  const q = step.question;

  if (q.kind === 'rating') {
    return (
      <Scale
        name={q.id}
        label={q.text}
        top={q.scale ?? 10}
        value={draft.text === '' ? null : Number(draft.text)}
        onChange={(n) => onCommit({ ...draft, text: String(n) })}
      />
    );
  }

  if (q.kind === 'yesno') {
    return (
      <ChoiceList
        name={q.id}
        label={q.text}
        value={draft.ids}
        onChange={(ids) => onCommit({ ...draft, ids })}
        options={[
          { id: 'yes', text: 'Yes' },
          { id: 'no', text: 'No' },
        ]}
      />
    );
  }

  if (q.kind === 'text') {
    return (
      <Textarea
        label={q.text}
        /* The label is the prompt, and the prompt is already 24px above the
           box. Hidden here rather than dropped: the field still has to have a
           name, and `display:none` would take it away from a reader
           (trap 5). */
        hideLabel
        rows={4}
        autoFocus
        disabled={busy}
        placeholder="In your own words"
        value={draft.text}
        onChange={(e) => onDraft({ ...draft, text: e.target.value })}
      />
    );
  }

  return (
    <ChoiceList
      name={q.id}
      label={q.text}
      multiple={q.allowMultiple}
      value={draft.ids}
      /* SEVERAL ANSWERS COMMITS ON *NEXT*, ONE ANSWER COMMITS ON THE TAP. The
         same control, two behaviours, and the difference is not a preference:
         a multiple choice is not finished when the first option is ticked, and
         advancing on it would take the screen away mid-answer. */
      onChange={(ids) => (q.allowMultiple ? onDraft({ ...draft, ids }) : onCommit({ ...draft, ids }))}
      options={q.options}
      other={
        q.allowCustom
          ? {
              id: OTHER_ID,
              label: 'Something else',
              value: draft.other,
              placeholder: 'In your own words',
              onChange: (other) => onDraft({ ...draft, other }),
            }
          : undefined
      }
    />
  );
}

/** The second line under a choice, where there is one. See `choiceHint`. */
export function AskHint({ step }: { step: Step }) {
  if (step.kind === 'measurement') {
    /* The protocol, which is the half of the catalogue's label that makes two
       readings comparable — and the catalogue writes it INTO the label
       (*Waist, at the navel*), so there is nothing to draw here but the
       instruction the flow itself owes them. */
    return (
      <p className="pchk__pr">
        Use the same spot and the same tape each time — that is what makes it
        worth comparing.
      </p>
    );
  }
  const hint = choiceHint(step.question);
  return hint ? <p className="pchk__pr">{hint}</p> : null;
}

/**
 * `kg` → `kilograms`. The unit as it is SAID, for the label a reader hears.
 *
 * Only the ones that are abbreviations. `reps`, `seconds` and `out of 10` are
 * already words — the catalogue spells `seconds` in full for exactly this
 * reason — and a map entry for them would be a second copy of a string that is
 * right where it is.
 */
const SPOKEN: Record<string, string> = {
  kg: 'kilograms',
  cm: 'centimetres',
  '%': 'percent',
  bpm: 'beats per minute',
  mmHg: 'millimetres of mercury',
};

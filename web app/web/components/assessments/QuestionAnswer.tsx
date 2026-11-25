'use client';

import { Button } from '@/web-components/ui/Button';
import { TextField } from '@/web-components/ui/Field';
import { Tag } from '@/web-components/ui/Tag';
import { Textarea } from '@/web-components/ui/Textarea';

/*
 * ONE QUESTION, ANSWERED — extracted 22 Nov 2026 from the portal's `assess/Take.tsx`, unchanged, so the public join page
 * answers the same four kinds (yes/no, rating, text, multiple choice) with the same controls a client uses in an
 * assessment. The question the builder writes (`components/assessments/QuestionBuilder.tsx`) is the question this draws.
 */

/** The shape every question on this wire has — the assessment's and the join link's. */
export interface AnswerableQuestion {
  id: string;
  text: string;
  kind: 'rating' | 'yesno' | 'text' | 'choice' | string;
  scale: number | null;
  options: { id: string; text: string }[];
  allowMultiple: boolean;
  allowCustom: boolean;
}

/** One answer: the field set by its kind (`yes`, `rating`, `text`, `optionIds` + an optional `text` for "Something else"). */
export interface AnswerWire {
  yes?: boolean;
  rating?: number;
  text?: string;
  optionIds?: string[];
}

export function QuestionAnswer({ q, value, onChange }: { q: AnswerableQuestion; value: AnswerWire | undefined; onChange: (v: AnswerWire | null) => void }) {
  return (
    <fieldset className="as__q">
      <legend className="pl__t">{q.text}</legend>
      {q.kind === 'rating' && (
        <div className="pwk__chips" role="group" aria-label={q.text}>
          {Array.from({ length: q.scale ?? 5 }, (_, i) => i + 1).map((n) => (
            <Button key={n} variant={value?.rating === n ? 'primary' : 'secondary'} size="sm" aria-pressed={value?.rating === n} onClick={() => onChange(value?.rating === n ? null : { rating: n })}>{n}</Button>
          ))}
          <span className="pl__s">1 = low · {q.scale ?? 5} = high</span>
        </div>
      )}
      {q.kind === 'yesno' && (
        <div className="pwk__chips" role="group" aria-label={q.text}>
          {[true, false].map((v) => (
            <Button key={String(v)} variant={value?.yes === v ? 'primary' : 'secondary'} size="sm" aria-pressed={value?.yes === v} onClick={() => onChange(value?.yes === v ? null : { yes: v })}>{v ? 'Yes' : 'No'}</Button>
          ))}
        </div>
      )}
      {q.kind === 'text' && (
        <Textarea label={q.text} hideLabel rows={3} limit={2000} value={value?.text ?? ''} onChange={(e) => onChange(e.target.value ? { text: e.target.value } : null)} />
      )}
      {q.kind === 'choice' && (
        <>
          <div className="pwk__chips" role="group" aria-label={q.text}>
            {q.options.map((o) => {
              const on = value?.optionIds?.includes(o.id) ?? false;
              return (
                <Button key={o.id} variant={on ? 'primary' : 'secondary'} size="sm" aria-pressed={on} onClick={() => {
                  const cur = value?.optionIds ?? [];
                  const next = on ? cur.filter((x) => x !== o.id) : q.allowMultiple ? [...cur, o.id] : [o.id];
                  onChange(next.length || value?.text ? { ...value, optionIds: next } : null);
                }}>{o.text}</Button>
              );
            })}
          </div>
          {q.allowCustom && <TextField label="Something else" value={value?.text ?? ''} onChange={(e) => onChange({ ...value, text: e.target.value })} />}
          {q.allowMultiple && <Tag>Pick any</Tag>}
        </>
      )}
    </fieldset>
  );
}

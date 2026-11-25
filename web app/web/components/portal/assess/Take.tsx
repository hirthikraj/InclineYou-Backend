'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { readingAllowed, readingInputMode, readingRule } from '@/lib/assessments/bounds';
import { saveEntry } from '@/lib/portal/assess-actions';
import type { AnswerWire, AssessDetailWire } from '@/lib/portal/assess-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { TextField } from '@/web-components/ui/Field';
import { Message } from '@/web-components/ui/Message';

import { day } from '../plan/format';
import { QuestionAnswer } from '@/components/assessments/QuestionAnswer';

function num(text: string, m: { min?: number; minInclusive?: boolean } | undefined): number | null | 'bad' {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return readingAllowed(m ?? {}, n) ? n : 'bad';
}

/**
 * Taking an assessment. Every measurement may be skipped and every question left unanswered — nothing here is a test — and the client can save
 * for later and finish on any device. Handing it in is final: a correction is the trainer's. Health items are shown as asked, with a line saying
 * who sees them, and are never scored.
 */
export function Take({ a, trainerFirstName }: { a: AssessDetailWire; trainerFirstName: string }) {
  const router = useRouter();
  const [version, setVersion] = useState(a.version);
  const [readings, setReadings] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(a.entry.readings).map(([k, v]) => [k, String(v)])));
  const [answers, setAnswers] = useState<Record<string, AnswerWire>>(a.entry.answers);
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function build(): { readings: Record<string, number>; answers: Record<string, AnswerWire> } | null {
    const r: Record<string, number> = {};
    for (const [k, v] of Object.entries(readings)) {
      const m = a.asked.measurements.find((x) => x.key === k);
      const n = num(v, m);
      if (n === 'bad') {
        setFailure(`${m?.label ?? 'A measurement'}: enter ${readingRule(m ?? {})} — or leave the box empty to skip it.`);
        return null;
      }
      if (n !== null) r[k] = n;
    }
    const clean: Record<string, AnswerWire> = {};
    for (const [id, ans] of Object.entries(answers)) {
      const text = ans.text?.trim();
      const out: AnswerWire = {};
      if (ans.yes !== undefined) out.yes = ans.yes;
      if (ans.rating !== undefined) out.rating = ans.rating;
      if (ans.optionIds?.length) out.optionIds = ans.optionIds;
      if (text) out.text = text;
      if (Object.keys(out).length) clean[id] = out;
    }
    return { readings: r, answers: clean };
  }

  function submit(complete: boolean) {
    setFailure(null);
    setSaved(false);
    const entry = build();
    if (!entry) return;
    start(async () => {
      const res = await saveEntry(a.id, version, entry, complete);
      if (!res.ok) return setFailure(res.message);
      if (complete) return router.push(`/me/assessments/${a.id}`);
      setVersion(res.value.version);
      setSaved(true);
    });
  }

  function set(id: string, patch: AnswerWire | null) {
    setSaved(false);
    setAnswers((x) => {
      const next = { ...x };
      if (patch === null) delete next[id];
      else next[id] = patch;
      return next;
    });
  }

  const groups = [...new Set(a.asked.measurements.map((m) => m.group))];

  return (
    <div className="pl">
      <Card className="ppg__hero">
        <Card.Body>
          <p className="pl__k">Assessment{a.late ? ' · a little late, no stress' : ''}</p>
          <h1 className="pl__h">{a.name}</h1>
          <p className="pl__s">Due {day(a.dueOn)}. Skip anything you’d rather not answer. You can save and come back.</p>
          {a.healthNotice && <p className="pl__s">{a.healthNotice}</p>}
          {a.weightHidden && <p className="pl__s">Body weight is hidden for you, so it isn’t asked.</p>}
        </Card.Body>
      </Card>

      {a.asked.measurements.length > 0 && (
        <Card>
          <Card.Head title="Measurements" level={3} />
          <Card.Body>
            {groups.map((g) => (
              <div key={g} className="as__group">
                <p className="pl__k">{g}</p>
                <div className="as__grid">
                  {a.asked.measurements.filter((m) => m.group === g).map((m) => (
                    <TextField key={m.key} label={m.label} hint={m.unit || undefined} inputMode={readingInputMode(m)} numeric value={readings[m.key] ?? ''}
                      onChange={(e) => { setSaved(false); setReadings((x) => ({ ...x, [m.key]: e.target.value })); }} />
                  ))}
                </div>
              </div>
            ))}
          </Card.Body>
        </Card>
      )}

      {a.asked.questions.length > 0 && (
        <Card>
          <Card.Head title="Questions" level={3} />
          <Card.Body>
            <div className="as__qs">
              {a.asked.questions.map((q) => (
                <QuestionAnswer key={q.id} q={q} value={answers[q.id]} onChange={(p) => set(q.id, p)} />
              ))}
            </div>
          </Card.Body>
        </Card>
      )}

      <div aria-live="polite">
        {failure ? <Message tone="err">{failure}</Message> : null}
        {saved ? <Message tone="ok">Saved. You can come back to it.</Message> : null}
      </div>
      <div className="pwk__actions">
        <Button variant="primary" size="lg" disabled={pending} onClick={() => submit(true)}>{pending ? 'Saving…' : `Hand it in to ${trainerFirstName}`}</Button>
        <Button variant="secondary" disabled={pending} onClick={() => submit(false)}>Save for later</Button>
        <Button variant="ghost" href="/me/progress/assessments">Back</Button>
      </div>
      <p className="pl__s">Handing it in is final — if something’s wrong afterwards, {trainerFirstName} can correct it.</p>
    </div>
  );
}

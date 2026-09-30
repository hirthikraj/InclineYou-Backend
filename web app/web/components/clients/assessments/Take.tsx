'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { saveEntry } from '@/lib/assessments/actions';
import type { AnswerEntry, AssessmentDetailWire } from '@/lib/assessments/detail';
import type { QuestionWire } from '@/lib/assessments/vocab';
import { TopBar } from '@/components/shell/TopBar';
import { AffixField } from '@/web-components/ui/AffixField';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { ChoiceList } from '@/web-components/ui/ChoiceList';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { Message } from '@/web-components/ui/Message';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Scale } from '@/web-components/ui/Scale';
import { Textarea } from '@/web-components/ui/Textarea';

/**
 * TAKE AN ASSESSMENT — the trainer, in the session, with the tape in their hand.
 *
 * In v1 there is no client portal, so nothing comes back on its own: the
 * trainer measures and asks, and this is where it is written down. It is
 * `MUST-21`, the write path the whole assessment screen set was waiting for,
 * and `/today`'s *Assessment due* chip and row both lead here.
 *
 * ── ONE FORM, NOT A STEPPER ─────────────────────────────────────────────────
 *
 * The client's own check-in (`components/portal/checkin`) walks one ask at a
 * time because a client is alone with a phone. The trainer is the opposite:
 * they hold every reading at once, take them in the order the tape goes round
 * a body, and need to see the whole sheet to know what is left. So it is one
 * page, top to bottom, in the form's own order.
 *
 * ── TWO SAVES, ONE WRITE ────────────────────────────────────────────────────
 *
 * *Save for later* keeps the draft and stays here; *Done* finishes it and goes
 * to the assessment page. Both are the same `PUT …/entry` and both replace the
 * WHOLE entry, which is why `version` is tracked: every save returns the new
 * one and the next save sends it, so saving repeatedly needs no reload, while a
 * second tab that saved in between is a 412 that names itself rather than a
 * silent overwrite of real measurements.
 *
 * A DONE assessment opens here too, prefilled, as *Correct readings* — a
 * reading exists nowhere else, so this is the only way one is ever corrected.
 */

type Draft = { rating: number | null; text: string; ids: string[]; other: string };

const OTHER_ID = '__other';
const BLANK: Draft = { rating: null, text: '', ids: [], other: '' };

/** The spoken form of the catalogue's drawn unit — a reader says "kilograms", not "kg". */
const SPOKEN: Record<string, string> = {
  kg: 'kilograms',
  cm: 'centimetres',
  '%': 'percent',
  reps: 'repetitions',
  seconds: 'seconds',
  'out of 10': 'out of ten',
};

export function Take({ data, from = null }: { data: AssessmentDetailWire; from?: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const done = data.state === 'done';
  const client = data.client;

  const [version, setVersion] = useState(data.version);
  const [readings, setReadings] = useState<Record<string, string>>(
    () => Object.fromEntries(Object.entries(data.entry.readings).map(([k, v]) => [k, String(v)])),
  );
  const [answers, setAnswers] = useState<Record<string, Draft>>(() => {
    const out: Record<string, Draft> = {};
    for (const q of data.asked.questions) out[q.id] = fromEntry(q, data.entry.answers[q.id]);
    return out;
  });
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const detailHref = from
    ? `/clients/${from}/assessments/${data.id}`
    : `/clients/assessments/${data.id}`;

  function submit(complete: boolean) {
    setError(null);
    setSaved(null);

    const body: Record<string, number> = {};
    for (const m of data.asked.measurements) {
      const raw = (readings[m.key] ?? '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || n >= 100_000) {
        setError({ message: `${m.label}: enter a number above 0 and below 100,000.`, stale: false });
        return;
      }
      body[m.key] = n;
    }
    const entry: Record<string, AnswerEntry> = {};
    for (const q of data.asked.questions) {
      const a = toEntry(q, answers[q.id] ?? BLANK);
      if (a) entry[q.id] = a;
    }

    start(async () => {
      const res = await saveEntry(data.id, version, { readings: body, answers: entry, complete }, data.clientId);
      if (!res.ok || !res.data) {
        setError({ message: res.message ?? 'That did not save.', stale: res.code === 'PRECONDITION_FAILED' });
        return;
      }
      setVersion(res.data.version);
      if (complete) {
        router.push(detailHref);
        return;
      }
      setSaved(done ? 'Correction saved.' : 'Saved. You can keep going.');
    });
  }

  const empty = data.asked.measurements.length === 0 && data.asked.questions.length === 0;

  return (
    <>
      <TopBar
        crumb={client ? `Clients · ${client.name}` : 'Clients · Assessments'}
        title={data.name}
        titleHref={detailHref}
      />
      <main className="main body--flush asmv asmt" id="main-content">
        <PageHeader
          className="ph--asmv"
          crumbs={
            <Crumbs
              className="asmv__crumbs"
              items={[
                { label: 'Assessments', href: '/clients/assessments' },
                { label: data.name, href: detailHref },
                { label: done ? 'Correct' : 'Take' },
              ]}
            />
          }
          title={done ? `Correct ${data.name}` : `Take ${data.name}`}
          sub={client ? <span>{done ? 'Correcting' : 'For'} {client.name}</span> : undefined}
          actions={
            <>
              <Button variant="ghost" href={detailHref}>
                Back
              </Button>
              {!done && (
                <Button variant="secondary" onClick={() => submit(false)} disabled={busy || empty}>
                  Save for later
                </Button>
              )}
              <Button variant="primary" onClick={() => submit(true)} disabled={busy || empty}>
                {busy ? 'Saving…' : done ? 'Save correction' : 'Done'}
              </Button>
            </>
          }
        />

        <div className="asmv__body">
          {error && (
            <Message tone="err">
              {error.message}
              {error.stale && (
                <>
                  {' '}
                  <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                    Reload
                  </Button>
                </>
              )}
            </Message>
          )}
          {saved && <Message tone="ok">{saved}</Message>}
          {empty && (
            <Message tone="warn">
              This assessment asks for nothing — its form has no measurements and no questions.
              Edit the template and book a new one.
            </Message>
          )}

          <div className="asmv__cols">
            {data.asked.measurements.length > 0 && (
              <Card className="asmv__card">
                <CardHead title="Measurements" />
                <CardBody>
                  <div className="asmt__list">
                    {data.asked.measurements.map((m) => (
                      <AffixField
                        key={m.key}
                        label={m.label}
                        unit={SPOKEN[m.unit] ?? m.unit}
                        affix={m.unit || '·'}
                        side="trailing"
                        id={`take-${m.key}`}
                        inputMode="decimal"
                        disabled={busy}
                        value={readings[m.key] ?? ''}
                        onChange={(e) => setReadings({ ...readings, [m.key]: e.target.value })}
                      />
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}

            {data.asked.questions.length > 0 && (
              <Card className="asmv__card">
                <CardHead title="Questions" />
                <CardBody>
                  <div className="asmt__list">
                    {data.asked.questions.map((q) => (
                      <Ask
                        key={q.id}
                        q={q}
                        draft={answers[q.id] ?? BLANK}
                        busy={busy}
                        onDraft={(d) => setAnswers({ ...answers, [q.id]: d })}
                      />
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
          <p className="asmt__note">
            Leave anything blank that you did not take. Nothing here is sent to the client.
          </p>
        </div>
      </main>
    </>
  );
}

/** One question, in the control its kind calls for. */
function Ask({
  q,
  draft,
  busy,
  onDraft,
}: {
  q: QuestionWire;
  draft: Draft;
  busy: boolean;
  onDraft: (d: Draft) => void;
}) {
  if (q.kind === 'rating') {
    return (
      <div className="asmt__rate">
        {/* `Scale` only speaks its label (aria), so the question is drawn here. */}
        <p className="asmt__q">{q.text}</p>
        <Scale
          name={q.id}
          label={q.text}
          top={q.scale ?? 10}
          value={draft.rating}
          onChange={(n) => onDraft({ ...draft, rating: n })}
        />
      </div>
    );
  }
  if (q.kind === 'yesno') {
    return (
      <div className="asmt__rate">
        <p className="asmt__q">{q.text}</p>
        <ChoiceList
          name={q.id}
          label={q.text}
          value={draft.ids}
          onChange={(ids) => onDraft({ ...draft, ids })}
          options={[
            { id: 'yes', text: 'Yes' },
            { id: 'no', text: 'No' },
          ]}
        />
      </div>
    );
  }
  if (q.kind === 'text') {
    return (
      <Textarea
        label={q.text}
        rows={3}
        disabled={busy}
        value={draft.text}
        onChange={(e) => onDraft({ ...draft, text: e.target.value })}
      />
    );
  }
  if (q.kind !== 'choice') {
    /* A kind this build does not know draws as a written answer rather than
       crashing the sheet — the stored form is the assessment's own copy. */
    return (
      <Textarea
        label={q.text}
        rows={3}
        disabled={busy}
        value={draft.text}
        onChange={(e) => onDraft({ ...draft, text: e.target.value })}
      />
    );
  }
  return (
    <div className="asmt__rate">
      <p className="asmt__q">{q.text}</p>
        <ChoiceList
          name={q.id}
          label={q.text}
          multiple={q.allowMultiple}
          value={draft.ids}
          onChange={(ids) => onDraft({ ...draft, ids })}
          options={q.options ?? []}
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
    </div>
  );
}

/** A stored answer → the draft the controls edit. */
function fromEntry(q: QuestionWire, a: AnswerEntry | undefined): Draft {
  if (!a) return BLANK;
  if (q.kind === 'yesno') return { ...BLANK, ids: a.yes === undefined ? [] : [a.yes ? 'yes' : 'no'] };
  if (q.kind === 'rating') return { ...BLANK, rating: a.rating ?? null };
  if (q.kind === 'text') return { ...BLANK, text: a.text ?? '' };
  const ids = a.optionIds ?? [];
  return { ...BLANK, ids: a.text ? [...ids, OTHER_ID] : ids, other: a.text ?? '' };
}

/** A draft → the stored shape, or null when nothing was answered (nothing is sent for it). */
function toEntry(q: QuestionWire, d: Draft): AnswerEntry | null {
  if (q.kind === 'yesno') return d.ids[0] ? { yes: d.ids[0] === 'yes' } : null;
  if (q.kind === 'rating') return d.rating === null ? null : { rating: d.rating };
  if (q.kind === 'text') return d.text.trim() ? { text: d.text.trim() } : null;
  const ids = d.ids.filter((id) => id !== OTHER_ID);
  const custom = q.allowCustom && d.ids.includes(OTHER_ID) ? d.other.trim() : '';
  if (ids.length === 0 && !custom) return null;
  return { ...(ids.length > 0 ? { optionIds: ids } : {}), ...(custom ? { text: custom } : {}) };
}

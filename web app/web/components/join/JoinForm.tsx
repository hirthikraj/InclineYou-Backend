'use client';

import { useEffect, useState, useTransition } from 'react';

import { CODE_LENGTH } from '@/lib/auth/policy';
import { GENDERS } from '@/lib/clients/gender';
import { sendJoinCode, submitJoinRequest } from '@/lib/join/actions';
import { money, planLine, type JoinPlanWire, type JoinQuestion } from '@/lib/join/types';
import { OtpInput } from '@/components/auth/OtpInput';
import { QuestionAnswer, type AnswerWire } from '@/components/assessments/QuestionAnswer';
import { Button } from '@/web-components/ui/Button';
import { Checkbox } from '@/web-components/ui/Checkbox';
import { ChoiceList } from '@/web-components/ui/ChoiceList';
import { DateField } from '@/web-components/ui/DateField';
import { Field, TextField } from '@/web-components/ui/Field';
import { Message } from '@/web-components/ui/Message';
import { Select } from '@/web-components/ui/Select';

/**
 * THE JOIN FORM — details, then a code, then *sent*. (api-contract 1.2, jn-a2 and jn-a3.)
 *
 * What the person types stays in this component: it is theirs, in their own tab, and it goes to the server once, with the code.
 * What the server answers (the code's id) is kept sealed in an httpOnly cookie, never in the page — the invite's rule.
 *
 * The page never says "you've joined": a join is a request the trainer approves, and the last screen says exactly that, and
 * what happens next (they sign in on the ordinary login page once approved). The under-18 answer is the server's neutral one.
 */
type Step = 'form' | 'code' | 'sent';

const NO_PLAN = '__none';

export function JoinForm({
  slug,
  trainerFirstName,
  questions,
  plans,
  allowNoPlan,
  policyVersion,
  privacySummary,
}: {
  slug: string;
  trainerFirstName: string;
  questions: JoinQuestion[];
  plans: JoinPlanWire[];
  allowNoPlan: boolean;
  policyVersion: string;
  privacySummary: string[];
}) {
  const first = trainerFirstName;
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [plan, setPlan] = useState<string>(plans.length === 0 ? NO_PLAN : '');
  const [answers, setAnswers] = useState<Record<string, AnswerWire>>({});
  const [agreed, setAgreed] = useState(false);
  const [fit, setFit] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [wait, setWait] = useState(0);
  const [result, setResult] = useState<'received' | 'updated'>('received');
  const [pending, start] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date();
  const eighteen = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  const openAt = `${eighteen.getFullYear()}-${String(eighteen.getMonth() + 1).padStart(2, '0')}-${String(eighteen.getDate()).padStart(2, '0')}`;

  const missing = questions.filter((q) => q.required && !answered(answers[q.id]));
  const ready =
    name.trim() !== '' && /^[6-9]\d{9}$/.test(phone) && dob !== '' && plan !== '' && missing.length === 0 && agreed && fit && !pending;

  const e164 = `+91${phone}`;

  function sendCode(isResend = false) {
    if (!isResend && !ready) return;
    setError(null);
    start(async () => {
      const r = await sendJoinCode(slug, e164, dob, policyVersion);
      if (r.ok) {
        setWait(r.resendAfterSeconds);
        setCode('');
        setStep('code');
        return;
      }
      setError(r.message);
      if (r.kind === 'throttled' && r.retryAfterSeconds) setWait(r.retryAfterSeconds);
    });
  }

  function submit() {
    if (code.length !== CODE_LENGTH || pending) return;
    setError(null);
    setWrong(false);
    start(async () => {
      const r = await submitJoinRequest(slug, code, {
        phone: e164,
        name: name.trim(),
        email: email.trim() || null,
        dateOfBirth: dob,
        gender: gender || null,
        packId: plan === NO_PLAN ? null : plan,
        answers: Object.entries(answers)
          .filter(([, a]) => answered(a))
          .map(([questionId, a]) => ({ questionId, ...a, text: a.text?.trim() || undefined })),
        policyVersion,
        whatsappReminders: reminders,
      });
      if (r.ok) {
        setResult(r.result);
        setStep('sent');
        return;
      }
      setError(r.message);
      if (r.kind === 'wrong') {
        setWrong(true);
        setCode('');
      }
      // Anything about the form itself goes back to the form, where it can be fixed.
      if (r.kind === 'plan' || r.kind === 'invalid' || r.kind === 'restart') setStep('form');
    });
  }

  if (step === 'sent') {
    return (
      <div className="inv-start jn-sent" role="status">
        <h2 className="stp__hd" style={{ fontSize: 24 }}>{result === 'updated' ? 'Request updated' : 'Request sent'}</h2>
        <p className="stp__sub" style={{ marginTop: 0 }}>
          {first} will look at it and get back to you. Once they say yes, sign in on InclineYou with the number ending{' '}
          <b>{phone.slice(-4)}</b> — no new link needed.
        </p>
        <p className="inv-num">Nothing is charged here. If you picked a plan, you pay {first} directly.</p>
      </div>
    );
  }

  if (step === 'code') {
    return (
      <div className="inv-start">
        <h2 className="stp__hd" style={{ fontSize: 24 }}>Enter your code</h2>
        <p className="stp__sub" style={{ marginTop: 0 }}>
          We sent six digits on WhatsApp to the number ending <b>{phone.slice(-4)}</b>.
        </p>
        <div aria-live="polite">{error && <Message tone="err">{error}</Message>}</div>
        <div id="jn-code-l" className="sr-only">Six-digit code</div>
        <OtpInput value={code} onChange={setCode} onSubmit={submit} state={wrong ? 'err' : 'idle'} labelledBy="jn-code-l" disabled={pending} autoFocus />
        <div className="inv-actions">
          <Button variant="primary" wide disabled={code.length !== CODE_LENGTH || pending} loading={pending} onClick={submit}>
            {pending ? 'Sending…' : 'Send my request'}
          </Button>
        </div>
        <p className="inv-num">
          Nothing arrived?{' '}
          <button type="button" className="inv-link" onClick={() => sendCode(true)} disabled={wait > 0 || pending}>
            {wait > 0 ? `Send it again in ${wait}s` : 'Send it again'}
          </button>
          {' · '}
          <button type="button" className="inv-link" onClick={() => { setError(null); setStep('form'); }} disabled={pending}>
            Change my details
          </button>
        </p>
      </div>
    );
  }

  return (
    <form
      className="inv-start jn-form"
      onSubmit={(e) => {
        e.preventDefault();
        sendCode();
      }}
    >
      <h3 className="jn-h">Ask {first} to train you</h3>
      <div aria-live="polite">{error && <Message tone="err">{error}</Message>}</div>

      <TextField label="Your name" autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />

      <Field label="Mobile number" hint="We’ll send a code on WhatsApp to check it.">
        {(a) => (
          <span className="affix">
            <span className="affix__p">+91</span>
            <input
              className="ctl ctl--num"
              {...a}
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(-10))}
            />
          </span>
        )}
      </Field>

      <TextField
        label="Email (optional)"
        type="email"
        autoComplete="email"
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div className="fld">
        <span className="fld__l" aria-hidden="true">Your date of birth</span>
        <DateField id="jn-dob" label="Your date of birth" block value={dob} max={openAt} openAt={openAt} describedBy="jn-dob-h" onChange={setDob} />
        <p id="jn-dob-h" className="fld__h">You have to be 18 or over. Only {first} sees this.</p>
      </div>

      <Select
        label="Gender (optional)"
        value={gender}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setGender(e.target.value)}
        options={[{ value: '', label: 'Rather not say here' }, ...GENDERS]}
      />

      {(plans.length > 0) && (
        <div className="fld">
        <span className="fld__l" aria-hidden="true">Pick a plan</span>
        <ChoiceList
          name="jn-plan"
          label="Pick a plan"
          value={plan ? [plan] : []}
          onChange={(ids) => setPlan(ids[0] ?? '')}
          options={[
            ...plans.map((p) => ({
              id: p.id,
              text: (
                <span className="jn-plan">
                  <b>{p.name}</b>
                  <span className="jn-plan__l">{planLine(p)}</span>
                  <span className="jn-plan__a">{money(p.amount, p.currency)}</span>
                </span>
              ),
            })),
            ...(allowNoPlan ? [{ id: NO_PLAN, text: <span className="jn-plan"><b>Not sure yet</b><span className="jn-plan__l">Talk to {first} first</span></span> }] : []),
          ]}
        />
        </div>
      )}

      {/* The assessment's own answer controls (22 Nov 2026): the same yes/no, rating, text and multiple-choice a client
          uses on the portal, so a trainer's question behaves the same on both. */}
      {questions.map((q) => (
        <QuestionAnswer
          key={q.id}
          q={{ ...q, text: q.required ? q.text : `${q.text} (optional)` }}
          value={answers[q.id]}
          onChange={(v) =>
            setAnswers((all) => {
              const next = { ...all };
              if (v) next[q.id] = v;
              else delete next[q.id];
              return next;
            })
          }
        />
      ))}

      <section className="inv-sees" aria-labelledby="jn-sees-h">
        <h3 id="jn-sees-h" className="inv-sees__h">What {first} can see once you’re their client</h3>
        <ul>
          {privacySummary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <Checkbox
        className="inv-agree"
        align="start"
        checked={agreed}
        onChange={(e) => setAgreed(e.target.checked)}
        label={<>I agree to the privacy notice (version {policyVersion}).</>}
      />
      <Checkbox
        className="inv-agree"
        align="start"
        checked={fit}
        onChange={(e) => setFit(e.target.checked)}
        label={
          <>
            I’m fit to take part in exercise, I’ll tell {first} about any injury or health condition before we train, and I accept{' '}
            {first}’s coaching terms.
          </>
        }
      />
      <Checkbox
        className="inv-agree"
        align="start"
        checked={reminders}
        onChange={(e) => setReminders(e.target.checked)}
        label={<>Send me a WhatsApp reminder before each session, if {first} turns reminders on. (Optional.)</>}
      />

      <div className="inv-actions">
        <Button variant="primary" type="submit" wide disabled={!ready} loading={pending}>
          {pending ? 'Sending…' : 'Send me a code'}
        </Button>
      </div>
      <p className="inv-num">
        This sends {first} a request — nothing is charged and no account is made until they say yes.
        {missing.length > 0 && name && phone ? ` Still to answer: ${missing.map((q) => q.text).join(', ')}.` : ''}
      </p>
    </form>
  );
}

/** Whether an answer says anything: a yes or a no, a rating, a pick, or words. */
function answered(a: AnswerWire | undefined): boolean {
  if (!a) return false;
  return a.yes !== undefined || a.rating !== undefined || (a.optionIds?.length ?? 0) > 0 || !!a.text?.trim();
}

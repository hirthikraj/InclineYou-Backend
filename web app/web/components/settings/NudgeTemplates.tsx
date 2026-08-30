'use client';

import { useRef, useState, useTransition } from 'react';

import { resetNudgeTemplate, saveNudgeTemplate } from '@/lib/nudges/actions';
import { previewOf, unknownTokens } from '@/lib/nudges/preview';
import type { NudgeTemplate } from '@/lib/nudges/types';

/**
 * THE TEMPLATE LIBRARY — the only nudge screen in the product.
 *
 * There is no Nudges destination: the sending lives on the rows of the people it
 * is about. What is left is the WORDING, and wording is a setting — written once,
 * edited rarely, read by every button in the app. So it sits under
 * `/settings/nudges` and `/nudges` permanently redirects here.
 *
 * ── EIGHT CARDS, EACH ONE A BOX AND A PREVIEW ────────────────────────────────
 *
 * One card per template. The label and the purpose say when a trainer would send
 * it — the library is edited months before it is read back, so a row that only
 * says *Renewal* is a row they have to open to remember. The variables are chips
 * that INSERT at the cursor rather than instructions to type braces, because
 * `{}` on an Indian phone keyboard is two layers down and this screen is not
 * only opened at a desk.
 *
 * ── THE PREVIEW IS A SAMPLE AND SAYS SO ──────────────────────────────────────
 *
 * `lib/nudges/preview.ts` substitutes fictional values. It is not the renderer —
 * the server renders against the client's live figures, so the amount in a
 * payment reminder is the same number the money book shows. The preview exists
 * so a trainer can see the shape of the sentence before they find out by sending
 * it.
 *
 * ── SAVED PER TEMPLATE, NOT PER SCREEN ───────────────────────────────────────
 *
 * Eight boxes behind one Save would make an edit to one sentence a write of all
 * eight, and a failure on the seventh would leave the trainer unable to tell
 * which of their changes landed. Each card owns its own state, its own Save and
 * its own error line.
 *
 * `Reset` is drawn only on a card the trainer has actually overridden, which is
 * what `isDefault` is for: a Reset on an untouched template is a button that
 * does nothing, and a screen full of them teaches the trainer that the buttons
 * here are decorative.
 */
export function NudgeTemplates({ initial }: { initial: NudgeTemplate[] }) {
  return (
    <div className="ndgt">
      <div className="card">
        <div className="card__hd">
          <h2 className="card__t">How the messages are sent</h2>
        </div>
        <div className="card__b">
          <p className="small" style={{ lineHeight: 1.7 }}>
            Nothing here sends on its own. Pressing a nudge button anywhere in XRep opens
            <b> your own WhatsApp</b> with the message already typed — you read it, change
            anything you like, and press send. It goes from your number, which is the one
            your clients have saved.
          </p>
          <p className="small" style={{ lineHeight: 1.7, marginTop: 10 }}>
            Two limits are fixed and are not settings: messages are meant for{' '}
            <b>9am–8pm</b>, and XRep will stop asking you to chase somebody it knows you
            messaged in the last <b>7 days</b>. A limit with a text field beside it is not a
            limit.
          </p>
        </div>
      </div>

      {initial.map((template) => (
        <TemplateCard key={template.name} initial={template} />
      ))}
    </div>
  );
}

function TemplateCard({ initial }: { initial: NudgeTemplate }) {
  const [template, setTemplate] = useState(initial);
  const [body, setBody] = useState(initial.body);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const dirty = body.trim() !== template.body.trim();
  const strays = unknownTokens(body, template.variables.map((v) => v.token));

  /**
   * Insert at the caret, not at the end.
   *
   * A trainer clicking `{name}` while their cursor is mid-sentence means "here",
   * and appending to the end produces "Hi, hope the week is going well{name}" —
   * which they then have to cut and paste, which is worse than typing the braces.
   * Focus is returned and the selection collapsed after the token so they can
   * keep typing.
   */
  const insert = (token: string) => {
    const box = boxRef.current;
    if (!box) {
      setBody((b) => b + token);
      return;
    }
    const start = box.selectionStart ?? body.length;
    const end = box.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    setSaved(false);
    requestAnimationFrame(() => {
      box.focus();
      box.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveNudgeTemplate(template.name, body);
      if (result.ok && result.template) {
        setTemplate(result.template);
        setBody(result.template.body);
        setSaved(true);
      } else {
        setError(result.message ?? 'That did not save.');
      }
    });
  };

  const reset = () => {
    setError(null);
    startTransition(async () => {
      const result = await resetNudgeTemplate(template.name);
      if (result.ok && result.template) {
        setTemplate(result.template);
        setBody(result.template.body);
        setSaved(false);
      } else {
        setError(result.message ?? 'That did not reset.');
      }
    });
  };

  const boxId = `ndgt-${template.name}`;

  return (
    <div className="card mt3">
      <div className="card__hd">
        <h2 className="card__t">{template.label}</h2>
        {!template.isDefault && <span className="tag tag--info">Yours</span>}
        <span className="card__acts">
          {!template.isDefault && (
            <button className="btn btn--sm btn--ghost" type="button" onClick={reset} disabled={pending}>
              Reset to default
            </button>
          )}
          <button
            className="btn btn--sm btn--primary"
            type="button"
            onClick={save}
            disabled={pending || !dirty}
          >
            {pending ? 'Saving…' : !dirty && saved ? 'Saved' : 'Save'}
          </button>
        </span>
      </div>

      <div className="card__b">
        <p className="small" style={{ color: 'var(--tx-ink-3)', marginBottom: 10 }}>
          {template.purpose}
        </p>

        <label className="fld__l" htmlFor={boxId} style={{ display: 'block', marginBottom: 6 }}>
          The message
        </label>
        <textarea
          id={boxId}
          ref={boxRef}
          className="ctl ndgt__box"
          rows={3}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setSaved(false);
          }}
        />

        <div className="ndgt__vars">
          {template.variables.map((v) => (
            <button
              key={v.token}
              className="chip"
              type="button"
              onClick={() => insert(v.token)}
              title={`Insert — ${v.meaning}`}
            >
              <code>{v.token}</code>
              <span className="ndgt__mean">{v.meaning}</span>
            </button>
          ))}
        </div>

        {strays.length > 0 && (
          <p className="msg msg--warn mt2">
            <span>
              {strays.join(', ')} {strays.length === 1 ? 'is not a' : 'are not'} variable this
              message can fill — it will be sent exactly as written.
            </span>
          </p>
        )}

        {error && (
          <p className="msg msg--err mt2">
            <span>{error}</span>
          </p>
        )}

        <div className="ndgt__prev">
          <p className="ndgt__prevk">For example</p>
          <p className="ndgt__prevb">{previewOf(body)}</p>
        </div>
      </div>
    </div>
  );
}

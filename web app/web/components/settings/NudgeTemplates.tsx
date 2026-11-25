'use client';

import { useRef, useState, useTransition } from 'react';

import { resetNudgeTemplate, saveNudgeTemplate } from '@/lib/nudges/actions';
import { previewOf, unknownTokens } from '@/lib/nudges/preview';
import { whatsappPlain } from '@/lib/text/whatsapp';
import type { NudgeTemplate } from '@/lib/nudges/types';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Fold } from '@/web-components/ui/Fold';
import { Tag } from '@/web-components/ui/Tag';
import { Chip } from '@/web-components/ui/Chip';
import { Markup } from '@/web-components/ui/Markup';
import { MarkupField } from '@/web-components/ui/MarkupField';

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
      <Card title="How the messages are sent" className="ndgt__intro">
        {/* One sentence, then the rest on demand. Two paragraphs here put a 270px card between a phone's header and its first
            template, so the list started below the fold; the fixed limits are a thing to know, not a thing to read every visit. */}
        <p className="small" style={{ lineHeight: 1.7 }}>
          Nothing here sends on its own. A nudge button opens <b>your own WhatsApp</b> with the message already typed, and
          you press send, from the number your clients have saved.
        </p>
        <details className="rpt-why ndgt__limits">
          <summary>The two fixed limits</summary>
          <p>
            Messages are meant for <b>9am–8pm</b>, and InclineYou stops asking you to chase somebody it knows you
            messaged in the last <b>7 days</b>. A limit with a text field beside it is not a limit, so neither is a setting.
          </p>
        </details>
      </Card>

      {initial.map((template) => (
        <NudgeCard key={template.name} initial={template} />
      ))}
    </div>
  );
}

/** The wording, with each {token} drawn as the placeholder it is, so a collapsed row does not read as code. */
function TokenLine({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\{[a-z_]+\})/).map((part, i) =>
        /^\{[a-z_]+\}$/.test(part) ? (
          <code key={i} className="ndgt__tk">{part}</code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * How long a wording may be in this editor (9 Nov 2026). The server keeps 1000 on save, which is also the most a
 * logged message can hold — but filling the blanks in makes a message longer ({pay_by_upi} alone can add about a
 * hundred characters), so the editor stops at 750 and leaves the rest for the figures. A message that still comes
 * out over 1000 is refused when it is drafted (`422 NUDGE_TOO_LONG`), never cut.
 */
const MAX_WORDING = 750;

function NudgeCard({ initial }: { initial: NudgeTemplate }) {
  const [template, setTemplate] = useState(initial);
  const [body, setBody] = useState(initial.body);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /* Closed by default, all eight of them, and independent rather than an
     accordion. Closed because the page's first job is *which of these eight do
     I want* and eight open editors answer it with a wall; independent because
     a trainer rewording the pack reminder and the renewal nudge to match is
     comparing two sentences, and an accordion would take one away. */
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const editor = useRef<{ insert: (text: string) => void }>(null);

  const dirty = body.trim() !== template.body.trim();
  const strays = unknownTokens(body, template.variables.map((v) => v.token));
  const tooLong = body.trim().length > MAX_WORDING;

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
    if (editor.current) editor.current.insert(token);
    else setBody((b) => b + token);
    setSaved(false);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveNudgeTemplate(template.name, body, template.version);
      if (result.ok && result.template) {
        setTemplate(result.template);
        setBody(result.template.body);
        setSaved(true);
      } else {
        // Stale: take the newer version (so Save can go through) and keep the
        // typed text — it is the one thing that must not be lost.
        if (result.current) setTemplate(result.current);
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
    <Fold
      /* THE STATUS TAGS RIDE ON THE NAME (25 Nov 2026), not in the head's control slot: that slot sits after
         the chevron, so a customised row pushed its chevron left and the column of chevrons broke on exactly
         the rows a trainer had edited. A tag is not a control; next to the name is where it is read. */
      title={
        <>
          {template.label}
          {dirty && <> <Tag tone="warn">Unsaved</Tag></>}
          {!template.isDefault && <> <Tag>Yours</Tag></>}
        </>
      }
      /*
        ── THE HEAD CARRIES THE WORDING, NOT THE PURPOSE ────────────────────

        `.fold__s` is one ellipsised line, and there were two things that could
        go in it. The purpose says WHEN the message is sent; the label above it
        already answers that well enough to pick from a list of eight — *Pack
        running out*, *Payment due*, *Gone quiet*. What a trainer cannot guess
        from the label is what the sentence currently SAYS, which is the only
        reason this screen exists and the only thing they came to change.

        It reads the DRAFT, not the saved row, so a folded card shows the edit
        that is sitting in it rather than the version it is about to replace.

        OPEN, it swaps to the purpose — the message is in the textarea 40px
        below by then, so the head would have been saying it twice, and the
        purpose is the one thing the body no longer has to spend a line on.
        Both are a single line, so the head does not change height on a press.
      */
      sub={open ? template.purpose : <TokenLine text={whatsappPlain(body)} />}
      open={open}
      onOpenChange={setOpen}
    >
      {/*
        Two tracks: what the message IS on the left, what it comes out as on
        the right. Folded, this screen is a list; open, one row has the width
        of the page to spend, and spending it on a single 1375px-wide textarea
        was the measurement this pass started from.
      */}
      <div className="ndgt__ed">
        <div className="ndgt__w">
          {/* The purpose is in the head while this is open — see `sub`. */}
          {/* THE SAME EDITOR AS AN ASSESSMENT'S QUESTIONS (25 Nov 2026) — bold, italic and emoji — in WhatsApp's
              own markers, because this text is sent as a WhatsApp message: `*bold*` and `_italic_` arrive
              formatted, where the app's `**bold**` would arrive as asterisks. */}
          <MarkupField
            label="The message"
            hideLabel={false}
            dialect="whatsapp"
            apiRef={editor}
            className="ndgt__box"
            value={body}
            onChange={(next) => {
              setBody(next);
              setSaved(false);
            }}
          />
          {/* A counter rather than `maxLength`: maxLength cuts a paste without saying so, and a wording saved before
              the 750 limit must stay visible in full so it can be shortened. */}
          <p id={`${boxId}-count`} className={tooLong ? 'msg msg--warn mt2' : 'fld__h'} aria-live="polite">
            <span>
              {body.trim().length} / {MAX_WORDING}
              {tooLong && ' — shorten it to save. The names and amounts need room once they are filled in.'}
            </span>
          </p>

          <div className="ndgt__vars">
            {template.variables.map((v) => (
              <Chip
                key={v.token}
                /* Focus stays in the message, so the token lands at the caret rather than at the end. */
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(v.token)}
                title={`Insert — ${v.meaning}`}
              >
                <code>{v.token}</code>
                <span className="ndgt__mean">{v.meaning}</span>
              </Chip>
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

          {/* Moved out of the card header. A Save 1,300px from the box it
              writes was a control the trainer had to go and find; more to the
              point, `Fold`'s head is the fold, and a button inside it is
              interactive content inside interactive content. */}
          <div className="ndgt__acts">
            <Button variant="primary" size="sm" onClick={save} disabled={pending || !dirty || tooLong}>
              {pending ? 'Saving…' : !dirty && saved ? 'Saved' : 'Save'}
            </Button>
            {!template.isDefault && (
              <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
                Reset to default
              </Button>
            )}
          </div>
        </div>

        {/* THE SAME SHAPE AS THE EDITOR BESIDE IT (25 Nov 2026): a label above, then the box. The label used to
            sit INSIDE the preview's box, so the box started ~28px above the message box and the two first lines
            never met; now both labels share a line and both texts start on the same baseline. */}
        <div className="ndgt__prev">
          <p className="fld__l ndgt__prevk">For example</p>
          <div className="ndgt__prevbox">
            <p className="ndgt__prevb"><Markup value={previewOf(body)} dialect="whatsapp" /></p>
          </div>
        </div>
      </div>
    </Fold>
  );
}

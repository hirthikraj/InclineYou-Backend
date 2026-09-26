'use client';

import type { ReactNode } from 'react';

import type { PlanDiff } from '@/lib/programs/diff';
import { diffTone, kindLabel } from '@/lib/programs/diff';
import type { SaveState } from '@/lib/programs/draft';
import { CloseIcon } from '@/components/programs/Icons';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { DockPanel } from '@/web-components/ui/DockPanel';
import { Card } from '@/web-components/ui/Card';

import { firstName } from './PlanRail';

/**
 * WHAT THIS EDIT SESSION CHANGED — the review half of editing a client's copy.
 *
 * ── IT IS NOT `OriginPanel`, AND THE BASELINE IS THE WHOLE DIFFERENCE ───────
 *
 * The two panels render the same lines from the same `diffPlans`, and they
 * answer opposite questions because they are handed different bases:
 *
 * - `OriginPanel` diffs this copy against **the blueprint it came from**. Its
 *   question is *how is this person's plan tuned*, and its answer is stable for
 *   weeks at a time. It is a standing fact about the copy.
 * - this one diffs the draft against **the last state the server acknowledged**
 *   (`Draft.baseline`). Its question is *what am I about to do to them*, and it
 *   is empty the moment the trainer saves.
 *
 * Keeping both is deliberate. A trainer who deletes a cue they wrote last month
 * sees one line here (`Removed`) and one FEWER line there, and neither reading
 * substitutes for the other.
 *
 * ── ONE CONTENT, TWO CHROMES, AND THE REASON IS GEOMETRY ────────────────────
 *
 * `ChangeBody` and `ChangeFoot` are the panel. Everything around them is a
 * wrapper, and there are two because the two widths want different ones:
 *
 * - **desk — `ChangeSide`**, a card in the board's own `.ws__side` column, in
 *   place of `BalancePanel`. A dock would be the obvious choice and it was the
 *   first answer; it is the wrong one, and it was MEASURED. `.split:has(> .dock)`
 *   opens a **380px** third track while collapsing the plan rail returns only
 *   **300px**, so the review panel cost the board a net 80px — enough to tip the
 *   day cards from two lanes to one. The board got NARROWER for opening the
 *   thing that is supposed to sit beside it. In `.ws__side` the panel costs
 *   280px it was already spending on the balance.
 * - **phone — `ChangePanel`**, the dock, which under 900px is a full-screen
 *   sheet. There is no `.ws__side` there at all: the desk board is hidden and
 *   `PhoneProgram` draws in its place.
 *
 * The state both of them read lives in `ClientPlan`, so the two cannot disagree
 * about whether the client has been told.
 *
 * ── AND *NOTIFY* COMES AFTER THE SAVE, NOT INSIDE IT ────────────────────────
 *
 * The obvious shape is a *tell them* checkbox on the save. It is the wrong one.
 * A checkbox forces the decision at the moment the trainer is concentrating
 * hardest on the prescription itself, it is answered by whatever the box
 * happens to default to, and an unticked box is silent and unrecoverable: there
 * is no second chance to send a notification you did not know you declined.
 *
 * Saving and telling are also genuinely separate acts with different audiences.
 * Fixing a mistyped day label is a save nobody needs to hear about; adding a
 * deload week is a save that is meaningless unless they do. So the save lands
 * first, the foot then offers the send with the count in the label, and the
 * trainer chooses with the change list still in front of them.
 */

export interface ChangeState {
  clientName: string;
  /** The draft against the last acknowledged state. Never null: unlike the
   *  blueprint, a baseline always exists. */
  diff: PlanDiff;
  save: SaveState;
  saveError: string | null;
  /**
   * HOW MANY CHANGES THE LAST SAVE CARRIED, or null when this session has not
   * saved yet. Held by `ClientPlan` rather than derived here, because `diff`
   * goes to zero at the instant of the save and the whole post-save state needs
   * the number that just went over the wire. Derived it would print *Tell Arjun
   * about 0 changes.*
   */
  savedChanges: number | null;
  /** null while the send has not been asked for; then whether the client's own
   *  settings let it land. */
  notified: boolean | null;
  notifying: boolean;
  notifyError: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onNotify: () => void;
}

/** The save landed and nothing has been touched since. Both halves matter: a
 *  trainer who saves and keeps editing is back in the review state, and an
 *  offer to notify above a list of unsaved edits would be an offer to tell the
 *  client about work that is still in the browser. */
function settledOf(s: ChangeState): boolean {
  return s.savedChanges !== null && s.diff.total === 0 && s.save === 'clean';
}

function subOf(s: ChangeState): ReactNode {
  if (settledOf(s)) return <>Saved to {firstName(s.clientName)}&rsquo;s plan</>;
  if (s.diff.total > 0) {
    return <>Not saved yet. {firstName(s.clientName)} still sees the old plan.</>;
  }
  return <>Against the last saved version</>;
}

/* ══════════════════════════════════════════════════════════ the content ══ */

export function ChangeBody({ state: s }: { state: ChangeState }) {
  const settled = settledOf(s);
  const { diff, clientName, savedChanges, notified } = s;
  const shape = diff.lines.filter(l => l.kind === 'shape');
  const rows = diff.lines.filter(l => l.kind !== 'shape' && l.kind !== 'note' && l.kind !== 'alt');
  const forThem = diff.lines.filter(l => l.kind === 'note' || l.kind === 'alt');

  if (settled) {
    return (
      <Card as="section" tone="raise">
        <Card.Body>
          {/* THE SECOND SENTENCE FOLLOWS THE SEND. It read *they have not been
              told yet* whether or not they had, so the card contradicted the
              foot two inches below it the moment the notification went out. */}
          <p className="small">
            {savedChanges} {savedChanges === 1 ? 'change is' : 'changes are'} now in{' '}
            {firstName(clientName)}&rsquo;s plan.{' '}
            {notified === null
              ? `They have not been told about ${savedChanges === 1 ? 'it' : 'them'} yet.`
              : notified
                ? `${firstName(clientName)} has been told.`
                : `${firstName(clientName)} was not told, because plan notifications are off for them.`}
          </p>
        </Card.Body>
      </Card>
    );
  }

  if (diff.total === 0) {
    /* THE EMPTY STATE IS THE ONE A TRAINER SEES FIRST, so it says what the
       panel is for rather than reporting a zero. */
    return (
      <p className="pg__none">
        Nothing yet. Edit the board and every change shows up here, so you can read them before{' '}
        {firstName(clientName)} gets them.
      </p>
    );
  }

  /* GROUPED BY WHAT THEY ARE ABOUT, not listed flat — `OriginPanel` carries the
     argument: a copy with a cue on every row produces seventeen `note` lines,
     and seventeen of one kind interleaved with two of another is a list nobody
     finishes. */
  return (
    <>
      {shape.length > 0 && (
        <Card as="section" title="The shape">
          <Card.Body flush>
            <ul className="cplan__diff">
              {shape.map((line, i) => (
                <li key={`s${i}`}>
                  <Tag>Shape</Tag>
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      {rows.length > 0 && (
        <Card as="section" title="The prescription">
          <Card.Body flush>
            <ul className="cplan__diff">
              {rows.map((line, i) => (
                <li key={`r${i}`}>
                  {/* WEEK ONLY WHEN IT IS NOT WEEK 1 — on a block whose weeks all
                      repeat week 1, a *W1* on every line discriminates nothing. */}
                  <Tag tone={diffTone(line.kind)}>{kindLabel(line.kind)}</Tag>
                  <span>
                    {line.week > 1 && <b>W{line.week} · </b>}
                    {line.text}
                  </span>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      {forThem.length > 0 && (
        <Card as="section" title={`Written for ${firstName(clientName)}`}>
          <Card.Body flush>
            <ul className="cplan__diff">
              {forThem.map((line, i) => (
                <li key={`n${i}`}>
                  <Tag>{kindLabel(line.kind)}</Tag>
                  <span>
                    {line.week > 1 && <b>W{line.week} · </b>}
                    {line.text}
                  </span>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}
    </>
  );
}

/**
 * THE VERBS, AND THERE IS EXACTLY ONE AT A TIME. Review, then save, then tell.
 * A foot offering *Save* and *Notify* together would be offering to announce
 * work that is still in the browser.
 */
export function ChangeFoot({ state: s, onClose }: { state: ChangeState; onClose?: () => void }) {
  const settled = settledOf(s);
  const dirty = s.diff.total > 0;
  const busy = s.save === 'saving';

  if (settled) {
    return (
      <>
        {s.notifyError && (
          <p className="small pg__behindbad" role="status">
            {s.notifyError}
          </p>
        )}
        {s.notified === null ? (
          <>
            <p className="small">
              Sending puts one line in {firstName(s.clientName)}&rsquo;s notifications pointing at
              their plan. It does not quote what you changed.
            </p>
            <div className="tools pg__gap">
              {onClose && (
                <Button variant="secondary" size="sm" onClick={onClose} disabled={s.notifying}>
                  Not now
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={s.onNotify}
                disabled={s.notifying}
              >
                {s.notifying ? 'Sending…' : `Notify ${firstName(s.clientName)}`}
              </Button>
            </div>
          </>
        ) : (
          /* ONE RECEIPT, AND `notified: false` IS NOT AN ERROR. The save
             happened; the client has turned plan notifications off, which is a
             setting of theirs the trainer cannot and should not override. */
          <p className="small" role="status">
            {s.notified
              ? `Sent. ${firstName(s.clientName)} will see it next time they open the app.`
              : 'Nothing was sent, and that is their setting rather than a failure.'}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      {s.saveError && (
        <p className="small pg__behindbad" role="status">
          {s.saveError}
        </p>
      )}
      <div className="tools pg__gap">
        <Button variant="secondary" size="sm" onClick={s.onDiscard} disabled={!dirty || busy}>
          Discard
        </Button>
        <Button variant="primary" size="sm" onClick={s.onSave} disabled={!dirty || busy}>
          {/* THE COUNT IS IN THE LABEL, which is the one place it cannot be
              missed, and it stands down at zero rather than reading *Save 0
              changes* on a button nobody can press. */}
          {busy ? 'Saving…' : dirty ? `Save ${s.diff.total} ${s.diff.total === 1 ? 'change' : 'changes'}` : 'Save'}
        </Button>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════ desk — the board's own side ══ */

/**
 * THE REVIEW PANEL AS A BOARD COLUMN, where `BalancePanel` sits when the board
 * is not being reviewed.
 *
 * It takes the balance's place rather than joining it, and that is a judgement
 * about what a column is FOR rather than a way to save pixels. The balance
 * answers *is this week's volume sane* — a standing property of the
 * prescription, and the question a trainer asks while writing one. The changes
 * answer *what am I about to send* — and while that question is open it is the
 * only one that matters, because it is the one with a client on the other end
 * of it. Drawn together they would be two 280px columns competing for the same
 * glance, on a board that has just given up its left rail to make room.
 *
 * The balance is not lost: it stands down to `.wsbal`'s own strip above the
 * board, which is what `WeekBoard` already does whenever a dock is open.
 */
export function ChangeSide({ state }: { state: ChangeState }) {
  /* A FRAGMENT, NOT A CARD AROUND CARDS. `.ws__side` is already
     `display:grid;gap:12px;align-content:start` and its children are cards —
     the same slot `BalancePanel` fills. Wrapping these in one more card would
     nest a card inside a card for every group, which is two borders and two
     lots of `--w-cardpad` around a four-line list.

     So the header and the verbs are ONE card at the top of the column and the
     groups are its siblings under it, which is the arrangement the balance
     panel itself uses. No new class, and nothing here that `check-components`
     has to be told about. */
  return (
    <>
      <Card as="section">
        <Card.Head title="Your changes" />
        <Card.Body>
          <p className="small">{subOf(state)}</p>
          <ChangeFoot state={state} />
        </Card.Body>
      </Card>
      <ChangeBody state={state} />
    </>
  );
}

/* ══════════════════════════════════════════════ phone — the dock/sheet ══ */

export function ChangePanel({ state, onClose }: { state: ChangeState; onClose: () => void }) {
  return (
    <DockPanel label="What you have changed">
      <DockPanel.Head
        title="Your changes"
        sub={subOf(state)}
        actions={
          <Button
            variant="ghost"
            iconOnly
            label="Close"
            onClick={onClose}
            title={undefined}
            icon={<CloseIcon />}
          />
        }
      />
      <DockPanel.Body>
        <ChangeBody state={state} />
      </DockPanel.Body>
      <DockPanel.Foot stack>
        <ChangeFoot state={state} onClose={onClose} />
      </DockPanel.Foot>
    </DockPanel>
  );
}

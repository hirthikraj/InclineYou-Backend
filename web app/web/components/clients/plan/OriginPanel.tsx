'use client';

import { useState } from 'react';

import type { PlanDiff } from '@/lib/programs/diff';
import { diffTone, kindLabel } from '@/lib/programs/diff';
import { resetClientPlan } from '@/lib/programs/actions';
import { CloseIcon } from '@/components/programs/Icons';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { DockPanel } from '@/web-components/ui/DockPanel';
import { Card } from '@/web-components/ui/Card';

import { firstName } from './PlanRail';

/**
 * THIS COPY, AGAINST THE PLAN IT CAME FROM — and the one destructive button on
 * the screen.
 *
 * ── IT IS THE PUSH PANEL, SEEN FROM THE OTHER END ───────────────────────────
 *
 * `POST /v1/programs/:id/resync` is one route with two readings, and
 * `resetClientPlan`'s own note draws the line: from the blueprint it is *push
 * this to thirteen people*, and from inside one client's plan it is *throw away
 * what I wrote for this one person and take the blueprint again.* The second is
 * destructive in a way the first is not — the trainer pressing it is the author
 * of the work it deletes — so this panel does three things the push does not
 * have to:
 *
 * - it LISTS what would go, line by line, before anything is pressed;
 * - it says the count in the button itself, so the confirm cannot be read as
 *   *sync* by somebody skimming;
 * - it names the two things a reset does NOT touch, because the fear that stops
 *   a trainer using this is that it will move somebody's Tuesday or wipe their
 *   logged sets. It does neither: the schedule lives on the program's sessions
 *   and every set ever recorded belongs to the workout log.
 *
 * ── AND IT IS USEFUL WHEN NOTHING IS DIFFERENT ──────────────────────────────
 *
 * A copy that matches its blueprint still has a question worth asking of it —
 * *has the blueprint moved since?* — so the panel opens on either fact and the
 * empty state is a sentence rather than a blank.
 */
export function OriginPanel({
  clientId,
  clientName,
  programId,
  originName,
  originMoved,
  originEditedAt,
  diff,
  unsaved,
  onClose,
  onReset,
}: {
  clientId: string;
  clientName: string;
  programId: string;
  /** Null once the blueprint has been deleted — the copy survives it. */
  originName: string | null;
  originMoved: boolean;
  originEditedAt: number | null;
  diff: PlanDiff | null;
  /** The draft has edits that have not reached the server yet. A reset would
   *  race them, so the panel says so rather than firing into the race. */
  unsaved: boolean;
  onClose: () => void;
  onReset: (result: { removed: number; added: number }) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    const result = await resetClientPlan(clientId, programId);
    setBusy(false);
    if (result.ok) {
      setConfirming(false);
      onReset(result.value);
    } else setError(result.message);
  }

  const lines = diff?.lines ?? [];
  const shape = lines.filter(l => l.kind === 'shape');
  const rows = lines.filter(l => l.kind !== 'shape' && l.kind !== 'note' && l.kind !== 'alt');
  const forThem = lines.filter(l => l.kind === 'note' || l.kind === 'alt');

  return (
    <DockPanel label={`This plan against ${originName ?? 'the plan it came from'}`}>
      <DockPanel.Head
        title="What is different"
        sub={
          originName ? (
            <>
              {clientName}&rsquo;s copy, against <b>{originName}</b>
            </>
          ) : (
            <>The plan this was copied from has been deleted</>
          )
        }
        actions={
          <Button variant="ghost" iconOnly label="Close" onClick={onClose} title={undefined} icon={<CloseIcon />} />
        }
      />

      <DockPanel.Body>
        {/* THE BLUEPRINT MOVED, AND THIS COPY DID NOT. Drawn above the diff
            because it changes what the diff MEANS: these lines are measured
            against a blueprint that has itself been edited since, so a row
            listed as *added here* may be one the trainer has since added to the
            blueprint as well. */}
        {originMoved && (
          <Card as="section" tone="raise">
            <Card.Body>
              <p className="small">
                <b>{originName}</b> has been edited
                {originEditedAt ? ` ${onDate(originEditedAt)}` : ''} since this copy took it.
                Those edits are <b>not</b> in {firstName(clientName)}&rsquo;s plan and will not
                arrive on their own.
              </p>
            </Card.Body>
          </Card>
        )}

        {diff === null ? (
          <p className="pg__none">
            There is nothing to compare this with. The plan it was copied from has been deleted,
            which does not affect this copy.
          </p>
        ) : diff.total === 0 ? (
          <p className="pg__none">
            Nothing. This copy says exactly what <b>{originName}</b> says.
            {originMoved ? ' Take it again to pick up the edits above.' : ''}
          </p>
        ) : (
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
                        {/* WEEK IS PRINTED ONLY WHEN IT IS NOT WEEK 1, which is
                            law 3 doing its work: on a block whose weeks all
                            repeat week 1 there is one week of content, and a
                            *W1* on every line of it is thirteen tags that
                            discriminate nothing. */}
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
        )}
      </DockPanel.Body>

      {/* THE RESET, AT THE FOOT AND BEHIND A CONFIRM. Outside the scroller on
          purpose: it is the panel's one irreversible act, and a control that
          scrolls away is one a trainer hunts for — or worse, finds by accident
          while reading the list of what it would delete. */}
      {originName && (
        <DockPanel.Foot stack>
          {error && (
            <p className="small pg__behindbad" role="status">
              {error}
            </p>
          )}
          {confirming ? (
            <>
              <p className="small">
                This replaces {firstName(clientName)}&rsquo;s prescription with what{' '}
                <b>{originName}</b> says now
                {diff && diff.total > 0 ? (
                  <>
                    , and the <b>{diff.total} {diff.total === 1 ? 'change' : 'changes'}</b> listed
                    above go with it
                  </>
                ) : null}
                . Their <b>training days and times stay exactly as they are</b>, and every set they
                have already logged is untouched.
              </p>
              <div className="tools pg__gap">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                >
                  Keep this copy
                </Button>
                <Button variant="danger" size="sm" onClick={() => void reset()} disabled={busy}>
                  {busy ? 'Taking it…' : 'Take the plan again'}
                </Button>
              </div>
            </>
          ) : (
            <>
              {unsaved && (
                <p className="small cplan__unsaved">
                  You have edits that are still saving. They will be discarded too.
                </p>
              )}
              <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
                Take the plan again
              </Button>
            </>
          )}
        </DockPanel.Foot>
      )}
    </DockPanel>
  );
}

/* THE ROWS ARE GROUPED BY WHAT THEY ARE ABOUT, not listed flat. A copy the
   trainer has written a cue on every row of produces seventeen `note` lines,
   and seventeen of one kind interleaved with two of another is a list nobody
   finishes. The prescription first, because it is what changes what the client
   lifts; then the cues, which change what they hear. */

function onDate(at: number): string {
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

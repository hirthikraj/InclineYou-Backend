'use client';

import Link from 'next/link';

import type { ClientPlanData } from '@/lib/programs/api';
import type { PlanDiff } from '@/lib/programs/diff';
import { diffSummary } from '@/lib/programs/diff';
import { relativeDay } from '@/lib/programs/blueprint';
import { planHref, type PlanOrigin } from '@/lib/programs/plan-origin';
import { isoDateStr, Meter } from '@/components/clients/file/shared';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { KeyValueRow } from '@/web-components/ui/KeyValue';

/**
 * THE LEFT COLUMN OF A CLIENT'S PLAN — and the whole reason this screen is not
 * the builder with a different id in the URL.
 *
 * `/programs/:id` puts the SHELF here: the other blueprints, because a trainer
 * building a program moves between programs. Nobody moves between programs
 * here. A client has one plan running, the person it is for is the only context
 * that matters, and the two questions this column exists to answer are the ones
 * the builder's shelf cannot:
 *
 * 1 · **where did this come from, and has it moved since?** — the copy was
 *     taken from a blueprint at a moment in time, and the blueprint has kept
 *     changing. That is not an error (nothing propagates on its own, by
 *     design), but it is a fact a trainer must be able to see and act on.
 * 2 · **what have I changed for this person?** — the answer that makes
 *     *Take the blueprint again* a decision rather than a coin toss.
 *
 * Everything else here is the client's file in miniature: which week of the
 * block they are in, what they were on before, and a way back to all of it.
 */
export function PlanRail({
  collapsed = false,
  data,
  now,
  diff,
  moved,
  from = 'file',
  onOpenDiff,
}: {
  data: ClientPlanData;
  now: number;
  /** CARRIED, NOT RE-DERIVED. Every row below opens this same screen for a
   *  different block, so a link that dropped the parameter would hand the
   *  trainer a crumb back to the client file for the one plan they opened from
   *  `/programs` — the way out changing under them mid-read. */
  from?: PlanOrigin;
  /** The DRAFT against the blueprint — recomputed as the trainer types, which
   *  is why it is passed in rather than derived here. */
  diff: PlanDiff | null;
  /** The blueprint has changed since this copy last took it. */
  moved: boolean;
  onOpenDiff: () => void;
  /**
   * STAND THE WHOLE COLUMN DOWN — edit mode, and nothing else.
   *
   * Reading a client's plan, this column is the context: whose plan, which week
   * of it, what it was copied from, what they were on before. Editing it, every
   * one of those is a fact the trainer already has and none of them is a thing
   * they are about to change — while the board beside it is exactly what they
   * are here to work on, and 300px is a whole day card at the width `WeekBoard`
   * was measured at.
   *
   * The element stays MOUNTED and hidden rather than being left out by the
   * call-site, because `.split`'s first track is `var(--w-list)` and a missing
   * child leaves a 300px hole rather than closing it. `:has(> .cplan__l--off)`
   * collapses the track; `:has()` matches a `display:none` child, which is what
   * makes the pair work.
   *
   * The 900px rule already hides this column on a phone for the builder's own
   * reason, so this changes nothing there.
   */
  collapsed?: boolean;
}) {
  const { program, client, origin, history } = data;
  const block = weekOf(program, now);
  const past = history
    .filter(p => p.id !== program.id)
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <aside
      className={`split__l cplan__l${collapsed ? ' cplan__l--off' : ''}`}
      aria-label="This client and this plan"
    >
      <div className="cplan__lb">
        {/* WHOSE PLAN THIS IS, and the way back to the rest of their file. The
            name is a link rather than a heading with a link beside it: the
            trainer arrived from that file and will return to it, and a 38px row
            spent on a second control to do what the name can do is the trade
            the client file's own header already refused. */}
        <section className="cplan__who">
          <Link className="cplan__name" href={`/clients/${client.id}/program`}>
            {client.name}
          </Link>
          <p className="cplan__whos">
            {program.status === 'active' ? (
              <Tag tone="acc">Live plan</Tag>
            ) : (
              <Tag>{statusWord(program.status)}</Tag>
            )}
            {client.status === 'inactive' && <Tag tone="warn">Inactive client</Tag>}
          </p>
        </section>

        {/* WHICH WEEK OF THE BLOCK — the one figure the client file's plan tab
            leads on, repeated here because a trainer editing week 4 of an
            8-week block is making a different decision from one editing week 1
            of it. Clamped into the block for the reason `ProgramTab` states:
            *week 9 of 8* is the portal and the trainer disagreeing about the
            same plan. */}
        {block && (
          <section className="cplan__blk">
            <p className="cplan__wk">
              Week {block.current}
              {block.total && <span className="cplan__wko"> of {block.total}</span>}
            </p>
            {block.total && <Meter pct={Math.round((block.current / block.total) * 100)} />}
          </section>
        )}

        <section className="cplan__kv">
          {program.goal && <KeyValueRow k="Goal">{program.goal}</KeyValueRow>}
          {program.startDate && (
            <KeyValueRow k="Started">{isoDateStr(program.startDate)}</KeyValueRow>
          )}
          {program.endDate && <KeyValueRow k="Ends">{isoDateStr(program.endDate)}</KeyValueRow>}
        </section>

        {/* ── WHERE IT CAME FROM ───────────────────────────────────────────
            The two-table design, said in words on the one screen where it can
            be acted on. A copy with no blueprint behind it is not an error —
            `getClientPlan` guards that read for exactly this reason — so the
            block simply states the other thing that is true. */}
        <section className="cplan__org">
          <p className="cplan__k">Copied from</p>
          {origin ? (
            <>
              <p className="cplan__orgn">
                <Link href={`/programs/${origin.id}`}>{origin.name}</Link>
              </p>
              <p className="small cplan__orgs">
                {moved ? (
                  <>
                    The plan has changed since this copy took it &mdash; edited{' '}
                    {relativeDay(origin.updatedAt, now)}. Nothing has reached{' '}
                    {firstName(client.name)} unless you send it.
                  </>
                ) : (
                  <>This copy is level with the plan it came from.</>
                )}
              </p>
            </>
          ) : (
            <p className="small cplan__orgs">
              Nothing &mdash; the plan it was copied from has since been deleted. This copy is
              whole on its own and is not affected.
            </p>
          )}
        </section>

        {/* ── AND WHAT WAS CHANGED FOR THIS PERSON ─────────────────────────
            The screen's own answer to *is this still the plan, or is it
            theirs.* It is drawn as a FACT and never as a warning: tuning a copy
            is what per-client coaching is, and a yellow triangle over
            *Meera's shoulder* would be the product disapproving of good
            practice. */}
        {diff && (
          <section className="cplan__div">
            <p className="cplan__k">Against that plan</p>
            {diff.total === 0 ? (
              <p className="small cplan__orgs">
                Identical to it. Every edit you make here stays here.
              </p>
            ) : (
              <>
                <p className="cplan__divs">
                  Tuned for {firstName(client.name)} &mdash; <b>{diff.total}</b>{' '}
                  {diff.total === 1 ? 'change' : 'changes'}
                </p>
                <p className="small cplan__orgs">{diffSummary(diff)}</p>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={onOpenDiff}>
              {diff.total === 0 && !moved ? 'Compare with the plan' : 'What is different'}
            </Button>
          </section>
        )}

        {/* ── EVERY PLAN BEFORE THIS ONE ───────────────────────────────────
            The client file's timeline, narrowed to the rows that are also
            LINKS: every past block is a copy of its own and opens in this same
            editor, which is how a trainer answers *what did we do last time*
            without leaving the screen they are writing the next one on. */}
        {past.length > 0 && (
          <section className="cplan__hist">
            <p className="cplan__k">Before this</p>
            <ul className="cplan__histl">
              {past.map(p => (
                <li key={p.id}>
                  <Link href={planHref(client.id, p.id, from)}>{p.name}</Link>
                  <span className="small">
                    {p.startDate ? isoDateStr(p.startDate) : '—'}
                    {p.endDate ? ` – ${isoDateStr(p.endDate)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}

/** First name only, for a sentence. Their full name is at the top of the
 *  column; a sentence that says it three more times reads as a form letter. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** `ProgramTab`'s own derivation, and it has to stay its own: the week is
 *  counted from the start date in calendar weeks, clamped into the block, and
 *  `/me/plan` clamps it the same way so the trainer and the client cannot read
 *  two different weeks off one plan. */
function weekOf(
  program: { startDate: string | null; endDate: string | null },
  now: number,
): { current: number; total: number | null } | null {
  if (!program.startDate) return null;
  const startMs = new Date(program.startDate).getTime();
  if (Number.isNaN(startMs) || startMs > now) return null;
  const raw = Math.max(1, Math.floor((now - startMs) / (7 * 86_400_000)) + 1);
  let total: number | null = null;
  if (program.endDate) {
    const endMs = new Date(program.endDate).getTime();
    if (!Number.isNaN(endMs)) total = Math.max(1, Math.round((endMs - startMs) / (7 * 86_400_000)));
  }
  return { current: total ? Math.min(raw, total) : raw, total };
}

function statusWord(status: string): string {
  switch (status) {
    case 'active':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Finished';
    case 'cancelled':
      return 'Cancelled';
    case 'archived':
      return 'Archived';
    default:
      return status;
  }
}

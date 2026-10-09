'use client';

import { useRouter } from 'next/navigation';

import { ProgressBody, ProgressRanges, useProgressQuery } from '@/components/log/Progress';
import type { ProgressView } from '@/lib/log/log';

import { Blank } from './shared';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';

/**
 * PROGRESS — EXERCISE PROGRESS, AND ONLY THAT.
 *
 * ── THE TAB USED TO BE TWO SUBJECTS IN ONE PLACE ────────────────────────────
 *
 * It drew the workout console's volume, records and top-set sequence, and then
 * under them a `Measurements` card — every body metric the trainer had ever
 * taped, plus a *Recently recorded* grid of the last twelve raw readings — and
 * a `Bodyweight` card inside the chart grid drawing a figure the measurements
 * table restated 400px lower.
 *
 * Body progress has its own surfaces now (the Overview tab's Body card, the
 * Assessments tab and one check-in's Measurements panel), and a tab that
 * answers two questions answers neither first. So this one is **what the
 * client lifted**, and the change is not only a removal:
 *
 * · `Bodyweight` leaving closed a **147px void** in the right-hand track of the
 *   chart grid, measured at 1536×695 on every seeded client;
 * · the `Measurements` table was a four-column table in a 1,407px card whose
 *   ink ended at 507px — **900px of nothing** to the right of every row, which
 *   is `wide-table-void`'s defect at its widest in the product;
 * · and the width both of them were spending now goes to `Every movement`,
 *   which is nine exercises this tab counted in a tile and never drew.
 *
 * ── WHAT STAYS HERE, AND WHY IT IS HERE AND NOT IN THE HEADER ───────────────
 *
 * *Progress report* — the CLIENT's reading of this, built to leave the
 * building. It sits in the tools row rather than the file's header because this
 * tab is where a trainer is standing when they think of sending one, and the
 * header's four buttons already do not fit beside a name. It is drawn **whether
 * or not there is anything to chart**: a client with no set logs is exactly the
 * client whose attendance still makes a card worth sending.
 */
export function ProgressTab({
  clientId,
  progress,
  failed = false,
}: {
  clientId: string;
  progress: ProgressView | null;
  /** The read FELL OVER — which is not the same fact as *there is nothing here*. */
  failed?: boolean;
}) {
  const go = useProgressQuery(clientId);
  const router = useRouter();
  /* Nothing at all in the range: one calm card instead of four zero tiles and three
     *nothing here* cards. The range control stays unless it is already on `All`, because a
     client with nothing in eight weeks may have a year behind it. */
  const bare = !!progress && progress.sets === 0 && progress.movements.length === 0 && progress.weeks.length === 0;

  return (
    <>
      <div className="tools" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        {progress && (!bare || progress.range !== 'all') && <ProgressRanges range={progress.range} go={go} />}
        <span style={{ flex: 1 }} />
        {progress && !bare && (
          <span className="small" style={{ color: 'var(--tx-ink-3)' }}>
            {progress.weeks.length} week{progress.weeks.length === 1 ? '' : 's'} ·{' '}
            {progress.exerciseCount} exercise{progress.exerciseCount === 1 ? '' : 's'}
          </span>
        )}
        {/* On a phone the header already carries a *Report* button to the same place, directly above
            the tabs, so this one was a second verb for one noun on a line of its own (hidden ≤900px). */}
        <Button href={`/clients/${clientId}/report`} variant="secondary" size="sm" className="cfprog__rep">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M12 15V4" /><path d="M8 8l4-4 4 4" />
          </svg>
          Progress report
        </Button>
      </div>

      {failed ? (
        /* A FAILED READ IS NOT AN EMPTY CLIENT. This said *Nothing logged yet* when the server
           simply did not answer — a false claim about somebody's training. */
        <Card>
          <Blank>
            Progress could not be loaded just now. Nothing is lost.{' '}
            <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
              Try again
            </Button>
          </Blank>
        </Card>
      ) : bare ? (
        <Card>
          <Blank>
            {progress?.range === 'all'
              ? 'No sets logged yet. Volume, records and the top-set sequence appear once a session has sets in it.'
              : 'No sets logged in this range. Try All to look further back.'}
          </Blank>
        </Card>
      ) : progress ? (
        /* `.cfprog` scopes the narrow-window rule for `.stats--4` — see app.css.
           The console's own route keeps whatever it has; a pass about the client
           file does not get to restyle a screen it did not open. */
        <div className="cfprog">
          <ProgressBody data={progress} go={go} />
        </div>
      ) : (
        <Card>
          <Blank>Nothing logged yet — a chart needs a set behind it</Blank>
        </Card>
      )}
    </>
  );
}

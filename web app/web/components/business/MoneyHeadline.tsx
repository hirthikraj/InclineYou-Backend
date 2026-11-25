'use client';

import type { OverviewPackage, MoneySummary } from '@/lib/business/types';
import type { PaymentClaimWire } from '@/lib/claims/types';
import { rupees } from '@/lib/today/time';
import { Stat } from '@/web-components/ui/Stat';

/**
 * THE EAGLE VIEW'S FIRST LINE (23 Nov 2026, `release/business-module-plan.html`): what is waiting on the trainer about money,
 * as five figures that each open the page that owns them.
 *
 *   To confirm · Overdue · Due in 7 days · Collected this month · Gym owes you (only with a gym)
 *
 * Deliberately NOT moved by the period picker: these are facts about now ("who owes me today", "what came in this month"),
 * and a headline that changed when a trainer looked at June would stop being the answer to the question it is first for.
 * `month` is the server's read of the CURRENT month, which `getOverview` makes whatever the picker says.
 *
 * Overdue is the server's own figure (`now.overdue`, past the grace), so it agrees with the money summary everywhere;
 * *due in 7 days* is counted here off the same packages *Needs you* reads, from today to a week out.
 */
export function MoneyHeadline({
  claims,
  month,
  packages,
  today,
  gymOwes,
}: {
  claims: PaymentClaimWire[] | null;
  month: MoneySummary;
  packages: OverviewPackage[];
  /** yyyy-MM-dd in the workspace's zone. */
  today: string;
  /** What the gym owes as of the last closed month; null when the trainer has no gym arrangement. */
  gymOwes: number | null;
}) {
  const open = claims ?? [];
  const claimed = open.reduce((s, c) => s + Number(c.amount), 0);
  const weekOut = addDays(today, 7);
  const soon = packages.filter((p) => p.amountDue > 0 && p.dueDate !== null && p.dueDate >= today && p.dueDate <= weekOut);
  const dueSoon = soon.reduce((s, p) => s + p.amountDue, 0);
  const soonClients = new Set(soon.map((p) => p.clientId)).size;
  const now = month.now;

  return (
    <div className="mnyhd" role="group" aria-label="Money at a glance">
      <Stat
        label="To confirm"
        value={rupees(claimed)}
        detail={open.length === 0 ? 'Nobody waiting' : `${open.length} client${open.length === 1 ? '' : 's'} say${open.length === 1 ? 's' : ''} they paid`}
        tone={open.length > 0 ? 'acc' : 'neutral'}
        href={open.length > 0 ? '#to-confirm' : undefined}
      />
      <Stat
        label="Overdue"
        value={rupees(now.overdue)}
        detail={now.clientsOverdue === 0 ? 'Nobody late' : `${now.clientsOverdue} client${now.clientsOverdue === 1 ? '' : 's'} past the due date`}
        tone={now.overdue > 0 ? 'warn' : 'neutral'}
        href="/business/payments#owed"
      />
      <Stat
        label="Due in 7 days"
        value={rupees(dueSoon)}
        detail={soonClients === 0 ? 'Nothing falling due' : `${soonClients} client${soonClients === 1 ? '' : 's'}`}
        href="/business/payments#owed"
      />
      <Stat
        label="Collected this month"
        value={rupees(month.total.collected)}
        detail={`${month.total.paymentsCount} payment${month.total.paymentsCount === 1 ? '' : 's'}`}
        href="/business/payments"
      />
      {gymOwes !== null && (
        <Stat
          label="Gym owes you"
          value={rupees(gymOwes)}
          detail={gymOwes > 0 ? 'As of last month' : 'All settled'}
          tone={gymOwes > 0 ? 'warn' : 'neutral'}
          href="/business/gym"
        />
      )}
    </div>
  );
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

import { redirect } from 'next/navigation';

import { HomeView, type HomePay, type HomeWeek } from '@/components/portal/HomeView';
import type { MoneyWire } from '@/components/portal/money/MoneyView';
import { TopBar } from '@/components/shell/TopBar';
import { PortalHomeError, getPortalHome } from '@/lib/portal/home-api';
import { portalGet, type PlanWire } from '@/lib/portal/plan-api';
import { requirePortalSession } from '@/lib/portal/session';
import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Home · InclineYou' };

/**
 * `/me/today` — the client's home, on `GET /v1/portal/home` (api-contract 1.2, p-a2). The layout has already turned a paused or removed
 * client into their wall; a refusal that arrives here anyway (their arrangement changed between the two reads) does the same.
 *
 * The crumb says *Home* because the tab bar and the rail do: one destination, one name. The route keeps its old spelling.
 *
 * ── THE WEEK IS A SECOND READ, IN PARALLEL ───────────────────────────────────
 *
 * §1 of the portal spec asks Home for *"3 of 4 sessions this week"* and `p-a2` carries no count. `GET /v1/portal/plan` does carry
 * the programme's days with their state and the programme's current week, so the count is read off the plan the client is on — the
 * ARRANGEMENT, never the diary, so a cancellation cannot shrink the target (AGENTS.md, *Never shame*). It is fetched beside the home
 * read rather than after it, and a plan read that fails only takes the week card away: it is the one block on this screen that is
 * optional by construction.
 */
export const dynamic = 'force-dynamic';

function weekOf(plan: PlanWire | null): HomeWeek | null {
  const p = plan?.program;
  if (!p || p.currentWeek < 1) return null;
  const days = p.days.filter((d) => d.week === p.currentWeek);
  if (days.length === 0) return null;
  return {
    done: days.filter((d) => d.state === 'done').length,
    planned: days.length,
    week: p.currentWeek,
    weeks: p.weeks,
    days: days.map((d) => ({ name: d.name, state: d.state, at: d.at ?? null, sessionId: d.sessionId })),
  };
}

/* WHAT IS OWED, AND WHERE TO PAY IT (21 Nov 2026). `GET /v1/portal/money` already carries both: the balance on the client's
   packages and the trainer's UPI ID. Read beside the other two and optional like the week — a failed read only takes the prompt
   away — and only where the trainer shows money to this client (`visible`) and there is something to pay. */
function payOf(money: MoneyWire | null): HomePay | null {
  if (!money?.visible || !money.amountDue) return null;
  const due = Number(money.amountDue);
  if (!(due > 0)) return null;
  return { amountDue: due, currency: money.currency ?? 'INR', payTo: money.payTo ?? null };
}

export default async function Page() {
  const session = await requirePortalSession();
  // The layout has already drawn a failure in place of the shell; this is the type's other half, not a path.
  if (!session.ok) return null;

  const [homeRead, planRead, moneyRead] = await Promise.allSettled([
    getPortalHome(),
    portalGet<PlanWire>('/v1/portal/plan'),
    portalGet<MoneyWire>('/v1/portal/money?limit=1'),
  ]);

  if (homeRead.status === 'rejected') {
    const e = homeRead.reason;
    if (!(e instanceof PortalHomeError)) throw e;
    if (e.code === 'PORTAL_PAUSED') redirect('/sign-in/paused');
    if (e.code === 'PORTAL_REMOVED') redirect('/sign-in/removed');
    if (e.status === 401) redirect('/sign-in');
    return (
      <>
        <TopBar crumb="Home" title="Home" />
        <main className="main" id="main-content">
          <PageHeader className="ph--portal" title="Home" />
          <div className="body">
            <div className="portal col gap4">
              <EmptyState
                title="We couldn’t load your day just now"
                body="Nothing has been lost. Give it a moment and try again."
                action={<Button variant="primary" href="/me/today">Try again</Button>}
              />
            </div>
          </div>
        </main>
      </>
    );
  }

  const home = homeRead.value;
  const plan = planRead.status === 'fulfilled' && planRead.value.ok ? planRead.value.data : null;
  const money = moneyRead.status === 'fulfilled' && moneyRead.value.ok ? moneyRead.value.data : null;
  const first = (session.me.myDetails?.name ?? '').split(' ')[0] || 'there';
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: home.timezone }).format(
    new Date(home.now),
  );

  return (
    <>
      <TopBar crumb="Home" title="Home" />
      <main className="main" id="main-content">
        {/* The date alone: the trainer is named by their own note a few lines down, and in the hero. */}
        <PageHeader className="ph--portal" title={`Hi ${first}`} sub={today} />
        <div className="body">
          <HomeView home={home} week={weekOf(plan)} pay={payOf(money)} whatsappUrl={session.me.trainer?.whatsappUrl ?? null} />
        </div>
      </main>
    </>
  );
}

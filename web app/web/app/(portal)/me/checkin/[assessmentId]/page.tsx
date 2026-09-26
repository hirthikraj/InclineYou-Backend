import { Flow } from '@/components/portal/checkin/Flow';
import { TopBar } from '@/components/shell/TopBar';
import { PortalApiError, getPortalCheckIn } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';
import { Button } from '@/web-components/ui/Button';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Check-in · InclineYou' };

/**
 * §"assessments" · the client's check-in, at `/me/checkin/:id`.
 *
 * ── THE CHECK-IN HAS A URL AND THE STEP DOES NOT ────────────────────────────
 *
 * The workout flow's own rule, and trap 25's: *a place gets a URL, a moment
 * does not*. The check-in is a place — it is what a client comes back to
 * tomorrow, and every answer in it is on the server, so the same link opens the
 * same half-filled form on a phone and on a laptop. WHICH ask they are on is a
 * moment. Putting the step in the address would also cost a round trip per
 * question and make the back button undo a navigation rather than an answer.
 *
 * ── `/me/checkin`, NOT `/me/assessments` ────────────────────────────────────
 *
 * The wire says `assessment` because that is the table, and the trainer's half
 * says it on screen too — *Assessments* is the tab on a client's file. The
 * client's own word is a CHECK-IN: an assessment is something done TO you and a
 * check-in is something you send, which is the right way round for the half of
 * the product where the client is the author. `lib/portal/checkin.ts` carries
 * the same split for the three status words.
 *
 * ── ONE READ, AND IT IS THE WHOLE FORM ──────────────────────────────────────
 *
 * `GET /v1/me/assessments/{id}` returns the questions, the tapes, and whatever
 * has been answered so far. That is the screen-endpoint trade `lib/portal/api.ts`
 * allows itself for a workout, and for the same reason twice over: the caller
 * is somebody standing with a tape measure, and a flow that fetched each step
 * would put a spinner between one question and the next twenty-five times.
 */
export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  const result = await requirePortal();
  /* The layout has already drawn `Unavailable` for a failure — this branch is
     unreachable, and it is a return rather than a `!` for `/me/today`'s reason:
     an assertion would crash the page instead of the layout catching it. */
  if (!result.ok) return null;

  let data;
  try {
    data = await getPortalCheckIn(assessmentId);
  } catch (e) {
    /* Somebody else's check-in, one that was never sent, or a link that has
       gone. NOT the shell's `Unavailable`: the portal is working and one URL is
       wrong, which is a different sentence and a different way out — the shell
       stays up so the client can get home in one tap. */
    if (e instanceof PortalApiError && (e.status === 404 || e.status === 403)) {
      return (
        <>
          <TopBar crumb="Check-in" />
          <main className="main" id="main-content">
            <PageHeader title="Check-in" />
            <div className="body">
              <div className="portal">
                <EmptyState
                  title="That check-in is not here"
                  body="It may have been withdrawn, or the link is out of date. Anything you had already answered is safe."
                  action={
                    <Button variant="primary" href="/me/today">
                      Back to home
                    </Button>
                  }
                />
              </div>
            </div>
          </main>
        </>
      );
    }
    throw e;
  }

  const sent = data.completedAt !== null;

  return (
    <>
      {/* The crumb is *Check-in* on every one a client ever opens, so `title`
          carries which — the case `TopBar` documents the override for. */}
      <TopBar crumb="Check-in" title={data.name} />
      <main className="main" id="main-content">
        <PageHeader
          title={data.name}
          sub={sent ? 'Sent to your trainer' : `From ${result.me.trainer.name}`}
          crumbs={
            /* ── THE WAY BACK IS THE WAY IN, AND THE TWO ARE DIFFERENT ───────

               The way out that is where the eye already is: the tab bar is at
               the other end of the screen from a thumb mid-form, and `.ph`
               scrolls with the page — the workout flow makes the same call for
               the same two reasons.

               WHICH way out depends on the state, because the two states are
               reached from two places. An OPEN check-in is a task and it is
               opened from Home's card, so the crumb goes back to Home. A SENT
               one is a record, and the only screen that lists records is
               Progress → Check-ins — so it goes there rather than to a home
               screen that deliberately no longer mentions it. Nothing reads a
               referrer to work that out: the STATE decides, so the crumb is the
               same wherever somebody arrived from, which is the rule the
               session console's own crumb is built on. */
            <Crumbs
              items={
                sent
                  ? [
                      { label: 'Assessments', href: '/me/progress/assessments' },
                      { label: 'Sent' },
                    ]
                  : [{ label: 'Home', href: '/me/today' }, { label: 'Check-in' }]
              }
            />
          }
        />
        <div className="body">
          <Flow
            data={data}
            trainerFirstName={result.me.trainer.name.split(' ')[0]}
            /* The SERVER's instant, threaded down — `react-hooks/purity`
               refuses a `Date.now()` during render, and a stamp computed in the
               browser against server-rendered HTML disagrees with it. */
            now={result.now}
          />
        </div>
      </main>
    </>
  );
}

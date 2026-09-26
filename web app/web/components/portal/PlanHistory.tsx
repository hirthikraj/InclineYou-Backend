import type { MeWire } from '@/lib/portal/api';
import { pastPlanHref } from '@/lib/portal/plan-tabs';
import type { PastPlan } from '@/lib/portal/plan';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';

/**
 * §4 · Plan → **Past plans** — what you used to do.
 *
 * ── THE PORTAL COULD ANSWER THIS ABOUT MONEY AND NOT ABOUT TRAINING ─────────
 *
 * `/me/account` has listed a client's finished PACKAGES since the portal shipped,
 * so the product could say *what did I used to buy* and had no answer at all for
 * *what did I used to do*. Every client had exactly one program row and it was
 * always `active`.
 *
 * It is worth having for the reason §"Make invisible progress visible" gives
 * about plateaus: a client eight weeks into a block that feels hard benefits from
 * seeing the two blocks behind it, because the evidence that they have been at
 * this a while is not otherwise on any screen — Progress draws numbers, and this
 * draws the shape of the year.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * §1 · THERE IS NO ADHERENCE FIGURE ON THIS TAB, AND THERE MUST NOT BE
 *
 * This is the first backward-looking surface in the portal, and §1's rule is
 * unambiguous: *"No red 'you missed 3 workouts.' Guilt-based design produces
 * uninstalls, not attendance."* A completion percentage against a block somebody
 * finished in March is a mark for work they cannot go back and do — the one kind
 * of number this product has decided never to print.
 *
 * So a row says what the plan WAS — its name, when it ran and how long — and its
 * own page says the rest. Plus, where the record reaches that far back, how many
 * sessions are on it: as a COUNT and never as a rate,
 * and **null rather than zero** where the record does not reach. `PastPlan
 * .workoutCount` and the mock's own handler carry why: printing *0 workouts*
 * against a plan somebody actually trained is the screen accusing them of a gap
 * in its own data.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export function PlanHistory({
  me,
  plans,
  hasActive,
}: {
  me: MeWire;
  plans: PastPlan[];
  /** So the empty state can tell the two cases apart. */
  hasActive: boolean;
}) {
  const first = me.trainer.name.split(' ')[0];

  if (plans.length === 0) {
    return (
      <div className="portal">
        <Card>
          <CardBody>
            {/* Two different sentences, because they are two different facts. A
                client on their first block has nothing behind it YET, which is
                a normal beginning; a client with no plan at all is being told
                something else on the other two tabs and does not need it a
                third time here. */}
            <EmptyState
              inCard
              kind="first-run"
              title="No earlier plans yet"
              body={
                hasActive
                  ? `You are on your first block with ${first}. When they write you a new one, this is where the old one goes — nothing is thrown away.`
                  : `Nothing here yet. When ${first} writes you a plan and then replaces it, the earlier one stays on this screen.`
              }
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="portal col gap4">
      <Card>
        <CardHead title="Plans you have finished">
          <span className="small ink3">newest first</span>
        </CardHead>
        <CardBody flush>
          <ListRows label="Your earlier plans">
            {plans.map((p) => (
              <ListRow
                key={p.id}
                href={pastPlanHref(p.id)}
                title={p.name}
                /* ── TWO FACTS, NOT FOUR ──────────────────────────────────

                   This carried the dates, the length, the days a week AND the
                   session count, and `.lrow__s` ellipsises — which is why
                   `ListRow` was chosen, and which at 430px was already cutting
                   *12 sessions logged* off the end. **MEASURED: 34px over at
                   430, 74 at 390, 104 at 360.** A line that loses its last
                   clause on every phone is a line with too much in it, and the
                   clause it was losing is the one thing on the row a client
                   might feel good about.

                   So the sub is when it ran and how long, the count moves to
                   the trailing slot where it has its own space, and the days a
                   week and the goal move to the plan's own page — which draws
                   all four and has the room. */
                sub={[p.ran, p.weeks ? `${p.weeks} weeks` : null]
                  .filter(Boolean)
                  .join(' · ')}
                right={
                  /* A count, never a rate — see the block comment. Omitted
                     entirely where the record does not reach that far back,
                     because a zero here is an accusation rather than a fact. */
                  p.workoutCount !== null ? (
                    <span className="small ink3">
                      {p.workoutCount} {p.workoutCount === 1 ? 'session' : 'sessions'}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </ListRows>
        </CardBody>
        <CardBody divided>
          <p className="small">
            Everything you logged on these is still on your Progress screen — a plan
            ending does not take the work with it.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

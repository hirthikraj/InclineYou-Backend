import Link from 'next/link';

import { Chevron, Plus } from '@/components/shell/Icons';
import { DAY_MS, rupees, startOfDay, startOfWeek } from '@/lib/today/time';
import type { ClientFilePayload } from '@/lib/clients/client-api';

import { FollowUps } from './FollowUps';
import {
  BodyIcon,
  CalendarIcon,
  DumbbellIcon,
  ListIcon,
  dateStr,
  isoDateStr,
  num,
  shortTime,
} from './shared';

/**
 * OVERVIEW — THE ONE SCREEN A TRAINER READS BEFORE THEY WALK OVER.
 *
 * Package balance, next session, adherence, the live program, and the four
 * things they might do next.
 *
 * ── THE TWO STAT CARDS THAT USED TO BE HERE ARE GONE ────────────────────────
 *
 * *Owes you* and *Sessions left* were the top of this tab. They are in the
 * header now, where they are visible from all six tabs — and a figure drawn
 * twice on the same screen is a figure a reader has to check against itself.
 * What is left here is the same fact at more depth: the pack row says what the
 * balance is worth and when it ends, which the header's `8/12` cannot.
 *
 * ── ADHERENCE IS 30 DAYS AND THE HEADLINE IS A RATE ─────────────────────────
 *
 * It was `kept/total` over 7 days, which on a two-sessions-a-week client is a
 * denominator of two — one missed session reads as 50% and one flu week reads as
 * a crisis. Thirty days is roughly eight to twelve sessions, which is the
 * shortest window where the number means something. The seven-day figure is kept
 * beside it, because *this week* is still the question on a Wednesday.
 *
 * ── AND A CANCELLED SESSION IS IN NEITHER HALF ──────────────────────────────
 *
 * Kept and missed are the two outcomes that spent a session. A cancellation gave
 * the slot back, so it is not a miss and it is not a rest day either — the same
 * rule the week dots draw and `sessionPackLabel` writes out.
 */

type DotState = 'on' | 'miss' | 'rest' | 'upcoming';

const DOT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Row({
  label,
  value,
  meta,
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  hint?: string;
  href?: string;
}) {
  /* NO INLINE STYLES ON THESE TWO SPANS, and that is load-bearing rather than
     tidiness. They carried `flex:1` and `text-align:right`, which restate what
     `.lrow__m` and the sheet already say — and an inline declaration outranks
     every selector, so the narrow-window rule that stacks this row could not
     change either of them. FOUND BY RENDERING at 320px, where the label clipped
     under a rule that was firing and losing. It is the same defect this project
     already records for `PacksForm`'s three work-mode cards and for
     `/packages`' two-column grid. */
  const inner = (
    <>
      <span className="lrow__m">
        <span className="micro">{label}</span>
        <span className="lrow__v">{value}</span>
      </span>
      <span className="lrow__r">
        {meta && <span className="small">{meta}</span>}
        {hint && <span className="small mono cfrow__h">{hint}</span>}
      </span>
      {href && <Chevron size={14} />}
    </>
  );

  /* A row that navigates is a link; a row that only states a fact is not. The
     old file drew a chevron on all five and made none of them go anywhere,
     which is the "nineteen live buttons" defect in miniature. */
  return href ? (
    <Link className="lrow cfrow" href={href} style={{ minHeight: 58 }}>
      {inner}
    </Link>
  ) : (
    <div className="lrow cfrow" style={{ minHeight: 58 }}>
      {inner}
    </div>
  );
}

export function OverviewTab({ payload, now }: { payload: ClientFilePayload; now: number }) {
  const { client, packages, activePackagePayments, sessions, workouts, bodyMetrics, programs } =
    payload;

  const activePkg = packages.find((p) => p.status === 'active') ?? null;
  const billed = activePkg ? num(activePkg.amount) : 0;
  /*
   * SERVER-COMPUTED, and it used to be wrong here.
   *
   * This summed payments whose `status === 'confirmed'`. `PackageService`
   * writes **`'paid'`** on confirmation, so no payment ever matched: a client
   * who had paid in full showed as owing every rupee, on the strip a trainer
   * reads before walking over to them. `lib/money/compute.ts` had always
   * accepted both spellings, which is why the money book and the client file
   * disagreed about the same money.
   *
   * `amountPaid` / `amountDue` are now computed in SQL beside the payment rows
   * (`PackageService.PACKAGE_COLUMNS`, which counts both spellings and excludes
   * write-offs). The local sum survives only as the fallback for a backend that
   * predates V30 — and it takes both spellings now, so even the fallback is
   * right.
   */
  const paid = activePkg?.amountPaid != null
    ? num(activePkg.amountPaid)
    : activePackagePayments
        .filter((p) => p.status === 'paid' || p.status === 'confirmed')
        .reduce((s, p) => s + num(p.amount), 0);
  const owed = activePkg
    ? activePkg.amountDue != null
      ? num(activePkg.amountDue)
      : Math.max(0, billed - paid)
    : 0;

  const nextSession =
    sessions
      .filter((s) => s.scheduledAt > now && s.status === 'scheduled')
      .sort((a, b) => a.scheduledAt - b.scheduledAt)[0] ?? null;

  /* ── adherence, two windows ── */
  function adherence(days: number) {
    const from = now - days * DAY_MS;
    const window = sessions.filter((s) => s.scheduledAt >= from && s.scheduledAt <= now);
    const kept = window.filter((s) => s.status === 'done').length;
    const spent = window.filter((s) => s.status === 'done' || s.status === 'no_show').length;
    return { kept, spent, pct: spent > 0 ? Math.round((kept / spent) * 100) : null };
  }
  const month = adherence(30);
  const week = adherence(7);

  const lastWorkout = [...workouts].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  const latestWeight =
    [...bodyMetrics]
      .filter((m) => m.metricType === 'weight')
      .sort((a, b) => b.recordedAt - a.recordedAt)[0] ?? null;
  const activeProgram = programs.find((p) => p.status === 'active') ?? null;

  /* ── this week's dots ── */
  const weekStart = startOfWeek(now);
  const thisWeek = sessions.filter(
    (s) => s.scheduledAt >= weekStart && s.scheduledAt < weekStart + 7 * DAY_MS,
  );
  const keptThisWeek = thisWeek.filter((s) => s.status === 'done').length;
  const denominator =
    keptThisWeek +
    thisWeek.filter((s) => s.status === 'no_show').length +
    thisWeek.filter((s) => s.status === 'scheduled' && s.scheduledAt > now).length;
  const restDays =
    7 -
    new Set(thisWeek.filter((s) => s.status !== 'cancelled').map((s) => startOfDay(s.scheduledAt)))
      .size;

  const dots: DotState[] = Array.from({ length: 7 }, (_, i) => {
    const day = weekStart + i * DAY_MS;
    const on = thisWeek.filter((s) => startOfDay(s.scheduledAt) === day);
    if (on.length === 0) return 'rest';
    if (on.some((s) => s.status === 'done')) return 'on';
    if (on.some((s) => s.status === 'no_show')) return 'miss';
    if (on.every((s) => s.status === 'cancelled')) return 'rest';
    return 'upcoming';
  });

  return (
    <div
      className="cfgrid"
      style={{
        display: 'grid',
        gap: 12,
        alignItems: 'start',
        gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)',
      }}
    >
      <div>
        <div className="card">
          <div className="card__b card__b--flush">
            <Row
              label="Package balance"
              value={
                activePkg?.sessionsRemaining !== null && activePkg?.sessionsRemaining !== undefined ? (
                  <>
                    {activePkg.sessionsRemaining}
                    {activePkg.sessionsTotal !== null && (
                      <span className="ink3">/{activePkg.sessionsTotal}</span>
                    )}
                  </>
                ) : (
                  <span className="ink3">No pack</span>
                )
              }
              meta={
                activePkg ? (
                  <>
                    {activePkg.endDate ? `Ends ${isoDateStr(activePkg.endDate)}` : 'No end date'}
                    {owed > 0 ? ` · ${rupees(owed)} still owed` : ' · paid in full'}
                  </>
                ) : (
                  'Nothing live'
                )
              }
              hint={activePkg ? 'opens payments' : undefined}
              href={activePkg ? `/clients/${client.id}/payments` : undefined}
            />

            <Row
              label="Next session"
              value={
                nextSession ? (
                  `${dateStr(nextSession.scheduledAt)} ${shortTime(nextSession.scheduledAt)}`
                ) : (
                  <span className="ink3">None booked</span>
                )
              }
              meta={
                nextSession ? (
                  <>
                    {nextSession.dayLabel ?? nextSession.notes ?? '—'}
                    {nextSession.deliveryMode &&
                      ` · ${nextSession.deliveryMode === 'floor' ? 'Floor' : 'Remote'}`}
                    {nextSession.durationMinutes && ` · ${nextSession.durationMinutes} min`}
                  </>
                ) : (
                  'Nothing on the calendar'
                )
              }
              hint={nextSession ? 'opens the schedule' : undefined}
              href={nextSession ? '/schedule' : undefined}
            />

            <Row
              label="Adherence"
              value={
                month.pct !== null ? (
                  <>
                    {month.pct}
                    <span className="ink3">%</span>
                  </>
                ) : (
                  <span className="ink3">—</span>
                )
              }
              meta={
                month.pct !== null ? (
                  <>
                    {month.kept} of {month.spent} kept · last 30 days
                  </>
                ) : (
                  'Nothing in the last 30 days'
                )
              }
              hint={
                week.spent > 0 ? `${week.kept}/${week.spent} in the last 7` : undefined
              }
              href={`/clients/${client.id}/sessions`}
            />

            <Row
              label="Current program"
              value={activeProgram ? activeProgram.name : <span className="ink3">None assigned</span>}
              meta={
                activeProgram?.startDate
                  ? `Assigned ${isoDateStr(activeProgram.startDate)}`
                  : 'Training with no plan'
              }
              hint={activeProgram ? 'opens the program' : undefined}
              href={`/clients/${client.id}/program`}
            />

            <Row
              label="Last logged"
              value={
                lastWorkout ? (
                  dateStr(new Date(lastWorkout.sessionDate).getTime())
                ) : (
                  <span className="ink3">Never</span>
                )
              }
              meta={lastWorkout?.notes ?? 'session logged'}
              hint={lastWorkout ? 'opens the history' : undefined}
              href={lastWorkout ? `/clients/${client.id}/sessions` : undefined}
            />

            <Row
              label="Weight"
              value={
                latestWeight ? (
                  <>
                    {latestWeight.value}
                    <span className="ink3"> {latestWeight.unit}</span>
                  </>
                ) : (
                  <span className="ink3">—</span>
                )
              }
              meta={
                latestWeight
                  ? `Measured ${dateStr(latestWeight.recordedAt)}`
                  : 'Nothing measured yet'
              }
              hint="opens progress"
              href={`/clients/${client.id}/progress`}
            />
          </div>
        </div>
      </div>

      <div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card__hd">
            <p className="card__t">This week</p>
          </div>
          <div className="card__b">
            <div className="dots">
              {dots.map((state, i) => (
                <i
                  key={i}
                  className={
                    state === 'on' ? 'on' : state === 'miss' ? 'miss' : state === 'rest' ? 'rest' : undefined
                  }
                  style={
                    state === 'upcoming'
                      ? {
                          background: 'var(--tx-accent-soft)',
                          boxShadow: 'inset 0 0 0 1.5px var(--tx-accent)',
                        }
                      : undefined
                  }
                  title={`${DOT_DAYS[i]}${
                    state === 'on'
                      ? ' · kept'
                      : state === 'miss'
                        ? ' · missed'
                        : state === 'upcoming'
                          ? ' · booked'
                          : ' · rest day'
                  }`}
                  aria-label={`${DOT_DAYS[i]}, ${
                    state === 'on'
                      ? 'kept'
                      : state === 'miss'
                        ? 'missed'
                        : state === 'upcoming'
                          ? 'booked'
                          : 'rest day'
                  }`}
                />
              ))}
              <u>
                {denominator > 0 ? `${keptThisWeek}/${denominator} kept` : 'no sessions'}
                {restDays > 0 && ` · ${restDays} rest day${restDays !== 1 ? 's' : ''}`}
              </u>
            </div>
            <p className="small" style={{ marginTop: 12 }}>
              A rest day is absent from both halves — it is the plan working, not a gap
              in it. A cancelled session is in neither half either: the slot was given
              back.
            </p>
          </div>
        </div>

        {/* Quick actions. Every one of these goes somewhere that exists — the
            defect this half is named after runs the other way too. */}
        <div className="card">
          <div className="card__hd">
            <p className="card__t">Quick actions</p>
          </div>
          <div className="card__b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link className="btn btn--primary" href="/sessions/new">
              <DumbbellIcon />
              Log a session
            </Link>
            <Link className="btn btn--secondary" href="/schedule">
              <CalendarIcon />
              Book the next one
            </Link>
            <Link className="btn btn--secondary" href={`/clients/${client.id}/payments`}>
              <Plus size={15} />
              {activePkg ? 'Renew the pack' : 'Sell a pack'}
            </Link>
            <Link className="btn btn--secondary" href={`/clients/${client.id}/program`}>
              <ListIcon />
              {activeProgram ? 'Change the program' : 'Assign a program'}
            </Link>
            <Link className="btn btn--secondary" href={`/clients/${client.id}/progress`}>
              <BodyIcon />
              Record a measurement
            </Link>
          </div>
        </div>

        {/* The follow-up history, under the quick actions and in the same
            column, because both answer *what do I do about this person* where
            the left column answers *what is true about them*. */}
        <FollowUps
          clientId={client.id}
          clientName={client.name}
          entries={payload.nudges}
          now={now}
        />
      </div>
    </div>
  );
}

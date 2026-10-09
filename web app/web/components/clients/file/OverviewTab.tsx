import { Chevron, Clock, Plus } from '@/components/shell/Icons';
import { DAY_MS, daysBetween, formatMinute, rupees, startOfDay, startOfWeek } from '@/lib/today/time';
import { normaliseSlots, slotMinutes, type StandingSlot } from '@/lib/clients/booking';
import { packBand } from '@/lib/today/deck';
import type { ClientFilePayload } from '@/lib/clients/client-api';
import type { ProgressView } from '@/lib/log/log';
import { currentPack, isLive, packBalance } from '@/lib/clients/packs';
import { ResumeButton } from './ResumeButton';

import { NudgeButton } from '@/components/nudge/NudgeButton';

import { FollowUps } from './FollowUps';
import { CalendarIcon, ListIcon, dateStr, isoDateStr, num, shortTime } from './shared';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Figure, Figures } from '@/web-components/ui/Figures';
import { Change } from '@/web-components/ui/Change';
import { HeroCard } from '@/web-components/ui/HeroCard';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { Meter } from '@/web-components/ui/Meter';
import { Tag } from '@/web-components/ui/Tag';
import { WeekDots, type WeekDay } from '@/web-components/ui/WeekDots';

/**
 * OVERVIEW — THE ONE SCREEN A TRAINER READS BEFORE THEY WALK OVER.
 *
 * ── WHAT THIS WAS, AND WHY SIX ROWS WAS THE WRONG SHAPE ─────────────────────
 *
 * Until 19 Sep 2026 this tab was a single card of six rows — package balance,
 * next session, adherence, current plan, last logged, weight — each one 58px,
 * each one a label over a figure with a meta phrase ranged right, each one a
 * link to the tab that owns it. MEASURED at 1536×695 that produced:
 *
 *     six rows, identical weight                348px
 *     right column (dots, three buttons)        349px in a 658px track
 *     widest thing in that 658px track          278px — 53% of it was empty
 *     the money, six days overdue               a meta fragment, `₹6,400 pending`
 *     the client's GOAL                         not on the screen at all
 *     the phone                                 1,249px of scroll, 613 of it the card
 *
 * A row per fact is an INDEX, not a readout: it tells a trainer which tab to
 * open and nothing else, and it says the six things in one voice, so the
 * payment that went past its due date last Sunday reads exactly as loud as
 * *Measured 18 Sep*. The six facts are not equally urgent and they were drawn
 * as though they were.
 *
 * ── WHAT IT IS NOW: FOUR QUADRANTS, EACH ANSWERING ONE QUESTION ─────────────
 *
 * | | | |
 * | --- | --- | --- |
 * | top left | **when am I seeing them** | next session, and what is planned |
 * | top right | **do they owe me** | the pack, its balance, and how late it is |
 * | bottom left | **are they turning up** | the week, then thirty days of it |
 * | bottom right | **is it working** | the goal, and the body against it |
 * | full width | **what have I said to them** | the follow-up history |
 *
 * Nothing is lost: *last logged* is the foot of the week card, *current plan*
 * is the chip under the next session, *weight* is the figure the progress card
 * charts. Two facts are GAINED — the goal, which the client record has always
 * carried and this screen never said, and how many days past its due date the
 * money is, which is the difference between a number and a job.
 *
 * ── AND EVERY VERB IS NOW ON THE CARD THAT OWNS ITS NOUN ────────────────────
 *
 * The *Quick actions* card is gone. It was three buttons in a 658px row —
 * *Renew the pack*, *Change the plan*, *Record a measurement* — none of which
 * were near the figure that would make a trainer want them. `Renew` is on the
 * pack, `Change the plan` is on the session that runs it, `Record` is on the
 * chart it would add a point to. That is 117px of card reclaimed and three
 * shorter journeys; it is also the rule the header already follows for *Book*,
 * which is why that one is still not repeated here.
 *
 * ── THE DOTS ARE `WeekDots` NOW, AND THAT IS A CORRECTNESS FIX ──────────────
 *
 * The seven squares were hand-written `.dots` markup with the weekday only in a
 * `title` — so on a desk a trainer had to hover to learn which square was
 * Monday, and there was no *today* marker at all. `ui/WeekDots.tsx` has both,
 * plus the rule this screen was breaking: `.dots i.miss` paints
 * `--tx-danger-soft`, and §1 of the client spec is explicit that a missed
 * session is never red. The component draws a miss as the quietest cell in the
 * row. One family, both halves of the product.
 */

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** `slotWeekday`'s numbering is 1..7 = Monday..Sunday, so this is index + 1. */
const WEEKDAY_LABELS = NAMES;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * ADHERENCE IS 30 DAYS AND THE HEADLINE IS A RATE — unchanged from the version
 * this tab replaces, and the argument is worth keeping.
 *
 * It was `kept/total` over 7 days, which on a two-sessions-a-week client is a
 * denominator of two: one missed session reads as 50% and one flu week reads as
 * a crisis. Thirty days is roughly eight to twelve sessions, the shortest window
 * where the number means anything. The seven-day figure is kept beside it,
 * because *this week* is still the question on a Wednesday.
 *
 * A CANCELLED SESSION IS IN NEITHER HALF. Kept and missed are the two outcomes
 * that spent a session; a cancellation gave the slot back, so it is not a miss
 * and it is not a rest day either.
 */
function adherenceOver(
  sessions: ClientFilePayload['sessions'],
  now: number,
  days: number,
): { kept: number; spent: number; pct: number | null } {
  const from = now - days * DAY_MS;
  const window = sessions.filter((s) => s.scheduledAt >= from && s.scheduledAt <= now);
  const kept = window.filter((s) => s.status === 'done').length;
  const spent = window.filter((s) => s.status === 'done' || s.status === 'no_show').length;
  return { kept, spent, pct: spent > 0 ? Math.round((kept / spent) * 100) : null };
}

/**
 * The trainer's copy of `lib/portal/home.ts`'s `buildWeek`, and it is a copy
 * rather than an import for one hard reason: that module is `'server-only'` and
 * this tree is under `ClientFile`, which is `'use client'`. Importing it would
 * not compile.
 *
 * The rule is kept identical on purpose, including the one case that is easy to
 * get wrong: **today, booked and not yet logged, is `plan` and not `miss`** —
 * a cell that read *no session* at nine in the morning would be wrong about a
 * session at six in the evening. A cancelled day is `rest`: the slot was given
 * back, which is the same call the adherence window above makes.
 */
function buildWeek(
  sessions: ClientFilePayload['sessions'],
  agreed: Set<number>,
  now: number,
): WeekDay[] {
  const monday = startOfWeek(now);
  const today = startOfDay(now);
  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = monday + i * DAY_MS;
    const onDay = sessions.filter((s) => startOfDay(s.scheduledAt) === dayStart);
    const live = onDay.filter((s) => s.status !== 'cancelled');
    /* `agreed` is keyed 1..7 = Monday..Sunday, which is `slotWeekday`'s own
       numbering and this loop's index + 1. */
    const arranged = agreed.has(i + 1);

    let state: WeekDay['state'];
    if (live.some((s) => s.status === 'done')) state = 'done';
    /* A DAY THE ARRANGEMENT TRAINS ON IS NEVER A REST DAY, even with nothing
       booked on it. Seven anonymous squares reading *5 rest days* said the same
       thing about a client who agreed to two mornings and had a quiet week as
       about one who agreed to four and has had none of them booked. `plan` is
       the ring, which claims *this is a training day* and nothing about whether
       it has been honoured -- an unbooked Friday is not a failure on a Monday,
       and `WeekDots` draws no tone on it. */
    else if (live.length === 0) state = arranged ? 'plan' : 'rest';
    else if (dayStart >= today) state = 'plan';
    else if (live.some((s) => s.status === 'no_show')) state = 'miss';
    else state = 'plan';

    return { letter: LETTERS[i], name: NAMES[i], state, today: dayStart === today };
  });
}

/**
 * `Tuesdays and Thursdays at 10:00 AM` — the standing arrangement, in words.
 *
 * It is what step 3 of the add flow wrote and what `DiaryService.reconcile`
 * books against, and the file said it nowhere: a trainer looking at *Tuesday
 * 22 Sep* could not tell whether that is the regular slot or a one-off somebody
 * moved. One clause and the question is closed.
 *
 * The times are collapsed when every day shares one, because *Tuesdays at
 * 10:00 AM and Thursdays at 10:00 AM* is the same fact written twice, and that
 * is the ordinary case — a standing slot usually is one hour.
 */
function weekClause(slots: StandingSlot[]): string | null {
  if (slots.length === 0) return null;
  const ordered = [...slots].sort((a, b) => a.weekday - b.weekday || slotMinutes(a.time) - slotMinutes(b.time));
  const names = ordered.map((slot) => `${WEEKDAY_LABELS[slot.weekday - 1]}s`);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const times = new Set(ordered.map((slot) => slot.time));
  if (times.size === 1) return `${list} at ${formatMinute(slotMinutes(ordered[0].time))}`;
  return ordered
    .map((slot) => `${WEEKDAY_LABELS[slot.weekday - 1]} ${formatMinute(slotMinutes(slot.time))}`)
    .join(' · ');
}

/** `in 3 days`, `tomorrow`, `today`. The distance a trainer plans against. */
function whenPhrase(at: number, now: number): string {
  const d = daysBetween(now, at);
  if (d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return `in ${d} days`;
  if (d < 14) return 'next week';
  return `in ${Math.round(d / 7)} weeks`;
}

export function OverviewTab({
  payload,
  now,
  progress = null,
}: {
  payload: ClientFilePayload;
  now: number;
  progress?: ProgressView | null;
}) {
  const { client, packages, sessions } = payload;

  /* THE PACK THE NEXT SESSION COMES OFF, and the balance across every live one —
     `lib/clients/packs.ts` has the argument. This read `find(status === 'active')`,
     which the wire's newest-first order made the pack NOT being spent, and the card
     disagreed with the header (the same client read *Unlimited* in one and *—* in the
     other). The money below is the SUMS, for the same reason: the header adds every
     pack's `amountDue`, and a card that showed only one pack's owed beside a header
     that showed all of them was two answers to *do they owe me*. */
  const activePkg = currentPack(packages);
  const balance = packBalance(packages);
  const live = packages.filter(isLive);
  const billed = live.reduce((sum, p) => sum + num(p.amount), 0);
  /* Server-computed, never re-added from payments here: summing rows on the
     page is how every paid-up client once showed as owing everything. */
  const paid = live.reduce((sum, p) => sum + num(p.amountPaid), 0);
  const owed = packages.reduce((sum, p) => sum + num(p.amountDue), 0);
  /* How long it has been owed runs from the OLDEST due date among the packs still
     owing, which is the one a trainer is actually chasing. */
  const oldestDue =
    packages
      .filter((p) => num(p.amountDue) > 0 && p.dueDate)
      .map((p) => p.dueDate as string)
      .sort()[0] ?? null;

  const dueAt = oldestDue ? new Date(oldestDue).getTime() : null;
  const daysLate = dueAt !== null && owed > 0 ? daysBetween(dueAt, now) : 0;
  const overdue = daysLate > 0;

  const left = balance.left;
  const total = balance.total;
  /*
   * ONE RULE FOR *IS THIS PACK IN TROUBLE*, and it is `deck.ts`'s.
   *
   * This was a local `left <= 2`, which is the right threshold and only half
   * the question: `packBand` answers by SESSIONS and by DATE, whichever is
   * worse, and it is what Today's queue and the roster's tag already rank on.
   * Restating one of its three cases here is how a pack reads *fine* on the
   * file and *expiring* on the roster in the same minute.
   *
   * It also fixes a state this card drew nothing for: an EMPTY pack. The local
   * test was `packLow && left > 0`, so zero left — the most urgent pack there
   * is — got no tag at all.
   */
  const daysToEnd = activePkg?.endDate
    ? daysBetween(now, new Date(activePkg.endDate).getTime())
    : null;
  const band = left !== null ? packBand(left, daysToEnd) : null;
  const packLow = band === 'pack-empty' || band === 'pack-ending';
  const PACK_TAG: Record<string, { tone: 'warn' | 'danger'; label: string }> = {
    'pack-empty': { tone: 'danger', label: 'Nothing left' },
    'pack-ending': { tone: 'warn', label: 'Running out' },
    'pack-expiring': { tone: 'warn', label: 'Ends soon' },
  };
  const packTag = band ? PACK_TAG[band] : null;
  /* *Renew is for a pack that is ending; Add sessions is for one that is not* —
     the standing rule, asked of the same `packBand`. Both go to the same tab;
     what changes is what the trainer is being offered, and offering to RENEW a
     pack with eighteen sessions left is offering to sell a third one. */
  const packVerb = !activePkg ? 'Sell a pack' : band ? 'Renew' : 'Add sessions';

  /* A PAUSED CLIENT'S FILE ASKS ONE QUESTION: ARE THEY COMING BACK. */
  const paused = client.status === 'paused';
  const backAt = client.pausedUntil ? new Date(client.pausedUntil).getTime() : null;

  const nextSession =
    sessions
      .filter((s) => s.scheduledAt > now && s.status === 'scheduled')
      .sort((a, b) => a.scheduledAt - b.scheduledAt)[0] ?? null;

  /*
   * HOW LONG THE BALANCE LASTS, which neither figure on this card can say.
   *
   * `6` and `17 Oct` are two facts about the same pack and a trainer resolves
   * them against a third the screen was not carrying: how often this person
   * trains. Six left is three weeks on a two-a-week client and six days on a
   * daily one, and the renewal conversation happens at a DATE rather than at a
   * count.
   *
   * Drawn as *about*, always, and never as a date of its own: the arithmetic
   * assumes a week that runs exactly to plan, which no week does. It is a size,
   * not a deadline — the deadline is `endDate`, which is beside it.
   */
  const perWeek = client.schedule.sessionsPerWeek ?? null;
  const weeksLeft =
    left !== null && left > 0 && perWeek !== null && perWeek > 0
      ? Math.round(left / perWeek)
      : null;
  const runway =
    weeksLeft === null
      ? null
      : weeksLeft < 1
        ? `about a week left at ${perWeek} a week`
        : `about ${weeksLeft} week${weeksLeft === 1 ? '' : 's'} left at ${perWeek} a week`;

  const month = adherenceOver(sessions, now, 30);
  const week = adherenceOver(sessions, now, 7);

  /* Off the header's stats: the whole history, not this tab's four weeks. */
  const lastDoneAt = client.stats.lastDoneAt;
  const activeProgram = client.program;

  /* THE WEEK THAT WAS AGREED, which step 3 of the add flow wrote and which
     `DiaryService.reconcile` books against. It was visible nowhere on this tab,
     and it is the denominator every figure on the week card is implicitly
     measured against. `normaliseSlots` is the one reading of that column --
     shared with the flow that writes it, so the two cannot disagree. */
  const slots = normaliseSlots(
    client.slots.map((sl) => ({ weekday: sl.weekday, time: sl.start, templateDay: sl.programDay })),
  );
  const agreedDays = new Set(slots.map((slot) => slot.weekday));
  const arrangement = weekClause(slots);

  const days = buildWeek(sessions, agreedDays, now);
  const doneThisWeek = days.filter((d) => d.state === 'done').length;
  /* The denominator is what the week ASKED FOR, not what is left of it: the
     rest days are the plan working, so a two-a-week client on Wednesday reads
     `1 of 2`, never `1 of 7`. `sessionsPerWeek` is the client's own contract,
     the agreed days are the next best reading of it, and the booked cells are
     the fallback when there is neither. */
  const plannedThisWeek = Math.max(
    client.schedule.sessionsPerWeek ?? (agreedDays.size || days.filter((d) => d.state !== 'rest').length),
    doneThisWeek,
  );

  /* THE RECORDS THIS CARD DRAWS. The body is measured in assessments and nowhere
     else, so the Progress tab and the Assessments tab own it; what this card
     answers is *is the training working*, from the sets themselves. Ranked by
     records first, then by the day it was last done, and total-sorted by name so
     two movements that tie never swap between loads (trap 29). */
  const top = progress
    ? [...progress.movements]
        .sort(
          (a, b) =>
            b.records - a.records ||
            b.lastOn.localeCompare(a.lastOn) ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 4)
    : [];

  return (
    /* THE TRACKS ARE IN THE SHEET. Inline, `gridTemplateColumns` outranked the
       narrow-window rule that stacks this grid, which is why that rule once
       carried an `!important` — the sheet was arguing with a component it could
       not win against. `.cfgrid--ov` in app.css measures the ceiling and the
       two rows. */
    <div className="cfgrid cfgrid--ov">
      {/* ── 1 · WHEN AM I SEEING THEM ─────────────────────────────────────── */}
      {nextSession ? (
        <HeroCard
          quiet
          label={`Next session with ${client.name}`}
          kicker={`Next session · ${whenPhrase(nextSession.scheduledAt, now)}`}
          figure={shortTime(nextSession.scheduledAt).replace(/\s?[AP]M$/, '')}
          unit={shortTime(nextSession.scheduledAt).slice(-2)}
          name={`${DAY_NAMES[new Date(nextSession.scheduledAt).getDay()]} ${dateStr(
            nextSession.scheduledAt,
          )}`}
          detail={
            <>
              {nextSession.workout?.name ?? nextSession.notes ?? 'No day named'}
              {nextSession.deliveryMode &&
                ` · ${nextSession.deliveryMode === 'floor' ? 'In Person' : nextSession.deliveryMode === 'home_visit' ? 'Home visit' : 'Online'}`}
              {nextSession.durationMinutes && ` · ${nextSession.durationMinutes} min`}
            </>
          }
          /* The plan is a CHIP under the session rather than a row of its own,
             because *Full A* on the line above is a day OF it — the two facts
             only mean something together, and drawn 200px apart they were two
             things to read instead of one. */
          chips={
            activeProgram ? (
              <Tag tone="acc" href={`/clients/${client.id}/program`}>
                {activeProgram.name}
              </Tag>
            ) : (
              <Tag tone="warn" href={`/clients/${client.id}/program`}>
                No plan assigned
              </Tag>
            )
          }
          /* THE BAND IS THE SENTENCE THE CARD IS FOR, which is `HeroCard`'s own
             rule: *a countdown alone is a fact, a countdown plus the reason is
             a decision*. Here the reason is whether Tuesday at ten is the
             standing slot or something somebody moved — and with no
             arrangement on file it says that instead, because *booked by hand*
             is a real answer and a blank band is not. */
          band={{
            icon: <Clock size={15} />,
            text: arrangement ? (
              <>
                Standing slot: <b>{arrangement}</b>
              </>
            ) : (
              'No standing week agreed — every session on this client is booked by hand.'
            ),
          }}
          actions={
            <>
              <Button href="/schedule" variant="secondary" size="sm" icon={<CalendarIcon />}>
                Reschedule
              </Button>
              <Button
                href={`/clients/${client.id}/program`}
                variant="ghost"
                size="sm"
                icon={<ListIcon />}
              >
                {activeProgram ? 'Change the plan' : 'Assign a plan'}
              </Button>
            </>
          }
        />
      ) : (
        <HeroCard
          quiet
          label={paused ? `${client.name} is paused` : `No session booked with ${client.name}`}
          kicker={paused ? 'Paused' : 'Next session'}
          name={paused ? 'On hold' : 'Nothing booked'}
          detail={
            paused
              ? backAt === null
                ? 'Paused with no return date.'
                : backAt < now
                  ? `Was due back ${isoDateStr(client.pausedUntil as string)}.`
                  : `Due back ${isoDateStr(client.pausedUntil as string)}.`
              : activeProgram
                ? `${activeProgram.name} is assigned and nothing is on the calendar.`
                : 'No plan assigned and nothing on the calendar.'
          }
          band={{
            icon: <Clock size={15} />,
            tone: !paused && left !== null && left > 0 ? 'warn' : undefined,
            text:
              left !== null && left > 0 ? (
                <>
                  <b>
                    {left} session{left === 1 ? '' : 's'}
                  </b>{' '}
                  {paused ? 'are paid for and wait for them.' : 'are paid for and none are booked.'}
                </>
              ) : paused ? (
                'Nothing is booked while they are away.'
              ) : (
                'Book one to put this client back on the calendar.'
              ),
          }}
          actions={
            paused ? (
              <>
                {/* THE ONE LIME ON A PAUSED FILE. Bringing them back is the thing that
                    changes their situation; booking a session for somebody who is away
                    is the thing this used to offer. */}
                <ResumeButton clientId={client.id} />
                <Button
                  href={`/schedule?new=1&client=${client.id}`}
                  variant="secondary"
                  size="sm"
                  icon={<CalendarIcon />}
                >
                  Book a session
                </Button>
              </>
            ) : (
              <Button
                href={`/schedule?new=1&client=${client.id}`}
                variant="primary"
                size="sm"
                icon={<CalendarIcon />}
              >
                Book a session
              </Button>
            )
          }
        />
      )}

      {/* ── 2 · DO THEY OWE ME ────────────────────────────────────────────── */}
      <Card tone={overdue ? 'danger' : undefined} className="cfov__pack">
        <Card.Head
          className="card__hd--wrap"
          title={activePkg ? 'The pack' : 'No live pack'}
          /* THE VERB IS THE ONE THE CARD'S OWN STATE ASKS FOR, and getting
             this wrong is worse than drawing no verb: a pack whose payment
             went six days late was offering *Add sessions* as its primary,
             which is selling more to somebody who has not paid for what they
             have. Late money gets *Remind* — the payment-reminder nudge — and
             that is the product's own rule rather than a judgement made here:
             *"every other nudge button in the app is attached to a condition:
             the pack is running out, the money is late, they missed two. The
             button sits next to the thing that triggered it."* This is that
             condition, and until now the only payment reminder on the tab was
             six rows down inside a disclosure on the follow-up card.

             It is the SAME endpoint and therefore the same seven-day cooldown
             (`NudgeButton` reads it and stands itself down), so a trainer
             cannot spend the week's message twice by finding it twice. */
          actions={
            overdue ? (
              <NudgeButton
                clientId={client.id}
                clientName={client.name}
                template="payment_reminder"
                className="btn btn--sm btn--primary"
                showContactedNote={false}
                now={now}
              />
            ) : (
              <Button
                href={`/clients/${client.id}/payments`}
                variant="secondary"
                size="sm"
                icon={<Plus size={14} />}
              >
                {packVerb}
              </Button>
            )
          }
        >
          {/* BOTH TAGS, MONEY FIRST. They are two different problems with one
              pack — a payment that went late and a balance that is running out
              — and a card that draws only the worse of them tells a trainer to
              chase the money and says nothing about the renewal they are about
              to have the same conversation for. `.card__hd--wrap` is what makes
              two of them safe: §04's header is `nowrap`, and four controls in
              a 350px head are clipped by `.main`'s `overflow:hidden` rather
              than scrolled. */}
          {overdue && (
            <Tag tone="danger">
              {daysLate} day{daysLate === 1 ? '' : 's'} late
            </Tag>
          )}
          {packTag && <Tag tone={packTag.tone}>{packTag.label}</Tag>}
        </Card.Head>
        {activePkg ? (
          <>
            {/* THE TWO FIGURES THIS CARD IS ABOUT, and only one of them is in
                the header. `HeaderDetail` prints `6/8` on all six tabs; what it
                cannot print is the DATE the pack runs to, which is the half of
                the balance a trainer actually plans against — six left on a
                pack that ends next Friday and six left on one that runs to
                Christmas are different conversations and the same number. The
                file's own precedent allows the repeat: *"what is left here is
                the same fact at more depth"*.

                `flush`, because `.figs` brings its own padding and its own
                dividers; a 16px body around it would double the card's gutter
                on the first column. */}
            <Card.Body flush>
              <Figures>
                <Figure
                  label={balance.unlimited ? 'Sessions' : 'Sessions left'}
                  /* A monthly pack has no count to run down, and \u2014 beside the header's
                     *Unlimited* was two answers to one question. */
                  value={left ?? (balance.unlimited ? 'Unlimited' : '\u2014')}
                  of={total ?? undefined}
                  tone={left === 0 ? 'danger' : packLow ? 'warn' : 'neutral'}
                  /* The PACK, not the session history: this figure is the
                     balance on something somebody bought, and the tab that can
                     answer a question about it is Payments. */
                  href={`/clients/${client.id}/payments`}
                />
                <Figure
                  label={activePkg.endDate ? 'Runs to' : 'Ends'}
                  value={activePkg.endDate ? isoDateStr(activePkg.endDate) : 'Open'}
                />
              </Figures>
            </Card.Body>
            <Card.Body divided className="cfov__money">
              <KeyValueRow
                k="Collected"
                valueClassName={owed > 0 ? (overdue ? 'cfov__late' : 'cfov__owed') : undefined}
              >
                {rupees(paid)}
                {billed > 0 && <span className="small ink3"> of {rupees(billed)}</span>}
              </KeyValueRow>
              {/* HOW MUCH OF THE MONEY IS IN, as a bar. Two segments and not a
                  percentage: the question is *is this settled*, which a bar
                  answers without being read — and the LENGTH carries the state,
                  so it survives a reader who cannot separate red from green. */}
              <Meter
                className="cfov__paid"
                label="Collected against this pack"
                segments={[
                  { tone: overdue ? 'danger' : 'ok', value: paid, label: 'collected' },
                  { tone: 'dim', value: Math.max(0, billed - paid), label: 'outstanding' },
                ]}
                total={billed || 1}
              />
              <p className="small">
                {owed <= 0 ? (
                  'Paid in full.'
                ) : dueAt === null ? (
                  <>{rupees(owed)} outstanding, with no due date set.</>
                ) : overdue ? (
                  /* THE SENTENCE THE OLD ROW COULD NOT SAY. `dueDate` has been
                     on the wire since V30 and this tab read none of it, so a
                     payment that went past its date last Sunday drew the same
                     phrase as one raised this morning. */
                  <>
                    <b className="cfov__late">
                      {rupees(owed)} was due {isoDateStr(oldestDue as string)}
                    </b>{' '}
                    — {daysLate} day{daysLate === 1 ? '' : 's'} ago.
                  </>
                ) : (
                  <>
                    {rupees(owed)} due {isoDateStr(oldestDue as string)}.
                  </>
                )}
              </p>
            </Card.Body>
            {/* `Card.Band` and not another paragraph: the runway is the pack's
                small print, and a band is the part the card already owns for it
                — the card's left edge without the body's full 16px. */}
            <Card.Band>
              <span className="small">
                {activePkg.startDate && activePkg.endDate
                  ? `${isoDateStr(activePkg.startDate)} – ${isoDateStr(activePkg.endDate)}`
                  : 'Open-ended'}
                {runway && ` · ${runway}`}
              </span>
            </Card.Band>
          </>
        ) : (
          <Card.Body>
            <p className="small">
              {client.name.split(' ')[0]} has no pack running, so nothing on the calendar is paid
              for.
            </p>
          </Card.Body>
        )}
      </Card>

      {/* ── 3 · ARE THEY TURNING UP ───────────────────────────────────────── */}
      <Card className="cfov__week">
        <Card.Head
          className="card__hd--wrap"
          title="Turning up"
          actions={
            <Button href={`/clients/${client.id}/sessions`} variant="ghost" size="sm">
              All sessions
              <Chevron size={13} />
            </Button>
          }
        >
          {/* WHAT THE WEEK WAS SUPPOSED TO BE, which is the fact the seven
              cells below are implicitly measured against and which this tab
              said nowhere. A NEUTRAL tag where no week is agreed: step 3 of
              the add flow is optional and a trainer who books by hand has not
              made a mistake. */}
          {agreedDays.size > 0 ? (
            <Tag tone="acc">
              {agreedDays.size} day{agreedDays.size === 1 ? '' : 's'} a week
            </Tag>
          ) : (
            <Tag>Booked by hand</Tag>
          )}
        </Card.Head>
        <Card.Body>
          {/* `0 of 0 this week` IS NOT A SENTENCE, and it is what `WeekDots`
              prints for a client with no arrangement and nothing booked — an
              invited row, or somebody added on a Saturday whose first session
              is a week on Monday. Seven identical rest cells under it claim
              *the plan asked for nothing*, which is true of the diary and
              false about the person. So the row is not drawn at all and the
              card says which of the two it is. */}
          {plannedThisWeek === 0 && doneThisWeek === 0 ? (
            <p className="small">
              {agreedDays.size === 0
                ? 'No standing week agreed and nothing booked, so there is nothing to keep this week.'
                : 'Nothing booked this week.'}
            </p>
          ) : (
            <WeekDots days={days} done={doneThisWeek} planned={plannedThisWeek} />
          )}
        </Card.Body>
        <Card.Body divided className="cfov__adh">
          <div className="cfov__adhhd">
            <span className="micro">Adherence · last 30 days</span>
            <b className="cfov__adhv">
              {month.pct !== null ? (
                <>
                  {month.pct}
                  <span className="ink3">%</span>
                </>
              ) : (
                <span className="ink3">—</span>
              )}
            </b>
          </div>
          {month.pct !== null ? (
            <>
              <Meter
                label="Sessions kept in the last thirty days"
                /* `warn` UNDER 70 AND NEVER `danger`. The same never-shame rule
                   `WeekDots` draws a miss by: a rate is a conversation to have,
                   not a failure to flag in red on somebody's file. */
                segments={[
                  { tone: month.pct >= 70 ? 'ok' : 'warn', value: month.kept, label: 'kept' },
                  { tone: 'dim', value: month.spent - month.kept, label: 'missed' },
                ]}
                total={month.spent}
              />
              <p className="small ink3">
                {month.kept} of {month.spent} kept
                {week.spent > 0 && ` · ${week.kept}/${week.spent} in the last 7 days`}
              </p>
            </>
          ) : (
            <p className="small ink3">Nothing scheduled in the last 30 days.</p>
          )}
        </Card.Body>
        <Card.Band>
          <span className="small">
            {lastDoneAt
              ? `Last logged ${dateStr(lastDoneAt)}`
              : 'No session logged yet'}
          </span>
        </Card.Band>
      </Card>

      {/* ── 4 · IS IT WORKING ─────────────────────────────────────────────── */}
      {/* EXERCISE RECORDS, NOT THE BODY. A body is measured in an assessment and nowhere
          else (`body_metric` is gone), so a weight and a tape here were readings the trainer
          could neither take nor correct from this screen. What a trainer CAN see move from
          here is the lift, and a personal best is the figure a client is told first.
          Nothing on it carries a tone: a held lift is a state, not a failure. */}
      <Card className="cfov__rec">
        <Card.Head
          className="card__hd--wrap"
          title="Exercise records"
          actions={
            <Button href={`/clients/${client.id}/progress`} variant="secondary" size="sm">
              All progress
            </Button>
          }
        />
        {!progress ? (
          <Card.Body>
            <p className="small ink3">Records could not be loaded just now. Progress has the full history.</p>
          </Card.Body>
        ) : top.length === 0 ? (
          <Card.Body>
            <p className="small ink3">
              No sets logged yet. Personal bests appear here once a session has been logged.
            </p>
          </Card.Body>
        ) : (
          <Card.Body flush>
            <ol className="cfxr">
              {top.map((m) => (
                <li key={m.exerciseId} className="cfxr__r">
                  <span className="cfxr__n">
                    <b>{m.name}</b>
                    <span className="small ink3">
                      {m.records > 0
                        ? `${m.records} ${m.records === 1 ? 'record' : 'records'} · `
                        : ''}
                      last {isoDateStr(m.lastOn)}
                    </span>
                  </span>
                  <Change from={m.from === m.to ? null : m.from} to={m.to} unit={m.unit} />
                </li>
              ))}
            </ol>
          </Card.Body>
        )}
        {progress && progress.records > 0 && (
          <Card.Band>
            <span className="small">
              {progress.records} {progress.records === 1 ? 'record' : 'records'} across{' '}
              {progress.exerciseCount} {progress.exerciseCount === 1 ? 'movement' : 'movements'}
            </span>
          </Card.Band>
        )}
      </Card>

      {/* ── 5 · WHAT HAVE I SAID TO THEM ──────────────────────────────────── */}
      <FollowUps
        clientId={client.id}
        clientName={client.name}
        entries={payload.nudges}
        now={now}
      />
    </div>
  );
}

'use client';

import Link from 'next/link';

import type { Deck, DeckSession, RunningSession } from '@/lib/today/deck';
import { NEXT_GRACE_MS } from '@/lib/today/deck';
import type { DayMoney, Gap } from '@/lib/today/day';
import { GAP_FOLD_MIN, gapWorth, sellableNote } from '@/lib/today/day';
import {
  WEEKDAYS_LONG,
  formatMinute,
  formatSpan,
  isoWeekday,
  minuteOfDay,
  rupees,
} from '@/lib/today/time';
import { MODE_LABELS, type DeliveryMode } from '@/lib/today/mode';
import {
  Calendar, Check, Clock, No, Note, Pin, Play, Plus, Rupee, Warn,
} from '@/components/shell/Icons';
import { Elapsed, Relative, elapsedMinutes, minutesUntil } from './Clock';
import { NudgeButton } from '@/components/nudge/NudgeButton';

/**
 * FOUR STATES, ONE SLOT — plus the empty one the phone also ships.
 *
 * `Hero.tsx` on the phone: "The 62px display figure is the same in every state.
 * It is the only element on the screen readable at arm's length on a gym floor,
 * which is the whole reason it is that size."
 *
 * 44px here, and the stylesheet carries the arithmetic: the reason for 62 is
 * reading distance on a gym floor, and a desk does not have it. The reason for a
 * display figure AT ALL is that the trainer walks past this screen, and that
 * survives the change of distance. Measured against the 27px stat value it is
 * still unmistakably the largest thing on the page.
 *
 * The kicker is the only thing that changes tone between states. The figure stays
 * the same size in every one of them — that is the phone's rule and the only one
 * of its decisions that survives the move to a desk unchanged.
 *
 * ── THE BAND UNDER THE FIGURE IS THE POINT OF THE CARD ───────────────────────
 *
 * `.hro__w` is not a tag and not a tooltip: it is the sentence the trainer acts
 * on, which is why it gets a ruled band. A countdown alone is a fact. A countdown
 * plus "your morning ends at 10:00, thirty minutes after this one, under the hour
 * a session needs" is a decision. Every state below earns one.
 */

/* ───────────────────────────────────────────────────────────── the frame ── */

function Card({
  kicker,
  live = false,
  lead = false,
  figure,
  unit,
  name,
  nameHref,
  detail,
  chips,
  band,
  actions,
  label,
  quiet = false,
}: {
  kicker: React.ReactNode;
  live?: boolean;
  /**
   * The first card in the row, and the only one that gets a ground.
   *
   * `live` and `lead` are different claims and the stylesheet keeps them apart:
   * `card--acc` is a flat accent tint meaning *a log is open right now*, and
   * `card--lead` is a corner wash meaning *start reading here*. A card can be
   * both — it never is today, because the running card is the lead and wears its
   * live tint — and neither, which is every trailing card.
   */
  lead?: boolean;
  figure?: React.ReactNode;
  unit?: string;
  name?: React.ReactNode;
  /**
   * Where the name goes, on the cards whose name is a session.
   *
   * The verbs in `actions` are the card's job — *Start session*, *Open the log* —
   * and this is deliberately not one of them: the cards are tuned to two verbs
   * each and a third would blunt the one that matters. It is the name itself,
   * which is the thing a trainer points at when they mean "that one", and it
   * costs the card no weight. Absent on the money and no-work cards, whose name
   * is a phrase rather than a person.
   */
  nameHref?: string;
  detail?: React.ReactNode;
  /**
   * The facts that are not a sentence — where it is, and whether there is a note.
   *
   * A row of tags rather than more clauses on `detail`, because `detail` is
   * already "Full Body B · Remote · 1 h" and a fourth dot-separated clause is the
   * point at which a reader stops parsing the line. These are things the eye
   * checks rather than reads.
   */
  chips?: React.ReactNode;
  band?: { icon: React.ReactNode; tone?: 'acc' | 'warn'; text: React.ReactNode };
  actions?: React.ReactNode;
  /**
   * Required wherever there is a figure, and not optional for tidiness: a screen
   * reader given `12:00` reads "twelve colon zero zero", so the figure is
   * `aria-hidden` and this is the card's actual name.
   */
  label: string;
  quiet?: boolean;
}) {
  return (
    <div
      className={`card${live && !quiet ? ' card--acc' : ''}${lead ? ' card--lead' : ''}`}
      role="group"
      aria-label={label}
    >
      <div className="hro">
        {/*
          AN `<h2>`, AND THE WHOLE SCREEN HAD NO HEADINGS BEFORE THIS.
          The page's outline was empty: the date was a `<p>`, every card title a
          `<span>`, and this kicker a `<span>` — so a screen reader's heading list
          for a screen with six modules on it came back with nothing in it, and
          the only way through was to walk every element. `.hro__k` already sets
          its own font-size and weight, so the tag change costs no CSS.

          The `role="group"` above stays and is not redundant with it: the heading
          says which card this is ("In session · Floor"), and the group's label is
          the whole sentence including the figure, which is the part the eye reads
          and a reader cannot ("12" is announced as twelve; twelve of what?).
        */}
        <h2 className={`hro__k${live ? ' hro__k--live' : ''}`}>
          {live && <i />}
          {kicker}
        </h2>
        {figure !== undefined && (
          <p className="hro__c" aria-hidden="true">
            {figure}
            {unit && <em>{unit}</em>}
          </p>
        )}
        {name && (
          <p className="hro__n">
            {nameHref ? (
              <Link href={nameHref} style={{ color: 'inherit' }}>
                {name}
              </Link>
            ) : (
              name
            )}
          </p>
        )}
        {detail && <p className="hro__d">{detail}</p>}
        {chips && <div className="hro__c2">{chips}</div>}
        {band && (
          <div className={`hro__w${band.tone ? ` hro__w--${band.tone}` : ''}`}>
            {band.icon}
            <span>{band.text}</span>
          </div>
        )}
        {actions && <div className="hro__a">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * WHERE IT IS, AND WHETHER THERE IS A NOTE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * "LOCATION" IS THE MODE AND THE GYM'S NAME, BECAUSE THERE IS NO LOCATION COLUMN
 *
 * `scheduled_session` has `delivery_mode` and nothing else about place, and the
 * trainer has one `gym_name` — free text, the arrangement they manage themselves
 * (root `CLAUDE.md`: "`gym_id IS NULL` means trainer-managed"). So a floor session
 * is *Floor · Anytime Fitness HSR* when there is a gym on file and plain *Floor*
 * when there is not, and a remote one is *Remote*, which is a place in the only
 * sense that matters — it is not the floor, so the trainer is not travelling.
 *
 * A real per-session location would be a migration on both halves plus a field in
 * the booking form. Worth having when a trainer works two gyms; not invented here.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * AND THE NOTE CHIP IS NOT A MEDICAL FLAG
 *
 * The brief asked this slot for "the injury/medical flag if there is one". There
 * is no such field and there deliberately never has been:
 * `notes/XRep_MVP_interaction_map.md` forbids "medical or health-condition fields
 * anywhere — no injuries, no conditions, no medications" and lists health data as
 * "legally excluded, not deferred" under the DPDP Act 2023.
 *
 * What the trainer actually needs at the top of the day is *there is something I
 * wrote about this one* — so the chip is a neutral **Has a note**, true when the
 * booking or the client carries the trainer's own free text, saying nothing about
 * what the text is. It links to the file, where the text is. `DeckSession.hasNote`
 * carries the rest of the argument, including the variant this must never grow.
 */
function SessionChips({
  session,
  gymName,
}: {
  /*
   * The three fields the chips need, not a whole `DeckSession`. `RunningSession`
   * is a different shape that happens to carry two of them, and widening this to
   * the union would let a caller pass a session whose `hasNote` is simply absent
   * and read as false — which is the note silently disappearing on the one card a
   * trainer is looking at while the client is in front of them.
   */
  session: { clientId: string; mode: DeliveryMode; hasNote: boolean };
  gymName: string | null;
}) {
  const place =
    session.mode === 'remote'
      ? MODE_LABELS.remote
      : gymName?.trim()
        ? `${MODE_LABELS.floor} · ${gymName.trim()}`
        : MODE_LABELS.floor;
  return (
    <>
      <span className="tag">
        <Pin size={12} />
        {place}
      </span>
      {session.hasNote && (
        /*
          A LINK, NOT A TAG, AND THAT IS THE WHOLE VALUE OF IT.

          A chip that says a note exists and cannot open it has told the trainer
          about a thing and then asked them to go and find it — on the screen whose
          rule is that every card has a one-tap action. The client's file is where
          the text lives, so the chip is the way there.
        */
        <Link className="tag tag--link" href={`/clients/${session.clientId}`}>
          <Note size={12} />
          Has a note
        </Link>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────── 1 · in session ── */

/**
 * A log is open and nobody has closed it.
 *
 * The figure is elapsed rather than remaining, because elapsed is the number a
 * trainer checks against the clock on the wall and remaining is the number they
 * are deciding with — so remaining goes in the band, as a sentence.
 *
 * The one line here that exists only on this half: **a remote check-in is the
 * only kind of session that can be run from this desk.** A floor session on a
 * laptop means the trainer is not on the floor, and saying so is more useful
 * than a second countdown.
 */
function Running({
  running,
  now,
  gymName,
  hasNote,
}: {
  running: RunningSession;
  now: number;
  gymName: string | null;
  /**
   * `RunningSession` has no `hasNote` of its own — it is built from the workout
   * log rather than from the booking — so the chooser reads it off the matching
   * `DeckSession` and hands it down. Threaded rather than inferred, because a card
   * that quietly drew "no note" for a session that has one is the failure this
   * chip exists to prevent, and it would only show while somebody is standing in
   * front of the trainer.
   */
  hasNote: boolean;
}) {
  const endsAt = running.scheduledAt + running.durationMinutes * 60_000;
  const left = minutesUntil(endsAt, now);
  const mode = MODE_LABELS[running.mode];

  return (
    <Card
      live
      kicker={`In session · ${mode}`}
      figure={<Elapsed from={running.startedAt} now={now} />}
      /*
       * "min elapsed", not "elapsed" — because the figure beside it is now a
       * COUNT and no longer a clock. See `Elapsed` in Clock.tsx: this slot draws
       * `formatMinute` in the next state, so `12:00 elapsed` and `17:00` were the
       * same glyphs in the same slot meaning opposite things.
       */
      unit="min elapsed"
      name={running.clientName}
      nameHref={`/sessions/${running.scheduledId}`}
      detail={`${running.detail} · ${formatMinute(minuteOfDay(running.scheduledAt))}–${formatMinute(minuteOfDay(endsAt))}`}
      chips={
        <SessionChips
          session={{ clientId: running.clientId, mode: running.mode, hasNote }}
          gymName={gymName}
        />
      }
      band={{
        icon: <Clock size={16} />,
        tone: 'acc',
        text:
          running.mode === 'remote' ? (
            <>
              <b>{left} min left.</b> A remote check-in is the one kind of session run from
              this desk.
            </>
          ) : (
            <>
              <b>{left} min left.</b>{' '}
              {running.setsLogged > 0 ? (
                <>
                  {running.setsLogged} set{running.setsLogged === 1 ? '' : 's'} logged
                  {running.volumeKg > 0 && ` · ${running.volumeKg.toLocaleString('en-IN')} kg`}.
                </>
              ) : (
                'Nothing logged against it yet.'
              )}
            </>
          ),
      }}
      actions={
        <>
          <Link className="btn btn--sm btn--primary" href={`/sessions/${running.workoutId}`}>
            <Play size={15} />
            Open the log
          </Link>
          <Link className="btn btn--sm btn--ghost" href={`/sessions/${running.workoutId}`}>
            End session
          </Link>
        </>
      }
      label={`In session: ${running.clientName}, ${elapsedMinutes(running.startedAt, now)} minutes elapsed, ${left} minutes left`}
    />
  );
}

/* ──────────────────────────────────────────── 2 · next, and 2b · unopened ── */

/**
 * The next session that has not happened.
 *
 * Two shapes, one state. A session whose start time has passed with no log opened
 * against it is still `next` — `NEXT_GRACE_MS` holds it there for ninety minutes,
 * because "a trainer who is ten minutes late still wants the same card, not the
 * one after it" — but it is a different card, because the two answers it needs are
 * different. Before the start time: what is there to sell before this. After it:
 * **Start it** or **Mark no-show**.
 *
 * The old deck said *In progress* for both. `buildRunning` can tell the
 * difference, and its comment says why the pair has to be found together rather
 * than inferred: "an early session left unmarked would then mask a later one that
 * is genuinely under way."
 */
function Next({
  session,
  now,
  closesAt,
  minutesLeftInShift,
  nextGap,
  money,
  gymSharePercent,
  gymName,
  after,
  ordinal,
}: {
  session: DeckSession;
  now: number;
  closesAt: number | null;
  minutesLeftInShift: number;
  nextGap: Gap | null;
  money: DayMoney;
  gymSharePercent: number | null;
  /** For the location chip — see `SessionChips`. */
  gymName: string | null;
  /** True for a card after the first — "After that", never the hero. */
  after?: boolean;
  /**
   * Which of the trailing cards this is, 1-based, for the kicker.
   *
   * There is only ever ONE trailing card now, so this resolves to *After that*
   * in every case the chooser can produce. It is kept rather than inlined
   * because *Then* is the correct kicker the moment a third card comes back, and
   * the reason it exists is the reason the row is capped at two: two cards
   * saying the same sentence about different sessions, side by side, is how a
   * trainer starts the wrong one.
   */
  ordinal?: number;
}) {
  const mode = MODE_LABELS[session.mode];
  const graceEnds = session.at + NEXT_GRACE_MS;
  const chips = <SessionChips session={session} gymName={gymName} />;
  const kickerLead = !after ? 'Next up' : ordinal && ordinal > 1 ? 'Then' : 'After that';

  if (session.late && !after) {
    return (
      <Card
        /*
         * `lead`, and it USED TO BE `live`.
         *
         * A session whose start time has passed with nothing logged is the one
         * state on this card that is easy to misread as *in session* — which is
         * exactly what the accent tint and the pulsing dot said, on the card whose
         * whole point is that nobody has started it. The warn band says
         * "Nothing logged" underneath, and a green ground arguing the opposite
         * above it is the wrong half to believe.
         *
         * So it wears the lead wash like every other Next up card, and the tone
         * lives entirely in the band and the two verbs.
         */
        lead
        kicker={
          <>
            Next up · <Relative at={session.at} now={now} />
          </>
        }
        figure={formatMinute(minuteOfDay(session.at))}
        name={session.clientName}
        nameHref={`/sessions/${session.id}`}
        detail={`${session.detail} · ${formatSpan(session.minutes)}`}
        chips={chips}
        band={{
          icon: <Warn size={16} />,
          tone: 'warn',
          text: (
            <>
              <b>Nothing logged.</b> A session stays “next” for {NEXT_GRACE_MS / 60_000} min, so
              this card holds until {formatMinute(minuteOfDay(graceEnds))}.
            </>
          ),
        }}
        actions={
          <>
            <Link className="btn btn--sm btn--primary" href={`/sessions/new?session=${session.id}`}>
              <Play size={15} />
              Start session
            </Link>
            <Link className="btn btn--sm btn--ghost" href={`/schedule?session=${session.id}`}>
              <No size={15} />
              Mark no-show
            </Link>
          </>
        }
        label={`Next: ${session.clientName} at ${formatMinute(minuteOfDay(session.at))}, ${session.minutes} minutes, nothing logged`}
      />
    );
  }

  /*
   * THE SENTENCE THIS CARD EXISTS FOR.
   *
   * Not "your next session is at 17:00" — the figure already says that. What the
   * trainer is deciding is whether the hours between now and then are worth
   * anything. Three cases, and each is a different sentence:
   *
   *   · the current shift closes soon and what is left is under an hour — so
   *     there is nothing sellable before the evening, and the evening's first
   *     sellable hour is named;
   *   · there IS a sellable gap — so it is offered, priced;
   *   · neither — so the card says nothing rather than filling the band with a
   *     restatement of the countdown.
   */
  const shiftIsClosing = closesAt !== null && minutesLeftInShift > 0 && minutesLeftInShift < GAP_FOLD_MIN;
  const worth = nextGap ? gapWorth(nextGap, money, gymSharePercent) : null;

  const band = shiftIsClosing
    ? {
        icon: <Clock size={16} />,
        text: (
          <>
            <b>Your shift ends at {formatMinute(closesAt!)}</b> — {minutesLeftInShift} min from now,
            under the hour a session needs.
            {nextGap && (
              <> Next sellable hour: <b>{formatMinute(nextGap.startMinute)}</b>.</>
            )}
          </>
        ),
      }
    : nextGap
      ? {
          icon: <Rupee size={16} />,
          text: (
            <>
              <b>
                {formatMinute(nextGap.startMinute)}–{formatMinute(nextGap.endMinute)} is free
              </b>{' '}
              inside your own hours — {formatSpan(nextGap.minutes)}
              {worth && <>, {worth}</>}.
            </>
          ),
        }
      : undefined;

  return (
    <Card
      quiet
      /* The hero wears the wash; the card after it wears nothing at all. That
         contrast IS the second column's job — see the chooser. */
      lead={!after}
      kicker={
        <>
          {kickerLead} · <Relative at={session.at} now={now} />
        </>
      }
      figure={formatMinute(minuteOfDay(session.at))}
      name={session.clientName}
      nameHref={`/sessions/${session.id}`}
      detail={`${session.detail} · ${formatSpan(session.minutes)}`}
      chips={chips}
      band={band}
      /*
       * ONE PRIMARY BUTTON, AND IT IS ALWAYS *START SESSION*.
       *
       * This used to make *Book the 11:00* the card's only verb whenever there was
       * a sellable gap, and *Start it* the fallback — so on the mornings a trainer
       * has a gap (most of them) the card answering *what must I do next* offered
       * to sell an hour instead. The card's job is the session; the gap is a
       * sentence in the band and now a secondary beside it.
       *
       * The trailing cards get no Start at all. Starting the 17:00 at 09:40 is not
       * a thing a trainer means to do, and three Start buttons down a row makes the
       * one that is live indistinguishable from the two that are premature.
       */
      actions={
        after ? (
          <>
            <Link className="btn btn--sm btn--ghost" href={`/schedule?session=${session.id}`}>
              <Calendar size={15} />
              Move {session.clientName.split(' ')[0]}
            </Link>
            {/*
              THE SECOND VERB ON THE TRAILING CARD, AND ONLY ON THE TRAILING CARD.

              The rule this card is written to is that it gets no *Start* — three
              Start buttons down a row make the live one indistinguishable from the
              two that are premature — and the same argument would refuse a third
              verb here. This is the second, and it is the pair *Move* was already
              half of: a trainer looking at the 17:00 at 09:40 is deciding whether
              it is still happening, and the two things they can do about it are
              move it or ask.

              The lead card deliberately does NOT get one. Its verb is *Start
              session*, the client is about to walk in, and a WhatsApp button
              beside it is a button pressed by accident.
            */}
            <NudgeButton
              clientId={session.clientId}
              clientName={session.clientName}
              template="session_reminder"
              className="btn btn--sm btn--ghost"
              showContactedNote={false}
            />
          </>
        ) : (
          <>
            <Link className="btn btn--sm btn--primary" href={`/sessions/new?session=${session.id}`}>
              <Play size={15} />
              Start session
            </Link>
            {nextGap && (
              <Link
                className="btn btn--sm btn--secondary"
                href={`/schedule?book=${nextGap.startMinute}`}
              >
                <Plus size={15} />
                Book the {formatMinute(nextGap.startMinute)}
              </Link>
            )}
          </>
        )
      }
      label={`${kickerLead}: ${session.clientName} at ${formatMinute(minuteOfDay(session.at))}, ${mode}`}
    />
  );
}

/* ────────────────────────────────────────────────────────── 3 · tomorrow ── */

/**
 * The day is over, so the hero rolls forward and looks for what is broken.
 *
 * No product in the teardown has an evening state at all, which is a strange gap
 * in a category whose users work split shifts. This is the one moment a trainer
 * has both the information and the time to fix tomorrow — a clash found at 20:52
 * tonight costs a message; the same clash found at 17:15 tomorrow costs a client.
 */
function Tomorrow({
  session,
  count,
  clash,
  gymName,
}: {
  session: DeckSession;
  count: number;
  clash: { a: string; b: string; from: number; minutes: number } | null;
  gymName: string | null;
}) {
  const weekday = WEEKDAYS_LONG[isoWeekday(session.at)];
  return (
    <Card
      quiet
      kicker={`Tomorrow · ${weekday}`}
      figure={formatMinute(minuteOfDay(session.at))}
      name={session.clientName}
      nameHref={`/sessions/${session.id}`}
      detail={`${session.detail} · ${count} session${count === 1 ? '' : 's'} tomorrow`}
      chips={<SessionChips session={session} gymName={gymName} />}
      band={
        clash
          ? {
              icon: <Warn size={16} />,
              tone: 'warn',
              text: (
                <>
                  <b>
                    {clash.a} and {clash.b} overlap by {clash.minutes} min
                  </b>{' '}
                  from {formatMinute(clash.from)} — found tonight, not at{' '}
                  {formatMinute(clash.from)} tomorrow.
                </>
              ),
            }
          : {
              icon: <Calendar size={16} />,
              text: (
                <>
                  <b>Nothing overlaps.</b> {count} session{count === 1 ? '' : 's'} tomorrow, first
                  at {formatMinute(minuteOfDay(session.at))}.
                </>
              ),
            }
      }
      actions={
        <>
          {clash && (
            <Link className="btn btn--sm btn--primary" href="/schedule">
              <Calendar size={15} />
              Fix the clash
            </Link>
          )}
          <Link className={`btn btn--sm btn--${clash ? 'ghost' : 'secondary'}`} href="/schedule">
            See tomorrow
          </Link>
          {/*
            *Confirm* on the evening card, which is the one moment in the day it
            is the right verb. `session_reminder`'s wording is literally "a
            reminder for your training session tomorrow" — a message that is
            wrong at every other hour and exactly right at 20:52, which is when
            this card is on screen.
          */}
          <NudgeButton
            clientId={session.clientId}
            clientName={session.clientName}
            template="session_reminder"
            className="btn btn--sm btn--ghost"
            showContactedNote={false}
          />
        </>
      }
      label={`Tomorrow, ${weekday}: ${session.clientName} at ${formatMinute(minuteOfDay(session.at))}, ${count} sessions${clash ? ', one clash' : ''}`}
    />
  );
}

/* ───────────────────────────────────────────────── 4 · the day, closed ── */

/**
 * The day's money, said properly — and the unsold hour, priced.
 *
 * Three figures where the old deck had one bare total in a table footer with no
 * word next to it: what was billed, what is the trainer's, and what went to the
 * gym. The gap that nobody filled is the only figure here that is not also on the
 * morning's card, and it is the point of the card.
 *
 * That last line is not a reproach. It is the only way a trainer ever learns which
 * hour of their week is the one that keeps going empty.
 */
function DayClosed({
  money,
  sessions,
  gaps,
  gymSharePercent,
}: {
  money: DayMoney;
  sessions: DeckSession[];
  gaps: Gap[];
  gymSharePercent: number | null;
}) {
  const delivered = sessions.filter((s) => s.done).length;
  /*
   * BE TIME-AWARE: THE EVENING'S FIRST JOB IS THE ONE THE DAY LEFT BEHIND.
   *
   * A day is "closed" when nothing is left to start, which is not the same as
   * everything being settled — a trainer who ran five sessions and marked none of
   * them has a closed day and five wrong pack figures. So this card leads with
   * *Log today's sessions* whenever there is anything unmarked, and only falls back
   * to the money when there is not.
   *
   * Counted here rather than read off `deck.attention`: the queue's `unmarked` band
   * looks back a WEEK and starts at yesterday, deliberately, so it cannot answer
   * "what did I not mark today". Same fact, two windows, and this is the one the
   * evening is about.
   */
  const unmarkedToday = sessions.filter((s) => !s.done && !s.dead).length;

  /*
   * THE SENTENCE HAD TO BE REWRITTEN AFTER RENDERING IT.
   *
   * The first version named `gaps[0]` and totalled ALL of them, so a day with an
   * empty morning and an empty evening read "06:00–10:00 went unsold — 8 h inside
   * your own hours" when that window is four. The design's own frame has exactly
   * one gap, which is why the ambiguity never showed on paper.
   *
   * A day is either one empty window, which gets named and priced, or several,
   * which get counted — and then the LARGEST is named, because that is the one
   * worth doing something about. Naming a range and pricing a different span is
   * the class of error this whole screen was redrawn to remove.
   */
  const unsoldMinutes = gaps.reduce((sum, g) => sum + g.minutes, 0);
  const largest = gaps.reduce<Gap | null>(
    (best, g) => (best === null || g.minutes > best.minutes ? g : best),
    null,
  );
  const worth = largest ? gapWorth(largest, money, gymSharePercent) : null;
  /*
   * Guarded on `largest`, not cast past it. This read `{ ...(largest as Gap) }`,
   * and on a day with no gaps at all that spreads `null` — which JavaScript
   * allows, so it priced `{ slots: 0 }` and produced "₹0 billed, ₹0 yours" for a
   * figure that is only ever rendered inside the `largest ?` branch below. It
   * could not show, and the cast was the only thing stopping the compiler from
   * saying so. The condition now matches where the value is used.
   */
  const total =
    largest !== null && money.gapRate !== null
      ? gapWorth(
          { ...largest, slots: gaps.reduce((n, g) => n + g.slots, 0) },
          money,
          gymSharePercent,
        )
      : null;

  return (
    <Card
      quiet
      kicker="The day, closed"
      figure={rupees(money.yours)}
      unit="yours"
      name={`of ${rupees(money.billed)} billed`}
      detail={
        <>
          {delivered} session{delivered === 1 ? '' : 's'} delivered
          {money.cut > 0 && ` · ${rupees(money.cut)} to the gym`}
          {money.partial && ` · ${money.priced} of ${money.total} priced`}
        </>
      }
      band={
        largest
          ? {
              icon: <Rupee size={16} />,
              tone: 'warn',
              text:
                gaps.length === 1 ? (
                  <>
                    <b>
                      {formatMinute(largest.startMinute)}–{formatMinute(largest.endMinute)} went
                      unsold
                    </b>{' '}
                    — {formatSpan(largest.minutes)} inside your own hours
                    {worth && <>, {worth}</>}.
                  </>
                ) : (
                  <>
                    <b>
                      {formatSpan(unsoldMinutes)} went unsold across {gaps.length} empty windows
                    </b>
                    {total && <>, {total}</>}. The longest was{' '}
                    {formatMinute(largest.startMinute)}–{formatMinute(largest.endMinute)}.
                  </>
                ),
            }
          : {
              icon: <Clock size={16} />,
              text: (
                <>
                  <b>Every sellable hour was sold.</b> Nothing inside your own hours went empty
                  today.
                </>
              ),
            }
      }
      actions={
        unmarkedToday > 0 ? (
          <Link className="btn btn--sm btn--primary" href="/sessions">
            <Check size={15} />
            Log today’s {unmarkedToday === 1 ? 'session' : `${unmarkedToday} sessions`}
          </Link>
        ) : (
          <Link className="btn btn--sm btn--secondary" href="/business">
            <Rupee size={15} />
            Open the money book
          </Link>
        )
      }
      label={`The day, closed: ${money.yours} rupees yours of ${money.billed} billed${unmarkedToday > 0 ? `, ${unmarkedToday} not yet marked` : ''}`}
    />
  );
}

/* ────────────────────────────────────────────────── 5 · nothing at all ── */

/**
 * A day with no sessions in it — which is NOT the first-run state, and which has
 * THREE readings, not two.
 *
 * `firstRun` means there are no clients at all; this means there are six and none
 * of them is booked today. The phone ships a `ClearHero` for it, and the
 * distinction matters because the two want opposite things said: one wants a
 * roster, the other wants a booking.
 *
 * ── THE THIRD READING, FOUND BY RENDERING IT ─────────────────────────────────
 *
 * The first version of this card had one flag, `hasHours`, meaning "are there
 * working windows today". On a Sunday it drew *No working hours on record* for a
 * trainer with a full Monday-to-Saturday week — because there are no windows on a
 * SUNDAY, which is not the same fact at all and is the far commoner one.
 *
 * A day off is the normal, correct state of a rest day and should read as one. An
 * empty `working_hours` table is a setup step that never got answered, and it has
 * an action attached. Conflating them told a trainer their week was missing when
 * they were simply not working, and hid the real gap behind the same sentence.
 *
 * So: `worksToday` and `hasAnyHours`, and three sentences.
 */
function ClearDay({
  gaps,
  money,
  worksToday,
  hasAnyHours,
}: {
  gaps: Gap[];
  money: DayMoney;
  /** Are there working windows on THIS weekday? */
  worksToday: boolean;
  /** Has this trainer answered the working-week step at all, on any day? */
  hasAnyHours: boolean;
}) {
  const sellable = gaps.reduce((sum, g) => sum + g.slots, 0);
  // BILLING, so the gym's share is deliberately not subtracted here. Every other
  // figure on this screen that is the trainer's own says "yours" next to it; this
  // one says "of billing", because an empty day's cost is the whole invoice that
  // was never raised — the split only exists once there is money to split.
  const worth = money.gapRate !== null ? sellable * money.gapRate : null;

  // A day off. The whole day is hatched on the ribbon below and that is correct,
  // so the card agrees with it rather than reporting a problem.
  if (!worksToday && hasAnyHours) {
    return (
      <Card
        quiet
        kicker="A day off"
        figure="—"
        unit="not a working day"
        name="You do not work this day"
        detail="Your working week does not cover it, so there is nothing to sell and nothing missing."
        band={{
          icon: <Calendar size={16} />,
          text: (
            <>
              <b>Booking here still works.</b> Your hours stop clients self-booking, never you —
              so a one-off on a day off is a session, not an exception.
            </>
          ),
        }}
        actions={
          <>
            <Link className="btn btn--sm btn--secondary" href="/schedule">
              <Plus size={15} />
              Book anyway
            </Link>
            <Link className="btn btn--sm btn--ghost" href="/settings/hours">
              Change your week
            </Link>
          </>
        }
        label="A day off. Your working week does not cover this day."
      />
    );
  }

  // The step that was never answered. This one HAS an action, which is the whole
  // reason it must not wear the sentence above.
  if (!hasAnyHours) {
    return (
      <Card
        quiet
        kicker="No working week yet"
        figure="—"
        unit="no hours set"
        name="No working hours on record"
        detail="Set your working week and this day gets a shape, a price and a list of gaps worth filling."
        actions={
          <>
            <Link className="btn btn--sm btn--primary" href="/settings/hours">
              Set your hours
            </Link>
            <Link className="btn btn--sm btn--ghost" href="/schedule">
              <Plus size={15} />
              Book a session
            </Link>
          </>
        }
        label="Nothing booked today, and no working hours on record."
      />
    );
  }

  return (
    <Card
      quiet
      kicker="Nothing booked today"
      figure={String(sellable)}
      unit={sellable === 1 ? 'sellable hour' : 'sellable hours'}
      name="The whole day is open"
      detail={
        <>
          Every hour inside your working windows is free
          {worth !== null && <> — {rupees(worth)} of billing if all of it went</>}.
        </>
      }
      actions={
        <Link className="btn btn--sm btn--primary" href="/schedule">
          <Plus size={15} />
          Book a session
        </Link>
      }
      label={`Nothing booked today. ${sellable} sellable hour${sellable === 1 ? '' : 's'} open.`}
    />
  );
}

/* ────────────────────────────────────────────────────────── the chooser ── */

export interface HeroProps {
  deck: Deck;
  now: number;
  money: DayMoney;
  gaps: Gap[];
  windows: { startMinute: number; endMinute: number }[];
  gymSharePercent: number | null;
  /** The trainer's gym, for the location chip. Null means no gym on file. */
  gymName: string | null;
  clash: { a: string; b: string; from: number; minutes: number } | null;
  /** Whether the trainer has answered the working-week step at all — see ClearDay. */
  hasAnyHours: boolean;
}

/**
 * WHICH CARDS, AND WHY TWO.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TWO, AND THE THIRD IS A LIST ROW
 *
 * The count went one → two → three → two, and the round trip is worth writing
 * down because each step was right about something.
 *
 * The pair's original argument: "the phone has one slot because it has one
 * screen-width. A 1144px row holds two, and the pair is not decoration — one is
 * what is happening, the other is what happens next and what the space between
 * them is worth." The third card was added because "the question a trainer opens
 * this screen with at 06:00 is not *what is next* — it is **what is my
 * morning**", and two cards answer that for ninety minutes.
 *
 * What three got wrong is that *what is my morning* is a LIST question, and the
 * list is already on the screen, directly underneath, drawing the same sessions in
 * one line each. Three cards spent a full-height card apiece — figure, name, plan
 * line, chips, band, a verb — on the 15:00 and the 17:00, and the only card that
 * needed any of it was the first. Below 1441 the third was hidden anyway, so on
 * most desks it was markup nobody saw.
 *
 * So: **the next session, and the one after it. Everything from the third on is a
 * row in the list below**, which is what that module is for.
 *
 * ── AND ONE OF THEM IS THE LEAD ──────────────────────────────────────────────
 *
 * The first card is not just first — it takes `card--lead`, an accent wash in its
 * top-left corner, and the second takes nothing. Two identical cards side by side
 * is how a trainer starts the wrong one; the wash says which is the next hour and
 * which is the hour after, before either kicker is read. The trailing card's lack
 * of a ground is doing as much work as the lead's wash, so it stays plain — the
 * live green tint in particular belongs to `Running` and to nothing else.
 *
 * ── THE COUNT IS STILL PARTLY CSS'S ──────────────────────────────────────────
 *
 * Both cards are built at every width and `.today__hero` drops the second below
 * 1080px — the shell's rule since `Rail.tsx`, for its reason: a component that
 * branches on a measured width renders the wrong half for one frame after every
 * resize and cannot be server-rendered at all. A phone therefore gets exactly the
 * single card the brief asks it for, and it is the same markup a desk draws first.
 * `TodayList` marks that second row `.srow--h2` and hides it above 1080 for the
 * same reason, in the same edit.
 *
 * A card is still DROPPED rather than filled with something weaker when there is
 * nothing true to put in it — a day whose last session is running has no "next",
 * and one full-width card says that better than an empty box would.
 */
export function Hero({
  deck, now, money, gaps, windows, gymSharePercent, gymName, clash, hasAnyHours,
}: HeroProps) {
  // The three facts every "next" card needs, in one place: when the current shift
  // closes, how much of it is left, and the next hour that could be sold. They
  // travel together because the sentence they produce needs all three — see
  // `sellableNote`.
  const { closesAt, minutesLeft, next: nextGap } = sellableNote(windows, gaps, minuteOfDay(now));

  const nextProps = {
    now,
    closesAt,
    minutesLeftInShift: minutesLeft,
    nextGap,
    money,
    gymSharePercent,
    gymName,
  };

  /** `deck.upNext` as cards — the first the hero, the rest trailing. */
  const upNextCards = (sessions: DeckSession[], leadIsHero: boolean) =>
    sessions.map((s, i) => (
      <Next
        key={s.id}
        session={s}
        {...nextProps}
        after={!leadIsHero || i > 0}
        ordinal={leadIsHero ? i : i + 1}
      />
    ));

  // 1 · a log is open. The next sessions after it fill the remaining slots.
  if (deck.running) {
    /*
     * `hasNote` is read off the matching `DeckSession` rather than from the
     * running session, which does not carry it — see `Running`. `deck.today` is
     * where the booking's own facts live, and the running hero is built from the
     * LOG.
     */
    const booking = deck.today.find((s) => s.id === deck.running!.scheduledId);
    return (
      <Cards>
        <Running
          running={deck.running}
          now={now}
          gymName={gymName}
          hasNote={booking?.hasNote ?? false}
        />
        {upNextCards(deck.upNext.slice(0, 1), false)}
      </Cards>
    );
  }

  // 2 · something is next — including something that started and was never
  //     opened, which is the same state with a different pair of answers.
  if (deck.upNext.length > 0) {
    return <Cards>{upNextCards(deck.upNext.slice(0, 2), true)}</Cards>;
  }

  // 3 · the day is over. Tomorrow, and what today came to.
  if (deck.today.length > 0) {
    return (
      <Cards>
        {deck.tomorrow ? (
          <Tomorrow
            session={deck.tomorrow}
            count={deck.tomorrowCount}
            clash={clash}
            gymName={gymName}
          />
        ) : (
          <ClearDay
            gaps={gaps}
            money={money}
            worksToday={windows.length > 0}
            hasAnyHours={hasAnyHours}
          />
        )}
        <DayClosed
          money={money}
          sessions={deck.today}
          gaps={gaps}
          gymSharePercent={gymSharePercent}
        />
      </Cards>
    );
  }

  // 4 · a roster, and nothing booked today.
  return (
    <Cards>
      <ClearDay
        gaps={gaps}
        money={money}
        worksToday={windows.length > 0}
        hasAnyHours={hasAnyHours}
      />
      {deck.tomorrow ? (
        <Tomorrow
          session={deck.tomorrow}
          count={deck.tomorrowCount}
          clash={clash}
          gymName={gymName}
        />
      ) : null}
    </Cards>
  );
}

/**
 * One or two cards in a row that knows how many it has.
 *
 * `.today__hero` is a `--n`-driven grid rather than a pair of media-query
 * variants, because the number of cards is data and the number of COLUMNS is a
 * width: a day with two sessions left must draw two cards at 2560px and one at
 * 390px, and a rule keyed only on the viewport cannot say that. `Pair`, which this
 * replaces, used `.grid2` and could only ever mean "two" — which is what the
 * chooser now builds, but it is built that way because the day has two things
 * worth a card, not because the grid can only hold two.
 *
 * `null` children are filtered rather than rendered, so a dropped card costs no
 * grid track — an empty `<div>` in a three-column grid is a third of the row spent
 * on nothing.
 */
function Cards({ children }: { children: React.ReactNode }) {
  const cards = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <div className="today__hero" style={{ ['--n' as string]: cards.length }}>
      {cards}
    </div>
  );
}

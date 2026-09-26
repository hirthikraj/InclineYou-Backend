import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import { listRecentNudges } from '@/lib/nudges/api';
import { COOLDOWN_DAYS, lastContactMap } from '@/lib/nudges/cooldown';

import {
  bookableClients, DEAD_SESSION, sessionMinutes,
} from '@/lib/schedule/roster';
import type { BookSession, ScheduleClient } from '@/lib/schedule/session';

import { buildDeck, staleOpenLogs, type Deck, type DeckInput } from './deck';
import { DAY_MS, startOfDay } from './time';
import type { RateSource, WorkWindow } from './day';

/**
 * Everything Today needs from the backend, in nine parallel requests.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY NINE SCOPED REQUESTS AND NOT ONE `sync/pull`
 *
 * `/v1/sync/pull?lastPulledAt=0` returns exactly `DeckInput` in a single call
 * and it is the wrong tool here. It also returns the 1,324-row global exercise
 * library and **every set log ever recorded** — for a trainer two years in with
 * twenty clients that is tens of thousands of rows, on a screen that is opened
 * every morning and left open. `lib/setup/api.ts` reaches for `pull()` and says
 * why it is allowed to: setup is only reachable while `setupComplete` is false,
 * so the envelope is nearly empty. Its comment then names this screen
 * explicitly — *"do not reach for `pull()` on a built screen — a dashboard that
 * pulled the whole account on every render is the shape of bug this comment
 * exists to prevent"*. This file is that screen, and it does not.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT WAS MISSING FROM REST, AND WHAT WAS ADDED
 *
 * Four of the row sets already had a trainer-wide route: `clients`, `sessions`
 * (windowed), `programs`, `workouts`. Three did not, and each was load-bearing
 * for a whole module:
 *
 *   · `packages` — per-client only. Reaching the deck's *who is running out* one
 *     client at a time is 22 requests against a 120/min ceiling, so refreshing
 *     a dashboard rate-limits the trainer. → `GET /v1/packages`
 *   · `payments`  — per-PACKAGE only, and `PaymentResponse` carried no
 *     `gymShareAmount`, so `yours = billed − cut` was not computable at any
 *     number of requests. → `GET /v1/payments`, and the field, appended last.
 *   · `working_hours` — no route at all; it reached the wire only inside the
 *     sync envelope. Without it the ribbon has no ground, no hole between
 *     shifts, and no *gap* — a sellable gap is by definition free time inside a
 *     working window. → `GET /v1/working-hours`
 *
 * All three are reads, all three are additive, and `backend/API.md` carries them
 * as of the same commit. Nothing was removed and no response field changed
 * meaning, which is the schema law applying to the wire.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TWO REQUESTS THAT ARE DELIBERATELY UNWINDOWED
 *
 * `GET /v1/workouts` fetches the whole history and that is not an oversight.
 * The *gone quiet* rule needs the last logged workout PER CLIENT, at any age,
 * because the copy states the number — "No workout logged in 41 days". Bounding
 * it to a window would make a client quiet for longer than the window vanish
 * from the queue entirely (`buildAttention` skips a client with no workout at
 * all, on the grounds that they have not started rather than gone quiet), and
 * that is the exact client who most needs chasing. One row per delivered
 * session, so it grows with tenure; if it ever bites, the fix is a
 * last-workout-per-client projection on the backend, not a window here.
 *
 * `GET /v1/payments` is unwindowed for a smaller reason: an unpaid invoice from
 * July is still owed today, so *still pending* and the overdue queue cannot be
 * scoped to this month, and a payment row is one per invoice — a couple of
 * hundred rows for a full book, against thousands of set logs. The endpoint
 * takes `from`/`to` for the money screen, which does want a month.
 *
 * `GET /v1/sessions` IS windowed, and the window WIDENED on 27 Aug 2026 — from
 * Monday-of-this-week to `SESSION_LOOKBACK_DAYS` back — because the restructured
 * queue asks two questions of the past that a week cannot answer. See that
 * constant.
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THERE ARE NINE REQUESTS NOW, NOT EIGHT
 *
 * `GET /v1/attention/dismissals` is the ninth (V28). It is a handful of tiny rows
 * on one index and it buys the property the whole queue rests on: a list that can
 * be silenced is one a trainer will keep reading, and a silence that lives in
 * `localStorage` is not a silence — a shared gym desktop hands it to the next
 * person, and the same trainer's own laptop never hears about it.
 *
 * The budget argument in this file is not "eight"; it is *scoped reads, not the
 * whole account*. A ninth scoped read is inside that argument and a `pull()` is
 * still outside it. The nine run in parallel, so `TIMEOUT_MS` is the ceiling for
 * the screen and not nine times it.
 */

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

/**
 * How far back `GET /v1/sessions` reaches. See the note in `getToday` for why
 * this is thirty and not seven, and not ninety.
 *
 * Exported so `deck.ts`'s two backward-looking rules can never quietly outgrow
 * it: `missed` walks settled sessions and `unmarked` looks back a week, and a rule
 * that reached further than the window would silently return a shorter answer
 * rather than a wrong-looking one, which is the harder bug to see.
 */
export const SESSION_LOOKBACK_DAYS = 30;

/** Thrown for anything that is not a 2xx, so the page can tell 401 from 500. */
export class TodayApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'TodayApiError';
  }
}

/**
 * How long any one of the nine requests may take before it counts as no answer.
 *
 * ── MEASURED, NOT GUESSED, AND IT WAS FOUND BY BREAKING IT ───────────────────
 *
 * The first version had no timeout, and a `fetch` with no timeout does not fail
 * when a server stops answering — it fails when the server REFUSES. Those are
 * different states and only the second one is fast.
 *
 * Suspending the API process proved it: the kernel still completes the TCP
 * handshake, so the connection is established and the request is sent and nothing
 * ever comes back. `/today` hung indefinitely — no error screen, no retry, a
 * blank tab spinning — which is the worst of the three possible failures and the
 * only one a trainer cannot even describe. A restarting Spring process, a dropped
 * VPN and a half-open connection through a proxy all look exactly like this.
 *
 * Eight seconds: comfortably above the slowest of these requests against a warm
 * database (the roster-wide reads are indexed single queries, tens of
 * milliseconds), and well under how long somebody will stare at a blank screen
 * before deciding the product is broken. The nine run in parallel, so this is
 * the ceiling for the whole screen and not nine times it.
 */
const TIMEOUT_MS = 8_000;

async function get<T>(path: string): Promise<T> {
  const token = await getToken();
  // Not an assertion for tidiness: without a token the backend answers 401 and
  // the screen would report a server problem for what is a signed-out browser.
  if (!token) throw new TodayApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      // The deck is a snapshot of a minute. Nothing here is cacheable, and a
      // cached Today is the one bug a trainer cannot diagnose — the screen would
      // be wrong in a way that looks exactly like being right.
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Connection refused, DNS, and a timeout all land here and all mean the same
    // thing to the screen: nothing answered. `TodayApiError(null)` is what
    // `requireToday` reads as `unreachable`.
    throw new TodayApiError(null);
  }
  if (!res.ok) throw new TodayApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ------------------------------------------------------------ wire shapes ──
 * Named after the Java records they come from, so a change there is greppable
 * from here. Every field the deck does not read is left out on purpose — a DTO
 * that mirrors the server is a second place the server's shape is written down.
 * -------------------------------------------------------------------------- */

/** `TrainerService.TrainerResponse` — only the fields this screen reads. */
interface TrainerWire {
  id: string;
  name: string;
  /** Not the deck's — the rail's foot menu prints it so a trainer can see which
   *  account is open before signing out of it. Already on the response; this is a
   *  field being read, not a field being added. */
  phone: string | null;
  gymName: string | null;
  gymSharePercent: number | null;
  /**
   * Read here rather than through `lib/setup/api.ts` so the guard's redirect
   * costs no extra request: this screen already fetches the profile for the
   * gym's share, and `getSetupState` would fetch the same row again.
   */
  setupComplete: boolean;
}

/** `ClientService.ClientResponse`. */
interface ClientWire {
  id: string;
  name: string;
  status: string;
  deliveryMode: string | null;
  metadata: Record<string, unknown> | null;
  /**
   * The next three are read for the BOOKING FORM this screen now opens in place
   * — see `TodayData.book`. All three have been on `ClientResponse` since long
   * before this file; Today simply had no reader for them.
   *
   * `membershipStatus` is the roster relationship and is a different fact from
   * `status` above: it is how a removed client is spelled, and the form must not
   * offer somebody who left.
   */
  membershipStatus: string | null;
  /** `session_duration_minutes` — what THIS client's sessions are. */
  sessionDurationMinutes: number | null;
  sessionsPerWeek: number | null;
  /**
   * `client.goal` — the trainer's own free text. Read for the hero's neutral
   * *Has a note* chip and for nothing else; it is never printed on this screen.
   * `DeckSession.hasNote` carries the whole argument, including the field this is
   * deliberately not.
   */
  goal: string | null;
  statusFlags?: { paymentDue: boolean; sessionPackLow: boolean; planExpiring: boolean };
}

/** `ScheduledSessionService.SessionResponse`. */
interface SessionWire {
  id: string;
  clientId: string;
  programId: string | null;
  scheduledAt: number;
  durationMinutes: number | null;
  status: string;
  dayLabel: string | null;
  templateDay: number | null;
  deliveryMode: string | null;
  /** Already on `SessionResponse`; read here for the *Has a note* chip. */
  notes: string | null;
}

/** `ProgramService`'s response — the four fields the week counter needs. */
interface ProgramWire {
  id: string;
  clientId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
}

/** `WorkoutSessionService.WorkoutSessionResponse`. */
interface WorkoutWire {
  id: string;
  clientId: string;
  programId: string | null;
  scheduledSessionId: string | null;
  sessionDate: string;
  createdAt: number;
  endedAt: number | null;
}

/** `WorkoutSessionService.SetLogResponse`. */
interface SetLogWire {
  id: string;
  workoutSessionId?: string;
  exerciseId: string;
  loadKg: number | null;
  reps: number | null;
  createdAt: number;
}

/** `PackageService.PackageResponse`. */
interface PackageWire {
  id: string;
  clientId: string;
  type: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: number | string | null;
  status: string;
  /**
   * ISO `yyyy-MM-dd`, nullable — a pack sold with no expiry, which is most of
   * them. On `PackageResponse` since it was written; this screen read the session
   * count and never the date, which is why a monthly pack with fourteen sessions
   * left and four days to run was invisible on it.
   */
  endDate: string | null;
  /**
   * V30 · set while the pack's clock is stopped, null while it is running.
   *
   * READ HERE FOR ONE REASON: a paused pack must not raise an attention row.
   * Its `endDate` is frozen — that is what a pause IS — but the days-left
   * arithmetic is `endDate` against TODAY, and today keeps moving. So a client
   * three weeks in Kerala would slide from "expires in 9 days" to "expires
   * today" and then sit there nagging every morning about a pack whose expiry
   * is not actually running, on behalf of somebody who cannot train anyway.
   */
  pausedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** `AttentionDismissalService.DismissalResponse` — V28. */
interface DismissalWire {
  id: string;
  clientId: string;
  kind: string;
  band: string;
  /** Null for a permanent dismissal. */
  snoozedUntil: number | null;
}

/** `PackageService.PaymentResponse`, including the field appended for this screen. */
interface PaymentWire {
  id: string;
  clientId: string;
  amount: number | string | null;
  method: string | null;
  status: string;
  upiReference: string | null;
  paidAt: number | null;
  gymShareAmount: number | string | null;
  createdAt: number;
}

/** `WorkingHoursService.WorkingHourResponse`. */
interface WorkingHourWire {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/**
 * Spring serialises `NUMERIC` as a JSON number, but Jackson can hand back a
 * string for a `BigDecimal` depending on configuration — and a money figure that
 * silently becomes `NaN` would show as `₹NaN` on the one screen a trainer checks
 * against what they remember. Coerced once, here.
 */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function maybe(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------- the day */

/**
 * What `Renew` repeats. Plain object rather than a `Map` because it crosses into
 * a client component, and a record survives that boundary in every Next version
 * this project has run on — `rates.perSession` stays a Map precisely because it
 * does not cross it.
 */
export interface RenewTerms {
  type: string;
  amount: number;
  sessionsTotal: number | null;
}

export interface TodayData {
  deck: Deck;
  trainer: {
    name: string;
    phone: string | null;
    gymName: string | null;
    gymSharePercent: number | null;
    setupComplete: boolean;
  };
  hours: WorkWindow[];
  rates: RateSource;
  /**
   * WHAT THE BOOKING FORM NEEDS, ON THE SCREEN THAT IS NOT THE SCHEDULE.
   *
   * `/today`'s *New session* used to be a link to `/schedule?new=1`: it left the
   * screen, drew a week, and opened a panel over it — three things to book an
   * hour on the day the trainer was already looking at. It opens `BookPanel` in
   * place now (see `Today.tsx`), and this is the raw material it reads.
   *
   * NO EXTRA REQUEST. Both halves are derived from rows this file already
   * fetches for the deck — the same `/v1/clients`, `/v1/programs`,
   * `/v1/packages` and `/v1/sessions` — and the mapping is
   * `lib/schedule/roster.ts`'s, shared with the schedule so the two screens
   * cannot disagree about who may be booked or how long their sessions are.
   *
   * It is a separate field rather than part of `Deck` on purpose: the deck is
   * what the day IS, and this is what one form on it needs. `buildDeck` stays a
   * pure statement about the day and takes no dependency on the booking panel.
   */
  book: {
    clients: ScheduleClient[];
    /** The whole fetched window, not just today — see `BookPanel.sessions`. */
    sessions: BookSession[];
  };
  /** clientId → the terms of their most recent pack, for the queue's `Renew`. */
  renewTerms: Record<string, RenewTerms>;
  /**
   * clientId → the workout logs that client's `Close` will end.
   *
   * IDS ONLY, and that is deliberate. `closeLogs` has to send a whole
   * `workout_session` row back through the sync envelope — the upsert's
   * `ON CONFLICT` assigns `notes` and `session_date` from what it is given, so a
   * caller that guessed at them would erase them. Rather than round-trip a
   * client's session notes through the browser to be handed back, the action
   * re-reads each log on the server and edits one field of it. The browser only
   * ever learns which logs exist, which the row it is drawn beside already says.
   */
  openLogs: Record<string, string[]>;
  /**
   * clientId → when they were last messaged, inside the cooldown window.
   *
   * The same rows `deck.attention`'s `contactedAt` is derived from, handed
   * across again in map form — because the two readers want different shapes.
   * The queue's ranking wants it per ROW, so the deck stamps it; the hero's
   * nudge buttons want it per CLIENT and sit four components deep, so they read
   * it through `LastContactProvider`. Deriving it twice from one read is cheaper
   * than a second request and cheaper than threading a prop through the hero.
   */
  lastContact: Record<string, number>;
  /** The instant the server derived this from. The browser ticks on from it. */
  now: number;
}

/**
 * `cache()` for the same reason `lib/setup/api.ts` uses it: the page and its
 * metadata both want the deck, and React's per-request cache makes that one
 * round of requests rather than two. It is a REQUEST cache, not a data cache —
 * it does not survive the response, so the next load re-reads the day.
 */
export const getToday = cache(async (): Promise<TodayData> => {
  const now = Date.now();

  /*
   * Thirty days back through the end of tomorrow. `to` is exclusive on
   * `GET /v1/sessions`, so the day after tomorrow's first instant is the bound.
   *
   * WIDENED from `startOfWeek(now)` on 27 Aug 2026. The old window could not
   * answer either of the queue's two backward-looking triggers:
   *
   *   · **Missed the last 2 sessions.** A streak of no-shows is by definition
   *     older than the sessions that are still to come, and on a Tuesday
   *     Monday-of-this-week holds at most one settled day.
   *   · **Yesterday's sessions not marked.** On every Monday of the year
   *     "yesterday" is a Sunday, which the old window excluded — so the row could
   *     not exist on the one morning it is most likely to.
   *
   * Thirty and not ninety: `unmarked` looks back a week and `missed` needs enough
   * settled sessions to see a streak, which at two or three a week is comfortably
   * inside a month. Beyond that the rows are about a client who left rather than
   * one who is leaving, and this is still the row set with the most volume per
   * day on the wire.
   */
  const from = startOfDay(now) - SESSION_LOOKBACK_DAYS * DAY_MS;
  const to = startOfDay(now) + 2 * DAY_MS;

  const [
    trainer,
    clients,
    sessions,
    programs,
    workouts,
    packages,
    payments,
    hours,
    dismissals,
    nudges,
  ] = await Promise.all([
    get<TrainerWire>('/v1/trainers/me'),
    get<ClientWire[]>('/v1/clients'),
    get<SessionWire[]>(`/v1/sessions?from=${from}&to=${to}`),
    get<ProgramWire[]>('/v1/programs'),
    get<WorkoutWire[]>('/v1/workouts'),
    get<PackageWire[]>('/v1/packages'),
    get<PaymentWire[]>('/v1/payments'),
    get<WorkingHourWire[]>('/v1/working-hours'),
    get<DismissalWire[]>('/v1/attention/dismissals'),
    /*
     * THE TENTH REQUEST, AND THE ONLY ONE THAT CANNOT FAIL THE SCREEN.
     *
     * `GET /v1/nudges` — a week of `nudge_log` rows, so the queue stops raising
     * a row about somebody the trainer messaged yesterday. Windowed to the
     * cooldown, which is tens of rows for a full book rather than the hundreds
     * `/v1/payments` costs unwindowed.
     *
     * `listRecentNudges` swallows its own failure and answers `[]` — it is the
     * one read here that does. The other nine each answer a question the screen
     * cannot draw without; this one answers "who have I already contacted", and
     * losing it degrades the RANKING back to what it was before this feature
     * existed. A dashboard that 500s because a supporting read did is the worse
     * failure, and a backend that predates V32 404s this route.
     */
    listRecentNudges(COOLDOWN_DAYS),
  ]);

  const input: DeckInput = {
    clients: (clients ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      deliveryMode: c.deliveryMode,
      metadata: c.metadata,
      goal: c.goal,
    })),
    sessions: (sessions ?? []).map((s) => ({
      id: s.id,
      clientId: s.clientId,
      programId: s.programId ?? undefined,
      scheduledAt: s.scheduledAt,
      durationMinutes: s.durationMinutes ?? undefined,
      status: s.status,
      dayLabel: s.dayLabel ?? undefined,
      templateDay: s.templateDay ?? undefined,
      deliveryMode: s.deliveryMode,
      notes: s.notes,
    })),
    programs: (programs ?? []).map((p) => ({
      id: p.id,
      clientId: p.clientId,
      name: p.name,
      startDate: p.startDate ?? undefined,
      endDate: p.endDate ?? undefined,
      status: p.status,
    })),
    workouts: (workouts ?? []).map((w) => ({
      id: w.id,
      clientId: w.clientId,
      programId: w.programId ?? undefined,
      scheduledSessionId: w.scheduledSessionId ?? undefined,
      sessionDate: w.sessionDate,
      createdAt: w.createdAt,
      endedAt: w.endedAt,
    })),
    packages: (packages ?? []).map((p) => ({
      id: p.id,
      clientId: p.clientId,
      sessionsTotal: p.sessionsTotal,
      sessionsRemaining: p.sessionsRemaining,
      amount: num(p.amount),
      status: p.status,
      updatedAt: p.updatedAt,
      endDate: p.endDate,
      pausedAt: p.pausedAt ?? null,
    })),
    payments: (payments ?? []).map((p) => ({
      id: p.id,
      clientId: p.clientId,
      amount: num(p.amount),
      method: p.method ?? undefined,
      status: p.status,
      upiReference: p.upiReference ?? undefined,
      gymShareAmount: maybe(p.gymShareAmount),
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    })),
    dismissals: (dismissals ?? []).map((d) => ({
      id: d.id,
      clientId: d.clientId,
      kind: d.kind,
      band: d.band,
      snoozedUntil: d.snoozedUntil,
    })),
    nudges: (nudges ?? []).map((n) => ({ clientId: n.clientId, sentAt: n.sentAt })),
    // The last row set, and the only one fetched conditionally — see below.
    setLogs: [],
  };

  let deck = buildDeck(input, now);

  /*
   * THE ONE CONDITIONAL REQUEST.
   *
   * Set logs exist on the wire only per workout (`GET /v1/workouts/{id}/sets`),
   * and this screen needs them for exactly one thing: the live hero's "14 sets ·
   * 2,180 kg". So they are fetched for the ONE open log, after the deck has
   * identified it, and the deck is rebuilt with them.
   *
   * Two rounds instead of one, on the minority of loads where a session is
   * actually running. The alternative is a set-log request per workout in the
   * history, which is the N+1 this whole file is arranged to avoid.
   */
  if (deck.running) {
    try {
      const sets = await get<SetLogWire[]>(`/v1/workouts/${deck.running.workoutId}/sets`);
      input.setLogs = (sets ?? []).map((l) => ({
        id: l.id,
        workoutSessionId: l.workoutSessionId ?? deck.running!.workoutId,
        exerciseId: l.exerciseId,
        loadKg: l.loadKg ?? undefined,
        reps: l.reps ?? undefined,
        createdAt: l.createdAt,
      }));
      deck = buildDeck(input, now);
    } catch {
      // A hero that says "in session" with no set count is worth having; a Today
      // that 500s because one sub-request did is not. The rest of the screen is
      // already derived and correct.
    }
  }

  /*
   * The per-session rate, per client.
   *
   * The NEWEST package regardless of status, not the newest live one: a client
   * whose pack ran out yesterday still has an agreed price, and that price is
   * what today's session with them is worth. `perSession` in
   * `lib/setup/money.ts` does the same division — a monthly fee has no session
   * count to divide by and yields nothing, which is correct rather than a gap:
   * a month's fee is not attributable to one hour of it.
   */
  const perSession = new Map<string, number>();
  const renewTerms: Record<string, RenewTerms> = {};
  const newest = new Map<string, PackageWire>();
  for (const p of packages ?? []) {
    const seen = newest.get(p.clientId);
    if (!seen || p.createdAt > seen.createdAt) newest.set(p.clientId, p);
  }
  for (const [clientId, p] of newest) {
    const amount = num(p.amount);
    const count = p.type === 'single' ? 1 : (p.sessionsTotal ?? 0);
    if (amount > 0 && count > 0) perSession.set(clientId, Math.round(amount / count));
    // The same row answers a second question — what `Renew` should repeat — so
    // it is carried rather than re-fetched when the trainer clicks the verb.
    if (amount > 0) {
      renewTerms[clientId] = { type: p.type, amount, sessionsTotal: p.sessionsTotal };
    }
  }

  /*
   * The same rule the queue's row was raised by, so the verb can never reach a
   * log the row did not count — `staleOpenLogs` is exported for exactly this.
   * `deck` is already built, so this costs a pass over rows we hold.
   */
  const openLogs: Record<string, string[]> = {};
  for (const [clientId, logs] of staleOpenLogs(input, now)) {
    openLogs[clientId] = logs.map((l) => l.workoutId);
  }

  /*
   * The booking form's two lists. Derived, not fetched — see `TodayData.book`.
   *
   * The sessions are the WHOLE thirty-day window rather than today's, because
   * `suggestClients` ranks the roster on *trains around this hour on Thursdays*
   * and one day of rows cannot say that about anybody. The five fields are all
   * `BookPanel` reads; `collisionsAt` narrows to the booked day itself.
   */
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  const book = {
    clients: bookableClients(clients ?? [], programs ?? [], newest),
    sessions: (sessions ?? []).map((s): BookSession => ({
      id: s.id,
      clientId: s.clientId,
      clientName: clientById.get(s.clientId)?.name?.trim() || 'Client',
      at: s.scheduledAt,
      minutes: sessionMinutes(
        s.durationMinutes,
        clientById.get(s.clientId)?.sessionDurationMinutes,
      ),
      dead: DEAD_SESSION.has((s.status ?? '').toLowerCase()),
    })),
  };

  return {
    deck,
    trainer: {
      name: trainer?.name ?? '',
      phone: trainer?.phone ?? null,
      gymName: trainer?.gymName ?? null,
      gymSharePercent: maybe(trainer?.gymSharePercent),
      // Absent means a backend older than V8, and every trainer one of those ever
      // answered had finished setup — so absence reads as done rather than as a
      // redirect back into a flow they completed months ago.
      setupComplete: trainer?.setupComplete !== false,
    },
    hours: (hours ?? []).map((h) => ({
      weekday: h.weekday,
      startMinute: h.startMinute,
      endMinute: h.endMinute,
    })),
    rates: { perSession, gymSharePercent: maybe(trainer?.gymSharePercent) },
    book,
    renewTerms,
    openLogs,
    lastContact: Object.fromEntries(lastContactMap(nudges)),
    now,
  };
});

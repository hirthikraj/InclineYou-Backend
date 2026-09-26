'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import type { AttentionItem } from '@/lib/today/deck';
import { QUEUE_CAP, SNOOZE_DAYS } from '@/lib/today/deck';
import type { RenewTerms } from '@/lib/today/api';
import {
  checkIn, closeLogs, dismissRow, markAttended, remind, renew, restoreRow, wish,
} from '@/lib/today/actions';
import { HELD_VERBS, HOLD_SECONDS } from '@/lib/today/hold';
import { contactedLabel } from '@/lib/nudges/cooldown';
import { clientsNeedYou, sessionsToday } from '@/lib/today/copy';
import { DAY_MS } from '@/lib/today/time';
import { BellOff, Check, Ellipsis } from '@/components/shell/Icons';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { Avatar } from '@/web-components/ui/Avatar';
import { Slab } from '@/web-components/ui/Slab';

/**
 * NEEDS YOU TODAY — the ranked queue, and the three things it can do to a row.
 *
 * The rows, their order, their wording and their verbs all come from
 * `lib/today/deck.ts`. This component decides nothing about ranking; it draws the
 * ladder, commits six verbs, and owns the two affordances that make the list
 * trustworthy: a ten-second undo on anything that leaves the building, and a way
 * to say *not now*.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SIX ROWS, AND THE ARGUMENT THIS REVERSES
 *
 * This file used to say: "Hiding three of six on the screen a trainer came to the
 * desk to clear would mean they could not see the list", and drew every row with a
 * scroller. That is right about six rows and wrong about forty, which is what
 * three conditions across a full book actually produce — and the rule the
 * restructure settles on is the sharper one: **if everything is urgent, nothing
 * is.**
 *
 * So `QUEUE_CAP` rows are drawn and the rest are FOLDED, not dropped. The
 * disclosure states the count, one click opens all of them, and the scroller is
 * still there behind it. Nothing is unreachable and the common case is a list short
 * enough to read at a glance, which is the property that makes a trainer trust it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE TEN SECONDS, AND WHAT THEY ARE FOR
 *
 * H03 of the heuristic audit: a destructive action is "reversible for ten seconds
 * IN PLACE, IN THE ROW THAT CHANGED". Not a toast, not a chip in a corner — the row
 * itself becomes the receipt, so there is no corner of the screen the eye has to
 * find.
 *
 * The hold attaches to the VERB, and the line is **whether somebody outside this
 * account finds out**. `Remind`, `Check in` and `Wish` hand a message to a client
 * and wait; `Renew`, `Mark` and `Close` write a row and tell nobody, so they are
 * instant. `Assign` is a `<Link>` and is held by nothing — a navigation that waited
 * ten seconds would be a bug. And the SENDING is held, not just the appearance: the
 * server action has not been called while the row counts, so Undo is an undo rather
 * than an apology.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * AND DISMISSAL HAS MEMORY
 *
 * *Snooze a week* and *Dismiss* per row, both written to the server (V28), because
 * a silence is a fact about a client and not a preference of a device — a gym
 * desktop is shared. `isSilenced` in `deck.ts` is what keeps a dismissal from
 * becoming a blindfold: a row comes back the moment its condition gets worse.
 *
 * The confirm REPLACES the row's own reason rather than opening a menu over it,
 * which is `AccountMenu.tsx`'s call for its reason — a popover inside a table cell
 * has to be positioned against a scroll container, and it covers the row it is
 * asking about. Three buttons in the space the sentence was using, and the sentence
 * comes back on cancel.
 *
 * And the folded foot under the card lists what is currently silenced, with a
 * *Restore* on each. A queue that can be silenced is only trustworthy if it admits
 * to being silenced and offers the way back.
 */

type RowState =
  | { kind: 'rest' }
  | { kind: 'choosing' }
  | { kind: 'held'; secondsLeft: number }
  | { kind: 'working' }
  | { kind: 'sent'; whatsappUrl?: string }
  | { kind: 'silenced'; dismissalId?: string; permanent: boolean }
  | { kind: 'failed'; message: string };

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  ticker: ReturnType<typeof setInterval>;
}

export function AttentionQueue({
  items,
  silenced,
  renewTerms,
  openLogs,
  todayCount,
  now,
}: {
  items: AttentionItem[];
  /** Rows a live dismissal is hiding, each with the `dismissalId` to delete. */
  silenced: AttentionItem[];
  renewTerms: Record<string, RenewTerms>;
  /** clientId → the logs `Close` will end. Ids only — see `TodayData.openLogs`. */
  openLogs: Record<string, string[]>;
  /** For the empty state, which states what the day holds instead of nothing. */
  todayCount: number;
  /** The ticking instant, so a snooze is dated from the trainer's clock. */
  now: number;
}) {
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [expanded, setExpanded] = useState(false);
  const [showSilenced, setShowSilenced] = useState(false);
  const pending = useRef<Map<string, Pending>>(new Map());

  const setState = useCallback((key: string, state: RowState) => {
    setStates((prev) => ({ ...prev, [key]: state }));
  }, []);

  const clearPending = useCallback((key: string) => {
    const p = pending.current.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    clearInterval(p.ticker);
    pending.current.delete(key);
  }, []);

  // A row counting down when the component unmounts must not fire: navigating
  // away is not consent to send. Every timer is dropped on the way out.
  useEffect(
    () => () => {
      pending.current.forEach((p) => {
        clearTimeout(p.timer);
        clearInterval(p.ticker);
      });
      pending.current.clear();
    },
    [],
  );

  const commit = useCallback(
    async (item: AttentionItem) => {
      setState(item.key, { kind: 'working' });
      const result = await runVerb(item, renewTerms, openLogs);

      if (!result.ok) {
        setState(item.key, { kind: 'failed', message: result.message ?? 'That did not go through.' });
        return;
      }

      /*
       * The backend renders the message and LOGS the nudge; it does not send it.
       * So the last step of "sending a WhatsApp" is opening the link, and that is
       * the one part that cannot happen on a server.
       *
       * ── AND THE OPEN CANNOT BE TRUSTED, WHICH IS WHY THE LINK STAYS IN THE ROW
       *
       * This call runs ten seconds after the click, behind an `await`. Transient
       * user activation is gone by then — Chrome's lasts five seconds and the
       * await ends the task that held it — so a popup blocker refuses it, and
       * `noopener` makes the return value `null` whether it was blocked or not,
       * so there is nothing to test. The row used to say **Sent** regardless,
       * which is the worst outcome available on this screen: the nudge IS logged,
       * so the phone's seven-day `COOLDOWN_DAYS` then SUPPRESSES the real
       * reminder that never went. A trainer would read "Sent", the client would
       * never hear from them, and the app would refuse to ask again for a week.
       *
       * So the open is a shortcut for the browsers that allow it, and the row
       * carries the link either way — one click, in the row that changed, with
       * the true sentence beside it.
       *
       * `noopener` because `wa.me` is a third-party origin and a tab opened
       * without it can reach back through `window.opener`.
       */
      if (result.whatsappUrl) {
        window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
      }
      setState(item.key, { kind: 'sent', whatsappUrl: result.whatsappUrl });
    },
    [openLogs, renewTerms, setState],
  );

  const act = useCallback(
    (item: AttentionItem) => {
      // Instant verbs go straight through. `Renew` is a local write against a
      // package and tells nobody, so ten seconds of countdown would be theatre.
      if (!HELD_VERBS.has(item.action)) {
        void commit(item);
        return;
      }

      let left = HOLD_SECONDS;
      setState(item.key, { kind: 'held', secondsLeft: left });

      const ticker = setInterval(() => {
        left -= 1;
        if (left > 0) setState(item.key, { kind: 'held', secondsLeft: left });
      }, 1000);

      const timer = setTimeout(() => {
        clearPending(item.key);
        void commit(item);
      }, HOLD_SECONDS * 1000);

      pending.current.set(item.key, { timer, ticker });
    },
    [clearPending, commit, setState],
  );

  const undo = useCallback(
    (item: AttentionItem) => {
      clearPending(item.key);
      setState(item.key, { kind: 'rest' });
    },
    [clearPending, setState],
  );

  /**
   * Silence a row. `snooze` is a week from the trainer's own clock; permanent is
   * a null `snoozeUntil`.
   *
   * The band travels with the write, and it is the field the whole feature rests
   * on — see `isSilenced`. Optimistic in the row and only in the row: the count in
   * the badge is the server's, so it corrects itself on the next refresh rather
   * than being decremented here and disagreeing with the list.
   */
  const silence = useCallback(
    async (item: AttentionItem, permanent: boolean) => {
      setState(item.key, { kind: 'working' });
      const until = permanent ? null : now + SNOOZE_DAYS * DAY_MS;
      const result = await dismissRow(item.clientId, item.kind, item.band, until);
      if (!result.ok) {
        setState(item.key, { kind: 'failed', message: result.message ?? 'That did not go through.' });
        return;
      }
      setState(item.key, { kind: 'silenced', dismissalId: result.dismissalId, permanent });
    },
    [now, setState],
  );

  const unsilence = useCallback(
    async (item: AttentionItem, dismissalId: string) => {
      setState(item.key, { kind: 'working' });
      const result = await restoreRow(dismissalId);
      setState(
        item.key,
        result.ok
          ? { kind: 'rest' }
          : { kind: 'failed', message: result.message ?? 'That did not go through.' },
      );
    },
    [setState],
  );

  if (items.length === 0) {
    return (
      <Slab title="Needs you today">
        <div>
          <div className="empty empty--card">
            <span className="empty__ic">
              <Check size={22} />
            </span>
            {/*
              THE EMPTY STATE SAYS WHAT THE DAY HOLDS, NOT WHAT IT DOESN'T.

              "You're all caught up" on its own is a screen with nothing on it,
              and a trainer who opens the app once a day needs the next sentence
              anyway. So the count of the day comes with it — the one number that
              is still true when the queue is empty. Never manufacture busywork
              to fill this: the list is trusted precisely because it is sometimes
              empty.
            */}
            <p className="empty__t">You’re all caught up</p>
            <p className="empty__b">
              {todayCount > 0
                ? `${sessionsToday(todayCount)}. Nothing is late, no pack is running out and nobody has gone quiet.`
                : 'Nothing booked today, nothing late, and no pack running out.'}
            </p>
          </div>
        </div>
        <SilencedFoot
          silenced={silenced}
          open={showSilenced}
          onToggle={() => setShowSilenced((v) => !v)}
          states={states}
          onRestore={unsilence}
        />
      </Slab>
    );
  }

  const visible = expanded ? items : items.slice(0, QUEUE_CAP);
  const folded = items.length - visible.length;

  return (
    <Slab title="Needs you today" count={items.length}>
      <span className="vh">
        {clientsNeedYou(items.length)}
      </span>
      <div className="q__scroll">
        {/*
          `.tbl--stack`, WHICH IS THE WHOLE PHONE STORY FOR THIS COMPONENT.

          Four columns, `.tbl tbody td{white-space:nowrap}`, and the action pair
          pinned right. At 1440px that is the correct shape and the columns align
          down the list, which is the argument for a table. At 390px the four
          cannot coexist: the reason is the longest cell and must not be
          truncated ("₹6,000 overdue · 11 days" IS the row), the verb is the point
          of the row and cannot be the thing that scrolls off, and the name is how
          the trainer knows who they are about to message.

          A horizontal scroller would be technically compliant — WCAG 1.4.10
          exempts content that needs a two-dimensional layout — and wrong here for
          a reason the reflow rule does not cover: this is the screen a trainer
          came to the desk to CLEAR, and the column they would have to scroll to
          reach is the one holding every action on it.

          So below 620px the row becomes two: name over reason, the actions to the
          right of both. One markup, one `<table>`, and §22's `.tbl tbody tr.crit`
          and `tr.held` keep working unchanged — which is why this is a reflow and
          not a second component. The cost is stated: `display:grid` on a `<tr>`
          drops the table role in every engine, so below 620px this announces as a
          list of rows rather than as a table. It costs nothing here, because the
          table has no `<thead>`: there are no column names to lose.
        */}
        {/*
          THE MEASURE, WHICH IS WHAT WAS ACTUALLY WRONG WITH THIS TABLE.

          Rendered at 1536px the four columns came out `.q__who` 550px around a
          ~110px name and `.q__why` 703px around an ~80px reason: 1060px of a
          1407px row was air, and the eye travelled 550px from a client's name to
          the reason they need a decision about them. Nothing was overflowing, so
          nothing looked broken.

          `atn` fixes it with `table-layout:fixed` and three widths rather than by
          becoming a different element, and the widths live in the `<colgroup>`
          below — scoped, in §25, to 621px and up.

          BOTH HALVES OF THAT ARE A BUG THIS TABLE ACTUALLY HAD. The widths were
          on the CELLS first, because a colgroup that applied at every width shrank
          the phone row to 320px inside a 350px table (below 620px `.tbl--stack`
          makes each row a grid, and the column widths go on sizing the anonymous
          cell around it) and wrapped every reason to four lines. But cell widths
          under `table-layout:fixed` are read off the FIRST ROW, and the first row
          is not always four cells: open the confirm on the TOP row and it becomes
          `.q__who` + `.q__why[colspan=3]`, no width is declared anywhere, and
          Chrome splits the table three ways — measured at 1440, that dragged
          `Renew` and `Check in` on every row BELOW the open confirm 383px to the
          left. A colgroup's widths belong to the table, so no row state can move
          them.

          The cell classes below are UNCHANGED on purpose: `.tbl--stack` keys its
          whole phone layout on `.q__why`, `.q__act` and `.q__x`, and the six row
          states re-span those cells through real `colSpan` attributes. Renaming
          them would take all of that with it for a change that is about column
          widths.
        */}
        <table className="tbl tbl--stack atn">
          <colgroup>
            <col className="atn__c-who" />
            <col className="atn__c-why" />
            <col className="atn__c-act" />
            <col className="atn__c-x" />
          </colgroup>
          <tbody>
            {visible.map((item) => (
              <Row
                key={item.key}
                item={item}
                state={states[item.key] ?? { kind: 'rest' }}
                onAct={() => act(item)}
                onUndo={() => undo(item)}
                onChoose={() => setState(item.key, { kind: 'choosing' })}
                onCancel={() => setState(item.key, { kind: 'rest' })}
                onSilence={(permanent) => void silence(item, permanent)}
                onUnsilence={(id) => void unsilence(item, id)}
                renewable={item.action !== 'Renew' || (renewTerms[item.clientId]?.amount ?? 0) > 0}
                now={now}
              />
            ))}
          </tbody>
        </table>

        {/*
          FOLDED, AND THE COUNT IS IN THE LABEL.

          Not "Show more" — a disclosure that does not say how much is behind it
          asks the trainer to click to find out whether it was worth clicking. And
          it collapses again, because a trainer who opened forty rows to find one
          wants the six back.
        */}
        {folded > 0 && (
          <button className="atn__more" type="button" onClick={() => setExpanded(true)}>
            Show {folded} more {folded === 1 ? 'row' : 'rows'}
          </button>
        )}
        {expanded && items.length > QUEUE_CAP && (
          <button className="atn__more" type="button" onClick={() => setExpanded(false)}>
            Show the top {QUEUE_CAP} only
          </button>
        )}
      </div>

      <SilencedFoot
        silenced={silenced}
        open={showSilenced}
        onToggle={() => setShowSilenced((v) => !v)}
        states={states}
        onRestore={unsilence}
      />
    </Slab>
  );
}

/**
 * Verb → server action, in one place.
 *
 * A lookup rather than a chain of ternaries in `commit`, because the chain was
 * already four deep at four verbs and this ladder has six. The default is
 * deliberately `renew` — no: it is an explicit refusal. A verb this function does
 * not know is a row `deck.ts` added and nobody wired up, and running the last
 * branch of a ternary chain against it would send the wrong request to the right
 * client. It says so instead.
 */
async function runVerb(
  item: AttentionItem,
  renewTerms: Record<string, RenewTerms>,
  openLogs: Record<string, string[]>,
) {
  switch (item.action) {
    case 'Remind':
      return remind(item.clientId);
    case 'Check in':
      // The band picks the template: `missed_session` names the absences,
      // `check_in` asks after somebody. Same verb on the row, different draft.
      return checkIn(item.clientId, item.kind === 'missed' ? 'missed_session' : 'check_in');
    case 'Wish':
      return wish(item.clientId);
    case 'Mark':
      return markAttended(item.sessionIds ?? []);
    case 'Close':
      return closeLogs(openLogs[item.clientId] ?? []);
    case 'Renew':
      return renew(
        item.clientId,
        renewTerms[item.clientId] ?? { type: 'session_pack', amount: 0, sessionsTotal: null },
      );
    default:
      return { ok: false, message: `${item.action} is not wired up on this screen yet.` };
  }
}

/* ─────────────────────────────────────────────────────── the silenced foot ── */

/**
 * What the trainer has said *not now* to.
 *
 * Rendered only when there is something in it, and closed by default — this is a
 * record, not a queue, and opening the day with it expanded would put work the
 * trainer has already declined above work they have not.
 *
 * It is a `<details>`-shaped disclosure built from a button and a list rather than
 * the element, for one reason: the rows contain buttons, and a `<summary>`'s
 * sibling content inside `<details>` is fine but the whole block sits inside a
 * `.card`, whose foot rules this borrows. Nothing here needs the element's
 * built-in toggle, and `aria-expanded` on a button is the same contract.
 */
function SilencedFoot({
  silenced,
  open,
  onToggle,
  states,
  onRestore,
}: {
  silenced: AttentionItem[];
  open: boolean;
  onToggle: () => void;
  states: Record<string, RowState>;
  onRestore: (item: AttentionItem, dismissalId: string) => void;
}) {
  if (silenced.length === 0) return null;
  return (
    <div className="q__foot">
      <button className="q__foot-t" type="button" onClick={onToggle} aria-expanded={open}>
        <BellOff size={14} />
        {silenced.length} {silenced.length === 1 ? 'row is' : 'rows are'} silenced
      </button>
      {open && (
        <ul className="q__hid">
          {silenced.map((item) => {
            const state = states[item.key];
            return (
              <li key={item.key}>
                <span className="q__hid-w">
                  <b>{item.clientName}</b>
                  <span className="small">{item.line}</span>
                </span>
                {state?.kind === 'rest' ? (
                  <span className="ok">Back in the list</span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={state?.kind === 'working'}
                    onClick={() => item.dismissalId && onRestore(item, item.dismissalId)}
                  >
                    {state?.kind === 'working' ? '…' : 'Restore'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── one row ── */

function Row({
  item,
  state,
  onAct,
  onUndo,
  onChoose,
  onCancel,
  onSilence,
  onUnsilence,
  renewable,
  now,
}: {
  item: AttentionItem;
  state: RowState;
  onAct: () => void;
  onUndo: () => void;
  onChoose: () => void;
  onCancel: () => void;
  onSilence: (permanent: boolean) => void;
  onUnsilence: (dismissalId: string) => void;
  renewable: boolean;
  /** The ticking clock, so *messaged yesterday* re-reads itself at midnight. */
  now: number;
}) {
  /*
   * `AttentionItem.severity` is 'alert' | 'critical'. Two levels, so TWO MARKS
   * and not two colours: critical takes a 2px danger edge on the row, alert takes
   * nothing. A tone on every row is a tone on no row.
   */
  /* `item.key` is `pack:<uuid>`; the colon is legal in an id but needs escaping
     in every selector that ever touches it, so the description gets a plain one. */
  const whyId = `why-${item.kind}-${item.clientId}`;
  const first = item.clientName.split(' ')[0];

  const rowClass = [
    item.severity === 'critical' ? 'crit' : '',
    state.kind === 'held' ? 'held' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const who = (
    <td className="q__who">
      <Link className="who" href={`/clients/${item.clientId}`}>
        <Avatar name={item.clientName} id={item.clientId} size="sm" />
        <b>{item.clientName}</b>
      </Link>
    </td>
  );

  if (state.kind === 'held') {
    const percent = Math.round((100 * state.secondsLeft) / HOLD_SECONDS);
    return (
      <tr className={rowClass}>
        {who}
        <td className="q__why">
          {/*
            NO `aria-live` HERE, AND THAT IS THE FIX.
            This cell's text changes every second, so a live region on it
            announced "Held — Meera is told in 9 seconds", then 8, then 7: ten
            interruptions per row, talking over the Undo button it exists to point
            at, and six rows can be counting at once. The number stays visible for
            the eye that can read it; the sentence is announced ONCE, below,
            without the number in it, so nothing re-fires while it ticks.
          */}
          <span className="acc">Held</span>: {first} is told in{' '}
          <b className="tnum">{state.secondsLeft}s</b>
          <span className="vh" aria-live="polite">
            Held. {first} is told in {HOLD_SECONDS} seconds unless you undo it.
          </span>
        </td>
        <td className="q__act" colSpan={2}>
          <div className="hold">
            <button className="hold__b" type="button" onClick={onUndo}>
              Undo
            </button>
            {/*
              The bar is REDUNDANT and that is what makes its contrast
              acceptable: the row already states the number, so the countdown is
              never carried by the bar alone. §22 of the stylesheet carries the
              measurement and the warning that goes with it — take the number out
              of the row and this bar needs a darker track.
            */}
            {/* `aria-hidden`, because the comment above is right that the bar is
                redundant — and a `progressbar` whose `aria-valuenow` moves every
                second is a SECOND per-second announcement for the same countdown
                the live region above already gives once. Redundant to the eye is
                a reason to draw it; redundant to the ear is a reason to hide it. */}
            <div className="cw__bar cw__bar--row" aria-hidden="true">
              <i style={{ width: `${percent}%` }} />
            </div>
          </div>
        </td>
      </tr>
    );
  }

  /*
   * THE CONFIRM REPLACES THE REASON, IN THE ROW'S OWN BOX.
   *
   * `AccountMenu.tsx`'s call, for its reason and one more that is specific to a
   * table: a popover anchored to a cell inside `.q__scroll` is positioned against
   * a scroll container, so it detaches from its row the moment the queue is
   * scrolled — and it covers the row it is asking about, which is the row whose
   * name the trainer is checking before they silence it.
   *
   * Three choices and no fourth. A duration picker here would be a form in a table
   * cell answering a question the trainer has no basis to answer precisely; a week
   * is the shortest useful snooze, and *Dismiss* is the other end.
   */
  if (state.kind === 'choosing') {
    return (
      <tr className={rowClass}>
        {who}
        <td className="q__why" colSpan={3}>
          <div className="q__ask">
            <span>Stop raising this?</span>
            <Button size="sm" onClick={() => onSilence(false)}>
              Snooze a week
            </Button>
            <Button size="sm" onClick={() => onSilence(true)}>
              Dismiss
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Keep it
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  if (state.kind === 'silenced') {
    return (
      <tr className={rowClass}>
        {who}
        <td className="q__why" aria-live="polite">
          <span className="acc">{state.permanent ? 'Dismissed' : 'Snoozed'}</span>:{' '}
          {state.permanent
            ? 'this will not be raised again unless it gets worse.'
            : `back in ${SNOOZE_DAYS} days, sooner if it gets worse.`}
        </td>
        <td className="q__act" colSpan={2}>
          {/*
            A REAL UNDO, UNLIKE THE MESSAGES'.
            `restoreRow` deletes the row `dismissRow` just wrote, so this is a
            reversal rather than a ten-second window before one. It is offered
            without a countdown for that reason — there is nothing expiring.
          */}
          <Button
            size="sm"
            variant="ghost"
            disabled={!state.dismissalId}
            onClick={() => state.dismissalId && onUnsilence(state.dismissalId)}
          >
            Undo
          </Button>
        </td>
      </tr>
    );
  }

  if (state.kind === 'sent') {
    /*
     * TWO RECEIPTS, BECAUSE TWO DIFFERENT THINGS FINISHED.
     *
     * `Renew`, `Mark` and `Close` are done: a row exists and nobody had to be
     * told. The tag closes the row.
     *
     * `Remind`, `Check in` and `Wish` are not. The backend wrote the message and
     * logged the nudge; the message itself goes out of the trainer's own WhatsApp,
     * and the browser will not open that tab from a timer (see `commit`). So the
     * row says what actually happened — logged, written, not yet read by anybody —
     * and hands over the one click that finishes it.
     */
    return (
      <tr className={rowClass}>
        {who}
        <td className="q__why" aria-live="polite">
          {state.whatsappUrl ? (
            <>
              <span className="acc">Written</span>: {first} hears nothing until you
              open it.
            </>
          ) : (
            <>
              <span className="ok">{DONE_WORDS[item.action] ?? 'Done'}</span>: {item.line}
            </>
          )}
        </td>
        <td className="q__act" colSpan={2}>
          {state.whatsappUrl ? (
            <Button
              size="sm"
              variant="primary"
              href={state.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open
            </Button>
          ) : (
            <Tag tone="ok">
              <Check size={12} />
              Done
            </Tag>
          )}
        </td>
      </tr>
    );
  }

  if (state.kind === 'failed') {
    return (
      <tr className={rowClass}>
        {who}
        <td className="q__why q__why--bad" aria-live="polite">
          {state.message}
        </td>
        <td className="q__act" colSpan={2}>
          <Button size="sm" onClick={onAct}>
            Retry
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={rowClass}>
      {who}
      <td className="q__why">
        {item.line}
        {/*
          ALREADY MESSAGED, AND THE ROW SAYS SO RATHER THAN VANISHING.

          `deck.ts` has already pushed this row below every uncontacted one, so on
          a normal morning it is behind the disclosure and the trainer never sees
          it — which is what "the queue does not re-nag" means. When they DO open
          the fold, the row has to explain why it is down here, or the ordering
          reads as broken.

          The verb beside it still works. The trainer knows things the log does
          not — the client replied, or asked to be chased again on Thursday — and
          a refusal here teaches them to open WhatsApp directly, which loses the
          log for every client rather than enforcing the cap for one.
        */}
        {item.contactedAt !== undefined && (
          <span className="q__seen"> · messaged {contactedLabel(item.contactedAt, now)}</span>
        )}
      </td>
      <td className="q__act">
        {/*
          A NAVIGATING VERB IS A LINK, NOT A BUTTON THAT NAVIGATES.
          `Assign` is the only one today. There is no request that gives a client
          a program — one is built exercise by exercise, or applied from a template
          with a per-client schedule chosen at apply time — so the row cannot
          commit it, and a `<button>` that turns out to navigate is a promise the
          middle-click, the back button and the status bar all break.
        */}
        {item.href ? (
          <Button size="sm" href={item.href}>
            {item.action}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={renewable ? onAct : undefined}
            disabled={state.kind === 'working'}
            /*
             * A `Renew` with no pack to repeat is REFUSED, not hidden: the row is
             * still telling the trainer something true, and the verb's absence
             * would read as the row having no answer.
             *
             * `aria-disabled`, never `disabled` — and that is the fix. A `disabled`
             * button leaves the tab order and its `title` is never announced, so
             * the ONE row on this screen that needs an explanation was the one row
             * that could not give one. This stays focusable, `.btn[aria-disabled]`
             * in §17 already greys it and takes its pointer, and the reason is
             * carried as text a reader can reach.
             */
            aria-disabled={renewable ? undefined : true}
            aria-describedby={renewable ? undefined : whyId}
          >
            {state.kind === 'working' ? '…' : item.action}
          </Button>
        )}
        {!renewable && (
          <span className="vh" id={whyId}>
            No previous pack to repeat. Sell one in the money book.
          </span>
        )}
      </td>
      {/*
        THE FOURTH CELL, AND WHY IT IS A CELL RATHER THAN A SECOND BUTTON IN THE
        THIRD ONE.

        `.q__act` is 98px and ranged right, sized for one verb; a 28px icon button
        inside it would make the verb's own width depend on whether the row can be
        silenced. Its own column keeps every verb down the list aligned, which is
        the whole reason this is a table.

        The label names the CLIENT, not the row. "Dismiss options" six times down a
        list is six identical accessible names for six different rows, and it is
        the one control on the row whose consequence is that the row goes away.
      */}
      <td className="q__x">
        <button
          className="q__x-b"
          type="button"
          onClick={onChoose}
          aria-label={`Snooze or dismiss ${item.clientName}’s row`}
        >
          <Ellipsis size={16} />
        </button>
      </td>
    </tr>
  );
}

/**
 * What each instant verb's receipt says.
 *
 * A table rather than a nested ternary, for the reason the ternary chain in
 * `commit` was replaced: at three verbs it was readable and at six it is a wall.
 * The fallback is *Done*, which is true of anything that got this far.
 */
const DONE_WORDS: Record<string, string> = {
  Renew: 'Pack renewed',
  Close: 'Log closed',
  Mark: 'Marked attended',
};

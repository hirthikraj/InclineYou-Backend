'use client';

import { useOptimistic, useState, useTransition } from 'react';

import { setNotify } from '@/lib/portal/actions';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';
import { SwitchRow } from '@/web-components/ui/Switch';

type Key = 'programUpdated' | 'sessionReminder' | 'trainerNote' | 'personalBest' | 'packChanged';

/**
 * §"Notifications" — **"Cap at roughly one per day. Let clients turn categories
 * off individually."**
 *
 * ── THE FOUR CATEGORIES ARE THE SPEC'S *SEND* COLUMN, EXACTLY ────────────────
 *
 * The spec sets this out as a table of what to send and what not to, and the
 * *don't* column is not a set of switches — it is a set of messages this product
 * does not send at all:
 *
 * | Send — a switch each | Don't send — no switch, because none exists |
 * | --- | --- |
 * | *Rahul updated your program* | *Don't forget to work out!* |
 * | *Session tomorrow, 6:30am* | *You haven't opened the app in 3 days* |
 * | *You beat your squat PR* | *Your streak is about to end!* |
 * | *Rahul left you a note* | Anything at all on a rest day |
 *
 * So the *don't* column gets no switches at all, and the copy under them says
 * so. A screen with an *engagement reminders* toggle set to off would imply the
 * product has one to turn on — and the spec's rule is that **notifications come
 * from the trainer, not the platform**, which is a fact about what is built
 * rather than a preference to expose.
 *
 * ── AND THE FOUR BECAME FIVE, WHICH IS THE RULE RATHER THAN AN EXCEPTION ────
 *
 * `packChanged` is not in the spec's table and is the most literally
 * trainer-sourced of the five: a pack sold, a pack renewed, a payment written
 * against it. It arrived with the bell, and it arrived because of the rule
 * above: **the feed draws five kinds, so there are five switches.** A category
 * that reached a client's feed with no way to turn it off would break the
 * promise §5 makes about this card — *"granular, and genuinely respected"* —
 * and the spec's argument was never a cap on how many things a trainer can do;
 * it was a refusal to let the PLATFORM invent any.
 *
 * `lib/portal/notifications.ts` holds the kinds and `mock/portal.ts` holds the
 * gate. One switch per kind, checked by the compiler at both ends.
 *
 * ── WHERE THEY ARRIVE, AND THE LINE THAT HAD TO BE REWRITTEN ────────────────
 *
 * A client turning *Session reminders* on is owed an answer to *on what?*, and
 * this card used to answer **"Nothing is sent to this browser."** That was true
 * when it was written and the bell made it false: every category here now also
 * lands in the panel behind the top bar's bell, on this browser, on every
 * `/me/*` screen.
 *
 * So the line names all three — **the bell, SMS, and WhatsApp** — and the bell
 * goes first, because it is the one that is actually wired.
 *
 * **There is still no push channel and still no permission row.** Sweeps for
 * `Notification.requestPermission`, `serviceWorker`, `pushManager` and
 * `web-push` across `app/`, `lib/`, `components/` and `public/` come back
 * empty, and there is no manifest in `public/`; the spec's architecture note
 * asks for *"web push on iOS 16.4+ and Android"* and nothing answers it. A row
 * reading *Reminders on this device — Turn on* against no service worker is the
 * dead affordance this codebase keeps deleting. When push lands, the row goes
 * ABOVE these switches and shows the grant's real state — a switch whose
 * delivery depends on a browser permission must show the permission, or it is
 * reporting a setting rather than a fact. Not before.
 *
 * ── AND A SWITCH TURNED OFF DOES NOT ERASE WHAT IT ALREADY SENT ─────────────
 *
 * The gate is on the MINT, not on the read — `mintClientNotification` in
 * `mock/portal.ts` carries the full argument. The short version is that the
 * feed is a record: filtering it on the way out would mean turning a switch
 * back on refills three weeks of history the client was never told about, and
 * turning it off rewrites the past. So a category turned off goes quiet from
 * that moment, and the rows already in the bell stay.
 *
 * ── AND THE SWITCH SAVES ON THE MOVE, WHICH IS WHY IT IS A SWITCH ────────────
 *
 * `Switch`'s own docstring draws the line: *"a checkbox is a value collected
 * and then saved with everything else on the form; a switch has already saved
 * by the time the thumb lands. If there is a Save button underneath it, it was
 * a checkbox."* There is no Save button on this card.
 *
 * `useOptimistic` is what makes that true to the eye: without it the thumb does
 * not move until the server answers, which on a gym's wifi is a switch that
 * looks broken. A failure reverts it and says so — the revert is the point,
 * because a switch that stayed on after a failed write would be a promise about
 * notifications the server never took.
 */
const ROWS: { key: Key; label: string; example: string }[] = [
  {
    key: 'sessionReminder',
    label: 'Session reminders',
    example: 'the evening before, once',
  },
  {
    key: 'programUpdated',
    label: 'When your plan changes',
    example: 'your trainer rewrote a day',
  },
  {
    key: 'trainerNote',
    label: 'Notes from your trainer',
    example: 'a message they typed for you',
  },
  {
    key: 'personalBest',
    label: 'When you beat a best',
    example: 'a new top set on a lift',
  },
  {
    /* Last, and deliberately. The four above are about training and this one is
       about money, which is the thing on this screen a client is least likely
       to want turned off and most likely to be startled to find in a list of
       training notifications. The example says which writes it is about, so
       nobody reads it as a reminder that something is DUE — nothing in this
       product chases a client for money, and `lib/nudges` is the trainer's. */
    key: 'packChanged',
    label: 'Changes to your pack',
    example: 'a renewal, or a payment written down',
  },
];

export function NotifySwitches({
  notify,
  trainerFirstName,
}: {
  notify: Record<Key, boolean>;
  trainerFirstName: string;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  const [, start] = useTransition();
  const [shown, setShown] = useOptimistic(
    notify,
    (state: Record<Key, boolean>, patch: { key: Key; on: boolean }) => ({
      ...state,
      [patch.key]: patch.on,
    }),
  );

  function toggle(key: Key, on: boolean) {
    setFailure(null);
    start(async () => {
      setShown({ key, on });
      const res = await setNotify(key, on);
      /* No success branch. The action revalidates this route, so the server's
         own value arrives as the new `notify` prop and the optimistic state is
         discarded — which is what makes the switch's position the SERVER's
         answer rather than the last thing the finger did. */
      if (!res.ok) setFailure(res.message);
    });
  }

  const allOff = ROWS.every((r) => !shown[r.key]);

  return (
    <Card>
      <CardHead title="Notifications" />
      <CardBody>
        {/* ── NOT `KeyValueRow`, AND IT WAS ONE UNTIL IT WAS MEASURED ──────

            `.kv` is a two-item flex line: `flex-wrap:nowrap`, an 80px
            `min-width` on the key and `white-space:nowrap` on the value. That
            is right for a key and a figure and it cannot hold a label, a
            sentence and a switch: measured **227px of content in a 147px slot**
            at 390px, so the example ran past the card.

            ── AND THEN THE HAND-BUILT ROW WAS THE DEFECT ────────────────────

            What replaced it was a `.row` with a `.col` of text and a `Switch` at
            the end — correct about the wrapping, and it left the label inert.
            MEASURED at 390px: each row is **324px wide** and the only thing on it
            that answered a press was the **46x30** track at the far end. Six
            times, on the card that is the whole point of this tab.

            `SwitchRow` is `c-switch`'s row form and the row itself is the
            button — 324x46 of target, and the accessible name is the text a
            client reads rather than an `aria-label` repeating it. The border
            between rows is `.swrow + .swrow` now, so the call-site stops
            counting indices to draw one. */}
        <div className="col">
          {ROWS.map((r) => (
            <SwitchRow
              key={r.key}
              checked={shown[r.key]}
              title={r.label}
              example={r.example}
              onChange={(next) => toggle(r.key, next)}
            />
          ))}
        </div>

        {failure && (
          <Message tone="err" alert className="mt3">
            {failure}
          </Message>
        )}

        <p className="small mt3" style={{ color: 'var(--tx-ink)' }}>
          {/* WHERE, before WHO. Switches promising delivery with no channel
              named is a setting a client cannot check: they turn one on and
              then watch a phone without knowing what they are watching for.

              The bell leads because it is the one that is wired. `SMS` is cased
              in TS for the reason `Account`'s payments table cases `UPI`: a
              `text-transform:capitalize` in the stylesheet title-cases an
              acronym, and `Sms` shouts a plain word. */}
          These show up on the bell at the top of this screen, and arrive by SMS or on WhatsApp
          where {trainerFirstName} sends from there. Turning a switch on here does not ask for a
          notification permission — nothing is pushed to this device yet.
        </p>
        <p className="small mt3">
          {/* The spec's rule, said to the person it protects. It is the reason
              there are four switches rather than eight, and a client who has
              been nagged by every other fitness app they have tried is the
              person most likely to want to know. */}
          Everything we send comes from {trainerFirstName} — never from
          InclineYou. There are no streak warnings, no reminders to work out and
          nothing at all on a rest day.
        </p>

        {allOff && (
          <p className="small mt2 ink3">
            {/* Not a warning. Turning every category off is a legitimate answer
                and §"Notifications" calls a generic nag the uninstall lever —
                this just says what the consequence is, once, without arguing.

                It names the bell too, because that is the consequence a client
                will actually notice: an empty panel on a week their trainer
                rewrote their plan is otherwise indistinguishable from a quiet
                week. */}
            All off. Nothing new will reach the bell, and {trainerFirstName} can still message you
            on WhatsApp.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

'use client';

import { useState } from 'react';

import { NudgeButton } from '@/components/nudge/NudgeButton';
import { contactedLabel } from '@/lib/nudges/cooldown';
import type { NudgeLogEntry, NudgeTemplateName } from '@/lib/nudges/types';

/**
 * FOLLOW-UPS — what has been sent to this client, and one way to send the next.
 *
 * The brief's second half of the logging rule: *"so the client timeline shows the
 * follow-up history."* Until V32 there was no way to read it — `nudge_log`
 * reached the wire only inside the sync envelope, so the phone knew every message
 * the trainer had ever drafted and the web knew none of them.
 *
 * ── WHY IT IS ON OVERVIEW AND NOT ON NOTES ───────────────────────────────────
 *
 * Notes are what the TRAINER wrote about the client, for themselves. This is what
 * the trainer said TO the client. They read the same way — a date and some text —
 * and they are opposite in every way that matters: one is private and one has
 * already been sent, one can be edited and one cannot. Filing them together would
 * make the pinned strip's promise ("Before every session") ambiguous about which
 * kind it is showing.
 *
 * ── THE SIX-BUTTON ROW IS NOT A DUPLICATE OF THE OTHER SURFACES ──────────────
 *
 * Every other nudge button in the app is attached to a condition: the pack is
 * running out, the money is late, they missed two. That is the whole design —
 * the button sits next to the thing that triggered it.
 *
 * This one is the case the conditions do not cover: a trainer who has opened
 * somebody's file *because they were thinking about them*. `re_engagement` is
 * here and nowhere else for exactly that reason — nothing on this half raises a
 * lapsed row, so if a trainer wants to reach out to somebody who stopped in June
 * this is the only place they can.
 *
 * ── AND THE HEADER'S WHATSAPP BUTTON STAYS A PLAIN LINK ──────────────────────
 *
 * `Header.tsx` carries the argument and it is unchanged: that button opens a
 * conversation and logs nothing, because routing it through the nudge endpoint
 * would spend the client's weekly message on "are we on for Tuesday" and silently
 * quiet the overdue reminder three days later. What is drafted here is logged; a
 * chat opened up there is not. The two are different acts and the screen draws
 * them differently.
 */

/**
 * The six a trainer would choose deliberately.
 *
 * `session_reminder` is absent: it is about tomorrow's booking and belongs on the
 * evening's hero card, where the product already knows there is one. A file has
 * no particular session in view.
 */
const OFFERED: { template: NudgeTemplateName; label: string; hint: string }[] = [
  { template: 'payment_reminder', label: 'Payment', hint: 'What they still owe' },
  { template: 'renewal', label: 'Renewal', hint: 'Sessions left on their pack' },
  { template: 'missed_session', label: 'Missed sessions', hint: 'Names the absences' },
  { template: 'check_in', label: 'Check in', hint: 'How is the week going' },
  { template: 're_engagement', label: 'Re-engagement', hint: 'For somebody who stopped' },
  { template: 'session_summary', label: 'Session summary', hint: 'After today' },
  { template: 'well_done', label: 'Well done', hint: 'A round number of sessions' },
];

export function FollowUps({
  clientId,
  clientName,
  entries,
  now,
}: {
  clientId: string;
  clientName: string;
  entries: NudgeLogEntry[];
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const last = entries[0] ?? null;

  return (
    <div className="card mt3">
      <div className="card__hd">
        <h2 className="card__t">Follow-ups</h2>
        {last && <span className="tag">Last {contactedLabel(last.sentAt, now)}</span>}
        <span className="card__acts">
          <button
            className="btn btn--sm btn--secondary"
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Close' : 'Send a message'}
          </button>
        </span>
      </div>

      <div className="card__b">
        {open && (
          <div className="fup__pick">
            {OFFERED.map((row) => (
              <div className="fup__opt" key={row.template}>
                <span className="fup__optl">
                  <b>{row.label}</b>
                  <span className="small">{row.hint}</span>
                </span>
                <NudgeButton
                  clientId={clientId}
                  clientName={clientName}
                  template={row.template}
                  label="Draft"
                  className="btn btn--sm btn--secondary"
                  showContactedNote={false}
                />
              </div>
            ))}
            <p className="small" style={{ marginTop: 10, color: 'var(--tx-ink-3)' }}>
              Every one of these opens your own WhatsApp with the message typed in — nothing
              is sent until you press send there. The wording is yours to change in{' '}
              <a href="/settings/nudges">Settings → Nudge messages</a>.
            </p>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
            Nothing has been sent to {clientName.split(' ')[0]} from InclineYou yet.
          </p>
        ) : (
          <ol className="fup">
            {entries.slice(0, 12).map((entry) => (
              <li className="fup__row" key={entry.id}>
                <span className="fup__when">{contactedLabel(entry.sentAt, now)}</span>
                <span className="fup__body">
                  <b>{entry.templateLabel}</b>
                  {/*
                    `message` is null on every row written before V32 added the
                    column, and it is left as an absence rather than re-rendered
                    from the template. The wording belongs to the trainer now, so
                    re-rendering March's reminder in August's words would put a
                    sentence in the history that was never sent.
                  */}
                  {entry.message ? (
                    <span className="fup__msg">{entry.message}</span>
                  ) : (
                    <span className="fup__msg ink3">
                      Sent before InclineYou started keeping the wording.
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}

        {entries.length > 12 && (
          <p className="small" style={{ marginTop: 8, color: 'var(--tx-ink-3)' }}>
            {entries.length - 12} more in the last year.
          </p>
        )}
      </div>
    </div>
  );
}

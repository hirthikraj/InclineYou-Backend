import Link from 'next/link';

import { Chevron } from '@/components/shell/Icons';
import { avatarToken, initials, rupees } from '@/lib/today/time';
import type { ClientDetailWire, ClientPackageWire, ClientPaymentWire } from '@/lib/clients/client-api';

import { CalendarIcon, DumbbellIcon, MessageIcon, PhoneIcon, dateStr, num } from './shared';

/**
 * THE FILE'S HEADER.
 *
 * Who they are, how to reach them in one tap, and the two numbers a trainer
 * opens a client file to find out.
 *
 * ── WHATSAPP HERE IS A CONVERSATION, NOT A NUDGE ────────────────────────────
 *
 * `POST /v1/clients/{id}/nudge` renders a message, writes a `nudge_log` row and
 * hands back a `wa.me` link — and the phone computes a once-per-client-per-7-days
 * cooldown from that table (`app/src/nudges/rules.ts`). So routing this button
 * through it would spend a trainer's weekly reminder on "are we on for Tuesday",
 * and the real overdue-payment reminder three days later would be silently
 * capped. This is a plain `wa.me` link that logs nothing. The money book's
 * *Remind* is the one that nudges, and it should stay the only one.
 *
 * ── AND THE NUMBER IS WRITTEN OUT, NOT JUST LINKED ──────────────────────────
 *
 * `+91 98765 43210` in the sub-line, because a trainer on a gym desktop reads it
 * off the screen and dials it on the phone in their hand at least as often as
 * they click it.
 */

/** `9876543210` → `98765 43210`. Anything that is not ten digits is left alone. */
function prettyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

/** What `wa.me` and `tel:` want: country code, no punctuation. */
function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  invited: 'Invited',
  archived: 'Archived',
};

const STATUS_TAG: Record<string, string> = {
  active: 'tag--ok',
  invited: 'tag--info',
  paused: 'tag--warn',
  archived: '',
};

export function Header({
  client,
  packages,
  activePackagePayments,
  sessionCount,
}: {
  client: ClientDetailWire;
  packages: ClientPackageWire[];
  activePackagePayments: ClientPaymentWire[];
  sessionCount: number;
}) {
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

  const left = activePkg?.sessionsRemaining ?? null;
  const total = activePkg?.sessionsTotal ?? null;
  /* Two or fewer is the same threshold `StatusFlags.sessionPackLow` uses on the
     server and `deck.ts` uses on Today. One number, three screens. */
  const packLow = left !== null && left <= 2;

  const statusLabel = STATUS_LABEL[client.status] ?? client.status;
  const statusTag = STATUS_TAG[client.status] ?? '';
  const modeLabel =
    client.deliveryMode === 'floor' ? 'Floor' : client.deliveryMode === 'remote' ? 'Remote' : null;
  const modeTag = client.deliveryMode === 'floor' ? 'tag--floor' : 'tag--remote';

  const phone = client.phone ? dialable(client.phone) : null;

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Link
          href="/clients"
          className="btn btn--ghost btn--sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
            <Chevron size={14} />
          </span>
          All clients
        </Link>
      </div>

      <div className="ph__row" style={{ alignItems: 'center' }}>
        <span
          className="av av--lg"
          style={{ background: `var(${avatarToken(client.id)})`, flexShrink: 0 }}
          aria-hidden="true"
        >
          {initials(client.name)}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="ph__t">
            {client.name}
            <span className={`tag ${statusTag}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>
              {statusLabel}
            </span>
            {modeLabel && (
              <span className={`tag ${modeTag}`} style={{ marginLeft: 6, verticalAlign: 'middle' }}>
                {modeLabel}
              </span>
            )}
          </p>
          <p className="ph__sub">
            {client.phone && `+91 ${prettyPhone(client.phone)} · `}
            joined {dateStr(client.createdAt)} · {sessionCount} session
            {sessionCount === 1 ? '' : 's'} logged
          </p>
        </div>

        {/* The two figures. See `.cfhead` in app.css for why they do not flex. */}
        <div className="strip cfhead">
          <div>
            <b>
              {left !== null ? (
                <>
                  {left}
                  {total !== null && <span className="ink3">/{total}</span>}
                </>
              ) : (
                <span className="ink3">—</span>
              )}
            </b>
            <i style={packLow ? { color: 'var(--tx-warn)' } : undefined}>
              {left === null ? 'No pack' : packLow ? 'Pack low' : 'Sessions left'}
            </i>
          </div>
          <div>
            <b style={owed > 0 ? { color: 'var(--tx-danger)' } : undefined}>
              {owed > 0 ? rupees(owed) : 'Nil'}
            </b>
            <i>{owed > 0 ? 'Owes you' : 'Paid up'}</i>
          </div>
        </div>

        <div className="ph__acts">
          {/* Icon-only, because four labelled buttons do not fit beside a name and
              two figures — and these two are the pair a trainer already knows by
              shape. Both carry their label to the accessibility tree. */}
          <a
            className="btn btn--secondary btn--icon"
            href={phone ? `https://wa.me/${phone}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={phone ? undefined : true}
            title={phone ? `WhatsApp ${client.name}` : 'No number on file'}
            aria-label={phone ? `WhatsApp ${client.name}` : 'No number on file'}
          >
            <MessageIcon />
          </a>
          <a
            className="btn btn--secondary btn--icon"
            href={phone ? `tel:+${phone}` : undefined}
            aria-disabled={phone ? undefined : true}
            title={phone ? `Call ${client.name}` : 'No number on file'}
            aria-label={phone ? `Call ${client.name}` : 'No number on file'}
          >
            <PhoneIcon />
          </a>
          <Link className="btn btn--secondary" href="/schedule">
            <CalendarIcon />
            Book
          </Link>
          <Link className="btn btn--primary" href="/sessions/new">
            <DumbbellIcon />
            Log a session
          </Link>
        </div>
      </div>
    </>
  );
}

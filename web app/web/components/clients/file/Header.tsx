
import { Chevron } from '@/components/shell/Icons';
import { avatarToken, initials, rupees } from '@/lib/today/time';
import type { ClientDetailWire, ClientPackageWire, ClientPaymentWire } from '@/lib/clients/client-api';

import { CalendarIcon, MessageIcon, PhoneIcon, dateStr, num } from './shared';
import { Button } from '@/web-components/ui/Button';

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

/**
 * ── AND ON A PHONE THE FIGURES AND THE VERBS LEAVE THE PINNED HEADER ────────
 *
 * MEASURED at 390×844. `.ph` is `flex:0 0 auto` outside `.body`'s scroller, so
 * everything in it is pinned at every scroll position — which is right for the
 * name and the tab strip and wrong for the rest of what was in it:
 *
 *     .ph on /clients/:id                348px
 *     first content pixel                y=394
 *     what the trainer is left with      397px — 47% of the screen
 *
 * Against `/today`'s y=46 and `/settings`' y=135, this one screen had decided it
 * needed a third of the app to itself, permanently. The back link, the name with
 * its two tags and the tabs are ~150px and are the part that has to survive a
 * scroll: they are WHERE AM I and WHERE CAN I GO. The two figures, the four
 * verbs and the pin hint are things a trainer reads ONCE on arrival and then
 * scrolls past — so they go into the scroller and take their 200px with them.
 *
 * THE DESK IS UNTOUCHED, and that is what forces the shape of this. On a 1440px
 * header the figures and the verbs share ONE flex row with the avatar and the
 * name (`.ph__row`), so they cannot simply be moved out of it without redrawing
 * the desktop header. Instead this block is rendered TWICE — once inside
 * `.ph__row` where the desk wants it, once as the first child of `.body` where
 * the phone wants it — and `.cfd--desk` / `.cfd--phone` `display:none` the copy
 * that is not this width's. That is `Programs.tsx`'s own call for the shelf and
 * its switcher, made here for the same reason and with the same cost: the losing
 * copy leaves the accessibility tree with its buttons, so nothing is announced
 * or tab-stopped twice.
 */
export function HeaderDetail({
  client,
  packages,
  activePackagePayments,
}: {
  client: ClientDetailWire;
  packages: ClientPackageWire[];
  activePackagePayments: ClientPaymentWire[];
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
  /*
   * ── A PACK WITH NO COUNT IS NOT THE ABSENCE OF A PACK ──────────────────────
   *
   * `sessionsRemaining` is **null by design** on a monthly pack — there is no
   * session count to run down — and this plate read that null as *no pack at
   * all*. So every client on *Monthly unlimited* was stamped `—` / **No pack**
   * in a header that sits on all six tabs, while the Payments tab eight pixels
   * below said *Monthly pack · Current · Unlimited*. FOUND 19 Sep 2026 on
   * `cli_017`, whose pack was live, paid up and running until 7 Oct.
   *
   * The two questions are separate and both are asked here: is there a pack
   * (`activePkg`), and does it count sessions (`left`). `packLow` keeps reading
   * the count alone — a pack with no count can never be low, which is the right
   * answer rather than a missing one.
   */
  const hasPack = activePkg != null;
  /* Two or fewer is the same threshold `StatusFlags.sessionPackLow` uses on the
     server and `deck.ts` uses on Today. One number, three screens. */
  const packLow = left !== null && left <= 2;
  const phone = client.phone ? dialable(client.phone) : null;

  return (
    <>
      {/* The two figures. See `.cfhead` in app.css for why they do not flex. */}
      <div className="strip cfhead">
        <div>
          <b>
            {left !== null ? (
              <>
                {left}
                {total !== null && <span className="ink3">/{total}</span>}
              </>
            ) : hasPack ? (
              /* Smaller than a figure, because it is a WORD in a slot built for
                 a number — `6/8` beside `Unlimited` at one size makes the word
                 the loudest thing in the header, and it is the less urgent of
                 the two. */
              <span className="cfhead__word">Unlimited</span>
            ) : (
              <span className="ink3">—</span>
            )}
          </b>
          <i style={packLow ? { color: 'var(--tx-warn)' } : undefined}>
            {!hasPack ? 'No pack' : left === null ? 'Sessions' : packLow ? 'Pack low' : 'Sessions left'}
          </i>
        </div>
        <div>
          <b style={owed > 0 ? { color: 'var(--tx-danger)' } : undefined}>
            {owed > 0 ? rupees(owed) : 'Nil'}
          </b>
          <i>{owed > 0 ? 'Pending' : 'Paid up'}</i>
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
        <Button href="/schedule" variant="secondary">
          <CalendarIcon />
          Book
        </Button>
        {/* The client's own card, from the client's own file — the place a
            trainer is standing when they think *send her the progress*. It was
            one tab deep, on Progress, and at the foot of Business → Reports. */}
        <Button href={`/clients/${client.id}/report`} variant="secondary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M12 15V4" /><path d="M8 8l4-4 4 4" />
          </svg>
          Report
        </Button>
      </div>
    </>
  );
}

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
  /* The money and the pack count moved to `HeaderDetail` with the figures that
     draw them — this half of the header is identity only. */
  const statusLabel = STATUS_LABEL[client.status] ?? client.status;
  const statusTag = STATUS_TAG[client.status] ?? '';
  const modeLabel =
    client.deliveryMode === 'floor' ? 'In Person' : client.deliveryMode === 'remote' ? 'Online' : null;
  const modeTag = client.deliveryMode === 'floor' ? 'tag--floor' : 'tag--remote';

  return (
    <>
      {/* NOT ON A PHONE, and `.cfback` in app.css measures why: below 900 the
          shell has already swapped its rail for the bottom bar, and *Clients* is
          one of the three tabs on it. This link and that tab go to the same
          `/clients`, so the back link is a 38px second door to a room the trainer
          can already see the door to — pinned above all six tabs. */}
      <div className="cfback">
        <Button href="/clients" variant="ghost" size="sm">
          <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
            <Chevron size={14} />
          </span>
          All clients
        </Button>
      </div>

      <div className="ph__row" style={{ alignItems: 'center' }}>
        <span
          className="av av--lg"
          style={{ background: avatarToken(client.id), flexShrink: 0 }}
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
            {/* The tenure is the one fragment here that is never acted on, and on
                a phone it is what pushes this line to two — 390px leaves the sub
                ~300px and the three fragments want ~340. The number is dialled and
                the session count is checked; *joined 4 Feb* is read once, on a tab
                that is one tap away. So the desk keeps it and the phone drops it,
                and the row loses the 12px the second line cost. */}
            <span className="cfjoin">joined {dateStr(client.createdAt)} · </span>
            {sessionCount} session{sessionCount === 1 ? '' : 's'} logged
          </p>
        </div>

        {/* THE DESK'S COPY, and it stays inside `.ph__row` because that row is
            the desktop header: avatar, name, figures, verbs, one line. The
            phone's copy is mounted by `ClientFile` as the first child of the
            scroller — `HeaderDetail`'s own block argues the split. */}
        <div className="cfd cfd--desk">
          <HeaderDetail
            client={client}
            packages={packages}
            activePackagePayments={activePackagePayments}
          />
        </div>
      </div>
    </>
  );
}

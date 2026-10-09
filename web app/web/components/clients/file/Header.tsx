
import { Chevron } from '@/components/shell/Icons';
import { avatarToken, initials, rupees } from '@/lib/today/time';
import type { ClientDetailWire, ClientPackageWire } from '@/lib/clients/client-api';
import { packBalance } from '@/lib/clients/packs';
import { fileStatus } from '@/lib/clients/file-status';
import { TAG_LABEL, TAG_TONE } from '@/lib/clients/roster';

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
/** E.164 on the wire (`+919876500003`); the ten digits a trainer reads, split 5 · 5. */
function prettyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

/** What `wa.me` and `tel:` want: country code, no punctuation. */
function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;   // E.164 already carries the 91
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
  now,
}: {
  client: ClientDetailWire;
  /** The client's current packs (L5 `scope=current`), amountDue computed on the server. */
  packages: ClientPackageWire[];
  /** The server's instant, so *late* is read against the same clock the card uses. */
  now: number;
}) {
  /* THE BALANCE ACROSS EVERY LIVE PACK, never the first one `find` hands back — see
     `lib/clients/packs.ts`: the wire is newest first and the server spends oldest first,
     so the first `active` row is the one NOT being spent. */
  const balance = packBalance(packages);
  /* Everything owed on the client's current packs, not just the running one:
     a finished pack can still be owed for, and the server's `amountDue` is the
     only sum there is (never re-added from payments here). */
  const owed = packages.reduce((sum, p) => sum + num(p.amountDue), 0);
  const left = balance.left;
  const total = balance.total;
  /* Owed is amber until it is LATE and red only then — the card below already drew it
     that way, and a header that is red for money that is not yet due is the one alarm on
     the screen that is not about anything. */
  const late = packages.some(
    (p) => num(p.amountDue) > 0 && p.dueDate !== null && new Date(p.dueDate).getTime() < now,
  );
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
  const hasPack = balance.count > 0;
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
          <b
            style={
              owed > 0
                ? { color: late ? 'var(--tx-danger)' : 'var(--tx-warn)' }
                : { color: 'var(--tx-ink-3)' }
            }
          >
            {rupees(owed)}
          </b>
          {/* One label. It flipped between *Pending* and *Paid up*, and *Nil* over *Paid up*
              read as "nothing has been paid". */}
          <i>{late ? 'Overdue' : 'Pending'}</i>
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
        <Button href={`/schedule?new=1&client=${client.id}`} variant="secondary">
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
  now,
}: {
  client: ClientDetailWire;
  packages: ClientPackageWire[];
  now: number;
}) {
  const sessionCount = client.stats.sessionsDone;
  const mode = client.schedule.deliveryMode;
  /* The money and the pack count moved to `HeaderDetail` with the figures that
     draw them — this half of the header is identity only. */
  /* THE ROSTER'S VERDICT, not the membership status. The roster says *At risk* and why;
     this used to say a green *Active* for the same person. `fileStatus` is the roster's
     own derivation, and an archived client (which has none) keeps the plain status word. */
  const derived = fileStatus(client, packages, now);
  const statusLabel = derived ? TAG_LABEL[derived.tag] : (STATUS_LABEL[client.status] ?? client.status);
  const statusTag = derived ? TAG_TONE[derived.tag] : (STATUS_TAG[client.status] ?? '');
  const modeLabel =
    mode === 'floor' ? 'In Person' : mode === 'remote' ? 'Online' : mode === 'home_visit' ? 'Home visit' : null;
  const modeTag = mode === 'floor' ? 'tag--floor' : 'tag--remote';

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
          <h1 className="ph__t">
            {client.name}
            <span className={`tag ${statusTag}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>
              {statusLabel}
            </span>
            {modeLabel && (
              <span className={`tag ${modeTag}`} style={{ marginLeft: 6, verticalAlign: 'middle' }}>
                {modeLabel}
              </span>
            )}
          </h1>
          {derived?.reason && <p className="cfhd__why">{derived.reason}</p>}
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
            now={now}
          />
        </div>
      </div>
    </>
  );
}

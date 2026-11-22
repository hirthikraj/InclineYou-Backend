'use client';

import { Lock } from '@/components/shell/Icons';
import { Message } from '@/web-components/ui/Message';
import { InviteButton } from './InviteButton';

/**
 * WAITING FOR CONSENT (22 Nov 2026) — the one sentence every locked control says instead of itself.
 *
 * Until a client accepts their invite (the privacy notice plus the "fit to train" tick) the server refuses health
 * data, the personal profile, notes and a third session with `409 CONSENT_REQUIRED`, and the web refuses the
 * progress report download. Each of those places draws THIS in place of the control: what waits, and the invite
 * that lifts it — never a grey button with no reason.
 *
 * ONE PER SCREEN. A screen with several locked things (the Profile tab) draws `ConsentBanner` once at the top and
 * `ConsentLock` at each locked place instead: three warnings each carrying their own *Send again* read as three
 * problems, when it is one.
 */
export function ConsentNotice({
  clientId,
  clientName,
  phone,
  membership,
  what,
}: {
  clientId: string;
  clientName: string;
  phone: string | null;
  membership: string | null | undefined;
  /** What waits, as a phrase: "Notes", "Their physical details", "The progress report". */
  what: string;
}) {
  const first = firstName(clientName);
  const invited = isInvited(membership);
  return (
    <div className="consentnote">
      <Message tone="warn" icon={<Lock size={15} />}>
        {what} {isPlural(what) ? 'wait' : 'waits'} for {first}&rsquo;s consent.{' '}
        {invited
          ? `The invite is sent; it unlocks once ${first} accepts it.`
          : `${first} gives it by accepting their invite.`}
      </Message>
      <InviteButton
        clientId={clientId}
        clientName={clientName}
        phone={phone}
        label={invited ? 'Send again' : 'Send invite'}
        variant="secondary"
      />
    </div>
  );
}

/**
 * THE SCREEN-LEVEL VERSION: what is held, what is not, and the one way to lift it.
 *
 * It names the locked things so the trainer does not have to discover them one disabled field at a time, and it
 * names what is still theirs to edit — a banner that only says *no* makes the whole tab look frozen.
 */
export function ConsentBanner({
  clientId,
  clientName,
  phone,
  membership,
  locked,
  open,
}: {
  clientId: string;
  clientName: string;
  phone: string | null;
  membership: string | null | undefined;
  /** What waits on this screen, as a list: ["height", "activity level", "notes"]. */
  locked: string[];
  /** What the trainer can still change here, as a list. */
  open?: string[];
}) {
  const first = firstName(clientName);
  const invited = isInvited(membership);
  return (
    <section className="cfconsent" aria-labelledby="cfconsent-t">
      <span className="cfconsent__ic" aria-hidden="true">
        <Lock size={18} />
      </span>
      <div className="cfconsent__tx">
        <h2 id="cfconsent-t" className="cfconsent__t">
          {invited ? `Waiting for ${first} to accept their invite` : `${first} hasn’t given consent yet`}
        </h2>
        <p className="cfconsent__b">
          {capitalise(listOf(locked))} {locked.length > 1 ? 'stay' : 'stays'} locked until {first} accepts the
          privacy notice on their invite.
          {open && open.length > 0 ? ` You can still edit ${listOf(open)}.` : ''}
        </p>
      </div>
      <div className="cfconsent__a">
        <InviteButton
          clientId={clientId}
          clientName={clientName}
          phone={phone}
          label={invited ? 'Send invite again' : 'Send invite'}
          variant="primary"
        />
      </div>
    </section>
  );
}

/** The marker a locked value wears in place of itself, under a `ConsentBanner` that explains it. */
export function ConsentLock({ label = 'After consent' }: { label?: string }) {
  return (
    <span className="cflock">
      <Lock size={13} />
      {label}
    </span>
  );
}

function firstName(name: string): string {
  return name.split(' ')[0] || 'They';
}

function isInvited(membership: string | null | undefined): boolean {
  return (membership ?? '').toLowerCase() === 'invited';
}

/** "Notes" and "Height and activity level" take *wait*; "The progress report" takes *waits*. */
function isPlural(what: string): boolean {
  return / and /i.test(what) || (what.endsWith('s') && !what.endsWith('ss'));
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

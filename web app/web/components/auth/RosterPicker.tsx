'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { chooseRoster } from '@/lib/auth/actions';
import type { Membership } from '@/lib/auth/types';
import { IconChevronRight, IconWarn } from './Icons';
import { TrustLine } from './TrustLine';

/**
 * Frame 2a · whose book to open.
 *
 * ── SHOWN TO ONE PERSON ONLY ─────────────────────────────────────────────────
 *
 * A client who is training with more than one trainer right now. Everybody else
 * resolves silently and goes straight through — the rule the design states twice,
 * and the reason `verifyCode` writes the roster cookie itself for the
 * single-roster case rather than routing here.
 *
 * ── WHAT THIS SCREEN IS *NOT*, AND THE DESIGN SAYS OTHERWISE ─────────────────
 *
 * `webapp-auth.html`'s frame 2a draws **Trainer · Anbu R** against **Client ·
 * with Meera K** — a choice between the two halves of the product. That screen
 * does not exist any more and this one deliberately does not bring it back.
 * `RoleScreen.tsx` on the phone carries the decision in full:
 *
 *   "Trainer↔client duality is allowed again (23 Aug 2026), but it does NOT come
 *    back through this screen: sign-in still opens straight into the trainer's
 *    home role with no picker, and a live membership elsewhere surfaces as a
 *    drawer entry … this screen exists because two client memberships are
 *    genuinely ambiguous about which one to open, while a trainer's own account
 *    is not ambiguous — it is simply the default, with the other mode one tap
 *    away whenever they want it."
 *
 * Two consequences for the copy, and both matter:
 *
 *   · the design's trust line — "Two books, one login. Your own sessions never
 *     appear in a client's report" — is about trainer/client separation and is
 *     the wrong promise here. What a multi-roster client needs to know is that
 *     their two trainers cannot see each other's rosters.
 *   · the design's greeting cannot be built as written. It reasons that "by now
 *     the server has answered with `trainerName`" — true on a trainer's sign-in,
 *     and `clientView` in `AuthService` returns `trainerName: null`. The name
 *     that IS available is the client's own, per roster.
 *
 * ── AND EVERY CARD CARRIES PROOF ─────────────────────────────────────────────
 *
 * The trainer's name, their gym, and whether that roster is paused — because a
 * picker with two bare labels makes people guess, and finding out after you tap
 * is finding out too late.
 */
export function RosterPicker({
  memberships,
  name,
}: {
  memberships: Membership[];
  name: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * Preselected: the first roster that is not paused, falling back to the first
   * of all of them.
   *
   * A paused roster is selectable — the history is in it — but it is never what
   * the screen should LAND on, because the accent ring says which one Enter takes
   * and Enter should not take you somewhere on hold.
   */
  const live = memberships.filter((m) => !isPaused(m));
  const [picked, setPicked] = useState<string | null>(
    (live[0] ?? memberships[0])?.clientId ?? null,
  );

  function go() {
    if (!picked || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await chooseRoster(picked);
      if (result.ok) {
        router.push('/me/today');
        return;
      }
      setError('We could not open that just now. Check your connection and try again.');
    });
  }

  return (
    <>
      <h2 className="stp__hd" style={{ fontSize: 26 }}>
        {name ? `Welcome back, ${name}` : 'Welcome back'}
      </h2>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        You train with more than one trainer. Whose book do you want to open?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 24 }}>
        {memberships.map((m) => (
          <RosterCard
            key={m.clientId}
            membership={m}
            selected={m.clientId === picked}
            onSelect={() => setPicked(m.clientId)}
            disabled={pending}
          />
        ))}
      </div>

      <div aria-live="polite">
        {error ? (
          <div className="msg msg--err" style={{ marginTop: 16 }}>
            <IconWarn size={15} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <p className="small" style={{ marginTop: 16 }}>
        Switch any time from the menu. We’ll open here next time.
      </p>

      <button
        className="btn btn--primary btn--lg"
        type="button"
        style={{ marginTop: 12 }}
        onClick={go}
        disabled={!picked || pending}
      >
        {pending ? 'Opening…' : 'Continue'}
      </button>

      <TrustLine>
        Nothing here is a second account — it is the same sign-in, read from the other side.
        Neither trainer can see the other’s roster, or that it exists.
      </TrustLine>
    </>
  );
}

/** Is this roster on hold? Absence of `status` means an older backend, so: no. */
function isPaused(m: Membership): boolean {
  return m.status?.toLowerCase() === 'paused';
}

/** `Meera Krishnan` → `MK`. Two letters, which is what the 48px avatar holds. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Keyed off the trainer's id rather than their position, so a roster keeps its
 * colour between two sign-ins — and the same colour the client portal will give
 * it afterwards. Twelve tokens, per §01.
 */
function avatarToken(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 1_000_003;
  return `--tx-av-${(hash % 12) + 1}`;
}

function RosterCard({
  membership,
  selected,
  onSelect,
  disabled,
}: {
  membership: Membership;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const paused = isPaused(membership);
  const invited = membership.membershipStatus?.toLowerCase() === 'invited';
  const trainer = membership.trainerName?.trim() || 'Your trainer';

  /*
   * ONE LINE OF PROOF, and which fact wins is a ranking rather than a
   * concatenation.
   *
   * Paused first: it is the only thing that distinguishes two otherwise identical
   * cards and the only one that changes what you will find inside. Then an
   * outstanding invite, because `clientOf` carries those too and "you have not
   * accepted this one yet" is the next most surprising thing to discover after
   * tapping. Then the gym, which is what tells two trainers apart in the ordinary
   * case.
   */
  const proof = paused
    ? 'Paused — your history is still here'
    : invited
      ? 'Invited — you have not accepted this one yet'
      : membership.gymName?.trim() || 'Your trainer';

  return (
    <button
      className={`card ${selected ? 'card--pick-accent' : 'card--pick'}`}
      type="button"
      onClick={onSelect}
      disabled={disabled}
      /* A radio group in behaviour, so it says so: one of N, and which one is on.
         `aria-pressed` rather than `role="radio"` because these are buttons in a
         column with a separate Continue, not a form control — and a screen reader
         announcing "pressed" is the honest description of a card that stays lit. */
      aria-pressed={selected}
      aria-label={`${trainer}. ${proof}`}
    >
      <div className="card__b" style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <span
          className="av av--lg"
          style={{
            background: `var(${avatarToken(membership.trainerId)})`,
            // A paused roster's avatar is dimmed for the same reason the rail's
            // done pin is: it is still there, and it is not where you are going.
            opacity: paused ? 0.55 : 1,
          }}
          aria-hidden="true"
        >
          {initials(trainer)}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 14.5, color: 'var(--tx-ink)' }}>{trainer}</b>
          <span
            style={{
              display: 'block',
              fontSize: 12.5,
              color: paused ? 'var(--tx-warn)' : 'var(--tx-ink-3)',
              marginTop: 3,
            }}
          >
            {proof}
          </span>
        </span>
        {/* The one glyph `rolecard` draws, and it stays a chevron rather than
            becoming a tick: the card selects, and Continue is what navigates.
            The phone leads with a dumbbell instead of an avatar; here the avatar
            is already doing that job, and two marks on one row is one too many. */}
        <IconChevronRight size={16} />
      </div>
    </button>
  );
}

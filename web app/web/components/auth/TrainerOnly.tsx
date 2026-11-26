import { signOut } from '@/lib/auth/actions';
import { Button } from '@/web-components/ui/Button';
import { AuthShell } from './AuthShell';

/**
 * A TRAINER PAGE OPENED BY A CLIENT (25 Nov 2026).
 *
 * The trainer routes had no role check of their own: each page relied on the backend refusing a client's session,
 * and what that refusal became depended on the page — `/today` happened to redirect, `/settings/nudges` crashed with
 * a 500. The check is now made once, in `app/(main)/layout.tsx`, before any trainer data is read, and a client is
 * told plainly where they are rather than shown an error.
 *
 * Two ways out, because there are two reasons to be here: a client who followed a link that is not theirs goes home;
 * someone who also coaches, signed in on the wrong number, signs out and in again.
 */
export function TrainerOnly() {
  return (
    <AuthShell eyebrow="Trainers only" lead="Wrong door." quote={null}>
      <header>
        <h2 className="stp__hd">This page is for trainers</h2>
        <p className="stp__sub" style={{ marginTop: 8 }}>
          You’re signed in as a client, so there’s nothing for you here. Your plan, sessions and payments are in your
          own space.
        </p>
      </header>
      <div className="col gap3 mt4">
        <Button variant="primary" size="lg" wide href="/me/today">
          Go to your home
        </Button>
        <form action={signOut}>
          <Button variant="secondary" size="lg" wide type="submit">
            Sign out to use a trainer account
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

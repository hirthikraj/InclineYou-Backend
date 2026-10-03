import { AuthShell } from '@/components/auth/AuthShell';
import { ClientSignIn } from '@/components/auth/ClientSignIn';

export const metadata = { title: 'Client sign-in opens soon · InclineYou' };

/**
 * `/sign-in/client` — where `verifyCode` sends a number that is only a client's.
 *
 * No guard: there is no credential behind this screen and nothing on it reads
 * one. Visiting it directly shows a sentence and a button back to the start.
 */
export default function Page() {
  return (
    <AuthShell
      eyebrow="Clients"
      lead="Your trainer opens the door."
      quote="InclineYou works from a trainer’s roster. Client sign-in is not open yet — your trainer will share it."
    >
      <ClientSignIn />
    </AuthShell>
  );
}

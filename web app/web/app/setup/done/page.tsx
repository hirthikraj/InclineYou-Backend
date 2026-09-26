import { AuthShell } from '@/components/auth/AuthShell';
import { Done } from '@/components/setup/Done';
import { requireFinished } from '@/lib/setup/guard';

export const metadata = { title: 'You’re set up · InclineYou' };

/**
 * Frame 6a · `/setup/done`.
 *
 * The rail is gone, and its absence is the point: this screen is not a step, so
 * showing the eight-row record of the flow beside it would keep the trainer in a
 * flow they have finished. It goes back to `.authwrap` — the plate sign-in uses
 * — with the quote replaced by the one sentence this screen is arguing.
 *
 * `requireFinished` rather than `requireSetup`: the request that stamps the
 * profile complete navigates here, so the flow guard would bounce a trainer off
 * the screen that exists to tell them they finished.
 */
export default async function Page() {
  const state = await requireFinished();
  return (
    <AuthShell
      eyebrow="Trainer console"
      lead="Set up. Go coach."
      quote="The first booking and the first payment are the things worth celebrating. Both are one screen away."
    >
      <Done state={state} />
    </AuthShell>
  );
}

import { Preflight } from '@/components/setup/Preflight';
import { SetupShell } from '@/components/setup/SetupShell';
import { requireSetup } from '@/lib/setup/guard';

export const metadata = { title: 'Setting up · InclineYou' };

/**
 * Frames 4a and 4b · `/setup`.
 *
 * Also where `/setup/` with no step lands. The body is one client island because
 * "Finish the rest later" writes; everything around it — the rail, the answers
 * it carries, which of the two bodies to draw — is decided on the server, from
 * the profile, before a byte reaches the browser.
 */
export default async function SetupPage() {
  const state = await requireSetup();
  return (
    <SetupShell current={null} state={state}>
      <Preflight state={state} />
    </SetupShell>
  );
}

import { CertificationsForm } from '@/components/setup/CertificationsForm';
import { SetupShell } from '@/components/setup/SetupShell';
import { requireSetup } from '@/lib/setup/guard';

export const metadata = { title: 'Certifications · InclineYou' };

/** Step 4 of 8. Optional, and the one step that says outright what we don't check. */
export default async function Page() {
  const state = await requireSetup();
  return (
    <SetupShell current="certifications" state={state}>
      <CertificationsForm state={state} />
    </SetupShell>
  );
}

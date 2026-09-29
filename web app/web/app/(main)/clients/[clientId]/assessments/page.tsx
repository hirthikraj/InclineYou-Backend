import { ClientFilePage } from '@/components/clients/file/ClientFilePage';
import { loadClientAssessments } from '@/lib/assessments/guard';

/** The Assessments tab's list is loaded beside the header, not inside the file's payload. */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return (
    <ClientFilePage
      clientId={clientId}
      tab="assessments"
      extra={loadClientAssessments(clientId).then((assessments) => ({ assessments }))}
    />
  );
}

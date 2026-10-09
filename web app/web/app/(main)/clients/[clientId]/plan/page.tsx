import { redirect } from 'next/navigation';

/**
 * The tab is labelled *Plan* and its route is `/program` (singular, since 27 Aug 2026). A link written by
 * the label — `/clients/:id/plan` — 404ed; it goes where it was meant to.
 */
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  redirect(`/clients/${clientId}/program`);
}

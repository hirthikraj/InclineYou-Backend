import { redirect } from 'next/navigation';

/**
 * `/package` was the money tab's route until 27 Aug 2026, when it became
 * `/payments` — every pack and every payment, not just the live one.
 *
 * It redirects rather than 404ing because a trainer's bookmark and anything
 * already linking here should land on the tab that replaced it. Permanent, so it
 * is not re-resolved on every visit.
 */
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  redirect(`/clients/${clientId}/payments`);
}

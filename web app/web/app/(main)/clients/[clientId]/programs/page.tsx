import { redirect } from 'next/navigation';

/**
 * `/programs` was the plan tab's route until 27 Aug 2026, when it became
 * `/program` — singular, because a trainer opening it wants the plan the client
 * is on today and the history is the evidence beside it.
 *
 * Kept as a redirect for the same reason `/package` is: a route that existed
 * should not start 404ing.
 */
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  redirect(`/clients/${clientId}/program`);
}

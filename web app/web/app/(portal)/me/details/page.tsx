import { MyDetailsForm } from '@/components/portal/MyDetailsForm';
import { TopBar } from '@/components/shell/TopBar';
import { requirePortalSession } from '@/lib/portal/session';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Your details · InclineYou' };

/** `/me/details` — what a client may correct about themselves (api-contract 1.2, p-a4). Drawn from the session read the layout already made. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  if (!session.ok || !session.me.myDetails) return null;
  const { me } = session;

  return (
    <>
      <TopBar crumb="Your details" title="Your details" />
      <main className="main" id="main-content">
        <PageHeader title="Your details" />
        <div className="body" style={{ maxWidth: 560 }}>
          <MyDetailsForm details={me.myDetails!} trainerName={me.trainer?.name ?? 'your trainer'} />
        </div>
      </main>
    </>
  );
}

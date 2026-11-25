import { MyDetailsForm } from '@/components/portal/MyDetailsForm';
import { TopBar } from '@/components/shell/TopBar';
import { requirePortalSession } from '@/lib/portal/session';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Crumbs } from '@/web-components/ui/Crumbs';

export const metadata = { title: 'Your details · InclineYou' };

/** `/me/details` — what a client may correct about themselves (api-contract 1.2, p-a4). Drawn from the session read the layout already made. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  if (!session.ok || !session.me.myDetails) return null;
  const { me } = session;

  return (
    <>
      <TopBar crumb="Your details" title="Me" titleHref="/me/account" />
      <main className="main" id="main-content">
        {/* Every page under *Me* opens with the way back to it (25 Nov 2026). */}
        <PageHeader
          className="ph--portal"
          title="Your details"
          crumbs={<Crumbs items={[{ label: 'Me', href: '/me/account' }, { label: 'Your details' }]} />}
        />
        {/* The portal's column, and the form's own 560 as a class — it was an inline `maxWidth` on `.body`
            (AGENTS.md trap 2), which also left the form flush left under a header that was not `ph--portal`. */}
        <div className="body">
          <div className="portal">
            <div className="pdet">
              <MyDetailsForm details={me.myDetails!} trainerName={me.trainer?.name ?? 'your trainer'} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

'use client';

import { InviteButton } from '@/components/clients/InviteButton';
import { Lock } from '@/components/shell/Icons';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/web-components/ui/Button';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { PageHeader } from '@/web-components/ui/PageHeader';

/**
 * THE PROGRESS REPORT, BEFORE CONSENT (22 Nov 2026).
 *
 * The card is the client's data leaving the building, so it waits for their consent. This page used to be a bare
 * heading and an amber sentence with no bar, no crumbs and no way back — a trainer who pressed *Report* on the file
 * landed in a dead end. It now wears the report's own chrome (the same `TopBar` and crumbs `ClientReport` draws, so
 * the way back is where it always is), says what the report is and what it waits for, and offers the two ways on:
 * the invite that lifts the lock, and the file they came from.
 */
export function ReportLocked({
  clientId,
  clientName,
  phone,
  membership,
}: {
  clientId: string;
  clientName: string;
  phone: string | null;
  membership: string | null | undefined;
}) {
  const first = clientName.split(' ')[0] || clientName;
  const invited = (membership ?? '').toLowerCase() === 'invited';
  const fileHref = `/clients/${clientId}`;

  return (
    <>
      <TopBar crumb={`Clients / ${clientName} / Progress report`} title={clientName} titleHref={fileHref} />
      <main className="main" id="main-content">
        <PageHeader
          crumbs={
            <Crumbs
              items={[
                { label: 'Clients', href: '/clients' },
                { label: clientName, href: fileHref },
                { label: 'Progress report' },
              ]}
            />
          }
          title={clientName}
          sub="Progress report"
        />
        <div className="body">
          <EmptyState
            kind="first-run"
            className="rplock"
            icon={<Lock size={22} />}
            title={invited ? `Waiting for ${first} to accept their invite` : `${first} hasn’t given consent yet`}
            body={
              <>
                The progress report is {first}&rsquo;s own data in a card you send them, so it opens once they accept
                the privacy notice on their invite.{' '}
                {invited
                  ? 'The invite is out — send it again if it got lost.'
                  : 'Send them the invite to get started.'}
              </>
            }
            action={
              <div className="rplock__a">
                <InviteButton
                  clientId={clientId}
                  clientName={clientName}
                  phone={phone}
                  label={invited ? 'Send invite again' : 'Send invite'}
                  variant="primary"
                  size="md"
                />
                <Button href={fileHref} variant="secondary">
                  Back to {first}&rsquo;s file
                </Button>
              </div>
            }
          />
        </div>
      </main>
    </>
  );
}

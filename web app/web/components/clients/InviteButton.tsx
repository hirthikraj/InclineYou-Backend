'use client';

import { useState, useTransition } from 'react';

import { inviteClient } from '@/lib/clients/invite-actions';
import { Button } from '@/web-components/ui/Button';
import { InviteSheet } from './InviteSheet';

/**
 * SEND THE INVITE — the one button every door uses (22 Nov 2026).
 *
 * Consent is accepting the invite, and a client's third session, health details, profile and notes all wait for
 * it — so the button is wherever that wait is felt: the add flow's last step, the setup checklist, Today's row (via
 * the file) and every refusal that says CONSENT_REQUIRED. It mints a fresh link (`POST /v1/clients/{id}/invites`,
 * which replaces any older one) and opens `InviteSheet`: WhatsApp from the trainer's own number, or the QR code
 * when the client is standing there.
 */
export function InviteButton({
  clientId,
  clientName,
  phone,
  label = 'Send invite',
  variant = 'primary',
  size = 'sm',
}: {
  clientId: string;
  clientName: string;
  phone: string | null;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const [pending, start] = useTransition();
  const [made, setMade] = useState<{ draft: string; link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!phone) {
    return (
      <Button variant="secondary" size={size === 'md' ? undefined : 'sm'} disabled title="Add their phone number first">
        {label}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size === 'md' ? undefined : 'sm'}
        disabled={pending}
        title={error ?? undefined}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await inviteClient(clientId);
            if (r.ok) setMade({ draft: r.invite.draft, link: r.invite.link });
            else setError(r.message);
          });
        }}
      >
        {pending ? 'Making the link…' : label}
      </Button>
      {error && <span className="small" role="alert" style={{ color: 'var(--tx-danger)' }}>{error}</span>}
      {made && (
        <InviteSheet
          clientId={clientId}
          clientName={clientName}
          phone={phone}
          draft={made.draft}
          link={made.link}
          onClose={() => setMade(null)}
        />
      )}
    </>
  );
}

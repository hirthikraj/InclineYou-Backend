'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { acceptPortalNotice } from '@/lib/portal/profile-actions';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';

/**
 * The privacy notice has moved on since this client accepted it (`policy.accepted` ≠ `policy.current`), and the portal is not used
 * under a notice nobody accepted, so this stands in for the page. One decision; no *remind me later*, because a button that postponed it
 * would be a way round the record. The version sent is the one this render read, so a notice that moves again between reading and
 * pressing is refused by the server rather than accepted at the wrong version.
 */
export function PortalConsent({ version }: { version: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  function accept() {
    setFailure(null);
    start(async () => {
      const res = await acceptPortalNotice(version);
      if (res.ok) router.refresh();
      else setFailure(res.message ?? 'We couldn’t record that just now.');
    });
  }

  return (
    <main className="main" id="main-content">
      <div className="body" style={{ maxWidth: 520 }}>
        <Card>
          <Card.Body>
            <h1 className="stp__hd" style={{ fontSize: 24 }}>Our privacy notice has changed</h1>
            <p className="stp__sub" style={{ marginTop: 8 }}>
              Read the current notice (version {version}) and accept it to carry on. Your training and everything in it are untouched.
            </p>
            <div aria-live="polite">{failure ? <Message tone="err" className="mt3">{failure}</Message> : null}</div>
            <Button variant="primary" size="lg" style={{ width: '100%', marginTop: 20 }} disabled={pending} onClick={accept}>
              {pending ? 'Saving…' : 'I accept'}
            </Button>
            <p className="small" style={{ marginTop: 12 }}>We record the version and the date. Accepting the same version again changes nothing.</p>
          </Card.Body>
        </Card>
      </div>
    </main>
  );
}

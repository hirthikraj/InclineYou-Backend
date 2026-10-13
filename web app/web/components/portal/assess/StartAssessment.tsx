'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { startAssessment } from '@/lib/portal/assess-actions';
import { Button } from '@/web-components/ui/Button';
import { Message } from '@/web-components/ui/Message';

/** Start — or Continue, when one of this template is already waiting. A button, not a link: starting is a write. */
export function StartAssessment({ templateId, continueId }: { templateId: string; continueId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  function go() {
    if (continueId) return router.push(`/me/assessments/${continueId}`);
    setFailure(null);
    start(async () => {
      const res = await startAssessment(templateId);
      if (res.ok) router.push(`/me/assessments/${res.value.id}`);
      else setFailure(res.message);
    });
  }

  return (
    <div>
      <Button variant="secondary" size="sm" disabled={pending} onClick={go}>{pending ? 'Opening…' : continueId ? 'Continue' : 'Start'}</Button>
      <div aria-live="polite">{failure ? <Message tone="err" className="mt3">{failure}</Message> : null}</div>
    </div>
  );
}

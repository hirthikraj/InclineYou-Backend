'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { formatPhone } from '@/lib/auth/policy';
import { genderLabel } from '@/lib/clients/gender';
import { approveJoinRequest, declineJoinRequest } from '@/lib/join/actions';
import { money, type JoinRequestWire } from '@/lib/join/types';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { Message } from '@/web-components/ui/Message';
import { Tag } from '@/web-components/ui/Tag';
import { useToast } from '@/lib/toast/store';

/**
 * PEOPLE WHO ASKED THROUGH THE JOIN LINK (api-contract 1.2, jl-a3…jl-a5) — the cards, drawn inside Clients → Joining since
 * 22 Nov 2026 beside the invitations (it was its own page, `/clients/join-requests`, which now redirects there).
 *
 * A request is a card, not a table row: what makes the decision is the person's own answers, which are sentences, and a
 * sentence in a `.tbl` cell is trap 9. Approve is the primary and the only lime on a card; Decline is quiet and asks once.
 *
 * Approving makes them a client (a prospect, already on the portal — they consented on the join page). If they picked a plan,
 * the screen goes straight on to selling it on their Payments tab; otherwise to their file, where the setup checklist takes over.
 */
const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

export function JoinRequestCards({ items, now }: { items: JoinRequestWire[]; now: number }) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function approve(r: JoinRequestWire) {
    setError(null);
    setWorking(r.id);
    start(async () => {
      const res = await approveJoinRequest(r.id);
      setWorking(null);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const name = r.name?.split(' ')[0] ?? 'They';
      /* TELL THEM (22 Nov 2026). Nothing on the platform tells a joiner they were approved — the join page only promised
         "once they say yes, sign in" — so the confirmation carries a WhatsApp draft from the trainer's OWN number, the way
         invites and nudges go: a wa.me link the trainer reads and sends. It lives on this toast because approval scrubs the
         number off the request; the toast is a `notice`, so it is still there on the client file this navigates to. */
      const tell = r.phone ? tellThemUrl(r.phone, name, window.location.origin, res.checkInSent) : null;
      toast.show({
        tone: 'ok',
        title: `${name} is your client`,
        body: tell
          ? 'Let them know they’re in — they’ll sign in with their number.'
          : res.checkInSent ? 'Their first assessment is on its way.' : 'They can sign in with their number now.',
        ...(tell ? { action: { label: 'Tell them on WhatsApp', onClick: () => window.open(tell, '_blank', 'noopener') } } : null),
      });
      router.push(res.packId ? `/clients/${res.clientId}/payments?sell=${res.packId}` : `/clients/${res.clientId}`);
    });
  }

  function decline(r: JoinRequestWire) {
    setError(null);
    setWorking(r.id);
    start(async () => {
      const res = await declineJoinRequest(r.id);
      setWorking(null);
      setAsking(null);
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }


  if (items.length === 0) return null;
  return (
    <>
      {error && <Message tone="err" alert>{error}</Message>}
            <ul className="jr-list">
              {items.map((r) => (
                <li key={r.id} className="jr-card">
                  {r.status === 'approved' ? (
                    <div className="jr-card__hd">
                      <span className="jr-card__who">
                        <b>Approved {r.decidedAt ? DATE.format(new Date(r.decidedAt)) : ''}</b>
                        <span className="small">Their details now live on their client file.</span>
                      </span>
                      {r.clientId && <Button size="sm" variant="secondary" href={`/clients/${r.clientId}`}>Open client</Button>}
                    </div>
                  ) : (
                    <>
                      <div className="jr-card__hd">
                        <Avatar name={r.name ?? '?'} id={r.id} size="md" />
                        <span className="jr-card__who">
                          <b>{r.name}</b>
                          <span className="small">
                            {r.phone ? formatPhone(r.phone) : ''}
                            {age(r.dateOfBirth, now) !== null ? ` · ${age(r.dateOfBirth, now)}` : ''}
                            {genderLabel(r.gender) ? ` · ${genderLabel(r.gender)}` : ''}
                          </span>
                        </span>
                        <span className="jr-card__when small">Asked {DATE.format(new Date(r.createdAt))}</span>
                      </div>

                      <dl className="jr-facts">
                        <dt>Plan</dt>
                        <dd>
                          {r.plan ? (
                            <>
                              {r.plan.name} · {money(r.plan.amount, r.plan.currency)}
                              {!r.plan.offered && <Tag tone="warn">No longer offered</Tag>}
                            </>
                          ) : (
                            'Not sure yet'
                          )}
                        </dd>
                        {r.email && (
                          <>
                            <dt>Email</dt>
                            <dd>{r.email}</dd>
                          </>
                        )}
                        {r.answers.map((a, i) => (
                          <span key={i} className="jr-facts__pair">
                            <dt>{a.label}</dt>
                            <dd>{a.answer ?? '—'}</dd>
                          </span>
                        ))}
                        <dt>Reminders</dt>
                        <dd>{r.whatsappReminders ? 'Wants WhatsApp reminders' : 'No WhatsApp reminders'}</dd>
                      </dl>

                      {r.status === 'pending' ? (
                        <div className="jr-card__acts">
                          {asking === r.id ? (
                            <>
                              <span className="small">Decline {r.name?.split(' ')[0]}? They aren’t told.</span>
                              <Button size="sm" variant="secondary" onClick={() => decline(r)} loading={working === r.id} disabled={pending}>
                                Yes, decline
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setAsking(null)} disabled={pending}>Keep</Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="primary" onClick={() => approve(r)} loading={working === r.id} disabled={pending}>
                                {r.plan?.offered ? 'Approve and sell plan' : 'Approve'}
                              </Button>
                              {r.phone && (
                                <Button size="sm" variant="secondary" href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                                  WhatsApp
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => setAsking(r.id)} disabled={pending}>Decline</Button>
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="small">Declined {r.decidedAt ? DATE.format(new Date(r.decidedAt)) : ''}. Deleted 30 days later.</p>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
    </>
  );
}

function age(dob: string | null, now: number): string | null {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const t = new Date(now);
  let a = t.getFullYear() - y;
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) a -= 1;
  return Number.isFinite(a) ? `${a} yrs` : null;
}

/**
 * The approval message, as a `wa.me` link from the trainer's own WhatsApp. Plain text (WhatsApp's own `*bold*` is the only
 * markup it reads), first name only, and the sign-in address rather than the join link — the join page is finished with.
 */
export function tellThemUrl(phone: string, firstName: string, origin: string, checkInSent: boolean): string {
  const lines = [
    `Hi ${firstName}, you’re in! I’ve approved your request to train with me.`,
    '',
    `Sign in with this number to see your plan and our sessions: ${origin}/sign-in`,
  ];
  if (checkInSent) lines.push('', 'There’s a short check-in form waiting for you there — fill it in before we start.');
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(lines.join('\n'))}`;
}

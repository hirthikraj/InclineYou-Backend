'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { loadNotices, markNoticesRead, type NoticeWire, type NoticesWire } from '@/lib/portal/inbox-actions';
import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';

import { Bell } from '@/components/shell/Icons';

/** Where a notice goes when it is pressed: the thing it is about, never a chat — there is none. */
function hrefFor(n: NoticeWire): string {
  switch (n.kind) {
    case 'reminder':
    case 'session':
      return n.sessionId ? `/me/session/${n.sessionId}` : '/me/plan';
    case 'plan':
      return '/me/plan';
    case 'best':
      return '/me/progress/history';
    case 'assessment':
      return '/me/progress/assessments';
    case 'note':
      return '/me/inbox';
    default:
      return '/me/today';
  }
}

function dayOf(ms: number, now: number): string {
  const midnight = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const days = Math.round((midnight(new Date(now)) - midnight(new Date(ms))) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(ms).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

/**
 * The client's bell: what the product is telling them about what their trainer did — a reminder, a plan change, a new assessment, a personal
 * best. Opening it marks what it just showed as read (the rows that were new still draw as new until it closes). It is the fallback for a missed
 * WhatsApp: every reminder sent is readable here too.
 */
export function PortalBell() {
  const [data, setData] = useState<NoticesWire | null>(null);
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState<Set<string>>(() => new Set());
  const [cleared, setCleared] = useState(false);
  const [now, setNow] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => loadNotices().then((next) => { if (next) { setData(next); setCleared(false); } return next; }), []);

  useEffect(() => {
    let alive = true;
    const pull = () => void loadNotices().then((next) => { if (alive && next) { setData(next); setCleared(false); } });
    pull();
    const onVisible = () => { if (document.visibilityState === 'visible') pull(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (trigger.current?.contains(t) || panel.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open, close]);

  const unread = cleared ? 0 : (data?.unreadCount ?? 0);

  async function toggle() {
    if (open) return close();
    setNow(Date.now());
    setOpen(true);
    const current = (await refresh()) ?? data;
    const fresh = (current?.items ?? []).filter((i) => i.readAt === null).map((i) => i.id);
    setSince(new Set(fresh));
    if (fresh.length > 0 && (await markNoticesRead(fresh))) setCleared(true);
  }

  const items = data?.items ?? [];

  return (
    <>
      <Button
        ref={trigger}
        className="top__bell"
        variant="ghost"
        iconOnly
        label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
        icon={<><Bell size={20} />{unread > 0 ? <span className="top__n" aria-hidden="true">{unread > 9 ? '9+' : unread}</span> : null}</>}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      />
      {open && createPortal(
        <div className="ntf" style={{ position: 'fixed' }} role="dialog" aria-label="Notifications" ref={panel}>
          <div className="ntf__hd"><span className="ntf__t">Notifications</span></div>
          <div className="ntf__list">
            {items.length === 0 ? (
              <EmptyState kind="done" icon={<Bell size={22} />} title="Nothing new" body="Reminders, plan changes and new assessments from your trainer show up here." />
            ) : items.map((n, i) => {
              const day = dayOf(n.at, now);
              const showDay = i === 0 || dayOf(items[i - 1].at, now) !== day;
              const isNew = since.has(n.id);
              return (
                <div key={n.id}>
                  {showDay ? <p className="ntf__day">{day}</p> : null}
                  <Link className={`ntf__i${isNew ? ' ntf__i--unread' : ''}`} href={hrefFor(n)} onClick={() => close(false)}>
                    {isNew ? <span className="ntf__dot" aria-label="New" /> : null}
                    <span className="ntf__c"><span className="ntf__l">{n.text}</span></span>
                    <span className="ntf__w">{new Date(n.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toLowerCase()}</span>
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="ntf__foot"><Link href="/me/inbox" onClick={() => close(false)}>Messages and notes from your trainer</Link></p>
        </div>,
        document.body,
      )}
    </>
  );
}

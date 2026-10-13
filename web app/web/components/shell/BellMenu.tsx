'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { loadBell, markBellSeen } from '@/lib/notifications/actions';
import { describe, type BellItem, type BellWire } from '@/lib/notifications/types';

import { Bell, Check, Dumbbell, User } from './Icons';
import { useWorkspace } from './WorkspaceHost';

/**
 * THE BELL — what the client portal did while the trainer was on the floor (api-contract 1.2, tr-b1).
 *
 * It is the RECORD and the attention queue is the WORKLIST (`.ntf`'s own comment draws that line): nothing here carries a verb,
 * a row opens the client's file, and opening the bell is what clears the count.
 *
 * ── READ FROM THE BROWSER, AND WHY THAT IS NOT A SERVER COMPONENT ─────────────
 *
 * The bar is drawn by forty screens and none of them can be asked to fetch for it, so the bell loads itself through a server
 * action once the page is up. It draws nothing until it has an answer — an absent count is a missing number, a wrong one sends
 * a trainer looking for something that is not there.
 *
 * ── THE COUNT CLEARS ON OPEN, THE ROWS DO NOT ─────────────────────────────────
 *
 * Opening marks the bell seen and zeroes the badge, but the rows that were new stay marked for as long as the panel is open
 * (`since` holds the moment before). A list that un-bolds itself under the pointer is one whose new rows you cannot find.
 */

const ICONS = { user: User, dumbbell: Dumbbell, check: Check } as const;

/** *Today* / *Yesterday* / *Thursday 8 Oct* — the ladder the rest of the product dates things with. */
function dayOf(ms: number, now: number): string {
  const d = new Date(ms);
  const midnight = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const days = Math.round((midnight(new Date(now)) - midnight(d)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

export function BellMenu() {
  const shell = useWorkspace();
  const [bell, setBell] = useState<BellWire | null>(null);
  const [open, setOpen] = useState(false);
  /** What `seenAt` was before this opening — rows newer than it draw as unread until the panel closes. */
  const [since, setSince] = useState<number | null>(null);
  const [cleared, setCleared] = useState(false);
  /** The day the ladder is counted from — fixed at the opening, so a panel left open past midnight does not re-date its rows. */
  const [now, setNow] = useState(0);

  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    return loadBell().then((next) => {
      if (next) {
        setBell(next);
        setCleared(false);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    const pull = () => {
      void loadBell().then((next) => {
        if (!alive || !next) return;
        setBell(next);
        setCleared(false);
      });
    };
    pull();
    // A trainer comes back to a tab after a session on the floor: that is when the answer is stale.
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (trigger.current?.contains(target) || panel.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, close]);

  // Outside the shell (the library, sign-in) there is no trainer to have a bell.
  if (!shell) return null;

  const unread = cleared ? 0 : (bell?.unreadCount ?? 0);

  async function toggle() {
    if (open) return close();
    setNow(Date.now());
    setOpen(true);
    const current = (await refresh()) ?? bell;
    setSince(current?.seenAt ?? null);
    if (current && current.unreadCount > 0 && (await markBellSeen())) setCleared(true);
  }

  const items = bell?.items ?? [];
  const isNew = (i: BellItem) => cleared && i.at > (since ?? 0);

  return (
    <>
      <Button
        ref={trigger}
        className="top__bell"
        variant="ghost"
        iconOnly
        label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
        icon={
          <>
            <Bell size={20} />
            {unread > 0 ? (
              <span className="top__n" aria-hidden="true">
                {unread > 9 ? '9+' : unread}
              </span>
            ) : null}
          </>
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      />

      {open &&
        createPortal(
          <div
            className="ntf"
            style={{ position: 'fixed' }}
            role="dialog"
            aria-label="Notifications"
            ref={panel}
          >
            <div className="ntf__hd">
              <span className="ntf__t">Notifications</span>
            </div>

            <div className="ntf__list">
              {items.length === 0 ? (
                <EmptyState
                  kind="done"
                  icon={<Bell size={22} />}
                  title="Nothing new"
                  body="When a client joins the portal, declines, or sends something back, it shows up here."
                />
              ) : (
                items.map((item, n) => {
                  const day = dayOf(item.at, now);
                  const showDay = n === 0 || dayOf(items[n - 1].at, now) !== day;
                  const line = describe(item);
                  const Icon = ICONS[line.icon];
                  return (
                    <div key={item.key}>
                      {showDay ? <p className="ntf__day">{day}</p> : null}
                      <Link
                        className={`ntf__i${isNew(item) ? ' ntf__i--unread' : ''}`}
                        href={`/clients/${item.client.id}`}
                        onClick={() => close(false)}
                      >
                        {isNew(item) ? <span className="ntf__dot" aria-label="New" /> : null}
                        <span className={`ntf__ic ntf__ic--${line.tone}`} aria-hidden="true">
                          <Icon size={15} />
                        </span>
                        <span className="ntf__c">
                          <span className="ntf__l">
                            <b>{item.client.name}</b> {line.what}
                          </span>
                          {line.meta ? <span className="ntf__m">{line.meta}</span> : null}
                        </span>
                        <span className="ntf__w">{timeOf(item.at)}</span>
                      </Link>
                    </div>
                  );
                })
              )}
            </div>

            <p className="ntf__foot">The last fourteen days. Opening this clears the count.</p>
          </div>,
          document.body,
        )}
    </>
  );
}

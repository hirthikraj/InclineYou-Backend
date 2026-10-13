'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { inviteClient, inviteClients, revokeInvite } from '@/lib/clients/invite-actions';
import type { InvitationsData } from '@/lib/clients/invite-api';
import {
  INVITE_TABS,
  SKIP_REASON,
  type BulkInviteWire,
  type InviteCreatedWire,
  type InviteRowWire,
} from '@/lib/clients/invite-types';
import { formatPhone } from '@/lib/auth/policy';
import { TopBar } from '@/components/shell/TopBar';
import { PageTabs } from '@/components/shell/PageTabs';
import { Avatar } from '@/web-components/ui/Avatar';
import { BulkBar } from '@/web-components/ui/BulkBar';
import { Button } from '@/web-components/ui/Button';
import { CheckboxCell } from '@/web-components/ui/Checkbox';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Message } from '@/web-components/ui/Message';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { RowMenu } from '@/web-components/ui/RowMenu';
import { Table, Row, type Column } from '@/web-components/ui/Table';
import { Tag, type TagTone } from '@/web-components/ui/Tag';
import { InviteSheet } from './InviteSheet';

/**
 * `/clients/invitations` — WHO HAS JOINED, WHO HAS NOT, AND THE WAY TO ASK AGAIN.
 *
 * Three routes meet here (api-contract 1.2): the list (tr-a3), one invite or a resend (tr-a1), several at once (tr-a2),
 * and the withdrawal (tr-a4). The page is a view of the roster rather than a new place to manage people, so it has no
 * filters beyond the four tabs, and the tabs are links: each is a different read of the server, not a slice of data
 * already in the browser.
 *
 * ── THE ORDER IS THE ORDER OF THE WORK ──────────────────────────────────────
 * 1. **A bulk invite's drafts**, while there are any. Each is a message the trainer still has to send from their own
 *    number, so they stay at the top until the list is closed, and the next one to open is the one primary button on
 *    the page: lime is spent on *the next thing to press*, and here that is a single answer.
 * 2. **Not invited yet**: a table with a tick per row and the system's `BulkBar` when anything is ticked — the same
 *    selection grammar the programs list uses — and a per-row *Invite* so one person never needs a selection.
 * 3. **Waiting for an answer**: the invitations that are out. *Send again* is the visible verb and *Withdraw* lives in the
 *    row's menu, because the first is what a trainer does a dozen times and the second is rare.
 *
 * ── RULES THE CONTRACT GIVES IT ─────────────────────────────────────────────
 * · **Expired is not a state the trainer manages.** The server derives it from the date. The screen says *Expired* where
 *   it says *Invited*, under the same tab, with the same single action, because a lapsed link and a link nobody has
 *   opened are the same problem with the same answer.
 * · **A bulk invite is a to-do list, not a send.** The panel never claims anything was sent, because the server cannot
 *   know. It ticks each draft off as its sheet is opened, so *which ones have I done* is visible.
 * · **Withdrawing asks nothing first.** It is reversible by inviting again, and a confirmation on a reversible act is
 *   friction the trainer learns to click through.
 */

const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const DAY = 86_400_000;

type Sheet = { clientId: string; clientName: string; phone: string; created: InviteCreatedWire };

const PICK_COLUMNS = (all: React.ReactNode): Column[] => [
  { key: 'sel', label: all, className: 'sel ivn-c-sel' },
  { key: 'client', label: 'Client' },
  { key: 'status', label: 'Status', className: 'ivn-c-status' },
  { key: 'act', label: <span className="vh">Actions</span>, className: 'ivn-c-act' },
];

const SENT_COLUMNS: Column[] = [
  { key: 'client', label: 'Client' },
  { key: 'status', label: 'Status', className: 'ivn-c-status' },
  { key: 'date', label: 'Sent', className: 'ivn-c-date' },
  { key: 'act', label: <span className="vh">Actions</span>, className: 'ivn-c-act' },
];

const RESULT_COLUMNS: Column[] = [
  { key: 'client', label: 'Client' },
  { key: 'status', label: 'Link', className: 'ivn-c-status' },
  { key: 'act', label: <span className="vh">Action</span>, className: 'ivn-c-act' },
];

export function Invitations({ data, now, tab }: { data: InvitationsData; now: number; tab: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // `people` is who was ticked, captured at the press: the refresh that follows moves them out of `candidates`, and the
  // results list still has to say whose message is whose, and to whom the WhatsApp link goes.
  const [bulk, setBulk] = useState<{
    result: BulkInviteWire;
    done: Set<string>;
    people: Map<string, { name: string; phone: string }>;
  } | null>(null);

  const { list, candidates, withoutNumber } = data;
  const counts = list.counts;
  const waiting = counts ? counts.pending + counts.expired : null;

  const tabs = INVITE_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    href: `/clients/invitations?tab=${t.key}`,
    count: counts
      ? t.key === 'waiting' ? waiting
        : t.key === 'joined' ? counts.accepted
          : t.key === 'declined' ? counts.declined
            : counts.revoked
      : null,
  }));

  function openFor(clientId: string, clientName: string, phone: string) {
    setError(null);
    setWorking(clientId);
    start(async () => {
      const r = await inviteClient(clientId);
      setWorking(null);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setSheet({ clientId, clientName, phone, created: r.invite });
      router.refresh();
    });
  }

  function withdraw(i: InviteRowWire) {
    setError(null);
    start(async () => {
      const r = await revokeInvite(i.id, i.client.id);
      if (!r.ok) setError(r.message);
      router.refresh();
    });
  }

  function inviteSelected() {
    setError(null);
    const people = new Map(
      candidates.filter((c) => picked.has(c.id)).map((c) => [c.id, { name: c.name ?? 'This client', phone: c.phone ?? '' }]),
    );
    setWorking('bulk');
    start(async () => {
      const r = await inviteClients([...picked]);
      setWorking(null);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setBulk({ result: r.result, done: new Set(), people });
      setPicked(new Set());
      router.refresh();
    });
  }

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allPicked = candidates.length > 0 && picked.size === candidates.length;
  const selectAll = () => setPicked(allPicked ? new Set() : new Set(candidates.map((c) => c.id)));
  const nextDraft = bulk?.result.results.find((r) => r.outcome === 'created' && !bulk.done.has(r.clientId))?.clientId;

  return (
    <>
      <TopBar crumb="Clients" title="Invitations" />

      <main className="main body--flush ivn" id="main-content">
        <PageHeader
          className="ph--pglist"
          title="Invitations"
          sub={
            waiting === null ? undefined : waiting === 0 ? 'Nobody is waiting on an answer' : `${waiting} waiting for an answer`
          }
          actions={
            <Button variant="secondary" href="/clients">
              All clients
            </Button>
          }
        >
          <PageTabs label="Invitations view" current={tab} tabs={tabs} />
        </PageHeader>

        <div className="ivn__body">
          {error && <Message tone="err" alert>{error}</Message>}

          {bulk && (
            <section className="ivn__sec" aria-labelledby="inv-results">
              <div className="ivn__t ivn__t--pick">
                <div className="ivn__hd">
                  <div className="ivn__hd-t">
                    <b id="inv-results">
                      {bulk.result.summary.created === 1 ? '1 link ready' : `${bulk.result.summary.created} links ready`}
                      {bulk.result.summary.skipped > 0 && ` · ${bulk.result.summary.skipped} skipped`}
                    </b>
                    <span>Nothing has been sent. Open each message, read it, and send it from your own WhatsApp.</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setBulk(null)}>
                    Close
                  </Button>
                </div>
                <Table caption="Drafted invitations" columns={RESULT_COLUMNS}>
                  {bulk.result.results.map((r) => {
                    const who = bulk.people.get(r.clientId) ?? { name: 'Client', phone: '' };
                    const ready = r.outcome === 'created' && r.draft && r.link;
                    const done = bulk.done.has(r.clientId);
                    return (
                      <Row
                        key={r.clientId}
                        cells={[
                          { key: 'client', label: 'Client', content: <Who id={r.clientId} name={who.name} phone={who.phone} /> },
                          {
                            key: 'status',
                            label: 'Link',
                            className: 'ivn-c-status',
                            content: ready
                              ? <Tag tone={done ? 'ok' : 'neutral'}>{done ? 'Opened' : 'Ready'}</Tag>
                              : <Tag tone="warn">Skipped</Tag>,
                          },
                          {
                            key: 'act',
                            label: '',
                            className: 'ivn-c-act',
                            content: ready ? (
                              <span className="ivn__acts">
                                <Button
                                  size="sm"
                                  variant={r.clientId === nextDraft ? 'primary' : 'secondary'}
                                  onClick={() => {
                                    setSheet({
                                      clientId: r.clientId,
                                      clientName: who.name,
                                      phone: who.phone,
                                      created: {
                                        invite: r.invite!,
                                        client: { id: r.clientId, name: who.name, membershipStatus: 'invited' },
                                        link: r.link!,
                                        draft: r.draft!,
                                        waUrl: r.waUrl!,
                                      },
                                    });
                                    setBulk((b) => b && { ...b, done: new Set(b.done).add(r.clientId) });
                                  }}
                                >
                                  {done ? 'Open again' : 'Open message'}
                                </Button>
                              </span>
                            ) : (
                              <span className="ivn__why">{SKIP_REASON[r.reason ?? ''] ?? 'Skipped.'}</span>
                            ),
                          },
                        ]}
                      />
                    );
                  })}
                </Table>
              </div>
            </section>
          )}

          {tab === 'waiting' && (candidates.length > 0 || withoutNumber > 0) && (
            <section className="ivn__sec" aria-labelledby="inv-new">
              <h2 id="inv-new" className="ivn__h">
                Not invited yet
                <span className="ivn__n">{candidates.length}</span>
              </h2>
              {candidates.length > 0 && (
                <div className={`ivn__t ivn__t--pick${picked.size > 0 ? ' ivn__t--sel' : ''}`}>
                  {picked.size > 0 && (
                    <BulkBar
                      inline
                      count={picked.size}
                      total={candidates.length}
                      noun="clients"
                      one="client"
                      onSelectAll={selectAll}
                      actions={
                        <Button size="sm" variant="primary" loading={working === 'bulk'} onClick={inviteSelected}>
                          {picked.size === 1 ? 'Invite 1 client' : `Invite ${picked.size} clients`}
                        </Button>
                      }
                    />
                  )}
                  <Table
                    caption="Clients who have not been invited"
                    columns={PICK_COLUMNS(
                      <CheckboxCell
                        label={allPicked ? 'Clear the selection' : `Select all ${candidates.length} clients`}
                        checked={allPicked}
                        indeterminate={picked.size > 0 && !allPicked}
                        onChange={selectAll}
                      />,
                    )}
                  >
                    {candidates.map((c) => (
                      <Row
                        key={c.id}
                        selected={picked.has(c.id)}
                        select={
                          <CheckboxCell
                            label={`Select ${c.name ?? 'this client'}`}
                            checked={picked.has(c.id)}
                            onChange={() => toggle(c.id)}
                          />
                        }
                        cells={[
                          { key: 'client', label: 'Client', content: <Who id={c.id} name={c.name ?? 'Unnamed'} phone={c.phone ?? ''} link /> },
                          {
                            key: 'status',
                            label: 'Status',
                            className: 'ivn-c-status',
                            content:
                              c.membershipStatus === 'declined'
                                ? <Tag tone="warn">Declined</Tag>
                                : <Tag tone="neutral">Not invited</Tag>,
                          },
                          {
                            key: 'act',
                            label: '',
                            className: 'ivn-c-act',
                            content: (
                              <span className="ivn__acts">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  loading={working === c.id}
                                  disabled={busy && working !== c.id}
                                  onClick={() => openFor(c.id, c.name ?? 'this client', c.phone ?? '')}
                                >
                                  Invite
                                </Button>
                              </span>
                            ),
                          },
                        ]}
                      />
                    ))}
                  </Table>
                </div>
              )}
              {withoutNumber > 0 && (
                <p className="ivn__note">
                  {withoutNumber === 1 ? '1 client has' : `${withoutNumber} clients have`} no number on file and can’t be invited
                  until you add one.
                </p>
              )}
            </section>
          )}

          <section className="ivn__sec" aria-labelledby="inv-sent">
            {tab === 'waiting' && (
              <h2 id="inv-sent" className="ivn__h">
                Waiting for an answer
                <span className="ivn__n">{waiting ?? list.items.length}</span>
              </h2>
            )}
            {list.items.length === 0 ? (
              <EmptyState
                kind={tab === 'waiting' ? 'done' : 'first-run'}
                title={EMPTY[tab]?.title ?? 'Nothing here'}
                body={EMPTY[tab]?.body ?? ''}
              />
            ) : (
              <div className="ivn__t">
                <Table caption={`${list.items.length} invitations`} columns={SENT_COLUMNS}>
                  {list.items.map((i) => {
                    const open = i.state === 'pending' || i.state === 'expired';
                    return (
                      <Row
                        key={i.id}
                        cells={[
                          {
                            key: 'client',
                            label: 'Client',
                            content: <Who id={i.client.id} name={i.client.name ?? 'Unnamed'} phone={i.client.phone ?? ''} link />,
                          },
                          { key: 'status', label: 'Status', className: 'ivn-c-status', content: <StateTag state={i.state} /> },
                          {
                            key: 'date',
                            label: 'Sent',
                            className: 'ivn-c-date',
                            content: (
                              <span className="ivn__d">
                                <b>{DATE.format(new Date(i.createdAt))}</b>
                                <em>{detail(i, now)}</em>
                              </span>
                            ),
                          },
                          {
                            key: 'act',
                            label: '',
                            className: 'ivn-c-act',
                            content: (
                              <span className="ivn__acts">
                                {open && (
                                  <Button
                                    size="sm"
                                    variant={i.state === 'expired' ? 'primary' : 'secondary'}
                                    loading={working === i.client.id}
                                    disabled={!i.client.phone || (busy && working !== i.client.id)}
                                    onClick={() => openFor(i.client.id, i.client.name ?? 'this client', i.client.phone ?? '')}
                                  >
                                    Send again
                                  </Button>
                                )}
                                <RowMenu
                                  label={`${i.client.name ?? 'This client'}’s invitation`}
                                  items={[
                                    { key: 'file', label: 'Open the client file', href: `/clients/${i.client.id}` },
                                    ...(open ? [{ key: 'withdraw', label: 'Withdraw the invitation', onSelect: () => withdraw(i) }] : []),
                                  ]}
                                />
                              </span>
                            ),
                          },
                        ]}
                      />
                    );
                  })}
                </Table>
              </div>
            )}
            {list.nextCursor && (
              <p className="ivn__note">Showing the newest {list.items.length}. Older invitations are not listed here.</p>
            )}
          </section>
        </div>
      </main>

      {sheet && (
        <InviteSheet
          clientId={sheet.clientId}
          clientName={sheet.clientName}
          phone={sheet.phone}
          draft={sheet.created.draft}
          link={sheet.created.link}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

/** The person: a disc, a name (that opens the file where it can), the number under it. */
function Who({ id, name, phone, link }: { id: string; name: string; phone: string; link?: boolean }) {
  return (
    <span className="ivn__who">
      <Avatar name={name} id={id} size="sm" />
      <span className="ivn__id">
        {link ? (
          <Link className="ivn__nm" href={`/clients/${id}`}>
            {name}
          </Link>
        ) : (
          <b className="ivn__nm">{name}</b>
        )}
        {phone && <span className="ivn__ph">{formatPhone(phone)}</span>}
      </span>
    </span>
  );
}

const STATE: Record<InviteRowWire['state'], { tone: TagTone; label: string }> = {
  pending: { tone: 'info', label: 'Invited' },
  expired: { tone: 'warn', label: 'Expired' },
  accepted: { tone: 'ok', label: 'Joined' },
  declined: { tone: 'warn', label: 'Declined' },
  revoked: { tone: 'neutral', label: 'Withdrawn' },
};

/** The state in a word, never in colour alone. */
function StateTag({ state }: { state: InviteRowWire['state'] }) {
  const s = STATE[state];
  return <Tag tone={s.tone}>{s.label}</Tag>;
}

/** The second line under the sent date: what is true of the invitation now, in the trainer's words. */
function detail(i: InviteRowWire, now: number): string {
  switch (i.state) {
    case 'pending': {
      const days = Math.max(1, Math.ceil((i.expiresAt - now) / DAY));
      return days === 1 ? 'Last day' : `${days} days left`;
    }
    case 'expired':
      return `Ended ${DATE.format(new Date(i.expiresAt))}`;
    case 'accepted':
      return i.acceptedAt ? `Joined ${DATE.format(new Date(i.acceptedAt))}` : 'Joined';
    case 'declined':
      return i.declineReason === 'age_requirement' ? 'Age requirement' : 'Declined by them';
    default:
      return REVOKED[i.revokedReason ?? ''] ?? 'Withdrawn';
  }
}

const REVOKED: Record<string, string> = {
  replaced: 'Replaced by a newer link',
  number_changed: 'Number changed',
  trainer: 'You withdrew it',
  client_removed: 'Client left',
  erased: 'Client erased',
};

const EMPTY: Record<string, { title: string; body: string }> = {
  waiting: { title: 'Nobody is waiting on an invitation', body: 'Invite a client above and they will show here until they join.' },
  joined: { title: 'Nobody has joined yet', body: 'A client appears here once they open their link and say Let me in.' },
  declined: { title: 'Nobody has declined', body: 'A client who turns an invitation down, or is under 18, shows here.' },
  withdrawn: { title: 'No withdrawn invitations', body: 'Links you replaced or took back show here.' },
};

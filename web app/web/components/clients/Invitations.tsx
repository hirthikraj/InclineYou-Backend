'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { inviteClient, revokeInvite } from '@/lib/clients/invite-actions';
import type { InvitationsData } from '@/lib/clients/invite-api';
import type { InviteCreatedWire, InviteRowWire } from '@/lib/clients/invite-types';
import { formatPhone } from '@/lib/auth/policy';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Message } from '@/web-components/ui/Message';
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
 * 1. **Not invited yet**: one row per client with its own *Invite*, which opens that client's send sheet. There is no
 *    selection and no bulk invite (removed 23 Nov 2026, product owner): every invite is a message the trainer reads and
 *    sends from their own number, one at a time anyway, so ticking a list first only added a second way to do one thing.
 * 2. **Waiting for an answer**: the invitations that are out. *Send again* is the visible verb and *Withdraw* lives in the
 *    row's menu, because the first is what a trainer does a dozen times and the second is rare.
 *
 * ── RULES THE CONTRACT GIVES IT ─────────────────────────────────────────────
 * · **Expired is not a state the trainer manages.** The server derives it from the date. The screen says *Expired* where
 *   it says *Invited*, under the same tab, with the same single action, because a lapsed link and a link nobody has
 *   opened are the same problem with the same answer.
 * · **Withdrawing asks nothing first.** It is reversible by inviting again, and a confirmation on a reversible act is
 *   friction the trainer learns to click through.
 */

/* The app's own month spelling. `Intl` in en-IN writes "Sept", and every other date in the
   product says "Sep" (24 Nov 2026). Same `.format()` shape, so the call-sites are unchanged. */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE = { format: (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}` };
const DAY = 86_400_000;

type Sheet = { clientId: string; clientName: string; phone: string; created: InviteCreatedWire };

const PICK_COLUMNS: Column[] = [
  { key: 'client', label: 'Client' },
  { key: 'status', label: 'Status', className: 'ivn-c-status' },
  { key: 'act', label: <span className="vh">Actions</span>, className: 'ivn-c-act' },
];

/** The invitations table's columns for a view: Joined has no Status (it would be "Joined" on every row) and dates by joining. */
function sentColumns(tab: string): Column[] {
  return [
    { key: 'client', label: 'Client' },
    ...(tab === 'joined' ? [] : [{ key: 'status', label: 'Status', className: 'ivn-c-status' }]),
    { key: 'date', label: tab === 'joined' ? 'Joined' : 'Sent', className: 'ivn-c-date' },
    { key: 'act', label: <span className="vh">Actions</span>, className: 'ivn-c-act' },
  ];
}

const SENT_HEADING: Record<string, string> = {
  waiting: 'Waiting for an answer',
  joined: 'Accepted your invitation',
  declined: 'Declined or withdrawn',
};

/**
 * THE INVITATIONS, WITHOUT A PAGE AROUND THEM (22 Nov 2026). The body of what was `/clients/invitations` —
 * *Not invited yet* and the invitations out there — drawn inside Clients → Joining beside the join
 * requests. Every behaviour above is unchanged; only the TopBar, the header and the tab strip moved to the Joining page.
 * `hideEmpty`: Joining draws one empty state for both lists, so this one stays quiet when it has nothing.
 */
export function InvitationsBody({
  data,
  now,
  tab,
  hideEmpty = false,
}: {
  data: InvitationsData;
  now: number;
  tab: string;
  hideEmpty?: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const { list, candidates, withoutNumber } = data;
  const counts = list.counts;
  const waiting = counts ? counts.pending + counts.expired : null;

  /* ONE ROW PER PERSON ON DECLINED (24 Nov 2026). Every withdrawn or replaced link was its own
     row, so a client re-invited four times read as four people. The newest stays (the list is
     newest first) and says how many came before it. */
  const earlier = new Map<string, number>();
  const rows = tab === 'declined'
    ? list.items.filter((i) => {
        const seen = earlier.has(i.client.id);
        earlier.set(i.client.id, (earlier.get(i.client.id) ?? -1) + 1);
        return !seen;
      })
    : list.items;


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

  return (
    <>
        <div className="ivn__in">
          {error && <Message tone="err" alert>{error}</Message>}

          {tab === 'invite' && (candidates.length > 0 || withoutNumber > 0) && (
            <section className="ivn__sec" aria-labelledby="inv-new">
              <h2 id="inv-new" className="ivn__h">
                Not invited yet
                <span className="ivn__n">{candidates.length}</span>
              </h2>
              {candidates.length > 0 && (
                <div className="ivn__t ivn__t--pick">
                  <Table
                    caption="Clients who have not been invited"
                    columns={PICK_COLUMNS}
                  >
                    {candidates.map((c) => (
                      <Row
                        key={c.id}
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

          {tab !== 'invite' && (
          <section className="ivn__sec" aria-labelledby="inv-sent">
            {/* Every view names its list here, in the list's own section, so the heading sits on its table rather than a
                section's gap above it (22 Nov 2026 — Joined and Declined had theirs drawn outside, 28px off). */}
            {list.items.length > 0 && (
              <h2 id="inv-sent" className="ivn__h">
                {SENT_HEADING[tab] ?? 'Invitations'}
                {/* Invitations, not people, so it matches the tab's own count; the grouped rows still sum
                    to it through their "N earlier". */}
                <span className="ivn__n">{tab === 'waiting' ? (waiting ?? list.items.length) : list.items.length}</span>
              </h2>
            )}
            {list.items.length === 0 ? (
              hideEmpty ? null : <EmptyState
                kind={tab === 'waiting' ? 'done' : 'first-run'}
                title={EMPTY[tab]?.title ?? 'Nothing here'}
                body={EMPTY[tab]?.body ?? ''}
              />
            ) : (
              <div className="ivn__t">
                <Table caption={`${list.items.length} invitations`} columns={sentColumns(tab)}>
                  {rows.map((i) => {
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
                          /* On Joined every row would say "Joined": the column is dropped there (22 Nov 2026). */
                          ...(tab === 'joined'
                            ? []
                            : [{ key: 'status', label: 'Status', className: 'ivn-c-status', content: <StateTag state={i.state} /> }]),
                          {
                            key: 'date',
                            label: tab === 'joined' ? 'Joined' : 'Sent',
                            className: 'ivn-c-date',
                            /* On Joined the date that matters is when they joined; when they were invited is the second line. */
                            content: tab === 'joined' ? (
                              <span className="ivn__d">
                                <b>{DATE.format(new Date(i.acceptedAt ?? i.createdAt))}</b>
                                <em>Invited {DATE.format(new Date(i.createdAt))}</em>
                              </span>
                            ) : (
                              <span className="ivn__d">
                                <b>{DATE.format(new Date(i.createdAt))}</b>
                                <em>
                                  {detail(i, now)}
                                  {(earlier.get(i.client.id) ?? 0) > 0 && ` · ${earlier.get(i.client.id)} earlier`}
                                </em>
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
          )}
        </div>

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
      /* It said "13 days left" — of what? It is the link that runs out. */
      return days === 1 ? 'Link expires today' : `Link expires in ${days} days`;
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

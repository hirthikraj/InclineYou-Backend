
import { InvitationsBody } from '@/components/clients/Invitations';
import { TopBar } from '@/components/shell/TopBar';
import { UserAdd } from '@/components/shell/Icons';
import { LinkIcon } from '@/components/programs/Icons';
import type { JoiningData, JoiningView } from '@/lib/join/joining';
import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { NoticeBar } from '@/web-components/ui/NoticeBar';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { JoinViews } from './JoinViews';
import { ClientsTabs } from './JoinTabs';
import { JoinRequestCards } from './JoinRequests';

/**
 * `/clients/joining` — EVERYBODY ON THEIR WAY IN (22 Nov 2026, the owner's call).
 *
 * Two doors lead into the client list: an INVITATION the trainer sends to somebody already added, and a JOIN REQUEST somebody
 * sends through the public join link. They were two pages; from the trainer's side they answer one question — who is coming
 * in, and is anything waiting on me — so they are one list here, ordered by who has to act next:
 *
 *   1. Asked to join   join requests waiting for an answer. First, because nobody but the trainer can move them.
 *   2. Invited         invitations out and not yet accepted (Send again / Withdraw), and who can still be invited.
 *
 * *Joined* and *Declined* hold the history of both kinds. The two stay separate underneath — different tables, different
 * rules (a personal single-use link versus a request that needs approving) — and each keeps its own verbs; only the place
 * they are read from merged. `InvitationsBody` and `JoinRequestCards` are the old pages' bodies, unchanged.
 */
export function Joining({ data, view, now }: { data: JoiningData; view: JoiningView; now: number }) {
  const { invites, requests } = data;
  const rc = requests.list.counts;
  const ic = invites.list.counts;
  const asking = rc.pending;
  const invitedOut = ic ? ic.pending + ic.expired : 0;

  const views = [
    { key: 'active', label: 'In progress', href: '/clients/joining', count: asking + invitedOut },
    /* Who on the roster can still be invited. A view of its own (22 Nov 2026): they are not on their way in yet, and drawn
       under "In progress" they made that view's count disagree with the rows under it. */
    { key: 'invite', label: 'To invite', href: '/clients/joining?view=invite', count: invites.candidates.length },
    { key: 'joined', label: 'Joined', href: '/clients/joining?view=joined', count: rc.approved + (ic?.accepted ?? 0) },
    {
      key: 'declined',
      label: 'Declined',
      href: '/clients/joining?view=declined',
      count: rc.declined + (ic ? ic.declined + ic.revoked : 0),
    },
  ];

  const noRequests = requests.list.items.length === 0;
  const noInvites = invites.list.items.length === 0;
  const nothingToInvite = invites.candidates.length === 0 && invites.withoutNumber === 0;
  const empty = view === 'invite' ? nothingToInvite : noRequests && noInvites;

  const sub =
    asking > 0
      ? `${asking} ${asking === 1 ? 'person is' : 'people are'} waiting for your answer`
      : invitedOut > 0
        ? `${invitedOut} ${invitedOut === 1 ? 'invitation is' : 'invitations are'} out`
        : 'Nobody is waiting on you';

  return (
    <>
      <TopBar crumb="Clients" title="Joining" />
      <main className="main body--flush ivn" id="main-content">
        <PageHeader className="ph--pglist" title="Joining" sub={sub}>
          <ClientsTabs current="joining" joining={asking} />
        </PageHeader>

        <div className="ivn__body">
          {/* The roster's own chips (22 Nov 2026), so the two pages under the same Clients tabs narrow their lists with one
              control. Links rather than the roster's pressed buttons — each view is its own read and belongs in the
              address — so the selected one is `aria-current`, styled exactly as the roster's pressed chip. */}
          <JoinViews views={views} current={view} />

          {view === 'active' && !requests.link.takingJoins && (
            /* A setting, not a fault: an info band with its one verb at the far end. It was loose
               amber text, which read as a warning and on a phone ran its link into the edge. */
            <NoticeBar
              icon={<LinkIcon size={14} />}
              action={
                <Button size="sm" variant="secondary" href="/clients/join-link">
                  {requests.link.exists ? 'Turn it on' : 'Set it up'}
                </Button>
              }
            >
              Your join link is {requests.link.exists ? 'off' : 'not set up yet'}, so nobody new can ask to join.
            </NoticeBar>
          )}

          {empty && (
            <EmptyState
              kind={view === 'active' ? 'done' : 'first-run'}
              icon={<UserAdd size={22} />}
              title={
                view === 'active' ? 'Nobody is on their way in'
                  : view === 'invite' ? 'Everyone on your list has been invited'
                    : view === 'joined' ? 'Nobody has joined yet' : 'Nothing declined'
              }
              body={
                view === 'active'
                  ? 'People who ask through your join link, and clients you invite, show up here until they join.'
                  : view === 'invite'
                    ? 'Clients you add with a phone number show up here until you invite them to the app.'
                  : view === 'joined'
                    ? 'Clients who accepted an invitation, and people you approved, are listed here.'
                    : 'Declined requests are deleted after 30 days; declined and withdrawn invitations stay listed.'
              }
              action={
                view === 'active' ? (
                  <span className="jn-acts">
                    <Button variant="primary" icon={<LinkIcon size={15} />} href="/clients/join-link">
                      Set up your join link
                    </Button>
                    {invites.candidates.length > 0 && (
                      <Button variant="secondary" href="/clients/joining?view=invite">
                        Invite clients ({invites.candidates.length})
                      </Button>
                    )}
                  </span>
                ) : undefined
              }
            />
          )}

          {!empty && !noRequests && (
            <section className="ivn__sec" aria-labelledby="jn-asked">
              <h2 id="jn-asked" className="ivn__h">
                {view === 'active' ? 'Asked to join' : view === 'joined' ? 'Joined through your link' : 'Requests you declined'}
                <span className="ivn__n">{requests.list.items.length}</span>
              </h2>
              <JoinRequestCards items={requests.list.items} now={now} />
            </section>
          )}

          {/* ALWAYS AT THIS PLACE IN THE TREE, EVEN UNDER THE EMPTY STATE (23 Nov 2026). The send sheet lives in this
              component's state, and inviting the last client on *To invite* empties the view in the same server-action
              response that opens the sheet — drawn inside the non-empty branch, the body unmounted and the sheet (with
              the only copy of the link) vanished, so *Invite* looked like it did nothing. With nothing to list it draws
              nothing but the sheet. */}
          {(view === 'invite' || !noInvites) && (
            <InvitationsBody
              data={invites}
              now={now}
              tab={view === 'active' ? 'waiting' : view}
              hideEmpty
            />
          )}
        </div>
      </main>
    </>
  );
}

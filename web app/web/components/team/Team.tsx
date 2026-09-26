'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';

import type {
  ActivityRow,
  CoachClients,
  InvitationResponse,
  MemberResponse,
  TeamClientRow,
  TeamResponse,
  TeamTemplateRow,
} from '@/lib/team/api';
import {
  acceptInvitation,
  changeMemberRole,
  copyTemplate,
  createTeam,
  declineInvitation,
  deleteTeam,
  inviteMember,
  loadRevenue,
  reassignClient,
  removeMember,
  revokeInvite,
  updateTeam,
  type RevenueResult,
} from '@/lib/team/actions';
import { TopBar } from '@/components/shell/TopBar';
import { Glyph, Plus, Team as TeamIcon, Users } from '@/components/shell/Icons';
import { rupees } from '@/lib/today/time';
import { useToast } from '@/lib/toast/store';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Chip } from '@/web-components/ui/Chip';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Table, Row } from '@/web-components/ui/Table';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Message } from '@/web-components/ui/Message';
import { Avatar } from '@/web-components/ui/Avatar';

/* ────────────────────────────────────────────────── small icons ── */

function Crown({ size = 15 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 17l2-8 4 4 3-6 3 6 4-4 2 8H3z" />
    </Glyph>
  );
}
function Shield({ size = 15 }: { size?: number }) {
  return <Glyph size={size} d="M12 2l7 4v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-4z" />;
}
function Mail({ size = 15 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 7l10 7 10-7" />
    </Glyph>
  );
}
function X({ size = 15 }: { size?: number }) {
  return <Glyph size={size} d="M6 6l12 12M18 6l-12 12" />;
}
function Trash({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      <path d="M10 11v4M14 11v4" />
    </Glyph>
  );
}
function Copy({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </Glyph>
  );
}
function Arrow({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M5 12h14M13 5l7 7-7 7" />;
}
/* The glyph the product's other form-level errors carry. This screen drew its
   errors as bare red text under a class of its own; see `ui/Message.tsx`. */
function Warn({ size = 15 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 9v5" />
      <path d="M12 17h.01" />
    </Glyph>
  );
}
function ChevronDown({ size = 13 }: { size?: number }) {
  return <Glyph size={size} d="M6 9l6 6 6-6" />;
}
function Dumbbell({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M6.5 6.5h11M6.5 17.5h11" />
      <path d="M3 8.5v7M8 5.5v13M16 5.5v13M21 8.5v7" strokeWidth="2" />
    </Glyph>
  );
}

/* ───────────────────────────────────────── helpers ── */

function roleBadge(role: string) {
  if (role === 'owner')
    return (
      <span className="badge badge--owner" title="Owner">
        <Crown size={12} /> Owner
      </span>
    );
  if (role === 'admin')
    return (
      <span className="badge badge--admin" title="Admin">
        <Shield size={12} /> Admin
      </span>
    );
  return (
    <span className="badge badge--coach" title="Coach">
      Coach
    </span>
  );
}

/* `avatarColor` and a local `Avatar` used to live here. Both are gone.

   The colour was a third hash — `avatarToken` in `lib/today/time.ts` keys off
   the client id, `avatarTint` in `lib/setup/options.ts` took the modulo inside
   the loop, and this one hashed the NAME with `>>> 0`. Three functions, three
   answers, and the visible cost was on line ~1200 of this file: a client in a
   coach's roster was drawn from their name here and from `row.id` on the
   clients screen, so the same person was two different colours depending on
   which screen you were looking at. That is precisely what `avatarToken`'s own
   comment says the rule exists to prevent.

   The initials differed too — this one took the first letter of the first two
   words, `ui/Avatar` takes first + last — so a three-part name read `MK` here
   and `MI` everywhere else.

   Passing the trainer id (or the client id) rather than the name is what makes
   a coach one colour in the member list, in their roster header, in the
   templates table and in the revenue table. */

function relDate(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = Math.floor(diff / 86_400_000);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

function toRs(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return rupees(Number.isFinite(n) ? n : 0);
}

/* ─────────────────────────────────────────────────── tab types ── */

type Tab = 'overview' | 'members' | 'clients' | 'library' | 'activity' | 'revenue';

/* ──────────────────────────────────────────────── props shape ── */

interface Props {
  team: TeamResponse | null;
  members: MemberResponse[];
  invitations: InvitationResponse[];
  clients: CoachClients[];
  templates: TeamTemplateRow[];
  activity: ActivityRow[];
  now: number;
}

/* ════════════════════════════════════════════════════════ Team ══ */

export function Team(props: Props) {
  if (!props.team) {
    return <NoTeam invitations={props.invitations} now={props.now} />;
  }
  return <TeamDashboard {...props} team={props.team} />;
}

/* ═══════════════════════════════════════════════════ NoTeam ══════ */

function NoTeam({ invitations, now }: { invitations: InvitationResponse[]; now: number }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <TopBar crumb="Team" />
      {/* The dashboard's shape, and this branch needs it for the same reason:
          `.ph` is the frame's pinned row and `.body` is the scrolling one. */}
      <main className="main" id="main-content">
        <PageHeader
          title="Team"
          sub="Coach together, grow together"
          className="ph--named"
        />

        <div className="body">
        {invitations.length > 0 && (
          <section aria-label="Pending invitations">
            <h2 className="section-label">Pending invitations</h2>
            <div className="stack">
              {invitations.map((inv) => (
                <InvitationCard key={inv.id} invitation={inv} now={now} />
              ))}
            </div>
          </section>
        )}

        {!showCreate ? (
          <EmptyState
            icon={<><TeamIcon /></>}
            title="No team yet"
            body="Create a team to coach clients together with other trainers, share programs, and track revenue as a group."
            action={<><Button
              variant="primary"
              size="lg"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={16} /> Create a team
            </Button></>}
            style={{ minHeight: '40vh' }}
          />
        ) : (
          <Card
            title="Create your team"
            actions={<><Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button></>}
            className="team-create-card"
          >
            <CreateTeamForm onDone={() => setShowCreate(false)} />
          </Card>
        )}
        </div>
      </main>
    </>
  );
}

function InvitationCard({ invitation: inv, now }: { invitation: InvitationResponse; now: number }) {
  const [accepting, startAccept] = useTransition();
  const [declining, startDecline] = useTransition();
  const [error, setError] = useState<string | undefined>();

  const handleAccept = () => {
    startAccept(async () => {
      const r = await acceptInvitation(inv.id);
      if (r.error) setError(r.error);
    });
  };
  const handleDecline = () => {
    startDecline(async () => {
      const r = await declineInvitation(inv.id);
      if (r.error) setError(r.error);
    });
  };

  /* `now` is the SERVER's instant, threaded from the page, not `Date.now()`.
     Reading the clock during render is impure — the same render can produce a
     different figure on a re-render — and this one is printed in a sentence. */
  const daysLeft = Math.max(0, Math.ceil((inv.expiresAt - now) / 86_400_000));

  return (
    <Card bare className="inv-card">
      <div className="inv-card__body">
        <span className="inv-card__icon">
          <Mail size={20} />
        </span>
        <div className="inv-card__info">
          <strong className="inv-card__team">{inv.teamName}</strong>
          <span className="inv-card__from">Invited by {inv.invitedByName}</span>
          {daysLeft <= 3 && (
            <span className="inv-card__expiry">
              {daysLeft === 0 ? 'Expires today' : `Expires in ${daysLeft}d`}
            </span>
          )}
        </div>
        <div className="inv-card__acts">
          <Button
            variant="primary"
            size="sm"
            onClick={handleAccept}
            disabled={accepting || declining}
          >
            {accepting ? 'Joining…' : 'Accept'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDecline}
            disabled={accepting || declining}
          >
            {declining ? 'Declining…' : 'Decline'}
          </Button>
        </div>
      </div>
      {error && <Message tone="err" icon={<Warn size={15} />} alert>{error}</Message>}
    </Card>
  );
}

function CreateTeamForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createTeam, {});
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) onDone();
    wasPending.current = pending;
  });

  return (
    <form action={action}>
      <div className="fld">
        <label className="fld__h" htmlFor="team-name">
          Team name
        </label>
        <input
          id="team-name"
          name="name"
          type="text"
          className="ctl"
          placeholder="Iron House Coaching"
          maxLength={120}
          required
          autoFocus
        />
      </div>
      {state.error && <Message tone="err" icon={<Warn size={15} />} alert>{state.error}</Message>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Button
          variant="primary"
          size="lg"
          type="submit"
          disabled={pending}
        >
          {pending ? 'Creating…' : 'Create team'}
        </Button>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════ TeamDashboard ══════ */

function TeamDashboard(props: Props & { team: TeamResponse }) {
  const { team, members, clients, templates, activity, now } = props;
  const myRole = team.myRole;
  const isOwner = myRole === 'owner';
  const isAdminOrOwner = myRole === 'owner' || myRole === 'admin';

  const availableTabs: Tab[] = [
    'overview',
    'members',
    ...(isAdminOrOwner ? (['clients'] as Tab[]) : []),
    'library',
    ...(isAdminOrOwner ? (['activity'] as Tab[]) : []),
    ...(isOwner ? (['revenue'] as Tab[]) : []),
  ];

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const tab = availableTabs.includes(activeTab) ? activeTab : 'overview';

  const TAB_LABELS: Record<Tab, string> = {
    overview: 'Overview',
    members: 'Members',
    clients: 'Clients',
    library: 'Library',
    activity: 'Activity',
    revenue: 'Revenue',
  };

  return (
    <>
      {/* The crumb is the SECTION and the heading is this team's name, so the
          bar's phone title is stated rather than derived — *Team* over a screen
          that opens with *Iron Yard Coaching* names the shelf, not the book. */}
      <TopBar crumb="Team" title={team.name} />
      {/* `main.main` + `.ph` + `.body`, WHICH IS THE SHAPE EVERY OTHER SCREEN
          HAS. This one rendered `.body` as its root with the `.ph` INSIDE it,
          and the two consequences were both measured on a phone: `.ph` scrolled
          away with the panel — top 58 → −243 — so the team's name and its whole
          tab strip left the screen, on the only screen in the app where that
          happened; and with no `<main>` at all the skip link had no target and
          `.body` auto-placed into the grid rather than taking the `main` area,
          which is where the stray 12px above the header came from (y=58 against
          every peer's y=46). `.main` is `overflow:hidden` and `.body` is the
          `overflow-y:auto` child, so the header is pinned by the frame rather
          than by a `position:sticky` this file would have had to invent. */}
      <main className="main" id="main-content">
        <div className="ph ph--named">
          <div className="ph__row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              {team.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={team.logoUrl}
                  alt=""
                  className="team-logo"
                  width={40}
                  height={40}
                />
              ) : (
                <span className="team-logo-placeholder">
                  <TeamIcon size={20} />
                </span>
              )}
              <div>
                <h1 className="ph__t">{team.name}</h1>
                <div className="ph__sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {roleBadge(myRole)}
                  <span>
                    {team.activeMembers} member{team.activeMembers !== 1 ? 's' : ''} ·{' '}
                    {team.seatLimit - team.activeMembers} seat{team.seatLimit - team.activeMembers !== 1 ? 's' : ''} free
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="ph__tabs team-tabs" role="tablist" aria-label="Team sections">
            {availableTabs.map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                role="tab"
                aria-selected={tab === t}
                className="tab"
                onClick={() => setActiveTab(t)}
              >
                {TAB_LABELS[t]}
                {t === 'members' && team.pendingInvites > 0 && (
                  <span className="tab-badge">{team.pendingInvites}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="body">
        <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="team-panel">
          {tab === 'overview' && (
            <OverviewTab team={team} members={members} isOwner={isOwner} />
          )}
          {tab === 'members' && (
            <MembersTab
              team={team}
              members={members}
              isAdminOrOwner={isAdminOrOwner}
              isOwner={isOwner}
            />
          )}
          {tab === 'clients' && isAdminOrOwner && (
            <ClientsTab clients={clients} team={team} members={members} now={now} />
          )}
          {tab === 'library' && (
            <LibraryTab templates={templates} />
          )}
          {tab === 'activity' && isAdminOrOwner && (
            <ActivityTab rows={activity} />
          )}
          {tab === 'revenue' && isOwner && (
            <RevenueTab team={team} />
          )}
        </div>
        </div>
      </main>
    </>
  );
}

/* ══════════════════════════════════════════ OverviewTab ══════════ */

function OverviewTab({
  team,
  members,
  isOwner,
}: {
  team: TeamResponse;
  members: MemberResponse[];
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [deleting, startDelete] = useTransition();

  const active = members.filter((m) => m.status === 'active');
  const pending = members.filter((m) => m.status !== 'active');

  const handleDelete = () => {
    startDelete(async () => {
      const r = await deleteTeam();
      if (r.error) setDeleteError(r.error);
    });
  };

  return (
    <div className="team-grid">
      <div className="stack">
        {/* Stats row */}
        <div className="stat-row">
          <div className="stat">
            <div className="stat__k">MEMBERS</div>
            <div className="stat__v">{team.activeMembers}</div>
            <div className="stat__d">of {team.seatLimit} seats</div>
          </div>
          <div className="stat">
            <div className="stat__k">PENDING</div>
            <div className="stat__v">{team.pendingInvites}</div>
            <div className="stat__d">invitations</div>
          </div>
          <div className="stat">
            <div className="stat__k">COACHES</div>
            <div className="stat__v">
              {active.filter((m) => m.role === 'coach').length}
            </div>
            <div className="stat__d">no admin access</div>
          </div>
          <div className="stat">
            <div className="stat__k">ADMINS</div>
            <div className="stat__v">
              {active.filter((m) => m.role === 'admin').length}
            </div>
            <div className="stat__d">elevated access</div>
          </div>
        </div>

        {/* Team details card */}
        <div className="card">
          <div className="card__hd">
            <span className="card__t">Team details</span>
            {isOwner && (
              <div className="card__acts">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing((p) => !p)}
                >
                  {editing ? 'Cancel' : 'Edit'}
                </Button>
              </div>
            )}
          </div>
          <div className="card__b">
            {editing ? (
              <EditTeamForm
                team={team}
                onDone={() => setEditing(false)}
              />
            ) : (
              <dl className="kv-list">
                <div className="kv">
                  <dt className="kv__k">Name</dt>
                  <dd className="kv__v">{team.name}</dd>
                </div>
                <div className="kv">
                  <dt className="kv__k">Seat limit</dt>
                  <dd className="kv__v">{team.seatLimit}</dd>
                </div>
                <div className="kv">
                  <dt className="kv__k">Created</dt>
                  <dd className="kv__v">{new Date(team.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>

        {/* Member roster preview */}
        <Card
          title="Members"
          flush
        >
          <ul className="member-list">
            {active.map((m) => (
              <li key={m.id} className="member-row">
                <Avatar name={m.name} id={m.trainerId ?? undefined} />
                <div className="member-row__info">
                  <strong>{m.name}</strong>
                  <span className="member-row__meta">
                    {m.clientCount} client{m.clientCount !== 1 ? 's' : ''}
                  </span>
                </div>
                {roleBadge(m.role)}
              </li>
            ))}
            {pending.map((m) => (
              <li key={m.id} className="member-row member-row--pending">
                <span className="av av--pending" aria-hidden="true">
                  <Mail size={14} />
                </span>
                <div className="member-row__info">
                  <strong>{m.name || m.phone}</strong>
                  <span className="member-row__meta">Invite pending</span>
                </div>
                <span className="badge badge--pending">Pending</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Danger zone — owner only */}
      {isOwner && (
        /* `card--danger`, a real §04 variant. This said `card--danger-zone`,
           which was defined in no stylesheet at all — so the card drew like
           every other card and the only thing marking the irreversible action
           was the inline colour on the title, which is a component's job done
           by a style attribute. */
        <Card
          title="Danger zone"
          tone="danger"
          style={{ marginTop: 0 }}
        >
          {!confirmDelete ? (
            <div className="danger-row">
              <div>
                <strong>Delete team</strong>
                <p className="micro">Soft-deletes the team and all memberships. Cannot be undone.</p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                Delete team
              </Button>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: 12, fontSize: 13.5 }}>
                Are you sure? This will end the team for all {team.activeMembers} members.
              </p>
              {deleteError && <Message tone="err" icon={<Warn size={15} />} alert>{deleteError}</Message>}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function EditTeamForm({
  team,
  onDone,
}: {
  team: TeamResponse;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateTeam, {});
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) onDone();
    wasPending.current = pending;
  });

  return (
    <form action={action}>
      <div className="fld">
        <label className="fld__h" htmlFor="edit-team-name">Team name</label>
        <input
          id="edit-team-name"
          name="name"
          type="text"
          className="ctl"
          defaultValue={team.name}
          maxLength={120}
          autoFocus
        />
      </div>
      <div className="fld">
        <label className="fld__h" htmlFor="edit-logo-url">Logo URL (optional)</label>
        <input
          id="edit-logo-url"
          name="logoUrl"
          type="url"
          className="ctl"
          defaultValue={team.logoUrl ?? ''}
          placeholder="https://…"
        />
      </div>
      {state.error && <Message tone="err" icon={<Warn size={15} />} alert>{state.error}</Message>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Button variant="primary" size="sm" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

/* ══════════════════════════════════════════ MembersTab ══════════ */

function MembersTab({
  team,
  members,
  isAdminOrOwner,
  isOwner,
}: {
  team: TeamResponse;
  members: MemberResponse[];
  isAdminOrOwner: boolean;
  isOwner: boolean;
}) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    whatsappUrl?: string;
    message?: string;
  } | null>(null);

  const active = members.filter((m) => m.status === 'active');
  const pending = members.filter((m) => m.status === 'pending');
  const canSeat = team.activeMembers < team.seatLimit;

  return (
    <div className="stack">
      {isAdminOrOwner && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!showInvite && canSeat && (
            <Button
              variant="primary"
              onClick={() => { setShowInvite(true); setInviteResult(null); }}
            >
              <Plus size={15} /> Invite coach
            </Button>
          )}
          {!canSeat && (
            <p className="micro" style={{ color: 'var(--tx-warn)' }}>
              Seat limit reached ({team.seatLimit}). Remove a member first.
            </p>
          )}
        </div>
      )}

      {showInvite && (
        <Card
          title="Invite a coach"
          actions={<><Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowInvite(false); setInviteResult(null); }}
              >
                Cancel
              </Button></>}
        >
          {inviteResult ? (
            <InviteSent
              whatsappUrl={inviteResult.whatsappUrl}
              message={inviteResult.message}
              onDone={() => { setShowInvite(false); setInviteResult(null); }}
            />
          ) : (
            <InviteForm
              onSent={(r) => setInviteResult(r)}
            />
          )}
        </Card>
      )}

      {active.length > 0 && (
        <Card
          title="Active members"
          flush
        >
          <ul className="member-list">
            {active.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isAdminOrOwner={isAdminOrOwner}
                isOwner={isOwner}
                teamOwnerTrainerId={team.ownerTrainerId}
              />
            ))}
          </ul>
        </Card>
      )}

      {pending.length > 0 && (
        <Card
          title="Pending invitations"
          flush
        >
          <ul className="member-list">
            {pending.map((m) => (
              <PendingMemberRow
                key={m.id}
                member={m}
                isAdminOrOwner={isAdminOrOwner}
              />
            ))}
          </ul>
        </Card>
      )}

      {active.length === 0 && pending.length === 0 && (
        <EmptyState
          icon={<><Users /></>}
          title="No members yet"
          body="Invite coaches to join your team."
        />
      )}
    </div>
  );
}

function InviteForm({
  onSent,
}: {
  onSent: (r: { whatsappUrl?: string; message?: string }) => void;
}) {
  const [state, action, pending] = useActionState(
    async (prev: { error?: string }, form: FormData) => {
      const r = await inviteMember(prev, form);
      if (!r.error) onSent({ whatsappUrl: r.whatsappUrl, message: r.message });
      return r;
    },
    {},
  );

  return (
    <form action={action}>
      <div className="fld">
        <label className="fld__h" htmlFor="invite-phone">Phone number</label>
        <div className="affix">
          <span className="affix__pre">+91</span>
          <input
            id="invite-phone"
            name="phone"
            type="tel"
            className="ctl"
            placeholder="98765 43210"
            autoFocus
          />
        </div>
        <p className="fld__note">
          They will receive a WhatsApp invite from you.
        </p>
      </div>
      {state.error && <Message tone="err" icon={<Warn size={15} />} alert>{state.error}</Message>}
      <Button variant="primary" size="lg" type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send invite'}
      </Button>
    </form>
  );
}

function InviteSent({
  whatsappUrl,
  message,
  onDone,
}: {
  whatsappUrl?: string;
  message?: string;
  onDone: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--tx-accent-text)', fontSize: 20, lineHeight: 1 }}>✓</span>
        <div>
          <strong>Invite created</strong>
          <p className="micro" style={{ marginTop: 4 }}>
            {whatsappUrl
              ? 'Open WhatsApp to send the invitation.'
              : 'The invite is ready.'}
          </p>
        </div>
      </div>
      {message && (
        <pre
          style={{
            background: 'var(--tx-surface-2)',
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 12.5,
            whiteSpace: 'pre-wrap',
            overflowX: 'auto',
          }}
        >
          {message}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {whatsappUrl && (
          <Button
            href={whatsappUrl}
            variant="primary"
            size="sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open WhatsApp
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function MemberRow({
  member: m,
  isAdminOrOwner,
  isOwner,
  teamOwnerTrainerId,
}: {
  member: MemberResponse;
  isAdminOrOwner: boolean;
  isOwner: boolean;
  teamOwnerTrainerId: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, startBusy] = useTransition();
  const [err, setErr] = useState<string | undefined>();
  const menuRef = useRef<HTMLDivElement>(null);

  const isThisOwner = m.trainerId === teamOwnerTrainerId;
  const canEdit = isOwner || (isAdminOrOwner && !isThisOwner && m.role !== 'owner');

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const handleRoleChange = (role: string) => {
    setMenuOpen(false);
    startBusy(async () => {
      const r = await changeMemberRole(m.id, role);
      if (r.error) setErr(r.error);
    });
  };

  const handleRemove = () => {
    setConfirmRemove(false);
    startBusy(async () => {
      const r = await removeMember(m.id);
      if (r.error) setErr(r.error);
    });
  };

  return (
    <li className={`member-row${busy ? ' member-row--busy' : ''}`}>
      <Avatar name={m.name} id={m.trainerId ?? undefined} />
      <div className="member-row__info">
        <strong>{m.name}</strong>
        <span className="member-row__meta">
          {m.clientCount} client{m.clientCount !== 1 ? 's' : ''}
          {m.joinedAt && ` · joined ${relDate(m.joinedAt)}`}
        </span>
        {err && (
          <Message tone="err" icon={<Warn size={15} />} alert style={{ marginTop: 2 }}>
            {err}
          </Message>
        )}
      </div>
      {confirmRemove ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, color: 'var(--tx-ink-2)', whiteSpace: 'nowrap' }}>
            Remove {m.name.split(' ')[0]}?
          </span>
          <Button
            variant="danger"
            size="sm"
            onClick={handleRemove}
            disabled={busy}
          >
            {busy ? 'Removing…' : 'Remove'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmRemove(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <>
          {roleBadge(m.role)}
          {canEdit && (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                label="Member actions"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((p) => !p)}
                title={undefined}
                icon={<ChevronDown size={14} />}
              />
              {menuOpen && (
                <ul className="drop-menu" role="menu">
                  {m.role !== 'admin' && isAdminOrOwner && (
                    <li role="menuitem">
                      <button type="button" onClick={() => handleRoleChange('admin')}>
                        <Shield size={13} /> Make admin
                      </button>
                    </li>
                  )}
                  {m.role === 'admin' && isOwner && (
                    <li role="menuitem">
                      <button type="button" onClick={() => handleRoleChange('coach')}>
                        Demote to coach
                      </button>
                    </li>
                  )}
                  {!isThisOwner && (
                    <li role="menuitem" className="drop-menu__danger">
                      <button
                        type="button"
                        onClick={() => { setMenuOpen(false); setConfirmRemove(true); }}
                      >
                        <Trash size={13} /> Remove…
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
}

function PendingMemberRow({
  member: m,
  isAdminOrOwner,
}: {
  member: MemberResponse;
  isAdminOrOwner: boolean;
}) {
  const [busy, startBusy] = useTransition();
  const [err, setErr] = useState<string | undefined>();

  const handleRevoke = () => {
    startBusy(async () => {
      const r = await revokeInvite(m.id);
      if (r.error) setErr(r.error);
    });
  };

  return (
    <li className={`member-row member-row--pending${busy ? ' member-row--busy' : ''}`}>
      <span className="av av--pending" aria-hidden="true" style={{ flexShrink: 0 }}><Mail size={14} /></span>
      <div className="member-row__info">
        <strong>{m.phone}</strong>
        <span className="member-row__meta">
          Invite sent{m.invitedAt ? ` ${relDate(m.invitedAt)}` : ''}
        </span>
        {err && <Message tone="err" icon={<Warn size={15} />} style={{ marginTop: 2 }}>{err}</Message>}
      </div>
      <span className="badge badge--pending">Pending</span>
      {isAdminOrOwner && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          label="Revoke invite"
          onClick={handleRevoke}
          disabled={busy}
          title="Revoke invite"
          icon={<X size={14} />}
        />
      )}
    </li>
  );
}

/* ══════════════════════════════════════════ ClientsTab ══════════ */

function ClientsTab({
  clients,
  team,
  members,
  now,
}: {
  clients: CoachClients[];
  team: TeamResponse;
  members: MemberResponse[];
  now: number;
}) {
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<TeamClientRow | null>(null);

  const totalClients = clients.reduce((s, c) => s + c.clients.length, 0);

  if (totalClients === 0) {
    return (
      <EmptyState
        icon={<><Users /></>}
        title="No team clients"
        body="Clients will appear here as coaches add them."
      />
    );
  }

  return (
    <div className="stack">
      <p className="micro" style={{ color: 'var(--tx-ink-3)' }}>
        {totalClients} client{totalClients !== 1 ? 's' : ''} across {clients.length} coach{clients.length !== 1 ? 'es' : ''}
      </p>

      {reassigning && (
        <Card
          title={<>Reassign {reassigning.name}</>}
          actions={<><Button variant="ghost" size="sm" onClick={() => setReassigning(null)}>
                Cancel
              </Button></>}
        >
          <ReassignForm
            client={reassigning}
            members={members.filter((m) => m.status === 'active' && m.trainerId !== reassigning.coachTrainerId)}
            onDone={() => setReassigning(null)}
          />
        </Card>
      )}

      {clients.map((group) => {
        const expanded = expandedCoach === group.trainerId;
        return (
          <Card key={group.trainerId}>
            <button
              type="button"
              className="card__hd card__hd--btn"
              aria-expanded={expanded}
              onClick={() => setExpandedCoach(expanded ? null : group.trainerId)}
            >
              <Avatar name={group.coachName} id={group.trainerId} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <span className="card__t">{group.coachName}</span>
                <span className="micro" style={{ color: 'var(--tx-ink-3)', marginLeft: 8 }}>
                  {roleBadge(group.role)}
                </span>
              </div>
              <span className="micro" style={{ color: 'var(--tx-ink-3)' }}>
                {group.clients.length} client{group.clients.length !== 1 ? 's' : ''}
              </span>
              <span style={{ display: 'inline-flex', transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 180ms' }}>
                <ChevronDown size={14} />
              </span>
            </button>
            {expanded && (
              <Card.Body flush>
                <Table
                  caption={`${group.coachName}'s clients`}
                  columns={[
                    { key: 'client', label: 'Client' },
                    { key: 'status', label: 'Status' },
                    { key: 'program', label: 'Program', className: 'tbl-col--hide-mobile' },
                    { key: 'last', label: 'Last session', numeric: true, className: 'tbl-col--hide-mobile' },
                    { key: 'act', label: '' },
                  ]}
                >
                  {group.clients.map((c) => (
                    <Row
                      key={c.id}
                      cells={[
                        {
                          key: 'client',
                          content: (
                            <div className="who">
                              <Avatar name={c.name} id={c.id} size="sm" />
                              <b>{c.name}</b>
                            </div>
                          ),
                        },
                        {
                          key: 'status',
                          content: (
                            <span className={`chip chip--sm${c.status === 'active' ? ' chip--active-status' : ''}`}>
                              {c.status}
                            </span>
                          ),
                        },
                        {
                          key: 'program',
                          className: 'tbl-col--hide-mobile',
                          style: { color: c.hasActiveProgram ? 'var(--tx-ink-2)' : 'var(--tx-ink-3)' },
                          content: c.hasActiveProgram ? '● Active' : '○ None',
                        },
                        {
                          key: 'last',
                          className: 'tbl-col--hide-mobile',
                          numeric: true,
                          style: { color: 'var(--tx-ink-3)' },
                          content: c.lastSessionAt ? relDate(c.lastSessionAt) : '—',
                        },
                        {
                          key: 'act',
                          content: (
                            <Button variant="ghost" size="sm" onClick={() => setReassigning(c)}>
                              <Arrow size={13} /> Reassign
                            </Button>
                          ),
                        },
                      ]}
                    />
                  ))}
                </Table>
              </Card.Body>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ReassignForm({
  client,
  members,
  onDone,
}: {
  client: TeamClientRow;
  members: MemberResponse[];
  onDone: () => void;
}) {
  const [selectedCoach, setSelectedCoach] = useState('');
  const [reason, setReason] = useState('');
  const [busy, startBusy] = useTransition();
  const [err, setErr] = useState<string | undefined>();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoach) { setErr('Select a coach.'); return; }
    startBusy(async () => {
      const r = await reassignClient(client.id, selectedCoach, reason);
      if (r.error) setErr(r.error);
      else onDone();
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p className="micro" style={{ marginBottom: 12 }}>
        Moving <strong>{client.name}</strong> from <strong>{client.coachName}</strong>.
        History stays with the current coach; plan follows the client.
      </p>
      <div className="fld">
        <label className="fld__h" htmlFor="reassign-coach">New coach</label>
        <select
          id="reassign-coach"
          className="ctl"
          value={selectedCoach}
          onChange={(e) => setSelectedCoach(e.target.value)}
          required
        >
          <option value="">Select a coach…</option>
          {members.map((m) => m.trainerId && (
            <option key={m.id} value={m.trainerId}>
              {m.name} ({m.clientCount} clients)
            </option>
          ))}
        </select>
      </div>
      <div className="fld">
        <label className="fld__h" htmlFor="reassign-reason">Reason (optional)</label>
        <input
          id="reassign-reason"
          type="text"
          className="ctl"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Schedule conflict, specialty match…"
          maxLength={500}
        />
      </div>
      {err && <Message tone="err" icon={<Warn size={15} />} alert>{err}</Message>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Button variant="primary" size="sm" type="submit" disabled={busy}>
          {busy ? 'Moving…' : 'Reassign'}
        </Button>
      </div>
    </form>
  );
}

/* ══════════════════════════════════════════ LibraryTab ══════════ */

function LibraryTab({ templates }: { templates: TeamTemplateRow[] }) {
  const [copying, setCopying] = useState<string | null>(null);
  const [err, setErr] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [, startCopy] = useTransition();
  const { show } = useToast();

  const filtered = templates.filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.goal ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (t.ownerName ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleCopy = (id: string) => {
    setCopying(id);
    startCopy(async () => {
      const r = await copyTemplate(id);
      if (r.error) setErr(r.error);
      else {
        setErr(undefined);
        /* THE COPY LANDS ON ANOTHER SCREEN. It goes onto the trainer's own
           shelf under `/programs`, and this row — a teammate's template — is
           unchanged by it, so there is nothing here for the write to be
           answered on. Before this the button simply stopped saying *Copying…*
           and a trainer had no way to tell a copy from a click that missed. */
        const row = templates.find(t => t.id === id);
        show({
          tone: 'ok',
          title: <>Copied to your programs</>,
          body: (
            <>
              {row?.name ?? 'The template'}
              {row?.ownerName ? <> &mdash; {row.ownerName}&rsquo;s copy is untouched.</> : null}
            </>
          ),
        });
      }
      setCopying(null);
    });
  };

  if (templates.length === 0) {
    return (
      <div className="empty">
        <div className="empty__ic"><Dumbbell /></div>
        <p className="empty__t">No shared templates</p>
        <p className="empty__b">Team members&rsquo; program templates appear here once they join.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="fld" style={{ margin: 0 }}>
        <input
          type="search"
          className="ctl"
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search templates"
        />
      </div>
      {err && <Message tone="err" icon={<Warn size={15} />} alert>{err}</Message>}
      {filtered.length === 0 ? (
        <p className="micro" style={{ color: 'var(--tx-ink-3)' }}>No results for &ldquo;{search}&rdquo;</p>
      ) : (
        <Card flush>
          <Table
            caption="Program templates shared with the team"
            columns={[
              { key: 'template', label: 'Template' },
              { key: 'goal', label: 'Goal', className: 'tbl-col--hide-mobile' },
              { key: 'days', label: 'Days', numeric: true },
              { key: 'owner', label: 'Owner' },
              { key: 'act', label: '' },
            ]}
          >
            {filtered.map((t) => (
              <Row
                key={t.id}
                cells={[
                  {
                    key: 'template',
                    content: (
                      <>
                        <span className="strong">{t.name}</span>
                        {t.mine && <Chip className="chip--sm" style={{ marginLeft: 6 }}>Mine</Chip>}
                      </>
                    ),
                  },
                  {
                    key: 'goal',
                    className: 'tbl-col--hide-mobile',
                    style: { color: 'var(--tx-ink-3)' },
                    content: t.goal ?? '—',
                  },
                  { key: 'days', content: t.dayCount, numeric: true },
                  {
                    key: 'owner',
                    content: (
                      <div className="who">
                        <Avatar name={t.ownerName ?? ''} id={t.ownerTrainerId} size="sm" />
                        <span>{t.ownerName}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'act',
                    content: !t.mine && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopy(t.id)}
                        disabled={copying === t.id}
                        title="Copy to my library"
                      >
                        <Copy size={13} />
                        {copying === t.id ? ' Copying…' : ' Copy'}
                      </Button>
                    ),
                  },
                ]}
              />
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════ ActivityTab ══════════ */

function ActivityTab({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<><TeamIcon /></>}
        title="No activity yet"
        body="Plan edits and reassignments made by admins will appear here."
      />
    );
  }

  const ACTION_LABELS: Record<string, string> = {
    ADD_EXERCISE: 'Added exercise',
    UPDATE_EXERCISE: 'Updated exercise',
    REMOVE_EXERCISE: 'Removed exercise',
    UPDATE_PROGRAM: 'Updated program',
    REASSIGN: 'Reassigned client',
  };

  return (
    <Card flush>
      <ul className="activity-list">
        {rows.map((r) => (
          <li key={r.id} className="activity-row">
            <Avatar name={r.adminName} />
            <div className="activity-row__body">
              <p className="activity-row__text">
                <strong>{r.adminName}</strong>{' '}
                <span style={{ color: 'var(--tx-ink-3)' }}>
                  {ACTION_LABELS[r.action] ?? r.action}
                </span>{' '}
                {r.detail && <em style={{ color: 'var(--tx-ink-2)' }}>{r.detail}</em>}{' '}
                on <strong>{r.clientName}</strong>
                {r.coachName && ` (coach: ${r.coachName})`}
              </p>
              <time className="micro" style={{ color: 'var(--tx-ink-3)' }}>
                {relDate(r.at)}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ══════════════════════════════════════════ RevenueTab ══════════ */

function RevenueTab({ team: _team }: { team: TeamResponse }) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultFrom = firstOfMonth.toISOString().slice(0, 10);
  const defaultTo = today.toISOString().slice(0, 10);

  const [state, action, pending] = useActionState(loadRevenue, {});
  const data = state.data;

  return (
    <div className="stack">
      <Card
        title="Revenue report"
        aside={<><span className="micro" style={{ marginLeft: 'auto' }}>Owner only</span></>}
      >
        <form action={action}>
          <div className="date-range-row">
            <div className="fld" style={{ margin: 0 }}>
              <label className="fld__h" htmlFor="rev-from">From</label>
              <input
                id="rev-from"
                name="from"
                type="date"
                className="ctl"
                defaultValue={defaultFrom}
              />
            </div>
            <div className="fld" style={{ margin: 0 }}>
              <label className="fld__h" htmlFor="rev-to">To</label>
              <input
                id="rev-to"
                name="to"
                type="date"
                className="ctl"
                defaultValue={defaultTo}
              />
            </div>
            <Button variant="primary" type="submit" disabled={pending}>
              {pending ? 'Loading…' : 'Load'}
            </Button>
          </div>
          {state.error && (
            <Message tone="err" icon={<Warn size={15} />} alert style={{ marginTop: 12 }}>
              {state.error}
            </Message>
          )}
        </form>
      </Card>

      {data && (
        <>
          <div className="stat-row">
            <div className="stat stat--acc">
              <div className="stat__k">TEAM TOTAL</div>
              <div className="stat__v">{toRs(data.teamCollected)}</div>
              <div className="stat__d">collected</div>
            </div>
            <div className="stat">
              <div className="stat__k">GYM SHARE</div>
              <div className="stat__v">{toRs(data.teamGymShare)}</div>
              <div className="stat__d">gym&rsquo;s cut</div>
            </div>
            <div className="stat stat--acc">
              <div className="stat__k">NET</div>
              <div className="stat__v">
                {toRs((data.teamCollected || 0) - (data.teamGymShare || 0))}
              </div>
              <div className="stat__d">coaches keep</div>
            </div>
          </div>

          <Card
            title="By coach"
            flush
          >
            <table className="tbl" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Coach</th>
                  <th className="num">Collected</th>
                  <th className="num tbl-col--hide-mobile">Gym share</th>
                  <th className="num tbl-col--hide-mobile">Payments</th>
                  <th className="num">Clients</th>
                </tr>
              </thead>
              <tbody>
                {data.coaches.map((c) => (
                  <tr key={c.trainerId}>
                    <td>
                      <div className="who">
                        <Avatar name={c.coachName} id={c.trainerId} size="sm" />
                        <b>{c.coachName}</b>
                        <span style={{ marginLeft: 4 }}>{roleBadge(c.role)}</span>
                      </div>
                    </td>
                    <td className="num strong">{toRs(c.collected)}</td>
                    <td className="num tbl-col--hide-mobile" style={{ color: 'var(--tx-ink-3)' }}>
                      {toRs(c.gymShare)}
                    </td>
                    <td className="num tbl-col--hide-mobile">{c.payments}</td>
                    <td className="num">{c.payingClients}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="num strong">{toRs(data.teamCollected)}</td>
                  <td className="num tbl-col--hide-mobile strong">{toRs(data.teamGymShare)}</td>
                  <td className="num tbl-col--hide-mobile strong">
                    {data.coaches.reduce((s, c) => s + c.payments, 0)}
                  </td>
                  <td className="num strong">
                    {data.coaches.reduce((s, c) => s + c.payingClients, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

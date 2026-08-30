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

function avatarColor(name: string): string {
  if (!name) return 'var(--tx-av-1)';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `var(--tx-av-${(h % 12) + 1})`;
}

function Avatar({ name, size = 32 }: { name: string | null | undefined; size?: number }) {
  const safe = name ?? '';
  const initials = safe
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
  return (
    <span
      className={`av${size <= 24 ? ' av--sm' : size >= 48 ? ' av--lg' : ''}`}
      style={{ background: avatarColor(safe), color: '#fff', flexShrink: 0 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

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
    return <NoTeam invitations={props.invitations} />;
  }
  return <TeamDashboard {...props} team={props.team} />;
}

/* ═══════════════════════════════════════════════════ NoTeam ══════ */

function NoTeam({ invitations }: { invitations: InvitationResponse[] }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <TopBar crumb="Team" onSearch={() => {}} />
      <div className="body">
        <div className="ph">
          <div className="ph__row">
            <div>
              <h1 className="ph__t">Team</h1>
              <p className="ph__sub">Coach together, grow together</p>
            </div>
          </div>
        </div>

        {invitations.length > 0 && (
          <section aria-label="Pending invitations">
            <h2 className="section-label">Pending invitations</h2>
            <div className="stack">
              {invitations.map((inv) => (
                <InvitationCard key={inv.id} invitation={inv} />
              ))}
            </div>
          </section>
        )}

        {!showCreate ? (
          <div className="empty" style={{ minHeight: '40vh' }}>
            <div className="empty__ic">
              <TeamIcon />
            </div>
            <p className="empty__t">No team yet</p>
            <p className="empty__b">
              Create a team to coach clients together with other trainers, share programs, and
              track revenue as a group.
            </p>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={16} /> Create a team
            </button>
          </div>
        ) : (
          <div className="card team-create-card">
            <div className="card__hd">
              <span className="card__t">Create your team</span>
              <div className="card__acts">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="card__b">
              <CreateTeamForm onDone={() => setShowCreate(false)} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function InvitationCard({ invitation: inv }: { invitation: InvitationResponse }) {
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

  const daysLeft = Math.max(0, Math.ceil((inv.expiresAt - Date.now()) / 86_400_000));

  return (
    <div className="card inv-card">
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
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleAccept}
            disabled={accepting || declining}
          >
            {accepting ? 'Joining…' : 'Accept'}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleDecline}
            disabled={accepting || declining}
          >
            {declining ? 'Declining…' : 'Decline'}
          </button>
        </div>
      </div>
      {error && <p className="form-err" role="alert">{error}</p>}
    </div>
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
      {state.error && <p className="form-err" role="alert">{state.error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="submit"
          className="btn btn--primary btn--lg"
          disabled={pending}
        >
          {pending ? 'Creating…' : 'Create team'}
        </button>
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
      <TopBar crumb="Team" onSearch={() => {}} />
      <div className="body">
        <div className="ph">
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
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setEditing((p) => !p)}
                >
                  {editing ? 'Cancel' : 'Edit'}
                </button>
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
        <div className="card">
          <div className="card__hd">
            <span className="card__t">Members</span>
          </div>
          <div className="card__b card__b--flush">
            <ul className="member-list">
              {active.map((m) => (
                <li key={m.id} className="member-row">
                  <Avatar name={m.name} size={32} />
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
          </div>
        </div>
      </div>

      {/* Danger zone — owner only */}
      {isOwner && (
        <div className="card card--danger-zone" style={{ marginTop: 0 }}>
          <div className="card__hd">
            <span className="card__t" style={{ color: 'var(--tx-danger)' }}>
              Danger zone
            </span>
          </div>
          <div className="card__b">
            {!confirmDelete ? (
              <div className="danger-row">
                <div>
                  <strong>Delete team</strong>
                  <p className="micro">Soft-deletes the team and all memberships. Cannot be undone.</p>
                </div>
                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete team
                </button>
              </div>
            ) : (
              <div>
                <p style={{ marginBottom: 12, fontSize: 13.5 }}>
                  Are you sure? This will end the team for all {team.activeMembers} members.
                </p>
                {deleteError && <p className="form-err" role="alert">{deleteError}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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
      {state.error && <p className="form-err" role="alert">{state.error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="submit" className="btn btn--primary btn--sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
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
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => { setShowInvite(true); setInviteResult(null); }}
            >
              <Plus size={15} /> Invite coach
            </button>
          )}
          {!canSeat && (
            <p className="micro" style={{ color: 'var(--tx-warn)' }}>
              Seat limit reached ({team.seatLimit}). Remove a member first.
            </p>
          )}
        </div>
      )}

      {showInvite && (
        <div className="card">
          <div className="card__hd">
            <span className="card__t">Invite a coach</span>
            <div className="card__acts">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => { setShowInvite(false); setInviteResult(null); }}
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="card__b">
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
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="card">
          <div className="card__hd">
            <span className="card__t">Active members</span>
          </div>
          <div className="card__b card__b--flush">
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
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="card">
          <div className="card__hd">
            <span className="card__t">Pending invitations</span>
          </div>
          <div className="card__b card__b--flush">
            <ul className="member-list">
              {pending.map((m) => (
                <PendingMemberRow
                  key={m.id}
                  member={m}
                  isAdminOrOwner={isAdminOrOwner}
                />
              ))}
            </ul>
          </div>
        </div>
      )}

      {active.length === 0 && pending.length === 0 && (
        <div className="empty">
          <div className="empty__ic"><Users /></div>
          <p className="empty__t">No members yet</p>
          <p className="empty__b">Invite coaches to join your team.</p>
        </div>
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
      {state.error && <p className="form-err" role="alert">{state.error}</p>}
      <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
        {pending ? 'Sending…' : 'Send invite'}
      </button>
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
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--primary btn--sm"
          >
            Open WhatsApp
          </a>
        )}
        <button type="button" className="btn btn--secondary btn--sm" onClick={onDone}>
          Done
        </button>
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
      <Avatar name={m.name} size={32} />
      <div className="member-row__info">
        <strong>{m.name}</strong>
        <span className="member-row__meta">
          {m.clientCount} client{m.clientCount !== 1 ? 's' : ''}
          {m.joinedAt && ` · joined ${relDate(m.joinedAt)}`}
        </span>
        {err && (
          <span className="form-err" style={{ display: 'block', marginTop: 2 }} role="alert">
            {err}
          </span>
        )}
      </div>
      {confirmRemove ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, color: 'var(--tx-ink-2)', whiteSpace: 'nowrap' }}>
            Remove {m.name.split(' ')[0]}?
          </span>
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={handleRemove}
            disabled={busy}
          >
            {busy ? 'Removing…' : 'Remove'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setConfirmRemove(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          {roleBadge(m.role)}
          {canEdit && (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                aria-label="Member actions"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((p) => !p)}
              >
                <ChevronDown size={14} />
              </button>
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
        {err && <span className="form-err" style={{ display: 'block', marginTop: 2 }}>{err}</span>}
      </div>
      <span className="badge badge--pending">Pending</span>
      {isAdminOrOwner && (
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm"
          aria-label="Revoke invite"
          onClick={handleRevoke}
          disabled={busy}
          title="Revoke invite"
        >
          <X size={14} />
        </button>
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
      <div className="empty">
        <div className="empty__ic"><Users /></div>
        <p className="empty__t">No team clients</p>
        <p className="empty__b">Clients will appear here as coaches add them.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="micro" style={{ color: 'var(--tx-ink-3)' }}>
        {totalClients} client{totalClients !== 1 ? 's' : ''} across {clients.length} coach{clients.length !== 1 ? 'es' : ''}
      </p>

      {reassigning && (
        <div className="card">
          <div className="card__hd">
            <span className="card__t">Reassign {reassigning.name}</span>
            <div className="card__acts">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReassigning(null)}>
                Cancel
              </button>
            </div>
          </div>
          <div className="card__b">
            <ReassignForm
              client={reassigning}
              members={members.filter((m) => m.status === 'active' && m.trainerId !== reassigning.coachTrainerId)}
              onDone={() => setReassigning(null)}
            />
          </div>
        </div>
      )}

      {clients.map((group) => {
        const expanded = expandedCoach === group.trainerId;
        return (
          <div key={group.trainerId} className="card">
            <button
              type="button"
              className="card__hd card__hd--btn"
              aria-expanded={expanded}
              onClick={() => setExpandedCoach(expanded ? null : group.trainerId)}
            >
              <Avatar name={group.coachName} size={32} />
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
              <div className="card__b card__b--flush">
                <table className="tbl" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Status</th>
                      <th className="tbl-col--hide-mobile">Program</th>
                      <th className="tbl-col--hide-mobile num">Last session</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.clients.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="who">
                            <Avatar name={c.name} size={24} />
                            <b>{c.name}</b>
                          </div>
                        </td>
                        <td>
                          <span className={`chip chip--sm${c.status === 'active' ? ' chip--active-status' : ''}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="tbl-col--hide-mobile" style={{ color: c.hasActiveProgram ? 'var(--tx-ink-2)' : 'var(--tx-ink-3)' }}>
                          {c.hasActiveProgram ? '● Active' : '○ None'}
                        </td>
                        <td className="tbl-col--hide-mobile num" style={{ color: 'var(--tx-ink-3)' }}>
                          {c.lastSessionAt ? relDate(c.lastSessionAt) : '—'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setReassigning(c)}
                          >
                            <Arrow size={13} /> Reassign
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
      {err && <p className="form-err" role="alert">{err}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
          {busy ? 'Moving…' : 'Reassign'}
        </button>
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
      else setErr(undefined);
      setCopying(null);
    });
  };

  if (templates.length === 0) {
    return (
      <div className="empty">
        <div className="empty__ic"><Dumbbell /></div>
        <p className="empty__t">No shared templates</p>
        <p className="empty__b">Team members' program templates appear here once they join.</p>
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
      {err && <p className="form-err" role="alert">{err}</p>}
      {filtered.length === 0 ? (
        <p className="micro" style={{ color: 'var(--tx-ink-3)' }}>No results for "{search}"</p>
      ) : (
        <div className="card">
          <div className="card__b card__b--flush">
            <table className="tbl" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Template</th>
                  <th className="tbl-col--hide-mobile">Goal</th>
                  <th className="num">Days</th>
                  <th>Owner</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="strong">{t.name}</span>
                      {t.mine && <span className="chip chip--sm" style={{ marginLeft: 6 }}>Mine</span>}
                    </td>
                    <td className="tbl-col--hide-mobile" style={{ color: 'var(--tx-ink-3)' }}>
                      {t.goal ?? '—'}
                    </td>
                    <td className="num">{t.dayCount}</td>
                    <td>
                      <div className="who">
                        <Avatar name={t.ownerName} size={20} />
                        <span>{t.ownerName}</span>
                      </div>
                    </td>
                    <td>
                      {!t.mine && (
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => handleCopy(t.id)}
                          disabled={copying === t.id}
                          title="Copy to my library"
                        >
                          <Copy size={13} />
                          {copying === t.id ? ' Copying…' : ' Copy'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════ ActivityTab ══════════ */

function ActivityTab({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <div className="empty__ic"><TeamIcon /></div>
        <p className="empty__t">No activity yet</p>
        <p className="empty__b">Plan edits and reassignments made by admins will appear here.</p>
      </div>
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
    <div className="card">
      <div className="card__b card__b--flush">
        <ul className="activity-list">
          {rows.map((r) => (
            <li key={r.id} className="activity-row">
              <Avatar name={r.adminName} size={28} />
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
      </div>
    </div>
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
      <div className="card">
        <div className="card__hd">
          <span className="card__t">Revenue report</span>
          <span className="micro" style={{ marginLeft: 'auto' }}>Owner only</span>
        </div>
        <div className="card__b">
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
              <button type="submit" className="btn btn--primary" disabled={pending}>
                {pending ? 'Loading…' : 'Load'}
              </button>
            </div>
            {state.error && (
              <p className="form-err" style={{ marginTop: 12 }} role="alert">
                {state.error}
              </p>
            )}
          </form>
        </div>
      </div>

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
              <div className="stat__d">gym's cut</div>
            </div>
            <div className="stat stat--acc">
              <div className="stat__k">NET</div>
              <div className="stat__v">
                {toRs((data.teamCollected || 0) - (data.teamGymShare || 0))}
              </div>
              <div className="stat__d">coaches keep</div>
            </div>
          </div>

          <div className="card">
            <div className="card__hd">
              <span className="card__t">By coach</span>
            </div>
            <div className="card__b card__b--flush">
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
                          <Avatar name={c.coachName} size={24} />
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}

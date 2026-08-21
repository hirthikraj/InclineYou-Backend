/**
 * The coaching team, derived.
 *
 * Pure, like `home/deck` and `clients/roster`: rows and `now` come in as
 * arguments, a view model goes out, and nothing here reads the database or the
 * clock. That is what makes the Team screen re-renderable straight from a
 * WatermelonDB observable and checkable by reading it.
 *
 * ── What this file is really for ──────────────────────────────────────────
 *
 * `capabilities()` is the app's copy of the backend's `TeamScope`, and it exists
 * so that **a button is never offered for an action the server will refuse.**
 * There is no way to have one copy of that rule — the server must enforce it and
 * the app must draw it — so the honest thing is to put the app's copy in exactly
 * one place, next to the sentence that says which backend class it mirrors. If
 * `TeamScope` changes, this changes, and there is one file to change.
 *
 * The rules, in the order they are surprising:
 *
 *   · an **owner** is not a fourth kind of admin — it is the admin who cannot be
 *     removed, and that single difference generates the rest;
 *   · an **admin may promote a coach but not touch another admin.** Two admins
 *     able to demote each other in a race means the loser loses sight of their
 *     clients mid-session, and escalating that to the owner costs one message;
 *   · a **coach** in a team is not widened at all. They see the coach list and
 *     the shared exercise pool. They do not see a colleague's clients, and
 *     **nobody, at any role, ever sees a colleague's money book.**
 */

import { dayStamp } from '../home/time';

export const TEAM_ROLE_OWNER = 'owner';
export const TEAM_ROLE_ADMIN = 'admin';
export const TEAM_ROLE_COACH = 'coach';

export const TEAM_STATUS_INVITED = 'invited';
export const TEAM_STATUS_ACTIVE = 'active';

/**
 * Mirrors `app.team.enabled` on the backend.
 *
 * On, unlike the other flags in this app, because the backend ships it on and
 * the feature is complete on this side. It stays a constant rather than becoming
 * a preference because the backend is the authority: with `TEAM_ENABLED=false`
 * server-side every endpoint 404s, `fetchTeam` reports "no team", and the drawer
 * entry hides itself — so the app degrades correctly without this flag being
 * touched. This is here for the reverse case: switching the entry point off in
 * a build whose backend still has it on.
 */
export const TEAM_ENABLED = true;

/* -------------------------------------------------------------------- input */

/** A `team_members` row, flattened. */
export interface TeamMemberRow {
  id: string;
  trainerId: string | null;
  invitedPhone: string | null;
  name: string | null;
  role: string;
  status: string;
  clientCount: number | null;
  invitedAt: number | null;
  joinedAt: number | null;
}

export interface TeamRow {
  id: string;
  name: string;
  ownerTrainerId: string;
  seatLimit: number | null;
}

export interface TeamInput {
  team: TeamRow | null;
  members: TeamMemberRow[];
  /** The signed-in trainer, so "you" can be marked and capabilities resolved. */
  meTrainerId: string | null;
}

export const EMPTY_TEAM_INPUT: TeamInput = { team: null, members: [], meTrainerId: null };

/* ------------------------------------------------------------- capabilities */

/**
 * What the signed-in trainer may do, given their role.
 *
 * Every field is a question a screen actually asks. `canInvite` gates a button;
 * `canManage(member)` gates a whole sheet; `canSeeTeamClients` is Phase 2 and is
 * here now so the screen can say what the role means rather than only what it
 * unlocks today.
 */
export interface TeamCapabilities {
  inTeam: boolean;
  role: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  canInvite: boolean;
  canEditTeam: boolean;
  canDeleteTeam: boolean;
  /** Phase 2 — read a teammate's clients. Never their money, at any role. */
  canSeeTeamClients: boolean;
  canLeave: boolean;
}

export function capabilities(input: TeamInput): TeamCapabilities {
  const me = myMembership(input);
  const role = me?.role ?? null;
  const isOwner = role === TEAM_ROLE_OWNER;
  const isAdmin = isOwner || role === TEAM_ROLE_ADMIN;

  return {
    inTeam: me !== null,
    role,
    isOwner,
    isAdmin,
    canInvite: isAdmin,
    canEditTeam: isOwner,
    canDeleteTeam: isOwner,
    canSeeTeamClients: isAdmin,
    // The owner cannot leave without handing over first — the server says so
    // too, and a button that always fails is not a button.
    canLeave: me !== null && !isOwner,
  };
}

/** What the caller may do to one particular member. */
export interface MemberActions {
  canPromote: boolean;
  canDemote: boolean;
  canRemove: boolean;
  canRevokeInvite: boolean;
  canMakeOwner: boolean;
}

export function memberActions(input: TeamInput, member: TeamMemberRow): MemberActions {
  const caps = capabilities(input);
  const isMe = member.trainerId !== null && member.trainerId === input.meTrainerId;
  const targetIsOwner = member.role === TEAM_ROLE_OWNER;
  const targetIsAdmin = member.role === TEAM_ROLE_ADMIN;
  const pending = member.status === TEAM_STATUS_INVITED;

  // An admin outranks a coach and nobody else. The owner is untouchable by
  // anyone including themselves — their role moves by transfer, not by edit.
  const mayTouch = caps.isAdmin && !targetIsOwner && !isMe && (!targetIsAdmin || caps.isOwner);

  return {
    canPromote: mayTouch && !pending && member.role === TEAM_ROLE_COACH,
    canDemote: mayTouch && !pending && targetIsAdmin,
    canRemove: mayTouch && !pending,
    canRevokeInvite: caps.isAdmin && pending,
    canMakeOwner: caps.isOwner && !isMe && !pending && member.status === TEAM_STATUS_ACTIVE,
  };
}

/* --------------------------------------------------------------- the screen */

export interface TeamMemberCard extends TeamMemberRow {
  /** The label under the name: their clients, or that the invite is waiting. */
  meta: string;
  /** "Owner" | "Admin" | "Coach", or "Invited" while pending. */
  badge: string;
  /** Pending invites are drawn quieter — they are not colleagues yet. */
  pending: boolean;
  isMe: boolean;
  /** What the name field should show when there is no name: the number. */
  display: string;
}

export interface TeamSection {
  key: string;
  /** Absent for the first section: a heading over the owner says nothing. */
  label: string | null;
  members: TeamMemberCard[];
}

export interface TeamView {
  /** True when there is no team — the screen draws its pitch instead. */
  empty: boolean;
  name: string;
  /** "You're the owner · 3 coaches" — the AppBar subtitle. */
  subtitle: string;
  /**
   * "3 of 5 seats used", or null when the team has no limit. Null is the common
   * case for a self-hosted deployment and must not draw an empty meter.
   */
  seats: string | null;
  /** True when the next accept will be refused. Drawn before it happens. */
  seatsFull: boolean;
  sections: TeamSection[];
  activeCount: number;
  pendingCount: number;
  caps: TeamCapabilities;
}

const EMPTY_VIEW: TeamView = {
  empty: true,
  name: '',
  subtitle: '',
  seats: null,
  seatsFull: false,
  sections: [],
  activeCount: 0,
  pendingCount: 0,
  caps: {
    inTeam: false,
    role: null,
    isOwner: false,
    isAdmin: false,
    canInvite: false,
    canEditTeam: false,
    canDeleteTeam: false,
    canSeeTeamClients: false,
    canLeave: false,
  },
};

export function buildTeam(input: TeamInput): TeamView {
  if (!input.team || !myMembership(input)) return EMPTY_VIEW;

  const caps = capabilities(input);
  const active = activeMembers(input);
  const pending = input.members.filter((m) => m.status === TEAM_STATUS_INVITED);

  const card = (m: TeamMemberRow): TeamMemberCard => {
    const isMe = m.trainerId !== null && m.trainerId === input.meTrainerId;
    const isPending = m.status === TEAM_STATUS_INVITED;
    return {
      ...m,
      isMe,
      pending: isPending,
      badge: isPending ? 'Invited' : roleLabel(m.role),
      // A pending invite has no roster to count, and an unbound one has no name
      // either — the number is the whole of what we know, and saying so is
      // better than inventing "Pending coach".
      meta: isPending
        ? 'Waiting for them to accept'
        : clientLine(m.clientCount, isMe, m.joinedAt),
      // Name if we have one; otherwise the number, which for an unbound invite
      // is genuinely all anybody knows. The last fallback distinguishes the two
      // states rather than calling an active colleague "invited".
      display: m.name?.trim() || m.invitedPhone || (isPending ? 'Invited coach' : 'Coach'),
    };
  };

  const owners = active.filter((m) => m.role === TEAM_ROLE_OWNER).map(card);
  const admins = active.filter((m) => m.role === TEAM_ROLE_ADMIN).map(card);
  const coaches = active.filter((m) => m.role === TEAM_ROLE_COACH).map(card);

  const sections: TeamSection[] = [];
  // The owner leads with no heading — a section label over a single row that
  // already carries an "Owner" badge is the same word twice.
  if (owners.length > 0) sections.push({ key: 'owner', label: null, members: owners });
  if (admins.length > 0) {
    sections.push({ key: 'admins', label: admins.length === 1 ? 'Admin' : 'Admins', members: admins });
  }
  if (coaches.length > 0) {
    sections.push({ key: 'coaches', label: coaches.length === 1 ? 'Coach' : 'Coaches', members: coaches });
  }
  if (pending.length > 0) {
    sections.push({ key: 'pending', label: 'Invited', members: pending.map(card) });
  }

  const limit = input.team.seatLimit;

  return {
    empty: false,
    name: input.team.name,
    subtitle: subtitleFor(caps.role, active.length),
    seats: limit == null ? null : `${active.length} of ${limit} seats used`,
    seatsFull: limit != null && active.length >= limit,
    sections,
    activeCount: active.length,
    pendingCount: pending.length,
    caps,
  };
}

/* ---------------------------------------------------------------- sentences */

export function roleLabel(role: string | null): string {
  switch (role) {
    case TEAM_ROLE_OWNER:
      return 'Owner';
    case TEAM_ROLE_ADMIN:
      return 'Admin';
    case TEAM_ROLE_COACH:
      return 'Coach';
    default:
      return '';
  }
}

/**
 * What a role actually means, in one line, for the screen that grants it.
 *
 * Written from the coach's side rather than the admin's, because the person who
 * needs to understand a role is usually the person about to be given it — and
 * the honest half is the one about their clients being visible.
 */
export function roleExplainer(role: string): string {
  switch (role) {
    case TEAM_ROLE_OWNER:
      return 'Runs the team. Can invite, remove and promote coaches, and see every coach’s clients.';
    case TEAM_ROLE_ADMIN:
      return 'Can invite and remove coaches, and see the team’s clients. Never sees anyone’s money.';
    default:
      return 'Keeps their own clients and money. Shares the team’s exercises and programs.';
  }
}

function subtitleFor(role: string | null, activeCount: number): string {
  const who = role === TEAM_ROLE_OWNER ? 'You own this team' : `You’re ${article(role)}`;
  const coaches = activeCount === 1 ? 'just you so far' : `${activeCount} coaches`;
  return `${who} · ${coaches}`;
}

function article(role: string | null): string {
  return role === TEAM_ROLE_ADMIN ? 'an admin' : 'a coach';
}

/**
 * The line under a coach's name.
 *
 * A teammate's client count is not in this phone's database — only the signed-in
 * trainer's own clients are — so it arrives from `/v1/team/members` a moment
 * after the list has already drawn from local rows. Which means this has to read
 * well *twice*: once without the number and once with it.
 *
 * The fallback is the join date rather than a blank or a shimmer. Both are one
 * line of the same height, so nothing moves when the count lands; both are true;
 * and offline, where the count will never arrive, "Joined 12 Jun" is still worth
 * reading, which is more than an empty row or a spinner that never resolves can
 * say for itself.
 */
function clientLine(count: number | null, isMe: boolean, joinedAt: number | null): string {
  if (count != null) {
    const clients = count === 1 ? '1 client' : `${count} clients`;
    return isMe ? `You · ${clients}` : clients;
  }
  const joined = joinedAt ? `Joined ${dayStamp(joinedAt).split(' · ')[1]}` : '';
  if (isMe) return joined ? `You · ${joined}` : 'You';
  return joined;
}

/* ------------------------------------------------------------------ helpers */

function myMembership(input: TeamInput): TeamMemberRow | null {
  if (!input.meTrainerId) return null;
  return (
    input.members.find(
      (m) => m.trainerId === input.meTrainerId && m.status === TEAM_STATUS_ACTIVE,
    ) ?? null
  );
}

function activeMembers(input: TeamInput): TeamMemberRow[] {
  return input.members.filter((m) => m.status === TEAM_STATUS_ACTIVE);
}

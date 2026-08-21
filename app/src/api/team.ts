/**
 * Team coaching, over the wire — the one feature in this app that writes online.
 *
 * ── Why this breaks the house rule, and only here ─────────────────────────
 *
 * Everything else in XRep writes to SQLite first and reconciles later. That is
 * the architecture, not a convenience. This module does the opposite: every
 * function here awaits the server, and the screens await these.
 *
 * The reason is that every write to a team is a **permission change**. A phone
 * that could author one offline would be authoring it for replay at an unknown
 * later time — "make Priya an admin", queued on Tuesday, landing on Friday,
 * after she left. There is no version of that which is safe, so the app does not
 * pretend to offer it. Reads are a different question and are answered locally:
 * `teams` and `team_members` are synced, so the Team screen still draws with no
 * signal (see `db/models/Team.ts`). It is the buttons that need a connection,
 * and they say so.
 *
 * After any successful write the caller should `syncDatabase('team')` so the
 * local mirror catches up now rather than at the next trigger. That one line is
 * what makes this feel like the rest of the app instead of like a web page.
 *
 * ── Errors ────────────────────────────────────────────────────────────────
 *
 * The backend answers RFC-7807 with a `code` the app branches on, and a `detail`
 * already written for a trainer to read. So {@link TeamError} carries both, and
 * screens **show `message` and branch on `code`** — never the other way round.
 * Fifteen codes exist; the app only needs to *behave* differently for three of
 * them (see `describeTeamError`). The rest are already the right sentence.
 */

import axios from 'axios';
import { api } from './client';

/* ------------------------------------------------------------------ the wire */

export interface TeamDto {
  id: string;
  name: string;
  logoUrl: string | null;
  seatLimit: number | null;
  activeMembers: number;
  pendingInvites: number;
  ownerTrainerId: string;
  /** 'owner' | 'admin' | 'coach' — the caller's own role. */
  myRole: string;
  createdAt: number;
  updatedAt: number;
}

export interface TeamMemberDto {
  id: string;
  trainerId: string | null;
  /** Null for a pending invite to a number with no XRep account yet. */
  name: string | null;
  phone: string | null;
  role: string;
  status: string;
  clientCount: number;
  invitedAt: number | null;
  joinedAt: number | null;
}

export interface TeamInviteDto {
  member: TeamMemberDto;
  /** A `wa.me` deep link, or null when the number could not be normalised. */
  whatsappUrl: string | null;
  message: string;
}

export interface TeamInvitationDto {
  id: string;
  teamId: string;
  teamName: string;
  invitedByName: string | null;
  invitedAt: number;
  expiresAt: number;
}

/* ------------------------------------------------- team-wide clients · Phase 2 */

export interface TeamClientRow {
  id: string;
  name: string;
  phone: string | null;
  goal: string | null;
  status: string;
  deliveryMode: string | null;
  coachTrainerId: string;
  coachName: string | null;
  /** Their last logged session — how an admin spots who is drifting. */
  lastSessionAt: number | null;
  upcomingSessions: number;
  hasActiveProgram: boolean;
  createdAt: number;
}

export interface CoachClients {
  trainerId: string;
  coachName: string | null;
  role: string;
  clients: TeamClientRow[];
}

export interface TeamProgramRow {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  exercises: number;
}

export interface TeamSessionRow {
  id: string;
  scheduledAt: number;
  status: string;
  durationMinutes: number | null;
  logged: boolean;
}

export interface TeamMetricRow {
  metricType: string;
  value: number;
  unit: string;
  recordedAt: number;
}

export interface TeamClientDetail {
  client: TeamClientRow;
  heightCm: number | null;
  activityLevel: string | null;
  sessionsPerWeek: number | null;
  sessionDurationMinutes: number | null;
  programs: TeamProgramRow[];
  recentSessions: TeamSessionRow[];
  recentMetrics: TeamMetricRow[];
  /**
   * Always true, and the server states it rather than leaving it implied.
   *
   * A new coach who opens an inherited client and finds no money will file it as
   * data loss within the week. The screen has to say "payments before today are
   * recorded with Ravi", and a flag is cheaper than the app inferring intent
   * from an absence.
   */
  moneyHidden: boolean;
}

export interface ReassignResult {
  clientId: string;
  fromTrainerId: string;
  toTrainerId: string;
  programAction: string;
  programsMoved: number;
  sessionsMoved: number;
  /** True when the target was already the coach — nothing was written. */
  noop: boolean;
}

export interface AssignmentRow {
  id: string;
  fromTrainerId: string;
  fromCoachName: string | null;
  toTrainerId: string;
  toCoachName: string | null;
  actorTrainerId: string;
  actorName: string | null;
  programAction: string;
  note: string | null;
  createdAt: number;
}

export interface TeamTemplateRow {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
  coachTrainerId: string;
  coachName: string | null;
  mine: boolean;
  days: number;
  exercises: number;
  clientsOnIt: number;
  updatedAt: number;
}

/* --------------------------------------------- editing and numbers · Phase 3 */

export interface TeamProgramExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  sets: number | null;
  reps: number | null;
  /** V25 · a hold rather than a count. Set instead of `reps` on a timed exercise. */
  durationSeconds: number | null;
  restSeconds: number | null;
  targetLoad: number | null;
  notes: string | null;
  dayOfWeek: number | null;
  week: number | null;
  orderIndex: number;
}

export interface TeamProgramDetail {
  id: string;
  clientId: string;
  clientName: string;
  coachTrainerId: string;
  coachName: string | null;
  name: string;
  goal: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  exercises: TeamProgramExercise[];
  /** False for the caller's own plan — send them to their own offline editor. */
  teammates: boolean;
}

export interface TeamPrescription {
  sets?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  targetLoad?: number | null;
  notes?: string | null;
  dayOfWeek?: number | null;
  week?: number | null;
  orderIndex?: number | null;
}

export interface TeamActivityRow {
  id: string;
  actorTrainerId: string;
  actorName: string | null;
  subjectTrainerId: string;
  subjectName: string | null;
  clientId: string | null;
  clientName: string | null;
  entityType: string;
  action: string;
  /** Written server-side at the time, in the words the coach reads it in. */
  summary: string;
  createdAt: number;
}

export interface CoachRevenue {
  trainerId: string;
  coachName: string | null;
  role: string;
  collected: number;
  gymShare: number;
  payments: number;
  /** A count. Never names — that is what keeps this a roll-up. */
  payingClients: number;
}

export interface TeamRevenue {
  from: string;
  to: string;
  teamCollected: number;
  teamGymShare: number;
  coaches: CoachRevenue[];
}

export interface TeamPhoneAvailability {
  available: boolean;
  code: string | null;
  message: string | null;
}

/* --------------------------------------------------------------- the failure */

/**
 * Every refusal this feature can produce, in one type.
 *
 * `offline` is separated from the rest because it is the only one that is not
 * the server's opinion — nothing was refused, nothing was reached. Drawing it as
 * a rule violation ("you can't do that") when the truth is "we couldn't ask"
 * would blame the trainer for their signal.
 */
export class TeamError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly offline: boolean;
  /** Present on `TEAM_SEAT_LIMIT` only. */
  readonly seatLimit: number | null;

  constructor(init: {
    code: string;
    message: string;
    status?: number | null;
    offline?: boolean;
    seatLimit?: number | null;
  }) {
    super(init.message);
    this.name = 'TeamError';
    this.code = init.code;
    this.status = init.status ?? null;
    this.offline = init.offline ?? false;
    this.seatLimit = init.seatLimit ?? null;
  }
}

/** No connection — the request never got an answer. */
export const OFFLINE_CODE = 'OFFLINE';
/** The backend has `TEAM_ENABLED=false`, so the whole namespace 404s. */
export const FEATURE_OFF_CODE = 'TEAM_FEATURE_OFF';

interface ProblemBody {
  code?: unknown;
  detail?: unknown;
  seatLimit?: unknown;
}

/**
 * Turn whatever axios threw into something a screen can render.
 *
 * A 404 needs care and is the reason this is not two lines. `/v1/team/**` answers
 * 404 for two completely different situations — an id outside the caller's team
 * (which arrives *with* a `code`, per the backend's cross-trainer convention),
 * and the feature being switched off server-side (which arrives *bare*). The
 * first is a refusal to show the trainer; the second means the feature does not
 * exist on this deployment and the entry point should disappear.
 */
function toTeamError(err: unknown): TeamError {
  if (axios.isAxiosError(err) && !err.response) {
    return new TeamError({
      code: OFFLINE_CODE,
      message: "You're offline. Team changes need a connection — try again once you have signal.",
      offline: true,
    });
  }

  if (!axios.isAxiosError(err) || !err.response) {
    return new TeamError({
      code: 'UNKNOWN',
      message: 'Something went wrong. Try that again.',
    });
  }

  const status = err.response.status;
  const body = (err.response.data ?? {}) as ProblemBody;
  const code = typeof body.code === 'string' ? body.code.toUpperCase() : null;
  const detail = typeof body.detail === 'string' ? body.detail.trim() : '';

  if (!code && status === 404) {
    return new TeamError({
      code: FEATURE_OFF_CODE,
      message: 'Team coaching is not switched on for this account yet.',
      status,
    });
  }

  return new TeamError({
    code: code ?? 'UNKNOWN',
    // The server's sentence, when it wrote one. It is already in the trainer's
    // words and carries the recovery; replacing it with our own would be a
    // second copy of the same rule, drifting.
    message: detail || 'Something went wrong. Try that again.',
    status,
    seatLimit: typeof body.seatLimit === 'number' ? body.seatLimit : null,
  });
}

async function call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
  try {
    const { data } = await fn();
    return data;
  } catch (err) {
    throw toTeamError(err);
  }
}

/* ----------------------------------------------------------------- the team */

/**
 * The caller's team, or null.
 *
 * Null covers both honest absences and reads them the same way, deliberately:
 * a 204 (you are in no team — the normal state for almost every trainer) and
 * the feature being off. Neither is an error, and neither should reach a screen
 * as one. Anything else throws.
 */
export async function fetchTeam(): Promise<TeamDto | null> {
  try {
    const res = await api.get<TeamDto | ''>('/v1/team');
    // 204 arrives with an empty body rather than a null one.
    if (res.status === 204 || !res.data) return null;
    return res.data as TeamDto;
  } catch (err) {
    const teamError = toTeamError(err);
    if (teamError.code === FEATURE_OFF_CODE) return null;
    throw teamError;
  }
}

export function createTeam(name: string, seatLimit?: number | null): Promise<TeamDto> {
  return call(() => api.post<TeamDto>('/v1/team', { name, seatLimit: seatLimit ?? null }));
}

export function renameTeam(name: string): Promise<TeamDto> {
  return call(() => api.patch<TeamDto>('/v1/team', { name }));
}

export function setSeatLimit(seatLimit: number): Promise<TeamDto> {
  return call(() => api.patch<TeamDto>('/v1/team', { seatLimit }));
}

export async function deleteTeam(): Promise<void> {
  await call(() => api.delete<void>('/v1/team'));
}

export function transferOwnership(memberId: string): Promise<TeamDto> {
  return call(() => api.post<TeamDto>('/v1/team/transfer-ownership', { memberId }));
}

/* --------------------------------------------------------------- the coaches */

export function fetchMembers(): Promise<TeamMemberDto[]> {
  return call(() => api.get<TeamMemberDto[]>('/v1/team/members'));
}

export function inviteCoach(phone: string): Promise<TeamInviteDto> {
  return call(() => api.post<TeamInviteDto>('/v1/team/invites', { phone }));
}

/**
 * Ask whether a number can be invited, before anything is written.
 *
 * Never throws: an unanswered question is not evidence that a number is taken,
 * and a form that turns a dropped connection into "this number is spoken for"
 * has told the trainer something false about somebody else. Offline it reports
 * available and the invite refuses later, with the real reason.
 */
export async function checkCoachPhone(phone: string): Promise<TeamPhoneAvailability> {
  try {
    const { data } = await api.post<TeamPhoneAvailability>(
      '/v1/team/invites/phone-availability',
      { phone },
    );
    return data;
  } catch {
    return { available: true, code: null, message: null };
  }
}

export async function revokeInvite(memberId: string): Promise<void> {
  await call(() => api.delete<void>(`/v1/team/invites/${memberId}`));
}

export function changeRole(memberId: string, role: 'admin' | 'coach'): Promise<TeamMemberDto> {
  return call(() => api.patch<TeamMemberDto>(`/v1/team/members/${memberId}/role`, { role }));
}

export async function removeMember(memberId: string): Promise<void> {
  await call(() => api.delete<void>(`/v1/team/members/${memberId}`));
}

export async function leaveTeam(): Promise<void> {
  await call(() => api.delete<void>('/v1/team/members/me'));
}

/* ------------------------------------------------------- the invitee's side */

/**
 * Invitations addressed to the caller.
 *
 * Read over REST rather than through sync, and that is the rule rather than an
 * omission: an invitation cannot be answered offline, so holding a local copy
 * would only let the app draw a button that cannot work.
 *
 * Returns empty rather than throwing when the feature is off, so the Home card
 * and the drawer badge can call this on every open without a guard.
 */
export async function fetchInvitations(): Promise<TeamInvitationDto[]> {
  try {
    const { data } = await api.get<TeamInvitationDto[]>('/v1/team/invitations');
    return data;
  } catch (err) {
    const teamError = toTeamError(err);
    if (teamError.code === FEATURE_OFF_CODE || teamError.offline) return [];
    throw teamError;
  }
}

export function acceptInvitation(invitationId: string): Promise<TeamDto> {
  return call(() => api.post<TeamDto>(`/v1/team/invitations/${invitationId}/accept`));
}

export async function declineInvitation(invitationId: string): Promise<void> {
  await call(() => api.post<void>(`/v1/team/invitations/${invitationId}/decline`));
}

/* ------------------------------------------------- team-wide clients · Phase 2 */

/**
 * The team's roster, grouped by coach, the caller's own first.
 *
 * Online-only and never cached to SQLite — that is the rule, not an oversight.
 * Mirroring every coach's roster onto every admin's phone multiplies the local
 * database by the size of the team, and an offline copy leaves with the phone.
 */
export function fetchTeamClients(): Promise<CoachClients[]> {
  return call(() => api.get<CoachClients[]>('/v1/team/clients'));
}

/** One teammate's client. Carries no money at any role — see `moneyHidden`. */
export function fetchTeamClient(clientId: string): Promise<TeamClientDetail> {
  return call(() => api.get<TeamClientDetail>(`/v1/team/clients/${clientId}`));
}

/**
 * Move a client to another coach.
 *
 * `programAction` is the admin's answer to what happens to the training plan:
 * `keep` moves it, `clear` soft-deletes it so the new coach starts fresh. The
 * history — logged sessions and every rupee — never moves either way.
 */
export function reassignClient(
  clientId: string,
  toTrainerId: string,
  programAction: 'keep' | 'clear',
  note?: string,
): Promise<ReassignResult> {
  return call(() =>
    api.post<ReassignResult>(`/v1/team/clients/${clientId}/reassign`, {
      toTrainerId,
      programAction,
      note: note?.trim() || null,
    }),
  );
}

export function fetchAssignments(clientId: string): Promise<AssignmentRow[]> {
  return call(() => api.get<AssignmentRow[]>(`/v1/team/clients/${clientId}/assignments`));
}

/* ------------------------------------------------- the shared library · Phase 2 */

/** Every template in the team, the caller's own included and labelled `mine`. */
export function fetchTeamTemplates(): Promise<TeamTemplateRow[]> {
  return call(() => api.get<TeamTemplateRow[]>('/v1/team/templates'));
}

/**
 * Copy a teammate's template into the caller's own book.
 *
 * A copy, not a share. A template two coaches use and one coach edits is a
 * template that changed under the other's clients without either of them
 * touching it — which is the bug every competitor that built this shipped.
 *
 * The new row arrives on this phone through the ordinary `templates` sync, so
 * the caller should `syncDatabase('team')` after this resolves.
 */
export function copyTeamTemplate(templateId: string): Promise<{ templateId: string; name: string }> {
  return call(() =>
    api.post<{ templateId: string; name: string }>(`/v1/team/templates/${templateId}/copy`),
  );
}

/* --------------------------------------------- editing a teammate's plan · Phase 3 */

export function fetchTeamProgram(programId: string): Promise<TeamProgramDetail> {
  return call(() => api.get<TeamProgramDetail>(`/v1/team/programs/${programId}`));
}

export function updateTeamProgram(
  programId: string,
  patch: { name?: string; goal?: string; status?: string },
): Promise<TeamProgramDetail> {
  return call(() => api.patch<TeamProgramDetail>(`/v1/team/programs/${programId}`, patch));
}

export function addTeamProgramExercise(
  programId: string,
  exerciseId: string,
  prescription: TeamPrescription,
): Promise<TeamProgramExercise> {
  return call(() =>
    api.post<TeamProgramExercise>(`/v1/team/programs/${programId}/exercises`, {
      exerciseId,
      ...prescription,
    }),
  );
}

export function updateTeamProgramExercise(
  programId: string,
  rowId: string,
  prescription: TeamPrescription,
): Promise<TeamProgramExercise> {
  return call(() =>
    api.patch<TeamProgramExercise>(
      `/v1/team/programs/${programId}/exercises/${rowId}`,
      prescription,
    ),
  );
}

export async function removeTeamProgramExercise(programId: string, rowId: string): Promise<void> {
  await call(() => api.delete<void>(`/v1/team/programs/${programId}/exercises/${rowId}`));
}

/**
 * Who changed what, on whose clients.
 *
 * Readable by any member, not just admins — the coach whose plan was edited is
 * the reason the record exists, and a log only its authors could read would be an
 * account of nothing. Returns empty rather than throwing when the caller has no
 * team, so the team screen can ask on every open without a guard.
 */
export async function fetchTeamActivity(clientId?: string): Promise<TeamActivityRow[]> {
  try {
    const { data } = await api.get<TeamActivityRow[]>('/v1/team/activity', {
      params: clientId ? { clientId } : undefined,
    });
    return data;
  } catch (err) {
    const teamError = toTeamError(err);
    if (teamError.offline || teamError.code === FEATURE_OFF_CODE) return [];
    if (teamError.code === 'TEAM_MEMBERSHIP_REQUIRED') return [];
    throw teamError;
  }
}

/**
 * What the team took, per coach. **Owner only.**
 *
 * The one place in this feature where money crosses between coaches, and kept to
 * totals: a sum, a count, and how many clients paid. No payment rows and no
 * client names, which is what stops it being the money book by another route.
 */
export function fetchTeamRevenue(from?: string, to?: string): Promise<TeamRevenue> {
  return call(() =>
    api.get<TeamRevenue>('/v1/team/revenue', {
      params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
    }),
  );
}

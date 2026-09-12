import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import {
  TeamApiError,
  getTeam,
  getMembers,
  getInvitations,
  getTeamClients,
  getTeamTemplates,
  getTeamActivity,
  type TeamData,
} from './api';

export type TeamResult =
  | { ok: true; data: TeamData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireTeam(): Promise<TeamResult> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    const team = await getTeam();
    const invitations = await getInvitations();

    /* No team yet — return just the invitations so the page can offer accept/decline
     * or show the create-team form. */
    if (!team) {
      return {
        ok: true,
        data: {
          now: Date.now(),
          team: null,
          members: [],
          invitations,
          clients: [],
          templates: [],
          revenue: null,
          activity: [],
        },
      };
    }

    /* Has a team — fetch everything the role permits. */
    const isAdminOrOwner = team.myRole === 'owner' || team.myRole === 'admin';

    const [members, clients, templates, activity] = await Promise.all([
      getMembers(),
      isAdminOrOwner ? getTeamClients() : Promise.resolve([]),
      getTeamTemplates(),
      getTeamActivity(),
    ]);

    return {
      ok: true,
      data: {
        now: Date.now(),
        team,
        members,
        invitations,
        clients,
        templates,
        revenue: null,
        activity,
      },
    };
  } catch (error) {
    if (error instanceof TeamApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }
}

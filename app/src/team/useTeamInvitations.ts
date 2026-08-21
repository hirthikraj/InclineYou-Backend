/**
 * Invitations waiting for the signed-in trainer.
 *
 * Two surfaces need this number — the drawer's badge and the home card — and
 * they are both drawn on the same tap, so the answer is cached at module level
 * and shared. Without that, opening the app fires the same request twice and the
 * two surfaces can disagree for a frame, which reads as a bug in the badge.
 *
 * REST rather than sync, on purpose: an invitation cannot be answered offline,
 * so a local copy would only let the app draw a button that cannot work. See
 * `api/team.ts`.
 *
 * `when` exists because the drawer is mounted for the life of the app. Asking
 * the server for invitations every time something re-renders a panel nobody has
 * opened is rent with no tenant — the same reason `AppDrawer` gates its own
 * queries on `visible`.
 */

import { useEffect, useState } from 'react';
import { fetchInvitations, type TeamInvitationDto } from '../api/team';
import { TEAM_ENABLED } from './team';

let cached: TeamInvitationDto[] = [];
/** Coalesces the drawer and the home card onto one request. */
let inFlight: Promise<TeamInvitationDto[]> | null = null;
const listeners = new Set<(rows: TeamInvitationDto[]) => void>();

function publish(rows: TeamInvitationDto[]) {
  cached = rows;
  listeners.forEach((l) => l(rows));
}

/** Cleared on sign-out with every other cache — see `db/live.ts`. */
export function resetTeamInvitations() {
  cached = [];
  inFlight = null;
}

export function refreshTeamInvitations(): Promise<TeamInvitationDto[]> {
  if (!TEAM_ENABLED) return Promise.resolve([]);
  if (inFlight) return inFlight;

  inFlight = fetchInvitations()
    .then((rows) => {
      publish(rows);
      return rows;
    })
    // Offline, or the feature is off server-side. `fetchInvitations` already
    // answers empty for both; anything else leaves the last known answer alone
    // rather than blanking a badge that was right a minute ago.
    .catch(() => cached)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export interface TeamInvitations {
  rows: TeamInvitationDto[];
  count: number;
  /** Re-ask — after answering one, or on a push that says one arrived. */
  refresh: () => void;
}

export function useTeamInvitations(when: boolean = true): TeamInvitations {
  const [rows, setRows] = useState<TeamInvitationDto[]>(cached);

  useEffect(() => {
    listeners.add(setRows);
    return () => {
      listeners.delete(setRows);
    };
  }, []);

  useEffect(() => {
    if (!when) return;
    void refreshTeamInvitations();
  }, [when]);

  return { rows, count: rows.length, refresh: () => void refreshTeamInvitations() };
}

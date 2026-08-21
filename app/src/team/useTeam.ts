/**
 * The team, subscribed locally and enriched online.
 *
 * Two data paths in one hook, which is the whole shape of this feature:
 *
 *   1. **The team and its coaches come from SQLite.** `teams` and `team_members`
 *      are synced, so the screen draws with no signal and no spinner — an admin
 *      on a gym floor can still see who their coaches are.
 *   2. **A teammate's client count comes from the network.** It cannot come from
 *      anywhere else: this phone holds the signed-in trainer's clients and
 *      nobody else's, by design (see the PRD §0.3). So the count is layered on
 *      when `/v1/team/members` answers, over a list that is already on screen.
 *
 * Path 1 decides what the screen looks like. Path 2 only ever adds a number to a
 * line that already reads correctly without it — see `clientLine` in `team.ts`.
 * Nothing waits on the network, and a failed enrichment is not an error state; it
 * is a list with one less fact in it.
 *
 * The signed-in trainer's own count is taken from the local table rather than
 * from the response, so their own row is right immediately and stays right
 * offline.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import { combineLatest, map } from 'rxjs';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db';
import type ClientModel from '../db/models/Client';
import type TeamModel from '../db/models/Team';
import type TeamMemberModel from '../db/models/TeamMember';
import { liveCache } from '../db/live';
import { fetchMembers } from '../api/team';
import { useAuth } from '../store/AuthContext';
import { EMPTY_TEAM_INPUT, type TeamInput, type TeamMemberRow } from './team';

const teams = database.get<TeamModel>('teams');
const members = database.get<TeamMemberModel>('team_members');
const clients = database.get<ClientModel>('clients');

/** Without the trainer id the input is empty anyway — see `buildTeam`. */
const cache = liveCache<TeamInput>(EMPTY_TEAM_INPUT);

function observeTeam(meTrainerId: string | null) {
  return combineLatest([
    teams.query().observeWithColumns(['name', 'owner_trainer_id', 'seat_limit', 'logo_url']),
    members
      .query()
      .observeWithColumns(['team_id', 'trainer_id', 'role', 'status', 'invited_phone', 'joined_at', 'invited_at']),
    // Only to count the trainer's own roster, so it watches `status` and nothing
    // else — a set logged against a client must not re-emit this list.
    clients.query(Q.where('status', Q.notEq('archived'))).observeWithColumns(['status']),
  ]).pipe(
    map(([teamRows, memberRows, clientRows]): TeamInput => {
      const team = teamRows[0] ?? null;
      const myClients = clientRows.length;

      return {
        meTrainerId,
        team: team
          ? {
              id: team.id,
              name: team.name,
              ownerTrainerId: team.ownerTrainerId,
              seatLimit: team.seatLimit ?? null,
            }
          : null,
        members: memberRows
          .filter((m) => !team || m.teamId === team.id)
          .map<TeamMemberRow>((m) => ({
            id: m.id,
            trainerId: m.trainerId ?? null,
            invitedPhone: m.invitedPhone ?? null,
            // The local row carries no name — `team_members` holds identity, not
            // profiles, exactly like `app_user` on the server. Names arrive with
            // the enrichment below; the trainer's own is filled in by the screen.
            name: null,
            role: m.role,
            status: m.status,
            clientCount: m.trainerId && m.trainerId === meTrainerId ? myClients : null,
            invitedAt: m.invitedAt ? m.invitedAt.getTime() : null,
            joinedAt: m.joinedAt ? m.joinedAt.getTime() : null,
          })),
      };
    }),
  );
}

export interface TeamLive {
  input: TeamInput;
  /** False only until the first local emission. Never gated on the network. */
  ready: boolean;
  /** Re-ask the server for names and client counts. */
  refresh: () => void;
}

export function useTeam(): TeamLive {
  const { trainerId } = useAuth();
  const [local, setLocal] = useState(cache.value);
  const [ready, setReady] = useState(cache.ready);
  /** memberId → what only the server knows. */
  const [extra, setExtra] = useState<Record<string, { name: string | null; clientCount: number | null; phone: string | null }>>({});
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;

    const task = InteractionManager.runAfterInteractions(() => {
      sub = observeTeam(trainerId).subscribe((next) => {
        cache.set(next);
        setLocal(next);
        setReady(true);
      });
    });

    return () => {
      task.cancel();
      sub?.unsubscribe();
    };
  }, [trainerId]);

  // Only asked when there is a team to ask about, and re-asked when the local
  // membership rows change — a coach joining is exactly when the names are
  // stale, and it is also the moment the trainer is looking at the list.
  const memberSignature = local.members.map((m) => `${m.id}:${m.status}:${m.role}`).join('|');

  useEffect(() => {
    if (!local.team) {
      setExtra({});
      return;
    }
    let alive = true;
    fetchMembers()
      .then((rows) => {
        if (!alive) return;
        const next: Record<string, { name: string | null; clientCount: number | null; phone: string | null }> = {};
        rows.forEach((r) => {
          next[r.id] = { name: r.name, clientCount: r.clientCount, phone: r.phone };
        });
        setExtra(next);
      })
      // Offline, or the feature switched off mid-session. The list is already
      // drawn and correct; it is simply one fact lighter.
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [local.team?.id, memberSignature, nonce]);

  const input = useMemo<TeamInput>(() => {
    if (local.members.length === 0) return local;
    return {
      ...local,
      members: local.members.map((m) => {
        const more = extra[m.id];
        if (!more) return m;
        return {
          ...m,
          name: more.name ?? m.name,
          invitedPhone: m.invitedPhone ?? more.phone ?? null,
          // The trainer's own count is local and authoritative; never let a
          // stale response overwrite a number this phone can see for itself.
          clientCount:
            m.trainerId && m.trainerId === local.meTrainerId ? m.clientCount : more.clientCount,
        };
      }),
    };
  }, [local, extra]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return useMemo(() => ({ input, ready, refresh }), [input, ready, refresh]);
}

import { Team } from '@/components/team/Team';
import { Unavailable } from '@/components/today/Unavailable';
import { requireTeam } from '@/lib/team/guard';

export const metadata = { title: 'Team · X REP' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requireTeam();
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  const { now, team, members, invitations, clients, templates, activity } = result.data;

  return (
    <Team
      team={team}
      members={members}
      invitations={invitations}
      clients={clients}
      templates={templates}
      activity={activity}
      now={now}
    />
  );
}

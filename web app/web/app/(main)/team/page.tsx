import { Team } from '@/components/team/Team';
import { Unavailable } from '@/components/today/Unavailable';
import { requireTeam } from '@/lib/team/guard';

export const metadata = { title: 'Team · InclineYou' };
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

  const { team, members, invitations, clients, templates, activity } = result.data;
  const { now } = result;

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

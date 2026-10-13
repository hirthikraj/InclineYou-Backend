import type { PrivacyWire } from '@/lib/portal/settings-api';
import { GRIEVANCE_OFFICER, GRIEVANCE_RESPONSE_DAYS, GRIEVANCE_TEL } from '@/lib/portal/grievance';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';

import { LeaveDelete } from './LeaveDelete';

/**
 * A real privacy screen: what your trainer can see, from the same list the trainer's own screens are drawn from, then your data, then the ways out.
 * It names a health item only when your own assessments ask one, says a trainer keeps private notes without saying how many, and puts the download
 * BEFORE the buttons that end anything.
 */
export function PrivacyView({ privacy }: { privacy: PrivacyWire }) {
  const first = privacy.trainerName.split(' ')[0];
  return (
    <div className="pl">
      <Card>
        <Card.Head title={`What ${first} can see`} level={3} />
        <Card.Body>
          <ul className="pl__list">
            {privacy.sees.map((s) => (
              <li key={s.key} className="pl__ex">
                <p className="pl__t" style={{ fontWeight: 500 }}>{s.label}</p>
                {s.healthItems && s.healthItems.length > 0 && <p className="pl__s">Includes health questions they asked: {s.healthItems.join(', ')}. These are stored with your assessment and {first} can see them.</p>}
                {s.key === 'notes' && privacy.sharedNotes > 0 && <p className="pl__s">{privacy.sharedNotes} {privacy.sharedNotes === 1 ? 'note has' : 'notes have'} been shared with you.</p>}
              </li>
            ))}
          </ul>
          <p className="pl__s" style={{ marginTop: 12 }}>{first} can’t see: {privacy.doesNotSee.map((x) => x.toLowerCase()).join(', ')}.</p>
          {privacy.policyVersion && <p className="pl__s">You accepted our privacy notice (version {privacy.policyVersion}){privacy.acceptedAt ? ` on ${new Date(privacy.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}` : ''}.</p>}
        </Card.Body>
      </Card>

      <Card>
        <Card.Head title="Your data" level={3} />
        <Card.Body>
          <p className="pl__s">Everything of yours — your details, sessions and sets, assessments, messages and notes shared with you, and your package and payments if you can see them — as one file. Never another client’s, and never your trainer’s private notes.</p>
          <div className="pwk__actions"><Button variant="secondary" href="/api/portal/export">Download my data</Button><Tag>Up to 5 an hour</Tag></div>
        </Card.Body>
      </Card>

      <LeaveDelete trainerName={privacy.trainerName} />

      <Card>
        <Card.Head title="A question about your data" level={3} />
        <Card.Body>
          <p className="pl__s">This is a different route from messaging {first}: it goes to InclineYou, who decide what is stored and who can read it. We reply within {GRIEVANCE_RESPONSE_DAYS} days.</p>
          <p className="pl__s"><b>{GRIEVANCE_OFFICER.name}</b> · <a href={`mailto:${GRIEVANCE_OFFICER.email}`}>{GRIEVANCE_OFFICER.email}</a> · <a href={GRIEVANCE_TEL}>{GRIEVANCE_OFFICER.phone}</a></p>
        </Card.Body>
      </Card>
    </div>
  );
}

import type { PrivacyWire } from '@/lib/portal/settings-api';
import { GRIEVANCE_OFFICER, GRIEVANCE_RESPONSE_DAYS, GRIEVANCE_TEL } from '@/lib/portal/grievance';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';

import { LeaveDelete } from './LeaveDelete';

/**
 * A real privacy screen: what your trainer can see, from the same list the trainer's own screens are drawn from, then your data, then the ways out.
 * It names a health item only when your own assessments ask one, says a trainer keeps private notes without saying how many, and puts the download
 * BEFORE the buttons that end anything.
 */
export function PrivacyView({ privacy, zone }: { privacy: PrivacyWire; zone: string }) {
  const first = privacy.trainerName.split(' ')[0];
  return (
    <div className="portal col gap4">
      <Card>
        <Card.Head title={`What ${first} can see`} level={3} />
        <Card.Body>
          <ul className="pl__list">
            {privacy.sees.map((s) => (
              <li key={s.key} className="pl__ex">
                <p className="pl__t">{s.label}</p>
                {s.healthItems && s.healthItems.length > 0 && <p className="pl__s">Includes health questions they asked: {s.healthItems.map((h) => `“${h}”`).join(', ')}. These are stored with your assessment and {first} can see them.</p>}
                {s.key === 'notes' && privacy.sharedNotes > 0 && <p className="pl__s">{privacy.sharedNotes} {privacy.sharedNotes === 1 ? 'note has' : 'notes have'} been shared with you.</p>}
              </li>
            ))}
          </ul>
        </Card.Body>
        {/* Its own divided body: drawn inside the list's body it read as the last item's second line — *Notes they share with you*,
            then *Arun can't see…* as though it were about notes. */}
        <Card.Body divided>
          {/* THE REASSURANCE IS NOT FINE PRINT (25 Nov 2026). *What your trainer can't see* is the half of this card a client
              opened the page to read, and it sat in the small grey caption under the list. Same size as the list now. */}
          <p className="pl__nosee"><b>{first} can’t see</b> {privacy.doesNotSee.map((x) => x.toLowerCase()).join(', ')}.</p>
          {privacy.policyVersion && <p className="pl__s">You accepted our privacy notice (version {privacy.policyVersion}){privacy.acceptedAt ? ` on ${new Date(privacy.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone })}` : ''}.</p>}
        </Card.Body>
      </Card>

      <Card>
        <Card.Head title="Your data" level={3} />
        <Card.Body>
          <p className="pl__s">Everything of yours — your details, sessions and sets, assessments, messages and notes shared with you, and your package and payments if you can see them — as one file. Never another client’s, and never your trainer’s private notes.</p>
          <div className="pwk__actions"><Button variant="secondary" href="/api/portal/export">Download my data</Button><span className="small ink3">You can download up to 5 times an hour.</span></div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Head title="A question about your data" level={3} />
        <Card.Body>
          <p className="pl__s">This is a different route from messaging {first}: it goes to InclineYou, who decide what is stored and who can read it. We reply within {GRIEVANCE_RESPONSE_DAYS} days.</p>
          <p className="pl__s pl__contact"><b>{GRIEVANCE_OFFICER.name}</b> · <a href={`mailto:${GRIEVANCE_OFFICER.email}`}>{GRIEVANCE_OFFICER.email}</a> · <a href={GRIEVANCE_TEL}>{GRIEVANCE_OFFICER.phone}</a></p>
        </Card.Body>
      </Card>

      {/* The ways out END the screen — the contact for a question about your data used to sit under *Delete my account*. */}
      <LeaveDelete trainerName={privacy.trainerName} />

    </div>
  );
}

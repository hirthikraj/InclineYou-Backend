'use client';

import { useProfileDraft } from '@/components/settings/ProfileDraft';
import { sectionsOf } from '@/lib/profile/completeness';
import { modeLabel } from '@/lib/profile/work';
import {
  CERTIFICATIONS,
  EXPERIENCE_BANDS,
  LANGUAGES,
  LANGUAGES_ON_CARD,
  NOT_CERTIFIED,
  SPECIALITIES,
  labelFor,
  labelList,
} from '@/lib/setup/options';
import { Chip } from '@/web-components/ui/Chip';
import { ProfileCard } from '@/web-components/ui/ProfileCard';

/**
 * THE PROFILE'S STANDING REFERENCE — the card, and what is still empty.
 *
 * It lives in `layout.tsx`, so it is on all seven tabs, and it reads the draft
 * rather than a prop, so it redraws as the open tab is typed in. Both of those
 * are the point: before this, the preview was inside the identity form, which
 * meant the six tabs that also feed it could not see it, and the one that could
 * pushed it off the top of the screen as soon as the bio got long.
 *
 * ── THE CARD SHOWS MORE THAN ANY ONE TAB EDITS, AND THAT IS THE CONTRACT ────
 *
 * Every borrowed answer on it is read-only. The alternative — a chip that both
 * previews an answer and edits it — would make whichever tab is open able to
 * write columns it does not own, which is the cross-tab clobber
 * `lib/profile/actions.ts` splits its writes to prevent.
 *
 * ── AND THE SECOND CARD IS A CHECKLIST, NOT A SCORE ─────────────────────────
 *
 * `lib/profile/completeness.ts` carries that argument. What it costs here is
 * one rule: the card is drawn only while something is empty. A permanent
 * *7 of 7* is a widget congratulating the trainer every time they open
 * Settings, and it would be holding 200px of the aside to do it.
 */
export function ProfileAside() {
  const d = useProfileDraft();
  if (!d) return null;

  const band = EXPERIENCE_BANDS.find((b) => b.id === d.experienceBand)?.label ?? '';
  const meta = [band, d.languages.length > 0 ? labelList(d.languages, LANGUAGES, LANGUAGES_ON_CARD) : '']
    .filter(Boolean)
    .join(' · ');

  /* "Not certified yet" is a real answer and it belongs on the preview, but not
     as a credential tag: a badge reading *Not certified yet* beside somebody's
     name renders an honest answer as a mark against them. */
  const credentials = d.certifications
    .filter((id) => id !== NOT_CERTIFIED)
    .map((id) => labelFor(id, CERTIFICATIONS));
  const declaredNone = d.certifications.includes(NOT_CERTIFIED);

  /* How you coach before where, because a client who cannot get to a gym has
     already decided by the time they read the neighbourhood. Three localities
     then a count — a tag row of ten is a paragraph wearing chips. */
  const how = d.trainingModes.map(modeLabel).join(' · ');
  const where = [
    d.gymName,
    d.serviceAreas.length > 3
      ? `${d.serviceAreas.slice(0, 3).join(', ')} +${d.serviceAreas.length - 3}`
      : d.serviceAreas.join(', '),
  ]
    .filter(Boolean)
    .join(' · ');

  /* Handles rather than URLs — `@ravi.trains` is what a client would recognise,
     and the server derives it so this half never parses the link. A
     `/channel/UC…` has no handle, so it falls back to the platform's name
     rather than printing 40 characters of channel id on a preview card. */
  const socials = [
    d.instagramUrl ? { label: d.instagramHandle ?? 'Instagram', url: d.instagramUrl } : null,
    d.youtubeUrl ? { label: d.youtubeHandle ?? 'YouTube', url: d.youtubeUrl } : null,
  ].filter((s): s is { label: string; url: string } => s !== null);

  const empty = sectionsOf(d).filter((s) => !s.filled);

  return (
    <>
      <ProfileCard
        name={d.name}
        tintKey={d.phone}
        headline={d.headline}
        meta={meta}
        specialities={d.specialities.map((id) => labelFor(id, SPECIALITIES))}
        credentials={credentials}
        credentialNote="Credentials are self-declared"
        noCredentials={
          declaredNone ? 'No certifications listed — which plenty of excellent trainers don’t have.' : null
        }
        work={[how, where].filter(Boolean).join(' — ')}
        socials={socials}
      >
        {/* ONE CARD, NOT THREE THINGS. The caption used to float between two cards belonging to neither, and the list of
            empty sections was a second card under the first. Both are facts ABOUT this preview, so they sit at its foot. */}
        <div className="pfx-foot">
          <p className="small">Your initials stand in until profile photos arrive.</p>
          {empty.length > 0 ? (
            <>
              <p className="pfx-foot__h">
                {empty.length === 1
                  ? 'One section is still empty'
                  : `${COUNT_WORD[empty.length] ?? empty.length} sections are still empty`}
              </p>
              <p className="small">Nothing here is required. A client simply sees less of you.</p>
              {/* Chips that NAVIGATE: `Chip` renders a `next/link` when given an href, so each is a real target. A wrapped
                  row keeps the card's height bounded (seven of these is three lines; seven rows was 979px of sticky
                  column in a 454px window). See `lib/profile/completeness.ts`. */}
              <div className="row row--wrap mt2">
                {empty.map((s) => (
                  <Chip key={s.key} href={s.href}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </ProfileCard>
    </>
  );
}

const COUNT_WORD: Record<number, string> = {
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
};

import type { PortalMeWire } from '@/lib/portal/me';
import { CERTIFICATIONS, LANGUAGES, LANGUAGES_ON_CARD, NOT_CERTIFIED, SPECIALITIES, labelFor, labelList } from '@/lib/setup/options';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { ProfileCard } from '@/web-components/ui/ProfileCard';
import { Tag } from '@/web-components/ui/Tag';

import { SignOutRow } from './SignOutRow';

/**
 * The Me tab's overview (`/me/account`): your trainer, then the doors to what is yours.
 *
 * ── THE TRAINER IS `ProfileCard`, THE SAME CARD THE TRAINER PREVIEWS ────────
 *
 * Settings → Profile on the trainer's half draws *How clients see you* with `ProfileCard`. This screen IS how a client sees them, so
 * it is the same component — the promise the preview makes is only true if the thing it previews is drawn by it. It replaces a
 * hand-built card whose name was an `<h1>` (a second one, under the layout's *Me*), whose specialities printed the raw id with
 * underscores swapped for spaces (`weight loss` for *Weight loss*, `custom:…` verbatim), and which left out the certifications and
 * languages the trainer filled in for exactly this reader. Labels come from `lib/setup/options.ts`, the catalogue both halves share.
 *
 * Social links are built from the handles the wire carries (`instagramHandle`, `youtubeHandle`); `/v1/portal/me` sends no URL, and a
 * `/channel/UC…` channel has no handle, so it is simply not linked.
 *
 * ── AND THE REST IS ONE LIST OF DOORS ───────────────────────────────────────
 *
 * `ListRow`s, each the whole row a link, with the unread count as a tag where it was a clause in grey text.
 */
export function AccountOverview({ me }: { me: PortalMeWire }) {
  const t = me.trainer;
  const first = (t?.name ?? 'Your trainer').split(' ')[0];

  const credentials = (t?.certifications ?? []).filter((id) => id !== NOT_CERTIFIED).map((id) => labelFor(id, CERTIFICATIONS));
  const socials = [
    t?.instagramHandle ? { label: `@${t.instagramHandle.replace(/^@/, '')} on Instagram`, url: `https://www.instagram.com/${t.instagramHandle.replace(/^@/, '')}/` } : null,
    t?.youtubeHandle ? { label: `@${t.youtubeHandle.replace(/^@/, '')} on YouTube`, url: `https://www.youtube.com/@${t.youtubeHandle.replace(/^@/, '')}` } : null,
  ].filter((s): s is { label: string; url: string } => s !== null);

  return (
    <div className="portal col gap4">
        {t && (
          <ProfileCard
            title="Your trainer"
            name={t.name}
            headline={t.headline}
            meta={t.languages && t.languages.length > 0 ? `Speaks ${labelList(t.languages, LANGUAGES, LANGUAGES_ON_CARD)}` : undefined}
            specialities={(t.specialities ?? []).map((id) => labelFor(id, SPECIALITIES))}
            credentials={credentials}
            credentialNote={credentials.length > 0 ? 'Self-declared' : undefined}
            socials={socials}
          >
            {t.bio && <p className="pacct__bio">{t.bio}</p>}
            {t.whatsappUrl && (
              <div className="mt3">
                <Button variant="primary" href={t.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  Message {first} on WhatsApp
                </Button>
              </div>
            )}
          </ProfileCard>
        )}

        {/* 22 Nov 2026: *Your account*, not *Yours*; the messages first — the one row with something new on it was last;
            a chevron on each, because nothing else on these rows says they go anywhere and a phone has no hover; and
            Sign out, which a phone had no way to reach (the desk's is in the rail's account menu, and the portal's
            bottom bar has no menu). */}
        <Card>
          <CardHead title="Your account" />
          <CardBody flush>
            <ListRows label="Your account">
              <ListRow
                href="/me/inbox"
                title={`From ${first}`}
                sub="Messages and shared notes"
                right={(me.unreadMessages ?? 0) > 0 ? <Tag tone="acc">{me.unreadMessages} new</Tag> : undefined}
                rightInline
                chevron
              />
              <ListRow href="/me/package" title="Your package" sub="Sessions left, and until when" chevron />
              {me.moneyVisible && <ListRow href="/me/payments" title="Payments" sub="What you’ve paid, and what’s due" chevron />}
              <ListRow href="/me/details" title="Your details" sub="Name, goal, height, time zone" chevron />
            </ListRows>
          </CardBody>
        </Card>

        <SignOutRow />
    </div>
  );
}

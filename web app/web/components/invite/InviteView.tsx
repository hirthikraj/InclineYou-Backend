import Link from 'next/link';

import type { InviteCard } from '@/lib/invite/api';
import { CERTIFICATIONS, LANGUAGES, SPECIALITIES, labelList } from '@/lib/setup/options';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { InviteStart } from './InviteStart';

/**
 * What the invite page says for each answer the link can give (api-contract 1.2, inv-a1).
 *
 * Four states and only one of them is a person: a live link shows the trainer's card, and the other three are short and
 * kind about a thing the client cannot fix themselves. There is no photograph — the initials stand in, which is also what the
 * trainer's own profile says (V33) — and the trainer's social links are plain anchors with no referrer, never embeds.
 */
export function InviteView({ card, token, signedIn = false }: { card: InviteCard | null; token: string; signedIn?: boolean }) {
  if (card === null) {
    return (
      <>
        <h2 className="stp__hd" style={{ fontSize: 26 }}>We couldn’t open this just now</h2>
        <p className="stp__sub" style={{ marginTop: 8 }}>
          Nothing is wrong with your link. Reload the page in a moment, and if it still won’t open, tell your trainer.
        </p>
      </>
    );
  }

  if (card.state === 'used') {
    return (
      <>
        <h2 className="stp__hd" style={{ fontSize: 26 }}>You’ve already joined</h2>
        <p className="stp__sub" style={{ marginTop: 8 }}>
          This link has been used, and you don’t need it any more. Sign in the usual way, with your mobile number.
        </p>
        <div className="inv-actions">
          <Button variant="primary" href="/sign-in" wide>Sign in</Button>
        </div>
      </>
    );
  }

  if (card.state === 'expired') {
    return (
      <>
        <h2 className="stp__hd" style={{ fontSize: 26 }}>This link isn’t working any more</h2>
        <p className="stp__sub" style={{ marginTop: 8 }}>
          It may have run out (they last two weeks), or your trainer may have sent you a newer one. Ask them to send it again.
        </p>
        <p className="inv-aside">
          Already joined? <Link href="/sign-in">Sign in</Link>
        </p>
      </>
    );
  }

  const t = card.trainer;
  const certified = t.certifications.length > 0;
  return (
    <>
      <div className="inv-who">
        <Avatar name={t.name} id={card.inviteId} size="xl" />
        <div className="inv-who__t">
          <h2 className="stp__hd" style={{ fontSize: 26 }}>{t.name}</h2>
          {t.headline && <p className="inv-who__h">{t.headline}</p>}
        </div>
      </div>

      {t.bio && <p className="inv-bio">{t.bio}</p>}

      <dl className="inv-facts">
        {certified && (
          <>
            <dt>Certified</dt>
            <dd>{labelList(t.certifications, CERTIFICATIONS, 4)}</dd>
          </>
        )}
        {t.specialities.length > 0 && (
          <>
            <dt>Works on</dt>
            <dd>{labelList(t.specialities, SPECIALITIES, 5)}</dd>
          </>
        )}
        {t.languages.length > 0 && (
          <>
            <dt>Speaks</dt>
            <dd>{labelList(t.languages, LANGUAGES, 5)}</dd>
          </>
        )}
      </dl>

      {(t.introVideoId || t.instagramHandle || t.youtubeHandle) && (
        <p className="inv-links">
          {t.introVideoId && (
            <a href={`https://www.youtube.com/watch?v=${t.introVideoId}`} target="_blank" rel="noopener noreferrer">
              Watch their intro
            </a>
          )}
          {t.instagramHandle && (
            <a
              href={`https://www.instagram.com/${t.instagramHandle.replace(/^@/, '')}/`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram {t.instagramHandle}
            </a>
          )}
        </p>
      )}

      <section className="inv-sees" aria-labelledby="inv-sees-h">
        <h3 id="inv-sees-h" className="inv-sees__h">What {t.name.split(' ')[0]} can see</h3>
        <ul>
          {card.privacySummary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      {/* A number that already proved itself on the login page chooses by id and types no code: the same form, a different button. */}
      <InviteStart
        token={token}
        signedInId={signedIn ? card.inviteId : undefined}
        trainerFirstName={t.name.split(' ')[0] || 'your trainer'}
        policyVersion={card.policyVersion}
        phoneEnding={card.phoneMasked.replace(/^•+/, '')}
      />
    </>
  );
}

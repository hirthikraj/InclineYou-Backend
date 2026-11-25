import Link from 'next/link';

import type { JoinCardWire } from '@/lib/join/types';
import { CERTIFICATIONS, LANGUAGES, SPECIALITIES, labelList } from '@/lib/setup/options';
import { Avatar } from '@/web-components/ui/Avatar';
import { JoinForm } from './JoinForm';

/**
 * What `/join/{slug}` says for each answer the server can give (jn-a1).
 *
 * Closed is one page for every reason — off, unknown, gone — and it is kind, because the person reading it followed a link the
 * trainer put up. Open is the trainer's card (the invite's, so a client sees the same person both ways in), the welcome line,
 * and the form.
 */
export function JoinView({ card, slug }: { card: JoinCardWire | null; slug: string }) {
  if (card === null) {
    return (
      <>
        <h2 className="stp__hd" style={{ fontSize: 26 }}>We couldn’t open this just now</h2>
        <p className="stp__sub" style={{ marginTop: 8 }}>Reload the page in a moment.</p>
      </>
    );
  }
  if (card.state !== 'open') {
    return (
      <>
        <h2 className="stp__hd" style={{ fontSize: 26 }}>This page isn’t taking new clients</h2>
        <p className="stp__sub" style={{ marginTop: 8 }}>
          The trainer may have paused new joins, or changed their link. Ask them for the current one.
        </p>
        <p className="inv-aside">
          Already a client? <Link href="/sign-in">Sign in</Link>
        </p>
      </>
    );
  }

  const t = card.trainer;
  const first = t.name.split(' ')[0] || 'the trainer';
  return (
    <>
      <div className="inv-who">
        <Avatar name={t.name} id={slug} size="xl" />
        <div className="inv-who__t">
          <h2 className="stp__hd" style={{ fontSize: 26 }}>{t.name}</h2>
          {t.headline && <p className="inv-who__h">{t.headline}</p>}
        </div>
      </div>

      {card.welcomeLine && <p className="jn-welcome">{card.welcomeLine}</p>}
      {t.bio && <p className="inv-bio">{t.bio}</p>}

      <dl className="inv-facts">
        {t.certifications.length > 0 && (
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

      {(t.introVideoId || t.instagramHandle) && (
        <p className="inv-links">
          {t.introVideoId && (
            <a href={`https://www.youtube.com/watch?v=${t.introVideoId}`} target="_blank" rel="noopener noreferrer">
              Watch their intro
            </a>
          )}
          {t.instagramHandle && (
            <a href={`https://www.instagram.com/${t.instagramHandle.replace(/^@/, '')}/`} target="_blank" rel="noopener noreferrer">
              Instagram {t.instagramHandle}
            </a>
          )}
        </p>
      )}

      <JoinForm
        slug={slug}
        trainerFirstName={first}
        questions={card.questions}
        plans={card.plans}
        allowNoPlan={card.allowNoPlan}
        policyVersion={card.policyVersion}
        privacySummary={card.privacySummary}
      />

      <p className="inv-aside">
        Already {first}’s client? <Link href="/sign-in">Sign in</Link>
      </p>
    </>
  );
}

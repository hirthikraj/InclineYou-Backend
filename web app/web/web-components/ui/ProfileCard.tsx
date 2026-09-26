import type { ReactNode } from 'react';

import { Avatar } from './Avatar';
import { Card } from './Card';
import { Tag } from './Tag';

/**
 * Profile card — a trainer, as a client meets them.
 *
 * The one object in this product that is not the trainer's own view of their
 * own work. It is what lands in front of somebody who has been sent an invite
 * and has not accepted it yet: a name, a line, and whatever the trainer has
 * chosen to say about themselves across seven tabs.
 *
 * ── EVERY FIELD IS OPTIONAL AND ABSENT MEANS ABSENT ─────────────────────────
 *
 * Nothing here draws a placeholder for an unanswered question. A preview that
 * printed *No certifications yet* in the slot where certifications go would be
 * telling the trainer a client sees a sentence that a client does not see. The
 * one exception is the name, which is the field the invite cannot be sent
 * without — an unnamed card draws the ghost rather than collapsing, because a
 * card with no name at all would look like a component that failed to load.
 *
 * ── IT IS READ-ONLY, AND THAT IS A CONTRACT RATHER THAN AN OMISSION ─────────
 *
 * The tags are `Tag` and never `Chip`: a chip is pressable and a speciality
 * here is a fact borrowed from the tab that owns it. A preview that could be
 * typed into is a second form, and a second form is a second place for one
 * answer to be written from — which is precisely the cross-tab clobber
 * `lib/profile/actions.ts` splits its writes to prevent.
 *
 * The exception is `socials`, which are real anchors. A trainer checking their
 * own preview is exactly the person who should find out that the handle they
 * typed opens somebody else's account, and the only way to find that out is to
 * follow it.
 *
 * ── THE AVATAR IS `Avatar` ──────────────────────────────────────────────────
 *
 * It was a hand-written `.av av--lg` with its own `initialsOf` — two initials
 * everywhere else in the product, one initial here, for a trainer with a
 * single-word name. One avatar rule, twelve tints, one answer; §04's block
 * carries the rest.
 */
export function ProfileCard({
  title = 'How clients see you',
  name,
  /** What the colour is keyed on when the name is still being typed. */
  tintKey,
  headline,
  /** Experience and languages: the quiet line under the name. */
  meta,
  specialities,
  /** Certificates. `Not certified yet` is NOT one of these — see `noCredentials`. */
  credentials,
  /**
   * The caveat beside the credentials. Ours reads *Self-declared*, and the
   * Certifications tab promises in its own callout that the profile says so.
   */
  credentialNote,
  /**
   * The trainer answered *not certified yet*, which is a real answer and a
   * common one. It gets a quiet line and never a tag: *Not certified yet* set
   * as a badge beside somebody's name renders an honest answer as a mark
   * against them.
   */
  noCredentials,
  /** How and where they coach, already joined by the caller.  */
  work,
  socials,
  /** Anything the card should say about itself, under the facts. */
  children,
}: {
  title?: ReactNode;
  name: string;
  tintKey?: string;
  headline?: string;
  meta?: string;
  specialities?: string[];
  credentials?: string[];
  credentialNote?: string;
  noCredentials?: ReactNode;
  work?: string;
  socials?: { label: string; url: string }[];
  children?: ReactNode;
}) {
  const named = name.trim();
  const line = headline?.trim() ?? '';

  return (
    <Card title={title} className={named ? undefined : 'pfc--ghost'}>
      <div className="pfc__id">
        {named ? (
          <Avatar name={named} id={tintKey ?? named} size="lg" />
        ) : (
          <Avatar name="" size="lg" pending />
        )}
        <span className="pfc__n">
          <b className="pfc__nm">{named || 'Your name'}</b>
          <span className={line ? 'pfc__hl' : 'pfc__hl pfc__hl--ghost'}>
            {line || 'Your one line goes here.'}
          </span>
        </span>
      </div>

      {meta ? <p className="pfc__l">{meta}</p> : null}

      {/* Specialities lead, because they are the first thing a client reads
          after a name. No qualifier — unlike the row below, nobody is claiming
          these were checked by anyone. */}
      {specialities && specialities.length > 0 ? (
        <div className="pfc__tags">
          {specialities.map((s) => (
            <Tag key={s}>{s}</Tag>
          ))}
        </div>
      ) : null}

      {credentials && credentials.length > 0 ? (
        <div className="pfc__tags">
          {credentials.map((c) => (
            <Tag key={c}>{c}</Tag>
          ))}
          {credentialNote ? <span className="pfc__q">{credentialNote}</span> : null}
        </div>
      ) : noCredentials ? (
        <p className="pfc__l">{noCredentials}</p>
      ) : null}

      {work ? <p className="pfc__l">{work}</p> : null}

      {socials && socials.length > 0 ? (
        <p className="pfc__l">
          {socials.map((s, i) => (
            <span key={s.url}>
              {i > 0 ? ' · ' : ''}
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                {s.label}
              </a>
            </span>
          ))}
        </p>
      ) : null}

      {children}
    </Card>
  );
}

import { avatarToken, initials } from '@/lib/today/time';

/**
 * Avatar — two initials on one of twelve fixed colours.
 *
 * The colour is derived from the client id, never from their position in a
 * list, so the same person is the same colour on the rail, in the ribbon and in
 * the queue — and still is tomorrow when the list has reordered. That rule
 * already exists as `avatarToken` in `lib/today/time.ts`; this component calls
 * it rather than restating it, so there is one hash and not two.
 *
 * It is `aria-hidden` on purpose. The initials are a picture of a name that is
 * always written in full beside it, and announcing "M K" before "Meera K" is
 * two readings of one fact.
 */
export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export function Avatar({
  name,
  /** The client id the colour is keyed on. Falls back to the name. */
  id,
  size = 'md',
  ring,
  pending,
  className,
}: {
  name: string;
  id?: string;
  size?: AvatarSize;
  ring?: boolean;
  /** The seat before anyone is in it — a dashed outline, no initials. */
  pending?: boolean;
  className?: string;
}) {
  const cls = [
    'av',
    size === 'md' ? null : `av--${size}`,
    ring ? 'av--ring' : null,
    pending ? 'av--pending' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (pending) return <span className={cls} aria-hidden="true" />;

  return (
    <span className={cls} aria-hidden="true" style={{ background: avatarToken(id ?? name) }}>
      {initials(name)}
    </span>
  );
}

/** One member of a stack. The id is what the colour is keyed on — see `Avatar`. */
export interface StackedPerson {
  id: string;
  name: string;
}

/**
 * AvatarStack — who is on this, drawn as a cluster instead of counted.
 *
 * ── WHY A COUNT WAS NOT ENOUGH ──────────────────────────────────────────────
 *
 * The shelf row printed `13 clients on this`, and a column of those makes a
 * trainer read a figure to answer a question that is not about quantity: *is
 * anybody on this, and is it anybody I am thinking about?* Faces answer both
 * without being read. The exact figure does not go anywhere — it stays in the
 * caller's own clipped noun, which is what a screen reader gets.
 *
 * ── `total` IS AUTHORITATIVE AND `people` IS A SAMPLE ────────────────────────
 *
 * The two are separate props on purpose. `people` is whatever the wire sent,
 * which is capped — a program with forty clients must not ship forty names to
 * draw four discs — and `total` is the real count, computed server-side. So the
 * overflow disc reads `+38` correctly even though the array holds six, and a
 * caller who raises `max` past the cap simply draws fewer faces and a bigger
 * `+N` rather than lying. Deriving the overflow from `people.length` instead
 * would silently cap every program in the product at its payload size.
 *
 * ── ONE PERSON IS NAMED; SEVERAL ARE COUNTED ────────────────────────────────
 *
 * A single disc is a worse answer than the name it abbreviates — two initials
 * on a colour, with all the room in the world beside them. So one person gets
 * their name and several get a cluster. This is a property of the CLUSTER and
 * not of the screen using it, which is why it lives here: drawn each way at
 * each call-site, the rule would be re-decided every time and the product would
 * name one client on the shelf and abbreviate them on the next screen.
 *
 * ── IT CARRIES NO ACCESSIBLE TEXT ───────────────────────────────────────────
 *
 * `aria-hidden`, like `Avatar` itself and for the same reason: every call-site
 * draws this beside a written count, and announcing thirteen sets of initials
 * before "13 clients on this" is a list nobody asked for read in place of the
 * fact. A caller that has no count beside it has to write one — that is what
 * `.vh` is for, and drawing this alone is the defect.
 */
export function AvatarStack({
  people,
  total,
  max = 4,
  size = 'sm',
  name = true,
  className,
}: {
  people: StackedPerson[];
  /** The real count, which may exceed `people.length`. Defaults to the sample. */
  total?: number;
  /** How many discs before the overflow. */
  max?: number;
  size?: AvatarSize;
  /** Draw the name beside a cluster of exactly one. */
  name?: boolean;
  className?: string;
}) {
  const count = total ?? people.length;
  if (count <= 0 || people.length === 0) return null;

  const shown = people.slice(0, max);
  /* Off `count`, never `people.length` — the prop note above. Floored at zero
     so a caller whose sample outruns its own total cannot draw `+-2`. */
  const rest = Math.max(0, count - shown.length);
  const lone = count === 1 && name;

  return (
    <span className={['avs', className].filter(Boolean).join(' ')} aria-hidden="true">
      <span className="avs__l">
        {shown.map(p => (
          <Avatar key={p.id} id={p.id} name={p.name} size={size} />
        ))}
        {rest > 0 && <span className="avs__more">+{rest}</span>}
      </span>
      {lone && <span className="avs__nm">{people[0].name}</span>}
    </span>
  );
}

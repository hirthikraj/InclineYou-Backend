import type { SessionRowWire } from '@/lib/sessionlog/wire';

/**
 * WHAT THE CLIENT ADDED TO THIS SESSION (api-contract 1.2) — the one strip the console draws for it.
 *
 * Three facts, and each is drawn only when it is true: the workout was the client's own (nobody on the floor with them),
 * they said how it felt (and a sentence, in their words), and the trainer's recap line is out there — opened or not. A session
 * with none of them draws nothing at all, which is every session a trainer logged before the portal existed.
 *
 * It reads the session row and nothing else; the sets themselves are the grid's. Per-set *who typed this* is on the wire
 * (`enteredBy`) and is deliberately not drawn on every set: on a client's own workout it would be the same word on every row.
 */
const FELT: Record<'easy' | 'right' | 'hard', string> = { easy: 'felt easy', right: 'felt about right', hard: 'felt hard' };

export function FromClient({ session, name }: { session: SessionRowWire; name: string }) {
  const own = session.loggedBy === 'client';
  const fb = session.feedback ?? null;
  const recap = session.recapMessage ?? null;
  if (!own && !fb && !recap) return null;

  const first = name.split(' ')[0] || 'They';
  return (
    <section className="fromcl" aria-label={`From ${first}`}>
      {own && <p className="fromcl__l">{first} did this workout on their own.</p>}
      {fb && (
        <p className="fromcl__l">
          {fb.effort ? (
            <>
              <b>{first}</b> said it {FELT[fb.effort]}
              {fb.note ? '.' : ''}
            </>
          ) : (
            <b>{first} left a note.</b>
          )}
          {fb.note && <q className="fromcl__q">{fb.note}</q>}
        </p>
      )}
      {recap && (
        <p className="fromcl__l fromcl__l--quiet">
          Your recap {recap.readAt ? 'was opened' : 'has not been opened yet'}.
        </p>
      )}
    </section>
  );
}

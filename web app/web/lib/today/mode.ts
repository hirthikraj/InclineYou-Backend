/**
 * Delivery mode — floor or remote. A copy of `app/src/home/mode.ts`.
 *
 * Three sources, in order of authority: the session's own `deliveryMode`, then
 * the client's usual one, then floor. Floor is the default because it is the
 * overwhelming majority in this market and because the two mistakes are not
 * symmetric — a remote session shown as floor costs a trainer a trip, a floor
 * session shown as remote costs nothing.
 *
 * `metadata.mode` is still read as a last resort before the default: it is where
 * the mode lived while the phone's home screen was being built, and a phone that
 * wrote one there should not silently lose it. That legacy path is the reason
 * this file is a copy rather than two lines inlined — the fallback order IS the
 * rule, and it is not obvious.
 *
 * On the web the mode matters for one more reason than it does on the phone: a
 * remote check-in is the only kind of session a trainer can actually run from
 * the desk this screen is on, and the hero says so.
 */

export type DeliveryMode = 'floor' | 'remote';

export const MODE_LABELS: Record<DeliveryMode, string> = {
  floor: 'Floor',
  remote: 'Remote',
};

export const DELIVERY_MODES: DeliveryMode[] = ['floor', 'remote'];

/** Null for anything that isn't a mode we know, so the next source gets a turn. */
function parse(raw: unknown): DeliveryMode | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return value === 'floor' || value === 'remote' ? value : null;
}

export function isDeliveryMode(raw: unknown): raw is DeliveryMode {
  return parse(raw) !== null;
}

export interface ModeSources {
  /** The session's override. */
  session?: string | null;
  /** The client's usual mode. */
  client?: string | null;
  /** Legacy: where the mode lived before there was a column for it. */
  metadata?: unknown;
}

export function readMode({ session, client, metadata }: ModeSources): DeliveryMode {
  return (
    parse(session) ??
    parse(client) ??
    parse(
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>).mode
        : null,
    ) ??
    'floor'
  );
}

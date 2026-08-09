/**
 * Delivery mode — floor or remote.
 *
 * § 06 of the home spec: TrueCoach is the only platform in the teardown that
 * segments the day by how the session is delivered, and it is the first thing a
 * trainer needs before deciding whether to leave the house. So the Today list
 * filters on it.
 *
 * Three sources, in order of authority:
 *
 *   1. the session's own `delivery_mode` — a floor client's Thursday check-in
 *      call is remote, and that override is the case the chips exist for;
 *   2. the client's `delivery_mode` — how they are usually trained;
 *   3. floor.
 *
 * Floor is the default because it is the overwhelming majority in this market
 * and because the two mistakes are not symmetric: a remote session shown as
 * floor costs a trainer a trip, a floor session shown as remote costs nothing.
 *
 * Backend V9 added both columns. `metadata.mode` is still read as a last resort
 * before the default: it is where the mode lived while the home screen was
 * being built, and a phone that wrote one there should not silently lose it.
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
    parse(metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>).mode
      : null) ??
    'floor'
  );
}

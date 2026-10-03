import { createHash } from 'node:crypto';

import { getToken } from '@/lib/auth/session';
import type { PlaceHit } from '@/lib/places/types';

/**
 * `GET /api/places/search?q=` — the gym picker's search, and the only place the
 * Google key lives.
 *
 * ── WHY A ROUTE HANDLER AND NOT THE BROWSER ──────────────────────────────────
 *
 * Two properties of this app are not negotiable: the browser talks to nothing
 * but Next, and no secret reaches browser JS. A Places key in the page would
 * break both, and a CSP that allowed `places.googleapis.com` would put a
 * third-party origin on a screen that sits next to the money book. So the
 * browser asks Next, Next asks Google with the key from the environment, and
 * what comes back is five plain rows.
 *
 * ── SIGNED-IN TRAINERS ONLY ──────────────────────────────────────────────────
 *
 * The key is billed per request. An open route would be a free Google proxy for
 * anyone who found it, so it answers 401 without the session cookie, and spends
 * at most {@link LIMIT} lookups a minute per session.
 *
 * ── AND IT FAILS QUIETLY ─────────────────────────────────────────────────────
 *
 * No key configured is a 503 `PLACES_UNAVAILABLE`, which the picker reads as
 * "this install has no search" and turns into a plain text field. A gym that is
 * not on the map, or Google being slow, must never stop a trainer finishing
 * setup, so every failure here is a code the picker can step around.
 */
export const dynamic = 'force-dynamic';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELDS =
  'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.addressComponents';
const MAX_RESULTS = 5;
const MIN_QUERY = 3;
const MAX_QUERY = 100;
const TIMEOUT_MS = 4_000;

/** Lookups per session per minute. In-memory: per server instance, which is the right grain for a cost guard. */
const LIMIT = 20;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function allowed(key: string, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // The map would otherwise hold every session that ever searched.
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return true;
}

function reply(body: object, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
}

/** The nearest thing to "which city" Google gives back, in the order that is least often wrong in India. */
function cityOf(components: GooglePlace['addressComponents']): string {
  for (const type of ['locality', 'administrative_area_level_2', 'sublocality_level_1']) {
    const hit = components?.find((c) => c.types?.includes(type));
    if (hit?.longText) return hit.longText;
  }
  return '';
}

function toHit(p: GooglePlace): PlaceHit | null {
  if (!p.id || !p.displayName?.text) return null;
  return {
    placeId: p.id,
    name: p.displayName.text,
    address: p.formattedAddress ?? '',
    city: cityOf(p.addressComponents),
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    mapLink: p.googleMapsUri ?? '',
  };
}

export async function GET(request: Request): Promise<Response> {
  const token = await getToken();
  if (!token) return reply({ ok: false, code: 'UNAUTHENTICATED' }, 401);

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return reply({ ok: false, code: 'PLACES_UNAVAILABLE' }, 503);

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY);
  if (q.length < MIN_QUERY) return reply({ ok: true, places: [] });

  // Keyed by a hash so the bearer token itself is never held as a map key.
  const session = createHash('sha256').update(token).digest('hex').slice(0, 16);
  if (!allowed(session, Date.now())) return reply({ ok: false, code: 'RATE_LIMITED' }, 429);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELDS,
      },
      body: JSON.stringify({
        textQuery: q,
        includedType: 'gym',
        regionCode: 'IN',
        languageCode: 'en',
        pageSize: MAX_RESULTS,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    // Status only — the response body can echo the request, and the request
    // carries the key in a header Google may reflect in an error.
    if (!res.ok) return reply({ ok: false, code: 'FAILED' }, 502);

    const data = (await res.json()) as { places?: GooglePlace[] };
    const places = (data.places ?? [])
      .map(toHit)
      .filter((p): p is PlaceHit => p !== null)
      .slice(0, MAX_RESULTS);
    return reply({ ok: true, places });
  } catch {
    return reply({ ok: false, code: 'FAILED' }, 502);
  }
}

/**
 * A gym the trainer picked from the Places search — what the browser holds and
 * what `PATCH /v1/trainers/me` takes as `gymPlace`.
 *
 * `placeId` is the identity (Google's, stable); everything else is display. The
 * backend keeps one `gym_place` row per `placeId`, which is how trainers at the
 * same gym are counted without ever comparing free-text names or map URLs.
 */
export interface PlaceHit {
  placeId: string;
  name: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  mapLink: string;
}

/** `GET /v1/trainers/me` → `gymPlace`: the stored directory row, or null for an unlinked gym. */
export interface StoredGymPlace {
  id: string;
  placeId: string;
  name: string;
  address: string | null;
  city: string | null;
  mapLink: string | null;
}

/** The search route's answer. `PLACES_UNAVAILABLE` means no key is configured — degrade, don't alarm. */
export type PlaceSearchResult =
  | { ok: true; places: PlaceHit[] }
  | { ok: false; code: 'PLACES_UNAVAILABLE' | 'RATE_LIMITED' | 'UNAUTHENTICATED' | 'FAILED' };

'use client';

import { useEffect, useId, useRef, useState } from 'react';

import type { PlaceHit, PlaceSearchResult, StoredGymPlace } from '@/lib/places/types';

/**
 * WHICH GYM — a search over Google Places, with the plain text field underneath.
 *
 * ── WHAT PICKING BUYS ────────────────────────────────────────────────────────
 *
 * A name typed by hand is a string: "Cult Indiranagar", "cult.fit indiranagar"
 * and "Cult Fit - Indira Nagar" are three gyms to any count. A picked place has
 * Google's `placeId`, which is one gym however it is spelled, and that is what
 * lets the platform say how many trainers work at each. The trainer sees only
 * a search box; the id rides along.
 *
 * ── IT NEVER BLOCKS ──────────────────────────────────────────────────────────
 *
 * Most gyms in India are on the map and some are not, and no install is
 * guaranteed to have a key. So the free text is always a valid answer: typing
 * unlinks any chosen place, *Not listed? Use this name* closes the list without
 * choosing one, and when the search route says `PLACES_UNAVAILABLE` the list is
 * never opened again — the component is then exactly the text field it replaced.
 *
 * ── ONE FIELD, THREE STATES ──────────────────────────────────────────────────
 *
 * `place` null + `name` empty (nothing), `place` null + `name` (free text, an
 * unlinked gym), and `place` set (linked — the line under the field says so and
 * offers the map). The parent holds all of it; this keeps only what the search is
 * doing.
 */

export interface GymChoice {
  name: string;
  /** `null` is an unlinked, typed gym. */
  place: PlaceHit | StoredGymPlace | null;
}

const MIN_QUERY = 3;
const DEBOUNCE_MS = 300;

function addressOf(place: PlaceHit | StoredGymPlace): string {
  return [place.address, 'city' in place ? place.city : null].filter(Boolean)[0] ?? '';
}

export function GymPicker({
  id,
  label = 'Gym or studio name',
  name,
  place,
  onChange,
  disabled = false,
  invalid = false,
  maxLength = 120,
  placeholder = 'Search for your gym — Iron House, Indiranagar',
}: {
  id?: string;
  label?: string;
  name: string;
  place: PlaceHit | StoredGymPlace | null;
  onChange: (next: GymChoice) => void;
  disabled?: boolean;
  invalid?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  const auto = useId();
  const inputId = id ?? `gym-${auto}`;
  const listId = `${inputId}-list`;

  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  /** Set once the route says there is no key; the picker is then a text field for good. */
  const [unavailable, setUnavailable] = useState(false);

  /** True for the one change caused by choosing a result, so it does not search for its own name. */
  const justPicked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    controller.current?.abort();

    const q = name.trim();
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    if (unavailable || disabled || place || q.length < MIN_QUERY) return;

    timer.current = setTimeout(async () => {
      const ctl = new AbortController();
      controller.current = ctl;
      setBusy(true);
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`, {
          signal: ctl.signal,
          cache: 'no-store',
        });
        const body = (await res.json()) as PlaceSearchResult;
        if (body.ok) {
          setHits(body.places);
          setActive(-1);
        } else if (body.code === 'PLACES_UNAVAILABLE') {
          setUnavailable(true);
          setHits([]);
        } else {
          // Rate limited, signed out, Google slow: the typed name still works.
          setHits([]);
        }
      } catch {
        // Aborted by the next keystroke, or offline — either way, nothing to show.
      } finally {
        if (controller.current === ctl) setBusy(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [name, place, unavailable, disabled]);

  useEffect(() => () => controller.current?.abort(), []);

  function pick(hit: PlaceHit) {
    justPicked.current = true;
    setOpen(false);
    setHits([]);
    onChange({ name: hit.name.slice(0, maxLength), place: hit });
  }

  function keepTyped() {
    setOpen(false);
    setHits([]);
  }

  const typed = name.trim();
  /** Whether a search applies to what is on screen — stale results from before it stopped applying are not shown. */
  const searching = !unavailable && !disabled && !place && typed.length >= MIN_QUERY;
  const results = searching ? hits : [];
  const showList = open && searching && (results.length > 0 || !busy);
  /** The options in order: results, then the always-valid fallback. */
  const count = results.length + 1;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) {
      if (e.key === 'ArrowDown' && results.length > 0) setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % count);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? count - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      if (active < results.length) pick(results[active]);
      else keepTyped();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={`fld${invalid ? ' fld--err' : ''}`} style={{ position: 'relative' }}>
      <label className="fld__l" htmlFor={inputId}>
        {label}
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="ctl"
          id={inputId}
          style={{ flex: 1 }}
          value={name}
          maxLength={maxLength}
          disabled={disabled}
          autoComplete="off"
          placeholder={unavailable ? 'Iron House, Indiranagar' : placeholder}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // After the click on an option has been handled.
            setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            // Typing over a linked gym is an edit of free text: the link goes.
            setOpen(true);
            onChange({ name: e.target.value, place: null });
          }}
        />
        {name !== '' || place ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={disabled}
            aria-label="Clear the gym"
            onClick={() => {
              setHits([]);
              onChange({ name: '', place: null });
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Gyms that match"
          className="card"
          style={{
            position: 'absolute',
            zIndex: 20,
            left: 0,
            right: 0,
            top: '100%',
            margin: '4px 0 0',
            padding: 4,
            listStyle: 'none',
          }}
        >
          {results.map((hit, i) => (
            <li
              key={hit.placeId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={active === i}
              // `mousedown` beats the input's blur, which would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(hit);
              }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: active === i ? 'var(--bg-sunk, rgba(0,0,0,.05))' : 'transparent',
              }}
            >
              <b style={{ display: 'block' }}>{hit.name}</b>
              <span className="small" style={{ color: 'var(--tx-ink-3)' }}>{hit.address}</span>
            </li>
          ))}
          <li
            id={`${listId}-${results.length}`}
            role="option"
            aria-selected={active === results.length}
            onMouseDown={(e) => {
              e.preventDefault();
              keepTyped();
            }}
            onMouseEnter={() => setActive(results.length)}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              background: active === results.length ? 'var(--bg-sunk, rgba(0,0,0,.05))' : 'transparent',
            }}
          >
            Not listed? Use “{typed}”
          </li>
        </ul>
      ) : null}

      <span className="fld__h" aria-live="polite">
        {place ? (
          <>
            Linked: {addressOf(place) || place.name}.{' '}
            {place.mapLink ? (
              <a href={place.mapLink} target="_blank" rel="noreferrer noopener">
                Open on the map
              </a>
            ) : null}{' '}
          </>
        ) : searching && busy ? (
          'Searching…'
        ) : unavailable ? (
          'Whatever it is called on the board outside. '
        ) : (
          'Pick it from the list so it is the right gym, or just type its name. '
        )}
        We count how many trainers work at each gym — never who they coach.
      </span>
    </div>
  );
}

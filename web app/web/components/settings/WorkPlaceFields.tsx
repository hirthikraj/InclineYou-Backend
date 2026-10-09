'use client';

import { useState } from 'react';

import { AddChip, Chip, ChipRow } from '@/components/setup/Chips';
import { AddOwn } from '@/components/setup/AddOwn';
import { GroupLabel } from '@/components/setup/SetupShell';
import { GymPicker } from '@/components/profile/GymPicker';
import type { Identity } from '@/lib/profile/api';
import type { PlaceHit, StoredGymPlace } from '@/lib/places/types';
import {
  AREA_CAP,
  MAX_GYM_NAME,
  MAX_MAP_LINK,
  TRAINING_MODES,
  cleanArea,
  looksLikeUrl,
  modeLabel,
} from '@/lib/profile/work';
import { WORK_MODES } from '@/lib/setup/options';

/**
 * WHERE YOU WORK — the first half of the profile's *Work & hours* tab.
 *
 * **Controlled, and it owns no answer.** Every value comes down from
 * `WorkPanel` and every edit goes back up, because the tab has ONE Save and that
 * button has to know what changed in both halves to decide which endpoints to
 * call. A section holding its own draft would have made that impossible without
 * a ref, which is the shape a controlled component already is.
 *
 * The one piece of state left here is `addingArea` — whether the escape hatch is
 * open. That is not an answer, nothing is saved from it, and lifting it would
 * only mean the parent re-rendered the whole week band to open a text field.
 *
 * ── THE TWO QUESTIONS THAT LOOK LIKE ONE ────────────────────────────────────
 *
 * `work_mode` (V23) and `training_modes` (V34) are both here and they are not
 * the same answer. The first is commercial — it decides which price lists exist
 * on the packs step and who is pre-selected to collect at add-client — and its
 * own migration says in bold that it must never gate a feature. The second is
 * what a CLIENT is choosing between: do you come to me, do I come to you, is it
 * a call.
 *
 * Neither can be derived from the other. A trainer at a gym may take home visits
 * on Sundays; an independent trainer may work out of a studio they do not own.
 * So the section asks both, one under the other, with a line saying which one
 * changes something elsewhere in the app — because a profile field that quietly
 * moves a default two screens away is the thing a settings screen owes the
 * trainer a sentence about.
 *
 * ── AND THE ONE DESTRUCTIVE EDIT ────────────────────────────────────────────
 *
 * Choosing *on my own* takes this whole gym block off the screen and the save
 * clears `gymName` (and the place link with it). Since v1.1 the gym's share is
 * per pack rather than a trainer-wide percentage, so nothing else is cleared
 * with it. That is reported in the sentence AFTER the save rather than
 * warned about before it: a `.fld__e` under the vacated fields painted the app's
 * validation red over a perfectly valid answer, and left a red block exactly
 * where a section had just correctly disappeared. What must never happen is the
 * quiet alternative — keeping a hidden gym name because its field left the
 * screen, so a client reads a gym the trainer no longer works at.
 */

/** The five answers this section edits. `WorkPanel` holds it; this draws it. */
export interface PlaceDraft {
  /** `'independent' | 'gym' | 'both'`, or `''` for never answered. */
  mode: string;
  gymName: string;
  /** The picked place; `null` for a typed gym. */
  gymPlace: PlaceHit | StoredGymPlace | null;
  mapLink: string;
  modes: string[];
  areas: string[];
}

/** True when the gym fields belong on screen at all. */
export function atGym(draft: PlaceDraft): boolean {
  return draft.mode === 'gym' || draft.mode === 'both';
}

export function WorkPlaceFields({
  value,
  saved,
  onChange,
  disabled = false,
}: {
  value: PlaceDraft;
  /** The stored record — read only for the *Open it* link on a saved map URL. */
  saved: Identity;
  onChange: (next: PlaceDraft) => void;
  disabled?: boolean;
}) {
  const [addingArea, setAddingArea] = useState(false);
  const [touchedLink, setTouchedLink] = useState(false);

  const { gymName, mapLink, modes, areas } = value;
  const link = mapLink.trim();
  const linkBroken = touchedLink && link.length > 0 && !looksLikeUrl(link);
  const atAreaCap = areas.length >= AREA_CAP;

  function toggleMode(id: string) {
    onChange({
      ...value,
      modes: modes.includes(id) ? modes.filter((m) => m !== id) : [...modes, id],
    });
  }

  function addArea(label: string) {
    const area = cleanArea(label);
    // Case-insensitively, because "Indiranagar" and "indiranagar" are one
    // neighbourhood and the server's de-duplication is exact.
    if (!area || areas.some((a) => a.toLowerCase() === area.toLowerCase())) return;
    if (areas.length >= AREA_CAP) return;
    onChange({ ...value, areas: [...areas, area] });
  }

  return (
    <>
      <h2 className="card__t">Where you work</h2>
      <p className="small" style={{ marginTop: 3, maxWidth: 620 }}>
        Two questions that look like one: the arrangement you are in, and the way you actually
        coach. A trainer at a gym can still take home visits, so neither answers the other.
      </p>

      <GroupLabel top={22}>HOW YOU ARE PAID</GroupLabel>
      {/* `.card--pick` / `.card--pick-accent`, the same pair the packs step
          uses for the same three options. Not chips: each carries a second
          line, and the second line is what stops "Both" being guessed at. */}
      <div className="row" style={{ gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
        {WORK_MODES.map((option) => {
          const on = value.mode === option.id;
          return (
            <button
              key={option.id}
              className={`card ${on ? 'card--pick-accent' : 'card--pick'}`}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              style={{ flex: '1 1 180px' }}
              onClick={() => onChange({ ...value, mode: option.id })}
            >
              <div className="card__b" style={{ padding: '13px 14px' }}>
                <b className="h5" style={{ display: 'block' }}>
                  {option.label}
                </b>
                <span className="small" style={{ display: 'block', marginTop: 4 }}>
                  {option.note}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="small" style={{ marginTop: 8, maxWidth: 620 }}>
        This decides which price lists exist on your packages screen and who is pre-selected to
        collect when you add a client. It is a default, never a rule — who collects is still
        decided per client.
      </p>

      {atGym(value) ? (
        <>
          <GroupLabel>THE GYM OR STUDIO</GroupLabel>
          <div className="fldrow">
            <div style={{ flex: '1 1 260px' }}>
              {/* Search first, text second: see `GymPicker`. Most gyms in India are
                  on the map and a picked one is countable; the ones that are not
                  are one tap on *Not listed?* away, so the majority answer never
                  feels like a failure. */}
              <GymPicker
                id="pf-gym-name"
                name={gymName}
                place={value.gymPlace}
                disabled={disabled}
                maxLength={MAX_GYM_NAME}
                onChange={(next) =>
                  onChange({
                    ...value,
                    gymName: next.name,
                    gymPlace: next.place,
                    // A picked place brings its map link; one the trainer already
                    // pasted is theirs and is never overwritten.
                    mapLink: !mapLink.trim() && next.place?.mapLink ? next.place.mapLink : mapLink,
                  })
                }
              />
            </div>

            <div className="fld" style={{ flex: '1 1 300px' }}>
              <label className="fld__l" htmlFor="pf-map-link">
                Map link{' '}
                <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span>
              </label>
              <input
                className="ctl"
                id="pf-map-link"
                type="url"
                inputMode="url"
                value={mapLink}
                maxLength={MAX_MAP_LINK}
                disabled={disabled}
                placeholder="https://maps.app.goo.gl/…"
                onBlur={() => setTouchedLink(true)}
                onChange={(e) => onChange({ ...value, mapLink: e.target.value })}
              />
              {linkBroken ? (
                <p className="fld__e" style={{ marginTop: 6 }}>
                  That doesn’t look like a link. Paste the one from the map’s Share button.
                </p>
              ) : (
                <span className="fld__h">
                  Stored exactly as you paste it — from Google Maps, Apple Maps, anywhere.{' '}
                  {saved.mapLink && saved.mapLink === link ? (
                    <a href={saved.mapLink} target="_blank" rel="noreferrer noopener">
                      Open it
                    </a>
                  ) : (
                    'Save it, then check it opens.'
                  )}
                </span>
              )}
            </div>
          </div>
        </>
      ) : null}

      <GroupLabel>HOW YOU COACH</GroupLabel>
      <div className="row" style={{ gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
        {TRAINING_MODES.map((option) => {
          const on = modes.includes(option.id);
          return (
            <button
              key={option.id}
              className={`card ${on ? 'card--pick-accent' : 'card--pick'}`}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              style={{ flex: '1 1 230px' }}
              onClick={() => toggleMode(option.id)}
            >
              <div className="card__b" style={{ padding: '13px 14px' }}>
                <b className="h5" style={{ display: 'block' }}>
                  {option.label}
                </b>
                <span className="small" style={{ display: 'block', marginTop: 4 }}>
                  {option.note}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {/* Anything the server holds that this build's catalogue has lost — a mode
          from a newer build, or a `custom:` entry. Drawn rather than hidden: an
          id nobody can see is still counted, cannot be removed, and is written
          back on every Save, which is exactly what the seeded `fat_loss`
          speciality turned out to be. */}
      {modes.some((id) => !TRAINING_MODES.some((m) => m.id === id)) ? (
        <ChipRow top={10}>
          {modes
            .filter((id) => !TRAINING_MODES.some((m) => m.id === id))
            .map((id) => (
              <Chip
                key={id}
                label={modeLabel(id)}
                pressed
                disabled={disabled}
                onClick={() => toggleMode(id)}
              />
            ))}
        </ChipRow>
      ) : null}

      <GroupLabel>AREAS YOU COVER</GroupLabel>
      <p className="small" style={{ maxWidth: 620, marginTop: -4 }}>
        {modes.includes('home_visit')
          ? 'You said you take home visits — this is the answer to “how far”, and without it that is not something a client can act on.'
          : 'The neighbourhoods a client would recognise. Useful even without home visits: it is how somebody decides you are near enough.'}
      </p>
      <ChipRow top={10}>
        {areas.map((area) => (
          // A pressed chip that un-presses. Every area on this row is chosen by
          // definition, so the toggle a trainer already knows from every other
          // chip row in the app is the remove.
          <Chip
            key={area}
            label={area}
            pressed
            disabled={disabled}
            onClick={() => onChange({ ...value, areas: areas.filter((a) => a !== area) })}
          />
        ))}
        {!addingArea ? (
          <AddChip
            label={areas.length === 0 ? 'Add an area' : 'Add another'}
            disabled={disabled || atAreaCap}
            onClick={() => setAddingArea(true)}
          />
        ) : null}
      </ChipRow>
      {atAreaCap ? (
        <p className="small" style={{ marginTop: 8 }}>
          That is {AREA_CAP} — remove one to add another. The cap is about a row of tags staying
          readable, not about how far you will travel.
        </p>
      ) : null}
      {addingArea ? (
        <AddOwn
          id="pf-area-add"
          label="Which area?"
          placeholder="Indiranagar"
          hint="One neighbourhood at a time, as a client would say it."
          onAdd={addArea}
          onCancel={() => setAddingArea(false)}
        />
      ) : null}
    </>
  );
}

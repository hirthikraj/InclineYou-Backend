'use client';

import { useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { weekProblem, type Week } from '@/components/profile/WeekPicker';
import { SaveRow } from '@/components/settings/IdentityForm';
import { WorkPlaceFields, atGym, type PlaceDraft } from '@/components/settings/WorkPlaceFields';
import { WorkingWeekFields, weekFrom } from '@/components/settings/WorkingWeekFields';
import type { Message } from '@/lib/auth/copy';
import { saveWorkPlace, saveWorkingWeek } from '@/lib/profile/actions';
import type { Identity, StoredHour } from '@/lib/profile/api';
import { modeLabel } from '@/lib/profile/work';
import { formatWindow, mergeWindows, sameWindows } from '@/lib/setup/hours';

/**
 * WORK & HOURS — the profile's sixth tab. **One form, one Save button, and it
 * calls only the endpoints whose answers actually changed.**
 *
 * ── THIS TAB HAD TWO SAVE BUTTONS, AND THAT WAS THE WRONG CALL ──────────────
 *
 * The reasoning for two was that the halves are two records — columns on
 * `trainer` over `PATCH /v1/trainers/me`, and rows in `working_hours` over
 * `/v1/sync/push` — with two ways of failing, and that one button would have to
 * either abandon the second write when the first failed or report a partial
 * success nobody reads carefully.
 *
 * **That is an argument about how a failure is worded, and it was used to
 * settle a question about what a screen is.** A trainer does not know or care
 * that their gym's name and their Tuesday morning live in different tables;
 * they changed two things on one page and expect one Save. Two primaries on one
 * screen also make a worse failure than the one they were avoiding: press the
 * wrong one and half your edits are silently still sitting there, which is
 * precisely the *"guess which half landed"* problem, moved from the error
 * message to the moment before it.
 *
 * So: one button, and the partial failure is written out properly instead of
 * designed around. Each half reports its own outcome, each adopts the server's
 * answer only on its own success, and **a half that failed stays dirty** — so
 * the button is still there and pressing it again retries only that half.
 *
 * ── ONLY WHAT CHANGED IS SENT ───────────────────────────────────────────────
 *
 * `placeDirty` and `weekDirty` are computed separately and gate their own
 * request. Editing the gym name makes one PATCH and no push; editing Tuesday
 * makes one push and no PATCH; editing both makes both.
 *
 * That is not an optimisation, it is the correctness rule the week half needs.
 * `WeekPicker` shows ONE set of windows standing for every day, so writing the
 * week back when nobody touched it would flatten a Saturday that genuinely
 * differs. A Save pressed to change the map link must not be able to do that,
 * and here it cannot — the push is never reached.
 *
 * ── AND THE BUTTON IS ONLY THERE WHEN THERE IS SOMETHING TO SAVE ────────────
 *
 * `SaveRow` draws no button at all when nothing is dirty. A primary that is
 * always live on a settings screen has to have an answer for being pressed with
 * no edits in hand, and every available answer is bad: a no-op write, a
 * cheerful "Saved." that saved nothing, or the "Nothing to save" notice this
 * screen used to print. Nothing to do is better said by there being nothing to
 * press.
 */
export function WorkPanel({
  identity,
  hours,
}: {
  identity: Identity;
  hours: StoredHour[];
}) {
  /* ---------------------------------------------------- where you work */

  const [savedPlace, setSavedPlace] = useState<Identity>(identity);
  const [place, setPlace] = useState<PlaceDraft>(() => draftOf(identity));

  /* --------------------------------------------------- your working week */

  const [savedWeek, setSavedWeek] = useState<Week>(() => weekFrom(hours));
  const [week, setWeek] = useState<Week>(() => weekFrom(hours));
  /** The rows as the server sent them. Only `daysVary` reads this. */
  const [storedHours, setStoredHours] = useState<StoredHour[]>(hours);
  const [unanswered, setUnanswered] = useState(hours.length === 0);

  const [pressed, setPressed] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();

  /**
   * A stored gym this save will clear.
   *
   * Nothing is drawn from it — *on my own* takes the whole gym block off the
   * screen. It makes the form dirty, and it names the gym in the sentence after
   * the save.
   */
  const losesGym = !atGym(place) && (savedPlace.gymName !== '' || savedPlace.mapLink !== '');

  const placeDirty =
    place.mode !== savedPlace.workMode ||
    (atGym(place) &&
      (place.gymName !== savedPlace.gymName || place.mapLink !== savedPlace.mapLink)) ||
    losesGym ||
    // Compared as sets, like every other list tab: the catalogue's order is the
    // meaningful one, so a toggle that put a card back where it started is not
    // an edit and must not raise the unsaved marker.
    !sameSet(place.modes, savedPlace.trainingModes) ||
    !sameSet(place.areas, savedPlace.serviceAreas);

  const weekChanged =
    week.days.length !== savedWeek.days.length ||
    week.days.some((d) => !savedWeek.days.includes(d)) ||
    !sameWindows(mergeWindows(week.windows), mergeWindows(savedWeek.windows));
  // An unanswered week is dirty from the first render: the suggestion on screen
  // is not what the server holds, and the marker is the honest way to say so
  // before the trainer navigates away from it.
  const weekDirty = weekChanged || unanswered;

  const dirty = placeDirty || weekDirty;
  const weekProblemNow = weekProblem(week);

  function submit() {
    setPressed(true);
    // The week's own validity blocks the WHOLE save rather than letting the
    // place half through alone. Two halves that landed at different times
    // because one had an error is the partial-success confusion this screen is
    // built to avoid, and the sentence under the picker already says what to fix.
    if (weekDirty && weekProblemNow !== 'none') return;

    setMessage(null);
    // Read before the request: the answer is about to be replaced by the
    // server's copy, which is precisely the one with no gym in it to name.
    const clearingGym = losesGym ? savedPlace.gymName : '';

    start(async () => {
      const saved: string[] = [];
      const failures: { half: string; message: string }[] = [];
      let clearedGym = '';

      if (placeDirty) {
        const result = await saveWorkPlace({
          workMode: place.mode,
          gymName: place.gymName,
          mapLink: place.mapLink,
          trainingModes: place.modes,
          serviceAreas: place.areas,
        });
        if (result.ok) {
          // The server trims, de-duplicates and — for an independent trainer —
          // has just cleared two fields. Adopting its answer is what keeps the
          // form showing the record rather than what was typed at it.
          setSavedPlace(result.identity);
          setPlace(draftOf(result.identity));
          saved.push('where you work');
          clearedGym = clearingGym;
        } else {
          failures.push({ half: 'Where you work', message: result.message });
        }
      }

      if (weekDirty) {
        const result = await saveWorkingWeek(week.days, week.windows);
        if (result.ok) {
          // Merged, because that is what was written: two touching windows
          // become one row, and a form still showing the pair reads as unsaved.
          const merged = mergeWindows(week.windows);
          setSavedWeek({ days: [...week.days], windows: merged });
          setWeek({ days: [...week.days], windows: merged });
          setStoredHours(
            week.days.flatMap((weekday) =>
              merged.map((w, i) => ({ id: `${weekday}-${i}`, weekday, ...w })),
            ),
          );
          setUnanswered(false);
          saved.push('your working week');
        } else {
          failures.push({ half: 'Your working week', message: result.message });
        }
      }

      setPressed(false);
      setMessage(outcome(saved, failures, clearedGym, place.modes, week));
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <WorkPlaceFields
        value={place}
        saved={savedPlace}
        disabled={pending}
        onChange={(next) => {
          setPlace(next);
          if (message) setMessage(null);
        }}
      />

      <WorkingWeekFields
        value={week}
        stored={storedHours}
        unanswered={unanswered}
        showProblem={pressed}
        disabled={pending}
        onChange={(next) => {
          setWeek(next);
          if (message) setMessage(null);
        }}
      />

      <MessageSlot message={message} />

      <SaveRow
        pending={pending}
        dirty={dirty}
        note="Where you are, how you coach, and the hours a client can book out of."
        // The button says which records it is about to write, because on this
        // tab that is genuinely two and the trainer cannot see the seam.
        unsaved={
          <>
            <b style={{ color: 'var(--tx-warn)' }}>Unsaved changes.</b>{' '}
            {placeDirty && weekDirty
              ? 'Saving writes both where you work and your working week.'
              : placeDirty
                ? 'Saving writes where you work.'
                : 'Saving writes your working week.'}{' '}
            Switching tab loses them.
          </>
        }
      />
    </form>
  );
}

/* ------------------------------------------------------------------ helpers */

function draftOf(identity: Identity): PlaceDraft {
  return {
    mode: identity.workMode,
    gymName: identity.gymName,
    mapLink: identity.mapLink,
    modes: identity.trainingModes,
    areas: identity.serviceAreas,
  };
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}

/**
 * What the save did, as one sentence — including when it half worked.
 *
 * The three cases are deliberately different shapes rather than one template.
 * **Everything landed** gets the interesting consequence, not a receipt: a
 * cleared gym wins the line because it reaches the Money screen and a trainer
 * who did not mean it needs to know now. **Nothing landed** is the server's own
 * words, because `messageFor` already wrote a better sentence than any summary
 * would. **Half landed** is the only one that has to be a receipt, and it names
 * both halves explicitly — what is stored and what is not — because the whole
 * argument for a single button is that this sentence gets written properly.
 */
function outcome(
  saved: string[],
  failures: { half: string; message: string }[],
  clearedGym: string,
  modes: string[],
  week: Week,
): Message {
  if (failures.length === 0) {
    return {
      tone: 'ok',
      icon: 'check',
      lead: 'Saved.',
      rest: clearedGym
        ? `${clearedGym} is off your profile, and the gym’s share of a floor session with it. Your past settlements are untouched.`
        : saved.includes('your working week')
          ? `${week.days.length === 7 ? 'Every day' : `${week.days.length} days`}, ${mergeWindows(
              week.windows,
            )
              .map(formatWindow)
              .join(' and ')}. Your diary and every slot list read this.`
          : modes.length > 0
            ? `A client can see you coach ${modes.map(modeLabel).join(', ').toLowerCase()}.`
            : 'Your profile does not yet say how you coach.',
    };
  }

  if (saved.length === 0) {
    return {
      tone: 'err',
      icon: 'warn',
      lead: failures[0].message,
      rest: failures.length > 1 ? failures[1].message : undefined,
    };
  }

  return {
    tone: 'warn',
    icon: 'warn',
    lead: `${sentenceCase(saved[0])} saved. ${failures[0].half} did not.`,
    rest: `${failures[0].message} Your unsaved changes are still on screen — press Save again to retry just that half.`,
  };
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

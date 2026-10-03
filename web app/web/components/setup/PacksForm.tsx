'use client';

import { useState } from 'react';

import { GymPicker } from '@/components/profile/GymPicker';
import type { PlaceHit } from '@/lib/places/types';
import { MessageSlot } from '@/components/auth/MessageSlot';
import { IconPlus } from '@/components/auth/Icons';
import { addPack, leavePacks, removePack, saveWorkMode, skipStep } from '@/lib/setup/actions';
import { perSession, rupees, type Pack } from '@/lib/setup/money';
import { WORK_MODES, type WorkMode } from '@/lib/setup/options';
import type { SetupState } from '@/lib/setup/steps';
import { PackSheet, type PackFields } from './PackSheet';
import { GroupLabel, StepHead } from './SetupShell';
import { StepFoot, skipHomeAction } from './StepFoot';
import { useStepAction } from './useStepAction';
import { Button } from '@/web-components/ui/Button';

/**
 * Frame 5d · `/setup/packs` — step 7, the price before the pipe.
 *
 * **How you work is asked first, because it decides which price lists exist.** An
 * independent trainer sells their own packs; a gym-employed one sells what the
 * gym's counter sets; plenty do both — freelance in the morning, the gym's floor
 * in the evening — and keep two lists. The answer is a **defaults hint, never a
 * gate**: who actually collects, and the gym's share, are still decided per
 * client at add-client time, because the mix changes month to month.
 *
 * **Skippable, and Continue is not the way to skip it.** Continue holds until
 * every list the chosen mode says exists has at least one price on it, and
 * **Skip** passes on the whole step — which is a different and honest answer,
 * one button away.
 *
 * The hold used to apply only to the gym's list, on the grounds that plenty of
 * trainers quote per client. That is true, and it is what Skip is for: because
 * `leavePacks` returns a destination without marking the step answered or
 * skipped, Continue on an empty list advanced and then sent the trainer back
 * here on their next sign-in. Same defect as the three list steps, same fix.
 *
 * Packs are written as they are added rather than at the end, so a trainer who
 * quits halfway still has their prices.
 */
export function PacksForm({ state, packs }: { state: SetupState; packs: Pack[] }) {
  const { run, pending, message, setMessage } = useStepAction();
  const [mode, setMode] = useState<WorkMode | null>(
    // A trainer with a gym on file from before `workMode` existed was shown both
    // price lists, so `both` is the faithful reading of pre-workMode data.
    state.workMode ?? (state.gymName ? 'both' : null),
  );
  const [gymName, setGymName] = useState(state.gymName ?? '');
  /** `undefined` until the trainer touches the gym field, so a save that never did leaves a stored link alone. */
  const [gymPlace, setGymPlace] = useState<PlaceHit | null | undefined>(undefined);
  const [adding, setAdding] = useState<'trainer' | 'gym' | null>(null);
  const [pressed, setPressed] = useState(false);

  const mine = packs.filter((p) => p.owner === 'trainer');
  const theirs = packs.filter((p) => p.owner === 'gym');

  const sellsOwn = mode === 'independent' || mode === 'both';
  const sellsGym = mode === 'gym' || mode === 'both';
  const trimmedGym = gymName.trim();
  /** The gym is only real once it has a name — an unnamed price list belongs to nobody. */
  const gym = sellsGym && trimmedGym.length > 0 ? trimmedGym : null;
  const needsGymPacks = gym != null && theirs.length === 0;
  /**
   * The same hold, on the trainer's own list — and the same bug as the three
   * list steps. `leavePacks` returns a destination without marking the step
   * answered or skipped, so Continue with an empty price list used to advance
   * and then send the trainer back here on their next sign-in.
   *
   * The old rule held only the gym case, on the grounds that "plenty of trainers
   * quote a number per client". True — and that answer is **Skip**, which is one
   * button away and says so. Continue means "this is my price list", and an
   * empty list is not one.
   */
  const needsOwnPacks = sellsOwn && mine.length === 0;

  /** Opening or closing the panel retires anything the slot said about it. */
  function panel(which: 'trainer' | 'gym' | null) {
    setAdding(which);
    if (message) setMessage(null);
  }

  function add(fields: PackFields, owner: 'trainer' | 'gym') {
    setAdding(null);
    run(() =>
      addPack({ ...fields, owner, orderIndex: packs.length }).then(async (result) => {
        // A gym package with no gym on the profile is a price nobody can
        // attribute: the Money screen would have nothing to head the group
        // with. So the name goes up the moment the first one is added, not a
        // screen later.
        if (result.ok && owner === 'gym' && mode) await saveWorkMode(mode, trimmedGym, gymPlace);
        return result;
      }),
    );
  }

  function submit() {
    setPressed(true);
    /**
     * MEASURED BUG, FIXED. A trainer who opened the pack panel, typed a name, a
     * count and a price, and then pressed Continue lost all of it without a
     * word: `leavePacks` navigates, and the panel's fields are local state on a
     * screen that has gone. The panel's own primary is the only thing that
     * writes a pack, so the step has to say which button they meant.
     */
    if (adding !== null) {
      setMessage({
        tone: 'warn',
        icon: 'warn',
        lead: 'Finish the pack you started, or cancel it.',
        rest: 'Nothing in that panel is saved until you press Add — and Continue would leave without it.',
      });
      return;
    }
    if (mode === null) return;
    if (sellsGym && trimmedGym.length === 0) return;
    if (needsGymPacks || needsOwnPacks) return;
    // Written before leaving, in case an answer was edited after the packages
    // were added — the profile has to end up saying what the screen said.
    run(async () => {
      const saved = await saveWorkMode(mode, sellsGym ? trimmedGym : '', gymPlace);
      return saved.ok ? leavePacks() : saved;
    });
  }

  return (
    <>
      <StepHead
        title="What do you sell?"
        sub="A price list set now is what makes every later screen work: selling a pack becomes picking one, and “₹750 a session” gets computed instead of guessed."
      />

      <GroupLabel top={22}>FIRST, HOW YOU WORK — IT DECIDES WHICH PRICE LISTS EXIST</GroupLabel>
      {/* MEASURED BUG, FIXED. These three set `border` inline — which is the
          exact defect `app.css` documents for frame 3a's two exits: an inline
          `border` outranks every selector, so `button.card:hover`'s border
          change never fires and all three cards are HOVER-DEAD. They also set
          `border-color` a second time on top of `.tinted`, which already sets
          it. `.card--pick` and `.card--pick-accent` were written for exactly
          this shape on 3a and carry the hover and focus states the inline
          version had no way to express, so this is the second caller rather
          than a second copy. */}
      <div className="row stp__row" style={{ gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
        {WORK_MODES.map((option) => {
          const on = mode === option.id;
          return (
            <button
              key={option.id}
              className={`card ${on ? 'card--pick-accent' : 'card--pick'}`}
              type="button"
              aria-pressed={on}
              style={{ flex: '1 1 180px' }}
              onClick={() => setMode(option.id)}
            >
              {/* `.h5` and `.small`, the same two classes Preflight's rows use.
                  These were 13.5/ink and 12/ink-3/1.45 declared inline — a third
                  type scale in a flow that already has one. */}
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
      {pressed && mode === null ? (
        <p className="fld__e" style={{ marginTop: 8 }}>
          Pick one — it decides which price lists to set up.
        </p>
      ) : null}

      {sellsOwn ? (
        <>
          <GroupLabel>YOUR OWN PACKS</GroupLabel>
          <PackTable packs={mine} pending={pending} onRemove={(id) => run(() => removePack(id))} />
          {adding === 'trainer' ? (
            <PackSheet
              owner="trainer"
              gymName={gym}
              pending={pending}
              onAdd={(fields) => add(fields, 'trainer')}
              onCancel={() => panel(null)}
            />
          ) : (
            <Button
              variant="secondary"
              style={{ marginTop: 12 }}
              onClick={() => panel('trainer')}
            >
              <IconPlus size={14} />
              {mine.length === 0 ? 'Add a pack' : 'Add another'}
            </Button>
          )}
          {pressed && needsOwnPacks ? (
            <p className="fld__e" style={{ marginTop: 10, maxWidth: '64ch' }}>
              Add one, or skip the step — Continue means “this is my price list”, and this one is
              empty.
            </p>
          ) : null}
        </>
      ) : null}

      {sellsGym ? (
        <>
          <GroupLabel>THE GYM YOU WORK AT</GroupLabel>
          <div style={{ maxWidth: 420 }}>
            <GymPicker
              id="gym"
              label="Which gym"
              name={gymName}
              place={gymPlace ?? null}
              invalid={pressed && trimmedGym.length === 0}
              onChange={(next) => {
                setGymName(next.name);
                setGymPlace(next.place as PlaceHit | null);
              }}
            />
            <span className="fld__h" style={{ marginTop: 6, display: 'block' }}>
              {pressed && trimmedGym.length === 0
                ? 'The gym needs a name before its packages can be attributed to it'
                : 'Their share of a session is set per client, when you add them.'}
            </span>
          </div>

          {gym ? (
            <>
              <GroupLabel>WHAT {gym.toUpperCase()} SELLS</GroupLabel>
              <PackTable
                packs={theirs}
                pending={pending}
                empty="Their counter’s prices, not yours. You’ll pick one of these whenever the gym collects instead of you."
                onRemove={(id) => run(() => removePack(id))}
              />
              {adding === 'gym' ? (
                <PackSheet
                  owner="gym"
                  gymName={gym}
                  pending={pending}
                  onAdd={(fields) => add(fields, 'gym')}
                  onCancel={() => panel(null)}
                />
              ) : (
                <Button
                  variant="secondary"
                  style={{ marginTop: 12 }}
                  onClick={() => panel('gym')}
                >
                  <IconPlus size={14} />
                  {theirs.length === 0 ? `Add a ${gym} package` : 'Add another'}
                </Button>
              )}
              {pressed && needsGymPacks ? (
                <p className="fld__e" style={{ marginTop: 10, maxWidth: '64ch' }}>
                  Add at least one, or skip the step — adding a client who pays at the counter has
                  nothing to pick otherwise.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      <MessageSlot message={message} />

      <p className="small" style={{ maxWidth: '66ch' }}>
        Per-session is computed, never typed — it is the number a client asks about.
        {mode === 'both' ? ' You picked Both, so there are two lists: yours, and the gym’s own packages, which their counter sets.' : null}
        <br />
        <br />
        Skipping the whole step is fine — plenty of trainers quote a number per client. But{' '}
        <b>Continue wants at least one price on every list you said exists</b>, because adding a
        client later asks who collects and then needs the matching prices. Skip is the honest way
        past; an empty list is not.
      </p>

      <StepFoot
        step="packs"
        pending={pending}
        onContinue={submit}
        onSkip={() => run(() => skipStep('packs'))}
        onSkipHome={skipHomeAction(state, run)}
      />
    </>
  );
}

/**
 * A price list, as a table.
 *
 * The phone reads one pack at a time; a desk compares rows — and comparing is
 * the whole reason per-session is on screen. Retiring is by status, never a
 * delete: a pack a package points at can never be removed, and rightly, because
 * retiring a price must not rewrite what was sold.
 */
function PackTable({
  packs,
  pending,
  empty = 'Nothing yet. Most trainers start with one or two.',
  onRemove,
}: {
  packs: Pack[];
  pending: boolean;
  empty?: string;
  onRemove: (id: string) => void;
}) {
  if (packs.length === 0) {
    return (
      <p className="small" style={{ maxWidth: '60ch' }}>
        {empty}
      </p>
    );
  }

  return (
    // §11 sets `white-space:nowrap` on every cell, so four columns is about
    // 460px at its narrowest — wider than a phone and not compressible, because
    // per-session BESIDE price is the whole reason this is a table rather than a
    // list. So the wrapper scrolls and the table keeps its scale, which is the
    // same call `.dr` makes one step earlier for the same reason.
    <div className="tblwrap" style={{ maxWidth: 560 }}>
    <table className="tbl" style={{ width: '100%' }}>
      <thead>
        <tr>
          <th>Pack</th>
          <th style={{ textAlign: 'right' }}>Price</th>
          <th style={{ textAlign: 'right' }}>Per session</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {packs.map((pack) => (
          <tr key={pack.id}>
            <td className="strong">{pack.name}</td>
            <td className="num">{rupees(pack.amount)}</td>
            <td className="num" style={{ color: 'var(--tx-accent-text)' }}>
              {/* A monthly fee has no session count to divide by, and an
                  invented one would be the guess this column exists to
                  replace. An em dash says "not applicable" rather than zero. */}
              {perSession(pack) != null ? rupees(perSession(pack)!) : '—'}
            </td>
            <td style={{ textAlign: 'right' }}>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => onRemove(pack.id)}
              >
                Remove
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

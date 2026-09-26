'use client';

import { ordinalDayWord } from '@/lib/programs/blueprint';
import { Button } from '@/web-components/ui/Button';

/**
 * A DAY THE PROGRAM DOES NOT TRAIN, drawn.
 *
 * `blueprint.ts` law 1 says rest is the ABSENCE of a slot, and for as long as
 * the board drew only `trainingDays` that absence was drawn by there being no
 * card — three cards on a three-day week and nothing to say where the other
 * four days went. The law is unchanged and the model is unchanged: a rest day
 * is still a slot missing from `trainingDays`, still an ordinal and never a
 * weekday. What changed is that the week now draws all seven slots, so the
 * absence is drawn as a card that STATES it rather than as a gap the trainer
 * has to infer — and the gap and "I have not laid that day out yet" were
 * indistinguishable, which is the whole reason this component exists.
 *
 * It writes ONE thing and it is the inverse of the day menu's *Mark as rest
 * day*. No name field (a day that is not trained has nothing to call), no
 * exercise list, no drop target — a movement dropped here would have to invent
 * a training day in flight, and that is a decision, not a gesture.
 *
 * ── WHAT IS PARKED ─────────────────────────────────────────────────────────
 *
 * Marking a day as rest does NOT remove its rows: `Builder.markRest` writes
 * `days` only, and the entries stay in the blueprint on that slot. So the card
 * says how many are waiting, because a trainer who marks Day 3 as rest and
 * comes back an hour later needs to know the six exercises are still there —
 * and a trainer who genuinely wants them gone has *Clear every exercise* on the
 * day menu, which says what it does.
 */
export interface RestCardProps {
  day: number;
  /** What this day is CALLED — `DAY 4` here, `THU` on a client's own copy. */
  dayWord?: (day: number) => string;
  /** The name the slot carries from the last time it was trained, if any. Kept
   *  and shown rather than cleared: *Upper B* on a rest card is how a trainer
   *  recognises the day they stood down. */
  label: string;
  /** Rows sitting on this slot, waiting for it to be trained again. */
  parked: number;
  /** Make it a training day. Absent on a read-only board. */
  onMakeWorkout?: () => void;
}

export function RestCard({ day, label, parked, onMakeWorkout, ...props }: RestCardProps) {
  const dayWord = props.dayWord ?? ordinalDayWord;

  return (
    /* `.wsd` FIRST, so a rest day is the same box as a training day — same
       width in the grid track, same radius, same `data-day` for the view
       transition `Builder` runs when the board re-places itself. `--rest` only
       takes the ink down and swaps the figures for the badge. A second layout
       here would make the week read as two rows of different things. */
    <section
      className="wsd wsd--rest"
      data-day={day}
      aria-label={`${dayWord(day)} · Rest day`}
    >
      <div className="wsd__hd">
        {/* A DIV, NOT A BUTTON. The training card's header opens the day; there
            is nothing to open here, and a header that looks pressable and is
            not is the false affordance §22 records. */}
        <div className="wsd__rt">
          <span className="wsd__d">{dayWord(day)}</span>
          {/* THE NAME, AND ONLY WHEN THERE IS ONE.
              This drew `label || 'Rest day'` — so an unnamed rest slot printed
              *Rest day* at 14px/700, the same weight as *Rebuild A* on the card
              beside it, eight pixels above a badge already reading `REST`. The
              day said what it was twice, and said it louder than the days that
              carry the work: on a two-day week that is five of the seven
              loudest strings on the board naming the thing the trainer is NOT
              doing. The card's own note makes this argument against the body
              repeating the header; it applies here first.

              The badge is what states rest now, `aria-label` on the section
              carries the sentence, and `.wsd__nm--rest` is left for the slot
              that genuinely has a name — *Upper B* on a card you stood down is
              the one thing here worth 14px, and it is the reason the label is
              kept rather than cleared. */}
          {label && <span className="wsd__nm wsd__nm--rest">{label}</span>}
          <span className="wsd__sp" />
          <span className="wsd__restb">REST</span>
        </div>
      </div>

      <div className="wsd__b">
        {/* TWO ELEMENTS, NOT ONE SENTENCE — and the split is what lets the
            116px lane drop half of it.
            *Nothing prescribed* and *four exercises are parked here* are a
            restatement and a fact respectively: the first repeats the `REST`
            badge one line above and the second is the only thing on this card a
            trainer cannot already see. Inside one `<p>` the lane could keep
            neither without keeping both. Apart, `.ws--week` hides the
            restatement and the fact always survives. */}
        <p className="wsd__none wsd__none--rest">Nothing prescribed.</p>
        {parked > 0 && (
          <p className="wsd__none wsd__park">
            {parked === 1
              ? '1 exercise parked here — it comes back'
              : `${parked} exercises parked here — they come back`}{' '}
            if you train this day again.
          </p>
        )}
        {onMakeWorkout && (
          <div className="wsd__ract">
            <Button variant="secondary" size="sm" onClick={onMakeWorkout} style={{ width: '100%' }}>
              Make it a workout
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

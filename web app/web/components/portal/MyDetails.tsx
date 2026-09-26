'use client';

import { useState, useTransition } from 'react';

import { PhoneChange } from '@/components/settings/PhoneChange';
import {
  cancelMyPhoneChange,
  confirmMyPhoneChange,
  correctMyDetails,
  requestMyNewNumber,
  setHideWeight,
  startMyPhoneChange,
  verifyMyCurrentNumber,
} from '@/lib/portal/actions';
import { useToast } from '@/lib/toast/store';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';
import { SwitchRow } from '@/web-components/ui/Switch';
import { Textarea } from '@/web-components/ui/Textarea';

/**
 * §5 · *My details* — **"contact, and health/injury information they can
 * update."** Plus §3's weight switch, which lives here because it is the only
 * other thing on this screen that is the client's own setting.
 *
 * ── TWO FIELDS, AND WHICH TWO IS THE DESIGN ─────────────────────────────────
 *
 * A client may correct their own PHONE and their own HEALTH text — the contact
 * detail the whole product routes through, and the injury information their
 * trainer trains them on. Both are facts about them that they know better than
 * anybody, which is exactly what §5's *Correct my data* is a right to.
 *
 * They may **not** edit their goal, their sessions a week or their schedule.
 * `mock/portal.ts` refuses those at the wire and says why: that is the coaching
 * arrangement, agreed between two people, and a screen letting one side rewrite
 * it silently would be a support ticket rather than a right. The *Your
 * arrangement* card on the Me tab is that refusal, said to the client.
 *
 * ── THE PHONE NUMBER IS NO LONGER A TEXT FIELD, AND THAT IS THE FIX ─────────
 *
 * It was one: a `TextField` sharing the Save button below, and one validation
 * behind it — `correctMyDetails` counted ten digits and wrote them. Mistype the
 * last one and the account had moved to a stranger's phone, with no
 * confirmation step, no second entry, no code and no sentence naming the
 * consequence.
 *
 * A client has no email and no password. The number IS the account: it is the
 * sign-in credential, it is what `resolve()` in `mock/portal.ts` matches to
 * find them, and it is the channel their trainer reaches them on. There is no
 * way back from moving it wrongly — the old number no longer signs in and the
 * new one is not theirs.
 *
 * **The codebase had already argued this, on the other half.**
 * `components/settings/PhoneChange.tsx` gives the identical field a four-step,
 * two-code flow and its docstring defends the second code even though the brief
 * did not ask for one: *"the failure it prevents is worse than the one it
 * costs … One extra code against an account that cannot be recovered is not a
 * close call."* Every word of that is true of a client and more so.
 * `DataRights.tsx` even names the asymmetry from the other direction — its
 * delete has no OTP, *"and that asymmetry with the phone-change flow is
 * deliberate"* — so this screen's own neighbour was already assuming a phone
 * change was protected here. It was not.
 *
 * So it is that component, with the portal's wire, in its own body above the
 * form. **Not inside the form**, and its position answers the question §5 asks
 * of this card: the number stays in the *correct my data* block, because that
 * is what changing it is — but it keeps its own control, because a four-step
 * ladder cannot share a Save button with a textarea any more than a switch can.
 *
 * ── ONE SAVE, AND IT IS A CHECKBOX-SHAPED FORM ──────────────────────────────
 *
 * The health text has a Save and the weight switch does not, and that is
 * `Switch`'s own rule rather than an inconsistency: a switch has saved by the
 * time the thumb lands, and a field has not. Mixing them under one button would
 * make the switch a checkbox and the button a lie about what it writes.
 */
export function MyDetails({
  phone,
  health,
  hideWeight,
  trainerFirstName,
  rosterCount,
}: {
  phone: string | null;
  health: string;
  hideWeight: boolean;
  trainerFirstName: string;
  /** How many trainers this number is on. Changes what moving it means. */
  rosterCount: number;
}) {
  const [healthValue, setHealthValue] = useState(health);
  const [failure, setFailure] = useState<string | null>(null);
  const [weightFailure, setWeightFailure] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [weightPending, startWeight] = useTransition();
  const toast = useToast();

  const dirty = healthValue !== health;

  function save() {
    setFailure(null);
    start(async () => {
      const res = await correctMyDetails({ health: healthValue });
      if (!res.ok) {
        setFailure(res.message);
        return;
      }
      toast.show({ variant: 'receipt', tone: 'ok', title: 'Your details are updated' });
    });
  }

  return (
    <Card>
      <CardHead title="Your details" />

      {/* ── the number they sign in with ─────────────────────────────────── */}
      <CardBody>
        <PhoneChange
          /* `PhoneChange` takes a string, and a client row can have a null
             phone — `MeWire` types it nullable because the trainer's own add
             flow can create a row without one. An empty string is the state
             the component already draws as an em dash. */
          phone={phone ?? ''}
          wire={{
            start: startMyPhoneChange,
            verifyCurrent: verifyMyCurrentNumber,
            requestNew: requestMyNewNumber,
            confirmNew: confirmMyPhoneChange,
            cancel: cancelMyPhoneChange,
          }}
          intact={`your sessions, your logs, your measurements and ${trainerFirstName} are all where they were`}
          /* The consequence a client cannot guess, and only where it is one.
             The number is not a column on one roster row — `resolve()` and
             `personaFor()` both key on it — so moving it moves every trainer
             this number trains with, and `mock/portal.ts` writes all of them
             for exactly that reason. The visibility card two tabs over
             promises these two arrangements cannot see each other; this is the
             one thing they genuinely share, so it is said before the flow
             starts rather than discovered after it. */
          extra={
            rosterCount > 1 ? (
              <p className="small mt2">
                Your number is on {rosterCount} trainers&rsquo; lists, and it is one number — so
                this moves all of them, not just {trainerFirstName}&rsquo;s.
              </p>
            ) : undefined
          }
        />
      </CardBody>

      {/* ── the health and injury text ───────────────────────────────────── */}
      <CardBody divided>
        <div className="col gap4">
          <Textarea
            label="Anything your trainer should know"
            name="health"
            rows={4}
            value={healthValue}
            onChange={(e) => setHealthValue(e.currentTarget.value)}
            /* The one field on this screen whose hint is a consent notice
               rather than help text. It names the reader, says when it is read,
               and — the sentence that matters — tells them they may leave things
               out. A field that asks for injuries without that line is a field
               that collects more than the person meant to give. */
            hint={`${trainerFirstName} reads this before your sessions. Injuries, anything that hurts, anything you would rather not do. Leave out whatever you would rather they did not have — this is yours to write and yours to change.`}
          />

          {failure && (
            <Message tone="err" alert>
              {failure}
            </Message>
          )}

          {/* The button exists only while there is something to save, which is
              the rule the trainer's own profile tabs settled: an always-live
              primary on a settings screen has to have an answer for being
              pressed with no edits in hand, and every available answer is bad.
              Nothing to do is better said by there being nothing to press. */}
          {dirty && (
            <div>
              <Button variant="primary" onClick={save} disabled={pending} loading={pending}>
                Save
              </Button>
            </div>
          )}
        </div>
      </CardBody>

      {/* ── §3's weight switch ─────────────────────────────────────────────

          Its own body with a rule above it, because it is a different KIND of
          control from the field above — it saves on the move — and because the
          sentence under it is the most carefully worded thing on this screen.

          §3: *"Let clients hide the weight metric entirely if they prefer. Some
          are working on strength; some have a difficult relationship with the
          number. Fitness apps built around weight as the hero metric can
          reinforce disordered patterns."*

          The copy therefore says what hiding DOES and does not editorialise
          about why somebody might. And it is honest about the limit: hiding it
          here does not hide it from the trainer, because the readings are on
          their screens too — a switch that implied otherwise would be the one
          promise on this screen the product cannot keep. */}
      <CardBody divided>
        {/* ── THE LABEL WAS INERT, LIKE `NotifySwitches`' SIX ──────────────

            The shape here was a `.row` of text plus a `Switch` at the end, and
            it carried the same defect for the same reason: at 390px the row is
            324px wide and only the **46x30** track answered a press. This is the
            one control on the card, and it was the smallest thing on it.

            `SwitchRow` is `c-switch`'s row form — the row IS the button, so the
            target is the card's full width, and the state word under the title
            is part of the accessible name rather than text floating beside a
            control that had its own `aria-label`. */}
        <SwitchRow
          checked={!hideWeight}
          title="Show my weight"
          example={hideWeight ? 'hidden on your progress screen' : 'shown on your progress screen'}
          disabled={weightPending}
          onChange={(next) =>
            startWeight(async () => {
              setWeightFailure(null);
              const res = await setHideWeight(!next);
              if (!res.ok) setWeightFailure(res.message);
            })
          }
        />
        {weightFailure && (
          <Message tone="err" alert className="mt3">
            {weightFailure}
          </Message>
        )}
        <p className="small mt3">
          Turn this off and weight disappears from your progress screen and from
          the box on your home screen. Strength, consistency and your
          measurements all stay.
        </p>
        <p className="small mt2 ink3">
          It does not hide anything from {trainerFirstName} — they take the
          readings, so they have them either way.
        </p>
      </CardBody>
    </Card>
  );
}

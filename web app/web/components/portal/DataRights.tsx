'use client';

import { useState, useTransition } from 'react';

import { formatPhone } from '@/lib/auth/policy';
import { deleteMyAccount, downloadMyData } from '@/lib/portal/actions';
import {
  GRIEVANCE_OFFICER,
  GRIEVANCE_REDRESSAL_DAYS,
  GRIEVANCE_RESPONSE_DAYS,
  GRIEVANCE_TEL,
} from '@/lib/portal/grievance';
import { useToast } from '@/lib/toast/store';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { Message } from '@/web-components/ui/Message';
import { TextField } from '@/web-components/ui/Field';

import { Nominee } from './Nominee';

/**
 * §5's remaining rights — **"Download my data — export"**, **"Delete my
 * account — a real, working flow, not an email address"**, and the two the
 * screen was missing.
 *
 * That *not an email address* clause is the whole reason this component is not
 * two buttons and a `mailto:`. §5 opens with *"Clients are data principals with
 * real rights. Build these once, properly"*, and the delete below removes the
 * rows — `mock/portal.ts` states exactly what survives and why.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TWO OF THE FIVE WERE MISSING, AND ONE OF THEM IS MANDATORY
 *
 * The DPDP Act 2023 gives a data principal five rights. This screen built three:
 *
 *   | Right                              | §   | Was            |
 *   | ---------------------------------- | --- | -------------- |
 *   | Access — a summary of what is held | 11  | the download   |
 *   | Correction and erasure             | 12  | the form, the delete |
 *   | **Grievance redressal**            | 13  | **absent**     |
 *   | **Nomination**                     | 14  | **absent**     |
 *
 * §13 is not a policy paragraph and it is not optional. Rule 9 of the DPDP
 * Rules 2025 requires a fiduciary to appoint a grievance officer, **publish**
 * their contact details, and operate a stated procedure with stated timelines —
 * and a data principal must exhaust that route before approaching the Data
 * Protection Board. Before this, a client who believed their record was wrong
 * had exactly one route on the screen: WhatsApp, to the person the complaint
 * might be about.
 *
 * §14 is the only right on the list a client cannot exercise for themselves
 * later, because it is about not being able to. `Nominee.tsx` holds it.
 *
 * ── THE ORDER OF THE FOUR BODIES IS THE ARGUMENT ────────────────────────────
 *
 * Take a copy · complain · name someone · leave. A client who came here to
 * leave is offered their data first, then the two routes that are alternatives
 * to leaving, and the irreversible one last. That is the same reasoning the
 * download-before-delete order already carried, extended to four.
 */
export function DataRights({
  clientName,
  phone,
  phonePretty,
  trainerFirstName,
  rosterCount,
  nominee,
}: {
  clientName: string;
  phone: string | null;
  /** `+91 98401 37911`. What the confirmation field is checked against. */
  phonePretty: string | null;
  trainerFirstName: string;
  /** How many trainers this number is on. Changes what deleting means. */
  rosterCount: number;
  /** §14's nominee, or `null` where they have not named anybody. */
  nominee: { name: string; phone: string } | null;
}) {
  const [downloading, startDownload] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const toast = useToast();

  const first = clientName.split(' ')[0];

  /* Matched on the last ten digits, so the number printed one card up — with
     its `+91` and its space — is an accepted answer. The server checks the same
     thing, and `deleteMyAccount`'s own comment says why it has to: a
     confirmation that lives only in a client component is one a mis-wired
     button skips, and this is the call that cannot be undone. */
  const ready =
    typed.replace(/\D/g, '').slice(-10) === (phone ?? '').replace(/\D/g, '').slice(-10) &&
    (phone ?? '').length > 0;

  function download() {
    setFailure(null);
    startDownload(async () => {
      const res = await downloadMyData();
      if (!res.ok) {
        setFailure(res.message);
        return;
      }
      /* THE FILE IS BUILT IN THE BROWSER FROM A SERVER ACTION'S RETURN, and
         that is deliberate rather than convenient.

         The alternative is a route that streams it, and a signed URL returning
         somebody's whole training record is a URL that gets forwarded, cached
         and indexed — the exact thing the card above this one promises nobody
         else can read. An action's response goes to the tab that asked and
         nowhere else.

         `URL.revokeObjectURL` matters: without it the blob is held for the life
         of the document, and this one is the client's entire history. */
      const blob = new Blob([res.value], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inclineyou-${first.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.show({
        variant: 'receipt',
        tone: 'ok',
        title: 'Your data is downloading',
        body: 'One file, everything this app holds about you.',
      });
    });
  }

  return (
    <>
    <Card>
      <CardHead title="Your data" />

      {/* ── download ─────────────────────────────────────────────────────── */}
      <CardBody>
        {/* An `<h3>` where this was a `<p className="h5">`. Eighteen elements
            on this screen carried a heading's type styles and were paragraphs,
            against seven real headings on 4,075px of scroll — so a screen
            reader walking the page by structure got seven stops and the longest
            card in the portal was one of them. `.h5` is pure type
            (`font-size:13px;font-weight:700`) and `webapp.css`'s reset zeroes
            heading margins, so the swap moves nothing on screen. */}
        <h3 className="h5">Take a copy</h3>
        <p className="small mt2">
          One file with everything: every session, every set you have logged, your
          measurements, your packages and payments, and the notes{' '}
          {trainerFirstName} has written to you. It is JSON — the format a
          developer or another app can read.
        </p>
        <div className="mt3">
          <Button
            variant="secondary"
            onClick={download}
            disabled={downloading}
            loading={downloading}
          >
            Download my data
          </Button>
        </div>
        <p className="small mt3 ink3">
          {/* The one thing the export does NOT contain, said before somebody
              opens the file and wonders. `visibility.ts`'s
              `TRAINER_KEEPS_NOTES` makes the same point one card up; this is
              the version that is about the download. */}
          {trainerFirstName}&rsquo;s own private coaching notes are not in it —
          those are theirs, not part of your record.
        </p>
      </CardBody>

      {/* ── §13 · grievance redressal ───────────────────────────────────────

          The route a client takes when they think their record is wrong and
          the person holding it is the problem. `lib/portal/grievance.ts` holds
          the contact and the two periods, and carries the ⚠ on the placeholder:
          Rule 9 is a PUBLICATION obligation, so a card printing a contact
          nobody reads is worse than no card — it is a promise of a route, made
          to somebody who has just been told they must exhaust it.

          The first sentence names what this is NOT, before the address. A
          client who has a WhatsApp button at the top of the same destination
          will otherwise assume it covers this, and it does not: that button
          reaches the trainer, and this exists for the case where the trainer is
          who the complaint is about. */}
      <CardBody divided>
        <h3 className="h5">Something wrong with your data?</h3>
        <p className="small mt2">
          If something in here about you is wrong, or you think it has been handled badly, this is
          a route to us and not to {trainerFirstName}. Use it even if — especially if — the problem
          is what your trainer has done with it.
        </p>
        <p className="small mt3" style={{ color: 'var(--tx-ink)' }}>
          {GRIEVANCE_OFFICER.name}
          <br />
          <InlineLink href={`mailto:${GRIEVANCE_OFFICER.email}`}>
            {GRIEVANCE_OFFICER.email}
          </InlineLink>
          {' · '}
          <InlineLink href={GRIEVANCE_TEL}>{formatPhone(GRIEVANCE_OFFICER.phone)}</InlineLink>
        </p>
        <p className="small mt3">
          {/* The timelines are the whole reason this is a route rather than an
              address. A person told to complain and given no period is a person
              with no way to know when they have waited long enough. */}
          You will get a reasoned answer within {GRIEVANCE_RESPONSE_DAYS} days, and it will be put
          right within {GRIEVANCE_REDRESSAL_DAYS}. If we have not, you can take it to the Data
          Protection Board of India — but they will ask you to have come here first, which is why
          this is written down.
        </p>
      </CardBody>

      {/* ── §14 · nomination ───────────────────────────────────────────────── */}
      <Nominee nominee={nominee} />
    </Card>

      {/* ── delete · ITS OWN CARD, AND THE FOOT OF THE SCREEN ────────────────

          Its own card, last of the four, and in that order for a reason: a
          client who came here to leave is offered their data, then the two
          routes that are alternatives to leaving, and only then this.

          ── IT WAS THE FOURTH BODY OF A 1,295px CARD ───────────────────────

          MEASURED at 390px: *Your data* stood 1,295px in a 620px window, so the
          one irreversible thing in the portal began on the third screen of a
          card headed with the word *data* — filed under the same title as
          taking a copy of it. The trainer's own half settled this: `.cfdz`
          spans the foot of the Personal information tab on the argument that
          **a danger zone is what a screen ENDS with, not a peer of the phone
          number above it**, and §04 has carried `.card--danger` for it since.

          So the delete is a card, it is `tone="danger"`, and it is the last
          thing on the last tab. The three rights above it keep *Your data*,
          which now describes all three of them rather than three of four. */}
    <Card tone="danger">
      {/* ── THE CONFIRMATION IS THE NUMBER, TYPED ──────────────────────────

          Not a checkbox and not a second *Are you sure*: both are pressed by
          the same reflex that pressed the first button, and typing ten digits
          is not. It is also the only confirmation that names WHICH account is
          going — which matters on a shared phone. The trainer's own account
          delete settled this exact question the same way.

          There is no OTP, and the asymmetry with a phone-number change is
          considered: taking over a number is an attacker's goal, and deleting
          is nobody's goal but the owner's — it destroys what an attacker would
          want and hands them nothing. What it needs protecting from is a
          mis-tap.                                                            */}
      <CardHead title="Delete your account" />
      <CardBody>

        {!confirming ? (
          <>
            <p className="small mt2">
              This removes your side of it: your sessions, your logs, your
              measurements and your packages, and{' '}
              {rosterCount > 1
                ? `it ends this arrangement only — your other trainer's is untouched.`
                : `${trainerFirstName} will no longer have you on their roster.`}
            </p>
            <p className="small mt2">
              Your payments stay on {trainerFirstName}&rsquo;s books without your
              name on them. They have to — it is their accounting record, and it
              outlives your account whatever we would prefer.
            </p>
            <p className="small mt2">
              {/* HOW LONG, which is the first thing somebody about to press
                  this wants and the copy did not say. An amount and a date with
                  no name attached is what is left, and saying that plainly is
                  the difference between a stated exception and a hedge. Eight
                  years is the retention the Income-tax Act's books-of-account
                  rule puts on a trainer, so it is their obligation this
                  sentence is describing rather than ours. */}
              Those rows are an amount and a date with nothing linking them to you, and a trainer
              has to keep their books for eight years. Everything that is about YOU — sessions,
              logs, measurements, packages, your health note, your notification settings — goes
              now, not on a schedule.
            </p>
            <p className="small mt2">
              It cannot be undone, and signing in again with this number will not
              bring it back.
            </p>
            <div className="mt3">
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                Delete my account
              </Button>
            </div>
          </>
        ) : (
          <>
            <Message tone="err" className="mt2">
              This is permanent. Everything above goes, now.
            </Message>
            <div className="mt3" style={{ maxWidth: 320 }}>
              <TextField
                label="Type your number to confirm"
                name="confirm"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.currentTarget.value)}
                hint={phonePretty ? `The number on this account is ${phonePretty}.` : undefined}
              />
            </div>
            {failure && (
              <Message tone="err" alert className="mt3">
                {failure}
              </Message>
            )}
            <div className="row gap3 mt3" style={{ flexWrap: 'wrap' }}>
              <Button
                variant="danger"
                disabled={!ready || deleting}
                loading={deleting}
                onClick={() =>
                  startDelete(async () => {
                    setFailure(null);
                    const res = await deleteMyAccount(typed);
                    /* Only a failure returns — the action redirects to
                       `/sign-in?left=1` on success, and `redirect()` throws to
                       unwind, so there is no success branch to write. */
                    if (!res.ok) setFailure(res.message);
                  })
                }
              >
                Delete it
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirming(false);
                  setTyped('');
                  setFailure(null);
                }}
              >
                {/* *Keep it* rather than *Cancel*: `Modal`'s own rules row says
                    the cancel says what it keeps, and on this card what it
                    keeps is an account. */}
                Keep my account
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
    </>
  );
}

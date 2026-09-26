'use client';

import { useState, useTransition } from 'react';

import { setNominee } from '@/lib/portal/actions';
import { formatPhone } from '@/lib/auth/policy';
import { useToast } from '@/lib/toast/store';
import { Button } from '@/web-components/ui/Button';
import { CardBody } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';
import { TextField } from '@/web-components/ui/Field';

/**
 * DPDP Act 2023 §14 — **nomination.** The fifth of the five rights, and the
 * only one on the list a client cannot exercise for themselves later.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT IT IS, IN THE CLIENT'S WORDS
 *
 * §14 lets a data principal name one person who may exercise §§11–13 — see what
 * is held, correct it, delete it — if they die or become incapable of acting.
 * Every other right on this screen can be used the day it is needed. This one
 * has to be set up before, by definition, which is why it is the one worth
 * asking about on a screen somebody is already reading.
 *
 * The copy therefore does not say "incapacity" and does not say "§14". It says
 * what happens and when, once, and then stops. A right explained in the words
 * of the statute is a right nobody uses.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHERE IT IS STORED, AND WHY THAT IS THE FINDING
 *
 * `client_prefs.nominee`, beside the weight switch — **not** in
 * `client.metadata` beside the health text, which was the obvious place.
 * `mock/types.ts` carries the full argument; the short form is that `metadata`
 * is one JSON object on the row the TRAINER edits, it is projected to every
 * trainer read, and `status-actions.ts` read-modify-writes the whole blob when a
 * trainer pauses somebody. A nominee stored there would be visible to the
 * trainer and would travel through a write the client never made.
 *
 * `client_prefs` is the only table in this book the trainer's half never reads,
 * which is what lets the row on the visibility card two bodies up say *"your
 * trainer cannot see it"* and be telling the truth. It is also two facts about a
 * THIRD person, who has not consented to anything and is not a user of this
 * product — the strongest of the three reasons to keep it out of a coaching
 * record.
 *
 * ── WITHDRAWING IS THE OTHER HALF OF THE RIGHT ──────────────────────────────
 *
 * §14 says a data principal MAY nominate. A screen that could only ever add
 * one would be a screen where the safest thing a cautious person can do is
 * never start — so *Remove* is beside *Change*, at the same weight, and it
 * needs no confirmation: it destroys nothing but a permission the client gave.
 */
export function Nominee({
  nominee,
}: {
  nominee: { name: string; phone: string } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(nominee?.name ?? '');
  const [phone, setPhone] = useState(nominee?.phone ?? '');
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const ready = name.trim().length > 0 && phone.replace(/\D/g, '').length >= 10;

  function save() {
    setFailure(null);
    start(async () => {
      const res = await setNominee({ name, phone });
      if (!res.ok) {
        setFailure(res.message);
        return;
      }
      setEditing(false);
      toast.show({
        variant: 'receipt',
        tone: 'ok',
        title: 'Saved',
        body: `${name.trim()} can act on your data rights if you cannot.`,
      });
    });
  }

  function remove() {
    setFailure(null);
    start(async () => {
      const res = await setNominee(null);
      if (!res.ok) {
        setFailure(res.message);
        return;
      }
      setName('');
      setPhone('');
      setEditing(false);
      toast.show({ variant: 'receipt', tone: 'ok', title: 'Nobody is named now' });
    });
  }

  return (
    <CardBody divided>
      <h3 className="h5">Someone to act for you</h3>

      {!editing ? (
        <>
          {nominee ? (
            <>
              <p className="small mt2">
                <b style={{ color: 'var(--tx-ink)' }}>{nominee.name}</b> — {formatPhone(nominee.phone)}
              </p>
              <p className="small mt2">
                If you die or become unable to act for yourself, they may ask us for a copy of your
                data, ask us to correct it, or ask us to delete it. Nothing else — they cannot see
                your training or message your trainer.
              </p>
            </>
          ) : (
            <p className="small mt2">
              You can name one person who may ask us for a copy of your data, ask us to correct it,
              or ask us to delete it — but only if you die or become unable to ask yourself.
              Nothing else, and nothing while you can still ask. Most people leave this empty.
            </p>
          )}
          <div className="row gap3 mt3" style={{ flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setEditing(true)} disabled={pending}>
              {nominee ? 'Change who it is' : 'Name someone'}
            </Button>
            {nominee && (
              <Button variant="ghost" onClick={remove} disabled={pending} loading={pending}>
                {/* Says what it does to the nomination rather than *Remove*,
                    which on a card of data rights reads as removing data.
                    `Modal`'s rules row: the withdrawal names what it undoes. */}
                Nobody, thanks
              </Button>
            )}
          </div>
          <p className="small mt3 ink3">
            {/* Said before somebody types a relative's number into a fitness
                app, not after. The storage note in this file's docstring is the
                reason this sentence is true rather than reassuring. */}
            Their name and number are held for this one purpose. {nominee ? 'They are' : 'They would be'}{' '}
            visible to nobody but you — not to your trainer — and they are in your download.
          </p>
        </>
      ) : (
        <>
          <p className="small mt2">
            Ask them first. This gives them the right to see and delete your training record, and
            it is a right they can only ever use if you cannot.
          </p>
          <div className="col gap4 mt3" style={{ maxWidth: 320 }}>
            <TextField
              label="Their name"
              name="nominee-name"
              autoComplete="off"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <TextField
              label="Their mobile number"
              name="nominee-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
              hint="How we would reach them. We never message it otherwise."
            />
          </div>
          {failure && (
            <Message tone="err" alert className="mt3">
              {failure}
            </Message>
          )}
          <div className="row gap3 mt3" style={{ flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              onClick={save}
              disabled={!ready || pending}
              loading={pending}
            >
              Save
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setName(nominee?.name ?? '');
                setPhone(nominee?.phone ?? '');
                setFailure(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
    </CardBody>
  );
}

'use client';

import { useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { TopBar } from '@/components/shell/TopBar';
import type { Message } from '@/lib/auth/copy';
import { upiPayLink } from '@/lib/money/upi';
import { savePaymentSetup } from '@/lib/practice/actions';
import { BUSINESS_LIMITS, type BusinessWire } from '@/lib/practice/types';
import { isUpiFormat } from '@/lib/setup/upi';
import { AffixField } from '@/web-components/ui/AffixField';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { TextField } from '@/web-components/ui/Field';
import { QrCode } from '@/web-components/ui/QrCode';
import { SwitchRow } from '@/web-components/ui/Switch';
import { Tag } from '@/web-components/ui/Tag';
import { BrandMark } from '@/web-components/ui/BrandMark';
import { BizHeader } from './BizHeader';

/**
 * BUSINESS → PAYMENT SETUP (V50, 23 Nov 2026; `release/business-module-plan.html`) — how clients pay you.
 * Since 25 Nov 2026 drawn as *Ways clients pay you* (one card a method, led by its `BrandMark`) and *Rules*.
 *
 * The UPI ID used to sit in Settings → Business beside the postal address. It decides how money reaches the trainer, so it
 * lives with the money now, with what belongs beside it:
 *
 *   · UPI — the ID, a live QR of it, and *Test with ₹1* (the setup step's proof: one wrong letter sends money to a stranger,
 *     and only a real ₹1 shows whose name the bank has on it).
 *   · Collect at the gym — the trainer's own phone as the till: type an amount, show the QR, the client scans it there and
 *     then. That is how most Indian trainers are actually paid, standing on the floor.
 *   · Part payments — whether a client may report paying part of what is left on a pack ("I've paid" ₹3,000 of ₹6,000).
 *   · Autopay with Razorpay — Coming soon, by the owner's call. It is the end goal (`release/autopay-design.html`): the
 *     client authorises a UPI Autopay mandate once and every renewal is paid into the trainer's OWN Razorpay account.
 *     InclineYou never touches the money.
 *
 * One Save for the two settings that are stored (UPI ID, part payments). The QR tools change nothing and need no Save.
 * Only the workspace's owner may change it (V46); anyone else reads it.
 */
export function PaymentSetup({ initial }: { initial: BusinessWire }) {
  const [saved, setSaved] = useState(initial);
  const [upi, setUpi] = useState(initial.upiVpa ?? '');
  const [part, setPart] = useState(initial.partPayments);
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState('');
  /* THE ₹1 TEST IS SHOWN WHEN IT IS NEEDED, NOT ALWAYS (25 Nov 2026). Two codes on one screen —
     the test and the gym till — is one code a client may scan by mistake. Nothing records that the
     test was done (only the trainer sees whose name their UPI app shows), so this never says
     *verified*: a NEW or CHANGED ID shows its test code by itself, because that is when one wrong
     letter is likely; a SAVED ID keeps it behind *Test with ₹1*, for a recheck any time. */
  const [testOpen, setTestOpen] = useState(false);

  const locked = !saved.canEdit || pending;
  const trimmed = upi.trim();
  const shapeOk = trimmed === '' || isUpiFormat(trimmed);
  const dirty = trimmed !== (saved.upiVpa ?? '') || part !== saved.partPayments;
  const live = saved.upiVpa ?? null;
  const collect = Number(amount);
  const collectOk = Number.isFinite(collect) && collect > 0;
  const unsavedId = trimmed !== '' && trimmed !== (saved.upiVpa ?? '');
  const showTest = trimmed !== '' && shapeOk && (unsavedId || testOpen) && !collectOk;
  const testLink = trimmed !== '' && shapeOk
    ? upiPayLink({ vpa: trimmed, payeeName: saved.name, amount: 1, note: 'InclineYou UPI check' })
    : '';

  function save() {
    setTouched(true);
    if (!shapeOk) return;
    setMessage(null);
    start(async () => {
      const r = await savePaymentSetup({ upiVpa: trimmed === '' ? null : trimmed, partPayments: part });
      if (!r.ok) {
        setMessage({ tone: 'err', icon: 'warn', lead: r.message });
        return;
      }
      setSaved(r.business);
      setUpi(r.business.upiVpa ?? '');
      setPart(r.business.partPayments);
      setTouched(false);
      setMessage({ tone: 'ok', icon: 'check', lead: 'Saved.', rest: 'Clients see it on their Home and Payments screens.' });
    });
  }

  return (
    <>
      <TopBar crumb="Business / Payment setup" title="Business" />
      <main className="main" id="main-content">
        <BizHeader title="Payment setup" subtitle="How clients pay you. The money goes straight to you — never through InclineYou." showPeriod={false} />
        <div className="body">
          <form
            className="acxw"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {/* WAYS CLIENTS PAY YOU, one card a method (25 Nov 2026). It was a 2×2 grid of four peers —
                UPI, a rule, a till and Razorpay — so the two payment methods read as two of four settings and
                nothing said which was live. Each method now leads with its mark, says in one line what it
                does, and carries its state; the till lives inside UPI because it IS UPI; the rule sits apart. */}
            <div className="pst">
              {!saved.canEdit && <p className="small bz-lock">Only the owner of this workspace can change how clients pay.</p>}
              <h2 className="pst__h">Ways clients pay you</h2>

              <Card className="pst__m">
                <div className="pst__mhd">
                  <BrandMark brand="upi" />
                  <div className="pst__mt">
                    <h3>UPI</h3>
                    <p>Clients pay from GPay, PhonePe or Paytm, straight into your bank account.</p>
                  </div>
                  {live ? <Tag tone="ok">On</Tag> : <Tag>Not set up</Tag>}
                </div>

                <div className="pst__mb">
                  <div className="pst__id">
                    <TextField
                      label="Your UPI ID"
                      hint="Clients see it on what they owe, in Pay with UPI and in your payment reminders."
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder="98xxxxxx10@okaxis"
                      value={upi}
                      maxLength={BUSINESS_LIMITS.upi}
                      error={touched && !shapeOk ? 'It should look like name@bank.' : undefined}
                      disabled={locked}
                      onBlur={() => setTouched(true)}
                      onChange={(e) => {
                        setUpi(e.target.value);
                        if (message) setMessage(null);
                      }}
                    />
                  </div>
                  {showTest ? (
                    <div className="pst__test">
                      <a href={testLink} className="pst__qr" aria-label={`Pay ₹1 to ${trimmed} with a UPI app`}>
                        <QrCode key={trimmed} value={testLink} label={`UPI payment code for ₹1 to ${trimmed}`} size={128} />
                      </a>
                      <div className="small">
                        <p><b>Test it with ₹1.</b> Scan with any UPI app, or tap the code on a phone.</p>
                        <p className="mt2">Check the name your app shows before you pay. If it isn’t yours, this ID is wrong: one letter off sends a client’s money to a stranger.</p>
                        {!unsavedId && (
                          <Button variant="ghost" size="sm" className="mt2" aria-expanded onClick={() => setTestOpen(false)}>Hide the test code</Button>
                        )}
                      </div>
                    </div>
                  ) : trimmed !== '' && shapeOk && !unsavedId ? (
                    <div className="pst__retest small">
                      <p>Pay yourself ₹1 to check the name your UPI app shows for this ID.</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-expanded={false}
                        onClick={() => { setAmount(''); setTestOpen(true); }}
                      >
                        Test with ₹1
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="pst__sub">
                  <h4>Collect at the gym</h4>
                  {live ? (
                    <div className="pst__till">
                      <div className="pst__id">
                        <AffixField label="Amount to collect" unit="rupees" affix="₹" id="pst-amount" type="number" min="1" step="1"
                          value={amount} onChange={(e) => { setAmount(e.target.value); setTestOpen(false); }}
                          hint="Type the amount and turn your screen to the client. Their UPI app fills in you and the amount. Record it on their Payments once it shows in your UPI app." />
                      </div>
                      {collectOk && (
                        <div className="pst__collect">
                          <QrCode value={upiPayLink({ vpa: live, payeeName: saved.name, amount: collect, note: 'Training' })}
                            label={`UPI payment code for ₹${collect} to ${live}`} size={200} />
                          <p className="small">Scan to pay <b>₹{collect.toLocaleString('en-IN')}</b> to <span className="mono">{live}</span></p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="small">Save your UPI ID first: the payment code is made from it.</p>
                  )}
                </div>
              </Card>

              <Card className="pst__m pst__m--soon">
                <div className="pst__mhd">
                  <BrandMark brand="razorpay" />
                  <div className="pst__mt">
                    <h3>Autopay with Razorpay</h3>
                    <p>Renewals are paid automatically into your own Razorpay account. No chasing at the end of a pack.</p>
                  </div>
                  <Tag tone="info">Coming soon</Tag>
                </div>
                <div className="pst__mb pst__mb--soon">
                  <ol className="pst__steps">
                    <li><span><b>Connect your Razorpay account.</b> No account yet? We’ll take you to make one.</span></li>
                    <li><span><b>The client approves a UPI Autopay mandate</b> once, from their own UPI app.</span></li>
                    <li><span><b>Each renewal lands in your account</b> on its own. InclineYou never holds your money and takes no cut.</span></li>
                  </ol>
                  <Button variant="secondary" disabled>Connect Razorpay</Button>
                </div>
              </Card>

              <h2 className="pst__h">Rules</h2>
              <Card className="pst__m">
                <SwitchRow
                  checked={part}
                  disabled={locked}
                  onChange={(next) => {
                    setPart(next);
                    if (message) setMessage(null);
                  }}
                  title="Let clients pay part of a pack"
                  example={part
                    ? 'A client can tell you they paid ₹3,000 of a ₹6,000 pack. The rest stays owed.'
                    : 'A client can only tell you they paid all of what is left on a pack.'}
                />
                <p className="small mt3">
                  When a client pays you by UPI they tap <b>I’ve paid</b> in their portal, with the UPI reference if they have it.
                  It shows under <b>To confirm</b> on your Overview, and nothing counts as paid until you confirm it.
                </p>
              </Card>
            </div>

            {saved.canEdit && (dirty || pending || message) && (
              <div className="bz-save">
                <MessageSlot message={message} />
                {(dirty || pending) && (
                  <div className="pst__save">
                    <Button type="submit" variant="primary" disabled={pending || !shapeOk}>{pending ? 'Saving…' : 'Save'}</Button>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      </main>
    </>
  );
}

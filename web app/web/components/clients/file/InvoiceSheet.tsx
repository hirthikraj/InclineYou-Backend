'use client';

import { useState, useTransition } from 'react';

import { issueInvoice } from '@/lib/money/actions';
import { rupees } from '@/lib/today/time';
import { useToast } from '@/lib/toast/store';
import { formatPhone } from '@/lib/auth/policy';
import {
  invoiceFigures,
  invoiceMessage,
  isCollected,
  methodLabel,
  packName,
  whatsappUrl,
} from '@/lib/clients/billing';
import type {
  ClientPackageWire,
  ClientPaymentWire,
} from '@/lib/clients/client-api';

import { longDateStr, isoDateStr } from './shared';
import { Button } from '@/web-components/ui/Button';
import { Invoice } from '@/web-components/ui/Invoice';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { Tag } from '@/web-components/ui/Tag';

/**
 * THE BILL, AND THE TWO THINGS A TRAINER DOES WITH IT.
 *
 * Look at it, and send it. Everything else this sheet could have been — an
 * editor, a template picker, a place to add line items — would be building a
 * second billing product inside a coaching one. What a personal trainer needs
 * when a client says *can I have a bill for that* is the bill, with the right
 * name on it, in WhatsApp, in under ten seconds.
 *
 * ── RAISE IS A SEPARATE, DELIBERATE STEP ────────────────────────────────────
 *
 * The sheet opens on a bill that has **not** been raised yet, drawn exactly as
 * it will be, with *Not raised yet* where the number goes. Minting is the
 * primary button and nothing mints on open.
 *
 * That is not caution for its own sake. An invoice number is a position in a
 * sequence a CA reads in March, and the sequence must not have holes in it — so
 * a number handed out because somebody tapped a row to look at it is a hole
 * that has to be explained. Showing the document first also does the thing a
 * confirm dialog pretends to do and usually does not: the trainer checks the
 * client's name and the amount while they still have a choice.
 *
 * ── SHARING IS A MESSAGE, NOT A LINK ────────────────────────────────────────
 *
 * `lib/clients/billing.ts` carries the argument. Short version: every screen in
 * this console is behind the trainer's own session, so a link is a sign-in wall
 * for somebody who has no account — and the text is what the client forwards to
 * an office anyway.
 *
 * ── AND PRINT IS NOT A CONSOLATION PRIZE ────────────────────────────────────
 *
 * It is how a PDF gets made. `.inv` is the one component in the design system
 * with a print rule, and `app.css` hides the rest of the console while this
 * sheet is open, so *Print* → *Save as PDF* produces a clean A4 bill with no
 * rail, no tab strip and no scrim on it.
 */
export function InvoiceSheet({
  payment,
  pkg,
  clientName,
  clientPhone,
  trainerName,
  trainerPhone,
  trainerUpiVpa,
  trainerHeadline,
  onClose,
}: {
  /** `invoiceNo` / `invoicedAt` are later-schema (R27) — absent on every v1 row. */
  payment: ClientPaymentWire & { invoiceNo?: string | null; invoicedAt?: number | null };
  /** The pack the money was against. Null for a payment recorded on its own. */
  pkg: ClientPackageWire | null;
  clientName: string;
  clientPhone: string | null;
  trainerName: string;
  trainerPhone: string | null;
  trainerUpiVpa: string | null;
  trainerHeadline: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, startWrite] = useTransition();
  /*
   * The number, held here as well as on the row.
   *
   * `issueInvoice` revalidates, so the row arrives with its number on the next
   * render — but a modal that is already open would go on saying *Not raised
   * yet* under a button that had plainly worked until the server round trip
   * finished. The local copy is what the sheet draws the moment the write
   * returns; the revalidated row is what the table behind it draws.
   */
  const [minted, setMinted] = useState<string | null>(payment.invoiceNo ?? null);
  const number = minted ?? payment.invoiceNo ?? null;

  const figures = invoiceFigures(pkg);
  const what = packName(pkg);
  const paidAt = payment.paidAt ?? payment.createdAt;
  const paid = isCollected(payment);
  const amount = rupees(figures.net || Number(payment.amount));

  const message = number
    ? invoiceMessage({
        invoiceNo: number,
        clientName,
        trainerName,
        what,
        amount,
        paidOn: longDateStr(paidAt),
        upiVpa: trainerUpiVpa,
      })
    : '';
  const share = number ? whatsappUrl(clientPhone, message) : null;

  function raise() {
    startWrite(async () => {
      const result = await issueInvoice(payment.id);
      if (result.ok && result.invoiceNo) {
        setMinted(result.invoiceNo);
        toast.show({
          tone: 'ok',
          variant: 'receipt',
          title: `Invoice ${result.invoiceNo} raised`,
          body: `${amount} to ${clientName.split(' ')[0]}. Send it whenever you like.`,
        });
      } else {
        toast.show({
          tone: 'danger',
          title: 'That invoice was not raised',
          body: result.message ?? 'Nothing changed.',
        });
      }
    });
  }

  function copy() {
    navigator.clipboard?.writeText(message).then(
      () => toast.show({ tone: 'ok', variant: 'receipt', title: 'Invoice copied' }),
      () => toast.show({ tone: 'danger', title: 'Could not copy it' }),
    );
  }

  return (
    <ModalHost onClose={onClose} cover="frame">
      <Modal
        /* NOT the number. The document says it in 15px mono four lines below,
           and a dialog whose title is the thing inside it has spent the one
           line that could have said WHOSE bill this is. */
        title={`Invoice for ${clientName}`}
        width={640}
        className="invsh"
        foot={
          /*
            ORDER IS DELIBERATE AND IT IS NOT THE ORDER OF IMPORTANCE. `.modal__foot`
            ranges right, so the LAST button is the one nearest the thumb and the
            one the eye lands on — which makes *Close* first, before the verbs,
            rather than an afterthought pushed to the end of a row of them.
          */
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {number ? (
              <>
                <Button variant="secondary" onClick={() => window.print()}>
                  Print
                </Button>
                <Button variant="secondary" onClick={copy}>
                  Copy
                </Button>
                {share && (
                  <Button variant="primary" href={share} target="_blank" rel="noreferrer">
                    Send on WhatsApp
                  </Button>
                )}
              </>
            ) : (
              <Button variant="primary" onClick={raise} disabled={busy}>
                {busy ? 'Raising…' : 'Raise this invoice'}
              </Button>
            )}
          </>
        }
      >
        <Invoice
          number={number}
          status={
            paid ? <Tag tone="ok">Paid</Tag> : <Tag tone="warn">Awaiting payment</Tag>
          }
          dates={[
            number ? `Raised ${longDateStr(payment.invoicedAt ?? paidAt)}` : 'Not raised yet',
            paid ? `Paid ${longDateStr(paidAt)}` : `Recorded ${longDateStr(payment.createdAt)}`,
          ]}
          from={{
            name: trainerName,
            lines: [
              trainerHeadline,
              /*
                FORMATTED, AND THE HELPER IS THE ONE THE SIGN-IN SCREENS USE.
                A bare `9841022119` on a document somebody files is the one
                string on it nobody can read back over a phone. `formatPhone`
                lives in `lib/auth/policy.ts`, imports nothing, and is not
                `server-only` — so this is the same grouping a trainer has
                already seen their own number in, rather than a fourth copy of
                the rule.
              */
              [trainerPhone ? formatPhone(trainerPhone) : null, trainerUpiVpa]
                .filter(Boolean)
                .join(' · '),
            ].filter(Boolean) as string[],
          }}
          to={{
            name: clientName,
            lines: clientPhone ? [formatPhone(clientPhone)] : [],
          }}
          lines={[
            {
              description: what,
              detail: [
                'Personal training',
                pkg?.startDate ? `from ${isoDateStr(pkg.startDate)}` : null,
                pkg?.endDate ? `to ${isoDateStr(pkg.endDate)}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
              qty:
                figures.sessions && figures.perSession
                  ? `${figures.sessions} × ${rupees(figures.perSession)}`
                  : undefined,
              amount: rupees(figures.gross || Number(payment.amount)),
            },
          ]}
          totals={[
            ...(figures.discount > 0
              ? [
                  { k: 'Subtotal', v: rupees(figures.gross) },
                  { k: 'Discount', v: `− ${rupees(figures.discount)}` },
                ]
              : []),
            { k: 'Total', v: amount, total: true },
          ]}
          foot={
            <>
              <p>
                {paid
                  /* NOT lower-cased. `UPI` is an initialism; lower-casing the
                     label to make it sit inside a sentence turns it into `upi`,
                     which is the raw enum this map exists to stop printing. */
                  ? `Paid by ${methodLabel(payment.method) ?? 'the client'} on ${longDateStr(paidAt)}${
                      payment.reference ? ` · reference ${payment.reference}` : ''
                    }.`
                  : trainerUpiVpa
                    ? `Payable to ${trainerUpiVpa}.`
                    : 'Payable to the trainer named above.'}
              </p>
              {/*
                THE SENTENCE THAT STOPS THE PHONE CALL. A bill with no tax row
                reads as an unfinished bill to whoever files it — see the `.inv`
                block in webapp.css. `computeGst` is the screen that watches the
                line this refers to.
              */}
              <p>
                No GST charged — this practice is under the ₹20,00,000 registration
                threshold for services.
              </p>
            </>
          }
        />
      </Modal>
    </ModalHost>
  );
}

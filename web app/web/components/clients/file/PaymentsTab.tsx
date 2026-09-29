'use client';

import { useState } from 'react';

import { Plus } from '@/components/shell/Icons';
import { rupees } from '@/lib/today/time';
import { writeOffPayment } from '@/lib/money/actions';
import { remind as draftReminder } from '@/lib/today/actions';
import { useToast } from '@/lib/toast/store';
import {
  canInvoice,
  INVOICES_ENABLED,
  isCollected,
  methodLabel,
  packName,
  packTerms,
  viaGym,
} from '@/lib/clients/billing';
import type {
  ClientDetailWire,
  ClientPackageWire,
  ClientPaymentWire,
  PackageAdjustmentWire,
  PriceListPackWire,
} from '@/lib/clients/client-api';

import { CollectSheet } from './CollectSheet';
import { InvoiceSheet } from './InvoiceSheet';
import { DeletePaymentSheet, EditPaymentSheet, RefundSheet, WriteOffOwedSheet } from './MoneySheets';
import { PackLife } from './PackLife';
import { PackPanel } from './PackPanel';
import { Blank, isoDateStr, longDateStr, num } from './shared';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { RowMenu } from '@/web-components/ui/RowMenu';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { SubscriptionBar } from '@/web-components/ui/SubscriptionBar';
import { Table, Row } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';

/**
 * PAYMENTS — WHAT THIS PERSON OWES, WHAT THEY HAVE PAID, AND WHAT YOU DO NEXT.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHAT WAS WRONG WITH THE TAB THIS REPLACES · MEASURED 19 Sep 2026, 1536×695
 * ════════════════════════════════════════════════════════════════════════════
 *
 * **1 · It could not do anything.** On `cli_008` it reported ₹6,400 six days
 * overdue and carried no control anywhere on the screen to collect it, settle
 * it, chase it or renew the pack. The one button the tab drew was *Sell a
 * pack*, rendered only for a client with **no** pack — so the tab was mute for
 * exactly the client it was most urgent for. `recordPayment`, `markPaid`,
 * `writeOffPayment` and `sendReminder` had all existed for weeks, one screen
 * away in the money book, reachable from here by nothing.
 *
 * **2 · A help essay held 43% of the lower page.** *When the share is zero* was
 * a 607×223 card of general documentation about gym splits, drawn for every
 * client of a trainer who has a gym — including this one, whose gym share is
 * ₹0 on every row she has ever paid. It was the second-largest thing on the
 * screen and it was not about her. What replaces it is one sentence, drawn only
 * where a share actually exists, saying what THIS client's cut was.
 *
 * **3 · The Package column was 807px holding 70px of ink.** Five columns in
 * 1,409px and the void between *8 sessions* and the date was 737 of them. Capped
 * tracks now, with the surplus falling into the trailing action column — the one
 * gap on a row nobody reads as a void, because an edge control is expected to
 * sit at the edge.
 *
 * **4 · Two headings, two vocabularies.** *Subscriptions* was an `h2.small` and
 * *Past packs* a `p.small`, eight pixels of styling apart, while a comment in
 * this file claimed they were "one vocabulary rather than two". Both are `Card`
 * heads now.
 *
 * **5 · The layout was set from a style attribute.** `gridTemplateColumns`
 * inline was why `app.css` needed `!important` on `.cfgrid` at 1240 — its own
 * comment named this file as the reason and said the override could go once the
 * last caller did. The second column is gone entirely, so the grid is gone, so
 * the inline tracks are gone, and **the `!important` went with them**: this tab
 * was the last one setting layout from a style attribute on the whole route.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * INVOICES ARE OUT OF v1 (R27)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The sheet, the column and *Raise an invoice* stay behind `INVOICES_ENABLED`
 * (MUST-19); `invoice_no` is later-schema. The rule they will follow when it
 * turns on is in `lib/clients/billing.ts`: a bill belongs to a client the
 * trainer collects from, never a gym client.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE MONEY BOOK CAN NOW BE CORRECTED (R73)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pack that is owed can have its dues written off; one fully paid can be
 * refunded, which closes it for good; a row typed wrong can be edited, and one
 * recorded by mistake deleted. `MoneySheets.tsx` carries the four sheets. A
 * refunded pack takes no payment write at all — the server refuses with
 * PACKAGE_CLOSED — so none of those controls is drawn on one.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THREE STANDINGS, NOT TWO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A client can hold more than one live pack — every renewal taken before the
 * current one ran out leaves two rows `active`, because a sale may not be
 * edited. The old tab took `packages.find(status === 'active')` and drew the
 * one it found.
 *
 * So: **Current** is the pack the next session comes off, **Also bought** is
 * live and waiting behind it, **Past packs** is everything closed. The order is
 * `createdAt` ascending because that is the order the server SPENDS them in
 * (`sessions/{id}/done` takes the first active row it finds, and the wire hands
 * them over in creation order) — this is not the page choosing a favourite, it
 * is the page reading which one is draining.
 *
 * A queued pack gets no *Renew* of its own: renewing the pack behind the one in
 * play would sell a third. It gets *Take a payment*, because money owed on it
 * is owed now.
 */

/**
 * What a closed pack's tag should say.
 *
 * The sweep closes a pack `completed` when the sessions ran out and `expired`
 * when the calendar did with sessions still on it, and the difference is the
 * trainer's next conversation: one is a renewal, the other is a client who lost
 * something they paid for.
 */
function closedTag(pkg: ClientPackageWire): { label: string; tone: 'neutral' | 'warn' } {
  if (pkg.status === 'expired') {
    const left = pkg.sessionsRemaining ?? 0;
    return {
      label: left > 0 ? `Ran out of time · ${left} unused` : 'Ran out of time',
      tone: 'warn',
    };
  }
  if (pkg.status === 'completed') return { label: 'Finished', tone: 'neutral' };
  if (pkg.status === 'refunded') return { label: 'Refunded', tone: 'warn' };
  if (pkg.status === 'cancelled') return { label: 'Ended early', tone: 'neutral' };
  return { label: 'Closed', tone: 'neutral' };
}

/** Whole days from `now` to an ISO date, counted on the DATE and not the clock. */
function daysUntil(iso: string, now: number): number {
  const DAY = 86_400_000;
  const a = new Date(iso);
  const target = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const t = new Date(now);
  const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((target - today) / DAY);
}

/** *in 5 days* · *today* · *4 days overdue*. The tone the tile should wear with it. */
function dueRead(iso: string, now: number): { text: string; tone: 'danger' | 'warn' | 'neutral' } {
  const d = daysUntil(iso, now);
  if (d < 0) return { text: `${-d} day${d === -1 ? '' : 's'} overdue`, tone: 'danger' };
  if (d === 0) return { text: 'due today', tone: 'danger' };
  if (d <= 7) return { text: `in ${d} day${d === 1 ? '' : 's'}`, tone: 'warn' };
  return { text: `in ${d} days`, tone: 'neutral' };
}

/**
 * The live pack's status stamp.
 *
 * A paused pack is still the current one — the clock is stopped, not the
 * agreement — so it keeps its place and says so in warn rather than dropping to
 * the closed vocabulary `closedTag` speaks.
 */
function liveTag(pkg: ClientPackageWire, queued: boolean) {
  if (pkg.pausedAt != null) return <Tag tone="warn">Paused</Tag>;
  if (queued) return <Tag>Waiting</Tag>;
  return <Tag tone="acc">Current</Tag>;
}

/**
 * What is still owed on one pack — the server's `amountDue`, and nothing else.
 *
 * It is `amount − paid − written off`, never below zero, and zero on a
 * cancelled or refunded pack (L5). This file used to re-add payments itself and
 * then subtract write-offs the old server did not know about; v1's figure
 * already knows, and a second sum here is how two screens come to disagree.
 */
function owedOn(pkg: ClientPackageWire): number {
  return num(pkg.amountDue);
}

/** The pack the page read adjustments for — client-api's `livePackage` rule (the running one, else the newest). */
function livePackageId(packages: ClientPackageWire[]): string | null {
  return (packages.find((p) => p.status === 'active') ?? packages[0])?.id ?? null;
}

/**
 * Can this pack be refunded? Only fully paid, with nothing written off, and
 * once — the rule `check_package_ledger()` holds on the server. Drawn only
 * where it would succeed, so the Refund button never answers a 409.
 */
function refundable(pkg: ClientPackageWire, payments: ClientPaymentWire[]): boolean {
  return (
    pkg.status !== 'refunded' &&
    num(pkg.amountPaid) > 0 &&
    num(pkg.amountPaid) >= num(pkg.amount) &&
    !payments.some((p) => p.packageId === pkg.id && p.status === 'write_off')
  );
}

export function PaymentsTab({
  client,
  packages,
  payments,
  priceList,
  adjustments,
  now,
}: {
  client: ClientDetailWire;
  /** Every pack the client bought, newest first — closed ones included. */
  packages: ClientPackageWire[];
  /** L7 for this client, every status. */
  payments: ClientPaymentWire[];
  /** Active entries of the list this client buys from (the owner matches their type). */
  priceList: PriceListPackWire[];
  /** The live pack's life — pauses, extensions, corrections. `PackLife` draws it. */
  adjustments: PackageAdjustmentWire[];
  /** The page's clock. */
  now: number;
}) {
  const clientId = client.id;
  const clientName = client.name;
  const toast = useToast();

  /** null = shut, 'sell' = a fresh pack, or the pack being renewed with changes. */
  const [panel, setPanel] = useState<null | 'sell' | ClientPackageWire>(null);
  /** Which pack money is being recorded against, and the row it settles if any. */
  const [collecting, setCollecting] = useState<null | {
    pkg: ClientPackageWire;
    settling: ClientPaymentWire | null;
  }>(null);
  const [invoicing, setInvoicing] = useState<ClientPaymentWire | null>(null);
  const [writingOff, setWritingOff] = useState<ClientPaymentWire | null>(null);
  /** The pack whose dues are being forgiven, or refunded. */
  const [forgiving, setForgiving] = useState<ClientPackageWire | null>(null);
  const [refunding, setRefunding] = useState<ClientPackageWire | null>(null);
  const [editing, setEditing] = useState<ClientPaymentWire | null>(null);
  const [deleting, setDeleting] = useState<ClientPaymentWire | null>(null);
  const [busy, setBusy] = useState(false);
  /* One id per reminder attempt, kept until it lands, so a retry logs no second
     nudge (the cooldown reads that log). */
  const [reminderId, setReminderId] = useState(() => crypto.randomUUID());

  /* ── the standings ──────────────────────────────────────────────────────── */

  /* Ascending, which is the order the server spends them in. See the header. */
  const live = packages
    .filter((p) => p.status === 'active')
    .sort((a, b) => a.createdAt - b.createdAt);
  const current = live[0] ?? null;
  const queued = live.slice(1);
  const past = packages
    .filter((p) => p.status !== 'active')
    .sort((a, b) => b.createdAt - a.createdAt);

  const gym = viaGym(client);
  /** Whether this screen offers bills at all — never in v1 (R27), never to a gym client. */
  const billable = INVOICES_ENABLED && !gym;

  /* ── the four figures, and the order is the reading order ───────────────── */

  const billed = packages.reduce((s, p) => s + num(p.amount), 0);
  /* Server-computed per pack and summed here, never re-added from the rows. */
  const collected = packages.reduce((s, p) => s + num(p.amountPaid), 0);
  const outstanding = packages.reduce((s, p) => s + owedOn(p), 0);
  const pending = payments.filter((p) => p.status === 'pending');
  const collectedCount = payments.filter(isCollected).length;
  /* Money the trainer has decided never to chase. It is not owed and it was
     never collected — see `owedOn` — so the tile says so rather than reporting
     a clean slate the trainer did not actually get. */
  const writtenOff = payments
    .filter((p) => p.status === 'write_off')
    .reduce((s, p) => s + num(p.amount), 0);

  /* What the gym has kept of this client's payments, ever — the `split` the
     server works out from each pack's trainer share (payment_trainer_share),
     so a share renegotiated in October cannot move September's split. */
  const gymShare = payments
    .filter(isCollected)
    .reduce((s, p) => s + num(p.split?.gym), 0);

  /*
   * THE NEXT PAYMENT IS THE EARLIEST DUE DATE THAT STILL OWES MONEY, ON ANY PACK.
   *
   * Not the live pack's. A pack that closed with a balance on it is the invoice
   * most likely to be forgotten, and it is the one whose date belongs on the
   * tile — so the sort runs over every pack with something outstanding and takes
   * the front of it. Overdue sorts first by construction, which is the order a
   * trainer wants.
   */
  const nextDuePkg =
    packages
      .filter((p) => p.dueDate && owedOn(p) > 0)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0] ?? null;
  const nextDue = nextDuePkg?.dueDate ? dueRead(nextDuePkg.dueDate, now) : null;

  /* The server's order already: bookAt, newest first. */
  const ledger = payments;

  /* The join the table is built on. A Map rather than a `find` per row: a client
     with three packs and forty payments is 120 scans of the same array to print
     one column. */
  const byPackage = new Map(packages.map((p) => [p.id, p]));

  const first = clientName.split(' ')[0];

  /* ── writes ─────────────────────────────────────────────────────────────── */

  async function remind() {
    setBusy(true);
    const result = await draftReminder(clientId, reminderId);
    setBusy(false);
    if (result.ok) {
      setReminderId(crypto.randomUUID());
      /* The link is the delivery. `window.open` after an `await` can be refused
         by a popup blocker and `noopener` makes the return value null either
         way, so the toast always carries a real link — a confirm that says
         *sent* when nothing opened is the worst outcome, because the nudge IS
         logged and the cooldown then suppresses the reminder that never went. */
      toast.show({
        tone: 'ok',
        title: `Reminder drafted for ${first}`,
        body: 'Read it before you send it.',
        ...(result.whatsappUrl
          ? {
              action: {
                label: 'Open WhatsApp',
                onClick: () => window.open(result.whatsappUrl, '_blank', 'noopener'),
              },
            }
          : null),
      });
    } else {
      toast.show({ tone: 'danger', title: 'The reminder was not drafted', body: result.message });
    }
  }

  async function confirmWriteOff() {
    if (!writingOff) return;
    setBusy(true);
    const result = await writeOffPayment(writingOff.id);
    setBusy(false);
    setWritingOff(null);
    toast.show(
      result.ok
        ? {
            tone: 'ok',
            variant: 'receipt',
            title: `${rupees(num(writingOff.amount))} written off`,
            body: 'It stays on the file and stops counting as collected.',
          }
        : { tone: 'danger', title: 'The write-off did not go through', body: result.message },
    );
  }

  /* ── shared nodes ───────────────────────────────────────────────────────── */

  const sellButton = (label: string) => (
    <Button variant="primary" onClick={() => setPanel('sell')}>
      <Plus size={15} />
      {label}
    </Button>
  );

  const sheets = (
    <>
      {panel && (
        <PackPanel
          clientId={clientId}
          clientName={clientName}
          clientType={client.clientType}
          priceList={priceList}
          renewing={panel === 'sell' ? null : panel}
          onClose={() => setPanel(null)}
        />
      )}
      {collecting && (
        <CollectSheet
          pkg={collecting.pkg}
          settling={collecting.settling}
          clientName={clientName}
          clientType={client.clientType}
          onClose={() => setCollecting(null)}
        />
      )}
      {forgiving && (
        <WriteOffOwedSheet clientId={clientId} pkg={forgiving} onClose={() => setForgiving(null)} />
      )}
      {refunding && (
        <RefundSheet clientId={clientId} clientType={client.clientType} pkg={refunding} now={now}
          onClose={() => setRefunding(null)} />
      )}
      {editing && (
        <EditPaymentSheet clientId={clientId} clientType={client.clientType} payment={editing}
          onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <DeletePaymentSheet clientId={clientId} payment={deleting} onClose={() => setDeleting(null)} />
      )}
      {/* R27: unreachable while INVOICES_ENABLED is off — nothing sets `invoicing`.
          The trainer's From block (name, UPI, headline) comes from /v1/me when it returns. */}
      {INVOICES_ENABLED && invoicing && (
        <InvoiceSheet
          payment={invoicing}
          pkg={byPackage.get(invoicing.packageId) ?? null}
          clientName={clientName}
          clientPhone={client.phone}
          trainerName=""
          trainerPhone={null}
          trainerUpiVpa={null}
          trainerHeadline={null}
          onClose={() => setInvoicing(null)}
        />
      )}
      {writingOff && (
        <ModalHost onClose={() => setWritingOff(null)} cover="frame">
          <Modal
            title={`Write off ${rupees(num(writingOff.amount))}?`}
            confirm={{ label: busy ? 'Writing off…' : 'Write it off', onClick: confirmWriteOff, danger: true }}
            cancel={{ label: 'Keep chasing it', onClick: () => setWritingOff(null) }}
          >
            {/* The word reads like a delete and it is not one, so the copy says
                so before the button is pressed rather than after. */}
            Nothing is deleted. The row stays on {first}&rsquo;s file with its amount and
            its date, drops out of what you are owed, stops counting as collected, and
            turns up on the write-offs tab and in the CA export.
          </Modal>
        </ModalHost>
      )}
    </>
  );

  /* ── the nothing-sold case ──────────────────────────────────────────────── */

  if (packages.length === 0) {
    return (
      <>
        <Card bare>
          <EmptyState
            kind="first-run"
            title="Nothing sold yet"
            body={`A pack is what makes the sessions countable — until there is one, every session ${first} trains is off the books.`}
            action={sellButton('Sell a pack')}
          />
        </Card>
        {sheets}
      </>
    );
  }

  /* ── one pack's bar ─────────────────────────────────────────────────────── */

  function packBar(pkg: ClientPackageWire, isQueued: boolean) {
    const owed = owedOn(pkg);
    /* A pack whose balance went to zero because the trainer LET IT GO is not a
       pack that was paid for, and `Paid in full` on it is the same class of
       self-contradiction the Outstanding tile had — see `owedOn`. */
    const letGo = payments.some((p) => p.packageId === pkg.id && p.status === 'write_off');
    const due = pkg.dueDate && owed > 0 ? dueRead(pkg.dueDate, now) : null;
    const settleRow =
      payments.find((p) => p.packageId === pkg.id && p.status === 'pending') ?? null;

    return (
      <SubscriptionBar
        key={pkg.id}
        label={isQueued ? 'A pack waiting behind the current one' : 'The pack in play'}
        name={`${packName(pkg)} · ${packTerms(pkg)}`}
        status={liveTag(pkg, isQueued)}
        facts={[
          { k: 'Amount', v: rupees(num(pkg.amount)) },
          {
            k: 'Balance',
            v: owed > 0 ? rupees(owed) : letGo ? 'Written off' : 'Paid in full',
            tone: owed > 0 ? 'danger' : letGo ? 'warn' : 'acc',
          },
          {
            k: 'Due',
            /*
              A DATE ONLY WHILE SOMETHING IS OWED.
              This read `dueDate` first and printed it whatever the balance
              was, so settling a pack left the bar saying *BALANCE Paid in
              full* and *DUE 23 Sep* side by side - two cells of one bar
              disagreeing about whether the trainer is owed money. The date is
              a fact about a debt; with no debt there is nothing it is the date
              OF. Caught by driving the settle, not by reading the props.
            */
            v: owed <= 0
              ? 'Nothing due'
              : pkg.dueDate
                ? isoDateStr(pkg.dueDate)
                : 'No date set',
            tone: due && due.tone !== 'neutral' ? due.tone : 'neutral',
          },
          {
            k: 'Sessions left',
            v: pkg.sessionsTotal
              ? `${pkg.sessionsRemaining ?? 0} / ${pkg.sessionsTotal}`
              : 'Unlimited',
            /* Two left is the renewal conversation, and it is the one number on
               this bar that is about the training rather than the money. */
            tone:
              pkg.sessionsTotal && (pkg.sessionsRemaining ?? 0) <= 2 ? 'danger' : 'neutral',
          },
          { k: 'Valid till', v: pkg.endDate ? isoDateStr(pkg.endDate) : 'No end date' },
        ]}
        actions={
          <>
            {owed > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCollecting({ pkg, settling: settleRow })}
              >
                Take a payment
              </Button>
            )}
            {owed > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setForgiving(pkg)}>
                Write off what&rsquo;s owed
              </Button>
            )}
            {owed <= 0 && refundable(pkg, payments) && (
              <Button variant="ghost" size="sm" onClick={() => setRefunding(pkg)}>
                Refund
              </Button>
            )}
            {/* A queued pack gets no Renew — renewing the one behind the one in
                play would sell a third. See the header. */}
            {!isQueued && (
              <Button variant="secondary" size="sm" onClick={() => setPanel(pkg)}>
                Renew
              </Button>
            )}
          </>
        }
      />
    );
  }

  return (
    <>
      {/*
        THE FOUR FIGURES, AND THE ORDER CHANGED.

        It was billed · collected · pending · next payment — history, history,
        history, then the one forward-looking answer, on a screen a trainer opens
        because somebody owes them money. The lead is now what is owed and when,
        and the two lifetime figures follow. Nothing was added; the reading order
        was wrong.
      */}
      <Stats up={4} className="cfstats">
        <Stat
          label="Outstanding"
          value={outstanding > 0 ? rupees(outstanding) : 'Nothing'}
          detail={
            pending.length > 0
              ? `${pending.length} invoice${pending.length === 1 ? '' : 's'} open`
              : outstanding > 0
                ? 'never recorded as paid'
                : writtenOff > 0
                  ? `${rupees(writtenOff)} written off`
                  : `${first} is square with you`
          }
          tone={outstanding > 0 ? 'danger' : 'acc'}
        />
        <Stat
          label="Next payment"
          value={
            nextDuePkg?.dueDate
              ? isoDateStr(nextDuePkg.dueDate)
              : outstanding > 0
                ? 'No date set'
                : 'Nothing due'
          }
          detail={
            nextDue
              ? nextDue.text
              : outstanding > 0
                ? `${rupees(outstanding)} outstanding`
                : 'nothing on the clock'
          }
          tone={nextDue && nextDue.tone !== 'neutral' ? nextDue.tone : undefined}
        />
        <Stat
          label="Collected"
          value={rupees(collected)}
          detail={<>{collectedCount} payment{collectedCount === 1 ? '' : 's'}</>}
        />
        <Stat
          label="Billed, all time"
          value={rupees(billed)}
          detail={<>{packages.length} pack{packages.length === 1 ? '' : 's'}</>}
        />
      </Stats>

      {/* ── the live packs ───────────────────────────────────────────────── */}

      {current ? (
        <div className="cfpay__bars">
          {packBar(current, false)}
          {/* Pause · Resume · Extend · End — the pack's life, under the pack in play. */}
          <PackLife
            clientId={clientId}
            pkg={current}
            adjustments={adjustments.length > 0 && livePackageId(packages) === current.id ? adjustments : []}
          />
          {queued.map((pkg) => packBar(pkg, true))}
        </div>
      ) : (
        <Card className="cfpay__gap">
          <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
            No pack running. Sessions logged from here are not counted against anything.
          </p>
          <div style={{ marginTop: 12, display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {sellButton('Sell a pack')}
            {/* The commonest thing to sell somebody with no live pack is the one
                they just finished, so it is offered directly rather than left to
                be re-typed into the form. */}
            {past.length > 0 && (
              <Button variant="secondary" onClick={() => setPanel(past[0])}>
                Repeat their last pack
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ── the ledger ───────────────────────────────────────────────────── */}

      <Card className="cfpay__gap cfpay__ledger" flush>
        <Card.Head
          title={billable ? 'Invoices and payments' : 'Payments'}
          actions={
            <>
              {outstanding > 0 && (
                <Button variant="secondary" size="sm" onClick={remind} disabled={busy}>
                  Send a reminder
                </Button>
              )}
              {current && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCollecting({ pkg: current, settling: null })}
                >
                  Record a payment
                </Button>
              )}
            </>
          }
        />
        {ledger.length === 0 ? (
          <Blank>Nothing collected yet</Blank>
        ) : (
          <Table
            caption={`Every payment on ${clientName}'s file: what moved, against which pack, when, and ${
              billable ? 'the invoice raised for it' : 'its reference'
            }`}
            className={billable ? 'cftx cftx--inv' : 'cftx'}
            columns={[
              { key: 'amount', label: 'Amount', numeric: true },
              { key: 'status', label: 'Status' },
              { key: 'pack', label: 'Package' },
              { key: 'when', label: 'Date' },
              ...(billable ? [{ key: 'inv', label: 'Invoice' }] : []),
              { key: 'ref', label: 'How it was paid' },
              { key: 'act', label: '' },
            ]}
          >
            {ledger.map((p) => {
              const against = p.packageId ? byPackage.get(p.packageId) : null;
              const eligible = canInvoice(p);
              const settled = isCollected(p);
              const off = p.status === 'write_off';
              const refund = p.status === 'refund';
              /* A refund row is frozen, and a refunded pack takes no payment
                 write at all (the server answers PACKAGE_CLOSED) — so nothing
                 that would be refused is offered. */
              const frozen = refund || against?.status === 'refunded';

              /* An item that is REFUSED is not drawn. `RowMenu` has a
                 `disabled` flag and a greyed row that cannot say why is the
                 false affordance this codebase keeps deleting — the card's foot
                 carries the reason for a gym client, which is the only case a
                 trainer will go looking for it. */
              const items = [
                ...(p.status === 'pending' && against && !frozen
                  ? [
                      {
                        key: 'settle',
                        label: 'Mark it paid…',
                        onSelect: () => setCollecting({ pkg: against, settling: p }),
                      },
                    ]
                  : []),
                ...(billable && eligible.ok
                  ? [
                      {
                        key: 'inv',
                        label: eligible.already ? 'Open the invoice' : 'Raise an invoice…',
                        onSelect: () => setInvoicing(p),
                      },
                    ]
                  : []),
                ...(p.reference
                  ? [
                      {
                        key: 'copy',
                        label: 'Copy the reference',
                        onSelect: () => {
                          navigator.clipboard?.writeText(p.reference!).then(
                            () =>
                              toast.show({
                                tone: 'ok',
                                variant: 'receipt',
                                title: `Reference ${p.reference} copied`,
                              }),
                            () => toast.show({ tone: 'danger', title: 'Could not copy it' }),
                          );
                        },
                      },
                    ]
                  : []),
                ...(!frozen
                  ? [{ key: 'edit', label: 'Correct it…', onSelect: () => setEditing(p) }]
                  : []),
                ...(!frozen
                  ? [
                      { key: 'sep', separator: true as const },
                      ...(p.status === 'pending'
                        ? [{ key: 'off', label: 'Write it off…', danger: true, onSelect: () => setWritingOff(p) }]
                        : []),
                      { key: 'del', label: 'Delete (recorded by mistake)…', danger: true, onSelect: () => setDeleting(p) },
                    ]
                  : []),
              ];

              return (
                <Row
                  key={p.id}
                  className={p.status === 'pending' ? 'crit' : undefined}
                  cells={[
                    {
                      key: 'amount',
                      numeric: true,
                      label: 'Amount',
                      content: rupees(num(p.amount)),
                      className: off ? 'ink3' : 'strong',
                    },
                    {
                      key: 'status',
                      label: 'Status',
                      content: off ? (
                        <Tag>Written off</Tag>
                      ) : refund ? (
                        <Tag tone="warn">Refund</Tag>
                      ) : settled ? (
                        <Tag tone="ok">Paid</Tag>
                      ) : (
                        <Tag tone="warn">Pending</Tag>
                      ),
                    },
                    {
                      key: 'pack',
                      label: 'Package',
                      /* A payment with no package is a real row — the money book
                         can record one against a client and nothing else — so it
                         says so rather than drawing a bare dash. */
                      content: against ? (
                        packName(against)
                      ) : (
                        <span className="ink3">Not against a pack</span>
                      ),
                    },
                    {
                      key: 'when',
                      label: 'Date',
                      content: longDateStr(p.bookAt),
                      className: 'mono',
                    },
                    ...(billable
                      ? [
                          {
                            key: 'inv',
                            label: 'Invoice',
                            /*
                              THREE STATES, AND *NOT RAISED* IS THE COMMONEST ONE.

                              A number where there is one; the quiet *Not raised*
                              where a bill could be asked for and has not been;
                              and a dash where the row cannot carry one at all —
                              a pending debt or something written off. Drawing
                              all three the same way would make the normal case
                              look like missing data.
                            */
                            content: (p as { invoiceNo?: string | null }).invoiceNo ? (
                              <button
                                type="button"
                                className="cftx__inv"
                                onClick={() => setInvoicing(p)}
                              >
                                {(p as { invoiceNo?: string | null }).invoiceNo}
                              </button>
                            ) : eligible.ok ? (
                              <span className="ink3">Not raised</span>
                            ) : (
                              <span className="ink3">&mdash;</span>
                            ),
                          },
                        ]
                      : []),
                    {
                      /* The method AND its reference, in one cell. They are one
                         answer to *how did this money reach me* — a reference
                         with no method beside it is a string, and a method with
                         no reference is a word the client cannot check. Cash has
                         no reference and cannot have one. */
                      key: 'ref',
                      label: 'How it was paid',
                      content: methodLabel(p.method) ? (
                        <>
                          <span className="cftx__how">{methodLabel(p.method)}</span>
                          {p.reference && (
                            <span className="cftx__ref mono">{p.reference}</span>
                          )}
                        </>
                      ) : (
                        <span className="ink3">&mdash;</span>
                      ),
                    },
                    {
                      key: 'act',
                      label: '',
                      className: 'cftx__act',
                      content:
                        items.length > 0 ? (
                          <RowMenu
                            label={`Actions for ${rupees(num(p.amount))} on ${longDateStr(p.bookAt)}`}
                            items={items}
                          />
                        ) : null,
                    },
                  ]}
                />
              );
            })}
          </Table>
        )}

        {/*
          THE ABSENCE, NAMED — and only where there is one to explain.

          A trainer who can bill four clients and not the fifth will go looking
          for the button. This is the sentence that stops that, and it is drawn
          for a gym client only: an independent client's table has the column, so
          there is nothing to account for.
        */}
        {/*
          THE GYM'S CUT, NAMED — and only where there is one. For a gym client
          the desk collects and keeps its share; the figure is summed from each
          payment's split, which the server works out from the pack's trainer
          share at the time.
        */}
        {gym && gymShare > 0 && (
          <Card.Band className="cfpay__note">
            <p className="small" style={{ margin: 0, color: 'var(--tx-ink-3)' }}>
              The gym signs {first} up and collects. Its cut of {first}&rsquo;s payments so far is{' '}
              <b>{rupees(gymShare)}</b>, taken from each pack&rsquo;s share when it was sold — so a
              share that changes in October cannot move September&rsquo;s split.
            </p>
          </Card.Band>
        )}
      </Card>

      {/* ── what is closed ───────────────────────────────────────────────── */}

      {past.length > 0 && (
        <Card className="cfpay__gap" flush>
          <Card.Head
            title="Past packs"
            level={2}
            actions={
              <span className="small ink3">
                {past.length} closed
              </span>
            }
          />
          {/*
            A TABLE, NOT A STACK OF CARDS.

            Each past pack was a `Card` with a key-value list in it, and two of
            its four rows said what the tag beside the title already said —
            *Pending on this pack · Nothing · paid in full* under a **Finished**
            stamp, and *What you keep ₹9,000* on a client with no gym share,
            which is the amount three lines above it. Six rows of that is six
            cards a trainer scrolls past.

            The question asked of a closed pack is comparative — what did they
            buy, what did it cost, did they use it — and comparison is what a
            table is for.
          */}
          <Table
            caption={`Packs ${clientName} has bought and finished`}
            className="cfpast"
            columns={[
              { key: 'name', label: 'Pack' },
              { key: 'bought', label: 'Bought' },
              { key: 'used', label: 'Sessions', numeric: true },
              { key: 'rate', label: 'A session', numeric: true },
              { key: 'amount', label: 'Paid', numeric: true },
              { key: 'end', label: '' },
              { key: 'act', label: '' },
            ]}
          >
            {past.map((pkg) => {
              /* A finished pack can still be owed for, or refunded once — the
                 invoice most likely to be forgotten is on a pack that closed. */
              const menu = [
                ...(owedOn(pkg) > 0 && pkg.status !== 'cancelled' && pkg.status !== 'refunded'
                  ? [
                      { key: 'take', label: 'Take a payment…', onSelect: () => setCollecting({ pkg, settling: null }) },
                      { key: 'forgive', label: 'Write off what’s owed…', onSelect: () => setForgiving(pkg) },
                    ]
                  : []),
                ...(owedOn(pkg) <= 0 && refundable(pkg, payments)
                  ? [{ key: 'refund', label: 'Refund…', danger: true, onSelect: () => setRefunding(pkg) }]
                  : []),
              ];
              const amount = num(pkg.amount);
              const owed = owedOn(pkg);
              const total = pkg.sessionsTotal;
              const used = total != null ? total - (pkg.sessionsRemaining ?? 0) : null;
              const rate = total && total > 0 ? Math.round(amount / total) : null;
              const tag = closedTag(pkg);
              return (
                <Row
                  key={pkg.id}
                  cells={[
                    {
                      key: 'name',
                      label: 'Pack',
                      content: packName(pkg),
                      className: 'strong',
                    },
                    {
                      key: 'bought',
                      label: 'Bought',
                      content: pkg.startDate ? isoDateStr(pkg.startDate) : '—',
                      className: 'mono',
                    },
                    {
                      key: 'used',
                      label: 'Sessions',
                      numeric: true,
                      content: used != null && total != null ? `${used} / ${total}` : 'Unlimited',
                    },
                    {
                      key: 'rate',
                      label: 'A session',
                      numeric: true,
                      content: rate ? rupees(rate) : <span className="ink3">&mdash;</span>,
                    },
                    {
                      key: 'amount',
                      label: 'Paid',
                      numeric: true,
                      /* The figure a closed pack is asked about is what it
                         BROUGHT IN, so an unpaid balance is the exception worth
                         a colour rather than a second column that is empty on
                         every other row. */
                      content:
                        owed > 0 ? (
                          <span style={{ color: 'var(--tx-danger)' }}>
                            {rupees(num(pkg.amountPaid))} of {rupees(amount)}
                          </span>
                        ) : num(pkg.amountRefunded) > 0 ? (
                          <>{rupees(num(pkg.amountPaid))} · {rupees(num(pkg.amountRefunded))} back</>
                        ) : (
                          rupees(num(pkg.amountPaid))
                        ),
                    },
                    {
                      key: 'end',
                      label: '',
                      className: 'cfpast__end',
                      content:
                        owed > 0 ? (
                          <Tag tone="danger">{rupees(owed)} owed</Tag>
                        ) : (
                          <Tag tone={tag.tone === 'warn' ? 'warn' : 'neutral'}>{tag.label}</Tag>
                        ),
                    },
                    {
                      key: 'act',
                      label: '',
                      className: 'cftx__act',
                      content:
                        menu.length > 0 ? (
                          <RowMenu label={`Actions for ${packName(pkg)}`} items={menu} />
                        ) : null,
                    },
                  ]}
                />
              );
            })}
          </Table>
        </Card>
      )}

      {sheets}
    </>
  );
}

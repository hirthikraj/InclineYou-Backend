import { Invoice } from '../../../ui/Invoice';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const FROM = {
  name: 'Arun Prakash',
  lines: ['Strength coach · Anna Nagar, Chennai', '+91 98410 22119 · arunprakash@okhdfcbank'],
};

const TO = {
  name: 'Priya Pillai',
  lines: ['+91 98411 03288'],
};

const FOOT = (
  <>
    <p>Paid by UPI on 6 Sep 2026 · reference UPI483920117.</p>
    <p>
      No GST charged — this practice is under the ₹20,00,000 registration threshold for services.
    </p>
  </>
);

export function InvoiceEntry() {
  const entry = byId('c-invoice')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/Invoice.tsx</code> },
        { k: 'Class', v: <code>.inv</code> },
        { k: 'Parts', v: '7 — hd · mk/no · meta · who · ln · sum · ft' },
        { k: 'Print', v: 'yes — the only component in the set with one' },
        { k: 'Used in', v: 'the client file’s Payments tab' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            A bill is the one surface in this product that is <b>not</b> designed to be scanned. It
            is designed to be filed — by a reader who was not in the room, does not know either
            party, and needs a number they can quote in an email. That is the whole reason it is a
            component rather than a <code>Card</code> with a <code>Table</code> in it.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="RAISED AND PAID" stretch>
            <div style={{ width: '100%', maxWidth: 620 }}>
              <Invoice
                number="INV-2627-0014"
                status={<Tag tone="ok">Paid</Tag>}
                dates={['Raised 6 Sep 2026', 'Paid 6 Sep 2026']}
                from={FROM}
                to={TO}
                lines={[
                  {
                    description: '12 sessions',
                    detail: 'Personal training · 2 Jul 2026 – 30 Aug 2026',
                    qty: '12 × ₹750',
                    amount: '₹9,000',
                  },
                ]}
                totals={[
                  { k: 'Subtotal', v: '₹9,000' },
                  { k: 'Total', v: '₹9,000', total: true },
                ]}
                foot={FOOT}
              />
            </div>
          </Cell>

          <Cell label="NOT RAISED YET · WHAT THE TRAINER SEES BEFORE THEY COMMIT" stretch>
            <div style={{ width: '100%', maxWidth: 620 }}>
              <Invoice
                number={null}
                status={<Tag tone="warn">Due 13 Sep</Tag>}
                dates={['Recorded 6 Sep 2026']}
                from={FROM}
                to={TO}
                lines={[
                  {
                    description: '8 sessions',
                    detail: 'Personal training · from 2 Sep 2026',
                    qty: '8 × ₹800',
                    amount: '₹6,400',
                  },
                ]}
                totals={[
                  { k: 'Subtotal', v: '₹6,400' },
                  { k: 'Total', v: '₹6,400', total: true },
                ]}
                foot={
                  <p>
                    A number is minted when this is raised, and it cannot be taken back — the
                    sequence a CA reads must have no gaps in it.
                  </p>
                }
              />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Why the two parties are not a key–value list"
        lede={
          <>
            <code>KeyValue</code> is the right instrument almost everywhere else on the money side —
            a label left, a value right, stacked. It is the wrong one here, and the reason is the
            reader: somebody holding a printed bill is looking for <em>who billed me</em>, and a
            name they have to track rightwards past the word <em>From</em> is a name they read
            second. Every printed invoice in the world puts the label above the name. This one does
            too.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: '100%' }}>
                <div className="inv__who" style={{ border: 0, padding: 0 }}>
                  <div>
                    <span className="inv__mk">From</span>
                    <b className="inv__pn">Arun Prakash</b>
                    <p className="inv__pl">+91 98410 22119</p>
                  </div>
                  <div>
                    <span className="inv__mk">Billed to</span>
                    <b className="inv__pn">Priya Pillai</b>
                    <p className="inv__pl">+91 98411 03288</p>
                  </div>
                </div>
              </div>
            ),
            caption: (
              <>
                Label above, name in <code>--tx-brand</code> at 15px. Both parties start at the same
                y, so the eye compares two names rather than reading two rows.
              </>
            ),
          }}
          no={{
            figure: (
              <div style={{ width: '100%' }}>
                <div className="kv">
                  <span className="kv__k">From</span>
                  <span className="kv__v">Arun Prakash</span>
                </div>
                <div className="kv">
                  <span className="kv__k">Billed to</span>
                  <span className="kv__v">Priya Pillai</span>
                </div>
              </div>
            ),
            caption: (
              <>
                The same two facts as a <code>.kv</code> list: the names are the smallest thing on
                the row, ranged right, and the document now looks like a settings panel.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="The foot states the tax that is not charged"
        lede={
          <>
            A trainer under ₹20,00,000 of turnover is not registered for GST and charges none —{' '}
            <code>computeGst</code> is the screen that watches that line. A bill with no tax row
            reads as an <em>unfinished</em> bill to the accountant holding it, so the absence is
            written down rather than left out. It is the single most likely thing on this document
            to be queried, and answering it in advance is the whole job of a foot.
          </>
        }
      >
        <SpecTable
          rows={[
            {
              property: 'Total figure',
              value: '19px / 800',
              token: '--tx-brand',
              note: 'The only large figure on the surface. Everything else is reading size.',
            },
            {
              property: 'Money colour',
              value: 'ink',
              token: '--tx-ink',
              note: (
                <>
                  Deliberately <b>not</b> <code>.dirn</code>’s green. A bill has no direction —
                  money-in is a fact about the trainer’s book that the client reading this does not
                  share.
                </>
              ),
            },
            {
              property: 'Number',
              value: 'mono / 15px',
              token: '--tx-mono',
              note: 'INV-<financial year>-<sequence>. April to March, because the only reader who needs it is reconciling a return.',
            },
            {
              property: 'Foot fill',
              value: 'surface-2',
              token: '--tx-surface-2',
              note: 'The one filled band, so the terms read as an appendix and not as a line item.',
            },
            {
              property: 'Print',
              value: '@media print',
              token: '—',
              note: 'White surfaces, square corners, hairlines kept. A rounded rectangle on A4 reads as a screenshot of a bill.',
            },
          ]}
        />
      </Blk>
    </Cmp>
  );
}

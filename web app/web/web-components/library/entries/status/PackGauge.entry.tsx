import { PackGauge } from '../../../ui/PackGauge';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function PackGaugeEntry() {
  const entry = byId('c-packgauge')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/PackGauge.tsx</code> },
        { k: 'Class', v: <code>.pk</code> },
        { k: 'Tones', v: '3', },
        { k: 'Turns at', v: '2 left, 0 left' },
        { k: 'Bar', v: 'only with a total' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="row gap4" style={{ display: 'flex', gap: 34, alignItems: 'flex-end' }}>
            <Cell label="ROOM LEFT">
              <PackGauge remaining={20} total={24} />
            </Cell>
            <Cell label="ENDING">
              <PackGauge remaining={2} total={24} />
            </Cell>
            <Cell label="EMPTY">
              <PackGauge remaining={0} total={24} />
            </Cell>
            <Cell label="NO STATED SIZE">
              <PackGauge remaining={7} />
            </Cell>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="Why a bar at all"
        lede={
          <>
            Because <code>0/24</code> and <code>20/24</code> are the same shape. Measured on the roster&rsquo;s
            Sessions-left column, every cell is two numerals, a slash and two numerals, in the same tabular
            figures at the same weight, ranged right &mdash; twenty-three rows of identical silhouette in which
            the one client with nothing left cannot be found without reading each one.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', gap: 40 }}>
            <Cell label="THE COLUMN, AS IT WAS">
              <div
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12,
                  fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 800, letterSpacing: '-.02em',
                }}
              >
                <span>20/24</span>
                <span>10/12</span>
                <span>0/24</span>
                <span>8/12</span>
              </div>
            </Cell>
            <Cell label="THE COLUMN, WITH THE GAUGE">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                <PackGauge remaining={20} total={24} />
                <PackGauge remaining={10} total={12} />
                <PackGauge remaining={0} total={24} />
                <PackGauge remaining={8} total={12} />
              </div>
            </Cell>
          </div>
        </Bench>
        <p className="blk__p">
          The empty pack is the third row in both columns. On the left it takes a read; on the right it is the
          only row with no bar.
        </p>
      </Blk>

      <Blk
        title="The tone is not the only signal"
        lede={
          <>
            The bar&rsquo;s <b>length</b> carries the same fact the colour does, so the state survives for a
            reader who cannot separate green from red. That is what earns the 3px &mdash; a toned numeral on its
            own would not have.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', gap: 34, filter: 'grayscale(1)' }}>
            <Cell label="20 / 24">
              <PackGauge remaining={20} total={24} />
            </Cell>
            <Cell label="2 / 24">
              <PackGauge remaining={2} total={24} />
            </Cell>
            <Cell label="0 / 24">
              <PackGauge remaining={0} total={24} />
            </Cell>
          </div>
        </Bench>
        <p className="blk__p">
          Desaturated, and the three states are still three states.
        </p>
      </Blk>

      <Blk
        title="No total, no bar"
        lede={
          <>
            A pack with no stated size is a real row on this wire &mdash; an open arrangement, billed per
            session &mdash; and a bar needs a denominator. It draws the count alone rather than inventing one,
            which is the refusal <code>Meter</code> makes for the same reason: a bar that stops short has to
            mean something.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="remaining={7}">
            <PackGauge remaining={7} />
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Count', value: '14px / 800', note: 'Tabular figures; the total is 10.5px at ink-3' },
            { property: 'Bar', value: '42 × 3px', note: 'Full width of the track inside a table cell, capped at 72' },
            { property: 'Radius', value: '2px' },
            { property: 'Tone · ok', value: '3 or more left' },
            { property: 'Tone · warn', value: '2 or fewer', note: '`roster.ts`’s own *Pack ends in 2 sessions* threshold' },
            { property: 'Tone · danger', value: 'none left', note: 'And the bar is zero-width, so the tone is not alone' },
            { property: 'Accessible name', value: 'the figure', note: 'The bar is `aria-hidden` — it restates the count beside it' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                <PackGauge remaining={11} total={24} />
                <PackGauge remaining={2} total={24} />
                <PackGauge remaining={0} total={24} />
              </div>
            ),
            caption:
              'Down a column, where the shape does the finding. The gauge is for a list of packs you are scanning for the one that has run out.',
          }}
          no={{
            figure: (
              <div style={{ width: 260 }}>
                <PackGauge remaining={11} total={24} />
              </div>
            ),
            caption:
              'Alone, as a page’s headline figure. One pack on its own is a sentence — “11 of 24 sessions left” — and a 42px bar beside it adds nothing a reader has to look twice to decode.',
          }}
        />
      </Blk>
    </Cmp>
  );
}

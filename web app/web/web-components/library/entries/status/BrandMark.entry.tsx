import { BrandMark } from '../../../ui/BrandMark';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function BrandMarkEntry() {
  const entry = byId('c-brandmark')!;
  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/BrandMark.tsx</code> },
        { k: 'Class', v: <code>.brandmark</code> },
        { k: 'Artwork', v: 'stand-ins — replace with the official kits' },
      ]}
    >
      <Blk title="Specimen">
        <Bench>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <BrandMark brand="upi" />
            <BrandMark brand="razorpay" />
            <BrandMark brand="upi" size="sm" />
            <BrandMark brand="razorpay" size="sm" />
          </div>
        </Bench>
      </Blk>
      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Tile', value: '64 × 40 (sm 48 × 30), white', note: 'White in both themes: the colours are another company’s and only right on white.' },
            { property: 'Edge', value: '1px line, r2', token: '--tx-line' },
            { property: 'Name', value: 'role="img" + aria-label', note: 'The mark is the name; the SVG is hidden.' },
            { property: 'Use', value: 'Payment rails only', note: 'Payment setup leads each method with its mark. Not a decoration elsewhere.' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}

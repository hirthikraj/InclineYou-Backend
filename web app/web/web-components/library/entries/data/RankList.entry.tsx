import { RankList } from '../../../ui/RankList';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const SAMPLE = [
  { id: 'a', name: 'Vikram Singh', value: 33_600 },
  { id: 'b', name: 'Karthik Menon', value: 32_400 },
  { id: 'c', name: 'Priya Nair', value: 27_000 },
  { id: 'd', name: 'Kavya Subramanian', value: 26_500 },
  { id: 'e', name: 'Meera Iyer', value: 25_800 },
];

export function RankListEntry() {
  const entry = byId('c-ranklist')!;
  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/RankList.tsx</code> },
        { k: 'Class', v: <code>.rank</code> },
        { k: 'Scale', v: 'to the largest row' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '8px 20px' }}>
          <div style={{ width: 640 }}>
            <RankList
              label="Top clients"
              items={SAMPLE.map((c) => ({
                ...c,
                avatarId: c.id,
                display: `₹${c.value.toLocaleString('en-IN')}`,
              }))}
            />
          </div>
        </Bench>
      </Blk>
      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Row', value: '44px, one line', token: '--w-row', note: 'Under 620px the bar drops under the name and figure.' },
            { property: 'Name track', value: '≤ 220px, ellipsis', note: 'Every bar starts on the same x.' },
            { property: 'Bar', value: '6px pill on surface-3', token: '--tx-ink-off', note: 'The first row is lime (--tx-accent), ringed on paper.' },
            { property: 'Figure', value: '13.5px / 600, tabular', note: 'The fact. The bar is aria-hidden.' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}

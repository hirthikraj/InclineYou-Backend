import { Avatar } from '../../../ui/Avatar';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const CAST = [
  { id: 'cl-001', name: 'Karthik Menon' },
  { id: 'cl-002', name: 'Divya Krishnan' },
  { id: 'cl-003', name: 'Vikram Rao' },
  { id: 'cl-004', name: 'Priya Pillai' },
  { id: 'cl-005', name: 'Rohan Sharma' },
  { id: 'cl-006', name: 'Meera K' },
  { id: 'cl-007', name: 'Anjali Nair' },
  { id: 'cl-008', name: 'Suresh Iyer' },
];

export function AvatarEntry() {
  const entry = byId('c-avatar')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Avatar.tsx</code> },
        { k: 'Class', v: <code>.av</code> },
        { k: 'Sizes', v: '4' },
        { k: 'Palette', v: '12 fixed' },
        { k: 'Colour from', v: <code>avatarToken(id)</code> },
      ]}
    >
      <Blk
        title="Specimen"
        lede="Eight of the seeded roster, at the size a list row uses. The colour is not chosen here — it is derived from the client id."
      >
        <Bench style={{ gap: 12 }}>
          {CAST.map((c) => (
            <Avatar key={c.id} id={c.id} name={c.name} size="sm" />
          ))}
        </Bench>
      </Blk>

      <Blk title="Sizes" tag="scale">
        <Bench style={{ gap: 26 }}>
          <Cell label="XL · 56px">
            <Avatar id="cl-006" name="Meera K" size="xl" />
          </Cell>
          <Cell label="LG · 40px">
            <Avatar id="cl-006" name="Meera K" size="lg" />
          </Cell>
          <Cell label="MD · 32px">
            <Avatar id="cl-006" name="Meera K" />
          </Cell>
          <Cell label="SM · 24px">
            <Avatar id="cl-006" name="Meera K" size="sm" />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The colour is keyed on the id, never the position"
        lede={
          <>
            One person is one colour on the rail, in the ribbon and in the queue &mdash; and still is tomorrow,
            when the list has reordered. That rule already exists as <code>avatarToken</code> in{' '}
            <code>lib/today/time.ts</code>; this component calls it rather than restating it, so there is one
            hash and not three &mdash; which it now genuinely is, and was not until recently.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="MEERA K · WHEREVER SHE APPEARS">
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <Avatar id="cl-006" name="Meera K" size="sm" />
              <Avatar id="cl-006" name="Meera K" />
              <Avatar id="cl-006" name="Meera K" size="lg" />
            </span>
          </Cell>
          <Cell label="RING · SELECTED IN A SPLIT">
            <Avatar id="cl-006" name="Meera K" size="lg" ring />
          </Cell>
          <Cell label="PENDING · A SEAT, NOBODY IN IT">
            <Avatar name="" size="lg" pending />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="There were three hashes, and the third was visible"
        lede={
          <>
            This component has always called <code>avatarToken</code>, but two screens never called this
            component. <code>lib/setup/options.ts</code> carried <code>avatarTint</code>, which hashed the
            trainer&rsquo;s <b>name</b> and took the modulo <i>inside</i> the loop &mdash; not the same function
            with a different key, a different function. <code>components/team/Team.tsx</code> carried a private
            <code>avatarColor</code> and a private <code>Avatar</code>, hashing the name with{' '}
            <code>&gt;&gt;&gt; 0</code>.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                <Avatar id="cl-002" name="Divya Krishnan" size="sm" />
                <Avatar id="cl-002" name="Divya Krishnan" size="sm" />
              </span>
            ),
            caption: (
              <>
                The clients screen and a coach&rsquo;s roster on the team screen, after. Both pass{' '}
                <code>id</code>, so both draw the same person the same way.
              </>
            ),
          }}
          no={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                <Avatar id="cl-002" name="Divya Krishnan" size="sm" />
                <span className="av av--sm" aria-hidden="true" style={{ background: 'var(--tx-av-9)' }}>
                  DK
                </span>
              </span>
            ),
            caption: (
              <>
                The same two screens, before. One keyed on <code>row.id</code>, the other on the name through a
                third hash &mdash; so Divya was one colour on the roster and another in her coach&rsquo;s list.
                A rule stated in a doc comment and not enforced by a single call is a preference.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="It is aria-hidden, and that is deliberate"
        lede={
          <>
            The initials are a picture of a name that is always written in full beside it. Announcing
            &ldquo;M K&rdquo; before &ldquo;Meera K&rdquo; is two readings of one fact, so the avatar is hidden
            from readers and the name beside it does the work.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <Avatar id="cl-004" name="Priya Pillai" size="sm" />
            <span style={{ fontSize: 13.5, color: 'var(--tx-ink)' }}>Priya Pillai</span>
            <span style={{ fontSize: 12.5, color: 'var(--tx-ink-2)' }}>₹9,000 overdue · 12 days</span>
          </span>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Sizes', value: '24 / 32 / 40 / 56', note: 'sm · md · lg · xl' },
            { property: 'Palette', value: '12 fixed', token: '--tx-av-1 … 12', note: 'Chosen by a hash of the client id' },
            { property: 'Initials', value: 'first + last', note: 'One-word names take their first two letters' },
            { property: 'Radius', value: 'full' },
            { property: 'Weight', value: '600', token: '--tx-font' },
            { property: 'Accessibility', value: <code>aria-hidden</code>, note: 'The name beside it is the accessible text' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                <Avatar id="cl-001" name="Karthik Menon" size="sm" />
                <span style={{ fontSize: 13.5, color: 'var(--tx-ink)' }}>Karthik Menon</span>
              </span>
            ),
            caption: 'The avatar sits beside the name it abbreviates. It is recognition at a glance, not identification.',
          }}
          no={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 8 }}>
                <Avatar id="cl-001" name="Karthik Menon" size="sm" />
                <Avatar id="cl-002" name="Divya Krishnan" size="sm" />
                <Avatar id="cl-003" name="Vikram Rao" size="sm" />
              </span>
            ),
            caption:
              'Avatars alone, standing in for names. Two clients in a roster of twenty-four will share initials, and the colour is a hash rather than a label — it distinguishes, it does not identify.',
          }}
        />
      </Blk>
    </Cmp>
  );
}

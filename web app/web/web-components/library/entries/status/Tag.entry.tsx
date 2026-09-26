import { Chip } from '../../../ui/Chip';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, RulesTable, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function TagEntry() {
  const entry = byId('c-tag')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Tag.tsx</code> },
        { k: 'Class', v: <code>.tag</code> },
        { k: 'Variants', v: '9' },
        { k: 'Height', v: '20px' },
        { k: 'Interactive', v: 'never' },
      ]}
    >
      <Blk title="Specimen">
        <Bench style={{ gap: 9 }}>
          <Tag>Neutral</Tag>
          <Tag tone="ok">Received</Tag>
          <Tag tone="warn">Renew soon</Tag>
          <Tag tone="danger">11 days late</Tag>
          <Tag tone="info">Moved</Tag>
          <Tag tone="acc">Live</Tag>
          <Tag tone="floor">Floor</Tag>
          <Tag tone="remote">Remote</Tag>
          <Tag tone="pr">PR</Tag>
        </Bench>
      </Blk>

      <Blk
        title="Nine tones, and what each one means"
        lede="A tone is a claim about the state of something, not a decoration. Two tags of the same colour on one screen should mean the same kind of thing."
      >
        <Bench style={{ gap: 22 }}>
          <Cell label="OK · SETTLED, NOTHING TO DO">
            <Tag tone="ok">Received</Tag>
          </Cell>
          <Cell label="WARN · TRUE SOON, NOT YET">
            <Tag tone="warn">Renew soon</Tag>
          </Cell>
          <Cell label="DANGER · OVERDUE, ACT">
            <Tag tone="danger">11 days late</Tag>
          </Cell>
          <Cell label="INFO · CHANGED, NEUTRAL">
            <Tag tone="info">Moved</Tag>
          </Cell>
          <Cell label="ACC · HAPPENING NOW">
            <Tag tone="acc">Live</Tag>
          </Cell>
          <Cell label="FLOOR / REMOTE · WHERE">
            <span style={{ display: 'inline-flex', gap: 7 }}>
              <Tag tone="floor">Floor</Tag>
              <Tag tone="remote">Remote</Tag>
            </span>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Never clickable — the boundary with Chip"
        lede={
          <>
            A <b>tag is read</b>; a <b>chip is pressed</b>. They look similar and mean opposite things, which is
            why <code>Tag</code> renders a bare <code>&lt;span&gt;</code> and takes no handler: a tag that needs
            to be clicked is a <code>Chip</code>, and the fix is to change the component rather than to add an{' '}
            <code>onClick</code> to this one.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="TAG · A FACT, READ">
            <Tag tone="warn">Renew soon</Tag>
          </Cell>
          <Cell label="CHIP · A FILTER, PRESSED">
            <Chip pressed={false}>Owing 5</Chip>
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '20px', note: 'Sits inside a 44px table row without changing it' },
            { property: 'Label', value: '11.5px / 600', token: '--tx-font', note: 'Sentence case, never all-caps' },
            { property: 'Radius', value: 'full', note: 'A pill. Distinguishes it from a chip’s 8px at a glance' },
            { property: 'Padding', value: '0 8px' },
            { property: 'Element', value: <code>&lt;span&gt;</code>, note: 'No role, no tab stop, no handler' },
            { property: 'Tones', value: '9', note: 'neutral · ok · warn · danger · info · acc · floor · remote · pr' },
          ]}
        />
      </Blk>

      <Blk title="Content">
        <RulesTable
          rows={[
            { rule: 'State, not category', yes: '11 days late', no: 'Payment' },
            { rule: 'Say the number', yes: 'Week 8/8', no: 'Ending' },
            { rule: 'Sentence case', yes: 'Renew soon', no: 'RENEW SOON' },
            { rule: 'Two words where possible', yes: 'Renew soon', no: 'Renewal is due shortly' },
            { rule: 'Tone matches urgency', yes: 'danger for overdue', no: 'danger for “Remote”' },
          ]}
        />
      </Blk>

      <Blk
        title="A LINKED tag keeps its tone under the pointer"
        tag="fixed 19 Sep 2026"
        lede={
          <>
            <code>.tag--link:hover</code> repainted <code>background</code> and <code>color</code>{' '}
            outright, and at (0,2,0) it outranked every <code>.tag--*</code> tone at (0,1,0)
            whatever the order — so a linked tag answered a hover by FORGETTING WHAT KIND OF TAG
            IT WAS. Pointing at the lime plan chip on the client file turned it grey, which reads as
            the chip going inert under the pointer rather than as it being hoverable.
            <br />
            <br />
            Each tone now restores its own pair at equal specificity, later in the file — the one
            case where source order is the right tool, because both rules are about the same state
            of the same element. The FEEDBACK moved to a 1px inset ring in{' '}
            <code>currentColor</code>, so it is identical on all eight tones and survives a reader
            who cannot separate them. The neutral tag is untouched.
          </>
        }
      >
        <Bench>
          <Cell label="hover each of these">
            <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              <Tag href="#tag-link-demo">Neutral</Tag>
              <Tag tone="acc" href="#tag-link-demo">
                Fat Loss · 3 day
              </Tag>
              <Tag tone="warn" href="#tag-link-demo">
                Running out
              </Tag>
              <Tag tone="danger" href="#tag-link-demo">
                6 days late
              </Tag>
              <Tag tone="ok" href="#tag-link-demo">
                Active
              </Tag>
            </span>
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, color: 'var(--tx-ink)' }}>Priya Pillai</span>
                <Tag tone="danger">12 days late</Tag>
              </span>
            ),
            caption: (
              <>
                One tag, carrying the fact the row exists for. The number is in the tag, so the row is readable
                without opening anything.
              </>
            ),
          }}
          no={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, color: 'var(--tx-ink)' }}>Priya Pillai</span>
                <Tag tone="danger">Late</Tag>
                <Tag tone="warn">Owing</Tag>
                <Tag tone="info">Active</Tag>
                <Tag tone="floor">Floor</Tag>
              </span>
            ),
            caption:
              'Four tags and no hierarchy. “Late”, “Owing” and “Active” are three readings of one situation, and the eye now has to rank four colours to find out what the row wants.',
          }}
        />
      </Blk>
    </Cmp>
  );
}

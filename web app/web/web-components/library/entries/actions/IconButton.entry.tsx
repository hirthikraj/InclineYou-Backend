import { Bell, Ellipsis, No, Panel, Plus } from '@/components/shell/Icons';

import { Button } from '../../../ui/Button';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, Matrix, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Icon button — `.btn--icon`, not a component of its own.
 *
 * The design file lists it separately and it shares every rule with `Button`:
 * the same element, the same variants, the same focus ring. Giving it its own
 * module would be two definitions of one control, and the first divergence
 * would be a padding change applied to one of them.
 *
 * `<Button iconOnly label="…">` is the whole of it.
 */
export function IconButtonEntry() {
  const entry = byId('c-iconbutton')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Button.tsx</code> },
        { k: 'Class', v: <code>.btn--icon</code> },
        { k: 'Variants', v: '3' },
        { k: 'Size', v: '32 × 32' },
        { k: 'Call-sites', v: '36' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            The same component as <code>Button</code>, with <code>iconOnly</code>. There is no separate module
            &mdash; two definitions of one control is how a padding change ends up applied to half of them.
          </>
        }
      >
        <Bench style={{ gap: 14 }}>
          <Button iconOnly label="More actions" icon={<Ellipsis />} variant="ghost" />
          <Button iconOnly label="Close" icon={<No />} variant="ghost" />
          <Button iconOnly label="Notifications" icon={<Bell />} variant="ghost" />
          <Button iconOnly label="Collapse the rail" icon={<Panel />} variant="ghost" />
          <Button iconOnly label="Add client" icon={<Plus />} variant="primary" />
        </Bench>
      </Blk>

      <Blk
        title="The accessible name is required"
        lede={
          <>
            Dropping the label drops the name with it. <code>iconOnly</code> makes <code>label</code> mandatory
            at the type level, so an icon button with nothing to announce does not compile &mdash; it is the one
            rule here that cannot be forgotten at a call-site rather than merely discouraged.
          </>
        }
      >
        <Bench style={{ gap: 30 }}>
          <Cell label="RENDERS">
            <Button iconOnly label="More actions" icon={<Ellipsis />} variant="ghost" />
          </Cell>
          <Cell label="WILL NOT COMPILE">
            <code style={{ fontSize: 12 }}>
              &lt;Button iconOnly icon={'{'}&lt;Ellipsis /&gt;{'}'} /&gt;
            </code>
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Variants and states">
        <Matrix
          rowHeader="Variant"
          columns={['Rest', 'Hover', 'Focus-visible', 'Disabled']}
          rows={[
            {
              label: 'Ghost',
              cells: [
                <Button key="r" iconOnly label="More" icon={<Ellipsis />} variant="ghost" />,
                <Button
                  key="h"
                  iconOnly
                  label="More"
                  icon={<Ellipsis />}
                  variant="ghost"
                  style={{ background: 'var(--tx-surface-3)' }}
                />,
                <Button
                  key="f"
                  iconOnly
                  label="More"
                  icon={<Ellipsis />}
                  variant="ghost"
                  style={{
                    outline: '2px solid var(--tx-focus)',
                    outlineOffset: 2,
                    boxShadow: '0 0 0 5px var(--tx-focus-halo)',
                  }}
                />,
                <Button key="d" iconOnly label="More" icon={<Ellipsis />} variant="ghost" disabled />,
              ],
            },
            {
              label: 'Secondary',
              cells: [
                <Button key="r" iconOnly label="Close" icon={<No />} />,
                <Button key="h" iconOnly label="Close" icon={<No />} style={{ background: 'var(--tx-surface-3)' }} />,
                <Button
                  key="f"
                  iconOnly
                  label="Close"
                  icon={<No />}
                  style={{
                    outline: '2px solid var(--tx-focus)',
                    outlineOffset: 2,
                    boxShadow: '0 0 0 5px var(--tx-focus-halo)',
                  }}
                />,
                <Button key="d" iconOnly label="Close" icon={<No />} disabled />,
              ],
            },
          ]}
        />
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Size', value: '32 × 32', note: 'Square. 28 × 28 at `sm`, inside a table row' },
            { property: 'Icon', value: '18px', note: 'Larger than a labelled button’s 15px — it is the only content' },
            { property: 'Radius', value: '8px', token: '--tx-r2' },
            { property: 'Min target', value: '32 × 32', token: '--w-tap', note: 'Clears WCAG 2.2 SC 2.5.8 (24×24)' },
            { property: 'Accessible name', value: <code>label</code>, note: 'Required by the type. Becomes aria-label and title' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div className="bench__row" style={{ gap: 10, alignItems: 'center', flexWrap: 'nowrap' }}>
                <Button iconOnly label="More actions for Meera K" icon={<Ellipsis />} variant="ghost" />
              </div>
            ),
            caption: (
              <>
                One glyph everybody already knows, named for the <b>row it belongs to</b>. Six rows down a list
                give six different accessible names instead of &ldquo;More actions&rdquo; six times.
              </>
            ),
          }}
          no={{
            figure: (
              <div className="bench__row" style={{ gap: 10, alignItems: 'center', flexWrap: 'nowrap' }}>
                <Button iconOnly label="Renew" icon={<Plus />} variant="primary" />
                <Button iconOnly label="Remind" icon={<Bell />} variant="primary" />
                <Button iconOnly label="Archive" icon={<No />} variant="primary" />
              </div>
            ),
            caption:
              'Three verbs with no shared glyph vocabulary, all primary. The trainer has to hover each one to find out what the row is asking. A verb this specific needs its word.',
          }}
        />
      </Blk>
    </Cmp>
  );
}

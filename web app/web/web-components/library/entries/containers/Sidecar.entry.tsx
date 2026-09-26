import { byId } from '../../../registry';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Sidecar } from '../../../ui/Sidecar';
import { TextField } from '../../../ui/Field';
import { FormGroup } from '../../../ui/FormGroup';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';

/* The specimen's reference half. Deliberately a plain Card rather than
   `ProfileCard`: this entry is about the LAYOUT, and a domain object in the
   aside would have the reader measuring that instead. */
function Reference() {
  return (
    <Card title="How clients see you">
      <b style={{ display: 'block' }}>Ravi Kannan</b>
      <p className="pfc__l">Strength &amp; fat-loss coach · Indiranagar</p>
      <div className="pfc__tags">
        <Tag>Strength</Tag>
        <Tag>Fat loss</Tag>
      </div>
    </Card>
  );
}

export function SidecarEntry() {
  const entry = byId('c-sidecar')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Sidecar.tsx</code> },
        { k: 'Classes', v: <code>.sdcw / .sdc</code> },
        { k: 'Tracks', v: '600 + 380' },
        { k: 'Rung', v: '@container 927px' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Sidecar aside={<Reference />} asideLabel="How clients see you">
            <FormGroup gap={4}>
              <TextField
                label="Name"
                hint="Personal or the name you trade under — whichever your clients already know."
                defaultValue="Ravi Kannan"
                readOnly
              />
              <TextField
                label="Headline"
                hint="What you coach, and where. One line, under your name."
                defaultValue="Strength & fat-loss coach · Indiranagar"
                readOnly
              />
              <div>
                <Button variant="primary">Save</Button>
              </div>
            </FormGroup>
          </Sidecar>
        </Bench>
      </Blk>

      <Blk
        title="It is not the split, and the difference is where it lives"
        lede={
          <>
            <code>.split</code> REPLACES <code>.body</code>: it takes the full height of{' '}
            <code>.main</code>, draws a border down the middle and gives each column a scrollport of its
            own. That is the frame you pick a row in on the left and read on the right. This is a block{' '}
            <b>inside</b> <code>.body</code> &mdash; one scroller, one reading order, no border &mdash; for
            the screen that is a form plus a standing reference the form keeps changing.
          </>
        }
      >
        <p className="blk__p">
          <code>.dock</code> is the third answer and is a third thing again: a grid track that opens and
          closes on a press, pushing the plane aside while something is edited. This one neither opens nor
          closes, and holds no controls.
        </p>
      </Blk>

      <Blk
        title="The columns are capped and the row is not"
        lede={
          <>
            MEASURED on <code>/settings/profile</code> at 1536&times;695 before this existed: a{' '}
            <b>560px column of fields in a 1409px content area</b> &mdash; 849px, 60% of the page, empty
            &mdash; with the preview card the screen is named after the first thing to scroll out of view.
          </>
        }
      >
        <p className="blk__p">
          Capping the tracks rather than putting a <code>max-width</code> on the whole block is the
          wide-table lesson restated: a row capped in the middle of a page reads as a layout that failed to
          fill it, while two columns that stop where their content stops read as two columns. 600 is the
          form measure &mdash; a <code>.fld__h</code> at 12px is ~92 characters wide there, and the hint is
          the widest thing in the column.
        </p>
      </Blk>

      <Blk
        title="The rung is a container query, and it has to be"
        lede={
          <>
            The rail expands and collapses, so the same viewport hands this block two different boxes
            (trap 4). MEASURED at a 1181px window: <b>1117px</b> wide with the rail shut, <b>933px</b> with
            it open, and the form column 600 against 462. No viewport number is right for both.
          </>
        }
      >
        <p className="blk__p">
          So <code>.sdcw</code> is the container and <code>.sdc</code> queries it &mdash; they cannot be one
          element, because a container cannot query itself and{' '}
          <code>grid-template-columns</code> is the declaration the rung changes. The threshold is the
          arithmetic: 520 + 28 + 380 = <b>928</b>.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Form track', value: 'minmax(0, 600px)', token: '--w-sdc-main' },
            { property: 'Aside track', value: 'minmax(280px, 380px)', token: '--w-sdc-side' },
            { property: 'Gap', value: '28px', note: '20px stacked' },
            { property: 'Aside', value: 'position: sticky', note: 'top:0 — see below' },
            { property: 'Rung', value: '@container 927px', note: 'On .sdcw, not the viewport' },
            { property: 'Stacked order', value: 'aside first', note: 'order:-1; DOM order unchanged' },
          ]}
        />
        <p className="blk__p">
          <code>top:0</code> and not <code>top:var(--w-scrollpad-t)</code>. Chrome resolves a sticky offset
          against the scrollport&rsquo;s <b>content</b> box, so <code>.body</code>&rsquo;s 20px of padding is
          already spent &mdash; MEASURED, the aside pinned at <b>y=225</b> beside a form column starting at
          205, a 20px step across the top of a screen whose point is that the two halves are read together.
        </p>
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 340 }}>
                <Card title="What is still empty">
                  <p className="small">Nothing here is required. A client simply sees less of you.</p>
                  <div className="row row--wrap mt2">
                    <Tag>Languages</Tag>
                    <Tag>Social links</Tag>
                  </div>
                </Card>
              </div>
            ),
            caption:
              'A standing reference: read at a glance, nothing in it has to be reached in sequence, and it is still honest when the grid stacks it above the form.',
          }}
          no={{
            figure: (
              <div style={{ width: 340 }}>
                <Card title="Step 2 of 3">
                  <FormGroup gap={4}>
                    <TextField label="Gym name" defaultValue="" readOnly />
                    <div>
                      <Button variant="primary">Continue</Button>
                    </div>
                  </FormGroup>
                </Card>
              </div>
            ),
            caption:
              'Fields in the aside. Stacked, they are drawn above the form and tabbed to after it — so a keyboard user fills the page in one order and reads it in another.',
          }}
        />
      </Blk>
    </Cmp>
  );
}

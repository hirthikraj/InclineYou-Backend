import { Modal } from '../../../ui/Modal';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, RulesTable, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function ModalEntry() {
  const entry = byId('c-modal')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Modal.tsx</code> },
        { k: 'Class', v: <code>.modal</code> },
        { k: 'Width', v: '472px' },
        { k: 'Count in product', v: '4' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Modal
            title="Archive Meera Krishnan?"
            inline
            width={440}
            confirm={{ label: 'Archive', danger: true }}
            cancel={{ label: 'Keep Meera' }}
          >
            <p className="note" style={{ marginTop: 0 }}>
              The 34 logged sessions and ₹68,000 of payment history <b>stay exactly where they are</b> and keep
              counting towards your GST turnover. Meera moves out of the roster and stops appearing on Today.
            </p>
          </Modal>
        </Bench>
      </Blk>

      <Blk
        title="Four attributes, all load-bearing"
        lede={
          <>
            <code>role</code>, <code>aria-modal</code>, <code>aria-labelledby</code> and{' '}
            <code>aria-describedby</code>. A dialog with no accessible name is announced as
            &ldquo;dialog&rdquo;, and the sentence explaining what archiving actually does &mdash; the sentence
            the whole modal exists to deliver &mdash; is <b>not read at all</b> unless something points at it.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.9 }}>
            &lt;div role=&quot;dialog&quot; aria-modal=&quot;true&quot;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp; aria-labelledby=&quot;…-t&quot; &nbsp;&larr; &ldquo;Archive Meera
            Krishnan?&rdquo;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp; aria-describedby=&quot;…-b&quot;&gt; &larr; what archiving keeps
          </code>
        </Bench>
      </Blk>

      <Blk
        title="The confirm answers the question"
        lede={
          <>
            The heading is a question and <code>confirm.label</code> is its answer, so the pair reads
            &ldquo;Archive Meera Krishnan?&rdquo; → <b>Archive</b>. A dialog answered with &ldquo;OK&rdquo; is
            one a trainer confirms without re-reading, which for an archive is the one time they should.
          </>
        }
      >
        <RulesTable
          rows={[
            { rule: 'Heading is a question', yes: 'Archive Meera Krishnan?', no: 'Confirm action' },
            { rule: 'Confirm is the verb', yes: 'Archive', no: 'OK' },
            { rule: 'Cancel says what it keeps', yes: 'Keep Meera', no: 'Cancel' },
            { rule: 'Body says what survives', yes: '34 sessions stay where they are', no: 'This cannot be undone' },
            { rule: 'Danger tone for destruction', yes: 'Archive, in danger', no: 'Archive, in primary' },
          ]}
        />
      </Blk>

      <Blk
        title="Four exist, and that is the specification"
        lede={
          <>
            The design file counts them: <b>four modals in the whole product</b>. A modal stops everything, so
            each one has to earn it &mdash; archive, write-off, a destructive settings change, and leaving a
            half-logged session. Anything else is a <b>Panel</b>, which is a place rather than an interruption.
          </>
        }
      />

      <Blk
        title="ModalHost — the other half of the family"
        lede={
          <>
            <code>Modal</code> above is deliberately <em>the surface and its
            semantics, not a dialog manager</em>, and that boundary is right: a
            specimen renders it <code>inline</code> with no scrim at all. What
            was missing is the other half, and its absence had a cost —{' '}
            <b>every modal in the product hand-writes it.</b>{' '}
            <code>SwapModal.tsx</code>, <code>AddClientFlow.tsx</code> and the
            rest each carry their own <code>&lt;div className=&quot;scrim&quot;&gt;</code>,
            their own <code>keydown</code> listener and their own{' '}
            <code>role=&quot;dialog&quot;</code> markup. Three copies of a
            behaviour, and the third one to be written is the one that forgets
            the Escape key.
            <br />
            <br />
            One family, two parts. <code>Modal</code> is the box;{' '}
            <code>ModalHost</code> is the surface it floats over. A second
            catalogue entry would say they are two components, and they are not:
            nothing should render one without the other outside a bench.
          </>
        }
      >
        <SpecTable
          rows={[
            {
              property: 'Scrim',
              value: <code>.scrim.scrim--top</code>,
              token: '--tx-scrim',
              note: '§24’s overlay layer, which is where glass applies. Click closes.',
            },
            {
              property: 'Escape',
              value: 'window, CAPTURE phase',
              note: 'A modal over a screen with its own Escape ladder must spend one press on one rung — capture runs before any bubble listener, whatever order they were added in.',
            },
            {
              property: 'Focus in',
              value: 'first focusable, else the box',
              note: '`.modal` is not focusable, so a dialog whose body is prose would otherwise leave focus outside a surface claiming to be modal.',
            },
            {
              property: 'Focus out',
              value: 'the previously focused element',
              note: 'Without it, closing drops a keyboard user at the top of the document — AccountMenu calls that “the whole rail again to get back to where they were”.',
            },
            {
              property: 'Tab',
              value: 'trapped, both directions',
              note: '`aria-modal` claims the rest of the page is unreachable. Without a trap that claim is a lie.',
            },
            {
              property: 'cover',
              value: '“main” (default) | “frame”',
              note: '`.scrim` is absolute, so it fills `.main` — the content area alone. “frame” adds `.scrim--frame` for a dialog that claims the whole app is inert, rail included.',
            },
            {
              property: 'initialFocus',
              value: 'a selector, optional',
              note: 'The default — the first focusable thing — is right for a confirm and wrong for a form with a close ✕ in its head. A selector rather than a ref, which is what `react-hooks/refs` refuses across this boundary. `autoFocus` cannot do it: React applies it in the commit phase, before this host’s effect runs.',
            },
          ]}
        />
        <p className="blk__p">
          Verified by driving it rather than by reading it: Escape closes, focus
          lands on the first control on open and returns to the trigger on close,
          in both themes. One trap for whoever checks it next —{' '}
          <b>a programmatic <code>.click()</code> does not move focus</b>, so the
          focus-return measures as <code>BODY</code> and looks broken. Call{' '}
          <code>.focus()</code> first, the way a pointer click does.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Width', value: '472px' },
            { property: 'Radius', value: '12px', token: '--tx-r3' },
            { property: 'Title', value: '16px / 700', note: 'An h2, and a question when it asks for a decision' },
            { property: 'Body', value: '13.5px / 1.6', note: 'What survives the action, in figures' },
            { property: 'Foot', value: 'ghost + primary', note: 'Danger when the action destroys' },
            { property: 'Focus', value: 'trapped', note: 'The host’s job. This is the surface and its semantics' },
            { property: 'Escape', value: 'closes', note: 'Unlike a panel, which closes on Back' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <Modal title="Archive Meera Krishnan?" inline width={300} confirm={{ label: 'Archive', danger: true }} cancel={{ label: 'Keep Meera' }}>
                <p className="note" style={{ marginTop: 0, fontSize: 12.5 }}>
                  34 sessions and ₹68,000 of history stay where they are.
                </p>
              </Modal>
            ),
            caption: 'The question names the person, the body says what survives, and both buttons say what they do.',
          }}
          no={{
            figure: (
              <Modal title="Are you sure?" inline width={300} confirm={{ label: 'OK' }} cancel={{ label: 'Cancel' }}>
                <p className="note" style={{ marginTop: 0, fontSize: 12.5 }}>
                  This action cannot be undone.
                </p>
              </Modal>
            ),
            caption:
              '“Are you sure?” about what, and “OK” to what. The one sentence of body is a warning with no content — it says the stakes are high and never says what they are.',
          }}
        />
      </Blk>
    </Cmp>
  );
}

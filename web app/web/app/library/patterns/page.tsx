import Link from 'next/link';

import { Blk, Bench, Cell } from '@/web-components/library/chrome/Blk';
import { DoDont } from '@/web-components/library/chrome/Docs';
import { Sec, Tbl } from '@/web-components/library/chrome/Sec';
import { bySlug } from '@/web-components/library/system/parts';
import { Button } from '@/web-components/ui/Button';
import { TextField } from '@/web-components/ui/Field';
import { Message } from '@/web-components/ui/Message';
import { Why } from '@/web-components/ui/Why';

/**
 * Part 4 — interaction patterns.
 *
 * ── WHY A PATTERN IS NOT A COMPONENT ────────────────────────────────────────
 *
 * The catalogue answers "what is it". A pattern answers "what happens", and
 * the difference is where the product's consistency actually leaks. Every
 * screen here uses the same Button; not every screen used to fail the same way,
 * and a reader who has seen one failure should be able to predict the next.
 *
 * ── AND WHY THE SPECIMENS ARE LIVE ──────────────────────────────────────────
 *
 * The don't halves are real components put into the wrong arrangement, not
 * drawings of a mistake. A rule nobody can commit is not worth printing, and
 * the fastest way to check that a rule is still true is to see the product
 * doing the wrong thing and recognise it.
 */
export const metadata = { title: 'Interaction patterns · Design system' };

const FEEDBACK = [
  ['Under ~300ms', 'Nothing at all. A flash of a loading state is worse than the wait it describes.'],
  ['A control that is working', 'The state goes on the control: the button that was pressed says it is working, in place.'],
  ['A write that changed a row', 'The row is the receipt. It updates where the reader is already looking, and nothing else announces it.'],
  ['A write with no row on screen', 'A toast — `role="status"`, one line, with an Undo where the action can be taken back.'],
  ['A failure', 'An inline message at the point of failure, `role="alert"`, naming what went wrong and what to do.'],
];

const NAV = [
  ['Between the five areas of the product', 'The rail. Always present, always in the same order, and it says where you are with `aria-current`.'],
  ['Into a record from a list', 'A route, not an overlay. A client file is a place, and a place has a URL somebody can send.'],
  ['To edit one thing beside its context', 'A docked panel — a third grid track that pushes the plane rather than covering the rows the numbers are set against.'],
  ['To answer a question that blocks everything', 'A modal. Rare by design; the scrim is the promise that nothing behind it can change meanwhile.'],
  ['Back up a hierarchy', 'Breadcrumbs, and every level in them is a link. The browser’s back button is never the only route.'],
];

export default function Page() {
  return (
    <Sec part={bySlug('patterns')!}>
      <Blk
        title="Error handling"
        tag="at the point of failure"
        lede={
          <>
            An error names what went wrong and what to do, in a sentence. It does not apologise and it does
            not blame. The house style is <i>fact, consequence, count</i> — “That code isn’t right. 2 tries
            left.”
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 300 }}>
                {/* `TextField`, not `Field`. Field takes a render prop, and a
                    function cannot cross the server/client boundary — this page
                    is a server component. The wrapper exists for exactly the
                    common case where the control is an input. */}
                <TextField
                  label="Phone number"
                  id="pat-phone"
                  error="That number is 9 digits. An Indian mobile number has 10."
                  defaultValue="+91 97000 0000"
                  readOnly
                />
              </div>
            ),
            caption: (
              <>
                The message sits under the field it belongs to, says what is wrong, and says what right looks
                like. The field keeps what was typed.
              </>
            ),
          }}
          no={{
            figure: (
              <div style={{ width: 300 }}>
                <Message tone="err">Validation failed. Please check your input and try again.</Message>
              </div>
            ),
            caption: (
              <>
                A banner at the top of a form for a single field’s problem. It does not say which field, and
                on a long form the reader has to hunt for it.
              </>
            ),
          }}
        />
        <p className="blk__p" style={{ marginTop: 16 }}>
          A toast never carries a field error — it can be gone before it is read, and it is nowhere near the
          thing that has to change. Validate on blur and re-validate on change; never on every keystroke of a
          first entry, which tells somebody their half-typed answer is wrong.
        </p>
      </Blk>

      <Blk
        title="Feedback"
        tag="the ladder"
        lede={
          <>
            One rule underneath all of it: answer where the reader is already looking. The louder the
            mechanism, the further down this list it sits.
          </>
        }
      >
        <Tbl
          cols={['When', 'What happens']}
          rows={FEEDBACK.map(([k, v]) => ({ key: k, cells: [<b key="k">{k}</b>, v] }))}
        />
      </Blk>

      <Blk
        title="Navigation"
        tag="one answer per question"
        lede={
          <>
            Five questions, five answers, and the same answer every time. The components that implement them
            are in <Link href="/library/components">part 3</Link>; what this table fixes is which one gets
            used.
          </>
        }
      >
        <Tbl cols={['Going', 'Mechanism']} rows={NAV.map(([k, v]) => ({ key: k, cells: [<b key="k">{k}</b>, v] }))} />
      </Blk>

      <Blk
        title="Destructive actions"
        tag="the exit, and the typed one"
        lede={
          <>
            Every action has an exit. A reversible one gets its take-back; an irreversible one gets a
            confirmation that cannot be cleared by the same reflex that started it.
          </>
        }
      >
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="REVERSIBLE — TAKE IT BACK" stretch>
            <Message tone="ok">
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                Session moved to 18:30.
                <Button variant="ghost">Undo</Button>
              </span>
            </Message>
          </Cell>
          <Cell label="IRREVERSIBLE — TYPE IT" stretch>
            <Why heading="This cannot be undone" tone="danger">
              Deleting the account removes every session, payment and note on it. The phone number is not
              released — it cannot be used to sign up again.
            </Why>
          </Cell>
        </Bench>
        <p className="blk__p" style={{ marginTop: 16 }}>
          The delete-account screen asks for the phone number, typed, rather than a checkbox: a checkbox is
          pressed by the same reflex that pressed the button. And the consequence is stated <i>above</i> the
          field, because it is the one thing a trainer cannot discover by trying.
        </p>
        <p className="blk__p">
          The opposite failure is just as real. Never confirm the routine — a second “Are you sure” on an
          ordinary save teaches people to click through the one that matters.
        </p>
      </Blk>
    </Sec>
  );
}

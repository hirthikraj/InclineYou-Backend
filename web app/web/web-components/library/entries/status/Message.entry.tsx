import { Message } from '../../../ui/Message';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/* The 15px glyph the product's messages carry, drawn here rather than imported
   so the page does not reach into `components/`. */
function Warn({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 9v5" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function MessageEntry() {
  const entry = byId('c-message')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Message.tsx</code> },
        { k: 'Class', v: <code>.msg</code> },
        { k: 'Tones', v: 'err · warn · ok' },
        { k: 'Height', v: '38px reserved, icon or not' },
      ]}
    >
      <Blk
        title="Specimen"
        lede="What the submission did — not what one control refused."
      >
        <Bench style={{ gap: 14, alignItems: 'stretch' }}>
          <Cell label="ERR">
            <Message tone="err" icon={<Warn />} alert>
              That number is already on another trainer&rsquo;s roster.
            </Message>
          </Cell>
          <Cell label="WARN">
            <Message tone="warn" icon={<Warn />}>
              Seat limit reached (5). Remove a member first.
            </Message>
          </Cell>
          <Cell label="OK">
            <Message tone="ok" icon={<Warn />}>
              Saved. Packs already sold are untouched.
            </Message>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The boundary with a field&rsquo;s error"
        lede={
          <>
            <code>.fld__e</code> is what went wrong with <b>this control</b>: it hangs off one input, it is named
            by that input&rsquo;s <code>aria-describedby</code>, and a reader hears it on arriving at the field.
            A message is what went wrong with <b>the submission</b>, and it sits between the last field and the
            button because that is where the eye goes next.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 280 }}>
                <Message tone="err" icon={<Warn />} alert>
                  The server did not answer. Nothing was saved.
                </Message>
              </div>
            ),
            caption: <>A fact about the form. It belongs to the form.</>,
          }}
          no={{
            figure: (
              <div style={{ width: 280 }}>
                <Message tone="err" icon={<Warn />} alert>
                  Ten digits, no country code.
                </Message>
              </div>
            ),
            caption: (
              <>
                A fact about one input. That is <code>Field</code>&rsquo;s <code>error</code>, which wires it to
                the control with <code>aria-describedby</code> — said here, it is orphaned from the thing it is
                about.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="Why this component was missing, and what it cost"
        lede={
          <>
            <code>.msg</code> is one of the most-used classes in §04 &mdash; twenty-nine call-sites &mdash; and
            it had no file in <code>ui/</code> and no row in <code>registry.ts</code>. So every screen that
            needed one copied the markup, and the one screen that did not copy it wrote its own{' '}
            <code>.form-err</code> in <code>app/styles/app.css</code> instead: ten uses, one file, a second
            answer to a question §04 had already answered. A class that popular with no catalogue row is a gap
            the catalogue could not see.
          </>
        }
      />

      <Blk
        title="The icon is not decoration"
        lede={
          <>
            <code>.msg</code> is <code>display: flex</code> with a <code>gap: 8px</code> and a{' '}
            <code>min-height: 38px</code> &mdash; the space is reserved whether or not a glyph is passed. Colour
            alone carries the difference between a warning and a confirmation, and colour alone is gone for
            anyone who cannot separate the two hues, so a message worth showing says it twice.
          </>
        }
      >
        <SpecTable
          rows={[
            { property: 'tone', token: 'err | warn | ok', value: '—', note: 'Omitted is the neutral note: ink-3.' },
            { property: 'icon', token: 'ReactNode', value: '—', note: '15px. The place is reserved either way.' },
            { property: 'alert', token: 'boolean', value: 'false', note: 'role="alert". For news, never for a standing note.' },
            { property: 'children', token: 'ReactNode', value: 'required', note: 'Wrapped in a span, so the flex row is icon + text.' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}

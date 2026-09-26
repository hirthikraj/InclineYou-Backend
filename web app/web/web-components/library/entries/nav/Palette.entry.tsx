'use client';

import { useState } from 'react';

import { Dumbbell, Search, Wallet } from '@/components/shell/Icons';
import { Avatar } from '../../../ui/Avatar';
import { Button } from '../../../ui/Button';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Command palette.
 *
 * The product's `components/today/Palette.tsx` takes `clients`, `attention` and
 * `today` — a slice of the deck rather than a list of commands. Rendering it
 * here would mean building a fake deck, and a fake deck is exactly the copied
 * data this library exists to avoid.
 *
 * So this entry documents it and links to it running on the real screen, which
 * is the honest answer for a component whose whole subject is the book it opens
 * over.
 */
export function PaletteEntry() {
  const entry = byId('c-palette')!;
  const [shown, setShown] = useState(false);

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>components/today/Palette.tsx</code> },
        { k: 'Class', v: <code>.pal</code> },
        { k: 'Shortcut', v: '⌘K' },
        { k: 'Width', v: '620px' },
      ]}
    >
      <Blk
        title="Documented here, rendered on Today"
        lede={
          <>
            The palette takes a slice of the <b>deck</b> &mdash; the clients, the attention rows, the day.
            Standing it up here would mean inventing a book for it to search, and an invented book is the
            copied data this library exists to end.
          </>
        }
      >
        <Bench style={{ gap: 14 }}>
          <Button href="/today" variant="primary">
            Open it on Today
          </Button>
          <Button variant="ghost" onClick={() => setShown((s) => !s)}>
            {shown ? 'Hide the shape' : 'Show the shape'}
          </Button>
        </Bench>
        <p className="blk__p">
          Press <kbd>⌘</kbd><kbd>K</kbd> once Today is open, or use the search box in the top bar &mdash;
          which is a button for exactly this reason.
        </p>
      </Blk>

      {shown ? (
        <Blk title="The shape, drawn" tag="not the component">
          <Bench pad={false} style={{ padding: '18px 20px' }}>
            {/*
              `aria-hidden`, and no `<input>` in it — the two go together. This
              is a picture of a palette, and a reader that met a real field here
              would be offered a search that searches nothing. The prose under
              it is what a reader gets, and it says where the live one is.

              The head is the DESIGN FILE'S own head: the icon, the query as
              text, and `.pal__car` — which is the CARET, a 1px accent bar, and
              nothing else. This block used to hang the row's second line off
              that class, so every hint rendered as text overflowing a 1px box
              and printed itself across the page. The second line is `.pal__h`.
            */}
            <div className="pal" style={{ width: 560 }} aria-hidden="true">
              <div className="pal__in">
                <Search size={17} />
                <span>mee</span>
                <span className="pal__car" />
              </div>
              <div className="pal__list">
                <p className="pal__gk">Clients</p>
                <div className="pal__i" aria-selected="true">
                  <Avatar name="Meera Krishnan" id="cli_meera" size="sm" />
                  <span>Meera Krishnan</span>
                  <span className="pal__h">Floor &middot; Push / Pull</span>
                  <kbd>&crarr;</kbd>
                </div>
                <p className="pal__gk">Actions</p>
                <div className="pal__i">
                  <Dumbbell size={16} />
                  <span>Renew Meera Krishnan&rsquo;s pack</span>
                  <span className="pal__h">2 sessions left</span>
                </div>
                <p className="pal__gk">Go to</p>
                <div className="pal__i">
                  <Wallet size={16} />
                  <span>Business</span>
                  <kbd>G B</kbd>
                </div>
              </div>
            </div>
          </Bench>
          <p className="blk__p">
            This is <b>drawn markup</b>, not the component &mdash; the only specimen in the library that is.
            It is here to show the three regions and the grouped list; the behaviour is on Today. The
            accelerator beside <i>Business</i> is <kbd>G</kbd><kbd>B</kbd> because the palette reads the
            rail&rsquo;s own <code>PRIMARY</code> for its destinations, so the hint it prints and the hint the
            rail prints are one string.
          </p>
        </Blk>
      ) : null}

      <Blk
        title="It is the search"
        lede={
          <>
            The top bar&rsquo;s search box does not filter anything &mdash; it opens this. That is why the box
            is a <code>&lt;button&gt;</code>: a text input that swallows the first keystroke and throws it away
            is the worst version of the control.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Width', value: '620px' },
            { property: 'Shortcut', value: '⌘K', note: 'And the top bar’s search button' },
            { property: 'Groups', value: 'clients · sessions · go to', note: 'Headed, so a long list stays scannable' },
            { property: 'Rows', value: '~38px', note: 'Second line is .pal__h — why this row matched' },
            { property: 'Status', value: 'Beta', note: 'The design file’s own marking' },
            { property: 'Data', value: 'the deck', note: 'Not a command list. It searches the book' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}

'use client';

import { useState } from 'react';

import { Button } from '../../../ui/Button';
import { ListRow } from '../../../ui/ListRow';
import { ScreenSheet } from '../../../ui/ScreenSheet';

/**
 * Live, because the component IS the navigation: a summary screen, a row that
 * drills in, a back control and an entrance from the side moved to. A frozen
 * specimen would show one screen and none of that.
 *
 * Drawn inside a FRAME, not over the library. `.scrsh` is `position:fixed`; the
 * frame's `transform` makes it the containing block for fixed descendants, so the
 * sheet fills a 360×520 phone-sized box instead of the reader's whole window. It
 * is the one place a `transform` is wanted for that side effect rather than
 * fought (trap 11 is the same mechanism, unwanted). No `ModalHost`: the specimen
 * has no page to trap focus away from.
 */
export function ScreenSheetSpecimen() {
  const [screen, setScreen] = useState<'summary' | 'detail'>('summary');
  const [dir, setDir] = useState<'forward' | 'back' | null>(null);

  return (
    <div
      style={{
        position: 'relative', width: 360, maxWidth: '100%', height: 520,
        transform: 'translateZ(0)', overflow: 'hidden',
        border: '1px solid var(--tx-line)', borderRadius: 'var(--tx-r3)',
      }}
    >
      {screen === 'summary' ? (
        <ScreenSheet
          title="Edit template"
          screen="summary"
          direction={dir}
          backLabel="Close"
          onBack={() => {}}
          action={<Button variant="primary" size="sm">Save</Button>}
        >
          <p className="sh__l" style={{ marginTop: 0 }}>What it asks for</p>
          <ListRow
            onClick={() => { setDir('forward'); setScreen('detail'); }}
            title="Measurements"
            sub="Body weight · Body fat · Waist · +3"
          />
        </ScreenSheet>
      ) : (
        <ScreenSheet
          title="Measurements"
          screen="detail"
          direction={dir}
          backLabel="Back to the template"
          onBack={() => { setDir('back'); setScreen('summary'); }}
          action={
            <Button variant="secondary" size="sm" onClick={() => { setDir('back'); setScreen('summary'); }}>
              Done
            </Button>
          }
        >
          <p className="small" style={{ margin: 0 }}>
            A drill-in screen. It opened at its top, entered from the right, and focus is on its heading.
          </p>
        </ScreenSheet>
      )}
    </div>
  );
}

import { Rail } from './Rail';
import type { SetupState, SetupStep } from '@/lib/setup/steps';

/**
 * The setup plate — `.stp`, and deliberately not the auth split.
 *
 * §04's `.authwrap` is an argument beside a form: a quote on the left that the
 * product wants read before anything is asked. This is a RAIL beside a form,
 * and the rail is working — it is the progress indicator and the record of the
 * answers, which is why the left half here does not disappear on a narrow
 * window the way the sign-in plate's brand half once did. Losing the brand plate costs a sentence;
 * losing the rail costs the only thing telling a trainer where they are.
 */
export function SetupShell({
  current,
  state,
  children,
}: {
  /** Null on the pre-flight screen, which is before step 1 rather than on it. */
  current: SetupStep | null;
  state: SetupState;
  children: React.ReactNode;
}) {
  return (
    <div className="app app--noshell">
      <div className="stp">
        {/* Keyed on the step so the rail's disclosure resets on the way out.
            Every step renders the same tree in the same slot, so React would
            otherwise keep the panel open across a navigation and drop the next
            step's headline under the last one's answers. */}
        <Rail key={current ?? 'preflight'} current={current} state={state} />
        <div className="stp__r">{children}</div>
      </div>
    </div>
  );
}

/**
 * The headline and the line under it. Every step opens with exactly these two.
 *
 * An `h1`, not the `h2` the frames imply. There is no other heading on a setup
 * page — the rail's rows are links and its label is a `micro` — so an `h2` here
 * left every step in the flow with no level-one heading at all, which is a
 * document that starts at the second level and a skip-to-heading that lands
 * nowhere.
 *
 * And no inline size. `.stp__hd` is 25px in §10 and all three callers wrote
 * `fontSize: 26` over it by hand, which is a value that cannot be made
 * responsive from three places; `app.css` clamps the class instead.
 */
export function StepHead({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <>
      <h1 className="stp__hd">{title}</h1>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        {sub}
      </p>
    </>
  );
}

/** A `.micro` group header — "FIRST, HOW YOU WORK", "YOUR OWN PACKS". */
export function GroupLabel({ children, top = 24 }: { children: React.ReactNode; top?: number }) {
  return (
    /* No colour. §17's `.micro` already sets `--tx-ink-3` (and the mono
       family, the size, the tracking and the uppercase). The margin stays
       inline because it is the one value that varies per caller. */
    <p className="micro" style={{ margin: `${top}px 0 9px` }}>
      {children}
    </p>
  );
}

import type { CSSProperties, ReactNode } from 'react';

/**
 * Brief — what a flow is about to ask, named before anything is asked.
 *
 * ── WHY IT IS A COMPONENT AND NOT MARKUP ON ONE SCREEN ───────────────────────
 *
 * The pre-flight (`/setup`, frame 4a) is the screen the teardown paid for: the
 * most-cited onboarding complaint across every competitor was **surprise**, not
 * length — *"I wasn't made aware of all the things they would require from me"*
 * — so the flow spends a screen naming the questions. That screen hand-wrote
 * the list: a `.kv` per row with `alignItems`, a `padding`, a `flex: 1` and two
 * `display: block`s inline, over a class whose whole job is a label on the left
 * and a value on the right. It rendered, and it was a second definition of a
 * row that the catalogue could not see, change or check.
 *
 * It is general. Any flow that asks for more than a couple of things owes the
 * person a contents page before it starts — client onboarding and the program
 * builder are both that shape — and the alternative is each of them solving it
 * again, differently.
 *
 * ── THE TWO COMPONENTS IT IS NOT, AND WHY NEITHER FITS ───────────────────────
 *
 * `Timeline` is the near miss, and it is wrong in both directions. Its contract
 * is *what happened, newest first*: the ordering prop is a `date` with an ISO
 * `at` behind it, and a step range is not an instant. Its dot also carries
 * `box-shadow: 0 0 0 3px var(--tx-canvas)` — a halo punched out of the CANVAS —
 * and this list sits on `--tx-surface`, where that ring draws as a dark outline
 * around every dot.
 *
 * `ListRow` is the finding pane of a split, and `.lrow__t` / `.lrow__s` both
 * ellipsise on one line. Every subtitle here is a sentence that wraps. That is
 * the note the pre-flight already carried in a comment before this file existed.
 *
 * ── THE COUNT IS A RANGE, AND THAT IS THE POINT ──────────────────────────────
 *
 * Five entries cover eight steps: `1`, `2–4`, `5`, `6–7`, `8`. The body groups
 * the questions the way a trainer would recognise them; the rail keeps the
 * eight. The range is the join between the two, and it is why this is not the
 * step rail drawn twice — §10 forbids two progress systems in one flow, and a
 * contents entry has no state. Nothing here is ever lit, ticked or current.
 *
 * ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────────
 *
 * It is not a control. Every row is a statement about a question that is coming,
 * so there is no `href` and no `onClick`: a row that jumped to step 6 would be
 * offering a shortcut past the one question the flow cannot skip, from the one
 * screen whose job is to promise nothing is being hidden. A flow whose contents
 * ARE navigable has a step rail (`Wizard`) and should draw that instead.
 *
 * The `right` slot takes a node rather than an `optional` boolean, and the
 * pre-flight is why that mattered within a week of it being written. It shipped
 * marking the OPTIONAL groups; the flow then made seven of its eight steps
 * skippable, and the same list had to mark the one REQUIRED group instead —
 * four identical chips down five rows is furniture, not a marker. A boolean
 * would have had to be renamed and inverted at every call-site to say the
 * opposite thing. A node says whatever the screen means, and the tag's tone
 * stays the call-site's to choose.
 */
export type BriefItem = {
  /**
   * The step, or the range of steps, this entry covers: `1`, `2–4`. An en dash,
   * not a hyphen — it is a range, and §01's mono face draws both.
   */
  count: ReactNode;
  title: ReactNode;
  /** One line: what the question is for, in the trainer's terms. It wraps. */
  body?: ReactNode;
  /** Usually a `<Tag>`. Aligned to the title's line, not to the row's middle. */
  right?: ReactNode;
};

export function Brief({
  items,
  label,
  className,
  style,
}: {
  items: BriefItem[];
  /**
   * What the list is of: "What we'll ask". Names the list, so a reader hears
   * "list, 5 items" with a subject rather than five loose rows.
   */
  label: string;
  className?: string;
  /** The call-site's own placement — a `marginTop`, a `maxWidth`. Nothing else. */
  style?: CSSProperties;
}) {
  return (
    /*
     * An `<ol>`, because the order is the meaning: these are the questions in
     * the order they will be asked, and a `<ul>` would say the order is
     * incidental. The visible count is `count`, which is why the list's own
     * numbering is off — `list-style: none` is in §04 with the rest of it.
     */
    <ol className={['brf', className].filter(Boolean).join(' ')} aria-label={label} style={style}>
      {items.map((it, i) => (
        <li className="brf__i" key={i}>
          {/* `aria-hidden`: the range is a visual index into the rail, and read
              aloud before every title it is five step numbers between the
              trainer and the five things the screen is actually saying. */}
          <span className="brf__n" aria-hidden="true">
            {it.count}
          </span>
          <span className="brf__m">
            <span className="brf__t">{it.title}</span>
            {it.body ? <span className="brf__s">{it.body}</span> : null}
          </span>
          {it.right ? <span className="brf__r">{it.right}</span> : null}
        </li>
      ))}
    </ol>
  );
}

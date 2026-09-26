import type { ReactNode } from 'react';

/**
 * PROMPT LIST — the questions a blank free-text field is really asking.
 * Catalogue entry `c-prompts`, `.prompts`.
 *
 * ── WHAT IT IS FOR, AND THE ONE CONDITION IT IS FOR ─────────────────────────
 *
 * A field nobody has filled in is not a layout problem, it is a *what do you
 * want from me* problem. The client file's notes tab is the case it was built
 * for: the tab exists to hold "prefers mornings, hates burpees, getting married
 * in Nov", none of that is a field, and a trainer facing an empty box writes
 * nothing rather than writing the wrong thing. `EmptyState` already said as much
 * in prose — *the things that never fit in a field* — and prose is the one form
 * of that sentence a reader cannot act on.
 *
 * So: four questions, each a real control, each opening the composer with
 * itself as the placeholder. It seeds **nothing**. A prompt written into the
 * draft is text somebody then has to delete, and it would put the product's
 * words inside a note the product does not read; as a placeholder it does its
 * whole job and vanishes on the first keystroke.
 *
 * ── IT IS NOT A PERMANENT FIXTURE, AND THE CALL-SITE DECIDES ────────────────
 *
 * There is no `count` prop and no threshold here: whether a surface is still
 * being taught is the surface's own question. The notes tab draws it at one to
 * three notes — past that the trainer has demonstrated what the field is for,
 * and a standing block of hints is the chrome this component exists to avoid
 * becoming.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *
 * It does not carry an icon per prompt, a *dismiss*, or a memory of which ones
 * have been used. Each of the three turns a hint into a feature with state, and
 * the thing it is hinting at is a textarea.
 *
 * `onPick` is optional so a specimen can render one on a server. Without it the
 * buttons are inert — which is right for a catalogue page and wrong everywhere
 * else, so a call-site that forgets it gets a visibly dead control rather than
 * a silent one.
 */
export function PromptList({
  /**
   * What this list is, in two or three words. A label rather than a heading:
   * the questions under it are the content, and a real `<h*>` here would put a
   * hint into the document outline between a card's title and its list.
   */
  kicker,
  /** The questions. Four is the shape it was measured at; three or five are fine. */
  prompts,
  /** What a question does. Given the prompt's own text, verbatim. */
  onPick,
  className,
}: {
  kicker: ReactNode;
  prompts: string[];
  onPick?: (prompt: string) => void;
  className?: string;
}) {
  return (
    <div className={['prompts', className].filter(Boolean).join(' ')}>
      <p className="prompts__k">{kicker}</p>
      {/*
        A `<ul>`, so a reader is told there are four of these before they are
        read one. §04's reset is `ul,ol{list-style:none}`, so the markers cost
        nothing — which is the whole reason the list can be the honest element
        rather than a run of buttons in a div.
      */}
      <ul className="prompts__l">
        {prompts.map((p) => (
          <li key={p}>
            <button type="button" className="prompts__b" onClick={onPick ? () => onPick(p) : undefined}>
              {p}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

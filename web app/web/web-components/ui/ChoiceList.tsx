'use client';

import type { ReactNode } from 'react';

/**
 * Choice list — one question, its answers, and nothing else.
 *
 * A column of full-width options, each one a real `<input>` inside its own
 * `<label>`, so the sentence is the hit target and the group behaves the way
 * its grammar promises without a line of keyboard code.
 *
 * ── THE GRAMMAR IS THE PROP, AND IT CHANGES THE ELEMENT ─────────────────────
 *
 * `multiple` is not a styling flag. Off, the options are radios: one tab stop,
 * arrows between them, and a reader is told *option 2 of 4*. On, they are
 * checkboxes: four tab stops, space toggles each, and nothing is announced as
 * exclusive. That is the whole difference between *How did the plan feel* and
 * *What got in the way most often*, and it is the difference `Segment` — which
 * carries both grammars for pills — has to hand-roll because its pills must be
 * `<button>`s. Here they need not be, so they are not.
 *
 * It is also why `value` is a LIST on both. A single choice is one entry, not a
 * different shape, which is the same call `AssessmentAnswerRow.optionIds` makes
 * about storage and for the same reason: two shapes for one answer is a cast at
 * every reader.
 *
 * ── AND WHY THERE IS NO YES/NO COMPONENT ────────────────────────────────────
 *
 * *Did anything hurt while training* is this control with two options and
 * `multiple` off. A second component would be the same markup, the same radio
 * group and one fewer decision — and the day one of them grew a focus fix, the
 * other would not have it.
 */
export function ChoiceList({
  name,
  label,
  options,
  value,
  multiple = false,
  onChange,
  other,
  className,
}: {
  /**
   * The radio group's shared name. Required, and it is not cosmetic: a radio's
   * exclusivity IS its name, so two questions rendered with the same string
   * would clear each other's answer. The caller passes the question's own id.
   */
  name: string;
  /** What the group is asking. Read out before the first option. */
  label: ReactNode;
  options: { id: string; text: ReactNode }[];
  /** The chosen ids. One entry when `multiple` is off — see the docstring. */
  value: string[];
  multiple?: boolean;
  onChange: (ids: string[]) => void;
  /**
   * The *Other* line — a fifth option that happens to be typed into.
   *
   * Drawn as an option rather than as a field beside the list, because that is
   * what it is: picking it is the answer and the text is the detail. `id` is
   * the option id it occupies, which must not collide with a real one.
   */
  other?: {
    id: string;
    label: string;
    value: string;
    placeholder?: string;
    onChange: (text: string) => void;
  };
  className?: string;
}) {
  const picked = (id: string) => value.includes(id);

  const toggle = (id: string) => {
    if (!multiple) {
      onChange([id]);
      return;
    }
    onChange(picked(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div
      /* `radiogroup` only where the options ARE exclusive. A group of
         checkboxes labelled `radiogroup` tells a reader they may pick one when
         they may pick four, which is worse than the plain `group` a set of
         independent boxes actually is. */
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={typeof label === 'string' ? label : undefined}
      className={['chl', className].filter(Boolean).join(' ')}
    >
      {options.map((o) => (
        <label key={o.id} className={['chl__o', picked(o.id) ? 'chl__o--on' : ''].filter(Boolean).join(' ')}>
          <input
            type={multiple ? 'checkbox' : 'radio'}
            className={multiple ? 'check' : 'rad'}
            name={name}
            value={o.id}
            checked={picked(o.id)}
            onChange={() => toggle(o.id)}
          />
          <span className="chl__t">{o.text}</span>
        </label>
      ))}

      {other && (
        <label className={['chl__o', picked(other.id) ? 'chl__o--on' : ''].filter(Boolean).join(' ')}>
          <input
            type={multiple ? 'checkbox' : 'radio'}
            className={multiple ? 'check' : 'rad'}
            name={name}
            value={other.id}
            checked={picked(other.id)}
            onChange={() => toggle(other.id)}
          />
          <span className="chl__t">
            {other.label}
            {/* The field appears ON picking and not before. An empty box under
                an unpicked option is an invitation to type an answer that does
                not count until something else is tapped — which is the one way
                a client can lose what they wrote on this screen. */}
            {picked(other.id) && (
              <span className="chl__f">
                <input
                  type="text"
                  className="ctl"
                  aria-label={other.label}
                  placeholder={other.placeholder}
                  value={other.value}
                  onChange={(e) => other.onChange(e.target.value)}
                />
              </span>
            )}
          </span>
        </label>
      )}
    </div>
  );
}

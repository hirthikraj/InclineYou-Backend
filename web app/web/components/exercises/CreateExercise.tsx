'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import type { ExerciseWire, LibraryMeta } from '@/lib/exercises/api';
import { createCustomExercise } from '@/lib/exercises/actions';
import { useDismiss } from '@/lib/ui/dismiss';
import { Step } from '@/components/packages/PackPanel';
import { Button } from '@/web-components/ui/Button';
import { LOG_TYPE_WORDS, PlusIcon, XIcon } from './ExerciseLibrary';
import { BODY_ORDER } from './SearchFilters';

/**
 * CREATE EXERCISE — the same questions the library answers about every movement.
 *
 * The form used to ask for a name, two dropdowns labelled *Primary* and *Secondary*
 * and a list of steps. The labels were wrong (*Primary* saved the body part, *Secondary*
 * saved the muscle), the muscle list ignored the body part (Chest and Quads saved
 * together), equipment was fifty-one raw lowercase strings in one list, and nothing
 * asked how the movement is COUNTED — so a plank or a farmer's walk was silently saved
 * as weight and reps.
 *
 * It now follows the library's own order, in the panel shell the Packages form uses:
 * which body part, then which muscle OF that body part, then the kit (grouped), then
 * level and how it is counted, then the steps. Everything else the library holds about
 * a movement — also works, movement, form cues, common mistakes, safety, alternate
 * names, extra kit — is one disclosure down, so the quick path is still seven answers
 * and the full path is what a library entry has.
 *
 * Name is the only required answer. A draft needs nothing else, for the reason it
 * always did: a trainer called away three answers in should not lose them.
 */
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const LEVELS = ['beginner', 'intermediate', 'expert'];
const COUNTED = ['weight_reps', 'reps', 'time', 'distance', 'weight_time', 'weight_distance'];

function Chips({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="pkx-chips" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className="pkx-chip"
          /* pressing the chosen one again clears it: every one of these is optional */
          onClick={() => onPick(value === o.value ? '' : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A short list of one-line answers: steps, cues, mistakes. Enter adds a line, Backspace on an empty one removes it. */
function Lines({
  label,
  items,
  onChange,
  placeholder,
  max,
  numbered = false,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  max: number;
  numbered?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => setTimeout(() => refs.current[i]?.focus(), 0);
  const add = () => {
    if (items.length >= max) return;
    onChange([...items, '']);
    focus(items.length);
  };
  return (
    <div className="xc-lines">
      <ol className="xc-lines__l">
        {items.map((it, i) => (
          <li key={i}>
            <span className="xc-lines__n" data-num={numbered || undefined} aria-hidden="true">{numbered ? i + 1 : '•'}</span>
            <input
              ref={el => { refs.current[i] = el; }}
              className="ctl"
              type="text"
              aria-label={`${label} ${i + 1}`}
              placeholder={i === 0 ? placeholder : 'Next…'}
              value={it}
              onChange={e => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); add(); }
                if (e.key === 'Backspace' && it === '' && items.length > 1) {
                  e.preventDefault();
                  onChange(items.filter((_, j) => j !== i));
                  focus(i - 1);
                }
              }}
            />
            {items.length > 1 && (
              <button type="button" className="btn btn--icon btn--ghost" aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                <XIcon size={12} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {items.length < max && (
        <Button variant="ghost" size="sm" onClick={add}>
          <PlusIcon size={12} />
          Add
        </Button>
      )}
    </div>
  );
}

export function CreateForm({
  meta,
  onCreated,
  onClose,
}: {
  meta: LibraryMeta;
  onCreated: (ex: ExerciseWire) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [target, setTarget] = useState('');
  const [equipment, setEquipment] = useState('');
  const [level, setLevel] = useState('');
  const [logType, setLogType] = useState('weight_reps');
  const [steps, setSteps] = useState(['']);
  const [more, setMore] = useState(false);
  const [pattern, setPattern] = useState('');
  const [also, setAlso] = useState<string[]>([]);
  const [cues, setCues] = useState(['']);
  const [mistakes, setMistakes] = useState(['']);
  const [safety, setSafety] = useState(['']);
  const [aliases, setAliases] = useState(['']);
  const [needs, setNeeds] = useState(['']);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  const { closing, dismiss, ref: panelRef } = useDismiss<HTMLDivElement>(onClose);

  /* Focus lands on the panel on a phone (a focused field opens the keyboard over the sheet) and on the name at a desk. */
  useEffect(() => {
    if (window.matchMedia('(min-width:901px)').matches) nameRef.current?.focus();
    else panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss, panelRef]);

  /* in the order the library's tiles are in, not by count */
  const bodyParts = meta.bodyParts.map(b => b.id).sort((a, b) => BODY_ORDER.indexOf(a) - BODY_ORDER.indexOf(b));
  /* the muscles of the body part chosen, and only those */
  const muscles = meta.muscles.filter(m => m.bodyPart === bodyPart).map(m => m.target);

  function pickBody(v: string) {
    setBodyPart(v);
    const own = meta.muscles.filter(m => m.bodyPart === v).map(m => m.target);
    /* one muscle needs no choosing; a muscle of another body part is cleared */
    setTarget(own.length === 1 ? own[0] : own.includes(target) ? target : '');
  }

  function save(asDraft: boolean) {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createCustomExercise({
        name,
        bodyPart: bodyPart || undefined,
        target: target || undefined,
        secondaryTargets: also.filter(m => m !== target),
        equipment: equipment || undefined,
        level: level || undefined,
        logType,
        description: steps.map(s => s.trim()).filter(Boolean).join('\n\n') || undefined,
        movementPattern: pattern || undefined,
        formCues: cues,
        aliases,
        commonMistakes: mistakes,
        safety,
        equipmentNeeded: needs,
        ...(asDraft ? { status: 'draft' as const } : {}),
      });
      if (result.ok) onCreated(result.exercise);
      else setError(result.error);
    });
  }

  let n = 0;
  return (
    <>
      <button className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`} type="button" aria-label="Close create exercise" onClick={dismiss} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`panel xl-panel pkx-panel xc-panel${closing ? ' panel--out' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Create a custom exercise"
      >
        <div className="panel__hd">
          <span className="panel__t">Create exercise</span>
          <Button variant="ghost" iconOnly label="Close" onClick={dismiss} style={{ marginLeft: 'auto' }} title={undefined} icon={<XIcon />} />
        </div>

        <div className="panel__body">
          <form id="create-exercise-form" onSubmit={e => { e.preventDefault(); save(false); }}>
            <Step n={++n} title="What is it called?">
              <div className="fld">
                <label className="fld__l vh" htmlFor="xc-name">Exercise name</label>
                <input ref={nameRef} className="ctl" id="xc-name" type="text" placeholder="e.g. Landmine press" value={name} maxLength={150} required onChange={e => setName(e.target.value)} />
              </div>
            </Step>

            <Step n={++n} title="Which muscle does it train?">
              <p className="fld__l xc-l">Body part</p>
              <Chips label="Body part" value={bodyPart} onPick={pickBody} options={bodyParts.map(b => ({ value: b, label: cap(b) }))} />
              {bodyPart && muscles.length > 0 && (
                <>
                  <p className="fld__l xc-l">Muscle</p>
                  <Chips label={`Muscle in ${bodyPart}`} value={target} onPick={setTarget} options={muscles.map(m => ({ value: m, label: cap(m) }))} />
                </>
              )}
            </Step>

            <Step n={++n} title="What kit does it use?">
              <div className="fld">
                <label className="fld__l vh" htmlFor="xc-eq">Equipment</label>
                <select id="xc-eq" className="ctl" value={equipment} onChange={e => setEquipment(e.target.value)}>
                  <option value="">No kit chosen</option>
                  {meta.equipmentGroups.map(g => (
                    <optgroup key={g.category} label={cap(g.category)}>
                      {g.items.map(i => (
                        <option key={i.key} value={i.value ?? i.name.toLowerCase()}>{i.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </Step>

            <Step n={++n} title="How hard, and how is it counted?">
              <p className="fld__l xc-l">Level</p>
              <Chips label="Level" value={level} onPick={setLevel} options={LEVELS.map(l => ({ value: l, label: cap(l) }))} />
              <p className="fld__l xc-l">Counted in</p>
              <div className="pkx-chips" role="radiogroup" aria-label="Counted in">
                {COUNTED.map(c => (
                  <button key={c} type="button" role="radio" aria-checked={logType === c} className="pkx-chip" onClick={() => setLogType(c)}>
                    {LOG_TYPE_WORDS[c]}
                  </button>
                ))}
              </div>
              <p className="pkx-hint">A plank is counted in time and a farmer’s walk in weight and distance. Reps are the default.</p>
            </Step>

            <Step n={++n} title="How is it done?">
              <Lines label="Step" items={steps} onChange={setSteps} placeholder="e.g. Stand with feet shoulder-width apart" max={12} numbered />
            </Step>

            <button type="button" className="xc-more" aria-expanded={more} onClick={() => setMore(!more)}>
              {more ? 'Less detail' : 'Add more detail'}
              <span aria-hidden="true">{more ? '–' : '+'}</span>
            </button>

            {more && (
              <div className="xc-moreb">
                <Step n={0} title="Movement">
                  <div className="fld">
                    <label className="fld__l vh" htmlFor="xc-pat">Movement pattern</label>
                    <select id="xc-pat" className="ctl" value={pattern} onChange={e => setPattern(e.target.value)}>
                      <option value="">No pattern chosen</option>
                      {meta.patterns.map(p => <option key={p.id} value={p.id}>{cap(p.id)}</option>)}
                    </select>
                  </div>
                </Step>
                <Step n={0} title="What else does it work?">
                  {BODY_ORDER.filter(b => meta.muscles.some(m => m.bodyPart === b)).map(b => (
                    <div key={b} className="xc-grp">
                      <p className="fld__l xc-l">{cap(b)}</p>
                      <div className="pkx-chips" role="group" aria-label={`Also works, ${b}`}>
                        {meta.muscles
                          .filter(m => m.bodyPart === b && m.target !== target)
                          .map(m => (
                            <button
                              key={m.target}
                              type="button"
                              role="checkbox"
                              aria-checked={also.includes(m.target)}
                              className="pkx-chip"
                              onClick={() => setAlso(also.includes(m.target) ? also.filter(x => x !== m.target) : [...also, m.target])}
                            >
                              {cap(m.target)}
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </Step>
                <Step n={0} title="Form cues">
                  <Lines label="Cue" items={cues} onChange={setCues} placeholder="e.g. Shoulder blades back and down" max={10} />
                </Step>
                <Step n={0} title="Common mistakes">
                  <Lines label="Mistake" items={mistakes} onChange={setMistakes} placeholder="e.g. Bouncing the bar off the chest" max={10} />
                </Step>
                <Step n={0} title="Safety">
                  <Lines label="Safety note" items={safety} onChange={setSafety} placeholder="e.g. Use a spotter for heavy sets" max={10} />
                </Step>
                <Step n={0} title="Also called">
                  <Lines label="Name" items={aliases} onChange={setAliases} placeholder="e.g. Flat bench" max={10} />
                </Step>
                <Step n={0} title="Also needs">
                  <Lines label="Item" items={needs} onChange={setNeeds} placeholder="e.g. A bench" max={10} />
                </Step>
              </div>
            )}

            {error && <p className="msg msg--err" style={{ marginTop: 14 }} role="alert"><span>{error}</span></p>}
          </form>
        </div>

        <div className="panel__foot">
          <Button variant="secondary" onClick={dismiss} disabled={pending}>Cancel</Button>
          {/* SAVE AS DRAFT needs the name and nothing else — the reason the library's Draft filter is not dead chrome. `type="button"`
              on purpose: Enter in the name field submits the form, and that has to stay *Create exercise*. */}
          <Button variant="secondary" onClick={() => save(true)} disabled={pending || !name.trim()} style={{ marginLeft: 'auto' }}>
            Save as draft
          </Button>
          <Button variant="primary" type="submit" form="create-exercise-form" disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : 'Create exercise'}
          </Button>
        </div>
      </div>
    </>
  );
}

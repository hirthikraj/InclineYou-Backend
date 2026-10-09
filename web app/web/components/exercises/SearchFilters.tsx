'use client';

import { useState } from 'react';

import type { LibraryMeta } from '@/lib/exercises/api';
import { EXERCISE_SOURCES, type LibraryQuery } from '@/lib/exercises/tabs';
import { LOG_TYPE_WORDS } from './ExerciseLibrary';
import { Select } from '@/web-components/ui/Select';

/**
 * EVERY FILTER THE LIBRARY HAS, AS ONE PANEL.
 *
 * Eight questions a trainer can ask of 655 exercises — *which body part, which
 * muscle, what else it works, what kit, what kind of movement, how hard, how it
 * is counted, what type* — and the panel puts each in its own group so a filter is
 * found by its name, not by scanning a wall of chips. Several values in one group
 * are OR-ed (chest OR back); different groups are AND-ed (chest AND dumbbell AND
 * beginner), which is what the server does and what the result line says.
 *
 * The counts are the WHOLE library's, not the current result's: they say how deep
 * a value is, which is what decides whether to pick it. Cross-filtering them is a
 * server read per click for a number nobody has asked for.
 *
 * A group shows its first eight values and the ones already picked, and says how
 * many more there are — forty-two movement patterns on one screen is a form, not
 * a filter.
 */
export const BODY_ORDER = ['chest', 'back', 'shoulders', 'upper arms', 'lower arms', 'upper legs', 'lower legs', 'waist', 'neck', 'cardio'];

export const title = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const LEVEL_ORDER = ['beginner', 'intermediate', 'expert'];

type Option = { value: string; label: string; count?: number };

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter(x => x !== v) : [...list, v];
}

function Group({
  heading,
  options,
  selected,
  onChange,
  limit = 8,
  open = false,
}: {
  heading: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  limit?: number;
  open?: boolean;
}) {
  const [all, setAll] = useState(false);
  if (options.length === 0) return null;
  const shown = all ? options : options.filter((o, i) => i < limit || selected.includes(o.value));
  const hidden = options.length - shown.length;
  return (
    <details className="lf-g" open={open || selected.length > 0}>
      <summary>
        <span>{heading}</span>
        {selected.length > 0 && <b className="lf-n">{selected.length}</b>}
      </summary>
      <div className="lf-list">
        {shown.map(o => (
          <label key={o.value} className="lf-o">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onChange(toggle(selected, o.value))} />
            <span className="lf-o__l">{o.label}</span>
            {o.count !== undefined && <i className="lf-o__c">{o.count}</i>}
          </label>
        ))}
        {hidden > 0 && (
          <button type="button" className="lf-more" onClick={() => setAll(true)}>
            Show {hidden} more
          </button>
        )}
        {all && options.length > limit && (
          <button type="button" className="lf-more" onClick={() => setAll(false)}>
            Show fewer
          </button>
        )}
      </div>
    </details>
  );
}

export function SearchFilters({
  meta,
  query,
  onChange,
}: {
  meta: LibraryMeta;
  query: LibraryQuery;
  onChange: (next: Partial<LibraryQuery>) => void;
}) {
  const bodyOptions = [...meta.bodyParts]
    .sort((a, b) => BODY_ORDER.indexOf(a.id) - BODY_ORDER.indexOf(b.id))
    .map(b => ({ value: b.id, label: title(b.id), count: b.count }));

  /* a muscle once, in body-part order, then by depth */
  const muscles = [...meta.muscles].sort(
    (a, b) => BODY_ORDER.indexOf(a.bodyPart) - BODY_ORDER.indexOf(b.bodyPart) || b.count - a.count,
  );
  const muscleOptions = muscles.map(m => ({ value: m.target, label: title(m.target), count: m.count }));
  const alsoOptions = muscles.map(m => ({ value: m.target, label: title(m.target) }));

  const kitGroups = meta.equipmentGroups.map(g => ({
    category: g.category,
    options: g.items.map(i => ({ value: i.key, label: i.name, count: i.count })),
  }));

  const levelOptions = [...meta.levels]
    .sort((a, b) => LEVEL_ORDER.indexOf(a.id) - LEVEL_ORDER.indexOf(b.id))
    .map(l => ({ value: l.id, label: title(l.id), count: l.count }));

  return (
    <div className="lf">
      {/* WHICH LIBRARY comes first: everything below narrows it, so it is the widest question and belongs at the head. It sat
          at the foot, past a screen of groups, where a trainer looking for their own exercises never found it. */}
      <div className="lf-show">
        <Select
          label="Show"
          value={query.source}
          onChange={e => onChange({ source: e.target.value as LibraryQuery['source'] })}
          options={EXERCISE_SOURCES.map(o => ({ value: o.value, label: o.label }))}
        />
      </div>
      <Group heading="Body part" options={bodyOptions} selected={query.body} onChange={v => onChange({ body: v })} limit={10} open />
      <Group heading="Muscle" options={muscleOptions} selected={query.muscles} onChange={v => onChange({ muscles: v })} />
      <Group heading="Also works" options={alsoOptions} selected={query.also} onChange={v => onChange({ also: v })} />

      <details className="lf-g" open={query.kit.length > 0}>
        <summary>
          <span>Equipment</span>
          {query.kit.length > 0 && <b className="lf-n">{query.kit.length}</b>}
        </summary>
        <div className="lf-kit">
          {kitGroups.map(g => (
            <Group
              key={g.category}
              heading={title(g.category)}
              options={g.options}
              selected={query.kit.filter(k => g.options.some(o => o.value === k))}
              onChange={next => {
                const others = query.kit.filter(k => !g.options.some(o => o.value === k));
                onChange({ kit: [...others, ...next] });
              }}
              limit={6}
            />
          ))}
        </div>
      </details>

      <Group
        heading="Movement"
        options={meta.patterns.map(p => ({ value: p.id, label: title(p.id), count: p.count }))}
        selected={query.pattern}
        onChange={v => onChange({ pattern: v })}
      />
      <Group heading="Level" options={levelOptions} selected={query.level} onChange={v => onChange({ level: v })} limit={3} />
      <Group
        heading="Counted in"
        options={meta.logTypes.map(l => ({ value: l.id, label: LOG_TYPE_WORDS[l.id] ?? title(l.id), count: l.count }))}
        selected={query.counted}
        onChange={v => onChange({ counted: v })}
        limit={6}
      />
      <Group
        heading="Type"
        options={meta.categories.map(c => ({ value: c.id, label: title(c.id), count: c.count }))}
        selected={query.type}
        onChange={v => onChange({ type: v })}
        limit={6}
      />
    </div>
  );
}

/** The picked filters as removable chips, so a result is never a mystery. */
export function activeFilters(meta: LibraryMeta, q: LibraryQuery, onChange: (next: Partial<LibraryQuery>) => void) {
  const out: { key: string; label: string; remove: () => void }[] = [];
  const kitName = (k: string) => meta.equipmentGroups.flatMap(g => g.items).find(i => i.key === k)?.name ?? k;
  const add = (group: string, values: string[], name: (v: string) => string, set: (v: string[]) => Partial<LibraryQuery>) =>
    values.forEach(v => out.push({ key: `${group}:${v}`, label: `${group ? group + ': ' : ''}${name(v)}`, remove: () => onChange(set(values.filter(x => x !== v))) }));
  add('', q.body, title, v => ({ body: v }));
  add('', q.muscles, title, v => ({ muscles: v }));
  add('Also', q.also, title, v => ({ also: v }));
  add('', q.kit, kitName, v => ({ kit: v }));
  add('', q.pattern, title, v => ({ pattern: v }));
  add('', q.level, title, v => ({ level: v }));
  add('', q.counted, v => LOG_TYPE_WORDS[v] ?? title(v), v => ({ counted: v }));
  add('', q.type, title, v => ({ type: v }));
  if (q.source !== 'all') out.push({ key: 'source', label: EXERCISE_SOURCES.find(s => s.value === q.source)?.label ?? q.source, remove: () => onChange({ source: 'all' }) });
  return out;
}

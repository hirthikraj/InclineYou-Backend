'use client';

import { useState } from 'react';

import { NumPad } from '../../../ui/NumPad';

/**
 * Live and inline: the pad drawn in place (`inline`) rather than docked to the
 * reader's window, with its own throwaway state — a specimen never writes to a
 * real set. Two fields, the console's: a load with plate-step chips and reps.
 */
export function NumPadSpecimen() {
  const [values, setValues] = useState({ load: '60', reps: '8' });
  const [active, setActive] = useState('load');
  const [logged, setLogged] = useState(0);

  return (
    <NumPad
      inline
      title="Set 3 · Barbell back squat"
      aside={logged ? <>{logged} logged</> : undefined}
      fields={[
        { key: 'load', label: 'Load kg', value: values.load, unit: 'kg', decimal: true, min: 0,
          chips: [{ label: '−2.5', delta: -2.5 }, { label: '+2.5', delta: 2.5 }, { label: '+5', delta: 5 }] },
        { key: 'reps', label: 'Reps', value: values.reps, min: 1,
          chips: [{ label: '−1', delta: -1 }, { label: '+1', delta: 1 }] },
      ]}
      active={active}
      onActive={setActive}
      onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
      onClose={() => {}}
      action={{ label: <>Log set 3 · {values.load} kg × {values.reps}</>, onPress: () => setLogged((n) => n + 1) }}
    />
  );
}

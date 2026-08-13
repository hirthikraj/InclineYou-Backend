/**
 * Screen 02 · Trainer setup · Step 3 of 6 · Specialities.
 *
 * `agent/design system/screens/xreptrainersetup.html` § 03 — 3b default,
 * 3c cap reached.
 *
 * Multi-select, capped at five, with a live counter. At the cap the unpicked
 * chips go to 38% AND a toast says why and what to do instead. That pairing is
 * the rule, not a nicety: a tap that silently does nothing is indistinguishable
 * from a broken button, and this is the one screen in the flow where a trainer
 * is most likely to keep tapping.
 *
 * The list is ordered by how often Indian trainers pick each one, never
 * alphabetically — see `setup/options.ts`.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SetupStackParamList } from '../../navigation/SetupStack';
import { useSetup } from '../../setup/SetupContext';
import { SPECIALITIES, SPECIALITY_CAP, customId, isCustom, labelFor } from '../../setup/options';
import {
  Button,
  IconAlert,
  Pick,
  PickAdd,
  PickChip,
  PickCount,
  Toast,
  colors,
} from '../../design';
import AddOwnSheet from './AddOwnSheet';
import { SetupBar, SetupBody, SetupFoot, SetupScreen, SetupTitle } from './setupLayout';

type Props = {
  navigation: NativeStackNavigationProp<SetupStackParamList, 'Specialities'>;
};

export default function SpecialitiesScreen({ navigation }: Props) {
  const { draft, patch } = useSetup();
  const [chosen, setChosen] = useState<string[]>(draft.specialities);
  const [adding, setAdding] = useState(false);

  const atCap = chosen.length >= SPECIALITY_CAP;

  // Anything typed in shows up as a chip of its own, ahead of nothing — a
  // custom answer that disappears into a counter is not an answer.
  const custom = chosen.filter(isCustom);

  const toggle = (id: string) => {
    setChosen((current) => {
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length >= SPECIALITY_CAP
          ? current
          : [...current, id];
      patch({ specialities: next });
      return next;
    });
  };

  const cont = () => {
    patch({ specialities: chosen });
    navigation.navigate('Certifications');
  };

  return (
    <SetupScreen>
      <SetupBar step="specialities" onBack={() => navigation.goBack()} />

      <SetupBody>
        <SetupTitle tight>What do you coach best?</SetupTitle>

        {/* The counter sits on the subtitle's baseline — it is a fact about the
            instruction, not a separate piece of chrome. */}
        <View style={styles.sub}>
          <Text style={styles.subText}>Pick up to {SPECIALITY_CAP} — these show on your profile.</Text>
          <PickCount value={chosen.length} max={SPECIALITY_CAP} />
        </View>

        <Pick>
          {SPECIALITIES.map((option) => {
            const selected = chosen.includes(option.id);
            return (
              <PickChip
                key={option.id}
                label={option.label}
                selected={selected}
                disabled={atCap && !selected}
                onPress={() => toggle(option.id)}
              />
            );
          })}
          {custom.map((id) => (
            <PickChip
              key={id}
              label={labelFor(id, SPECIALITIES)}
              selected
              onPress={() => toggle(id)}
            />
          ))}
          <PickAdd label="+ Add your own" disabled={atCap} onPress={() => setAdding(true)} />
        </Pick>

        {atCap ? (
          <Toast icon={IconAlert} style={styles.toast}>
            That's {SPECIALITY_CAP}. Tap one to swap it out.
          </Toast>
        ) : null}
      </SetupBody>

      <SetupFoot>
        <Button label="Continue" variant="primary" size="lg" block onPress={cont} />
      </SetupFoot>

      <AddOwnSheet
        visible={adding}
        onClose={() => setAdding(false)}
        // Toggle would REMOVE an entry that's already there — typing something
        // you already picked must not silently unpick it.
        onAdd={(label) => {
          const id = customId(label);
          if (!chosen.includes(id)) toggle(id);
        }}
        title="Add a speciality"
        placeholder="Kettlebell training"
        hint="Shown on your profile exactly as you type it."
      />
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  sub: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 26,
  },
  subText: { flex: 1, fontSize: 15, lineHeight: 22.5, color: colors.ink2 },
  toast: { marginTop: 'auto' },
});

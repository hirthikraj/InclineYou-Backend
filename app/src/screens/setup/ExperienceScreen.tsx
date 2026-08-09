/**
 * Screen 02 · Trainer setup · Step 2 of 6 · Experience.
 *
 * `agent/design system/screens/trainxtrainersetup.html` § 03 · 3a.
 *
 * Single-select auto-advances after 200ms — long enough that the chip visibly
 * takes the selection, short enough that nobody waits. That is one tap saved on
 * every single-select screen in the flow, and it is why this screen has no
 * Continue button: adding one would make the auto-advance feel like the app
 * jumping the gun.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SetupStackParamList } from '../../navigation/SetupStack';
import { useSetup } from '../../setup/SetupContext';
import { EXPERIENCE_BANDS } from '../../setup/options';
import { Callout, IconChart, Pick, PickChip } from '../../design';
import { SetupBar, SetupBody, SetupFoot, SetupScreen, SetupSub, SetupTitle } from './setupLayout';

type Props = {
  navigation: NativeStackNavigationProp<SetupStackParamList, 'Experience'>;
};

/** Long enough to read as a confirmation, short enough not to be a wait. */
const ADVANCE_MS = 200;

export default function ExperienceScreen({ navigation }: Props) {
  const { draft, patch } = useSetup();
  const [picked, setPicked] = useState<string | null>(draft.experience);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending advance must not fire into an unmounted screen — a fast trainer
  // can tap and hit back inside 200ms.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const choose = (id: string) => {
    if (timer.current) clearTimeout(timer.current);
    setPicked(id);
    patch({ experience: id });
    timer.current = setTimeout(() => navigation.navigate('Specialities'), ADVANCE_MS);
  };

  return (
    <SetupScreen>
      <SetupBar step="experience" onBack={() => navigation.goBack()} />

      <SetupBody>
        <SetupTitle tight>How long have you been training clients?</SetupTitle>
        <SetupSub>Tap one. We'll move on by itself.</SetupSub>

        <Pick>
          {EXPERIENCE_BANDS.map((band) => (
            <PickChip
              key={band.id}
              label={band.label}
              selected={picked === band.id}
              onPress={() => choose(band.id)}
            />
          ))}
        </Pick>

        <Callout icon={IconChart} style={styles.trailing}>
          Stored as a band, not a number — so it stays true next year without you editing it.
        </Callout>
      </SetupBody>

      {/* Empty on purpose. The taps are the answer. */}
      <SetupFoot />
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  trailing: { marginTop: 'auto' },
});

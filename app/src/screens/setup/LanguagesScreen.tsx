/**
 * Screen 02 · Trainer setup · Step 5 of 6 · Languages.
 *
 * `agent/design system/screens/inclineyoutrainersetup.html` § 04 · 4c.
 *
 * The free differentiator: ZERO of the eight platforms in the teardown ask
 * this. In a market where a client may specifically want a Tamil- or
 * Marathi-speaking coach, it is one field no competitor can match — which is
 * exactly why this step has no Skip while the two around it do.
 *
 * No cap either. Someone who genuinely coaches in five languages should be able
 * to say so; the reason specialities are capped ("does everything" tells a
 * client nothing) does not apply here.
 */

import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SetupStackParamList } from '../../navigation/SetupStack';
import { useSetup } from '../../setup/SetupContext';
import { LANGUAGES, customId, isCustom, labelFor } from '../../setup/options';
import {
  Button,
  Callout,
  CalloutStrong,
  IconMessage,
  Pick,
  PickAdd,
  PickChip,
} from '../../design';
import AddOwnSheet from './AddOwnSheet';
import { SetupBar, SetupBody, SetupFoot, SetupScreen, SetupSub, SetupTitle } from './setupLayout';

type Props = {
  navigation: NativeStackNavigationProp<SetupStackParamList, 'Languages'>;
};

export default function LanguagesScreen({ navigation }: Props) {
  const { draft, patch } = useSetup();
  const [chosen, setChosen] = useState<string[]>(draft.languages);
  const [adding, setAdding] = useState(false);

  const custom = chosen.filter(isCustom);

  const toggle = (id: string) => {
    setChosen((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      patch({ languages: next });
      return next;
    });
  };

  const cont = () => {
    patch({ languages: chosen });
    navigation.navigate('Hours');
  };

  return (
    <SetupScreen>
      <SetupBar step="languages" onBack={() => navigation.goBack()} />

      <SetupBody>
        <SetupTitle tight>Which languages do you coach in?</SetupTitle>
        <SetupSub>Clients filter by this. Pick as many as you actually use on the floor.</SetupSub>

        <Pick>
          {LANGUAGES.map((option) => (
            <PickChip
              key={option.id}
              label={option.label}
              selected={chosen.includes(option.id)}
              onPress={() => toggle(option.id)}
            />
          ))}
          {custom.map((id) => (
            <PickChip key={id} label={labelFor(id, LANGUAGES)} selected onPress={() => toggle(id)} />
          ))}
          <PickAdd label="+ Another language" onPress={() => setAdding(true)} />
        </Pick>

      </SetupBody>

      <SetupFoot>
        <Button label="Continue" variant="primary" size="lg" block onPress={cont} />
      </SetupFoot>

      <AddOwnSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onAdd={(label) => {
          const id = customId(label);
          if (!chosen.includes(id)) toggle(id);
        }}
        title="Another language"
        placeholder="Odia"
        hint="Clients searching in this language will find you."
      />
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  trailing: { marginTop: 'auto' },
});

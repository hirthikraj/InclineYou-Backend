/**
 * Screen 02 · Trainer setup · Step 1 of 6 · Your name.
 *
 * `agent/design system/screens/inclineyoutrainersetup.html` § 02 — 2a default,
 * 2b empty.
 *
 * The only mandatory answer in the whole flow, and the only hard validation.
 * The copy names the reason rather than saying "required": a client receiving
 * an invite has to see who it is from.
 *
 * Profile photos are not in the MVP, so the initials preview is not decoration
 * standing in for a missing avatar — it is what a client will actually see, and
 * showing it back is what makes the field feel like it is FOR something.
 */

import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import type { SetupStackParamList } from '../../navigation/SetupStack';
import { useSetup } from '../../setup/SetupContext';
import {
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  Control,
  FieldLabel,
  FieldMsg,
  IconUsers,
  initials,
  useKeyboardVisible,
} from '../../design';
import { SetupBar, SetupBody, SetupFoot, SetupScreen, SetupSub, SetupTitle } from './setupLayout';

type Props = {
  navigation: NativeStackNavigationProp<SetupStackParamList, 'Name'>;
};

/** Long enough for a full South Indian name, short enough to fit an invite line. */
const MAX_NAME = 60;

export default function NameScreen({ navigation }: Props) {
  const { draft, patch } = useSetup();
  const [name, setName] = useState(draft.name);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const keyboardUp = useKeyboardVisible();

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }, []),
  );

  const trimmed = name.trim();
  const empty = trimmed.length === 0;
  // Never on the first keystroke — an error that appears while you are still
  // typing your own name is an accusation.
  const showError = touched && empty;

  const cont = () => {
    if (empty) {
      setTouched(true);
      return;
    }
    patch({ name: trimmed });
    navigation.navigate('Experience');
  };

  return (
    <SetupScreen>
      <SetupBar step="name" onBack={() => navigation.goBack()} />

      <SetupBody>
        <SetupTitle tight>What should clients call you?</SetupTitle>
        <SetupSub>This is the name on every invite and receipt you send.</SetupSub>

        <FieldLabel>Your name</FieldLabel>
        <Control
          inputRef={inputRef}
          value={name}
          onChangeText={(next) => {
            setName(next);
            if (touched && next.trim().length > 0) setTouched(false);
          }}
          onBlur={() => setTouched(true)}
          onSubmitEditing={cont}
          error={showError}
          placeholder="Ravi Kannan"
          maxLength={MAX_NAME}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          textContentType="name"
          autoComplete="name"
          accessibilityLabel="Your name"
        />
        <FieldMsg tone={showError ? 'error' : 'hint'}>
          {showError
            ? "Your name is the one thing we can't skip"
            : 'Use the name your clients already know you by.'}
        </FieldMsg>

        {initials(name) ? (
          <Callout lead={<Avatar name={name} size="sm" />} style={styles.preview}>
            Clients see you as <CalloutStrong>{initials(name)}</CalloutStrong> until profile photos
            arrive. Your initials come from this field.
          </Callout>
        ) : null}

        {/* Steps aside with the keyboard up, like the sign-in trust note. */}
        {keyboardUp ? null : (
          <Callout icon={IconUsers} style={styles.trailing}>
            {showError
              ? "Everything else in this setup is optional. This isn't, because a client receiving an invite has to see who it's from."
              : "This is the only answer we can't skip — a client can't accept an invite from a blank name."}
          </Callout>
        )}
      </SetupBody>

      <SetupFoot compact={keyboardUp}>
        <Button
          label="Continue"
          variant="primary"
          size="lg"
          block
          disabled={empty}
          onPress={cont}
        />
      </SetupFoot>
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  preview: { marginTop: 20 },
  trailing: { marginTop: 'auto' },
});

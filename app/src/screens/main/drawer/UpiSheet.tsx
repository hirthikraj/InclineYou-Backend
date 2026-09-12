/**
 * Editing your own UPI ID.
 *
 * Not the money screen's `UpiSheet`, which shows a client how to pay. This one is
 * the trainer changing where the money goes, and it repeats setup's warning
 * word for word because the stakes have not changed: **a single wrong letter still
 * looks perfectly valid to us.**
 *
 * `isUpiFormat` is imported from the setup screen rather than re-written. One
 * regex, one definition of "looks like a UPI ID" — two copies would eventually
 * disagree, and the day they did, one screen would accept an ID the other refused.
 *
 * The ID is shown back at a size you can actually read before saving, because
 * reading it back is the only check that exists.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isUpiFormat } from '../../setup/PaymentScreen';
import { UPI_HANDLES } from '../../../setup/options';
import {
  Button,
  Callout,
  CalloutStrong,
  Control,
  FieldMsg,
  IconAlert,
  Sheet,
  colors,
  radius,
  space,
  tnum,
} from '../../../design';

export interface UpiSheetProps {
  visible: boolean;
  current: string;
  /** An empty string clears it. */
  onSave: (vpa: string) => void;
  onClose: () => void;
}

export default function UpiSheet({ visible, current, onSave, onClose }: UpiSheetProps) {
  const [value, setValue] = useState(current);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setValue(current);
    setTouched(false);
  }, [visible, current]);

  const trimmed = value.trim();
  const valid = isUpiFormat(trimmed);
  // Empty is allowed: a trainer who takes only cash should be able to remove it.
  // But only when there is one to remove — offering to clear a UPI ID that was
  // never set describes something that isn't there, and saving it PATCHes the
  // server to say nothing changed.
  const clearing = trimmed === '' && current.trim() !== '';
  const canSave = trimmed === '' ? clearing : valid;

  return (
    <Sheet visible={visible} onClose={onClose} title="Your UPI ID">
      <Control
        value={value}
        onChangeText={(next) => {
          setValue(next);
          if (touched && isUpiFormat(next)) setTouched(false);
        }}
        onBlur={() => setTouched(true)}
        placeholder="you@okhdfcbank"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        error={touched && trimmed !== '' && !valid}
        accessibilityLabel="UPI ID"
        style={styles.control}
      />
      <FieldMsg tone={touched && trimmed !== '' && !valid ? 'error' : 'hint'}>
        {touched && trimmed !== '' && !valid
          ? 'A UPI ID needs an @ and a handle after it'
          : `Common handles: ${UPI_HANDLES.join(' · ')}`}
      </FieldMsg>

      {/* Big, monospaced-ish and unabbreviated. An ellipsised UPI ID defeats the
          entire purpose of showing it back. */}
      {trimmed ? (
        <View style={styles.readback}>
          <Text style={styles.readbackLabel}>Read this back to yourself</Text>
          <Text style={styles.readbackValue} selectable>
            {trimmed}
          </Text>
        </View>
      ) : null}

      <Callout icon={IconAlert} style={styles.note}>
        We check the <CalloutStrong>format only</CalloutStrong>. InclineYou can&apos;t confirm this ID is
        yours and can&apos;t see whether a payment arrived — a single wrong letter still looks
        perfectly valid to us.
      </Callout>

      <Button
        label={clearing ? 'Clear my UPI ID' : 'Save it'}
        variant="primary"
        size="lg"
        block
        disabled={!canSave}
        onPress={() => onSave(trimmed)}
        style={styles.save}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  control: { marginBottom: space.s2 },
  readback: {
    marginTop: space.s4,
    padding: space.cardPad,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  readbackLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  readbackValue: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: colors.ink,
    marginTop: 8,
    ...tnum,
  },
  note: { marginTop: space.s4 },
  save: { marginTop: space.s4 },
});

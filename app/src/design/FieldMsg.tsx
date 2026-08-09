/**
 * `.tx-field__msg` — the message slot under a control.
 *
 * The slot is ALWAYS present, even when empty: an error must never shove the
 * form down. It is also the field's live region, so a screen reader announces
 * the error without stealing focus.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, space } from './tokens';
import { IconAlert } from './icons';

export type FieldMsgTone = 'hint' | 'error' | 'warn';

export interface FieldMsgProps {
  children?: React.ReactNode;
  tone?: FieldMsgTone;
  style?: StyleProp<ViewStyle>;
}

/**
 * `.tx-field__label` — the label above a control.
 *
 * Only for a field the headline does not already name. Where the headline IS
 * the question ("What should clients call you?"), a label repeating it is noise
 * and the control takes an `accessibilityLabel` instead.
 */
export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <Text style={styles.label}>
      {children}
      {hint ? <Text style={styles.labelHint}> {hint}</Text> : null}
    </Text>
  );
}

export default function FieldMsg({ children, tone = 'hint', style }: FieldMsgProps) {
  const loud = tone !== 'hint';
  const color = tone === 'error' ? colors.danger : tone === 'warn' ? colors.warn : colors.ink3;

  return (
    <View
      style={[styles.slot, style]}
      accessibilityLiveRegion="polite"
      accessibilityRole={loud ? 'alert' : undefined}
    >
      {loud && children ? <IconAlert size={13} color={color} strokeWidth={2.2} /> : null}
      {children ? (
        <Text style={[styles.text, { color }, loud && styles.loud]}>{children}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.14,
    color: colors.ink2,
    marginBottom: 6,
  },
  labelHint: { color: colors.ink3, fontWeight: '400' },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 18,
    marginTop: 6,
  },
  text: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  loud: { fontWeight: '500' },
});

/**
 * `.tx-danger` — the block above a decision that cannot be undone.
 *
 * Not `Callout`. A callout explains; this one is a consequence, and it earns the
 * danger-soft surface and a red headline because it is the thing standing between
 * a trainer and losing four sessions they logged in a basement.
 *
 * It carries no icon. The colour is the signal, and an alert triangle beside a
 * red heading on a red panel is the third time the same thing has been said.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from './tokens';

export interface DangerProps {
  /** The consequence, stated. "2 changes haven't synced yet." */
  title: string;
  /** What that actually means, in the trainer's own terms. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function Danger({ title, children, style }: DangerProps) {
  return (
    <View style={[styles.block, style]} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      {typeof children === 'string' ? <Text style={styles.body}>{children}</Text> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    padding: space.cardPad,
    borderRadius: radius.r2,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
  },
  title: { fontSize: 14.5, fontWeight: '700', color: colors.danger, marginBottom: 7 },
  body: { fontSize: 12.5, lineHeight: 19, color: colors.ink2 },
});

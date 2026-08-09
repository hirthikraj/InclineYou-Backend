/**
 * `.tx-callout` — a fact or a reassurance, never an error.
 *
 * The general form of the info card the sign-in screens use as `.trust`
 * (see `screens/auth/authLayout.tsx`). Two tones only: neutral for a plain
 * statement, accent for something the trainer should actually feel good about.
 * If the message is a problem, it belongs in `FieldMsg` or a banner instead —
 * a callout has no urgency and shouldn't borrow any.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from './tokens';
import type { IconProps } from './icons';

export type CalloutTone = 'neutral' | 'accent';

export interface CalloutProps {
  children: React.ReactNode;
  /** Omit for a callout that leads with something else — an avatar, say. */
  icon?: React.ComponentType<IconProps>;
  /** Rendered in the icon's slot. Wins over `icon` when both are given. */
  lead?: React.ReactNode;
  tone?: CalloutTone;
  style?: StyleProp<ViewStyle>;
}

export default function Callout({
  children,
  icon: Icon,
  lead,
  tone = 'neutral',
  style,
}: CalloutProps) {
  const accent = tone === 'accent';
  return (
    <View style={[styles.callout, accent && styles.accent, style]}>
      {lead ?? (Icon ? <Icon size={17} color={accent ? colors.accentText : colors.ink3} /> : null)}
      <Text style={[styles.text, accent && styles.textAccent]}>{children}</Text>
    </View>
  );
}

/** Emphasis inside a callout. Pass the same tone as the callout around it. */
export function CalloutStrong({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: CalloutTone;
}) {
  return (
    <Text style={tone === 'accent' ? styles.strongAccent : styles.strong}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  accent: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine },
  text: { flex: 1, fontSize: 12.5, lineHeight: 19, color: colors.ink3 },
  textAccent: { color: colors.ink2 },
  strong: { color: colors.ink2, fontWeight: '600' },
  strongAccent: { color: colors.accentText, fontWeight: '600' },
});

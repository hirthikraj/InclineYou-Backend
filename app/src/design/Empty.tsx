/**
 * `.tx-empty` — an empty state that says something.
 *
 * Two of these ship on home and neither is an apology. "Nobody needs you"
 * tells the trainer they are on top of their book; "Nothing new" states the
 * notification promise — we only ping you for things that need a decision —
 * which is the sentence that stops people muting the app in week two.
 *
 * A body of more than about 34 characters per line stops being read, so the
 * copy is held to a measure rather than the screen width.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from './tokens';
import type { IconProps } from './icons';

export interface EmptyProps {
  icon?: React.ComponentType<IconProps>;
  /** Tints the icon well — `ok` for a resolved state, ink otherwise. */
  iconColor?: string;
  title: string;
  body?: string;
  /** One action at most. Two choices in an empty state is a menu. */
  action?: React.ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Empty({
  icon: Icon,
  iconColor = colors.ink3,
  title,
  body,
  action,
  compact = false,
  style,
}: EmptyProps) {
  return (
    <View style={[styles.empty, compact && styles.compact, style]}>
      {Icon ? (
        <View style={styles.icon}>
          <Icon size={24} color={iconColor} strokeWidth={1.9} />
        </View>
      ) : null}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingVertical: space.s8, paddingHorizontal: space.s5 },
  compact: { paddingVertical: 30, paddingHorizontal: space.s5 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.r3,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.s4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.34,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: space.s2,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.ink2,
    textAlign: 'center',
    // ~34ch at this size — past that, an empty state stops being read.
    maxWidth: 280,
  },
  action: { marginTop: space.s5 },
});

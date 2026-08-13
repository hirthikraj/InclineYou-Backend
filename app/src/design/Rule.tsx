/**
 * `.tx-rule2` — one if / then rule.
 *
 * The condition and the action are two pills with an arrow between them, because
 * that is the shape of the thought: *no workout in 7 days → ask me first.* A
 * label-and-value settings row cannot express it, and a sentence forces the
 * reader to parse grammar to find the number.
 *
 * The action pill is the accent one. It is the half that decides whether a
 * message leaves the trainer's phone without them, and it is the half a trainer
 * scanning five rules is checking.
 *
 * The switch is inside the card but not part of the pressable that opens the
 * editor — a nested pressable on Android will happily hand the tap to its
 * parent, and turning a rule off must never open its editor instead.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from './tokens';
import Switch from './Switch';
import type { IconProps } from './icons';

export interface RuleProps {
  icon: React.ComponentType<IconProps>;
  title: string;
  /** The left pill. "No workout in 7 days". */
  when: string;
  /** The right pill. "Ask me first" or "Send it for me". */
  then: string;
  /** Who is waiting, or what went out. Absent when neither is true yet. */
  note?: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function Rule({
  icon: Icon,
  title,
  when,
  then,
  note,
  enabled,
  onToggle,
  onPress,
  style,
}: RuleProps) {
  return (
    <View style={[styles.card, !enabled && styles.off, style]}>
      <View style={styles.top}>
        <Icon size={18} color={colors.ink3} />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Switch value={enabled} onChange={onToggle} label={`${title} rule`} />
      </View>

      <Pressable
        onPress={onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `${title}: ${when}, ${then}` : undefined}
        disabled={!onPress}
        style={({ pressed }) => [styles.body, pressed && onPress ? styles.pressed : null]}
      >
        <View style={styles.cond}>
          <Text style={styles.pill} numberOfLines={1}>
            {when}
          </Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={[styles.pill, styles.pillThen]} numberOfLines={1}>
            {then}
          </Text>
        </View>
        {note ? (
          <Text style={styles.note} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.s3,
    paddingTop: space.s3,
  },
  off: { opacity: 0.55 },

  top: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: colors.ink,
  },

  // The padding lives on the pressable, not the card, so the whole strip below
  // the switch is the tap target for the editor.
  body: { paddingTop: 10, paddingBottom: space.s3, borderRadius: radius.r1 },
  pressed: { opacity: 0.65 },

  cond: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink2,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  pillThen: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    color: colors.accentText,
  },
  arrow: { fontSize: 12, color: colors.ink3 },

  note: { fontSize: 11.5, color: colors.ink3, marginTop: 10 },
});

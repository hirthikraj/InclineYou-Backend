/**
 * `.tx-check` and `.tx-radio` — the two 24px selection marks.
 *
 * Both are pure indicators: they render state and nothing else, because in
 * every place they appear the whole row is the target. Giving the mark its own
 * press handler as well would make a 24px hit area compete with a 64px one.
 *
 * The CSS draws them with inset shadows; RN borders are inside the box too, so
 * a 7px border on a 24px circle produces the same accent ring with the surface
 * showing through the middle.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from './tokens';
import { IconCheck, type IconProps } from './icons';

export function Check({ checked, style }: { checked: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.check, checked && styles.checkOn, style]}>
      {checked ? <IconCheck size={13} color={colors.accentInk} strokeWidth={3} /> : null}
    </View>
  );
}

export function Radio({ checked, style }: { checked: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.radio, checked && styles.radioOn, style]} />;
}

/** The 34px slot a mark sits in — the avatar's slot, so nothing shifts (§ 07). */
export function ChoiceSlot({ children }: { children: React.ReactNode }) {
  return <View style={styles.slot}>{children}</View>;
}

/**
 * `.tx-choice` — choice cards, two across.
 *
 * A card rather than a radio row when the option needs a sentence to explain
 * itself: "Gym counter · they collected it, your cut applies" is the difference
 * between a correct entry and one discovered at the end of the month, and it
 * does not fit next to a 24px circle.
 *
 * `wide` gives a card the whole row. Gym counter is a full-width third option
 * in the design rather than a hidden one, and that is deliberate.
 */
export function ChoiceGrid({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.grid, style]}>{children}</View>;
}

export function ChoiceCard({
  title,
  subtitle,
  icon: Icon,
  selected,
  wide = false,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<IconProps>;
  selected: boolean;
  wide?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [
        styles.card,
        wide ? styles.cardWide : styles.cardHalf,
        selected && styles.cardOn,
        pressed && !selected && styles.cardPressed,
      ]}
    >
      {Icon ? <Icon size={17} color={selected ? colors.accentText : colors.ink3} /> : null}
      <View>
        <Text style={[styles.cardTitle, selected && styles.cardTitleOn]}>{title}</Text>
        {subtitle ? <Text style={styles.cardSub}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.r1,
    borderWidth: 1.5,
    borderColor: colors.fieldLineHover,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkOn: { backgroundColor: colors.accent, borderWidth: 0 },

  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.fieldLineHover,
    flexShrink: 0,
  },
  radioOn: { borderWidth: 7, borderColor: colors.accent },

  slot: { width: 34, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  card: {
    minHeight: 78,
    borderRadius: radius.r2,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldLine,
    padding: 13,
    justifyContent: 'space-between',
    gap: 6,
  },
  // Half of the row, minus half the 8px gutter. Percentages here rather than
  // flex:1, so a wide card and two halves can share one wrapping row.
  cardHalf: { width: '48.5%', flexGrow: 1 },
  cardWide: { width: '100%' },
  cardOn: { backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accentLine, padding: 12 },
  cardPressed: { backgroundColor: colors.fieldHover },
  cardTitle: { fontSize: 14.5, fontWeight: '600', letterSpacing: -0.15, color: colors.ink },
  cardTitleOn: { color: colors.accentText },
  cardSub: { fontSize: 12.5, lineHeight: 17, color: colors.ink3, marginTop: 2 },
});

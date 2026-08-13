/**
 * `.tx-setting` — one row in a settings list.
 *
 * Distinct from `Row`, which is the roster and diary row: 56px rather than 64,
 * a leading icon rather than an avatar, and a **value on the right**. That value
 * is what makes a settings list scannable — a trainer looking for their UPI ID
 * reads the right-hand column, not the labels. A settings list that hides every
 * current value behind a tap is a list you have to open eleven times.
 *
 * Three trailing shapes, and only three:
 *
 *   · a value and a chevron — this opens something
 *   · a switch — this is the control, and there is nothing behind it
 *   · a tag — a state you did not choose, like a queued sync
 *
 * `destructive` colours the icon and the label before the row is ever pressed.
 * Delete my account sits in the visible list with its grace period on the row,
 * and something that permanent should not look identical to Language.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum, type } from './tokens';
import { IconChevron, type IconProps } from './icons';

export interface SettingProps {
  icon?: React.ComponentType<IconProps>;
  label: string;
  /** What it means, or when it fires. One line, and it does not wrap by default. */
  meta?: string;
  /** The current answer. Shown left of the chevron. */
  value?: string;
  /** Replaces the value and the chevron entirely — a switch, or a tag. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  /** Lets the meta line run to two lines, for a sentence that earns it. */
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Setting({
  icon: Icon,
  label,
  meta,
  value,
  trailing,
  onPress,
  destructive = false,
  wrap = false,
  style,
}: SettingProps) {
  const tint = destructive ? colors.danger : colors.ink3;

  return (
    <Pressable
      onPress={onPress}
      // A row with a switch and no `onPress` is not a button — the switch is.
      // Announcing it as one would promise a destination that isn't there.
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? [label, value].filter(Boolean).join(', ') : undefined}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null, style]}
    >
      {Icon ? <Icon size={19} color={tint} /> : null}

      <View style={styles.main}>
        <Text
          numberOfLines={1}
          style={[styles.label, destructive && styles.labelDestructive]}
        >
          {label}
        </Text>
        {meta ? (
          <Text
            numberOfLines={wrap ? 2 : 1}
            style={styles.meta}
          >
            {meta}
          </Text>
        ) : null}
      </View>

      {trailing ?? (
        <>
          {value ? (
            <Text numberOfLines={1} style={styles.value}>
              {value}
            </Text>
          ) : null}
          {onPress ? <IconChevron size={17} color={colors.ink3} /> : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * The container. Same job as `List` but with the settings row's own metrics, and
 * it hides the last row's divider — a rule under the final row of a card draws a
 * line to nowhere.
 */
export function SettingList({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.list, style]}>
      {rows.map((child, i) => (
        <View key={i} style={i === rows.length - 1 ? styles.lastCell : styles.cell}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cell: { borderBottomWidth: 1, borderBottomColor: colors.line },
  lastCell: {},

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    minHeight: 56,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
  },
  pressed: { backgroundColor: colors.surface2 },

  main: { flex: 1, minWidth: 0 },
  label: { ...type.body, fontWeight: '500', color: colors.ink },
  labelDestructive: { color: colors.danger },
  meta: { fontSize: 12.5, lineHeight: 17, color: colors.ink3, marginTop: 2 },
  value: { fontSize: 14, color: colors.ink3, flexShrink: 0, maxWidth: 132, ...tnum },
});

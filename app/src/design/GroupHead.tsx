/**
 * `.tx-stick` — the sticky group header on a long list.
 *
 * Not `SectionHead`. That one titles a module on a page and can carry a text
 * action; this one labels a run of rows inside one list, sticks to the top of
 * the viewport as you scroll past it, and bleeds into the screen gutter so the
 * band of canvas behind it reaches both edges. Two different jobs, and using
 * the page one here would put a 21px title every four rows.
 *
 * The count is on the header rather than the rows because § 04 makes the header
 * tappable to collapse the group — and a collapsed group with no count is a
 * line that tells you nothing.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconChevronDown } from './icons';
import { colors, maxFontScale, space, tnum } from './tokens';

export interface GroupHeadProps {
  label: string;
  count?: number;
  /** Warm ink for the group that wants something from you. */
  tone?: 'default' | 'alert';
  /** Collapses the group. Omit and the header is inert. */
  onPress?: () => void;
  collapsed?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function GroupHead({
  label,
  count,
  tone = 'default',
  onPress,
  collapsed = false,
  style,
}: GroupHeadProps) {
  const fg = tone === 'alert' ? colors.warn : colors.ink3;

  const inner = (
    <>
      <Text style={[styles.label, { color: fg }]} maxFontSizeMultiplier={maxFontScale.micro}>
        {label}
      </Text>
      {count === undefined ? null : (
        <Text style={[styles.count, { color: fg }]} maxFontSizeMultiplier={maxFontScale.micro}>
          {count}
        </Text>
      )}
    </>
  );

  if (!onPress) return <View style={[styles.head, style]}>{inner}</View>;

  /* A collapsible group says so before it is tapped. The glyph points down when
     the group is open — at the rows below it — and right when it is closed,
     which is the direction the rows would come back from. It sits after the
     count rather than before the label, because the label and its count are one
     phrase and nothing belongs between them. */

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      style={({ pressed }) => [styles.head, pressed && styles.pressed, style]}
    >
      {inner}
      <View style={collapsed ? styles.shut : undefined}>
        <IconChevronDown size={13} color={fg} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingTop: 9,
    paddingBottom: 7,
    paddingHorizontal: space.inset + 2,
    // Opaque: it slides over rows as the list scrolls, so it cannot be sheer.
    backgroundColor: colors.canvas,
  },
  pressed: { backgroundColor: colors.surface },
  // Takes the slack so the count and the chevron stay together on the right
  // edge rather than being spread apart by `space-between`.
  label: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
  },
  count: { fontSize: 10.5, fontWeight: '800', ...tnum },
  shut: { transform: [{ rotate: '-90deg' }] },
});

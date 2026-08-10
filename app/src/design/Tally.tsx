/**
 * `.tx-tally` — three figures on one hairline-divided strip.
 *
 * It sits above the attention segment and answers "how bad is it" before the
 * list answers "who". Each figure is tappable and applies itself as a filter
 * (§ 04), which is the only reason it earns the space: a strip you can't act
 * on is a report, and this screen doesn't do reports.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, space, tnum } from './tokens';

export interface TallyItem {
  key: string;
  value: string;
  label: string;
  tone?: 'default' | 'warn' | 'ok';
  onPress?: () => void;
}

export default function Tally({
  items,
  style,
}: {
  items: TallyItem[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.tally, style]}>
      {items.map((item, i) => (
        <React.Fragment key={item.key}>
          {i > 0 ? <View style={styles.rule} /> : null}
          <Figure item={item} />
        </React.Fragment>
      ))}
    </View>
  );
}

function Figure({ item }: { item: TallyItem }) {
  const valueColor =
    item.tone === 'warn' ? colors.warn : item.tone === 'ok' ? colors.ok : colors.ink;

  const inner = (
    <>
      <Text style={[styles.value, { color: valueColor }]} maxFontSizeMultiplier={maxFontScale.micro}>
        {item.value}
      </Text>
      <Text style={styles.label} maxFontSizeMultiplier={maxFontScale.micro}>
        {item.label}
      </Text>
    </>
  );

  if (!item.onPress) return <View style={styles.figure}>{inner}</View>;

  return (
    <Pressable
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.value} ${item.label}`}
      hitSlop={{ top: 11, bottom: 11, left: 6, right: 6 }}
      style={({ pressed }) => [styles.figure, pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tally: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingVertical: 11,
    paddingHorizontal: space.s3,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
  pressed: { opacity: 0.6 },
  value: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, ...tnum },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.99,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  rule: { width: 1, height: 20, backgroundColor: colors.line },
});

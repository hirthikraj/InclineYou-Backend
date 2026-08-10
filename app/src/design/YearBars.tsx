/**
 * `.tx-year` — twelve months, collected over owed.
 *
 * April to March: the Indian financial year, because the GST line is annual
 * and the CA works to that calendar.
 *
 * No opacity dimming. The legend says lime is collected and amber is owed, so
 * every bar has to be one of those two — a dimmed bar reads as a third
 * category the legend never explains. The current month is marked on its LABEL
 * instead. A month with nothing in it keeps a 2px baseline tick, so the axis
 * still reads as twelve months rather than five.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius } from './tokens';

export interface YearBarProps {
  key?: string;
  label: string;
  /** 0–1 of the tallest month. */
  collectedPart: number;
  owedPart: number;
  empty: boolean;
  current: boolean;
}

const HEIGHT = 120;

export default function YearBars({
  bars,
  onSelect,
  style,
}: {
  bars: (YearBarProps & { key: string })[];
  onSelect?: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      {bars.map((bar) => {
        // Rounded to whole pixels: a 0.4px sliver of amber on a month with ₹120
        // owed renders as a smudge, and a smudge is not information.
        const owed = bar.empty ? 0 : Math.round(bar.owedPart * (HEIGHT - 18));
        const collected = bar.empty ? 0 : Math.round(bar.collectedPart * (HEIGHT - 18));

        return (
          <Pressable
            key={bar.key}
            onPress={onSelect ? () => onSelect(bar.key) : undefined}
            disabled={!onSelect || bar.empty}
            accessibilityRole={onSelect ? 'button' : undefined}
            accessibilityLabel={bar.label}
            style={styles.cell}
          >
            <View style={styles.stack}>
              {bar.empty ? (
                <View style={styles.baseline} />
              ) : (
                <>
                  <View style={[styles.collected, { height: Math.max(2, collected) }]} />
                  {owed > 0 ? <View style={[styles.owed, { height: owed }]} /> : null}
                </>
              )}
            </View>
            <Text
              style={[styles.label, bar.current && styles.labelOn]}
              maxFontSizeMultiplier={maxFontScale.micro}
            >
              {bar.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: HEIGHT },
  cell: { flex: 1, minWidth: 0, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
  stack: { width: '100%', justifyContent: 'flex-end' },
  collected: {
    width: '100%',
    backgroundColor: colors.accent,
    borderTopLeftRadius: radius.r1,
    borderTopRightRadius: radius.r1,
  },
  owed: {
    width: '100%',
    backgroundColor: colors.warn,
    borderBottomLeftRadius: radius.r1,
    borderBottomRightRadius: radius.r1,
  },
  baseline: { width: '100%', height: 2, borderRadius: 1, backgroundColor: colors.lineStrong },
  label: { fontSize: 9, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase' },
  labelOn: { color: colors.accentText, fontWeight: '800' },
});

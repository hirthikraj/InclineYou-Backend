/**
 * `.tx-meter` — profile completion.
 *
 * Two rules it exists to enforce:
 *   · it never opens at zero. Items are weighted by business value, not
 *     counted, and the steps already finished are pre-credited — the endowed
 *     progress effect roughly doubles completion (34% vs 19% in the original
 *     study) for identical real effort;
 *   · every incomplete row deep-links to the field that fills it. A meter that
 *     tells you you're at 70% without saying where the other 30% is, is a
 *     guilt trip with a progress bar attached.
 *
 * `why` is the one line that says what the missing items are FOR. Without it
 * the whole thing reads as the app wanting data for its own sake.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';
import { IconCheck } from './icons';

export interface MeterItem {
  /** Stable id, so a caller can route off it. */
  key: string;
  label: string;
  done: boolean;
  /** Share of the total this row is worth. Weighted, not counted. */
  weight: number;
  /** Where this row goes when tapped. Omit on a done row. */
  onPress?: () => void;
  /** The trailing call to action. Defaults to "Add". */
  action?: string;
}

export interface MeterProps {
  title?: string;
  items: MeterItem[];
  why?: string;
  style?: StyleProp<ViewStyle>;
}

/** Weighted, and rounded down so 99% never renders as a finished 100%. */
export function meterPercent(items: MeterItem[]): number {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0) return 0;
  const done = items.reduce((sum, i) => (i.done ? sum + i.weight : sum), 0);
  return Math.floor((done / total) * 100);
}

export default function Meter({ title = 'Your profile', items, why, style }: MeterProps) {
  const percent = meterPercent(items);

  return (
    <View style={[styles.meter, style]}>
      <View style={styles.head}>
        <Text style={styles.headTitle}>{title}</Text>
        <Text style={styles.headValue}>{percent}%</Text>
      </View>

      <View
        style={styles.bar}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <View style={[styles.barFill, { width: `${percent}%` }]} />
      </View>

      {why ? <Text style={styles.why}>{why}</Text> : null}

      <View style={styles.list}>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          const inner = (
            <>
              <View style={[styles.tick, item.done && styles.tickDone]}>
                {item.done ? <IconCheck size={12} color="#FFFFFF" strokeWidth={3.4} /> : null}
              </View>
              <Text style={[styles.label, item.done && styles.labelDone]}>{item.label}</Text>
              {!item.done && item.onPress ? (
                <Text style={styles.action}>{item.action ?? 'Add'}</Text>
              ) : null}
            </>
          );

          if (item.done || !item.onPress) {
            return (
              <View key={item.key} style={[styles.row, !last && styles.rowDivider]}>
                {inner}
              </View>
            );
          }
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}. ${item.action ?? 'Add'}`}
              style={({ pressed }) => [
                styles.row,
                !last && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
            >
              {inner}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  meter: {
    backgroundColor: colors.surface,
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.cardPad,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  headTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.23, color: colors.ink },
  headValue: { fontSize: 19, fontWeight: '800', color: colors.accentText, ...tnum },

  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },

  why: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: 9 },

  list: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 48 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowPressed: { opacity: 0.7 },

  tick: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickDone: { backgroundColor: colors.ok },

  label: { flex: 1, fontSize: 14.5, color: colors.ink },
  labelDone: { color: colors.ink3 },
  action: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.96,
    textTransform: 'uppercase',
    color: colors.accentText,
  },
});

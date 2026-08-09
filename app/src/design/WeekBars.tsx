/**
 * `.tx-week` — seven bars, one week, today at full opacity.
 *
 * The only chart allowed on home, and only on the quiet day (state 2b). It
 * earns its place by being glanceable at 72px tall with no axes, no gridlines
 * and no numbers: the shape is the whole message.
 *
 * Bars are scaled against the busiest day of the week rather than a fixed
 * ceiling, so a five-session trainer and a fifteen-session trainer both get a
 * readable silhouette.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from './tokens';

/**
 * The height budget, split explicitly.
 *
 * The bar is a percentage, and a percentage needs something fixed to be a
 * percentage OF. Giving the whole 72px column to a flex parent and letting the
 * bar, the gap and the label share it is what the CSS does — but only because
 * a web flex item shrinks to fit by default. React Native defaults
 * `flexShrink` to 0, so the busiest day's bar took its full 72px, the gap and
 * the label were pushed out of the box, and because the column is bottom-
 * aligned the overflow went upward, straight over the card's title.
 *
 * These three add up to HEIGHT exactly, so nothing can overflow at any value.
 */
const LABEL = 13;
const GAP = 7;
const TRACK = 52;
const HEIGHT = TRACK + GAP + LABEL;

/** A zero day still shows a stub, or the week reads as six days long. */
const MIN_FRACTION = 0.08;

export interface WeekDay {
  /** Single letter — M T W T F S S. */
  label: string;
  value: number;
  /** Today. Full-opacity bar; everything else sits back. */
  on?: boolean;
}

export default function WeekBars({ days, style }: { days: WeekDay[]; style?: StyleProp<ViewStyle> }) {
  const peak = Math.max(1, ...days.map((d) => d.value));

  return (
    <View style={[styles.week, style]}>
      {days.map((d, i) => {
        const fraction = Math.max(MIN_FRACTION, d.value / peak);
        return (
          <View
            key={`${d.label}-${i}`}
            style={styles.day}
            accessibilityLabel={`${d.label}: ${d.value}`}
          >
            {/* The bar's percentage resolves against this, not against the
                whole column — see the note on the constants above. */}
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { height: `${fraction * 100}%` },
                  d.on ? styles.fillOn : styles.fillOff,
                ]}
              />
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  week: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: HEIGHT,
    // The budget above already guarantees this can't overflow. Kept anyway so
    // that if it ever does — a system font scaled past the label's line box is
    // the likely way — it clips instead of drawing over the card's title, which
    // is the failure this component has already had once.
    overflow: 'hidden',
  },
  day: { flex: 1, minWidth: 0, height: HEIGHT, gap: GAP },
  track: { height: TRACK, justifyContent: 'flex-end' },
  fill: { width: '100%', borderRadius: radius.r1, backgroundColor: colors.accent },
  fillOn: { opacity: 1 },
  fillOff: { opacity: 0.28 },
  label: {
    // Pinned rather than left to the font: a line box a pixel taller than the
    // budget puts the overflow back.
    height: LABEL,
    lineHeight: LABEL,
    fontSize: 10,
    fontWeight: '700',
    color: colors.ink3,
    textAlign: 'center',
  },
});

/**
 * `.tx-daytimeline` — a day drawn as a bar.
 *
 * The windows a trainer is editing are shapes on a day, not pairs of numbers,
 * and this is the picture the number fields are missing: each window is a block
 * on a track, the gaps between blocks are the breaks, and a split shift looks
 * like a split shift. It redraws as the fields are nudged, so "did those two
 * windows just touch?" is answered by looking, not by reading a sentence.
 *
 * Read-only on purpose. Dragging block edges inside a bottom sheet on a
 * 360-point screen is a precision gesture the thumb loses, and the sheet's own
 * pan responder is one more thing to lose it to — the presets and steppers
 * remain the input, this is the receipt.
 *
 * The track runs 05:00–23:00, the span a training day actually occupies,
 * and stretches (to the hour) only when a window falls outside it. A fixed
 * 00:00–24:00 track would spend a third of its pixels on hours no gym is open.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, tnum } from './tokens';
import { MINUTES_IN_DAY } from './TimeField';

const DEFAULT_START = 5 * 60;
const DEFAULT_END = 23 * 60;

export interface DayTimelineProps {
  /** Merged, non-overlapping windows in clock order — what will be saved. */
  windows: { startMinute: number; endMinute: number }[];
  style?: StyleProp<ViewStyle>;
}

export default function DayTimeline({ windows, style }: DayTimelineProps) {
  let rangeStart = DEFAULT_START;
  let rangeEnd = DEFAULT_END;
  for (const w of windows) {
    rangeStart = Math.min(rangeStart, Math.floor(w.startMinute / 60) * 60);
    rangeEnd = Math.max(rangeEnd, Math.ceil(w.endMinute / 60) * 60);
  }
  rangeStart = Math.max(0, rangeStart);
  rangeEnd = Math.min(MINUTES_IN_DAY, rangeEnd);

  const span = rangeEnd - rangeStart;
  const pct = (minute: number) => ((minute - rangeStart) / span) * 100;

  // Ticks every three hours, labelled every six — enough grid to place a block
  // by eye without the scale turning into a ruler.
  const ticks: number[] = [];
  for (let m = Math.ceil(rangeStart / 180) * 180; m < rangeEnd; m += 180) {
    if (m > rangeStart) ticks.push(m);
  }

  return (
    <View style={style}>
      <View style={styles.track}>
        {ticks.map((m) => (
          <View key={m} style={[styles.tick, { left: `${pct(m)}%` }]} />
        ))}
        {windows.map((w, i) => (
          <View
            key={`${i}-${w.startMinute}`}
            style={[
              styles.block,
              { left: `${pct(w.startMinute)}%`, width: `${pct(w.endMinute) - pct(w.startMinute)}%` },
            ]}
          />
        ))}
      </View>
      <View style={styles.scale}>
        {ticks
          .filter((m) => m % 360 === 0)
          .map((m) => (
            <Text
              key={m}
              style={[styles.hour, { left: `${pct(m)}%` }]}
              maxFontSizeMultiplier={maxFontScale.micro}
            >
              {String(m / 60).padStart(2, '0')}
            </Text>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 28,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.line,
  },
  block: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    minWidth: 3,
    borderRadius: radius.r1,
    backgroundColor: colors.accent,
  },
  scale: { height: 14, marginTop: 4 },
  hour: {
    position: 'absolute',
    width: 24,
    marginLeft: -12,
    textAlign: 'center',
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.ink3,
    ...tnum,
  },
});

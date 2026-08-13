/**
 * `.tx-streak` — seven days of adherence, on one row.
 *
 * Three states and no more: trained, missed, rest day. **A rest day never counts
 * against anyone** — it draws as an empty outline, not a gap and not a miss — and
 * that single rule is the difference between a compliance score a trainer trusts
 * and one they argue with. Trainerize's Exercise Compliance counts scheduled
 * workouts completed and recalculates every Sunday night, which means a client
 * who stopped on Tuesday still looks fine on Friday. This strip is computed from
 * local data every time it is drawn.
 *
 * Cells are 11px, not 13. Seven of them plus a percentage has to leave a name
 * room on a 390pt screen, and the name is what the trainer is actually reading.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './tokens';

/** `unknown` is a day outside the client's plan — before they started, or after they paused. */
export type StreakDay = 'done' | 'miss' | 'rest' | 'unknown';

export interface StreakProps {
  /** Oldest first, so the rightmost cell is today. */
  days: StreakDay[];
  style?: StyleProp<ViewStyle>;
}

const LABEL: Record<StreakDay, string> = {
  done: 'trained',
  miss: 'missed',
  rest: 'rest day',
  unknown: 'not scheduled',
};

export default function Streak({ days, style }: StreakProps) {
  return (
    <View
      style={[styles.strip, style]}
      accessible
      // Seven separate cells would be seven stops for a screen reader on a row
      // that is one fact. Read as a sentence instead.
      accessibilityLabel={days.map((d) => LABEL[d]).join(', ')}
    >
      {days.map((day, i) => (
        <View key={i} style={[styles.cell, TONE[day]]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 3, flexShrink: 0 },
  cell: { width: 11, height: 20, borderRadius: 2, backgroundColor: colors.surface3 },
});

const TONE: Record<StreakDay, ViewStyle> = {
  done: { backgroundColor: colors.ok },
  // Soft fill plus a hard edge: a miss has to be findable at a glance down a
  // list of thirty clients without being the loudest thing on the screen.
  miss: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  rest: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  unknown: { backgroundColor: colors.surface3 },
};

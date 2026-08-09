/**
 * `.tx-timer` — the rest clock, for the home hero while a session is running.
 *
 * The −15 / +15 controls sit at the two ends rather than beside each other,
 * because this is a control used with one hand, at arm's length, mid-set. The
 * clock itself is 19px tabular so the digits do not jitter as they count down.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Button from './Button';
import { colors, radius, space, tnum } from './tokens';

export interface RestTimerProps {
  /** Seconds remaining. */
  remaining: number;
  /** Seconds the rest started at — drives the bar. */
  total: number;
  onAdjust?: (deltaSeconds: number) => void;
  style?: StyleProp<ViewStyle>;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function RestTimer({ remaining, total, onAdjust, style }: RestTimerProps) {
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;

  return (
    <View style={[styles.timer, style]}>
      <Button
        label="−15"
        variant="ghost"
        size="sm"
        onPress={() => onAdjust?.(-15)}
        style={styles.adjust}
      />
      <Text style={styles.clock} accessibilityLabel={`${formatClock(remaining)} rest remaining`}>
        {formatClock(remaining)}
      </Text>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
      </View>
      <Button
        label="+15"
        variant="ghost"
        size="sm"
        onPress={() => onAdjust?.(15)}
        style={styles.adjust}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingVertical: 10,
    paddingHorizontal: space.s3,
    backgroundColor: colors.surface2,
    borderRadius: radius.r2,
  },
  adjust: { minWidth: 56 },
  clock: { fontSize: 19, fontWeight: '800', letterSpacing: -0.38, color: colors.ink, minWidth: 56, ...tnum },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
});

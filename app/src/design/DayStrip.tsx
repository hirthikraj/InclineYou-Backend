/**
 * `.tx-daystrip` — seven days, with how heavy each one is.
 *
 * The load pips answer "how busy" without answering "exactly how many", which
 * is the only question a strip this size can honestly take. Three pips means
 * three or more; a closed day shows them hollow, because "no hours" and "no
 * bookings" are different facts and a trainer plans around the first.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, tnum } from './tokens';

export interface StripDayProps {
  at: number;
  label: string;
  date: number;
  today: boolean;
  past: boolean;
  /** 0–3 filled pips. */
  load: number;
  closed: boolean;
}

export default function DayStrip({
  days,
  selected,
  onSelect,
  style,
}: {
  days: StripDayProps[];
  selected: number;
  onSelect: (at: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.strip, style]}>
      {days.map((day) => {
        const on = day.at === selected;
        return (
          <Pressable
            key={day.at}
            onPress={() => onSelect(day.at)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${day.label} ${day.date}${day.closed ? ', closed' : ''}`}
            style={[styles.day, on && styles.dayOn, day.past && !on && styles.dayPast]}
          >
            <Text
              style={[styles.label, on && styles.inverse]}
              maxFontSizeMultiplier={maxFontScale.micro}
            >
              {day.label}
            </Text>
            <Text
              style={[
                styles.date,
                day.today && !on && styles.dateToday,
                on && styles.inverse,
              ]}
              maxFontSizeMultiplier={maxFontScale.micro}
            >
              {day.date}
            </Text>
            <View style={styles.load}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.pip,
                    (day.closed || i >= day.load) && styles.pipOff,
                    on && (day.closed || i >= day.load ? styles.pipOnOff : styles.pipOn),
                  ]}
                />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    minHeight: 62,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  dayOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayPast: { opacity: 0.5 },
  label: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  date: { fontSize: 17, fontWeight: '800', letterSpacing: -0.34, color: colors.ink, ...tnum },
  dateToday: { color: colors.accentText },
  inverse: { color: colors.accentInk },
  load: { flexDirection: 'row', gap: 3, alignItems: 'center', height: 5 },
  pip: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  pipOff: { backgroundColor: colors.lineStrong },
  pipOn: { backgroundColor: colors.accentInk },
  pipOnOff: { backgroundColor: 'rgba(0,0,0,0.24)' },
});

/**
 * `.tx-mo` — a month as density.
 *
 * §07: month cells carry dots, never names. A cell is 46px on a 390pt screen
 * and a client's name in there is a truncated lie — decoration pretending to be
 * data. One dot per two sessions, capped at three, and a full day turns its
 * dots warn so the eye finds the weeks that are already sold out.
 *
 * Six rows always. A grid that renders five rows one month and six the next
 * jumps under the thumb on every swipe.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, tnum } from './tokens';

const HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export interface MonthCellProps {
  at: number;
  date: number;
  today: boolean;
  inMonth: boolean;
  dots: number;
  full: boolean;
}

export default function MonthGrid({
  cells,
  selected,
  onSelect,
  onLongPress,
  style,
}: {
  cells: MonthCellProps[];
  selected: number;
  onSelect: (at: number) => void;
  onLongPress?: (at: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <View style={styles.row}>
        {HEADS.map((head, i) => (
          <View key={`${head}${i}`} style={styles.headCell}>
            <Text style={styles.head} maxFontSizeMultiplier={maxFontScale.micro}>
              {head}
            </Text>
          </View>
        ))}
      </View>

      {weeks(cells).map((week) => (
        <View key={week[0].at} style={styles.row}>
          {week.map((cell) => {
            const on = cell.at === selected;
            return (
              <Pressable
                key={cell.at}
                onPress={() => onSelect(cell.at)}
                onLongPress={onLongPress ? () => onLongPress(cell.at) : undefined}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${cell.date}, ${
                  cell.dots === 0 ? 'nothing booked' : 'has sessions'
                }`}
                style={[styles.cell, cell.today && !on && styles.today, on && styles.on]}
              >
                <Text
                  style={[
                    styles.date,
                    !cell.inMonth && styles.out,
                    cell.today && !on && styles.dateToday,
                    on && styles.dateOn,
                  ]}
                  maxFontSizeMultiplier={maxFontScale.micro}
                >
                  {cell.date}
                </Text>
                <View style={styles.dots}>
                  {Array.from({ length: cell.dots }, (_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, cell.full && styles.dotFull, on && styles.dotOn]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * Six rows of seven.
 *
 * Not one wrapping row of 42. A percentage width of 100/7 rounds up on a 1080px
 * screen, the seventh cell stops fitting, and the calendar silently becomes six
 * columns wide — which is a wrong calendar, not a cosmetic one. Real rows with
 * `flex: 1` divide the space exactly.
 */
function weeks(cells: MonthCellProps[]): MonthCellProps[][] {
  const out: MonthCellProps[][] = [];
  for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
  return out;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  headCell: { flex: 1, alignItems: 'center', paddingBottom: 5 },
  head: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.r2,
  },
  today: { borderWidth: 1, borderColor: colors.accentLine },
  on: { backgroundColor: colors.accent },
  date: { fontSize: 13, fontWeight: '600', color: colors.ink2, ...tnum },
  out: { color: colors.inkOff },
  dateToday: { color: colors.accentText, fontWeight: '800' },
  dateOn: { color: colors.accentInk, fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 2, height: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  dotFull: { backgroundColor: colors.warn },
  dotOn: { backgroundColor: colors.accentInk },
});

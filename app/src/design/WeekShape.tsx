/**
 * A program's shape: one week, and what each training day is called.
 *
 * ── Why one week and not a weeks × days matrix ────────────────────────────
 *
 * The design drew four `W1…W4` rows. They were identical — a template holds one
 * week's plan and the program repeats it, which the program screen says out loud.
 * So twenty-eight cells carried one week of information, and the only thing the
 * extra rows added was a taller card. The length is in the title already
 * ("· 8 weeks"), so it is not lost by dropping them.
 *
 * ── Why the cells are unlabelled ──────────────────────────────────────────
 *
 * They carried `P`, `L`, `G` at 8.5px. That failed three ways: the card's title
 * already said "Push / Pull / Legs", the colour already encoded the same split a
 * third time, and the letters were a disambiguation chain rather than a mnemonic
 * — `L` for pull because push took `P`, `G` for legs because pull took `L`. Worse,
 * it only knew three splits, so a Full Body program drew three grey dots.
 *
 * The name goes underneath instead, at a size somebody can read, **in the
 * trainer's own words**. Templates store day labels, so "Push A" and "Full Body B"
 * are facts rather than guesses.
 *
 * ── Colour is per distinct day, not per split ─────────────────────────────
 *
 * `tone` is an index the caller assigns by grouping the week's days by label. That
 * is what makes Full Body work: three days that a split-classifier would call the
 * same thing get three colours, and the legend names them. Push / Pull / Legs
 * still comes out lime / blue / amber, because it has three distinct days and the
 * palette is in that order.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';

/**
 * Up to five distinguishable day colours.
 *
 * Ordered so the common case lands where the design put it. A program with more
 * than five distinct days wraps, which is safe because the legend below carries
 * the names — the colour is a pairing device, not the answer.
 */
const TONES = [colors.accent, colors.info, colors.pr, colors.remote, colors.ok] as const;

export function toneColor(tone: number): string {
  return TONES[tone % TONES.length];
}

export interface ShapeLegendEntry {
  label: string;
  tone: number;
}

export interface WeekShapeProps {
  /**
   * Seven entries, one per day slot — "Day 1" first. Slots, not weekdays:
   * which weekday a slot lands on is the client's choice, made at assign
   * time, so the shelf has no weekday to draw. `null` is an unused slot.
   */
  week: (number | null)[];
  /** One per distinct training day, in the order they first occur. */
  legend: ShapeLegendEntry[];
  style?: StyleProp<ViewStyle>;
}

const DAYS = ['1', '2', '3', '4', '5', '6', '7'];
const DAY_NAMES = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
const GAP = 6;

export default function WeekShape({ week, legend, style }: WeekShapeProps) {
  const [cell, setCell] = useState(0);

  const spoken = week
    .map((tone, i) =>
      tone === null
        ? null
        : `${DAY_NAMES[i]} ${legend.find((l) => l.tone === tone)?.label ?? ''}`.trim(),
    )
    .filter(Boolean)
    .join(', ');

  return (
    <View style={style}>
      <View
        onLayout={(e) => {
          const next = Math.max(0, Math.floor((e.nativeEvent.layout.width - GAP * 6) / 7));
          if (next !== cell) setCell(next);
        }}
        accessible
        // Seven cells would be seven stops for a screen reader on a row that is
        // one fact. Read as a sentence, and the legend below is not repeated
        // because this sentence already contains it.
        accessibilityLabel={spoken || 'No days set'}
      >
        <View style={styles.row}>
          {DAYS.map((day, i) => (
            <Text key={i} style={[styles.head, { width: cell }]}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.row}>
          {week.map((tone, i) =>
            tone === null ? (
              <View key={i} style={[styles.cell, styles.rest, { width: cell, height: cell }]} />
            ) : (
              <View
                key={i}
                style={[styles.cell, { width: cell, height: cell, backgroundColor: toneColor(tone) }]}
              />
            ),
          )}
        </View>
      </View>

      {legend.length ? (
        <View style={styles.legend} importantForAccessibility="no-hide-descendants">
          {legend.map((entry) => (
            <View key={`${entry.tone}-${entry.label}`} style={styles.entry}>
              <View style={[styles.swatch, { backgroundColor: toneColor(entry.tone) }]} />
              <Text style={styles.entryLabel} numberOfLines={1}>
                {entry.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP, alignItems: 'center', marginBottom: GAP },

  head: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: colors.ink3,
    textAlign: 'center',
    ...tnum,
  },

  cell: { borderRadius: radius.r2 },
  // Nothing scheduled: no fill, and a dashed edge that says so. Dashed already
  // means "nothing here" everywhere else in this system.
  rest: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s3, marginTop: space.s2 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  swatch: { width: 8, height: 8, borderRadius: 2, flexShrink: 0 },
  entryLabel: { fontSize: 12, fontWeight: '600', color: colors.ink2, flexShrink: 1 },
});

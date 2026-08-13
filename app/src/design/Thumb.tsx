/**
 * `.tx-thumb` — the square in front of an exercise.
 *
 * A 52px tile with a dumbbell glyph. It replaces the avatar in the roster row's
 * leading slot, because an exercise has no initials and a letter tile for
 * "Barbell bench press" reads as a person.
 *
 * `custom` outlines it in the accent. A trainer's own exercise is the one they
 * will hunt for in a list of 873, and the design's "Yours" chip is the coarse
 * filter — this is the fine one, visible without filtering at all.
 *
 * The design puts a small play badge in the corner for exercises with a demo.
 * **v1 does not do video**, so it is not here — an affordance that never fires is
 * worse than none, and this one would have appeared on all 873 rows.
 *
 * The gradient the CSS uses is one flat surface here. It is 52 × 52 with a glyph
 * on top; an SVG gradient per row down a scrolling list of hundreds costs more
 * than the two-stop wash is worth.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from './tokens';
import { IconDumbbell } from './icons';

export interface ThumbProps {
  /** The trainer built this one. */
  custom?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
}

export default function Thumb({ custom = false, size = 'md', style }: ThumbProps) {
  const side = size === 'sm' ? 40 : 52;
  return (
    <View
      style={[
        styles.tile,
        { width: side, height: side, flexBasis: side },
        custom && styles.custom,
        style,
      ]}
    >
      <IconDumbbell size={size === 'sm' ? 18 : 22} color={colors.ink3} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.r2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
  custom: { borderColor: colors.accentLine },
});

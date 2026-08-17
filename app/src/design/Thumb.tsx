/**
 * `.tx-thumb` — the square in front of an exercise.
 *
 * A 52px tile holding the library's thumbnail, falling back to a dumbbell glyph.
 * It replaces the avatar in the roster row's leading slot, because an exercise has
 * no initials and a letter tile for "Barbell bench press" reads as a person.
 *
 * `custom` outlines it in the accent. A trainer's own exercise is the one they
 * will hunt for in a list of over a thousand, and the design's "Yours" chip is the
 * coarse filter — this is the fine one, visible without filtering at all.
 *
 * ── On there being no pictures ────────────────────────────────────────────
 *
 * `uri` is null for every exercise today. The shared library is seeded text-only
 * — upstream's artwork is © Gym visual and we hold no licence for it — so the
 * glyph is what the whole list draws, and the accent outline is doing all the
 * work of telling a trainer's own exercise apart. The image path is kept rather
 * than torn out because it is the seam a licensed set would arrive through, and
 * because `custom` alone would not survive one.
 *
 * The play badge went with the media. A badge that can never fire is worse than
 * no badge — it promises a demo behind every row and delivers none.
 *
 * ── On the image failing ──────────────────────────────────────────────────
 *
 * A tile that renders a broken-image box in a list of hundreds is worse than one
 * that quietly shows the glyph, so `onError` drops back to it. A gym's signal is
 * the normal case here, not the edge case.
 *
 * The gradient the CSS uses is one flat surface here. It is 52 × 52 with either a
 * photograph or a glyph on top; an SVG gradient per row down a scrolling list of
 * hundreds costs more than the two-stop wash is worth.
 */

import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from './tokens';
import { IconDumbbell } from './icons';

export interface ThumbProps {
  /** The exercise's still, when it has one. Null throughout the library today. */
  uri?: string | null;
  /** The trainer built this one. */
  custom?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
}

export default function Thumb({ uri, custom = false, size = 'md', style }: ThumbProps) {
  const [failed, setFailed] = React.useState(false);

  // A row recycled onto a different exercise inherits the previous one's failure
  // otherwise, and one dropped image poisons every tile that scrolls through that
  // cell for the rest of the session.
  React.useEffect(() => setFailed(false), [uri]);

  const side = size === 'sm' ? 40 : 52;
  const showImage = Boolean(uri) && !failed;

  return (
    <View
      style={[
        styles.tile,
        { width: side, height: side, flexBasis: side },
        custom && styles.custom,
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          style={styles.image}
          // A square tile and a square-ish source: `cover` trims whatever margin
          // the image carries rather than letterboxing it.
          resizeMode="cover"
          onError={() => setFailed(true)}
          // Decorative here — the row's title already names the exercise, and a
          // screen reader announcing "photo of barbell bench press" before
          // "Barbell bench press" says it twice.
          accessible={false}
        />
      ) : (
        <IconDumbbell size={size === 'sm' ? 18 : 22} color={colors.ink3} />
      )}
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
  image: { width: '100%', height: '100%' },
});

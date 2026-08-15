/**
 * `.tx-card` — the default surface. Border only, no shadow: in this system
 * depth comes from lightness, not from elevation.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius, space } from './tokens';

/** `transparent 46%` — where the CSS gradient has finished fading out. */
const TINT_STOP = 0.46;

export interface CardProps {
  children: React.ReactNode;
  /** `.tx-card--flush` — for a card whose content owns its own padding. */
  flush?: boolean;
  /**
   * `.tx-card--live` — the one card on a screen that is happening now.
   *
   * The CSS fades an accent tint down from the top edge, gone by 46%. This used
   * to be approximated with a flat `accentSoft` block clipped to the top 46%,
   * and the approximation was visible: a solid tint has a hard bottom edge, so
   * the card read as a lime bar ruled off by a line rather than a glow coming
   * off the top. It is a real gradient now — `react-native-svg` is already what
   * every icon and the skeleton sweep are drawn with, so this costs nothing new.
   *
   * The layer sits over the normal surface rather than replacing it. Painting
   * the tint as the background instead would tint against the canvas and come
   * out muddy.
   */
  live?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Card({ children, flush = false, live = false, style }: CardProps) {
  return (
    <View style={[styles.card, live && styles.live, flush && styles.flush, style]}>
      {live ? <LiveTint /> : null}
      {children}
    </View>
  );
}

/**
 * The accent fade. Fills the card and clips to its radius, so it needs no
 * measurement — the card sizes to its content and the gradient follows.
 */
function LiveTint() {
  return (
    <View style={styles.tint} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="tx-card-live" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accentSoftHue} stopOpacity={colors.accentSoftAlpha} />
            <Stop offset={TINT_STOP} stopColor={colors.accentSoftHue} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tx-card-live)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.cardPad,
  },
  flush: { padding: 0, overflow: 'hidden' },
  live: { borderColor: colors.accentLine, overflow: 'hidden' },
  tint: StyleSheet.absoluteFillObject,
});

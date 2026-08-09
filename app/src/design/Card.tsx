/**
 * `.tx-card` — the default surface. Border only, no shadow: in this system
 * depth comes from lightness, not from elevation.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from './tokens';

export interface CardProps {
  children: React.ReactNode;
  /** `.tx-card--flush` — for a card whose content owns its own padding. */
  flush?: boolean;
  /**
   * `.tx-card--live` — the one card on a screen that is happening now.
   *
   * The CSS fades an accent tint from the top edge. RN has no gradient without
   * a native module, so the tint is a real layer pinned to the top 46% of the
   * card — the same proportion the gradient stops at — sitting over the normal
   * surface rather than replacing it. Painting `accentSoft` as the background
   * instead would tint against the canvas and come out muddy.
   */
  live?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Card({ children, flush = false, live = false, style }: CardProps) {
  return (
    <View style={[styles.card, live && styles.live, flush && styles.flush, style]}>
      {live ? <View style={styles.tint} pointerEvents="none" /> : null}
      {children}
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
  tint: { position: 'absolute', top: 0, left: 0, right: 0, height: '46%', backgroundColor: colors.accentSoft },
});

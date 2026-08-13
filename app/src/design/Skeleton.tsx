/**
 * `.tx-skeleton` — the loading placeholder.
 *
 * The token has been in the system since v1 (`--tx-skeleton`, a three-stop
 * gradient swept over 1.4s) but nothing used it, because every screen paints
 * from SQLite and was supposed to be instant. It is not always instant: the
 * first read of the app's life has to reach the database, and on a cold start
 * that is long enough to see. A skeleton is the honest thing for that window —
 * it says "this is arriving" without claiming anything about what.
 *
 * Two things about the sweep are load-bearing, and both were learned from a
 * shimmer that rendered perfectly and never moved a pixel.
 *
 * **The animated value belongs to the block.** One module-level value shared by
 * every block looks tempting — a single driver, every block in phase — but it
 * does not survive layout. Each block interpolates against its own measured
 * width, so when that width arrives the old interpolation is swapped for a new
 * one, and the instant the value's child count touches zero
 * `AnimatedValue.__detach()` calls `stopAnimation()`. The loop dies with
 * `finished: false` before drawing a frame. A value per block has exactly one
 * child for its whole life, so there is nothing to detach.
 *
 * **The loop starts after layout.** The interpolation is built once from a
 * known width and never replaced, so nothing swaps under a running animation.
 * Blocks all measure in the same frame, so they stay in step regardless.
 *
 * **A gradient needs SVG.** React Native cannot animate a CSS background
 * position, so the sweep is a translated gradient band inside a clipped block.
 * `react-native-svg` is already what every icon here is drawn with.
 *
 * Reduced motion gets the flat block, with no band and no loop.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius, space } from './tokens';
import useReduceMotion from './useReduceMotion';

/** `--tx-skeleton`'s three stops: base, highlight, base. */
const BASE = '#14171C';
const HIGH = '#1C2027';

const SWEEP_MS = 1400;

/** How much wider than the block the highlight is — a soft wash, not a stripe. */
const BAND = 1.6;

export interface SkeletonProps {
  /** Any valid width. Defaults to filling its parent. */
  width?: number | `${number}%`;
  height?: number;
  /** Defaults to `r1`, the token's own radius. Pass `radius.full` for a circle. */
  round?: number;
  style?: StyleProp<ViewStyle>;
}

export default function Skeleton({ width = '100%', height = 12, round, style }: SkeletonProps) {
  const reduced = useReduceMotion();
  const [measured, setMeasured] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  const band = measured * BAND;

  // Built once per width and then left alone — replacing it while the loop runs
  // is exactly what detaches the value and silently kills the sweep.
  const translateX = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [-band, measured] }),
    [progress, band, measured],
  );

  useEffect(() => {
    if (reduced || measured === 0) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: SWEEP_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      progress.setValue(0);
    };
  }, [progress, reduced, measured]);

  return (
    <View
      onLayout={(e) => {
        const next = Math.round(e.nativeEvent.layout.width);
        if (next !== measured) setMeasured(next);
      }}
      style={[styles.block, { height, borderRadius: round ?? radius.r1, width }, style]}
    >
      {reduced || measured === 0 ? null : (
        <Animated.View
          style={[styles.band, { width: band, transform: [{ translateX }] }]}
          pointerEvents="none"
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="tx-skeleton" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={BASE} stopOpacity={0} />
                <Stop offset="0.5" stopColor={HIGH} stopOpacity={1} />
                <Stop offset="1" stopColor={BASE} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#tx-skeleton)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

/* --------------------------------------------------------- compositions
 *
 * The shapes below exist so a screen's skeleton can be built from the same
 * metrics as the screen itself. A placeholder that does not match the layout it
 * stands in for produces a jump when the real content lands, which is the one
 * thing a skeleton is supposed to prevent.
 * -------------------------------------------------------------------------- */

/** Mirrors `Row`: 64px tall, a 34px leading circle, a title and a subtitle. */
export function SkeletonRow({
  avatar = true,
  trailing = false,
  grouped = false,
}: {
  avatar?: boolean;
  /** A small button or tag sits on the right of the real row. */
  trailing?: boolean;
  grouped?: boolean;
}) {
  return (
    <View style={[styles.row, grouped && styles.rowGrouped]}>
      {avatar ? <Skeleton width={34} height={34} round={radius.full} /> : null}
      <View style={styles.rowMain}>
        <Skeleton width="52%" height={13} />
        <Skeleton width="78%" height={11} style={styles.rowSub} />
      </View>
      {trailing ? <Skeleton width={64} height={26} round={radius.r2} /> : null}
    </View>
  );
}

/** A card-shaped block, for the figure panels the money and home screens open with. */
export function SkeletonCard({
  height = 132,
  style,
}: {
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <Skeleton height={height} round={radius.r3} style={style} />;
}

/** The uppercase group head above a list. Narrow, because a label is short. */
export function SkeletonHead({ style }: { style?: StyleProp<ViewStyle> }) {
  return <Skeleton width={104} height={10} style={[styles.head, style]} />;
}

const styles = StyleSheet.create({
  block: { backgroundColor: BASE, overflow: 'hidden' },
  // Explicit edges rather than `absoluteFillObject`: with `right: 0` also set,
  // Yoga stretches the band to the block and ignores the width below, leaving
  // nothing that over-runs the edges and so nothing to sweep.
  band: { position: 'absolute', top: 0, bottom: 0, left: 0 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: space.s3,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowGrouped: { borderRadius: 0, borderWidth: 0, borderBottomWidth: 1 },
  rowMain: { flex: 1, minWidth: 0 },
  rowSub: { marginTop: 7 },
  head: { marginTop: space.s5, marginBottom: space.s3 },
});

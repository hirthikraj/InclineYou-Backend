/**
 * The handoff from a skeleton to the real thing.
 *
 * Swapping the two trees on the frame the data lands is correct and it looks
 * wrong: a screenful of dense content appears out of nothing, and the eye reads
 * that as a jolt rather than as loading finishing. The information arrived
 * smoothly; the presentation should say so.
 *
 * So the two overlap. The content fades up from 12px below over `motion.reveal`
 * while the skeleton fades out across the first half of that — one wavefront, no
 * gap, and nothing changes position, because the skeletons were built from the
 * same metrics as the screens they stand in for.
 *
 * The curve is `curve.reveal` rather than one of the emphasized pair. Those are
 * for surfaces travelling a long way and are extremely front-loaded; on an
 * opacity, `emphasizedDecelerate` measured 94% complete in four milliseconds,
 * which is the snap this component exists to remove.
 *
 * Three phases, and the middle one is why this is a component rather than a
 * style. While loading, the skeleton has to be in normal flow or it contributes
 * no height and the scroll view is empty. During the crossfade it has to be
 * absolutely positioned over the content, or the two trees stack and the page
 * is briefly twice as tall. Then it unmounts.
 *
 * Reduced motion gets the straight swap. Someone who has asked the OS to stop
 * things moving is not asking for a gentler version of it.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { curve, motion } from './tokens';
import useReduceMotion from './useReduceMotion';

/** How far the content travels. Far enough to read as movement, near enough not to swim. */
const RISE = 12;

type Phase = 'loading' | 'crossfade' | 'done';

export interface RevealProps {
  /** False while the data is still being read. */
  ready: boolean;
  /** Shown while loading, and faded out over the content once it arrives. */
  skeleton: React.ReactNode;
  children: React.ReactNode;
  /**
   * The content is a virtualised list and must fill the space it is given.
   *
   * Without this the animated wrapper sizes to its content, which leaves a
   * `FlatList` or `SectionList` inside it with no bounded height — and an
   * unbounded list renders **every** row instead of a window, which is the exact
   * opposite of why you reached for one. Off by default because most callers put
   * a `ScrollView` inside a `ScrollView`-less parent, where `flex: 1` would be
   * wrong.
   */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Reveal({ ready, skeleton, children, fill = false, style }: RevealProps) {
  const reduced = useReduceMotion();
  const [phase, setPhase] = useState<Phase>(ready ? 'done' : 'loading');
  const enter = useRef(new Animated.Value(ready ? 1 : 0)).current;

  useEffect(() => {
    if (!ready) {
      // Back to loading — a sign-out, or a window that re-queries. Reset so the
      // reveal plays again rather than the content appearing already faded in.
      enter.setValue(0);
      setPhase('loading');
      return;
    }
    if (reduced) {
      enter.setValue(1);
      setPhase('done');
      return;
    }

    setPhase('crossfade');
    const anim = Animated.timing(enter, {
      toValue: 1,
      duration: motion.reveal,
      easing: Easing.bezier(...curve.reveal),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      // Only on a real finish: a stopped animation means this unmounted or went
      // back to loading, and dropping the skeleton then would flash the content.
      if (finished) setPhase('done');
    });
    return () => anim.stop();
  }, [ready, reduced, enter]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] });
  // Gone by the time the content is at roughly half opacity, so the two never
  // both read as solid — that would look like a double exposure.
  const fadeOut = enter.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] });

  return (
    <View style={[styles.wrap, style]}>
      {/* Mounted from the first frame so the animated value always has a child.
          A value whose child count touches zero is detached, and detaching
          stops the animation mid-flight. */}
      <Animated.View
        style={[fill && styles.fill, { opacity: enter, transform: [{ translateY }] }]}
      >
        {phase === 'loading' ? null : children}
      </Animated.View>

      {phase === 'loading' ? skeleton : null}

      {phase === 'crossfade' ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.over, fill && styles.overFill, { opacity: fadeOut }]}
        >
          {skeleton}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // `relative` is the default, but it is stated because the overlay below
  // depends on this view being the containing block.
  wrap: { position: 'relative' },
  fill: { flex: 1 },
  over: { position: 'absolute', top: 0, left: 0, right: 0 },
  // A filling reveal's skeleton is bounded too, so it cannot push the overlay
  // past the bottom of a list that owns the whole screen.
  overFill: { bottom: 0 },
});

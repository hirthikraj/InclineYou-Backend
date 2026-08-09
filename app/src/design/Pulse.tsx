/**
 * `.tx-pulse` — the 8px dot that says a thing is live right now.
 *
 * The CSS animates an expanding box-shadow. React Native has no animatable
 * shadow, so the halo is a real sibling View that scales and fades under the
 * dot — same read, and it composites on the native thread because both driven
 * properties are transform/opacity.
 *
 * It stops entirely under Reduce Motion. A pulsing dot is decoration on top of
 * information that the accent colour already carries; nothing is lost by
 * holding it still.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from './tokens';
import useReduceMotion from './useReduceMotion';

const DOT = 8;
const CYCLE = 2000;

export default function Pulse({ style }: { style?: StyleProp<ViewStyle> }) {
  const still = useReduceMotion();
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(wave, {
        toValue: 1,
        duration: CYCLE,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      wave.setValue(0);
    };
  }, [still, wave]);

  return (
    <View style={[styles.box, style]} accessibilityElementsHidden importantForAccessibility="no">
      {still ? null : (
        <Animated.View
          style={[
            styles.halo,
            {
              opacity: wave.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] }),
              transform: [
                { scale: wave.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) },
              ],
            },
          ]}
        />
      )}
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  halo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
});

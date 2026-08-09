/**
 * `.tx-ptr` and `.tx-synced` — a local-first app has to say when it last talked
 * home.
 *
 * Pull-to-refresh here means SYNC, not fetch: the content on screen came from
 * SQLite and is already correct, so nothing blanks, nothing skeletons, and the
 * band sits above the content rather than replacing it. The only thing the
 * gesture changes is whether the queue has gone out yet.
 *
 * `SyncStamp` is the quieter half — a timestamp under a section, for the times
 * nothing is in flight and the honest thing to say is when we last succeeded.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, tnum } from './tokens';

export function SyncSpinner({ size = 19 }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  return (
    <Animated.View
      style={[
        styles.spinner,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [
            { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
          ],
        },
      ]}
    />
  );
}

/** The 50px band above the content while a sync is in flight. */
export function SyncBand({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.band, style]} accessibilityLiveRegion="polite">
      <SyncSpinner />
      <Text style={styles.bandText}>{label}</Text>
    </View>
  );
}

/** `.tx-synced` — "Synced 4 minutes ago". */
export function SyncStamp({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.stamp, style]}>
      <Text style={styles.stampText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: {
    borderWidth: 2,
    borderColor: colors.lineStrong,
    borderTopColor: colors.accent,
    flexShrink: 0,
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 50,
  },
  bandText: { fontSize: 13, fontWeight: '500', color: colors.ink3 },

  stamp: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.r1 },
  stampText: { fontSize: 11, color: colors.ink3, ...tnum },
});

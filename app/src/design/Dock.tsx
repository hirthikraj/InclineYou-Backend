/**
 * `.tx-dock` — the bar that stays.
 *
 * One permanent control at the bottom of a mode screen. It reaches the bottom
 * edge, so it always owes the gesture inset; 56px of content, because §09 says
 * anything used mid-session is 56 and the way out of a session qualifies.
 *
 * A second, quieter way out sits beside the primary — "Later" next to "Mark done
 * · pack −1". It is deliberately not a third full-width button underneath: two
 * equal buttons stacked read as two equal decisions, and one of these is the
 * one the trainer came here to make.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, maxFontScale, radius, space, tap } from './tokens';

export interface DockProps {
  children: React.ReactNode;
  /** The quieter escape. Never wider than its label. */
  alt?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

export default function Dock({ children, alt, style }: DockProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.dock, { paddingBottom: space.s3 + insets.bottom }, style]}>
      <View style={styles.main}>{children}</View>
      {alt ? (
        <Pressable
          onPress={alt.onPress}
          accessibilityRole="button"
          accessibilityLabel={alt.label}
          style={({ pressed }) => [styles.alt, pressed && styles.altPressed]}
        >
          <Text style={styles.altLabel} maxFontSizeMultiplier={maxFontScale.control}>
            {alt.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingTop: space.s3,
    paddingHorizontal: space.inset,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  main: { flex: 1, minWidth: 0 },
  alt: {
    minHeight: tap.gym,
    paddingHorizontal: space.s4,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  altPressed: { backgroundColor: colors.surface3 },
  altLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.08,
    textTransform: 'uppercase',
    color: colors.ink2,
  },
});

/**
 * `.tx-banner` — one line of state, and only when it is true.
 *
 * § 06: banners are conditional, not chrome. Nothing here is ever rendered as
 * a permanent strip; an offline banner that is always present teaches people
 * to stop reading the top of the screen.
 *
 * The offline copy is the important part — "everything still works" — because
 * a trainer on a gym floor with no signal needs to be told the app has not
 * stopped, not that the network has.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from './tokens';
import type { IconProps } from './icons';

export type BannerTone = 'neutral' | 'offline' | 'sync' | 'error';

const TONES: Record<BannerTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: colors.surface2, fg: colors.ink2, border: colors.line },
  offline: { bg: colors.warnSoft, fg: colors.warn, border: colors.warnSoft },
  sync: { bg: colors.infoSoft, fg: colors.info, border: colors.infoSoft },
  error: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
};

export interface BannerProps {
  children: React.ReactNode;
  tone?: BannerTone;
  icon?: React.ComponentType<IconProps>;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function Banner({ children, tone = 'neutral', icon: Icon, onPress, style }: BannerProps) {
  const { bg, fg, border } = TONES[tone];

  const inner = (
    <>
      {Icon ? <Icon size={18} color={fg} strokeWidth={1.9} /> : null}
      <Text style={[styles.text, { color: fg }]}>{children}</Text>
    </>
  );

  const box = [styles.banner, { backgroundColor: bg, borderColor: border }, style];

  if (!onPress) {
    return (
      <View style={box} accessibilityLiveRegion="polite">
        {inner}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [...box, pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingVertical: 11,
    paddingHorizontal: space.s4,
    borderRadius: radius.r2,
    borderWidth: 1,
  },
  pressed: { opacity: 0.8 },
  text: { flex: 1, fontSize: 13, fontWeight: '600' },
});

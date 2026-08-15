/**
 * `.tx-btn` — the design system's only button.
 *
 * Two rules from the spec that are easy to get wrong:
 *   · a faded accent fill reads as a bug, not as "off", so a disabled primary
 *     goes tonal (surface-2 / ink-3) at full opacity rather than dimming;
 *   · while loading the label keeps its space and turns invisible, so the
 *     button never resizes mid-request.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, maxFontScale, radius, space } from './tokens';
import type { IconProps } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'text';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Leading icon. Rendered with the label's colour so variants stay in sync. */
  icon?: React.ComponentType<IconProps>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  icon: Icon,
  style,
  testID,
}: ButtonProps) {
  const off = disabled || loading;
  const iconSize = size === 'lg' ? 17 : size === 'sm' ? 14 : 16;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.base,
        sizes[size],
        fills[variant],
        variant === 'text' && styles.textMetrics,
        block && styles.block,
        pressed && presses[variant],
        disabled && (variant === 'primary' ? styles.primaryOff : styles.off),
        style,
      ]}
    >
      <View style={[styles.content, loading && styles.hidden]}>
        {Icon ? <Icon size={iconSize} color={labelColor(variant, disabled)} /> : null}
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={maxFontScale.control}
          style={[
            styles.label,
            labelSizes[size],
            { color: labelColor(variant, disabled) },
          ]}
        >
          {label}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.accentInk : colors.ink}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </Pressable>
  );
}

function labelColor(variant: ButtonVariant, disabled: boolean): string {
  if (disabled && variant === 'primary') return colors.ink3;
  switch (variant) {
    case 'primary':
      return colors.accentInk;
    case 'secondary':
      return colors.ink;
    case 'ghost':
      return colors.ink2;
    case 'danger':
      return colors.danger;
    case 'text':
      return colors.accentText;
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  block: { alignSelf: 'stretch', width: '100%' },
  /**
   * Shrinkable, and `minWidth: 0` with it. Without both, a label wider than a
   * width-constrained button (`flex: 1` in a pair, say) keeps its intrinsic
   * width and spills over the fill instead of ellipsising — `numberOfLines`
   * alone cannot save it, because nothing above the Text is bounding it.
   */
  content: { flexDirection: 'row', alignItems: 'center', gap: space.s2, flexShrink: 1, minWidth: 0 },
  hidden: { opacity: 0 },
  label: {
    fontWeight: '800',
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  /** `.tx-btn--text` owns its own metrics regardless of the size prop. */
  textMetrics: { minHeight: 44, paddingVertical: 6, paddingHorizontal: space.s2 },
  off: { opacity: 0.45 },
  /** Tonal, not faded — see the note at the top of this file. */
  primaryOff: {
    opacity: 1,
    backgroundColor: colors.surface2,
    borderColor: colors.line,
  },
});

/**
 * Resting heights, not caps.
 *
 * `minHeight` plus vertical padding means the button follows its label when the
 * OS font is scaled up, instead of holding 48px and letting the glyphs spill
 * over the edges. At the default setting these are the same 38 / 48 / 56 the
 * design file specifies, because the padding is smaller than the difference.
 */
const sizes = StyleSheet.create({
  sm: { minHeight: 38, paddingVertical: 6, paddingHorizontal: space.s3 },
  md: { minHeight: 48, paddingVertical: 8, paddingHorizontal: space.s5 },
  lg: { minHeight: 56, paddingVertical: 8, paddingHorizontal: space.s5 },
});

const labelSizes = StyleSheet.create({
  sm: { fontSize: 11.5, letterSpacing: 0.92 },
  md: { fontSize: 14, letterSpacing: 0.84 },
  lg: { fontSize: 15, letterSpacing: 0.9 },
});

const fills = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface2, borderColor: colors.line },
  ghost: { backgroundColor: 'transparent', borderColor: colors.line },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  text: { backgroundColor: 'transparent' },
});

const presses = StyleSheet.create({
  primary: { backgroundColor: colors.accentPress },
  secondary: { backgroundColor: colors.surface3 },
  ghost: { backgroundColor: colors.surface2 },
  danger: { backgroundColor: colors.dangerSoft },
  text: { opacity: 0.7 },
});

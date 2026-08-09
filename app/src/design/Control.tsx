/**
 * `.tx-control` — the input box.
 *
 * The BOX lives here, never on the <TextInput>. That is what lets one field
 * hold a fused country code, an affix or two inputs and still show a single
 * focus ring around the whole group.
 *
 * Anatomy:  Control ( seg? + input )  — the label and message slots are the
 * caller's, so a field can be labelled by its headline instead of repeating it.
 */

import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius } from './tokens';

// Derived from the props rather than named directly: RN renamed these event
// types in 0.81, and this keeps working whichever names ship.
type FocusEventArg = Parameters<NonNullable<TextInputProps['onFocus']>>[0];
type BlurEventArg = Parameters<NonNullable<TextInputProps['onBlur']>>[0];

export type ControlSize = 'sm' | 'md' | 'lg';

export interface ControlProps extends Omit<TextInputProps, 'style' | 'editable'> {
  size?: ControlSize;
  error?: boolean;
  disabled?: boolean;
  /** Fused left segment — country code, unit, anything that owns an edge. */
  seg?: React.ReactNode;
  onSegPress?: () => void;
  /** Styles the box, not the text. */
  style?: StyleProp<ViewStyle>;
  inputRef?: React.RefObject<TextInput | null>;
}

const HALO = 3;

export default function Control({
  size = 'md',
  error = false,
  disabled = false,
  seg,
  onSegPress,
  style,
  inputRef,
  onFocus,
  onBlur,
  ...input
}: ControlProps) {
  const [focused, setFocused] = useState(false);

  const handleFocus = (e: FocusEventArg) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur = (e: BlurEventArg) => {
    setFocused(false);
    onBlur?.(e);
  };

  const ring = error ? colors.danger : colors.focus;

  return (
    <View style={[styles.wrap, disabled && styles.disabled, style]}>
      {/* The 3px halo, drawn behind the box — RN has no outline. */}
      {focused && !disabled ? (
        <View
          style={[styles.halo, { backgroundColor: error ? colors.dangerSoft : colors.focusHalo }]}
        />
      ) : null}

      <View
        style={[
          styles.control,
          sizes[size],
          focused && !disabled && { backgroundColor: colors.fieldHover },
          error && { borderColor: colors.danger },
        ]}
      >
        {seg ? (
          <Pressable
            onPress={onSegPress}
            disabled={!onSegPress || disabled}
            style={({ pressed }) => [
              styles.seg,
              segMetrics[size],
              pressed && onSegPress ? styles.segPressed : null,
            ]}
          >
            {seg}
          </Pressable>
        ) : null}

        <TextInput
          ref={inputRef}
          editable={!disabled}
          placeholderTextColor={colors.ink3}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={styles.input}
          {...input}
        />
      </View>

      {/* The focus ring sits ON the hairline, as an overlay, so focusing a field
          never nudges its contents by a pixel. */}
      {focused && !disabled ? (
        <View pointerEvents="none" style={[styles.ring, { borderColor: ring }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  disabled: { opacity: 0.45 },
  halo: {
    position: 'absolute',
    top: -HALO,
    left: -HALO,
    right: -HALO,
    bottom: -HALO,
    borderRadius: radius.r2 + HALO,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    borderRadius: radius.r2,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldLine,
    overflow: 'hidden',
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.r2,
    borderWidth: 2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    color: colors.ink,
    fontSize: 16, // 16 is the floor — below it, iOS zooms the page on focus
    fontWeight: '400',
  },
  seg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
    borderRightWidth: 1,
    borderRightColor: colors.fieldLine,
  },
  segPressed: { backgroundColor: colors.surface2 },
});

const sizes = StyleSheet.create({
  sm: { height: 44, paddingHorizontal: 12 },
  md: { height: 52, paddingHorizontal: 14 },
  lg: { height: 60, paddingHorizontal: 16 },
});

/** The segment cancels the box's own padding so it can own the left edge. */
const segMetrics = StyleSheet.create({
  sm: { marginLeft: -12, marginRight: 12, paddingHorizontal: 10 },
  md: { marginLeft: -14, marginRight: 12, paddingHorizontal: 12 },
  lg: { marginLeft: -16, marginRight: 12, paddingHorizontal: 14 },
});

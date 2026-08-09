/**
 * `.tx-otp` — six presentational slots over ONE real input.
 *
 * Never six inputs: a single field is what lets iOS and Android hand the code
 * over from the SMS, what makes paste work, and what a screen reader can read
 * as one value. The slots are decoration drawn on top of it.
 *
 * Grouped 3 + 3 because a six-digit string is unscannable as one run.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, tnum } from './tokens';

/** default · error (wrong code) · expired (dead but kept on screen) · ok (accepted) */
export type OtpStatus = 'default' | 'error' | 'expired' | 'ok';

const LENGTH = 6;
const SLOT_W = 46;
const SLOT_H = 56;
const SLOT_STEP = SLOT_W - 1; // slots overlap by their 1px hairline
const HALO = 3;

export interface OtpInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Fired the moment the sixth digit lands — the screen auto-submits on it. */
  onFilled?: (code: string) => void;
  status?: OtpStatus;
  /** Bump to replay the shake. A new number re-runs it, so repeat failures shake again. */
  shakeNonce?: number;
  editable?: boolean;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  inputRef?: React.RefObject<TextInput | null>;
  style?: StyleProp<ViewStyle>;
}

export default function OtpInput({
  value,
  onChange,
  onFilled,
  status = 'default',
  shakeNonce = 0,
  editable = true,
  autoFocus = false,
  accessibilityLabel,
  inputRef,
  style,
}: OtpInputProps) {
  const ownRef = useRef<TextInput>(null);
  const ref = inputRef ?? ownRef;
  const [focused, setFocused] = React.useState(false);

  const shake = useRef(new Animated.Value(0)).current;
  const caret = useRef(new Animated.Value(1)).current;

  /* --- shake · 420ms, the exact keyframes from the design file --- */
  useEffect(() => {
    if (!shakeNonce) return;
    const leg = (to: number, duration: number) =>
      Animated.timing(shake, { toValue: to, duration, useNativeDriver: true });
    Animated.sequence([
      leg(-7, 63), leg(6, 63), leg(-4, 63), leg(3, 63), leg(-2, 63), leg(0, 105),
    ]).start();
  }, [shakeNonce, shake]);

  /* --- caret · 1s hard blink, no fade --- */
  useEffect(() => {
    if (!focused || !editable) {
      caret.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 0, duration: 0, delay: 500, useNativeDriver: true }),
        Animated.timing(caret, { toValue: 1, duration: 0, delay: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [focused, editable, caret]);

  const handleChange = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, LENGTH);
    if (next === value) return;
    onChange(next);
    if (next.length === LENGTH) onFilled?.(next);
  };

  const activeIndex = focused && editable ? Math.min(value.length, LENGTH - 1) : -1;
  const tone = useMemo(() => tones[status], [status]);

  const group = (offset: number) => {
    const activeInGroup =
      activeIndex >= offset && activeIndex < offset + 3 ? activeIndex - offset : null;
    return (
      <View style={styles.group}>
        {activeInGroup !== null ? (
          <View style={[styles.halo, { left: activeInGroup * SLOT_STEP - HALO }]} />
        ) : null}
        {[0, 1, 2].map((n) => {
          const i = offset + n;
          const digit = value[i];
          const active = i === activeIndex;
          return (
            <View
              key={i}
              style={[
                styles.slot,
                { backgroundColor: tone.fill, borderColor: tone.line },
                n === 0 ? styles.slotFirst : styles.slotJoin,
                n === 2 && styles.slotLast,
                active && styles.slotActive,
              ]}
            >
              {digit ? (
                <Text style={[styles.digit, { color: tone.ink }]}>{digit}</Text>
              ) : active ? (
                <Animated.View style={[styles.caret, { opacity: caret }]} />
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Animated.View
      style={[
        styles.otp,
        status === 'expired' && styles.dim,
        { transform: [{ translateX: shake }] },
        style,
      ]}
    >
      {/* The slots MUST NOT share a native parent with the field below.
          `styles.group` is layout-only, so Fabric flattens it away and the six
          slots become native siblings of the TextInput. Focusing then mutates
          that shared child list — the halo is inserted, and the active slot's
          `zIndex` makes Fabric reorder by remove-then-re-insert. On Android a
          `ViewGroup.removeView()` that touches the focused child calls
          `clearFocus()`, so the field blurred and the keyboard closed the
          instant it opened.

          `collapsable={false}` pins this wrapper as a real ViewGroup, so every
          focus-driven mutation stays inside it and never reaches the field. */}
      <View style={styles.slots} collapsable={false} pointerEvents="none">
        {group(0)}
        <View style={styles.dash} />
        {group(3)}
      </View>

      {/* The real field. Rendered last so it is the topmost view and takes the
          tap itself — the slots above are plain Views with no handler, and on
          iOS a tap on one walks up to a parent that has none either and is
          simply lost.

          It is hidden by painting nothing, NOT by `opacity: 0` and NOT by
          `pointerEvents="none"`: UIKit skips hit-testing any view under
          alpha 0.01, and a field with user interaction off can never become
          first responder — `focus()` would no-op and the keyboard would never
          come up. Transparent text plus a hidden caret leaves it fully
          interactive and completely invisible. */}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        maxLength={LENGTH}
        caretHidden
        contextMenuHidden
        selectTextOnFocus={false}
        selectionColor="transparent"
        underlineColorAndroid="transparent"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        importantForAutofill="yes"
        accessibilityLabel={accessibilityLabel}
        style={styles.realInput}
      />
    </Animated.View>
  );
}

const tones: Record<OtpStatus, { fill: string; line: string; ink: string }> = {
  default: { fill: colors.field, line: colors.fieldLine, ink: colors.ink },
  expired: { fill: colors.field, line: colors.fieldLine, ink: colors.ink },
  error: { fill: colors.field, line: colors.danger, ink: colors.danger },
  ok: { fill: 'rgba(61,220,132,0.10)', line: 'rgba(61,220,132,0.55)', ink: colors.ok },
};

const styles = StyleSheet.create({
  otp: { alignSelf: 'flex-start' },
  slots: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dim: { opacity: 0.5 },
  group: { flexDirection: 'row' },
  slot: {
    width: SLOT_W,
    height: SLOT_H,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  slotFirst: { borderTopLeftRadius: radius.r2, borderBottomLeftRadius: radius.r2 },
  slotJoin: { marginLeft: -1 },
  slotLast: { borderTopRightRadius: radius.r2, borderBottomRightRadius: radius.r2 },
  slotActive: {
    zIndex: 2,
    borderRadius: radius.r2,
    borderWidth: 2,
    borderColor: colors.focus,
  },
  /** The 3px focus halo, drawn behind the slots because RN has no outline. */
  halo: {
    position: 'absolute',
    top: -HALO,
    bottom: -HALO,
    width: SLOT_W + HALO * 2,
    borderRadius: radius.r2 + HALO,
    backgroundColor: colors.focusHalo,
  },
  digit: { fontSize: 22, fontWeight: '700', ...tnum },
  caret: { width: 2, height: 24, borderRadius: 1, backgroundColor: colors.focus },
  dash: { width: 10, height: 2, borderRadius: 1, backgroundColor: colors.lineStrong },
  realInput: {
    ...StyleSheet.absoluteFillObject,
    padding: 0,
    fontSize: 16, // never below 16 — some keyboards resize the field otherwise
    color: 'transparent',
    backgroundColor: 'transparent',
  },
});

/**
 * `.tx-toast` — a short, non-blocking explanation.
 *
 * Its job in this system is to make a refusal legible: whenever a control is
 * disabled by a rule the trainer can't see (a cap, a lock), the toast says
 * which rule and what to do instead. A tap that silently does nothing is
 * indistinguishable from a broken button.
 *
 * It is a live region, so it is announced without stealing focus.
 *
 * It rides above the soft keyboard. Every screen parks its toast at the bottom
 * edge, and Expo SDK 54 draws Android edge-to-edge, where the window does not
 * resize for the keyboard — left alone, the message appears exactly underneath
 * the keypad ("week 1 copied into week 3" after typing in a sheet, say). A
 * transform rather than a margin: the lift must not reflow the screen behind it.
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from './tokens';
import useKeyboardHeight from './useKeyboardHeight';
import type { IconProps } from './icons';

export interface ToastProps {
  children: React.ReactNode;
  icon?: React.ComponentType<IconProps>;
  /** Optional trailing action — uppercase accent lettering, e.g. UNDO. */
  action?: { label: string; onPress: () => void };
  /**
   * Milliseconds before it takes itself away, via `onDismiss`.
   *
   * Opt-in, because a toast that explains a *refusal* should sit there until it
   * has been read — that is the job this component was built for. A toast that
   * confirms something the trainer just did is the opposite: it is old news the
   * moment they look at it, and leaving it parked over the bottom of a ledger
   * makes them tap to clear their own screen.
   */
  duration?: number;
  /** Required by `duration`; also fires when the timer is what dismissed it. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function Toast({
  children,
  icon: Icon,
  action,
  duration,
  onDismiss,
  style,
}: ToastProps) {
  const keyboard = useKeyboardHeight();

  useEffect(() => {
    if (!duration || !onDismiss) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
    // `children` is in the list on purpose: a second notice arriving while the
    // first is still up has to restart the clock, or it inherits the remainder
    // of a timer it never started and vanishes almost immediately.
  }, [duration, onDismiss, children]);

  return (
    <View
      style={[styles.toast, style, keyboard > 0 && { transform: [{ translateY: -keyboard }] }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      {Icon ? <Icon size={18} color={colors.ink} strokeWidth={2.2} /> : null}
      <Text style={styles.text}>{children}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingVertical: 13,
    paddingHorizontal: space.s4,
    borderRadius: radius.r2,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.line,
  },
  text: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.ink },
  action: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.accentText,
  },
});

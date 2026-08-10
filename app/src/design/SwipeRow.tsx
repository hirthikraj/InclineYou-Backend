/**
 * `.tx-swipe` — one action, revealed by dragging the row left.
 *
 * One, not two. A 76px action already eats a fifth of a 390pt row; a second
 * would hide the avatar and most of the name, and NN/g is clear that an action
 * nobody can see is an action nobody uses. So the swipe carries the obvious
 * verb for that row's state and the long-press menu carries the rest.
 *
 * A full swipe commits, which is the one gesture that has to be forgiving: it
 * only fires past 60% of the row, and anything short of that springs back.
 */

import React, { useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, maxFontScale, radius } from './tokens';
import type { IconProps } from './icons';
import type { RowSeverity } from './Row';

/** The revealed width. Matches the design file's 76px. */
const ACTION_W = 76;
/** Past this share of the row's width, letting go commits rather than settles. */
const COMMIT = 0.6;

export type SwipeTone = 'pay' | 'nudge' | 'del';

export interface SwipeRowProps {
  action: { label: string; icon?: React.ComponentType<IconProps>; tone?: SwipeTone };
  onAction: () => void;
  /** Painted as a 2px spine on the leading edge, as on `Row`. */
  severity?: RowSeverity;
  /** Suspends the gesture — selection mode owns the row instead. */
  disabled?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<SwipeTone, { bg: string; fg: string }> = {
  pay: { bg: colors.okFill, fg: colors.okFillInk },
  nudge: { bg: colors.info, fg: colors.inkInverse },
  del: { bg: colors.dangerFill, fg: colors.dangerFillInk },
};

export default function SwipeRow({
  action,
  onAction,
  severity,
  disabled = false,
  children,
  style,
}: SwipeRowProps) {
  const x = useRef(new Animated.Value(0)).current;
  const at = useRef(0);
  const width = useRef(0);
  const tone = TONES[action.tone ?? 'pay'];

  const settle = (to: number) => {
    at.current = to;
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
  };

  const fire = () => {
    settle(0);
    onAction();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Leftward and decisively horizontal: the list scrolls vertically and a
        // right-drag belongs to the system back gesture (§ 04).
        onMoveShouldSetPanResponder: (_, g) =>
          !disabled && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
        onPanResponderMove: (_, g) => {
          const next = Math.max(-(width.current || 320), Math.min(0, at.current + g.dx));
          x.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const travelled = Math.abs(at.current + g.dx);
          if (travelled > (width.current || 320) * COMMIT) fire();
          else if (travelled > ACTION_W / 2) settle(-ACTION_W);
          else settle(0);
        },
        onPanResponderTerminate: () => settle(0),
      }),
    // `fire` and `settle` close over refs only, so the responder never needs
    // rebuilding — but `disabled` gates it and must be current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled],
  );

  return (
    <View
      style={[styles.wrap, style]}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
      }}
    >
      <View style={[styles.actions, { backgroundColor: tone.bg }]}>
        <Pressable
          onPress={fire}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={styles.action}
        >
          {action.icon ? <action.icon size={19} color={tone.fg} strokeWidth={1.8} /> : null}
          <Text
            style={[styles.actionLabel, { color: tone.fg }]}
            maxFontSizeMultiplier={maxFontScale.micro}
          >
            {action.label}
          </Text>
        </Pressable>
      </View>

      {severity ? (
        <View
          style={[
            styles.severity,
            { backgroundColor: severity === 'critical' ? colors.danger : colors.warn },
          ]}
          pointerEvents="none"
        />
      ) : null}

      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', borderRadius: radius.r2, overflow: 'hidden' },
  actions: { ...StyleSheet.absoluteFillObject, alignItems: 'flex-end' },
  action: { width: ACTION_W, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  // Drawn by the wrapper, not the row: the row slides and the spine must not.
  severity: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, zIndex: 2 },
});

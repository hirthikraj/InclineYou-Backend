/**
 * `.tx-faq` — questions that expand in place.
 *
 * **One open at a time**, which is the tap map's rule and not an implementation
 * detail: six open answers is a wall of text, and the reader has lost the list
 * they were scanning. Opening the second closes the first.
 *
 * The chevron rotates rather than swapping glyph. A rotation carries the "this
 * is the same control, in the other state" meaning that two different arrows do
 * not, and it costs one transform.
 *
 * The answer is not animated open. `LayoutAnimation` on Android needs an opt-in
 * flag that has to be set before any layout happens, and a height animation on
 * text whose height is unknown until it has been measured either flashes or
 * needs two passes. A rotating chevron and an answer that is simply there reads
 * as instant rather than as broken.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, curve, motion, radius, space } from './tokens';
import { IconChevronDown } from './icons';
import useReduceMotion from './useReduceMotion';

export interface FaqEntry {
  q: string;
  /** Plain text. `**bold**` spans are rendered — see `emphasise` below. */
  a: string;
}

export interface FaqProps {
  entries: FaqEntry[];
  /** Which one starts open. The first question is usually the one that earns it. */
  initial?: number | null;
  style?: StyleProp<ViewStyle>;
}

export default function Faq({ entries, initial = null, style }: FaqProps) {
  const [open, setOpen] = useState<number | null>(initial);

  return (
    <View style={[styles.card, style]}>
      {entries.map((entry, i) => {
        const isOpen = open === i;
        const last = i === entries.length - 1;
        return (
          <View key={i}>
            <Pressable
              onPress={() => setOpen(isOpen ? null : i)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={({ pressed }) => [
                styles.q,
                // The divider goes under the question only when it is closed —
                // when it is open the answer owns the bottom edge.
                !isOpen && !last && styles.divider,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.qText}>{entry.q}</Text>
              <Chevron open={isOpen} />
            </Pressable>

            {isOpen ? (
              <View style={[styles.a, !last && styles.divider]}>
                <Text style={styles.aText}>{emphasise(entry.a)}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Chevron({ open }: { open: boolean }) {
  const reduced = useReduceMotion();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    const anim = Animated.timing(turn, {
      toValue: open ? 1 : 0,
      duration: reduced ? 0 : motion.fast,
      easing: Easing.bezier(...curve.standard),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [open, reduced, turn]);

  return (
    <Animated.View
      style={{
        transform: [
          { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) },
        ],
      }}
    >
      <IconChevronDown size={18} color={open ? colors.accentText : colors.ink3} />
    </Animated.View>
  );
}

/**
 * Renders `**bold**` spans inside an answer.
 *
 * The alternative was passing React nodes in from every call site, which puts
 * markup in the copy and makes an answer impossible to hold in one string. The
 * split is on the delimiter, so odd-numbered pieces are the emphasised ones.
 */
function emphasise(text: string): React.ReactNode {
  const parts = text.split('**');
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={styles.strong}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },

  q: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    minHeight: 54,
    paddingVertical: space.s3,
    paddingHorizontal: space.s3,
  },
  pressed: { backgroundColor: colors.surface2 },
  qText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.14,
    color: colors.ink,
  },

  a: { paddingHorizontal: space.s3, paddingBottom: space.s4 },
  aText: { fontSize: 13, lineHeight: 21, color: colors.ink2 },
  strong: { color: colors.ink, fontWeight: '700' },
});

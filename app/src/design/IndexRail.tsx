/**
 * `.tx-index` — the A–Z scrub rail.
 *
 * It only renders when the list is actually sorted A–Z (§ 07): an alphabet
 * down the side of a list ordered by urgency points at nothing, and tapping it
 * would scroll somewhere arbitrary.
 *
 * The bubble is not decoration. The letters are 9px because twenty-odd of them
 * have to fit a phone's height, and 9px under a thumb is unreadable — so the
 * letter you are on is repeated at 24px beside the rail, clear of the finger.
 */

import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space, tnum } from './tokens';

export interface IndexRailProps {
  letters: string[];
  /** Fires as the finger crosses into a new letter, and once on tap. */
  onScrub: (letter: string) => void;
  style?: StyleProp<ViewStyle>;
}

export default function IndexRail({ letters, onScrub, style }: IndexRailProps) {
  const [active, setActive] = useState<string | null>(null);
  const height = useRef(0);
  const last = useRef<string | null>(null);

  if (letters.length === 0) return null;

  const pick = (y: number) => {
    if (height.current <= 0) return;
    const i = Math.max(
      0,
      Math.min(letters.length - 1, Math.floor((y / height.current) * letters.length)),
    );
    const letter = letters[i];
    setActive(letter);
    // One callback per letter crossed, not one per frame — the list is
    // scrolling and the caller may be doing real work in here.
    if (letter !== last.current) {
      last.current = letter;
      onScrub(letter);
    }
  };

  const release = () => {
    last.current = null;
    setActive(null);
  };

  return (
    <View
      style={[styles.rail, style]}
      accessibilityLabel="Jump to letter"
      onLayout={(e: LayoutChangeEvent) => {
        height.current = e.nativeEvent.layout.height;
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => pick(e.nativeEvent.locationY)}
      onResponderMove={(e) => pick(e.nativeEvent.locationY)}
      onResponderRelease={release}
      onResponderTerminate={release}
    >
      {letters.map((letter) => (
        <View key={letter} style={styles.slot}>
          <Text style={[styles.letter, letter === active && styles.letterOn]}>{letter}</Text>
          {letter === active ? (
            <View style={styles.bubble} pointerEvents="none">
              <Text style={styles.bubbleText}>{letter}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: 2,
    top: 0,
    bottom: 0,
    zIndex: 4,
    width: 22,
    paddingVertical: space.s2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  slot: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 9, fontWeight: '800', lineHeight: 11, color: colors.ink3, ...tnum },
  letterOn: { color: colors.accentText },
  bubble: {
    position: 'absolute',
    right: 26,
    width: 54,
    height: 54,
    borderRadius: radius.r3,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
  },
  bubbleText: { fontSize: 24, fontWeight: '800', color: colors.accentInk },
});

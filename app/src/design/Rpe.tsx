/**
 * `.tx-rpe` — how hard that set was, and the two nobody else asks for.
 *
 * RPE and a note are the two things the trainer knows and the client's own app
 * never records. They are the reason a log written by a coach is worth more than
 * a log written by a lifter, and they are one long press away rather than in the
 * row, because a five-column table is already full.
 *
 * ── Five buttons for nine values ──────────────────────────────────────────
 *
 * 6 to 10 in half steps is nine values. Nine targets across 360dp is 33px each,
 * which is a lie about the size of a thumb. So: five whole steps at about 51dp,
 * plus one half-step toggle. Same nine values, twice the target, and the eye
 * lands on 7-8-9-10 the way a coach thinks.
 *
 * The scale itself never draws "8.5". The sentence underneath does, because RPE
 * is a judgement rather than a measurement and the control should say out loud
 * what the number it just took actually means.
 *
 * Tapping the selected value clears it. RPE is optional and stays optional.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tap, tnum } from './tokens';

const WHOLE = [6, 7, 8, 9, 10] as const;

/** What each value means, in the words a coach uses on the floor. */
const MEANING: Record<number, string> = {
  6: 'comfortable — four or more reps left in the tank.',
  6.5: 'easy still — three or four reps left.',
  7: 'working — three reps left in the tank.',
  7.5: 'getting real — two or three reps left.',
  8: 'hard — two reps left in the tank.',
  8.5: 'one, maybe two reps left in the tank.',
  9: 'one rep left, and she knew it.',
  9.5: 'half a rep left. Nothing in reserve.',
  10: 'everything she had. Nothing left.',
};

export interface RpeProps {
  /** 6…10 in half steps, or null for not said. */
  value: number | null;
  onChange: (next: number | null) => void;
  style?: StyleProp<ViewStyle>;
}

export default function Rpe({ value, onChange, style }: RpeProps) {
  const whole = value === null ? null : Math.floor(value);
  const half = value !== null && value % 1 !== 0;

  const pick = (n: number) => {
    // Tapping the value that is already chosen clears it, half step and all.
    if (whole === n && !half) onChange(null);
    else onChange(half ? n + 0.5 : n);
  };

  return (
    <View style={style}>
      <View style={styles.rpe}>
        <View style={styles.scale}>
          {WHOLE.map((n) => {
            const on = whole === n;
            return (
              <Pressable
                key={n}
                onPress={() => pick(n)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`R P E ${n}`}
                style={[styles.step, on && styles.stepOn]}
              >
                <Text style={[styles.stepLabel, on && styles.stepLabelOn]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => {
            if (value === null) return;
            onChange(half ? Math.floor(value) : Math.floor(value) + 0.5);
          }}
          disabled={value === null}
          accessibilityRole="switch"
          accessibilityState={{ checked: half, disabled: value === null }}
          accessibilityLabel="Half step"
          style={[styles.half, half && styles.halfOn, value === null && styles.halfOff]}
        >
          <Text style={[styles.halfLabel, half && styles.halfLabelOn]}>+½</Text>
        </Pressable>
      </View>

      <Text style={styles.why}>
        {value === null ? (
          'Not said. RPE is optional and stays optional.'
        ) : (
          <>
            <Text style={styles.whyValue}>RPE {value}</Text> — {MEANING[value] ?? 'how hard it was.'}
          </>
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rpe: { flexDirection: 'row', gap: space.s2, alignItems: 'stretch' },

  scale: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    gap: 3,
    height: tap.gym,
    padding: 3,
    borderRadius: radius.r2 + 3,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldLine,
  },
  step: { flex: 1, minWidth: 0, borderRadius: radius.r2, alignItems: 'center', justifyContent: 'center' },
  stepOn: { backgroundColor: colors.accent },
  stepLabel: { fontSize: 16, fontWeight: '700', color: colors.ink2, ...tnum },
  stepLabelOn: { color: colors.accentInk, fontWeight: '800' },

  half: {
    width: tap.gym,
    borderRadius: radius.r2,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halfOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine },
  halfOff: { opacity: 0.5 },
  halfLabel: { fontSize: 15, fontWeight: '700', color: colors.ink3 },
  halfLabelOn: { color: colors.accentText },

  why: { marginTop: space.s2, fontSize: 12.5, lineHeight: 18, color: colors.ink3 },
  whyValue: { color: colors.ink2, fontWeight: '600', ...tnum },
});

/**
 * `.tx-coach` — the client's trainer, as the primary object on a screen.
 *
 * One of the two components the client role adds, and it exists because of one
 * frame: "No plan yet". On the trainer's side a person is a row in a list of 27;
 * on the client's side there is exactly one other person in the whole product,
 * and when something is missing it is his job to fix, not theirs. A row would
 * say the opposite.
 *
 * The actions are two: something that reaches him, and something narrower beside
 * it. Every message action in the client app opens a pre-filled WhatsApp draft
 * and sends nothing silently — WhatsApp already won in this market, and a second
 * inbox is a second place to miss a message. The narrow one is a phone call, the
 * single action in the app that leaves the phone without drafting first.
 *
 * What is never here: his number as text, and his UPI ID. His profile hides both
 * by rule.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Avatar from './Avatar';
import Button from './Button';
import { IconMessage, IconPhone } from './icons';
import { colors, radius, space } from './tokens';

export interface CoachProps {
  /** "Your trainer", "You pay" — what he is on this screen. */
  label: string;
  name: string;
  /** The gym, and anything else true about the arrangement. */
  detail?: string | null;
  /** The wide action. Always a draft, never a send. */
  action?: { label: string; onPress: () => void };
  /** The 56px one. Omitted when there is no number on this phone. */
  onCall?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function Coach({ label, name, detail, action, onCall, style }: CoachProps) {
  return (
    <View style={[styles.coach, style]}>
      <View style={styles.id}>
        <Avatar name={name} size="lg" />
        <View style={styles.text}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {detail ? (
            <Text style={styles.detail} numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
        </View>
      </View>

      {action || onCall ? (
        <View style={styles.acts}>
          {action ? (
            <Button
              label={action.label}
              icon={IconMessage}
              variant="secondary"
              onPress={action.onPress}
              style={styles.wide}
            />
          ) : null}
          {onCall ? (
            <Button label="" icon={IconPhone} variant="ghost" onPress={onCall} style={styles.narrow} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  coach: {
    padding: space.cardPad,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  id: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  text: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  name: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 2 },
  detail: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: 2 },

  acts: { flexDirection: 'row', gap: space.s2, marginTop: space.s4 },
  wide: { flex: 1 },
  narrow: { flexGrow: 0, flexShrink: 0, flexBasis: 56, paddingHorizontal: 0 },
});

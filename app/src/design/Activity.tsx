/**
 * `.tx-activity` — what has happened, written as a sentence.
 *
 * "Ananya Iyer finished Push A", not a table row with a Client column and an
 * Event column. The meta line underneath carries the numbers, so the sentence
 * stays a sentence and the figures stay scannable.
 *
 * Every row goes somewhere: § 04 routes it to the thing that happened — the
 * logged workout, the payment, the metric — never to the client's profile in
 * general.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, tnum } from './tokens';

export interface ActivityProps {
  /** Avatar or icon. */
  lead?: React.ReactNode;
  /** Bolded lead of the sentence. */
  subject?: string;
  /** The verb and object — "finished Push A". */
  body: string;
  /** Numbers and the time. */
  meta?: string;
  /** A tag: PR, Paid. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}

export default function Activity({
  lead,
  subject,
  body,
  meta,
  trailing,
  onPress,
  last = false,
}: ActivityProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${subject ? `${subject} ` : ''}${body}${meta ? `. ${meta}` : ''}`}
      style={({ pressed }) => [styles.row, last && styles.last, pressed && styles.pressed]}
    >
      {lead}
      <View style={styles.main}>
        <Text style={styles.text}>
          {subject ? <Text style={styles.subject}>{subject}</Text> : null}
          {subject ? ' ' : null}
          {body}
        </Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  last: { borderBottomWidth: 0 },
  pressed: { opacity: 0.7 },
  main: { flex: 1, minWidth: 0 },
  text: { fontSize: 14, lineHeight: 20, color: colors.ink2 },
  subject: { color: colors.ink, fontWeight: '600' },
  meta: { fontSize: 11.5, color: colors.ink3, marginTop: 4, ...tnum },
});

/**
 * `.tx-notif` — one line of the notification centre.
 *
 * Unread is carried twice, by the dot on the left and by full-strength ink;
 * read rows drop to 62%. Two signals rather than one because the dot alone is
 * 8px and the opacity alone is not a difference anyone notices in daylight on
 * a gym floor.
 *
 * The sentence is the notification. There is no title line — a title plus a
 * body for "Farhan Qureshi paid ₹6,000 by UPI" is one fact spread over two.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, space } from './tokens';

export interface NotifProps {
  /** Bolded lead — usually the client. */
  subject?: string;
  /** The rest of the sentence. */
  body: string;
  /** Already relative — "8 minutes ago", "Yesterday". */
  time: string;
  read?: boolean;
  onPress?: () => void;
}

export default function Notif({ subject, body, time, read = false, onPress }: NotifProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${read ? '' : 'Unread. '}${subject ? `${subject} ` : ''}${body}. ${time}`}
      style={({ pressed }) => [styles.notif, read && styles.notifRead, pressed && styles.pressed]}
    >
      <View style={[styles.dot, read && styles.dotRead]} />
      <View style={styles.main}>
        <Text style={styles.text}>
          {subject ? <Text style={styles.subject}>{subject}</Text> : null}
          {subject ? ' ' : null}
          {body}
        </Text>
        <Text style={styles.time}>{time}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notif: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: space.inset,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  notifRead: { opacity: 0.62 },
  pressed: { backgroundColor: colors.surface },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    flexShrink: 0,
    backgroundColor: colors.accent,
  },
  dotRead: { backgroundColor: 'transparent' },

  main: { flex: 1, minWidth: 0 },
  text: { fontSize: 14.5, lineHeight: 20, color: colors.ink },
  subject: { fontWeight: '700' },
  time: { fontSize: 12, color: colors.ink3, marginTop: 5 },
});

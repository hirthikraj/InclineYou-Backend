/**
 * `.tx-clienthead` — the identity block at the top of a client's file.
 *
 * It exists because the app bar cannot carry this. A 19px title slot holds a
 * name, but not a name plus floor/remote plus status plus the phone number plus
 * the two verbs a trainer opens the file to use. So the bar keeps only the back
 * arrow and the parent context, and the name is drawn once — here, at h2 weight.
 *
 * **Two verbs, never three.** At 360dp a third button pushes the first below its
 * own label's width and the row starts truncating uppercase text.
 *
 * A paused client's file stays fully readable: dimming it would hide the history
 * that is the entire reason paused exists rather than archived. Only the name
 * steps down a rung, so the state is visible without the screen going grey.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Avatar from './Avatar';
import { colors, space, tnum, type } from './tokens';

export interface ClientHeadProps {
  name: string;
  /** The tag pair — mode and status. Laid out by the caller, like the design. */
  tags?: React.ReactNode;
  /** Shown after the tags, and truncated before they are. */
  phone?: string;
  /** A green tick on the avatar. 5c only: this client was just saved. */
  tick?: boolean;
  paused?: boolean;
  /** Exactly two, or none. The frame owns the ratio; this owns the box. */
  actions?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function ClientHead({
  name,
  tags,
  phone,
  tick = false,
  paused = false,
  actions,
  style,
}: ClientHeadProps) {
  return (
    <View style={[styles.head, style]}>
      <View style={styles.id}>
        <View>
          <Avatar name={name} size="lg" />
          {tick ? (
            <View style={styles.tick}>
              <View style={styles.tickMark} />
            </View>
          ) : null}
        </View>
        <View style={styles.main}>
          <Text numberOfLines={1} style={[styles.name, paused && styles.namePaused]}>
            {name}
          </Text>
          {tags || phone ? (
            <View style={styles.meta}>
              {tags}
              {phone ? (
                <Text numberOfLines={1} style={styles.phone}>
                  {phone}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      {actions ? <View style={styles.acts}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: space.s1, paddingBottom: space.s4 },
  id: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  main: { flex: 1, minWidth: 0 },
  name: { ...type.h2, fontWeight: '800', letterSpacing: -0.53, color: colors.ink },
  namePaused: { color: colors.ink2 },

  meta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  phone: { fontSize: 12.5, color: colors.ink3, flexShrink: 1, ...tnum },

  acts: { flexDirection: 'row', gap: space.s2, marginTop: space.s3 },

  tick: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.okFill,
    borderWidth: 2,
    borderColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Drawn rather than iconised: a 8px check glyph renders as a smudge, where
  // two rotated rules stay crisp at any density.
  tickMark: {
    width: 7,
    height: 4,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.okFillInk,
    transform: [{ rotate: '-45deg' }],
    marginTop: -2,
  },
});

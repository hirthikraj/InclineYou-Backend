/**
 * The agenda, before the day has been read.
 *
 * Mirrors the agenda rather than a generic list: rows sitting off a 52px time
 * gutter, because that gutter is the most distinctive thing about this screen
 * and a placeholder without it would slide sideways on arrival.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, radius, space } from '../../../design';

/** The gutter the whole agenda is indented by. Same constant as `Agenda`. */
const GUTTER = 52;
const ROWS = 4;

/**
 * Just the agenda.
 *
 * The day strip and the view switcher are real controls that work before the
 * day has loaded — you can already swipe to Thursday — so they are never
 * replaced by a placeholder. Only the agenda below them is unknown.
 */
export function AgendaSkeleton() {
  return (
    <View accessibilityLabel="Loading your diary">
      <View style={styles.agenda}>
        {Array.from({ length: ROWS }, (_, i) => (
          <View key={i} style={styles.item}>
            <View style={styles.gutter}>
              <Skeleton width={30} height={11} />
            </View>
            <View style={styles.body}>
              {/* Alternating heights: a session card and the shorter gap bar
                  between them, which is the real rhythm of this screen. */}
              <Skeleton height={i % 2 === 0 ? 64 : 46} round={radius.r2} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  agenda: { paddingLeft: GUTTER, marginTop: space.s5 },
  item: { flexDirection: 'row', marginBottom: space.s2 },
  gutter: { position: 'absolute', left: -GUTTER, width: 44, alignItems: 'flex-end', paddingTop: 3 },
  body: { flex: 1, minWidth: 0 },
});

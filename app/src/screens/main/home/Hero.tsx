/**
 * The top of the deck — the one thing on the screen that changes shape.
 *
 * Four states, one slot. The design file is emphatic that a running session
 * does not open a different screen: the hero adapts and everything under it
 * re-keys. A trainer mid-set should never have to work out which screen
 * they're on.
 *
 *   next      the session that hasn't happened yet, and the two things you do
 *             about it — start it, or move it
 *   running   the clock, the lift, and the set count
 *   done      the day is over, so the card rolls to tomorrow and goes quiet:
 *             no accent, no pulse, nothing that says act now
 *   first     no clients at all, so the card is the one job that matters
 *
 * The 62px display figure is the same in every state. It is the only element
 * on the screen readable at arm's length on a gym floor, which is the whole
 * reason it is that size.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  IconPlay,
  IconPlus,
  Pulse,
  colors,
  formatClock,
  space,
  tnum,
} from '../../../design';
import type { DeckSession, RunningSession } from '../../../home/deck';

/* --------------------------------------------------------------- next / due */

export function NextHero({
  session,
  when,
  onOpen,
  onStart,
  onMove,
  starting,
}: {
  session: DeckSession;
  when: string;
  onOpen: () => void;
  onStart: () => void;
  onMove: () => void;
  starting?: boolean;
}) {
  return (
    <Card live>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Next session, ${session.clientName}, ${session.time} ${session.meridiem}, ${when}`}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Eyebrow live>Next session · {when}</Eyebrow>
        <Clock value={session.time} suffix={session.meridiem} />
        <Text style={styles.name}>{session.clientName}</Text>
        <Text style={styles.detail}>
          {session.detail} · {session.mode === 'remote' ? 'Remote' : 'Floor'}
        </Text>
      </Pressable>
      <View style={styles.actions}>
        <Button
          label="Start"
          icon={IconPlay}
          loading={starting}
          onPress={onStart}
          style={styles.primary}
        />
        <Button label="Move" variant="ghost" onPress={onMove} style={styles.secondary} />
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ running */

export function RunningHero({
  running,
  elapsedMs,
  title,
  progress,
  onLogSet,
  onEnd,
}: {
  running: RunningSession;
  elapsedMs: number;
  /** The current lift, once the exercise row has been resolved. */
  title: string;
  /** "Set 3 of 4 · 8 of 14 sets done" — falls back to the set count alone. */
  progress: string;
  onLogSet: () => void;
  onEnd: () => void;
}) {
  return (
    <Card live>
      <Eyebrow live>Session running · {running.clientName}</Eyebrow>
      <Clock value={formatClock(elapsedMs / 1000)} />
      <Text style={styles.name}>{title}</Text>
      <Text style={styles.detail}>{progress}</Text>
      <View style={styles.actions}>
        <Button label="Log set" icon={IconPlay} onPress={onLogSet} style={styles.primary} />
        <Button label="End" variant="ghost" onPress={onEnd} style={styles.secondary} />
      </View>
    </Card>
  );
}

/* --------------------------------------------------------------- day is done */

export function TomorrowHero({
  session,
  count,
  onOpen,
}: {
  session: DeckSession;
  count: number;
  onOpen: () => void;
}) {
  return (
    <Card>
      <Eyebrow>Tomorrow · {weekdayOf(session.at)}</Eyebrow>
      <Clock value={session.time} suffix={session.meridiem} />
      <Text style={styles.name}>{session.clientName}</Text>
      <Text style={styles.detail}>
        {session.detail} · {count} session{count === 1 ? '' : 's'} tomorrow
      </Text>
      <Button label="See tomorrow" variant="secondary" block onPress={onOpen} style={styles.single} />
    </Card>
  );
}

/** Nothing today and nothing tomorrow either — a rest day is not an error. */
export function ClearHero({ onBook }: { onBook: () => void }) {
  return (
    <Card>
      <Eyebrow>Nothing booked</Eyebrow>
      <Text style={styles.clearTitle}>No sessions today</Text>
      <Text style={styles.detail}>Nothing tomorrow either. Book one when you're ready.</Text>
      <Button label="Book a session" variant="secondary" block onPress={onBook} style={styles.single} />
    </Card>
  );
}

/* ---------------------------------------------------------------- first run */

export function FirstRunHero({ onAdd }: { onAdd: () => void }) {
  return (
    <Card live>
      <Eyebrow live>No clients yet</Eyebrow>
      <Text style={styles.firstTitle}>Add your first client</Text>
      <Text style={styles.detail}>Name and number is all it takes</Text>
      <Button label="Add a client" icon={IconPlus} block onPress={onAdd} style={styles.single} />
    </Card>
  );
}

/* ------------------------------------------------------------------- pieces */

function Eyebrow({ children, live = false }: { children: React.ReactNode; live?: boolean }) {
  return (
    <View style={styles.eyebrow}>
      {live ? <Pulse /> : null}
      <Text style={[styles.eyebrowText, live && styles.eyebrowLive]}>{children}</Text>
    </View>
  );
}

function Clock({ value, suffix }: { value: string; suffix?: string }) {
  return (
    <View style={styles.clockRow}>
      {/* `adjustsFontSizeToFit` only does anything when the text has a bounded
          width to fit into, so the shrink below is what makes it work at all.
          Without it a long elapsed time — 1:04:22 in a late session — takes its
          natural 62px width and pushes the meridiem off the card. */}
      <Text style={styles.clock} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
      {suffix ? <Text style={styles.meridiem}>{suffix}</Text> : null}
    </View>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function weekdayOf(at: number): string {
  return WEEKDAYS[new Date(at).getDay()];
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },

  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  eyebrowText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    flex: 1,
  },
  eyebrowLive: { color: colors.accentText },

  clockRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12, marginBottom: 2 },
  clock: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 62,
    fontWeight: '800',
    letterSpacing: -2.79,
    lineHeight: 62,
    color: colors.ink,
    ...tnum,
  },
  meridiem: {
    flexShrink: 0,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.76,
    color: colors.ink3,
    marginLeft: 8,
  },

  name: { fontSize: 21, fontWeight: '700', letterSpacing: -0.42, color: colors.ink },
  clearTitle: { fontSize: 21, fontWeight: '700', letterSpacing: -0.42, color: colors.ink, marginTop: 12 },
  firstTitle: { fontSize: 21, fontWeight: '700', letterSpacing: -0.42, color: colors.ink, marginTop: 12 },
  detail: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: 7,
  },

  actions: { flexDirection: 'row', gap: space.s2, marginTop: space.s4 },
  primary: { flex: 1 },
  secondary: { width: 106 },
  single: { marginTop: space.s4 },
});

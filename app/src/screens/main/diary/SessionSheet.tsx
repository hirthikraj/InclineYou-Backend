/**
 * 4a · A session · 4b · Move · 4c · She didn't train.
 *
 * Three panes in one sheet, because they are one decision tree and pushing a
 * screen between them would lose the subject.
 *
 * Start is the primary on the first pane: on the day of, at the time of, that
 * is the only thing anybody wants. Everything else is one row deeper.
 *
 * The third pane is the highest-stakes tap in the app. Each option states its
 * effect on the pack *inside the option*, not in a confirmation afterwards, and
 * whatever is chosen is undoable for 24 hours.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  IconChevron,
  IconDots,
  IconLayers,
  IconMessage,
  IconMove,
  IconPlay,
  IconShield,
  IconWallet,
  List,
  Radio,
  Row,
  Sheet,
  Tag,
  colors,
  space,
} from '../../../design';
import { MODE_LABELS } from '../../../home/mode';
import { clockParts } from '../../../home/time';
import { suggestMoves, packRemaining, type DiaryInput, type DiaryItem } from '../../../diary/diary';

type Pane = 'session' | 'move' | 'outcome';
export type Outcome = 'cancelled_client' | 'no_show' | 'cancelled_trainer';

export default function SessionSheet({
  visible,
  item,
  input,
  now,
  onStart,
  onMove,
  onOutcome,
  onMessage,
  onOpenProgram,
  onOpenPack,
  onClose,
}: {
  visible: boolean;
  item: DiaryItem | null;
  input: DiaryInput;
  now: number;
  onStart: (item: DiaryItem) => void;
  onMove: (item: DiaryItem, at: number) => void;
  onOutcome: (item: DiaryItem, outcome: Outcome) => void;
  onMessage: (item: DiaryItem) => void;
  onOpenProgram: (item: DiaryItem) => void;
  onOpenPack: (item: DiaryItem) => void;
  onClose: () => void;
}) {
  const [pane, setPane] = useState<Pane>('session');
  const [outcome, setOutcome] = useState<Outcome>('cancelled_client');

  const [seed, setSeed] = useState(visible);
  if (visible !== seed) {
    setSeed(visible);
    if (visible) {
      setPane('session');
      setOutcome('cancelled_client');
    }
  }

  const session = useMemo(
    () =>
      item
        ? input.sessions.find((s) => s.id === item.id) ?? null
        : null,
    [input.sessions, item],
  );

  const suggestions = useMemo(
    () => (session ? suggestMoves(input, session, now) : []),
    [input, session, now],
  );

  if (!item) return null;

  const remaining = packRemaining(input, item.clientId);
  const end = clockParts(item.endsAt);
  const start = clockParts(item.at);
  const firstName = item.clientName.split(/\s+/)[0] ?? item.clientName;

  /* ------------------------------------------------------------------ move */

  if (pane === 'move') {
    return (
      <Sheet visible={visible} onClose={onClose} title={`Move ${item.clientName}`}>
        <Text style={styles.sub}>
          From {start.time} {start.meridiem}
        </Text>
        <Text style={styles.label}>Free slots she usually takes</Text>
        <List style={styles.list}>
          {suggestions.length === 0 ? (
            <Row grouped minHeight={56} title="Nothing free nearby" subtitle="Pick a date instead" />
          ) : (
            suggestions.map((s) => (
              <Row
                key={s.at}
                grouped
                minHeight={56}
                title={s.dayLabel}
                subtitle={s.why}
                leading={
                  <View style={styles.time}>
                    <Text style={styles.timeValue}>{s.time}</Text>
                    <Text style={styles.timeMeridiem}>{s.meridiem}</Text>
                  </View>
                }
                onPress={() => onMove(item, s.at)}
              />
            ))
          )}
        </List>
        <Callout icon={IconMessage} style={styles.note}>
          {firstName} gets one WhatsApp with the new time.{' '}
          <CalloutStrong>Nothing is deducted for a move.</CalloutStrong>
        </Callout>
        <Button
          label="Back"
          variant="ghost"
          block
          style={styles.cta}
          onPress={() => setPane('session')}
        />
      </Sheet>
    );
  }

  /* --------------------------------------------------------------- outcome */

  if (pane === 'outcome') {
    const next = remaining === null ? null : Math.max(0, remaining - 1);
    return (
      <Sheet visible={visible} onClose={onClose} title={`${firstName} didn't train`}>
        <Text style={styles.sub}>
          {start.time} {start.meridiem} · this decides {remaining === null ? 'nothing on a pack' : 'her pack'}
        </Text>

        <View style={styles.stack}>
          <Row
            title="Cancelled — she told me"
            subtitle={
              remaining === null
                ? 'No pack to touch. Slot opens for someone else.'
                : `Pack stays at ${remaining}. Slot opens for someone else.`
            }
            minHeight={72}
            leading={<Radio checked={outcome === 'cancelled_client'} />}
            onPress={() => setOutcome('cancelled_client')}
          />
          <Row
            title="No-show — she didn't turn up"
            subtitle={
              remaining === null
                ? 'No pack to deduct from.'
                : `Pack drops to ${next}. She sees it in her app.`
            }
            minHeight={72}
            severity="critical"
            leading={<Radio checked={outcome === 'no_show'} />}
            onPress={() => setOutcome('no_show')}
          />
          <Row
            title="I cancelled it"
            subtitle="Pack stays. She gets an apology message."
            minHeight={72}
            leading={<Radio checked={outcome === 'cancelled_trainer'} />}
            onPress={() => setOutcome('cancelled_trainer')}
          />
        </View>

        <Callout icon={IconShield} style={styles.note}>
          Whatever you pick is <CalloutStrong>undoable for 24 hours</CalloutStrong>. Train X never
          decides this for you.
        </Callout>

        <Button
          label="Save"
          size="lg"
          block
          style={styles.cta}
          onPress={() => onOutcome(item, outcome)}
        />
      </Sheet>
    );
  }

  /* --------------------------------------------------------------- session */

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Avatar name={item.clientName} size="lg" />
        <View style={styles.headMain}>
          <Text style={styles.name} numberOfLines={1}>
            {item.clientName}
          </Text>
          <Text style={styles.sub}>
            {start.time} – {end.time} {end.meridiem} · {MODE_LABELS[item.mode]}
          </Text>
        </View>
        {item.state === 'done' ? <Tag label="Done" tone="ok" /> : null}
        {item.state === 'no_show' ? <Tag label="No-show" tone="danger" /> : null}
        {item.clash ? <Tag label="Clash" tone="warn" /> : null}
      </View>

      <List>
        <Row
          grouped
          minHeight={54}
          title={item.detail}
          subtitle={item.programId ? 'Open the program' : 'No program assigned'}
          leading={<IconLayers size={19} color={colors.ink3} />}
          trailing={<IconChevron size={18} color={colors.ink3} />}
          onPress={() => onOpenProgram(item)}
        />
        <Row
          grouped
          minHeight={54}
          title={remaining === null ? 'No pack' : `${remaining} sessions left`}
          subtitle={remaining === null ? 'Nothing to deduct from' : 'Open the pack'}
          leading={<IconWallet size={19} color={colors.ink3} />}
          trailing={<IconChevron size={18} color={colors.ink3} />}
          onPress={() => onOpenPack(item)}
        />
      </List>

      <View style={styles.actions}>
        {item.state === 'scheduled' ? (
          <Button
            label="Start session"
            size="lg"
            block
            icon={IconPlay}
            onPress={() => onStart(item)}
          />
        ) : null}
        <View style={styles.actionRow}>
          <Button
            label="Move"
            variant="ghost"
            icon={IconMove}
            style={styles.grow}
            onPress={() => setPane('move')}
          />
          <Button
            label="Message"
            variant="ghost"
            icon={IconMessage}
            style={styles.grow}
            onPress={() => onMessage(item)}
          />
          <Button
            label=""
            variant="ghost"
            icon={IconDots}
            style={styles.more}
            onPress={() => setPane('outcome')}
          />
        </View>
        {item.state === 'scheduled' ? (
          <Button
            label="She didn't train"
            variant="ghost"
            block
            onPress={() => setPane('outcome')}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginBottom: space.s4 },
  headMain: { flex: 1, minWidth: 0 },
  name: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: colors.ink },
  sub: { fontSize: 13.5, color: colors.ink3, marginTop: 3, marginBottom: space.s3 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  list: { marginTop: 10 },
  stack: { gap: space.s2 },
  note: { marginTop: space.s4 },
  actions: { marginTop: space.s4, gap: space.s2 },
  actionRow: { flexDirection: 'row', gap: space.s2 },
  grow: { flex: 1 },
  more: { width: 56 },
  cta: { marginTop: space.s3 },
  time: { width: 52 },
  timeValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  timeMeridiem: { fontSize: 9, fontWeight: '700', letterSpacing: 0.9, color: colors.ink3, marginTop: 2 },
});

/**
 * 3a · New session — and 3b · Repeat, which is one row deeper.
 *
 * The sheet answers the question every trainer asks before booking: *does this
 * cost her a session?* It doesn't. A pack moves when the session is marked done
 * or a no-show, never when it is booked, and saying so at the moment of booking
 * is what stops the support ticket.
 *
 * The client row leads, because who is 90% of the decision, and the pack line
 * under her name is the number that decides whether you should be booking at
 * all.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  Chip,
  IconChevron,
  IconSearch,
  List,
  Radio,
  Row,
  Search,
  Seg,
  Sheet,
  colors,
  space,
} from '../../../design';
import { MODE_LABELS, type DeliveryMode } from '../../../home/mode';
import { clockParts } from '../../../home/time';
import {
  DEFAULT_SESSION_MIN,
  occurrencesFor,
  packRemaining,
  isoWeekday,
  type DiaryInput,
} from '../../../diary/diary';

const LENGTHS = [30, 60, 90];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface BookResult {
  clientId: string;
  at: number;
  minutes: number;
  mode: DeliveryMode;
  /** Empty for a one-off; otherwise every date the series lands on. */
  occurrences: number[];
}

export default function BookSheet({
  visible,
  input,
  at,
  onBook,
  onClose,
}: {
  visible: boolean;
  input: DiaryInput;
  /** The slot that was tapped. */
  at: number;
  onBook: (result: BookResult) => void;
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(DEFAULT_SESSION_MIN);
  const [mode, setMode] = useState<DeliveryMode>('floor');
  const [query, setQuery] = useState('');
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);

  // Reseeded on open rather than in an effect — the sheet stays mounted for the
  // length of its exit, and an effect would fight the close.
  const [seed, setSeed] = useState(visible);
  if (visible !== seed) {
    setSeed(visible);
    if (visible) {
      setClientId(null);
      setMinutes(DEFAULT_SESSION_MIN);
      setMode('floor');
      setQuery('');
      setWeekdays([]);
      setRepeatOpen(false);
    }
  }

  const client = input.clients.find((c) => c.id === clientId) ?? null;
  const remaining = clientId ? packRemaining(input, clientId) : null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...input.clients].sort((a, b) => a.name.localeCompare(b.name));
    return q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all.slice(0, 6);
  }, [input.clients, query]);

  // "Until the pack runs out" is the only bound offered, and it resolves to a
  // real date on screen: nobody gets booked into sessions they haven't paid for.
  const occurrences = useMemo(
    () => (weekdays.length === 0 ? [] : occurrencesFor(at, weekdays, Math.max(0, remaining ?? 0) - 1)),
    [at, weekdays, remaining],
  );

  const { time, meridiem } = clockParts(at);
  const day = new Date(at);
  const when = `${dayName(at)} ${day.getDate()} ${MONTH_SHORT[day.getMonth()]} · ${time} ${meridiem}`;

  const last = occurrences[occurrences.length - 1];

  return (
    <Sheet visible={visible} onClose={onClose} title={repeatOpen ? 'Repeat' : 'New session'}>
      {repeatOpen ? (
        <ScrollView keyboardShouldPersistTaps="handled">
          <List>
            <Row
              grouped
              minHeight={54}
              title="Does not repeat"
              leading={<Radio checked={weekdays.length === 0} />}
              onPress={() => setWeekdays([])}
            />
            <Row
              grouped
              minHeight={54}
              title={`Every ${DAY_SHORT[isoWeekday(at)]}`}
              subtitle={`${time} ${meridiem} · same slot each week`}
              leading={<Radio checked={weekdays.length === 1 && weekdays[0] === isoWeekday(at)} />}
              onPress={() => setWeekdays([isoWeekday(at)])}
            />
          </List>

          <Text style={styles.label}>Pick the days</Text>
          <Seg style={styles.seg}>
            {DAY_SHORT.map((label, i) => (
              <Chip
                key={label}
                label={label}
                selected={weekdays.includes(i)}
                onPress={() =>
                  setWeekdays((current) =>
                    current.includes(i) ? current.filter((d) => d !== i) : [...current, i],
                  )
                }
              />
            ))}
          </Seg>

          <Callout style={styles.note}>
            {occurrences.length === 0
              ? 'Pick a day to see how many sessions this books.'
              : `Ends after ${occurrences.length} more, on ${stamp(last)} — the day her pack runs out. `}
            {occurrences.length > 0 ? (
              <CalloutStrong>Nobody gets booked into sessions they haven't paid for.</CalloutStrong>
            ) : null}
          </Callout>

          <Button
            label={`Save · ${occurrences.length + 1} session${occurrences.length === 0 ? '' : 's'}`}
            size="lg"
            block
            style={styles.cta}
            onPress={() => setRepeatOpen(false)}
          />
        </ScrollView>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.when}>{when}</Text>

          {client ? (
            <List style={styles.block}>
              <Row
                grouped
                title={client.name}
                subtitle={
                  remaining === null
                    ? 'No pack — nothing to deduct'
                    : `${remaining} session${remaining === 1 ? '' : 's'} left`
                }
                leading={<Avatar name={client.name} size="sm" />}
                trailing={<IconChevron size={18} color={colors.ink3} />}
                onPress={() => setClientId(null)}
              />
            </List>
          ) : (
            <>
              <Search
                value={query}
                onChangeText={setQuery}
                placeholder="Which client?"
                style={styles.block}
              />
              <List style={styles.list}>
                {matches.map((c) => (
                  <Row
                    key={c.id}
                    grouped
                    minHeight={56}
                    title={c.name}
                    leading={<Avatar name={c.name} size="sm" />}
                    onPress={() => setClientId(c.id)}
                  />
                ))}
              </List>
              {matches.length === 0 ? (
                <Text style={styles.none}>
                  <IconSearch size={13} color={colors.ink3} /> Nobody by that name.
                </Text>
              ) : null}
            </>
          )}

          <Text style={styles.label}>Length</Text>
          <Seg style={styles.seg}>
            {LENGTHS.map((n) => (
              <Chip
                key={n}
                label={`${n} min`}
                selected={minutes === n}
                onPress={() => setMinutes(n)}
              />
            ))}
          </Seg>

          <Text style={styles.label}>Where</Text>
          <Seg style={styles.seg}>
            {(['floor', 'remote'] as DeliveryMode[]).map((m) => (
              <Chip
                key={m}
                label={MODE_LABELS[m]}
                selected={mode === m}
                onPress={() => setMode(m)}
              />
            ))}
          </Seg>

          <List style={styles.block}>
            <Row
              grouped
              minHeight={54}
              title={weekdays.length === 0 ? 'Does not repeat' : `Repeats · ${occurrences.length + 1} sessions`}
              subtitle={weekdays.length === 0 ? 'Tap to make it weekly' : weekdays.map((d) => DAY_SHORT[d]).join(', ')}
              trailing={<IconChevron size={18} color={colors.ink3} />}
              onPress={() => setRepeatOpen(true)}
            />
          </List>

          <Callout style={styles.note}>
            Booking doesn't touch the pack.{' '}
            <CalloutStrong>The session is deducted when you mark it done</CalloutStrong> — or when
            you mark a no-show.
          </Callout>

          <Button
            label={`Book · ${time} ${meridiem}`}
            size="lg"
            block
            disabled={!clientId}
            style={styles.cta}
            onPress={() =>
              clientId && onBook({ clientId, at, minutes, mode, occurrences })
            }
          />
        </ScrollView>
      )}
    </Sheet>
  );
}

function dayName(at: number): string {
  return DAY_SHORT[isoWeekday(at)];
}

function stamp(at?: number): string {
  if (!at) return '';
  const d = new Date(at);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

const styles = StyleSheet.create({
  when: { fontSize: 13.5, color: colors.ink3, marginBottom: space.s4 },
  block: { marginBottom: space.s2 },
  list: { marginBottom: space.s2, maxHeight: 260 },
  none: { fontSize: 13, color: colors.ink3, paddingVertical: space.s3 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: space.s4,
  },
  seg: { marginTop: space.s2, marginBottom: space.s2 },
  note: { marginTop: space.s4 },
  cta: { marginTop: space.s4, marginBottom: space.s2 },
});

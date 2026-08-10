/**
 * 3d · Bulk message.
 *
 * The highest-value bulk action in this market, and the one place a template
 * with {name} and {amount} earns its complexity.
 *
 * It opens one chat per client. Never a broadcast: a group message about money
 * costs clients, and WhatsApp gives no way to un-send one. That rule is § 07's
 * and it is why this sheet opens the chats in sequence rather than composing a
 * single recipient list.
 */

import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import {
  AvatarStack,
  Button,
  Callout,
  CalloutStrong,
  IconMessage,
  List,
  Radio,
  Row,
  Sheet,
  colors,
  space,
} from '../../../design';
import { rupees } from '../../../home/time';
import type { RosterRow } from '../../../clients/roster';

type TemplateKey = 'payment' | 'checkin' | 'own';

const TEMPLATES: { key: TemplateKey; label: string; preview?: string }[] = [
  {
    key: 'payment',
    label: 'Payment reminder',
    preview: '“Hi {name}, ₹{amount} is pending for your pack.”',
  },
  { key: 'checkin', label: 'Check-in', preview: '“Hi {name}, haven’t seen you log this week.”' },
  { key: 'own', label: 'Write my own' },
];

/** The template, resolved against one client. `own` opens the chat empty. */
function body(key: TemplateKey, row: RosterRow): string {
  const first = row.name.split(/\s+/)[0] ?? row.name;
  if (key === 'payment') {
    return row.owed > 0
      ? `Hi ${first}, ${rupees(row.owed)} is pending for your pack.`
      : `Hi ${first}, a payment is pending for your pack.`;
  }
  if (key === 'checkin') return `Hi ${first}, haven't seen you log this week.`;
  return '';
}

export default function BulkMessageSheet({
  visible,
  rows,
  onSent,
  onClose,
}: {
  visible: boolean;
  rows: RosterRow[];
  onSent: (opened: number, skipped: number) => void;
  onClose: () => void;
}) {
  const [template, setTemplate] = useState<TemplateKey>('payment');

  const reachable = useMemo(() => rows.filter((r) => r.phone), [rows]);
  const skipped = rows.length - reachable.length;

  const names = rows.map((r) => r.name.split(/\s+/)[0] ?? r.name);
  const listed =
    names.length <= 1
      ? names.join('')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  const send = async () => {
    let opened = 0;
    // Sequential, and awaited: firing every URL at once makes Android drop all
    // but the last, which looks like the app messaged one person at random.
    for (const row of reachable) {
      const number = (row.phone ?? '').replace(/\D/g, '');
      if (!number) continue;
      const text = body(template, row);
      const url = `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
      try {
        await Linking.openURL(url);
        opened += 1;
      } catch {
        // WhatsApp missing, or the user came straight back. Either way the
        // remaining chats still deserve their turn.
      }
    }
    onClose();
    onSent(opened, skipped);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={`Message ${rows.length} clients`}>
      <View style={styles.who}>
        <AvatarStack names={rows.map((r) => r.name)} />
        <Text style={styles.whoText} numberOfLines={2}>
          {listed}
        </Text>
      </View>

      <Text style={styles.label}>Pick a message</Text>
      <List style={styles.list}>
        {TEMPLATES.map((t) => (
          <Row
            key={t.key}
            grouped
            minHeight={58}
            title={t.label}
            subtitle={t.preview}
            selected={t.key === template}
            leading={<Radio checked={t.key === template} />}
            onPress={() => setTemplate(t.key)}
          />
        ))}
      </List>

      <Callout icon={IconMessage} style={styles.note}>
        Sends one WhatsApp per client, each with their own name and amount —{' '}
        <CalloutStrong>never a group message.</CalloutStrong>
      </Callout>

      {skipped > 0 ? (
        <Text style={styles.skipped}>
          {skipped} of them {skipped === 1 ? 'has' : 'have'} no phone number and will be skipped.
        </Text>
      ) : null}

      <Button
        label={`Open WhatsApp · ${reachable.length} chat${reachable.length === 1 ? '' : 's'}`}
        size="lg"
        block
        disabled={reachable.length === 0}
        style={styles.cta}
        onPress={() => void send()}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: 10, marginBottom: 16 },
  whoText: { flex: 1, fontSize: 13.5, color: colors.ink3 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  list: { marginTop: 10 },
  note: { marginTop: 16 },
  skipped: { marginTop: 10, fontSize: 12.5, color: colors.warn },
  cta: { marginTop: 16 },
});

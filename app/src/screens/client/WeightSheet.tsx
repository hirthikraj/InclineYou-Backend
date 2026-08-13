/**
 * Screen 3b · Log a body metric.
 *
 * Append-only, stated where it applies rather than in a help page: a reading is
 * never overwritten, so the correction path is another entry. That is FR-1, and it
 * is the reason the series a trainer coaches from is the series that was actually
 * recorded.
 *
 * The history sits **above** the save button, which is not decoration. It lets the
 * client see the shape they are adding to — and it is the thing that stops a
 * mistyped 6.18 from being saved.
 *
 * The undo lasts five seconds and is the one deletion in the client app. It takes
 * back a tap, not a reading: anything older is history, and history is corrected
 * by adding to it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ClientInput } from '../../client/client';
import { buildWeightSheet } from '../../client/client';
import { logBodyMetric, undoBodyMetric } from '../../db/clientWrites';
import {
  Button,
  Callout,
  CalloutStrong,
  Control,
  FieldLabel,
  FieldMsg,
  List,
  Row,
  RowValue,
  SectionHead,
  Sheet,
  Toast,
  colors,
  space,
} from '../../design';

/** How long the undo stays up. Long enough to notice, short enough to mean it. */
const UNDO_MS = 5000;

export default function WeightSheet({
  visible,
  onClose,
  clientId,
  input,
  coachFirst,
}: {
  visible: boolean;
  onClose: () => void;
  clientId: string;
  input: ClientInput;
  coachFirst: string;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [undoId, setUndoId] = useState<string | null>(null);

  const view = useMemo(() => buildWeightSheet(input, clientId, Date.now()), [input, clientId]);

  useEffect(() => {
    if (!undoId) return;
    const t = setTimeout(() => setUndoId(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undoId]);

  const kg = Number(value);
  const sane = Number.isFinite(kg) && kg >= 25 && kg <= 250;

  const save = async () => {
    if (!sane || saving) return;
    setSaving(true);
    try {
      const id = await logBodyMetric(clientId, 'weight', kg);
      setUndoId(id);
      setValue('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet visible={visible} onClose={onClose} title="Log your weight">
        <Text style={styles.lead}>{view.todayLine}</Text>

        <FieldLabel hint="one decimal is enough">Weight</FieldLabel>
        <Control
          size="lg"
          affix="kg"
          value={value}
          onChangeText={setValue}
          placeholder={view.last ? String(view.last.value) : '0'}
          keyboardType="decimal-pad"
        />
        <FieldMsg tone={value && !sane ? 'error' : 'hint'}>
          {value && !sane
            ? 'That does not look like a weight in kilograms.'
            : view.last
              ? `Last reading ${view.last.value} kg, ${view.last.when}.`
              : 'Your first reading.'}
        </FieldMsg>

        {view.history.length ? (
          <>
            <SectionHead label="Your history" count={view.count} style={styles.head} />
            <List style={styles.group}>
              {view.history.map((row) => (
                <Row
                  key={row.id}
                  grouped
                  minHeight={56}
                  title={row.value}
                  subtitle={row.when}
                  trailing={row.delta ? <RowValue value={row.delta} unit="kg" /> : undefined}
                />
              ))}
            </List>
          </>
        ) : null}

        <Callout style={styles.note}>
          <CalloutStrong>Nothing is overwritten.</CalloutStrong> Every reading stays in your history
          — if you typed the wrong number, log the right one and the newest reading wins.{' '}
          {coachFirst} sees this list, not just the latest.
        </Callout>

        <Button
          label={sane ? `Save ${kg} kg` : 'Save'}
          size="lg"
          block
          disabled={!sane}
          loading={saving}
          style={styles.save}
          onPress={() => void save()}
        />
      </Sheet>

      {undoId ? (
        <View style={styles.toastDock} pointerEvents="box-none">
          <Toast
            action={{
              label: 'Undo',
              onPress: () => {
                const id = undoId;
                setUndoId(null);
                void undoBodyMetric(id);
              },
            }}
          >
            Weight logged.
          </Toast>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 12.5, lineHeight: 19, color: colors.ink3, marginBottom: space.s4 },
  head: { marginTop: space.s2 },
  group: { marginBottom: space.s2 },
  note: { marginTop: space.s3 },
  save: { marginTop: space.s4 },
  toastDock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.inset, paddingBottom: space.s5 },
});

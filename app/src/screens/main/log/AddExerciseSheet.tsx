/**
 * Screen 17 · § 3a — the rack was busy.
 *
 * In an Indian gym the rack you planned for has somebody else in it and the
 * cable station has a queue. Every logger in the category treats that as a
 * failure — an exercise you *skipped*, a workout you did not *complete*, a red
 * mark against adherence. Here it is the highest-signal thing a trainer does all
 * week, and the sheet says so: **it goes into today's log only, and the client's
 * program does not change.**
 *
 * ── Recents first ─────────────────────────────────────────────────────────
 *
 * Because the answer to a busy rack is nearly always something they have already
 * done. Every recent row carries what they last lifted on it, so the choice is
 * made on numbers rather than on a name — which is the whole difference between
 * this and a search box over 1,324 rows.
 *
 * **Yours** is a first-class chip. A movement invented for one client's shoulder
 * is the one a trainer will hunt for hardest, and Hevy's mistake is burying it
 * in the same alphabetical list as the other four hundred.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { addExercise } from '../../../db/log';
import { buildPicker, type LogInput } from '../../../log/log';
import {
  Button,
  Chip,
  List,
  Radio,
  Row,
  Search,
  Sheet,
  Tag,
  colors,
  space,
} from '../../../design';

type Bucket = 'recent' | 'yours' | 'all';

export default function AddExerciseSheet({
  visible,
  workoutId,
  clientId,
  clientName,
  input,
  already,
  openName,
  onClose,
  onSwapInstead,
}: {
  visible: boolean;
  workoutId: string;
  clientId: string;
  clientName: string;
  input: LogInput;
  /** Already in today's log. Offering them again would create a second card. */
  already: Set<string>;
  /** The card currently open, named — the swap alternative says what it replaces. */
  openName: string | null;
  onClose: () => void;
  /** "Swap it for the bench press instead" — the same choice, a different meaning. */
  onSwapInstead: (exerciseId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<Bucket>('recent');
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const picker = useMemo(
    () => buildPicker(input, clientId, clientName, query, bucket, already),
    [input, clientId, clientName, query, bucket, already],
  );

  const add = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      await addExercise(workoutId, picked, 'unplanned');
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPicked(null);
    setQuery('');
    setBucket('recent');
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add an exercise"
    >
      <Text style={styles.meta}>
        {picker.total} in the library · {picker.yoursCount} of them yours
      </Text>

      <Search value={query} onChangeText={setQuery} placeholder="Search exercises" style={styles.search} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
        <View style={styles.chipRow}>
          <Chip
            label="Recents"
            count={picker.recentCount}
            selected={bucket === 'recent'}
            onPress={() => setBucket('recent')}
          />
          <Chip
            label="Yours"
            count={picker.yoursCount}
            selected={bucket === 'yours'}
            onPress={() => setBucket('yours')}
          />
          <Chip
            label="All"
            count={picker.total}
            selected={bucket === 'all'}
            onPress={() => setBucket('all')}
          />
        </View>
      </ScrollView>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {picker.rows.length ? (
          <List>
            {picker.rows.map((row) => (
              <Row
                key={row.id}
                grouped
                wrap
                title={row.name}
                subtitle={row.meta}
                selected={picked === row.id}
                onPress={() => setPicked(row.id)}
                trailing={
                  <View style={styles.trailing}>
                    {row.custom ? <Tag label="Yours" tone="accent" /> : null}
                    <Radio checked={picked === row.id} />
                  </View>
                }
              />
            ))}
          </List>
        ) : (
          <Text style={styles.none}>
            {bucket === 'recent'
              ? `Nothing logged with ${clientName.split(' ')[0]} yet. Try All.`
              : 'Nothing matches that.'}
          </Text>
        )}
      </ScrollView>

      <Text style={styles.fine}>Goes into today's log only. Their program does not change.</Text>

      <Button
        label="Add as unplanned"
        variant="primary"
        size="lg"
        block
        disabled={!picked}
        loading={saving}
        onPress={() => void add()}
        style={styles.action}
      />
      {/* Named, because "the open exercise" is a phrase about the app and the
          exercise's own name is a phrase about the gym — and the button is one
          line, so the name is also what fits. */}
      <Button
        label={openName ? `Swap it for the ${openName.toLowerCase()} instead` : 'Swap it in instead'}
        variant="text"
        block
        disabled={!picked}
        onPress={() => {
          if (picked) onSwapInstead(picked);
          reset();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 12.5, color: colors.ink3 },
  search: { marginTop: space.s3 },
  chips: { marginTop: space.s3, flexGrow: 0 },
  chipRow: { flexDirection: 'row', gap: space.s2, paddingRight: space.s3 },
  // A fixed height, so the sheet cannot grow past the point where the action
  // leaves the screen — and so the list cannot collapse to nothing when it
  // does. `maxHeight` alone did the latter in `SwapSheet`. The search box above
  // it is what makes a bounded list safe.
  list: { marginTop: space.s3, height: 260, flexShrink: 0 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  none: { fontSize: 13, color: colors.ink3, paddingVertical: space.s5, textAlign: 'center' },
  fine: { fontSize: 12, color: colors.ink3, marginTop: space.s3 },
  action: { marginTop: space.s3 },
});

/**
 * Muscle and equipment, the two filters Hevy has and the two that matter.
 *
 * The draft is local and only applied on the button. A filter sheet that filtered
 * live would rebuild the list under a finger that is still choosing, and on 873
 * rows that is felt.
 *
 * "Clear all" is a text action rather than a third chip: it is not a filter, and
 * putting it in the same row as the filters makes it look like one.
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Seg, Sheet, colors, space, type } from '../../../design';

export interface ExerciseFilterSheetProps {
  visible: boolean;
  /** Every muscle and equipment type present in the library, not a fixed list. */
  muscles: string[];
  equipment: string[];
  selectedMuscles: string[];
  selectedEquipment: string[];
  onApply: (muscles: string[], equipment: string[]) => void;
  onClose: () => void;
}

export default function ExerciseFilterSheet({
  visible,
  muscles,
  equipment,
  selectedMuscles,
  selectedEquipment,
  onApply,
  onClose,
}: ExerciseFilterSheetProps) {
  const [m, setM] = useState(selectedMuscles);
  const [e, setE] = useState(selectedEquipment);

  // Re-seeded on open so a sheet dismissed mid-edit does not reopen holding a
  // draft that was never applied.
  useEffect(() => {
    if (!visible) return;
    setM(selectedMuscles);
    setE(selectedEquipment);
  }, [visible, selectedMuscles, selectedEquipment]);

  const count = m.length + e.length;

  return (
    <Sheet visible={visible} onClose={onClose} title="Filter exercises">
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Muscle</Text>
        <Seg>
          {muscles.map((muscle) => (
            <Chip
              key={muscle}
              label={muscle}
              selected={m.includes(muscle)}
              onPress={() => setM(toggle(m, muscle))}
            />
          ))}
        </Seg>

        <Text style={[styles.label, styles.second]}>Equipment</Text>
        <Seg>
          {equipment.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={e.includes(item)}
              onPress={() => setE(toggle(e, item))}
            />
          ))}
        </Seg>
      </ScrollView>

      <View style={styles.actions}>
        <Button
          label="Clear all"
          variant="ghost"
          disabled={count === 0}
          onPress={() => {
            setM([]);
            setE([]);
          }}
        />
        <Button
          label={count ? `Show ${count} filtered` : 'Show all'}
          variant="primary"
          size="lg"
          onPress={() => onApply(m, e)}
          style={styles.grow}
        />
      </View>
    </Sheet>
  );
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

const styles = StyleSheet.create({
  // Capped: the library has enough muscle groups to push the buttons off a
  // small screen otherwise.
  scroll: { maxHeight: 340 },
  label: { ...type.micro, color: colors.ink3, marginBottom: space.s2 },
  second: { marginTop: space.s5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.s2, marginTop: space.s4 },
  grow: { flex: 1 },
});

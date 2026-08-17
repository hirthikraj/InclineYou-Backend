/**
 * One field, in a sheet.
 *
 * "Any row → edit that one field. **Never a form of twelve.**" — the profile tap
 * map. So there is one sheet, and it takes a spec saying which of the three
 * shapes a field is: free text, one choice from a list, or several.
 *
 * A generic editor is the right call here rather than five bespoke sheets,
 * because the *behaviour* is identical in all three cases — open with the current
 * answer, change it, save it, and the save is a single-key PATCH. What differs is
 * only the control. Five sheets would be five places for the save to drift.
 *
 * The draft is local to the sheet and thrown away on close. Nothing is saved
 * until the button is pressed, which is what makes closing safe.
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TrainerUpdate } from '../../../api/trainer';
import { NOT_CERTIFIED, type Option } from '../../../setup/options';
import {
  Button,
  Callout,
  Chip,
  Control,
  List,
  Radio,
  Row,
  Seg,
  Sheet,
  colors,
  space,
} from '../../../design';

/** The three shapes a profile field comes in. */
export type FieldSpec =
  | {
      kind: 'text';
      key: 'name' | 'gymName';
      title: string;
      meta: string;
      value: string;
      /** Empty is a real answer — clearing the gym means "on your own". */
      optional?: boolean;
    }
  | {
      kind: 'single';
      key: 'experienceBand' | 'workMode';
      title: string;
      meta: string;
      options: Option[];
      value: string | null;
    }
  | {
      kind: 'multi';
      key: 'certifications' | 'languages';
      title: string;
      meta: string;
      options: Option[];
      selected: string[];
    };

export interface FieldSheetProps {
  /** Null closes it. Carrying the whole spec means the sheet has no state to reset. */
  spec: FieldSpec | null;
  onSave: (patch: TrainerUpdate, what: string) => void;
  onClose: () => void;
}

export default function FieldSheet({ spec, onSave, onClose }: FieldSheetProps) {
  const [text, setText] = useState('');
  const [single, setSingle] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);

  // Re-seeded on every open. A sheet that remembered the last field's draft would
  // offer the gym's name as a language.
  useEffect(() => {
    if (!spec) return;
    if (spec.kind === 'text') setText(spec.value);
    if (spec.kind === 'single') setSingle(spec.value);
    if (spec.kind === 'multi') setMulti(spec.selected);
  }, [spec]);

  if (!spec) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const commit = () => {
    if (spec.kind === 'text') {
      const value = text.trim();
      onSave({ [spec.key]: value } as TrainerUpdate, spec.title);
      return;
    }
    if (spec.kind === 'single') {
      onSave({ [spec.key]: single ?? '' } as TrainerUpdate, spec.title);
      return;
    }
    onSave({ [spec.key]: multi } as TrainerUpdate, spec.title);
  };

  const valid =
    spec.kind === 'text'
      ? spec.optional === true || text.trim().length > 0
      : // A single-choice save with nothing picked would CLEAR the answer —
        // there is no field where that is what the trainer meant.
        spec.kind !== 'single' || single != null;

  return (
    <Sheet visible onClose={onClose} title={spec.title}>
      <Text style={styles.meta}>{spec.meta}</Text>

      {spec.kind === 'text' ? (
        <Control
          value={text}
          onChangeText={setText}
          placeholder={spec.key === 'gymName' ? 'Anytime Fitness, Adyar' : 'Your name'}
          autoFocus
          autoCapitalize="words"
          style={styles.control}
        />
      ) : null}

      {spec.kind === 'single' ? (
        <List style={styles.list}>
          {spec.options.map((option) => (
            <Row
              key={option.id}
              grouped
              title={option.label}
              subtitle={option.note}
              onPress={() => setSingle(option.id)}
              trailing={<Radio checked={single === option.id} />}
            />
          ))}
        </List>
      ) : null}

      {spec.kind === 'multi' ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Seg style={styles.chips}>
            {spec.options.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                selected={multi.includes(option.id)}
                onPress={() => setMulti(toggle(multi, option.id, spec.key))}
              />
            ))}
          </Seg>
        </ScrollView>
      ) : null}

      {spec.kind === 'text' && spec.key === 'gymName' ? (
        <Callout style={styles.warn}>
          Clearing this means you train on your own, and it clears the gym&apos;s cut with it.
          Sessions already recorded keep the split they were recorded with.
        </Callout>
      ) : null}

      <Button
        label="Save"
        variant="primary"
        size="lg"
        block
        disabled={!valid}
        onPress={commit}
        style={styles.save}
      />
    </Sheet>
  );
}

/**
 * Adds or removes one id.
 *
 * "Not certified yet" is exclusive: holding it alongside a certificate is a
 * contradiction, and letting both stand would put a nonsense pair on a profile
 * a client reads.
 */
function toggle(list: string[], id: string, key: 'certifications' | 'languages'): string[] {
  if (key === 'certifications') {
    if (id === NOT_CERTIFIED) return list.includes(id) ? [] : [NOT_CERTIFIED];
    const without = list.filter((x) => x !== NOT_CERTIFIED);
    return without.includes(id) ? without.filter((x) => x !== id) : [...without, id];
  }
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  control: { marginBottom: space.s4 },
  list: { marginBottom: space.s4 },
  // Capped so a ten-language list cannot push the save button off a small screen.
  scroll: { maxHeight: 280, marginBottom: space.s4 },
  chips: {},
  warn: { marginBottom: space.s3 },
  save: { marginTop: space.s2 },
});

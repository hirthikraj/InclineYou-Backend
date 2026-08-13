/**
 * Pick one, from a short list.
 *
 * The settings equivalent of `FieldSheet`, for the rows whose answer is one of a
 * handful of options — language, appearance, the chase window, the reminder tone.
 *
 * It commits on tap and closes, rather than requiring a Save. That is the right
 * shape for a single choice from a visible list: the tap IS the decision, there is
 * nothing to review, and a Save button below three radio buttons is a second tap
 * that only exists to make the sheet look like a form.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { List, Radio, Row, Sheet, colors, space } from '../../../design';

export interface ChoiceOption {
  key: string;
  label: string;
  meta?: string;
}

export interface ChoiceSpec {
  title: string;
  meta?: string;
  options: ChoiceOption[];
  value: string;
  onPick: (key: string) => void;
}

export interface ChoiceSheetProps {
  /** Null closes it. Carrying the spec means the sheet holds no state of its own. */
  spec: ChoiceSpec | null;
  onClose: () => void;
}

export default function ChoiceSheet({ spec, onClose }: ChoiceSheetProps) {
  if (!spec) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  return (
    <Sheet visible onClose={onClose} title={spec.title}>
      {spec.meta ? <Text style={styles.meta}>{spec.meta}</Text> : null}
      <List>
        {spec.options.map((option) => (
          <Row
            key={option.key}
            grouped
            wrap
            title={option.label}
            subtitle={option.meta}
            onPress={() => {
              spec.onPick(option.key);
              onClose();
            }}
            trailing={<Radio checked={spec.value === option.key} />}
          />
        ))}
      </List>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
});

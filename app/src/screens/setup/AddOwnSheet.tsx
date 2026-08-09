/**
 * "Add your own" — the escape hatch behind every `PickAdd` chip.
 *
 * Every catalogue in this flow is a best guess at what Indian trainers hold and
 * speak, and a catalogue that cannot be added to quietly tells the people it
 * missed that they don't exist. One field, one button, no taxonomy.
 *
 * Anything typed here is stored with a `custom:` id (see `setup/options.ts`),
 * so it never collides with a catalogue entry and the label survives without a
 * lookup table.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Control, FieldMsg, Sheet } from '../../design';

export interface AddOwnSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Receives the trimmed label. Deduping is the caller's job. */
  onAdd: (label: string) => void;
  title: string;
  placeholder: string;
  hint?: string;
}

const MAX = 40;

export default function AddOwnSheet({
  visible,
  onClose,
  onAdd,
  title,
  placeholder,
  hint,
}: AddOwnSheetProps) {
  const [value, setValue] = useState('');

  // Cleared on every open, not on close: closing animates out, and watching the
  // text vanish mid-slide reads as the entry being rejected.
  useEffect(() => {
    if (visible) setValue('');
  }, [visible]);

  const trimmed = value.trim();

  const submit = () => {
    if (!trimmed) return;
    onAdd(trimmed);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Control
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder={placeholder}
        maxLength={MAX}
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel={title}
      />
      <FieldMsg>{hint}</FieldMsg>
      <Button
        label="Add"
        variant="primary"
        size="lg"
        block
        disabled={!trimmed}
        onPress={submit}
        style={styles.action}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: 4 },
});

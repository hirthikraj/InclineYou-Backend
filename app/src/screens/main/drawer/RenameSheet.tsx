/**
 * Rename one thing.
 *
 * Not `Alert.prompt`: that is iOS-only, and Android is this app's first platform.
 * A one-field sheet is four lines more code and works on both.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Control, Sheet, colors, space } from '../../../design';

export interface RenameSheetProps {
  visible: boolean;
  title: string;
  /** What renaming does and does not touch. Worth saying for a template. */
  meta?: string;
  current: string;
  onSave: (next: string) => void;
  onClose: () => void;
}

export default function RenameSheet({
  visible,
  title,
  meta,
  current,
  onSave,
  onClose,
}: RenameSheetProps) {
  const [text, setText] = useState(current);

  // Re-seeded on open, so the sheet never offers the previous target's name.
  useEffect(() => {
    if (visible) setText(current);
  }, [visible, current]);

  const value = text.trim();

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      <Control value={text} onChangeText={setText} autoFocus selectTextOnFocus style={styles.control} />
      <Button
        label="Rename"
        variant="primary"
        size="lg"
        block
        disabled={!value || value === current}
        onPress={() => onSave(value)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s4 },
  control: { marginBottom: space.s4 },
});

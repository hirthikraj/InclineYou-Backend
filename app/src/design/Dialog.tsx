/**
 * `.tx-dialog` — the modal that stands in front of something irreversible.
 *
 * Not a `Sheet`. A sheet is a place to do work and it dismisses on a tap outside;
 * this interrupts, and the only ways out are the two buttons. It is centred
 * rather than anchored to the bottom for the same reason — a destructive choice
 * should not arrive in the same position, with the same motion, as a form.
 *
 * The body **counts what will be lost**. "Are you sure?" is not information;
 * "72 sessions, 9 measurements and 6 payments" is, and it is the sentence that
 * makes a trainer pick archive instead.
 *
 * Cancel sits on the left and is not the accent colour. Nothing here is a happy
 * path, so nothing here gets the happy-path treatment.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { colors, radius, space } from './tokens';

export interface DialogProps {
  visible: boolean;
  title: string;
  /** A string, or your own nodes when the count needs emphasis inside it. */
  children?: React.ReactNode;
  /** Defaults to Cancel. */
  cancelLabel?: string;
  confirmLabel: string;
  /**
   * Danger by default — most of these stand in front of a delete. 'primary'
   * is for the confirmations that commit work rather than destroy it (booking
   * a series of sessions), where a red button would claim a loss that isn't.
   */
  confirmVariant?: 'danger' | 'primary';
  onCancel: () => void;
  onConfirm: () => void;
}

export default function Dialog({
  visible,
  title,
  children,
  cancelLabel = 'Cancel',
  confirmLabel,
  confirmVariant = 'danger',
  onCancel,
  onConfirm,
}: DialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* The scrim is not a dismiss target. Tapping away from a delete
          confirmation is ambiguous — it could as easily mean "yes, get on with
          it" — so the decision has to be made with a button. */}
      <View style={styles.scrim}>
        <Pressable
          accessible={false}
          style={StyleSheet.absoluteFill}
          onPress={() => {
            /* deliberately inert */
          }}
        />
        <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert">
          <Text style={styles.title}>{title}</Text>
          {/* Always a Text wrapper: JSX like `week {n} goes` arrives as an
              array of strings, and a bare string inside a View is a crash on
              native. Emphasis nodes (`DialogStrong`) are Texts, which nest. */}
          {children != null ? <Text style={styles.body}>{children}</Text> : null}
          <View style={styles.acts}>
            <Button label={cancelLabel} variant="ghost" onPress={onCancel} style={styles.act} />
            <Button label={confirmLabel} variant={confirmVariant} onPress={onConfirm} style={styles.act} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DialogStrong({ children }: { children: React.ReactNode }) {
  return <Text style={styles.strong}>{children}</Text>;
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.s6,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface2,
    borderRadius: radius.r3,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.s5,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.34,
    color: colors.ink,
    marginBottom: space.s2,
  },
  body: { fontSize: 14, lineHeight: 21, color: colors.ink2 },
  strong: { fontWeight: '700', color: colors.ink },
  acts: { flexDirection: 'row', gap: space.s2, marginTop: space.s5 },
  act: { flex: 1 },
});

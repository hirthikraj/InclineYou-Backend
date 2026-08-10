/**
 * 6c · Export the book.
 *
 * The summary is shown **before** anything leaves the phone, so the trainer
 * knows what they are sending. "Yours" is the total line because it is the only
 * figure on the screen that is really theirs.
 *
 * What ships today is a CSV shared through the OS share sheet — WhatsApp it to
 * a CA, mail it to yourself, drop it in Drive. Writing an actual .csv file, and
 * the PDF receipt book the design also offers, both need native packages this
 * build doesn't carry, so the sheet says so rather than showing a button that
 * would fail.
 */

import React, { useMemo, useState } from 'react';
import { Share, StyleSheet, Text } from 'react-native';
import {
  Button,
  Callout,
  Chip,
  IconAlert,
  IconShare,
  Receipt,
  ReceiptRow,
  Seg,
  Sheet,
  colors,
  space,
} from '../../../design';
import {
  buildCsv,
  buildExport,
  rupees,
  type ExportScope,
  type MoneyInput,
} from '../../../money/money';

export default function ExportSheet({
  visible,
  input,
  anchor,
  onClose,
}: {
  visible: boolean;
  input: MoneyInput;
  anchor: number;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<ExportScope>('year');

  const summary = useMemo(() => buildExport(input, scope, anchor), [input, scope, anchor]);

  const share = async () => {
    const csv = buildCsv(input, scope, anchor);
    await Share.share({
      message: csv,
      title: `Train X · ${summary.label}`,
    });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Export the book">
      <Text style={styles.label}>How much</Text>
      <Seg style={styles.scopes}>
        <Chip label="This month" selected={scope === 'month'} onPress={() => setScope('month')} />
        <Chip label="This year" selected={scope === 'year'} onPress={() => setScope('year')} />
        <Chip label="Everything" selected={scope === 'all'} onPress={() => setScope('all')} />
      </Seg>

      <Receipt style={styles.summary}>
        <ReceiptRow label="Period" value={summary.label} />
        <ReceiptRow label="Entries" value={String(summary.entries)} />
        <ReceiptRow label="Billed" value={rupees(summary.billed)} />
        <ReceiptRow label="Collected" value={rupees(summary.collected)} />
        <ReceiptRow label="Written off" value={rupees(summary.writtenOff)} />
        <ReceiptRow label="Gym share paid" value={rupees(summary.gymSharePaid)} />
        <ReceiptRow label="Yours" value={rupees(summary.yours)} total />
      </Receipt>

      <Callout icon={IconAlert} style={styles.note}>
        Date, client, amount, method, gym share and receipt number — as CSV text through the share
        sheet. Saving a .csv file and the PDF receipt book need an app update.
      </Callout>

      <Button
        label="Share the CSV"
        size="lg"
        block
        icon={IconShare}
        disabled={summary.entries === 0}
        style={styles.cta}
        onPress={() => void share()}
      />
      {summary.entries === 0 ? (
        <Text style={styles.empty}>Nothing recorded in {summary.label} yet.</Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: space.s3,
  },
  scopes: { marginTop: space.s2 },
  summary: { marginTop: space.s5 },
  note: { marginTop: space.s3 },
  cta: { marginTop: space.s4 },
  empty: { fontSize: 12.5, color: colors.ink3, textAlign: 'center', marginTop: space.s2 },
});

/**
 * Define a pack — the price list entry, not a sale.
 *
 * Shared by the Packs screen and by trainer setup, because they are the same
 * question asked at two moments: *what do you sell?*
 *
 * The per-session figure is computed live and shown under the price, since
 * that is the number a trainer actually negotiates with and the one nobody
 * works out on paper.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Callout,
  ChoiceCard,
  ChoiceGrid,
  Control,
  FieldLabel,
  IconCalendar,
  IconPercent,
  IconWallet,
  Sheet,
  colors,
  space,
} from '../../../design';
import { rupees } from '../../../money/money';

export type PackType = 'session_pack' | 'monthly' | 'single';

export interface PackDraft {
  id?: string;
  name: string;
  type: PackType;
  sessions: number | null;
  amount: number;
  validityDays: number | null;
  /** Whose price list this belongs on. Absent means the trainer's own. */
  owner?: 'trainer' | 'gym';
}

export const BLANK_PACK: PackDraft = {
  name: '',
  type: 'session_pack',
  sessions: 12,
  amount: 0,
  validityDays: null,
  owner: 'trainer',
};

/** What the gym sells at its counter, entered by the trainer who works there. */
export const BLANK_GYM_PACK: PackDraft = { ...BLANK_PACK, owner: 'gym' };

export default function PackSheet({
  visible,
  draft,
  gymName,
  onSave,
  onClose,
}: {
  visible: boolean;
  draft: PackDraft | null;
  /** Names the gym in the copy when the draft is one of its packages. */
  gymName?: string | null;
  onSave: (pack: PackDraft) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<PackType>('session_pack');
  const [sessions, setSessions] = useState('12');
  const [amount, setAmount] = useState('');
  const [validity, setValidity] = useState('');
  const [name, setName] = useState('');

  const [seed, setSeed] = useState<PackDraft | null>(null);
  if (visible && draft !== seed) {
    setSeed(draft);
    setType(draft?.type ?? 'session_pack');
    setSessions(draft?.sessions != null ? String(draft.sessions) : '12');
    setAmount(draft?.amount ? String(draft.amount) : '');
    setValidity(draft?.validityDays != null ? String(draft.validityDays) : '');
    setName(draft?.name ?? '');
  }
  if (!visible && seed !== null) setSeed(null);

  const count = type === 'single' ? 1 : Number(sessions.replace(/\D/g, '')) || 0;
  const price = Number(amount.replace(/\D/g, '')) || 0;
  const per = type !== 'monthly' && count > 0 ? Math.round(price / count) : null;
  const valid = price > 0 && (type === 'monthly' || count > 0);

  const label = autoName(type, count);
  const theirs = draft?.owner === 'gym';
  const whose = gymName ?? 'the gym';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={
        theirs
          ? draft?.id
            ? `Edit this ${whose} package`
            : `A package ${whose} sells`
          : draft?.id
            ? 'Edit this pack'
            : 'A pack you sell'
      }
    >
      {/* The sheet caps its own height; four fields and three choice cards go
          past that on a small phone, so the body scrolls inside the cap. */}
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.body}>
      <ChoiceGrid style={styles.types}>
        <ChoiceCard
          title="Session pack"
          subtitle="A block of sessions"
          icon={IconWallet}
          selected={type === 'session_pack'}
          onPress={() => setType('session_pack')}
        />
        <ChoiceCard
          title="Monthly"
          subtitle="A flat fee each month"
          icon={IconCalendar}
          selected={type === 'monthly'}
          onPress={() => setType('monthly')}
        />
        <ChoiceCard
          title="Single session"
          subtitle="Pay as you go"
          icon={IconPercent}
          wide
          selected={type === 'single'}
          onPress={() => setType('single')}
        />
      </ChoiceGrid>

      {type === 'session_pack' ? (
        <View style={styles.field}>
          <FieldLabel>How many sessions</FieldLabel>
          <Control
            value={sessions}
            onChangeText={setSessions}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="16"
            accessibilityLabel="Sessions in this pack"
          />
        </View>
      ) : null}

      <View style={styles.field}>
        <FieldLabel>{theirs ? `What ${whose} charges` : 'Price'}</FieldLabel>
        <Control
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="6000"
          seg={<Text style={styles.rupee}>₹</Text>}
          accessibilityLabel="Price"
        />
        {per != null && per > 0 ? (
          <Text style={styles.per}>{`${rupees(per)} a session`}</Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <FieldLabel>
          Valid for <Text style={styles.optional}>optional</Text>
        </FieldLabel>
        <Control
          value={validity}
          onChangeText={setValidity}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="No expiry"
          seg={<Text style={styles.rupee}>days</Text>}
          accessibilityLabel="Validity in days"
        />
      </View>

      <View style={styles.field}>
        <FieldLabel>
          Call it <Text style={styles.optional}>optional</Text>
        </FieldLabel>
        <Control
          value={name}
          onChangeText={setName}
          placeholder={label}
          accessibilityLabel="Pack name"
        />
      </View>

      <Callout icon={IconWallet} style={styles.note}>
        {theirs ? (
          <>
            This is the gym&apos;s price, not yours — put down what their counter actually charges.
            Your cut of it is your gym share, and you can&apos;t discount a price you don&apos;t set.
          </>
        ) : (
          <>
            Changing a price here never changes a pack somebody already bought. What they paid is
            what they paid.
          </>
        )}
      </Callout>
      </ScrollView>

      <Button
        label={draft?.id ? 'Save' : theirs ? 'Add this package' : 'Add this pack'}
        size="lg"
        block
        disabled={!valid}
        style={styles.cta}
        onPress={() =>
          onSave({
            id: draft?.id,
            name: name.trim() || label,
            type,
            sessions: type === 'monthly' ? null : count,
            amount: price,
            validityDays: Number(validity.replace(/\D/g, '')) || null,
            owner: draft?.owner ?? 'trainer',
          })
        }
      />
    </Sheet>
  );
}

/** What the pack is called when the trainer doesn't name it. */
export function autoName(type: PackType, sessions: number): string {
  if (type === 'monthly') return 'Monthly';
  if (type === 'single') return 'Single session';
  return `${sessions || 0} sessions`;
}

const styles = StyleSheet.create({
  body: { flexShrink: 1 },
  types: { marginBottom: space.s4 },
  field: { marginBottom: space.s3 },
  rupee: { fontSize: 16, fontWeight: '500', color: colors.ink },
  optional: { fontSize: 13, fontWeight: '400', color: colors.ink3 },
  per: { fontSize: 12.5, color: colors.accentText, fontWeight: '600', marginTop: 6 },
  note: { marginTop: space.s2 },
  cta: { marginTop: space.s4 },
});

/**
 * 3a · Money received, and 3b · part payment.
 *
 * Client, amount, method — in that order, because that is the order a trainer
 * has the facts in. Somebody hands over cash and says what it's for.
 *
 * Two things this sheet refuses to hide. **Gym counter is a full-width third
 * option**, not a smaller one tucked under UPI and Cash, and it says what it
 * means: your cut applies, worked out and shown before you commit. And on a
 * part payment the remainder is stated in amber BEFORE the button, so nobody
 * records ₹4,000 of a ₹9,000 debt and walks away thinking it's settled.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Amount,
  Avatar,
  Button,
  Callout,
  Chip,
  ChoiceCard,
  ChoiceGrid,
  IconBuilding,
  IconCash,
  IconChevron,
  IconRupee,
  IconSearch,
  Keypad,
  Row,
  Seg,
  Sheet,
  applyKey,
  colors,
  space,
  type KeypadKey,
} from '../../../design';
import {
  outstanding,
  packDescription,
  projectedCut,
  rupees,
  type MoneyInput,
  type MoneyPackage,
} from '../../../money/money';
import type { PaymentMethod } from '../../../db/money';

export interface RecordResult {
  clientId: string;
  packageId?: string;
  amount: number;
  method: PaymentMethod;
  gymShareAmount: number;
  sharePercent: number;
}

export default function RecordSheet({
  visible,
  input,
  /** Pre-selects a client — from the chase list, a client's book, or a row menu. */
  clientId,
  packageId,
  onRecord,
  onClose,
}: {
  visible: boolean;
  input: MoneyInput;
  clientId?: string | null;
  packageId?: string | null;
  onRecord: (result: RecordResult) => void;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [who, setWho] = useState<string | null>(clientId ?? null);
  const [pkgId, setPkgId] = useState<string | null>(packageId ?? null);
  const [method, setMethod] = useState<PaymentMethod>('upi_intent');
  const [part, setPart] = useState(false);
  const [typed, setTyped] = useState(0);

  // Reset on each open. A sheet that reopens holding the last client's amount
  // is a sheet that eventually records the wrong number against the wrong name.
  const [seed, setSeed] = useState(visible);
  if (visible !== seed) {
    setSeed(visible);
    if (visible) {
      setWho(clientId ?? null);
      setPkgId(packageId ?? null);
      setMethod('upi_intent');
      setPart(false);
      setTyped(0);
      setPicking(!clientId);
    }
  }

  const client = input.clients.find((c) => c.id === who);

  /** Their open debts, biggest first — the one being paid is almost always top. */
  const debts = useMemo<MoneyPackage[]>(() => {
    if (!who) return [];
    return input.packages
      .filter((p) => p.clientId === who && p.status !== 'cancelled')
      .filter((p) => outstanding(p, input.payments) > 0)
      .sort((a, b) => outstanding(b, input.payments) - outstanding(a, input.payments));
  }, [input.packages, input.payments, who]);

  const debt = debts.find((d) => d.id === pkgId) ?? debts[0] ?? null;
  const owed = debt ? outstanding(debt, input.payments) : 0;
  const amount = part ? typed : owed;
  const remaining = Math.max(0, owed - amount);
  const cut = projectedCut(amount, client, input.gym);

  const owedByClient = useMemo(() => {
    const map = new Map<string, number>();
    for (const pkg of input.packages) {
      if (pkg.status === 'cancelled') continue;
      const left = outstanding(pkg, input.payments);
      if (left <= 0) continue;
      map.set(pkg.clientId, (map.get(pkg.clientId) ?? 0) + left);
    }
    return map;
  }, [input.packages, input.payments]);

  /* --------------------------------------------------------- picking who */

  if (picking) {
    // Everyone who owes something first, then the rest — a payment usually
    // settles a debt, but a client can hand over money with nothing outstanding.
    const rows = [...input.clients].sort((a, b) => {
      const owedA = owedByClient.get(a.id) ?? 0;
      const owedB = owedByClient.get(b.id) ?? 0;
      if (owedA !== owedB) return owedB - owedA;
      return a.name.localeCompare(b.name);
    });

    return (
      <Sheet visible={visible} onClose={onClose} title="Who paid you?">
        {rows.length === 0 ? (
          <Text style={styles.blank}>No clients yet. Add one, then record what they paid.</Text>
        ) : (
          <ScrollView style={styles.picker} keyboardShouldPersistTaps="handled">
            {rows.map((c) => {
              const left = owedByClient.get(c.id) ?? 0;
              return (
                <Row
                  key={c.id}
                  title={c.name}
                  subtitle={left > 0 ? `${rupees(left)} owed` : 'Nothing outstanding'}
                  minHeight={62}
                  style={styles.pickRow}
                  leading={<Avatar name={c.name} size="sm" />}
                  trailing={<IconChevron size={18} color={colors.ink3} />}
                  onPress={() => {
                    setWho(c.id);
                    setPkgId(null);
                    setPicking(false);
                  }}
                />
              );
            })}
          </ScrollView>
        )}
      </Sheet>
    );
  }

  /* ------------------------------------------------------------- 3b · part */

  if (part) {
    return (
      <Sheet visible={visible} onClose={onClose}>
        <Text style={styles.partWho}>
          {client?.name ?? 'Someone'} · {rupees(owed)} owed
        </Text>
        <View style={styles.partAmount}>
          <Amount value={grouped(typed)} size={34} />
        </View>
        <Text style={[styles.partLeft, remaining === 0 && styles.partClear]}>
          {remaining > 0
            ? `${rupees(remaining)} will still be owed`
            : typed > owed
              ? `${rupees(typed - owed)} more than owed — that's fine, it stays as credit`
              : 'That settles it'}
        </Text>

        <Keypad style={styles.pad} onKey={(key: KeypadKey) => setTyped((n) => applyKey(n, key))} />

        <Button
          label={`Record ${rupees(typed)}`}
          size="lg"
          block
          disabled={typed <= 0 || !who}
          style={styles.cta}
          onPress={() =>
            who &&
            onRecord({
              clientId: who,
              packageId: debt?.id,
              amount: typed,
              method,
              gymShareAmount: cut.amount,
              sharePercent: cut.percent,
            })
          }
        />
      </Sheet>
    );
  }

  /* ------------------------------------------------------------- 3a · full */

  return (
    <Sheet visible={visible} onClose={onClose} title="Money received">
      <Row
        title={client?.name ?? 'Pick a client'}
        subtitle={
          debt
            ? `${rupees(owed)} owed · ${packDescription(debt)}`
            : client
              ? 'Nothing outstanding — this will be recorded as credit'
              : 'Tap to choose'
        }
        minHeight={62}
        style={styles.who}
        leading={client ? <Avatar name={client.name} size="sm" /> : <IconSearch size={20} color={colors.ink3} />}
        trailing={<IconChevron size={18} color={colors.ink3} />}
        onPress={() => setPicking(true)}
      />

      <View style={styles.amountBox}>
        <Amount value={grouped(owed)} size={34} />
      </View>

      <Seg style={styles.modes}>
        <Chip label={`Full ${rupees(owed)}`} selected={!part} onPress={() => setPart(false)} />
        <Chip
          label="Part"
          selected={part}
          onPress={() => {
            setTyped(0);
            setPart(true);
          }}
        />
      </Seg>

      {debts.length > 1 ? (
        <Seg style={styles.debts}>
          {debts.map((d) => (
            <Chip
              key={d.id}
              label={`${packDescription(d).replace(/^an? /, '')} · ${rupees(
                outstanding(d, input.payments),
              )}`}
              selected={d.id === debt?.id}
              onPress={() => setPkgId(d.id)}
            />
          ))}
        </Seg>
      ) : null}

      <Text style={styles.label}>How it came in</Text>
      <ChoiceGrid style={styles.choices}>
        <ChoiceCard
          title="UPI"
          subtitle="Into your own account"
          icon={IconRupee}
          selected={method === 'upi_intent'}
          onPress={() => setMethod('upi_intent')}
        />
        <ChoiceCard
          title="Cash"
          subtitle="In your hand"
          icon={IconCash}
          selected={method === 'cash'}
          onPress={() => setMethod('cash')}
        />
        <ChoiceCard
          title="Gym counter"
          subtitle={
            input.gym.name
              ? `They collected it — your cut applies`
              : 'They collected it on your behalf'
          }
          icon={IconBuilding}
          wide
          selected={method === 'gym_front_office'}
          onPress={() => setMethod('gym_front_office')}
        />
      </ChoiceGrid>

      {cut.amount > 0 ? (
        <Callout icon={IconBuilding} style={styles.note}>
          {`${input.gym.name} takes ${rupees(cut.amount)} of this at ${cut.percent}%. ${rupees(
            amount - cut.amount,
          )} is yours.`}
        </Callout>
      ) : null}

      <Button
        label={`Record ${rupees(amount)}`}
        size="lg"
        block
        disabled={amount <= 0 || !who}
        style={styles.cta}
        onPress={() =>
          who &&
          onRecord({
            clientId: who,
            packageId: debt?.id,
            amount,
            method,
            gymShareAmount: cut.amount,
            sharePercent: cut.percent,
          })
        }
      />
    </Sheet>
  );
}

/** "9,000" — Indian grouping without the symbol, which `Amount` draws itself. */
function grouped(n: number): string {
  return rupees(n).slice(1);
}

const styles = StyleSheet.create({
  blank: { fontSize: 13.5, color: colors.ink3, paddingVertical: space.s4 },
  picker: { maxHeight: 380, marginTop: space.s2 },
  pickRow: { marginBottom: space.s2 },

  who: { marginTop: space.s3 },
  amountBox: { alignItems: 'center', marginTop: 18, marginBottom: 4 },
  modes: { justifyContent: 'center', marginBottom: space.s4 },
  debts: { marginBottom: space.s4 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  choices: { marginTop: 10 },
  note: { marginTop: space.s3 },
  cta: { marginTop: 18 },

  partWho: { fontSize: 13.5, color: colors.ink3, textAlign: 'center' },
  partAmount: { alignItems: 'center', marginTop: 10, marginBottom: 2 },
  partLeft: { fontSize: 12.5, textAlign: 'center', color: colors.warn, fontWeight: '600' },
  partClear: { color: colors.ok },
  pad: { marginTop: space.s4 },
});

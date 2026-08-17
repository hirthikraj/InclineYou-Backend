/**
 * 3a · Money received, and 3b · part payment.
 *
 * Client, amount, method — in that order, because that is the order a trainer
 * has the facts in. Somebody hands over cash and says what it's for.
 *
 * The method follows the client, not the trainer. A freelance client pays the
 * trainer directly — UPI or cash, nothing else — while a gym client pays at
 * the counter, full stop: no method to pick, just mark it done, and the gym
 * pays the trainer their part. Showing all three cards to everybody is how a
 * freelance payment ends up with a gym cut on it.
 *
 * One thing this sheet refuses to hide: on a part payment the remainder is
 * stated in amber BEFORE the button, so nobody records ₹4,000 of a ₹9,000
 * debt and walks away thinking it's settled.
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
  const [chosenMethod, setChosenMethod] = useState<PaymentMethod>('upi_intent');
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
      setChosenMethod('upi_intent');
      setPart(false);
      setTyped(0);
      setPicking(!clientId);
    }
  }

  const client = input.clients.find((c) => c.id === who);

  // The method is derived, never trusted from state: switching from a gym
  // client to a freelance one mid-sheet must not leave "gym counter" recorded
  // against money that landed in the trainer's own hand.
  const gymClient = client?.paymentMode === 'gym_collects';
  const method: PaymentMethod = gymClient
    ? 'gym_front_office'
    : chosenMethod === 'gym_front_office'
      ? 'upi_intent'
      : chosenMethod;

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

  // What lands in the trainer's hand. For a gym client the counter took the
  // whole figure and pays the trainer their part, so this sheet talks in the
  // trainer's money — the full figure is the counter's business, and it is
  // still what gets recorded so the client's debt clears correctly. For a
  // freelance client the whole amount is theirs, so take === amount.
  const take = Math.max(0, amount - cut.amount);
  const shown = gymClient ? take : amount;

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
        {/* The keypad takes what the client paid at the counter — that is the
            figure the trainer knows — but the money that is theirs is the cut. */}
        {gymClient && typed > 0 && cut.amount > 0 ? (
          <Text style={styles.partYours}>{`${rupees(take)} of this comes to you`}</Text>
        ) : null}

        <Keypad style={styles.pad} onKey={(key: KeypadKey) => setTyped((n) => applyKey(n, key))} />

        <Button
          label={`Record ${rupees(gymClient ? take : typed)}`}
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

      {/* The headline is the trainer's money: the whole figure for a freelance
          client, only their part when the gym collected and pays it on. */}
      <View style={styles.amountBox}>
        <Amount value={grouped(shown)} size={34} />
      </View>

      <Seg style={styles.modes}>
        <Chip label={`Full ${rupees(shown)}`} selected={!part} onPress={() => setPart(false)} />
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
      {gymClient ? (
        // A gym client has no method to choose — the money went over their
        // counter. Mark it done; the gym pays the trainer their part.
        <ChoiceGrid style={styles.choices}>
          <ChoiceCard
            title="Gym counter"
            subtitle={
              input.gym.name
                ? `${input.gym.name} collected it and pays you your part`
                : 'They collected it and pay you your part'
            }
            icon={IconBuilding}
            wide
            selected
            onPress={() => {}}
          />
        </ChoiceGrid>
      ) : (
        // Freelance: the money comes to the trainer directly, so there is no
        // gym counter to offer.
        <ChoiceGrid style={styles.choices}>
          <ChoiceCard
            title="UPI"
            subtitle="Into your own account"
            icon={IconRupee}
            selected={method === 'upi_intent'}
            onPress={() => setChosenMethod('upi_intent')}
          />
          <ChoiceCard
            title="Cash"
            subtitle="In your hand"
            icon={IconCash}
            selected={method === 'cash'}
            onPress={() => setChosenMethod('cash')}
          />
        </ChoiceGrid>
      )}

      {cut.amount > 0 ? (
        <Callout icon={IconBuilding} style={styles.note}>
          {gymClient
            ? `They paid ${rupees(amount)} at the counter. ${input.gym.name ?? 'The gym'} keeps ${rupees(
                cut.amount,
              )} at ${cut.percent}% and pays you ${rupees(take)}.`
            : `${input.gym.name} takes ${rupees(cut.amount)} of this at ${cut.percent}%. ${rupees(
                take,
              )} is yours.`}
        </Callout>
      ) : null}

      <Button
        label={`Record ${rupees(shown)}`}
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
  partYours: { fontSize: 12.5, textAlign: 'center', color: colors.ink3, marginTop: 2 },
  partClear: { color: colors.ok },
  pad: { marginTop: space.s4 },
});

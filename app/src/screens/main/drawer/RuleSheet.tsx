/**
 * 4e · A nudge rule.
 *
 * When, then, and the message with variables.
 *
 * The two limits at the bottom are **fixed, not settings**: 9am–8pm only, and
 * never twice in seven days to the same person. They are stated here, on the
 * screen where a trainer is configuring everything else, precisely so the absence
 * of a control for them reads as a decision rather than an omission. Some things
 * should not be configurable, and saying which ones is the difference between a
 * constraint and a missing feature.
 *
 * The variable chips insert at the end rather than at the cursor. React Native's
 * `TextInput` gives selection state, but tracking it across a controlled value
 * means the caret jumps on every keystroke on Android — and appending is what
 * somebody composing a short message does anyway.
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RULE_ACTIONS, RULE_META, type RuleCard } from '../../../nudges/rules';
import {
  COOLDOWN_DAYS,
  SEND_FROM_HOUR,
  SEND_TO_HOUR,
} from '../../../nudges/rules';
import { updateRule } from '../../../db/nudges';
import type { RuleAction } from '../../../db/nudges';
import {
  Button,
  Callout,
  CalloutStrong,
  ChoiceCard,
  ChoiceGrid,
  Chip,
  Control,
  IconClock,
  Seg,
  Sheet,
  colors,
  radius,
  space,
  type,
} from '../../../design';

export interface RuleSheetProps {
  /** Null closes it. Carrying the whole rule means the sheet holds no stale state. */
  rule: RuleCard | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function RuleSheet({ rule, onClose, onSaved }: RuleSheetProps) {
  const [threshold, setThreshold] = useState<number | null>(null);
  const [action, setAction] = useState<RuleAction>('ask');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!rule) return;
    setThreshold(rule.threshold);
    setAction(rule.action);
    // The built-in wording when the trainer has never written their own, so the
    // box is never empty and never has to be composed from nothing.
    setMessage(rule.message ?? RULE_META[rule.kind].message);
  }, [rule]);

  if (!rule) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const meta = RULE_META[rule.kind];
  const fallback = meta.message;

  const save = async () => {
    setSaving(true);
    try {
      await updateRule(rule.id, {
        threshold,
        action,
        // Sending the built-in wording back as null keeps the rule tracking the
        // default if the copy is ever improved, rather than freezing today's.
        message: message.trim() === fallback ? null : message,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} title={meta.title}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {meta.options.length ? (
          <>
            <Text style={styles.label}>When</Text>
            <Seg style={styles.seg}>
              {meta.options.map((option) => (
                <Chip
                  key={option}
                  label={`${option} ${meta.unit === 'sessions' ? (option === 1 ? 'session' : 'sessions') : 'days'}`}
                  selected={threshold === option}
                  onPress={() => setThreshold(option)}
                />
              ))}
            </Seg>
          </>
        ) : (
          <Callout style={styles.seg}>
            {rule.kind === 'well_done'
              ? 'This one fires the moment a personal record is logged. There is no threshold to set.'
              : 'This one fires on the day. InclineYou does not collect a date of birth yet, so it has nothing to fire on — the switch is here for when it does.'}
          </Callout>
        )}

        <Text style={styles.label}>Then</Text>
        <ChoiceGrid>
          {RULE_ACTIONS.map((option) => (
            <ChoiceCard
              key={option.key}
              title={option.title}
              subtitle={option.meta}
              selected={action === option.key}
              onPress={() => setAction(option.key)}
            />
          ))}
        </ChoiceGrid>

        <Text style={styles.label}>The message</Text>
        <Control
          size="area"
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder={fallback}
          style={styles.area}
        />

        <Seg style={styles.vars}>
          {meta.variables.map((variable) => (
            <Chip
              key={variable}
              label={variable}
              onPress={() => setMessage((text) => `${text}${text.endsWith(' ') ? '' : ' '}${variable}`)}
            />
          ))}
          {message.trim() !== fallback ? (
            <Chip label="Reset wording" onPress={() => setMessage(fallback)} />
          ) : null}
        </Seg>

        <Callout icon={IconClock} style={styles.note}>
          Nudges only go out between{' '}
          <CalloutStrong>
            {SEND_FROM_HOUR}am and {SEND_TO_HOUR - 12}pm
          </CalloutStrong>
          , and never twice in {COOLDOWN_DAYS} days to the same person. Both limits are fixed, not
          settings.
        </Callout>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={saving ? 'Saving…' : 'Save the rule'}
          variant="primary"
          size="lg"
          block
          loading={saving}
          disabled={saving || !message.trim()}
          onPress={() => void save()}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 460 },
  label: { ...type.micro, color: colors.ink3, marginTop: space.s4, marginBottom: space.s2 },
  seg: {},
  area: { minHeight: 92, borderRadius: radius.r2 },
  vars: { marginTop: space.s3 },
  note: { marginTop: space.s4 },
  footer: { marginTop: space.s4 },
});

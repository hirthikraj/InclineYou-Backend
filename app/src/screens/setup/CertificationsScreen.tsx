/**
 * Screen 02 · Trainer setup · Step 4 of 6 · Certifications.
 *
 * `agent/design system/screens/trainxtrainersetup.html` § 04 — 4a chips,
 * 4b the full searchable list.
 *
 * This is where the category is quietly dishonest. Four of the eight platforms
 * in the teardown collect certifications and NONE of them verify any of it.
 * India has no licensing requirement for personal trainers either — no mandated
 * certificate, no statutory register, no protected title. So we collect what
 * trainers actually hold, we say plainly that we haven't checked it, and the
 * profile will say so too.
 *
 * "Not certified yet" is a first-class option, and an exclusive one: holding it
 * alongside a certificate is a contradiction we should never put on a profile.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SetupStackParamList } from '../../navigation/SetupStack';
import { useSetup } from '../../setup/SetupContext';
import {
  CERTIFICATIONS,
  CERTIFICATIONS_COMMON,
  NOT_CERTIFIED,
  customId,
  labelFor,
} from '../../setup/options';
import {
  Button,
  Callout,
  CalloutStrong,
  IconCheck,
  IconPlus,
  IconSearch,
  IconShield,
  List,
  Pick,
  PickChip,
  Row,
  Search,
  Select,
  Sheet,
  colors,
  space,
  type,
} from '../../design';
import AddOwnSheet from './AddOwnSheet';
import { SetupBar, SetupBody, SetupFoot, SetupScreen, SetupSub, SetupTitle } from './setupLayout';

type Props = {
  navigation: NativeStackNavigationProp<SetupStackParamList, 'Certifications'>;
};

/** One sheet at a time — nesting RN modals is unreliable on Android. */
type Layer = 'none' | 'list' | 'custom';

export default function CertificationsScreen({ navigation }: Props) {
  const { draft, patch, skip } = useSetup();
  const [chosen, setChosen] = useState<string[]>(draft.certifications);
  const [layer, setLayer] = useState<Layer>('none');
  const [query, setQuery] = useState('');

  const toggle = (id: string) => {
    setChosen((current) => {
      let next: string[];
      if (current.includes(id)) {
        next = current.filter((x) => x !== id);
      } else if (id === NOT_CERTIFIED) {
        next = [NOT_CERTIFIED]; // exclusive — it replaces everything
      } else {
        next = [...current.filter((x) => x !== NOT_CERTIFIED), id];
      }
      patch({ certifications: next });
      return next;
    });
  };

  const add = (id: string) => {
    if (!chosen.includes(id)) toggle(id);
  };

  const cont = () => {
    patch({ certifications: chosen });
    navigation.navigate('Languages');
  };

  const onSkip = () => {
    skip('certifications');
    navigation.navigate('Languages');
  };

  // The chips are the head of the list plus anything already picked from the
  // sheet — a selection made in the sheet has to be visible after it closes.
  const chips = useMemo(() => {
    const ids = [...CERTIFICATIONS_COMMON];
    for (const id of chosen) if (!ids.includes(id)) ids.push(id);
    return ids;
  }, [chosen]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CERTIFICATIONS;
    return CERTIFICATIONS.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.note?.toLowerCase().includes(q) ?? false),
    );
  }, [query]);

  return (
    <SetupScreen>
      <SetupBar step="certifications" onBack={() => navigation.goBack()} onSkip={onSkip} />

      <SetupBody>
        <SetupTitle tight>Any certifications?</SetupTitle>
        <SetupSub>Optional. Plenty of excellent trainers in India don't have one.</SetupSub>

        <Select
          placeholder="Search certifications"
          icon={IconSearch}
          onPress={() => {
            setQuery('');
            setLayer('list');
          }}
          style={styles.select}
        />

        <Pick>
          {chips.map((id) => (
            <PickChip
              key={id}
              label={labelFor(id, CERTIFICATIONS)}
              selected={chosen.includes(id)}
              onPress={() => toggle(id)}
            />
          ))}
        </Pick>

        {/* Deliberately plain. This is the sentence that keeps the feature honest. */}
        <Callout icon={IconShield} style={styles.trailing}>
          <CalloutStrong>We don't check these.</CalloutStrong> Whatever you add here is shown to
          clients as something you told us, not something we confirmed. We'll say so on your profile
          too.
        </Callout>
      </SetupBody>

      <SetupFoot>
        <Button label="Continue" variant="primary" size="lg" block onPress={cont} />
      </SetupFoot>

      <Sheet visible={layer === 'list'} onClose={() => setLayer('none')} title="Certifications">
        <Search value={query} onChangeText={setQuery} style={styles.search} />

        {query.trim() ? null : <Text style={styles.micro}>Most common in India</Text>}

        <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
          {matches.length === 0 ? (
            <Text style={styles.empty}>
              Nothing matches "{query.trim()}". Add it below — we'd rather have your real
              certificate than the nearest one on our list.
            </Text>
          ) : (
            <List>
              {matches.map((option) => (
                <Row
                  key={option.id}
                  grouped
                  minHeight={62}
                  title={option.label}
                  subtitle={option.note}
                  selected={chosen.includes(option.id)}
                  onPress={() => toggle(option.id)}
                  trailing={
                    chosen.includes(option.id) ? (
                      <IconCheck size={18} color={colors.accentText} strokeWidth={2.6} />
                    ) : null
                  }
                />
              ))}
            </List>
          )}
        </ScrollView>

        <Button
          label="Add one that isn't listed"
          variant="secondary"
          block
          icon={IconPlus}
          onPress={() => setLayer('custom')}
          style={styles.sheetAction}
        />
      </Sheet>

      <AddOwnSheet
        visible={layer === 'custom'}
        onClose={() => setLayer('none')}
        onAdd={(label) => add(customId(label))}
        title="Add a certification"
        placeholder="K11 — Sports Nutrition"
        hint="Written exactly as it appears on your certificate."
      />
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  select: { marginBottom: 12 },
  trailing: { marginTop: 'auto' },

  search: { marginTop: 12, marginBottom: 14 },
  micro: { ...type.micro, color: colors.ink3, marginBottom: space.s2 },
  sheetList: { flexShrink: 1 },
  empty: { fontSize: 13.5, lineHeight: 20, color: colors.ink3, paddingVertical: space.s4 },
  sheetAction: { marginTop: 12 },
});

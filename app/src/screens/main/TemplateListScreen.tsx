import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { observeTemplates } from '../../db/programs';
import { deleteTemplate } from '../../api/programs';
import { syncDatabase } from '../../db/sync';
import type Template from '../../db/models/Template';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'TemplateList'>;

export default function TemplateListScreen({ navigation }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    const sub = observeTemplates().subscribe(setTemplates);
    return () => sub.unsubscribe();
  }, []);

  const handleDelete = (t: Template) => {
    Alert.alert('Delete template', `Delete "${t.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteTemplate(t.id);
            syncDatabase('delete-template');
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not delete template.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Templates</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('TemplateBuilder')}
          style={styles.addBtn}
        >
          <Text style={styles.addText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('TemplateDetail', { templateId: item.id, templateName: item.name })}
            onLongPress={() => handleDelete(item)}
            activeOpacity={0.75}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              {item.goal ? <Text style={styles.cardMeta} numberOfLines={1}>{item.goal}</Text> : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyHead}>No templates yet</Text>
            <Text style={styles.emptyBody}>
              Tap "+ New" to build a reusable workout structure.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => navigation.navigate('TemplateBuilder')}
            >
              <Text style={styles.emptyBtnText}>Create first template</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.indigo,
  },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { width: 56, alignItems: 'center' },
  backText: { fontSize: 30, color: '#fff', lineHeight: 32 },
  addBtn: { width: 56, alignItems: 'flex-end' },
  addText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  list: { padding: 16, paddingBottom: 40 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardLeft: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardMeta: { fontSize: 13, color: colors.muted, marginTop: 3 },
  chevron: { fontSize: 22, color: colors.border, marginLeft: 8 },

  sep: { height: 10 },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyHead: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 21 },
  emptyBtn: {
    marginTop: 24, backgroundColor: colors.indigo,
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

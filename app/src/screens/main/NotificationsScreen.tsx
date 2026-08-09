/**
 * 3b / 3c · the notification centre.
 *
 * Category chips carry their own unread counts, the unread dot sits on the
 * left, and read rows drop to 62%. Everfit is the only platform in the teardown
 * with a real notification centre; this is that model with the counts moved
 * onto the filters, because a filter that hides everything without saying so is
 * indistinguishable from an empty inbox.
 *
 * Nothing here is stored — every line is derived from facts already in local
 * storage. See `home/notifications.ts` for why.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/MainStack';
import { useDeck } from '../../home/useDeck';
import {
  buildNotifications,
  loadReadAt,
  markAllRead,
  stampFor,
  type NotifCategory,
} from '../../home/notifications';
import {
  AppBar,
  Button,
  Chip,
  Empty,
  IconBack,
  IconBell,
  IconButton,
  Notif,
  Seg,
  colors,
  space,
} from '../../design';

type Filter = 'all' | NotifCategory;

export default function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const deck = useDeck(useIsFocused());
  const [readAt, setReadAt] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const now = Date.now();

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void loadReadAt().then((at) => live && setReadAt(at));
      return () => {
        live = false;
      };
    }, []),
  );

  const feed = useMemo(() => buildNotifications(deck, readAt), [deck, readAt]);
  const items = useMemo(
    () => (filter === 'all' ? feed.items : feed.items.filter((i) => i.category === filter)),
    [feed.items, filter],
  );

  const markRead = () => {
    const at = Date.now();
    void markAllRead(at);
    setReadAt(at);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.inset}>
        <AppBar
          title="Notifications"
          subtitle={feed.unread > 0 ? `${feed.unread} unread` : undefined}
          leading={
            <IconButton icon={IconBack} label="Back" bare size={22} onPress={() => navigation.goBack()} />
          }
          actions={
            feed.unread > 0 ? (
              <Button label="Mark read" variant="text" onPress={markRead} />
            ) : undefined
          }
        />
        {feed.items.length > 0 ? (
          <Seg style={styles.seg}>
            <Chip
              label="All"
              count={feed.counts.all}
              selected={filter === 'all'}
              onPress={() => setFilter('all')}
            />
            <Chip
              label="Payments"
              count={feed.counts.payments}
              selected={filter === 'payments'}
              onPress={() => setFilter('payments')}
            />
            <Chip
              label="Training"
              count={feed.counts.training}
              selected={filter === 'training'}
              onPress={() => setFilter('training')}
            />
          </Seg>
        ) : null}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Empty
            icon={IconBell}
            title={feed.items.length === 0 ? 'Nothing new' : 'Nothing in this filter'}
            body={
              feed.items.length === 0
                ? "Payments, PRs and clients going quiet all land here. We'll only ping you for things that need a decision."
                : 'Switch to All to see the rest.'
            }
            action={
              feed.items.length === 0 ? (
                <Button
                  label="Notification settings"
                  variant="ghost"
                  onPress={() => navigation.navigate('Soon', { title: 'Notification settings' })}
                />
              ) : undefined
            }
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <Notif
              key={item.key}
              subject={item.subject}
              body={item.body}
              time={stampFor(item.at, now)}
              read={item.read}
              onPress={() =>
                item.clientId
                  ? navigation.navigate('ClientDetail', { clientId: item.clientId })
                  : undefined
              }
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  inset: { paddingHorizontal: space.inset },
  seg: { marginBottom: space.s3 },
  list: { paddingBottom: space.s6 },
  empty: { flex: 1, justifyContent: 'center' },
});

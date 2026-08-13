/**
 * `.tx-navbar` — four tabs and the centre action.
 *
 * The four are the daily surfaces. NN/g measured hidden navigation at 57% usage
 * against 86% for a visible/hidden combination, so the rule this bar encodes is
 * not "no hamburger" — it is that nothing daily goes behind one.
 *
 * The centre + is not a fifth tab and never takes the selected state: it opens
 * a sheet and the tab you were on is still the tab you are on. It is also the
 * only control in the system that ignores the label pattern, because a labelled
 * FAB at 56px would push the two right-hand tabs under their minimum width.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, tap } from './tokens';
import { IconPlus, type IconProps } from './icons';

export interface NavTab {
  key: string;
  label: string;
  icon: React.ComponentType<IconProps>;
}

export interface NavBarProps {
  tabs: NavTab[];
  activeKey: string;
  onSelect: (key: string) => void;
  /**
   * The centre +. Sits between tabs 2 and 3.
   *
   * Omitted in the client role, and that is the only difference between the two
   * bars in this app. A trainer creates four different kinds of thing between
   * sessions; a client creates one kind, in one place, and the rest of their app
   * is read-only — so their create actions are contextual and live on the screen
   * that owns them. A global + would open a sheet with one item in it.
   */
  onAdd?: () => void;
  /** § 04: long-pressing + jumps straight to the last action used. */
  onAddLongPress?: () => void;
}

export default function NavBar({ tabs, activeKey, onSelect, onAdd, onAddLongPress }: NavBarProps) {
  const insets = useSafeAreaInsets();
  const split = Math.ceil(tabs.length / 2);

  return (
    <View style={[styles.bar, { paddingBottom: 8 + insets.bottom }]}>
      <View style={styles.items}>
        {tabs.slice(0, split).map((t) => (
          <NavItem key={t.key} tab={t} active={t.key === activeKey} onPress={() => onSelect(t.key)} />
        ))}

        {onAdd ? (
          <Pressable
            onPress={onAdd}
            onLongPress={onAddLongPress}
            accessibilityRole="button"
            accessibilityLabel="Add"
            style={styles.addSlot}
          >
            {({ pressed }) => (
              <View style={[styles.fab, pressed && styles.fabPressed]}>
                <IconPlus size={22} color={colors.accentInk} strokeWidth={2.4} />
              </View>
            )}
          </Pressable>
        ) : null}

        {tabs.slice(split).map((t) => (
          <NavItem key={t.key} tab={t} active={t.key === activeKey} onPress={() => onSelect(t.key)} />
        ))}
      </View>
    </View>
  );
}

function NavItem({ tab, active, onPress }: { tab: NavTab; active: boolean; onPress: () => void }) {
  const tint = active ? colors.accentText : colors.ink3;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <tab.icon size={21} color={tint} />
      <Text style={[styles.label, { color: tint }]}>{tab.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 9,
  },
  items: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 56,
    minHeight: tap.min,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  itemPressed: { opacity: 0.6 },
  label: { fontSize: 9, fontWeight: '800', letterSpacing: 0.81, textTransform: 'uppercase' },

  addSlot: { minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 50,
    height: 50,
    borderRadius: radius.r3,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // The one lift in the system that is genuinely a shadow — the FAB has to
    // read as sitting above the bar, and a lighter surface can't say that here.
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabPressed: { backgroundColor: colors.accentPress },
});

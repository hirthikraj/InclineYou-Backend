/**
 * `.tx-tabs` — views of one record, not destinations.
 *
 * The strip scrolls horizontally because **four tabs overflow at 360dp**, the
 * Android volume width. That is a measured fact about this app's tab set, not a
 * defensive default, and it is why the design system gave tabs a scroller at all.
 *
 * A tab switch is not navigation: no reload, no network, and the header above it
 * does not move. So this is a control, not a navigator — the caller keeps the
 * active key in state and swaps the body underneath.
 */

import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, space } from './tokens';

export interface TabItem {
  key: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}

export default function Tabs({ items, value, onChange, style }: TabsProps) {
  const scroller = useRef<ScrollView>(null);
  const spans = useRef<Record<string, { x: number; width: number }>>({});

  // A tab reached by swiping the body can be off-screen in the strip. Scroll it
  // into view, or the active underline is somewhere the trainer cannot see.
  useEffect(() => {
    const span = spans.current[value];
    if (!span) return;
    scroller.current?.scrollTo({ x: Math.max(0, span.x - space.inset), animated: true });
  }, [value]);

  const measure = (key: string) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    spans.current[key] = { x, width };
  };

  return (
    <View style={[styles.rail, style]}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {items.map((item) => {
          const on = item.key === value;
          return (
            <Pressable
              key={item.key}
              onLayout={measure(item.key)}
              onPress={() => onChange(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={styles.tab}
            >
              <Text style={[styles.label, on && styles.labelOn]}>{item.label}</Text>
              {on ? <View style={styles.underline} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { borderBottomWidth: 1, borderBottomColor: colors.line },
  strip: { gap: space.s5, paddingRight: space.s5 },

  tab: { minHeight: 44, paddingBottom: 12, justifyContent: 'flex-end', flexShrink: 0 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  labelOn: { color: colors.ink },
  // Sits ON the rail's hairline, not above it.
  underline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
});

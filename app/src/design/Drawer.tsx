/**
 * `.tx-drawer` — the container for everything weekly-or-rarer.
 *
 * 312px, not the 360dp Material 3 suggests: on a 390pt screen 360 leaves a
 * 30pt strip of page, which is too little for the scrim to mean anything. At
 * 312 you can still see what you came from, which is the whole reason a drawer
 * is a drawer and not a screen.
 *
 * The list has no fade mask on purpose. A gradient mask dims whatever sits
 * under it, and on a nav list that makes a live destination read as disabled;
 * the pinned footer's top border is the hard edge and the half-row above it is
 * the scroll affordance — the same choice M3's ModalDrawerSheet makes.
 *
 * Slide and scrim are driven here rather than left to Modal's own animation,
 * because Modal only offers "slide from the bottom".
 *
 * ── Motion ────────────────────────────────────────────────────────────────
 *
 * One `progress` value from 0 (closed) to 1 (open) drives everything: the
 * drawer's position, the scrim's opacity, and the drag. Because it is a single
 * value the panel can be picked up mid-animation without anything jumping.
 *
 * Three things make it feel like a drawer rather than a box that appears:
 *
 *   · asymmetric easing. It arrives on an emphasized-decelerate curve, which
 *     covers most of the distance early and settles, and leaves on an
 *     emphasized-accelerate, which does the opposite. A symmetric ease is what
 *     makes a panel read as "animated" instead of moved;
 *   · duration scaled to the distance left to travel. Dismissing a drawer the
 *     trainer has already dragged 80% of the way out should take a fifth of the
 *     time, not the full 220ms — otherwise it appears to hesitate;
 *   · you can throw it away. A left drag tracks the finger one-to-one and a
 *     flick past a third of the width closes it. A drawer that only responds to
 *     its own scrim feels like a dialog.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, curve, maxFontScale, radius, tnum } from './tokens';
import useReduceMotion from './useReduceMotion';
import type { IconProps } from './icons';

const WIDTH = 312;

/** Longer in than out — see the note above. */
const OPEN_MS = 300;
const CLOSE_MS = 220;
/** Below this a scaled duration stops reading as motion and starts as a cut. */
const MIN_MS = 110;
/** Past a third of the way out, let go and it goes. */
const DISMISS_FRACTION = 0.33;
/** …or a flick, however short, at this velocity. */
const DISMISS_VELOCITY = 0.5;

/** Far enough left, and clearly not a scroll. */
function horizontalLeft(dx: number, dy: number): boolean {
  return dx < -6 && Math.abs(dx) > Math.abs(dy) * 1.6;
}

export interface DrawerProps {
  visible: boolean;
  onClose: () => void;
  /** Identity block: avatar, name, the role switch. Sits above the scroll. */
  header?: React.ReactNode;
  /** Sign out and the version line. Pinned, never scrolls away. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export default function Drawer({ visible, onClose, header, footer, children }: DrawerProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  // Kept mounted for the length of the exit animation, or the drawer would
  // vanish instead of sliding out.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  /**
   * Where the panel is, in JS.
   *
   * Written only by the two places that know: our own drag, and the end of an
   * animation. Deliberately NOT kept live with `progress.addListener` — a JS
   * listener on a natively-driven value makes the native side post a value to
   * JS on every single frame, which is exactly the bridge traffic the native
   * driver exists to avoid, and it is enough to visibly cost frames on a
   * mid-range Android phone.
   */
  const at = useRef(visible ? 1 : 0);
  // Position when the current drag began — the origin the finger moves from.
  const from = useRef(1);
  /**
   * True while an entry or exit is running. The drag is refused during it, so
   * `at` can never be consulted mid-flight — which is what lets the listener go.
   * A 300ms window where a swipe doesn't register is not something anyone
   * notices; a drawer that stutters on every open is.
   */
  const busy = useRef(false);
  // Latest, so the gesture doesn't have to be rebuilt every time it changes.
  const dismiss = useRef(onClose);
  dismiss.current = onClose;

  /** Whether the Modal's own window is up. See `onShow` below. */
  const shown = useRef(false);
  const wanted = useRef(visible);
  wanted.current = visible;
  const reduce = useRef(reduceMotion);
  reduce.current = reduceMotion;
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const runTo = useRef((open: boolean) => {
    running.current?.stop();

    const remaining = Math.abs((open ? 1 : 0) - at.current);
    const full = open ? OPEN_MS : CLOSE_MS;

    const anim = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reduce.current ? 0 : Math.max(MIN_MS, full * remaining),
      easing: Easing.bezier(...(open ? curve.emphasizedDecelerate : curve.emphasizedAccelerate)),
      useNativeDriver: true,
    });

    running.current = anim;
    busy.current = true;
    anim.start(({ finished }) => {
      busy.current = false;
      if (!finished) return;
      at.current = open ? 1 : 0;
      if (!open) {
        shown.current = false;
        setMounted(false);
      }
    });
  }).current;

  useEffect(() => {
    if (!visible) {
      // Nothing to slide out of if the window was never raised.
      if (shown.current) runTo(false);
      else setMounted(false);
      return;
    }

    setMounted(true);
    // If the window is already up — reopened before the exit finished
    // unmounting — go straight away. Otherwise `onShow` starts it.
    if (shown.current) {
      runTo(true);
      return;
    }
    // Insurance. `onShow` is documented on both platforms, but a drawer that
    // never arrives because an event didn't fire is not a failure worth
    // risking for the sake of one timer.
    const fallback = setTimeout(() => {
      if (!shown.current && wanted.current) {
        shown.current = true;
        runTo(true);
      }
    }, 150);
    return () => clearTimeout(fallback);
  }, [visible, runTo]);

  /** Snap back after a drag that didn't go far enough to dismiss. */
  const settle = useRef((to: number) => {
    running.current?.stop();
    const anim = Animated.spring(progress, {
      toValue: to,
      useNativeDriver: true,
      bounciness: 0,
      speed: 14,
    });
    // Registered like any other run, so a close arriving mid-spring stops it
    // rather than leaving two animations driving the same value.
    running.current = anim;
    busy.current = true;
    anim.start(({ finished }) => {
      busy.current = false;
      if (finished) at.current = to;
    });
  }).current;

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Left-going and decisively horizontal. The vertical test is what keeps
        // the nav list scrollable — a lazy `dx < 0` would steal every scroll
        // that drifts a few pixels left.
        //
        // Claimed on capture as well, so the drag wins over a destination the
        // finger happens to have landed on. Without it, starting the swipe on a
        // row means fighting that row's press state for the gesture.
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !busy.current && horizontalLeft(g.dx, g.dy),
        onMoveShouldSetPanResponder: (_, g) => !busy.current && horizontalLeft(g.dx, g.dy),
        onPanResponderGrant: () => {
          from.current = at.current;
        },
        onPanResponderMove: (_, g) => {
          // Both directions: a half-closed drawer pushed right should open
          // again. The clamp is what stops it stretching past either end.
          const next = Math.max(0, Math.min(1, from.current + g.dx / WIDTH));
          at.current = next;
          progress.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          // A flick decides regardless of distance — that is what a flick is
          // for. Otherwise the panel goes wherever it is already closest to.
          if (g.vx < -DISMISS_VELOCITY) dismiss.current();
          else if (g.vx > DISMISS_VELOCITY) settle(1);
          else if (at.current < 1 - DISMISS_FRACTION) dismiss.current();
          else settle(1);
        },
        // A call, a notification shade — whatever took the gesture, the drawer
        // should not be left stranded half-open.
        onPanResponderTerminate: () => settle(1),
      }),
    [progress, settle],
  );

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      onRequestClose={onClose}
      animationType="none"
      statusBarTranslucent
      // Android puts a Modal in its own window, and that window is NOT
      // hardware-accelerated by default. Without this the whole panel is
      // composited on the CPU for the length of the slide.
      hardwareAccelerated
      /*
       * The slide starts here, not when `visible` flips.
       *
       * Raising a Modal on Android means creating and laying out a new window,
       * which takes a frame or several. Kicking the animation off at the same
       * moment means its opening frames are dropped while that happens, and a
       * dropped first frame is precisely what reads as "the drawer stutters
       * when I tap the menu". The window comes up fully transparent — progress
       * is still 0 — and only then does anything move.
       */
      onShow={() => {
        shown.current = true;
        if (wanted.current) runTo(true);
      }}
    >
      <View style={styles.layer}>
        {/* The scrim is fully dark before the panel finishes arriving, so the
            page behind stops competing for attention early. */}
        {/* No hardware-texture hint here on purpose: it is one flat colour, and
            promoting a full-screen layer to a texture to fade it costs more
            than the fade does. */}
        <Animated.View
          style={[
            styles.scrim,
            {
              opacity: progress.interpolate({
                inputRange: [0, 0.65, 1],
                outputRange: [0, 0.92, 1],
              }),
            },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
        </Animated.View>

        {/*
          The moving node and the drawn surface are deliberately two views.
          The slider holds nothing but the transform — no background, no
          rounded corners, no clip — so each frame moves a plain layer. Put
          the radius and `overflow: hidden` on the node being animated and
          Android re-clips a 312 × full-height rounded rect every frame.
        */}
        <Animated.View
          {...pan.panHandlers}
          // Android only. `shouldRasterizeIOS` would cache a 312 × full-height
          // bitmap that has to be thrown away and redrawn the moment a badge
          // count lands, and iOS composites this fine without it.
          renderToHardwareTextureAndroid
          style={[
            styles.slider,
            {
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-WIDTH, 0] }) },
              ],
            },
          ]}
        >
          <View style={styles.drawer}>
            {header ? (
              <View style={[styles.head, { paddingTop: insets.top + 10 }]}>{header}</View>
            ) : null}

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {footer ? (
              <View style={[styles.foot, { paddingBottom: 8 + insets.bottom }]}>{footer}</View>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ pieces */

export function DrawerLabel({ children }: { children: string }) {
  return (
    <Text style={styles.groupLabel} accessibilityRole="header">
      {children}
    </Text>
  );
}

export interface DrawerItemProps {
  icon: React.ComponentType<IconProps>;
  label: string;
  onPress?: () => void;
  /** Renders the pill indicator. One per drawer, and only for a real route. */
  current?: boolean;
  /**
   * Danger-filled when the number is something to act on; `quiet` for a count
   * that is only information. Never badge a destination you can't clear.
   */
  badge?: number | string;
  quietBadge?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function DrawerItem({
  icon: Icon,
  label,
  onPress,
  current = false,
  badge,
  quietBadge = false,
  style,
}: DrawerItemProps) {
  const tint = current ? colors.accentText : colors.ink3;
  const hasBadge = badge !== undefined && badge !== null && badge !== 0 && badge !== '';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      accessibilityLabel={hasBadge ? `${label}, ${badge}` : label}
      style={({ pressed }) => [
        styles.item,
        current && styles.itemCurrent,
        pressed && !current && styles.itemPressed,
        style,
      ]}
    >
      <Icon size={21} color={tint} />
      <Text
        numberOfLines={1}
        style={[styles.itemLabel, current && styles.itemLabelCurrent]}
      >
        {label}
      </Text>
      {hasBadge ? (
        <View style={[styles.badge, quietBadge && styles.badgeQuiet]}>
          <Text
            style={[styles.badgeText, quietBadge && styles.badgeTextQuiet]}
            maxFontSizeMultiplier={maxFontScale.micro}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function DrawerVersion({ children, onPress }: { children: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <Text style={styles.version}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },

  /** The moving node: transform only. See the note at the render site. */
  slider: { width: WIDTH, height: '100%' },

  drawer: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopRightRadius: radius.r4,
    borderBottomRightRadius: radius.r4,
    overflow: 'hidden',
    // iOS only. Android's `elevation` is deliberately absent: it makes the
    // platform recompute a shadow for a 312 × full-height view on every frame
    // of the slide, and against a 66% scrim on a near-black canvas the shadow
    // it buys is not visible anyway. The scrim is the depth cue here.
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 10, height: 0 },
  },

  head: { paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  body: { flex: 1, minHeight: 0 },
  bodyContent: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 },
  foot: { borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 10, paddingTop: 8 },

  groupLabel: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink3,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: radius.full,
  },
  itemCurrent: { backgroundColor: colors.accentSoft },
  itemPressed: { backgroundColor: colors.surface2 },
  itemLabel: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '500', letterSpacing: -0.15, color: colors.ink2 },
  itemLabelCurrent: { color: colors.accentText, fontWeight: '600' },

  badge: {
    minWidth: 22,
    minHeight: 22,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: colors.dangerFill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeQuiet: { backgroundColor: colors.surface3 },
  badgeText: { fontSize: 11, fontWeight: '800', color: colors.dangerFillInk, ...tnum },
  badgeTextQuiet: { color: colors.ink2 },

  version: {
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 2,
    fontSize: 11,
    color: colors.ink3,
    letterSpacing: 0.33,
  },
});

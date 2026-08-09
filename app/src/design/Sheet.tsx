/**
 * `.tx-sheet` — the bottom sheet.
 *
 * Anything that would be a dropdown on the web is a sheet here: the option
 * lists in this app need search, and a wheel picker shows three rows at a time.
 *
 * The scrim dismisses, as does the hardware back button on Android — `Modal`
 * gives us `onRequestClose` for free, and a sheet you can only leave by finding
 * the right button is the single most-reported feel-bad in mobile forms.
 *
 * ── Motion ────────────────────────────────────────────────────────────────
 *
 * Same architecture as `Drawer`, and for the same reasons. `Modal`'s built-in
 * `animationType="slide"` was doing this before, which gave no control over
 * easing, no scrim fade, no way to throw the sheet away, and — the part that
 * was actually felt — started moving while Android was still raising the
 * Modal's window, so the opening frames were dropped.
 *
 * So: one `progress` value from 0 to 1 drives the sheet's position and the
 * scrim together, the slide starts from `onShow` once the window is up and the
 * sheet has been measured, and the moving node carries nothing but a transform.
 *
 * The drag lives on the grab handle rather than the whole sheet. Several of
 * these hold scrolling lists, and a downward drag inside a list has to scroll
 * it — a sheet that dismisses when you try to scroll up through options is
 * worse than one that doesn't drag at all.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, curve, radius, space } from './tokens';
import useKeyboardVisible from './useKeyboardVisible';
import useReduceMotion from './useReduceMotion';

/** Leaves the screen behind visible enough to keep your bearings. */
const MAX_HEIGHT = '88%';

const OPEN_MS = 300;
const CLOSE_MS = 220;
const MIN_MS = 110;
/** Dragged more than a third of its own height, let go and it goes. */
const DISMISS_FRACTION = 0.33;
const DISMISS_VELOCITY = 0.6;

/** Until the sheet has been measured, park it below any screen we might be on. */
const OFFSCREEN = Dimensions.get('window').height;

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function Sheet({ visible, onClose, title, children, style }: SheetProps) {
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();
  const reduceMotion = useReduceMotion();

  // Kept mounted for the length of the exit, or the sheet would vanish
  // instead of sliding out.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  /**
   * Where the sheet is, in JS. Written only by our own drag and by the end of
   * an animation — never by a listener on `progress`, which would make the
   * native side post a value to JS on every frame and undo the whole point of
   * the native driver.
   */
  const at = useRef(visible ? 1 : 0);
  const from = useRef(1);
  /** True while an entry or exit is running; the drag stands down during it. */
  const busy = useRef(false);
  /** Where the current run is headed, so a second trigger can't restart it. */
  const target = useRef<number | null>(null);
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const shown = useRef(false);
  const measured = useRef(0);
  const [height, setHeight] = useState(0);
  const wanted = useRef(visible);
  wanted.current = visible;
  const reduce = useRef(reduceMotion);
  reduce.current = reduceMotion;
  const dismiss = useRef(onClose);
  dismiss.current = onClose;

  const runTo = useRef((open: boolean) => {
    running.current?.stop();
    target.current = open ? 1 : 0;

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
        target.current = null;
        setMounted(false);
      }
    });
  }).current;

  /**
   * The sheet may only start moving once its window is up AND it has been
   * measured — it slides by its own height, and animating from a guess is how
   * a short sheet ends up appearing to fall from the top of the screen.
   */
  const openWhenReady = useCallback(() => {
    if (!wanted.current || target.current === 1) return;
    if (!shown.current || measured.current <= 0) return;
    runTo(true);
  }, [runTo]);

  useEffect(() => {
    if (!visible) {
      if (shown.current) runTo(false);
      else setMounted(false);
      return;
    }

    setMounted(true);
    openWhenReady();

    // Insurance, as in `Drawer`: a sheet that never arrives because an event
    // didn't fire is not worth risking to save one timer.
    const fallback = setTimeout(() => {
      if (wanted.current && target.current !== 1) {
        shown.current = true;
        if (measured.current <= 0) measured.current = OFFSCREEN;
        runTo(true);
      }
    }, 200);
    return () => clearTimeout(fallback);
  }, [visible, runTo, openWhenReady]);

  const settle = useRef((to: number) => {
    running.current?.stop();
    target.current = to;
    const anim = Animated.spring(progress, {
      toValue: to,
      useNativeDriver: true,
      bounciness: 0,
      speed: 14,
    });
    running.current = anim;
    busy.current = true;
    anim.start(({ finished }) => {
      busy.current = false;
      if (finished) at.current = to;
    });
  }).current;

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const next = e.nativeEvent.layout.height;
      if (next <= 0 || Math.abs(next - measured.current) < 1) return;
      measured.current = next;
      setHeight(next);
      openWhenReady();
    },
    [openWhenReady],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Downward and decisively vertical. The handle is not on top of
        // anything scrollable, but the test keeps a sloppy tap from becoming a
        // dismissal.
        onMoveShouldSetPanResponder: (_, g) =>
          !busy.current && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.6,
        onPanResponderGrant: () => {
          from.current = at.current;
        },
        onPanResponderMove: (_, g) => {
          const travel = measured.current || OFFSCREEN;
          const next = Math.max(0, Math.min(1, from.current - g.dy / travel));
          at.current = next;
          progress.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          if (g.vy > DISMISS_VELOCITY) dismiss.current();
          else if (g.vy < -DISMISS_VELOCITY) settle(1);
          else if (at.current < 1 - DISMISS_FRACTION) dismiss.current();
          else settle(1);
        },
        onPanResponderTerminate: () => settle(1),
      }),
    [progress, settle],
  );

  if (!mounted) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [height || OFFSCREEN, 0],
  });

  return (
    <Modal
      visible
      transparent
      onRequestClose={onClose}
      animationType="none"
      statusBarTranslucent
      // Android gives a Modal its own window, and that window is not
      // hardware-accelerated unless asked.
      hardwareAccelerated
      onShow={() => {
        shown.current = true;
        openWhenReady();
      }}
    >
      <View style={styles.layer}>
        {/* Not a button in the reading order — the sheet's own controls are.
            It exists so a tap outside gets you out. */}
        <Animated.View style={[styles.scrim, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        {/* The height cap lives here, on the direct child of a flex:1 parent —
            a percentage against the auto height of the sheet itself resolves to
            nothing, and the sheet would grow past the top of the screen. */}
        <KeyboardAvoidingView style={styles.dock} behavior="padding" enabled={keyboardUp}>
          {/* Transform only: no background, no corners, no clip. Whatever is
              being moved every frame should be as plain as possible. */}
          <Animated.View
            onLayout={onLayout}
            renderToHardwareTextureAndroid
            style={[styles.mover, { transform: [{ translateY }] }]}
          >
            <View
              style={[
                styles.sheet,
                { paddingBottom: space.s5 + (keyboardUp ? 0 : insets.bottom) },
                style,
              ]}
            >
              <View {...pan.panHandlers} style={styles.grip}>
                <View style={styles.grab} />
                {title ? <Text style={styles.title}>{title}</Text> : null}
              </View>
              {children}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  dock: { maxHeight: MAX_HEIGHT },
  // RN defaults flexShrink to 0, so without this the cap above is ignored.
  mover: { flexShrink: 1 },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.r4,
    borderTopRightRadius: radius.r4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.s3,
    paddingHorizontal: space.inset,
    // iOS only. Android's `elevation` is deliberately absent: it makes the
    // platform recompute a shadow for the full width of the sheet on every
    // frame of the slide, and the scrim behind it is already the depth cue.
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -8 },
  },
  /** The drag zone: the grabber and the title, with room around them. */
  grip: { paddingBottom: space.s2 },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    alignSelf: 'center',
    marginBottom: space.s4,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.38,
    color: colors.ink,
    marginBottom: space.s2,
  },
});

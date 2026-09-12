/**
 * InclineYou — the mark, the tile, the lockup and the cold-start lift.
 *
 * Ported from § 35 of `agent/design system/inclineyoudesignsystem.html` and frames
 * 0a–0c of `agent/design system/screens/inclineyouloginotp.html`. The geometry is
 * lifted unit for unit off the 100 × 100 box the design file draws on; nothing
 * here is re-proportioned.
 *
 * WHERE IT APPEARS (§ 35.5) — this list is the whole of it:
 *   · Launch          full lockup, animated, once     → `Splash`
 *   · Auth headers    tile, 46px, mark alone          → `LogoTile`
 *   · Trainer setup   tile, 46px, mark alone          → `LogoTile`
 *   · App icon        tile, mark at 72%               → `assets/icon.png`
 *   · In-app          nowhere. The drawer header carries the trainer, not us.
 *
 * THE CONTRAST RULE that decides the colourway: #C6F24E on white is 1.3:1, so
 * lime is a FILL, never a stroke on a light ground. On the tile both the bar
 * and the figure knock out in `accentInk` (15.2:1). On canvas the figure is
 * `ink` and only the bar is lime. The app is dark-only today, so `colors` is
 * the dark palette; when a theme provider lands, `fig`/`acc` are the two props
 * that need to follow it — `accent` on dark, `accentText` on light.
 *
 * ARCHIVO is the brand face for the wordmark and it is not loaded — no
 * expo-font in this project. `REP` therefore renders in the platform UI face at
 * weight 800. It is the one place the port knowingly differs from the design
 * file; loading Archivo is a one-line change to `word` below once the font is
 * bundled.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type EasingFunction,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { colors, radius, space } from './tokens';
import useReduceMotion from './useReduceMotion';

/* ------------------------------------------------------------------ the mark */

/** The drawing box. Every number below is in these units. */
const BOX = 100;

/** § 35.3 — below this the 11-unit stroke stops surviving. */
export const MARK_MIN = 24;

/** § 35.5 — the auth-header tile, and the 72% the mark sits at inside it. */
export const TILE = 46;
const TILE_MARK = 0.72;

export interface LogoMarkProps {
  size?: number;
  /** The figure — `ink` on canvas, `accentInk` on a lime field. */
  fig?: string;
  /** The barbell. Lime on dark, `accentText` on light, `accentInk` on a field. */
  acc?: string;
  /**
   * Screen-reader name. Pass `null` when a wrapper already carries it — a tile
   * that announces "InclineYou" around a mark that also announces "InclineYou" is read
   * twice.
   */
  label?: string | null;
  style?: StyleProp<ViewStyle>;
}

/**
 * The mark, at rest. Nine elements: bar, four plates, legs, head, torso, arms.
 *
 * Draw order is load-bearing — the figure's arms pass OVER the bar, which is
 * what makes it read as someone holding it rather than standing behind it.
 */
export function LogoMark({
  size = 64,
  fig = colors.ink,
  acc = colors.accent,
  label = 'InclineYou',
  style,
}: LogoMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      fill="none"
      style={style}
      accessible={label != null}
      accessibilityRole={label != null ? 'image' : undefined}
      accessibilityLabel={label ?? undefined}
    >
      {/* bar and plates. Plate axis is y20 — the same axis as the bar; half a
          unit of drift here is 5px of misregistration on a 1024 export. */}
      <Rect x={4} y={16} width={92} height={8} rx={3} fill={acc} />
      <Rect x={4} y={13} width={7} height={14} fill={fig} />
      <Rect x={89} y={13} width={7} height={14} fill={fig} />
      <Rect x={16} y={7} width={10} height={26} fill={fig} />
      <Rect x={74} y={7} width={10} height={26} fill={fig} />
      {/* Butt caps and no join radius, against the icon family's round caps.
          This is a logged brand-layer exception, not an oversight. */}
      <Path d="M28 93 C28 60 72 60 72 93" stroke={fig} strokeWidth={11} fill="none" />
      <Circle cx={50} cy={35} r={9} fill={fig} />
      <Path d="M50 43 L50 64" stroke={fig} strokeWidth={11} fill="none" />
      <Path d="M33 22 C34 56 66 56 67 22" stroke={fig} strokeWidth={11} fill="none" />
    </Svg>
  );
}

/**
 * Lime as a FIELD with the mark knocked out of it — the one form in which the
 * brand colour survives on any ground, and the strongest use of it anywhere in
 * the product. This is the auth header and the app icon.
 */
export function LogoTile({
  size = TILE,
  corner = radius.r3,
  style,
}: {
  size?: number;
  /** `.brandmark` ships at r3. The 1024 icon uses 30/128 of its size. */
  corner?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="InclineYou"
      style={[styles.tile, { width: size, height: size, borderRadius: corner }, style]}
    >
      <LogoMark
        size={Math.round(size * TILE_MARK)}
        fig={colors.accentInk}
        acc={colors.accentInk}
        label={null}
      />
    </View>
  );
}

/* ---------------------------------------------------------------- the motion
 *
 * § 35.4. Four transforms on a silhouette that is never redrawn, staggered in
 * the order a lift actually happens: legs drive, hips follow, bar travels, arms
 * lock out last — and the plates keep moving for 180ms after the bar has
 * stopped, which is the detail that makes a loaded bar read as heavy.
 *
 * 1.4s, once, on cold start. This is the ONE place the system's 320ms motion
 * ceiling does not apply, because a splash is not an interaction.
 *
 * WHY LAYERED VIEWS AND NOT ONE ANIMATED <Svg>: react-native-svg can take
 * Animated props, but only off the JS thread — and this runs during cold start,
 * when the JS thread is the busiest it will ever be, restoring a session and
 * opening a database. Six absolutely-positioned Views over one shared 100-unit
 * viewBox animate on the native driver instead, so the lift holds 60fps while
 * all of that resolves behind it. The layers overlay exactly, in the same draw
 * order as `LogoMark`.
 * -------------------------------------------------------------------------- */

/** § 35.4 · the whole lift. */
export const LIFT_MS = 1400;

/**
 * The arms start last and therefore finish last, so the lift is not seated
 * until `LIFT_MS + ARMS_DELAY`. Anything waiting on the splash waits on this.
 */
const ARMS_DELAY = 90;

/** One master clock drives every track. */
const TOTAL_MS = LIFT_MS + ARMS_DELAY;

const DRIVE = Easing.bezier(0.16, 0.84, 0.24, 1); // fast out of the hole, long settle
const SETTLE = Easing.bezier(0.34, 1.56, 0.64, 1); // the plate overshoot only
const SOFT = Easing.bezier(0.22, 1, 0.36, 1); // word and tagline

/** A CSS keyframe: `62%{transform:translateY(-4px)}` is `[62, -4]`. */
type Key = [pct: number, value: number];

/** A sampled track, ready to hand to `Animated.Value.interpolate`. */
type Track = { inputRange: number[]; outputRange: number[] };

/**
 * Sampling resolution across the whole lift: 180 steps over 1490ms, ~8ms, or
 * two samples per frame at 60fps. Measured against the continuous curve, the
 * worst error on any track is 0.33px at a 64px mark — and that is on the bar
 * at peak velocity, where nothing is legible anyway. 90 steps put it at 0.93px;
 * the array costs nothing, so it is not the place to economise.
 */
const STEPS = 180;

/** CSS applies the timing function to each INTERVAL, not once across the track. */
function keyframe(keys: Key[], easing: EasingFunction, pct: number): number {
  if (pct <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [p0, v0] = keys[i - 1];
    const [p1, v1] = keys[i];
    if (pct <= p1) return v0 + (v1 - v0) * easing(p1 === p0 ? 1 : (pct - p0) / (p1 - p0));
  }
  return keys[keys.length - 1][1];
}

/**
 * A CSS keyframe list, baked into one interpolation off a linear master clock.
 *
 * The obvious port is one `Animated.sequence` per track with a `timing` per
 * keyframe interval, and it is the wrong one: a sequence hands control back to
 * JS at every boundary to start the next leg, which is ~20 round trips during
 * the exact 1.5 seconds the JS thread is restoring a session and opening a
 * database. Sampling the eased curve up front turns all of it into interpolated
 * output on ONE natively-driven value — a single start call, no handoffs, and
 * the cubic-beziers survive intact because they are baked into the samples
 * rather than asked for at runtime.
 *
 * `delay` is the track's own stagger, in ms, folded into the sampling so the
 * clock stays common to everything.
 */
function bake(keys: Key[], easing: EasingFunction, delay = 0): Track {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const clock = i / STEPS;
    inputRange.push(clock);
    /* Master clock → this track's own progress, in percent, clamped: before
       its delay it holds the first key, after its 1.4s it holds the last. */
    const local = ((clock * TOTAL_MS - delay) / LIFT_MS) * 100;
    outputRange.push(keyframe(keys, easing, local));
  }
  return { inputRange, outputRange };
}

/** The same track read through a function — `(1-s)` corrections, px scaling. */
function derive(t: Track, fn: (v: number) => number): Track {
  return { inputRange: t.inputRange, outputRange: t.outputRange.map(fn) };
}

/* The tracks, straight off the @keyframes blocks in the design system. */

/** legs · scaleY — the 90ms dip before the drive. Anticipation is the cheapest
 *  thing in animation and the first thing missing from most of it. */
const LEGS: Key[] = [[0, 0.8], [8, 0.755], [62, 1.035], [80, 0.995], [100, 1]];
/** hips follow */
const UPPER: Key[] = [[0, 26], [6, 26], [66, -3.5], [84, 0.7], [100, 0]];
/** the bar travels */
const BAR: Key[] = [[0, 56], [8, 56], [68, -4], [85, 0.9], [100, 0]];
/** arms lock out last. Held at .62 and not lower: non-uniform scale on a
 *  stroked path distorts stroke weight, and at .22 the arc became a flat shelf
 *  drawn in two different weights. */
const ARMS: Key[] = [[0, 0.62], [10, 0.62], [70, 1.045], [87, 0.99], [100, 1]];
/** the plates keep moving 180ms AFTER the bar has stopped — the heavy read */
const PLATES: Key[] = [[0, 0], [62, 0], [74, 2.4], [88, -0.5], [100, 0]];
/** the accent bloom at lockout */
const BLOOM: Key[] = [[0, 0], [60, 0], [70, 1], [88, 0], [100, 0]];
/** REP enters at 58%, while the bar is still travelling. Sequential beats read
 *  as a slideshow; overlapping ones read as one movement. */
const WORD: Key[] = [[0, 0], [58, 0], [76, 1], [100, 1]];
const TAG: Key[] = [[0, 0], [78, 0], [97, 1], [100, 1]];

const T = {
  legs: bake(LEGS, DRIVE),
  upper: bake(UPPER, DRIVE, 40),
  bar: bake(BAR, DRIVE, 60),
  arms: bake(ARMS, DRIVE, ARMS_DELAY),
  plates: bake(PLATES, SETTLE),
  bloom: bake(BLOOM, Easing.linear),
  word: bake(WORD, SOFT),
  tag: bake(TAG, SOFT),
};

/**
 * The correction that turns a centre-anchored scaleY into one anchored at `y`.
 *
 * React Native scales about the view's centre, where the CSS anchors these two
 * to the bottom of the element's OWN box — `transform-box: fill-box`. The
 * identity is exact: scaling about y equals scaling about the centre and then
 * translating by (1 − s)(y − 50). It has to be paired BEFORE the `scaleY` in
 * the transform list, because RN applies the list right to left.
 *
 * `transformOrigin` would say this in one line, but whether it survives the
 * native driver is not something to find out on a cold start.
 */
const anchoredAt = (t: Track, y: number) => derive(t, (s) => (1 - s) * (y - BOX / 2));

const layer = StyleSheet.absoluteFillObject;

/** Stands in for the 3px blur the CSS bloom has and React Native does not. */
const BLOOM_PEAK = 0.5;

/**
 * The mark, lifting. Rest values are the same numbers `LogoMark` draws at, so
 * the last frame of the animation and the static mark are the same image.
 */
function LiftMark({ size, clock }: { size: number; clock: Animated.Value }) {
  /* Built once. The splash re-renders while the lift is running — `isLoading`
     resolving is exactly that — and handing the same view a NEW interpolation
     node mid-flight means detaching and re-attaching a native animated prop for
     no reason. Same clock, same size, same nodes. */
  const a = useMemo(() => {
    /* SVG units → px. Every keyframe above is in the design file's units, so
       the constants stay readable against the CSS and the scaling happens
       here. */
    const u = size / BOX;
    const px = (t: Track) => clock.interpolate(derive(t, (v) => v * u));
    return {
      bar: px(T.bar),
      upper: px(T.upper),
      plates: px(T.plates),
      legs: clock.interpolate(T.legs),
      legsAnchor: px(anchoredAt(T.legs, 93)),
      arms: clock.interpolate(T.arms),
      armsAnchor: px(anchoredAt(T.arms, 53)),
      bloom: clock.interpolate(derive(T.bloom, (v) => v * BLOOM_PEAK)),
    };
  }, [clock, size]);

  const frame = { width: size, height: size, viewBox: `0 0 ${BOX} ${BOX}`, fill: 'none' as const };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="InclineYou"
      style={{ width: size, height: size }}
    >
      {/* The CSS blurs this 3px, which React Native has no equivalent for on a
          native-driven layer. A hard-edged pill at full strength would read as
          a slab, so the peak steps down instead of the edge softening. */}
      <Animated.View pointerEvents="none" style={[layer, { opacity: a.bloom }]}>
        <Svg {...frame}>
          <Rect x={0} y={13} width={100} height={14} rx={7} fill={colors.accent} />
        </Svg>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[layer, { transform: [{ translateY: a.bar }] }]}>
        <Svg {...frame}>
          <Rect x={4} y={16} width={92} height={8} rx={3} fill={colors.accent} />
        </Svg>
      </Animated.View>

      {/* The plates ride the bar AND settle on their own — two translates on
          one axis, exactly as the nested CSS groups compose. */}
      <Animated.View
        pointerEvents="none"
        style={[layer, { transform: [{ translateY: a.bar }, { translateY: a.plates }] }]}
      >
        <Svg {...frame}>
          <Rect x={4} y={13} width={7} height={14} fill={colors.ink} />
          <Rect x={89} y={13} width={7} height={14} fill={colors.ink} />
          <Rect x={16} y={7} width={10} height={26} fill={colors.ink} />
          <Rect x={74} y={7} width={10} height={26} fill={colors.ink} />
        </Svg>
      </Animated.View>

      {/* `transform-box: fill-box; transform-origin: 50% 100%` — the bottom of
          the LEGS' own box, y93, not the bottom of the 100 box, so the drive
          pushes UP out of the floor instead of stretching about the middle. */}
      <Animated.View
        pointerEvents="none"
        style={[layer, { transform: [{ translateY: a.legsAnchor }, { scaleY: a.legs }] }]}
      >
        <Svg {...frame}>
          <Path d="M28 93 C28 60 72 60 72 93" stroke={colors.ink} strokeWidth={11} fill="none" />
        </Svg>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[layer, { transform: [{ translateY: a.upper }] }]}>
        <Svg {...frame}>
          <Circle cx={50} cy={35} r={9} fill={colors.ink} />
          <Path d="M50 43 L50 64" stroke={colors.ink} strokeWidth={11} fill="none" />
        </Svg>
      </Animated.View>

      {/* The arms sit inside the upper group, so they carry its translate and
          fold about the bottom of their own box (y53) on top of it. */}
      <Animated.View
        pointerEvents="none"
        style={[
          layer,
          { transform: [{ translateY: a.upper }, { translateY: a.armsAnchor }, { scaleY: a.arms }] },
        ]}
      >
        <Svg {...frame}>
          <Path d="M33 22 C34 56 66 56 67 22" stroke={colors.ink} strokeWidth={11} fill="none" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* --------------------------------------------------------------- the lockup */

export interface LogoLockupProps {
  size?: number;
  /** Runs the lift once on mount. Ignored when the OS asks for reduced motion. */
  animated?: boolean;
  tagline?: boolean;
  /** Fires when the lift has seated — or immediately, if it never ran. */
  onDone?: () => void;
}

/**
 * Mark, word and tagline. § 35.5: this is used at LAUNCH AND NOWHERE ELSE.
 * Once a user is past the splash they know what they opened, and a wordmark in
 * an app header is a logo talking to itself.
 */
export function LogoLockup({
  size = 64,
  animated = false,
  tagline = true,
  onDone,
}: LogoLockupProps) {
  const reduced = useReduceMotion();
  /* Frozen at the REST frame, never mid-lift — a logo caught halfway reads as a
     failed render rather than as a still. */
  const lift = animated && !reduced;

  /**
   * The one clock. Every track — mark, word, tagline — is an interpolation off
   * this, so the whole lockup moves on a single natively-driven value and there
   * is exactly one animation to start, stop and wait on.
   */
  const clock = useRef(new Animated.Value(lift ? 0 : 1)).current;
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    /* Nothing to wait for when the frame is already at rest. Reported on the
       next tick rather than during the effect, so a caller that unmounts this
       on `onDone` is not unmounting a component that is still mounting. */
    if (!lift) {
      const t = setTimeout(() => done.current?.(), 0);
      return () => clearTimeout(t);
    }
    clock.setValue(0);
    const run = Animated.timing(clock, {
      toValue: 1,
      duration: TOTAL_MS,
      easing: Easing.linear, // the shaping lives in the baked tracks, not here
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) done.current?.();
    });
    return () => run.stop();
  }, [lift, clock]);

  const wordStyle = {
    opacity: clock.interpolate(T.word),
    transform: [
      { translateY: clock.interpolate(derive(T.word, (w) => (1 - w) * 7)) },
      { scale: clock.interpolate(derive(T.word, (w) => 0.965 + w * 0.035)) },
    ],
  };
  const tagStyle = {
    opacity: clock.interpolate(T.tag),
    transform: [{ translateY: clock.interpolate(derive(T.tag, (t) => (1 - t) * 4)) }],
  };

  /* The word is sized off the mark, not hard-coded: the design file draws 52 on
     a 64 mark, and the lockup has to hold that ratio at any size. */
  const wordSize = Math.round(size * 0.8125);

  return (
    <View style={styles.lockupWrap}>
      <View style={styles.lockup}>
        {lift ? <LiftMark size={size} clock={clock} /> : <LogoMark size={size} />}
        <Animated.Text
          allowFontScaling={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.word,
            { fontSize: wordSize, lineHeight: wordSize, letterSpacing: wordSize * -0.035 },
            wordStyle,
          ]}
        >
          REP
        </Animated.Text>
      </View>
      {tagline ? (
        <Animated.Text allowFontScaling={false} style={[styles.tagline, tagStyle]}>
          TRAIN · TRACK · GROW
        </Animated.Text>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------- the splash
 *
 * Frames 0a–0c. The lift runs once on cold start and it NEVER gates data: local
 * data resolves behind it, which is the whole point of FR-8. A returning
 * trainer sees 0b and lands on Home without touching a keyboard.
 *
 * WHAT SITS IN FRONT OF THIS: the native splash, configured by the
 * expo-splash-screen plugin in app.json as `#08090B` — the canvas, and
 * deliberately no visible mark. `App` holds it up rather than letting it
 * auto-hide, and `Splash` drops it on its own first layout, so the two canvases
 * cross over with neither of them absent for a frame.
 *
 * The tempting config is the mark on that screen too, and it is wrong. The
 * native splash can only centre its image, while this lockup centres the mark
 * and the REP wordmark TOGETHER — which puts the mark about 50px left of centre,
 * 13% of the width of a 390pt screen. A mark that appears centred and then jumps
 * sideways the instant JS boots is worse than no mark at all. Canvas to canvas
 * is an invisible handoff, and the lift then owns the whole brand moment,
 * starting from nothing the way the design file draws it.
 *
 * `image` still has to be SET to get there: the plugin writes
 * `windowSplashScreenAnimatedIcon` into styles.xml unconditionally, so omitting
 * it leaves a dangling `@drawable/splashscreen_logo` that fails resource
 * linking. `assets/splash-none.png` is a 1×1 transparent pixel, which the
 * plugin flattens onto `backgroundColor` — the drawable that ships is a solid
 * canvas-coloured square on a canvas-coloured window.
 *
 * `assets/splash-icon.png` is the mark in the on-canvas colourway and is
 * referenced by nothing. It is kept for the day launch shows something other
 * than the lockup.
 * -------------------------------------------------------------------------- */

function versionLine(): string {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build =
    Constants.nativeBuildVersion ??
    Constants.expoConfig?.android?.versionCode ??
    Constants.expoConfig?.ios?.buildNumber ??
    null;
  return build ? `InclineYou ${version} (${build})` : `InclineYou ${version}`;
}

export interface SplashProps {
  /**
   * Frame 0b — "Opening your book…". Says what is happening rather than
   * spinning at the user. Pass it fixed for the life of the splash; a line that
   * appears and vanishes mid-lift is worse than no line.
   */
  note?: string;
  onDone?: () => void;
}

/**
 * § 35.5 — the FLOOR on how long launch lasts, lift included.
 *
 * The lift seats at `LIFT_MS + ARMS_DELAY` = 1490ms, which is long enough to
 * read the movement and not long enough to read the lockup: the mark arrives and
 * the screen is already gone. The remaining ~1s is frame 0c held, fully formed,
 * which is the frame that does the actual branding.
 *
 * A floor and not a duration: a slow restore still holds past it — that gate is
 * `isLoading` in RootNavigator — and it still never gates data, which is the
 * whole of FR-8. Local data resolves behind the hold exactly as it resolves
 * behind the lift.
 *
 * Reduced motion opts out completely. Someone who asked for stillness did not
 * ask for two and a half seconds of it.
 */
export const SPLASH_HOLD_MS = 2500;

export default function Splash({ note, onDone }: SplashProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();

  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  /**
   * Two gates; launch ends when both are open. Separate flags rather than a
   * timer started from the lift's own `onDone`, because the two run CONCURRENTLY
   * — the floor is measured from the first frame, so it costs ~1s on top of the
   * lift rather than 2.5s after it.
   */
  const [lifted, setLifted] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    /* `reduced` resolves a tick after mount, so this re-runs once it lands and
       collapses the floor rather than holding a STILL image for 2.5 seconds. */
    const t = setTimeout(() => setHeld(true), reduced ? 0 : SPLASH_HOLD_MS);
    return () => clearTimeout(t);
  }, [reduced]);

  useEffect(() => {
    if (lifted && held) done.current?.();
  }, [lifted, held]);

  /**
   * Where the native splash comes down. Here and not in `App`, because this view
   * is what paints the canvas: its first layout is the earliest moment at which
   * dropping the native one cannot expose the window underneath.
   *
   * Guarded to fire once — `onLayout` runs again on every rotation and inset
   * change, and `hideAsync` on an already-hidden splash rejects.
   */
  const handedOver = useRef(false);
  const takeOver = useCallback(() => {
    if (handedOver.current) return;
    handedOver.current = true;
    SplashScreen.hideAsync().catch(() => {
      /* Auto-hidden already, or no native splash at all (Expo Go, web). */
    });
  }, []);

  return (
    <View style={[styles.splash, { paddingTop: insets.top }]} onLayout={takeOver}>
      <StatusBar style="light" />
      <View style={styles.splashBody}>
        <LogoLockup animated onDone={() => setLifted(true)} />
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <View style={[styles.splashFoot, { paddingBottom: Math.max(insets.bottom, FOOT_PAD) }]}>
        <Text style={styles.splashVer}>{versionLine()}</Text>
      </View>
    </View>
  );
}

/** `.xr-splash__foot{padding:0 var(--tx-inset) 30px}` */
const FOOT_PAD = 30;

/* ------------------------------------------------------------------ styles */

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  lockupWrap: { alignItems: 'center' },
  /** `.xr-lockup{display:flex;align-items:center;gap:5px}` */
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  word: {
    fontWeight: '800',
    color: colors.ink,
    /* Android reserves ascender/descender room the CSS `line-height:.8` has
       already taken back; without this the word sits low against the mark. */
    includeFontPadding: false,
  },
  tagline: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 11 * 0.42,
    color: colors.ink2,
    textAlign: 'center',
    marginTop: 14,
  },
  note: { marginTop: space.s6, fontSize: 12, fontWeight: '500', color: colors.ink3 },

  splash: { flex: 1, backgroundColor: colors.canvas },
  splashBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.inset,
  },
  splashFoot: { paddingHorizontal: space.inset, alignItems: 'center' },
  splashVer: { fontSize: 10.5, letterSpacing: 10.5 * 0.11, color: colors.ink3 },
});

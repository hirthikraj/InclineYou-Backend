/**
 * Sign-in screen composition — layout only.
 *
 * These are the `.auth*`, `.trust`, `.wa` and `.legal` rules from
 * `agent/design system/screens/xreploginotp.html`. They say where things sit;
 * how they look still comes from the design system. Phone entry, OTP verify and
 * role resolution all share this shell, so all three stay in register.
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  colors,
  radius,
  space,
  tap,
  useKeyboardVisible,
  IconBack,
  IconMessage,
  type IconProps,
} from '../../design';

/* The hook now lives in the design system — the sheet needs it too. Re-exported
   here so the sign-in screens keep importing their layout from one place. */
export { useKeyboardVisible };

/* `.auth__foot{padding:16px 0 22px}` — the 22, and what it tightens to once the
   keyboard is up and the legal line has gone. */
const FOOT_PAD = 22;
const FOOT_PAD_COMPACT = 12;
/* Clearance kept below the gesture bar / nav bar, so the CTA is never sitting
   right on the system strip. On a device that reports no inset, FOOT_PAD is
   already the larger of the two and this adds nothing. */
const FOOT_GAP = space.s2;

/* ------------------------------------------------------------------ shell */

export function AuthScreen({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      {/* The CTA docks above the keyboard — never below the fold, never
          requiring a dismiss-then-tap.
          `padding` on BOTH platforms, deliberately: Expo SDK 54 draws Android
          edge-to-edge, and an edge-to-edge window does not resize for the
          keyboard, so `adjustResize` alone leaves the button underneath it.

          `enabled` is the fix for a bad `keyboardDidHide` on Android. Its
          edge-to-edge path (ReactRootView.checkForKeyboardEvents, API 30+)
          reports the visible frame's HEIGHT where the payload wants an absolute
          screenY — the two differ by the status bar — and this view then reads
          `frame.y + frame.height - screenY`. Under edge-to-edge the root spans
          the whole window, so what should resolve to 0 comes out as roughly
          status bar + nav bar and is left padded under the foot with no
          keyboard on screen. Gating on our own visibility flag means the stale
          measurement is simply never rendered: `bottomHeight` is hard-zero
          while disabled, and re-enabling replays the real height. The show path
          is correct (it uses .bottom) and is untouched. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding" enabled={keyboardUp}>
        {/* The bottom inset belongs to AuthFoot, not here: the foot is the only
            thing that reaches the bottom edge, and applying it at both levels
            stacked the gesture bar on top of the foot's own 22 and left the CTA
            floating well short of the bottom. */}
        <View style={styles.auth}>{children}</View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** `.auth__top` — always 48px tall so the headline never shifts between states. */
export function AuthTop({ children }: { children?: React.ReactNode }) {
  return <View style={styles.top}>{children}</View>;
}

export function AuthBody({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.body, style]}>{children}</View>;
}

/**
 * `.auth__foot` — the CTA dock, and the only thing that reaches the bottom edge,
 * so the safe-area inset is its job. `Math.max` rather than a sum: the design's
 * 22 is the breathing room under the button and the inset is the system's
 * reserved strip, so the button wants whichever is larger, never both.
 *
 * `compact` tightens it for the keyboard-up layout, where the legal line has
 * stepped aside — and the keyboard is already covering the gesture bar, so the
 * inset there would be dead space stacked on top of the keyboard.
 */
export function AuthFoot({
  children,
  compact = false,
}: {
  children?: React.ReactNode;
  compact?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const paddingBottom = compact
    ? FOOT_PAD_COMPACT
    : Math.max(insets.bottom + FOOT_GAP, FOOT_PAD);
  return <View style={[styles.foot, { paddingBottom }]}>{children}</View>;
}

/** The lime `X`. Stands in for a back button on the first screen of the flow. */
export function Brandmark() {
  return (
    <View style={styles.brandmark} accessibilityRole="image" accessibilityLabel="Train X">
      <Text style={styles.brandmarkText}>X</Text>
    </View>
  );
}

/* ----------------------------------------------------------------- pieces */

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={(tap.min - 40) / 2}
      style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
    >
      <IconBack size={22} color={colors.ink2} />
    </Pressable>
  );
}

/**
 * `.auth h2`. `tight` is the `.tight` modifier the setup flow uses: those
 * screens carry a step bar above the headline, which already provides the
 * separation the 24px top margin exists to create.
 */
export function AuthTitle({
  children,
  nativeID,
  tight = false,
}: {
  children: React.ReactNode;
  nativeID?: string;
  tight?: boolean;
}) {
  return (
    <Text
      nativeID={nativeID}
      accessibilityRole="header"
      style={[styles.title, tight && styles.titleTight]}
    >
      {children}
    </Text>
  );
}

export function AuthSub({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sub}>{children}</Text>;
}

/** An inline link inside `.sub` — "Change", "Terms". */
export function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text accessibilityRole="link" style={styles.link} onPress={onPress}>
      {label}
    </Text>
  );
}

/**
 * `.trust` — sits at the bottom of the body. On the OTP screen this is not
 * decoration: OTP-relay fraud over phone calls is common in India, and the app
 * saying plainly that it will never ask is the countermeasure.
 */
export function TrustNote({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<IconProps>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.trust}>
      <Icon size={17} color={colors.ink3} />
      <Text style={styles.trustText}>{children}</Text>
    </View>
  );
}

/** Emphasis inside a `.trust` note. */
export function TrustStrong({ children }: { children: React.ReactNode }) {
  return <Text style={styles.trustStrong}>{children}</Text>;
}

/** `.wa` — the WhatsApp fallback. Quiet by design; it is never the main path. */
export function WhatsAppButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.wa,
        pressed && styles.waPressed,
        disabled && styles.waDisabled,
      ]}
    >
      <IconMessage size={18} color="#25D366" />
      <Text style={styles.waLabel}>{label}</Text>
    </Pressable>
  );
}

export function Legal({ children }: { children: React.ReactNode }) {
  return <Text style={styles.legal}>{children}</Text>;
}

/** An underlined link inside `.legal` — quieter than an accent link. */
export function LegalLink({ label, url }: { label: string; url: string }) {
  return (
    <Text
      accessibilityRole="link"
      style={styles.legalLink}
      onPress={() => {
        void Linking.openURL(url);
      }}
    >
      {label}
    </Text>
  );
}

/** Opens a WhatsApp chat with support. Returns false when nothing could be opened. */
export async function openWhatsApp(number: string, text?: string): Promise<boolean> {
  const url = `https://wa.me/${number.replace(/\D/g, '')}${
    text ? `?text=${encodeURIComponent(text)}` : ''
  }`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ styles */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  fill: { flex: 1 },
  auth: { flex: 1, paddingHorizontal: space.inset },
  top: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: { flex: 1, paddingTop: 26 },
  foot: { paddingTop: space.s4 },

  brandmark: {
    width: 46,
    height: 46,
    borderRadius: radius.r3,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandmarkText: {
    color: colors.accentInk,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -1.15,
  },

  back: {
    width: 40,
    height: 40,
    marginLeft: -8,
    borderRadius: radius.r2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: { backgroundColor: colors.surface2 },

  title: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.81,
    lineHeight: 31,
    color: colors.ink,
    marginTop: space.s6,
    marginBottom: 9,
  },
  titleTight: { marginTop: 14 },
  sub: { fontSize: 15, lineHeight: 22.5, color: colors.ink2, marginBottom: 26 },
  link: { color: colors.accentText, fontWeight: '600' },

  trust: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 'auto',
  },
  trustText: { flex: 1, fontSize: 12.5, lineHeight: 19, color: colors.ink3 },
  trustStrong: { color: colors.ink2, fontWeight: '600' },

  wa: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    width: '100%',
    minHeight: 48,
    marginTop: 10,
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  waPressed: { backgroundColor: colors.surface2 },
  waDisabled: { opacity: 0.45 },
  waLabel: { fontSize: 14, fontWeight: '600', color: colors.ink2 },

  legal: {
    fontSize: 11.5,
    lineHeight: 18,
    color: colors.ink3,
    textAlign: 'center',
    marginTop: 14,
  },
  legalLink: { color: colors.ink2, textDecorationLine: 'underline' },
});

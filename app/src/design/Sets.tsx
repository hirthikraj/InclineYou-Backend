/**
 * `.tx-sets` — the set table, and the one layout in this system that was not
 * invented here.
 *
 * Hevy and Strong solved the mechanics of logging a set years ago and there is
 * no reason to redraw a solved table. Five columns, in this order:
 *
 *     Set   Previous   kg   Reps   ✓
 *
 * ── The Previous column is the whole point ────────────────────────────────
 *
 * §09 makes it a rule a dev can be held to: **it never collapses, truncates or
 * hides.** At 360dp, in landscape, with a note open — it stays. It is the entire
 * advantage over the notebook this app replaces, and the reason the table is
 * allowed to run the full width of the screen.
 *
 * That is also why time and distance sets *relabel* the kg and Reps columns
 * rather than adding a sixth. A sixth column would have to come out of Previous,
 * and Previous does not move.
 *
 * ── Placeholders, never values ────────────────────────────────────────────
 *
 * Last session's numbers sit in the inputs as placeholders. Until somebody taps
 * the tick, the log has not claimed a weight nobody lifted — and the tick
 * accepts them exactly as shown, so a set that went to plan costs one tap.
 *
 * ── 56px, and where it went ───────────────────────────────────────────────
 *
 * The design draws the tick at 40px. §09 says anything used mid-session is 56,
 * and the tick is the most-tapped control of the session. Both are satisfied by
 * keeping the 40px *box* and hanging a 56px hit area off it — the sweaty-thumb
 * target is real, and the row still fits five columns at 360dp.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { IconCheck } from './icons';
import { colors, radius, space, tnum } from './tokens';

/** The five columns, once. Head and row must never drift apart. */
/**
 * The five columns.
 *
 * `previous` is the flexible one and it gets what is left, which on a 360dp
 * Android phone is not much: the table sits inside a card inside the screen
 * inset, so 286dp has to carry a set number, two inputs, a 44dp tick and four
 * gaps. The design's rule is that the Previous column never collapses — it is
 * the only number that makes an empty input answerable — so the two inputs give
 * up 6dp each rather than "82.5 kg × 6" wrapping onto a second line or
 * shrinking to 9pt. A load field still fits "137.5" at 56dp.
 */
const COLUMNS = {
  number: 36,
  previous: 0, // flex
  load: 56,
  reps: 48,
  tick: 44,
} as const;

export function Sets({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children);
  return (
    <View style={[styles.table, style]}>
      {items.map((child, i) => (
        <View key={i} style={i < items.length - 1 ? styles.divider : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function SetsHead({
  previous = 'Previous',
  load = 'kg',
  reps = 'Reps',
}: {
  /**
   * The second column's name. "Previous" while logging; "RPE" in a history,
   * where the column carries the effort instead — the same five columns doing
   * the same job, because a trainer should never have to learn a second layout
   * for their own data.
   */
  previous?: string;
  load?: string;
  reps?: string;
}) {
  return (
    <View style={styles.head}>
      <Text style={[styles.headLabel, { width: COLUMNS.number }]}>Set</Text>
      {/* The one head label that can run out of room at 360dp. It shrinks
          rather than truncating, because "PREVI…" in a column header is a word
          the reader has to finish themselves. */}
      <Text
        style={[styles.headLabel, styles.headPrev]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {previous}
      </Text>
      <Text style={[styles.headLabel, styles.centre, { width: COLUMNS.load }]}>{load}</Text>
      <Text style={[styles.headLabel, styles.centre, { width: COLUMNS.reps }]}>{reps}</Text>
      <View style={{ width: COLUMNS.tick }} />
    </View>
  );
}

export interface SetRowProps {
  number: number;
  /** "52.5 kg × 8". Null the first time this client ever does this. */
  previous: string | null;
  /** What is in the fields. Empty means nothing typed and nothing logged. */
  load: string;
  reps: string;
  onLoad: (next: string) => void;
  onReps: (next: string) => void;
  /** The tick. Green when logged. */
  done: boolean;
  onToggle: () => void;
  /** The next set to be typed into: accent tint and a leading edge. */
  next?: boolean;
  /** Written here, not yet on the server. An amber ring on the tick, nothing more. */
  queued?: boolean;
  /** This set holds a record. Gold on the set number. */
  pr?: boolean;
  onLongPress?: () => void;
  /**
   * Takes last time's numbers as real values, so they can be edited from there.
   *
   * ── Why this is on the Previous cell and not on the fields ──────────────
   *
   * The tap map puts it on a long press of the load or reps field. React
   * Native's `TextInput` does not carry a long press — it claims the touch
   * responder to place the caret, and there is no `onLongPress` on it at any
   * version — and wiring one would mean a gesture library this project has
   * ruled out. So the gesture moved one column left, onto the numbers it copies,
   * where it is arguably where it belonged: one long press now fills both
   * fields instead of needing one per field, and Previous stays what §07 says
   * it is — never a tap target, because a tap still does nothing.
   */
  onFillFromPrevious?: () => void;
  /**
   * Fired when a field loses focus.
   *
   * Editing an already-logged set writes through here rather than on every
   * keystroke: a set is one number, and saving "5", "52", "52.5" as three
   * separate truths puts two wrong weights into the sync queue on the way to
   * the right one.
   */
  onCommit?: () => void;
  editable?: boolean;
}

export function SetRow({
  number,
  previous,
  load,
  reps,
  onLoad,
  onReps,
  done,
  onToggle,
  next = false,
  queued = false,
  pr = false,
  onLongPress,
  onFillFromPrevious,
  onCommit,
  editable = true,
}: SetRowProps) {
  // The placeholder is last time's number, split back out of the sentence the
  // Previous column shows. Parsing it here keeps the caller from having to pass
  // the same fact twice in two shapes.
  const [prevLoad, prevReps] = splitPrevious(previous);

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={320}
      style={[styles.row, done && styles.rowDone, next && styles.rowNext]}
      accessibilityLabel={`Set ${number}${previous ? `, last time ${previous}` : ''}`}
    >
      {next ? <View style={styles.nextEdge} pointerEvents="none" /> : null}

      <View style={[styles.number, pr && styles.numberPr, next && styles.numberNext]}>
        <Text style={[styles.numberText, pr && styles.numberTextPr, next && styles.numberTextNext]}>
          {number}
        </Text>
      </View>

      {/* Never truncated, never hidden, and a tap does nothing. §07 and §09.
          The long press copies it into the row — see `onFillFromPrevious`. */}
      <Pressable
        onLongPress={previous ? onFillFromPrevious : undefined}
        delayLongPress={320}
        style={styles.previousCell}
        accessibilityLabel={previous ? `Last time ${previous}` : 'Nothing logged before'}
      >
        {/* One line, always. "82.5 kg × 6" wrapping turns a 56px row into a
            96px one and pushes the tick off the thumb's reach — and the column
            is the reason the empty input is answerable, so it shrinks rather
            than wraps or truncates. */}
        <Text
          style={styles.previous}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {previous ?? '—'}
        </Text>
      </Pressable>

      <Field
        value={load}
        placeholder={prevLoad}
        onChangeText={onLoad}
        onBlur={onCommit}
        keyboard="decimal-pad"
        width={COLUMNS.load}
        label={`Set ${number} load`}
        editable={editable}
      />
      <Field
        value={reps}
        placeholder={prevReps}
        onChangeText={onReps}
        onBlur={onCommit}
        keyboard="number-pad"
        width={COLUMNS.reps}
        label={`Set ${number} reps`}
        editable={editable}
      />

      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? `Set ${number} logged` : `Log set ${number}`}
        // 40px box, 56px reach. The box is what fits five columns; the reach is
        // what a thumb needs mid-session.
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.tickHit}
      >
        <View style={[styles.tick, done && styles.tickDone, queued && styles.tickQueued]}>
          <IconCheck size={19} color={done ? colors.okFillInk : colors.inkOff} strokeWidth={3} />
        </View>
      </Pressable>
    </Pressable>
  );
}

function Field({
  value,
  placeholder,
  onChangeText,
  onBlur,
  keyboard,
  width,
  label,
  editable,
}: {
  value: string;
  placeholder: string;
  onChangeText: (next: string) => void;
  onBlur?: () => void;
  keyboard: 'decimal-pad' | 'number-pad';
  width: number;
  label: string;
  editable: boolean;
}) {
  return (
    <View style={{ width }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkOff}
        keyboardType={keyboard}
        inputMode={keyboard === 'decimal-pad' ? 'decimal' : 'numeric'}
        selectTextOnFocus
        editable={editable}
        onBlur={onBlur}
        accessibilityLabel={label}
        style={styles.input}
      />
    </View>
  );
}

/**
 * A note, in the table, under its set.
 *
 * Two lines and then it trails off. §02 is explicit about why: a five-line note
 * pushes the next set out of the thumb zone, and the next set matters more than
 * the prose. The whole thing is one tap away in the set sheet.
 */
export function SetNote({ text, onPress }: { text: string; onPress?: () => void }) {
  const body = (
    <Text numberOfLines={2} style={styles.noteText}>
      {text}
    </Text>
  );
  if (!onPress) return <View style={styles.note}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Note: ${text}`} style={styles.note}>
      {body}
    </Pressable>
  );
}

/** A read-only row, for one exercise's history. Same five columns, no inputs. */
export function SetRowStatic({
  number,
  meta,
  load,
  reps,
  pr = false,
}: {
  number: number;
  /** What sits in the Previous column here: the RPE, which is the only thing worth keeping. */
  meta: string;
  load: string;
  reps: string;
  pr?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.number, pr && styles.numberPr]}>
        <Text style={[styles.numberText, pr && styles.numberTextPr]}>{number}</Text>
      </View>
      <Text style={styles.previous}>{meta}</Text>
      <Text style={[styles.static, { width: COLUMNS.load }]}>{load}</Text>
      <Text style={[styles.static, { width: COLUMNS.reps }]}>{reps}</Text>
      <View style={styles.prSlot}>
        {pr ? <Text style={styles.prTag}>PR</Text> : null}
      </View>
    </View>
  );
}

/** "52.5 kg × 8" → ["52.5", "8"]. Anything unparseable yields empty placeholders. */
function splitPrevious(previous: string | null): [string, string] {
  if (!previous) return ['', ''];
  const load = previous.match(/^([\d.]+)\s*kg/);
  const reps = previous.match(/×\s*(\d+)/) ?? previous.match(/(\d+)\s*reps/);
  return [load?.[1] ?? '', reps?.[1] ?? ''];
}

const ROW_GAP = space.s2;

const styles = StyleSheet.create({
  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingVertical: 10,
    paddingHorizontal: space.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.14,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  headPrev: { flex: 1, minWidth: 0 },
  centre: { textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    minHeight: 52,
    paddingVertical: 6,
    paddingHorizontal: space.s3,
  },
  rowDone: { backgroundColor: colors.okSoft },
  // Deliberately NOT the live-card glow: one thing glows per screen, and on this
  // screen that is the exercise card.
  rowNext: { backgroundColor: colors.accentSoft },
  nextEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, backgroundColor: colors.accent },

  number: {
    width: 28,
    height: 28,
    marginLeft: (COLUMNS.number - 28) / 2,
    marginRight: (COLUMNS.number - 28) / 2,
    borderRadius: radius.r1,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberPr: { backgroundColor: colors.prSoft },
  numberNext: { backgroundColor: colors.accent },
  numberText: { fontSize: 13, fontWeight: '800', color: colors.ink2, ...tnum } as TextStyle,
  numberTextPr: { color: colors.pr },
  numberTextNext: { color: colors.accentInk },

  previousCell: { flex: 1, minWidth: 0, justifyContent: 'center', alignSelf: 'stretch' },
  previous: { fontSize: 13, color: colors.ink3, ...tnum } as TextStyle,

  input: {
    height: 40,
    borderRadius: radius.r1,
    backgroundColor: colors.surface2,
    textAlign: 'center',
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 0,
    ...tnum,
  } as TextStyle,

  static: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    ...tnum,
  } as TextStyle,

  tickHit: { width: COLUMNS.tick, height: 56, alignItems: 'center', justifyContent: 'center' },
  tick: {
    width: 40,
    height: 40,
    borderRadius: radius.r1,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickDone: { backgroundColor: colors.okFill },
  // The ring never moves a pixel of layout, so nothing reflows when the bars
  // come back. Inside the box, on top of whatever fill is already there.
  tickQueued: { borderWidth: 2, borderColor: colors.warn },

  prSlot: { width: COLUMNS.tick, alignItems: 'center' },
  prTag: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.95,
    color: colors.pr,
    backgroundColor: colors.prSoft,
    borderRadius: radius.r1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
  },

  note: {
    paddingHorizontal: space.s3,
    paddingBottom: 11,
    marginTop: -3,
  },
  noteText: { fontSize: 12.5, lineHeight: 18, color: colors.ink3 },
});

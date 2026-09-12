/**
 * InclineYou design system — the only surface screens should import from.
 *
 * If a screen needs a colour, a size or a component that isn't exported here,
 * the answer is to add it to the system, not to hard-code it in the screen.
 */

export * from './tokens';
export { navTheme } from './navTheme';
export * from './icons';
export { default as useKeyboardVisible } from './useKeyboardVisible';
export { default as useKeyboardHeight } from './useKeyboardHeight';
export { default as useReduceMotion } from './useReduceMotion';

/* ------------------------------------------------------------- brand · § 35 */

export {
  default as Splash,
  LogoMark,
  LogoTile,
  LogoLockup,
  LIFT_MS,
  SPLASH_HOLD_MS,
  TILE,
  MARK_MIN,
} from './Logo';
export type { LogoMarkProps, LogoLockupProps, SplashProps } from './Logo';

export { default as Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { default as Control } from './Control';
export type { ControlProps, ControlSize } from './Control';
export { default as FieldMsg, FieldLabel } from './FieldMsg';
export type { FieldMsgProps, FieldMsgTone } from './FieldMsg';
export { default as OtpInput } from './OtpInput';
export type { OtpInputProps, OtpStatus } from './OtpInput';

/* --------------------------------------------------- onboarding · section 18 */

export { Steps, StepsLabel, SkipButton } from './Steps';
export type { StepsProps } from './Steps';
export { Pick, PickChip, PickAdd, PickCount } from './Pick';
export type { PickChipProps } from './Pick';
export { Timeline, TimelineItem } from './Timeline';
export type { TimelineItemProps, TimelineState } from './Timeline';
export { default as Callout, CalloutStrong } from './Callout';
export type { CalloutProps, CalloutTone } from './Callout';
export { default as Meter, meterPercent } from './Meter';
export type { MeterProps, MeterItem } from './Meter';
export { default as DoneMark } from './DoneMark';

/* ------------------------------------------------------ surfaces and pickers */

export { default as Avatar } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';
export { default as Card } from './Card';
export type { CardProps } from './Card';
export { default as Toast } from './Toast';
export type { ToastProps } from './Toast';
export { default as Select } from './Select';
export type { SelectProps } from './Select';
export { default as Search } from './Search';
export type { SearchProps } from './Search';
export { default as Sheet } from './Sheet';
export type { SheetProps } from './Sheet';
export { List, Row, RowTime, RowValue } from './Row';
export type { RowProps, RowSeverity, RowSpine } from './Row';

/* ---------------------------------------------- home and navigation · § 07 */

export { default as AppBar } from './AppBar';
export type { AppBarProps } from './AppBar';
export { default as IconButton } from './IconButton';
export type { IconButtonProps } from './IconButton';
export { default as SectionHead } from './SectionHead';
export type { SectionHeadProps } from './SectionHead';
export { default as Tag } from './Tag';
export type { TagProps, TagTone } from './Tag';
export { default as Chip, Seg } from './Chip';
export type { ChipProps } from './Chip';
export { default as Stat, StatRail } from './Stat';
export type { StatProps } from './Stat';
export { default as Banner } from './Banner';
export type { BannerProps, BannerTone } from './Banner';
export { default as Pulse } from './Pulse';
export { Bar, Legend } from './Bar';
export type { BarSegment, LegendEntry } from './Bar';
export { default as WeekBars } from './WeekBars';
export type { WeekDay } from './WeekBars';
export { default as Skeleton, SkeletonRow, SkeletonCard, SkeletonHead } from './Skeleton';
export type { SkeletonProps } from './Skeleton';
export { default as Reveal } from './Reveal';
export type { RevealProps } from './Reveal';
export { default as Empty } from './Empty';
export type { EmptyProps } from './Empty';
export { default as NavBar } from './NavBar';
export type { NavBarProps, NavTab } from './NavBar';
export { default as Drawer, DrawerItem, DrawerLabel, DrawerVersion } from './Drawer';
export type { DrawerProps, DrawerItemProps } from './Drawer';
export { default as Notif } from './Notif';
export type { NotifProps } from './Notif';
export { default as Activity } from './Activity';
export type { ActivityProps } from './Activity';
export { SyncBand, SyncStamp, SyncSpinner } from './SyncBand';

/* --------------------------------------------------------- the roster · § 04 */

export { default as GroupHead } from './GroupHead';
export type { GroupHeadProps } from './GroupHead';
export { default as Pack, PACK_LOW } from './Pack';
export type { PackProps } from './Pack';
export { default as Tally } from './Tally';
export type { TallyItem } from './Tally';
export { Check, Radio, ChoiceSlot, ChoiceGrid, ChoiceCard } from './Choice';
export { default as Menu } from './Menu';
export type { MenuAction } from './Menu';
export { default as SelectBar } from './SelectBar';
export type { SelectBarAction } from './SelectBar';
export { default as SwipeRow } from './SwipeRow';
export type { SwipeRowProps, SwipeTone } from './SwipeRow';
export { default as IndexRail } from './IndexRail';
export type { IndexRailProps } from './IndexRail';
export { default as AvatarStack } from './AvatarStack';

/* ---------------------------------------------------------- the diary · § 05 */

export { default as DayStrip } from './DayStrip';
export type { StripDayProps } from './DayStrip';
export { default as Segmented } from './Segmented';
export type { SegmentedOption } from './Segmented';
export { Agenda, AgendaItem, NowLine, GapBar, FreeSlot, BlockBar } from './Agenda';
export { default as WeekGrid, Legend as WeekLegend } from './WeekGrid';
export type { WeekColumnProps, WeekPipProps, PipKind } from './WeekGrid';
export { default as MonthGrid } from './MonthGrid';
export type { MonthCellProps } from './MonthGrid';
export { default as AvailRow } from './AvailRow';
export { default as DayTimeline } from './DayTimeline';
export type { DayTimelineProps } from './DayTimeline';
export { default as TimeField, formatMinute, MINUTES_IN_DAY } from './TimeField';
export type { TimeFieldProps } from './TimeField';

/* ---------------------------------------------------------- the book · § 06 */

export { default as Months } from './Months';
export type { MonthChip } from './Months';
export { default as Figures } from './Figures';
export type { FiguresProps, FigureTone } from './Figures';
export { default as ShareRow } from './ShareRow';
export { Ledger, LedgerRow, BalanceMark } from './Ledger';
export type { LedgerRowProps } from './Ledger';
export { default as Gst } from './Gst';
export { default as YearBars } from './YearBars';
export type { YearBarProps } from './YearBars';
export { Receipt, ReceiptRow } from './Receipt';
export { default as Keypad, Amount, applyKey } from './Keypad';
export type { Key as KeypadKey } from './Keypad';

export { default as RestTimer, formatClock } from './RestTimer';
export type { RestTimerProps } from './RestTimer';

/* -------------------------------------------- behind the drawer · § 07–16 */

export { default as Setting, SettingList } from './Setting';
export type { SettingProps } from './Setting';
export { default as Switch } from './Switch';
export type { SwitchProps } from './Switch';
export { default as WeekShape, toneColor } from './WeekShape';
export type { WeekShapeProps, ShapeLegendEntry } from './WeekShape';
export { default as Metric } from './Metric';
export type { MetricProps, Delta } from './Metric';
export { default as Streak } from './Streak';
export type { StreakProps, StreakDay } from './Streak';
export { default as Rule } from './Rule';
export type { RuleProps } from './Rule';
export { default as Faq } from './Faq';
export type { FaqProps, FaqEntry } from './Faq';
export { default as Thumb } from './Thumb';
export type { ThumbProps } from './Thumb';
export { default as Danger } from './Danger';
export type { DangerProps } from './Danger';

/* ------------------------------------------------ the workout log · § 17 */

export { Sets, SetsHead, SetRow, SetRowStatic, SetNote } from './Sets';
export type { SetRowProps } from './Sets';
export { default as Stepper } from './Stepper';
export type { StepperProps } from './Stepper';
export { default as Rpe } from './Rpe';
export type { RpeProps } from './Rpe';
export { default as PrCard } from './PrCard';
export type { PrCardProps } from './PrCard';
export { default as Summary } from './Summary';
export type { SummaryFigure } from './Summary';
export { default as Dock } from './Dock';
export type { DockProps } from './Dock';

/* ------------------------------------------------- the client role · § 18–24 */

/* Two components and one icon, which is the whole visual cost of the other half
   of the product — there is no second design system. */
export { default as Coach } from './Coach';
export type { CoachProps } from './Coach';
export { default as Notice } from './Notice';
export type { NoticeProps } from './Notice';

/* ------------------------------------------------- the client file · § 22–24 */

/* The design file's own count: four additions, and everything else on the file
   is a component the system already had. `Dialog` is the fifth only because the
   CSS had `.tx-dialog` from the start and React Native never needed it until
   something in the product became irreversible. */
export { default as ClientHead } from './ClientHead';
export type { ClientHeadProps } from './ClientHead';
export { default as Tabs } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';
export { Kv, KvRow } from './Kv';
export type { KvRowProps } from './Kv';
export { Measures, Measure } from './Measures';
export type { MeasureProps } from './Measures';
export { default as Dialog, DialogStrong } from './Dialog';
export type { DialogProps } from './Dialog';

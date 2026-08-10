/**
 * Train X design system — the only surface screens should import from.
 *
 * If a screen needs a colour, a size or a component that isn't exported here,
 * the answer is to add it to the system, not to hard-code it in the screen.
 */

export * from './tokens';
export { navTheme } from './navTheme';
export * from './icons';
export { default as useKeyboardVisible } from './useKeyboardVisible';
export { default as useReduceMotion } from './useReduceMotion';

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
export { List, Row, RowTime } from './Row';
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

/* ---------------------------------------------------------- the book · § 06 */

export { default as Months } from './Months';
export type { MonthChip } from './Months';
export { default as Figures } from './Figures';
export type { FiguresProps } from './Figures';
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

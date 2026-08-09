/**
 * Train X design system — the only surface screens should import from.
 *
 * If a screen needs a colour, a size or a component that isn't exported here,
 * the answer is to add it to the system, not to hard-code it in the screen.
 */

export * from './tokens';
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
export { default as RestTimer, formatClock } from './RestTimer';
export type { RestTimerProps } from './RestTimer';

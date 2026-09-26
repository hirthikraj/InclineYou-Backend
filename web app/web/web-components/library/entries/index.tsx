import type { ReactNode } from 'react';

import { ButtonEntry } from './actions/Button.entry';
import { SegmentEntry } from './actions/Segment.entry';
import { ButtonGroupEntry } from './actions/ButtonGroup.entry';
import { IconButtonEntry } from './actions/IconButton.entry';
import { InlineLinkEntry } from './actions/InlineLink.entry';
import { RowMenuEntry } from './actions/RowMenu.entry';
import { FacetEntry } from './actions/Facet.entry';
import { CardEntry } from './containers/Card.entry';
import { SlabEntry } from './containers/Slab.entry';
import { DockPanelEntry } from './containers/DockPanel.entry';
import { EmptyStateEntry } from './containers/EmptyState.entry';
import { FoldEntry } from './containers/Fold.entry';
import { SidecarEntry } from './containers/Sidecar.entry';
import { SkeletonEntry } from './containers/Skeleton.entry';
import { ModalEntry } from './containers/Modal.entry';
import { PageHeaderEntry } from './containers/PageHeader.entry';
import { WhyEntry } from './containers/Why.entry';
import { PromptListEntry } from './containers/PromptList.entry';
import { BriefEntry } from './data/Brief.entry';
import { KeyValueEntry } from './data/KeyValue.entry';
import { FactListEntry } from './data/FactList.entry';
import { MarkupEntry } from './data/Markup.entry';
import { ListRowEntry } from './data/ListRow.entry';
import { OrderRowEntry } from './data/OrderRow.entry';
import { ProgramRowEntry } from './data/ProgramRow.entry';
import { WorkoutRowEntry } from './data/WorkoutRow.entry';
import { DayRuleEntry } from './data/DayRule.entry';
import { TemplateRowEntry } from './data/TemplateRow.entry';
import { TimelineEntry } from './data/Timeline.entry';
import { TrendChartEntry } from './data/TrendChart.entry';
import { VolumeBarsEntry } from './data/VolumeBars.entry';
import { StatEntry } from './data/Stat.entry';
import { FiguresEntry } from './data/Figures.entry';
import { StripEntry } from './data/Strip.entry';
import { TableEntry } from './data/Table.entry';
import { WeekDotsEntry } from './data/WeekDots.entry';
import { SessionCalendarEntry } from './data/SessionCalendar.entry';
import { AgendaEntry } from './domain/Agenda.entry';
import { ChangeEntry } from './domain/Change.entry';
import { ProgressRowEntry } from './domain/ProgressRow.entry';
import { CoachNoteEntry } from './domain/CoachNote.entry';
import { NoteCardEntry } from './domain/NoteCard.entry';
import { HeroCardEntry } from './domain/HeroCard.entry';
import { InvoiceEntry } from './domain/Invoice.entry';
import { ProfileCardEntry } from './domain/ProfileCard.entry';
import { SetRowEntry } from './domain/SetRow.entry';
import { TemplateCardEntry } from './domain/TemplateCard.entry';
import { AffixFieldEntry } from './forms/AffixField.entry';
import { CheckboxEntry } from './forms/Checkbox.entry';
import { ChoiceListEntry } from './forms/ChoiceList.entry';
import { ScaleEntry } from './forms/Scale.entry';
import { DropdownEntry } from './forms/Dropdown.entry';
import { FieldEntry } from './forms/Field.entry';
import { FormGroupEntry } from './forms/FormGroup.entry';
import { SearchFieldEntry } from './forms/SearchField.entry';
import { SearchSelectEntry } from './forms/SearchSelect.entry';
import { SelectEntry } from './forms/Select.entry';
import { SwitchEntry } from './forms/Switch.entry';
import { MarkupFieldEntry } from './forms/MarkupField.entry';
import { TextareaEntry } from './forms/Textarea.entry';
import { ActionBarEntry } from './nav/ActionBar.entry';
import { BulkBarEntry } from './nav/BulkBar.entry';
import { CrumbsEntry } from './nav/Crumbs.entry';
import { NotificationsEntry } from './nav/Notifications.entry';
import { PagerEntry } from './nav/Pager.entry';
import { PaletteEntry } from './nav/Palette.entry';
import { RailEntry } from './nav/Rail.entry';
import { SubTabsEntry } from './nav/SubTabs.entry';
import { TabsEntry } from './nav/Tabs.entry';
import { TopBarEntry } from './nav/TopBar.entry';
import { AvatarEntry } from './status/Avatar.entry';
import { AvatarStackEntry } from './status/AvatarStack.entry';
import { BalanceStripEntry } from './status/BalanceStrip.entry';
import { ChipEntry } from './status/Chip.entry';
import { CountBadgeEntry } from './status/CountBadge.entry';
import { MessageEntry } from './status/Message.entry';
import { NoticeBarEntry } from './status/NoticeBar.entry';
import { MeterEntry } from './status/Meter.entry';
import { PackGaugeEntry } from './status/PackGauge.entry';
import { TagEntry } from './status/Tag.entry';
import { ToastEntry } from './status/Toast.entry';

/**
 * Which components have a written page, and which are still a name in the
 * catalogue.
 *
 * Deliberately a sparse map rather than one file per id with a stub inside: a
 * missing key here is the honest signal that the component has not been done,
 * and `/library` counts the keys to say so on its index. A folder of
 * placeholder files would report the library as finished.
 */
export const ENTRY_VIEWS: Record<string, () => ReactNode> = {
  // ACTIONS
  'c-button': ButtonEntry,
  'c-iconbutton': IconButtonEntry,
  'c-btngroup': ButtonGroupEntry,
  'c-link': InlineLinkEntry,
  'c-rowmenu': RowMenuEntry,

  // FORMS
  'c-field': FieldEntry,
  'c-affix': AffixFieldEntry,
  'c-select': SelectEntry,
  'c-searchselect': SearchSelectEntry,
  'c-dropdown': DropdownEntry,
  'c-textarea': TextareaEntry,
  'c-markupfield': MarkupFieldEntry,
  'c-checkbox': CheckboxEntry,
  'c-choicelist': ChoiceListEntry,
  'c-scale': ScaleEntry,
  'c-switch': SwitchEntry,
  'c-search': SearchFieldEntry,
  'c-formgroup': FormGroupEntry,

  // CONTAINERS
  'c-card': CardEntry,
  'c-slab': SlabEntry,
  'c-pageheader': PageHeaderEntry,
  'c-dock': DockPanelEntry,
  'c-modal': ModalEntry,
  'c-empty': EmptyStateEntry,
  'c-fold': FoldEntry,
  'c-sidecar': SidecarEntry,
  'c-skeleton': SkeletonEntry,
  'c-why': WhyEntry,
  'c-prompts': PromptListEntry,

  // DATA
  'c-markup': MarkupEntry,
  'c-table': TableEntry,
  'c-listrow': ListRowEntry,
  'c-orderrow': OrderRowEntry,
  'c-stat': StatEntry,
  'c-figures': FiguresEntry,
  'c-strip': StripEntry,
  'c-kv': KeyValueEntry,
  'c-factlist': FactListEntry,
  'c-brief': BriefEntry,
  'c-programrow': ProgramRowEntry,
  'c-workoutrow': WorkoutRowEntry,
  'c-dayrule': DayRuleEntry,
  'c-templaterow': TemplateRowEntry,
  'c-weekdots': WeekDotsEntry,
  'c-sessioncalendar': SessionCalendarEntry,
  'c-timeline': TimelineEntry,
  'c-trend': TrendChartEntry,
  'c-vbars': VolumeBarsEntry,

  // STATUS & IDENTITY
  'c-tag': TagEntry,
  'c-chip': ChipEntry,
  'c-segment': SegmentEntry,
  'c-facet': FacetEntry,
  'c-avatar': AvatarEntry,
  'c-avatar-stack': AvatarStackEntry,
  'c-count': CountBadgeEntry,
  'c-meter': MeterEntry,
  'c-packgauge': PackGaugeEntry,
  'c-toast': ToastEntry,
  'c-balancestrip': BalanceStripEntry,
  'c-message': MessageEntry,
  'c-noticebar': NoticeBarEntry,

  // NAVIGATION
  'c-rail': RailEntry,
  'c-topbar': TopBarEntry,
  'c-crumbs': CrumbsEntry,
  'c-tabs': TabsEntry,
  'c-subtabs': SubTabsEntry,
  'c-palette': PaletteEntry,
  'c-bulkbar': BulkBarEntry,
  'c-actionbar': ActionBarEntry,
  'c-pager': PagerEntry,
  'c-notify': NotificationsEntry,

  // DOMAIN
  'c-agenda': AgendaEntry,
  'c-setrow': SetRowEntry,
  'c-herocard': HeroCardEntry,
  'c-coachnote': CoachNoteEntry,
  'c-notecard': NoteCardEntry,
  'c-change': ChangeEntry,
  'c-progrow': ProgressRowEntry,
  'c-templatecard': TemplateCardEntry,
  'c-invoice': InvoiceEntry,
  'c-profilecard': ProfileCardEntry,
};

export const isWritten = (id: string) => id in ENTRY_VIEWS;

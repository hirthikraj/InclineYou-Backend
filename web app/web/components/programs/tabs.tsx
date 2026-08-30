import { PageTabs } from '@/components/shell/PageTabs';

/**
 * PROGRAMS' TWO TABS — *what the clients do*, and the vocabulary it is built from.
 *
 * *Exercises* was a rail row in the `BUILD` group until the five-destination
 * pass, and the brief's line for it is the whole argument: **trainers only visit
 * it while building.** Nobody opens 1,324 exercise names to read them. They open
 * them with a template day half-filled two clicks away, and a rail row made that
 * a trip OUT of the thing being built — leave the builder, find the library,
 * remember the name, come back.
 *
 * Two tabs and not three: *Sessions* was the other candidate and it is not a
 * destination at all any more. A session is a flow launched from Today or
 * Schedule, and its history belongs on the person it happened to.
 */
export type ProgramsTab = 'programs' | 'exercises';

export function ProgramsTabs({
  current,
  templateCount,
  exerciseCount,
}: {
  current: ProgramsTab;
  templateCount?: number | null;
  exerciseCount?: number | null;
}) {
  return (
    <PageTabs
      label="Programs sections"
      current={current}
      tabs={[
        { key: 'programs', label: 'Programs', href: '/programs', count: templateCount },
        {
          key: 'exercises',
          label: 'Exercises',
          href: '/programs/exercises',
          // The library's count, on the tab that owns it. It used to be a badge on
          // a rail row, passed in as a prop and dropped on first run because
          // `Rail.tsx` could not tell a true number from a stale one. A tab counts
          // itself from the page it is on, which is the only place the number is
          // ever right.
          count: exerciseCount,
        },
      ]}
    />
  );
}

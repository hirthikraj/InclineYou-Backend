import { AppShell } from '@/components/shell/AppShell';
import { getTrainerName } from '@/lib/shell/api';

/**
 * Persistent shell for all main routes (today, schedule, money, clients).
 * Rail and TabBar live here so they survive client-side navigations between
 * these routes — only the <main> content swaps, the rail stays mounted.
 * Badge counts and pins are per-page concerns; pages that need them can add
 * a ShellContext later without touching this layout.
 */
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const trainerName = await getTrainerName();
  return <AppShell trainerName={trainerName}>{children}</AppShell>;
}

import { permanentRedirect } from 'next/navigation';

/**
 * `/packages` was a destination. It is Business' third tab now.
 *
 * The brief's line: *a tab inside Business, plus "Assign package" on the client
 * screen.* Both halves shipped — the tab is this redirect's target and the client
 * half is `?record=<clientId>` on Payments, wired from the file's Payments tab.
 *
 * The screen itself did not change hands: `components/packages/Packages.tsx` is
 * the same component, minus the four wrappers Business now owns.
 */
export default function Page() {
  permanentRedirect('/business/packages');
}

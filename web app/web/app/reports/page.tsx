import { permanentRedirect } from 'next/navigation';

/**
 * `/reports` was a rail row pointing at a full-page `NotBuilt`. It is Business'
 * seventh tab now, and the notice lives inside the shell where the six tabs that
 * DO work are one click away — see `components/business/ReportsTab.tsx` for why
 * that is not a cosmetic difference.
 */
export default function Page() {
  permanentRedirect('/business/reports');
}

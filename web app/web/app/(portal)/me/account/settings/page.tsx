import { AccountSettings } from '@/components/portal/AccountSettings';
import { requirePortal } from '@/lib/portal/guard';

export const metadata = { title: 'Settings · InclineYou' };

/**
 * §5 · Settings, tab two — the number, the health note, the switches, the theme
 * and the way out.
 *
 * **No reads of its own.** Everything on this tab is on `me`, which the guard
 * has already fetched for the layout's header, so the panel is free.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requirePortal();
  if (!result.ok) return null;

  return (
    <div className="body">
      <AccountSettings me={result.me} />
    </div>
  );
}

import type { ReactNode } from 'react';

import { getClientDetail } from '@/lib/clients/client-api';
import { isApiFailure } from '@/lib/auth/api';

/**
 * THE CLIENT'S NAME IN THE BROWSER TAB, on every screen of their file.
 *
 * Every tab under `/clients/:id` was titled "InclineYou", so a trainer with three
 * client files open had three identical tabs. The name comes from
 * `getClientDetail`, which is `cache()`d and is the same read every tab's
 * payload already makes (`getClientHeader`), so this costs no request of its
 * own. Pages that know more (the report, a client's plan) set their own title
 * and win, as a page's metadata always does over its layout's.
 *
 * A failed read keeps the plain title rather than throwing: the page below has
 * its own guard and draws the error properly, and a title is not the place to
 * report one.
 */
export async function generateMetadata({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  try {
    const client = await getClientDetail(clientId);
    const name = client.name?.trim();
    return { title: name ? `${name} · InclineYou` : 'Client · InclineYou' };
  } catch (err) {
    if (isApiFailure(err)) return { title: 'Client · InclineYou' };
    throw err;
  }
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return children;
}

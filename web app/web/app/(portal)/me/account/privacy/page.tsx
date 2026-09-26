import { AccountPrivacy } from '@/components/portal/AccountPrivacy';
import { requirePortal } from '@/lib/portal/guard';

export const metadata = { title: 'Privacy · InclineYou' };

/**
 * §5 · Privacy, tab three — what the trainer can see, and all five rights.
 *
 * **No reads of its own**, like *Settings*: the visibility rows are derived
 * from the trainer's first name, and the download, the grievance route, the
 * nominee and the delete all take what is already on `me`.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requirePortal();
  if (!result.ok) return null;

  return (
    <div className="body">
      <AccountPrivacy me={result.me} />
    </div>
  );
}

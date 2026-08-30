import { NudgeTemplates } from '@/components/settings/NudgeTemplates';
import { listTemplates } from '@/lib/nudges/api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Nudge messages · X REP' };

/**
 * THE NUDGE TEMPLATE LIBRARY — and the only nudge screen in the product.
 *
 * `/nudges` used to be a rail destination and should never have been one: a
 * nudge belongs next to the thing that triggered it, and asking a trainer to
 * leave the person in order to message them is exactly the friction that stops
 * the follow-up happening. The sending is on the rows now — Today's day list,
 * the attention queue, the roster, the dues list, the packs that are ending, the
 * sessions nobody turned up to, the client's own file.
 *
 * What is left is the WORDING, which is a setting: written once, edited rarely,
 * read by every one of those buttons. `/nudges` permanently redirects here.
 *
 * One request. The bodies, the labels, the purposes and the variable lists all
 * come down from `GET /v1/nudge-templates` — this half holds no copy of any of
 * them, which is the whole reason the label and the variables are on the wire.
 *
 * It draws no bar, no title and no back link: it is a TAB now, and
 * `(sections)/layout.tsx` owns all three. The count that used to be its subtitle
 * has nowhere to go on a shared header and is not worth a second heading — it is
 * the length of the list directly beneath it.
 */
export default async function Page() {
  const templates = await listTemplates();

  return (
    <div className="body">
      <NudgeTemplates initial={templates} />
    </div>
  );
}

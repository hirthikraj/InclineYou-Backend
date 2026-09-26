import { AccountTabs } from '@/components/portal/AccountTabs';
import { TopBar } from '@/components/shell/TopBar';
import { buildAccountLead } from '@/lib/portal/account';
import { getPortalPackages } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';
import { PageHeader } from '@/web-components/ui/PageHeader';

/**
 * §5 · Me, the chrome — one bar, one header, one strip, three panels.
 *
 * ── THE STRIP IS IN THE LAYOUT, AND THAT IS THE WHOLE REASON THIS FILE EXISTS ─
 *
 * `components/settings/ProfileTabs.tsx` states the rule and both portal layouts
 * repeat it: a layout is kept across a navigation between its children, so the
 * bar, the title and the strip **do not re-mount** when a client moves between
 * tabs. `ClientFile` on the trainer's half is the counter-example — no layout,
 * six routes, and the header re-rendered on every one of them.
 *
 * ── THE SUBTITLE IS THE STATE, AND IT WAS A DESCRIPTION ─────────────────────
 *
 * It read `Training with ${me.trainer.name}`, sixty pixels above a card whose
 * first line is that trainer's name. `PageHeader`'s own docstring forbids it:
 * *"`sub` is the screen's state in one line … it is not a description of the
 * screen."* This is the **fourth** instance in this portal, after Home,
 * Progress and Plan — which is what makes it worth a derived helper rather than
 * a better string: `buildAccountLead` in `lib/portal/account.ts` is the one
 * place it is decided, and it carries the duplication test each half had to
 * pass.
 *
 * ── THE ONE READ THIS HEADER PAYS FOR, AND WHY ──────────────────────────────
 *
 * `getPortalPackages()`, for the *nothing owing* half of that line. `cache()`d,
 * and the *Me* tab needs it anyway — so on one of three routes it is free, and
 * on the other two it is one scoped read of a two-or-three-row list.
 *
 * The alternative was putting the money on the *Me* tab only, and it is worse
 * for the reason the line exists: a client who owes money and is standing on
 * *Privacy* about to press delete is the one person who most needs to know that
 * the payments outlive the account. A header that frames all three tabs has to
 * be true on all three.
 *
 * The stated cost: *Settings* and *Privacy* each carry one request they do not
 * themselves use.
 *
 * ── `.main` IS HERE, `.body` IS THE PAGE'S ──────────────────────────────────
 *
 * `.main` carries `grid-area:main`; `.body` carries none. Getting that backwards
 * is the documented defect that rendered the whole `/settings` subtree blank for
 * a week — correct server HTML, a green build, and a screen clipped into the top
 * bar's row. Every leaf under here returns `<div className="body">` and nothing
 * else.
 */
export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const result = await requirePortal();
  /* The portal's own layout one level up already drew `Unavailable`, and its
     pages return null rather than a second copy of it. */
  if (!result.ok) return null;
  const { me } = result;

  const packages = await getPortalPackages();

  return (
    <>
      <TopBar crumb="Me" />
      <main className="main" id="main-content">
        <PageHeader className="ph--portal" title="You and your trainer" sub={buildAccountLead(me, packages)}>
          <AccountTabs />
        </PageHeader>
        {children}
      </main>
    </>
  );
}

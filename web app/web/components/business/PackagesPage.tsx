'use client';

import type { PacksData } from '@/lib/packs/api';
import { TopBar } from '@/components/shell/TopBar';
import { Packages } from '@/components/packages/Packages';
import { Button } from '@/web-components/ui/Button';
import { Why } from '@/web-components/ui/Why';
import { BizHeader } from './BizHeader';

/**
 * PACKAGES — the price list, and the one Business page that fetches none of the
 * money book.
 *
 * It was `/packages`, then a tab of `/business`, and it is a page again. That is
 * not a reversal: the rail row it lost was a top-level destination competing with
 * *Today* and *Clients*, and what it has now is a row in the Business pane, which
 * is where a screen a trainer opens while adding a client belongs. The route
 * changed from `?tab=packages` to a path for the reason every one of the six did
 * — `activePageKey` lights a pane row from the PATH, and a query string cannot
 * light anything.
 *
 * ── AND IT IS WHY THE MONEY BOOK IS NOT FETCHED IN THE LAYOUT ────────────────
 *
 * This page reads the `pack` table and nothing else. Hoisting `getMoney()` into
 * `app/(main)/business/layout.tsx` — four requests, the whole payments book —
 * would make a list of prices pay for a list of payments on every visit. The
 * layout's own docstring records the decision.
 */
export function PackagesPage({
  data,
  fromNewClient = false,
}: {
  data: PacksData;
  /**
   * True when the trainer got here from step 2 of *add a client*, which found a
   * price list with nothing on it and sent them to define one.
   *
   * It changes one thing: a bar above the list saying why they are here and
   * offering the way back. It no longer has to be carried on tab links — the
   * pane's rows are the navigation now, and a trainer who wanders off to
   * Transactions has left the detour rather than broken it. The flag is a
   * BOOLEAN and the destination is hard-coded in the link; a `?next=` path read
   * out of the URL and pushed is an open redirect, and this page has no need of
   * one.
   */
  fromNewClient?: boolean;
}) {
  return (
    <>
      <TopBar crumb="Business / Packages" title="Business" />
      <main className="main" id="main-content">
        <BizHeader
          title="Packages"
          /* THE COUNT IS NOT HERE, AND THAT IS THE POINT.
             `Packages` draws its own summary line — *4 you sell · 2 Iron Yard
             sells · 22 active* — and it has to, because `showsGym` follows the
             work-mode toggle INSIDE that component, so a count computed up here
             would stop agreeing with the lists the moment the trainer changed
             modes. The first drawing of this header said *6 prices on file* one
             line above it: two counts of one thing, from two computations, on
             one screen. This line says what the page is FOR and lets the
             component say how much of it there is. */
          subtitle="What you sell, and what it is worth a session"
          /* No picker and no export. A price list has no period at all, and it
             is not a document a chartered accountant is sent. */
          showPeriod={false}
        />

        <div className="body">
          {fromNewClient && (
            /* The way back, above the list rather than at the end of it: a
               trainer who adds one pack and is done should not have to scroll
               past the other list to find the door they came in through. The
               flow's own draft is in `sessionStorage`, so `/clients/new` comes
               up on step 2 with the name and the number still in it. */
            <Why
              heading="You are in the middle of adding a client"
              style={{ marginTop: 0, marginBottom: 14 }}
            >
              <p>
                Step 2 found a price list with nothing on it. Add what you sell, then go
                back — the name and the number you typed are still there.
              </p>
              <div style={{ marginTop: 10 }}>
                <Button variant="primary" size="sm" href="/clients/new">
                  Back to adding a client
                </Button>
              </div>
            </Why>
          )}
          <Packages data={data} />
        </div>
      </main>
    </>
  );
}

'use client';

import { ThemeSwitch } from '../../ui/ThemeSwitch';

/**
 * The library's theme control.
 *
 * It used to own the whole mechanism — its own store, its own storage key, and
 * a cleanup that put dark back when you left the library. That was right while
 * the product shipped dark only: landing on a product screen in a theme the
 * product did not support would have been a bug.
 *
 * The product supports both now, so the scoping IS the bug. A trainer who picks
 * light means light, and the library is one more screen. This is the same
 * `ThemeSwitch` the account menu mounts, on the same store, against the same
 * key — the specimens change theme because the whole product did.
 *
 * The pre-paint script moved to the root layout for the same reason.
 */
export function ThemeToggle() {
  return (
    <div className="zoomer">
      <ThemeSwitch />
    </div>
  );
}

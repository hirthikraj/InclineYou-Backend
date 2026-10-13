/**
 * DEV ONLY: stop React's profiling track from throwing on a redirect.
 *
 * In `next dev`, React 19.2 draws every Server Component as a bar on the browser's Performance timeline, with one
 * `performance.measure()` per component. A component that calls `redirect()` or `notFound()` before any of its children
 * have rendered leaves React holding a negative end time, and the browser answers with
 *
 *     Failed to execute 'measure' on 'Performance': 'VerifyPage' cannot have a negative time stamp
 *
 * as a full-screen overlay. Every auth guard in this app is that shape — `VerifyPage` sends a visitor with no code in
 * flight back to `/sign-in`, the root fork sends a signed-in one to Today — so the overlay lands exactly on the sign-in
 * screens, where nothing is wrong. It is an upstream bug (vercel/next.js #86060, React 19.2), it never appears in a
 * production build, and the guards must not move into an effect to hide it: that would put a real flash of content in
 * front of every user to quiet a developer's console.
 *
 * So the one call that throws is wrapped. Only a negative-timestamp error is swallowed — a measure taken with a
 * genuinely bad mark name, or any other failure, still throws — and Firefox's wording ("cannot be negative") is matched
 * as well as Chrome's. Delete this file once the upstream fix is in the React that Next ships.
 */
if (process.env.NODE_ENV === 'development' && typeof performance !== 'undefined') {
  const nativeMeasure = performance.measure.bind(performance);

  performance.measure = ((...args: Parameters<Performance['measure']>) => {
    try {
      return nativeMeasure(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/negative time ?stamp|cannot be negative/i.test(message)) return undefined;
      throw error;
    }
  }) as Performance['measure'];
}

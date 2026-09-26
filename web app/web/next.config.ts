import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Phones on the same Wi-Fi reach the dev server by LAN IP, not localhost.
  // Next blocks cross-origin dev asset requests unless the origin is listed.
  //
  // `127.0.0.1` IS ON THE LIST, and leaving it off cost a whole session.
  // Next treats it as a different origin from `localhost`, so a tab opened on
  // `http://127.0.0.1:3100` got its HTML and its CSS and was REFUSED one client
  // chunk — logged by the dev server as "Blocked cross-origin request to
  // Next.js dev resource" and by the browser as nothing at all. Every screen
  // renders, the fonts load, the theme is right, and not one control responds,
  // because React never hydrates. No console error, no overlay, no failed
  // request the network panel flags as an error (it is a 503, retried into a
  // 200 that arrives too late).
  //
  // It is the most expensive kind of bug this file can hold: the symptom is
  // "the app is broken" and the cause is one missing string in the config.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.*.*", "10.*.*.*", "172.16.*.*"],

  /**
   * DEV ONLY: never let a phone cache a dev asset.
   *
   * COST US A WHOLE DEBUGGING ROUND TRIP, 4 Sep 2026. A CSS change was verified
   * present in the source, present in the bundle Turbopack emits, and present in
   * the bytes the LAN IP serves (`curl` over 192.168.x.x returned the new rules)
   * — and still absent on the iPhone testing it.
   *
   * The reason is that Turbopack's dev chunk URLs are STABLE. A production build
   * fingerprints a chunk by content, so new CSS is a new URL and no cache can
   * hold the old one. In dev the same path — `[root-of-the-server]__0-<id>._.css`
   * — serves different bytes after every edit, and mobile Safari caches it on
   * that path. HMR patches a tab that is already open; a phone that locks its
   * screen, sleeps and reloads gets the cache instead.
   *
   * The desk never sees this (DevTools is usually open with caching disabled),
   * which is why it reads as "the change did not apply" rather than as a cache.
   * `no-store` on the dev asset path makes the class of bug impossible, and it
   * is gated on NODE_ENV so a production deploy keeps its immutable caching.
   */
  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/_next/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;

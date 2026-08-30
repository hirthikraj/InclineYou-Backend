/**
 * `SetupApiError`, on its own and deliberately NOT behind `server-only`.
 *
 * The error is the one thing about the API layer that has to exist on both
 * sides of the action boundary: `lib/setup/api.ts` throws it on the server, and
 * `useStepAction` rebuilds it in the browser so `writeMessage` has one shape to
 * branch on rather than two. Leaving it in `api.ts` — which is `server-only`
 * because it holds `XREP_API_URL` and reads the JWT cookie — pulled that whole
 * module into the client bundle and the build refused, correctly.
 *
 * Nothing here touches the network or the environment. That is the whole reason
 * it can live in both places.
 */
export class SetupApiError extends Error {
  constructor(
    /** The HTTP status, or null when the request never left this server. */
    readonly status: number | null,
    /** The server's own words, when they were short enough to show anyone. */
    readonly detail: string | null,
  ) {
    super(`xrep api ${status ?? 'unreachable'}`);
    this.name = 'SetupApiError';
  }

  /** True when nothing reached the server, so nothing was written. */
  get unreachable(): boolean {
    return this.status === null;
  }
}

/**
 * Held back in v1 (R47): "Tell the client the plan changed" writes to the
 * portal's notification bell, and the portal is out of v1 (WEB_LAUNCH.md §3).
 * `POST /v1/programs/{id}/notify` is gone from the contract; flip this with the
 * portal's release, not before.
 */
export const RELEASE_PLAN_NOTICE = false;

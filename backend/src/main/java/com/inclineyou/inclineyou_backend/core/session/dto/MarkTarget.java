package com.inclineyou.inclineyou_backend.core.session.dto;

/**
 * A session about to be marked done, locked: {@code notStarted} is "its time has not come AND its log was never opened".
 *
 * <p>Read in ONE statement with what the mark needs next (13 Nov 2026) — how it is paid for, and the charge it already
 * carries — so a batch of fifty is fifty of these, not three reads each.
 *
 * @param billing    how it is paid for, as the charge needs it
 * @param liveCharge the charge it already carries (a no-show that cost a session), or null
 */
public record MarkTarget(String status, String clientId, boolean notStarted, String service,
                         SessionBilling billing, HeldCharge liveCharge) {}

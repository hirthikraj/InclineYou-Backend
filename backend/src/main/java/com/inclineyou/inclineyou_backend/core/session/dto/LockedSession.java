package com.inclineyou.inclineyou_backend.core.session.dto;

/**
 * The session row as the verbs need it, read under {@code FOR UPDATE}.
 *
 * @param service the service a pack must match: the session's own mode, else its slot's, else the client's default
 */
public record LockedSession(String status, String clientId, boolean notStarted, boolean started,
                            String service, long version, boolean deleted, boolean liveCharge) {}

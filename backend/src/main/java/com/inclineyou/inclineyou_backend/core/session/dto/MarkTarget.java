package com.inclineyou.inclineyou_backend.core.session.dto;

/** A session about to be marked done, locked: {@code notStarted} is "its time has not come AND its log was never opened". */
public record MarkTarget(String status, String clientId, boolean notStarted, String service) {}

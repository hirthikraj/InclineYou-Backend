package com.inclineyou.inclineyou_backend.core.session.dto;

/** Who a session id already belongs to, for a replay: this trainer's own booking, or somebody else's. */
public record SessionOwner(String trainerId, String clientId) {}

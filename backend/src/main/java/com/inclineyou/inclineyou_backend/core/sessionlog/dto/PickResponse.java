package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import java.util.List;

/** Who can be logged right now — three bounded groups, one composite read. */
public record PickResponse(List<OpenLog> open, List<BookedSession> booked, List<Everybody> everybody) {}

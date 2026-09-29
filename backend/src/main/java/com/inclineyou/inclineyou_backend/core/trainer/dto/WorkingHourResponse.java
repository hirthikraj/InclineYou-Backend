package com.inclineyou.inclineyou_backend.core.trainer.dto;

/**
 * One working window — {@code GET /v1/working-hours}.
 *
 * @param weekday 1 = Monday … 7 = Sunday, the schema's own numbering.
 * @param start   {@code "HH:mm"} — the columns are {@code time} in v1, so the
 *                old {@code startMinute} integers are gone from the wire.
 */
public record WorkingHourResponse(String id, int weekday, String start, String end) {}

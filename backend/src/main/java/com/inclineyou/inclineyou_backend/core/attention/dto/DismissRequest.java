package com.inclineyou.inclineyou_backend.core.attention.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code PUT /v1/attention/dismissals/{clientId}/{kind}} — the body of a snooze ("Not now") or a silence ("Not again").
 *
 * @param band         the band the row sits in right now, so an escalation can outrank the dismissal
 * @param snoozedUntil epoch ms to stay quiet until; null means "do not raise this again". Absent and null are the same thing.
 * @param subjectAt    epoch ms — when the silenced situation started, as the queue dated the row (16 Nov 2026, V36). A
 *                     row whose situation started later is a new one and comes back. Optional: absent keeps the old
 *                     reading (silenced until the band gets worse).
 */
public record DismissRequest(@NotBlank String band, Long snoozedUntil, Long subjectAt) {}

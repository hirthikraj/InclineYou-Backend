package com.inclineyou.inclineyou_backend.core.program.dto;

import com.inclineyou.inclineyou_backend.shared.wire.Patch;

import java.time.LocalDate;

/**
 * What a PATCH writes to the program row, validated: a field is null when the key was absent and a {@link Patch}
 * when it was sent, whose value is null when it was sent as null. It is built by the service from
 * {@link PatchProgramRequest} so the repository never sees the request body — only the columns the service decided
 * may change. {@code status} is not here: it has its own write, because activating a plan completes the client's other
 * one first.
 *
 * <p>{@code dates} is null when neither date was sent, and otherwise both dates as they will be stored — already
 * merged with the row and checked for order — so the repository writes them as a pair and never re-derives one.
 */
public record ProgramEdit(Patch<String> name, Patch<String> goal, Patch<String> description, Dates dates) {

    public record Dates(LocalDate start, LocalDate end) {}
}

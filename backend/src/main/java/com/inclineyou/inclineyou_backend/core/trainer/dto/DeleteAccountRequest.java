package com.inclineyou.inclineyou_backend.core.trainer.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code DELETE /v1/trainers/me}.
 *
 * @param confirmPhone the trainer's own number, typed back. Compared on the last
 *                     ten digits, so whichever way the screen formatted it back
 *                     to them is an answer this accepts.
 */
public record DeleteAccountRequest(@NotBlank String confirmPhone) {}

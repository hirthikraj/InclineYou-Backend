package com.inclineyou.inclineyou_backend.core.payment.dto;

/**
 * A package about to be taken back by {@code DELETE /v1/packages/{id}}, locked.
 *
 * @param deleted already taken back (a replay)
 * @param fresh   sold within the undo window
 * @param touched money (any payment row), or a pack event, or a session charge written after the sale itself
 * @param singleSale a single session's own sale (V32): it goes with its session, never on its own
 */
public record UndoTarget(boolean deleted, boolean fresh, boolean touched, boolean singleSale) {}

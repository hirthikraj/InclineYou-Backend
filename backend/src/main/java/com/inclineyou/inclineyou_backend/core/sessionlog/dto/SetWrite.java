package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

/** A set write's whole answer: the row, the session's new totals, and whether it beat the client's best. */
public record SetWrite(SetRow set, Totals totals, boolean isBest) {}

package com.inclineyou.inclineyou_backend.core.join.dto;

import java.util.List;

/** {@code GET /v1/join-requests}: newest first, at most 200 (the cap on waiting ones), and the three counts for the tab strip. */
public record JoinRequestList(List<JoinRequestItem> items, Counts counts) {
    public record Counts(int pending, int approved, int declined) {}
}

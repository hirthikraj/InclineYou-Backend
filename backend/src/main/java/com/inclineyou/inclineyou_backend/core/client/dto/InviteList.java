package com.inclineyou.inclineyou_backend.core.client.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * {@code GET /v1/client-invites}: a keyset-paged list, and — only with {@code include=counts} — the five headings'
 * numbers, over every invite regardless of the {@code state} filter so the tabs' badges do not move when a tab is picked.
 * {@code nextCursor} is always present (null on the last page), like every list on this wire; {@code counts} is absent unless asked.
 */
public record InviteList(List<InviteListItem> items, @JsonInclude(JsonInclude.Include.NON_NULL) Counts counts, String nextCursor) {

    /** {@code expired} is derived (a pending invite past its date), so the five add up to every invite. */
    public record Counts(int pending, int expired, int accepted, int declined, int revoked) {}
}

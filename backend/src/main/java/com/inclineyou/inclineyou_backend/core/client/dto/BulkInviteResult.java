package com.inclineyou.inclineyou_backend.core.client.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * {@code POST /v1/client-invites}: one result per id sent, in the order sent, always 200 whatever the mix (the 1.1 batch
 * shape). A skipped item carries only {@code clientId}, {@code outcome} and {@code reason}.
 */
public record BulkInviteResult(List<Item> results, Summary summary) {

    /** @param reason {@code NO_PHONE | ALREADY_ACCEPTED | ARCHIVED | PHONE_IS_TRAINER | NOT_FOUND}, only when skipped */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Item(String clientId, String outcome, String reason, InviteItem invite, String link, String draft, String waUrl) {

        public static Item created(InviteCreated c) {
            return new Item(c.client().id(), "created", null, c.invite(), c.link(), c.draft(), c.waUrl());
        }

        public static Item skipped(String clientId, String reason) {
            return new Item(clientId, "skipped", reason, null, null, null, null);
        }
    }

    public record Summary(int created, int skipped) {}
}

package com.inclineyou.inclineyou_backend.core.client.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonUnwrapped;

/**
 * One row of the Invitations list: the invite and who it is for. The token and its hash are not here, and cannot be
 * recovered by anyone: only the hash is stored, and it is never read back out.
 */
public record InviteListItem(
        @JsonUnwrapped InviteItem invite,
        Client client,
        /** {@code created_at} at full precision, for the cursor only — never on the wire. */
        @JsonIgnore String cursorKey
) {
    public record Client(String id, String name, String phone) {}
}

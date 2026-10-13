package com.inclineyou.inclineyou_backend.core.client.dto;

/**
 * {@code POST /v1/clients/{id}/invites}: the invite, the client it is for, and the three things the trainer needs to send
 * it. {@code link} is the raw token's only appearance anywhere — returned once, never again — which is why this response
 * is {@code no-store} and why the route takes no client-minted id (a replay could not return it a second time).
 */
public record InviteCreated(InviteItem invite, ClientRef client, String link, String draft, String waUrl) {

    public record ClientRef(String id, String name, String membershipStatus) {}
}

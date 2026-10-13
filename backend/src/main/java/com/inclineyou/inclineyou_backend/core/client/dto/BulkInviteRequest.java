package com.inclineyou.inclineyou_backend.core.client.dto;

import java.util.List;
import java.util.UUID;

/** {@code POST /v1/client-invites}: one to fifty distinct client ids. Checked by the service, which names the field. */
public record BulkInviteRequest(List<UUID> clientIds) {}

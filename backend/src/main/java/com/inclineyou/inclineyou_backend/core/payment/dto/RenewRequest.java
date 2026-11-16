package com.inclineyou.inclineyou_backend.core.payment.dto;

import java.util.List;

/**
 * @param id               optional, client-generated, so a retried request returns the package the first one
 *                         made instead of selling two
 * @param startDate        optional {@code yyyy-MM-dd}; defaults to today in the workspace's calendar
 * @param chargeSessionIds optional (V32): sessions this client was already given, delivered with no pack to pay for
 *                         them ({@code GET /v1/sessions?uncharged=true}), for the new pack to take — the trainer picks
 *                         them on the renew sheet; nothing is taken unless named here
 */
public record RenewRequest(String id, String startDate, List<String> chargeSessionIds) {}

package com.inclineyou.inclineyou_backend.core.payment.dto;

/**
 * @param id        optional, client-generated, so a retried request returns the package the first one
 *                  made instead of selling two
 * @param startDate optional {@code yyyy-MM-dd}; defaults to today in the workspace's calendar
 */
public record RenewRequest(String id, String startDate) {}

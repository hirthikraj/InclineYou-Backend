package com.inclineyou.inclineyou_backend.core.payment.dto;

/** Who a pack id belongs to, and whether it is deleted — what a create's replay check needs. */
public record PackOwnership(String trainerId, boolean deleted) {}

package com.inclineyou.inclineyou_backend.core.payment.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;

/**
 * One price-list row on the 1.1 wire. {@code gymSharePercent} / {@code gymShareAmount} are what the
 * gym keeps of a gym pack, derived (null on a trainer's own pack). {@code activeClients} and
 * {@code soldCount} only with {@code include=usage}.
 */
public record PackRow(String id, String name, String service, String basis, Integer sessions,
                      Integer validityDays, String amount, String currency, String owner,
                      BigDecimal trainerSharePercent, String trainerShareAmount,
                      BigDecimal gymSharePercent, String gymShareAmount,
                      String status, int orderIndex, String version,
                      @JsonInclude(JsonInclude.Include.NON_NULL) Integer activeClients,
                      @JsonInclude(JsonInclude.Include.NON_NULL) Integer soldCount) {}

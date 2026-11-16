package com.inclineyou.inclineyou_backend.core.session.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * How a session is paid for (V32), as the charge needs it.
 *
 * @param billing    {@code pack} · {@code trial} · {@code complimentary} · {@code single}
 * @param price      the single session's price; null otherwise
 * @param day        the session's day in the trainer's calendar — a single sale is due that day
 * @param clientType {@code independent} or {@code gym}: a gym client buys the gym's packs only, so has no single sale
 */
public record SessionBilling(String billing, BigDecimal price, LocalDate day, String clientType) {}

package com.inclineyou.inclineyou_backend.core.session.dto;

/**
 * The sale a {@code single} session made when it was booked (10 Nov 2026) — on the L4 row so the panel can say what is
 * owed and the cancel / no-show prompts can offer a refund. Null for every other billing.
 *
 * @param packageId the one-session package
 * @param amount    its price, a decimal string
 * @param paid      collected on it, less refunds, a decimal string
 * @param dueDate   the session's day, {@code yyyy-MM-dd} — nothing is owed before it
 * @param status    {@code active} (owed, or charged and still open) · {@code completed} (delivered) ·
 *                  {@code cancelled} (closed: nothing owed) · {@code refunded}
 */
public record SessionSale(String packageId, String amount, String paid, String dueDate, String status) {}

package com.inclineyou.inclineyou_backend.core.webhook;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** The reminder half of a delivery status: V26's {@code record_whatsapp_status()}, the one door onto {@code client_notification} for a caller with no session. */
@Repository
@RequiredArgsConstructor
public class WhatsAppStatusJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** Rows moved: 0 for a message that is not a reminder, or a status that would go backwards. */
    public int recordReminder(String messageId, String status, String error) {
        Integer n = jdbc.queryForObject("SELECT record_whatsapp_status(:id, :status, :error)",
                new MapSqlParameterSource().addValue("id", messageId).addValue("status", status).addValue("error", error),
                Integer.class);
        return n == null ? 0 : n;
    }
}

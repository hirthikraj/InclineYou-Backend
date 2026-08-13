package com.xrep.xrep_backend.nudge;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class NudgeService {

    private final NamedParameterJdbcTemplate jdbc;

    public record NudgeResult(String nudgeId, String whatsappUrl, String message) {}

    public NudgeResult sendNudge(UUID trainerId, UUID clientId, String templateName) {
        var clientRow = jdbc.queryForMap("""
                SELECT c.name, c.phone
                FROM client c
                WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()));

        String clientName = (String) clientRow.get("name");
        String phone = (String) clientRow.get("phone");

        String packageAmount = null;
        if ("payment_reminder".equals(templateName)) {
            try {
                packageAmount = jdbc.queryForObject("""
                        SELECT amount::text FROM package
                        WHERE client_id = :cid::uuid AND status = 'active' AND deleted_at IS NULL
                        ORDER BY created_at DESC LIMIT 1
                        """, Map.of("cid", clientId.toString()), String.class);
            } catch (EmptyResultDataAccessException ignored) {}
        }

        String message = formatTemplate(templateName, clientName, packageAmount);
        String normalizedPhone = normalizePhone(phone);
        String whatsappUrl = normalizedPhone != null
                ? "https://wa.me/" + normalizedPhone + "?text=" + URLEncoder.encode(message, StandardCharsets.UTF_8)
                : null;

        String nudgeId = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO nudge_log (id, trainer_id, client_id, channel, template_name, status, sent_at, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'whatsapp', :template, 'sent', NOW(), NOW(), NOW())
                """, Map.of(
                "id",       nudgeId,
                "tid",      trainerId.toString(),
                "cid",      clientId.toString(),
                "template", templateName
        ));

        log.info("nudge trainer={} client={} template={}", trainerId, clientId, templateName);
        return new NudgeResult(nudgeId, whatsappUrl, message);
    }

    private String formatTemplate(String templateName, String clientName, String packageAmount) {
        String first = clientName != null ? clientName.split(" ")[0] : "there";
        return switch (templateName) {
            case "session_reminder" -> String.format(
                    "Hi %s! Just a reminder for your training session tomorrow. See you there! 💪", first);
            case "payment_reminder" -> {
                String amtPart = packageAmount != null ? "₹" + packageAmount : "your training fee";
                yield String.format(
                        "Hi %s, %s is due. Please settle at your earliest convenience. Let me know if you have any questions!",
                        first, amtPart);
            }
            case "check_in" -> String.format(
                    "Hi %s! How's your week going? Keeping up with your training goals? Let me know if you need any adjustments.",
                    first);
            case "renewal" -> String.format(
                    "Hi %s! Your training package is expiring soon. Would you like to renew? Let's keep the momentum going! 💪",
                    first);
            default -> String.format("Hi %s, your trainer has sent you a message.", first);
        };
    }

    private String normalizePhone(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.startsWith("91") && digits.length() == 12) return digits;
        if (digits.length() == 10) return "91" + digits;
        return null;
    }
}

package com.inclineyou.inclineyou_backend.portal;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

import static com.inclineyou.inclineyou_backend.portal.PortalReadService.*;

/**
 * Module 11d · the client's settings and the client's bell.
 *
 * <p>{@code client_prefs} is the one table the trainer's half never reads (V18):
 * everything here runs as the client. The row is created on the first write,
 * with the all-on defaults; {@code notify} is MERGED, not replaced; a nominee key
 * sent as null clears it, an absent key leaves it alone.
 *
 * <p>The bell reads 21 days, newest first, with no {@code ?unread} filter —
 * the header counts what the list holds. Marking one is idempotent and never
 * un-reads; marking all is one request.
 */
@Service
@RequiredArgsConstructor
public class PortalPrefsService {

    static final int FEED_DAYS = 21;

    private final NamedParameterJdbcTemplate jdbc;

    public record Notification(String id, String kind, java.math.BigDecimal amount, Long subjectAt,
                               String text, long at, Long readAt) {}

    public record ReadStamp(String id, Long readAt) {}

    public record AllRead(long readAt) {}

    // ── Prefs ─────────────────────────────────────────────────────────────────

    public Prefs prefs(PortalScope.Me me) {
        var rows = jdbc.queryForList("""
                SELECT hide_weight, notify_program_updated, notify_session_reminder, notify_trainer_note,
                       notify_personal_best, notify_pack_changed, nominee_name, nominee_phone
                FROM client_prefs WHERE client_id = :cid::uuid AND deleted_at IS NULL
                """, params(me));
        if (rows.isEmpty()) return defaultPrefs(me.clientId());
        var r = rows.getFirst();
        return new Prefs(me.clientId().toString(), Boolean.TRUE.equals(r.get("hide_weight")),
                new Notify(b(r.get("notify_program_updated")), b(r.get("notify_session_reminder")),
                        b(r.get("notify_trainer_note")), b(r.get("notify_personal_best")), b(r.get("notify_pack_changed"))),
                r.get("nominee_name") == null ? null : new Nominee(s(r.get("nominee_name")), s(r.get("nominee_phone"))));
    }

    /** {@code { hideWeight?, notify?: Partial, nominee?: {name, phone} | null }} → the full prefs. */
    @Transactional
    public Prefs patch(PortalScope.Me me, Map<String, Object> body) {
        var b = body == null ? Map.<String, Object>of() : body;
        var current = prefs(me);
        boolean hide = b.get("hideWeight") instanceof Boolean h ? h : current.hideWeight();
        var n = current.notifications();
        if (b.get("notify") instanceof Map<?, ?> m) {
            n = new Notify(flag(m, "programUpdated", n.programUpdated()), flag(m, "sessionReminder", n.sessionReminder()),
                    flag(m, "trainerNote", n.trainerNote()), flag(m, "personalBest", n.personalBest()),
                    flag(m, "packChanged", n.packChanged()));
        }
        Nominee nominee = current.nominee();
        if (b.containsKey("nominee")) nominee = nominee(b.get("nominee"));

        var p = params(me);
        p.put("hide", hide);
        p.put("pu", n.programUpdated());
        p.put("sr", n.sessionReminder());
        p.put("tn", n.trainerNote());
        p.put("pb", n.personalBest());
        p.put("pc", n.packChanged());
        p.put("nn", nominee == null ? null : nominee.name());
        p.put("np", nominee == null ? null : nominee.phone());
        p.put("tenant", me.tenantId().toString());
        jdbc.update("""
                INSERT INTO client_prefs (client_id, hide_weight, notify_program_updated, notify_session_reminder,
                    notify_trainer_note, notify_personal_best, notify_pack_changed, nominee_name, nominee_phone, tenant_id)
                VALUES (:cid::uuid, :hide, :pu, :sr, :tn, :pb, :pc, :nn, :np, :tenant::uuid)
                ON CONFLICT (client_id) DO UPDATE SET
                    hide_weight = EXCLUDED.hide_weight,
                    notify_program_updated = EXCLUDED.notify_program_updated,
                    notify_session_reminder = EXCLUDED.notify_session_reminder,
                    notify_trainer_note = EXCLUDED.notify_trainer_note,
                    notify_personal_best = EXCLUDED.notify_personal_best,
                    notify_pack_changed = EXCLUDED.notify_pack_changed,
                    nominee_name = EXCLUDED.nominee_name,
                    nominee_phone = EXCLUDED.nominee_phone,
                    deleted_at = NULL
                """, p);
        return prefs(me);
    }

    /** null clears; otherwise a trimmed name (clipped to 80) and a 10-digit number. */
    private static Nominee nominee(Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof Map<?, ?> m)) throw PortalRuleException.validation("nominee: an object or null");
        String name = m.get("name") instanceof String nm ? nm.strip() : "";
        if (name.isEmpty()) throw PortalRuleException.validation("nominee.name: required");
        if (name.length() > 80) name = name.substring(0, 80);
        String digits = m.get("phone") instanceof String ph ? ph.replaceAll("\\D", "") : "";
        if (digits.length() > 10) digits = digits.substring(digits.length() - 10);
        if (digits.length() != 10) throw PortalRuleException.validation("nominee.phone: a 10-digit number");
        return new Nominee(name, digits);
    }

    // ── The bell ──────────────────────────────────────────────────────────────

    public List<Notification> feed(PortalScope.Me me) {
        var p = params(me);
        p.put("days", FEED_DAYS);
        return jdbc.queryForList("""
                SELECT id::text, kind, amount, subject_at, text, at, read_at FROM client_notification
                WHERE client_id = :cid::uuid AND deleted_at IS NULL AND at >= now() - make_interval(days => :days)
                ORDER BY at DESC, id
                """, p).stream().map(r -> new Notification(s(r.get("id")), s(r.get("kind")), dec(r.get("amount")),
                msOrNull(r.get("subject_at")), s(r.get("text")), ms(r.get("at")), msOrNull(r.get("read_at")))).toList();
    }

    @Transactional
    public ReadStamp markRead(PortalScope.Me me, UUID id) {
        var p = params(me);
        p.put("id", id.toString());
        jdbc.update("""
                UPDATE client_notification SET read_at = now()
                WHERE id = :id::uuid AND client_id = :cid::uuid AND read_at IS NULL AND deleted_at IS NULL
                """, p);
        var rows = jdbc.queryForList("""
                SELECT id::text, read_at FROM client_notification WHERE id = :id::uuid AND client_id = :cid::uuid AND deleted_at IS NULL
                """, p);
        if (rows.isEmpty()) throw PortalRuleException.notFound("No such notification.");
        return new ReadStamp(s(rows.getFirst().get("id")), msOrNull(rows.getFirst().get("read_at")));
    }

    @Transactional
    public AllRead markAllRead(PortalScope.Me me) {
        jdbc.update("""
                UPDATE client_notification SET read_at = now()
                WHERE client_id = :cid::uuid AND read_at IS NULL AND deleted_at IS NULL
                """, params(me));
        return new AllRead(System.currentTimeMillis());
    }

    private static boolean b(Object v) { return !Boolean.FALSE.equals(v); }

    private static boolean flag(Map<?, ?> m, String key, boolean fallback) {
        return m.get(key) instanceof Boolean v ? v : fallback;
    }
}

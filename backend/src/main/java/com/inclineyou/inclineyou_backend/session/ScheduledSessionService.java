package com.inclineyou.inclineyou_backend.session;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class ScheduledSessionService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record CreateRequest(
            @NotNull Long scheduledAt,
            @NotBlank String clientId,
            String programId,
            Integer durationMinutes,
            String notes,
            String dayLabel,
            Integer templateDay,
            /** 'floor' | 'remote'. Null means "use whatever this client usually does". */
            String deliveryMode
    ) {}

    public record SessionResponse(
            String id,
            String clientId,
            String programId,
            long scheduledAt,
            Integer durationMinutes,
            String status,
            String notes,
            String dayLabel,
            Integer templateDay,
            String deliveryMode,
            long createdAt,
            long updatedAt,
            /*
             * V10's `pack_delta` / `pack_package_id` — what this session took and
             * from which pack. 0 and null mean it cost nothing.
             *
             * Appended because writing `packDelta` without being able to read it
             * back is only half an answer: a no-show that found no chargeable
             * pack settles at 0, and the diary has to draw "Marked no-show" and
             * "Marked no-show · pack −1" as the different facts they are. It is
             * also what tells a caller whether there is a charge left to undo.
             *
             * APPENDED LAST.
             */
            Integer packDelta,
            String packPackageId
    ) {}

    /** The one row of columns every read of this table selects. */
    private static final String SESSION_COLUMNS =
            "id::text, client_id::text, program_id::text, scheduled_at, duration_minutes, " +
            "status, notes, day_label, template_day, delivery_mode, created_at, updated_at, " +
            "pack_delta, pack_package_id::text AS pack_package_id";

    // ── Create ────────────────────────────────────────────────────────────────

    @Transactional
    public SessionResponse create(UUID trainerId, CreateRequest req) {
        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", req.clientId(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
        }

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        Timestamp scheduledAt = Timestamp.from(Instant.ofEpochMilli(req.scheduledAt()));

        var p = new HashMap<String, Object>();
        p.put("id",              id.toString());
        p.put("tid",             trainerId.toString());
        p.put("cid",             req.clientId());
        p.put("programId",       req.programId());
        p.put("scheduledAt",     scheduledAt);
        p.put("durationMinutes", req.durationMinutes());
        p.put("notes",           req.notes());
        p.put("dayLabel",        req.dayLabel());
        p.put("templateDay",     req.templateDay());
        p.put("deliveryMode",    deliveryMode(req.deliveryMode()));
        p.put("now",             Timestamp.from(now));

        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, program_id, scheduled_at,
                    duration_minutes, notes, day_label, template_day, delivery_mode, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :programId::uuid, :scheduledAt,
                    :durationMinutes, :notes, :dayLabel, :templateDay, :deliveryMode, :now, :now)
                """, p);

        return new SessionResponse(id.toString(), req.clientId(), req.programId(),
                req.scheduledAt(), req.durationMinutes(), "scheduled", req.notes(),
                req.dayLabel(), req.templateDay(), deliveryMode(req.deliveryMode()),
                now.toEpochMilli(), now.toEpochMilli(), null, null);
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    public SessionResponse get(UUID id, UUID trainerId) {
        return toResponse(findOwned(id, trainerId));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> findOwned(UUID id, UUID trainerId) {
        var rows = jdbc.queryForList(
                "SELECT " + SESSION_COLUMNS +
                " FROM scheduled_session WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found");
        return rows.get(0);
    }

    private SessionResponse toResponse(Map<String, Object> r) {
        Object td = r.get("template_day");
        Integer templateDay = td instanceof Integer i ? i : (td != null ? Integer.parseInt(td.toString()) : null);
        return new SessionResponse(
                str(r.get("id")),
                str(r.get("client_id")),
                str(r.get("program_id")),
                toEpochMilli(r.get("scheduled_at")),
                (Integer) r.get("duration_minutes"),
                str(r.get("status")),
                str(r.get("notes")),
                str(r.get("day_label")),
                templateDay,
                str(r.get("delivery_mode")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")),
                (Integer) r.get("pack_delta"),
                str(r.get("pack_package_id")));
    }

    private String str(Object v) { return v == null ? null : v.toString(); }

    /**
     * 'floor' | 'remote' | null. Unrecognised values become null rather than a
     * 400 — see the note on the same helper in SyncService.
     */
    private static String deliveryMode(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toLowerCase();
        return value.equals("floor") || value.equals("remote") ? value : null;
    }

    private long toEpochMilli(Object v) {
        if (v instanceof java.sql.Timestamp ts)          return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt)   return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.LocalDateTime ldt)    return ldt.toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
        if (v instanceof java.time.Instant i)            return i.toEpochMilli();
        return 0L;
    }
}

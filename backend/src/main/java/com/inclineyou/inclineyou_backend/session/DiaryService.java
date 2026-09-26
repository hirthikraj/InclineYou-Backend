package com.inclineyou.inclineyou_backend.session;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;

/**
 * SELLING A PACK BOOKS THE SESSIONS. That is the whole of this class.
 *
 * <p>Until it existed, {@code POST /v1/clients/{id}/packages} wrote a package row
 * and a pending payment and stopped — so a trainer who had just sold twelve
 * sessions and agreed Mon/Wed/Fri at 7am with the client in front of them opened
 * the schedule and found it empty, and had to book twelve slots by hand or
 * forget. The pack said <i>12 of 12 left</i>. The diary said nothing was
 * happening. Two screens, one arrangement, and only one of them knew about it.
 *
 * <h2>Why neither row could do it alone</h2>
 *
 * <p>The rhythm lives on the CLIENT ({@code client.weekly_schedule} — which
 * mornings) and the count lives on the PACK ({@code package.sessions_remaining} —
 * how many). A diary is the join of the two, and nothing was performing it.
 * {@link SessionPlanner} is that join, kept pure so the web can run the identical
 * arithmetic to show a trainer the dates <i>before</i> the money is taken.
 *
 * <h2>The four writes that move a diary</h2>
 *
 * <ul>
 *   <li>{@code POST /v1/clients/{id}/packages} — the sale, with the days on it</li>
 *   <li>{@code POST /v1/packages/{id}/renew}   — the repeat, on the same rhythm</li>
 *   <li>{@code PUT  /v1/clients/{id}}          — the rhythm changed</li>
 *   <li>{@code POST /v1/templates/{id}/apply}  — a plan arrived; name the sessions</li>
 * </ul>
 *
 * <p>Every one of them calls {@link #reconcile} inside its own transaction, so a
 * sale that books nothing because the diary write failed cannot happen: either
 * both land or neither does.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DiaryService {

    private final NamedParameterJdbcTemplate jdbc;
    /** V18 · facts for the client's bell, gated by their own switches. */
    private final com.inclineyou.inclineyou_backend.notification.ClientNotificationService clientBell;

    private static final ObjectMapper STORE = new ObjectMapper();

    /**
     * The trainer's day. Every other date-bounded read in this codebase pins
     * {@code Asia/Kolkata} rather than the JVM's zone — {@code AuthService},
     * {@code WeeklyReportWriter} and {@code ReportController} all do — and a
     * diary laid out in the server's zone would put a 6am session at 11:30pm the
     * night before for a container running UTC.
     */
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    /** What one reconcile did, for the caller that wants to say so. */
    public record Result(int booked, int removed, Long firstAt) {
        public static final Result NOTHING = new Result(0, 0, null);
    }

    /**
     * MAKE THE DIARY SAY WHAT THE ARRANGEMENT SAYS.
     *
     * <p>It <b>reconciles</b> rather than appends, in three passes, and the order
     * matters:
     *
     * <ol>
     *   <li>a rhythm-laid future session the arrangement no longer contains —
     *       GONE. That covers both <i>the trainer moved Tuesday to Thursday</i>
     *       and <i>this pack only has two sessions left</i>, which are the same
     *       fact from the diary's point of view: the row is not in the
     *       arrangement any more.</li>
     *   <li>one the arrangement DOES contain — KEPT, and re-labelled from
     *       whatever plan they are on now. Keeping it is what makes editing the
     *       rhythm cheap: adding a fourth training day must not move the three
     *       already agreed, must not blank a note somebody typed on one, and must
     *       not renumber them.</li>
     *   <li>whatever is still missing — WRITTEN.</li>
     * </ol>
     *
     * <h2>What it will not touch, and why that is three separate rules</h2>
     *
     * <p><b>History.</b> Anything in the past, or already done, cancelled or
     * missed. A pack whose count fell to two must not go back and delete the ten
     * that were delivered. Those rows still OCCUPY their instants, so an
     * arrangement landing on one books nothing there rather than writing a second
     * session over the top of one somebody already did.
     *
     * <p><b>Anything booked by hand</b> ({@code from_schedule} false or null) —
     * the extra Saturday before a wedding, the catch-up for a missed Tuesday. The
     * rhythm did not put it there, so the rhythm may not take it away. Null means
     * <i>booked by hand</i>, which is the safe reading for every row written
     * before V3: the worst it costs is a stale slot a trainer can cancel, against
     * silently deleting a session somebody meant.
     *
     * <p><b>A row the trainer MOVED.</b>
     * {@code ScheduledSessionService.update} clears the flag on a move, so a
     * deliberate 7pm Thursday is not swept back to 6am Tuesday the next time
     * anything else about the client changes. The move is what makes it theirs.
     */
    @Transactional
    public Result reconcile(UUID trainerId, String clientId) {
        String tid = trainerId.toString();
        Map<String, Object> client = readClient(clientId, tid);
        if (client == null) return Result.NOTHING;

        List<SessionPlanner.Slot> slots = SessionPlanner.parseSlots(client.get("weekly_schedule"));
        ZonedDateTime now = ZonedDateTime.now(IST);
        Map<String, Object> pack = readLivePackage(clientId, tid);
        List<SessionPlanner.Planned> planned = plan(slots, pack, now);

        Program program = readLiveProgram(clientId, tid);
        var namer = new DayNamer(slots, program);

        var wanted = new LinkedHashMap<Long, SessionPlanner.Planned>();
        for (var p : planned) wanted.put(p.at(), p);

        int removed = 0;
        for (Map<String, Object> row : readSessions(clientId, tid)) {
            long at = ((Timestamp) row.get("scheduled_at")).toInstant().toEpochMilli();
            SessionPlanner.Planned slot = wanted.get(at);
            boolean editable = "scheduled".equals(str(row.get("status")))
                    && at > now.toInstant().toEpochMilli();
            boolean rhythm = Boolean.TRUE.equals(row.get("from_schedule"));

            if (slot == null) {
                if (editable && rhythm) {
                    jdbc.update("""
                            UPDATE scheduled_session SET deleted_at = NOW(), updated_at = NOW()
                            WHERE id = :id::uuid AND trainer_id = :tid::uuid
                            """, Map.of("id", str(row.get("id")), "tid", tid));
                    removed++;
                }
                continue;
            }

            // Occupied either way — a past or hand-booked row on a standing slot
            // is not doubled. Only a live rhythm row is re-labelled.
            wanted.remove(at);
            if (!editable || !rhythm) continue;
            var named = namer.name(slot.templateDay());
            var p = new HashMap<String, Object>();
            p.put("id",    str(row.get("id")));
            p.put("tid",   tid);
            p.put("day",   named.templateDay());
            p.put("label", named.label());
            p.put("prog",  program == null ? null : program.id());
            jdbc.update("""
                    UPDATE scheduled_session
                    SET template_day = :day,
                        day_label    = :label,
                        program_id   = COALESCE(:prog::uuid, program_id),
                        updated_at   = NOW()
                    WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, p);
        }

        Integer duration = toInt(client.get("session_duration_minutes"));
        String mode = str(client.get("delivery_mode"));
        int booked = 0;
        Long firstAt = null;
        for (var slot : planned) {
            if (!wanted.containsKey(slot.at())) continue;
            var named = namer.name(slot.templateDay());
            var p = new HashMap<String, Object>();
            p.put("id",       UUID.randomUUID().toString());
            p.put("tid",      tid);
            p.put("cid",      clientId);
            p.put("prog",     program == null ? null : program.id());
            p.put("at",       Timestamp.from(Instant.ofEpochMilli(slot.at())));
            p.put("duration", duration != null ? duration : 60);
            p.put("day",      named.templateDay());
            p.put("label",    named.label());
            /* Their usual, not a frozen copy of it. `API.md` says a null
               deliveryMode means "use whatever this client usually does", and a
               mode stamped on every row would freeze today's answer onto a client
               who moves to remote next month. */
            p.put("mode",     mode);
            jdbc.update("""
                    INSERT INTO scheduled_session (id, trainer_id, client_id, program_id, scheduled_at,
                        duration_minutes, status, day_label, template_day, delivery_mode,
                        from_schedule, created_at, updated_at)
                    VALUES (:id::uuid, :tid::uuid, :cid::uuid, :prog::uuid, :at,
                        :duration, 'scheduled', :label, :day, :mode, TRUE, NOW(), NOW())
                    """, p);
            booked++;
            if (firstAt == null) firstAt = slot.at();
        }

        if (booked > 0 || removed > 0) {
            log.debug("diary reconciled for client {}: +{} -{}", clientId, booked, removed);
        }
        /* V18 · ONE notification for a booking run, naming the first session.
           Twelve rows for a twelve-session pack is the behaviour that makes a
           client switch the category off — and then miss the one that matters. */
        if (booked > 0 && firstAt != null) {
            clientBell.mint(clientId, "session", null, java.time.Instant.ofEpochMilli(firstAt), "booked");
        }
        return new Result(booked, removed, firstAt);
    }

    /**
     * WHAT THE DIARY SHOULD SAY, from the rhythm and the count. Nothing is
     * written here — this is the arrangement, stated.
     *
     * <p>No pack is not the same as no diary. The add-a-client flow lets a
     * trainer set the days and skip the sale — <i>sell it on the day they pay</i>
     * is that button's whole meaning — and a client whose Tuesdays are agreed
     * should appear on Tuesday whether or not the money has happened yet. Four
     * weeks then; the pack, when it is sold, extends that to its count.
     */
    private List<SessionPlanner.Planned> plan(List<SessionPlanner.Slot> slots,
                                              Map<String, Object> pack,
                                              ZonedDateTime now) {
        if (slots.isEmpty()) return List.of();
        if (pack == null) return SessionPlanner.layout(slots, now, null, null, IST);

        Integer remaining = toInt(pack.get("sessions_remaining"));
        Integer total = toInt(pack.get("sessions_total"));
        // A monthly has no count to run down: `sessions_total` is null and
        // `sessions_remaining` is stored as 0, which must not read as "used up".
        Integer count = total == null ? null : remaining;
        if (count != null && count <= 0) return List.of();

        /* A pack that starts next Monday does not book this Thursday, and a pack
           sold at 11am does not book this morning's 7am. The later of the two. */
        ZonedDateTime from = now;
        LocalDate start = toLocalDate(pack.get("start_date"));
        if (start != null) {
            ZonedDateTime startsAt = start.atStartOfDay(IST);
            if (startsAt.isAfter(from)) from = startsAt;
        }

        LocalDate end = toLocalDate(pack.get("end_date"));
        ZonedDateTime until = end == null ? null : end.plusDays(1).atStartOfDay(IST).minusNanos(1);

        return SessionPlanner.layout(slots, from, count, until, IST);
    }

    // ── Naming a client's morning from their plan's ordinal day ───────────────

    private record Program(String id, Map<Integer, String> dayLabels, List<Integer> days) {}

    /**
     * THIS CLIENT'S SECOND MORNING IS THIS PLAN'S SECOND DAY.
     *
     * <p>Two numberings meet here and they are not the same thing. A session laid
     * down from {@code client.weekly_schedule} carries that slot's <b>ordinal</b>
     * {@code templateDay} — 1, 2, 3, numbered from the client's own Monday. On a
     * COPY, {@code program.day_labels} and {@code program.training_days} are keyed
     * by <b>weekday</b>: V2's backfill re-keys them through the schedule and
     * {@code TemplateService.shapeFor} writes them that way at apply, so a client
     * training Mon/Wed/Fri has labels under 1, 3 and 5.
     *
     * <h2>Position is the whole rule, and "look it up directly first" is not</h2>
     *
     * <p>The shortcut — try {@code day_labels[templateDay]} and fall back to
     * position — was written first and is wrong <b>exactly half the time</b>,
     * found by running it: on Mon/Wed/Fri the client's ordinals are 1, 2, 3 and
     * the plan's keys are 1, 3, 5, so ordinal 1 hits weekday 1 and is right by
     * luck, ordinal 2 misses and falls back correctly, and <b>ordinal 3 hits
     * weekday 3 and takes Wednesday's name onto Friday</b>. Push / Pull / Pull.
     *
     * <p>Both lists are sorted ascending by weekday — {@code parseSlots} sorts the
     * client's, {@code parseDayCsv} sorts the plan's — so the client's i-th
     * morning IS the plan's i-th day, and that holds whether the stored ordinal
     * is 1,2,3 or already a weekday. There is no case the shortcut gets right that
     * position gets wrong, and one it gets loudly wrong.
     */
    private static final class DayNamer {
        private final Program program;
        private final Map<Integer, Integer> position = new HashMap<>();
        private final List<Integer> days;

        DayNamer(List<SessionPlanner.Slot> slots, Program program) {
            this.program = program;
            this.days = program == null ? List.of() : program.days();
            for (int i = 0; i < slots.size(); i++) position.put(slots.get(i).templateDay(), i);
        }

        record Named(Integer templateDay, String label) {}

        Named name(int templateDay) {
            if (program == null || days.isEmpty()) return new Named(templateDay, null);
            int day = days.get(position.getOrDefault(templateDay, 0) % days.size());
            return new Named(day, program.dayLabels().get(day));
        }
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    private Map<String, Object> readClient(String clientId, String tid) {
        var rows = jdbc.queryForList("""
                SELECT weekly_schedule::text AS weekly_schedule, session_duration_minutes, delivery_mode
                FROM client
                WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("cid", clientId, "tid", tid));
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * The pack the diary's length comes from.
     *
     * <p>Newest first, because a sale closes the previous pack in the same
     * transaction and this may run before that row has settled — the one a
     * trainer just bought is the one the diary is about.
     */
    private Map<String, Object> readLivePackage(String clientId, String tid) {
        var rows = jdbc.queryForList("""
                SELECT sessions_total, sessions_remaining, start_date, end_date
                FROM package
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid
                  AND status = 'active' AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT 1
                """, Map.of("cid", clientId, "tid", tid));
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Program readLiveProgram(String clientId, String tid) {
        var rows = jdbc.queryForList("""
                SELECT id::text, day_labels::text AS day_labels, training_days
                FROM program
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid
                  AND status = 'active' AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT 1
                """, Map.of("cid", clientId, "tid", tid));
        if (rows.isEmpty()) return null;
        var r = rows.get(0);
        return new Program(str(r.get("id")),
                           parseDayLabels(str(r.get("day_labels"))),
                           parseDayCsv(str(r.get("training_days"))));
    }

    /** Every session this client has — a past row still occupies its instant. */
    private List<Map<String, Object>> readSessions(String clientId, String tid) {
        return jdbc.queryForList("""
                SELECT id::text, scheduled_at, status, from_schedule
                FROM scheduled_session
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY scheduled_at ASC
                """, Map.of("cid", clientId, "tid", tid));
    }

    // ── Coercions ─────────────────────────────────────────────────────────────

    private static Map<Integer, String> parseDayLabels(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, String> raw = STORE.readValue(json, new TypeReference<Map<String, String>>() {});
            var out = new HashMap<Integer, String>();
            raw.forEach((k, v) -> {
                try {
                    out.put(Integer.parseInt(k.trim()), v);
                } catch (NumberFormatException ignored) {
                    // A non-numeric key is not a day. Dropping it loses a label;
                    // throwing would lose the whole reconcile.
                }
            });
            return out;
        } catch (Exception e) {
            log.warn("Unreadable program day_labels: {}", e.getMessage());
            return Map.of();
        }
    }

    /** {@code "1,2,4"} → [1, 2, 4], sorted and de-duplicated. */
    private static List<Integer> parseDayCsv(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        var out = new TreeSet<Integer>();
        for (String part : csv.split(",")) {
            try {
                out.add(Integer.parseInt(part.trim()));
            } catch (NumberFormatException ignored) {
                // Same call as above: a malformed CSV costs a name, not a diary.
            }
        }
        return List.copyOf(out);
    }

    private static String str(Object v) { return v == null ? null : v.toString(); }

    private static Integer toInt(Object v) {
        return v instanceof Number n ? n.intValue() : null;
    }

    private static LocalDate toLocalDate(Object v) {
        if (v instanceof java.sql.Date d) return d.toLocalDate();
        if (v instanceof LocalDate d) return d;
        if (v == null) return null;
        try {
            return LocalDate.parse(v.toString());
        } catch (Exception e) {
            return null;
        }
    }
}

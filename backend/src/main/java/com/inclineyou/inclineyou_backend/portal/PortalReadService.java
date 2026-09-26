package com.inclineyou.inclineyou_backend.portal;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.inclineyou.inclineyou_backend.assessment.AssessmentCatalogue;
import com.inclineyou.inclineyou_backend.assessment.AssessmentTemplateService;
import com.inclineyou.inclineyou_backend.assessment.MetricReadings;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Module 11a · the client portal's reads — everything `/me/*` draws.
 *
 * <p>Every method takes a resolved {@link PortalScope.Me} and reads THAT client
 * row's file and nothing else: each query names {@code client_id} explicitly,
 * and the tier-4 policies are the backstop behind it (they would admit every
 * roster on the phone, which is why the explicit filter is not optional).
 *
 * <h2>What a client is never shown</h2>
 *
 * Projections are field by field, never {@code SELECT *}: a payment row carries
 * {@code collected_by}, {@code gym_share_amount} and {@code share_percent}, which
 * are the trainer's arrangement with the gym, and a session carries its pack
 * charge. None of that reaches this wire, and a column added tomorrow cannot leak
 * into it by accident.
 *
 * <h2>The plan is keyed by the client's DAY SLOTS, not by weekday</h2>
 *
 * A client's copy of a plan stores {@code day_of_week} as a WEEKDAY (V2's
 * translation at apply), while {@code scheduled_session.template_day} — which the
 * portal's day pages link through — is the template's ORDINAL slot. So the
 * program view maps each weekday back to its slot through {@code program.schedule}
 * ({@code [{day, weekday, time}]}); a plan written from scratch has no schedule
 * and keeps its weekdays as its keys. Either way {@code days[].templateDay},
 * {@code trainingDays} and the keys of {@code dayLabels} agree with each other and
 * with the sessions.
 */
@Service
@RequiredArgsConstructor
public class PortalReadService {

    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final ObjectMapper JSON = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private final NamedParameterJdbcTemplate jdbc;
    private final PortalPrefsService prefs;
    private final MetricReadings metricReadings;

    // ── Wire ──────────────────────────────────────────────────────────────────

    public record MeClient(String id, String name, String phone, String goal, String membershipStatus,
                           String deliveryMode, Integer sessionsPerWeek, Integer sessionDurationMinutes,
                           List<Map<String, Object>> weeklySchedule, long startedAt, String health) {}

    public record MeTrainer(String id, String name, String phone, String gymName, String headline, String mapLink) {}

    public record Roster(String clientId, String clientName, String trainerName) {}

    public record Notify(boolean programUpdated, boolean sessionReminder, boolean trainerNote,
                         boolean personalBest, boolean packChanged) {}

    public record Nominee(String name, String phone) {}

    /** {@code notify} on the wire; a record component cannot be called that (it is {@code Object.notify()}). */
    public record Prefs(String clientId, boolean hideWeight,
                        @com.fasterxml.jackson.annotation.JsonProperty("notify") Notify notifications,
                        Nominee nominee) {}

    public record MeResponse(MeClient client, MeTrainer trainer, List<Roster> rosters, Prefs prefs) {}

    public record Session(String id, long scheduledAt, Integer durationMinutes, String status, String dayLabel,
                          Integer templateDay, String deliveryMode, String location, String workoutId) {}

    public record Exercise(String id, String name, String muscleGroup, String equipment, String logType,
                           String cue, List<String> formCues, String steps) {}

    public record PlanRow(Exercise exercise, Integer sets, Integer reps, BigDecimal targetLoad, Integer restSeconds) {}

    public record PlanDay(int templateDay, String label, List<PlanRow> exercises) {}

    public record Program(String id, String name, String goal, String startDate, String endDate, Integer weeks,
                          String status, Integer week, Map<String, String> dayLabels, List<Integer> trainingDays,
                          List<PlanDay> days) {}

    public record ProgramSummary(String id, String name, String goal, String startDate, String endDate,
                                 Integer weeks, String status, List<Integer> trainingDays, int dayCount,
                                 int exerciseCount, Integer workoutCount) {}

    public record WorkoutSummary(String id, String sessionDate, long startedAt, Long endedAt, int setCount,
                                 long volumeKg, int exerciseCount, String effort) {}

    public record SetRow(String id, int setNumber, BigDecimal loadKg, Integer reps, BigDecimal rpe) {}

    public record LastSet(int setNumber, BigDecimal loadKg, Integer reps) {}

    public record LastTime(String sessionDate, List<LastSet> sets, BigDecimal bestLoadKg, Integer bestReps) {}

    public record WorkoutExercise(Exercise exercise, Integer targetSets, Integer targetReps, BigDecimal targetLoad,
                                  Integer restSeconds, String swappedFromExerciseId, Exercise alternative,
                                  List<SetRow> sets, LastTime lastTime) {}

    public record Feedback(String effort, String note, long at) {}

    public record Workout(String id, String sessionDate, long startedAt, Long endedAt, String dayLabel,
                          String programName, String deliveryMode, Long scheduledAt, String notes,
                          Feedback feedback, List<WorkoutExercise> exercises) {}

    public record LoggedSet(String exerciseId, int setNumber, BigDecimal loadKg, Integer reps,
                            String sessionDate, long createdAt) {}

    public record Metric(String id, String metricType, BigDecimal value, String unit, long recordedAt) {}

    public record Package(String id, String name, String type, Integer sessionsTotal, Integer sessionsRemaining,
                          BigDecimal amount, BigDecimal amountPaid, BigDecimal amountDue, String status,
                          String startDate, String endDate, Long pausedAt) {}

    public record Payment(String id, BigDecimal amount, String method, String status, Long paidAt, long createdAt) {}

    public record Message(String id, String body, String kind, long at, Long readAt, String trainerName) {}

    public record Milestone(String id, String kind, String label, BigDecimal value, long at) {}

    public record Count(int got, int asked) {}

    public record CheckIn(String id, String name, String dueAt, String sentAt, String completedAt, String status,
                          Count measurements, Count questions) {}

    public record Asked(List<AssessmentCatalogue.Measurement> measurements, List<AssessmentCatalogue.Question> questions) {}

    public record CheckInDetail(String id, String name, String dueAt, String sentAt, String completedAt,
                                String status, Count measurements, Count questions, String description,
                                Asked asked, List<Map<String, Object>> readings, List<Map<String, Object>> answers) {}

    // ── /v1/me ────────────────────────────────────────────────────────────────

    public MeResponse me(PortalScope.Me me) {
        var c = one("""
                SELECT id::text, name, phone, goal, membership_status, delivery_mode, sessions_per_week,
                       session_duration_minutes, weekly_schedule::text AS weekly_schedule,
                       COALESCE(accepted_at, created_at) AS started_at, metadata->>'health' AS health
                FROM client WHERE id = :cid::uuid
                """, me);
        var t = one("""
                SELECT id::text, name, phone, gym_name, headline, map_link FROM trainer WHERE id = :tid::uuid
                """, me);
        var rosters = jdbc.queryForList("""
                SELECT c.id::text AS cid, c.name AS cname, t.name AS tname
                FROM client c JOIN trainer t ON t.id = c.trainer_id
                WHERE c.phone = :phone AND c.deleted_at IS NULL AND t.deleted_at IS NULL
                  AND c.membership_status NOT IN ('declined')
                ORDER BY c.accepted_at DESC NULLS LAST, c.created_at DESC, c.id
                """, Map.of("phone", me.phone())).stream()
                .map(r -> new Roster(s(r.get("cid")), s(r.get("cname")), s(r.get("tname")))).toList();
        return new MeResponse(
                new MeClient(s(c.get("id")), s(c.get("name")), s(c.get("phone")), s(c.get("goal")),
                        s(c.get("membership_status")), s(c.get("delivery_mode")), i(c.get("sessions_per_week")),
                        i(c.get("session_duration_minutes")), listOfMaps(s(c.get("weekly_schedule"))),
                        ms(c.get("started_at")), Objects.requireNonNullElse(s(c.get("health")), "")),
                new MeTrainer(s(t.get("id")), s(t.get("name")), s(t.get("phone")), s(t.get("gym_name")),
                        s(t.get("headline")), s(t.get("map_link"))),
                rosters,
                prefs.prefs(me));
    }

    /** Every switch on, nothing hidden, no nominee — what a client with no `client_prefs` row has. */
    static Prefs defaultPrefs(UUID clientId) {
        return new Prefs(clientId.toString(), false, new Notify(true, true, true, true, true), null);
    }

    // ── Sessions ──────────────────────────────────────────────────────────────

    /** Half-open {@code [from, to)} in epoch ms; a missing bound is unbounded. No pack charge on this wire. */
    public List<Session> sessions(PortalScope.Me me, Long from, Long to) {
        var p = params(me);
        p.put("from", Timestamp.from(Instant.ofEpochMilli(from == null ? 0L : from)));
        p.put("to", Timestamp.from(to == null ? Instant.parse("9999-12-31T00:00:00Z") : Instant.ofEpochMilli(to)));
        return jdbc.queryForList("""
                SELECT s.id::text, s.scheduled_at, s.duration_minutes, s.status, s.day_label, s.template_day,
                       COALESCE(s.delivery_mode, c.delivery_mode) AS mode, t.gym_name,
                       (SELECT w.id::text FROM workout_session w
                         WHERE w.scheduled_session_id = s.id AND w.deleted_at IS NULL
                         ORDER BY w.created_at DESC, w.id LIMIT 1) AS workout_id
                FROM scheduled_session s
                JOIN client c ON c.id = s.client_id
                JOIN trainer t ON t.id = s.trainer_id
                WHERE s.client_id = :cid::uuid AND s.deleted_at IS NULL
                  AND s.scheduled_at >= :from AND s.scheduled_at < :to
                ORDER BY s.scheduled_at ASC, s.id
                """, p).stream().map(r -> {
            String mode = s(r.get("mode"));
            return new Session(s(r.get("id")), ms(r.get("scheduled_at")), i(r.get("duration_minutes")),
                    s(r.get("status")), s(r.get("day_label")), i(r.get("template_day")), mode,
                    "remote".equals(mode) ? null : s(r.get("gym_name")), s(r.get("workout_id")));
        }).toList();
    }

    // ── The plan ──────────────────────────────────────────────────────────────

    /** The live plan — the newest `active` one, since two can exist from before apply ended the old — or null. */
    public Program program(PortalScope.Me me) {
        var rows = jdbc.queryForList(PROGRAM_SQL + """
                WHERE p.client_id = :cid::uuid AND p.deleted_at IS NULL AND p.status = 'active'
                ORDER BY p.created_at DESC, p.id LIMIT 1
                """, params(me));
        return rows.isEmpty() ? null : programView(rows.getFirst());
    }

    public Program programById(PortalScope.Me me, UUID id) {
        var p = params(me);
        p.put("pid", id.toString());
        var rows = jdbc.queryForList(PROGRAM_SQL + " WHERE p.id = :pid::uuid AND p.client_id = :cid::uuid AND p.deleted_at IS NULL", p);
        if (rows.isEmpty()) throw PortalRuleException.notFound("That plan is not here.");
        return programView(rows.getFirst());
    }

    /**
     * Every NON-active plan, newest first. {@code workoutCount} is the workouts
     * logged against it — or NULL when there is no record to count from (no
     * workouts on file at all, or the block ended before the oldest one): a zero
     * would claim the client trained none of it, which nobody can know. No
     * adherence figure, by rule.
     */
    public List<ProgramSummary> programs(PortalScope.Me me) {
        var p = params(me);
        String oldestText = jdbc.queryForObject("""
                SELECT min(session_date)::text FROM workout_session WHERE client_id = :cid::uuid AND deleted_at IS NULL
                """, p, String.class);
        LocalDate oldest = oldestText == null ? null : LocalDate.parse(oldestText);
        return jdbc.queryForList("""
                SELECT p.id::text, p.name, p.goal, p.start_date::text AS start_date, p.end_date::text AS end_date,
                       p.weeks, p.status, p.training_days, p.schedule::text AS schedule,
                       (SELECT count(DISTINCT pe.day_of_week) FROM program_exercise pe
                         WHERE pe.program_id = p.id AND pe.deleted_at IS NULL) AS day_count,
                       (SELECT count(DISTINCT pe.exercise_id) FROM program_exercise pe
                         WHERE pe.program_id = p.id AND pe.deleted_at IS NULL) AS exercise_count,
                       (SELECT count(*) FROM workout_session w
                         WHERE w.program_id = p.id AND w.deleted_at IS NULL) AS workout_count
                FROM program p
                WHERE p.client_id = :cid::uuid AND p.deleted_at IS NULL AND p.status <> 'active'
                ORDER BY p.created_at DESC, p.id
                """, p).stream().map(r -> {
            String end = s(r.get("end_date"));
            boolean noRecord = oldest == null || (end != null && LocalDate.parse(end).isBefore(oldest));
            var slots = slotMap(s(r.get("schedule")));
            var days = csv(s(r.get("training_days"))).stream().map(d -> slots.getOrDefault(d, d)).sorted().toList();
            return new ProgramSummary(s(r.get("id")), s(r.get("name")), s(r.get("goal")), s(r.get("start_date")), end,
                    i(r.get("weeks")), s(r.get("status")), days, n(r.get("day_count")), n(r.get("exercise_count")),
                    noRecord ? null : n(r.get("workout_count")));
        }).toList();
    }

    private static final String PROGRAM_SQL = """
            SELECT p.id::text, p.name, p.goal, p.start_date::text AS start_date, p.end_date::text AS end_date,
                   p.weeks, p.status, p.training_days, p.day_labels::text AS day_labels,
                   p.schedule::text AS schedule, p.created_at
            FROM program p
            """;

    /**
     * One plan, days keyed by the client's slots (see the class note). A
     * multi-week plan shows ONE week: the current one on a live plan (weeks since
     * its start, clamped to its length), week 1 on a finished one.
     */
    private Program programView(Map<String, Object> p) {
        String status = s(p.get("status"));
        Integer weeks = i(p.get("weeks"));
        Integer week = null;
        if ("active".equals(status)) {
            LocalDate start = p.get("start_date") != null ? LocalDate.parse(s(p.get("start_date")))
                    : LocalDate.ofInstant(Instant.ofEpochMilli(ms(p.get("created_at"))), IST);
            long w = Math.floorDiv(ChronoUnit.DAYS.between(start, LocalDate.now(IST)), 7) + 1;
            week = (int) Math.max(1, weeks == null ? w : Math.min(weeks, w));
        }
        int shownWeek = week == null ? 1 : week;
        var slots = slotMap(s(p.get("schedule")));                     // weekday → slot
        Map<String, String> storedLabels = stringMap(s(p.get("day_labels")));   // keyed by weekday

        var rows = jdbc.queryForList("""
                SELECT pe.exercise_id::text AS eid, pe.day_of_week, pe.sets, pe.reps, pe.target_load,
                       pe.rest_seconds, pe.notes, COALESCE(pe.week, 1) AS week
                FROM program_exercise pe
                WHERE pe.program_id = :pid::uuid AND pe.deleted_at IS NULL
                ORDER BY pe.day_of_week NULLS LAST, pe.order_index, pe.id
                """, Map.of("pid", s(p.get("id"))));
        boolean hasWeek = rows.stream().anyMatch(r -> n(r.get("week")) == shownWeek);
        int useWeek = hasWeek ? shownWeek : 1;
        var library = exercises(rows.stream().map(r -> s(r.get("eid"))).toList());

        var byDay = new TreeMap<Integer, List<PlanRow>>();
        for (Integer d : csv(s(p.get("training_days")))) byDay.putIfAbsent(slots.getOrDefault(d, d), new ArrayList<>());
        for (var r : rows) {
            if (n(r.get("week")) != useWeek || r.get("day_of_week") == null) continue;
            int weekday = n(r.get("day_of_week"));
            var base = library.get(s(r.get("eid")));
            var ex = base == null ? null : new Exercise(base.id(), base.name(), base.muscleGroup(), base.equipment(),
                    base.logType(), s(r.get("notes")), base.formCues(), base.steps());
            byDay.computeIfAbsent(slots.getOrDefault(weekday, weekday), k -> new ArrayList<>())
                    .add(new PlanRow(ex, i(r.get("sets")), i(r.get("reps")), dec(r.get("target_load")), i(r.get("rest_seconds"))));
        }
        var labels = new LinkedHashMap<String, String>();
        storedLabels.forEach((k, v) -> {
            try {
                int weekday = Integer.parseInt(k);
                labels.put(String.valueOf(slots.getOrDefault(weekday, weekday)), v);
            } catch (NumberFormatException ignored) { /* not a day */ }
        });
        var days = byDay.entrySet().stream().map(e -> new PlanDay(e.getKey(),
                labels.getOrDefault(String.valueOf(e.getKey()), "Day " + e.getKey()), e.getValue())).toList();
        return new Program(s(p.get("id")), s(p.get("name")), s(p.get("goal")), s(p.get("start_date")),
                s(p.get("end_date")), weeks, status, week, labels, List.copyOf(byDay.keySet()), days);
    }

    // ── Workouts ──────────────────────────────────────────────────────────────

    /** Newest first; {@code limit} optional. Volume is Σ load × reps, rounded to whole kg. */
    public List<WorkoutSummary> workouts(PortalScope.Me me, Integer limit) {
        var p = params(me);
        p.put("limit", limit == null || limit <= 0 ? Integer.MAX_VALUE : Math.min(limit, 1000));
        return jdbc.queryForList("""
                SELECT w.id::text, w.session_date::text AS session_date, w.created_at, w.ended_at,
                       count(sl.id) AS set_count,
                       COALESCE(sum(COALESCE(sl.load_kg, 0) * COALESCE(sl.reps, 0)), 0) AS volume,
                       count(DISTINCT sl.exercise_id) AS exercise_count,
                       (SELECT f.effort FROM workout_feedback f
                         WHERE f.workout_session_id = w.id AND f.deleted_at IS NULL) AS effort
                FROM workout_session w
                LEFT JOIN set_log sl ON sl.workout_session_id = w.id AND sl.deleted_at IS NULL
                WHERE w.client_id = :cid::uuid AND w.deleted_at IS NULL
                GROUP BY w.id
                ORDER BY w.created_at DESC, w.id
                LIMIT :limit
                """, p).stream().map(r -> new WorkoutSummary(s(r.get("id")), s(r.get("session_date")),
                ms(r.get("created_at")), msOrNull(r.get("ended_at")), n(r.get("set_count")),
                dec(r.get("volume")).setScale(0, RoundingMode.HALF_UP).longValue(), n(r.get("exercise_count")),
                s(r.get("effort")))).toList();
    }

    /**
     * One workout, assembled. Its movements are the live {@code workout_exercise}
     * rows in their order, plus — for a log written before those rows existed —
     * any movement that has sets but no row. Each carries what the PLAN says
     * about it (the cue, the target load, the approved alternative, from the
     * program row with the same exercise on the session's day where known) and
     * {@code lastTime}: the previous workout's sets for it, and the all-time best.
     */
    public Workout workout(PortalScope.Me me, UUID id) {
        var p = params(me);
        p.put("wid", id.toString());
        var rows = jdbc.queryForList("""
                SELECT w.id::text, w.session_date::text AS session_date, w.created_at, w.ended_at, w.notes,
                       w.program_id::text AS program_id, pr.name AS program_name, pr.schedule::text AS schedule,
                       s.day_label, s.scheduled_at, s.template_day,
                       COALESCE(s.delivery_mode, c.delivery_mode) AS mode
                FROM workout_session w
                JOIN client c ON c.id = w.client_id
                LEFT JOIN program pr ON pr.id = w.program_id
                LEFT JOIN scheduled_session s ON s.id = w.scheduled_session_id
                WHERE w.id = :wid::uuid AND w.client_id = :cid::uuid AND w.deleted_at IS NULL
                """, p);
        if (rows.isEmpty()) throw PortalRuleException.notFound("No such workout.");
        var w = rows.getFirst();

        var cards = new ArrayList<Map<String, Object>>(jdbc.queryForList("""
                SELECT exercise_id::text AS eid, swapped_from_exercise_id::text AS swapped_from,
                       target_sets, target_reps, rest_seconds
                FROM workout_exercise
                WHERE workout_session_id = :wid::uuid AND removed_at IS NULL AND deleted_at IS NULL
                ORDER BY order_index, created_at, id
                """, p));
        var sets = jdbc.queryForList("""
                SELECT id::text, exercise_id::text AS eid, set_number, load_kg, reps, rpe FROM set_log
                WHERE workout_session_id = :wid::uuid AND deleted_at IS NULL
                ORDER BY set_number, created_at, id
                """, p);
        var carded = new HashSet<String>();
        cards.forEach(cd -> carded.add(s(cd.get("eid"))));
        var removed = new HashSet<>(jdbc.queryForList("""
                SELECT exercise_id::text FROM workout_exercise
                WHERE workout_session_id = :wid::uuid AND removed_at IS NOT NULL AND deleted_at IS NULL
                """, p, String.class));
        for (var st : sets) {
            String eid = s(st.get("eid"));
            if (carded.add(eid) && !removed.contains(eid)) {
                var extra = new HashMap<String, Object>();
                extra.put("eid", eid);
                cards.add(extra);
            }
        }

        // The plan's word on each movement: the program row for this exercise, on the session's day where known.
        Integer slot = i(w.get("template_day"));
        Integer weekday = null;
        if (slot != null) {
            for (var e : slotMap(s(w.get("schedule"))).entrySet()) if (e.getValue().equals(slot)) weekday = e.getKey();
            if (weekday == null) weekday = slot;
        }
        var planRows = new HashMap<String, Map<String, Object>>();
        if (w.get("program_id") != null) {
            var pp = new HashMap<String, Object>();
            pp.put("pid", s(w.get("program_id")));
            pp.put("dow", weekday);
            jdbc.queryForList("""
                    SELECT exercise_id::text AS eid, notes, target_load, alt_exercise_id::text AS alt,
                           (day_of_week IS NOT DISTINCT FROM CAST(:dow AS integer)) AS same_day
                    FROM program_exercise WHERE program_id = :pid::uuid AND deleted_at IS NULL
                    ORDER BY same_day DESC, COALESCE(week, 1), order_index
                    """, pp).forEach(r -> planRows.putIfAbsent(s(r.get("eid")), r));
        }

        var ids = new ArrayList<String>();
        cards.forEach(cd -> ids.add(s(cd.get("eid"))));
        cards.forEach(cd -> { if (cd.get("swapped_from") != null) ids.add(s(cd.get("swapped_from"))); });
        planRows.values().forEach(r -> { if (r.get("alt") != null) ids.add(s(r.get("alt"))); });
        var library = exercises(ids);

        var out = new ArrayList<WorkoutExercise>();
        for (var cd : cards) {
            String eid = s(cd.get("eid"));
            var plan = planRows.get(eid);
            var base = library.get(eid);
            var ex = base == null ? null : new Exercise(base.id(), base.name(), base.muscleGroup(), base.equipment(),
                    base.logType(), plan == null ? null : s(plan.get("notes")), base.formCues(), base.steps());
            var mine = sets.stream().filter(st -> eid.equals(s(st.get("eid"))))
                    .map(st -> new SetRow(s(st.get("id")), n(st.get("set_number")), dec(st.get("load_kg")),
                            i(st.get("reps")), dec(st.get("rpe")))).toList();
            out.add(new WorkoutExercise(ex, i(cd.get("target_sets")), i(cd.get("target_reps")),
                    plan == null ? null : dec(plan.get("target_load")), i(cd.get("rest_seconds")),
                    s(cd.get("swapped_from")), plan == null || plan.get("alt") == null ? null : library.get(s(plan.get("alt"))),
                    mine, lastTime(me, id, eid)));
        }
        var fb = jdbc.queryForList("""
                SELECT effort, note, at FROM workout_feedback WHERE workout_session_id = :wid::uuid AND deleted_at IS NULL
                """, p);
        Feedback feedback = fb.isEmpty() ? null
                : new Feedback(s(fb.getFirst().get("effort")), s(fb.getFirst().get("note")), ms(fb.getFirst().get("at")));
        return new Workout(s(w.get("id")), s(w.get("session_date")), ms(w.get("created_at")), msOrNull(w.get("ended_at")),
                s(w.get("day_label")), s(w.get("program_name")), s(w.get("mode")), msOrNull(w.get("scheduled_at")),
                s(w.get("notes")), feedback, out);
    }

    /** The last OTHER workout's sets for this movement, and its all-time best load and reps. Null if never done. */
    private LastTime lastTime(PortalScope.Me me, UUID workoutId, String exerciseId) {
        var p = params(me);
        p.put("wid", workoutId.toString());
        p.put("eid", exerciseId);
        var prev = jdbc.queryForList("""
                SELECT w.id::text, w.session_date::text AS session_date FROM workout_session w
                WHERE w.client_id = :cid::uuid AND w.deleted_at IS NULL AND w.id <> :wid::uuid
                  AND EXISTS (SELECT 1 FROM set_log sl WHERE sl.workout_session_id = w.id
                              AND sl.exercise_id = :eid::uuid AND sl.deleted_at IS NULL)
                  AND w.created_at < (SELECT created_at FROM workout_session WHERE id = :wid::uuid)
                ORDER BY w.created_at DESC, w.id LIMIT 1
                """, p);
        if (prev.isEmpty()) return null;
        p.put("prev", s(prev.getFirst().get("id")));
        var last = jdbc.queryForList("""
                SELECT set_number, load_kg, reps FROM set_log
                WHERE workout_session_id = :prev::uuid AND exercise_id = :eid::uuid AND deleted_at IS NULL
                ORDER BY set_number, created_at
                """, p).stream().map(r -> new LastSet(n(r.get("set_number")), dec(r.get("load_kg")), i(r.get("reps")))).toList();
        var best = jdbc.queryForList("""
                SELECT max(sl.load_kg) AS load, max(sl.reps) AS reps FROM set_log sl
                JOIN workout_session w ON w.id = sl.workout_session_id
                WHERE w.client_id = :cid::uuid AND w.deleted_at IS NULL AND sl.deleted_at IS NULL
                  AND sl.exercise_id = :eid::uuid AND w.id <> :wid::uuid
                """, p).getFirst();
        return new LastTime(s(prev.getFirst().get("session_date")), last, dec(best.get("load")), i(best.get("reps")));
    }

    /** Every set the client has logged, oldest first — unwindowed, because a personal best is a claim about all of it. */
    public List<LoggedSet> sets(PortalScope.Me me) {
        return jdbc.queryForList("""
                SELECT sl.exercise_id::text AS eid, sl.set_number, sl.load_kg, sl.reps,
                       w.session_date::text AS session_date, sl.created_at
                FROM set_log sl JOIN workout_session w ON w.id = sl.workout_session_id
                WHERE w.client_id = :cid::uuid AND w.deleted_at IS NULL AND sl.deleted_at IS NULL
                ORDER BY sl.created_at ASC, sl.id
                """, params(me)).stream().map(r -> new LoggedSet(s(r.get("eid")), n(r.get("set_number")),
                dec(r.get("load_kg")), i(r.get("reps")), s(r.get("session_date")), ms(r.get("created_at")))).toList();
    }

    /**
     * Names for movements the current plan no longer carries — NARROWED to ids in
     * this client's own set logs, so the route cannot be walked to list the
     * library. Unknown and unlogged ids are dropped; no ids is [].
     */
    public List<Exercise> exercisesByIds(PortalScope.Me me, String csvIds) {
        if (csvIds == null || csvIds.isBlank()) return List.of();
        var wanted = new ArrayList<String>();
        for (String part : csvIds.split(",")) {
            try {
                wanted.add(UUID.fromString(part.strip()).toString());
            } catch (IllegalArgumentException ignored) { /* not an id — dropped */ }
        }
        if (wanted.isEmpty()) return List.of();
        var p = params(me);
        p.put("ids", wanted);
        var logged = jdbc.queryForList("""
                SELECT DISTINCT sl.exercise_id::text FROM set_log sl JOIN workout_session w ON w.id = sl.workout_session_id
                WHERE w.client_id = :cid::uuid AND w.deleted_at IS NULL AND sl.deleted_at IS NULL
                  AND sl.exercise_id::text IN (:ids)
                """, p, String.class);
        var library = exercises(logged);
        return wanted.stream().map(library::get).filter(Objects::nonNull).toList();
    }

    // ── Measurements ──────────────────────────────────────────────────────────

    /**
     * Oldest first, out of the client's completed assessments (V22) — a body is
     * measured in an assessment and nowhere else. {@code id} is the assessment's
     * id, shared by up to six readings.
     */
    public List<Metric> metrics(PortalScope.Me me) {
        return metricReadings.oldestFirst(me.clientId()).stream()
                .map(m -> new Metric(m.assessmentId().toString(), m.metricType(), m.value(), m.unit(),
                        m.recordedAt().toEpochMilli()))
                .toList();
    }

    // ── Money — the client's side of it, and only that ────────────────────────

    /**
     * Newest first. {@code amountDue = amount − collected − written off}, floored
     * at zero — the same arithmetic the trainer's book does. {@code pausedAt} is
     * on the wire (the mock omitted it) because a paused pack reading as live is
     * a small lie to the client.
     */
    public List<Package> packages(PortalScope.Me me) {
        return jdbc.queryForList("""
                SELECT pk.id::text, COALESCE(pc.name, 'Session pack') AS name, pk.type, pk.sessions_total,
                       pk.sessions_remaining, pk.amount, pk.status, pk.start_date::text AS start_date,
                       pk.end_date::text AS end_date, pk.paused_at, COALESCE(pk.written_off_amount, 0) AS written_off,
                       COALESCE((SELECT sum(pay.amount) FROM payment pay WHERE pay.package_id = pk.id
                                 AND pay.status IN ('paid', 'confirmed') AND pay.deleted_at IS NULL), 0) AS paid
                FROM package pk LEFT JOIN pack pc ON pc.id = pk.pack_id
                WHERE pk.client_id = :cid::uuid AND pk.deleted_at IS NULL
                ORDER BY pk.created_at DESC, pk.id
                """, params(me)).stream().map(r -> {
            BigDecimal amount = dec(r.get("amount"));
            BigDecimal paid = dec(r.get("paid"));
            BigDecimal due = amount == null ? null
                    : amount.subtract(paid).subtract(dec(r.get("written_off"))).max(BigDecimal.ZERO);
            return new Package(s(r.get("id")), s(r.get("name")), s(r.get("type")), i(r.get("sessions_total")),
                    i(r.get("sessions_remaining")), amount, paid, due, s(r.get("status")), s(r.get("start_date")),
                    s(r.get("end_date")), msOrNull(r.get("paused_at")));
        }).toList();
    }

    /** Field by field: never {@code collected_by}, the gym's share, a receipt, a note or a UPI reference. */
    public List<Payment> payments(PortalScope.Me me) {
        return jdbc.queryForList("""
                SELECT id::text, amount, method, status, paid_at, created_at FROM payment
                WHERE client_id = :cid::uuid AND deleted_at IS NULL
                ORDER BY created_at DESC, id
                """, params(me)).stream().map(r -> new Payment(s(r.get("id")), dec(r.get("amount")),
                s(r.get("method")), s(r.get("status")), msOrNull(r.get("paid_at")), ms(r.get("created_at")))).toList();
    }

    // ── From the trainer ──────────────────────────────────────────────────────

    /**
     * Two sources, newest first: {@code client_message} rows, and the trainer's
     * notes about this client marked {@code shared_with_client} (V7) — dated by
     * their last edit, and never "read", because a note has no read state.
     */
    public List<Message> messages(PortalScope.Me me) {
        var out = new ArrayList<Message>();
        jdbc.queryForList("""
                SELECT m.id::text, m.body, m.kind, m.at, m.read_at, t.name AS trainer_name
                FROM client_message m JOIN trainer t ON t.id = m.trainer_id
                WHERE m.client_id = :cid::uuid AND m.deleted_at IS NULL
                """, params(me)).forEach(r -> out.add(new Message(s(r.get("id")), s(r.get("body")), s(r.get("kind")),
                ms(r.get("at")), msOrNull(r.get("read_at")), s(r.get("trainer_name")))));
        jdbc.queryForList("""
                SELECT n.id::text, n.body, n.updated_at, t.name AS trainer_name
                FROM client_note n JOIN trainer t ON t.id = n.trainer_id
                WHERE n.client_id = :cid::uuid AND n.shared_with_client AND n.deleted_at IS NULL
                """, params(me)).forEach(r -> out.add(new Message(s(r.get("id")), s(r.get("body")), "note",
                ms(r.get("updated_at")), null, s(r.get("trainer_name")))));
        out.sort(Comparator.comparingLong(Message::at).reversed().thenComparing(Message::id));
        return out;
    }

    public List<Milestone> milestones(PortalScope.Me me) {
        return jdbc.queryForList("""
                SELECT id::text, kind, label, value, at FROM milestone
                WHERE client_id = :cid::uuid AND deleted_at IS NULL ORDER BY at DESC, id
                """, params(me)).stream().map(r -> new Milestone(s(r.get("id")), s(r.get("kind")), s(r.get("label")),
                dec(r.get("value")), ms(r.get("at")))).toList();
    }

    // ── Assessments ───────────────────────────────────────────────────────────

    /**
     * Only SENT ones — a booked assessment is the trainer's planning. An open one
     * whose template is gone asks nothing and is dropped; a done one is always
     * kept. Status here is the client's three: {@code done}, else {@code late}
     * once due (still answerable), else {@code open}. ISO timestamps, like the
     * trainer's side.
     */
    @Transactional(readOnly = true)
    public List<CheckIn> assessments(PortalScope.Me me) {
        return jdbc.queryForList(CHECKIN_SQL + """
                WHERE a.client_id = :cid::uuid AND a.deleted_at IS NULL AND a.sent_at IS NOT NULL
                  AND (a.completed_at IS NOT NULL OR t.id IS NOT NULL)
                ORDER BY a.due_at DESC, a.id
                """, params(me)).stream().map(PortalReadService::toCheckIn).toList();
    }

    /** What is asked comes from the LIVE template, with no bank fallback. Unsent or not theirs → 404. */
    public CheckInDetail assessment(PortalScope.Me me, UUID id) {
        var p = params(me);
        p.put("aid", id.toString());
        var rows = jdbc.queryForList(CHECKIN_SQL
                + " WHERE a.id = :aid::uuid AND a.client_id = :cid::uuid AND a.deleted_at IS NULL AND a.sent_at IS NOT NULL", p);
        if (rows.isEmpty()) throw PortalRuleException.notFound("No such assessment.");
        var r = rows.getFirst();
        var row = toCheckIn(r);
        var m = r.get("t_measurements") == null ? null : AssessmentTemplateService.readMeasurements(s(r.get("t_measurements")));
        var q = r.get("t_questions") == null ? null : AssessmentTemplateService.readQuestions(s(r.get("t_questions")));
        var asked = new Asked(
                m == null || !m.on() ? List.of()
                        : m.keys().stream().map(AssessmentCatalogue.BY_KEY::get).filter(Objects::nonNull).toList(),
                q == null || !q.on() ? List.of() : q.items());
        return new CheckInDetail(row.id(), row.name(), row.dueAt(), row.sentAt(), row.completedAt(), row.status(),
                row.measurements(), row.questions(), s(r.get("t_description")), asked,
                listOfMaps(s(r.get("readings"))), listOfMaps(s(r.get("answers"))));
    }

    private static final String CHECKIN_SQL = """
            SELECT a.id::text, a.name, a.due_at, a.sent_at, a.completed_at, a.measurements_asked, a.questions_asked,
                   jsonb_array_length(a.readings) AS readings_got, jsonb_array_length(a.answers) AS answers_got,
                   a.readings::text AS readings, a.answers::text AS answers,
                   t.id AS t_id, t.description AS t_description,
                   t.measurements::text AS t_measurements, t.questions::text AS t_questions
            FROM assessment a
            LEFT JOIN assessment_template t ON t.id = a.template_id AND t.deleted_at IS NULL
            """;

    private static CheckIn toCheckIn(Map<String, Object> r) {
        String status = r.get("completed_at") != null ? "done"
                : ms(r.get("due_at")) < System.currentTimeMillis() ? "late" : "open";
        return new CheckIn(s(r.get("id")), s(r.get("name")), iso(r.get("due_at")), iso(r.get("sent_at")),
                iso(r.get("completed_at")), status,
                new Count(n(r.get("readings_got")), n(r.get("measurements_asked"))),
                new Count(n(r.get("answers_got")), n(r.get("questions_asked"))));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Library rows by id, as the portal's exercise shape — `formCues` stays [] until authored (V9). */
    Map<String, Exercise> exercises(Collection<String> ids) {
        var clean = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (clean.isEmpty()) return Map.of();
        var out = new HashMap<String, Exercise>();
        jdbc.queryForList("""
                SELECT id::text, name, muscle_group, equipment, COALESCE(log_type, 'weight_reps') AS log_type,
                       description, form_cues::text AS form_cues
                FROM exercise WHERE id::text IN (:ids)
                """, Map.of("ids", clean)).forEach(r -> out.put(s(r.get("id")), new Exercise(s(r.get("id")),
                s(r.get("name")), s(r.get("muscle_group")), s(r.get("equipment")), s(r.get("log_type")), null,
                stringList(s(r.get("form_cues"))), s(r.get("description")))));
        return out;
    }

    private Map<String, Object> one(String sql, PortalScope.Me me) {
        return jdbc.queryForList(sql, params(me)).getFirst();
    }

    static HashMap<String, Object> params(PortalScope.Me me) {
        var p = new HashMap<String, Object>();
        p.put("cid", me.clientId().toString());
        p.put("tid", me.trainerId().toString());
        return p;
    }

    /** `program.schedule` [{day, weekday, time}] → weekday → slot. Empty for a plan written from scratch. */
    static Map<Integer, Integer> slotMap(String json) {
        var out = new HashMap<Integer, Integer>();
        for (var e : listOfMaps(json)) {
            if (e.get("weekday") instanceof Number w && e.get("day") instanceof Number d) out.put(w.intValue(), d.intValue());
        }
        return out;
    }

    static List<Integer> csv(String v) {
        var out = new ArrayList<Integer>();
        if (v == null) return out;
        for (String part : v.split(",")) {
            try { out.add(Integer.parseInt(part.strip())); } catch (NumberFormatException ignored) { /* skip */ }
        }
        return out;
    }

    static List<Map<String, Object>> listOfMaps(String json) {
        if (json == null || json.isBlank() || json.equals("null")) return List.of();
        try {
            return JSON.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    static Map<String, String> stringMap(String json) {
        if (json == null || json.isBlank() || json.equals("null")) return Map.of();
        try {
            return JSON.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    static List<String> stringList(String json) {
        if (json == null || json.isBlank() || json.equals("null")) return List.of();
        try {
            List<Object> raw = JSON.readValue(json, new TypeReference<>() {});
            return raw.stream().filter(o -> o instanceof String).map(o -> (String) o).toList();
        } catch (Exception e) {
            return List.of();
        }
    }

    static String s(Object v) { return v == null ? null : v.toString(); }

    static Integer i(Object v) { return v instanceof Number n ? n.intValue() : null; }

    static int n(Object v) { return v instanceof Number n ? n.intValue() : 0; }

    static BigDecimal dec(Object v) {
        if (v instanceof BigDecimal b) return b;
        if (v instanceof Number n) return new BigDecimal(n.toString());
        return v == null ? null : new BigDecimal(v.toString());
    }

    static long ms(Object v) {
        Long m = msOrNull(v);
        return m == null ? 0L : m;
    }

    static Long msOrNull(Object v) {
        if (v instanceof Timestamp ts)                 return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toEpochMilli();
        if (v instanceof Instant in)                   return in.toEpochMilli();
        return null;
    }

    /** Full precision, like the trainer's assessment wire. */
    static String iso(Object v) {
        if (v instanceof Timestamp ts)                 return ts.toInstant().toString();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toString();
        if (v instanceof Instant in)                   return in.toString();
        return null;
    }
}

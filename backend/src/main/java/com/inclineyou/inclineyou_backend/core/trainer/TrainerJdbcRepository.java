package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHourResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The trainer module's hand-written SQL. The {@code trainer} and
 * {@code trainer_business} rows themselves are JPA ({@link TrainerRepository},
 * {@link TrainerBusinessRepository}); this is the read that is not.
 */
@Repository
@RequiredArgsConstructor
public class TrainerJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * Every working window, in the order a week is read. A split shift is two
     * rows on one weekday — that is the point of the table.
     */
    public List<WorkingHourResponse> workingHours(UUID trainerId) {
        return jdbc.query("""
                SELECT id::text AS id, weekday,
                       to_char(start_time, 'HH24:MI') AS start_hm,
                       to_char(end_time, 'HH24:MI') AS end_hm
                FROM working_hours
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY weekday, start_time, id
                """, Map.of("tid", trainerId.toString()),
                (rs, i) -> new WorkingHourResponse(
                        rs.getString("id"),
                        rs.getInt("weekday"),
                        rs.getString("start_hm"),
                        rs.getString("end_hm")));
    }

    /**
     * The profile's version: the later of the two rows' {@code updated_at}, as epoch ms.
     * It is also the ETag. Read AFTER a write has been flushed — the database's
     * {@code set_updated_at} trigger stamps {@code trainer_business}, and the entity in memory
     * has never seen that value.
     */
    public long profileVersion(UUID trainerId) {
        Long v = jdbc.queryForObject("""
                SELECT (extract(epoch FROM greatest(t.updated_at, b.updated_at)) * 1000)::bigint
                FROM trainer t JOIN trainer_business b ON b.trainer_id = t.id
                WHERE t.id = :tid::uuid
                """, Map.of("tid", trainerId.toString()), Long.class);
        return v == null ? 0L : v;
    }

    /** The trainer's own portal columns (V11): not mapped on the entity, which no sync path reads. */
    public record PortalRow(boolean sessionReminders, String reminderTiming, boolean clientsSeeMoney) {}

    public PortalRow portal(UUID trainerId) {
        return jdbc.queryForObject("SELECT session_reminders, reminder_timing, clients_see_money FROM trainer WHERE id = :tid::uuid",
                Map.of("tid", trainerId.toString()),
                (rs, i) -> new PortalRow(rs.getBoolean("session_reminders"), rs.getString("reminder_timing"), rs.getBoolean("clients_see_money")));
    }

    /** Only what was sent. The {@code set_updated_at} trigger moves the profile's version, so an If-Match from before is stale. */
    public void updatePortal(UUID trainerId, Boolean sessionReminders, String reminderTiming, Boolean clientsSeeMoney) {
        var p = new java.util.HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        var sets = new StringBuilder();
        if (sessionReminders != null) { p.put("rem", sessionReminders); sets.append(", session_reminders = :rem"); }
        if (reminderTiming != null) { p.put("timing", reminderTiming); sets.append(", reminder_timing = :timing"); }
        if (clientsSeeMoney != null) { p.put("money", clientsSeeMoney); sets.append(", clients_see_money = :money"); }
        if (sets.length() == 0) return;
        jdbc.update("UPDATE trainer SET " + sets.substring(2) + " WHERE id = :tid::uuid", p);
    }

    /**
     * Who a reminder would actually reach (R105): switching reminders on opts nobody in.
     *
     * <p>Asked of {@code trainer_reminder_reach()} and not computed here, because the answer depends on {@code client_prefs}
     * and the trainer's own connection cannot read it (V11 gave the table no staff policy: a client's preferences are theirs).
     * The function returns three counts and nothing else, for the caller's own clients only.
     */
    public com.inclineyou.inclineyou_backend.core.trainer.dto.ClientPortalSettings.ReminderReach reminderReach(UUID trainerId) {
        return jdbc.queryForObject("SELECT on_portal, opted_in, excluded FROM trainer_reminder_reach()", Map.of(),
                (rs, i) -> new com.inclineyou.inclineyou_backend.core.trainer.dto.ClientPortalSettings.ReminderReach(
                        rs.getInt("on_portal"), rs.getInt("opted_in"), rs.getInt("excluded")));
    }

    /** Soft-deletes every live window on these weekdays — the first half of replacing a day. */
    /** Serialises one trainer's working-week saves, released at commit; apart from the trainer row, so a profile save is not held. */
    public void lockWeek(UUID trainerId) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtext('working-hours:' || :tid))", Map.of("tid", trainerId.toString()), rs -> { });
    }

    public void softDeleteDays(UUID trainerId, java.util.Collection<Integer> weekdays) {
        if (weekdays.isEmpty()) return;
        jdbc.update("""
                UPDATE working_hours SET deleted_at = now()
                WHERE trainer_id = :tid::uuid AND weekday IN (:days) AND deleted_at IS NULL
                """, Map.of("tid", trainerId.toString(), "days", weekdays));
    }

    /** One window; {@code start}/{@code end} are {@code HH:mm} wall-clock times. */
    public void insertWindow(UUID trainerId, int weekday, String start, String end) {
        jdbc.update("""
                INSERT INTO working_hours (trainer_id, weekday, start_time, end_time)
                VALUES (:tid::uuid, :day, CAST(:start AS time), CAST(:end AS time))
                """, Map.of("tid", trainerId.toString(), "day", weekday, "start", start, "end", end));
    }

    /**
     * V46: the UPI ID now belongs to the trainer's home WORKSPACE's business. Null when unset. The trainer's own
     * {@code trainer_business.upi_vpa} is no longer read.
     */
    public String homeUpi(UUID trainerId) {
        return jdbc.query("""
                SELECT b.upi_vpa FROM trainer t JOIN tenant_business b ON b.tenant_id = t.home_tenant_id
                 WHERE t.id = :tid::uuid
                """, Map.of("tid", trainerId.toString()), (rs, i) -> rs.getString(1))
                // NOT stream().findFirst(): an unset UPI ID is a row holding null, and findFirst() throws on a null element.
                .stream().filter(java.util.Objects::nonNull).findFirst().orElse(null);
    }

    /**
     * Writes the UPI ID through to the business of the workspace the trainer OWNS as their home (V46) — `PATCH
     * /v1/trainers/me`'s {@code upiVpa}, which the setup flow and older builds still send. Nothing is written for a
     * trainer who does not own their home workspace. True when a row changed.
     */
    public boolean setHomeUpi(UUID trainerId, String upi) {
        var p = new java.util.HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("upi", upi);
        return jdbc.update("""
                UPDATE tenant_business b SET upi_vpa = :upi
                  FROM trainer t
                 WHERE t.id = :tid::uuid AND b.tenant_id = t.home_tenant_id
                   AND EXISTS (SELECT 1 FROM tenant_member tm
                                WHERE tm.tenant_id = t.home_tenant_id AND tm.app_user_id = t.app_user_id
                                  AND tm.role = 'owner' AND tm.status = 'active' AND tm.deleted_at IS NULL)
                """, p) == 1;
    }
}

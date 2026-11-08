package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Keeps every client's standing weekly slots booked {@link ClientScheduleService#WINDOW_DAYS} ahead.
 *
 * <p>Before this, slots were booked only when a trainer saved the client's week, resumed them or unarchived them, so a
 * client nobody touched for four weeks fell off the calendar (V30 has the whole argument). Each run asks
 * {@code slot_topup_targets()} which clients are within {@link #REFILL_DAYS} of the edge of their bookings, then books
 * each one through {@link ClientScheduleService#book} and {@link ClientScheduleService#linkWorkouts} — the week editor's
 * own path, so a top-up is indistinguishable from a trainer pressing Save, and it never books back a session somebody
 * cancelled or moved.
 *
 * <p>The list is read as SYSTEM; every booking runs as STAFF in the client's own workspace, one transaction per client,
 * so the ordinary tenant policies check every write and one client's failure does not stop the rest. Twice a day is
 * plenty for a window that only has to stay three weeks deep.
 */
@Component
@Slf4j
public class SlotTopUpSweeper {

    /** Top a client up once their furthest booked slot is less than this many days away. */
    static final int REFILL_DAYS = 21;

    private final NamedParameterJdbcTemplate jdbc;
    private final ClientScheduleService schedules;
    private final TransactionTemplate tx;

    @Value("${app.schedule.slot-topup-enabled:true}")
    private boolean enabled;

    public SlotTopUpSweeper(NamedParameterJdbcTemplate jdbc, ClientScheduleService schedules,
                            PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.schedules = schedules;
        this.tx = new TransactionTemplate(transactions);
    }

    record Target(UUID clientId, UUID trainerId, UUID tenantId, String timezone) {}

    @Scheduled(fixedDelayString = "PT12H", initialDelayString = "PT3M")
    public void sweep() {
        if (!enabled) return;
        int booked = topUp();
        if (booked > 0) log.info("slot top-up booked {} session(s) ahead", booked);
    }

    /** Sessions booked by this run. Package-private so a test can run it without the scheduler. */
    int topUp() {
        int total = 0;
        for (Target t : targets()) {
            try {
                total += bookOne(t);
            } catch (RuntimeException e) {
                // One client's refusal (a clash with a hand-booked row is DO NOTHING, so this is a real fault) must not
                // stop everybody else's diary. Logged without the client's name: ids only.
                log.warn("slot top-up failed client={} trainer={}: {}", t.clientId(), t.trainerId(), e.toString());
            }
        }
        return total;
    }

    private List<Target> targets() {
        var before = TenantContext.current();
        TenantContext.set(TenantContext.SYSTEM);
        try {
            return jdbc.query("SELECT client_id, trainer_id, tenant_id, timezone FROM slot_topup_targets(:refill)",
                    Map.of("refill", REFILL_DAYS),
                    (rs, i) -> new Target(UUID.fromString(rs.getString("client_id")),
                            UUID.fromString(rs.getString("trainer_id")),
                            UUID.fromString(rs.getString("tenant_id")),
                            rs.getString("timezone")));
        } finally {
            TenantContext.set(before);
        }
    }

    private int bookOne(Target t) {
        ZoneId zone = ZoneId.of(t.timezone());
        var before = TenantContext.current();
        // Set BEFORE the transaction begins: TenantAwareDataSource labels the connection when it is borrowed.
        TenantContext.set(TenantContext.staff(null, t.tenantId(), List.of(t.tenantId()), t.trainerId()));
        try {
            Integer made = tx.execute(status -> {
                // From tomorrow, as the week editor books: today is never filled in behind the trainer.
                var ids = schedules.book(t.trainerId(), t.clientId(), WorkspaceClock.today(zone).plusDays(1), zone);
                schedules.linkWorkouts(t.clientId(), ids, zone);
                return ids.size();
            });
            return made == null ? 0 : made;
        } finally {
            TenantContext.set(before);
        }
    }
}

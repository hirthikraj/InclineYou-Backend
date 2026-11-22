package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.LockedPayment;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * A payment's own routes when another tab changes it between the first read and the pack lock (18 Nov 2026). Without
 * threads: the first read is made to answer the stale "pending", as it would have before the other tab's write-off
 * committed. The payment is now read again under the lock, so the answer is the payment's real state (409), not a
 * 500 from payment_state_shape, and PATCH's If-Match is checked against the version that is really there.
 */
@SpringBootTest
@Transactional
class PaymentLockRaceTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired PackageLedgerService ledger;
    @MockitoSpyBean PaymentJdbcRepository payments;

    private UUID trainer, pack, payment;

    @BeforeEach
    void setUp() {
        String phone = "+919100000093";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
        UUID client = UUID.randomUUID();
        pack = UUID.randomUUID();
        var p = Map.of("id", client.toString(), "tid", trainer.toString(), "pk", pack.toString());
        jdbc.update("INSERT INTO client (id, trainer_id, name, client_type) VALUES (:id::uuid, :tid::uuid, 'Meera', 'independent')", p);
        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date, end_date, due_date)
                VALUES (:pk::uuid, :tid::uuid, :id::uuid, '12 sessions', 'floor', 'sessions', 12, 12,
                        9000, 'INR', current_date, current_date + 60, current_date)""", p);
        payment = UUID.fromString(ledger.record(trainer, pack, Map.of("amount", "500.00", "method", "upi", "status", "pending"))
                .payment().id());
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    @Test
    @DisplayName("Paid while another tab wrote it off: 409 PAYMENT_NOT_PENDING, and it stays written off")
    void paidAfterWriteOff() {
        staleFirstRead();
        var refused = assertThrows(ApiException.class, () -> ledger.markPaid(trainer, payment, Map.of()));
        assertEquals("PAYMENT_NOT_PENDING", refused.getCode());
        assertEquals("write_off", status());
    }

    @Test
    @DisplayName("PATCH while another tab wrote it off: If-Match is checked against the version under the lock (412)")
    void patchAfterWriteOff() {
        String before = String.valueOf(jdbc.queryForObject("SELECT updated_at FROM payment WHERE id = :y::uuid",
                Map.of("y", payment.toString()), Timestamp.class).getTime());
        staleFirstRead();
        var body = new HashMap<String, Object>(Map.of("note", "typed in the first tab"));
        var refused = assertThrows(ApiException.class, () -> ledger.patch(trainer, payment, "\"" + before + "\"", body));
        assertEquals("PRECONDITION_FAILED", refused.getCode(), refused.getMessage());
    }

    /** The other tab's write-off commits; this request's first read still answers what it saw before it. */
    private void staleFirstRead() {
        var stale = payments.findLive(trainer, payment).orElseThrow();
        // now() is fixed inside one transaction, so the version would not move; this test's own transaction (rolled
        // back) lets the other tab's write stamp a later updated_at, as a real second request would.
        jdbc.getJdbcTemplate().execute("ALTER TABLE payment DISABLE TRIGGER trg_payment_updated_at");
        jdbc.update("""
                UPDATE payment SET status = 'write_off', written_off_at = now(), updated_at = now() + interval '1 second'
                WHERE id = :y::uuid""", Map.of("y", payment.toString()));
        Mockito.doReturn(Optional.of(new LockedPayment(stale.packageId(), stale.status(), stale.amount(), stale.method(),
                        stale.reference(), stale.note(), stale.updatedAt())))
                .doCallRealMethod().when(payments).findLive(trainer, payment);
    }

    private String status() {
        return jdbc.queryForObject("SELECT status FROM payment WHERE id = :y::uuid", Map.of("y", payment.toString()), String.class);
    }
}

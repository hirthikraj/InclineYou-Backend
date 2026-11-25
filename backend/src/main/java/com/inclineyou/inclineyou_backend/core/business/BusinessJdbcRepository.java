package com.inclineyou.inclineyou_backend.core.business;

import com.inclineyou.inclineyou_backend.core.business.dto.Business;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** A workspace's business (V46): {@code tenant.name} plus its {@code tenant_business} row. */
@Repository
@RequiredArgsConstructor
public class BusinessJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The business of {@code tenantId}, with whether {@code trainerId}'s login owns that workspace. */
    public Optional<Business> find(UUID tenantId, UUID trainerId) {
        return jdbc.query("""
                SELECT tn.id, tn.type, tn.name, b.tagline, b.phone, b.email, b.address_line1, b.address_line2, b.city, b.state,
                       b.pincode, b.upi_vpa, b.part_payments, GREATEST(tn.updated_at, b.updated_at) AS updated_at,
                       EXISTS (SELECT 1 FROM tenant_member tm JOIN trainer t ON t.app_user_id = tm.app_user_id
                                WHERE tm.tenant_id = tn.id AND t.id = :tid::uuid AND tm.role = 'owner'
                                  AND tm.status = 'active' AND tm.deleted_at IS NULL) AS owner
                  FROM tenant tn JOIN tenant_business b ON b.tenant_id = tn.id
                 WHERE tn.id = :ten::uuid AND tn.status = 'active'
                """, Map.of("ten", tenantId.toString(), "tid", trainerId.toString()), (rs, i) -> new Business(
                rs.getObject("id", UUID.class), rs.getString("type"), rs.getString("name"), rs.getString("tagline"),
                rs.getString("phone"), rs.getString("email"),
                new Business.Address(rs.getString("address_line1"), rs.getString("address_line2"), rs.getString("city"),
                        rs.getString("state"), rs.getString("pincode")),
                rs.getString("upi_vpa"), rs.getBoolean("part_payments"), rs.getBoolean("owner"), rs.getTimestamp("updated_at").toInstant().toEpochMilli()))
                .stream().findFirst();
    }

    /**
     * Both halves in the caller's transaction: the workspace's name and its business row. {@code setUpi} false leaves the UPI
     * ID as it is (the form did not send it — V50 moved it to Payment setup).
     */
    public void save(UUID tenantId, String name, String tagline, String phone, String email, Business.Address a, boolean setUpi, String upi) {
        jdbc.update("UPDATE tenant SET name = :n WHERE id = :ten::uuid AND name IS DISTINCT FROM :n",
                Map.of("ten", tenantId.toString(), "n", name));
        var p = new HashMap<String, Object>();
        p.put("ten", tenantId.toString());
        p.put("tag", tagline);
        p.put("ph", phone);
        p.put("em", email);
        p.put("l1", a == null ? null : a.line1());
        p.put("l2", a == null ? null : a.line2());
        p.put("city", a == null ? null : a.city());
        p.put("st", a == null ? null : a.state());
        p.put("pin", a == null ? null : a.pincode());
        p.put("upi", upi);
        p.put("setUpi", setUpi);
        jdbc.update("""
                UPDATE tenant_business
                   SET tagline = :tag, phone = :ph, email = :em, address_line1 = :l1, address_line2 = :l2, city = :city,
                       state = :st, pincode = :pin, upi_vpa = CASE WHEN :setUpi THEN :upi ELSE upi_vpa END
                 WHERE tenant_id = :ten::uuid
                """, p);
    }

    /** Payment setup (V50): the UPI ID and the part-payment switch, nothing else. */
    public void savePayments(UUID tenantId, String upi, boolean partPayments) {
        var p = new HashMap<String, Object>();
        p.put("ten", tenantId.toString());
        p.put("upi", upi);
        p.put("part", partPayments);
        jdbc.update("UPDATE tenant_business SET upi_vpa = :upi, part_payments = :part WHERE tenant_id = :ten::uuid", p);
    }
}

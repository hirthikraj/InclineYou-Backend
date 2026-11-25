package com.inclineyou.inclineyou_backend.core.business;

import com.inclineyou.inclineyou_backend.core.business.dto.Business;
import com.inclineyou.inclineyou_backend.core.business.dto.BusinessUpdate;
import com.inclineyou.inclineyou_backend.core.business.dto.PaymentSetupUpdate;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.util.Text;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Settings → Business (api-contract 1.2, bz-a1/bz-a2; V46). One business per workspace; its name is the workspace's name;
 * only the workspace's owner may change it. Texts over their cap are refused, not trimmed (the profile's rule, V33).
 */
@Service
@RequiredArgsConstructor
public class BusinessService {

    private static final Pattern PHONE = Pattern.compile("^\\+91[6-9][0-9]{9}$");
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final Pattern PIN = Pattern.compile("^[1-9][0-9]{5}$");

    private final BusinessJdbcRepository repo;

    public Business get(UUID trainerId, UUID tenantId) {
        return repo.find(tenantId, trainerId).orElseThrow(() -> ApiException.notFound("This workspace has no business."));
    }

    @Transactional
    public Business save(UUID trainerId, UUID tenantId, BusinessUpdate req) {
        ownerOnly(get(trainerId, tenantId));
        String name = capped("name", req.name(), 160);
        if (name == null) throw ApiException.validation("name: required");
        String tagline = capped("tagline", req.tagline(), 120);
        String phone = phone(req.phone());
        String email = capped("email", req.email(), 254);
        if (email != null && !EMAIL.matcher(email).matches()) throw ApiException.validation("email: an email address, like you@example.com");
        Business.Address a = address(req.address());
        boolean setUpi = req.upiVpa() != null;
        String upi = setUpi ? upi(req.upiVpa().value()) : null;
        repo.save(tenantId, name, tagline, phone, email, a, setUpi, upi);
        return get(trainerId, tenantId);
    }

    /** Business → Payment setup (V50): the UPI ID and the part-payment switch. Owner-only, like the rest of the business. */
    @Transactional
    public Business savePayments(UUID trainerId, UUID tenantId, PaymentSetupUpdate req) {
        ownerOnly(get(trainerId, tenantId));
        repo.savePayments(tenantId, upi(req.upiVpa()), req.partPayments());
        return get(trainerId, tenantId);
    }

    private static void ownerOnly(Business now) {
        if (!now.canEdit()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "BUSINESS_OWNER_ONLY",
                    "Only the owner of this workspace can change its business details.");
        }
    }

    private static String upi(String raw) {
        return Text.orNull(Text.strip(raw)) == null ? null : Upi.check("upiVpa", raw);
    }

    private static Business.Address address(Business.Address in) {
        if (in == null) return new Business.Address(null, null, null, null, null);
        String state = Text.orNull(Text.strip(in.state()));
        if (state != null && !IndianStates.ALL.contains(state)) throw ApiException.validation("address.state: pick a state or union territory from the list");
        String pin = Text.orNull(Text.strip(in.pincode()));
        if (pin != null && !PIN.matcher(pin).matches()) throw ApiException.validation("address.pincode: six digits, not starting with 0");
        return new Business.Address(capped("address.line1", in.line1(), 120), capped("address.line2", in.line2(), 120),
                capped("address.city", in.city(), 80), state, pin);
    }

    /** An Indian mobile, as the app stores every number: +91 and ten digits. Ten digits alone are read as Indian. */
    private static String phone(String raw) {
        String p = Text.orNull(Text.strip(raw));
        if (p == null) return null;
        p = p.replaceAll("[\\s-]", "");
        if (p.matches("^[6-9][0-9]{9}$")) p = "+91" + p;
        if (!PHONE.matcher(p).matches()) throw ApiException.validation("phone: a 10-digit Indian mobile number");
        return p;
    }

    private static String capped(String field, String raw, int max) {
        String v = Text.orNull(Text.strip(raw));
        if (v != null && v.length() > max) throw ApiException.validation(field + ": at most " + max + " characters");
        return v;
    }
}

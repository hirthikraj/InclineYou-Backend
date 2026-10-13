package com.inclineyou.inclineyou_backend.core.invite;

import com.inclineyou.inclineyou_backend.core.auth.OtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.OtpService;
import com.inclineyou.inclineyou_backend.core.auth.dto.OtpRequested;
import com.inclineyou.inclineyou_backend.core.client.InviteToken;
import com.inclineyou.inclineyou_backend.core.invite.dto.InviteCodeRequest;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Sending the code for an invite (api-contract 1.2, inv-a2).
 *
 * <p><b>The caller never supplies a number.</b> The code goes to the number the trainer entered, over WhatsApp, as an ordinary
 * {@code sign_in} code — no new purpose, so the OTP ladder, the daily ceiling and the wrong-attempt lock are the ones sign-in
 * already has, and "Didn't get it?" reads delivery status from the existing route.
 *
 * <p><b>The age check runs here first and changes nothing.</b> Under 18 answers {@code 422 AGE_REQUIREMENT} with no code sent and
 * the invite untouched, so a mistyped year can be corrected and somebody holding the link cannot kill it by typing a wrong date
 * (R97). The authoritative check is again inside accept, where it is terminal.
 *
 * <p>Order is deliberate: a link that does not work is {@code INVITE_UNAVAILABLE} before anything else is looked at, so every
 * guess gets the one answer and a dead link never spends anyone's code.
 */
@Service
@RequiredArgsConstructor
public class InviteCodeService {

    /** The product is India-first and the date is the client's own calendar day; accept re-checks against the database's. */
    private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    private final InviteCardJdbcRepository repo;
    private final OtpService otp;
    private final AppProperties props;

    public OtpRequested sendCode(String token, InviteCodeRequest req) {
        var target = InviteToken.wellFormed(token) ? repo.sendTarget(InviteToken.hash(token)).orElse(null) : null;
        if (target == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "INVITE_UNAVAILABLE",
                    "This invite isn’t available any more. Ask your trainer to send it again.");
        }
        LocalDate today = WorkspaceClock.today(ZONE);
        LocalDate dob = req.dateOfBirth();
        if (dob.isBefore(LocalDate.of(1900, 1, 1))) throw ApiException.validation("dateOfBirth: before 1900");
        if (dob.isAfter(today)) throw ApiException.validation("dateOfBirth: in the future");
        String inForce = props.getPrivacy().getPolicyVersion();
        if (!inForce.equals(req.policyVersion().strip())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CONSENT_REQUIRED",
                    "policyVersion: the privacy notice in force is " + inForce + ". Reload the notice and accept that one.");
        }
        if (dob.isAfter(today.minusYears(18))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "AGE_REQUIREMENT",
                    "This isn’t available for you. Please talk to your trainer.");
        }
        var issued = otp.send(target.phone(), OtpRequest.SIGN_IN);
        return new OtpRequested(issued.requestId().toString(), issued.expiresAt().toEpochMilli(), issued.resendAfterSeconds());
    }

    /** The number a code will go to — for the controller's per-number abuse guard, which keys on it. Empty for a dead link. */
    public java.util.Optional<String> phoneOf(String token) {
        return InviteToken.wellFormed(token) ? repo.sendTarget(InviteToken.hash(token)).map(InviteCardJdbcRepository.SendTarget::phone) : java.util.Optional.empty();
    }
}

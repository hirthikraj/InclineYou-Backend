package com.xrep.xrep_backend.auth;

import com.xrep.xrep_backend.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * How a code actually reaches a phone.
 *
 * A seam, not an integration. The provider is a locked-but-unpicked decision —
 * MSG91, Twilio, AWS SNS and Firebase have all been on the table, and WhatsApp
 * delivery needs a BSP that has not been chosen either — so this deliberately
 * ships with the dev implementation and one obvious place to add the real one.
 *
 * Wiring a provider here needs credentials, a sender ID registered with TRAI,
 * and a DLT template. None of those are code decisions, so none of them are
 * guessed at.
 */
public interface OtpSender {

    /** Deliver, or throw — a failure must not look like a successful send. */
    void send(String phone, String code);

    /**
     * The one that exists today: the code goes to the application log.
     *
     * This is also SEC-OTP-13. It is only reachable while `sms-enabled` is
     * false, and the day a provider is wired that flag is what turns it off —
     * which is why the switch lives here rather than being a build profile
     * somebody can forget to set.
     */
    @Component
    @RequiredArgsConstructor
    @Slf4j
    class LoggingOtpSender implements OtpSender {

        private final AppProperties props;

        @Override
        public void send(String phone, String code) {
            if (props.getOtp().isSmsEnabled()) {
                // TODO: dispatch through the chosen provider (MSG91 / Twilio / SNS).
                // Left throwing rather than silently no-op'ing: a flag that claims
                // SMS is on while nothing is sent would make every sign-in look
                // like a wrong code to the person waiting for it.
                throw new UnsupportedOperationException(
                        "app.otp.sms-enabled is true but no SMS provider is wired");
            }
            log.info("[DEV] OTP for {}: {}", phone, code);
        }
    }
}

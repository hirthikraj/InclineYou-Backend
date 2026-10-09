package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * How a code actually reaches a phone.
 *
 * Two implementations, picked by {@code app.otp.delivery}: this file's
 * {@code LoggingOtpSender} for development, and {@link WhatsAppCloudOtpSender}.
 * WhatsApp only, no SMS (decided 24 Sep 2026).
 */
public interface OtpSender {

    /** Deliver, or throw — a failure must not look like a successful send. */
    void send(String phone, String code);

    /**
     * The one that exists today: the code goes to the application log.
     *
     * This is also SEC-OTP-13. It is only reachable while `delivery` is `log`,
     * and the day a provider is wired that setting is what turns it off —
     * which is why the switch lives here rather than being a build profile
     * somebody can forget to set.
     *
     * Printing the code is a second decision from not sending it, and has its
     * own flag: `app.otp.dev-codes-in-log`. A log is storage — shipped to an
     * aggregator, retained for weeks, readable by more people than the database
     * — so a credential written there is a credential at rest in the one place
     * nobody counts as a store. `TransportSecurityCheck` refuses to start when
     * that flag is on and the database connection is encrypted.
     */
    @Component
    @ConditionalOnProperty(name = "app.otp.delivery", havingValue = "log", matchIfMissing = true)
    @RequiredArgsConstructor
    @Slf4j
    class LoggingOtpSender implements OtpSender {

        private final AppProperties props;

        @Override
        public void send(String phone, String code) {
            if (!props.getOtp().isDevCodesInLog()) {
                // Same argument as the throw above, one flag over: a send that
                // neither delivers nor prints has not happened, and saying so is
                // better than leaving somebody waiting for a code that was never
                // going anywhere.
                throw new UnsupportedOperationException(
                        "app.otp.delivery is 'log' and app.otp.dev-codes-in-log is false — "
                                + "nothing can deliver this code");
            }
            // WARN, not INFO: this line is the reason the guard exists, and it
            // should look like the anomaly it is in any log that carries it.
            // The phone is masked even here — the code is the thing this line is
            // for, and the pair together is what makes it an account takeover.
            log.warn("[DEV] OTP for {}: {}", masked(phone), code);
        }

        /** Last four digits only, as AccountService and OtpSendLimiter do it. */
        private static String masked(String phone) {
            if (phone == null || phone.length() < 4) return "****";
            return "*".repeat(phone.length() - 4) + phone.substring(phone.length() - 4);
        }
    }
}

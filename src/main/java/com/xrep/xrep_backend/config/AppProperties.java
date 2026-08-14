package com.xrep.xrep_backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "app")
@Getter
@Setter
public class AppProperties {

    private Jwt jwt = new Jwt();
    private Otp otp = new Otp();
    private Seed seed = new Seed();
    private Fcm fcm = new Fcm();
    private RateLimit rateLimit = new RateLimit();

    @Getter
    @Setter
    public static class Jwt {
        private String secret;
        private int expiryMinutes;
    }

    @Getter
    @Setter
    public static class Otp {
        private int expiryMinutes;
        private boolean smsEnabled;
        /** Maximum wrong attempts before the phone is locked. */
        private int maxAttempts = 3;
        /**
         * How long the lock lasts, in minutes. Stamped onto
         * {@code otp_request.locked_until} when the cap is hit, so changing this
         * moves future locks and leaves a wait already being served alone.
         */
        private int lockMinutes = 10;

        /* ── send rate, per number ──────────────────────────────────────────
         * Wrong codes are capped by maxAttempts above. This is the other
         * direction: how many codes a number may ASK for. Without it, one
         * number can be sent an unlimited number of texts — free while SMS is
         * stubbed, and a bill the day it isn't.
         */

        /**
         * Cooldown before the next code, in seconds, indexed by how many have
         * already gone out inside {@link #sendWindowMinutes}: the second code of
         * a window waits the first value, the third the second, and everything
         * after that the last. The first code in a window never waits.
         *
         * Mirrors `RESEND_LADDER` in `app/src/api/auth.ts` — the app draws the
         * countdown, this enforces it, and they have to agree.
         */
        private List<Integer> resendLadderSeconds = new ArrayList<>(List.of(30, 60, 120));

        /** How far back a send still counts toward the ladder. */
        private int sendWindowMinutes = 60;

        /** Hard ceiling per number per rolling 24 hours, whatever the spacing. */
        private int maxSendsPerDay = 10;
    }

    @Getter
    @Setter
    public static class Seed {
        private Exercises exercises = new Exercises();

        @Getter
        @Setter
        public static class Exercises {
            private boolean enabled = true;
            private String resource = "seed/exercises.json";
            /**
             * Where the seeded exercise images are served from. Defaults to the
             * upstream repo so a fresh clone works; point it at the R2/S3 bucket
             * once the images have been mirrored (see scripts/mirror-exercise-images.sh).
             */
            private String imageBaseUrl =
                    "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
        }
    }

    /**
     * How many requests an identity may make, per class of endpoint.
     *
     * A capacity guard, not a security lock — which is why it lives in memory
     * while {@code otp.lock-minutes} lives in a column. Losing these counters on
     * restart allows one extra window of traffic; persisting them would mean a
     * database write on every request to every endpoint, which is a worse trade.
     * Per-instance buckets do mean the effective ceiling is this times the number
     * of instances: a shared store is what a multi-instance deployment needs, and
     * one instance is what we have.
     *
     * Four tiers rather than a rule list in YAML, because which endpoints cost
     * money is a fact about the endpoints, not a deployment choice — the mapping
     * lives in {@code RateLimitFilter}.
     */
    @Getter
    @Setter
    public static class RateLimit {
        private boolean enabled = true;

        /** Everything not named below. */
        private Tier standard = new Tier(120, 60);

        /**
         * `/v1/auth/**`. Deliberately loose: it is keyed by IP, and behind a proxy
         * without `server.forward-headers-strategy` that IP is the proxy's — so a
         * tight limit here would throttle every trainer at once. The real guard on
         * this path is the per-number OTP throttle in {@link Otp}.
         */
        private Tier auth = new Tier(300, 60);

        /** `/v1/sync/**` and `/v1/client/sync/**` — chatty by design, on reconnect. */
        private Tier sync = new Tier(60, 60);

        /** Anything that spends money per call: a WhatsApp nudge, a weekly report. */
        private Tier messaging = new Tier(10, 60);
    }

    /** `limit` requests per `windowSeconds`, refilled smoothly rather than in steps. */
    @Getter
    @Setter
    public static class Tier {
        private int limit;
        private int windowSeconds;

        public Tier() {}

        public Tier(int limit, int windowSeconds) {
            this.limit = limit;
            this.windowSeconds = windowSeconds;
        }

        /** Tokens per second — the refill rate a bucket of `limit` drains at. */
        public double ratePerSecond() {
            return windowSeconds <= 0 ? limit : (double) limit / windowSeconds;
        }
    }

    @Getter
    @Setter
    public static class Fcm {
        /**
         * Firebase service-account JSON. Either a filesystem path, a classpath:
         * resource, or the raw JSON itself (which is what Railway env vars hold).
         * Blank disables push — the backend logs instead of sending.
         */
        private String credentials = "";
    }
}

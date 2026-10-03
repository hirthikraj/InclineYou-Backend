package com.inclineyou.inclineyou_backend.infrastructure.config;

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
    private Redis redis = new Redis();
    private Session session = new Session();
    private Tenant tenant = new Tenant();
    private Database database = new Database();
    private Security security = new Security();
    private Privacy privacy = new Privacy();

    /**
     * Transport security — the parts of it that are ours rather than the
     * proxy's.
     *
     * <p>TLS itself is terminated upstream (Railway, or whatever fronts the
     * container), so nothing here mints a certificate. What is left is the two
     * things a terminating proxy cannot do on our behalf: tell the browser never
     * to try plaintext again, and refuse a plaintext request if one arrives
     * anyway.
     */
    @Getter
    @Setter
    public static class Security {

        /**
         * Refuse any request that did not arrive over HTTPS.
         *
         * <p>Off by default because development is plain HTTP on localhost and
         * a default of {@code true} would make the first {@code
         * ./mvnw spring-boot:run} redirect-loop into nothing.
         *
         * <p><b>Depends on {@code server.forward-headers-strategy}.</b> Behind a
         * proxy that terminates TLS, every request reaches the container as
         * HTTP; only {@code X-Forwarded-Proto} says otherwise. Turn this on
         * without {@code FORWARD_HEADERS=framework} and every request is
         * redirected to a URL that redirects back — so the deployment checklist
         * lists them together.
         */
        private boolean requireHttps = false;

        /**
         * {@code Strict-Transport-Security} max-age, in days. One year is the
         * value preload lists require; a short one is nearly useless, because
         * the header only protects a visitor who has already been here once.
         *
         * <p>Spring Security only emits it on a request it considers secure,
         * which is the correct behaviour and the reason this is safe to leave on
         * in development: localhost never sees it.
         */
        private int hstsMaxAgeDays = 365;
    }

    /**
     * The runtime database login — the one row-level security applies to.
     *
     * <p>Not where the application connects from: that is
     * {@code spring.datasource.username}. This is what the isolation tests use
     * to prove the policies work, and what the deployment runbook points at
     * when the cutover happens. A table OWNER bypasses its own policies, so a
     * test connecting as the owner would pass for the wrong reason.
     */
    @Getter
    @Setter
    public static class Database {
        private String appRole = "inclineyou_app";
        private String appRolePassword = "inclineyou_app_dev";
    }

    /**
     * Server-side sessions — the web half of the credential story.
     *
     * <p>Shorter than the JWT's seven days on purpose. A browser session is
     * revocable, so its lifetime is a convenience setting rather than a security
     * ceiling; the phone's week exists because an offline device cannot renew.
     */
    @Getter
    @Setter
    public static class Session {
        private int expiryHours = 72;

        /** How long a dead session is kept before the sweeper deletes it. */
        private int purgeAfterDays = 30;

        /** Off and the sweeper never runs — for a read-only replica or a test. */
        private boolean sweepEnabled = true;
    }

    @Getter
    @Setter
    public static class Tenant {
        /**
         * The kill switch for the workspace switcher, NOT for isolation.
         *
         * <p>Off, and every caller resolves to their home workspace and cannot
         * move — which is exactly the behaviour before tenancy existed. It does
         * not and must not disable row-level security: that lives in the
         * database and in which role the pool connects as.
         */
        private boolean switchingEnabled = true;
    }


    /**
     * Whether Redis is used at all.
     *
     * A kill switch rather than a hard dependency: every Redis-backed thing in
     * this application has a working fallback, because a cache being down must
     * not be the reason nobody can sign in.
     */
    @Getter
    @Setter
    public static class Redis {
        private boolean enabled = true;
    }

    @Getter
    @Setter
    public static class Jwt {
        private String secret;
        private int expiryMinutes;
    }

    /**
     * The privacy notice in force. {@code POST /v1/trainers/me/consent} accepts
     * exactly this version and refuses any other with {@code CONSENT_REQUIRED}: a
     * screen showing an older notice is stale, and recording consent to words the
     * person was not shown is not consent. A new notice is a config change, and
     * every trainer is then asked once more.
     */
    @Getter
    @Setter
    public static class Privacy {
        private String policyVersion = "2026-09";
    }

    @Getter
    @Setter
    public static class Otp {
        private int expiryMinutes;
        private boolean smsEnabled;

        /**
         * Write the generated code to the application log.
         *
         * <p>Split out of {@link #smsEnabled} deliberately. They used to be one
         * fact — no SMS provider meant print the code — and that made the log
         * sink an undeclared consequence of a delivery setting. It is its own
         * decision now, because it has its own blast radius: logs are shipped to
         * an aggregator, retained for weeks, and readable by more people than
         * the database is. A code in a log is a credential at rest in the one
         * place nobody thinks of as storage.
         *
         * <p>Left {@code true} by default so a fresh clone can sign in. It is not
         * defended by that default, though — {@link
         * com.inclineyou.inclineyou_backend.infrastructure.config.TransportSecurityCheck} refuses to start
         * when this is on and the database connection is encrypted, because
         * those two facts together describe a real deployment printing OTPs to
         * a log.
         */
        private boolean devCodesInLog = true;

        /** Maximum wrong attempts before the phone is locked. */
        private int maxAttempts = 3;

        private int lockMinutes = 10;

        /**
         * How long an {@code otp_request} row is kept (V21). The send ceiling
         * reads a day and the lock ten minutes, so a month is evidence rather
         * than state — and the row is a phone number, which the DPDP Act says
         * we keep no longer than its purpose needs.
         */
        private int purgeAfterDays = 30;

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
            // No media base URL: the seeded library is text only. Upstream's images
            // and GIFs are © Gym visual and need a licence we do not hold, so there
            // is nothing to point a base URL at. See ExerciseSeeder.
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

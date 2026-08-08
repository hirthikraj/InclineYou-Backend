package com.trainx.trainx_backend.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
@Getter
@Setter
public class AppProperties {

    private Jwt jwt = new Jwt();
    private Otp otp = new Otp();
    private Seed seed = new Seed();
    private Fcm fcm = new Fcm();

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

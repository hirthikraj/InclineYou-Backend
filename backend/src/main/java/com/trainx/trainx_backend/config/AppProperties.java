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
}

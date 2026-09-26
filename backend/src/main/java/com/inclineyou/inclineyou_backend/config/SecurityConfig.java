package com.inclineyou.inclineyou_backend.config;

import com.inclineyou.inclineyou_backend.auth.AuthTokenFilter;
import com.inclineyou.inclineyou_backend.ratelimit.RateLimitFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.header.HeaderWriterFilter;
import org.springframework.security.web.transport.HttpsRedirectFilter;

import java.time.Duration;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final AuthTokenFilter authTokenFilter;
    private final RateLimitFilter rateLimitFilter;
    private final AppProperties props;

    @Bean
    public BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new RequestAttributeSecurityContextRepository();
    }

    // Prevents Spring Boot from auto-configuring an InMemoryUserDetailsManager.
    // All authentication goes through AuthTokenFilter — a JWT for the phone, a
    // server-side session for the web — and UserDetailsService is never called.
    @Bean
    public UserDetailsService noOpUserDetailsService() {
        return username -> { throw new UsernameNotFoundException("JWT auth only"); };
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        var security = props.getSecurity();

        // Refuse plaintext outright, where the deployment says to. Opt-in because
        // it is only correct behind a proxy that sets X-Forwarded-Proto AND a
        // forward-headers strategy that reads it; without both, every request
        // redirects to a URL that redirects back. The runbook lists the two
        // together for that reason.
        //
        // HttpsRedirectFilter rather than the `requiresChannel` DSL: that DSL and
        // the ChannelDecisionManager under it were removed in Spring Security 7,
        // and merely calling it — even with a lambda that configures nothing —
        // throws NoClassDefFoundError.
        //
        // Anchored on HeaderWriterFilter so the redirect happens before any real
        // work. The anchor has to be a filter Spring Security registers itself;
        // AuthTokenFilter below is positioned against a framework filter for the
        // same reason, and cannot be an anchor until it has been.
        if (security.isRequireHttps()) {
            http.addFilterBefore(new HttpsRedirectFilter(), HeaderWriterFilter.class);
        }

        return http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                // Tell a browser that has been here once never to try plaintext
                // again. Spring Security only emits it on a request it already
                // considers secure, which is why leaving it on costs nothing in
                // development: localhost is HTTP and never sees the header.
                //
                // `includeSubDomains` is safe for an API on its own hostname and
                // would not be if the apex served something else over HTTP — if
                // api.<domain> ever becomes a path on <domain>, revisit it.
                .headers(headers -> headers
                        .httpStrictTransportSecurity(hsts -> hsts
                                .includeSubDomains(true)
                                .maxAgeInSeconds(
                                        Duration.ofDays(security.getHstsMaxAgeDays()).toSeconds())))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(ctx -> ctx.securityContextRepository(securityContextRepository()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/v1/auth/trainer").authenticated()
                        .requestMatchers("/v1/auth/mode/**").authenticated()
                        .requestMatchers("/v1/auth/session/**").authenticated()
                        .requestMatchers("/v1/tenants/**").authenticated()
                        .requestMatchers("/v1/auth/membership/**").hasRole("INVITED")
                        .requestMatchers("/v1/auth/**", "/health").permitAll()
                        // The client portal (module 11, /v1/me/* and /v1/client/**)
                        // is out of v1 scope (WEB_LAUNCH.md §3) and its controllers
                        // were removed rather than kept unreachable — so GET /v1/me
                        // now has exactly one meaning: the trainer shell's own
                        // session read (api-contract.html §Today, L1), and no path
                        // needs a ROLE_CLIENT carve-out from the trainer catch-all
                        // below.
                        .anyRequest().hasRole("TRAINER")
                )
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> res.sendError(401, "Unauthorized"))
                )
                .addFilterBefore(authTokenFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(rateLimitFilter, AuthTokenFilter.class)
                .build();
    }
}

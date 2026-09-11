package com.xrep.xrep_backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The guard that stops a real deployment printing sign-in codes to its log.
 *
 * <p>Tested rather than left to inspection because it is the only check in the
 * codebase that fails a boot, and because the thing it defends against is a
 * person under pressure setting a flag to make sign-in work. A control like that
 * is worth knowing still fires.
 *
 * <p>Plain unit tests: the interesting axis is the pair of booleans, and a
 * `@SpringBootTest` could only ever exercise the one combination the development
 * database happens to produce.
 */
class TransportSecurityCheckTest {

    private static TransportSecurityCheck check(Boolean encrypted, boolean devCodesInLog) {
        var jdbc = mock(NamedParameterJdbcTemplate.class);
        if (encrypted == null) {
            when(jdbc.queryForMap(anyString(), anyMap()))
                    .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("no"));
        } else {
            when(jdbc.queryForMap(anyString(), anyMap())).thenReturn(Map.of("ssl", encrypted));
        }
        var props = new AppProperties();
        props.getOtp().setDevCodesInLog(devCodesInLog);
        return new TransportSecurityCheck(jdbc, props);
    }

    @Test
    void refusesToStartWhenCodesWouldBeLoggedOverAnEncryptedConnection() {
        assertThatThrownBy(() -> check(true, true).check())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("OTP codes would be written to the application log")
                // The message has to name the variable to set, or the person who
                // hit this at 2am works around it instead of fixing it.
                .hasMessageContaining("OTP_DEV_CODES_IN_LOG=false");
    }

    @Test
    void allowsTheDevelopmentCombination() {
        // A plaintext localhost database with codes in the log — the default, and
        // the whole reason the flag cannot simply default to false.
        assertThatCode(() -> check(false, true).check()).doesNotThrowAnyException();
    }

    @Test
    void allowsAProperlyConfiguredDeployment() {
        assertThatCode(() -> check(true, false).check()).doesNotThrowAnyException();
    }

    @Test
    void doesNotGuessWhenTheDatabaseCannotBeAsked() {
        // A diagnostic must never be the reason a boot fails, so an unanswerable
        // question is not treated as a yes. The guard fires on a definite
        // `ssl = true` and on nothing else.
        assertThatCode(() -> check(null, true).check()).doesNotThrowAnyException();
    }

    @Test
    void devCodesInLogDefaultsOnSoAFreshCloneCanSignIn() {
        assertThat(new AppProperties().getOtp().isDevCodesInLog()).isTrue();
    }
}

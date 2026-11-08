package com.inclineyou.inclineyou_backend.infrastructure.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

/** The web's forwarded address is believed only with the shared secret; anything else is who connected. */
class ClientAddressTest {

    private static final String NEXT = "10.0.0.5";
    private static final String BROWSER = "49.36.12.7";

    private static ClientAddress withSecret(String secret) {
        var props = new AppProperties();
        props.getWeb().setProxySecret(secret);
        return new ClientAddress(props);
    }

    private static MockHttpServletRequest fromNext(String forwarded, String key) {
        var r = new MockHttpServletRequest();
        r.setRemoteAddr(NEXT);
        if (forwarded != null) r.addHeader(ClientAddress.FORWARDED_IP, forwarded);
        if (key != null) r.addHeader(ClientAddress.PROXY_KEY, key);
        return r;
    }

    @Test
    void theWebsKeyMakesTheBrowsersAddressTheCaller() {
        assertThat(withSecret("s3cret").of(fromNext(BROWSER, "s3cret"))).isEqualTo(BROWSER);
        assertThat(withSecret("s3cret").of(fromNext("2405:201:e01a::1", "s3cret"))).isEqualTo("2405:201:e01a::1");
    }

    @Test
    void aWrongOrMissingKeyIsIgnored() {
        assertThat(withSecret("s3cret").of(fromNext(BROWSER, "guess"))).isEqualTo(NEXT);
        assertThat(withSecret("s3cret").of(fromNext(BROWSER, null))).isEqualTo(NEXT);
    }

    @Test
    void noSecretConfiguredBelievesNobody() {
        assertThat(withSecret("").of(fromNext(BROWSER, ""))).isEqualTo(NEXT);
    }

    @Test
    void anythingThatIsNotAnAddressIsRefusedEvenWithTheKey() {
        assertThat(withSecret("s3cret").of(fromNext("1.2.3.4, 5.6.7.8", "s3cret"))).isEqualTo(NEXT);
        assertThat(withSecret("s3cret").of(fromNext("ip:victim", "s3cret"))).isEqualTo(NEXT);
    }
}

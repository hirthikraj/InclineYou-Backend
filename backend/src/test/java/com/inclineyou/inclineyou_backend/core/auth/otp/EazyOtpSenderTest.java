package com.inclineyou.inclineyou_backend.core.auth.otp;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EazyOtpSenderTest {

    private HttpServer panel;
    private final AtomicReference<String> method = new AtomicReference<>();
    private final AtomicReference<String> path = new AtomicReference<>();
    private final AtomicReference<String> query = new AtomicReference<>();
    private final AtomicReference<String> auth = new AtomicReference<>();
    private volatile int status = 200;
    /** The reply the API actually gives (22 Nov 2026): no `status`, the code under `messages`, the first message under "0". */
    private volatile String reply = "{\"messaging_product\":\"whatsapp\",\"contacts\":\"919876543210\","
            + "\"messages\":{\"0\":{\"id\":\"T-77\",\"message_status\":\"accepted\"},\"otp\":\"424242\"}}";

    private AppProperties props;

    @BeforeEach
    void start() throws Exception {
        panel = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        panel.createContext("/", ex -> {
            method.set(ex.getRequestMethod());
            path.set(ex.getRequestURI().getPath());
            query.set(ex.getRequestURI().getQuery());
            auth.set(ex.getRequestHeaders().getFirst("Authorization"));
            byte[] out = reply.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(status, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        panel.start();
        props = new AppProperties();
        var e = props.getOtp().getEazyotp();
        e.setBaseUrl("http://127.0.0.1:" + panel.getAddress().getPort() + "/");
        e.setApiKey("the-key");
        e.setToken("secret-token");
    }

    @AfterEach
    void stop() { panel.stop(0); }

    private EazyOtpSender sender() {
        var s = new EazyOtpSender(props);
        s.init();
        return s;
    }

    @Test
    void asksForACodeAndAnswersTheOneItSent() {
        var sent = sender().sendGenerated("+919876543210");

        assertThat(sent.code()).isEqualTo("424242");
        assertThat(sent.providerId()).contains("T-77");
        assertThat(method.get()).isEqualTo("GET");
        assertThat(path.get()).isEqualTo("/api/v1.0/the-key/whatsappeazyotp");
        assertThat(query.get()).isEqualTo("number=919876543210");
        assertThat(auth.get()).isEqualTo("Bearer secret-token");
    }

    @Test
    void passesTheTemplateIdWhenOneIsSet() {
        props.getOtp().getEazyotp().setTemplateId(1655);
        sender().sendGenerated("+919876543210");
        assertThat(query.get()).isEqualTo("number=919876543210&id=1655");
    }

    @Test
    void aCodeAnsweredAsANumberStillReads() {
        reply = "{\"messages\":{\"0\":{\"id\":5},\"otp\":424242}}";
        var sent = sender().sendGenerated("+919876543210");
        assertThat(sent.code()).isEqualTo("424242");
        assertThat(sent.providerId()).contains("5");
    }

    @Test
    void theShapeTheDocsDescribedStillReads() {
        reply = "{\"status\":\"success\",\"track_id\":\"T-1\",\"otp\":\"424242\"}";
        var sent = sender().sendGenerated("+919876543210");
        assertThat(sent.code()).isEqualTo("424242");
        assertThat(sent.providerId()).contains("T-1");
    }

    @Test
    void aFailedMessageStatusIsAFailure() {
        reply = "{\"messages\":{\"0\":{\"id\":\"T-9\",\"message_status\":\"failed\"},\"otp\":\"424242\"}}";
        assertThatThrownBy(() -> sender().sendGenerated("+919876543210"))
                .isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("OTP_DELIVERY_FAILED");
    }

    @Test
    void anErrorReplyIsAFailure() {
        reply = "{\"status\":\"error\",\"message\":\"Invalid WhatsApp number or service not activated\"}";
        assertThatThrownBy(() -> sender().sendGenerated("+919876543210"))
                .isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("OTP_DELIVERY_FAILED");
    }

    @Test
    void aRefusalNeverLeaksTheSecrets() {
        status = 401;
        reply = "{\"status\":\"error\",\"error_code\":300,\"message\":\"Invalid token\"}";
        assertThatThrownBy(() -> sender().sendGenerated("+919876543210"))
                .isInstanceOf(ApiException.class)
                .hasMessageNotContaining("secret-token")
                .hasMessageNotContaining("the-key");
    }

    @Test
    void successWithoutASixDigitCodeIsAFailure() {
        reply = "{\"messages\":{\"0\":{\"id\":\"T\"},\"otp\":\"4242\"}}";
        assertThatThrownBy(() -> sender().sendGenerated("+919876543210")).isInstanceOf(ApiException.class);
        reply = "{\"messages\":{\"0\":{\"id\":\"T\"}}}";
        assertThatThrownBy(() -> sender().sendGenerated("+919876543210")).isInstanceOf(ApiException.class);
    }

    @Test
    void neverSendsACodeOfOurs() {
        assertThat(sender().generatesCode()).isTrue();
        assertThatThrownBy(() -> sender().send("+919876543210", "123456"))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void refusesToStartWithoutItsSettings() {
        props.getOtp().getEazyotp().setToken("");
        assertThatThrownBy(() -> new EazyOtpSender(props).init())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PINGTOCHAT_EAZYOTP_TOKEN");
    }
}

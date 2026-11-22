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

class PingToChatOtpSenderTest {

    private HttpServer panel;
    private final AtomicReference<String> path = new AtomicReference<>();
    private final AtomicReference<String> auth = new AtomicReference<>();
    private final AtomicReference<String> body = new AtomicReference<>();
    private volatile int status = 200;
    private volatile String reply =
            "{\"messaging_product\":\"whatsapp\",\"messages\":[{\"id\":\"ptc-42\",\"message_status\":\"accepted\"}]}";

    private AppProperties props;

    @BeforeEach
    void start() throws Exception {
        panel = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        panel.createContext("/", ex -> {
            path.set(ex.getRequestURI().getPath());
            auth.set(ex.getRequestHeaders().getFirst("Authorization"));
            body.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] out = reply.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(status, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        panel.start();
        props = new AppProperties();
        var p = props.getOtp().getPingtochat();
        p.setBaseUrl("http://127.0.0.1:" + panel.getAddress().getPort() + "/");
        p.setPhoneNumberId("1234567890");
        p.setApiKey("the-key");
        p.setToken("secret-token");
        p.setTemplateName("inclineyou_login_code");
    }

    @AfterEach
    void stop() { panel.stop(0); }

    private PingToChatOtpSender sender() {
        var s = new PingToChatOtpSender(props);
        s.init();
        return s;
    }

    @Test
    void sendsTheTemplateToTheSendersUrlAndAnswersTheMessageId() {
        var id = sender().sendTracked("+919876543210", "123456");

        assertThat(id).contains("ptc-42");
        assertThat(path.get()).isEqualTo("/api/v1.0/1234567890/the-key/messages");
        assertThat(auth.get()).isEqualTo("Bearer secret-token");
        assertThat(body.get())
                .contains("\"to\":\"919876543210\"")
                .contains("\"name\":\"inclineyou_login_code\"")
                .contains("\"sub_type\":\"url\"");
        assertThat(body.get().split("123456", -1)).hasSize(3); // body + button
    }

    @Test
    void withoutTheButtonTheCodeIsSentOnce() {
        props.getOtp().getPingtochat().setCopyCodeButton(false);
        sender().send("+919876543210", "123456");
        assertThat(body.get()).doesNotContain("\"button\"");
        assertThat(body.get().split("123456", -1)).hasSize(2);
    }

    @Test
    void aRefusalIsAFailureAndNeverLeaksTheSecretsOrTheCode() {
        status = 400;
        reply = "{\"status\":\"error\",\"error_code\":404,\"message\":\"Template not found\"}";

        assertThatThrownBy(() -> sender().send("+919876543210", "123456"))
                .isInstanceOf(ApiException.class)
                .hasMessageNotContaining("secret-token")
                .hasMessageNotContaining("the-key")
                .hasMessageNotContaining("123456")
                .extracting("code").isEqualTo("OTP_DELIVERY_FAILED");
    }

    @Test
    void anErrorAnsweredWith200IsStillAFailure() {
        reply = "{\"status\":\"error\",\"error_code\":401,\"message\":\"Insufficient balance\"}";
        assertThatThrownBy(() -> sender().send("+919876543210", "123456"))
                .isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("OTP_DELIVERY_FAILED");
    }

    @Test
    void refusesToStartWithoutItsSettings() {
        props.getOtp().getPingtochat().setApiKey(" ");
        assertThatThrownBy(() -> new PingToChatOtpSender(props).init())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PINGTOCHAT_API_KEY");
    }
}

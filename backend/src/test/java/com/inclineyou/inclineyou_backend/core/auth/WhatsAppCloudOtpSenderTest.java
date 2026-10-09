package com.inclineyou.inclineyou_backend.core.auth;

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

class WhatsAppCloudOtpSenderTest {

    private HttpServer meta;
    private final AtomicReference<String> path = new AtomicReference<>();
    private final AtomicReference<String> auth = new AtomicReference<>();
    private final AtomicReference<String> body = new AtomicReference<>();
    private volatile int status = 200;
    private volatile String reply = "{\"messages\":[{\"id\":\"wamid.X\"}]}";

    private AppProperties props;

    @BeforeEach
    void start() throws Exception {
        meta = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        meta.createContext("/", ex -> {
            path.set(ex.getRequestURI().getPath());
            auth.set(ex.getRequestHeaders().getFirst("Authorization"));
            body.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] out = reply.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(status, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        meta.start();
        props = new AppProperties();
        var wa = props.getOtp().getWhatsapp();
        wa.setBaseUrl("http://127.0.0.1:" + meta.getAddress().getPort());
        wa.setPhoneNumberId("1234567890");
        wa.setAccessToken("secret-token");
        wa.setTemplateName("inclineyou_login_code");
    }

    @AfterEach
    void stop() { meta.stop(0); }

    private WhatsAppCloudOtpSender sender() {
        var s = new WhatsAppCloudOtpSender(props);
        s.init();
        return s;
    }

    @Test
    void sendsTheCodeAsBodyAndButtonParameterToTheRightNumber() {
        sender().send("+919876543210", "123456");

        assertThat(path.get()).isEqualTo("/v21.0/1234567890/messages");
        assertThat(auth.get()).isEqualTo("Bearer secret-token");
        assertThat(body.get())
                .contains("\"to\":\"919876543210\"")
                .contains("\"name\":\"inclineyou_login_code\"")
                .contains("\"sub_type\":\"url\"");
        assertThat(body.get().split("123456", -1)).hasSize(3); // body + button
    }

    @Test
    void aRefusalIsAFailureAndNeverLeaksTheTokenOrTheCode() {
        status = 400;
        reply = "{\"error\":{\"message\":\"Recipient not in allowed list\",\"code\":131030}}";

        assertThatThrownBy(() -> sender().send("+919876543210", "123456"))
                .isInstanceOf(ApiException.class)
                .hasMessageNotContaining("secret-token")
                .hasMessageNotContaining("123456")
                .extracting("code").isEqualTo("OTP_DELIVERY_FAILED");
    }

    @Test
    void refusesToStartWithoutItsSettings() {
        props.getOtp().getWhatsapp().setAccessToken("");
        assertThatThrownBy(() -> new WhatsAppCloudOtpSender(props).init())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("WHATSAPP_ACCESS_TOKEN");
    }
}

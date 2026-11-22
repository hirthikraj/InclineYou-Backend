package com.inclineyou.inclineyou_backend.core.auth.otp;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Sends the code on WhatsApp through PingToChat, a BSP in front of Meta's Cloud API.
 *
 * The body is Meta's template message unchanged; what differs is the address —
 * {@code POST {panel}/api/v1.0/{phoneNumberId}/{apiKey}/messages} with a Bearer token —
 * and the error shape, {@code {"status":"error","error_code":…,"message":…}}. The docs
 * say errors come back as 4xx/5xx, but a 200 carrying {@code status: error} is treated
 * as a refusal too: a send that is not plainly accepted must not be recorded as sent.
 *
 * The id in {@code messages[0].id} is PingToChat's own, not a Meta {@code wamid}; it is
 * kept on the {@code otp_request} row like Meta's would be. PingToChat's status webhook
 * documents no signature, so it is not wired to {@code /v1/webhooks/whatsapp} (which
 * checks Meta's HMAC) — rows from this sender stay at {@code sent}.
 *
 * Neither the key nor the token is ever logged; both live in the URL or a header, and
 * the request body holds the code and the number.
 */
@Component
@ConditionalOnProperty(name = "app.otp.delivery", havingValue = "pingtochat")
@RequiredArgsConstructor
@Slf4j
public class PingToChatOtpSender implements OtpSender {

    private static final Pattern ERROR_CODE = Pattern.compile("\"error_code\"\\s*:\\s*\"?(\\d+)");
    private static final Pattern MESSAGE = Pattern.compile("\"message\"\\s*:\\s*\"([^\"]*)\"");

    private final AppProperties props;
    private RestClient client;

    /** A half-configured sender must fail the boot, not the first person to sign in. */
    @PostConstruct
    void init() {
        var p = props.getOtp().getPingtochat();
        var required = new LinkedHashMap<String, String>();
        required.put("PINGTOCHAT_BASE_URL", p.getBaseUrl());
        required.put("PINGTOCHAT_PHONE_NUMBER_ID", p.getPhoneNumberId());
        required.put("PINGTOCHAT_API_KEY", p.getApiKey());
        required.put("PINGTOCHAT_TOKEN", p.getToken());
        required.put("PINGTOCHAT_OTP_TEMPLATE", p.getTemplateName());
        required.forEach((name, value) -> {
            if (value == null || value.isBlank()) {
                throw new IllegalStateException("app.otp.delivery=pingtochat but " + name + " is not set");
            }
        });
        var http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(p.getTimeoutSeconds()))
                .build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(p.getTimeoutSeconds()));
        client = RestClient.builder()
                .baseUrl(p.getBaseUrl().replaceAll("/+$", ""))
                .requestFactory(factory)
                .build();
    }

    @Override
    public void send(String phone, String code) {
        sendTracked(phone, code);
    }

    @Override
    public Optional<String> sendTracked(String phone, String code) {
        var p = props.getOtp().getPingtochat();
        List<Map<String, Object>> components = new ArrayList<>();
        components.add(Map.of("type", "body",
                "parameters", List.of(Map.of("type", "text", "text", code))));
        if (p.isCopyCodeButton()) {
            components.add(Map.of("type", "button", "sub_type", "url", "index", "0",
                    "parameters", List.of(Map.of("type", "text", "text", code))));
        }
        Map<String, Object> body = Map.of(
                "messaging_product", "whatsapp",
                "recipient_type", "individual",
                // Digits with the country code, no '+': the one form every page of their docs accepts.
                "to", phone.replace("+", ""),
                "type", "template",
                "template", Map.of(
                        "name", p.getTemplateName(),
                        "language", Map.of("code", p.getTemplateLanguage()),
                        "components", components));
        try {
            Map<?, ?> reply = client.post()
                    .uri("/api/v1.0/{id}/{key}/messages", p.getPhoneNumberId(), p.getApiKey())
                    .header("Authorization", "Bearer " + p.getToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(Map.class);
            if (reply != null && "error".equals(reply.get("status"))) {
                log.warn("PingToChat send refused for {}: HTTP 200 error_code={} message={}",
                        masked(phone), reply.get("error_code"), reply.get("message"));
                throw delivery();
            }
            return messageId(reply);
        } catch (RestClientResponseException e) {
            // error_code is the useful part: 300 token, 301 key, 305 phone number id, 310 domain, 401 wallet,
            // 404 template not found, 132000 parameter count mismatch, 132001 language not found.
            log.warn("PingToChat send refused for {}: HTTP {} {}", masked(phone), e.getStatusCode().value(), error(e));
            throw delivery();
        } catch (ApiException e) {
            throw e;
        } catch (RuntimeException e) {
            // Class name only: an I/O exception's message quotes the URL, and the URL holds the key.
            log.warn("PingToChat send failed for {}: {}", masked(phone), e.getClass().getSimpleName());
            throw delivery();
        }
    }

    /** {@code {"messages":[{"id":"…","message_status":"accepted"}]}}. Absent is tolerated: the code was accepted. */
    private static Optional<String> messageId(Map<?, ?> reply) {
        if (reply != null && reply.get("messages") instanceof List<?> messages && !messages.isEmpty()
                && messages.get(0) instanceof Map<?, ?> first && first.get("id") != null) {
            String id = String.valueOf(first.get("id"));
            if (!id.isBlank()) return Optional.of(id.length() <= 100 ? id : id.substring(0, 100));
        }
        return Optional.empty();
    }

    private static ApiException delivery() {
        return new ApiException(HttpStatus.BAD_GATEWAY, "OTP_DELIVERY_FAILED",
                "We couldn't send the code on WhatsApp. Please try again in a moment.");
    }

    /** {@code error_code} and {@code message} only; never the whole body. */
    private static String error(RestClientResponseException e) {
        String raw = e.getResponseBodyAsString();
        var code = ERROR_CODE.matcher(raw);
        var msg = MESSAGE.matcher(raw);
        return "error_code=" + (code.find() ? code.group(1) : "?") + " message=" + (msg.find() ? msg.group(1) : "?");
    }

    private static String masked(String phone) {
        return phone == null || phone.length() < 4 ? "****" : "*".repeat(phone.length() - 4) + phone.substring(phone.length() - 4);
    }
}

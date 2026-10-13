package com.inclineyou.inclineyou_backend.core.auth;

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
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Sends the code through Meta's WhatsApp Cloud API, as an Authentication template.
 *
 * Authentication is the only template category an OTP may use: its body is fixed
 * by Meta, so it is approved in minutes, and its "copy code" button takes the code
 * a second time — Meta rejects the send if the button parameter is missing.
 *
 * Meta answers 200 once it has ACCEPTED the message, not delivered it, which is
 * exactly what {@code otp_request.delivery_status = 'sent'} means. The message id it
 * answers is kept on the row, and `delivered` / `read` arrive later through the status
 * webhook ({@code WhatsAppWebhookController}).
 *
 * The access token is never logged and an error body is logged only as Meta's
 * error code and message — the request body holds the code and the number.
 */
@Component
@ConditionalOnProperty(name = "app.otp.delivery", havingValue = "whatsapp")
@RequiredArgsConstructor
@Slf4j
public class WhatsAppCloudOtpSender implements OtpSender {

    private final AppProperties props;
    private RestClient client;

    /** A half-configured sender must fail the boot, not the first person to sign in. */
    @PostConstruct
    void init() {
        var wa = props.getOtp().getWhatsapp();
        for (var field : Map.of(
                "WHATSAPP_PHONE_NUMBER_ID", String.valueOf(wa.getPhoneNumberId()),
                "WHATSAPP_ACCESS_TOKEN", String.valueOf(wa.getAccessToken()),
                "WHATSAPP_OTP_TEMPLATE", String.valueOf(wa.getTemplateName())).entrySet()) {
            if (field.getValue().isBlank() || field.getValue().equals("null")) {
                throw new IllegalStateException("app.otp.delivery=whatsapp but " + field.getKey() + " is not set");
            }
        }
        var http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(wa.getTimeoutSeconds()))
                .build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(wa.getTimeoutSeconds()));
        client = RestClient.builder()
                .baseUrl(wa.getBaseUrl())
                .requestFactory(factory)
                .build();
    }

    @Override
    public void send(String phone, String code) {
        sendTracked(phone, code);
    }

    @Override
    public Optional<String> sendTracked(String phone, String code) {
        var wa = props.getOtp().getWhatsapp();
        Map<String, Object> body = Map.of(
                "messaging_product", "whatsapp",
                // Cloud API wants digits only: +919876543210 → 919876543210
                "to", phone.replace("+", ""),
                "type", "template",
                "template", Map.of(
                        "name", wa.getTemplateName(),
                        "language", Map.of("code", wa.getTemplateLanguage()),
                        "components", List.of(
                                Map.of("type", "body",
                                        "parameters", List.of(Map.of("type", "text", "text", code))),
                                Map.of("type", "button", "sub_type", "url", "index", "0",
                                        "parameters", List.of(Map.of("type", "text", "text", code))))));
        try {
            Map<?, ?> accepted = client.post()
                    .uri("/{version}/{id}/messages", wa.getApiVersion(), wa.getPhoneNumberId())
                    .header("Authorization", "Bearer " + wa.getAccessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(Map.class);
            return messageId(accepted);
        } catch (RestClientResponseException e) {
            // Meta's `error.code` is the useful part (131030: number not on the test allow-list; 131048/130429: throttled).
            log.warn("WhatsApp send refused for {}: HTTP {} {}", masked(phone), e.getStatusCode().value(), metaError(e));
            throw delivery();
        } catch (RuntimeException e) {
            log.warn("WhatsApp send failed for {}: {}", masked(phone), e.toString());
            throw delivery();
        }
    }

    /** {@code {"messages":[{"id":"wamid.…"}]}} — the id the status webhook will quote. Absent is tolerated: the code was sent. */
    private static Optional<String> messageId(Map<?, ?> accepted) {
        if (accepted != null && accepted.get("messages") instanceof List<?> messages && !messages.isEmpty()
                && messages.get(0) instanceof Map<?, ?> first && first.get("id") instanceof String id && !id.isBlank()) {
            return Optional.of(id.length() <= 100 ? id : id.substring(0, 100));
        }
        return Optional.empty();
    }

    private static ApiException delivery() {
        return new ApiException(HttpStatus.BAD_GATEWAY, "OTP_DELIVERY_FAILED",
                "We couldn't send the code on WhatsApp. Please try again in a moment.");
    }

    /** `error.code` and `error.message` only; never the whole body. */
    private static String metaError(RestClientResponseException e) {
        String raw = e.getResponseBodyAsString();
        var code = java.util.regex.Pattern.compile("\"code\"\\s*:\\s*(\\d+)").matcher(raw);
        var msg = java.util.regex.Pattern.compile("\"message\"\\s*:\\s*\"([^\"]*)\"").matcher(raw);
        return "code=" + (code.find() ? code.group(1) : "?") + " message=" + (msg.find() ? msg.group(1) : "?");
    }

    private static String masked(String phone) {
        return phone == null || phone.length() < 4 ? "****" : "*".repeat(phone.length() - 4) + phone.substring(phone.length() - 4);
    }
}

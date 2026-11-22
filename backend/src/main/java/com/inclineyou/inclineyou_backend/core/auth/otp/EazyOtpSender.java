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
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Sends the code on WhatsApp through PingToChat's Eazy OTP: {@code GET {base}/api/v1.0/{key}/whatsappeazyotp?number=…}
 * with a Bearer token. It goes from PingToChat's own sender and approved template, which is why it needs no
 * WhatsApp Business number of ours.
 *
 * Unlike every other sender it GENERATES the code — the API has no field for ours — and answers it in the reply,
 * so {@link #generatesCode} is true and {@link OtpService} hashes and stores what comes back. The code is checked
 * to be the six digits {@code POST /v1/auth/otp/verify} accepts; anything else is a failed send, because a code the
 * person cannot type in is worse than an honest error.
 *
 * What must never reach a log: the key (it is in the URL, so neither the URL nor an exception that quotes it is
 * logged), the token, and the reply body (it holds the code). Only PingToChat's {@code status} / {@code message} /
 * {@code error_code} are.
 */
@Component
@ConditionalOnProperty(name = "app.otp.delivery", havingValue = "eazyotp")
@RequiredArgsConstructor
@Slf4j
public class EazyOtpSender implements OtpSender {

    private static final Pattern SIX_DIGITS = Pattern.compile("^\\d{6}$");
    private static final Pattern ERROR_CODE = Pattern.compile("\"error_code\"\\s*:\\s*\"?(\\d+)");
    private static final Pattern MESSAGE = Pattern.compile("\"message\"\\s*:\\s*\"([^\"]*)\"");

    private final AppProperties props;
    private RestClient client;

    /** A half-configured sender must fail the boot, not the first person to sign in. */
    @PostConstruct
    void init() {
        var e = props.getOtp().getEazyotp();
        if (blank(e.getBaseUrl())) throw missing("PINGTOCHAT_EAZYOTP_BASE_URL");
        if (blank(e.getApiKey())) throw missing("PINGTOCHAT_EAZYOTP_API_KEY");
        if (blank(e.getToken())) throw missing("PINGTOCHAT_EAZYOTP_TOKEN");
        var http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(e.getTimeoutSeconds()))
                .build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(e.getTimeoutSeconds()));
        client = RestClient.builder()
                .baseUrl(e.getBaseUrl().replaceAll("/+$", ""))
                .requestFactory(factory)
                .build();
    }

    @Override
    public boolean generatesCode() {
        return true;
    }

    /** There is no way to send a code of ours through Eazy OTP. */
    @Override
    public void send(String phone, String code) {
        throw new UnsupportedOperationException("Eazy OTP generates its own code; OtpService must call sendGenerated");
    }

    @Override
    public Optional<String> sendTracked(String phone, String code) {
        send(phone, code);
        return Optional.empty();
    }

    @Override
    public Generated sendGenerated(String phone) {
        var e = props.getOtp().getEazyotp();
        Map<?, ?> reply;
        try {
            reply = client.get()
                    .uri(b -> {
                        // Digits with the country code, no '+'.
                        b.path("/api/v1.0/{key}/whatsappeazyotp").queryParam("number", phone.replace("+", ""));
                        if (e.getTemplateId() != null) b.queryParam("id", e.getTemplateId());
                        return b.build(e.getApiKey());
                    })
                    .header("Authorization", "Bearer " + e.getToken())
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(Map.class);
        } catch (RestClientResponseException ex) {
            log.warn("Eazy OTP send refused for {}: HTTP {} {}", masked(phone), ex.getStatusCode().value(), error(ex));
            throw delivery();
        } catch (RuntimeException ex) {
            // Class name only: an I/O exception's message quotes the URL, and the URL holds the key.
            log.warn("Eazy OTP send failed for {}: {}", masked(phone), ex.getClass().getSimpleName());
            throw delivery();
        }
        // The real reply (22 Nov 2026) carries no `status` on success: {"messaging_product":"whatsapp",
        // "contacts":"91…","messages":{"0":{"id":"…","message_status":"…"},"otp":"123456"}}. So a refusal is an
        // explicit `status: error` or a message_status that says it failed — not the absence of `status: success`.
        if (reply == null || "error".equalsIgnoreCase(String.valueOf(reply.get("status"))) || failed(messageStatus(reply))) {
            log.warn("Eazy OTP send refused for {}: status={} message_status={} error_code={} message={}", masked(phone),
                    reply == null ? null : reply.get("status"),
                    reply == null ? null : messageStatus(reply),
                    reply == null ? null : reply.get("error_code"),
                    reply == null ? null : reply.get("message"));
            throw delivery();
        }
        String code = codeOf(reply);
        if (code == null || !SIX_DIGITS.matcher(code).matches()) {
            // Never the value itself: it may be a real code that went to a real phone. The keys are enough to fix a parser.
            log.warn("Eazy OTP reply for {} has no six-digit code (got {}); reply keys={} messages keys={}", masked(phone),
                    code == null ? "none" : code.length() + " characters", reply.keySet(),
                    reply.get("messages") instanceof Map<?, ?> m ? m.keySet() : null);
            throw delivery();
        }
        return new Generated(code, messageId(reply));
    }

    /** {@code messages.otp}, as the API answers it; {@code otp} or {@code data.otp} as the docs once described it. */
    private static String codeOf(Map<?, ?> reply) {
        Object otp = reply.get("messages") instanceof Map<?, ?> messages ? messages.get("otp") : null;
        if (otp == null) otp = reply.get("otp");
        if (otp == null && reply.get("data") instanceof Map<?, ?> data) otp = data.get("otp");
        return otp == null ? null : String.valueOf(otp).trim();
    }

    /** The first message: {@code messages["0"]} in the object the API answers, or {@code messages[0]} if it is a list. */
    private static Map<?, ?> firstMessage(Map<?, ?> reply) {
        Object messages = reply.get("messages");
        Object first = null;
        if (messages instanceof Map<?, ?> m) first = m.get("0");
        else if (messages instanceof List<?> l && !l.isEmpty()) first = l.get(0);
        return first instanceof Map<?, ?> f ? f : null;
    }

    private static String messageStatus(Map<?, ?> reply) {
        Map<?, ?> first = firstMessage(reply);
        return first == null || first.get("message_status") == null ? null : String.valueOf(first.get("message_status"));
    }

    private static boolean failed(String messageStatus) {
        return messageStatus != null && List.of("failed", "rejected", "error", "undelivered")
                .contains(messageStatus.trim().toLowerCase(java.util.Locale.ROOT));
    }

    /** The transaction id in {@code messages["0"].id}, else {@code track_id}; what the row keeps for tracing. */
    private static Optional<String> messageId(Map<?, ?> reply) {
        Map<?, ?> first = firstMessage(reply);
        Object id = first == null ? null : first.get("id");
        if (id == null) id = reply.get("track_id");
        if (id == null) return Optional.empty();
        String s = String.valueOf(id);
        return s.isBlank() ? Optional.empty() : Optional.of(s.length() <= 100 ? s : s.substring(0, 100));
    }

    private static ApiException delivery() {
        return new ApiException(HttpStatus.BAD_GATEWAY, "OTP_DELIVERY_FAILED",
                "We couldn't send the code on WhatsApp. Please try again in a moment.");
    }

    /** {@code error_code} and {@code message} only; never the whole body, which may hold a code. */
    private static String error(RestClientResponseException e) {
        String raw = e.getResponseBodyAsString();
        var code = ERROR_CODE.matcher(raw);
        var msg = MESSAGE.matcher(raw);
        return "error_code=" + (code.find() ? code.group(1) : "?") + " message=" + (msg.find() ? msg.group(1) : "?");
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static IllegalStateException missing(String name) {
        return new IllegalStateException("app.otp.delivery=eazyotp but " + name + " is not set");
    }

    private static String masked(String phone) {
        return phone == null || phone.length() < 4 ? "****" : "*".repeat(phone.length() - 4) + phone.substring(phone.length() - 4);
    }
}

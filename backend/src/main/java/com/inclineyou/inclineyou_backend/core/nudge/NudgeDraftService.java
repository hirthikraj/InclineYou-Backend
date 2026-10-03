package com.inclineyou.inclineyou_backend.core.nudge;

import com.inclineyou.inclineyou_backend.core.nudge.dto.Draft;
import com.inclineyou.inclineyou_backend.core.nudge.dto.DraftClient;
import com.inclineyou.inclineyou_backend.core.nudge.dto.DraftRequest;
import com.inclineyou.inclineyou_backend.core.nudge.dto.Drafted;
import com.inclineyou.inclineyou_backend.core.nudge.dto.NewNudgeLog;
import com.inclineyou.inclineyou_backend.core.payment.PackageReadService;
import com.inclineyou.inclineyou_backend.core.payment.dto.CurrentPackage;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * {@code POST /v1/clients/{clientId}/nudges} — draft a WhatsApp message, log it,
 * hand back a {@code wa.me} link (api-contract Today A2).
 *
 * <p><b>This service has never sent a message and still does not.</b> The trainer
 * reviews the draft and presses send from their own WhatsApp, every time. The
 * alternative is the WhatsApp Business API, which costs money, needs Meta template
 * review and — the part that decides it — sends from a platform number: a message
 * from the trainer's own number lands in a thread the client already has open and
 * gets read; one from a business number lands beside the delivery notifications and
 * does not. Automation would make this feature worse, not better; it is v2 on purpose.
 *
 * <h2>Every figure in the message is resolved HERE</h2>
 *
 * Never passed in by the caller. The amount in a payment reminder is read from the
 * same ledger the money book reads, so the message and the money book cannot
 * disagree — and a caller that could pass the text could disagree with the ledger,
 * the one most likely to being the screen that just did some arithmetic of its own.
 * One count per template, so {@code {count}} can never mean two things in one message
 * (sessions left, sessions missed and sessions delivered are three different numbers).
 *
 * <h2>The cooldown is READ elsewhere and enforced nowhere</h2>
 *
 * Once per client per seven days ({@code COOLDOWN_DAYS}, see {@link NudgeReadService}) is
 * the queue going quiet about somebody already contacted, not a 429 here. A trainer
 * pressing <i>Remind</i> on a client they messaged on Monday knows something the product
 * does not — the client replied, or asked to be chased again — and a refusal would teach
 * them to open WhatsApp directly, which loses the log, and with it the cooldown, for
 * everybody.
 *
 * <p>The SQL is {@link NudgeLogJdbcRepository}'s; this class decides which template takes
 * which subject, what the words are and when a replay is a replay.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NudgeDraftService {

    private final NudgeLogJdbcRepository logs;
    private final PackageReadService packages;
    private final WorkspaceClock clock;
    private final NudgeTemplateJdbcRepository templates;

    /**
     * {@code nudge_log.reason} derived from the template, so the caller never
     * sends it. {@code re_engagement} and {@code session_summary} have no agreed
     * reason yet (R64): until one is confirmed against {@code nudge_log_reason}
     * and {@code nudge_log_subject}, they are refused rather than guessed.
     */
    private static final Map<String, String> REASON = Map.of(
            "payment_reminder", "dues",
            "renewal", "pack_ending",
            "missed_session", "no_show",
            "check_in", "lapsed",
            "well_done", "manual",
            "session_reminder", "session");
    private static final Set<String> TEMPLATES = Set.of("payment_reminder", "renewal", "missed_session",
            "re_engagement", "session_reminder", "session_summary", "well_done", "check_in");
    private static final Set<String> TAKES_PACKAGE = Set.of("payment_reminder", "renewal");
    private static final Set<String> TAKES_SESSION = Set.of("missed_session", "session_reminder", "session_summary");
    /** {@code nudge_log.message} is varchar(1000). */
    private static final int MAX_MESSAGE = 1000;

    @Transactional
    public Drafted draft(UUID trainerId, UUID clientId, DraftRequest req) {
        if (req == null) throw ApiException.validation("body: required");
        UUID id = uuid(req.id(), "id");
        String template = req.template();
        if (template == null || !TEMPLATES.contains(template)) {
            throw ApiException.validation("template: one of " + String.join(", ", TEMPLATES.stream().sorted().toList()));
        }
        String reason = REASON.get(template);
        if (reason == null) {
            throw ApiException.validation("template: " + template + " is not available yet");
        }
        UUID packageId = uuid(req.packageId(), "packageId");
        UUID sessionId = uuid(req.sessionId(), "sessionId");
        // nudge_log_subject: a package only on a money reason, a session only on a session one.
        if (packageId != null && !TAKES_PACKAGE.contains(template)) {
            throw ApiException.validation("packageId: " + template + " doesn't take a package");
        }
        if (sessionId != null && !TAKES_SESSION.contains(template)) {
            throw ApiException.validation("sessionId: " + template + " doesn't take a session");
        }

        DraftClient client = logs.draftClient(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        String phone = NudgeText.waNumber(client.phone());

        // A replay is answered from the row it wrote — the stored message rebuilds
        // the same link, and no second row skews the cooldown.
        if (id != null) {
            var existing = logs.byId(id);
            if (existing.isPresent()) {
                var e = existing.get();
                if (!trainerId.toString().equals(e.trainerId()) || !clientId.toString().equals(e.clientId())) {
                    throw ApiException.idConflict();
                }
                return new Drafted(new Draft(id.toString(), e.message(), link(phone, client.name(), e.message()),
                        e.sentAt()), false);
            }
        }
        if (phone == null) {
            // 409, not 422 (1.1): adding a number makes the same request work.
            throw ApiException.conflict("CLIENT_NO_PHONE", client.name() + " has no phone number on file.");
        }

        if (packageId != null && !logs.packageOfClient(trainerId, clientId, packageId)) {
            throw ApiException.validation("packageId: not a package of this client");
        }
        if (sessionId != null && !logs.sessionOfClient(trainerId, clientId, sessionId)) {
            throw ApiException.validation("sessionId: not a session of this client");
        }

        // Day counts in the message are read on the workspace's calendar, not the
        // server's or the database's clock: "due 1 day ago" at 02:00 in Chennai
        // must not say 0 because the JVM runs in UTC.
        LocalDate today = WorkspaceClock.today(clock.zone());
        String message = NudgeText.interpolate(bodyFor(trainerId, template),
                variables(trainerId, clientId, template, packageId, today, client));
        if (message.length() > MAX_MESSAGE) message = message.substring(0, MAX_MESSAGE);

        UUID rowId = id == null ? UUID.randomUUID() : id;
        long sentAt;
        try {
            sentAt = logs.append(new NewNudgeLog(rowId, trainerId, clientId, reason, template, packageId, sessionId, message));
        } catch (DuplicateKeyException e) {
            throw ApiException.idConflict();   // an id taken by a row this trainer cannot see
        }
        log.info("nudge drafted trainer={} client={} template={}", trainerId, clientId, template);
        return new Drafted(new Draft(rowId.toString(), message, link(phone, client.name(), message), sentAt), true);
    }

    /** The trainer's own wording if they have one, else the built-in (nudge_template is an override). */
    private String bodyFor(UUID trainerId, String template) {
        var saved = templates.overrides(trainerId).get(template);
        if (saved != null) return saved.body();
        var t = NudgeTemplateCatalog.find(template);
        return t != null ? t.body() : NudgeTemplateCatalog.FALLBACK_BODY;
    }

    /** Every variable this template could use, read from v1 tables. */
    private Map<String, String> variables(UUID trainerId, UUID clientId, String template, UUID packageId,
                                          LocalDate today, DraftClient client) {
        var vars = new HashMap<String, String>();
        vars.put("{name}", NudgeText.firstName(client.name(), "there"));
        vars.put("{trainer}", NudgeText.firstName(client.trainerName(), "your trainer"));
        switch (template) {
            case "renewal" -> {
                var pack = pack(trainerId, clientId, packageId);
                int left = pack == null || pack.sessionsRemaining() == null ? 0 : pack.sessionsRemaining();
                vars.put("{count}", String.valueOf(left));
                vars.put("{nth}", NudgeText.ordinal(left));
                vars.put("{package}", pack == null ? "pack" : pack.name());
            }
            case "payment_reminder" -> {
                // The named package's amountDue, else everything the client owes —
                // the same ledger L5 and the money card read.
                var owed = owing(trainerId, clientId, packageId, today);
                vars.put("{amount}", NudgeText.rupees(owed.amount()));
                vars.put("{package}", owed.packageName());
                vars.put("{days}", String.valueOf(owed.days()));
                vars.put("{count}", String.valueOf(owed.days()));
            }
            case "missed_session" -> {
                int n = logs.noShowsInLast30Days(clientId);
                vars.put("{count}", String.valueOf(n));
                vars.put("{nth}", NudgeText.ordinal(n));
            }
            case "well_done" -> {
                // The count L3's stats.sessionsDone reports, so the message says
                // the number on the row the trainer pressed.
                int n = logs.doneSessions(clientId);
                vars.put("{count}", String.valueOf(n));
                vars.put("{nth}", NudgeText.ordinal(n));
            }
            case "check_in" -> {
                Integer days = logs.daysSinceLastDone(clientId, clock.zone().getId(), today);
                // Nothing ever delivered: a word, not "0 days", which would be a lie.
                vars.put("{days}", days == null ? "a few" : String.valueOf(days));
            }
            default -> { /* session_reminder: name and trainer only */ }
        }
        return vars;
    }

    /** The named package, else the client's first active one. */
    private CurrentPackage pack(UUID trainerId, UUID clientId, UUID packageId) {
        if (packageId != null) return packages.one(trainerId, packageId).orElse(null);
        return packages.list(trainerId, true, clientId).stream()
                .filter(k -> "active".equals(k.status()))
                .findFirst().orElse(null);
    }

    private record Owed(BigDecimal amount, String packageName, int days) {}

    private Owed owing(UUID trainerId, UUID clientId, UUID packageId, LocalDate today) {
        List<CurrentPackage> owing = packageId != null
                ? packages.one(trainerId, packageId).stream().toList()
                : packages.list(trainerId, true, clientId).stream()
                        .filter(k -> new BigDecimal(k.amountDue()).signum() > 0).toList();
        BigDecimal total = owing.stream().map(k -> new BigDecimal(k.amountDue())).reduce(BigDecimal.ZERO, BigDecimal::add);
        String name = owing.size() == 1 ? owing.getFirst().name() : "pack";
        // How long it has been outstanding: from the earliest due date still owed.
        int days = owing.stream().map(CurrentPackage::dueDate)
                .filter(d -> d != null)
                .map(d -> (int) Math.max(0, ChronoUnit.DAYS.between(LocalDate.parse(d), today)))
                .max(Integer::compare).orElse(0);
        return new Owed(total, name, days);
    }

    private static String link(String phone, String clientName, String message) {
        if (phone == null) throw ApiException.conflict("CLIENT_NO_PHONE", clientName + " has no phone number on file.");
        return "https://wa.me/" + phone + "?text=" + URLEncoder.encode(message, StandardCharsets.UTF_8);
    }

    private static UUID uuid(String raw, String field) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }
}

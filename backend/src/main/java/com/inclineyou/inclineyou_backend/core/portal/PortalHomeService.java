package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.PortalHomeJdbcRepository.SessionRow;
import com.inclineyou.inclineyou_backend.core.portal.dto.PortalHome;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * {@code GET /v1/portal/home} — one hero, and the rule for which (api-contract 1.2, S-02).
 *
 * <ol>
 *   <li><b>session</b> — the trainer has a session with this client today (their time zone) that has not ended. Never a Start: the
 *       trainer logs a booked session.</li>
 *   <li><b>rest</b> — a session of either kind was finished today, or today's booked session has come and gone unmarked.</li>
 *   <li><b>selfRun</b> — an active program with a next day that is not done and not booked to the trainer this week.</li>
 *   <li><b>rest</b> again — a program with nothing left in it this cycle; or no program but a session ahead.</li>
 *   <li><b>empty</b> — nothing yet: the trainer's greeting and their WhatsApp button.</li>
 * </ol>
 * Everything is a read over the client's own rows, so the cost is a handful of indexed queries and none per card.
 */
@Service
@RequiredArgsConstructor
public class PortalHomeService {

    static final String DEFAULT_ZONE = "Asia/Kolkata";
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE d MMM, h:mm a", Locale.ENGLISH);

    private final PortalHomeJdbcRepository repo;
    private final PortalJdbcRepository portal;
    private final PortalAccess access;

    public PortalHome home(String phone) {
        UUID client = access.clientId(phone);
        JsonNode wall = portal.wall(phone).orElseThrow();
        JsonNode trainer = wall.path("trainer");
        String trainerName = text(trainer, "name");
        String zoneId = text(wall.path("my_details"), "timezone") == null ? DEFAULT_ZONE : text(wall.path("my_details"), "timezone");
        ZoneId zone = zone(zoneId);

        Instant now = Instant.now();
        LocalDate today = LocalDate.now(zone);
        Instant dayStart = today.atStartOfDay(zone).toInstant();
        Instant dayEnd = today.plusDays(1).atStartOfDay(zone).toInstant();
        String gym = text(trainer, "gym_name");
        String wa = whatsapp(text(trainer, "phone"));

        var hero = hero(client, now, dayStart, dayEnd, zone, gym, wa, trainerName);
        var lastDone = repo.lastDone(client);
        PortalHome.LastRecap recap = lastDone.map(d -> {
            var t = repo.totals(client, d.id());
            return new PortalHome.LastRecap(d.id(), d.at().toEpochMilli(), t.setsDone(), t.volumeKg(),
                    repo.newBests(client, d.id(), d.at()), repo.recapMessage(client, d.id()).orElse(null));
        }).orElse(null);

        return new PortalHome("active", new PortalHome.Trainer(trainerName), now.toEpochMilli(), zoneId, hero,
                repo.latestMessage(client, trainerName).orElse(null), repo.activePackage(client).orElse(null), recap,
                repo.recentMilestone(client, now).orElse(null), repo.assessments(client, today).orElse(null),
                portal.unreadNotices(client), recap != null);
    }

    private PortalHome.Hero hero(UUID client, Instant now, Instant dayStart, Instant dayEnd, ZoneId zone, String gym, String wa, String trainerName) {
        var today = repo.todaySession(client, now, dayStart, dayEnd);
        if (today.isPresent()) return new PortalHome.Hero("session", card(today.get(), zone, gym, wa, trainerName), null, null, null);

        boolean rested = repo.finishedToday(client, dayStart, dayEnd) || repo.bookedTodayAndPast(client, now, dayStart, dayEnd);
        var next = repo.nextSession(client, now).map(s -> card(s, zone, gym, wa, trainerName)).orElse(null);
        if (rested) return new PortalHome.Hero("rest", null, null, null, next);

        if (repo.hasActiveProgram(client)) {
            var day = repo.nextProgramDay(client, now);
            if (day.isPresent()) {
                var resume = repo.resumable(client, day.get().id()).map(PortalHome.Resume::new).orElse(null);
                return new PortalHome.Hero("selfRun", null, day.get(), resume, null);
            }
            return new PortalHome.Hero("rest", null, null, null, next);   // nothing left in this cycle
        }
        return next != null ? new PortalHome.Hero("rest", null, null, null, next) : new PortalHome.Hero("empty", null, null, null, null);
    }

    static PortalHome.SessionCard card(SessionRow s, ZoneId zone, String gym, String wa, String trainerName) {
        boolean inPerson = s.mode() == null || "in_person".equals(s.mode());
        String when = WHEN.format(Instant.ofEpochMilli(s.scheduledAt()).atZone(zone)).replace("AM", "am").replace("PM", "pm");
        String first = trainerName == null ? "" : " " + trainerName.split(" ")[0];
        String draft = "Hi" + first + ", can we move my session on " + when + "?";
        String url = wa == null ? null : wa + "?text=" + URLEncoder.encode(draft, StandardCharsets.UTF_8).replace("+", "%20");
        return new PortalHome.SessionCard(s.id(), s.scheduledAt(), s.durationMinutes(), s.mode(), inPerson ? gym : null, s.workoutName(), url);
    }

    static ZoneId zone(String id) {
        try {
            return ZoneId.of(id);
        } catch (Exception e) {
            return ZoneId.of(DEFAULT_ZONE);
        }
    }

    static String whatsapp(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("\\D", "");
        return digits.isEmpty() ? null : "https://wa.me/" + digits;
    }

    static String text(JsonNode n, String key) {
        JsonNode v = n.path(key);
        return v.isString() && !v.asString().isBlank() ? v.asString() : null;
    }
}

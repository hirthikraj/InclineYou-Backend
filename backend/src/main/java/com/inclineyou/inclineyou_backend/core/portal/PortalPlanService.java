package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalPlan;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * What is coming, what was done, and whether it is working (api-contract 1.2, pp-l1 … pp-l4). Strength first, then consistency: counts,
 * never streaks; no rate of loss; no target set in the app; and no body measurement, which is taken in an assessment and seen there.
 *
 * <p>A day's {@code state} is the rule Home uses to choose the self-run day — done, booked to the trainer in the coming week, else the first
 * one left is {@code next} — so the plan and Home can never name different days.
 */
@Service
@RequiredArgsConstructor
public class PortalPlanService {

    private final PortalPlanJdbcRepository repo;
    private final PortalJdbcRepository portal;
    private final PortalAccess access;

    public PortalPlan.Plan plan(String phone) {
        UUID client = access.clientId(phone);
        JsonNode wall = portal.wall(phone).orElseThrow();
        JsonNode trainer = wall.path("trainer");
        String zoneId = PortalHomeService.text(wall.path("my_details"), "timezone");
        ZoneId zone = PortalHomeService.zone(zoneId == null ? PortalHomeService.DEFAULT_ZONE : zoneId);
        String gym = PortalHomeService.text(trainer, "gym_name");
        String wa = PortalHomeService.whatsapp(PortalHomeService.text(trainer, "phone"));
        String trainerName = PortalHomeService.text(trainer, "name");
        Instant now = Instant.now();

        var upcoming = repo.upcoming(client, now, 14).stream().map(s -> PortalHomeService.card(s, zone, gym, wa, trainerName)).toList();
        var arc = repo.currentProgram(client).map(pr -> arc(client, pr, now, zone)).orElse(null);
        return new PortalPlan.Plan(upcoming, arc);
    }

    private PortalPlan.ProgramArc arc(UUID client, PortalPlanJdbcRepository.ProgramRow pr, Instant now, ZoneId zone) {
        var rows = repo.days(client, pr.id(), now);
        var days = new ArrayList<PortalPlan.Day>();
        boolean nextTaken = false;
        Integer nextWeek = null;
        for (var d : rows) {
            String state;
            String sessionId = null;
            if (d.doneId() != null) { state = "done"; sessionId = d.doneId(); }
            else if (d.bookedId() != null) { state = "booked"; sessionId = d.bookedId(); }
            else if (!nextTaken) { state = "next"; nextTaken = true; nextWeek = d.week(); }
            else state = "todo";
            days.add(new PortalPlan.Day(d.workoutId(), d.week(), d.day(), d.name(), state, sessionId));
        }
        int week = 1;
        if (pr.startDate() != null) {
            long weeks = ChronoUnit.WEEKS.between(LocalDate.parse(pr.startDate()), LocalDate.now(zone));
            week = (int) Math.max(1, Math.min(pr.weeks(), weeks + 1));
        } else if (nextWeek != null) {
            week = Math.max(1, Math.min(pr.weeks(), nextWeek));
        }
        return new PortalPlan.ProgramArc(pr.id().toString(), pr.name(), pr.weeks(), pr.status(), pr.startDate(), pr.endDate(), week, days);
    }

    public PortalPlan.PastPage past(String phone, int limit, String rawCursor) {
        UUID client = access.clientId(phone);
        int n = Math.max(1, Math.min(limit, 50));
        var cursor = Cursor.decode(rawCursor);
        var rows = repo.past(client, cursor == null ? null : cursor.keyAsTimestamp(), cursor == null ? null : cursor.id(), n + 1);
        boolean more = rows.size() > n;
        var page = more ? rows.subList(0, n) : rows;
        String next = more ? Cursor.encode(Cursor.key(page.getLast().createdAt()), page.getLast().item().id()) : null;
        return new PortalPlan.PastPage(page.stream().map(PortalPlanJdbcRepository.PastRow::item).toList(), next);
    }

    public PortalPlan.ProgramTree program(String phone, UUID id) {
        UUID client = access.clientId(phone);
        var pr = repo.program(client, id).orElseThrow(() -> ApiException.notFound("That plan isn't yours."));
        return new PortalPlan.ProgramTree(pr.id().toString(), pr.name(), pr.weeks(), pr.status(), pr.startDate(), pr.endDate(), repo.tree(pr.id()));
    }

    public PortalPlan.Progress progress(String phone, int windowDays) {
        UUID client = access.clientId(phone);
        if (windowDays < 7 || windowDays > 365) throw ApiException.validation("windowDays: between 7 and 365");
        Instant to = Instant.now();
        Instant from = to.minus(windowDays, ChronoUnit.DAYS);

        var rows = repo.strength(client, from, to);
        int improved = 0;
        PortalPlan.BestChange best = null;
        for (var r : rows) {
            BigDecimal f = r.from().e1rm(), t = r.to().e1rm();
            if (f == null || t == null || t.compareTo(f) <= 0) continue;
            improved++;
            BigDecimal pct = t.subtract(f).multiply(BigDecimal.valueOf(100)).divide(f, 1, RoundingMode.HALF_UP);
            if (best == null || pct.compareTo(best.changePct()) > 0) best = new PortalPlan.BestChange(r.exerciseId(), r.name(), pct.stripTrailingZeros().scale() < 0 ? pct.setScale(0) : pct.stripTrailingZeros(), r.from(), r.to());
        }
        int[] c = repo.consistency(client, from, to);
        BigDecimal perWeek = BigDecimal.valueOf(c[0] + c[1]).multiply(BigDecimal.valueOf(7)).divide(BigDecimal.valueOf(windowDays), 1, RoundingMode.HALF_UP).stripTrailingZeros();
        if (perWeek.scale() < 0) perWeek = perWeek.setScale(0);
        return new PortalPlan.Progress(windowDays, new PortalPlan.Strength(rows.size(), improved, best),
                new PortalPlan.Consistency(c[0] + c[1], c[0], c[1], perWeek), repo.milestones(client, from));
    }

    public PortalPlan.ExercisePage exercises(String phone, int limit, String rawCursor) {
        UUID client = access.clientId(phone);
        int n = Math.max(1, Math.min(limit, 50));
        var cursor = Cursor.decode(rawCursor);
        var rows = repo.exercises(client, zoneOf(phone), cursor == null ? null : cursor.keyAsTimestamp(), cursor == null ? null : cursor.id(), n + 1);
        boolean more = rows.size() > n;
        var page = more ? rows.subList(0, n) : rows;
        String next = more ? Cursor.encode(Cursor.key(page.getLast().lastAt()), page.getLast().item().exerciseId()) : null;
        return new PortalPlan.ExercisePage(page.stream().map(PortalPlanJdbcRepository.ExerciseRow::item).toList(), next);
    }

    public PortalPlan.ExerciseSeries exercise(String phone, UUID exerciseId, String rawFrom) {
        UUID client = access.clientId(phone);
        String tz = zoneOf(phone);
        var head = repo.exerciseHead(exerciseId).orElseThrow(() -> ApiException.notFound("That exercise isn't available to you."));
        Instant from = null;
        if (rawFrom != null && !rawFrom.isBlank()) {
            try {
                from = LocalDate.parse(rawFrom.strip()).atStartOfDay(ZoneId.of(tz)).toInstant();
            } catch (Exception e) {
                throw ApiException.validation("from: a date, yyyy-MM-dd");
            }
        }
        var series = repo.series(client, exerciseId, tz, from);
        var e1 = series.stream().filter(p -> p.e1rm() != null).max(Comparator.comparing(PortalPlan.SeriesPoint::e1rm));
        var load = series.stream().filter(p -> p.loadValue() != null).max(Comparator.comparing(PortalPlan.SeriesPoint::loadValue));
        return new PortalPlan.ExerciseSeries(head, series, new PortalPlan.Bests(e1.map(this::best).orElse(null), load.map(this::best).orElse(null)));
    }

    private PortalPlan.BestSet best(PortalPlan.SeriesPoint p) {
        return new PortalPlan.BestSet(p.loadValue(), p.effortValue(), p.e1rm(), p.on());
    }

    private String zoneOf(String phone) {
        String z = PortalHomeService.text(portal.wall(phone).orElseThrow().path("my_details"), "timezone");
        return PortalHomeService.zone(z == null ? PortalHomeService.DEFAULT_ZONE : z).getId();
    }
}

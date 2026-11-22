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
 * <p>A day's {@code state} is the rule Home uses to choose the self-run day — done, booked to the trainer in the next fortnight (a week until 22 Nov 2026), else the first
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
        Integer weekNow = weekNow(pr, zone);
        var next = firstOpen(rows, weekNow);
        Integer nextWeek = next.map(PortalPlanJdbcRepository.DayRow::week).orElse(null);
        for (var d : rows) {
            String state;
            String sessionId = null;
            if (d.doneId() != null) { state = "done"; sessionId = d.doneId(); }
            else if (d.bookedId() != null) { state = "booked"; sessionId = d.bookedId(); }
            else if (next.isPresent() && next.get() == d) state = "next";
            else state = "todo";
            days.add(new PortalPlan.Day(d.workoutId(), d.week(), d.day(), d.name(), state, sessionId, d.at()));
        }
        int week = 1;
        if (weekNow != null) week = weekNow;
        else if (nextWeek != null) week = Math.max(1, Math.min(pr.weeks(), nextWeek));
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

    /** The program week today falls in (1-based, clamped to the program), or null when it has no start date. */
    static Integer weekNow(PortalPlanJdbcRepository.ProgramRow pr, ZoneId zone) {
        if (pr.startDate() == null) return null;
        long weeks = ChronoUnit.WEEKS.between(LocalDate.parse(pr.startDate()), LocalDate.now(zone));
        return (int) Math.max(1, Math.min(pr.weeks(), weeks + 1));
    }

    /**
     * The day a client does next on their own: the first place neither done nor booked, IN THE CURRENT WEEK OR LATER (22 Nov 2026).
     * It was the first open place anywhere, so one day missed in week 1 stayed "next" for the rest of the block — the plan labelled a
     * five-week-old Lower body *Up next* and Home offered it as today's workout. A missed day in a past week is left as it is (never
     * flagged; the portal does not shame). Without a start date there is no "current week", and the first open place stands.
     *
     * <p>And no further ahead than NEXT week (22 Nov 2026): with weeks 6 and 7 booked by the trainer, the first open place was week 8, so
     * on a Sunday Home offered week 8's Lower body the day before the trainer ran week 6's. When this week and next are covered there is
     * no self-run day — Home rests and shows the next booked session.
     */
    static java.util.Optional<PortalPlanJdbcRepository.DayRow> firstOpen(List<PortalPlanJdbcRepository.DayRow> rows, Integer weekNow) {
        return rows.stream()
                .filter(d -> d.doneId() == null && d.bookedId() == null)
                .filter(d -> weekNow == null || d.week() == null || (d.week() >= weekNow && d.week() <= weekNow + 1))
                .findFirst();
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
        // Every lift with two comparable points, biggest change first (22 Nov 2026) — `best` is still the top improver.
        var lifts = new ArrayList<PortalPlan.BestChange>();
        for (var r : rows) {
            BigDecimal f = r.from().e1rm(), t = r.to().e1rm();
            if (f == null || t == null || f.signum() == 0) continue;
            BigDecimal pct = t.subtract(f).multiply(BigDecimal.valueOf(100)).divide(f, 1, RoundingMode.HALF_UP);
            pct = pct.stripTrailingZeros().scale() < 0 ? pct.setScale(0) : pct.stripTrailingZeros();
            var change = new PortalPlan.BestChange(r.exerciseId(), r.name(), pct, r.from(), r.to());
            lifts.add(change);
            if (t.compareTo(f) <= 0) continue;
            improved++;
            if (best == null || pct.compareTo(best.changePct()) > 0) best = change;
        }
        lifts.sort((a, b) -> b.changePct().compareTo(a.changePct()));
        int[] c = repo.consistency(client, from, to);
        String tz = zoneOf(phone);
        ZoneId zone = ZoneId.of(tz);
        // The rate runs from the later of the window's start and the client's first session ever, never under a week (22 Nov 2026).
        Instant firstEver = repo.firstSession(client);
        boolean lateStart = firstEver != null && firstEver.isAfter(from);
        // Days counted inclusive of the first session's day; a client training before the window keeps the window's own length.
        long days = lateStart ? Math.max(7, java.time.Duration.between(firstEver, to).toDays() + 1) : windowDays;
        BigDecimal perWeek = BigDecimal.valueOf(c[0] + c[1]).multiply(BigDecimal.valueOf(7)).divide(BigDecimal.valueOf(days), 1, RoundingMode.HALF_UP).stripTrailingZeros();
        if (perWeek.scale() < 0) perWeek = perWeek.setScale(0);
        String since = lateStart ? firstEver.atZone(zone).toLocalDate().toString() : null;
        // The window week by week, empty weeks included, Monday to Monday in the client's zone.
        var byWeek = repo.weeks(client, from, to, tz);
        var weeks = new ArrayList<PortalPlan.Week>();
        LocalDate first = from.atZone(zone).toLocalDate().with(java.time.DayOfWeek.MONDAY);
        LocalDate last = to.atZone(zone).toLocalDate().with(java.time.DayOfWeek.MONDAY);
        for (LocalDate wk = first; !wk.isAfter(last); wk = wk.plusWeeks(1)) {
            Object[] v = byWeek.get(wk.toString());
            weeks.add(new PortalPlan.Week(wk.toString(), v == null ? 0 : (Integer) v[0], v == null ? BigDecimal.ZERO : (BigDecimal) v[1]));
        }
        return new PortalPlan.Progress(windowDays, new PortalPlan.Strength(rows.size(), improved, best),
                new PortalPlan.Consistency(c[0] + c[1], c[0], c[1], perWeek, since), repo.milestones(client, from), lifts, weeks);
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

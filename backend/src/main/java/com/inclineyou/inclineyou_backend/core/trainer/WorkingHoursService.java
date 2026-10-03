package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHourResponse;
import com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHoursPatch;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The trainer's working week, as a read — api-contract Today L2.
 *
 * <p>The day ribbon's ground is the working windows; the hole between two shifts
 * is the shape of a split-shift day; and a <i>sellable gap</i> is by definition
 * free time INSIDE a window — with no windows there is no gap. So Today cannot be
 * drawn without this, and the Schedule and the profile's Work &amp; hours tab read
 * the same shape.
 *
 * <p>Not folded into {@code TrainerService} because that one is JPA over the
 * {@code trainer} aggregate and this is a separate table with its own lifecycle.
 */
@Service
@RequiredArgsConstructor
public class WorkingHoursService {

    private final TrainerJdbcRepository repo;

    /**
     * Every window, in the order a week is read.
     *
     * <p>A split shift is TWO ROWS on one weekday and that is the point of the
     * table — one range per day would claim the trainer is free for lunch.
     *
     * <p>A trainer who has never answered the hours step gets an empty list rather
     * than a default week. Inventing 06:00–11:00 here would put a working window
     * on a ribbon for a trainer who never said so.
     */
    public List<WorkingHourResponse> list(UUID trainerId) {
        return repo.workingHours(trainerId);
    }

    private static final Pattern HH_MM = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");

    /**
     * {@code PATCH /v1/working-hours} — replace the listed weekdays, in one transaction: each listed
     * day's live rows are soft-deleted and its new windows inserted, an empty list making it a rest
     * day. Weekdays not listed are not touched, and sending the same body twice gives the same week.
     * Every rule is checked BEFORE the first write, so a refusal changes nothing.
     *
     * <p>Windows on one day may touch (06:00–11:00, 11:00–12:00) but not overlap — a split shift is
     * two rows, and an overlap would claim the trainer is in two places at once.
     */
    @Transactional
    public List<WorkingHourResponse> replace(UUID trainerId, WorkingHoursPatch body) {
        if (body == null || body.days() == null) throw ApiException.validation("days: required — list the weekdays you are changing");
        Set<Integer> seen = new HashSet<>();
        var plan = new ArrayList<Object[]>(); // [weekday, start, end]
        for (int i = 0; i < body.days().size(); i++) {
            var day = body.days().get(i);
            String at = "days[" + i + "]";
            if (day == null || day.weekday() == null) throw ApiException.validation(at + ".weekday: required");
            int weekday = day.weekday();
            if (weekday < 1 || weekday > 7) throw ApiException.validation(at + ".weekday: 1 (Monday) to 7 (Sunday)");
            if (!seen.add(weekday)) throw ApiException.validation(at + ".weekday: listed twice — send one entry per day");
            if (day.windows() == null) throw ApiException.validation(at + ".windows: required — send [] for a rest day");
            var windows = new ArrayList<String[]>();
            for (int w = 0; w < day.windows().size(); w++) {
                var win = day.windows().get(w);
                String wat = at + ".windows[" + w + "]";
                if (win == null || win.start() == null || !HH_MM.matcher(win.start()).matches()) {
                    throw ApiException.validation(wat + ".start: a time as HH:mm, like 06:00");
                }
                if (win.end() == null || !HH_MM.matcher(win.end()).matches()) {
                    throw ApiException.validation(wat + ".end: a time as HH:mm, like 11:00");
                }
                if (win.start().compareTo(win.end()) >= 0) {
                    throw ApiException.validation(wat + ": starts at " + win.start() + " but ends at " + win.end() + " — a window has to run forward");
                }
                windows.add(new String[] {win.start(), win.end()});
            }
            windows.sort(Comparator.comparing(a -> a[0]));
            for (int w = 1; w < windows.size(); w++) {
                if (windows.get(w)[0].compareTo(windows.get(w - 1)[1]) < 0) {
                    throw ApiException.validation(at + ".windows: " + windows.get(w - 1)[0] + "–" + windows.get(w - 1)[1]
                            + " and " + windows.get(w)[0] + "–" + windows.get(w)[1] + " overlap");
                }
            }
            for (String[] win : windows) plan.add(new Object[] {weekday, win[0], win[1]});
        }
        repo.softDeleteDays(trainerId, seen);
        for (Object[] p : plan) repo.insertWindow(trainerId, (Integer) p[0], (String) p[1], (String) p[2]);
        return repo.workingHours(trainerId);
    }
}

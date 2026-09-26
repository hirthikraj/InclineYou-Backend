package com.inclineyou.inclineyou_backend.session;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * WHERE A SOLD PACK BECOMES REAL TUESDAYS.
 *
 * <p>A pack is a COUNT — twelve sessions, sixty days to use them. A diary is a
 * list of INSTANTS. Nothing in this product turned the first into the second, so
 * a trainer who sold twelve sessions and agreed Mon/Wed/Fri at 7am with the
 * client in front of them opened the schedule and found it empty. The pack said
 * <i>12 of 12 left</i>; the diary said nothing was happening.
 *
 * <p>This class is the join, and it is <b>pure</b> — no JDBC, no clock of its
 * own, no Spring. {@link DiaryService} writes what it decides, and the web's
 * {@code lib/clients/booking.ts} runs the same arithmetic to SHOW a trainer the
 * twelve dates before they take the money. Two implementations of one
 * arrangement is how a trainer ends up promising a Friday that was never booked,
 * so the rules live in one place on each side of the wire and are stated here.
 *
 * <h2>The weekday convention, and why it is 1 = Monday here</h2>
 *
 * <p>This codebase has <b>two</b> weekday conventions and both are load-bearing:
 *
 * <ul>
 *   <li>{@code working_hours.weekday} is <b>0 = Monday … 6 = Sunday</b>
 *       ({@code WorkingHoursService} says so on the parameter);</li>
 *   <li>{@code client.weekly_schedule}, {@code program.schedule},
 *       {@code program.day_labels} and {@code program_exercise.day_of_week} are
 *       <b>1 = Monday … 7 = Sunday</b> — {@code TemplateService.validateSchedule}
 *       enforces it, V2's backfill assumes it, and the phone's
 *       {@code app/src/clients/schedule.ts} states it as the canonical shape of a
 *       stored slot.</li>
 * </ul>
 *
 * <p>A standing slot is the second kind, so this class is 1-indexed throughout
 * and never touches working hours. Anything reading both has to translate, and
 * the one place that does — the add-a-client slot picker — now says so.
 */
@Slf4j
public final class SessionPlanner {

    private SessionPlanner() {}

    private static final ObjectMapper STORE = new ObjectMapper();

    private static final Pattern HHMM = Pattern.compile("^(\\d{1,2}):(\\d{2})$");

    /** A counted pack never lays down more than this, whatever the arithmetic says. */
    private static final int MAX_WEEKS = 52;

    /** How far ahead a client with a rhythm but no pack is booked. */
    public static final int OPEN_ENDED_WEEKS = 4;

    /** The hour a slot falls back to when its time is unreadable. See {@link #minutesOf}. */
    private static final int DEFAULT_MINUTE = 6 * 60;

    /**
     * One standing slot.
     *
     * @param templateDay the ordinal program day — "Day 1" is the first day this
     *                    plan trains, never Monday
     * @param weekday     1 = Monday … 7 = Sunday
     * @param time        {@code HH:mm}, 24-hour, local to the trainer
     */
    public record Slot(int templateDay, int weekday, String time) {}

    /** One session the arrangement owes, before anything has been written down. */
    public record Planned(long at, int templateDay, int weekday) {}

    /**
     * {@code 07:30} → 450. An unreadable time reads as 6am rather than throwing.
     *
     * <p>The slot came off a form and a sale that is refused because one stored
     * time is malformed is a worse answer than a session booked at the hour most
     * floor work starts. The pickers cannot produce one — they emit {@code HH:mm}
     * — so this is the guard for hand-written and legacy rows.
     */
    public static int minutesOf(String time) {
        var m = time == null ? null : HHMM.matcher(time);
        if (m == null || !m.matches()) return DEFAULT_MINUTE;
        int minute = Integer.parseInt(m.group(1)) * 60 + Integer.parseInt(m.group(2));
        return minute >= 0 && minute < 24 * 60 ? minute : DEFAULT_MINUTE;
    }

    /**
     * Read {@code client.weekly_schedule} into slots.
     *
     * <p>Tolerant on purpose — this sits on a boundary and the column is
     * unvalidated jsonb written by three clients over two years. It drops a slot
     * with no usable weekday, keeps <b>one slot per weekday</b> (two sessions on
     * one morning is what {@code validateSchedule} already refuses on the other
     * route), and fills a missing {@code templateDay} from the slot's position —
     * which is what an ordinal day IS when nobody has said otherwise: the first
     * day this client trains is Day 1. The phone's {@code parseWeeklySchedule}
     * makes exactly the same three decisions, including renumbering after the
     * sort, and the two must not drift.
     *
     * <p>{@code day} is accepted as a 0-based alias for the same reason the phone
     * accepts it: rows written by an older web build carry it.
     */
    public static List<Slot> parseSlots(Object raw) {
        List<Map<String, Object>> rows = readRows(raw);
        if (rows.isEmpty()) return List.of();

        var seen = new HashSet<Integer>();
        var out = new ArrayList<Slot>();
        for (var row : rows) {
            Integer weekday = readWeekday(row);
            if (weekday == null || !seen.add(weekday)) continue;
            Object day = row.get("templateDay");
            int templateDay = day instanceof Number n && n.intValue() > 0 ? n.intValue() : 0;
            Object time = row.get("time");
            out.add(new Slot(templateDay, weekday, time instanceof String s ? s : "06:00"));
        }
        out.sort((a, b) -> a.weekday() != b.weekday()
                ? Integer.compare(a.weekday(), b.weekday())
                : Integer.compare(minutesOf(a.time()), minutesOf(b.time())));

        // Numbered AFTER the sort, so Day 1 is the first day of the client's week
        // and not whichever chip they happened to press first.
        var numbered = new ArrayList<Slot>(out.size());
        for (int i = 0; i < out.size(); i++) {
            Slot s = out.get(i);
            numbered.add(s.templateDay() > 0 ? s : new Slot(i + 1, s.weekday(), s.time()));
        }
        return List.copyOf(numbered);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> readRows(Object raw) {
        if (raw == null) return List.of();
        try {
            if (raw instanceof List<?> list) return (List<Map<String, Object>>) list;
            String json = raw.toString();
            if (json.isBlank()) return List.of();
            return STORE.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            log.warn("Unreadable client weekly_schedule: {}", e.getMessage());
            return List.of();
        }
    }

    /** 1..7, or null. {@code day} is the 0-based alias the phone also accepts. */
    private static Integer readWeekday(Map<String, Object> row) {
        if (row.get("weekday") instanceof Number n) {
            int wd = n.intValue();
            return wd >= 1 && wd <= 7 ? wd : null;
        }
        if (row.get("day") instanceof Number n) {
            int wd = n.intValue() + 1;
            return wd >= 1 && wd <= 7 ? wd : null;
        }
        return null;
    }

    /**
     * THE LAYOUT. Twelve sessions on a Mon/Wed/Fri week from the 15th → twelve
     * dates.
     *
     * <p>Walks forward a week at a time from the Monday of {@code from}, taking
     * each slot in weekday order, skipping anything that falls before
     * {@code from} — a pack sold at 11am on a Wednesday does not book that
     * morning's 7am — and stopping at whichever comes first: the session count,
     * the pack's expiry, or the ceiling.
     *
     * <h2>Why it stops at the expiry and does not shuffle</h2>
     *
     * <p>A twelve-session pack on two days a week needs six weeks, and a
     * sixty-day validity gives it eight. When the window is too SHORT the honest
     * output is a short list: the trainer is told "10 of 12 fit before this pack
     * expires" while the terms are still editable, and has the conversation now —
     * sell a longer validity, add a third day, or expect to extend it — rather
     * than discovering it in week seven. Silently squeezing the extra two in
     * somewhere would invent an arrangement nobody agreed to.
     *
     * @param slots the standing week; an empty week books nothing
     * @param from  nothing lands before this — the later of now and the start date
     * @param count how many the pack owes, or null for an uncounted pack (monthly)
     * @param until the pack's last usable instant, or null for no expiry
     * @param zone  the trainer's zone. Built through {@link ZonedDateTime} rather
     *              than by adding milliseconds because the arithmetic version is
     *              wrong by an hour twice a year anywhere that keeps daylight
     *              saving — and "wrong by an hour" here means a client at a locked
     *              gym. India does not observe it and every other market this
     *              reaches might.
     */
    public static List<Planned> layout(List<Slot> slots,
                                       ZonedDateTime from,
                                       Integer count,
                                       ZonedDateTime until,
                                       ZoneId zone) {
        if (slots.isEmpty()) return List.of();
        if (count != null && count <= 0) return List.of();

        int weeks = count == null
                ? OPEN_ENDED_WEEKS
                : Math.min(MAX_WEEKS, (int) Math.ceil((double) count / slots.size()) + 1);

        /* The Monday of the week `from` falls in. Week 0 then contains `from`
           itself, and the `isBefore` skip below drops the slots already behind
           it — which is what makes a pack sold mid-week start on its next slot
           rather than next Monday. */
        LocalDate monday = from.toLocalDate().with(DayOfWeek.MONDAY);

        var out = new ArrayList<Planned>();
        for (int w = 0; w < weeks; w++) {
            for (Slot slot : slots) {
                if (count != null && out.size() >= count) return List.copyOf(out);
                LocalDate day = monday.plusDays((long) w * 7 + slot.weekday() - 1);
                ZonedDateTime at = day
                        .atTime(LocalTime.MIDNIGHT)
                        .atZone(zone)
                        .plusMinutes(minutesOf(slot.time()));
                if (at.isBefore(from)) continue;
                if (until != null && at.isAfter(until)) return List.copyOf(out);
                out.add(new Planned(at.toInstant().toEpochMilli(), slot.templateDay(), slot.weekday()));
            }
        }
        return List.copyOf(out);
    }
}

package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.PutScheduleRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.ScheduleSaved;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * {@code PUT /v1/clients/{id}/schedule} (api-contract Clients A8) and the one
 * booking rule every Clients verb shares (R21): the weekly slots book sessions
 * through a rolling 28 days.
 *
 * <p><b>How a slot knows what it has booked.</b> Each slot books forward from the
 * latest session it ever made, in any status, deleted included. So re-sending
 * the same week books nothing, and a cancelled, taken-back or paused session
 * never comes back on its own. The contract's per-(slot, date) wording could not
 * keep that promise for a session moved by hand: a move clears {@code slot_id},
 * so its date would look empty and be booked twice.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientScheduleService {

    private final ClientScheduleJdbcRepository repo;
    private final WorkspaceClock clock;
    private final ClientSummaryService summaries;

    static final int WINDOW_DAYS = 28;

    @Transactional
    public ScheduleSaved put(UUID trainerId, UUID clientId, String ifMatch, PutScheduleRequest req) {
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new ApiException(HttpStatus.PRECONDITION_REQUIRED, "PRECONDITION_REQUIRED",
                    "Send If-Match with the schedule's version.");
        }
        var seen = new HashSet<String>();
        for (var s : req.slots()) {
            if (!seen.add(s.weekday() + "@" + s.start())) throw ApiException.validation("slots: the same weekday and start twice");
        }

        var client = lockClient(trainerId, clientId);
        if (client.archived()) throw archived();
        if (ClientWriteService.stale(ifMatch, client.scheduleVersion())) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED",
                    "This week was changed in another tab since it loaded.");
        }
        if (client.programDays() != null) {
            int days = client.programDays();
            for (var s : req.slots()) {
                if (s.programDay() != null && s.programDay() > days) {
                    throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PROGRAM_DAY_OUT_OF_RANGE",
                            "Their program has " + days + " days a week; programDay " + s.programDay() + " is past that.");
                }
            }
        }

        // The whole resource: PUT replaces, so an absent field is a cleared one.
        repo.replaceDefaults(clientId, req);

        // Diff the slot set on (weekday, start), the live key: kept slots keep their id.
        var liveByKey = new HashMap<String, ClientScheduleJdbcRepository.LiveSlot>();
        for (var l : repo.liveSlots(clientId)) liveByKey.put(l.weekday() + "@" + l.start(), l);
        var changed = new ArrayList<String>();
        for (var s : req.slots()) {
            var existing = liveByKey.remove(s.weekday() + "@" + s.start());
            if (existing == null) {
                repo.insertSlot(clientId, s);
            } else if (!Objects.equals(existing.programDay(), s.programDay())
                    || !Objects.equals(existing.durationMinutes(), s.durationMinutes())
                    || !Objects.equals(existing.deliveryMode(), s.deliveryMode())) {
                repo.updateSlot(existing.id(), s);
                changed.add(existing.id());
            }
        }
        var removed = liveByKey.values().stream().map(ClientScheduleJdbcRepository.LiveSlot::id).toList();

        int cancelled = 0;
        if (!removed.isEmpty()) {
            repo.deleteSlots(removed);
            cancelled = repo.cancelSessionsOfSlots(removed);
        }
        var relink = new ArrayList<String>();
        if (!changed.isEmpty()) relink.addAll(repo.moveSessionsOfSlots(changed));

        ZoneId zone = clock.zone();
        LocalDate tomorrow = WorkspaceClock.today(zone).plusDays(1);
        int booked = 0;
        if (client.bookable()) {
            var made = book(trainerId, clientId, req.bookFrom() == null ? tomorrow : req.bookFrom(), zone);
            booked = made.size();
            relink.addAll(made);
        }
        linkWorkouts(clientId, relink, zone);

        // A prospect who is given a real weekly plan has, by that act, become an
        // active client — nobody is asked to say so a second time on a separate
        // screen. An empty slot list (a delivery-mode-only save) does not count:
        // that is not yet a plan.
        boolean activated = "prospect".equals(client.status()) && !req.slots().isEmpty();
        if (activated) repo.activateProspect(clientId);

        log.info("schedule saved trainer={} client={} slots={} booked={} cancelled={} activated={}",
                trainerId, clientId, req.slots().size(), booked, cancelled, activated);

        var summary = summaries.one(trainerId, clientId).orElseThrow();
        return new ScheduleSaved(summary.schedule(), summary.slots(), booked, cancelled,
                repo.clashes(trainerId, clientId));
    }

    /**
     * Book the client's slots from {@code from} through today + 28 (see the class
     * note). Returns the ids it made; the caller links workouts.
     */
    public List<String> book(UUID trainerId, UUID clientId, LocalDate from, ZoneId zone) {
        return repo.book(trainerId, clientId, from, WorkspaceClock.today(zone).plusDays(WINDOW_DAYS), zone);
    }

    /** Point sessions at the active program's workouts — see {@link ClientScheduleJdbcRepository#linkWorkouts}. */
    public int linkWorkouts(UUID clientId, List<String> ids, ZoneId zone) {
        return ids.isEmpty() ? 0 : repo.linkWorkouts(clientId, ids, zone);
    }

    /** Un-started future sessions of this client, for a relink after a new plan. */
    public List<String> futureOpen(UUID clientId) {
        return repo.futureOpen(clientId);
    }

    /** The client locked, with what every Clients verb decides on. 404 when not this trainer's. */
    ClientScheduleJdbcRepository.LockedClient lockClient(UUID trainerId, UUID clientId) {
        return repo.lock(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
    }

    static ApiException archived() {
        return ApiException.conflict("CLIENT_ARCHIVED", "This client is archived. Unarchive them first.");
    }
}

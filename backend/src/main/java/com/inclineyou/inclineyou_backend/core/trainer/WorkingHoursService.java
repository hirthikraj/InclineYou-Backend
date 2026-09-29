package com.inclineyou.inclineyou_backend.core.trainer;

import lombok.RequiredArgsConstructor;
import com.inclineyou.inclineyou_backend.core.trainer.dto.WorkingHourResponse;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

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
}

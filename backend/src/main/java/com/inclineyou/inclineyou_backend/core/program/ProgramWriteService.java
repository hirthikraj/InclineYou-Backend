package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.program.dto.ProgramMade;
import com.inclineyou.inclineyou_backend.core.client.ClientScheduleService;
import com.inclineyou.inclineyou_backend.core.program.ProgramJdbcRepository.Locked;
import com.inclineyou.inclineyou_backend.core.program.PlanRules.W;
import com.inclineyou.inclineyou_backend.core.program.dto.PatchProgramRequest;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramRequest;
import com.inclineyou.inclineyou_backend.core.program.dto.Resynced;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Every Programs write except apply (api-contract 1.1, Programs A1–A6): create,
 * copy, the whole-tree save, a plan's status, retiring a template, and resync.
 *
 * <p>A program's version is its {@code revised_at}, and it moves on exactly the
 * writes that change what a copy would inherit or what a builder was looking at:
 * a tree save, a rename, a resync. It does <i>not</i> move on a status change —
 * pausing a plan from the switcher must not make the builder open in another tab
 * answer 412 to its next autosave.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProgramWriteService {

    private final ProgramJdbcRepository repo;
    private final PlanTreeJdbcRepository trees;
    private final ProgramReadService read;
    private final ClientScheduleService schedules;
    private final WorkspaceClock clock;

    /** {@code POST /v1/programs} — a template from scratch, or a copy of any program when the body has {@code copyFrom}. */
    @Transactional
    public ProgramMade create(UUID trainerId, ProgramRequest body) {
        try {
            return body.copyFrom() != null ? copy(trainerId, body) : scratch(trainerId, body);
        } catch (DuplicateKeyException e) {
            throw ApiException.idConflict();
        }
    }

    private ProgramMade scratch(UUID trainerId, ProgramRequest body) {
        UUID id = body.id() == null ? UUID.randomUUID() : body.id();
        requireName(body);
        int weeks = body.weeks() == null ? 1 : body.weeks();
        int days = body.days() == null ? 1 : body.days();
        List<W> planned = PlanRules.tree(body.workouts(), weeks, days);
        ProgramMade replay = replay(trainerId, id);
        if (replay != null) return replay;
        requireExercises(trainerId, planned);
        repo.insertTemplate(id, trainerId, body.name(), body.goal(), body.description(), weeks, days);
        trees.save(id, trainerId, planned);
        log.info("program created trainer={} program={} workouts={}", trainerId, id, planned.size());
        return new ProgramMade(read.get(trainerId, id), true);
    }

    private ProgramMade copy(UUID trainerId, ProgramRequest body) {
        if (body.workouts() != null || body.weeks() != null || body.days() != null || body.goal() != null
                || body.description() != null) {
            throw ApiException.validation("copyFrom: send it with an id and a name only, not with program content");
        }
        UUID src = body.copyFrom();
        UUID id = body.id() == null ? UUID.randomUUID() : body.id();
        var source = repo.copySource(trainerId, src).orElseThrow(() -> ApiException.notFound("That program is not yours."));
        ProgramMade replay = replay(trainerId, id);
        if (replay != null) return replay;
        String name = body.name() != null && !body.name().isBlank() ? body.name()
                : (source.name().length() > 143 ? source.name().substring(0, 143) : source.name()) + " (copy)";
        // A copy of a template or of the library remembers where it came from; a copy of a client's
        // plan is a fresh template that belongs to nothing ("Save as template").
        repo.insertCopy(id, trainerId, src, name, source.clientId() == null);
        trees.copy(src, id, trainerId);
        if ("inclineyou".equals(source.origin())) repo.countUse(src);
        log.info("program copied trainer={} from={} to={}", trainerId, src, id);
        return new ProgramMade(read.get(trainerId, id), true);
    }

    /** A retried create: what the first try made. Somebody else's id is a conflict, not a read. */
    private ProgramMade replay(UUID trainerId, UUID id) {
        var mine = repo.templateOwnership(trainerId, id);
        if (mine.isEmpty()) return null;
        if (!mine.get()) throw ApiException.idConflict();
        return new ProgramMade(read.get(trainerId, id), false);
    }

    /** {@code PUT /v1/programs/{id}} — the whole tree, conditional on the version the builder loaded. */
    @Transactional
    public ProgramItem put(UUID trainerId, UUID id, String ifMatch, ProgramRequest body) {
        IfMatch.require(ifMatch, "the program");
        Locked row = lock(trainerId, id);
        if (IfMatch.stale(ifMatch, row.version())) throw revised();
        if (body.id() != null && !id.equals(body.id())) throw ApiException.validation("id: does not match the address");
        if (body.copyFrom() != null) throw ApiException.validation("copyFrom: only on POST");
        requireName(body);
        if (body.workouts() == null) throw ApiException.validation("workouts: required (an empty list clears the plan)");
        if (body.weeks() == null || body.days() == null) throw ApiException.validation("weeks and days: required");
        List<W> planned = PlanRules.tree(body.workouts(), body.weeks(), body.days());
        requireExercises(trainerId, planned);
        try {
            Set<UUID> removed = trees.save(id, trainerId, planned);
            repo.updateShape(id, body.name(), body.goal(), body.description(), body.weeks(), body.days());
            relink(row, removed);
        } catch (DuplicateKeyException e) {
            throw ApiException.idConflict();
        }
        log.info("program saved trainer={} program={} workouts={}", trainerId, id, planned.size());
        return read.get(trainerId, id);
    }

    /** {@code PATCH /v1/programs/{id}} — a plan's status, or a name / goal / dates without a tree. */
    @Transactional
    public ProgramItem patch(UUID trainerId, UUID id, String ifMatch, PatchProgramRequest req) {
        if (req.isEmpty()) throw ApiException.validation("body: nothing to change");
        Locked row = lock(trainerId, id);
        IfMatch.check(ifMatch, row.version(), "This program changed since it was loaded.");
        if (row.clientId() == null && (req.status() != null || req.startDate() != null || req.endDate() != null)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PROGRAM_IS_TEMPLATE",
                    "A template has no status or dates. Only a client's plan does.");
        }
        boolean datesTouched = req.startDate() != null || req.endDate() != null;
        LocalDate start = null;
        LocalDate end = null;
        if (datesTouched) {
            LocalDate[] current = repo.dates(id).orElseThrow();
            start = req.startDate() != null ? req.startDate().value() : current[0];
            end = req.endDate() != null ? req.endDate().value() : current[1];
            if (start != null && end != null && end.isBefore(start)) throw ApiException.validation("endDate: before startDate");
        }
        repo.patchFields(id, req, datesTouched, start, end);
        if (req.status() != null && !req.status().value().equals(row.status())) {
            if ("active".equals(req.status().value())) repo.completeOthers(row.clientId(), id);
            repo.setStatus(id, req.status().value());
        }
        return read.summary(trainerId, id);
    }

    /** {@code DELETE /v1/programs/{id}} — retire a template. Again is 204 again. */
    @Transactional
    public void delete(UUID trainerId, UUID id) {
        var target = repo.retireTarget(trainerId, id).orElseThrow(() -> ApiException.notFound("That program is not yours."));
        if (target.clientPlan()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PROGRAM_IS_CLIENT_PLAN",
                    "A client's plan is ended, not deleted. Pause it or mark it completed.");
        }
        if (target.alreadyGone()) return;
        repo.retire(id);
        log.info("template retired trainer={} program={}", trainerId, id);
    }

    /**
     * {@code POST /v1/programs/{id}/resync} — take the source's latest tree into this client plan.
     *
     * <p>The plan's own edits are overwritten, which is why the banner says so and
     * why {@code If-Match} is required: it proves these are the edits the trainer
     * was warned about.
     */
    @Transactional
    public Resynced resync(UUID trainerId, UUID id, String ifMatch) {
        IfMatch.require(ifMatch, "the plan");
        Locked row = lock(trainerId, id);
        if (row.clientId() == null || row.copiedFrom() == null) {
            throw ApiException.conflict("PROGRAM_NOT_A_COPY", "This program was not copied from a template.");
        }
        if (IfMatch.stale(ifMatch, row.version())) throw revised();
        int[] shape = repo.resyncSource(trainerId, row.copiedFrom()).orElseThrow(() ->
                ApiException.conflict("SOURCE_DELETED", "The template this plan was copied from has been deleted."));
        int before = trees.mainExercises(id);
        List<UUID> gone = trees.resync(id, UUID.fromString(row.copiedFrom()), trainerId);
        trees.markSynced(id, shape[0], shape[1]);
        relink(row, gone);
        int after = trees.mainExercises(id);
        log.info("program resynced trainer={} plan={} source={} removed={} added={}", trainerId, id, row.copiedFrom(), before, after);
        return new Resynced(id.toString(), row.copiedFrom(), before, after, repo.version(id));
    }

    private Locked lock(UUID trainerId, UUID id) {
        return repo.lock(trainerId, id).orElseThrow(() -> ApiException.notFound("That program is not yours."));
    }

    /**
     * Future, un-started sessions that were booked against workouts this write removed get the next
     * workout in their slot's place (R45). Only for the client's active plan, which is the one the
     * booking logic links to; past and started sessions keep pointing at the removed workout, so a
     * finished log still reads the same.
     */
    private void relink(Locked row, Collection<UUID> removed) {
        if (row.clientId() == null || removed.isEmpty() || !"active".equals(row.status())) return;
        List<String> ids = repo.futureSessionsOn(row.clientId(), removed);
        if (!ids.isEmpty()) schedules.linkWorkouts(UUID.fromString(row.clientId()), ids, clock.zone());
    }

    private void requireExercises(UUID trainerId, List<W> planned) {
        Set<UUID> wanted = PlanRules.exerciseIds(planned);
        if (wanted.isEmpty()) return;
        Set<UUID> found = repo.knownExercises(trainerId, wanted);
        for (UUID id : wanted) {
            if (!found.contains(id)) throw ApiException.validation("exerciseId: " + id + " is not in the exercise library");
        }
    }

    private static void requireName(ProgramRequest body) {
        if (body.name() == null || body.name().isBlank()) throw ApiException.validation("name: required");
    }

    private static ApiException revised() {
        return new ApiException(HttpStatus.PRECONDITION_FAILED, "PROGRAM_REVISED",
                "This program changed since you opened it. Reload it and make the change again.");
    }
}

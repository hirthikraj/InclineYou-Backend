package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.program.ProgramJdbcRepository.AssignedRow;
import com.inclineyou.inclineyou_backend.core.program.ProgramJdbcRepository.LibraryCopy;
import com.inclineyou.inclineyou_backend.core.program.dto.Assignment;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem.ClientRef;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem.Mine;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem.Progress;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;

/**
 * Every Programs read (api-contract 1.1, Programs L1–L3): the shelf and plan
 * summaries, one program with its whole tree, the InclineYou library, and who is
 * on a template.
 *
 * <p>A page of summaries is joined to its assignments, its library copies or its
 * progress in one grouped query each, never one per program — so the counts and
 * the client sample cost a page, not the book.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProgramReadService {

    private static final Set<String> STATUSES = Set.of("active", "paused", "completed");
    /** Faces on a template's card: a sample, never a count — {@code activeAssignedCount} is the total. */
    private static final int ASSIGNED_SAMPLE = 6;

    private final ProgramJdbcRepository repo;
    private final WorkspaceClock clock;

    /**
     * {@code GET /v1/programs} — the trainer's templates and client plans, no tree.
     *
     * <p>Plans come back {@code active,paused} unless the caller names a status
     * or a client (a client's file wants every plan it ever had, newest first).
     * With a {@code clientId} each item also carries {@code progress}, which is
     * how the client file's Program tab and the plan switcher share one route.
     */
    public List<ProgramItem> list(UUID trainerId, String kind, UUID clientId, String status) {
        if (kind != null && !Set.of("client", "template").contains(kind)) {
            throw ApiException.validation("kind: client or template");
        }
        if (clientId != null && !repo.clientOnRoster(trainerId, clientId)) {
            throw ApiException.notFound("That client is not on your roster.");
        }
        String[] statuses = status == null || status.isBlank()
                ? (clientId != null ? null : new String[]{"active", "paused"})
                : status.split("\\s*,\\s*");
        if (statuses != null) {
            for (String s : statuses) {
                if (!STATUSES.contains(s)) throw ApiException.validation("status: active, paused or completed");
            }
        }
        List<ProgramItem> items = withAssignments(repo.shelf(trainerId, kind, clientId, statuses), trainerId);
        return clientId == null ? items : withProgress(items);
    }

    /** {@code GET /v1/programs/{id}} — the trainer's own program with its whole tree. 404 for a library id. */
    public ProgramItem get(UUID trainerId, UUID id) {
        ProgramItem item = summary(trainerId, id);
        var tree = repo.tree(id);
        return item.withTree(tree.workouts(), tree.dictionary());
    }

    /** The same program without its tree — a PATCH's answer. */
    public ProgramItem summary(UUID trainerId, UUID id) {
        ProgramItem item = repo.mine(trainerId, id).orElseThrow(() -> ApiException.notFound("That program is not yours."));
        return withAssignments(List.of(item), trainerId).getFirst();
    }

    /** {@code GET /v1/programs/certified} — the curated shelf, no trees, each flagged with the trainer's copy. */
    public List<ProgramItem> certified(UUID trainerId) {
        return withMine(repo.library(), trainerId);
    }

    public ProgramItem certifiedOne(UUID trainerId, UUID id) {
        ProgramItem item = repo.libraryOne(id).orElseThrow(() -> ApiException.notFound("That program is not in the library."));
        var tree = repo.tree(id);
        return withMine(List.of(item), trainerId).getFirst().withTree(tree.workouts(), tree.dictionary());
    }

    /** {@code GET /v1/programs/{id}/assignments} — the clients on a copy of this template. */
    public List<Assignment> assignments(UUID trainerId, UUID templateId) {
        if (!repo.templateIsMine(trainerId, templateId)) throw ApiException.notFound("That template is not yours.");
        return repo.assignments(trainerId, templateId);
    }

    /** Templates learn who is on them: every copy counts, the active ones are sampled. */
    private List<ProgramItem> withAssignments(List<ProgramItem> items, UUID trainerId) {
        String[] ids = items.stream().filter(i -> i.clientId() == null).map(ProgramItem::id).toArray(String[]::new);
        if (ids.length == 0) return items;
        var total = new HashMap<String, Integer>();
        var active = new HashMap<String, Integer>();
        var sample = new HashMap<String, List<ClientRef>>();
        for (AssignedRow row : repo.assignedTo(trainerId, ids)) {
            total.merge(row.source(), 1, Integer::sum);
            if ("active".equals(row.status())) {
                active.merge(row.source(), 1, Integer::sum);
                var faces = sample.computeIfAbsent(row.source(), k -> new ArrayList<>());
                if (faces.size() < ASSIGNED_SAMPLE) faces.add(new ClientRef(row.clientId(), row.clientName()));
            }
        }
        return items.stream().map(i -> total.containsKey(i.id())
                ? i.withAssigned(total.get(i.id()), active.getOrDefault(i.id(), 0), sample.getOrDefault(i.id(), List.of()))
                : i).toList();
    }

    /** Library items learn whether this trainer already copied them, and whether the original has moved on. */
    private List<ProgramItem> withMine(List<ProgramItem> items, UUID trainerId) {
        if (items.isEmpty()) return items;
        var copies = new HashMap<String, LibraryCopy>();
        repo.copiesOf(trainerId, items.stream().map(ProgramItem::id).toArray(String[]::new))
                .forEach(c -> copies.put(c.source(), c));
        return items.stream().map(i -> {
            LibraryCopy c = copies.get(i.id());
            return c == null ? i : i.withMine(new Mine(c.id(), c.copiedAt(), i.revisedAt() > c.syncedAt()));
        }).toList();
    }

    /** Sessions done on each plan and where today falls — the client file's progress, grouped once. */
    private List<ProgramItem> withProgress(List<ProgramItem> items) {
        if (items.isEmpty()) return items;
        var done = repo.doneSessions(items.stream().map(ProgramItem::id).toArray(String[]::new));
        LocalDate today = WorkspaceClock.today(clock.zone());
        return items.stream().map(i -> {
            Integer week = i.startDate() == null ? null : (int) Math.min(i.weeks(), Math.max(1,
                    (today.toEpochDay() - LocalDate.parse(i.startDate()).toEpochDay()) / 7 + 1));
            return i.withProgress(new Progress(done.getOrDefault(i.id(), 0), i.workoutCount(), week));
        }).toList();
    }
}

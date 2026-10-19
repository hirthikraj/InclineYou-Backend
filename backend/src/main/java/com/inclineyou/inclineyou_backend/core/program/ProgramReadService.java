package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.program.ProgramJdbcRepository.LibraryCopy;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem;
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
 * summaries, one program with its whole tree, and the InclineYou library. Who is
 * on a template's copies is not a read any more (18 Oct 2026): each client's plan
 * is listed on its own.
 *
 * <p>A page of summaries is joined to its library copies or its progress in one
 * grouped query each, never one per program — so the counts cost a page, not the
 * book. A template's use count rides the summary row itself.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProgramReadService {

    private static final Set<String> KINDS = Set.of("client", "template");
    private static final Set<String> STATUSES = Set.of("active", "paused", "completed");
    private static final String[] ALL_STATUSES = {"active", "paused", "completed"};
    /** What "my plans" means when no status is named: not the ones that are over. */
    private static final String[] IN_PROGRESS = {"active", "paused"};

    private final ProgramJdbcRepository repo;
    private final WorkspaceClock clock;

    /**
     * {@code GET /v1/programs} — the trainer's templates and client plans, no tree.
     *
     * <p>Which read answers is decided by what the caller named, and each is its own query
     * ({@link ProgramJdbcRepository#templates}, {@link ProgramJdbcRepository#plansOf}, {@link ProgramJdbcRepository#plans},
     * {@link ProgramJdbcRepository#shelf}):
     * <ul>
     *   <li>{@code kind=template} — the templates. A template has no client and no status, so naming either is a 400 rather than
     *       an empty list or a filter that quietly does nothing.</li>
     *   <li>a {@code clientId} — that client's plans, every status unless one is named (the client file wants all it ever had,
     *       newest first), each with {@code progress}: how the file's Program tab and the plan switcher share one route.</li>
     *   <li>{@code kind=client}, or any {@code status} — plans only, {@code active,paused} unless a status is named. A status
     *       names a plan's state, so it never brings templates along.</li>
     *   <li>nothing — the default shelf: templates plus the plans in progress.</li>
     * </ul>
     */
    public List<ProgramItem> list(UUID trainerId, String kind, UUID clientId, String status) {
        if (kind != null && !KINDS.contains(kind)) {
            throw ApiException.validation("kind: client or template");
        }
        String[] named = statuses(status);
        boolean templates = "template".equals(kind);
        if (templates && clientId != null) throw ApiException.validation("clientId: a template has no client");
        if (templates && named != null) throw ApiException.validation("status: a template has no status");
        if (clientId != null && !repo.clientOnRoster(trainerId, clientId)) {
            throw ApiException.notFound("That client is not on your roster.");
        }
        List<ProgramItem> rows;
        if (templates) rows = repo.templates(trainerId);
        else if (clientId != null) rows = repo.plansOf(trainerId, clientId, named != null ? named : ALL_STATUSES);
        else if (named != null || "client".equals(kind)) rows = repo.plans(trainerId, named != null ? named : IN_PROGRESS);
        else rows = repo.shelf(trainerId);
        return clientId == null ? rows : withProgress(rows);
    }

    /** The statuses the caller named, validated; {@code null} when it named none. */
    private static String[] statuses(String status) {
        if (status == null || status.isBlank()) return null;
        String[] named = status.split("\\s*,\\s*");
        for (String s : named) {
            if (!STATUSES.contains(s)) throw ApiException.validation("status: active, paused or completed");
        }
        return named;
    }

    /** {@code GET /v1/programs/{id}} — the trainer's own program with its whole tree. 404 for a library id. */
    public ProgramItem get(UUID trainerId, UUID id) {
        ProgramItem item = summary(trainerId, id);
        var tree = repo.tree(id);
        return item.withTree(tree.workouts(), tree.dictionary());
    }

    /** The same program without its tree — a PATCH's answer. */
    public ProgramItem summary(UUID trainerId, UUID id) {
        return repo.mine(trainerId, id).orElseThrow(() -> ApiException.notFound("That program is not yours."));
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
            Integer week = i.startDate() == null ? null : (int) Math.clamp(
                    (today.toEpochDay() - LocalDate.parse(i.startDate()).toEpochDay()) / 7 + 1, 1, i.weeks());
            return i.withProgress(new Progress(done.getOrDefault(i.id(), 0), i.workoutCount(), week));
        }).toList();
    }
}

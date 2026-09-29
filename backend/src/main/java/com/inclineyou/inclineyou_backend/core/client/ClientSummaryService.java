package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ClientSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * {@code GET /v1/clients[?view=summary]} — api-contract Today L3, reused by Clients.
 * Since 1.1 this is the default shape of {@code GET /v1/clients}; the pre-v1 one
 * is {@code view=legacy} until the screens still reading it move over.
 *
 * <p>Every client with their schedule, recurring slots, the one active program and
 * four session aggregates, in three queries whatever the roster size. It replaces
 * the old screen's {@code GET /v1/programs} and, more importantly, the unbounded
 * {@code GET /v1/workouts}: <i>gone quiet</i> and <i>100th session</i> need only
 * the last delivered session and the count, so the server sends those two numbers
 * rather than the whole history.
 */
@Service
@RequiredArgsConstructor
public class ClientSummaryService {

    private final ClientJdbcRepository repo;

    /** Archived is left out unless asked for — Today has no use for them, Clients counts them. */
    private static final List<String> DEFAULT_STATUSES = List.of("active", "paused", "inactive");
    private static final Set<String> STATUSES = Set.of("active", "paused", "inactive", "archived");

    /**
     * @param status comma list of client statuses, or {@code all}. Unknown names
     *               are ignored; a list of only unknown names falls back to the
     *               default rather than answering an empty roster for a typo.
     */
    public List<ClientSummary> list(UUID trainerId, String status) {
        return repo.summaries(trainerId, statuses(status), null);
    }

    /** One client in the L3 shape, whatever their status — what every Clients write answers with. */
    public Optional<ClientSummary> one(UUID trainerId, UUID clientId) {
        return repo.summaries(trainerId, List.copyOf(STATUSES), clientId).stream().findFirst();
    }

    private List<String> statuses(String raw) {
        if (raw == null || raw.isBlank()) return DEFAULT_STATUSES;
        if ("all".equalsIgnoreCase(raw.strip())) return List.copyOf(STATUSES);
        var wanted = new LinkedHashSet<String>();
        for (String s : raw.split(",")) if (STATUSES.contains(s.strip())) wanted.add(s.strip());
        return wanted.isEmpty() ? DEFAULT_STATUSES : List.copyOf(wanted);
    }
}

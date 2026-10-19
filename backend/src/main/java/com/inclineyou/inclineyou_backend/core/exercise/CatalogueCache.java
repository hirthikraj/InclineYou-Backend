package com.inclineyou.inclineyou_backend.core.exercise;

import com.inclineyou.inclineyou_backend.core.exercise.ExerciseJdbcRepository.CatalogueRow;
import com.inclineyou.inclineyou_backend.core.exercise.ExerciseJdbcRepository.CustomRow;
import com.inclineyou.inclineyou_backend.core.exercise.ExerciseJdbcRepository.EquipmentRow;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseItem;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseMeta;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseMeta.EquipmentGroup;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseMeta.EquipmentItem;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseMeta.Facet;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseMeta.Muscle;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExercisePage;
import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.BiFunction;

/**
 * The global exercise library, held in memory (19 Oct 2026).
 *
 * <p><b>Why it can be.</b> Nothing writes an {@code origin = 'inclineyou'} row but {@code ExerciseSeeder}, at boot, under
 * the SYSTEM actor (V21 refuses every request). So between two boots of this process the catalogue cannot change, and a
 * copy taken once the seeders have run is exact for as long as the process lives — a deploy is a restart, which reloads
 * it. Every reader is allowed these rows ({@code exercise_catalogue_read}: {@code tenant_id IS NULL}), so answering them
 * from memory hands nobody a row the database would have kept from them.
 *
 * <p><b>What it answers, and what it leaves to SQL.</b> Only the reads with nothing to search or filter: a picker's first
 * page (optionally narrowed to the library or to the trainer's own, {@code custom}) and {@code /meta}. A typed search
 * keeps Postgres' trigram ranking and alias matching, and the filter chips keep their SQL, because a second copy of
 * twelve predicates in Java is a second answer waiting to drift from the first. The trainer's customs are never cached:
 * they are one small query per read, so a custom made a second ago is on the next page.
 *
 * <p><b>The order is the database's, not Java's.</b> The list is {@code ORDER BY name, id} in the database's collation
 * (en_US), which {@code String.compareTo} does not reproduce — punctuation, spaces and case sort differently, and the
 * first row of the library is <i>90/90 hip switch</i>. So the cache keeps the rows in the order SQL gave them, each
 * custom arrives with the count of catalogue rows that sort ahead of it ({@code before}, also asked of SQL), and the
 * facets are tie-broken by a rank read off {@code ORDER BY} at load. Nothing here compares two names.
 *
 * A custom may carry a facet value the catalogue never uses (the seed's <i>towel</i>, <i>pull</i>); its tie-break rank
 * is then asked of the database too ({@code collated}: a sort of a few strings, no table), never guessed.
 *
 * <p><b>Falling back is always allowed.</b> Every answer is an {@code Optional}; empty means "ask SQL", and SQL is the
 * same answer. It is empty before the load (requests are served while the seeders still run), if the load failed, and
 * for a cursor whose row is no longer in the list.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CatalogueCache {

    /** The facets {@code /meta} counts, as {@code ExerciseService.meta} names them, with how each reads off a row. */
    private static final Map<String, BiFunction<ExerciseItem, String, String>> FACETS = new LinkedHashMap<>();
    static {
        FACETS.put("e.body_part", (e, category) -> e.bodyPart());
        FACETS.put("e.equipment", (e, category) -> e.equipment());
        FACETS.put("e.level", (e, category) -> e.level());
        FACETS.put("e.movement_pattern", (e, category) -> e.movementPattern());
        FACETS.put("COALESCE(e.log_type, 'weight_reps')", (e, category) -> e.logType() == null ? "weight_reps" : e.logType());
        FACETS.put("e.metadata->>'category'", (e, category) -> category);
    }

    private final ExerciseJdbcRepository repo;

    private volatile Snapshot snapshot;

    /** Everything read at load. Immutable, and swapped whole, so a reader never sees half of one. */
    private record Snapshot(List<CatalogueRow> rows,
                            Map<String, Map<String, Integer>> counts, Map<String, Map<String, Integer>> rank,
                            Map<String, Integer> targetRank, Map<String, Integer> muscles,
                            List<EquipmentRow> equipment, Map<String, Integer> equipmentCounts) {}

    /**
     * After every {@code ApplicationRunner}, so after both seeders have written. Under SYSTEM, the context the seeder
     * writes these rows in, cleared in the same breath. A failure leaves the cache empty and every read on SQL.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void load() {
        TenantContext.set(TenantContext.SYSTEM);
        try {
            List<CatalogueRow> rows = repo.catalogue();
            var counts = new HashMap<String, Map<String, Integer>>();
            var rank = new HashMap<String, Map<String, Integer>>();
            for (var f : FACETS.entrySet()) {
                var n = new HashMap<String, Integer>();
                for (CatalogueRow r : rows) {
                    String v = f.getValue().apply(r.item(), r.category());
                    if (v != null) n.merge(v, 1, Integer::sum);
                }
                counts.put(f.getKey(), Map.copyOf(n));
                rank.put(f.getKey(), ranks(repo.catalogueValues(f.getKey())));
            }
            var muscles = new HashMap<String, Integer>();
            for (CatalogueRow r : rows) {
                if (r.item().bodyPart() != null && r.item().target() != null) {
                    muscles.merge(muscleKey(r.item().bodyPart(), r.item().target()), 1, Integer::sum);
                }
            }
            var equipmentCounts = new HashMap<String, Integer>();
            for (CatalogueRow r : rows) if (r.equipmentId() != null) equipmentCounts.merge(r.equipmentId(), 1, Integer::sum);

            snapshot = new Snapshot(List.copyOf(rows), Map.copyOf(counts), Map.copyOf(rank),
                    ranks(repo.catalogueValues("e.target")), Map.copyOf(muscles),
                    List.copyOf(repo.activeEquipment()), Map.copyOf(equipmentCounts));
            log.info("Exercise catalogue cached: {} rows", rows.size());
        } catch (RuntimeException e) {
            log.warn("Exercise catalogue cache not loaded; the library is read from the database", e);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * A page of the library with no search and no filter but {@code custom}: the cached rows with the trainer's customs
     * dropped in where SQL would put them. Same items, same cursor, same total as the SQL path.
     */
    public Optional<ExercisePage> page(UUID trainerId, Boolean custom, int limit, String cursor, boolean includeTotal) {
        Snapshot s = snapshot;
        if (s == null) return Optional.empty();

        List<ExerciseItem> list = merged(s, Boolean.FALSE.equals(custom) ? List.of() : repo.customs(trainerId), custom);
        int start = 0;
        Cursor c = Cursor.decode(cursor);
        if (c != null) {
            String id = c.id().toString();
            int at = -1;
            for (int i = 0; i < list.size(); i++) {
                if (list.get(i).id().equals(id)) { at = i; break; }
            }
            // The row the cursor names has left the list (a custom deleted between pages): SQL resumes by key instead.
            if (at < 0) return Optional.empty();
            start = at + 1;
        }
        int end = Math.min(list.size(), start + limit);
        List<ExerciseItem> page = List.copyOf(list.subList(start, end));
        String next = end < list.size() ? Cursor.encode(page.getLast().name(), page.getLast().id()) : null;
        return Optional.of(new ExercisePage(page, next, includeTotal ? list.size() : null));
    }

    /** {@code /meta}: the catalogue's counts, read at load, plus the trainer's customs counted now. */
    public Optional<ExerciseMeta> meta(UUID trainerId) {
        Snapshot s = snapshot;
        if (s == null) return Optional.empty();
        List<CustomRow> customs = repo.customs(trainerId);

        var facets = new HashMap<String, List<Facet>>();
        for (var f : FACETS.entrySet()) {
            var n = new HashMap<>(s.counts().get(f.getKey()));
            for (CustomRow r : customs) {
                String v = f.getValue().apply(r.item(), r.category());
                if (v != null) n.merge(v, 1, Integer::sum);
            }
            Map<String, Integer> rank = rankFor(s.rank().get(f.getKey()), n.keySet());
            facets.put(f.getKey(), n.entrySet().stream()
                    .sorted(Comparator.<Map.Entry<String, Integer>>comparingInt(Map.Entry::getValue).reversed()
                            .thenComparingInt(e -> rank.get(e.getKey())))
                    .map(e -> new Facet(e.getKey(), e.getValue())).toList());
        }

        var muscles = new HashMap<>(s.muscles());
        for (CustomRow r : customs) {
            if (r.item().bodyPart() == null || r.item().target() == null) continue;
            muscles.merge(muscleKey(r.item().bodyPart(), r.item().target()), 1, Integer::sum);
        }
        List<Muscle> unsorted = muscles.entrySet().stream().map(e -> {
            String[] k = e.getKey().split("\u0000", 2);
            return new Muscle(k[0], k[1], e.getValue());
        }).toList();
        Map<String, Integer> targetRank = rankFor(s.targetRank(),
                unsorted.stream().map(Muscle::target).collect(java.util.stream.Collectors.toSet()));
        List<Muscle> muscleList = unsorted.stream()
                .sorted(Comparator.comparingInt(Muscle::count).reversed()
                        .thenComparingInt(m -> targetRank.get(m.target()))
                        .thenComparing(Muscle::bodyPart))
                .toList();

        var equipmentCounts = new HashMap<>(s.equipmentCounts());
        for (CustomRow r : customs) if (r.equipmentId() != null) equipmentCounts.merge(r.equipmentId(), 1, Integer::sum);
        var groups = new LinkedHashMap<String, List<EquipmentItem>>();
        for (EquipmentRow q : s.equipment()) {
            Integer n = equipmentCounts.get(q.id());
            if (n == null) continue;   // the SQL is an inner join: kit nobody uses is not a group item
            groups.computeIfAbsent(q.category(), k -> new ArrayList<>()).add(new EquipmentItem(q.key(), q.name(), n, q.value()));
        }

        return Optional.of(new ExerciseMeta(
                facets.get("e.body_part"), facets.get("e.equipment"), facets.get("e.level"),
                s.rows().size() + customs.size(),
                groups.entrySet().stream().map(e -> new EquipmentGroup(e.getKey(), List.copyOf(e.getValue()))).toList(),
                muscleList, facets.get("e.movement_pattern"),
                facets.get("COALESCE(e.log_type, 'weight_reps')"), facets.get("e.metadata->>'category'")));
    }

    /** The visible list in {@code name, id} order: a custom with {@code before = k} sits after the k-th catalogue row. */
    private static List<ExerciseItem> merged(Snapshot s, List<CustomRow> customs, Boolean custom) {
        if (Boolean.TRUE.equals(custom)) return customs.stream().map(CustomRow::item).toList();
        var out = new ArrayList<ExerciseItem>(s.rows().size() + customs.size());
        int c = 0;
        for (int i = 0; i < s.rows().size(); i++) {
            while (c < customs.size() && customs.get(c).before() <= i) out.add(customs.get(c++).item());
            out.add(s.rows().get(i).item());
        }
        while (c < customs.size()) out.add(customs.get(c++).item());
        return out;
    }

    /** The cached rank when it covers every value; otherwise the database sorts exactly these values (one tiny query). */
    private Map<String, Integer> rankFor(Map<String, Integer> cached, java.util.Set<String> values) {
        return cached.keySet().containsAll(values) ? cached : ranks(repo.collated(values));
    }

    private static Map<String, Integer> ranks(List<String> ordered) {
        var out = new HashMap<String, Integer>();
        for (int i = 0; i < ordered.size(); i++) out.put(ordered.get(i), i);
        return Map.copyOf(out);
    }

    private static String muscleKey(String bodyPart, String target) {
        return bodyPart + "\u0000" + target;
    }
}

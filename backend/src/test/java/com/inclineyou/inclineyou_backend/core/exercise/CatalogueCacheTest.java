package com.inclineyou.inclineyou_backend.core.exercise;

import com.inclineyou.inclineyou_backend.core.exercise.ExerciseJdbcRepository.Filter;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseItem;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseMeta;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExercisePage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The catalogue cache gives the SQL path's answer, exactly: the same rows in the same order on every page, the same
 * cursors, the same total, the same {@code /meta}. Both sides are asked directly ({@code CatalogueCache} and
 * {@code ExerciseService}'s package-private SQL reads), page by page, through the whole library.
 *
 * <p>The customs' names are picked to sit where Java's {@code String} order and the database's en_US collation disagree
 * — a leading digit, mixed case, a hyphen, a space — because a merge that compared names itself would pass with
 * friendlier ones and fail on a real roster.
 */
@SpringBootTest
@Transactional
class CatalogueCacheTest {

    @Autowired WebApplicationContext context;
    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired CatalogueCache cache;
    @Autowired ExerciseService service;

    private MockMvc mvc;
    private UUID owner;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        owner = trainer("9100000911");
        signedInAs(owner);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("the cache is loaded once the app is up")
    void loaded() {
        assertTrue(cache.page(owner, null, 10, null, true).isPresent());
        assertTrue(cache.meta(owner).isPresent());
    }

    @Test
    @DisplayName("every page, cursor and total matches SQL — all rows, the library alone, and the trainer's alone")
    void pagesMatch() throws Exception {
        customs();
        for (Boolean custom : new Boolean[] {null, Boolean.FALSE, Boolean.TRUE}) {
            for (int limit : new int[] {1, 37, 200}) {
                if (limit == 1 && !Boolean.TRUE.equals(custom)) continue;   // 650+ round trips proves nothing 37 does not
                assertEquals(walk(true, custom, limit), walk(false, custom, limit), "custom=" + custom + " limit=" + limit);
            }
        }
    }

    @Test
    @DisplayName("a custom lands where ORDER BY name, id puts it, not where String.compareTo would")
    void customsAreInPlace() throws Exception {
        customs();
        List<String> cached = names(walk(true, null, 200));
        List<String> sql = names(walk(false, null, 200));
        assertEquals(sql, cached);
        assertTrue(cached.contains("0 zqx first") && cached.contains("Zqx-bench") && cached.contains("zqx bench"));
    }

    @Test
    @DisplayName("/meta matches SQL with no customs, and with customs that reuse the library's values")
    void metaMatches() throws Exception {
        assertEquals(service.sqlMeta(owner), cache.meta(owner).orElseThrow());
        customs();
        assertEquals(service.sqlMeta(owner), cache.meta(owner).orElseThrow());
        assertEquals(service.sqlMeta(owner), service.meta(owner));
    }

    @Test
    @DisplayName("/meta stays cached and still matches SQL when customs carry values the library has never used")
    void metaWithNovelValues() throws Exception {
        // The seed's own shape (towel, pull) and values that tie with library ones on count, so the tie-break is tested.
        create("{\"name\":\"Zqx novel\",\"bodyPart\":\"zqxpart\",\"target\":\"zqxmuscle\",\"equipment\":\"towel\",\"movementPattern\":\"pull\"}");
        create("{\"name\":\"Zqx novel two\",\"bodyPart\":\"Aaa zqx\",\"target\":\"0 zqx\",\"equipment\":\"Towel\",\"level\":\"zqx level\"}");
        customs();
        assertTrue(cache.meta(owner).isPresent());
        assertEquals(service.sqlMeta(owner), cache.meta(owner).orElseThrow());
        assertEquals(service.sqlMeta(owner), service.meta(owner));
    }

    @Test
    @DisplayName("a cursor naming a custom deleted since resumes in SQL, at the same place")
    void deletedCursorRowFallsBack() throws Exception {
        String id = create("{\"name\":\"Zqx gone\",\"bodyPart\":\"chest\",\"target\":\"pectorals\"}");
        create("{\"name\":\"Zqx kept\",\"bodyPart\":\"chest\",\"target\":\"pectorals\"}");
        ExercisePage first = cache.page(owner, Boolean.TRUE, 1, null, false).orElseThrow();
        assertEquals(id, first.items().getFirst().id());
        assertTrue(first.nextCursor() != null);
        mvc.perform(delete("/v1/exercises/" + id)).andExpect(status().isNoContent());

        assertFalse(cache.page(owner, Boolean.TRUE, 1, first.nextCursor(), false).isPresent());
        var search = new ExerciseService.Search(null, null, null, null, null, null, null, null, null, null, null, Boolean.TRUE);
        assertEquals(service.sqlSearch(owner, filter(Boolean.TRUE), 1, first.nextCursor(), false),
                service.search(owner, search, 1, first.nextCursor(), false));
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    /** Every page of one read, followed to the end; each page with its cursor and total, so those are compared too. */
    private List<ExercisePage> walk(boolean cached, Boolean custom, int limit) {
        var pages = new ArrayList<ExercisePage>();
        String cursor = null;
        do {
            ExercisePage p = cached
                    ? cache.page(owner, custom, limit, cursor, true).orElseThrow()
                    : service.sqlSearch(owner, filter(custom), limit, cursor, true);
            pages.add(p);
            cursor = p.nextCursor();
        } while (cursor != null);
        return pages;
    }

    private static Filter filter(Boolean custom) {
        return new Filter(null, List.of(), List.of(), List.of(), custom, List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of(), List.of());
    }

    private static List<String> names(List<ExercisePage> pages) {
        return pages.stream().flatMap(p -> p.items().stream()).map(ExerciseItem::name).toList();
    }

    /** Names where byte order and en_US disagree, on values the library already uses (so /meta stays cached). */
    private void customs() throws Exception {
        create("{\"name\":\"0 zqx first\",\"bodyPart\":\"chest\",\"target\":\"pectorals\",\"equipment\":\"body weight\"}");
        create("{\"name\":\"zqx bench\",\"bodyPart\":\"chest\",\"target\":\"pectorals\",\"equipment\":\"barbell\",\"level\":\"beginner\"}");
        create("{\"name\":\"Zqx-bench\",\"bodyPart\":\"chest\",\"target\":\"pectorals\",\"logType\":\"reps\"}");
        create("{\"name\":\"ab Zqx wheel\",\"bodyPart\":\"waist\",\"target\":\"abs\"}");
        create("{\"name\":\"Zz zqx last\"}");
    }

    private String create(String body) throws Exception {
        String json = mvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    private UUID trainer(String phone) {
        String e164 = "+91" + phone;
        jdbc.update("""
                INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("phone", e164));
        String appUserId = jdbc.queryForObject(
                "SELECT id::text FROM app_user WHERE phone = :phone", Map.of("phone", e164), String.class);
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :appUserId::uuid, :phone)
                ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("appUserId", appUserId, "phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE app_user_id = :appUserId::uuid",
                Map.of("appUserId", appUserId), String.class));
    }

    private void signedInAs(UUID trainerId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        trainerId.toString(), null,
                        AuthorityUtils.createAuthorityList("ROLE_TRAINER")));
    }
}

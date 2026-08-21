package com.xrep.xrep_backend.team;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The shared program library.
 *
 * <p>The property worth pinning is the one that makes a copy safe: after
 * copying, editing the original must not reach the copy. Every competitor that
 * has built this has let a template edit walk into a plan somebody was halfway
 * through, and the whole reason this is a copy rather than a share is to make
 * that impossible.
 *
 * <p>The second is scope: the library widens for a plain <em>coach</em>, unlike
 * client reads. Conflating the two would either leak clients to coaches or hide
 * the library from them, and the library is most of what a coach joins for.
 */
@SpringBootTest
@Transactional
class TeamLibraryTest {

    @Autowired TeamService teams;
    @Autowired TeamLibraryService library;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private UUID owner;
    private UUID coach;
    private UUID ownersTemplate;

    @BeforeEach
    void setUp() {
        owner = trainer("9600000001", "Ravi");
        coach = trainer("9600000002", "Priya");
        teams.create(owner, new TeamService.CreateTeamRequest("Iron House", null));
        var invite = teams.invite(owner, new TeamService.InviteRequest("9600000002"));
        teams.acceptInvitation(coach, invite.member().id());

        ownersTemplate = template(owner, "Push Pull Legs",
                "[{\"day\":1,\"exerciseId\":\"a\"},{\"day\":1,\"exerciseId\":\"b\"},{\"day\":2,\"exerciseId\":\"c\"}]");
    }

    @Test
    @DisplayName("a plain coach sees the whole team's shelf, their own labelled as theirs")
    void coachesSeeTheShelf() {
        UUID theirs = template(coach, "Beginner Full Body", "[{\"day\":1,\"exerciseId\":\"a\"}]");

        var shelf = library.templates(coach);

        assertThat(shelf).hasSize(2);
        // Their own leads — a coach browsing wants to see all of them and be told
        // which are theirs, not have theirs filtered out of a shelf.
        assertThat(shelf.getFirst().id()).isEqualTo(theirs);
        assertThat(shelf.getFirst().mine()).isTrue();

        var ravis = shelf.stream().filter(t -> t.id().equals(ownersTemplate)).findFirst().orElseThrow();
        assertThat(ravis.mine()).isFalse();
        assertThat(ravis.coachName()).isEqualTo("Ravi");
        // Shape, from the blueprint, so the shelf can show more than a name.
        assertThat(ravis.days()).isEqualTo(2);
        assertThat(ravis.exercises()).isEqualTo(3);
    }

    @Test
    @DisplayName("a trainer with no team has no shelf to read")
    void noTeamNoShelf() {
        UUID solo = trainer("9600000003", "Anand");
        assertThatThrownBy(() -> library.templates(solo))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode())
                        .isEqualTo("TEAM_MEMBERSHIP_REQUIRED"));
    }

    @Test
    @DisplayName("copying makes it yours, and the original stops mattering")
    void copyingDetaches() {
        var copy = library.copy(coach, ownersTemplate);

        assertThat(copy.name()).isEqualTo("Push Pull Legs (copy)");
        assertThat(jdbc.queryForObject(
                "SELECT trainer_id::text FROM template WHERE id = :id::uuid",
                Map.of("id", copy.templateId().toString()), String.class))
                .isEqualTo(coach.toString());

        // The blueprint came with it — a copy needs nothing from the original,
        // which is what ordinal day slots (V24) buy.
        assertThat(structureOf(copy.templateId())).isEqualTo(structureOf(ownersTemplate));

        // Now Ravi rewrites his. Priya's copy must not move: this is the whole
        // reason the library copies rather than shares.
        jdbc.update("""
                UPDATE template SET structure = CAST('[]' AS jsonb), name = 'Rewritten', updated_at = NOW()
                WHERE id = :id::uuid
                """, Map.of("id", ownersTemplate.toString()));

        assertThat(structureOf(copy.templateId())).isNotEqualTo("[]");
        assertThat(jdbc.queryForObject("SELECT name FROM template WHERE id = :id::uuid",
                Map.of("id", copy.templateId().toString()), String.class))
                .isEqualTo("Push Pull Legs (copy)");
    }

    @Test
    @DisplayName("a template outside the team is a 404")
    void cannotCopyOutsideTheTeam() {
        UUID stranger = trainer("9600000004", "Nobody");
        UUID theirs = template(stranger, "Not yours", "[]");

        assertThatThrownBy(() -> library.copy(coach, theirs))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode())
                        .isEqualTo("TEMPLATE_NOT_IN_TEAM"));

        assertThat(library.templates(coach).stream().map(t -> t.id())).doesNotContain(theirs);
    }

    @Test
    @DisplayName("a template with no blueprint counts zero rather than failing")
    void emptyStructureIsFine() {
        UUID blank = template(owner, "Blank", null);
        var row = library.templates(owner).stream()
                .filter(t -> t.id().equals(blank)).findFirst().orElseThrow();

        assertThat(row.days()).isZero();
        assertThat(row.exercises()).isZero();
    }

    // ── Fixtures ──────────────────────────────────────────────────────────────

    private String structureOf(UUID templateId) {
        return jdbc.queryForObject("SELECT structure::text FROM template WHERE id = :id::uuid",
                Map.of("id", templateId.toString()), String.class);
    }

    private UUID template(UUID trainerId, String name, String structure) {
        UUID id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        p.put("name", name);
        p.put("structure", structure);
        jdbc.update("""
                INSERT INTO template (id, trainer_id, name, structure)
                VALUES (:id::uuid, :tid::uuid, :name, CAST(:structure AS jsonb))
                """, p);
        return id;
    }

    private UUID trainer(String phone, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, :p, :n)",
                Map.of("id", id.toString(), "p", phone, "n", name));
        jdbc.update("""
                INSERT INTO app_user (phone, role) VALUES (:p, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("p", phone));
        return id;
    }
}

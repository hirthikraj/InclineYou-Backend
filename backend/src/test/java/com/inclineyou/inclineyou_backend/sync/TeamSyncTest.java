package com.inclineyou.inclineyou_backend.sync;

import com.inclineyou.inclineyou_backend.team.TeamService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What a team puts on a phone, and — the harder half — what it takes back off.
 *
 * <p>Two team tables enter the offline scope and nothing else does. Teammates'
 * clients, programs and money are online-only: mirroring them would multiply
 * every admin's local database by the size of the team, and an offline copy
 * leaves with the phone.
 *
 * <p>The tests that matter here are the tombstones. The pull filters by the
 * caller's scope, so the moment a coach leaves a team those rows stop MATCHING
 * rather than becoming deleted — appearing in neither {@code updated} nor
 * {@code deleted}, and staying on the phone forever as a live, editable,
 * server-invisible copy. That is the same trap client reassignment falls into in
 * Phase 2, and it is worth pinning here first on the cheaper case.
 *
 * <p>Every pull below asks from the epoch rather than from a mid-test cursor,
 * deliberately: {@code NOW()} inside a transaction is the transaction's start
 * time, so two writes in one test carry the same {@code updated_at} and a
 * cursor-based assertion would be testing Postgres's clock rather than the scope
 * rules. The scope rules are the subject.
 */
@SpringBootTest
@Transactional
class TeamSyncTest {

    @Autowired SyncService sync;
    @Autowired TeamService teams;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private UUID owner;
    private UUID coach;
    private UUID teamId;

    @BeforeEach
    void setUp() {
        owner = trainer("9300000001", "Ravi");
        coach = trainer("9300000002", "Priya");
        teamId = teams.create(owner, new TeamService.CreateTeamRequest("Iron House", null)).id();
        var invite = teams.invite(owner, new TeamService.InviteRequest("9300000002"));
        teams.acceptInvitation(coach, invite.member().id());
    }

    @Test
    @DisplayName("a member pulls their team and every member of it")
    void membersPullTheTeam() {
        var changes = sync.pull(coach, 0L).changes();

        assertThat(ids(changes.get("teams").updated())).containsExactly(teamId.toString());
        // Both of them, not just the caller: the coach list is drawn from this.
        assertThat(changes.get("team_members").updated()).hasSize(2);
        assertThat(changes.get("teams").deleted()).isEmpty();
        assertThat(changes.get("team_members").deleted()).isEmpty();
    }

    @Test
    @DisplayName("a trainer in no team pulls no team rows at all")
    void soloTrainersPullNothing() {
        UUID solo = trainer("9300000003", "Anand");
        var changes = sync.pull(solo, 0L).changes();

        assertThat(changes.get("teams").updated()).isEmpty();
        assertThat(changes.get("team_members").updated()).isEmpty();
    }

    @Test
    @DisplayName("leaving takes the team and every member row off the phone")
    void leavingEmitsTombstones() {
        teams.leave(coach);

        var changes = sync.pull(coach, 0L).changes();

        // Nothing alive, and the ids that were there are named as gone. Without
        // this the team stays drawn on a phone that is no longer in it.
        assertThat(changes.get("teams").updated()).isEmpty();
        assertThat(changes.get("teams").deleted()).contains(teamId.toString());

        assertThat(changes.get("team_members").updated()).isEmpty();
        // Their own row AND the owner's — a coach list of one stale colleague is
        // no better than a list of forty.
        assertThat(changes.get("team_members").deleted()).hasSize(2);
    }

    @Test
    @DisplayName("deleting the team tombstones it for every member, owner included")
    void deletingTheTeamTombstonesIt() {
        teams.delete(owner);

        for (UUID trainerId : List.of(owner, coach)) {
            var changes = sync.pull(trainerId, 0L).changes();
            assertThat(changes.get("teams").updated()).isEmpty();
            assertThat(changes.get("teams").deleted()).contains(teamId.toString());
        }
    }

    @Test
    @DisplayName("a teammate's custom exercise rides the caller's cursor — and leaves when they do")
    void teamCustomExercises() {
        String theirs = customExercise(owner, "Ravi's Landmine Press");
        String mine = customExercise(coach, "Priya's Sled Push");
        UUID stranger = trainer("9300000004", "Nobody");
        String strangers = customExercise(stranger, "Unrelated Curl");

        var visible = ids(sync.pull(coach, 0L).changes().get("exercises").updated());
        // A program copied from a teammate points at their exercise rows; without
        // them it opens on the gym floor as blank lines.
        assertThat(visible).contains(theirs, mine);
        // And the widening is to the TEAM, not to everybody with a custom row.
        assertThat(visible).doesNotContain(strangers);

        teams.leave(coach);

        var after = sync.pull(coach, 0L).changes().get("exercises");
        assertThat(ids(after.updated())).contains(mine).doesNotContain(theirs);
        // The row did not change — the caller's relationship to it did — so this
        // deletion is the only thing that can get it off the phone.
        assertThat(after.deleted()).contains(theirs);
        assertThat(after.deleted()).doesNotContain(mine);
    }

    @Test
    @DisplayName("a push carrying team rows is refused out loud, and writes nothing")
    void teamTablesArePushRejected() {
        // A phone trying to promote itself, which is exactly why these tables are
        // pull-only: a permission change authored offline is a permission change
        // replayed at an unknown later time.
        String memberId = jdbc.queryForObject("""
                SELECT id::text FROM team_member WHERE trainer_id = :tid::uuid
                """, Map.of("tid", coach.toString()), String.class);

        var record = new HashMap<String, Object>();
        record.put("id", memberId);
        record.put("role", "owner");
        var result = sync.push(coach, Map.of("changes", Map.of(
                "team_members", Map.of("created", List.of(), "updated", List.of(record), "deleted", List.of()),
                "teams", Map.of("created", List.of(), "updated", List.of(),
                        "deleted", List.of(teamId.toString())))));

        assertThat(result.rejected()).hasSize(2);
        assertThat(result.rejected()).allSatisfy(r -> {
            assertThat(r.code()).isEqualTo("TEAM_READ_ONLY");
            assertThat(r.kept()).isFalse();
            assertThat(r.message()).isNotBlank();
        });

        // And the database is untouched: still a coach, and the team still there.
        assertThat(jdbc.queryForObject("SELECT role FROM team_member WHERE id = :id::uuid",
                Map.of("id", memberId), String.class)).isEqualTo("coach");
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM team WHERE id = :id::uuid AND deleted_at IS NULL",
                Map.of("id", teamId.toString()), Integer.class)).isEqualTo(1);
    }

    // ── Fixtures ──────────────────────────────────────────────────────────────

    private static List<String> ids(List<Map<String, Object>> rows) {
        return rows.stream().map(r -> String.valueOf(r.get("id"))).toList();
    }

    private String customExercise(UUID trainerId, String name) {
        String id = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO exercise (id, name, is_custom, trainer_id, log_type)
                VALUES (:id::uuid, :name, TRUE, :tid::uuid, 'weight_reps')
                """, Map.of("id", id, "name", name, "tid", trainerId.toString()));
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

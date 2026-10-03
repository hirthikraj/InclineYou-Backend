package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.trainer.dto.GymPlaceInput;
import com.inclineyou.inclineyou_backend.core.trainer.dto.GymPlaceView;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * All SQL for the gym directory. The request role can write nothing in
 * {@code gym_place}; {@code upsert_gym_place()} is the one door in (V8), and a read
 * is narrowed by policy to the place the caller's own profile points at.
 */
@Repository
@RequiredArgsConstructor
public class GymPlaceJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** Adds the place, or fills blanks on the existing one; the id either way, so a repeat is idempotent. */
    public UUID upsert(GymPlaceInput in) {
        var p = new MapSqlParameterSource()
                .addValue("placeId", in.placeId()).addValue("name", in.name())
                .addValue("address", in.address()).addValue("city", in.city())
                .addValue("lat", in.lat()).addValue("lng", in.lng()).addValue("mapLink", in.mapLink());
        return jdbc.queryForObject("""
                SELECT upsert_gym_place(CAST(:placeId AS text), CAST(:name AS text), CAST(:address AS text), CAST(:city AS text),
                       CAST(:lat AS numeric), CAST(:lng AS numeric), CAST(:mapLink AS text))
                """, p, UUID.class);
    }

    public Optional<GymPlaceView> find(UUID id) {
        if (id == null) return Optional.empty();
        return jdbc.query("""
                SELECT id::text AS id, place_id, name, address, city, map_link FROM gym_place WHERE id = :id::uuid
                """, Map.of("id", id.toString()),
                (rs, i) -> new GymPlaceView(rs.getString("id"), rs.getString("place_id"), rs.getString("name"),
                        rs.getString("address"), rs.getString("city"), rs.getString("map_link")))
                .stream().findFirst();
    }

    /**
     * Rows entered before the trainer picked a place carry only a name. They are the same gym
     * the trainer was already with, so they join it — otherwise one gym's settlement would
     * split into a named half and a placed half at the moment of linking.
     */
    public void adoptUnlinked(UUID trainerId, UUID placeId, String... names) {
        for (String name : names) {
            if (name == null || name.isBlank()) continue;
            var p = Map.of("tid", trainerId.toString(), "gp", placeId.toString(), "n", name.strip());
            jdbc.update("""
                    UPDATE gym_arrangement SET gym_place_id = :gp::uuid
                    WHERE trainer_id = :tid::uuid AND gym_place_id IS NULL AND lower(gym_name) = lower(:n)""", p);
            jdbc.update("""
                    UPDATE trainer_payout SET gym_place_id = :gp::uuid
                    WHERE trainer_id = :tid::uuid AND gym_place_id IS NULL AND lower(gym_name) = lower(:n)""", p);
        }
    }
}

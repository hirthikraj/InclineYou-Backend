package com.inclineyou.inclineyou_backend.repository;

import com.inclineyou.inclineyou_backend.entity.ClientNote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every method here is narrowed by {@code trainerId} on purpose.
 *
 * Ownership of the CLIENT is already checked before any of these run, and that
 * is deliberately not enough: a team lets a coach hold a teammate's client, and
 * a note is private to the trainer who wrote it. So the author is in the
 * predicate rather than assumed from the client — a read that forgets it would
 * pass every ownership test and still leak.
 */
public interface ClientNoteRepository extends JpaRepository<ClientNote, UUID> {

    List<ClientNote> findByClientIdAndTrainerIdAndDeletedAtIsNullOrderByCreatedAtDesc(
            UUID clientId, UUID trainerId);

    Optional<ClientNote> findByIdAndClientIdAndTrainerIdAndDeletedAtIsNull(
            UUID id, UUID clientId, UUID trainerId);
}

package com.xrep.xrep_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/**
 * V29 · one note a trainer wrote about a client.
 *
 * Free text and nothing else. There is no injury field, no condition field and
 * no PAR-Q flag here, and there must never be one: the interaction map excludes
 * health data outright under the DPDP Act 2023, and a column that distinguishes
 * a medical note from any other note makes this a health record whatever it is
 * named. The migration carries the full argument.
 */
@Entity
@Table(name = "client_note")
@Getter
@Setter
public class ClientNote {

    @Id
    @UuidGenerator
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "client_id", nullable = false)
    private UUID clientId;

    /**
     * The author — and the privacy rule, not bookkeeping.
     *
     * A team widens reads over a teammate's clients (V26); a private note is the
     * one thing on a client's file that must not travel with that widening. The
     * column lets "mine and nobody else's" be a predicate rather than a join
     * somebody has to remember.
     */
    @Column(name = "trainer_id", nullable = false)
    private UUID trainerId;

    @Column(columnDefinition = "text", nullable = false)
    private String body;

    /** Drawn in the file's always-visible strip instead of the notes list. */
    @Column(nullable = false)
    private boolean pinned = false;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @PrePersist
    void onCreate() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}

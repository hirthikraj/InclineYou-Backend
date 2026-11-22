package com.inclineyou.inclineyou_backend.core.trainer;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * GET /v1/trainers/me reads about seven statements; they must be one snapshot (20 Nov 2026), or a PATCH committing
 * between them returns old fields under the new version, cached against an ETag that keeps answering 304. A test
 * cannot put a commit between two of them from inside its own transaction, so the rule is pinned on the method.
 */
class TrainerProfileSnapshotTest {

    @Test
    @DisplayName("the profile read is one read-only REPEATABLE READ transaction")
    void oneSnapshot() throws Exception {
        var tx = TrainerService.class.getMethod("get", UUID.class).getAnnotation(Transactional.class);
        assertNotNull(tx);
        assertTrue(tx.readOnly());
        assertEquals(Isolation.REPEATABLE_READ, tx.isolation());
    }
}

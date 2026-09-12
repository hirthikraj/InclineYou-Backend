package com.inclineyou.inclineyou_backend.repository;

import com.inclineyou.inclineyou_backend.entity.Trainer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface TrainerRepository extends JpaRepository<Trainer, UUID> {
    Optional<Trainer> findByPhoneAndDeletedAtIsNull(String phone);

    /**
     * Any row on this number, soft-deleted included — V36.
     *
     * <p>Deliberately unfiltered where its sibling above is not. The UNIQUE
     * index on {@code phone} does not care about {@code deleted_at}, so a
     * deleted row still occupies its number and an availability check that
     * ignored it would report the number free and then collide at flush time —
     * a 500 where a sentence belongs. It is also the honest answer: a closed
     * account keeps its number, which is what the delete confirmation promises.
     */
    Optional<Trainer> findByPhone(String phone);

}

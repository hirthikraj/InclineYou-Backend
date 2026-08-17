package com.xrep.xrep_backend.client;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Who a trainer is allowed to put on their roster.
 *
 * Three numbers can never be added, and all of them are the same rule wearing
 * different clothes — one phone is one person, and one person is in one place:
 *
 *   1. A number that owns a TRAINER account. `app_user.role` is exclusive and
 *      sign-in reads it as the whole answer, so a trainer sitting on somebody
 *      else's roster is a person the router cannot place. This is the reported
 *      bug: T1 could add T2 and the row landed.
 *
 *   2. A number that is already ANOTHER trainer's client. A live membership is
 *      an arrangement between two people; a second trainer claiming the same
 *      number splits that person's pack, their history and their weekly report
 *      across two books that will never agree.
 *
 *   3. A number that is already on the caller's OWN roster. This used to be
 *      allowed — two people genuinely do share a phone in an Indian household —
 *      but the number IS the identity: sign-in, invites and sync all resolve a
 *      person by phone, so a second row behind the same number is one account
 *      wearing two names. The verdict says which client has it, which is safe
 *      here and nowhere else: it is the caller's own book.
 *
 * ── What does NOT block ───────────────────────────────────────────────────────
 *
 * A membership that is over. `archived` on the trainer's side, `removed` or
 * `declined` on the client's — somebody who left trainer A in March must be
 * addable by trainer B in April, and a rule that outlived the relationship it
 * describes would strand them forever. `unavailable` is excluded for the same
 * reason: it is not a membership, it is a row that says an invite was refused,
 * and rows in that state predate this guard.
 *
 * ── What the message never says ───────────────────────────────────────────────
 *
 * Who the other trainer is. "Already on Ravi Kannan's roster at Iron House"
 * would hand any trainer with a phone book a way to enumerate a competitor's
 * client list one number at a time. The sentence says the number is spoken for
 * and stops there.
 */
@Component
@RequiredArgsConstructor
public class ClientPhoneGuard {

    private final NamedParameterJdbcTemplate jdbc;

    /** The number owns a trainer account. Recovery: a different number. */
    public static final String CODE_TRAINER = "PHONE_IS_TRAINER";

    /** The number is on another trainer's roster. Recovery: they leave it. */
    public static final String CODE_OTHER_ROSTER = "PHONE_ON_ANOTHER_ROSTER";

    /** The number is on the caller's own roster. Recovery: edit that client. */
    public static final String CODE_OWN_ROSTER = "PHONE_ON_YOUR_ROSTER";

    private static final String MSG_TRAINER =
            "This number belongs to a trainer's XRep account, so it can't be added as a client. "
            + "If they also train with you, ask them for a different number.";

    private static final String MSG_OTHER_ROSTER =
            "This number is already on another trainer's roster. Someone can only be one "
            + "trainer's client at a time — they need to be removed there before you can add them.";

    private static final String MSG_OWN_ROSTER =
            "This number is already on your roster — it's saved for %s. One number can only "
            + "belong to one client, so edit them instead of adding them again.";

    /** Available, or the reason it is not. */
    public record Verdict(boolean available, String code, String message) {
        public static Verdict ok() { return new Verdict(true, null, null); }
    }

    /**
     * @param trainerId the trainer doing the adding — their own rows never block
     * @param phone     may be null: a client with no number is nobody's but this
     *                  trainer's, and there is no identity to collide with
     */
    public Verdict check(String trainerId, String phone) {
        if (phone == null || phone.isBlank()) return Verdict.ok();

        var row = jdbc.queryForMap("""
                SELECT
                    EXISTS(
                        SELECT 1 FROM app_user
                        WHERE phone = :phone AND role = 'trainer' AND deleted_at IS NULL
                    )
                    -- Belt and braces against a `trainer` row whose identity was
                    -- never minted. Sign-in believes `app_user`, but a number
                    -- with a workspace behind it is a trainer whichever table
                    -- says so, and being wrong in this direction only ever
                    -- refuses an invite that could not have worked anyway.
                    OR EXISTS(
                        SELECT 1 FROM trainer
                        WHERE phone = :phone AND deleted_at IS NULL
                    ) AS is_trainer,
                    EXISTS(
                        SELECT 1 FROM client
                        WHERE phone = :phone
                          AND trainer_id <> :tid::uuid
                          AND deleted_at IS NULL
                          AND status <> 'archived'
                          AND membership_status NOT IN ('removed', 'declined', 'unavailable')
                    ) AS on_other_roster,
                    -- The name, not a boolean: this one is the caller's own book,
                    -- so saying WHO already has the number is safe and is the
                    -- whole difference between a refusal and an answer.
                    (
                        SELECT name FROM client
                        WHERE phone = :phone
                          AND trainer_id = :tid::uuid
                          AND deleted_at IS NULL
                          AND status <> 'archived'
                          AND membership_status NOT IN ('removed', 'declined', 'unavailable')
                        ORDER BY created_at
                        LIMIT 1
                    ) AS own_client_name
                """, Map.of("phone", phone, "tid", trainerId));

        if (Boolean.TRUE.equals(row.get("is_trainer"))) {
            return new Verdict(false, CODE_TRAINER, MSG_TRAINER);
        }
        Object ownClient = row.get("own_client_name");
        if (ownClient != null) {
            return new Verdict(false, CODE_OWN_ROSTER, MSG_OWN_ROSTER.formatted(ownClient));
        }
        if (Boolean.TRUE.equals(row.get("on_other_roster"))) {
            return new Verdict(false, CODE_OTHER_ROSTER, MSG_OTHER_ROSTER);
        }
        return Verdict.ok();
    }

    /** The same check, for callers that answer a request rather than a push. */
    public void require(String trainerId, String phone) {
        Verdict verdict = check(trainerId, phone);
        if (!verdict.available()) {
            throw new PhoneUnavailableException(verdict.code(), verdict.message());
        }
    }
}

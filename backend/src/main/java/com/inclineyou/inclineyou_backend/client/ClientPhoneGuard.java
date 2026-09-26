package com.inclineyou.inclineyou_backend.client;

import com.inclineyou.inclineyou_backend.tenant.CurrentScope;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Who a trainer is allowed to put on their roster.
 *
 * Trainer↔client duality is now allowed: one phone can hold a trainer account
 * and be a client on somebody else's roster at the same time (see
 * `AuthService#trainerView` and the `/v1/auth/mode/**` switch endpoints).
 * `app_user.role` is no longer an exclusivity lock — it is just the *home*
 * role, which mode sign-in opens into by default. Two numbers can still never
 * be added, and both are the same rule wearing different clothes — a phone
 * number IS the identity, so a second row behind the same number in the wrong
 * place is one account wearing two names:
 *
 *   1. The CALLER'S OWN number. Adding yourself as your own client is the
 *      unresolved "self-training" question (see `SELF_TRAINING_ENABLED` on
 *      the app side) and stays out of this guard's scope — it is not the same
 *      thing as another trainer's number, which is now fine to add.
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
 * A number that owns SOMEBODY ELSE'S trainer account. That used to be refused
 * outright (T1 could not add T2); now it is exactly what lets a trainer be
 * added to another trainer's roster, and the added trainer can switch into
 * "client mode" for that membership via `POST /v1/auth/mode/client`.
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

    /** The number is the caller's own. Recovery: a different number. */
    public static final String CODE_TRAINER = "PHONE_IS_TRAINER";

    /**
     * The number is on another coach's roster IN THIS WORKSPACE.
     *
     * <p>The code is unchanged and stays in the catalogue, but its meaning
     * narrowed with tenancy: it used to mean "anywhere in the product", and it
     * now means "here". One person can be a client of a trainer's private
     * practice and, separately, a client at a gym — two arrangements, two
     * workspaces, two client rows. What is still refused is two coaches in the
     * SAME workspace both claiming them, because that is one gym billing one
     * member twice.
     *
     * <p>Recovery: the other coach in this workspace releases them, or an admin
     * reassigns.
     */
    public static final String CODE_OTHER_ROSTER = "PHONE_ON_ANOTHER_ROSTER";

    /** The number is on the caller's own roster. Recovery: edit that client. */
    public static final String CODE_OWN_ROSTER = "PHONE_ON_YOUR_ROSTER";

    private static final String MSG_TRAINER =
            "That's your own number — you can't add yourself as a client. "
            + "Use a different number, or edit your own trainer profile instead.";

    private static final String MSG_OTHER_ROSTER =
            "This number is already with another coach in this workspace. One person belongs "
            + "to one coach here — ask an admin to reassign them, or add them from a different "
            + "workspace.";

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
                        SELECT 1 FROM trainer t JOIN app_user au ON au.id = t.app_user_id
                        WHERE au.phone = :phone AND t.id = :tid::uuid AND t.deleted_at IS NULL
                    ) AS is_self,
                    EXISTS(
                        SELECT 1 FROM client
                        WHERE phone = :phone
                          AND trainer_id <> :tid::uuid
                          -- Scoped to ONE workspace, which is the change tenancy
                          -- made. The old query had no tenant predicate and
                          -- therefore refused a number that was on any roster in
                          -- the product; that made "a client can train under two
                          -- arrangements" impossible to express.
                          AND (:tenantId::uuid IS NULL OR tenant_id = :tenantId::uuid)
                          AND deleted_at IS NULL
                          AND status <> 'archived'
                          AND membership_status NOT IN ('removed', 'declined', 'unavailable')
                    ) AS on_other_roster,
                    (
                        SELECT name FROM client
                        WHERE phone = :phone
                          AND trainer_id = :tid::uuid
                          AND (:tenantId::uuid IS NULL OR tenant_id = :tenantId::uuid)
                          AND deleted_at IS NULL
                          AND status <> 'archived'
                          AND membership_status NOT IN ('removed', 'declined', 'unavailable')
                        ORDER BY created_at
                        LIMIT 1
                    ) AS own_client_name
                """, params(phone, trainerId, activeTenantId()));

        if (Boolean.TRUE.equals(row.get("is_self"))) {
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

    /**
     * The workspace the caller is standing in.
     *
     * <p>Read from {@link CurrentScope} rather than passed in, because every one
     * of this guard's callers already has it on the request, and threading it
     * through would change four signatures for a value that is ambient by
     * construction.
     *
     * <p>Null when there is no scope — a background job, or a test that has not
     * set one — and the query treats null as "no workspace predicate", which is
     * EXACTLY the behaviour this guard had before tenancy. Failing back to the
     * old rule is the only safe direction: the old rule was stricter.
     */
    private static String activeTenantId() {
        var scope = CurrentScope.get();
        return scope == null || scope.activeTenantId() == null
                ? null : scope.activeTenantId().toString();
    }

    /** {@code Map.of} refuses nulls, and a null tenant is a meaningful value here. */
    private static Map<String, Object> params(String phone, String trainerId, String tenantId) {
        var p = new java.util.HashMap<String, Object>();
        p.put("phone", phone);
        p.put("tid", trainerId);
        p.put("tenantId", tenantId);
        return p;
    }

    /** The same check, for callers that answer a request rather than a push. */
    public void require(String trainerId, String phone) {
        Verdict verdict = check(trainerId, phone);
        if (!verdict.available()) {
            throw new PhoneUnavailableException(verdict.code(), verdict.message());
        }
    }
}

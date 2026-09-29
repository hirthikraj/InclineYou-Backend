package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
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

    /** The number is on the caller's own roster. Recovery: edit that client (or unarchive them). */
    public static final String CODE_OWN_ROSTER = "PHONE_ALREADY_YOURS";

    /** Fails {@code client_phone_format}: E.164, and an Indian number is +91[6-9] and 9 digits. */
    public static final String CODE_INVALID = "PHONE_INVALID";

    /**
     * {@code client_phone_format} as one regex, for {@code @Pattern} on request
     * records: E.164, and a +91 number is [6-9] and nine more digits. The second
     * branch's lookahead is what stops a malformed +91 number passing as generic E.164.
     */
    public static final String PHONE_PATTERN = "\\+91[6-9][0-9]{9}|\\+(?!91)[1-9][0-9]{6,14}";
    public static final String PHONE_MESSAGE = "E.164, and an Indian number is +91 and ten digits";

    private static final java.util.regex.Pattern PHONE = java.util.regex.Pattern.compile(PHONE_PATTERN);

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

    /**
     * Available, or the reason it is not. {@code clientId}, {@code clientName} and
     * {@code clientStatus} only for {@code PHONE_ALREADY_YOURS} — it is the caller's
     * own book, so the UI can say "open Meera", or offer to restore an archived one.
     */
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public record Verdict(boolean available, String code, String message,
                          String clientId, String clientName, String clientStatus) {
        public static Verdict ok() { return new Verdict(true, null, null, null, null, null); }
        static Verdict no(String code, String message) { return new Verdict(false, code, message, null, null, null); }
    }

    /** The {@code client_phone_format} rule, before any query. */
    public static boolean validFormat(String phone) {
        return PHONE.matcher(phone).matches();
    }

    /**
     * @param trainerId the trainer doing the adding — their own rows never block
     * @param phone     may be null: a client with no number is nobody's but this
     *                  trainer's, and there is no identity to collide with
     */
    public Verdict check(String trainerId, String phone) {
        return check(trainerId, phone, false);
    }

    /**
     * @param includeArchived the phone-check asks about the trainer's archived
     *                        clients too, so the add flow can offer a restore
     *                        instead of a second row; a write does not, because
     *                        uq_client_phone_live lets a new client take an
     *                        archived one's number
     */
    public Verdict check(String trainerId, String phone, boolean includeArchived) {
        if (phone == null || phone.isBlank()) return Verdict.ok();
        if (!validFormat(phone)) {
            return Verdict.no(CODE_INVALID, "That isn't a phone number we can use — +91 and ten digits.");
        }

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
                    own.id::text AS own_client_id, own.name AS own_client_name, own.status AS own_client_status
                FROM (SELECT 1) one
                LEFT JOIN LATERAL (
                        SELECT id, name, status FROM client
                        WHERE phone = :phone
                          AND trainer_id = :tid::uuid
                          AND (:tenantId::uuid IS NULL OR tenant_id = :tenantId::uuid)
                          AND deleted_at IS NULL
                          AND (:archived OR (status <> 'archived'
                               AND membership_status NOT IN ('removed', 'declined', 'unavailable')))
                        -- A live client before an archived one with the same number.
                        ORDER BY (status = 'archived'), created_at
                        LIMIT 1
                ) own ON true
                """, params(phone, trainerId, activeTenantId(), includeArchived));

        if (Boolean.TRUE.equals(row.get("is_self"))) {
            return Verdict.no(CODE_TRAINER, MSG_TRAINER);
        }
        Object ownClient = row.get("own_client_name");
        if (row.get("own_client_id") != null) {
            return new Verdict(false, CODE_OWN_ROSTER, MSG_OWN_ROSTER.formatted(ownClient),
                    (String) row.get("own_client_id"), (String) ownClient, (String) row.get("own_client_status"));
        }
        if (Boolean.TRUE.equals(row.get("on_other_roster"))) {
            return Verdict.no(CODE_OTHER_ROSTER, MSG_OTHER_ROSTER);
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
    private static Map<String, Object> params(String phone, String trainerId, String tenantId, boolean archived) {
        var p = new java.util.HashMap<String, Object>();
        p.put("archived", archived);
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

package com.inclineyou.inclineyou_backend.team;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Phase 3: what the team took, per coach, for the owner.
 *
 * <h2>This is the one carve-out in §0.4, and it is a narrow one</h2>
 *
 * Everywhere else in this feature, money is invisible across coaches: no admin
 * and no owner can see a teammate's `payment`, `package` or `gym_settlement`
 * rows, and `/v1/team/clients/**` is tested for their absence. This class is the
 * exception the PRD argued for in §0.4 and scheduled for Phase 3, because it is
 * the thing a gym owner is actually buying when the coach layer is sold top-down
 * (growth roadmap, Stage 3).
 *
 * Four limits keep it narrow, and each one closes a way this could have become a
 * general money-reading power:
 *
 * <ol>
 *   <li><b>Owner only.</b> Not admins. An admin can run the roster; the numbers
 *       belong to whoever owns the business.</li>
 *   <li><b>Totals only.</b> A sum, a count, and how many clients paid. No
 *       payment rows, no amounts per payment, no dates beyond the range asked
 *       for.</li>
 *   <li><b>No client is ever named.</b> The unit of the answer is a coach and a
 *       date range. "Who paid what" is not derivable from it — which is what
 *       stops this from being the money book by another route.</li>
 *   <li><b>No settlements.</b> `gym_settlement` is a coach's arrangement with a
 *       gym, and stays theirs. The gym's cut per payment
 *       (`payment.gym_share_amount`) is included because it was recorded on the
 *       payment at the time and is the owner's half of that same transaction.</li>
 * </ol>
 *
 * <h2>And the coaches are told</h2>
 *
 * Phase 1's invitation screen promised that nobody in a team can see what
 * another coach has collected. With this endpoint that sentence stops being
 * exactly true, so the app's copy changed with this phase rather than after
 * somebody noticed. A promise quietly narrowed is worse than one that was never
 * made — see the note in `InclineYou_team_coaching_prd.md` §12.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TeamRevenueService {

    private final NamedParameterJdbcTemplate jdbc;
    private final TeamScope scope;

    /**
     * One coach's contribution over the range.
     *
     * @param collected      what they took, of which
     * @param gymShare       the gym's recorded cut — copied onto each payment at
     *                       record time (V11), never recalculated, so a contract
     *                       that changed in October does not move September
     * @param payments       how many entries, so an owner can tell one big
     *                       package from thirty session fees
     * @param payingClients  how many distinct clients paid. A count, never names
     */
    public record CoachRevenue(
            UUID trainerId,
            String coachName,
            String role,
            BigDecimal collected,
            BigDecimal gymShare,
            int payments,
            int payingClients
    ) {}

    public record TeamRevenue(
            String from,
            String to,
            BigDecimal teamCollected,
            BigDecimal teamGymShare,
            List<CoachRevenue> coaches
    ) {}

    /**
     * @param from inclusive, ISO date. Defaults to the first of the current month
     * @param to   inclusive, ISO date. Defaults to today
     */
    @Transactional(readOnly = true)
    public TeamRevenue revenue(UUID trainerId, LocalDate from, LocalDate to) {
        var s = scope.resolve(trainerId);
        UUID teamId = s.requireOwner();

        LocalDate start = from != null ? from : LocalDate.now().withDayOfMonth(1);
        LocalDate end = to != null ? to : LocalDate.now();
        // A range the wrong way round is a caller mistake, not an empty month.
        if (end.isBefore(start)) {
            throw TeamRuleException.badDateRange();
        }

        var rows = jdbc.queryForList("""
                SELECT tm.trainer_id::text AS trainer_id,
                       t.name              AS coach_name,
                       tm.role             AS role,
                       COALESCE(SUM(p.amount), 0)           AS collected,
                       COALESCE(SUM(p.gym_share_amount), 0) AS gym_share,
                       COUNT(p.id)                          AS payments,
                       COUNT(DISTINCT p.client_id)          AS paying_clients
                FROM team_member tm
                JOIN trainer t ON t.id = tm.trainer_id
                -- LEFT JOIN, so a coach who took nothing appears with a zero
                -- rather than vanishing. A missing row reads as "no data" and
                -- invites the owner to go looking for a bug; a zero is an answer.
                LEFT JOIN payment p
                       ON p.trainer_id = tm.trainer_id
                      AND p.deleted_at IS NULL
                      AND p.status = 'paid'
                      -- `paid_at` and not `created_at`: a payment recorded on
                      -- Monday for cash taken on Saturday belongs to Saturday,
                      -- which is the whole reason the column exists. Rows with
                      -- no `paid_at` are pending money and are excluded by the
                      -- status filter anyway.
                      AND p.paid_at >= CAST(:from AS date)
                      AND p.paid_at < CAST(:to AS date) + 1
                WHERE tm.team_id = :teamId::uuid
                  AND tm.status = 'active'
                  AND tm.deleted_at IS NULL
                  AND tm.trainer_id IS NOT NULL
                GROUP BY tm.trainer_id, t.name, tm.role
                ORDER BY collected DESC, t.name
                """, Map.of(
                "teamId", teamId.toString(),
                "from", start.toString(),
                "to", end.toString()));

        var coaches = rows.stream().map(r -> new CoachRevenue(
                UUID.fromString((String) r.get("trainer_id")),
                (String) r.get("coach_name"),
                (String) r.get("role"),
                (BigDecimal) r.get("collected"),
                (BigDecimal) r.get("gym_share"),
                ((Number) r.get("payments")).intValue(),
                ((Number) r.get("paying_clients")).intValue())).toList();

        log.info("team {} revenue read by owner={} range={}..{}", teamId, trainerId, start, end);

        return new TeamRevenue(
                start.toString(),
                end.toString(),
                coaches.stream().map(CoachRevenue::collected)
                        .reduce(BigDecimal.ZERO, BigDecimal::add),
                coaches.stream().map(CoachRevenue::gymShare)
                        .reduce(BigDecimal.ZERO, BigDecimal::add),
                coaches);
    }
}

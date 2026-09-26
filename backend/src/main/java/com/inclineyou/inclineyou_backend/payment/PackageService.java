package com.inclineyou.inclineyou_backend.payment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.inclineyou.inclineyou_backend.session.DiaryService;

/**
 * `package` — WHAT ONE CLIENT BOUGHT. Its neighbour {@link PackService} owns
 * `pack`, the price list; one letter, two different things, and
 * {@code PackService}'s class comment carries the argument.
 *
 * <h2>A package has a life, and this file is most of it</h2>
 *
 * V1 gave a sold package a count, a price and two dates. V11 gave it a debt
 * side. Between "sold" and "paid for", nothing could happen to it — and real
 * coaching arrangements are made almost entirely of things happening to them.
 * V30 added the three that matter, and they are the three a trainer otherwise
 * keeps in a parallel notebook:
 *
 * <ul>
 *   <li><b>Pause</b> — the client is in Kerala for three weeks. The clock stops,
 *       the pack stays theirs, and no session can be charged against it.</li>
 *   <li><b>Extend</b> — a fortnight thrown in because somebody had a bad month.
 *       Goodwill, logged, so it is a fact next time rather than a feeling.</li>
 *   <li><b>Close</b> — the twelfth session was trained, or the validity ran out.
 *       Nothing used to notice, so the thirteenth session was free.</li>
 * </ul>
 *
 * <h2>Pause is a column, not a status — and that is deliberate</h2>
 *
 * {@code status} stays 'active' for a paused pack. A pause is not the end of an
 * arrangement, it is a hold inside one: it is still the client's current pack,
 * still what a renewal continues from, still what the money book is owed
 * against. Folding it into {@code status} would make every existing
 * {@code WHERE status = 'active'} read — the deck, the money book,
 * {@code markDone}'s pack picker, {@code pack.activeClients} — silently drop a
 * client who is on holiday.
 *
 * What the pause DOES gate is the decrement, and it gates it in the one place
 * that matters: {@code ScheduledSessionService.markDone} will not charge a pack
 * with {@code paused_at} set. Server-side, so it holds however the session was
 * marked.
 *
 * <h2>The lifecycle sweep runs on read</h2>
 *
 * See {@link #sweepLifecycle}. There is no scheduler in this application and
 * adding one for this would be a second source of truth about a fact any read
 * can derive.
 *
 * <h2>Every refusal is a sentence</h2>
 *
 * Through {@link PackageRuleException}, never {@code ResponseStatusException} —
 * see {@link PackRuleException} for why the difference is visible to a trainer
 * and not only to a log. The two legacy {@code ResponseStatusException}s on the
 * payments path below are unchanged on purpose: their callers read the status
 * and nothing else, and rewriting them is a change to a contract this pass is
 * not about.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PackageService {

    private final NamedParameterJdbcTemplate jdbc;
    /**
     * V3 · a sale writes the diary it implies.
     *
     * <p>The rhythm lives on the client and the count lives on the pack, and
     * until this field existed nothing joined the two — so a trainer who had
     * just sold twelve sessions and agreed Mon/Wed/Fri opened the schedule and
     * found it empty. {@link DiaryService} carries the whole argument.
     */
    private final DiaryService diary;
    /** V18 · facts for the client's bell, gated by their own switches. */
    private final com.inclineyou.inclineyou_backend.notification.ClientNotificationService clientBell;

    private static final ObjectMapper STORE = new ObjectMapper();

    private static final Set<String> TYPES = Set.of("session_pack", "monthly", "single");

    /** A sanity bound on goodwill, not a policy. Ten years is a mistyped year. */
    private static final int MAX_EXTEND_DAYS = 365;

    /**
     * A sanity bound on a corrected session count, not a policy. Nobody sells a
     * five-hundred-session personal-training pack; a number above it is a
     * fat-fingered digit, and clamping it silently is how a client ends up with
     * a pack nobody can explain.
     */
    private static final int MAX_SESSIONS = 500;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    /**
     * One package a client bought.
     *
     * <p><b>The eleven fields through {@code updatedAt} are V1's and their order
     * is frozen</b> — every existing caller on both halves destructures by name
     * from a shape that ends there, and the additive-only law is what lets an old
     * reader keep working. Everything V30 needs is APPENDED, in the same move
     * {@code PaymentResponse.gymShareAmount} made.
     *
     * <p>{@code amountPaid} and {@code amountDue} are computed in SQL rather than
     * left to the caller, for {@code PackService.activeClients}' reason: every
     * screen that draws a package wants them, and deriving them in the browser
     * means shipping the payment ledger to screens that have no other use for it.
     * It also settles a real defect — three components on the web summed
     * {@code status === 'confirmed'} while this service writes {@code 'paid'}, so
     * the client file showed every paid-up client as owing the full amount.
     * A figure computed once, next to the rows it is computed from, cannot drift
     * from a second opinion about a vocabulary.
     */
    public record PackageResponse(
            String id,
            String clientId,
            String type,
            Integer sessionsTotal,
            Integer sessionsRemaining,
            BigDecimal amount,
            String currency,
            String startDate,
            String endDate,
            String status,
            long createdAt,
            long updatedAt,
            /* ── appended by V30 ─────────────────────────────────────────── */
            /** Which price-list entry it was sold from, or null for a free-typed sale. */
            String packId,
            /** Set while the clock is stopped. Null means running. */
            Long pausedAt,
            /** Days spent paused, all time — how far `endDate` has been pushed out. */
            int pausedDays,
            /** When it stopped being live. Null while it still is. */
            Long closedAt,
            String dueDate,
            BigDecimal discountAmount,
            /** Sum of every collected payment against it. See the note above. */
            BigDecimal amountPaid,
            /** `amount − paid − writtenOff`, floored at zero. */
            BigDecimal amountDue,
            /**
             * How many sessions THIS REQUEST put in the diary. V3.
             *
             * <p>Not a {@code package} column and not pretending to be one — it is
             * what the sale did, which is what lets the panel say "12 booked,
             * first on Monday" instead of closing silently. Counting the diary
             * afterwards would answer a different question: a client with four
             * sessions already on the board comes back as sixteen.
             *
             * <p>Null on every read, because a read did not book anything. Zero is
             * a real answer on a sale — a pack sold to somebody whose days are not
             * agreed yet books nothing, and the panel says so rather than implying
             * a diary that is not there.
             *
             * <p>APPENDED LAST.
             */
            Integer sessionsBooked
    ) {}

    /**
     * Sell a package.
     *
     * <p>{@code type} and {@code amount} were required in V1 and stay required
     * only when {@code packId} is absent — see {@link #createPackage}. The four
     * appended fields are the V30 half: sold FROM a price-list entry, at a
     * discount, with a date the money is owed by.
     */
    public record CreatePackageRequest(
            String type,
            Integer sessionsTotal,
            BigDecimal amount,
            String startDate,
            String endDate,
            /* ── appended by V30 ─────────────────────────────────────────── */
            /** The price-list entry to sell. Fills in everything left blank. */
            String packId,
            /** What was knocked off the list price at the till. `amount` is already net. */
            BigDecimal discountAmount,
            /** When the money is owed by. Without it there is no such thing as "11 days late". */
            String dueDate,
            /* ── appended by V3 · the sale books the sessions ──────────────── */
            /**
             * The days and times agreed at the till. {@code weekday} 1 = Monday …
             * 7 = Sunday, the convention {@code client.weekly_schedule} and
             * {@code program.schedule} share — {@code SessionPlanner} states it.
             *
             * <p>This is what makes a sale produce a DIARY rather than a number.
             * It is written onto the CLIENT, because it is their standing week and
             * not this pack's: the next pack books on the same rhythm without
             * anyone re-typing it, and the phone's {@code weekly_schedule} is the
             * same field.
             *
             * <p>Omitted or empty means <b>leave their week alone</b>, which is the
             * right default for a second pack sold to somebody who has been coming
             * on Tuesdays for a year. It never means <i>book nothing</i>.
             */
            List<Map<String, Object>> weeklySchedule,
            /** How long their sessions run, if the sale is the moment it was settled. */
            Integer sessionDurationMinutes
    ) {}

    /**
     * Repeat a pack that has run out.
     *
     * <p>Every field is optional and every one of them defaults to what the
     * expiring pack said, because that is what renewing MEANS. A trainer standing
     * on a gym floor renewing a client's block should not be asked to re-type a
     * price they set last month — {@code POST /v1/packages/{id}/renew} with an
     * empty body is the whole interaction, and the overrides exist for the sale
     * where something genuinely changed.
     */
    public record RenewPackageRequest(
            String packId,
            Integer sessionsTotal,
            BigDecimal amount,
            BigDecimal discountAmount,
            String startDate,
            String dueDate
    ) {}

    /** Pause or resume. The reason is free text and is never parsed. */
    public record PausePackageRequest(String reason, String effectiveAt) {}

    /** Goodwill, in days. */
    public record ExtendPackageRequest(@NotNull Integer days, String reason) {}

    /**
     * A correction, in sessions. V4.
     *
     * <p>{@code sessionsTotal} is the number the pack SHOULD have been sold
     * with, absolute rather than a delta, because that is the number the trainer
     * knows — "it was twelve, not ten". The delta is derived and it is the delta
     * that is logged.
     *
     * <p>It never carries an amount. See {@link #correctSessions}.
     */
    public record CorrectSessionsRequest(@NotNull Integer sessionsTotal, String reason) {}

    /**
     * One entry in a package's history. Append-only; see V30.
     *
     * <p>{@code sessions} is V4 and is the signed change a correction made to
     * the count. Zero on every pause, resume and extend — those move days — so
     * a reader can take whichever of the two fields its {@code kind} is about.
     */
    public record AdjustmentResponse(
            String id,
            String packageId,
            String kind,
            int days,
            int sessions,
            String reason,
            long effectiveAt,
            long createdAt
    ) {}

    public record PaymentResponse(
            String id,
            String clientId,
            String packageId,
            BigDecimal amount,
            String currency,
            String method,
            String collectedBy,
            String status,
            String upiReference,
            Long paidAt,
            long createdAt,
            long updatedAt,
            /*
             * The gym's cut, copied onto the row at record time — V11 stores it
             * rather than looking the percentage up later, so that a contract
             * changing in October cannot move September's split.
             *
             * APPENDED LAST, and that position is the additive-only contract
             * rather than tidiness: every existing caller destructures by name
             * and a reader written against the twelve-field shape keeps working.
             * It was already on the wire inside the sync envelope; the trainer's
             * own `yours = billed - cut` was the one figure REST could not
             * compute, which is what put it here.
             */
            BigDecimal gymShareAmount,
            /*
             * "He paid the rest in cash on Tuesday." Free text, never parsed.
             *
             * The column is V11's and has been on the wire inside the sync
             * envelope since then; REST simply never selected it, so a note
             * written on the phone was invisible to the web and the web had
             * nowhere to write one. Appended after `gymShareAmount` for the
             * reason that field is appended last.
             */
            String note,
            /*
             * ── APPENDED BY V8 · THE BILL ────────────────────────────────────
             * `INV-<FY>-<NNNN>`, or null until somebody presses *Raise an
             * invoice*. Minted on request and never on write, so null is the
             * common case and not a gap. It is what decides between the button
             * and the number on each row of the client file's Payments tab.
             */
            String invoiceNo,
            /** Epoch ms the number was minted. Null with {@code invoiceNo}. */
            Long invoicedAt
    ) {}

    /**
     * Recording a payment. Three fields were required and three are now optional,
     * and the optional ones are what make this the ten-second job it has to be —
     * it is done standing on a gym floor with a client waiting.
     *
     * <p><b>{@code paidAt} is what says the money actually arrived.</b> Before it,
     * every payment this route wrote was {@code 'pending'} and only
     * {@code PATCH /v1/payments/{id}/confirm} could move it — which is right for a
     * UPI intent fired optimistically, and wrong for the two commonest cases in
     * this business. Cash in a hand and a gym counter's slip are already settled
     * when they are typed, and a book that filed them as pending showed a trainer
     * who had been paid in full a month of debt they did not have.
     *
     * <p>So: send {@code paidAt} and the row is written {@code 'paid'} with the
     * gym's cut stamped on it there and then, by the same rule
     * {@link #confirmPayment} applies. Omit it and nothing changes — a pending row,
     * waiting to be confirmed. It also carries the DATE, which is the other half:
     * a trainer catching up on Sunday must be able to say the money came on
     * Thursday, and {@code paid_at} is the column that already meant that.
     */
    public record CreatePaymentRequest(
            @NotNull BigDecimal amount,
            @NotBlank String method,
            @NotBlank String collectedBy,
            /** Epoch ms. Present = the money has arrived; null = still pending. */
            Long paidAt,
            /** Free text, never parsed. Optional on every method, not just UPI. */
            String note,
            /**
             * The UPI reference, when there is one at record time. It was already
             * being SENT by the web's record panel and silently dropped here: only
             * `confirm` wrote the column, so a reference typed into the form went
             * nowhere.
             */
            String upiReference
    ) {}

    /**
     * The money arrived. Every field optional.
     *
     * <p>{@code method} and {@code paidAt} are V8's: a trainer settling Tuesday's
     * cash on Thursday must be able to say Tuesday, and a pending row whose
     * method was never known must be able to learn it at the moment it is
     * settled. Absent means what it always meant — now, and the method already
     * on the row.
     */
    public record ConfirmPaymentRequest(
            String upiReference,
            String method,
            /** Epoch ms. Not in the future (a few minutes of clock skew are forgiven). */
            Long paidAt
    ) {}

    /** Why it is being written off. Optional; appended to the row's note. */
    public record WriteOffRequest(String reason) {}

    /**
     * The one row of columns every read of this table selects — the same device
     * `ScheduledSessionService` uses, and for the same reason: four reads that
     * spell their own SELECT are four places `gym_share_amount` had to be added.
     */
    private static final String PAYMENT_COLUMNS =
            "id::text, client_id::text, package_id::text, amount, currency, method, " +
            "collected_by, status, upi_reference, paid_at, gym_share_amount, note, " +
            "created_at, updated_at, invoice_no, invoiced_at";

    /**
     * Likewise for `package`, and V30 is why it is a text block now.
     *
     * <p>{@code amount_paid} is a correlated sum and it accepts BOTH
     * {@code 'paid'} and {@code 'confirmed'}. That is not indecision: this
     * service writes 'paid', the sync envelope has carried 'confirmed' from the
     * phone since V1, and both mean *the money arrived*. The web's
     * {@code lib/money/compute.ts} already takes both; the three components that
     * took only 'confirmed' were the ones showing a paid-up client as owing
     * everything. A write-off is deliberately NOT counted here — it stops being
     * chased without ever having been collected, which is why V11 stores it as
     * its own amount, and {@code amount_due} subtracts it separately.
     */
    private static final String PACKAGE_COLUMNS = """
            p.id::text, p.client_id::text, p.type, p.sessions_total, p.sessions_remaining,
            p.amount, p.currency, p.start_date::text, p.end_date::text, p.status,
            p.pack_id::text, p.paused_at, p.paused_days, p.closed_at,
            p.due_date::text, p.discount_amount, p.written_off_amount,
            COALESCE((
                SELECT SUM(pay.amount) FROM payment pay
                 WHERE pay.package_id = p.id
                   AND pay.status IN ('paid', 'confirmed')
                   AND pay.deleted_at IS NULL
            ), 0) AS amount_paid,
            p.created_at, p.updated_at
            """;

    // ── The lifecycle sweep ───────────────────────────────────────────────────

    /**
     * CLOSE EVERY PACK THAT HAS QUIETLY FINISHED, then answer the read.
     *
     * <p>Nothing in this codebase ever moved a package off {@code 'active'}. A
     * twelve-session block whose twelfth session was trained in March stayed
     * active in August; so did one whose three-month validity lapsed in April. So
     * {@code GET /v1/packages?status=active} was not a list of live packs, the
     * deck's *who is running out* counted arrangements that had already ended,
     * and {@code pack.activeClients} — the count that makes retiring a price a
     * decision — was inflated by every client who had finished.
     *
     * <h2>Why on read and not on a schedule</h2>
     *
     * Because the fact is DERIVED and the sweep only writes it down. A pack with
     * no sessions left is finished at the instant the last one is logged, whether
     * or not a job has run; a scheduler would be a second, laggier opinion about
     * something any read can compute, and this application has no scheduler to
     * put it in. Running it here means the answer is never stale by more than the
     * request that asks for it.
     *
     * <p>It is idempotent and its {@code WHERE} is covered by V30's partial index
     * on the live set, so the steady state is a scan of a handful of rows that
     * updates none of them.
     *
     * <h2>Two outcomes, and the difference is the trainer's</h2>
     *
     * {@code completed} when the sessions ran out — the pack did its job, and
     * the conversation is a renewal. {@code expired} when the calendar ran out
     * with sessions still on it — the client lost something they paid for, and
     * the conversation is a different one. Exhaustion wins when both are true on
     * the same day, because the sessions were delivered.
     *
     * <h2>What it will not touch</h2>
     *
     * A PAUSED pack, ever. That is the whole point of a pause: the client is in
     * Kerala, their validity is not running, and a sweep that expired it while
     * they were away would be the bug this feature exists to prevent.
     *
     * <p>{@code CURRENT_DATE} is the server's, which is behind IST rather than
     * ahead of it — so a pack that lapses at midnight in India is closed a few
     * hours late rather than a few hours early. That is the right direction for a
     * rounding error about somebody's money to fall.
     *
     * <p>Deliberately NOT {@code @Transactional}: every caller invokes it on
     * {@code this}, which goes straight past the proxy, so the annotation would
     * be decoration that reads as a guarantee. It does not need one — a single
     * UPDATE is atomic by itself, and it is idempotent, so a caller that is
     * already inside a transaction simply enlists it.
     */
    private void sweepLifecycle(String tid) {
        int closed = jdbc.update("""
                UPDATE package SET
                    status = CASE
                        WHEN sessions_total IS NOT NULL AND COALESCE(sessions_remaining, 0) <= 0
                            THEN 'completed'
                        ELSE 'expired'
                    END,
                    closed_at  = NOW(),
                    updated_at = NOW()
                WHERE trainer_id = :tid::uuid
                  AND status = 'active'
                  AND deleted_at IS NULL
                  AND paused_at IS NULL
                  AND (
                        (sessions_total IS NOT NULL AND COALESCE(sessions_remaining, 0) <= 0)
                     OR (end_date IS NOT NULL AND end_date < CURRENT_DATE)
                  )
                """, Map.of("tid", tid));
        if (closed > 0) log.info("package sweep trainer={} closed={}", tid, closed);
    }

    // ── Packages · reads ──────────────────────────────────────────────────────

    public List<PackageResponse> listPackages(UUID trainerId, String clientId) {
        String tid = trainerId.toString();
        requireClientOwnership(clientId, tid);
        sweepLifecycle(tid);
        var rows = jdbc.queryForList("""
                SELECT %s
                FROM package p
                WHERE p.client_id = :cid::uuid AND p.trainer_id = :tid::uuid AND p.deleted_at IS NULL
                ORDER BY p.created_at DESC
                """.formatted(PACKAGE_COLUMNS), Map.of("cid", clientId, "tid", tid));
        return rows.stream().map(this::toPackageResponse).toList();
    }

    /**
     * Every package this trainer has ever sold, newest first.
     *
     * THE ROSTER-WIDE READ THE PER-CLIENT ROUTE CANNOT BE. Its sibling above
     * answers "what has this one person bought", which is the client file's
     * question. Two screens ask a different one — the deck's *who is running
     * out* and the money book's *what is live* — and answering it through the
     * per-client route means one request per client on the screen a trainer
     * opens every morning. At 22 clients that is 22 requests against a 120/min
     * ceiling, so a refresh is rate-limited for reading a dashboard.
     *
     * `status` narrows it because the caller that wants live packs does not want
     * two years of finished ones; omitting it returns them all.
     *
     * <p><b>Since V30 `status=active` means it, and that is a correction rather
     * than a change.</b> The sweep above has already closed anything exhausted or
     * lapsed, so this no longer answers with packs that finished in March. Two
     * callers depended on the old behaviour and neither is worse off: the money
     * book's *Ending soon* already filtered {@code sessionsRemaining > 0}, and
     * the panel that records a payment now asks for packs with money outstanding
     * instead — which is the right question, because a client can finish twelve
     * sessions and still owe for four of them.
     */
    public List<PackageResponse> listAllPackages(UUID trainerId, String status) {
        String tid = trainerId.toString();
        sweepLifecycle(tid);

        var p = new HashMap<String, Object>();
        p.put("tid", tid);

        String filter = "";
        if (status != null && !status.isBlank()) {
            p.put("status", status);
            filter = "AND p.status = :status";
        }

        var rows = jdbc.queryForList("""
                SELECT %s
                FROM package p
                WHERE p.trainer_id = :tid::uuid AND p.deleted_at IS NULL %s
                ORDER BY p.created_at DESC
                """.formatted(PACKAGE_COLUMNS, filter), p);
        return rows.stream().map(this::toPackageResponse).toList();
    }

    /** One package's pause / resume / extend history, oldest first. */
    public List<AdjustmentResponse> listAdjustments(UUID trainerId, String packageId) {
        String tid = trainerId.toString();
        readPackage(packageId, tid);
        var rows = jdbc.queryForList("""
                SELECT id::text, package_id::text, kind, days, sessions, reason,
                       effective_at, created_at
                FROM package_adjustment
                WHERE package_id = :pid::uuid AND trainer_id = :tid::uuid
                ORDER BY effective_at, created_at
                """, Map.of("pid", packageId, "tid", tid));
        return rows.stream().map(r -> new AdjustmentResponse(
                str(r.get("id")),
                str(r.get("package_id")),
                str(r.get("kind")),
                toInt(r.get("days")) == null ? 0 : toInt(r.get("days")),
                toInt(r.get("sessions")) == null ? 0 : toInt(r.get("sessions")),
                str(r.get("reason")),
                toEpochMilli(r.get("effective_at")),
                toEpochMilli(r.get("created_at")))).toList();
    }

    // ── Packages · the sale ───────────────────────────────────────────────────

    /**
     * SELL A PACKAGE — now from the price list, which is what makes the price
     * list worth keeping.
     *
     * <p>V11 added {@code package.pack_id} and, until this pass, <b>nothing ever
     * wrote it</b>. Every sale through REST was free-typed: the trainer's own
     * name, session count and validity sat in {@code pack} and were re-entered by
     * hand into a form, {@code validity_days} never became an {@code end_date},
     * and {@code pack.activeClients} counted zero for every pack in the list
     * because no sold row pointed back at one. The price list was a document
     * rather than a mechanism.
     *
     * <p>So: <b>pass {@code packId} and everything else is optional.</b> Type,
     * session count and price come off the price-list entry, and its
     * {@code validity_days} becomes a real {@code end_date} counted from the
     * start. Anything sent alongside it OVERRIDES it, because the commonest
     * reason to send an amount is that this one client is paying something else —
     * which is what {@code discountAmount} records the why of.
     *
     * <p>Without {@code packId} the V1 contract is untouched: {@code type} and
     * {@code amount} are required, and a caller that has never heard of a price
     * list keeps working exactly as it did.
     */
    @Transactional
    public PackageResponse createPackage(UUID trainerId, String clientId, CreatePackageRequest req) {
        return sell(trainerId, clientId, req, "sold");
    }

    /** The sale itself, told whether it is a first sale or a renewal — the client's bell says which. */
    private PackageResponse sell(UUID trainerId, String clientId, CreatePackageRequest req, String verb) {
        String tid = trainerId.toString();
        requireClientOwnership(clientId, tid);

        Map<String, Object> pack = req.packId() == null || req.packId().isBlank()
                ? null
                : readPack(req.packId(), tid);

        String type = firstNonBlank(req.type(), pack == null ? null : str(pack.get("type")));
        if (type == null) throw PackageRuleException.unknownValue("type", "(missing)");
        if (!TYPES.contains(type)) throw PackageRuleException.unknownValue("type", type);

        BigDecimal amount = req.amount() != null
                ? req.amount()
                : pack == null ? null : toDecimal(pack.get("amount"));
        if (amount == null || amount.signum() <= 0) throw PackageRuleException.needsPrice();

        /*
         * Same shape as `PackService.createPack`, and written as if/else for the
         * same reason: a chained ternary with an `int` arm unboxes the whole
         * expression, so a session pack posted with no count threw a 500 before
         * any validation could name it.
         */
        Integer sessionsTotal;
        if ("monthly".equals(type)) {
            sessionsTotal = null;
        } else if ("single".equals(type)) {
            sessionsTotal = 1;
        } else {
            sessionsTotal = req.sessionsTotal() != null
                    ? req.sessionsTotal()
                    : pack == null ? null : toInt(pack.get("sessions"));
        }
        if (sessionsTotal != null && sessionsTotal <= 0) throw PackageRuleException.needsSessions();
        if ("session_pack".equals(type) && sessionsTotal == null) throw PackageRuleException.needsSessions();

        LocalDate startDate = req.startDate() != null && !req.startDate().isBlank()
                ? parseDate(req.startDate(), "startDate")
                : LocalDate.now();

        /*
         * The price list's `validity_days` finally becomes a date. Explicitly
         * sent `endDate` still wins — a trainer who typed one meant it — and a
         * pack with no validity keeps a null end date, which is what most Indian
         * trainers actually run and V11's column comment already says.
         */
        LocalDate endDate;
        if (req.endDate() != null && !req.endDate().isBlank()) {
            endDate = parseDate(req.endDate(), "endDate");
        } else {
            Integer validityDays = pack == null ? null : toInt(pack.get("validity_days"));
            endDate = validityDays != null && validityDays > 0 ? startDate.plusDays(validityDays) : null;
        }

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        int sessionsRemaining = sessionsTotal != null ? sessionsTotal : 0;

        var p = new HashMap<String, Object>();
        p.put("id",                id.toString());
        p.put("tid",               tid);
        p.put("cid",               clientId);
        p.put("type",              type);
        p.put("sessionsTotal",     sessionsTotal);
        p.put("sessionsRemaining", sessionsRemaining);
        p.put("amount",            amount);
        p.put("currency",          "INR");
        p.put("startDate",         java.sql.Date.valueOf(startDate));
        p.put("endDate",           endDate == null ? null : java.sql.Date.valueOf(endDate));
        p.put("packId",            pack == null ? null : str(pack.get("id")));
        p.put("discountAmount",    req.discountAmount());
        p.put("dueDate",           req.dueDate() == null || req.dueDate().isBlank()
                                        ? null
                                        : java.sql.Date.valueOf(parseDate(req.dueDate(), "dueDate")));
        p.put("now",               Timestamp.from(now));

        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                    amount, currency, start_date, end_date, status, pack_id, discount_amount, due_date,
                    created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :type, :sessionsTotal, :sessionsRemaining,
                    :amount, :currency, :startDate, :endDate, 'active', :packId::uuid, :discountAmount,
                    :dueDate, :now, :now)
                """, p);

        /* ── AND NOW THE DIARY, WHICH IS THE HALF THAT WAS MISSING ────────────

           A sale used to end one line above this: a package row, a pending
           payment, and a trainer who had just agreed Mon/Wed/Fri at 7am with the
           client in front of them opening the schedule to find it empty. The pack
           said `12 of 12 left` and the diary said nothing was happening.

           The days come in on the sale now, because that is the same
           conversation as the price, and they are written onto the CLIENT rather
           than onto this pack: it is their standing week, so the next pack books
           on the same rhythm without anyone re-typing it, and the phone reads the
           same column. `writeStandingWeek` answers false when the sale carried no
           days, and the client's existing rhythm is then what gets booked.

           Inside this method's transaction on purpose — a sale that books nothing
           because the diary write failed is the shape nobody ever finds. */
        writeStandingWeek(clientId, tid, req.weeklySchedule(), req.sessionDurationMinutes());
        var booked = diary.reconcile(trainerId, clientId);

        // Re-read rather than reconstruct: `amountPaid` is a correlated sum and
        // is zero on a fresh row only until the panel that sold this records the
        // deposit against it. Reading is one query and cannot be wrong.
        var sold = withBooked(getPackage(tid, id.toString()), booked.booked());
        clientBell.mint(clientId, "pack", sold.amount(), null, verb);
        return sold;
    }

    /**
     * The rhythm the sale carried, onto the client it belongs to.
     *
     * <p>{@code sessions_per_week} is kept in step here rather than anywhere
     * else, because it is the same fact counted: the portal's progress screen
     * reads it as <i>the agreed frequency</i> and draws "3 of 4 this week" from
     * it, and a client who moved to four days while that column still said three
     * would be told they are behind on a week they finished.
     *
     * <p>Returns false for an empty week, and writes nothing in that case — an
     * absent schedule on a sale means <i>leave their week alone</i>, never
     * <i>they train no days</i>. {@code PackageService} is not the only writer of
     * this column and must not clear what {@code ClientService} put there.
     */
    private boolean writeStandingWeek(String clientId, String tid,
                                      List<Map<String, Object>> schedule,
                                      Integer durationMinutes) {
        var slots = com.inclineyou.inclineyou_backend.session.SessionPlanner.parseSlots(schedule);
        if (slots.isEmpty() && durationMinutes == null) return false;

        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("cid", clientId);
        p.put("tid", tid);
        if (!slots.isEmpty()) {
            p.put("week", toJson(slots));
            p.put("perWeek", slots.size());
            sets.add("weekly_schedule = CAST(:week AS jsonb)");
            sets.add("sessions_per_week = :perWeek");
        }
        if (durationMinutes != null) {
            p.put("duration", durationMinutes);
            sets.add("session_duration_minutes = :duration");
        }
        sets.add("updated_at = NOW()");
        jdbc.update("UPDATE client SET " + String.join(", ", sets) +
                " WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);
        return !slots.isEmpty();
    }

    /** The normalised week, as the jsonb the column and the phone both expect. */
    private static String toJson(List<com.inclineyou.inclineyou_backend.session.SessionPlanner.Slot> slots) {
        try {
            return STORE.writeValueAsString(slots.stream()
                    .map(s -> Map.of("templateDay", s.templateDay(),
                                     "weekday", s.weekday(),
                                     "time", s.time()))
                    .toList());
        } catch (Exception e) {
            // Three ints and a string cannot fail to serialise; this exists so the
            // checked exception does not leak into the sale's signature.
            throw new IllegalStateException("weekly schedule would not serialise", e);
        }
    }

    /** The read's response, told what this request booked. See {@code sessionsBooked}. */
    private static PackageResponse withBooked(PackageResponse r, int booked) {
        return new PackageResponse(r.id(), r.clientId(), r.type(), r.sessionsTotal(),
                r.sessionsRemaining(), r.amount(), r.currency(), r.startDate(), r.endDate(),
                r.status(), r.createdAt(), r.updatedAt(), r.packId(), r.pausedAt(),
                r.pausedDays(), r.closedAt(), r.dueDate(), r.discountAmount(),
                r.amountPaid(), r.amountDue(), booked);
    }

    /**
     * RENEW — the most revenue-critical interaction in the product, and it has to
     * be one tap.
     *
     * <p>A trainer renews a client while standing next to them on a gym floor
     * with forty seconds before the next session. An empty body is the whole
     * request: same type, same price, same session count, same validity WINDOW,
     * and the new pack starts where the old one stopped.
     *
     * <h2>"Dates continue from expiry" — three cases</h2>
     *
     * <ul>
     *   <li>Renewed EARLY, which is the good case and the one a nudge is for: the
     *       old pack runs to the 30th, so the new one starts on the 1st. The
     *       client is not charged twice for the same fortnight and the trainer is
     *       not asked to diary it.</li>
     *   <li>Renewed LATE: the old pack lapsed three weeks ago. The new one starts
     *       TODAY — back-dating it would silently hand back validity nobody had,
     *       which is a gift the trainer did not choose to give. {@code extend} is
     *       how you choose to give it, and it leaves a row saying so.</li>
     *   <li>No expiry at all: the new pack has none either. It runs until the
     *       sessions are used, which is how most of these are actually sold.</li>
     * </ul>
     *
     * <h2>Where the validity window comes from</h2>
     *
     * The price-list entry, if the old pack still points at one and it still
     * carries a {@code validity_days}. Otherwise the OLD PACK'S OWN SPAN, minus
     * whatever it spent paused — a block sold with ninety days renews with
     * ninety days even if the price was retired last month, and the three weeks
     * the client spent in Kerala do not become part of the window forever.
     */
    @Transactional
    public PackageResponse renewPackage(UUID trainerId, String packageId, RenewPackageRequest req) {
        String tid = trainerId.toString();
        var old = readPackage(packageId, tid);
        String clientId = str(old.get("client_id"));
        if (req == null) req = new RenewPackageRequest(null, null, null, null, null, null);

        String packId = firstNonBlank(req.packId(), str(old.get("pack_id")));
        Map<String, Object> pack = packId == null ? null : readPackOrNull(packId, tid);

        LocalDate today = LocalDate.now();
        LocalDate oldEnd = toLocalDate(old.get("end_date"));

        LocalDate startDate;
        if (req.startDate() != null && !req.startDate().isBlank()) {
            startDate = parseDate(req.startDate(), "startDate");
        } else if (oldEnd != null && oldEnd.isAfter(today)) {
            startDate = oldEnd.plusDays(1);
        } else {
            startDate = today;
        }

        Integer validityDays = pack == null ? null : toInt(pack.get("validity_days"));
        if (validityDays == null && oldEnd != null) {
            LocalDate oldStart = toLocalDate(old.get("start_date"));
            if (oldStart != null) {
                Integer paused = toInt(old.get("paused_days"));
                long span = ChronoUnit.DAYS.between(oldStart, oldEnd) - (paused == null ? 0 : paused);
                if (span > 0) validityDays = (int) span;
            }
        }

        var create = new CreatePackageRequest(
                str(old.get("type")),
                req.sessionsTotal() != null ? req.sessionsTotal() : toInt(old.get("sessions_total")),
                req.amount() != null ? req.amount() : toDecimal(old.get("amount")),
                startDate.toString(),
                // Computed here rather than left to `createPackage`'s pack lookup,
                // because the window may have come from the old pack's own span
                // and that is a fact only this method has.
                validityDays != null && validityDays > 0 ? startDate.plusDays(validityDays).toString() : null,
                packId,
                req.discountAmount(),
                req.dueDate(),
                /* A renewal never re-asks the days: the client has been coming on
                   Tuesdays for six months, and a form between a trainer and a
                   renewal is what `renewPackage`'s own note refuses. Null leaves
                   their week exactly as it is, and `createPackage` then books the
                   new count onto it. */
                null,
                null);

        PackageResponse fresh = sell(trainerId, clientId, create, "renewed");
        log.info("package renewed trainer={} client={} from={} to={}", tid, clientId, packageId, fresh.id());
        return fresh;
    }

    // ── Packages · pause, resume, extend ──────────────────────────────────────

    /**
     * STOP THE CLOCK. The client is travelling.
     *
     * <p>Nothing about the pack changes except that it will not be charged and
     * its validity stops running. It is still their current pack, it still shows
     * on their file, and the money still owed on it is still owed — which is why
     * this is a column and not a {@code status}, and why every roster read still
     * counts them as an active client.
     *
     * <p>{@code effectiveAt} is accepted because trainers catch up on Sundays. A
     * pause backdated to the Thursday the client actually left gives back the
     * right number of days when it resumes; one stamped at the moment it was
     * typed gives back three too few.
     */
    @Transactional
    public PackageResponse pausePackage(UUID trainerId, String packageId, PausePackageRequest req) {
        String tid = trainerId.toString();
        var pkg = readPackage(packageId, tid);
        requireLive(pkg);
        if (pkg.get("paused_at") != null) throw PackageRuleException.alreadyPaused();

        Instant effective = req == null ? null : parseInstant(req.effectiveAt(), "effectiveAt");
        if (effective == null) effective = Instant.now();

        jdbc.update("""
                UPDATE package SET paused_at = :at, updated_at = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", packageId, "tid", tid, "at", Timestamp.from(effective)));

        // Zero days: an open pause has no length yet. The resume row carries it.
        logAdjustment(tid, packageId, "pause", 0, req == null ? null : req.reason(), effective);
        return getPackage(tid, packageId);
    }

    /**
     * START IT AGAIN, and give back exactly the days the pause cost.
     *
     * <p>The days are counted from the pause's own stamp to now, and pushed onto
     * {@code end_date} — so a client who lost three weeks in Kerala gets three
     * weeks, not a round number somebody guessed. {@code paused_days} accumulates
     * them so "expires 14 November" stays a date the trainer can show the working
     * for; the adjustment row records it so they can show it months later.
     *
     * <p>A pack with no expiry gets the row and no date arithmetic. There was
     * nothing running down, so there is nothing to give back — but the pause and
     * resume still happened, and the history should say so.
     */
    @Transactional
    public PackageResponse resumePackage(UUID trainerId, String packageId, PausePackageRequest req) {
        String tid = trainerId.toString();
        var pkg = readPackage(packageId, tid);
        Object pausedAt = pkg.get("paused_at");
        if (pausedAt == null) throw PackageRuleException.notPaused();

        Instant resumedAt = req == null ? null : parseInstant(req.effectiveAt(), "effectiveAt");
        if (resumedAt == null) resumedAt = Instant.now();

        Instant pausedInstant = toInstant(pausedAt);
        long days = pausedInstant == null ? 0 : ChronoUnit.DAYS.between(pausedInstant, resumedAt);
        // A pause and resume inside the same day cost nothing, and a clock skew
        // must never SHORTEN a client's validity. Floored, not rounded.
        int lost = (int) Math.max(0, days);

        var p = new HashMap<String, Object>();
        p.put("id",   packageId);
        p.put("tid",  tid);
        p.put("lost", lost);
        jdbc.update("""
                UPDATE package SET
                    paused_at   = NULL,
                    paused_days = COALESCE(paused_days, 0) + :lost,
                    -- DATE + INTEGER is a DATE in Postgres, which is what this
                    -- column is. `+ INTERVAL` would hand back a TIMESTAMP and
                    -- lean on an assignment cast to put it away again.
                    end_date    = CASE WHEN end_date IS NULL THEN NULL
                                       ELSE end_date + CAST(:lost AS INTEGER) END,
                    updated_at  = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, p);

        logAdjustment(tid, packageId, "resume", lost, req == null ? null : req.reason(), resumedAt);
        return getPackage(tid, packageId);
    }

    /**
     * GOODWILL, IN DAYS — a fortnight thrown in because somebody had a bad month.
     *
     * <p>The cheapest thing a trainer ever gives away and the easiest to forget
     * having given. The row in {@code package_adjustment} is most of the point:
     * "I have already stretched this twice" is a fact a trainer can look up
     * rather than a feeling they half-remember, and the client can be shown why
     * their expiry is in December when they bought in September.
     *
     * <p>A pack with no expiry is refused rather than silently accepted — there
     * is nothing running down to extend, and a screen that accepted it would have
     * told the trainer they gave away something they did not.
     */
    @Transactional
    public PackageResponse extendPackage(UUID trainerId, String packageId, ExtendPackageRequest req) {
        String tid = trainerId.toString();
        var pkg = readPackage(packageId, tid);
        requireLive(pkg);

        Integer days = req == null ? null : req.days();
        if (days == null || days <= 0 || days > MAX_EXTEND_DAYS) throw PackageRuleException.badExtension();
        if (pkg.get("end_date") == null) throw PackageRuleException.noExpiry();

        jdbc.update("""
                UPDATE package SET
                    -- DATE + INTEGER, as in `resumePackage`. See the note there.
                    end_date   = end_date + CAST(:days AS INTEGER),
                    updated_at = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", packageId, "tid", tid, "days", days));

        logAdjustment(tid, packageId, "extend", days, req.reason(), Instant.now());
        return getPackage(tid, packageId);
    }

    /**
     * CORRECT THE COUNT — V4, and the one write here that changes a sold pack's
     * sessions without any money moving.
     *
     * <h2>What this is not</h2>
     *
     * <p>It is not how a client buys more. Selling six more sessions mid-pack
     * writes a SECOND package row — {@code POST /v1/packages/{id}/renew} with a
     * {@code startDate} of today, which the web labels <em>Add sessions</em> —
     * because a package is what one client bought, at a price, off a price-list
     * entry, inside a validity window. Adding sessions to that row would rewrite
     * the agreement it records: the per-session price becomes a blend of two
     * rates, the window covers sessions it was never sold with, and nothing is
     * left that says what was agreed in August. {@code CLAUDE.md} states the
     * rule as <em>changing a price must never rewrite a sale</em>.
     *
     * <p>So this touches {@code sessions_total} and {@code sessions_remaining}
     * and <strong>never {@code amount}</strong>. It is the exact sibling of
     * {@link #extendPackage}, which gives days away and leaves the price alone.
     *
     * <h2>Absolute in, delta out</h2>
     *
     * <p>The request carries the total the pack should have had, because that is
     * what the trainer knows. What is stored in the log is the DELTA, which is
     * the only part that is a fact about this correction rather than about the
     * pack. {@code sessions_remaining} moves by the same delta, so the sessions
     * already delivered are untouched — correcting ten to twelve on a pack with
     * four used leaves four used and eight left, and never eight used.
     *
     * <h2>The three refusals</h2>
     *
     * <p>A monthly pack counts nothing, so there is nothing to correct. A total
     * of zero or less is not a pack. And a total below what has already been
     * delivered is refused by name rather than clamped: the trainer is either
     * looking at the wrong pack or the diary is what is wrong, and silently
     * making {@code sessions_remaining} zero would hide both.
     */
    public PackageResponse correctSessions(UUID trainerId, String packageId,
                                           CorrectSessionsRequest req) {
        String tid = trainerId.toString();
        var pkg = readPackage(packageId, tid);
        requireLive(pkg);

        Integer currentTotal = toInt(pkg.get("sessions_total"));
        if (currentTotal == null) throw PackageRuleException.notCounted();

        Integer wanted = req == null ? null : req.sessionsTotal();
        if (wanted == null || wanted <= 0 || wanted > MAX_SESSIONS) {
            throw PackageRuleException.badSessionCount(MAX_SESSIONS);
        }

        int delta = wanted - currentTotal;
        if (delta == 0) throw PackageRuleException.noChange();

        int remaining = toInt(pkg.get("sessions_remaining")) == null
                ? 0
                : toInt(pkg.get("sessions_remaining"));
        int used = currentTotal - remaining;
        if (wanted < used) throw PackageRuleException.fewerThanDelivered(used);

        jdbc.update("""
                UPDATE package SET
                    sessions_total     = :total,
                    -- The delta, not the total: what has been delivered is a fact
                    -- about the diary and this write has no business moving it.
                    sessions_remaining = sessions_remaining + CAST(:delta AS INTEGER),
                    updated_at         = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", packageId, "tid", tid, "total", wanted, "delta", delta));

        logAdjustment(tid, packageId, "sessions", 0, delta,
                req.reason(), Instant.now());
        return getPackage(tid, packageId);
    }

    // ── Payments ──────────────────────────────────────────────────────────────

    public List<PaymentResponse> listPayments(UUID trainerId, String packageId) {
        requirePackageOwnership(packageId, trainerId.toString());
        var rows = jdbc.queryForList("""
                SELECT %s
                FROM payment
                WHERE package_id = :pid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY created_at DESC
                """.formatted(PAYMENT_COLUMNS), Map.of("pid", packageId, "tid", trainerId.toString()));
        return rows.stream().map(this::toPaymentResponse).toList();
    }

    /**
     * The trainer's money, across the whole roster, in a window.
     *
     * Same argument as {@link #listAllPackages}: the per-package route is the
     * right shape for one package's history and the wrong shape for a month's
     * takings. Reaching a month through it costs one request per client to find
     * the packages and one per package to find the payments.
     *
     * `from` and `to` are epoch ms on `created_at` and both are optional — the
     * same convention `GET /v1/sessions` already uses, so a caller that knows
     * one endpoint knows this one. **`created_at`, not `paid_at`, is the window
     * column** and that is the deliberate half: a month's *billing* is what was
     * raised that month, and dating by `paid_at` would move an invoice into
     * whichever month it happened to be settled in — and drop every unpaid one,
     * which is exactly the figure "still owed" is made of.
     *
     * `to` is EXCLUSIVE. A caller passing the first instant of next month must
     * not also collect that day's first payment.
     */
    public List<PaymentResponse> listAllPayments(UUID trainerId, Long from, Long to, String status) {
        var conditions = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        conditions.add("trainer_id = :tid::uuid");
        conditions.add("deleted_at IS NULL");

        if (from != null) {
            p.put("from", Timestamp.from(Instant.ofEpochMilli(from)));
            conditions.add("created_at >= :from");
        }
        if (to != null) {
            p.put("to", Timestamp.from(Instant.ofEpochMilli(to)));
            conditions.add("created_at < :to");
        }
        if (status != null && !status.isBlank()) {
            p.put("status", status);
            conditions.add("status = :status");
        }

        var rows = jdbc.queryForList("""
                SELECT %s
                FROM payment
                WHERE %s
                ORDER BY created_at DESC
                """.formatted(PAYMENT_COLUMNS, String.join(" AND ", conditions)), p);
        return rows.stream().map(this::toPaymentResponse).toList();
    }

    /**
     * Record a payment — including a PART of one, which is the normal case.
     *
     * <p>Nothing here caps the amount at what is outstanding and nothing marks
     * the package paid. A package's debt is {@code amount} minus the SUM of its
     * collected payments (see {@link #PACKAGE_COLUMNS}), so "₹2,000 now and the
     * rest on Tuesday" is two rows and needs no schema of its own — which is why
     * partial payment has quietly worked since V1 and only the reading of it was
     * ever wrong.
     */
    @Transactional
    public PaymentResponse createPayment(UUID trainerId, String packageId, CreatePaymentRequest req) {
        var pkg = requirePackageOwnership(packageId, trainerId.toString());
        String clientId = str(pkg.get("client_id"));

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();

        /*
         * Settled on arrival, or pending. See CreatePaymentRequest's note: cash
         * and a gym counter's slip are money that has already changed hands by the
         * time anyone types them, and filing those as pending is what showed a
         * paid-up trainer a month of debt.
         *
         * `paidAt` is trusted as given because it is the trainer's own book and
         * back-dating is the point — but it is CLAMPED to now, since a payment
         * dated next March would sit above every ledger the screen can show and
         * silently inflate the GST rolling twelve months.
         */
        Instant paidAt = null;
        if (req.paidAt() != null) {
            Instant asked = Instant.ofEpochMilli(req.paidAt());
            paidAt = asked.isAfter(now) ? now : asked;
        }
        boolean settled = paidAt != null;

        // The split is stamped the moment the money is known to have arrived, by
        // the same rule and from the same helper `confirmPayment` uses — the cut
        // belongs to the instant of collection, not to whenever it is looked at.
        var split = settled
                ? gymSplitFor(trainerId.toString(), req.collectedBy(), req.amount())
                : null;

        var p = new HashMap<String, Object>();
        p.put("id",           id.toString());
        p.put("tid",          trainerId.toString());
        p.put("cid",          clientId);
        p.put("pkgId",        packageId);
        p.put("amount",       req.amount());
        p.put("currency",     "INR");
        p.put("method",       req.method());
        p.put("collectedBy",  req.collectedBy());
        p.put("status",       settled ? "paid" : "pending");
        p.put("upiReference", blankToNull(req.upiReference()));
        p.put("note",         blankToNull(req.note()));
        p.put("paidAt",       settled ? Timestamp.from(paidAt) : null);
        p.put("share",        split == null ? null : split.amount());
        p.put("sharePercent", split == null ? null : split.percent());
        p.put("now",          Timestamp.from(now));

        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency,
                    method, collected_by, status, upi_reference, note, paid_at,
                    gym_share_amount, share_percent, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :pkgId::uuid, :amount, :currency,
                    :method, :collectedBy, :status, :upiReference, :note, :paidAt,
                    :share, :sharePercent, :now, :now)
                """, p);

        // V18 · money that has ARRIVED is news to the client; a pending row is not yet.
        if (settled) clientBell.mint(clientId, "pack", req.amount(), null, req.method());

        // On a pending row gymShareAmount is null rather than 0: the split has not
        // been made yet, and zero would read as "the gym took nothing", which is a
        // different fact.
        return new PaymentResponse(id.toString(), clientId, packageId, req.amount(), "INR",
                req.method(), req.collectedBy(), settled ? "paid" : "pending",
                blankToNull(req.upiReference()), settled ? paidAt.toEpochMilli() : null,
                now.toEpochMilli(), now.toEpochMilli(),
                split == null ? null : split.amount(), blankToNull(req.note()),
                // A fresh row has never been billed — see V8.
                null, null);
    }

    /** The gym's cut and the percentage it was worked out from, both nullable. */
    private record GymSplit(BigDecimal amount, BigDecimal percent) {}

    /**
     * THE ONE PLACE THE GYM'S CUT IS WORKED OUT.
     *
     * <p>The rule, unchanged: the cut applies <b>only when the gym collected</b>.
     * Zero in three cases, two of which surprise people — the trainer collected
     * (whatever the mode, and even on the gym's own floor), there is no gym on the
     * profile, or no share is agreed. Remote sessions are zero by being collected
     * by the trainer, which is a rule in code and not a second column.
     *
     * <p>It is a method rather than two copies because {@code createPayment} can
     * now settle a payment outright, and a second hand-rolled copy of this
     * arithmetic is how September's split starts disagreeing with itself.
     */
    private GymSplit gymSplitFor(String trainerId, String collectedBy, BigDecimal amount) {
        var rows = jdbc.queryForList(
                "SELECT gym_name, gym_share_percent FROM trainer WHERE id = :tid::uuid",
                Map.of("tid", trainerId));
        if (rows.isEmpty()) return new GymSplit(BigDecimal.ZERO, null);
        var row = rows.get(0);

        BigDecimal percent = toDecimal(row.get("gym_share_percent"));
        boolean gymCollected = "gym".equals(collectedBy);
        boolean hasGym = str(row.get("gym_name")) != null && percent != null && percent.signum() > 0;
        if (!gymCollected || !hasGym) return new GymSplit(BigDecimal.ZERO, null);

        return new GymSplit(
                amount.multiply(percent).divide(new BigDecimal("100"), 2, java.math.RoundingMode.HALF_UP),
                percent);
    }

    private String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v;
    }

    /**
     * The money arrived — and THIS is where the gym's cut is frozen onto the row.
     *
     * <p>V11 stores {@code gym_share_amount} and {@code share_percent} on the
     * payment "applied AT RECORD TIME … so September's split must not move", and
     * API.md says the split "is stamped when the money is CONFIRMED". <b>Nothing
     * stamped it.</b> This UPDATE wrote four columns and neither of those two
     * was among them, so every confirmed payment carried a null cut, the client
     * file's *the gym's share* row never rendered, and *what you keep* showed the
     * full billed amount to a trainer who keeps half of it.
     *
     * <h2>The rule, and it makes the share zero more often than people expect</h2>
     *
     * The cut applies only when the GYM collected. Three cases give zero, and the
     * client file's aside states all three because two of them surprise people:
     * the trainer collected (whatever the mode, and even on the gym's own floor);
     * there is no gym on the profile at all; or there is no share agreed.
     * Remote sessions are the fourth, and they are zero by being collected by the
     * trainer — a rule in code, as V11 says, and not a second column.
     *
     * <p>Read from {@code trainer} at this instant and COPIED, never joined at
     * read time. That is the whole reason the columns exist.
     */
    @Transactional
    public PaymentResponse confirmPayment(UUID trainerId, String paymentId, ConfirmPaymentRequest req) {
        String tid = trainerId.toString();
        var rows = jdbc.queryForList("""
                SELECT p.amount, p.collected_by, p.status
                FROM payment p
                WHERE p.id = :id::uuid AND p.trainer_id = :tid::uuid AND p.deleted_at IS NULL
                FOR UPDATE
                """, Map.of("id", paymentId, "tid", tid));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found");
        var row = rows.get(0);
        // A written-off row's amount is already in its package's
        // `written_off_amount`; confirming it would count the same rupees as both
        // collected and forgiven, and the pack would read as over-settled.
        if ("write_off".equals(str(row.get("status")))) throw PackageRuleException.writtenOff();

        var split = gymSplitFor(tid, str(row.get("collected_by")), toDecimal(row.get("amount")));
        BigDecimal share = split.amount();
        BigDecimal sharePercent = split.percent();

        Instant now = Instant.now();
        Instant paidAt = now;
        if (req != null && req.paidAt() != null) {
            Instant asked = Instant.ofEpochMilli(req.paidAt());
            // Refused, not clamped as `createPayment` clamps: this is a date the
            // trainer typed on purpose, and quietly replacing next week with
            // today would store a day nobody chose. A few minutes' grace so a
            // browser clock slightly ahead of ours is not an error.
            if (asked.isAfter(now.plus(CLOCK_SKEW))) throw PackageRuleException.paidInFuture();
            paidAt = asked.isAfter(now) ? now : asked;
        }
        var p = new HashMap<String, Object>();
        p.put("id",           paymentId);
        p.put("tid",          tid);
        p.put("now",          Timestamp.from(now));
        p.put("paidAt",       Timestamp.from(paidAt));
        p.put("method",       req == null ? null : blankToNull(req.method()));
        // Null, not "", when none was sent. The UPDATE below COALESCEs onto what
        // is already there — `POST /v1/packages/{id}/payments` can write a
        // reference at record time now, and a confirmation that carries none must
        // not erase it.
        p.put("ref",          req == null ? null : blankToNull(req.upiReference()));
        p.put("share",        share);
        p.put("sharePercent", sharePercent);
        jdbc.update("""
                UPDATE payment SET
                    status           = 'paid',
                    paid_at          = :paidAt,
                    method           = COALESCE(:method, method),
                    upi_reference    = COALESCE(:ref, upi_reference),
                    -- COALESCE so re-confirming an already-split payment cannot
                    -- re-derive the cut from a percentage that has since changed.
                    -- The first confirmation is the one that counts, which is the
                    -- whole reason V11 copied the figure instead of joining it.
                    gym_share_amount = COALESCE(gym_share_amount, :share),
                    share_percent    = COALESCE(share_percent, :sharePercent),
                    updated_at       = :now
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, p);

        var updated = jdbc.queryForList("""
                SELECT %s FROM payment WHERE id = :id::uuid
                """.formatted(PAYMENT_COLUMNS), Map.of("id", paymentId));
        var confirmed = toPaymentResponse(updated.get(0));
        // V18 · only the first confirmation is news; a second press re-stamps nothing the client needs.
        if (!"paid".equals(str(row.get("status"))) && !"confirmed".equals(str(row.get("status")))) {
            clientBell.mint(confirmed.clientId(), "pack", confirmed.amount(), null, confirmed.method());
        }
        return confirmed;
    }

    /** The financial year turns over on an Indian calendar, not the server's. */
    private static final java.time.ZoneId IST = java.time.ZoneId.of("Asia/Kolkata");

    /** How far ahead of our clock a typed {@code paidAt} may be before it is "the future". */
    private static final java.time.Duration CLOCK_SKEW = java.time.Duration.ofMinutes(5);

    /** A write-off reason is a sentence, not an essay; refused over, never cut. */
    private static final int MAX_WRITE_OFF_REASON = 500;

    /**
     * STOP CHASING IT — without pretending it was paid, and without deleting it.
     *
     * <p>A write-off is the trainer deciding a debt will not be collected: the
     * client moved away owing for four sessions. The row keeps its amount, its
     * client and its date, because "₹2,000 was forgiven in March" is a fact the
     * books must still show; only its status changes, and it stops being
     * {@code pending} so nothing chases it again.
     *
     * <h2>The amount moves onto the package, and that is what makes the debt drop</h2>
     *
     * <p>A package's debt is {@code amount − paid − written_off_amount}
     * ({@link #PACKAGE_COLUMNS}); a pending payment row is a placeholder for money
     * expected, not part of that sum. So writing the row off without touching the
     * package would leave the pack owing exactly what it owed before. V11 already
     * gave {@code package} a {@code written_off_amount} and the phone already
     * draws it — the column is the one place a write-off has ever meant anything
     * — so the row's amount is ADDED there, in the same transaction, and every
     * reader of {@code amountDue} on either half sees the drop.
     *
     * <h2>Refusals</h2>
     *
     * <ul>
     *   <li>Collected already ({@code paid} or {@code confirmed}) — {@code 409
     *       ALREADY_COLLECTED}. Money that arrived cannot be forgiven; the
     *       honest correction for a wrong entry is deleting it.</li>
     *   <li>Written off already — returned unchanged. A second press must not
     *       add the amount to the package a second time.</li>
     *   <li>Not this trainer's, or not in the active workspace — 404, by the
     *       ownership filter and the tier-2 policy together.</li>
     * </ul>
     */
    @Transactional
    public PaymentResponse writeOffPayment(UUID trainerId, String paymentId, WriteOffRequest req) {
        String tid = trainerId.toString();
        var row = lockPayment(paymentId, tid);
        String status = str(row.get("status"));
        if ("write_off".equals(status)) return toPaymentResponse(row);
        if ("paid".equals(status) || "confirmed".equals(status)) throw PackageRuleException.alreadyCollected();

        String reason = req == null ? null : blankToNull(req.reason());
        if (reason != null) {
            reason = reason.strip();
            if (reason.length() > MAX_WRITE_OFF_REASON) throw PackageRuleException.reasonTooLong(MAX_WRITE_OFF_REASON);
        }
        String note = str(row.get("note"));
        String merged = reason == null ? note : (note == null || note.isBlank() ? reason : note + " · " + reason);

        Instant now = Instant.now();
        var p = new HashMap<String, Object>();
        p.put("id",   paymentId);
        p.put("tid",  tid);
        p.put("note", merged);
        p.put("now",  Timestamp.from(now));
        jdbc.update("""
                UPDATE payment SET
                    status           = 'write_off',
                    paid_at          = NULL,
                    gym_share_amount = NULL,
                    share_percent    = NULL,
                    note             = :note,
                    updated_at       = :now
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, p);

        String packageId = str(row.get("package_id"));
        if (packageId != null) {
            p.put("pkg",    packageId);
            p.put("amount", toDecimal(row.get("amount")));
            jdbc.update("""
                    UPDATE package SET
                        written_off_amount = COALESCE(written_off_amount, 0) + :amount,
                        written_off_at     = COALESCE(written_off_at, :now),
                        updated_at         = :now
                    WHERE id = :pkg::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                    """, p);
        }
        return toPaymentResponse(lockPayment(paymentId, tid));
    }

    /**
     * GIVE A COLLECTED PAYMENT A BILL NUMBER — V8.
     *
     * <p>{@code INV-<FY>-<NNNN>}: the financial year runs April to March, so
     * September 2026 is {@code 2627}, and the sequence is per trainer per year,
     * across every workspace they coach in, because a series belongs to its
     * issuer. The counter row is locked by the upsert that advances it, so two
     * presses in the same second get consecutive numbers, and it advances inside
     * this transaction, so a refusal after it rolls the number back and the
     * series stays gap-free.
     *
     * <p>Idempotent: a row that already has a number returns it unchanged. The
     * payment row is locked first, so two concurrent presses on the SAME row
     * cannot mint it two numbers.
     *
     * <p>Refused, each with its sentence: a written-off row (nothing to bill), a
     * gym-collected row (the gym raises its own receipt), and a row not yet
     * collected (the bill prints <i>Paid on</i>). The number is the trainer's
     * bill to their client — it computes no tax and is not a tax invoice.
     */
    @Transactional
    public PaymentResponse issueInvoice(UUID trainerId, String paymentId) {
        String tid = trainerId.toString();
        var row = lockPayment(paymentId, tid);
        if (str(row.get("invoice_no")) != null) return toPaymentResponse(row);

        String status = str(row.get("status"));
        if ("write_off".equals(status)) throw PackageRuleException.writtenOff();
        if ("gym".equals(str(row.get("collected_by")))) throw PackageRuleException.gymCollected();
        if (!"paid".equals(status) && !"confirmed".equals(status)) throw PackageRuleException.notPaid();

        int fy = financialYear(LocalDate.now(IST));
        Integer seq = jdbc.queryForObject("""
                INSERT INTO invoice_counter (trainer_id, fy, last_seq) VALUES (:tid::uuid, :fy, 1)
                ON CONFLICT (trainer_id, fy) DO UPDATE
                    SET last_seq = invoice_counter.last_seq + 1, updated_at = now()
                RETURNING last_seq
                """, Map.of("tid", tid, "fy", fy), Integer.class);

        Instant now = Instant.now();
        jdbc.update("""
                UPDATE payment SET invoice_no = :no, invoiced_at = :now, updated_at = :now
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("no", invoiceNumber(fy, seq), "now", Timestamp.from(now),
                            "id", paymentId, "tid", tid));
        return toPaymentResponse(lockPayment(paymentId, tid));
    }

    /** {@code 2627} for any date from 1 Apr 2026 to 31 Mar 2027. */
    static int financialYear(LocalDate date) {
        int start = date.getMonthValue() >= 4 ? date.getYear() : date.getYear() - 1;
        return (start % 100) * 100 + (start + 1) % 100;
    }

    static String invoiceNumber(int fy, int seq) {
        return "INV-%04d-%04d".formatted(fy, seq);
    }

    /** One of this trainer's live payments, locked for the rest of the transaction, or 404. */
    private Map<String, Object> lockPayment(String paymentId, String tid) {
        var rows = jdbc.queryForList("""
                SELECT %s FROM payment
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                FOR UPDATE
                """.formatted(PAYMENT_COLUMNS), Map.of("id", paymentId, "tid", tid));
        if (rows.isEmpty()) throw PackageRuleException.paymentNotFound();
        return rows.get(0);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void requireClientOwnership(String clientId, String tid) {
        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", clientId, "tid", tid), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
    }

    private Map<String, Object> requirePackageOwnership(String packageId, String tid) {
        var rows = jdbc.queryForList("""
                SELECT id::text, client_id::text FROM package
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", packageId, "tid", tid));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Package not found");
        return rows.get(0);
    }

    /**
     * The lifecycle operations' read, and it takes {@code FOR UPDATE}.
     *
     * <p>Pause / resume / extend all read a value, compute from it and write it
     * back — and two of them do date arithmetic. Two concurrent resumes without
     * the lock would both read the same {@code paused_at} and both add the same
     * three weeks, which is exactly the shape {@code markDone} takes the same
     * lock to avoid double-charging.
     */
    private Map<String, Object> readPackage(String packageId, String tid) {
        var rows = jdbc.queryForList("""
                SELECT id::text, client_id::text, pack_id::text, type, status,
                       sessions_total, sessions_remaining, amount,
                       start_date, end_date, paused_at, paused_days
                FROM package
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                FOR UPDATE
                """, Map.of("id", packageId, "tid", tid));
        if (rows.isEmpty()) throw PackageRuleException.notFound();
        return rows.get(0);
    }

    /** A pack that must exist on this trainer's price list. */
    private Map<String, Object> readPack(String packId, String tid) {
        var pack = readPackOrNull(packId, tid);
        if (pack == null) throw PackRuleException.notFound();
        return pack;
    }

    /**
     * The same read, tolerating a miss.
     *
     * <p>Renewal uses this: a pack sold from a price-list entry that has since
     * been DELETED must still renew, off its own terms. Retiring cannot cause a
     * miss — that is a status, and V11's foreign key refuses the delete anyway —
     * but a row from another trainer or a stale id can, and neither is a reason
     * to refuse a trainer the renewal in front of them.
     */
    private Map<String, Object> readPackOrNull(String packId, String tid) {
        var rows = jdbc.queryForList("""
                SELECT id::text, type, sessions, amount, validity_days
                FROM pack
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", packId, "tid", tid));
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Pausing or extending something that finished in March is refused by name. */
    private void requireLive(Map<String, Object> pkg) {
        if (!"active".equals(str(pkg.get("status")))) throw PackageRuleException.notLive();
    }

    /** Append-only, per V30. Never updated, never soft-deleted. */
    private void logAdjustment(String tid, String packageId, String kind, int days,
                               String reason, Instant effectiveAt) {
        logAdjustment(tid, packageId, kind, days, 0, reason, effectiveAt);
    }

    /**
     * The V4 form, carrying the session delta as well as the day count.
     *
     * <p>The three-verb overload above is kept rather than every call site being
     * rewritten to pass a zero: pause, resume and extend move days and move no
     * sessions, and that is a fact about those verbs, not an argument they
     * should have to supply.
     */
    private void logAdjustment(String tid, String packageId, String kind, int days, int sessions,
                               String reason, Instant effectiveAt) {
        var p = new HashMap<String, Object>();
        p.put("id",       UUID.randomUUID().toString());
        p.put("pid",      packageId);
        p.put("tid",      tid);
        p.put("kind",     kind);
        p.put("days",     days);
        p.put("sessions", sessions);
        // Trimmed to null so an empty box is stored as "no reason given" rather
        // than as a reason that is the empty string.
        p.put("reason", reason == null || reason.isBlank() ? null : reason.trim());
        p.put("at",     Timestamp.from(effectiveAt));
        jdbc.update("""
                INSERT INTO package_adjustment (id, package_id, trainer_id, kind, days, sessions,
                    reason, effective_at, created_at)
                VALUES (:id::uuid, :pid::uuid, :tid::uuid, :kind, :days, :sessions, :reason,
                    :at, NOW())
                """, p);
        log.info("package {} trainer={} package={} days={} sessions={}",
                kind, tid, packageId, days, sessions);
    }

    private PackageResponse getPackage(String tid, String packageId) {
        var rows = jdbc.queryForList("""
                SELECT %s
                FROM package p
                WHERE p.id = :id::uuid AND p.trainer_id = :tid::uuid AND p.deleted_at IS NULL
                """.formatted(PACKAGE_COLUMNS), Map.of("id", packageId, "tid", tid));
        if (rows.isEmpty()) throw PackageRuleException.notFound();
        return toPackageResponse(rows.get(0));
    }

    private PackageResponse toPackageResponse(Map<String, Object> r) {
        BigDecimal amount     = toDecimal(r.get("amount"));
        BigDecimal paid       = toDecimal(r.get("amount_paid"));
        BigDecimal writtenOff = toDecimal(r.get("written_off_amount"));

        /*
         * `amount − paid − writtenOff`, floored at zero.
         *
         * Floored because an overpayment is a real thing — a client rounds ₹5,800
         * up to ₹6,000 — and a negative "outstanding" renders as a debt owed the
         * wrong way. The overpayment is still visible: `amountPaid` is the true
         * figure and the ledger draws every row.
         */
        BigDecimal due = amount == null ? BigDecimal.ZERO : amount
                .subtract(paid == null ? BigDecimal.ZERO : paid)
                .subtract(writtenOff == null ? BigDecimal.ZERO : writtenOff);
        if (due.signum() < 0) due = BigDecimal.ZERO;

        Integer pausedDays = toInt(r.get("paused_days"));

        return new PackageResponse(
                str(r.get("id")),
                str(r.get("client_id")),
                str(r.get("type")),
                toInt(r.get("sessions_total")),
                toInt(r.get("sessions_remaining")),
                amount,
                str(r.get("currency")),
                str(r.get("start_date")),
                str(r.get("end_date")),
                str(r.get("status")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")),
                str(r.get("pack_id")),
                toEpochMilliOrNull(r.get("paused_at")),
                pausedDays == null ? 0 : pausedDays,
                toEpochMilliOrNull(r.get("closed_at")),
                str(r.get("due_date")),
                toDecimal(r.get("discount_amount")),
                paid == null ? BigDecimal.ZERO : paid,
                due,
                // A read booked nothing. Only the sale fills this in — see the
                // field's own note on why counting the diary here would be wrong.
                null);
    }

    private PaymentResponse toPaymentResponse(Map<String, Object> r) {
        return new PaymentResponse(
                str(r.get("id")),
                str(r.get("client_id")),
                str(r.get("package_id")),
                toDecimal(r.get("amount")),
                str(r.get("currency")),
                str(r.get("method")),
                str(r.get("collected_by")),
                str(r.get("status")),
                str(r.get("upi_reference")),
                toEpochMilliOrNull(r.get("paid_at")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")),
                toDecimal(r.get("gym_share_amount")),
                str(r.get("note")),
                str(r.get("invoice_no")),
                toEpochMilliOrNull(r.get("invoiced_at")));
    }

    private String str(Object v) { return v == null ? null : v.toString(); }

    private String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) return a;
        return b != null && !b.isBlank() ? b : null;
    }

    /**
     * A 400 naming the field, never a 500.
     *
     * <p>{@code java.sql.Date.valueOf} throws {@code IllegalArgumentException} on
     * anything that is not {@code YYYY-MM-DD}, which reached the client as an
     * unexplained 500 — and "2026-8-3" from a hand-built caller is an easy way to
     * get one.
     */
    private LocalDate parseDate(String value, String field) {
        try {
            return LocalDate.parse(value);
        } catch (RuntimeException e) {
            throw PackageRuleException.badDate(field);
        }
    }

    /**
     * When a back-dated pause or resume actually happened.
     *
     * <p>FOUR SHAPES, and the generosity is deliberate. {@code Instant.parse}
     * alone rejects everything without a trailing {@code Z} or an offset, so a
     * caller sending {@code 2026-08-07T09:15:00} — a local datetime, which is
     * what most date-time controls and most hand-written callers produce — got
     * a 400 for a perfectly clear intention. The web sends
     * {@code Date.toISOString()} and would never have hit it, which is exactly
     * the kind of hole that stays open until somebody else integrates.
     *
     * <p>A bare date and a zoneless datetime are read in the SERVER'S zone, and
     * that is the honest reading rather than a guess: the alternative is UTC,
     * which for an Indian trainer picking "the 7th" lands at 05:30 on the 7th and
     * reads back as the 6th to anybody west of Greenwich. Neither is perfect
     * without a zone on the wire; the server's own is the one that matches the
     * deployment and the trainers in it.
     */
    private Instant parseInstant(String value, String field) {
        if (value == null || value.isBlank()) return null;
        String v = value.trim();
        try {
            if (v.chars().allMatch(Character::isDigit)) return Instant.ofEpochMilli(Long.parseLong(v));
            // A real instant: has a zone on it, so it needs no interpreting.
            if (v.endsWith("Z") || v.matches(".*[+-]\\d{2}:?\\d{2}$")) return Instant.parse(v);
            // A zoneless datetime, then a bare date. Both in the server's zone.
            if (v.contains("T")) {
                return java.time.LocalDateTime.parse(v).atZone(java.time.ZoneId.systemDefault()).toInstant();
            }
            return LocalDate.parse(v).atStartOfDay(java.time.ZoneId.systemDefault()).toInstant();
        } catch (RuntimeException e) {
            throw PackageRuleException.badDate(field);
        }
    }

    private Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        return Integer.parseInt(v.toString());
    }

    private BigDecimal toDecimal(Object v) {
        if (v instanceof BigDecimal bd) return bd;
        return v != null ? new BigDecimal(v.toString()) : null;
    }

    private LocalDate toLocalDate(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Date d) return d.toLocalDate();
        if (v instanceof LocalDate ld)    return ld;
        return LocalDate.parse(v.toString());
    }

    private Instant toInstant(Object v) {
        if (v instanceof java.sql.Timestamp ts)        return ts.toInstant();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant();
        if (v instanceof java.time.LocalDateTime ldt)  return ldt.toInstant(java.time.ZoneOffset.UTC);
        if (v instanceof Instant i)                    return i;
        return null;
    }

    private long toEpochMilli(Object v) {
        Instant i = toInstant(v);
        return i == null ? 0L : i.toEpochMilli();
    }

    private Long toEpochMilliOrNull(Object v) {
        Instant i = toInstant(v);
        return i == null ? null : i.toEpochMilli();
    }
}

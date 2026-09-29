package com.inclineyou.inclineyou_backend.core.tenant;

import java.util.List;
import java.util.UUID;

/**
 * What the database is told about the caller, for the length of one request.
 *
 * <p>Held in a {@link ThreadLocal} and read by {@code TenantAwareDataSource}
 * every time a connection is borrowed. Nothing else should read it: services
 * take their scope from {@link TenantScope}, which is auditable, rather than
 * from an ambient variable, which is not.
 *
 * <h2>Why two tenant fields</h2>
 *
 * They answer different questions and conflating them is the mistake this record
 * exists to prevent.
 *
 * <ul>
 *   <li><b>{@code tenantIds} is the read scope</b> — every workspace this person
 *       belongs to, or just one when they have asked to look at one. It is what
 *       puts a trainer's 07:00 private client and their 18:00 gym client on the
 *       same Today screen.</li>
 *   <li><b>{@code activeTenantId} is where they are standing</b> — the workspace
 *       new rows are stamped with, and the only one the money book reads. That
 *       is what stops a total from being a mix of two businesses.</li>
 * </ul>
 *
 * <h2>Empty means nothing, never everything</h2>
 *
 * {@link #NONE} is what an unauthenticated request gets, and it resolves to
 * policies matching zero rows. Every field here fails closed by design: the
 * failure mode of a context that did not get set must be an empty screen, not
 * somebody else's data.
 */
public record TenantContext(
        Actor actor,
        /**
         * The number authentication proved, and the only identity fact that
         * exists before any workspace is known. Two SELECT-only policies use it
         * so a caller can discover their own memberships — see the bootstrap
         * note in V42.
         */
        String phone,
        UUID activeTenantId,
        List<UUID> tenantIds,
        UUID trainerId,
        List<UUID> clientIds
) {
    /**
     * Which half of the product is asking.
     *
     * <p>Set explicitly rather than inferred from whether some other field is
     * empty, because a policy that guesses the actor is a policy that guesses
     * wrong once. {@code STAFF} covers a trainer, a team admin and a gym
     * administrator alike — they differ in role inside a workspace, not in
     * whether they are standing in one.
     */
    public enum Actor {
        /**
         * {@code SYSTEM} is boot-time work that writes rows belonging to nobody —
         * the global exercise library, which V21's policy lets no request write.
         * A request's context is built by {@code AuthTokenFilter} and is never
         * SYSTEM; only {@link TenantContext#SYSTEM} is.
         */
        NONE(""), STAFF("staff"), CLIENT("client"), SYSTEM("system");

        public final String wire;
        Actor(String wire) { this.wire = wire; }
    }

    public static final TenantContext NONE =
            new TenantContext(Actor.NONE, null, null, List.of(), null, List.of());

    /**
     * Boot-time catalogue work (V21). No workspace, no phone, no trainer: the
     * only policy it satisfies is the one on global {@code exercise} rows, so it
     * can seed the library and read nothing else.
     */
    public static final TenantContext SYSTEM =
            new TenantContext(Actor.SYSTEM, null, null, List.of(), null, List.of());

    private static final ThreadLocal<TenantContext> CURRENT = new ThreadLocal<>();

    public static TenantContext current() {
        TenantContext ctx = CURRENT.get();
        return ctx == null ? NONE : ctx;
    }

    public static void set(TenantContext ctx) { CURRENT.set(ctx); }

    /**
     * Always in a finally block. A leaked context on a pooled request thread is
     * the next request reading the previous caller's workspace.
     */
    public static void clear() { CURRENT.remove(); }

    public static TenantContext staff(String phone, UUID activeTenantId,
                                      List<UUID> tenantIds, UUID trainerId) {
        return new TenantContext(Actor.STAFF, phone, activeTenantId,
                List.copyOf(tenantIds), trainerId, List.of());
    }

    public static TenantContext client(String phone, UUID activeTenantId,
                                       List<UUID> tenantIds, List<UUID> clientIds) {
        return new TenantContext(Actor.CLIENT, phone, activeTenantId,
                List.copyOf(tenantIds), null, List.copyOf(clientIds));
    }

    /**
     * Just enough to look up who this person is, before any workspace is known.
     * Actor is STAFF so the bootstrap policies apply; every tier-1 predicate
     * still matches nothing, because the workspace set is empty.
     */
    public static TenantContext bootstrap(String phone) {
        return new TenantContext(Actor.STAFF, phone, null, List.of(), null, List.of());
    }

    /** A Postgres array literal — {@code {a,b}} — or {@code ""} for none. */
    public static String array(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < ids.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(ids.get(i));
        }
        return sb.append('}').toString();
    }

    public static String text(UUID id) { return id == null ? "" : id.toString(); }
}

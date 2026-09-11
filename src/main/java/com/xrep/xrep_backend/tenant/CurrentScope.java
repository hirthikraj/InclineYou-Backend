package com.xrep.xrep_backend.tenant;

/**
 * The caller's workspace scope, resolved once by the filter and read by the
 * services that need it.
 *
 * <p>Separate from {@link TenantContext}, which is the database's view and holds
 * only what row-level security needs. This holds the richer answer — every
 * membership, the role in each, the revenue split — that application code
 * branches on, and it exists so a controller does not run the membership query a
 * second time on every request.
 *
 * <p>Cleared in the same {@code finally} block as {@link TenantContext}. A scope
 * left on a pooled request thread is the next caller's permissions.
 */
public final class CurrentScope {

    private static final ThreadLocal<TenantScope.Scope> CURRENT = new ThreadLocal<>();

    public static void set(TenantScope.Scope scope) { CURRENT.set(scope); }

    public static TenantScope.Scope get() { return CURRENT.get(); }

    public static void clear() { CURRENT.remove(); }

    /**
     * @throws TenantRuleException when there is none — which means an endpoint
     *         that needs a workspace was reached by a caller who has not got
     *         one. A 422 with a reason, never a null pointer three frames down.
     */
    public static TenantScope.Scope require() {
        TenantScope.Scope scope = CURRENT.get();
        if (scope == null || scope.activeTenantId() == null) throw TenantRuleException.noWorkspace();
        return scope;
    }

    private CurrentScope() {}
}

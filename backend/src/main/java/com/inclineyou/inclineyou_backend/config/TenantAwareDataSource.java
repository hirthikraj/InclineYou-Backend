package com.inclineyou.inclineyou_backend.config;

import com.inclineyou.inclineyou_backend.tenant.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.datasource.DelegatingDataSource;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;

/**
 * Tells Postgres who is asking, once per borrowed connection.
 *
 * <p>Row-level security reads six settings — {@code app.actor},
 * {@code app.phone}, {@code app.tenant_id}, {@code app.tenant_ids},
 * {@code app.trainer_id} and {@code app.client_ids} — through the {@code app_*()} helper functions added in
 * V39 and V42. This class is the only place they are written.
 *
 * <h2>Why on borrow, and not with SET LOCAL in a transaction</h2>
 *
 * {@code SET LOCAL} is the textbook answer and it does not work here. Ten classes
 * in this codebase use {@code NamedParameterJdbcTemplate} with no
 * {@code @Transactional} anywhere above them, and {@code SET LOCAL} outside a
 * transaction is a no-op with a warning. Under a fail-closed policy that means
 * those endpoints quietly return nothing — a whole class of empty screens that
 * would look like missing data rather than a bug.
 *
 * <p>So the settings are written on every {@code getConnection()} instead, at
 * session scope, and cleared when the connection goes back to the pool. Writing
 * on EVERY borrow is what makes a leaked value harmless: even if a reset were
 * missed, the next borrower overwrites all six before its first statement.
 *
 * <h2>Why the empty string rather than a NULL or a skip</h2>
 *
 * An unauthenticated request writes {@code ''} into all six. The helpers turn
 * that into SQL NULL, every policy predicate becomes unknown, and every query
 * returns zero rows. Skipping the write instead would leave whatever the previous
 * borrower set — which is the one outcome that must be impossible.
 */
@Slf4j
public class TenantAwareDataSource extends DelegatingDataSource {

    public TenantAwareDataSource(DataSource target) {
        super(target);
    }

    @Override
    public Connection getConnection() throws SQLException {
        return wrap(super.getConnection());
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return wrap(super.getConnection(username, password));
    }

    private Connection wrap(Connection connection) throws SQLException {
        try {
            apply(connection, TenantContext.current());
        } catch (SQLException e) {
            // A connection we could not label is a connection we must not hand
            // out: it would carry whichever caller's context happened to be on
            // it last. Closing and rethrowing turns a subtle disclosure into an
            // obvious 500.
            connection.close();
            throw e;
        }
        return connection;
    }

    private static void apply(Connection connection, TenantContext ctx) throws SQLException {
        // One round trip for all six. set_config(..., false) is session scope,
        // which is what survives outside a transaction; the pool's own reset
        // plus the unconditional rewrite above bound how long it can live.
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT set_config('app.actor',      ?, false),
                       set_config('app.phone',      ?, false),
                       set_config('app.tenant_id',  ?, false),
                       set_config('app.tenant_ids', ?, false),
                       set_config('app.trainer_id', ?, false),
                       set_config('app.client_ids', ?, false)
                """)) {
            ps.setString(1, ctx.actor().wire);
            ps.setString(2, ctx.phone() == null ? "" : ctx.phone());
            ps.setString(3, TenantContext.text(ctx.activeTenantId()));
            ps.setString(4, TenantContext.array(ctx.tenantIds()));
            ps.setString(5, TenantContext.text(ctx.trainerId()));
            ps.setString(6, TenantContext.array(ctx.clientIds()));
            ps.execute();
        }
    }
}

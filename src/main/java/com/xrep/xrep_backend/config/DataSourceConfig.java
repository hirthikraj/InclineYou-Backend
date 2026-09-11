package com.xrep.xrep_backend.config;

import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

/**
 * Every connection in the application goes through {@link TenantAwareDataSource}.
 *
 * <p>Done as a {@link BeanPostProcessor} rather than by declaring the pool
 * ourselves, so Spring Boot keeps owning how the {@code DataSource} is built —
 * every {@code spring.datasource.*} property, the Hikari defaults, the
 * driver-specific handling. We wrap what it produced; we do not replace the
 * decision.
 *
 * <p>The wrapper catches Flyway and the seeders too, and that is safe: they run
 * with an empty context, and V42 deliberately does NOT use
 * {@code FORCE ROW LEVEL SECURITY}, precisely so a migration backfilling a
 * column across every tenant is not silently filtered down to nothing. The
 * runtime connects as {@code xrep_app}, which owns nothing, so the policies
 * apply to it and only to it.
 */
@Configuration
public class DataSourceConfig {

    @Bean
    public static BeanPostProcessor tenantAwareDataSourcePostProcessor() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (bean instanceof DataSource ds && !(bean instanceof TenantAwareDataSource)) {
                    return new TenantAwareDataSource(ds);
                }
                return bean;
            }
        };
    }
}

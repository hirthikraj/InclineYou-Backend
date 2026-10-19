package com.inclineyou.inclineyou_backend.shared.util;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The SQL of one repository, kept in one {@code .sql} file instead of in text blocks scattered through the class.
 *
 * <pre>
 * -- name: clientOnRoster
 * -- Why the query exists, or what is not obvious about it. Full-line comments are dropped when the file is read.
 * SELECT EXISTS (SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
 * </pre>
 *
 * <p>Each query is a block that starts at its {@code -- name:} header, so the file is plain SQL that an IDE highlights, formats and
 * checks against a database without any plugin. A block is a whole statement with {@code :named} parameters; values are bound by
 * {@code NamedParameterJdbcTemplate}, never written into the text.
 *
 * <p>{@code {{other}}} inside a block is replaced by the text of the block called {@code other}, once, when the file is read —
 * static composition for the one fragment several queries share (the program summary's column list). It is not a way to put a
 * value in a query: nothing at run time can reach it. A name that does not exist, a name defined twice and an include that loops
 * all fail when the repository is first loaded, which is at start-up, not on the first request that happens to need the query.
 *
 * <p>A statement whose text depends on the request (an UPDATE that sets only the columns a PATCH named) cannot be a block. It stays
 * in the repository, built from constants, and says why.
 */
public final class NamedSql {

    private static final Pattern HEADER = Pattern.compile("^--\\s*name:\\s*([A-Za-z][A-Za-z0-9_.]*)\\s*$");
    private static final Pattern INCLUDE = Pattern.compile("\\{\\{\\s*([A-Za-z][A-Za-z0-9_.]*)\\s*}}");

    private final String resource;
    private final Map<String, String> queries;

    private NamedSql(String resource, Map<String, String> queries) {
        this.resource = resource;
        this.queries = queries;
    }

    /** Reads {@code resource} (a classpath path such as {@code sql/program.sql}) and resolves its includes. */
    public static NamedSql load(String resource) {
        try (InputStream in = NamedSql.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) throw new IllegalStateException("SQL file not found on the classpath: " + resource);
            return parse(resource, new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException("cannot read " + resource, e);
        }
    }

    /** The parser, separate from the file so a test can feed it text. */
    static NamedSql parse(String resource, String text) {
        Map<String, List<String>> raw = new LinkedHashMap<>();
        List<String> current = null;
        int lineNo = 0;
        for (String line : text.split("\\R", -1)) {
            lineNo++;
            Matcher header = HEADER.matcher(line.strip());
            if (header.matches()) {
                String name = header.group(1);
                if (raw.containsKey(name)) throw new IllegalStateException(resource + ":" + lineNo + " query '" + name + "' is defined twice");
                current = new ArrayList<>();
                raw.put(name, current);
            } else if (line.strip().startsWith("--") || line.isBlank()) {
                if (current != null && !line.strip().startsWith("--")) current.add(line);   // blank lines inside a query are kept
            } else if (current == null) {
                throw new IllegalStateException(resource + ":" + lineNo + " SQL before the first '-- name:' header");
            } else {
                current.add(line);
            }
        }
        Map<String, String> joined = new LinkedHashMap<>();
        raw.forEach((name, lines) -> {
            String body = String.join("\n", lines).strip();
            if (body.isEmpty()) throw new IllegalStateException(resource + ": query '" + name + "' is empty");
            joined.put(name, body);
        });
        Map<String, String> resolved = new LinkedHashMap<>();
        joined.keySet().forEach(name -> resolved.put(name, resolve(resource, name, joined, new ArrayList<>())));
        return new NamedSql(resource, Map.copyOf(resolved));
    }

    private static String resolve(String resource, String name, Map<String, String> all, List<String> path) {
        if (path.contains(name)) throw new IllegalStateException(resource + ": includes loop: " + String.join(" -> ", path) + " -> " + name);
        path.add(name);
        Matcher m = INCLUDE.matcher(all.get(name));
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String inner = m.group(1);
            if (!all.containsKey(inner)) throw new IllegalStateException(resource + ": query '" + name + "' includes '" + inner + "', which does not exist");
            m.appendReplacement(out, Matcher.quoteReplacement(resolve(resource, inner, all, path)));
        }
        m.appendTail(out);
        path.remove(path.size() - 1);
        return out.toString();
    }

    public String get(String name) {
        String sql = queries.get(name);
        if (sql == null) throw new IllegalStateException(resource + ": no query named '" + name + "'");
        return sql;
    }

    public Set<String> names() {
        return queries.keySet();
    }
}

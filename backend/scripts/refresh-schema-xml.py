#!/usr/bin/env python3
"""Refresh backend/schema.xml from the live database, then re-render schema.html.

Two kinds of fact live in schema.xml, and they have different owners:

  * STRUCTURE — columns, types, nullability, defaults, keys, foreign keys,
    references, checks, indexes, triggers, the RLS flag. The database owns
    these, so every run rewrites them from `pg_catalog` and nothing typed into
    the XML by hand survives.
  * PROSE — table groups and descriptions, column descriptions, allowed values,
    index descriptions, the <conventions> block, the <review> and the
    <proposals>. People own these, so every run carries them forward from the
    existing schema.xml, keyed by name (the last two whole).

A table or column the XML has never seen arrives with no prose (a column
comment in the database is used as a first draft) and is listed at the end of
the run, which is the to-do list for whoever wrote the migration. A table or
column that has gone from the database is reported too: under the
additive-only law that should never happen, so it is worth a second look.

Usage:
    python3 scripts/refresh-schema-xml.py            # rewrite schema.xml + schema.html
    python3 scripts/refresh-schema-xml.py --check    # exit 1 if schema.xml is stale
    python3 scripts/refresh-schema-xml.py --no-html  # skip the HTML render

Connection, the same convention as the seed scripts: by default the compose
container `inclineyou-postgres` (override with POSTGRES_CONTAINER), as the
owner role; set PSQL to point anywhere else, e.g. PSQL="psql $URL".
Standard library only.
"""
import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XML = ROOT / "schema.xml"
RENDER = ROOT / "scripts" / "render-schema-html.py"

# Flyway's bookkeeping is migration history, not schema, and schema.xml is
# deliberately the current state only.
EXCLUDED = ("flyway_schema_history",)
NEW_GROUP = "Ungrouped"
# Hand-written attributes on <table> and <column> that say which release a thing
# belongs to. `scope` is v1 | later; `release` names what a later one waits for.
SCOPE_ATTRS = ("scope", "release")

CATALOG_SQL = """
with t as (
  select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and c.relname <> all(:'excluded'::text[])
)
select coalesce(json_object_agg(t.relname, json_build_object(
  'rls', (select relrowsecurity from pg_class where oid = t.oid),
  'columns', (select json_agg(json_build_object(
      'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notnull', a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid), 'comment', col_description(t.oid, a.attnum))
      order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
  'constraints', (select json_agg(json_build_object(
      'name', co.conname, 'type', co.contype, 'def', pg_get_constraintdef(co.oid),
      'cols', (select json_agg(attname order by k.ord) from unnest(co.conkey) with ordinality k(n, ord)
               join pg_attribute on attrelid = co.conrelid and attnum = k.n),
      'ftable', co.confrelid::regclass::text,
      'fcols', (select json_agg(attname order by k.ord) from unnest(co.confkey) with ordinality k(n, ord)
                join pg_attribute on attrelid = co.confrelid and attnum = k.n),
      'upd', co.confupdtype, 'del', co.confdeltype) order by co.contype, co.conname)
    from pg_constraint co where co.conrelid = t.oid),
  'indexes', (select json_agg(json_build_object(
      'name', ic.relname, 'unique', i.indisunique, 'primary', i.indisprimary,
      'def', pg_get_indexdef(i.indexrelid), 'where', pg_get_expr(i.indpred, i.indrelid))
      order by i.indisprimary desc, ic.relname)
    from pg_index i join pg_class ic on ic.oid = i.indexrelid where i.indrelid = t.oid),
  'triggers', (select json_agg(pg_get_triggerdef(tg.oid) order by tg.tgname)
    from pg_trigger tg where tg.tgrelid = t.oid and not tg.tgisinternal)
)), '{}') from t;
"""

ACTIONS = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}

HEADER = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    "<!--\n"
    "  InclineYou — database schema, current state.\n"
    "  Structure is regenerated from the live catalog by scripts/refresh-schema-xml.py;\n"
    "  descriptions, groups and allowed values are hand-written and carried forward.\n"
    "  Conventions that hold on every table are stated once under <conventions>\n"
    "  rather than repeated per column. Render with scripts/render-schema-html.py.\n"
    "-->\n"
)


# ── reading the database ──────────────────────────────────────────────────────

def psql_command():
    if os.environ.get("PSQL"):
        return shlex.split(os.environ["PSQL"])
    container = os.environ.get("POSTGRES_CONTAINER", "inclineyou-postgres")
    # The owner, like the seeds: the catalog is not row-secured, but this keeps
    # one answer to "which role do scripts use".
    user = os.environ.get("POSTGRES_USER") or os.environ.get("MIGRATION_DB_USERNAME") or "inclineyou"
    db = os.environ.get("POSTGRES_DB", "inclineyoudb")
    if not shutil.which("docker"):
        sys.exit("No PSQL set and docker is not installed. Set PSQL=\"psql <url>\".")
    running = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True).stdout.split()
    if container not in running:
        sys.exit(f"No PSQL set and container '{container}' is not running.\n"
                 "Start it with:  docker compose up -d postgres")
    return ["docker", "exec", "-i", container, "psql", "-U", user, "-d", db]


def read_catalog():
    cmd = psql_command() + ["-X", "-At", "-v", "ON_ERROR_STOP=1",
                            "-v", "excluded={" + ",".join(EXCLUDED) + "}"]
    run = subprocess.run(cmd, input=CATALOG_SQL, capture_output=True, text=True)
    if run.returncode != 0:
        sys.exit("psql failed:\n" + run.stderr.strip())
    catalog = json.loads(run.stdout)
    if not catalog:
        sys.exit("The database has no tables in schema public — is Flyway done?")
    return catalog


# ── reading the prose we must keep ────────────────────────────────────────────

def read_prose():
    """Everything a person wrote into schema.xml, keyed by name."""
    prose = {"conventions": [], "order": [], "tables": {}, "proposals": None, "review": None}
    if not XML.exists():
        return prose
    root = ET.parse(XML).getroot()
    prose["conventions"] = [(c.get("name"), c.text or "") for c in root.findall("conventions/convention")]
    # The review is prose end to end — findings, severities, what fixed them —
    # so it is carried forward whole, exactly as a person left it.
    prose["review"] = root.find("review")
    # Proposals are the schema we have agreed and not yet migrated. The catalog
    # cannot know them, so they ride along whole until the migration that
    # realises them has run and a person deletes them.
    prose["proposals"] = root.find("proposals")
    for t in root.findall("tables/table"):
        name = t.get("name")
        prose["order"].append(name)
        prose["tables"][name] = {
            "group": t.get("group") or NEW_GROUP,
            # Release scope (v1 | later) and, for later, which release it waits
            # for. Hand-written like the group: the database cannot know it.
            "scope": {k: t.get(k) for k in SCOPE_ATTRS if t.get(k)},
            "description": t.findtext("description") or "",
            "columns": {c.get("name"): (c.findtext("description") or "",
                                        [v.text or "" for v in c.findall("allowedValues/value")],
                                        c.get("type"),
                                        {k: c.get(k) for k in SCOPE_ATTRS if c.get(k)})
                        for c in t.findall("columns/column")},
            "indexes": {i.get("name"): i.findtext("description") or "" for i in t.findall("indexes/index")},
        }
    return prose


# ── shaping ───────────────────────────────────────────────────────────────────

def short_type(t):
    return (t.replace("character varying", "varchar")
             .replace("timestamp with time zone", "timestamptz")
             .replace("timestamp without time zone", "timestamp")
             .replace("time without time zone", "time"))


def short_default(d):
    if d is None:
        return None
    d = d.replace("public.", "")
    return re.sub(r"::(character varying|text|jsonb|numeric|integer|smallint|bigint|date|uuid|boolean)(\[\])?", "", d)


def parse_trigger(defn):
    m = re.match(r"CREATE (?:CONSTRAINT )?TRIGGER (\S+) (BEFORE|AFTER|INSTEAD OF) (.+?) ON \S+ .*?EXECUTE FUNCTION (.+)$", defn)
    return m.groups() if m else (None, "", "", defn)


def default_note(column):
    # The two notes every table would otherwise need a person to type.
    if column == "tenant_id":
        return "The workspace this row belongs to."
    return ""


def build(catalog, prose):
    report = {"new_tables": [], "new_columns": [], "gone_tables": [], "gone_columns": [], "retyped": [], "unscoped": []}

    order = [t for t in prose["order"] if t in catalog] + sorted(t for t in catalog if t not in prose["tables"])
    report["new_tables"] = [t for t in order if t not in prose["tables"]]
    report["gone_tables"] = [t for t in prose["order"] if t not in catalog]

    root = ET.Element("database", name="inclineyoudb", engine="PostgreSQL", version="16", schema="public")
    conv = ET.SubElement(root, "conventions")
    for name, text in prose["conventions"]:
        ET.SubElement(conv, "convention", name=name).text = text

    refs = {}
    for t in order:
        for c in catalog[t]["constraints"] or []:
            if c["type"] == "f":
                refs.setdefault(c["ftable"], []).append((t, c["cols"][0], c["name"]))

    tables = ET.SubElement(root, "tables")
    for t in order:
        v = catalog[t]
        kept = prose["tables"].get(t, {"group": NEW_GROUP, "scope": {}, "description": "", "columns": {}, "indexes": {}})
        te = ET.SubElement(tables, "table", name=t, group=kept["group"], **kept.get("scope", {}))
        if "scope" not in kept.get("scope", {}):
            report["unscoped"].append(t)
        if v["rls"]:
            te.set("rowLevelSecurity", "enabled")
        ET.SubElement(te, "description").text = kept["description"]

        cons = v["constraints"] or []
        pk = next((c for c in cons if c["type"] == "p"), {"name": "", "cols": []})
        fks = [c for c in cons if c["type"] == "f"]
        fk_cols = {c["cols"][0] for c in fks}
        col_names = [c["name"] for c in v["columns"]]

        cols = ET.SubElement(te, "columns")
        for c in v["columns"]:
            n = c["name"]
            a = {"name": n, "type": short_type(c["type"]), "nullable": "false" if c["notnull"] else "true"}
            dflt = short_default(c["default"])
            if dflt:
                a["default"] = dflt
            if n in pk["cols"]:
                a["primaryKey"] = "true"
            if n in fk_cols:
                a["foreignKey"] = "true"
            if n in kept["columns"]:
                a.update(kept["columns"][n][3])
            ce = ET.SubElement(cols, "column", a)

            if n in kept["columns"]:
                note, values, old_type, _ = kept["columns"][n]
                if old_type and old_type != a["type"]:
                    report["retyped"].append(f"{t}.{n}: {old_type} → {a['type']}")
            else:
                note, values = (c["comment"] or default_note(n)), []
                if t in prose["tables"] and n not in ("created_at", "updated_at", "deleted_at", "tenant_id"):
                    report["new_columns"].append(f"{t}.{n}" + ("  (draft from column comment)" if c["comment"] else ""))
            if note:
                ET.SubElement(ce, "description").text = note
            if values:
                av = ET.SubElement(ce, "allowedValues")
                for x in values:
                    ET.SubElement(av, "value").text = x

        for gone in kept["columns"]:
            if gone not in col_names:
                report["gone_columns"].append(f"{t}.{gone}")

        if pk["cols"]:
            ET.SubElement(te, "primaryKey", name=pk["name"], columns=", ".join(pk["cols"]))

        fke = ET.SubElement(te, "foreignKeys")
        for c in sorted(fks, key=lambda c: col_names.index(c["cols"][0])):
            ET.SubElement(fke, "foreignKey", name=c["name"], column=", ".join(c["cols"]),
                          referencesTable=c["ftable"], referencesColumn=", ".join(c["fcols"]),
                          onUpdate=ACTIONS[c["upd"]], onDelete=ACTIONS[c["del"]])

        rb = ET.SubElement(te, "referencedBy", count=str(len(refs.get(t, []))))
        for rt, rc, rn in refs.get(t, []):
            ET.SubElement(rb, "reference", table=rt, column=rc, constraint=rn)

        checks = [c for c in cons if c["type"] == "c"]
        if checks:
            ch = ET.SubElement(te, "checks")
            for c in checks:
                ET.SubElement(ch, "check", name=c["name"]).text = re.sub(r"^CHECK \((.*)\)$", r"\1", c["def"])

        ie = ET.SubElement(te, "indexes")
        unique_constraints = {c["name"] for c in cons if c["type"] == "u"}
        for i in v["indexes"] or []:
            m = re.search(r"USING (\w+) \((.*?)\)(?: WHERE .*)?$", i["def"])
            a = {"name": i["name"], "columns": m.group(2) if m else "", "unique": str(i["unique"]).lower()}
            if m and m.group(1) != "btree":
                a["method"] = m.group(1)
            if i["primary"]:
                a["primary"] = "true"
            if i["name"] in unique_constraints:
                a["constraint"] = "true"
            if i["where"]:
                a["where"] = re.sub(r"^\((.*)\)$", r"\1", i["where"])
            ix = ET.SubElement(ie, "index", a)
            if kept["indexes"].get(i["name"]):
                ET.SubElement(ix, "description").text = kept["indexes"][i["name"]]

        tr = ET.SubElement(te, "triggers")
        for defn in v["triggers"] or []:
            name, timing, event, fn = parse_trigger(defn)
            ET.SubElement(tr, "trigger", name=name or "", timing=timing, event=event, function=fn)

    if prose.get("proposals") is not None:
        root.append(prose["proposals"])
    if prose.get("review") is not None:
        root.append(prose["review"])

    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode").replace("\n    <table ", "\n\n    <table ")
    return HEADER + body + "\n", report


# ── main ──────────────────────────────────────────────────────────────────────

def print_report(report):
    labels = [
        ("new_tables", f"New tables — give each a group (currently \"{NEW_GROUP}\") and a description"),
        ("new_columns", "New columns — add a description (and allowedValues if enumerated)"),
        ("retyped", "Columns whose type changed"),
        ("gone_tables", "Tables no longer in the database — their prose was dropped"),
        ("gone_columns", "Columns no longer in the database — their prose was dropped"),
        ("unscoped", "Tables with no release scope — add scope=\"v1\" or scope=\"later\" release=\"…\""),
    ]
    for key, label in labels:
        if report[key]:
            print(f"\n{label}:")
            for item in report[key]:
                print(f"  • {item}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="do not write; exit 1 if schema.xml is out of date")
    ap.add_argument("--no-html", action="store_true", help="do not re-render schema.html")
    args = ap.parse_args()

    catalog = read_catalog()
    text, report = build(catalog, read_prose())
    current = XML.read_text(encoding="utf-8") if XML.exists() else ""

    if args.check:
        if text == current:
            print(f"schema.xml is current ({len(catalog)} tables).")
            return 0
        print("schema.xml is out of date with the database. Run scripts/refresh-schema-xml.py.")
        print_report(report)
        return 1

    if text == current:
        print(f"schema.xml already matches the database ({len(catalog)} tables).")
    else:
        XML.write_text(text, encoding="utf-8")
        print(f"wrote schema.xml — {len(catalog)} tables")
    print_report(report)

    if not args.no_html:
        sys.stdout.flush()
        subprocess.run([sys.executable, str(RENDER)], check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

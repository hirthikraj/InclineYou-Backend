#!/usr/bin/env python3
"""Render backend/schema.xml into a browsable backend/schema.html.

schema.xml is the source; the HTML is a build product, regenerated whenever the
XML changes. scripts/refresh-schema-xml.py runs this after every refresh, so a
direct call is only needed after a hand edit to the XML's prose. Standard
library only, so it runs anywhere python3 does:

    python3 scripts/render-schema-html.py
"""
import copy
import html
import re
import sys
import xml.etree.ElementTree as ET
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "schema.xml"
OUT = ROOT / "schema.html"
# The release book at the repo root keeps a copy, so the page travels with v1-scope.html.
RELEASE_COPY = ROOT.parent / "release" / "schema.html"


def prose(text):
    """Escape, then turn `backticks` into <code>. Descriptions are written in
    the same markdown-ish register as SCHEMA.md, so this is the only markup."""
    if not text:
        return ""
    text = " ".join(text.split())
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", html.escape(text))


# Set by the agreed-schema page, which holds only some tables: a reference to one
# it does not hold links across to the full page instead of rendering as text.
ELSEWHERE = {"tables": set(), "page": ""}


def table_link(name, known):
    # A reference to a table not yet in the XML renders as text, not a dead link.
    if name in known:
        return f'<a class="tref" href="#t-{name}">{html.escape(name)}</a>'
    if name in ELSEWHERE["tables"]:
        return f'<a class="tref" href="{ELSEWHERE["page"]}#t-{name}">{html.escape(name)}</a>'
    return f'<span class="tref tref--pending" title="Not documented yet">{html.escape(name)}</span>'


def scope_of(el):
    return el.get("scope") or "v1"


RELEASES = {
    "portal": "Client portal · next release",
    "team": "Team coaching",
    "workspaces": "Workspaces",
    "phone": "Phone app & offline sync",
    "gym": "Gym platform",
    "gst": "GST summary",
    "deprecated": "Deprecated — kept by the additive law",
}


def release_label(key):
    return RELEASES.get(key or "", key or "Later")


# ── proposals: the agreed schema, overlaid on the current one ─────────────────
#
# <proposals> holds changes that are decided but not migrated. They are applied
# to the in-memory tree only — each touched element is tagged `pchange`
# (add | drop | change) and `pid` — so every table renders as current state with
# the agreed difference drawn on top, and nothing is ever written back.

SECTIONS = {
    "ForeignKey": ("foreignKeys", "foreignKey"),
    "Index": ("indexes", "index"),
    "Check": ("checks", "check"),
    "Trigger": ("triggers", "trigger"),
}


def _copy_as(tag, src, **extra):
    e = ET.Element(tag, dict(src.attrib))
    e.text = src.text
    for child in src:
        e.append(copy.deepcopy(child))
    for k, v in extra.items():
        e.set(k, v)
    return e


def _section(t, name):
    s = t.find(name)
    return s if s is not None else ET.SubElement(t, name)


def _mark(el, pid, change, reason=None):
    el.set("pid", pid)
    el.set("pchange", change)
    if reason:
        el.set("preason", " ".join(reason.split()))


def _ref(by_name, target, table, column, constraint, pid, change):
    tt = by_name.get(target)
    if tt is None:
        return
    rb = _section(tt, "referencedBy")
    if change == "drop":
        for r in rb.findall("reference"):
            if r.get("constraint") == constraint:
                _mark(r, pid, "drop")
        return
    ET.SubElement(rb, "reference", table=table, column=column, constraint=constraint, pid=pid, pchange="add")


def apply_proposals(db):
    tables_el = db.find("tables")
    by_name = {t.get("name"): t for t in tables_el.findall("table")}
    for p in db.findall("proposals/proposal"):
        pid = p.get("id")

        # New tables first, so an alter or a foreign key can point at one.
        created = []
        for ct in p.findall("createTable"):
            if ct.get("name") in by_name:
                sys.exit(f"{pid}: createTable {ct.get('name')} already exists")
            t = _copy_as("table", ct, proposed=pid)
            tables_el.append(t)
            by_name[t.get("name")] = t
            created.append(t)
        for t in created:
            _section(t, "referencedBy")
            for fk in t.findall("foreignKeys/foreignKey"):
                _ref(by_name, fk.get("referencesTable"), t.get("name"), fk.get("column"), fk.get("name"), pid, "add")

        for al in p.findall("alter"):
            t = by_name.get(al.get("table"))
            if t is None:
                sys.exit(f"{pid}: alter names a table that does not exist: {al.get('table')}")
            t.set("altered", " ".join(filter(None, [t.get("altered"), pid])))
            cols = _section(t, "columns")
            colmap = {c.get("name"): c for c in cols.findall("column")}

            def col(op):
                c = colmap.get(op.get("name"))
                if c is None:
                    sys.exit(f"{pid}: {t.get('name')} has no column {op.get('name')}")
                return c

            for op in al:
                kind = op.tag
                if kind == "description":
                    d = t.find("description")
                    d.set("pwas", d.text or "")
                    d.text = op.text
                    _mark(d, pid, "change")
                elif kind == "addColumn":
                    c = _copy_as("column", op)
                    _mark(c, pid, "add")
                    # Where `after` says, else before the timestamps, so the table
                    # reads in its final order.
                    after = c.attrib.pop("after", None)
                    if after:
                        at = next((i + 1 for i, x in enumerate(cols) if x.get("name") == after), None)
                        if at is None:
                            sys.exit(f"{pid}: {t.get('name')} has no column {after} to place {c.get('name')} after")
                    else:
                        at = next((i for i, x in enumerate(cols) if x.get("name") in ("created_at", "updated_at", "deleted_at")), None)
                    cols.insert(at, c) if at is not None else cols.append(c)
                    colmap[c.get("name")] = c
                elif kind == "dropColumn":
                    _mark(col(op), pid, "drop", op.findtext("reason"))
                elif kind == "changeColumn":
                    c = col(op)
                    _mark(c, pid, "change")
                    nd = op.find("description")
                    if nd is not None:
                        od = c.find("description")
                        c.set("pwas", od.text if od is not None else "")
                        if od is None:
                            od = ET.SubElement(c, "description")
                        od.text = nd.text
                    nv = op.find("allowedValues")
                    if nv is not None:
                        ov = c.find("allowedValues")
                        c.set("pwas-values", ", ".join(v.text for v in ov.findall("value")) if ov is not None else "")
                        if ov is not None:
                            c.remove(ov)
                        c.append(copy.deepcopy(nv))
                    for k in ("type", "nullable", "default"):
                        if op.get(k) is not None:
                            c.set("pwas-" + k, c.get(k) or "")
                            c.set(k, op.get(k))
                elif kind.startswith("add") and kind[3:] in SECTIONS:
                    sec, sub = SECTIONS[kind[3:]]
                    e = _copy_as(sub, op)
                    _mark(e, pid, "add")
                    _section(t, sec).append(e)
                    if sub == "foreignKey":
                        e.set("onUpdate", e.get("onUpdate", "NO ACTION"))
                        e.set("onDelete", e.get("onDelete", "NO ACTION"))
                        _ref(by_name, e.get("referencesTable"), t.get("name"), e.get("column"), e.get("name"), pid, "add")
                elif kind.startswith("drop") and kind[4:] in SECTIONS:
                    sec, sub = SECTIONS[kind[4:]]
                    e = next((x for x in t.findall(f"{sec}/{sub}")
                              if x.get("name") == op.get("name") and not x.get("pchange")), None)
                    if e is None:
                        sys.exit(f"{pid}: {t.get('name')} has no {sub} {op.get('name')} to drop")
                    _mark(e, pid, "drop", op.findtext("reason"))
                    if sub == "foreignKey":
                        _ref(by_name, e.get("referencesTable"), t.get("name"), e.get("column"), e.get("name"), pid, "drop")
                else:
                    sys.exit(f"{pid}: unknown operation <{kind}> on {t.get('name')}")
    return db.findall("proposals/proposal")


SIGN = {"add": "+", "drop": "−", "change": "~"}


def pbadge(el):
    pc = el.get("pchange")
    if not pc:
        return ""
    return (f'<a class="pbadge pbadge--{pc}" href="#p-{html.escape(el.get("pid"))}" '
            f'title="{ {"add": "Added", "drop": "Dropped", "change": "Changed"}[pc] } by proposal {html.escape(el.get("pid"))}">'
            f'{SIGN[pc]} {html.escape(el.get("pid"))}</a>')


def pclass(el, extra=""):
    pc = el.get("pchange")
    cls = " ".join(filter(None, [extra, f"pc pc--{pc}" if pc else ""]))
    return f' class="{cls}"' if cls else ""


def pnote(el):
    out = ""
    if el.get("preason"):
        out += f'<div class="preason"><b>Drop</b>{prose(el.get("preason"))}</div>'
    was = []
    for k in ("type", "nullable", "default"):
        if el.get("pwas-" + k) is not None:
            was.append(f'{k} <code>{html.escape(el.get("pwas-" + k) or "—")}</code>')
    if el.get("pwas-values") is not None:
        was.append(f'values <code>{html.escape(el.get("pwas-values") or "—")}</code>')
    if el.get("pwas") is not None:
        was.append(prose(el.get("pwas")) or '<i>no note</i>')
    if was:
        out += f'<div class="pwas"><b>Was</b>{" · ".join(was)}</div>'
    return out


def live(els):
    return [e for e in els if e.get("pchange") != "drop"]


def render_table(t, known, later_cols_note=True, inline_later=False):
    name = t.get("name")
    in_v1 = scope_of(t) == "v1"
    # A composite key badges each of its columns; a dropped key badges none.
    fks = {}
    for fk in live(t.findall("foreignKeys/foreignKey")):
        for part in fk.get("column").split(", "):
            fks.setdefault(part, fk)
    pk_cols = {c.strip() for c in (t.find("primaryKey").get("columns") if t.find("primaryKey") is not None else "").split(",")}

    rows = []
    held = []
    for c in t.findall("columns/column"):
        cname = c.get("name")
        if in_v1 and scope_of(c) == "later" and not inline_later:
            held.append(c)
            continue
        badges = []
        if pbadge(c):
            badges.append(pbadge(c))
        if inline_later and in_v1 and scope_of(c) == "later":
            badges.append(f'<span class="rel rel--inline">{html.escape(release_label(c.get("release")))}</span>')
        if cname in pk_cols:
            badges.append('<span class="badge badge--pk">PK</span>')
        if cname in fks:
            fk = fks[cname]
            badges.append(
                f'<span class="badge badge--fk">FK</span>'
                f'<span class="fk-target">→ {table_link(fk.get("referencesTable"), known)}'
                f'.{html.escape(fk.get("referencesColumn"))}</span>'
            )
        values = [v.text for v in c.findall("allowedValues/value")]
        chips = "".join(f'<span class="chip">{html.escape(v)}</span>' for v in values)
        desc = prose(c.findtext("description"))
        note = desc + (f'<div class="chips">{chips}</div>' if chips else "") + pnote(c)
        nullable = c.get("nullable") == "true"
        default = c.get("default")
        rows.append(
            f'<tr{pclass(c)}>'
            f'<td class="col-name"><code>{html.escape(cname)}</code><div class="badges">{"".join(badges)}</div></td>'
            f'<td class="col-type"><code>{html.escape(c.get("type"))}</code></td>'
            f'<td class="col-null">{"<span class=nullable>null</span>" if nullable else "<span class=notnull>not null</span>"}</td>'
            f'<td class="col-default">{f"<code>{html.escape(default)}</code>" if default else "<span class=muted>—</span>"}</td>'
            f'<td class="col-note">{note or "<span class=muted>—</span>"}</td>'
            f'</tr>'
        )

    fk_rows = "".join(
        f'<tr{pclass(fk)}><td><code>{html.escape(fk.get("column"))}</code> {pbadge(fk)}</td>'
        f'<td>{table_link(fk.get("referencesTable"), known)}.<code>{html.escape(fk.get("referencesColumn"))}</code></td>'
        f'<td><code class="muted">{html.escape(fk.get("name"))}</code>{pnote(fk)}</td>'
        f'<td>{html.escape(fk.get("onUpdate", "NO ACTION"))}</td>'
        f'<td>{html.escape(fk.get("onDelete", "NO ACTION"))}</td></tr>'
        for fk in t.findall("foreignKeys/foreignKey")
    )
    fk_block = (
        f'<table class="grid"><thead><tr><th>Column</th><th>References</th><th>Constraint</th><th>On update</th><th>On delete</th></tr></thead>'
        f'<tbody>{fk_rows}</tbody></table>'
        if fk_rows else '<p class="muted">No outgoing foreign keys.</p>'
    )

    refs = t.findall("referencedBy/reference")
    ref_block = (
        '<div class="refs">' + "".join(
            f'<span{pclass(r, "ref")}>{table_link(r.get("table"), known)}<span class="ref-col">.{html.escape(r.get("column"))}</span>{pbadge(r)}</span>'
            for r in refs
        ) + '</div>'
        if refs else '<p class="muted">Nothing points at this table.</p>'
    )

    idx_rows = []
    for i in t.findall("indexes/index"):
        kind = "primary" if i.get("primary") == "true" else ("unique" if i.get("unique") == "true" else "index")
        where = i.get("where")
        desc = prose(i.findtext("description"))
        idx_rows.append(
            f'<tr{pclass(i)}><td><code>{html.escape(i.get("name"))}</code> {pbadge(i)}</td>'
            f'<td><span class="kind kind--{kind}">{kind}</span>{f" <span class=kind>{html.escape(i.get('method'))}</span>" if i.get("method") else ""}</td>'
            f'<td><code>{html.escape(i.get("columns"))}</code></td>'
            f'<td>{f"<code>WHERE {html.escape(where)}</code>" if where else "<span class=muted>—</span>"}</td>'
            f'<td>{(desc + pnote(i)) or "<span class=muted>—</span>"}</td></tr>'
        )
    idx_block = (
        f'<table class="grid"><thead><tr><th>Name</th><th>Kind</th><th>Columns</th><th>Partial</th><th>Note</th></tr></thead>'
        f'<tbody>{"".join(idx_rows)}</tbody></table>'
    )

    chk_rows = "".join(
        f'<tr{pclass(k)}><td><code>{html.escape(k.get("name"))}</code> {pbadge(k)}</td><td><code>{html.escape(" ".join((k.text or "").split()))}</code>{pnote(k)}</td></tr>'
        for k in t.findall("checks/check")
    )
    chk_block = (
        f'<h3>Check constraints</h3><div class="scroll"><table class="grid"><thead><tr><th>Name</th><th>Condition</th></tr></thead>'
        f'<tbody>{chk_rows}</tbody></table></div>'
        if chk_rows else ''
    )

    trg_rows = "".join(
        f'<tr{pclass(g)}><td><code>{html.escape(g.get("name"))}</code> {pbadge(g)}</td>'
        f'<td>{html.escape(g.get("timing"))} {html.escape(g.get("event"))}</td>'
        f'<td><code>{html.escape(g.get("function"))}</code>{prose(g.findtext("description")) and "<div class=pwas-plain>" + prose(g.findtext("description")) + "</div>"}{pnote(g)}</td></tr>'
        for g in t.findall("triggers/trigger")
    )
    trg_block = (
        f'<table class="grid"><thead><tr><th>Name</th><th>When</th><th>Function</th></tr></thead><tbody>{trg_rows}</tbody></table>'
        if trg_rows else '<p class="muted">No triggers.</p>'
    )

    held_block = ""
    if held and later_cols_note:
        chips = "".join(f'<code{pclass(c)}>{html.escape(c.get("name"))}</code>' for c in held)
        held_block = (f'<p class="held">{len(held)} column{"s" if len(held) != 1 else ""} on this table '
                      f'belong{"" if len(held) != 1 else "s"} to a later release and are listed under '
                      f'<a href="#l-{name}">Later</a>: {chips}</p>')
    rel = "" if in_v1 else f'<span class="rel">{html.escape(release_label(t.get("release")))}</span>'
    ncols = len(live(t.findall("columns/column"))) - len(live(held))
    nfk = len(live(t.findall("foreignKeys/foreignKey")))
    refs = live(refs)
    ptag = ""
    if t.get("proposed"):
        ptag = f'<a class="pbadge pbadge--add" href="#p-{t.get("proposed")}">Proposed · {t.get("proposed")}</a>'
    elif t.get("altered"):
        ptag = "".join(f'<a class="pbadge pbadge--change" href="#p-{p}">Changes · {p}</a>' for p in t.get("altered").split())
    desc_el = t.find("description")
    seed = t.find("seed")
    seed_block = ""
    if seed is not None:
        heads = "".join(f"<th>{html.escape(h)}</th>" for h in seed.get("columns").split(", "))
        body = "".join("<tr>" + "".join(f"<td><code>{html.escape(v.strip())}</code></td>" for v in r.text.split(",")) + "</tr>"
                       for r in seed.findall("row"))
        seed_block = (f'<h3>Rows the migration writes <span class="count">{len(seed.findall("row"))}</span></h3>'
                      f'<div class="scroll"><table class="grid grid--narrow"><thead><tr>{heads}</tr></thead><tbody>{body}</tbody></table></div>')
    return f'''
<section class="tbl{" tbl--proposed" if t.get("proposed") else ""}" id="t-{name}" data-name="{name}" data-tab="{"v1" if in_v1 else "later"}">
  <header class="tbl-head">
    <div>
      <p class="eyebrow">{html.escape(t.get("group", ""))}{rel}{ptag}</p>
      <h2><a href="#t-{name}" class="anchor">{html.escape(name)}</a>{'<span class="rls" title="Row-level security is enabled on this table">RLS</span>' if t.get("rowLevelSecurity") == "enabled" else ''}</h2>
    </div>
    <div class="stats">
      <span><b>{ncols}</b> columns</span>
      <span><b>{nfk}</b> FKs out</span>
      <span><b>{len(refs)}</b> FKs in</span>
    </div>
  </header>
  <div class="lede">{prose(t.findtext("description"))}{pnote(desc_el) if desc_el is not None else ""}</div>

  <h3>Columns</h3>
  <div class="scroll"><table class="grid cols">
    <thead><tr><th>Column</th><th>Type</th><th>Null</th><th>Default</th><th>Note</th></tr></thead>
    <tbody>{"".join(rows)}</tbody>
  </table></div>
  {held_block}

  {seed_block}

  <h3>Foreign keys</h3>
  <div class="scroll">{fk_block}</div>

  <details class="more"{' open' if len(refs) <= 12 else ''}>
    <summary><h3>Referenced by <span class="count">{len(refs)}</span></h3></summary>
    {ref_block}
  </details>

  {chk_block}

  <h3>Indexes</h3>
  <div class="scroll">{idx_block}</div>

  <h3>Triggers</h3>
  <div class="scroll">{trg_block}</div>
</section>'''


def render_later_columns(tables):
    """The later-release columns that sit on v1 tables, one card per table."""
    out = []
    for t in tables:
        if scope_of(t) != "v1":
            continue
        cols = [c for c in t.findall("columns/column") if scope_of(c) == "later"]
        if not cols:
            continue
        name = t.get("name")
        rows = "".join(
            f'<tr{pclass(c)}><td class="col-name"><code>{html.escape(c.get("name"))}</code><div class="badges">{pbadge(c)}</div></td>'
            f'<td class="col-type"><code>{html.escape(c.get("type"))}</code></td>'
            f'<td><span class="rel rel--inline">{html.escape(release_label(c.get("release")))}</span></td>'
            f'<td class="col-note">{(prose(c.findtext("description")) + pnote(c)) or "<span class=muted>—</span>"}</td></tr>'
            for c in cols)
        out.append(f'''
<section class="tbl tbl--thin" id="l-{name}" data-name="{name}" data-tab="later">
  <header class="tbl-head"><div><p class="eyebrow">{html.escape(t.get("group", ""))} · a v1 table</p>
    <h2><a href="#t-{name}" class="anchor">{html.escape(name)}</a></h2></div>
    <div class="stats"><span><b>{len(cols)}</b> later columns</span></div></header>
  <div class="scroll"><table class="grid cols">
    <thead><tr><th>Column</th><th>Type</th><th>Waits for</th><th>Note</th></tr></thead>
    <tbody>{rows}</tbody></table></div>
</section>''')
    return "".join(out)


SEVERITY = ["critical", "high", "medium", "low", "info"]


def render_review(review):
    if review is None:
        return '<p class="muted">No review recorded.</p>'
    findings = review.findall("finding")
    counts = {s: sum(1 for f in findings if f.get("severity") == s) for s in SEVERITY}
    fixed = sum(1 for f in findings if (f.get("status") or "").startswith("fixed"))
    tiles = "".join(
        f'<span class="sev sev--{s}"><b>{counts[s]}</b> {s}</span>' for s in SEVERITY if counts[s])
    groups = OrderedDict()
    for f in findings:
        groups.setdefault(f.get("area") or "Other", []).append(f)
    body = []
    for area, fs in groups.items():
        items = []
        for f in fs:
            status = f.get("status") or "open"
            where = f.get("where")
            items.append(
                f'<li class="finding" id="f-{html.escape(f.get("id"))}">'
                f'<div class="finding__head"><span class="sev sev--{html.escape(f.get("severity"))}">{html.escape(f.get("severity"))}</span>'
                f'<code class="fid">{html.escape(f.get("id"))}</code>'
                f'<b>{prose(f.findtext("title"))}</b>'
                f'<span class="st st--{"fixed" if status.startswith("fixed") else "open"}">{html.escape(status)}</span></div>'
                f'<p>{prose(f.findtext("detail"))}</p>'
                + (f'<p class="fix"><span>Change</span> {prose(f.findtext("fix"))}</p>' if f.findtext("fix") else "")
                + (f'<p class="where"><code>{html.escape(where)}</code></p>' if where else "")
                + '</li>')
        body.append(f'<h3 class="area">{html.escape(area)} <span class="count">{len(fs)}</span></h3><ol class="findings">{"".join(items)}</ol>')
    return (f'<div class="review-head"><p class="lede">{prose(review.findtext("summary"))}</p>'
            f'<div class="meta">{tiles}<span><b>{fixed}</b> of {len(findings)} fixed in the schema</span></div></div>'
            + "".join(body))


CSS = """
:root{
  --bg:#f6f7f9; --surface:#ffffff; --surface-2:#f1f3f6; --line:#e3e6eb;
  --text:#1b1f24; --muted:#6b7380; --accent:#2f6fed; --accent-soft:#e8f0fe;
  --pk:#b7791f; --pk-soft:#fdf3e1; --fk:#2f6fed; --fk-soft:#e8f0fe;
  --ok:#2b8a57; --warn:#b54708; --bad:#c0281e; --code:#0f3d8a; --shadow:0 1px 2px rgba(16,24,40,.05),0 1px 3px rgba(16,24,40,.06);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0f1115; --surface:#171a20; --surface-2:#1e222a; --line:#2a2f38;
    --text:#e6e8ec; --muted:#8b93a1; --accent:#6ea0ff; --accent-soft:#1c2a45;
    --pk:#f0b35a; --pk-soft:#3a2c14; --fk:#6ea0ff; --fk-soft:#1c2a45;
    --ok:#5cc990; --warn:#f39a5b; --bad:#ff8a80; --code:#a9c5ff; --shadow:none;
  }
}
:root[data-theme="dark"]{
  --bg:#0f1115; --surface:#171a20; --surface-2:#1e222a; --line:#2a2f38;
  --text:#e6e8ec; --muted:#8b93a1; --accent:#6ea0ff; --accent-soft:#1c2a45;
  --pk:#f0b35a; --pk-soft:#3a2c14; --fk:#6ea0ff; --fk-soft:#1c2a45;
  --ok:#5cc990; --warn:#f39a5b; --bad:#ff8a80; --code:#a9c5ff; --shadow:none;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth; scroll-padding-top:16px}
body{margin:0; background:var(--bg); color:var(--text);
  font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
code{font:12.5px/1.4 ui-monospace,SFMono-Regular,"JetBrains Mono",Menlo,Consolas,monospace; color:var(--code)}
a{color:var(--accent); text-decoration:none}
a:hover{text-decoration:underline}
.layout{display:grid; grid-template-columns:272px minmax(0,1fr); min-height:100vh}

/* ---- sidebar ---- */
.side{position:sticky; top:0; height:100vh; overflow:auto; background:var(--surface);
  border-right:1px solid var(--line); padding:20px 14px 40px}
.brand{font-weight:700; font-size:15px; margin:0 6px 2px}
.brand-sub{color:var(--muted); font-size:12px; margin:0 6px 14px}
.search{width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:8px;
  background:var(--surface-2); color:var(--text); font:inherit; outline:none}
.search:focus{border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft)}
.nav-group{margin-top:18px}
.nav-group h4{margin:0 6px 6px; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted)}
.nav a{display:flex; justify-content:space-between; gap:8px; padding:5px 8px; border-radius:6px;
  color:var(--text); font:12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.nav a:hover{background:var(--surface-2); text-decoration:none}
.nav a.active{background:var(--accent-soft); color:var(--accent)}
.nav-group h4 .n{font-weight:500; letter-spacing:0}
.nav a .n{color:var(--muted); font-size:11px}
.nav-empty{display:none; color:var(--muted); font-size:12px; margin:14px 6px}
.theme{margin-top:22px; display:flex; gap:4px; padding:0 6px}
.theme button{flex:1; padding:5px; border:1px solid var(--line); background:var(--surface-2); color:var(--muted);
  border-radius:6px; font:inherit; font-size:12px; cursor:pointer}
.theme button[aria-pressed="true"]{color:var(--accent); border-color:var(--accent)}

/* ---- main ---- */
.main{padding:28px 36px 80px; max-width:1240px}
.page-head h1{margin:0 0 4px; font-size:24px}
.page-head p{margin:0; color:var(--muted)}
.meta{display:flex; flex-wrap:wrap; gap:8px; margin-top:12px}
.meta span{background:var(--surface); border:1px solid var(--line); border-radius:999px; padding:3px 10px; font-size:12px; color:var(--muted)}
.meta b{color:var(--text)}
.conv{margin:22px 0 8px; background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:4px 18px; box-shadow:var(--shadow)}
.conv summary{cursor:pointer; padding:12px 0; font-weight:600}
.conv dl{margin:0 0 14px; display:grid; grid-template-columns:140px 1fr; gap:8px 16px}
.conv dt{font-weight:600; color:var(--muted); font-size:12.5px}
.conv dd{margin:0}

.tbl{background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:22px 24px 10px;
  margin-top:24px; box-shadow:var(--shadow)}
.tbl:target{border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft)}
.tbl-head{display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap;
  border-bottom:1px solid var(--line); padding-bottom:12px}
.eyebrow{margin:0; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted)}
.tbl h2{margin:2px 0 0; font:600 20px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.tbl h2 .anchor{color:var(--text)}
.rls{margin-left:10px; vertical-align:middle; font:700 10px/1 ui-sans-serif,system-ui,sans-serif; letter-spacing:.04em;
  padding:3px 6px; border-radius:4px; color:var(--ok); background:color-mix(in srgb,var(--ok) 14%,transparent)}
.stats{display:flex; gap:14px; color:var(--muted); font-size:12.5px}
.stats b{color:var(--text)}
.lede{margin:14px 0 4px; max-width:78ch}
.tbl h3{margin:22px 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted)}
.scroll{overflow-x:auto}
.grid{width:100%; border-collapse:collapse; font-size:13px}
.grid th{text-align:left; font-weight:600; font-size:11.5px; color:var(--muted); background:var(--surface-2);
  padding:7px 10px; border-bottom:1px solid var(--line); white-space:nowrap}
.grid th:first-child{border-top-left-radius:8px} .grid th:last-child{border-top-right-radius:8px}
.grid td{padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top}
.grid tbody tr:hover td{background:var(--surface-2)}
.grid tbody tr:last-child td{border-bottom:0}
.cols .col-name{white-space:nowrap; min-width:190px}
.cols .col-name code{font-weight:600; color:var(--text)}
.cols .col-type,.cols .col-null,.cols .col-default{white-space:nowrap}
.cols .col-note{min-width:280px}
.badges{display:flex; flex-wrap:wrap; gap:4px; align-items:center; margin-top:4px}
.badge{font:700 10px/1 ui-sans-serif,system-ui,sans-serif; padding:3px 5px; border-radius:4px; letter-spacing:.03em}
.badge--pk{color:var(--pk); background:var(--pk-soft)}
.badge--fk{color:var(--fk); background:var(--fk-soft)}
.fk-target{font-size:12px; color:var(--muted)}
.notnull{color:var(--text); font-size:12px}
.nullable{color:var(--muted); font-size:12px; font-style:italic}
.muted{color:var(--muted)}
.chips{display:flex; flex-wrap:wrap; gap:4px; margin-top:6px}
.chip{font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; padding:1px 7px; border-radius:999px;
  border:1px solid var(--line); background:var(--surface-2)}
.tref{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-weight:600}
.tref--pending{color:var(--muted); font-weight:500; border-bottom:1px dashed var(--line); cursor:help}
.kind{font-size:11px; font-weight:600; padding:2px 7px; border-radius:999px; background:var(--surface-2); color:var(--muted)}
.kind--primary{color:var(--pk); background:var(--pk-soft)}
.kind--unique{color:var(--ok); background:color-mix(in srgb,var(--ok) 14%,transparent)}
.more summary{list-style:none; cursor:pointer}
.more summary::-webkit-details-marker{display:none}
.more summary h3{display:inline-flex; align-items:center; gap:8px}
.more summary h3::before{content:"▸"; transition:transform .15s}
.more[open] summary h3::before{transform:rotate(90deg)}
.count{background:var(--surface-2); border:1px solid var(--line); border-radius:999px; padding:0 7px; font-size:11px; color:var(--text)}
.refs{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px}
.ref{padding:3px 9px; border:1px solid var(--line); border-radius:999px; font-size:12.5px; background:var(--surface-2)}
.ref-col{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; color:var(--muted); font-size:12px}
.top{position:fixed; right:20px; bottom:20px; width:38px; height:38px; border-radius:50%; display:grid; place-items:center;
  background:var(--surface); border:1px solid var(--line); box-shadow:var(--shadow); color:var(--text); font-size:16px}
.top:hover{text-decoration:none; border-color:var(--accent)}

/* ---- tabs ---- */
.tabs{display:flex; gap:4px; margin:20px 0 4px; border-bottom:1px solid var(--line); flex-wrap:wrap}
.tabs a{padding:9px 14px; border:1px solid transparent; border-bottom:0; border-radius:8px 8px 0 0; color:var(--muted);
  font-weight:600; font-size:13.5px; margin-bottom:-1px}
.tabs a:hover{text-decoration:none; color:var(--text)}
.tabs a[aria-selected="true"]{color:var(--text); background:var(--surface); border-color:var(--line)}
.tabs .n{font-weight:500; color:var(--muted); font-size:12px; margin-left:4px}
.panel[hidden]{display:none}
.panel-note{margin:14px 0 0; color:var(--muted); max-width:80ch}
.rel{margin-left:8px; font:600 10.5px/1 ui-sans-serif,system-ui,sans-serif; letter-spacing:.03em; text-transform:none;
  padding:3px 7px; border-radius:999px; color:var(--warn); background:color-mix(in srgb,var(--warn) 13%,transparent)}
.rel--inline{margin-left:0; white-space:nowrap}
.held{margin:10px 0 0; font-size:12.5px; color:var(--muted); display:flex; flex-wrap:wrap; gap:6px; align-items:center}
.held code{font-size:12px}
.tbl--thin{padding-bottom:14px}
.sev{font:700 10.5px/1 ui-sans-serif,system-ui,sans-serif; letter-spacing:.04em; text-transform:uppercase; padding:4px 8px; border-radius:999px}
.meta .sev{text-transform:none; letter-spacing:0; font-weight:500; font-size:12px; border:0}
.sev--critical{color:#fff; background:#c0281e}
.sev--high{color:var(--warn); background:color-mix(in srgb,var(--warn) 16%,transparent)}
.sev--medium{color:var(--accent); background:var(--accent-soft)}
.sev--low,.sev--info{color:var(--muted); background:var(--surface-2)}
.area{margin:28px 0 10px; font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); display:flex; gap:8px; align-items:center}
.findings{list-style:none; margin:0; padding:0; display:grid; gap:10px}
.finding{background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:14px 18px; box-shadow:var(--shadow)}
.finding:target{border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft)}
.finding__head{display:flex; flex-wrap:wrap; gap:8px 10px; align-items:center}
.finding__head b{flex:1 1 320px; font-size:14.5px}
.finding p{margin:8px 0 0; max-width:88ch}
.fid{color:var(--muted); font-size:11.5px}
.fix span{font:700 10.5px/1 ui-sans-serif,system-ui,sans-serif; text-transform:uppercase; letter-spacing:.05em; color:var(--ok); margin-right:6px}
.where code{font-size:11.5px; color:var(--muted)}
.st{font:600 11px/1 ui-sans-serif,system-ui,sans-serif; padding:4px 8px; border-radius:999px; white-space:nowrap}
.st--fixed{color:var(--ok); background:color-mix(in srgb,var(--ok) 14%,transparent)}
.st--open{color:var(--muted); background:var(--surface-2)}


/* ---- proposals ---- */
.pbadge{display:inline-block; font:700 10px/1 ui-sans-serif,system-ui,sans-serif; letter-spacing:.03em; padding:3px 6px;
  border-radius:4px; white-space:nowrap; vertical-align:middle; text-transform:none}
a.pbadge:hover{text-decoration:none; filter:brightness(1.1)}
.eyebrow .pbadge{margin-left:8px}
.pbadge--add{color:var(--ok); background:color-mix(in srgb,var(--ok) 15%,transparent)}
.pbadge--drop{color:var(--bad); background:color-mix(in srgb,var(--bad) 13%,transparent)}
.pbadge--change{color:var(--warn); background:color-mix(in srgb,var(--warn) 14%,transparent)}
.grid tr.pc td:first-child{box-shadow:inset 3px 0 0 var(--line)}
.grid tr.pc--add td{background:color-mix(in srgb,var(--ok) 6%,transparent)}
.grid tr.pc--add td:first-child{box-shadow:inset 3px 0 0 var(--ok)}
.grid tr.pc--drop td{background:color-mix(in srgb,var(--bad) 5%,transparent)}
.grid tr.pc--drop td:first-child{box-shadow:inset 3px 0 0 var(--bad)}
.grid tr.pc--drop td:first-child > code, .grid tr.pc--drop .col-type code{text-decoration:line-through; opacity:.65}
.grid tr.pc--change td:first-child{box-shadow:inset 3px 0 0 var(--warn)}
.preason,.pwas{margin-top:6px; font-size:12.5px; color:var(--muted)}
.preason b,.pwas b{font:700 10px/1 ui-sans-serif,system-ui,sans-serif; text-transform:uppercase; letter-spacing:.05em; margin-right:6px}
.preason b{color:var(--bad)} .pwas b{color:var(--warn)}
.pwas-plain{margin-top:4px; font-size:12.5px; color:var(--muted)}
.ref.pc--add{border-color:var(--ok)}
.ref.pc--drop{text-decoration:line-through; opacity:.6}
.ref .pbadge{margin-left:6px}
.held code.pc--drop{text-decoration:line-through; opacity:.65}
.tbl--proposed{border-style:dashed; border-color:color-mix(in srgb,var(--ok) 55%,var(--line))}
.grid--narrow{width:auto; min-width:260px}
.pdot{margin-left:6px; font:700 9.5px/1 ui-sans-serif,system-ui,sans-serif; padding:2px 4px; border-radius:3px}
.pdot--add{color:var(--ok); background:color-mix(in srgb,var(--ok) 15%,transparent)}
.pdot--change{color:var(--warn); background:color-mix(in srgb,var(--warn) 14%,transparent)}
.prop{background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:18px 22px; margin-top:18px; box-shadow:var(--shadow)}
.prop:target{border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft)}
.prop__head{display:flex; flex-wrap:wrap; gap:8px 10px; align-items:center}
.prop__head b{flex:1 1 320px; font-size:15.5px}
.prop p{max-width:88ch}
.prop h3{margin:20px 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted)}
.prop__finds{display:flex; flex-wrap:wrap; gap:6px; align-items:center}
.prop__finds span{font:700 10.5px/1 ui-sans-serif,system-ui,sans-serif; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-right:4px}
.prop__finds .fid{border:1px solid var(--line); border-radius:999px; padding:1px 8px; background:var(--surface-2)}
.prop__tables{margin:0; padding-left:18px; display:grid; gap:10px}
.ops{list-style:none; margin:6px 0 0; padding:0; display:grid; gap:5px}
.ops li{display:flex; flex-wrap:wrap; gap:6px; align-items:baseline; font-size:13px}
.op-detail{color:var(--muted); min-width:0; overflow-wrap:anywhere}
.fn{border:1px solid var(--line); border-radius:10px; padding:10px 14px; margin-top:8px; background:var(--surface-2)}
.fn__head{display:flex; gap:8px; align-items:center}
.fn p{margin:6px 0 0; font-size:13px}
.fn summary{cursor:pointer; font-size:12.5px; color:var(--accent); margin-top:6px}
.sql{margin:8px 0 0; padding:12px; overflow:auto; background:var(--surface); border:1px solid var(--line); border-radius:8px; max-width:100%}
.sql code{font-size:12px; white-space:pre}
.prop__list{margin:0; padding-left:18px; display:grid; gap:6px; font-size:13.5px}

@media (max-width: 860px){
  .layout{grid-template-columns:1fr}
  .side{position:static; height:auto; border-right:0; border-bottom:1px solid var(--line); padding:16px}
  .main{padding:18px 16px 60px}
  .tbl{padding:16px 14px 6px}
  .conv dl{grid-template-columns:1fr}
  .main{min-width:0}
  .tabs{flex-wrap:nowrap; overflow-x:auto; max-width:100%}
  .tabs a{white-space:nowrap; padding:9px 12px}
  .tabs .n{display:none}
}
"""

JS = """
(function(){
  var root=document.documentElement, btns=document.querySelectorAll('.theme button');
  function setTheme(t){ if(t==='auto'){root.removeAttribute('data-theme')} else {root.setAttribute('data-theme',t)}
    btns.forEach(function(b){b.setAttribute('aria-pressed', String(b.dataset.t===t))});
    try{localStorage.setItem('schema-theme',t)}catch(e){} }
  var saved='auto'; try{saved=localStorage.getItem('schema-theme')||'auto'}catch(e){}
  setTheme(saved); btns.forEach(function(b){b.addEventListener('click',function(){setTheme(b.dataset.t)})});

  var tabs=[].slice.call(document.querySelectorAll('.tabs a')), panels=[].slice.call(document.querySelectorAll('.panel')),
      groups=[].slice.call(document.querySelectorAll('.nav-group')), current='v1';
  function show(tab){
    current=tab;
    tabs.forEach(function(a){a.setAttribute('aria-selected', String(a.dataset.tab===tab))});
    panels.forEach(function(p){p.hidden=p.dataset.panel!==tab});
    groups.forEach(function(g){g.hidden=g.dataset.tab!==tab});
    document.querySelector('.side').hidden = (tab==='review'||tab==='proposals') && window.innerWidth<=860;
    filter();
  }
  function route(){
    var id=(location.hash||'#v1').slice(1), el=document.getElementById(id);
    if(!el){ show('v1'); return; }
    var tab=el.dataset.panel || el.dataset.tab || (el.closest('[data-panel]')||{dataset:{panel:'v1'}}).dataset.panel;
    show(tab);
    if(!el.dataset.panel){ requestAnimationFrame(function(){ el.scrollIntoView(); }); }
  }
  window.addEventListener('hashchange', route);

  var q=document.getElementById('q'), links=[].slice.call(document.querySelectorAll('.nav a')),
      empty=document.querySelector('.nav-empty');
  function filter(){
    var s=q.value.trim().toLowerCase(), any=false;
    groups.forEach(function(g){
      if(g.dataset.tab!==current){ g.hidden=true; return; }
      var hit=false;
      [].forEach.call(g.querySelectorAll('a'),function(a){var h=a.dataset.name.indexOf(s)>-1; a.style.display=h?'':'none'; hit=hit||h});
      g.hidden=!hit; any=any||hit;
    });
    empty.style.display=any||current==='review'||current==='proposals'?'none':'block';
  }
  q.addEventListener('input',filter);
  document.addEventListener('keydown',function(e){ if(e.key==='/'&&document.activeElement!==q){e.preventDefault();q.focus()} });
  route();

  var byName={}; links.forEach(function(a){byName[a.dataset.name]=a});
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(en){ if(en.isIntersecting){
      links.forEach(function(a){a.classList.remove('active')}); var a=byName[en.target.dataset.name]; if(a)a.classList.add('active'); }})},
      {rootMargin:'-10% 0px -75% 0px'});
    document.querySelectorAll('.tbl').forEach(function(s){io.observe(s)});
  }
})();
"""


def nav_mark(t):
    if t.get("proposed"):
        return '<span class="pdot pdot--add" title="Proposed table">new</span>'
    if t.get("altered"):
        return '<span class="pdot pdot--change" title="Changes proposed">~</span>'
    return ""


OPS = {
    "addColumn": ("add", "column"), "dropColumn": ("drop", "column"), "changeColumn": ("change", "column"),
    "addForeignKey": ("add", "foreign key"), "dropForeignKey": ("drop", "foreign key"),
    "addIndex": ("add", "index"), "dropIndex": ("drop", "index"),
    "addCheck": ("add", "check"), "dropCheck": ("drop", "check"),
    "addTrigger": ("add", "trigger"), "dropTrigger": ("drop", "trigger"),
    "description": ("change", "description"),
}


def op_detail(op):
    k = op.tag
    if k == "addColumn":
        bits = [op.get("type"), "null" if op.get("nullable") == "true" else "not null"]
        if op.get("default"):
            bits.append(f"default {op.get('default')}")
        return f'<code>{html.escape(" · ".join(bits))}</code>'
    if k == "changeColumn":
        what = [w for w, tag in (("note", "description"), ("values", "allowedValues")) if op.find(tag) is not None]
        what += [a for a in ("type", "nullable", "default") if op.get(a) is not None]
        vals = op.find("allowedValues")
        extra = f' → <code>{html.escape(", ".join(v.text for v in vals.findall("value")))}</code>' if vals is not None else ""
        return html.escape(" + ".join(what)) + extra
    if k == "addForeignKey":
        return f'<code>({html.escape(op.get("column"))}) → {html.escape(op.get("referencesTable"))} ({html.escape(op.get("referencesColumn"))})</code>'
    if k == "addIndex":
        w = f' WHERE {op.get("where")}' if op.get("where") else ""
        return f'<code>{"unique " if op.get("unique") == "true" else ""}({html.escape(op.get("columns"))}){html.escape(w)}</code>'
    if k == "addCheck":
        return f'<code>{html.escape(" ".join((op.text or "").split()))}</code>'
    if k == "addTrigger":
        return f'<code>{html.escape(op.get("timing"))} {html.escape(op.get("event"))} → {html.escape(op.get("function"))}</code>'
    return prose(op.findtext("reason")) if op.find("reason") is not None else ""


def render_proposals(db, props, known):
    block = db.find("proposals")
    if block is None or not props:
        return '<p class="muted">No pending proposals — the schema above is the whole of it.</p>'
    out = [f'<p class="lede">{prose(block.findtext("summary"))}</p>']
    for p in props:
        pid = html.escape(p.get("id"))
        finds = "".join(f'<a class="fid" href="#f-{html.escape(f)}">{html.escape(f)}</a>' for f in (p.get("findings") or "").split())
        tables = []
        for ct in p.findall("createTable"):
            n = ct.get("name")
            where = "v1" if (ct.get("scope") or "v1") == "v1" else release_label(ct.get("release"))
            tables.append(f'<li><span class="pbadge pbadge--add">+ table</span> {table_link(n, known)} '
                          f'<span class="rel rel--inline">{html.escape(where)}</span> '
                          f'<span class="muted">{len(ct.findall("columns/column"))} columns</span></li>')
        for al in p.findall("alter"):
            items = []
            for op in al:
                change, noun = OPS.get(op.tag, ("change", op.tag))
                name = op.get("name") or ""
                items.append(f'<li><span class="pbadge pbadge--{change}">{SIGN[change]} {noun}</span> '
                             f'<code>{html.escape(name)}</code> <span class="op-detail">{op_detail(op)}</span></li>')
            tables.append(f'<li>{table_link(al.get("table"), known)}<ul class="ops">{"".join(items)}</ul></li>')
        fns = "".join(
            f'<div class="fn"><div class="fn__head"><span class="pbadge pbadge--{"add" if f.get("change") == "add" else "change"}">'
            f'{html.escape(f.get("change"))}</span><code>{html.escape(f.get("name"))}</code></div>'
            + (f'<p>{prose(f.findtext("description"))}</p>' if f.findtext("description") else "")
            + f'<details><summary>SQL</summary><pre class="sql"><code>{html.escape((f.findtext("sql") or "").strip())}</code></pre></details></div>'
            for f in p.findall("functions/function"))
        pols = "".join(
            f'<li><code>{html.escape(x.get("table"))}</code> <span class="kind">{html.escape(x.get("change"))}</span> {prose(x.text)}</li>'
            for x in p.findall("policies/policy"))
        code = "".join(
            f'<li><code>{html.escape(x.get("where"))}</code> — {prose(x.text)}</li>'
            for x in p.findall("code/item"))
        out.append(f'''
<article class="prop" id="p-{pid}">
  <header class="prop__head">
    <code class="fid">{pid}</code><b>{prose(p.findtext("title"))}</b>
    <span class="st st--{"fixed" if p.get("status") == "agreed" else "open"}">{html.escape(p.get("status") or "open")} · {html.escape(p.get("date") or "")}</span>
  </header>
  <p>{prose(p.findtext("summary"))}</p>
  {f'<p class="prop__finds"><span>Findings</span>{finds}</p>' if finds else ""}
  <h3>Tables</h3><ul class="prop__tables">{"".join(tables)}</ul>
  {f'<h3>Functions</h3>{fns}' if fns else ""}
  {f'<h3>Policies &amp; grants</h3><ul class="prop__list">{pols}</ul>' if pols else ""}
  {f'<h3>Code that moves with the migration</h3><ul class="prop__list">{code}</ul>' if code else ""}
</article>''')
    return "".join(out)


def nav_for(tables, tab):
    groups = OrderedDict()
    for t in tables:
        groups.setdefault(t.get("group", "Other"), []).append(t)
    return "".join(
        f'<div class="nav-group" data-tab="{tab}"><h4>{html.escape(g)} <span class="n">{len(ts)}</span></h4>' + "".join(
            f'<a href="#t-{t.get("name")}" data-name="{t.get("name")}">'
            f'<span>{t.get("name")}{nav_mark(t)}</span>'
            f'<span class="n">{sum(1 for c in live(t.findall("columns/column")) if tab == "later" or scope_of(c) == "v1")}</span></a>'
            for t in ts
        ) + '</div>'
        for g, ts in groups.items()
    )


# ── the agreed schema, on its own page ──────────────────────────────────────
#
# The same overlay with the history taken out: what is dropped is gone, what is
# changed is simply its new self, and nothing says "proposed". Only the tables
# named in <proposals finalTables="…"> appear — the ones whose review is done —
# so the page grows as the review does and is the schema the migration builds.

AGREED_OUT = ROOT.parent / "release" / "proposed-schema.html"
MARKS = ("pid", "pchange", "preason", "pwas", "pwas-values", "pwas-type", "pwas-nullable", "pwas-default")


def settle(db):
    for t in db.findall("tables/table"):
        for attr in ("proposed", "altered"):
            t.attrib.pop(attr, None)
        for parent in t.iter():
            for child in list(parent):
                if child.get("pchange") == "drop":
                    parent.remove(child)
        for el in t.iter():
            for m in MARKS:
                el.attrib.pop(m, None)
        rb = t.find("referencedBy")
        if rb is not None:
            rb.set("count", str(len(rb.findall("reference"))))


def render_agreed(src_root):
    db = copy.deepcopy(src_root)
    apply_proposals(db)
    settle(db)
    block = db.find("proposals")
    names = (block.get("finalTables") if block is not None else "") or ""
    everything = {t.get("name"): t for t in db.findall("tables/table")}
    missing = [n for n in names.split() if n not in everything]
    if missing:
        sys.exit(f"finalTables names tables that do not exist: {', '.join(missing)}")
    tables = [everything[n] for n in names.split()]
    if not tables:
        return None
    known = {t.get("name") for t in tables}
    ELSEWHERE["tables"], ELSEWHERE["page"] = set(everything) - known, "schema.html"
    body = "".join(render_table(t, known, later_cols_note=False, inline_later=True) for t in tables)
    ELSEWHERE["tables"], ELSEWHERE["page"] = set(), ""
    nav = nav_for(tables, "v1")
    n_cols = sum(len(t.findall("columns/column")) for t in tables)
    n_fks = sum(len(t.findall("foreignKeys/foreignKey")) for t in tables)
    conv = "".join(f'<dt>{html.escape(c.get("name"))}</dt><dd>{prose(c.text)}</dd>'
                   for c in db.findall("conventions/convention"))
    AGREED_OUT.write_text(f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>InclineYou Agreed Schema</title>
<style>{CSS}</style>
</head>
<body>
<div class="layout">
  <aside class="side">
    <p class="brand">InclineYou schema</p>
    <p class="brand-sub">agreed · {len(tables)} of {len(everything)} tables</p>
    <input id="q" class="search" type="search" placeholder="Filter tables…  ( / )" autocomplete="off">
    <nav class="nav">{nav}</nav>
    <p class="nav-empty">No table matches.</p>
    <div class="theme"><button data-t="auto">Auto</button><button data-t="light">Light</button><button data-t="dark">Dark</button></div>
  </aside>
  <main class="main" id="top">
    <header class="page-head">
      <h1>Agreed schema</h1>
      <p>The tables whose review is finished, as the migration will build them. Tables not listed here are still under review; a reference to one links to the current schema.</p>
      <div class="meta"><span><b>{len(tables)}</b> tables</span><span><b>{n_cols}</b> columns</span><span><b>{n_fks}</b> foreign keys</span></div>
    </header>
    <section class="panel" id="v1" data-panel="v1">
      <details class="conv">
        <summary>Conventions that hold on every table</summary>
        <dl>{conv}</dl>
      </details>
      {body}
    </section>
  </main>
</div>
<a class="top" href="#top" aria-label="Back to top">↑</a>
<script>{JS}</script>
</body>
</html>
''', encoding="utf-8")
    return len(tables)


def main():
    db = ET.parse(SRC).getroot()
    agreed = render_agreed(db)
    props = apply_proposals(db)
    tables = db.findall("tables/table")
    known = {t.get("name") for t in tables}
    v1 = [t for t in tables if scope_of(t) == "v1"]
    later = [t for t in tables if scope_of(t) == "later"]
    later_cols = sum(1 for t in v1 for c in live(t.findall("columns/column")) if scope_of(c) == "later")
    v1_cols = sum(1 for t in v1 for c in live(t.findall("columns/column")) if scope_of(c) == "v1")
    review = db.find("review")
    n_findings = len(review.findall("finding")) if review is not None else 0

    nav = nav_for(v1, "v1") + nav_for(later, "later")

    conv = "".join(
        f'<dt>{html.escape(c.get("name"))}</dt><dd>{prose(c.text)}</dd>'
        for c in db.findall("conventions/convention")
    )

    n_cols = sum(len(live(t.findall("columns/column"))) for t in tables)
    n_fks = sum(len(live(t.findall("foreignKeys/foreignKey"))) for t in tables)
    n_changes = sum(len(p.findall("createTable")) + sum(len(list(a)) for a in p.findall("alter")) for p in props)
    v1_body = "".join(render_table(t, known) for t in v1)
    later_body = render_later_columns(tables) + "".join(render_table(t, known) for t in later)

    OUT.write_text(f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>InclineYou Schema</title>
<style>{CSS}</style>
</head>
<body>
<div class="layout">
  <aside class="side">
    <p class="brand">InclineYou schema</p>
    <p class="brand-sub">{html.escape(db.get("name"))} · {html.escape(db.get("engine"))} {html.escape(db.get("version"))}</p>
    <input id="q" class="search" type="search" placeholder="Filter tables…  ( / )" autocomplete="off">
    <nav class="nav">{nav}</nav>
    <p class="nav-empty">No table matches.</p>
    <div class="theme"><button data-t="auto">Auto</button><button data-t="light">Light</button><button data-t="dark">Dark</button></div>
  </aside>
  <main class="main" id="top">
    <header class="page-head">
      <h1>Database schema</h1>
      <p>The current state of <code>{html.escape(db.get("name"))}</code>, schema <code>{html.escape(db.get("schema"))}</code>, split by release: what the v1 trainer web app runs on, and what is built for a later release. Changes agreed in review but not yet migrated are drawn on top — <span class="pbadge pbadge--add">+ added</span> <span class="pbadge pbadge--drop">− dropped</span> <span class="pbadge pbadge--change">~ changed</span> — and listed under Proposals. Counts are of the agreed schema.</p>
      <div class="meta"><span><b>{len(tables)}</b> tables</span><span><b>{n_cols}</b> columns</span><span><b>{n_fks}</b> foreign keys</span><span><b>{len(props)}</b> proposal{"" if len(props) == 1 else "s"} · {n_changes} changes, not migrated</span></div>
    </header>
    <nav class="tabs" role="tablist">
      <a href="#v1" role="tab" data-tab="v1">v1 schema<span class="n">{len(v1)} tables · {v1_cols} cols</span></a>
      <a href="#later" role="tab" data-tab="later">Later<span class="n">{len(later)} tables · {later_cols} cols on v1 tables</span></a>
      <a href="#proposals" role="tab" data-tab="proposals">Proposals<span class="n">{len(props)} pending · {n_changes} changes</span></a>
      <a href="#review" role="tab" data-tab="review">Review<span class="n">{n_findings} findings</span></a>
    </nav>
    <section class="panel" id="v1" data-panel="v1">
      <p class="panel-note">Everything the v1 trainer web app reads or writes. The tenancy tables stay in v1 although workspaces do not ship: every row's <code>tenant_id</code> and every row-level security policy depend on them, and each trainer gets one solo workspace by trigger.</p>
      <details class="conv">
        <summary>Conventions that hold on every table</summary>
        <dl>{conv}</dl>
      </details>
      {v1_body}
    </section>
    <section class="panel" id="later" data-panel="later" hidden>
      <p class="panel-note">Built for a later release and hidden from v1 (MUST-19). Nothing here is dropped — the additive law keeps every column, and phones in the field carry some of them. First the later-release columns that sit on v1 tables, then the tables no v1 screen reaches.</p>
      {later_body}
    </section>
    <section class="panel" id="proposals" data-panel="proposals" hidden>
      {render_proposals(db, props, known)}
    </section>
    <section class="panel" id="review" data-panel="review" hidden>
      {render_review(review)}
    </section>
  </main>
</div>
<a class="top" href="#top" aria-label="Back to top">↑</a>
<script>{JS}</script>
</body>
</html>
''', encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} — {len(tables)} tables ({len(v1)} v1, {len(later)} later), "
          f"{n_cols} columns, {n_fks} FKs, {len(props)} proposals ({n_changes} changes), {n_findings} review findings")
    if agreed:
        print(f"wrote {AGREED_OUT.relative_to(ROOT.parent)} — {agreed} agreed tables")
    if RELEASE_COPY.parent.exists():
        RELEASE_COPY.write_text(OUT.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"copied to {RELEASE_COPY.relative_to(ROOT.parent)}")


if __name__ == "__main__":
    sys.exit(main())

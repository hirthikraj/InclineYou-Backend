#!/usr/bin/env python3
"""Generate webapp-programs.html.

Run it from anywhere: python3 gen_programs.py — it writes the page next to itself.

Four frames share one shell, so the rail and top bar are defined once here
rather than pasted four times as they were in the file this replaces.
"""
import pathlib

HERE = pathlib.Path(__file__).resolve().parent

# The navigation rail, verbatim from the rest of the design set. Held here as a
# literal because all four frames draw it and the file it replaced pasted it
# four times — which is how the eleven destinations drifted apart before.
RAIL = r"""<nav class="rail" aria-label="Sections">
  <div class="rail__top"><span class="rail__mark"><svg width="17" height="17" viewBox="0 0 100 100" fill="none" aria-hidden="true"><rect x="4" y="16" width="92" height="8" rx="3" fill="#0A0B0D"/><rect x="4" y="13" width="7" height="14" fill="#0A0B0D"/><rect x="89" y="13" width="7" height="14" fill="#0A0B0D"/><rect x="16" y="7" width="10" height="26" fill="#0A0B0D"/><rect x="74" y="7" width="10" height="26" fill="#0A0B0D"/><path d="M28 93 C28 60 72 60 72 93" stroke="#0A0B0D" stroke-width="11"/><circle cx="50" cy="35" r="9" fill="#0A0B0D"/><g stroke="#0A0B0D" stroke-width="11"><path d="M50 43 L50 64"/><path d="M33 22 C34 56 66 56 67 22"/></g></svg></span>
    <span class="rail__word">X&nbsp;REP</span></div>
  <div class="rail__body"><div class="rail__group"><p class="rail__gk">WORK</p><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/></svg><span>Today</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg><span>Schedule</span><span class="rail__n">5</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8"/><path d="M18 13.6c2.1.7 3.5 2.5 3.5 5"/></svg><span>Clients</span><span class="rail__n">22</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10"/></svg><span>Sessions</span></div></div><div class="rail__group"><p class="rail__gk">BUILD</p><div class="rail__i" aria-current="page"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 9h8M8 13h8M8 17h5"/></svg><span>Programs</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="17" r="1.2"/><circle cx="15" cy="17" r="1.2"/></svg><span>Exercises</span></div></div><div class="rail__group"><p class="rail__gk">BUSINESS</p><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10M7 8.5h10M15.5 4c0 4-3.4 4.5-6 4.5h-.5l7 11.5"/></svg><span>Money</span><span class="rail__n rail__n--alert">3</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V4M4 20h16"/><rect x="7.5" y="12" width="3" height="5"/><rect x="12.5" y="8.5" width="3" height="8.5"/><rect x="17" y="6" width="3" height="11"/></svg><span>Reports</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/></svg><span>Nudges</span><span class="rail__n rail__n--acc">8</span></div></div><div class="rail__group"><p class="rail__gk">SYSTEM</p><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6"/><path d="M17.5 3v3.6h-3.6M6.5 21v-3.6h3.6"/></svg><span>Sync queue</span><span class="rail__n">6</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.6M12 18.6v2.6M4.5 12H2M22 12h-2.5M6.2 6.2 4.4 4.4M19.6 19.6l-1.8-1.8M17.8 6.2l1.8-1.8M4.4 19.6l1.8-1.8"/></svg><span>Settings</span></div></div></div>
  <div class="rail__foot"><div class="roleswap">
    <span class="av av--sm" style="background:var(--tx-av-4)">AR</span>
    <span style="flex:1;min-width:0">Anbu R · Trainer</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
  </div></div>
</nav>"""

# ─────────────────────────────────────────────────────────────────── icons ──
SW = ('fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" '
      'stroke-linejoin="round" aria-hidden="true"')


def ic(path, s=15):
    return f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" {SW}>{path}</svg>'


I_CHEV = '<path d="M9 6l6 6-6 6"/>'
I_CHEVD = '<path d="M6 9l6 6 6-6"/>'
I_PLUS = '<path d="M12 5v14M5 12h14"/>'
I_USERS = ('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/>'
           '<path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8"/><path d="M18 13.6c2.1.7 3.5 2.5 3.5 5"/>')
I_COPY = ('<rect x="8.5" y="8.5" width="12" height="12" rx="2.2"/>'
          '<path d="M15.5 5.5H5.5a1 1 0 0 0-1 1v10"/>')
I_SEARCH = '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'
I_DOTS = '<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>'
I_X = '<path d="M6 6l12 12M18 6L6 18"/>'
I_LAYERS = ('<path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="M3 12.5 12 17l9-4.5"/>'
            '<path d="M3 17 12 21.5 21 17"/>')
I_BELL = ('<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/>'
          '<path d="M10 19a2.2 2.2 0 0 0 4 0"/>')
I_GRID = ('<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 9h8M8 13h8M8 17h5"/>')
I_TRASH = '<path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'
I_UNDO = '<path d="M4 10h9a4.5 4.5 0 0 1 0 9H8"/><path d="M7.5 6.5 4 10l3.5 3.5"/>'
I_CHECK = '<path d="M4.5 12.5l5 5 10-11"/>'
I_LIST = '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'
I_LINK = ('<path d="M9.6 14.4 14.4 9.6"/>'
          '<path d="M12.7 7.4 14.4 5.7a3.6 3.6 0 0 1 5.1 5.1l-1.7 1.7"/>'
          '<path d="M11.3 16.6 9.6 18.3a3.6 3.6 0 0 1-5.1-5.1l1.7-1.7"/>')
I_UNLINK = ('<path d="M12.7 7.4 14.4 5.7a3.6 3.6 0 0 1 5.1 5.1l-1.7 1.7"/>'
            '<path d="M11.3 16.6 9.6 18.3a3.6 3.6 0 0 1-5.1-5.1l1.7-1.7"/>'
            '<path d="M4 4l16 16"/>')
I_SWAP = '<path d="M4 8.5h13l-3.2-3.2M20 15.5H7l3.2 3.2"/>'
I_EDIT = '<path d="M4 20h4L20 8l-4-4L4 16v4Z"/>'

# the drag handle: six dots, the same glyph the Exercises rail item uses, so a
# handle and a library row read as the same family
HANDLE = ('<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">'
          '<circle cx="2.2" cy="2.6" r="1.15"/><circle cx="7.8" cy="2.6" r="1.15"/>'
          '<circle cx="2.2" cy="7" r="1.15"/><circle cx="7.8" cy="7" r="1.15"/>'
          '<circle cx="2.2" cy="11.4" r="1.15"/><circle cx="7.8" cy="11.4" r="1.15"/></svg>')


# ─────────────────────────────────────────────────────────────────── shell ──
def top(crumb):
    return f'''<header class="top">
  <nav class="crumbs" aria-label="Breadcrumb"><a>Programs</a><i>{ic(I_CHEV, 12)}</i><b>{crumb}</b></nav><div class="omni">{ic(I_SEARCH)}<span>Search clients, sessions, exercises…</span><kbd>⌘K</kbd></div>
  <div class="top__acts"><span class="sync"><i></i>Synced</span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Notifications">{ic(I_BELL, 18)}</button>
  </div></header>'''


def frame(fid, name, frm, url, body, note):
    return f'''
<section class="unit" id="f-{fid}">
  <div class="unit__label">
    <span class="unit__id">{fid}</span>
    <span class="unit__name">{name}</span>
    <span class="unit__from">from <b>{frm}</b></span>
  </div>
  <div class="viewport">
    <div class="viewport__in">
      <div class="browser__bar">
        <span class="browser__dots"><i></i><i></i><i></i></span>
        <span class="browser__url">app.inclineyou.in<b>{url}</b></span>
      </div>
      <div class="app" data-theme="dark">{RAIL}{body}</div>
    </div>
  </div>
  {note}
</section>
'''


# ──────────────────────────────────────────────────────── builder pieces ──
def ex(order, nm, presc, *, tag=None, sel=False, ghost=False, alt=None, menu=False):
    """One exercise row in a day column. `order` may read "4a" — see .dayc__grp."""
    a = ' aria-selected="true"' if sel else ''
    g = ' dayc__ex--ghost' if ghost else ''
    if menu:
        g += ' dayc__ex--menu'
    t = f' <span class="tag tag--acc">{tag}</span>' if tag else ''
    # "or", because that is the word a trainer uses when the machine is taken
    al = (f'<span class="dayc__alt">{ic(I_SWAP, 12)}or <b>{alt}</b></span>') if alt else ''
    return (f'<div class="dayc__ex{g}"{a}><span class="dayc__h">{HANDLE}</span>'
            f'<span class="dayc__o">{order}</span><span class="dayc__m">'
            f'<span class="dayc__n">{nm}{t}</span>'
            f'<span class="dayc__p">{presc}</span>{al}</span></div>')


def superset(rows, after):
    """Two or more entries sharing a group_id. Rest is the GROUP's, printed once."""
    return (f'<div class="dayc__grp">{"".join(rows)}'
            f'<div class="dayc__gr">{ic(I_LINK, 11)}<b>Superset</b> · {after} rest after</div></div>')


def linkgap(on=False, label="Link"):
    """The affordance sits in the gap, because that is where the pairing lives."""
    cls = 'dayc__link dayc__link--on' if on else 'dayc__link'
    return f'<div class="{cls}"><i>{ic(I_LINK, 11)}{label}</i></div>'


def rowmenu(pos='top:420px;right:7px'):
    return (f'<div class="menu" role="menu" style="{pos}">'
            f'<div class="menu__i" role="menuitem">{ic(I_SWAP, 15)}Add an alternate…</div>'
            f'<div class="menu__i" role="menuitem">{ic(I_LINK, 15)}Superset with the next'
            f'<kbd>⌘L</kbd></div>'
            f'<div class="menu__i" role="menuitem">{ic(I_EDIT, 15)}Edit the numbers<kbd>↵</kbd></div>'
            f'<div class="menu__sep"></div>'
            f'<div class="menu__i" role="menuitem">{ic(I_COPY, 15)}Duplicate</div>'
            f'<div class="menu__i menu__i--danger" role="menuitem">{ic(I_TRASH, 15)}Remove</div>'
            f'</div>')


def addrow(label="Add exercise"):
    return f'<div class="dayc__add" role="button">{ic(I_PLUS, 13)}{label}</div>'


def typeahead(value, opts):
    """The add row, open, with autocomplete matches."""
    o = ''.join(
        f'<div class="dayc__opt"{" aria-selected=\"true\"" if s else ""}>{n}<span>{m}</span></div>'
        for n, m, s in opts)
    return (f'<div class="dayc__ta"><input type="text" value="{value}" '
            f'aria-label="Add an exercise to Day 1">{o}</div>')


def daycol(title, label, count, rows, *, drop=False, repeat=False, foot=None):
    cls = 'dayc'
    if drop:
        cls += ' dayc--drop'
    if repeat:
        cls += ' dayc--repeat'
    lab = f'<i>{label}</i>' if label else '<i></i>'
    ct = f'<span class="dayc__ct">{count}</span>' if count is not None else ''
    f = f'<div class="dayc__f">{foot}</div>' if foot else ''
    return (f'<div class="{cls}"><div class="dayc__hd"><b>{title}</b>{lab}{ct}</div>'
            f'<div class="dayc__b">{"".join(rows)}</div>{f}</div>')


def dayctl(n=3):
    """The app keeps this in the app bar: a day exists when it is laid out."""
    return (f'<button class="btn btn--sm btn--secondary" type="button">'
            f'{n} days a week {ic(I_CHEVD, 13)}</button>')


def daycol_menu(title, label, count, rows, menu):
    """A column with an open row menu inside it — the column is the positioning
    context, and 196px of menu fits inside 236px of column."""
    col = daycol(title, label, count, rows)
    return col[:-len('</div>')] + menu + '</div>'


def weekstrip(sel, authored, weeks=8):
    """Solid chip = a week somebody authored. Ghost = a week that repeats week 1."""
    out = ['<span class="wk__k">Weeks</span>']
    for w in range(1, weeks + 1):
        ghost = '' if w in authored else ' chip--ghost'
        pressed = 'true' if w == sel else 'false'
        out.append(f'<span class="chip{ghost}" role="button" aria-pressed="{pressed}">{w}</span>')
    return f'<div class="wk">{"".join(out)}</div>'


def viewtoggle(active):
    d = 'true' if active == 'days' else 'false'
    w = 'true' if active == 'weeks' else 'false'
    return (f'<span class="chip" role="button" aria-pressed="{d}">Days across</span>'
            f'<span class="chip" role="button" aria-pressed="{w}">Weeks across</span>')


# ─────────────────────────────────────────────────── the shelf list pane ──
SHELF = [
    ("Push / Pull / Legs", "9 clients on this · 3 days a week", "8 wk", [1, 2, 3], True, True),
    ("5-day upper/lower", "4 clients on this · 5 days a week", "6 wk", [1, 2, 3, 1, 2], False, False),
    ("Deload week", "2 clients on this · 3 days a week", "1 wk", [1, 2, 3], False, False),
    ("Beginner full body", "1 client on this · 2 days a week", "12 wk", [1, 2], False, False),
    ("Shoulder rehab · Meera", "Nobody on this yet · 2 days a week", "4 wk", [3, 3], False, False),
    ("Home · no kit", "Nobody on this yet · 3 days a week", "4 wk", [1, 2, 1], False, False),
]


def shape(tones):
    cells = ''.join(f'<i class="shape__c shape__c--{t}"></i>' for t in tones)
    cells += ''.join('<i class="shape__c shape__c--off"></i>' for _ in range(7 - len(tones)))
    return f'<span class="shape" aria-hidden="true">{cells}</span>'


def shelf():
    rows = []
    for nm, meta, wk, tones, most, sel in SHELF:
        a = ' aria-selected="true"' if sel else ''
        tag = ' <span class="tag tag--acc">Most used</span>' if most else ''
        rows.append(
            f'<div class="lrow"{a}><span class="lrow__m">'
            f'<span class="lrow__t">{nm}{tag}</span>'
            f'<span class="lrow__s">{meta}</span></span>'
            f'<span class="lrow__r">{shape(tones)}'
            f'<span class="lrow__n">{wk}</span></span></div>')
    return f'''<div class="split__l">
  <div class="split__hd">
    <label class="search">{ic(I_SEARCH, 14)}<input type="search" placeholder="Search your programs" aria-label="Search programs"></label>
    <div class="tools">
      <span class="chip" role="button" aria-pressed="true">All 6</span>
      <span class="chip" role="button" aria-pressed="false">In play 4</span>
      <span class="chip" role="button" aria-pressed="false">Fat loss 2</span>
      <span class="chip" role="button" aria-pressed="false">Strength 2</span>
    </div>
  </div>
  <div class="split__scroll">{''.join(rows)}</div>
  <div style="flex:0 0 auto;padding:11px 12px;border-top:1px solid var(--tx-line)">
    <button class="btn btn--secondary" type="button" style="width:100%">{ic(I_PLUS, 14)}New program</button>
  </div>
</div>'''


# ─────────────────────────────────────── the three days of Push/Pull/Legs ──
DAY1 = [
    ex(1, "Bench press", "3 × 8 · 90s rest"),
    ex(2, "Incline DB press", "3 × 10 · 60s rest"),
    ex(3, "Overhead press", "3 × 8 · 90s rest"),
    ex(4, "Cable fly", "3 × 12 · 45s rest"),
    ex(5, "Landmine press", "3 × 12 · 60s rest", tag="Yours"),
    ex(6, "Triceps rope pushdown", "3 × 15 · 45s rest"),
]
DAY2 = [
    ex(1, "Barbell row", "4 × 8 · 90s rest"),
    ex(2, "Lat pulldown", "3 × 10 · 60s rest"),
    ex(3, "Seated cable row", "3 × 12 · 60s rest"),
    ex(4, "Face pull", "3 × 15 · 45s rest"),
    ex(5, "Hammer curl", "3 × 12 · 45s rest"),
    ex(6, "Dead hang", "3 × 30s · 45s rest"),
]
DAY3 = [
    ex(1, "Back squat", "4 × 6 · 120s rest"),
    ex(2, "Romanian deadlift", "3 × 8 · 90s rest · slow eccentric"),
    ex(3, "Leg press", "3 × 12 · 60s rest"),
    ex(4, "Leg curl", "3 × 12 · 45s rest"),
    ex(5, "Standing calf raise", "4 × 15 · 30s rest"),
    ex(6, "Plank", "3 × 45s · 30s rest"),
]

# Day 1 again, carrying all three of the things that did not exist before:
# an alternate on row 1, a to-failure prescription on row 3, and rows 4a/4b
# linked as one superset with the rest on the group.
DAY1_NEW = [
    ex(1, "Bench press", "3 × 8 · 90s rest", alt="Chest press machine"),
    ex(2, "Incline DB press", "3 × 10 · 60s rest"),
    linkgap(on=True),
    ex(3, "Overhead press", '2 × 12, 2 × <span class="fail">F</span> · 90s rest'),
    superset([
        ex("4a", "Cable fly", "3 × 12"),
        ex("4b", "Triceps rope pushdown", "3 × 15"),
    ], "90s"),
    ex(5, "Landmine press", "3 × 12 · 60s rest", tag="Yours", menu=True),
]

PH_ACTS = (f'<button class="btn btn--secondary" type="button">{ic(I_COPY, 15)}Duplicate</button>'
           f'<button class="btn btn--primary" type="button">{ic(I_USERS, 15)}Assign</button>'
           f'<button class="btn btn--icon btn--ghost" type="button" aria-label="More">{ic(I_DOTS, 18)}</button>')


def ph(title, sub, acts=PH_ACTS):
    return (f'<div class="ph"><div class="ph__row"><div><p class="ph__t">{title}</p>'
            f'<p class="ph__sub">{sub}</p></div><div class="ph__acts">{acts}</div></div></div>')


TOOLBAR = 'padding:11px 20px;border-bottom:1px solid var(--tx-line)'


# ══════════════════════════════════════════════════════════════ frame 1a ══
F1A = f'''{top("Push / Pull / Legs")}<main class="main">{ph(
    "Push / Pull / Legs",
    "3 days a week · 8 weeks · 9 clients on a copy · edited 2 days ago")}
<div class="split">{shelf()}
<div class="split__r" style="display:flex;flex-direction:column;overflow:hidden">
  <div class="tools" style="{TOOLBAR}">{weekstrip(1, [1, 2, 4])}<span class="tools__sp"></span>{dayctl()}{viewtoggle("days")}</div>
  <div class="bplane">
    <div class="why" style="margin:0 0 14px"><p class="why__k">Assigning copies</p>
      <p>Editing this template never reaches a plan anybody is on — the <b>9 clients on it
      keep the copy they started</b>. To put a change on someone&rsquo;s plan you assign it
      to them again, which writes a fresh copy.</p></div>
    <div class="dayc-set">
      {daycol("Day 1", "Push", 6, DAY1 + [addrow()])}
      {daycol("Day 2", "Pull", 6, DAY2 + [addrow()])}
      {daycol("Day 3", "Legs", 6, DAY3 + [addrow()])}
    </div>
  </div>
  <div class="keys"><b><kbd>Type a name</kbd>add an exercise</b><b><kbd>J</kbd><kbd>K</kbd>down a day</b><b><kbd>⌘↑</kbd><kbd>⌘↓</kbd>reorder</b><b><kbd>⌘Z</kbd>undo</b></div>
</div></div></main>'''

N1A = '''<p class="unit__note"><b>The list and the builder are one screen</b>, which is what the
  information architecture promised for <code>/programs · /programs/:id</code> and what the page this
  replaces did not do — it had three template chips in a toolbar and no way to see six programs, their
  shape, or who was on them. Each row carries its <b>shape</b>, ported from the app&rsquo;s
  <code>WeekShape</code>: seven cells, the filled ones being the slots the template trains. Shape is
  what a trainer is choosing between, because &ldquo;8 weeks, 9 clients&rdquo; says nothing about
  whether it trains five days or three.
  <br><br>Columns are <b>Day 1 … Day n — ordinal slots, not weekdays</b>, and there is no Rest column.
  Which weekday each slot lands on is the client&rsquo;s preference, captured at assign time in
  <code>programs.schedule</code>; a template that claimed Wednesday would be claiming something it
  cannot know. Rest is the absence of a slot, and the absence is already drawn by there being no column.
  The day count is a control in the toolbar — <b>3 days a week</b> — because a day exists when the trainer
  lays it out and not when something lands on it — building the day list from the blueprint alone is
  the app&rsquo;s old rule, and it had a trap in it: the first exercise went on Day&nbsp;1, Day&nbsp;1
  became the only day the program had, and there was nowhere left to put Day&nbsp;2&rsquo;s first
  exercise. There is also <b>no Save button</b>: adding, removing and reordering are local writes, and
  the sync pill in the top bar is what answers &ldquo;is this safe yet&rdquo;.
  <br><br>The prescription is the app&rsquo;s own notation from <code>prescribe()</code> —
  <code>3 × 8 · 90s rest</code>, and <code>3 × 45s · 30s rest</code> for the timed one on Day 3.
  Not <code>@ 62.5</code>: the blueprint stores sets, reps, <code>duration_seconds</code>,
  <code>rest_seconds</code> and notes. <b>A load is not a field a template has</b> —
  <code>target_load</code> lives on <code>program_exercises</code>, the client&rsquo;s copy — so
  printing one here promised a number that could not be saved.</p>'''


# ══════════════════════════════════════════════════════════════ frame 1b ══
W1 = [
    ex(1, "Bench press", "3 × 8 · 90s rest"),
    ex(2, "Incline DB press", "3 × 10 · 60s rest"),
    ex(3, "Overhead press", "3 × 8 · 90s rest"),
    ex(4, "Cable fly", "3 × 12 · 45s rest"),
    ex(5, "Landmine press", "3 × 12 · 60s rest"),
    ex(6, "Triceps rope pushdown", "3 × 15 · 45s rest"),
]
W2 = [
    ex(1, "Bench press", "3 × <em>9</em> · 90s rest"),
    ex(2, "Incline DB press", "3 × 10 · 60s rest"),
    ex(3, "Overhead press", "3 × <em>9</em> · 90s rest"),
    ex(4, "Cable fly", "3 × 12 · 45s rest"),
    ex(5, "Landmine press", "3 × <em>14</em> · 60s rest"),
    ex(6, "Triceps rope pushdown", "3 × 15 · 45s rest"),
]
GHOST = [
    ex(1, "Bench press", "3 × 8 · 90s rest", ghost=True),
    ex(2, "Incline DB press", "3 × 10 · 60s rest", ghost=True),
    ex(3, "Overhead press", "3 × 8 · 90s rest", ghost=True),
    ex(4, "Cable fly", "3 × 12 · 45s rest", ghost=True),
    ex(5, "Landmine press", "3 × 12 · 60s rest", ghost=True),
    ex(6, "Triceps rope pushdown", "3 × 15 · 45s rest", ghost=True),
]
W4 = [
    ex(1, "Bench press", "<em>4 × 6</em> · <em>120s</em> rest"),
    ex(2, "Incline DB press", "3 × <em>8</em> · 90s rest"),
    ex(3, "Overhead press", "<em>4 × 6</em> · <em>120s</em> rest"),
    ex(4, "Cable fly", "3 × 12 · 45s rest"),
    ex(5, "Landmine press", "3 × 12 · 60s rest"),
    ex(6, "Triceps rope pushdown", "3 × 15 · 45s rest"),
]

F1B = f'''{top("Push / Pull / Legs")}<main class="main">{ph(
    "Push / Pull / Legs",
    "Day 1 · Push, across the block · 8 weeks · 3 authored, 5 repeating")}
<div class="body body--flush" style="display:flex;flex-direction:column;overflow:hidden">
  <div class="tools" style="{TOOLBAR}">
    <button class="btn btn--sm btn--ghost" type="button">{ic(I_LIST, 14)}Programs</button>
    <span class="chip" role="button" aria-pressed="true">Day 1 · Push</span>
    <span class="chip" role="button" aria-pressed="false">Day 2 · Pull</span>
    <span class="chip" role="button" aria-pressed="false">Day 3 · Legs</span>
    <span class="tools__sp"></span>{viewtoggle("weeks")}
  </div>
  <div class="bplane">
    <div class="dayc-set">
      {daycol("Week 1", "authored", 6, W1)}
      {daycol("Week 2", "authored", 6, W2)}
      {daycol("Week 3", "repeats week 1", None, GHOST, repeat=True,
            foot='Nothing of its own — this is week 1. <button class="btn btn--sm btn--secondary" '
                 'type="button" style="width:100%;margin-top:7px">Copy week 2 into week 3</button>')}
      {daycol("Week 4", "authored", 6, W4)}
      {daycol("Week 5", "repeats week 1", None, GHOST, repeat=True)}
    </div>
  </div>
  <div class="keys"><b><kbd>Shift</kbd>+ paste into several weeks</b><b><kbd>⌘D</kbd>copy this week forward</b><b><kbd>→</kbd>next week</b></div>
</div></main>'''

N1B = '''<p class="unit__note"><b>The same day, across the block.</b> This is the one screen in the
  set that came straight out of the competitor survey: Everfit&rsquo;s Master Planner can put
  Week&nbsp;1 Day&nbsp;1 beside Week&nbsp;2 Day&nbsp;1 and Week&nbsp;3 Day&nbsp;1, and the heuristic
  audit had its absence open as finding 06 · <i>Programs &middot; progression</i> — judging
  progressive overload without it is a <b>recall</b> task where a <b>recognition</b> one is
  available. It ships as a toggle on the builder rather than as Everfit&rsquo;s third view mode with
  its own dropdown; two views a trainer will find beat three they will not.
  <br><br>Only the figure that changed is accented, so the block reads as a progression rather than as
  four columns of similar text. Weeks 1, 2 and 4 were authored; <b>weeks 3 and 5 have nothing of
  their own and repeat week 1</b>, which the column says in words and draws dimmed and dashed rather
  than leaving blank. That state is InclineYou&rsquo;s, and no competitor has it — it is what lets an
  eight-week program exist without the <b>blank twelve-week grid the app deliberately refuses</b>.
  Making a week its own is one action, offered in the column that would change.</p>'''


# ══════════════════════════════════════════════════════════════ frame 1c ══
D1SEL = [
    ex(1, "Bench press", "3 × 8 · 90s rest"),
    ex(2, "Incline DB press", "3 × 10 · 60s rest"),
    ex(3, "Overhead press", "3 × 8 · 90s rest"),
    ex(4, "Cable fly", "3 × 12 · 45s rest", sel=True),
    ex(5, "Landmine press", "3 × 12 · 60s rest", tag="Yours", sel=True),
    ex(6, "Triceps rope pushdown", "3 × 15 · 45s rest", sel=True),
]

BULK = f'''<div class="bulk">{ic(I_CHECK, 15)}3 exercises selected
  <div class="bulk__acts">
    <span style="display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:var(--tx-r2);background:var(--tx-field);border:1px solid var(--tx-field-line);color:var(--tx-ink);font-size:12.5px;font-weight:600">Move to Day 2 · Pull {ic(I_CHEVD, 13)}</span>
    <button class="btn btn--sm btn--secondary" type="button">{ic(I_COPY, 13)}Duplicate</button>
    <button class="btn btn--sm btn--secondary" type="button">{ic(I_TRASH, 13)}Remove</button>
  </div></div>'''

F1C = f'''{top("Push / Pull / Legs")}<main class="main">{ph(
    "Push / Pull / Legs",
    "3 days a week · 8 weeks · 9 clients on a copy · edited 2 days ago")}
<div class="split">{shelf()}
<div class="split__r" style="display:flex;flex-direction:column;overflow:hidden">
  <div class="tools" style="{TOOLBAR}">{weekstrip(1, [1, 2, 4])}<span class="tools__sp"></span>{dayctl()}{viewtoggle("days")}</div>
  {BULK}
  <div class="bplane">
    <div class="dayc-set">
      {daycol("Day 1", "Push", 6, D1SEL)}
      {daycol("Day 2", "Pull", 6, DAY2 + [addrow()], drop=True)}
      {daycol("Day 3", "Legs", 6, DAY3 + [addrow()])}
    </div>
  </div>
  <div class="keys"><b><kbd>Space</kbd>select</b><b><kbd>⌘X</kbd>cut</b><b><kbd>⌘V</kbd>paste into the day you are on</b><b><kbd>Esc</kbd>clear</b><b><kbd>⌘Z</kbd>undo</b></div>
</div></div></main>'''

N1C = f'''<p class="unit__note"><b>Moving an exercise without a mouse.</b> The audit has two items
  open against the builder and both of them block it from being called Stable: there is no undo stack,
  and <b>moving an exercise had no keyboard path</b> — drag is fast for a mouse and impossible for a
  keyboard, and WCAG 2.2 SC&nbsp;2.5.7 requires the single-pointer alternative. So selection is a
  first-class state here: <kbd>Space</kbd> ticks a row, the bar names the size of the set, and
  <b>Move to</b> is a control rather than a gesture. The destination column reports that it is the
  destination, which is the same treatment a drag gets, so both paths say the same thing.
  <br><br>This is TrainHeroic&rsquo;s pattern — select across sessions, act from a bar — and it is the
  one bulk affordance in the category that survives being used from a keyboard. The count matters:
  eleven of the twelve exercises a trainer reorders in a session belong to the same day, so the bar
  earns its row.</p>
<p class="unit__note" style="margin-top:14px"><b>And the state after it.</b> The move reports in the bar that
  performed it rather than in a corner toast — the app&rsquo;s rule is that a reversible action is
  reversible <i>in place, in the thing that changed</i>, and a toast is a second place to look:</p>
<div style="max-width:var(--w-measure);margin-top:10px;border:1px solid var(--tx-line);border-radius:var(--tx-r2);overflow:hidden">
  <div class="bulk bulk--done">{ic(I_CHECK, 15)}3 exercises moved to Day 2 · Pull
    <div class="bulk__acts"><button class="btn btn--sm btn--secondary" type="button">{ic(I_UNDO, 13)}Undo <kbd style="font-family:var(--tx-mono);font-size:10px;margin-left:4px">⌘Z</kbd></button></div>
  </div>
</div>'''


# ══════════════════════════════════════════════════════════════ frame 2a ══
LIB = [
    ("Bench press", "Barbell", "Chest", None, True),
    ("Incline DB press", "Dumbbell", "Chest", None, True),
    ("Overhead press", "Barbell", "Shoulders", None, True),
    ("Landmine press", "Barbell", "Yours", "acc", True),
    ("Chest press machine", "Machine", "Chest", None, False),
    ("Leg press", "Machine", "Quads", None, False),
]


def librows():
    out = []
    for nm, kit, tag, tone, on in LIB:
        a = ' aria-selected="true"' if on else ''
        t = f'tag tag--{tone}' if tone else 'tag'
        out.append(
            f'<tr{a}><td class="sel"><span class="check" role="checkbox" '
            f'aria-checked="{"true" if on else "false"}">{ic(I_CHECK, 11) if on else ""}</span></td>'
            f'<td class="strong">{nm}</td><td>{kit}</td><td><span class="{t}">{tag}</span></td></tr>')
    return ''.join(out)


PANEL = f'''<div class="scrim scrim--soft"></div><aside class="panel" role="dialog" aria-label="Exercise library" style="width:520px">
  <div class="panel__hd"><span class="panel__t">Exercise library</span><span class="sp" style="flex:1"></span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Close">{ic(I_X, 18)}</button></div>
  <div class="panel__body" style="padding:0;display:flex;flex-direction:column">
    <div style="padding:13px 18px;border-bottom:1px solid var(--tx-line);display:flex;flex-direction:column;gap:10px">
      <label class="search">{ic(I_SEARCH, 14)}<input type="search" value="press" aria-label="Search exercises"></label>
      <div class="tools">
        <span class="chip" role="button" aria-pressed="true">All 1,324</span>
        <span class="chip" role="button" aria-pressed="false">Chest 64</span>
        <span class="chip" role="button" aria-pressed="false">Yours 11</span>
        <span class="chip" role="button" aria-pressed="false">No kit 92</span>
      </div>
    </div>
    <div style="flex:1;min-height:0;overflow:auto"><table class="tbl"><tbody>{librows()}</tbody></table>
      <div style="padding:14px 18px">
        <div class="why"><p class="why__k">No pictures, and not an oversight</p>
          <p>The library is <b>text only</b>. The artwork every one of these movements used to carry is
          &copy;&nbsp;Gym visual and unlicensed for us, and it came out on 17 Aug 2026 — every
          &ldquo;free&rdquo; GIF set on offer is the same artwork re-uploaded. A name, the kit and the
          muscle is what a coach picks from anyway.</p></div>
        <button class="btn btn--secondary mt3" type="button" style="width:100%;margin-top:12px">{ic(I_PLUS, 14)}Create a custom exercise</button>
      </div>
    </div>
    <div style="flex:0 0 auto;border-top:1px solid var(--tx-line);background:var(--tx-surface-2);padding:13px 18px">
      <p style="font-family:var(--tx-mono);font-size:10.5px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--tx-ink-3);margin-bottom:9px">The numbers, asked once</p>
      <div class="tools" style="gap:7px">
        <span class="chip" role="button" aria-pressed="true">Reps</span>
        <span class="chip" role="button" aria-pressed="false">Time</span>
        <span style="flex:1"></span>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx-ink-3)">Sets<input class="ctl ctl--num" value="3" style="width:52px;height:32px" aria-label="Sets"></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx-ink-3)">Reps<input class="ctl ctl--num" value="10" style="width:52px;height:32px" aria-label="Reps"></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx-ink-3)">Rest<input class="ctl ctl--num" value="60" style="width:58px;height:32px" aria-label="Rest seconds"></label>
      </div>
      <p style="font-size:11.5px;color:var(--tx-ink-3);margin-top:8px;line-height:1.5">Applies to all four. Any row can be changed after — and again per client, once you assign.</p>
    </div>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--primary" type="button">Add 4 to Day 1 · Push</button>
  </div>
</aside>'''

F2A = f'''{top("Push / Pull / Legs")}<main class="main">{ph(
    "Push / Pull / Legs",
    "Adding to Day 1 · Push · week 1 of 8", acts="")}
<div class="body body--flush" style="display:flex;flex-direction:column;overflow:hidden">
  <div class="tools" style="{TOOLBAR}">{weekstrip(1, [1, 2, 4])}<span class="tools__sp"></span>{dayctl()}{viewtoggle("days")}</div>
  <div class="bplane">
    <div class="dayc-set">
      {daycol("Day 1", "Push", 6, DAY1 + [typeahead("press", [
          ("Overhead press", "barbell", True),
          ("Chest press machine", "machine", False),
          ("Landmine press", "yours", False)])], drop=True)}
      {daycol("Day 2", "Pull", 6, DAY2 + [addrow()])}
      {daycol("Day 3", "Legs", 6, DAY3 + [addrow()])}
    </div>
  </div>
</div></main>{PANEL}'''

N2A = '''<p class="unit__note"><b>Two ways in, because they are two different jobs.</b> The add row on
  Day&nbsp;1 is a <b>type-ahead</b> — TrueCoach&rsquo;s builder is the quickest in the category for
  exactly one reason, that you type a movement&rsquo;s name and never leave the keyboard, and a
  trainer adding a ninth exercise already knows what it is called. The <b>panel</b> is for the job
  typing is bad at: browsing 1,324 rows and taking six at once.
  <br><br>The count on the button states the outcome — <b>&ldquo;Add 4 to Day 1 · Push&rdquo;</b>, not
  &ldquo;Done&rdquo; — and it names the slot, so a panel opened from the wrong column is caught before
  it is committed rather than after. The destination column carries the same accent it would carry
  under a drag.
  <br><br><b>The numbers are asked, not invented.</b> The app asks per exercise, in a sheet, because
  every add on a phone is one add; here four are going in together, so it is asked once for the batch
  with the app&rsquo;s own defaults — <code>3 × 10 · 60s</code> — and the <b>Reps / Time</b> toggle is
  present because &ldquo;3 × 45s plank&rdquo; has no honest spelling in a reps field. The page this
  replaces wrote a prescription silently and left the trainer to fix forty-five cells afterwards.</p>'''



# ══════════════════════════════════════════════════════════════ frame 3a ══
F3A = f'''{top("Push / Pull / Legs")}<main class="main">{ph(
    "Push / Pull / Legs",
    "3 days a week · 8 weeks · 9 clients on a copy · edited 2 days ago")}
<div class="split">{shelf()}
<div class="split__r" style="display:flex;flex-direction:column;overflow:hidden">
  <div class="tools" style="{TOOLBAR}">{weekstrip(1, [1, 2, 4])}<span class="tools__sp"></span>{dayctl()}{viewtoggle("days")}</div>
  <div class="bplane">
    <div class="dayc-set">
      {daycol_menu("Day 1", "Push", 6, DAY1_NEW + [addrow()], rowmenu())}
      {daycol("Day 2", "Pull", 6, DAY2 + [addrow()])}
      {daycol("Day 3", "Legs", 6, DAY3 + [addrow()])}
    </div>
  </div>
  <div class="keys"><b><kbd>⌘L</kbd>superset with the next</b><b><kbd>⌘⇧A</kbd>add an alternate</b><b><kbd>↵</kbd>edit the numbers</b><b><kbd>⌘Z</kbd>undo</b></div>
</div></div></main>'''

N3A = '''<p class="unit__note"><b>A superset is one block, not two rows.</b> The pair shares a spine and
  a single rest line, because a superset&rsquo;s rest is <i>after the round</i> and not between the
  movements — printing it twice is how a superset turns back into two straight sets on the gym floor.
  The ordinals read <b>4a / 4b</b> rather than A1 / A2 so the number still answers &ldquo;where am I in
  the day&rdquo; while the letter says these two are one position. It works for three, the same way;
  a pair is just the common case.
  <br><br><b>The link affordance lives in the gap</b>, which is where the relationship it creates
  lives — TrueCoach puts a link icon between two movements and PT Distinction unlinks by clicking it
  again, and both are right. Both are also pointer-only, so the same action is on the row menu and on
  <kbd>⌘L</kbd>; this builder has already been through that argument once for drag.
  <br><br><b>The alternate is an &ldquo;or&rdquo;</b>, in the word a trainer actually uses when the
  machine is taken. It inherits the prescription instead of carrying its own: a second set of numbers
  on every row doubles the editing surface to serve the rarer half of the case, and at template level
  there is no load to differ anyway. <b>Row 3 is the new prescription</b> —
  <code>3 × to failure · 90s rest</code>. Not <code>AMRAP</code>: that reads as a time-capped format
  to half the people who know the word, and &ldquo;to failure&rdquo; is not jargon to anybody.
  <br><br>One overflow button per row, and the menu is where the actions go. That rule came out of the
  roster page — five glyph-only actions at 18px are indistinguishable in a hurry — and it is the
  reason the system needed a menu component at all.</p>'''


# ══════════════════════════════════════════════════════════════ frame 3b ══
def setrow(n, reps):
    """One set, as four grid cells. `reps=None` means taken to failure."""
    if reps is None:
        cell = ('<input class="ctl ctl--said ctl--fail" value="F" readonly '
                f'aria-label="Set {n}: to failure">')
        box = f'<span class="check" role="checkbox" aria-checked="true" aria-label="Set {n} to failure">{ic(I_CHECK, 11)}</span>'
    else:
        cell = f'<input class="ctl ctl--num" value="{reps}" aria-label="Set {n} reps">'
        box = f'<span class="check" role="checkbox" aria-checked="false" aria-label="Set {n} to failure"></span>'
    return (f'<span class="setlist__n">{n}</span>{cell}{box}'
            f'<button class="btn btn--icon btn--ghost" type="button" '
            f'aria-label="Remove set {n}">{ic(I_X, 14)}</button>')


def plabel(t):
    return (f'<p style="font-family:var(--tx-mono);font-size:10.5px;font-weight:500;'
            f'letter-spacing:.12em;text-transform:uppercase;color:var(--tx-ink-3);'
            f'margin-bottom:9px">{t}</p>')


ROWPANEL = f'''<div class="scrim scrim--soft"></div><aside class="panel" role="dialog" aria-label="Bench press">
  <div class="panel__hd"><span class="panel__t">Bench press</span><span style="flex:1"></span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Close">{ic(I_X, 18)}</button></div>
  <div class="panel__body">
    {plabel("The numbers")}
    <div class="tools" style="gap:7px;margin-bottom:14px">
      <span class="chip" role="button" aria-pressed="true">Reps</span>
      <span class="chip" role="button" aria-pressed="false">Time</span>
      <span style="flex:1"></span>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx-ink-3)">Rest<input class="ctl ctl--num" value="90" style="width:58px;height:32px" aria-label="Rest seconds between sets"></label>
    </div>
    <div class="setlist">
      <span class="setlist__k">Set</span>
      <span class="setlist__k">Reps</span>
      <span class="setlist__k setlist__k--c">Failure</span>
      <span></span>
      {setrow(1, "12")}
      {setrow(2, "12")}
      {setrow(3, None)}
      {setrow(4, None)}
    </div>
    <button class="btn btn--sm btn--secondary" type="button" style="width:100%;margin-top:10px">{ic(I_PLUS, 13)}Add a set</button>
    <p style="font-size:11.5px;color:var(--tx-ink-3);line-height:1.5;margin-top:8px">A new set <b style="color:var(--tx-ink-2)">copies the one above it</b>, so a straight 3 × 12 is one number typed once. Tick a set to take it to failure and its reps box reads <b style="color:var(--tx-danger)">F</b> — one character, findable down a column, and not a number nobody is going to count.</p>

    <hr class="rule" style="margin:18px 0">
    {plabel("Alternate · optional")}
    <div class="lrow" style="border:1px solid var(--tx-line);border-radius:var(--tx-r2);min-height:44px;cursor:default">
      <span class="dayc__alt" style="flex:1">{ic(I_SWAP, 13)}or <b>Chest press machine</b></span>
      <span class="lrow__r" style="flex-direction:row;gap:6px">
        <button class="btn btn--sm btn--ghost" type="button">Change</button>
        <button class="btn btn--icon btn--ghost" type="button" aria-label="Remove the alternate">{ic(I_X, 15)}</button>
      </span>
    </div>
    <p style="font-size:11.5px;color:var(--tx-ink-3);line-height:1.5;margin-top:8px">Runs the <b style="color:var(--tx-ink-2)">same numbers</b>. Your client gets it as a one-tap swap in the session when the bench is taken.</p>

    <hr class="rule" style="margin:18px 0">
    {plabel("Superset")}
    <button class="btn btn--secondary" type="button" style="width:100%">{ic(I_LINK, 14)}Superset with Incline DB press</button>
    <p style="font-size:11.5px;color:var(--tx-ink-3);line-height:1.5;margin-top:8px">Rest moves to the pair: <b style="color:var(--tx-ink-2)">none between the two, 90s after the round</b>. Unlinking puts each row&rsquo;s own rest back.</p>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--primary" type="button">Save</button>
  </div>
</aside>'''

F3B = f'''{top("Push / Pull / Legs")}<main class="main">{ph(
    "Push / Pull / Legs",
    "Day 1 · Push · week 1 of 8", acts="")}
<div class="body body--flush" style="display:flex;flex-direction:column;overflow:hidden">
  <div class="tools" style="{TOOLBAR}">{weekstrip(1, [1, 2, 4])}<span class="tools__sp"></span>{dayctl()}{viewtoggle("days")}</div>
  <div class="bplane">
    <div class="dayc-set">
      {daycol("Day 1", "Push", 6, DAY1_NEW + [addrow()])}
      {daycol("Day 2", "Pull", 6, DAY2 + [addrow()])}
      {daycol("Day 3", "Legs", 6, DAY3 + [addrow()])}
    </div>
  </div>
</div></main>{ROWPANEL}'''

N3B = '''<p class="unit__note"><b>One row, one panel.</b> A sheet becomes a panel when the thing behind
  it matters, and here it does: the numbers on this row are decided by looking at the four rows around
  it. All three of the new things live in the one place, in the order a trainer thinks about them —
  what the set is, what to do instead, and what it is paired with.
  <br><br><b>This is the one write on the screen that needs the server.</b> Adding, removing and
  reordering are local writes to the blueprint JSON and go through the sync queue like everything
  else; rewriting an entry&rsquo;s numbers goes through the endpoint that <i>validates</i> the
  blueprint, which is why this panel has a Save and the builder does not. The app draws the same line
  in the same place.
  <br><br>The empty state of the superset section is the offer, naming the row it would pair with, so
  the pairing is understood before it is made rather than discovered after. And it states what
  happens to rest — the one consequence nobody predicts.</p>
<p class="unit__note" style="margin-top:14px"><b>One row per set, because a set is the thing that
  varies.</b> &ldquo;Four sets, the last two to failure&rdquo; is an ordinary prescription and an
  exercise-level mode cannot say it — there is nothing for &ldquo;the last two&rdquo; to attach to. So
  <code>sets</code> stops being a count and becomes a list, and the count is just how long the list
  is: <b>Add a set</b> appends a row, the × removes one.
  <br><br>The fast path is protected by inheritance rather than by a second control. A new set
  <b>copies the one above it</b>, so a straight 3 × 12 is still one number typed once — which matters,
  because a nine-exercise day would otherwise be nine columns of repeated typing. There is no separate
  <i>Sets</i> field: two controls for one number is how they end up disagreeing.
  <br><br><b>A failure set reads as <span class="fail">F</span></b>, in the danger tone. It is the
  only figure on a row that is not a number, and one red character is findable down a column of
  twenty in a way that the words &ldquo;to failure&rdquo; — twice as wide as the reps they replace —
  is not. The <b>Failure</b> column header is where the letter is taught, which is also where it is
  set. The tone is a deliberate overload: red means destructive everywhere else in this system, and
  here it means the hard set.
  <br><br><b>Rest stays per exercise</b>, one field above the list. It can differ per set in real
  programming — longer after the heavy ones — but nobody asked for that, and
  <code>set_detail</code> being JSON means it can be added later without a migration. Same for a
  per-set load, which only exists on the client&rsquo;s copy anyway. The <b>Reps / Time</b> toggle
  stays per exercise too: a set of twelve and a forty-five second hold in the same movement is a
  different exercise, not a different set.</p>

<h3 class="sec">How a set list reads on the row</h3>
<p class="note">The column has 236px, so the prescription cannot become a list of eight numbers.
Consecutive sets that agree are collapsed into a run, which is also how a trainer says it out loud.
This is one pure function beside <code>prescribe()</code> in <code>training/training.ts</code>.</p>
<table class="dt">
<thead><tr><th>The set list</th><th>Reads as</th><th>Why</th></tr></thead>
<tbody>
  <tr><th><code>12, 12, 12</code></th><td><code>3 × 12 · 90s rest</code></td>
    <td>Unchanged. The uniform case is most of them, and it must not get longer.</td></tr>
  <tr><th><code>12, 12, F, F</code></th>
    <td><code>2 × 12, 2 × <span class="fail">F</span> · 90s rest</code></td>
    <td>Two runs, and the red <b class="fail">F</b> is what the eye lands on — which is right, because
      it is the set the client will remember.</td></tr>
  <tr><th><code>12, 12, 12, F</code></th>
    <td><code>3 × 12, 1 × <span class="fail">F</span> · 90s rest</code></td>
    <td>The commonest real shape of all — and the one the previous design could not express.</td></tr>
  <tr><th><code>10, 8, 6, 4</code></th><td><code>10 · 8 · 6 · 4 · 90s rest</code></td>
    <td>No runs, so no collapsing: a ramp is the list. Four numbers still fit.</td></tr>
  <tr><th><code>F, F, F</code></th>
    <td><code>3 × <span class="fail">F</span> · 90s rest</code></td>
    <td>A run of failure sets is a run like any other.</td></tr>
</tbody></table>
'''

# ═══════════════════════════════════════════════════════════════════ doc ══
NAV = ('<a href="webapp-information-architecture.html">IA</a>'
       '<a href="webapp-design-system.html">DS</a>'
       '<a href="webapp-components.html">LIBRARY</a>'
       '<a href="webapp-competitors.html">MARKET</a>'
       '<a href="webapp-glass.html">GLASS</a>'
       '<a href="webapp-heuristics.html">UX AUDIT</a>'
       '<a href="webapp-rail.html">RAIL</a>'
       '<a href="webapp-auth.html">AUTH</a>'
       '<a href="webapp-dashboard.html">TODAY</a>'
       '<a href="webapp-clients.html">CLIENTS</a>'
       '<a href="webapp-programs.html" aria-current="page">PROGRAMS</a>'
       '<a href="webapp-schedule.html">SCHEDULE</a>'
       '<a href="webapp-workout.html">WORKOUT</a>'
       '<a href="webapp-money.html">MONEY</a>'
       '<a href="webapp-reports.html">REPORTS</a>'
       '<a href="webapp-settings.html">SETTINGS</a>'
       '<a href="webapp-client-portal.html">PORTAL</a>')

HTML = f'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>X REP · Web app — Programs</title>
<meta name="description" content="The template shelf, the day-column builder and the exercise library. X REP web application.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/webapp.css">
</head>
<body>
<div class="page doc">

<div class="doc__top">
  <span class="doc__id">X REP</span>
  <span class="doc__t">Web app</span>
  <nav class="doc__nav" aria-label="Design files">{NAV}</nav>
  <div class="zoomer">
    <button type="button" data-glass-toggle aria-pressed="true">Glass</button>
    <button type="button" data-theme-toggle>Light</button>
    <button type="button" data-z="0.5">50</button>
    <button type="button" data-z="0.62">62</button>
    <button type="button" data-z="0.72">72</button>
    <button type="button" data-z="0.85">85</button>
    <button type="button" data-z="1">1:1</button>
  </div>
</div>

<h1>Programs — the job the phone is worst at</h1>
<p class="doc__lede">A template is <b>n ordered lists, repeated for a block of weeks</b>. On a phone
that is day&nbsp;&rarr;&nbsp;exercise&nbsp;&rarr;&nbsp;set, three levels of push, and the fourth
week is somewhere you have to remember. Here the whole week is one plane and the whole
<i>block</i> is one toggle away. If the web app existed for one screen only, it would be this one —
which is why the first version of it being wrong about the data model mattered enough to redraw.</p>
<div class="doc__meta"><span><b>Frames</b> <span data-frame-count>6</span></span>
  <span><b>From</b> drawer · 3a 3b 3c 3e</span>
  <span><b>Patterns</b> list-detail split · day columns · week pivot · row panel · multi-select library</span></div>
<div class="fx" data-frame-index></div>
<!-- BEGIN:online-only-notice -->
<div style="border:1px solid var(--tx-danger);background:var(--tx-danger-soft);
  border-radius:var(--tx-r3);padding:16px 18px;margin:22px 0">
<p style="font-family:var(--tx-brand);font-weight:800;font-size:15px;color:var(--tx-ink);
  letter-spacing:-.01em">SUPERSEDED &middot; 23 Aug 2026 &mdash; the web app is ONLINE-ONLY</p>
<p style="margin-top:9px;font-size:13px;line-height:1.62;color:var(--tx-ink-2)">This page was
written offline-first. That decision has been <b>reversed for the web</b>: the web app writes
every response <b>straight to the server</b> &mdash; no browser storage, no write queue, no sync.
Offline-first remains the architecture of the phone (<code>app/</code>) and of nothing else.
<br><br>So wherever this page draws or argues for an <b>offline banner</b>, a
<b>synced / queued pill</b>, a <b>&ldquo;held on this device&rdquo; count</b>, or the
<b>sync-queue screen</b>, that chrome is <b>not built on the web</b>. The reasoning around it is
kept, because the rest of each finding depends on it &mdash; only the offline half is void.
<br><br>Authority: <code>CLAUDE.md</code> at the repo root, and
<code>web&nbsp;app/web/AGENTS.md</code>. Do not re-derive the offline behaviour from this page.</p>
</div>
<!-- END:online-only-notice -->


<h2 class="sec"><span class="n">01</span>The shelf and the builder</h2>
<p class="note">Exercises down a day, days across the week, and the week chosen from a strip that
says which weeks are real. The unit a trainer edits is a <b>day</b> — an ordered list of movements
— so a day is a column and its order is printed on it, rather than being inferred from a row
position in a matrix.</p>
<div class="units">
{frame("1a", "The shelf and the builder, one screen", "drawer · 3a 3b", "/programs/push-pull-legs", F1A, N1A)}
</div>

<h2 class="sec"><span class="n">02</span>The block</h2>
<p class="note">The same day, across every week of the program. This is where progressive overload
is actually judged, and it is the single highest-value thing the competitor survey turned up.</p>
<div class="units">
{frame("1b", "Weeks across · the progression view", "drawer · 3b", "/programs/push-pull-legs?view=weeks&day=1", F1B, N1B)}
</div>

<h2 class="sec"><span class="n">03</span>Moving things</h2>
<p class="note">A builder invites fast editing, and fast editing needs an undo and a path that is
not a gesture. Both were open against this component in the heuristic audit, and both are the reason
it could not be called Stable.</p>
<div class="units">
{frame("1c", "Select, move, undo — from the keyboard", "drawer · 3b", "/programs/push-pull-legs", F1C, N1C)}
</div>

<h2 class="sec"><span class="n">04</span>The library</h2>
<p class="note">Thirteen hundred seeded movements plus the trainer&rsquo;s own, text only. The panel
is for taking several at once; the type-ahead in the column is for the one you can already name.</p>
<div class="units">
{frame("2a", "Exercise library · tick four, place once", "drawer · 3c 3e", "/programs/push-pull-legs/add?day=1", F2A, N2A)}
</div>

<h2 class="sec"><span class="n">05</span>Three things a trainer asked for</h2>
<p class="note">An <b>alternate</b> for when the kit is taken, <b>per-set reps with any set taken to
failure</b>, and a <b>superset</b>. None of the three could be said before. Each is one nullable
field, and each has to degrade honestly in a build that predates it — that is the whole test under the
additive-only law, and it is the reason none of them is a sentinel value in a field that already means
something else.</p>
<div class="units">
{frame("3a", "A superset, an alternate, and reps to failure", "drawer · 3b", "/programs/push-pull-legs", F3A, N3A)}
{frame("3b", "One row, edited — where all three live", "drawer · 3b", "/programs/push-pull-legs?row=bench-press", F3B, N3B)}
</div>

<h3 class="sec">What each one costs</h3>
<p class="note">Both halves move together, and neither edits a version that has run. The app is on
WatermelonDB schema <b>19</b> and the server on Flyway <b>V26</b>, so this is schema <b>20</b> and
<b>V27</b> — one migration each, three columns on <code>program_exercises</code>, and three keys in
the <code>templates.structure</code> blueprint JSON, which needs no migration but does need the
server&rsquo;s validator to accept them.</p>
<table class="dt">
<thead><tr><th>Field</th><th>Type</th><th>What a build that predates it does</th></tr></thead>
<tbody>
  <tr><th><code>alt_exercise_id</code></th><td>nullable uuid, on the entry</td>
    <td>Reads null and draws no alternate. The plan is exactly the plan it was.</td></tr>
  <tr><th><code>set_detail</code></th><td>nullable JSON list, one object per set —
    <code>[{{"reps":12}},{{"reps":12}},{{"toFailure":true}},{{"toFailure":true}}]</code></td>
    <td>The scalar <code>sets</code> and <code>reps</code> columns stay, and stay authoritative
      <i>while the sets agree</i>: a straight 4 &times; 12 writes <code>sets:4, reps:12</code> and an
      old build is exactly right. <b>The moment the sets diverge, <code>reps</code> is written
      null</b> and <code>sets</code> keeps the count — so an old build reads <b><code>4 sets</code></b>,
      which is incomplete but true. It is never handed a number that is wrong for half the sets, and
      never a sentinel like <code>reps: -1</code> that it would render as &ldquo;minus one reps&rdquo;.
      JSON rather than a child table because the template blueprint is already JSON, and because a new
      synced table costs a sync contract; it also leaves room for a per-set rest or load later without
      another migration.</td></tr>
  <tr><th><code>group_id</code></th><td>nullable uuid, shared by the members</td>
    <td>Draws two ordinary exercises, adjacent, in order — a superset performed as straight sets.
      <b>Degraded, not wrong</b>, which is the best available answer and the reason grouping is a
      shared key on adjacent rows rather than a nested structure the old reader could not walk.</td></tr>
</tbody></table>
<div class="why why--warn" style="margin-top:16px"><p class="why__k">What this still does not do</p>
  <p><b>The client&rsquo;s end.</b> An alternate is only useful if the workout log offers the swap; a
  superset is only useful if the log paces the pair; and a set taken to failure has to be
  <i>loggable</i> — the log records reps against a target, and a target of &ldquo;to failure&rdquo;
  means the field starts empty and whatever the client managed is the record. That is real work on the
  session screen and none of it is drawn here.
  <br><br><b>Per-set rest and per-set load.</b> Both are honest asks in real programming and both are
  a key in <code>set_detail</code> away, with no migration. Left out because nobody asked, and because
  a four-column set table is where this panel would start to feel like a spreadsheet.
  <br><br><b>Uneven supersets.</b> Nothing stops 4a having four sets and 4b having three. It is a
  legitimate prescription, so it is not blocked — but the pair is the unit a client works in, and the
  builder should probably say something when the counts differ.</p></div>

<h2 class="sec"><span class="n">06</span>What the competition does with this screen</h2>
<p class="note">Six products a solo trainer would otherwise buy, read from their own product and
help documentation rather than from comparison articles — which are pricing matrices and carry no
interface detail. Where a claim could not be traced to a primary source the row says so.</p>
<table class="dt">
<thead><tr><th>Product</th><th>Whole week on one plane?</th><th>Weeks as an axis</th><th>Order inside a day</th><th>Template &rarr; client</th></tr></thead>
<tbody>
  <tr><th>ABC&nbsp;Trainerize</th><td><b>No.</b> One workout at a time. Asking for it is the
    forum&rsquo;s <b>1,077-vote</b> request — &ldquo;write a whole program (multiple days) on a
    single screen&rdquo; — marked <i>Planned</i> in June 2021 and still open in 2026</td>
    <td>Program calendar, no comparison view</td>
    <td>Drag inside a day: requested 2013, <b>shipped Jan 2024</b>. The comment that carried it
      warned an out-of-order day risks &ldquo;an injury if a client doesn&rsquo;t do the workouts in
      the correct order&rdquo;</td>
    <td>Copies, via master programs</td></tr>
  <tr><th>TrueCoach</th><td>Calendar-first — month view, hover a day, <b>Add Workout</b>; an expand
    icon opens the fuller builder</td><td>&ldquo;You can add weeks to the program at any time&rdquo;</td>
    <td>Typing order. Supersets by a <b>link icon between two movements</b>, circuits by
      <b>+ Circuit</b></td>
    <td>Copies — <b>but a Sync toggle exists</b>: with it on, &ldquo;any changes that you make to
      workouts will instantly update on all assigned client&rsquo;s workout calendars&rdquo;</td></tr>
  <tr><th>Everfit</th><td><b>Yes</b> — Master Planner, and the best in the category</td>
    <td><b>Week-by-week view</b>: &ldquo;the same day across multiple weeks (e.g. Week 1 Day 1,
      Week 2 Day 1, Week 3 Day 1…)&rdquo;, scrolling horizontally for more</td>
    <td>Drag at workout, section and exercise level. Count badge in the day header</td>
    <td>Copies</td></tr>
  <tr><th>PT&nbsp;Distinction</th><td>Yes — drag anything anywhere, day to day</td>
    <td>Repeat weekly / daily / monthly / set days</td>
    <td>Drag. Supersets and circuits <i>by</i> dragging, unlinked by clicking again</td>
    <td>Copies</td></tr>
  <tr><th>TrainHeroic</th><td>Calendar</td><td>Copy sessions across weeks</td>
    <td>Drag. <b>Marquee-select across sessions</b> &ldquo;much like you would highlight a paragraph
      in a Word Doc&rdquo;, then a banner offering copy, delete, repeat, save-as-program</td>
    <td>Copies from a Library, at a chosen start date</td></tr>
  <tr><th>Hevy&nbsp;Coach</th><td>A routine list</td><td><b>None</b> — users ask for
    &ldquo;week by week programming rather than just routines&rdquo;</td>
    <td>Drag</td><td>Copies, to many clients, with a start date</td></tr>
</tbody></table>

<h3 class="sec">What that changed here</h3>
<table class="dt">
<thead><tr><th>Taken</th><th>From</th><th>Where it landed</th></tr></thead>
<tbody>
  <tr><th>Same day across weeks</th><td>Everfit</td><td>Frame <b>1b</b>, as a toggle rather than a
    third view mode. It closes audit finding 06 and open item 03</td></tr>
  <tr><th>Select-then-act from a bar</th><td>TrainHeroic</td><td>Frame <b>1c</b> — and given a
    keyboard path, which is what turns it from a mouse trick into the SC 2.5.7 answer</td></tr>
  <tr><th>Type the name, never leave the keyboard</th><td>TrueCoach</td><td>The add row in every
    column, frame <b>2a</b></td></tr>
  <tr><th>Count in the day header</th><td>Everfit</td><td>Every column header</td></tr>
  <tr><th>An ordinal printed on the row</th><td>Trainerize&rsquo;s injury comment</td>
    <td>Order stopped being an inference. It is the strongest argument in the survey for columns over
      a matrix</td></tr>
  <tr><th>Shift-paste across weeks</th><td>Everfit</td><td>The hint strip on <b>1b</b></td></tr>
</tbody></table>

<h3 class="sec">What was refused, and why</h3>
<table class="dt">
<thead><tr><th>Refused</th><th>Whose</th><th>Because</th></tr></thead>
<tbody>
  <tr><th>A sync toggle that pushes template edits into live plans</th><td>TrueCoach</td>
    <td>The rule this whole category turns on here is that <b>assigning copies</b>. A template edit
      reaching a plan somebody is halfway through is the bug both TrueCoach and Trainerize shipped;
      TrueCoach at least made it a choice. InclineYou enforces the copy in
      <code>db/training.ts</code> and again on the server, so the screen states it instead of
      offering it.</td></tr>
  <tr><th>Load, tempo, intensity and RPE on a template row</th><td>PT Distinction, Hevy Coach</td>
    <td>Not fields a blueprint has, and nobody has asked for them. Sets, reps or seconds, rest,
      notes — and <code>target_load</code> only on the client&rsquo;s copy. <b>The distinction from
      §05 is the point:</b> an alternate, to-failure and a superset were asked for, so they get a
      migration and a drawn UI; these were <i>drawn without being asked for and without existing</i>,
      which is the failure mode. A field that cannot be saved must not be drawn — a field somebody
      needs should be added.</td></tr>
  <tr><th>Three view modes with a dropdown</th><td>Everfit</td>
    <td>Two views a trainer will find beat three they will not. Days across, weeks across, done.</td></tr>
  <tr><th>Calendar-first authoring</th><td>TrueCoach, TrainHeroic, Trainerize</td>
    <td>A template has no dates. Its days are <b>ordinal slots</b>; a date exists only on the
      assigned copy. Authoring against a calendar is what makes a &ldquo;Rest day&rdquo; column look
      reasonable, and it is what the previous version of this page inherited.</td></tr>
  <tr><th>Drag as the only path</th><td>All five</td><td>SC 2.5.7, and a trackpad at a gym desk.</td></tr>
</tbody></table>

<h2 class="sec"><span class="n">07</span>What changed from the phone</h2>
<table class="dt"><thead><tr><th>On the phone</th><th>On the web</th><th>Because</th></tr></thead>
<tbody>
  <tr><th>Day &rarr; exercise &rarr; set, three levels of push</th><td>Every day of the week on one
    plane, as columns</td><td>A mistake in Day 3 is caught while editing Day 1.</td></tr>
  <tr><th>Week chips move the content, one week at a time</th><td>A weeks-across toggle</td>
    <td>Overload is a comparison, and a comparison needs both terms visible.</td></tr>
  <tr><th>Picker adds one, then closes</th><td>Tick several, place once</td>
    <td>Building a template is a batch job.</td></tr>
  <tr><th>The shelf and the program are two screens</th><td>One list-detail split</td>
    <td>Choosing between six templates is comparing six shapes.</td></tr>
  <tr><th>Long-press a row to remove it</th><td>Select many, act from a bar, undo in place</td>
    <td>A pointer has hover and a keyboard has Space; neither has a long press.</td></tr>
  <tr><th>Prescription asked per exercise, in a sheet</th><td>Asked once per batch, in the panel</td>
    <td>Four adds on a phone are four sheets; here they are one action.</td></tr>
</tbody></table>

<h2 class="sec"><span class="n">08</span>What this redesign fixed</h2>
<p class="note">The page this replaces was drawn against a model it did not match. These are the
specific contradictions, each traceable to a file in the app.</p>
<table class="dt">
<thead><tr><th>Was</th><th>Now</th><th>Source of truth</th></tr></thead>
<tbody>
  <tr><th>Every cell read <code>3 × 8 @ 62.5</code></th>
    <td><code>3 × 8 · 90s rest</code>, and <code>3 × 45s</code> where it is timed</td>
    <td><code>training/training.ts</code> <code>prescribe()</code>; the blueprint has no load column.
      <code>PrescriptionSheet</code> asks sets, reps-or-time, rest — nothing else</td></tr>
  <tr><th>A <b>Day 3 · Rest</b> column, and copy about &ldquo;the week&rsquo;s shape&rdquo;</th>
    <td>Only slots the template trains. No Rest column</td>
    <td>Template days are ordinal slots; the weekday is the client&rsquo;s, set at apply time in
      <code>programs.schedule</code>. Server V24 soft-deleted every template authored under the old
      weekday meaning</td></tr>
  <tr><th>No weeks at all</th><td>A week strip, and the weeks-across view</td>
    <td><code>templates.weeks</code>; the blueprint carries a <code>week</code> per entry, and a week
      with nothing of its own repeats week 1</td></tr>
  <tr><th>Three template chips in a toolbar</th><td>The list-detail split</td>
    <td>The IA&rsquo;s own row: &ldquo;List and builder are one screen&rdquo;</td></tr>
  <tr><th>A 45-cell matrix, 30 cells of it empty</th><td>Columns that end when the day ends</td>
    <td>A day is an ordered list — <code>order_index</code></td></tr>
  <tr><th><b>873</b> seeded exercises</th><td><b>1,324</b></td>
    <td>Eleven sites in the app say 1,324, including the schema comment on the favourites join
      table. <i>The figure is still 873 in <code>webapp-information-architecture.html</code> and
      <code>webapp-components.html</code></i></td></tr>
  <tr><th>Frames cited as <code>drawer · 6a 6c 6d</code> and <code>3e 6b</code></th>
    <td><code>3a</code> shelf, <code>3b</code> inside a program, <code>3c</code> exercises,
      <code>3e</code> your own exercise</td>
    <td>6a&ndash;6i are the <b>team</b> frames — 6b invite a coach, 6c one coach, 6d an invitation,
      6e name a team</td></tr>
  <tr><th>A hint strip promising <kbd>⌘Z</kbd> and drag</th>
    <td>Both drawn, and the keyboard path drawn with them</td>
    <td>The audit had both open <i>and</i> blocking; advertising them while they were unbuilt was the
      worse of the two problems</td></tr>
</tbody></table>

<h2 class="sec"><span class="n">09</span>Still open</h2>
<table class="dt">
<thead><tr><th>#</th><th>Item</th><th>Why it is still open</th></tr></thead>
<tbody>
  <tr><th>01</th><td>The undo stack itself</td><td>Specified at 20 steps and drawn here at one. The
    stack is engineering, not a frame, and it is what keeps this component at Beta.</td></tr>
  <tr><th>02</th><td>Assign — slots landing on a real week</td><td>The step where Day 1 becomes
    Monday 6:00 am, the times are checked for clashes against every other client, and the copy is
    written in one transaction. It has no drawing on the web yet; the app spends 597 lines on it.
    It is the next frame this file needs.</td></tr>
  <tr><th>03</th><td>Circuits, EMOM and AMRAP-as-a-format</td><td>Supersets are drawn in §05 and cost
    one field. A timed <i>circuit</i> — TrueCoach&rsquo;s <b>+ Circuit</b>, Everfit&rsquo;s section
    types — is a different shape: a container with its own duration, holding exercises whose rest is
    the container&rsquo;s. That is a table, not a column, and it should wait until somebody asks.</td></tr>
  <tr><th>04</th><td>The component library still specimens the matrix cell</td><td><code>.bld</code>
    stays in the stylesheet for <code>webapp-components.html</code> and
    <code>webapp-c-domain.html</code>, both of which still draw it — and draw it with the
    <code>@ load</code> bug. They need the same pass.</td></tr>
</tbody></table>

<hr class="rule" style="margin-top:84px">
<p class="small" style="max-width:var(--w-measure)">
  X REP · web application · v1.1 · every frame drawn at 1440×900 and scaled to fit.
  Colour, spacing and radius tokens are copied verbatim from
  <code>inclineyoudesignsystem.html</code> — if a value differs there, it is a
  bug here. Press <kbd>+</kbd> / <kbd>−</kbd> to change the zoom.
  <br><br>Competitor rows trace to vendor product and help documentation: Everfit&rsquo;s Master
  Planner articles, TrueCoach&rsquo;s workout-builder and programs help pages, the ABC Trainerize
  idea forum (vote counts and status as shown there), PT Distinction&rsquo;s program-builder posts,
  TrainHeroic&rsquo;s programming-shortcuts support article and Hevy Coach&rsquo;s builder pages.
  Model claims trace to the app: <code>db/schema.ts</code>, <code>training/training.ts</code>,
  <code>screens/main/drawer/ProgramScreen.tsx</code> and <code>PrescriptionSheet.tsx</code>.
</p>

</div>
<script src="assets/webapp.js"></script>
</body>
</html>
'''

out = HERE / "webapp-programs.html"
out.write_text(HTML)
print("wrote", out, len(HTML), "chars")

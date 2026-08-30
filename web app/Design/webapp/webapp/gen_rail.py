#!/usr/bin/env python3
"""Generate webapp-rail.html — the navigation rail, re-specified.

Run it from anywhere: python3 gen_rail.py — it writes the page next to itself.

The rail is drawn 31 times across this design set and specified once, in the
component library. This page holds the second pass: five frames of one shell,
so the rail is the only thing that changes between them.
"""
import pathlib

HERE = pathlib.Path(__file__).resolve().parent

# ─────────────────────────────────────────────────────────────────── icons ──
SW = ('fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" '
      'stroke-linejoin="round" aria-hidden="true"')


def ic(path, s=18):
    return f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" {SW}>{path}</svg>'


# The nine glyphs already in the rail, copied verbatim rather than redrawn —
# an icon that shifts by a pixel between two files is a diff nobody can read.
I_HOME = '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>'
I_CAL = '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
I_USERS = ('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/>'
           '<path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8"/><path d="M18 13.6c2.1.7 3.5 2.5 3.5 5"/>')
I_DUMB = '<path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10"/>'
I_GRID = '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 9h8M8 13h8M8 17h5"/>'
I_DOTS6 = ('<circle cx="9" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/>'
           '<circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/>'
           '<circle cx="9" cy="17" r="1.2"/><circle cx="15" cy="17" r="1.2"/>')
I_RUPEE = '<path d="M7 4h10M7 8.5h10M15.5 4c0 4-3.4 4.5-6 4.5h-.5l7 11.5"/>'
I_BARS = ('<path d="M4 20V4M4 20h16"/><rect x="7.5" y="12" width="3" height="5"/>'
          '<rect x="12.5" y="8.5" width="3" height="8.5"/><rect x="17" y="6" width="3" height="11"/>')
I_BELL = ('<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/>'
          '<path d="M10 19a2.2 2.2 0 0 0 4 0"/>')
I_GEAR = ('<circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.6M12 18.6v2.6M4.5 12H2M22 12h-2.5'
          'M6.2 6.2 4.4 4.4M19.6 19.6l-1.8-1.8M17.8 6.2l1.8-1.8M4.4 19.6l1.8-1.8"/>')
I_SYNC = ('<path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6"/>'
          '<path d="M17.5 3v3.6h-3.6M6.5 21v-3.6h3.6"/>')

# and the five the second pass needs. Team is the only one that is a deliberate
# departure: the app gives Team the same two-people glyph as its roster, which is
# safe on a phone because the roster is a TAB and never sits beside it. In a rail
# they are two rows apart, so Team becomes a hub — three nodes, joined.
I_TEAM = ('<circle cx="12" cy="5.8" r="2.5"/><circle cx="5.6" cy="17.6" r="2.5"/>'
          '<circle cx="18.4" cy="17.6" r="2.5"/><path d="M10.3 7.9 7.2 15.4M13.7 7.9l3.1 7.5'
          'M8.1 17.6h7.8"/>')
I_HELP = ('<circle cx="12" cy="12" r="8.5"/>'
          '<path d="M9.8 9.4a2.3 2.3 0 1 1 3.3 2.1c-.7.4-1.1 1-1.1 1.8v.3"/><path d="M12 17.2h.01"/>')
I_USER = '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>'
I_OUT = ('<path d="M14.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h8.5"/>'
         '<path d="M17 8.5l3.5 3.5L17 15.5M9.5 12h11"/>')
I_PANEL = ('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>')
I_PIN = '<path d="M9.5 3h5l-.7 6 3 4.2H7.2l3-4.2-.7-6Z"/><path d="M12 13.2V21"/>'
I_CHEV = '<path d="M9 6l6 6-6 6"/>'
I_CHEVD = '<path d="M6 9l6 6 6-6"/>'
I_CHEVU = '<path d="M6 15l6-6 6 6"/>'
I_CHEVL = '<path d="M15 6l-6 6 6 6"/>'
I_CHECK = '<path d="M4.5 12.5l5 5 10-11"/>'
I_SEARCH = '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'
I_PLUS = '<path d="M12 5v14M5 12h14"/>'
I_DOTSH = ('<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/>'
           '<circle cx="12" cy="18.5" r="1.4"/>')
I_OPEN = '<path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v5.5H4.5V6H10"/>'
I_MARK = ('<svg width="17" height="17" viewBox="0 0 100 100" fill="none" aria-hidden="true">'
          '<rect x="4" y="16" width="92" height="8" rx="3" fill="#0A0B0D"/>'
          '<rect x="4" y="13" width="7" height="14" fill="#0A0B0D"/>'
          '<rect x="89" y="13" width="7" height="14" fill="#0A0B0D"/>'
          '<rect x="16" y="7" width="10" height="26" fill="#0A0B0D"/>'
          '<rect x="74" y="7" width="10" height="26" fill="#0A0B0D"/>'
          '<path d="M28 93 C28 60 72 60 72 93" stroke="#0A0B0D" stroke-width="11"/>'
          '<circle cx="50" cy="35" r="9" fill="#0A0B0D"/>'
          '<g stroke="#0A0B0D" stroke-width="11"><path d="M50 43 L50 64"/>'
          '<path d="M33 22 C34 56 66 56 67 22"/></g></svg>')


# ───────────────────────────────────────────────────────────────────  rail ──
# Every destination, in one table, so the ten rows and their keys cannot drift
# apart the way eleven pasted copies of them did.
#   key   glyph      label        href           accelerator  badge (tone, text, label)
DEST = [
    ("today",  I_HOME,  "Today",     "/",           "H", None),
    ("sched",  I_CAL,   "Schedule",  "/schedule",   "S", ("", "5", "5 sessions today")),
    ("clients", I_USERS, "Clients",  "/clients",    "C", ("", "22", "22 active clients")),
    ("money",  I_RUPEE, "Money",     "/money",      "M", ("alert", "3", "3 clients owe you")),
]
BUILD = [
    ("prog",   I_GRID,  "Programs",  "/programs",   "P", None),
    ("exer",   I_DOTS6, "Exercises", "/exercises",  "E", ("", "1,324", "1,324 exercises")),
    ("sess",   I_DUMB,  "Sessions",  "/sessions",   "L", None),
]
GROW = [
    ("rep",    I_BARS,  "Reports",   "/reports",    "R", None),
    ("nudge",  I_BELL,  "Nudges",    "/nudges",     "N", ("acc", "8", "8 nudges ready to send")),
    ("team",   I_TEAM,  "Team",      "/team",       "T", ("acc", "1", "1 invitation waiting")),
]

# Today's five, in time order — the same five the Today screen lists, because a
# rail that disagrees with the screen beside it is the defect this page opens on.
PINS = [
    ("MK", "av-3",  "Meera K",  "06:00", "done"),
    ("AS", "av-5",  "Arjun S",  "07:30", "done"),
    ("DR", "av-7",  "Divya R",  "09:00", "now"),
    ("NP", "av-11", "Nikhil P", "17:00", ""),
    ("KM", "av-9",  "Kavya M",  "18:30", ""),
]


def badge(b, mini=False):
    """A count. Three tones, three meanings — see §06."""
    if not b:
        return ''
    tone, text, label = b
    cls = 'rail__n' + (f' rail__n--{tone}' if tone else '')
    return f'<span class="{cls}" aria-label="{label}">{text}</span>'


def item(d, cur=None, keys=False, tip=None):
    """One destination. An <a>, because it navigates — the eleven <div>s are §02.2."""
    k, glyph, label, href, acc, b = d
    on = ' aria-current="page"' if k == cur else ''
    kbd = f'<kbd class="rail__k">{acc}</kbd>' if keys else ''
    t = f'<span class="rail__tip" role="tooltip">{label}</span>' if tip == k else ''
    return (f'<a class="rail__i" href="{href}"{on}>{ic(glyph)}<span>{label}</span>'
            f'{kbd}{badge(b)}{t}</a>')


def group(rows, kicker=None, cur=None, keys=False, tip=None):
    gk = f'<p class="rail__gk">{kicker}</p>' if kicker else ''
    return (f'<div class="rail__group">{gk}'
            + ''.join(item(d, cur, keys, tip) for d in rows) + '</div>')


def pin(p, n, keys=False, menu=False):
    """A pinned client. Who, when, and whether it is done — three encodings, one slot."""
    initials, av, name, time, state = p
    cls = 'rail__pin' + (f' rail__pin--{state}' if state else '')
    if state == 'done':
        slot = f'<span class="rail__pt rail__pt--done">{ic(I_CHECK, 12)}</span>'
    elif state == 'now':
        slot = '<span class="rail__pt rail__pt--now">Now</span>'
    else:
        slot = f'<span class="rail__pt">{time}</span>'
    kbd = f'<kbd class="rail__k">{n}</kbd>' if keys else ''
    m = (f'<button class="rail__pm" type="button" aria-label="More for {name}" '
         f'aria-expanded="true">{ic(I_DOTSH, 14)}</button>') if menu else ''
    return (f'<a class="{cls}" href="/clients/{initials.lower()}">'
            f'<span class="av av--sm" style="background:var(--tx-{av})">{initials}</span>'
            f'<span class="rail__pn">{name}</span>{kbd}{m or slot}</a>')


def pinmenu():
    """The pin's own menu. Anchored to the last pin so it opens into the foot's
       gap rather than over the four rows above it."""
    return ('<div class="menu" style="left:240px;bottom:64px;min-width:206px" role="menu">'
            f'<button class="menu__i" type="button" role="menuitem">{ic(I_OPEN, 15)}Open the session<kbd>&crarr;</kbd></button>'
            f'<button class="menu__i" type="button" role="menuitem">{ic(I_GRID, 15)}Their programme</button>'
            f'<button class="menu__i" type="button" role="menuitem">{ic(I_RUPEE, 15)}Record a payment</button>'
            '<div class="menu__sep"></div>'
            f'<button class="menu__i" type="button" role="menuitem">{ic(I_PIN, 15)}Keep pinned all week</button>'
            f'<button class="menu__i" type="button" role="menuitem">{ic(I_CHEVD, 15)}Unpin</button>'
            '</div>')


def acctmenu():
    """The foot menu. Everything a trainer needs once a week and never twice a day."""
    return ('<div class="menu" style="left:9px;bottom:58px;min-width:214px" role="menu">'
            '<div class="menu__hd"><span class="av av--sm" style="background:var(--tx-av-4)">AR</span>'
            '<span><b>Anbu R</b><i>+91 98407 &middot;&middot; &middot;&middot;12</i></span></div>'
            f'<button class="menu__i" type="button" role="menuitem">{ic(I_USER, 15)}Profile</button>'
            f'<button class="menu__i" type="button" role="menuitem">{ic(I_GEAR, 15)}Settings<kbd>,</kbd></button>'
            f'<button class="menu__i" type="button" role="menuitem">{ic(I_HELP, 15)}Help</button>'
            '<div class="menu__sep"></div>'
            f'<button class="menu__i menu__i--danger" type="button" role="menuitem">{ic(I_OUT, 15)}Sign out&hellip;</button>'
            '</div>')


def foot(open_=False):
    return ('<div class="rail__foot">'
            f'<button class="rail__acct" type="button" aria-haspopup="menu" '
            f'aria-expanded="{"true" if open_ else "false"}">'
            '<span class="av av--sm" style="background:var(--tx-av-4)">AR</span>'
            '<span class="rail__acct__n">Anbu R<i>Trainer</i></span>'
            f'{ic(I_CHEVU, 15)}</button>'
            + (acctmenu() if open_ else '') + '</div>')


def rail(cur="today", *, mini=False, keys=False, tip=None, pinmenu_on=False,
         acct=False, pins=True):
    """The trainer rail. `mini` is the 64px state — chosen and remembered,
       never a hover reveal (§05)."""
    if mini:
        brand = (f'<button class="rail__mark rail__mark--btn" type="button" '
                 f'aria-label="Expand the rail" aria-expanded="false">{I_MARK}'
                 + ('<span class="rail__tip" role="tooltip">Expand the rail</span>'
                    if tip == 'mark' else '') + '</button>')
    else:
        brand = (f'<span class="rail__mark">{I_MARK}</span>'
                 '<span class="rail__word">X&nbsp;REP</span>'
                 f'<button class="rail__col" type="button" aria-label="Collapse the rail" '
                 f'aria-expanded="true">{ic(I_PANEL, 17)}</button>')
    body = (group(DEST, None, cur, keys, tip)
            + group(BUILD, "BUILD", cur, keys, tip)
            + group(GROW, "GROW", cur, keys, tip))
    if pins:
        n = len(PINS)
        body += ('<div class="rail__group rail__group--pins">'
                 '<p class="rail__gk">TODAY<span>' + str(n) + '</span></p>'
                 + ''.join(pin(p, i + 1, keys,
                               menu=(pinmenu_on and p[0] == "KM"))
                           for i, p in enumerate(PINS))
                 + (pinmenu() if pinmenu_on else '') + '</div>')
    kc = ' rail--keys' if keys else ''
    return (f'<nav class="rail{kc}" aria-label="Sections">'
            f'<div class="rail__top">{brand}</div>'
            f'<div class="rail__body">{body}</div>{foot(acct)}</nav>')


# ─────────────────────────────────────────────────────────────────── shell ──
def top(queued=6):
    """The top bar. The pill reads what the queue actually holds — which is the
       whole of §02.1, fixed in one attribute."""
    pill = (f'<span class="sync sync--queued"><i></i>{queued} queued</span>' if queued
            else '<span class="sync"><i></i>Synced</span>')
    return f'''<header class="top">
  <nav class="crumbs" aria-label="Breadcrumb"><b>Today</b></nav>
  <div class="omni">{ic(I_SEARCH, 15)}<span>Search clients, sessions, exercises&hellip;</span><kbd>&#8984;K</kbd></div>
  <div class="top__acts">{pill}
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Notifications">{ic(I_BELL, 18)}</button>
  </div></header>'''


def srow(time, initials, av, name, prog, where, tag, note, act):
    tg = {'ok': 'tag--ok', 'now': 'tag--acc', 'up': ''}[tag]
    lab = {'ok': 'Done', 'now': 'Now', 'up': 'Upcoming'}[tag]
    return (f'<tr><td class="mono" style="width:74px">{time}</td>'
            f'<td><span class="who"><span class="av av--sm" style="background:var(--tx-{av})">{initials}</span>'
            f'<b>{name}</b></span></td><td>{prog}</td>'
            f'<td><span class="tag tag--{where}">{where.capitalize()}</span></td>'
            f'<td><span class="tag {tg}">{lab}</span></td>'
            f'<td class="ink3" style="font-size:12.5px">{note}</td>'
            f'<td style="text-align:right"><button class="btn btn--sm btn--ghost" type="button">{act}</button></td></tr>')


# The day's to-do list, verbatim from the Today screen. The sync row stays: a
# task list is allowed to repeat chrome state, because repeating it is its job.
NEEDS = [
    (I_RUPEE, "Farhan Q &middot; 11 days late", "&#8377;6,000", "", "Nudge"),
    (I_RUPEE, "Sneha R &middot; 6 days late", "&#8377;9,000", "", "Nudge"),
    (I_DUMB, "Kavya M &middot; package ran out", "0 left", " ink3", "Renew"),
    (I_SYNC, "6 entries waiting to sync", "since 06:52", " ink3", "Review"),
]


def body():
    """One Today screen, reused by every frame — so the rail is the only thing
       that differs between them, which is the point of a shell page."""
    rows = (srow("06:00", "MK", "av-3", "Meera K", "Push A", "floor", "ok", "Logged &middot; 12 sets", "Open")
            + srow("07:30", "AS", "av-5", "Arjun S", "Legs B", "floor", "ok", "Logged &middot; 9 sets", "Open")
            + srow("09:00", "DR", "av-7", "Divya R", "Full body", "remote", "now", "In progress", "Log")
            + srow("17:00", "NP", "av-11", "Nikhil P", "Full body", "floor", "up", "Not started", "Log")
            + srow("18:30", "KM", "av-9", "Kavya M", "Push B", "floor", "up", "Pack expired", "Log"))
    needs = ''.join(
        f'<tr><td style="width:30px" class="ink3">{ic(g, 15)}</td>'
        f'<td class="strong">{who}</td><td class="num{cl}">{amt}</td>'
        f'<td style="text-align:right;width:96px">'
        f'<button class="btn btn--sm btn--secondary" type="button">{act}</button></td></tr>'
        for g, who, amt, cl, act in NEEDS)
    return f'''<main class="main"><div class="ph"><div class="ph__row">
  <div><p class="ph__t">Good morning, Anbu</p>
    <p class="ph__sub">Tuesday 12 August &middot; 5 sessions &middot; 2 done</p></div>
  <div class="ph__acts">
    <button class="btn btn--secondary" type="button">{ic(I_CAL, 15)}Week</button>
    <button class="btn btn--primary" type="button">{ic(I_PLUS, 15)}New session</button></div>
</div></div>
<div class="body">
  <div class="stats stats--4">
    <div class="stat"><p class="stat__k">Billed this month</p>
      <p class="stat__v">&#8377;1,06,500</p><p class="stat__d">21 sessions &middot; <b>+8%</b> on July</p></div>
    <div class="stat"><p class="stat__k">The gym&rsquo;s share</p>
      <p class="stat__v" style="color:var(--tx-warn)">&minus;&#8377;49,000</p>
      <p class="stat__d">46% of floor sessions</p></div>
    <div class="stat stat--acc"><p class="stat__k">Yours</p>
      <p class="stat__v">&#8377;57,500</p><p class="stat__d">Stored per session, as it happens</p></div>
    <div class="stat stat--danger"><p class="stat__k">Still owed</p>
      <p class="stat__v">&#8377;18,000</p><p class="stat__d">3 clients &middot; oldest <b>11 days</b></p></div>
  </div>
  <div class="grid2 mt4" style="grid-template-columns:minmax(0,1.45fr) minmax(0,1fr)">
    <div class="card">
      <div class="card__hd"><span class="card__t">Tuesday 12 August</span>
        <span class="tag">5 sessions</span></div>
      <div class="card__b card__b--flush"><table class="tbl"><tbody>{rows}</tbody></table></div>
    </div>
    <div class="card">
      <div class="card__hd"><span class="card__t">Needs you</span>
        <span class="rail__n rail__n--alert" aria-label="7 things need you">7</span></div>
      <div class="card__b card__b--flush"><table class="tbl"><tbody>{needs}</tbody></table></div>
    </div>
  </div>
  <div class="grid3 mt4">
    <div class="card"><div class="card__hd"><span class="card__t">This week</span></div>
      <div class="card__b">
        <div class="kv"><span class="kv__k">Sessions made</span><span class="kv__v">18 of 21</span></div>
        <div class="kv"><span class="kv__k">No-shows</span><span class="kv__v warn">2</span></div>
        <div class="kv"><span class="kv__k">Cancelled by you</span><span class="kv__v">1</span></div>
        <div class="kv"><span class="kv__k">New PRs logged</span><span class="kv__v acc">4</span></div>
        <div class="meter meter--lg mt3"><i class="ok" style="width:86%"></i>
          <i class="warn" style="width:10%"></i><i class="dim" style="width:4%"></i></div>
        <p class="small mt2">86% adherence, roster-wide. Your eight-week average is 84%.</p>
      </div></div>
    <div class="card"><div class="card__hd"><span class="card__t">Free time you could sell</span></div>
      <div class="card__b">
        <div class="kv"><span class="kv__k">Wed 11:00 — 16:00</span><span class="kv__v acc">5 h</span></div>
        <div class="kv"><span class="kv__k">Thu 13:00 — 16:30</span><span class="kv__v acc">3.5 h</span></div>
        <div class="kv"><span class="kv__k">Sat 09:00 — 11:00</span><span class="kv__v acc">2 h</span></div>
        <p class="small mt3">At ₹800 a session, the gaps this week are worth about
          <b>₹8,000</b> if you fill half of them.</p>
        <button class="btn btn--secondary mt3" type="button" style="width:100%">Open the diary</button>
      </div></div>
    <div class="card"><div class="card__hd"><span class="card__t">Your own training</span>
      <span class="tag tag--remote">Second book</span></div>
      <div class="card__b">
        <p class="small">One login, two books. Your own sessions never appear in a client
          report and never touch the money figures.</p>
        <div class="kv mt3"><span class="kv__k">Last session</span><span class="kv__v">Legs · 3 days ago</span></div>
        <div class="kv"><span class="kv__k">Squat top set</span><span class="kv__v">120 kg × 5</span></div>
        <button class="btn btn--secondary mt3" type="button" style="width:100%">Switch to my training</button>
      </div></div>
  </div>
</div></main>'''


BODY = body()


def frame(fid, name, frm, url, rail_html, note, cls=""):
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
        <span class="browser__url">app.xrep.in<b>{url}</b></span>
      </div>
      <div class="app{cls}" data-theme="dark">{rail_html}{top()}{BODY}</div>
    </div>
  </div>
  <p class="unit__note">{note}</p>
</section>'''


# ══════════════════════════════════════════════════════════════════ frames ══
N1A = '''<b>Ten destinations, three groups and today&rsquo;s five clients.</b> The top group is the
  phone&rsquo;s tab bar, in the phone&rsquo;s order &mdash; Today, Schedule, Clients, Money are
  <code>HomeTab</code>, <code>DiaryTab</code>, <code>ClientsTab</code>, <code>MoneyTab</code> in
  <code>navigation/AppTabs.tsx</code>. A trainer who learned the app already knows the top of this
  rail, which is worth more than any taxonomy I could invent for those four. <b>BUILD</b> and
  <b>GROW</b> below it are the app&rsquo;s own drawer groups, Training and Growth, with the web-only
  session archive added to the first.
  <br><br>The pins are last on purpose. Their number changes every morning, and a group that changes
  length must never sit above furniture whose position people have memorised.
  <br><br><b>One thing in this frame argues with &sect;08.</b> The third card reads <i>Your own
  training &middot; Second book</i>, and &sect;08 takes that feature out of the rail foot because the
  app&rsquo;s flag for it is off. The card is drawn here because it is on the real Today screen today;
  which of the two is wrong is &sect;10&rsquo;s last row, and it is not a decision a rail gets to
  make.'''

N1B = '''<b>64px, chosen and remembered.</b> The count on Money is now a red <b>dot</b> rather than
  nothing &mdash; the rule it replaces was <code>display:none</code>, which threw away the only
  number on this rail that costs a trainer rupees, at exactly the width where a trainer has the least
  to look at. The tone survives the collapse; the digit does not, and the <code>aria-label</code>
  still says &ldquo;3 clients owe you&rdquo;.
  <br><br>Every glyph gets a tooltip on hover <i>and on focus</i>, at 140ms. The group kickers become
  hairlines, so the grouping survives too. The mark is the way back out &mdash; at 64px the brand row
  cannot hold a 28px mark and a 32px control, so one of them had to also be the other.
  <br><br><b>One token had to change to make the dot work.</b> The accent dot is
  <code>--tx-accent-text</code>, not <code>--tx-accent</code>. Lime is a fill and a dot is a fill, so
  the rule technically allows it &mdash; but a 7px fill is competing with the surface rather than
  covering it, and <code>#C6F24E</code> on the light rail&rsquo;s <code>#EDEFEC</code> measures
  <b>1.1:1</b>. The text token is the lime on dark and <code>#4F6B0A</code> on light, which is what a
  mark the size of a full stop wants in both themes. Caught by rendering the collapsed rail in light,
  which is the second thing this frame existing has now found.'''

N2A = '''<b>The menu opens beside the rail, never over it.</b> The trigger replaces the time in
  the row&rsquo;s own slot &mdash; so opening it moves nothing and costs no width &mdash; but 248px
  cannot hold a menu, and a menu that covered the four pins above it would hide the list it is about.
  Three verbs, then two about the pin itself. <b>Keep pinned all week</b> is the manual
  override on an otherwise derived list &mdash; the client you are worried about, who does not happen
  to have a session today.'''

N2B = '''<b>The foot opens instead of switching.</b> Four rows and one of them is
  <b>Sign out&hellip;</b> &mdash; with an ellipsis, because it leads to a screen that lists what is
  still queued rather than to a dialog that cannot name it. There are six entries waiting on this
  device; the phone makes this a screen for the same reason
  (<code>screens/main/drawer/SignOut</code>, &sect;5e).'''

N3A = '''<b>Hold <kbd>G</kbd> and every row shows its letter.</b> Ten destinations and today&rsquo;s
  five &mdash; fifteen accelerators on this one screen, where the design system currently documents
  four. The letters
  are first-letter everywhere except Today, which takes <kbd>H</kbd> for Home &mdash; the app calls
  that screen <code>HomeTab</code>, and it frees <kbd>T</kbd> for Team.
  <br><br>At rest the letters are invisible. Eleven visible key hints is a keyboard map, not a
  navigation column.'''


# ══════════════════════════════════════════════════════════════════ prose ══
S01 = '''<p class="note">The rail is the only component in this design set that is on the screen in
every frame of every file. It is drawn <b>31 times</b> and specified once. This page is the second
specification, and it starts with the measurement that decides everything else about it: at
1440&times;900 the rail has <b>785px</b> of body to spend, and the first pass spent 723 of it on
eleven rows and four kickers, which is why nothing new could be added without something leaving.</p>

<div class="units">
{F1A}
</div>

<h3 class="sec">The height budget, at 900px</h3>
<p class="note">Every figure below is the computed value from <code>assets/webapp.css</code>, not
the value the component library claims &mdash; those disagree, which is &sect;02.5.</p>
<table class="dt">
<thead><tr><th>Band</th><th class="num">Height</th><th>What it holds</th></tr></thead>
<tbody>
  <tr><th>Brand row</th><td class="num">56px</td>
    <td><code>--w-top</code>, so the rail&rsquo;s bottom edge and the top bar&rsquo;s meet on one
      line. Mark, wordmark, collapse.</td></tr>
  <tr><th>Foot</th><td class="num">59px</td>
    <td>9px padding, a 40px account button, 9px, 1px border. The library says 52px.</td></tr>
  <tr><th>Body</th><td class="num">785px</td>
    <td>900 &minus; 56 &minus; 59. Of that, 24px is the body&rsquo;s own padding.</td></tr>
  <tr><th>&nbsp;&nbsp;&#8226; four destinations</th><td class="num">160px</td><td>4 &times; 40px, no kicker.</td></tr>
  <tr><th>&nbsp;&nbsp;&#8226; BUILD</th><td class="num">158px</td><td>16 margin + 22 kicker + 3 &times; 40.</td></tr>
  <tr><th>&nbsp;&nbsp;&#8226; GROW</th><td class="num">158px</td><td>Same shape.</td></tr>
  <tr><th>&nbsp;&nbsp;&#8226; TODAY</th><td class="num">38px + 40<i>n</i></td>
    <td>Leaves room for <b>six</b> pins. Five is a normal day; the seventh scrolls, and it is the
      only group in the rail allowed to.</td></tr>
</tbody></table>

<div class="why"><p class="why__k">One component, two configurations</p>
  <p><code>webapp-client-portal.html</code> uses this same <code>.rail</code> with four
  destinations, no kickers and the client&rsquo;s own avatar in the foot. Everything on this page is
  specified for the trainer configuration; the client configuration takes the collapse control, the
  tooltips, the dot badge and the account menu, and takes <b>no pins group</b> &mdash; a client has
  one trainer, and a rail cannot pin the only thing in the list.</p></div>'''

S02 = '''<p class="note">Six findings. Every one of them is checkable against a file in this
directory, and the first three are visible in a frame that has already been reviewed &mdash; which is
the argument for specifying furniture rather than pasting it.</p>

<table class="dt" style="table-layout:fixed">
<thead><tr><th style="width:38px">#</th><th style="width:52%">What is wrong</th>
  <th>Where to check it</th></tr></thead>
<tbody>
  <tr><th class="num">1</th><td><b>Three sync surfaces, three different answers, one screen.</b>
    The rail says the queue holds 3, the top bar says <b>Synced</b>, and the Needs-you card says
    <i>6 entries waiting to sync</i>.</td>
    <td><code>webapp-dashboard.html</code>. The rail&rsquo;s number is different on all seven
      screens: 3, 6, 4, 2, 6, 6, 2. The pill says <b>Synced</b> on every one of them.</td></tr>
  <tr><th class="num">2</th><td><b>A shipped feature has no route into it.</b> Team coaching is V26,
    all three phases, on both halves, drawer 6a&ndash;6l. It is not in the rail, and the string
    <code>Team</code> does not appear anywhere in the web design set.</td>
    <td><code>grep -c '&gt;Team&lt;' *.html</code> returns 0 for all twenty-three files that
      existed before this one, including the information architecture.</td></tr>
  <tr><th class="num">3</th><td><b>Every row is a <code>&lt;div&gt;</code>.</b> Not focusable, not a
    link, no role, no accessible name beyond its text. <code>Tab</code> from the top bar skips the
    whole rail.</td>
    <td>374 <code>.rail__i</code> elements across 31 rails, plus 31 <code>.roleswap</code> divs.
      Not one <code>&lt;a&gt;</code>, <code>&lt;button&gt;</code> or <code>tabindex</code> among
      them.</td></tr>
  <tr><th class="num">4</th><td><b>Collapsing the rail deletes the badges.</b>
    <code>.app--rail-min .rail__n{{display:none}}</code> &mdash; so the red 3 on Money disappears at
    the width where there is least else to look at.</td>
    <td><code>assets/webapp.css</code>, the <code>.app--rail-min</code> group. Drawn collapsed in
      <code>webapp-c-nav.html</code>.</td></tr>
  <tr><th class="num">5</th><td><b>The specification contradicts the stylesheet.</b> Item height
    36px against a computed 40px, group gap 20px against 16px, foot 52px against 59px.</td>
    <td><code>webapp-c-nav.html</code>, the rail&rsquo;s specifications table, against
      <code>.rail__i</code> and <code>--w-tap-touch</code>.</td></tr>
  <tr><th class="num">6</th><td><b>The one permanent slot holds a switched-off feature.</b> The foot
    is the self-training switch. <code>SELF_TRAINING_ENABLED</code> is <code>false</code>, and the
    app hides that row rather than showing it.</td>
    <td><code>app/src/settings/prefs.ts</code> and the note at the top of
      <code>screens/main/home/AppDrawer.tsx</code>.</td></tr>
</tbody></table>

<div class="why why--warn"><p class="why__k">Why the sync one is the worst of the six</p>
  <p>The other five are things a trainer would never notice. This one is the product telling a
  trainer three different things about whether their work is safe, in one glance, on the screen they
  open first &mdash; and this is an <b>offline-first</b> product, where &ldquo;has it reached the
  server&rdquo; is the only question the chrome exists to answer.
  <br><br>The fix is not a better badge. It is <b>one surface</b>: the pill in the top bar carries
  the state and becomes the link when the queue is not empty, and <code>Sync queue</code> leaves the
  rail. Every frame on this page draws the pill as <b>6 queued</b>, in
  <code>.sync--queued</code> &mdash; a variant that has existed in the stylesheet the whole time and
  has never once been used.
  <br><br>The day&rsquo;s to-do list keeps its <i>6 entries waiting to sync</i> row. A task list is
  allowed to repeat chrome state; repeating it is what a task list is for.</p></div>'''


S03 = '''<p class="note">Eleven destinations become ten, and the ten are grouped by <b>how often a
trainer opens them</b> rather than by what subject they belong to. The old groups &mdash; WORK,
BUILD, BUSINESS, SYSTEM &mdash; are a taxonomy, and a taxonomy sorts a list without telling anyone
where to look first.</p>

<table class="dt">
<thead><tr><th>Was</th><th>Is</th><th>Why</th></tr></thead>
<tbody>
  <tr><th>WORK &middot; Today, Schedule, Clients</th><td>The first group, no kicker</td>
    <td>Joined by <b>Money</b> so the group is exactly the app&rsquo;s four tabs, in the app&rsquo;s
      order. It needs no kicker because it is the top; a label on the first group is a label on
      &ldquo;the start&rdquo;.</td></tr>
  <tr><th>WORK &middot; Sessions</th><td>BUILD &middot; Sessions</td>
    <td>It is the archive of logged sessions (<code>/sessions</code> in the IA&rsquo;s URL map), not
      a daily surface. It sits with the two other things made of exercises.</td></tr>
  <tr><th>BUILD &middot; Programs, Exercises</th><td>BUILD, unchanged</td>
    <td>The app&rsquo;s <b>Training</b> group, same two rows.</td></tr>
  <tr><th>BUSINESS &middot; Money</th><td>The first group</td>
    <td>It is a tab on the phone, opened daily, and the only place the gym&rsquo;s cut appears.
      Grouping it with Reports put a daily screen behind a monthly kicker.</td></tr>
  <tr><th>BUSINESS &middot; Reports, Nudges</th><td>GROW, joined by <b>Team</b></td>
    <td>The app&rsquo;s <b>Growth</b> group, and the app&rsquo;s own reason for putting Team at the
      head of it: <i>hiring coaches is how a trainer grows past their own hours, which is what the
      other rows are also about</i>.</td></tr>
  <tr><th>SYSTEM &middot; Sync queue</th><td class="ink3">Deleted from the rail</td>
    <td>The top bar&rsquo;s pill is the state and the link. See &sect;02.</td></tr>
  <tr><th>SYSTEM &middot; Settings</th><td>The account menu</td>
    <td>Opened weekly at most, and it is the one page with its own section rail once you arrive.
      <kbd>,</kbd> reaches it, and so does the palette.</td></tr>
  <tr><th class="ink3">&mdash;</th><td><b>Team</b>, new</td>
    <td>&sect;02.2. Badged with invitations addressed to <i>you</i> and never with the size of the
      team &mdash; the app&rsquo;s rule, in the app&rsquo;s words: <i>a number on a drawer item is a
      job, and &ldquo;you have 4 coaches&rdquo; is not one</i>.</td></tr>
  <tr><th class="ink3">&mdash;</th><td><b>Help</b>, in the account menu</td>
    <td>The app has it; the web set never drew it. There is no <code>/help</code> route in the IA yet
      &mdash; &sect;10.</td></tr>
</tbody></table>

<div class="why"><p class="why__k">What did not move, and why that matters more</p>
  <p>The four rows a trainer uses every day are the four rows they already know from the phone, in
  the same order, at the top. Nothing in this redesign is worth breaking that: a rail earns its keep
  by being in the same place tomorrow, and the fastest navigation in any product is the kind nobody
  reads.</p></div>'''

S04 = '''<p class="note">This is the one structural addition, and the competitor evidence for it is
the strongest in &sect;09: Everfit rebuilt their sidebar around exactly this and said why. What they
put in it is <b>the whole client list</b>. What goes in ours is <b>today</b>.</p>

<div class="units">
{F2A}
</div>

<h3 class="sec">Why today, and not the roster</h3>
<table class="dt">
<thead><tr><th>Option</th><th class="num">Height</th><th>Verdict</th></tr></thead>
<tbody>
  <tr><th>All 22 clients, scrolling</th><td class="num">880px</td>
    <td>Taller than the rail. Everfit&rsquo;s answer is a scroll and a sort control; ours would be a
      scroll, a sort control, and ten destinations pushed out of sight.</td></tr>
  <tr><th>Manually pinned favourites</th><td class="num">varies</td>
    <td>Works, and needs curating. A trainer who has to maintain a list will maintain it for a week.
      Kept as the <b>override</b>, not the mechanism.</td></tr>
  <tr><th>Today&rsquo;s sessions</th><td class="num">200px</td>
    <td><b>Taken.</b> Derived from the schedule the rail is already beside, correct every morning
      without anybody touching it, and exactly the set of people a trainer opens repeatedly on the
      day they open them.</td></tr>
</tbody></table>

<p class="unit__note" style="margin-top:14px"><b>Three encodings, one slot.</b> A pin says who, when,
and whether it has happened &mdash; a mono time, a tick when logged, and <b>Now</b> in the accent
wash for the session in progress, which is the same 12% wash the current destination uses because it
is the same statement. Done rows dim their avatar to 50%. What a pin deliberately does <i>not</i>
carry is money: Kavya&rsquo;s pack has expired, and that belongs to the badge on Money and to the
day&rsquo;s to-do list, not to a 248px row that is already saying three things.
<br><br><b>The tab you were on stays open.</b> Clicking a second pin from a client&rsquo;s Programme
tab lands on the next client&rsquo;s Programme tab. This is Everfit&rsquo;s idea, verbatim from their
own release note, and it is the difference between a shortcut list and a list of people you have to
re-navigate five times. Nothing else in this design set does it yet.</p>'''

S05 = '''<p class="note">The 64px rail already existed as a stylesheet class and a specifications
row. It had never been drawn in a real frame, which is how it kept a defect that a single screenshot
would have caught.</p>

<div class="units">
{F1B}
</div>

<div class="why why--warn"><p class="why__k">The refusal: it is not the default, and hover does not
  expand it</p>
  <p>Everfit&rsquo;s new sidebar <b>is</b> collapsed by default and expands on hover, with a
  <i>Keep panel showing</i> pin for people who want it open. It is a defensible trade and we are not
  taking it, for three reasons.
  <br><br><b>One.</b> Nielsen Norman Group&rsquo;s position on icon usability is that a text label
  must accompany an icon to disambiguate it, and that <i>icon labels should be visible at all times,
  without any interaction from the user</i>. Hover-to-reveal is interaction.
  <br><br><b>Two.</b> Hover has no keyboard equivalent and no touch equivalent. A convertible laptop
  &mdash; the machine <code>--w-tap-touch</code> exists for &mdash; cannot hover at all.
  <br><br><b>Three.</b> A panel that grows over the content when the pointer passes through it on the
  way to something else is a panel that moves without being asked. On a 1440px canvas we are not
  short of 184px; the collapse exists for the 1000&ndash;1200px window, and for the trainer who wants
  the width for a twelve-week grid.
  <br><br>So: expanded by default, collapsed by a control, remembered per device, and every glyph
  labelled by a tooltip that fires on <b>focus</b> as well as hover.</p></div>'''

S06 = '''<p class="note">Three tones already existed in the stylesheet. What did not exist was a rule
saying which is which, and without one the rail put a job in the quiet tone: <code>Sync queue 6</code>
was a queue of unsent work rendered exactly like <code>Clients 22</code>.</p>

<table class="dt">
<thead><tr><th>Tone</th><th>Means</th><th>On the rail</th><th>Rule</th></tr></thead>
<tbody>
  <tr><th><span class="rail__n rail__n--alert">3</span> danger</th>
    <td>Money you are owed</td><td>Money</td>
    <td>The only tone that survives being seen every day, because it is the only one that costs
      rupees. Never used for anything else on this rail.</td></tr>
  <tr><th><span class="rail__n rail__n--acc">8</span> accent</th>
    <td>A queue you can clear now</td><td>Nudges, Team</td>
    <td>Drafts waiting to send; invitations addressed to you. Goes to zero when you have done the
      work, which is the test for this tone.</td></tr>
  <tr><th><span class="rail__n">22</span> quiet</th>
    <td>How many there are</td><td>Schedule, Clients, Exercises</td>
    <td>Information, not a job. The app&rsquo;s own precedent &mdash; it badges Exercises with 1,324
      <i>because 1,324 is information</i>.</td></tr>
</tbody></table>

<p class="unit__note" style="margin-top:14px"><b>And two things that never get a badge.</b> Settings,
because a permanently badged row teaches people to ignore badges &mdash; the app says exactly this in
<code>AppDrawer.tsx</code>. And <b>Team</b>&rsquo;s size: four coaches is a fact about your business,
not a job on your morning.
<br><br>Every badge carries an <code>aria-label</code> that says what the number is
&mdash; <code>aria-label="3 clients owe you"</code>. Without it a screen reader announces
&ldquo;Money, 3&rdquo;, which is a link to a page about the number three.</p>'''

S07 = '''<p class="note">The design system documents <kbd>G</kbd> then <kbd>C</kbd> / <kbd>M</kbd> /
<kbd>S</kbd> / <kbd>R</kbd> &mdash; four of the eleven destinations. A trainer who learns four and
finds that the fifth does nothing has learned that the feature is unreliable, which is worse than not
having it.</p>

<div class="units">
{F3A}
</div>

<table class="dt">
<thead><tr><th>Keys</th><th>Goes to</th><th>Note</th></tr></thead>
<tbody>
  <tr><th><kbd>G</kbd> <kbd>H</kbd></th><td>Today</td>
    <td>H for Home, which is what the app calls this screen. It frees T.</td></tr>
  <tr><th><kbd>G</kbd> <kbd>S</kbd></th><td>Schedule</td><td>Already in the contract.</td></tr>
  <tr><th><kbd>G</kbd> <kbd>C</kbd></th><td>Clients</td><td>Already in the contract.</td></tr>
  <tr><th><kbd>G</kbd> <kbd>M</kbd></th><td>Money</td><td>Already in the contract.</td></tr>
  <tr><th><kbd>G</kbd> <kbd>P</kbd></th><td>Programs</td><td>New.</td></tr>
  <tr><th><kbd>G</kbd> <kbd>E</kbd></th><td>Exercises</td><td>New.</td></tr>
  <tr><th><kbd>G</kbd> <kbd>L</kbd></th><td>Sessions</td>
    <td>L for the log. S is taken by Schedule and the archive is the less-used of the two.</td></tr>
  <tr><th><kbd>G</kbd> <kbd>R</kbd></th><td>Reports</td><td>Already in the contract.</td></tr>
  <tr><th><kbd>G</kbd> <kbd>N</kbd></th><td>Nudges</td><td>New.</td></tr>
  <tr><th><kbd>G</kbd> <kbd>T</kbd></th><td>Team</td><td>New, and the reason Today took H.</td></tr>
  <tr><th><kbd>G</kbd> <kbd>1</kbd>&ndash;<kbd>6</kbd></th><td>Today&rsquo;s <i>n</i>th client</td>
    <td>In time order, so <kbd>G</kbd> <kbd>3</kbd> is the session you are in. Six because six pins
      fit; a seventh key would point at a row nobody can see.</td></tr>
  <tr><th><kbd>,</kbd></th><td>Settings</td>
    <td>The convention, and it needs no prefix because no list uses a comma.</td></tr>
  <tr><th><kbd>[</kbd></th><td>Collapse / expand the rail</td>
    <td>The one control on the rail that is not a destination.</td></tr>
</tbody></table>

<p class="unit__note" style="margin-top:14px"><b>Holding <kbd>G</kbd> reveals the map.</b> Nobody
learns sixteen shortcuts from a table in a design file; they learn two, and then one day they hold
the prefix down and see the rest. It costs one CSS rule &mdash; <code>.rail--keys .rail__k</code> at
full opacity &mdash; and it is the same rule that already fires on hover and on focus, so a keyboard
user tabbing the rail is taught the accelerator for the row they are standing on.</p>'''

S08 = '''<p class="note">The foot is the only slot in this product&rsquo;s chrome that is always
visible and never contested. It was spending itself on the self-training switch &mdash; and the app
hides that row entirely, because <code>SELF_TRAINING_ENABLED</code> is off and, in the app&rsquo;s
own words, a row that leads to &ldquo;not built yet&rdquo; is <i>the app admitting it is unfinished
before the trainer has reached anything they came for</i>.</p>

<div class="units">
{F2B}
</div>

<h3 class="sec">What is in it, and what is deliberately not</h3>
<table class="dt">
<thead><tr><th>Row</th><th>Why it is here</th></tr></thead>
<tbody>
  <tr><th>Profile</th><td>Name, phone, UPI id. Reached from the drawer header on the phone.</td></tr>
  <tr><th>Settings <kbd>,</kbd></th><td>Freed a rail row and a group kicker. It has its own section
    rail once you arrive, so it is a destination that explains itself.</td></tr>
  <tr><th>Help</th><td>The app has it and the web set never drew it. Included so the omission is
    visible rather than silent.</td></tr>
  <tr><th>Sign out&hellip;</th><td>An ellipsis, and the danger tone. It goes to a
    <b>screen</b> that names what is still queued &mdash; six entries, right now &mdash; because an
    alert cannot say <i>what</i> is unsynced, and a queued nudge log is worth losing where a recorded
    payment is not.</td></tr>
  <tr><th class="ink3">Switch to my own training</th><td class="ink3"><b>Absent.</b> Hidden rather
    than shown-and-refused, which is the rule the app applies to the same row. It returns to this
    menu on the day the flag turns on, above Profile.</td></tr>
  <tr><th class="ink3">Dark / Light</th><td class="ink3"><b>Absent.</b> The design system says the
    light theme is complete in tokens and deliberately not drawn, because &ldquo;a light screenshot
    in a review file invites someone to design for it before it is a decision&rdquo;. A toggle here
    would make the decision on that file&rsquo;s behalf. Appearance belongs in Settings.</td></tr>
</tbody></table>'''


# ════════════════════════════════════════════════════════ competitor cards ══
I_EYE = '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>'
I_DO = '<path d="M4.5 12.5l5 5 10-11"/>'
I_NO = '<path d="M6 6l12 12M18 6L6 18"/>'


def pattern(title, tone, verdict, built, take, leave):
    """One competitor pattern, in the shape webapp-competitors.html uses."""
    return f'''<div class="grp"><div class="grp__t"><h4>{title}</h4>
  <span><span class="tag tag--{tone}">{verdict}</span></span></div>
<div class="dd" style="grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)">
  <div class="dd__i" style="border-color:var(--tx-line)">
    <p class="dd__k" style="background:var(--tx-surface-2);color:var(--tx-ink-3)">
      {ic(I_EYE, 13)} What they built</p>
    <p class="dd__c" style="border-top:0">{built}</p></div>
  <div class="col" style="gap:12px">
    <div class="dd__i dd__i--do"><p class="dd__k">{ic(I_DO, 13)} Take this</p>
      <p class="dd__c" style="border-top:0">{take}</p></div>
    <div class="dd__i dd__i--no"><p class="dd__k">{ic(I_NO, 13)} Leave this</p>
      <p class="dd__c" style="border-top:0">{leave}</p></div>
  </div></div></div>'''


S09 = '''<p class="note">The existing <a href="webapp-competitors.html">market file</a> examined five
patterns and none of them was navigation &mdash; it went straight to the builder. These six are about
the shell, and the first is the strongest single piece of evidence in either document, because it is a
competitor <b>rebuilding their sidebar</b> and publishing the reasoning. Rows marked
<span class="tag tag--ok">Verified</span> trace to the vendor&rsquo;s own release notes or help
articles, which describe their interface in specifics. Where I could not verify a claim from a primary
source, the row says so.</p>

''' + pattern(
    "Everfit &mdash; the sidebar rebuilt around the client list",
    "ok", "Verified from vendor docs",
    '''Their release note <i>New interface, navigation and color scheme</i> describes a sidebar
    where <b>the full client list is visible in the left sidebar</b>, with a <b>search field in the
    navigation panel</b>, sortable <b>alphabetically or by last app activity</b>. And one detail worth
    the whole article: <i>when navigating between different clients using the sidebar, the same tab
    you were viewing will remain open</i>.''',
    '''<b>Objects belong in the rail, not just sections.</b> A trainer&rsquo;s day is five or six
    named people, and making them navigate <i>Clients &rarr; search &rarr; open</i> five times is the
    single largest avoidable cost in our shell. And <b>tab persistence</b>, taken verbatim: pin to
    pin, the sub-tab survives. Nothing in this design set does that yet.''',
    '''<b>The whole list.</b> 22 clients at our row height is 880px &mdash; taller than the rail, so
    it can only exist as a scroll that pushes the destinations out of view. Ours is cut to
    <b>today</b>, which is derived from the schedule and needs no sort control, no search field and no
    curating. The manual pin survives as the override.''') + '''

''' + pattern(
    "Everfit &mdash; collapsed by default, labels on hover",
    "ok", "Verified from vendor docs",
    '''The same sidebar is <b>collapsible</b>: at rest it shows <i>a concise list of icons for a
    cleaner and more streamlined appearance</i>, and labels appear on hover. A
    <b>Keep panel showing</b> control pins it open so that <i>all features remain visible when you
    click on them</i>.''',
    '''<b>The collapse, and remembering the choice.</b> Both are right, and our 64px state already
    existed in the stylesheet &mdash; it had simply never been drawn, which is how it kept the bug in
    &sect;02.4. The <i>Keep panel showing</i> label is also a good reminder that the state must
    persist per device rather than per session.''',
    '''<b>Collapsed as the default, and hover as the reveal.</b> NN/g&rsquo;s position on icons is
    that a label must accompany the glyph and that <i>icon labels should be visible at all times,
    without any interaction from the user</i>. Hover is interaction, has no keyboard equivalent, and
    does not exist on the convertible laptop <code>--w-tap-touch</code> was measured for. We expand by
    default and collapse on request.''') + '''

''' + pattern(
    "ABC Trainerize &mdash; a left menu, a top bar, and a library folder",
    "ok", "Verified from vendor docs",
    '''Their redesign shipped <i>a new, easy-to-navigate menu on the left-hand side, and a top bar
    navigation (which means a few things have been relocated)</i>, plus search to find clients faster.
    The sidebar carries a <b>Master Library folder</b> holding Programs, Workouts, Habits and
    Exercises &mdash; a disclosure group inside the rail.''',
    '''<b>The split of a rail and a top bar</b>, which is what we already have &mdash; and the
    grouping instinct: authoring surfaces belong together. Our <b>BUILD</b> group is the same idea.
    Their parenthetical is also the honest part of any nav redesign: <i>a few things have been
    relocated</i>, which is &sect;10 on this page.''',
    '''<b>The folder.</b> A group you have to open is a group you cannot see, and it costs a click on
    every visit to save 60px once. Ten destinations do not need a tree; a kicker and a gap say the
    same thing for free and never hide anything.''') + '''

''' + pattern(
    "The category &mdash; the navigation vocabulary is settled",
    "warn", "Partly inferred",
    '''Read across the published help structures &mdash; TrueCoach&rsquo;s help centre is organised
    as Managing Clients, The Workout Calendar &amp; Sidebar, Library, Programs, Payments, Messaging,
    Transfers and Team Accounts, Coach Profile; Everfit&rsquo;s left menu carries Clients, Library,
    Payment Activity, Studio &mdash; and the same eight nouns keep appearing.''',
    '''<b>Use the settled words.</b> Clients, Schedule, Programs, Exercises, Reports, Team, Settings
    are all category vocabulary and none of them needed inventing. Two rows deliberately are not:
    <b>Money</b>, because <i>Payments</i> describes a processor and this is a book that also holds the
    gym&rsquo;s cut, and <b>Nudges</b>, because they are outbound templates rather than a
    conversation.''',
    '''<b>Messages.</b> Every competitor has a chat row; we do not run a channel, and a Messages row
    would promise one. Nudges send over WhatsApp and email and the reply arrives in the
    trainer&rsquo;s own inbox &mdash; which is honest, and a rail row named Messages would stop being
    honest about it.''') + '''

''' + pattern(
    "The category &mdash; a sidebar that carries no state",
    "warn", "Partly inferred",
    '''In the material I could reach, no competitor&rsquo;s sidebar carries a number that changes the
    shape of a coach&rsquo;s day. Where badges appear at all they are unread-message counts. There is
    no queue count, no unsent-work indicator, and no amount owed.''',
    '''<b>The gap.</b> Three of our rows carry a number a trainer can act on, and the loudest of them
    &mdash; <b>&#8377;18,000 owed across three clients</b> &mdash; has no competitor equivalent at
    all. That is the same conclusion the market file reached about the money screen, arrived at from a
    completely different direction, which is the best kind of agreement.''',
    '''<b>Treating the rail as a menu.</b> A menu lists where you can go. A rail in an offline-first
    product also has to say what is waiting and what has not reached the server &mdash; and if it says
    the second thing, it has to agree with the top bar, which is the finding this page opens
    on.''') + '''

''' + pattern(
    "Modern application shells &mdash; favourites, and a palette for the long tail",
    "acc", "Pattern, widely documented",
    '''Outside this category the settled shape is: a short list of destinations, a group of
    <b>pinned objects</b> above or below them, and <b>&#8984;K</b> carrying everything else. Linear,
    Notion, Slack and Attio all have a favourites group; none of them grows the menu to cover the long
    tail.''',
    '''<b>Both halves.</b> The pins group is the first, and the second is a refusal: <b>no search
    field in the rail.</b> Everfit put one there, and it is the right call for a sidebar holding 200
    names &mdash; but our top bar already has the omni box on <b>&#8984;K</b>, and two search boxes on
    one screen is the same duplication as two sync indicators.''',
    '''<b>Favourites above the destinations.</b> Almost everyone puts them at the top. Ours go at the
    bottom, because our first four rows are the phone&rsquo;s tab bar in the phone&rsquo;s order, and
    a group whose length changes every morning must not be allowed to push them down the
    column.''') + '''

<h3 class="sec">What this section actually changed</h3>
<table class="dt" style="table-layout:fixed">
<thead><tr><th style="width:38px">#</th><th style="width:34%">Change</th>
  <th>Where it came from</th></tr></thead>
<tbody>
  <tr><th class="num">01</th><td><b>Today&rsquo;s clients in the rail</b></td>
    <td>Everfit&rsquo;s sidebar rebuild, cut from the whole roster to the day.</td></tr>
  <tr><th class="num">02</th><td><b>The sub-tab survives a pin click</b></td>
    <td>Everfit, verbatim. Cheap, and nothing here does it.</td></tr>
  <tr><th class="num">03</th><td><b>Collapse kept, hover-reveal refused</b></td>
    <td>Everfit&rsquo;s default, inverted on NN/g&rsquo;s icon-label finding.</td></tr>
  <tr><th class="num">04</th><td><b>No second search box</b></td>
    <td>Everfit has one; our top bar already answers it.</td></tr>
</tbody></table>'''

S10 = '''<p class="note">This page is a specification, not a propagation. The rail is pasted into
<b>31</b> frames across <b>12</b> files, and every one of them still draws the first pass. Nothing
below touches the app or the backend &mdash; there is no schema in a navigation column &mdash; except
that <code>Team</code> finally needs the <code>/team</code> route the backend has had since V26.</p>

<table class="dt">
<thead><tr><th>File</th><th class="num">Rails</th><th>What has to change</th></tr></thead>
<tbody>
  <tr><th><code>webapp-clients.html</code></th><td class="num">6</td>
    <td rowspan="6">Replace the rail; set the pill to <code>.sync--queued</code> where the queue is
      non-empty; make the current row an <code>&lt;a&gt;</code> with
      <code>aria-current="page"</code>.</td></tr>
  <tr><th><code>webapp-programs.html</code></th><td class="num">6</td></tr>
  <tr><th><code>webapp-schedule.html</code></th><td class="num">4</td></tr>
  <tr><th><code>webapp-dashboard.html</code></th><td class="num">3</td></tr>
  <tr><th><code>webapp-money.html</code> &middot; <code>-reports</code> &middot; <code>-settings</code></th>
    <td class="num">2 each</td></tr>
  <tr><th><code>webapp-workout.html</code> &middot; <code>-glass</code> &middot; <code>-components</code></th>
    <td class="num">1 each</td></tr>
  <tr><th><code>webapp-client-portal.html</code></th><td class="num">1</td>
    <td>The client configuration: collapse, tooltips, dot badge, account menu. <b>No pins.</b></td></tr>
  <tr><th><code>webapp-c-nav.html</code></th><td class="num">2</td>
    <td>The component page. Three wrong numbers in the specifications table (36&rarr;40px,
      20&rarr;16px, 52&rarr;59px), a new anatomy callout for the pins group and the accelerator, and
      the <i>Role switcher</i> note becomes the account button.</td></tr>
  <tr><th><code>webapp-information-architecture.html</code></th><td class="num">&mdash;</td>
    <td><b>Team is missing from the IA entirely</b>, not just from the rail. It needs a row in the
      use-case map and a node in the URL map. <code>/help</code> has neither.</td></tr>
  <tr><th><code>webapp-design-system.html</code></th><td class="num">&mdash;</td>
    <td>The keyboard contract grows: the <kbd>G</kbd> row goes from four letters to ten, gains
      <kbd>G</kbd> <kbd>1</kbd>&ndash;<kbd>6</kbd>, and <kbd>,</kbd> and <kbd>[</kbd> are new
      rows.</td></tr>
  <tr><th><code>webapp-dashboard.html</code>, again</th><td class="num">&mdash;</td>
    <td>Its third card is <i>Your own training &middot; Second book</i>, with a
      <b>Switch to my training</b> button. <code>SELF_TRAINING_ENABLED</code> is <code>false</code>
      in the app, and the app hides that row rather than showing it. Either the flag turns on and the
      row returns to the account menu, or the card goes &mdash; but the design set cannot keep
      promoting a feature on the first screen while the shell is told to hide it. <b>Pick one.</b></td></tr>
  <tr><th><code>assets/webapp.css</code></th><td class="num">&mdash;</td>
    <td><b>Done in this pass.</b> The second-pass block, and one correction to the first:
      <code>.rail__n</code> left the <code>.app--rail-min</code> hide list and became a dot.
      <code>.roleswap</code> is kept &mdash; it becomes dead the day the last of the 31 is
      replaced, and not before.</td></tr>
</tbody></table>'''

S11 = '''<table class="dt">
<thead><tr><th>Open</th><th>Why it is not answered here</th></tr></thead>
<tbody>
  <tr><th>The empty pins group</th>
    <td>A rest day, or 06:00 on a Sunday. The group should disappear rather than say &ldquo;no
      sessions&rdquo; &mdash; a rail is furniture and furniture does not report &mdash; but that is a
      claim, not a drawn frame.</td></tr>
  <tr><th>The seventh pin</th>
    <td>The scroll is specified and not drawn. A trainer with nine sessions is a real trainer, and
      a scrollbar appearing inside a 248px column is worth seeing before it ships.</td></tr>
  <tr><th>Auto-collapse below 1200px</th>
    <td>Tempting, and refused for now: the design system draws the line at 1000px and says below it
      the phone app is the answer. A rail that collapses itself is also a rail that ignores the
      choice a trainer made, which is the complaint in &sect;05.</td></tr>
  <tr><th>A team lens in the foot</th>
    <td><b>Deliberately not invented.</b> The app&rsquo;s lens is
      <code>'trainer' | 'client'</code> and nothing else. A team widens reads and never moves
      ownership; teammates&rsquo; clients are online-only REST and no role sees a teammate&rsquo;s
      money book. A &ldquo;viewing X&rsquo;s book&rdquo; switch in the rail foot would be a permission
      model invented from a chevron.</td></tr>
  <tr><th>The bell and the Nudges badge</th>
    <td>Two numbers about outbound messages, one in the top bar and one on the rail. They are not the
      same number &mdash; drafts waiting versus things that happened &mdash; but nothing in this
      design set says so, and a reviewer is right to ask.</td></tr>
  <tr><th>Adherence has no row</th>
    <td>It is a section of Reports here, which is defensible. But the IA marks it <b>PROMOTED</b> and
      gives it its own frame, and a promoted screen reachable only by arriving somewhere else is worth
      a second look.</td></tr>
</tbody></table>'''


# ═════════════════════════════════════════════════════════════════ assemble ══
F1A = frame("1a", "The rail, second pass", "shell &middot; every frame", "/",
            rail("today"), N1A)
F1B = frame("1b", "Collapsed to 64px, badges intact", "shell &middot; every frame", "/",
            rail("today", mini=True, tip="money"), N1B, cls=" app--rail-min")
F2A = frame("2a", "Today&rsquo;s clients, and a pin&rsquo;s menu", "drawer &middot; 1a", "/",
            rail("today", pinmenu_on=True), N2A)
F2B = frame("2b", "The account menu", "drawer &middot; 1a 5a", "/",
            rail("today", acct=True), N2B)
F3A = frame("3a", "Holding G", "new to the web", "/",
            rail("today", keys=True), N3A)

# The frames are spliced in rather than interpolated: half of these sections
# carry CSS in prose, and an f-string that has to escape every brace in a
# stylesheet quotation is a file nobody can edit safely.
S01 = S01.replace("{F1A}", F1A)
S02 = S02.replace("{{display:none}}", "{display:none}")
S04 = S04.replace("{F2A}", F2A)
S05 = S05.replace("{F1B}", F1B)
S07 = S07.replace("{F3A}", F3A)
S08 = S08.replace("{F2B}", F2B)

NAV = ('<a href="webapp-information-architecture.html">IA</a>'
       '<a href="webapp-design-system.html">DS</a>'
       '<a href="webapp-components.html">LIBRARY</a>'
       '<a href="webapp-competitors.html">MARKET</a>'
       '<a href="webapp-glass.html">GLASS</a>'
       '<a href="webapp-heuristics.html">UX AUDIT</a>'
       '<a href="webapp-rail.html" aria-current="page">RAIL</a>'
       '<a href="webapp-auth.html">AUTH</a>'
       '<a href="webapp-dashboard.html">TODAY</a>'
       '<a href="webapp-clients.html">CLIENTS</a>'
       '<a href="webapp-programs.html">PROGRAMS</a>'
       '<a href="webapp-schedule.html">SCHEDULE</a>'
       '<a href="webapp-workout.html">WORKOUT</a>'
       '<a href="webapp-money.html">MONEY</a>'
       '<a href="webapp-reports.html">REPORTS</a>'
       '<a href="webapp-settings.html">SETTINGS</a>'
       '<a href="webapp-client-portal.html">PORTAL</a>')

SECS = [
    ("01", "What the rail is for", S01),
    ("02", "The audit &mdash; six things wrong with the one thing on every screen", S02),
    ("03", "The destinations, decided", S03),
    ("04", "Today&rsquo;s clients", S04),
    ("05", "Collapsed, and why it is not the default", S05),
    ("06", "Badges &mdash; three tones, three meanings", S06),
    ("07", "The keyboard", S07),
    ("08", "The foot", S08),
    ("09", "Competitor analysis &mdash; six patterns, four changes", S09),
    ("10", "What this changes in the other files", S10),
    ("11", "Still open", S11),
]

BODY_HTML = '\n\n'.join(
    f'<h2 class="sec"><span class="n">{n}</span>{t}</h2>\n{s}' for n, t, s in SECS)

HTML = f'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>X REP &middot; Web app &mdash; The rail</title>
<meta name="description" content="The navigation rail, re-specified: ten destinations, today's clients, a collapsed state that keeps its badges, and the competitor evidence for each. X REP web application.">
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

<h1>The rail &mdash; the one thing on every screen</h1>
<p class="doc__lede">It is drawn <b>31 times</b> across this design set and specified once, and both
numbers are a problem. Three of its rows contradict something else on the same screen, a feature that
shipped on both halves has no route into it at all, and all <b>374</b> of its rows are
<code>&lt;div&gt;</code>s that <kbd>Tab</kbd> walks straight past. This page re-specifies it: ten
destinations grouped by how often they are opened, <b>today&rsquo;s clients</b> in the rail itself, a
64px state that keeps the badge it used to delete, and an accelerator on every row. Two of the four
changes come from a competitor who rebuilt their sidebar last year and published the reasoning; one
of them is a refusal of what they did.</p>
<div class="doc__meta"><span><b>Frames</b> <span data-frame-count>5</span></span>
  <span><b>Destinations</b> 11 &rarr; 10, plus 5 pins</span>
  <span><b>Patterns examined</b> 6</span>
  <span><b>Defects found</b> 6</span></div>
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


{BODY_HTML}

<hr class="rule" style="margin-top:84px">
<p class="small" style="max-width:var(--w-measure)">
  X REP &middot; web application &middot; v1.1 &middot; every frame drawn at 1440&times;900 and scaled
  to fit. Colour, spacing and radius tokens are copied verbatim from
  <code>xrepdesignsystem.html</code> &mdash; if a value differs there, it is a bug here. Press
  <kbd>+</kbd> / <kbd>&minus;</kbd> to change the zoom.
  <br><br>Competitor rows trace to primary sources: Everfit&rsquo;s help-centre article
  <i>New interface, navigation and color scheme</i> and their Payment Activity and Library articles;
  the ABC Trainerize product blog post announcing the left-hand menu and top bar; TrueCoach&rsquo;s
  help-centre section structure. Rows marked <i>Partly inferred</i> are read across several vendors
  rather than quoted from one. The icon-label finding is Nielsen Norman Group&rsquo;s
  <i>Icon Usability</i>.
  <br><br>Claims about the app trace to <code>navigation/AppTabs.tsx</code>,
  <code>screens/main/home/AppDrawer.tsx</code>, <code>store/AuthContext.tsx</code> and
  <code>settings/prefs.ts</code>. Claims about this design set are greppable in this directory.
</p>

</div>
<script src="assets/webapp.js"></script>
</body>
</html>
'''

# Guarded, because gen_schedule.py imports this module for the shell — one
# rail definition, two pages. An icon or a row that drifted between two
# generators would be exactly the diff §02 of this page complains about.
if __name__ == "__main__":
    out = HERE / "webapp-rail.html"
    out.write_text(HTML)
    print("wrote", out, len(HTML), "chars")

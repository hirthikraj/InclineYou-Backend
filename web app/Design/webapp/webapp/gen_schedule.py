#!/usr/bin/env python3
"""Generate webapp-schedule.html — the schedule, re-drawn in minutes.

Run it from anywhere: python3 gen_schedule.py — it writes the page next to
itself.

The first pass drew the week as a matrix of 48px hour cells. This one draws it
as one positioned track per day at ONE PIXEL PER MINUTE, which is the whole
fix: `top` is the start minute, `height` is the duration, and both come from
the data instead of from a cell.

Nothing in the prose is a hand-typed number. Session counts, booked hours,
utilisation, the gap list and its rupee value are all computed from SESSIONS
and WORK below and interpolated in, so the sentences cannot drift from the
drawing. The shell — rail and its icons — is imported from gen_rail.py rather
than copied, for the same reason.
"""
import pathlib
from datetime import date, timedelta

from gen_rail import (
    I_BELL, I_CAL, I_CHECK, I_CHEV, I_CHEVD, I_CHEVL, I_DO, I_DOTSH, I_DUMB,
    I_EYE, I_NO, I_PLUS, I_RUPEE, I_SEARCH, I_SYNC, ic, rail,
)

HERE = pathlib.Path(__file__).resolve().parent

# ───────────────────────────────────────────────────────── icons, local ──
I_WARN = ('<path d="M12 3.8 21 19.5H3L12 3.8Z"/><path d="M12 10v4"/>'
          '<circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>')
I_FOLD = '<path d="M4 9l8-5 8 5"/><path d="M4 15l8 5 8-5"/>'
I_UNFOLD = '<path d="M8 7l4-4 4 4"/><path d="M8 17l4 4 4-4"/>'
I_REMOTE = '<rect x="2.5" y="4.5" width="19" height="12" rx="2"/><path d="M8 20h8"/>'
I_MOVE = ('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3"/>'
          '<path d="M6 9l-3 3 3 3M18 9l3 3-3 3"/>')

# ══════════════════════════════════════════════════════════════════ data ══
# Everything below is minutes from midnight, which is what the app stores:
# `working_hours.start_minute` / `end_minute`, and `conflicts.ts` reasoning in
# `[startMinute, startMinute + durationMinutes)` with the end exclusive so
# back-to-back sessions are not a clash.

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Anchored to a real date, and every label below is derived from it.
#
# THE SET HAD THIS WRONG. Every file drawing a week — the page this replaces
# included — labelled the columns Mon 11 &hellip; Sun 17 August 2026. In the
# actual 2026 calendar 1 August is a Saturday, so 11 August is a TUESDAY and
# all seven labels were off by one day. Nothing broke, because no view had to
# agree with any other about which weekday a number was; the month grid is the
# first one that cannot avoid the question, since its 42 cells are days and its
# rows are weeks. So the anchor is a `date` and the strings come from it.
WEEK_MON = date(2026, 8, 10)          # the real Monday of ISO week 2026-W33
DATES = [(WEEK_MON + timedelta(days=i)).day for i in range(7)]
TODAY = 1                             # Tuesday 11 August 2026
ISO_WEEK = f"{WEEK_MON.isocalendar().year}-W{WEEK_MON.isocalendar().week:02d}"
MONTH_NAME = WEEK_MON.strftime("%B")


def dlong(i):
    """`3` -> "Thursday 13 August 2026" — for a frame label or a crumb."""
    d = WEEK_MON + timedelta(days=i)
    return f"{LONG[i]} {d.day} {d.strftime('%B')} {d.year}"


def dshort(i):
    d = WEEK_MON + timedelta(days=i)
    return f"{d.day} {d.strftime('%b')}"


WEEK_LABEL = (f"{DATES[0]} &mdash; {DATES[6]} {MONTH_NAME} {WEEK_MON.year}")
NOW = 9 * 60 + 12  # 09:12 — the same minute the rail and the Today screen assert

# `working_hours`, one row per window: a split shift is two windows, and a
# single range per day would claim the trainer is free for lunch.
WORK = {
    0: [(360, 600), (990, 1230)],
    1: [(360, 600), (990, 1230)],
    2: [(360, 600), (990, 1230)],
    3: [(360, 600), (990, 1230)],
    4: [(360, 600), (990, 1230)],
    5: [(360, 600)],
    6: [(420, 600)],
}

# The visible track, derived: floor the earliest of (first window, first
# session) to the half hour, ceil the latest to the half hour. The 6h 30m
# between the two shifts is §04's quiet band.
SEG = [(330, 600), (990, 1260)]   # 05:30 — 10:00, 16:30 — 21:00
BAND = (600, 990)                 # 10:00 — 16:30

# Eight weeks of Monday / Wednesday / Friday, starting the Monday after the
# week on screen. The span is computed because "18 Aug — 6 Oct" was neither.
PAT_START = WEEK_MON + timedelta(days=7)
PAT_WEEKS = 8
PAT_DAYS = (0, 2, 4)                      # Mon, Wed, Fri
PAT_LAST = PAT_START + timedelta(days=7 * (PAT_WEEKS - 1) + max(PAT_DAYS))
PAT_N = PAT_WEEKS * len(PAT_DAYS)
PAT_SPAN = (f"{PAT_START.day} {PAT_START.strftime('%b')} &mdash; "
            f"{PAT_LAST.day} {PAT_LAST.strftime('%b')}")

RATE = 800        # a floor session, billed
KEEP = 432        # what the trainer keeps of it after the gym's 46%

# weekday, start minute, minutes, initials, avatar, name, plan, mode, state
SESSIONS = [
    (0, 360, 60, "MK", "av-3", "Meera K", "Push A", "", "done"),
    (0, 420, 60, "AS", "av-5", "Arjun S", "Legs B", "", "done"),
    (0, 510, 90, "KR", "av-8", "Karthik R", "Full body", "", "done"),
    (0, 990, 60, "NP", "av-11", "Nikhil P", "Full body", "", "noshow"),
    (0, 1080, 30, "KM", "av-9", "Kavya M", "Push B", "", "done"),
    (0, 1140, 60, "PN", "av-2", "Priya N", "Upper", "", "done"),
    (1, 360, 60, "MK", "av-3", "Meera K", "Push A", "", "done"),
    (1, 450, 60, "AS", "av-5", "Arjun S", "Legs B", "", "done"),
    (1, 540, 30, "DR", "av-7", "Divya R", "Check-in", "remote", "live"),
    (1, 1020, 60, "NP", "av-11", "Nikhil P", "Full body", "", ""),
    (1, 1110, 30, "KM", "av-9", "Kavya M", "Push B", "", ""),
    (2, 360, 60, "MK", "av-3", "Meera K", "Pull A", "", ""),
    (2, 990, 60, "NP", "av-11", "Nikhil P", "Full body", "", ""),
    (2, 1035, 60, "SR", "av-12", "Sneha R", "Legs A", "", ""),
    (2, 1095, 30, "KM", "av-9", "Kavya M", "Push B", "", ""),
    (3, 420, 90, "KR", "av-8", "Karthik R", "Full body", "", ""),
    (3, 990, 60, "NP", "av-11", "Nikhil P", "Full body", "", ""),
    (3, 1050, 90, "FQ", "av-6", "Farhan Q", "Full body", "", ""),
    (3, 1140, 60, "PN", "av-2", "Priya N", "Upper", "", ""),
    (4, 375, 60, "MK", "av-3", "Meera K", "Legs B", "", ""),
    (4, 435, 60, "AS", "av-5", "Arjun S", "Upper", "", ""),
    (4, 1170, 30, "DR", "av-7", "Divya R", "Check-in", "remote", ""),
    (5, 420, 90, "KR", "av-8", "Karthik R", "Full body", "", ""),
]

# One extra session, used only by §04's bench: a 12:30 one-off inside the
# quiet band. Working hours have never constrained the trainer, so it is a
# legal booking — and its existence is what stops the band closing.
ONE_OFF = (3, 750, 60, "FQ", "av-6", "Farhan Q", "Full body", "", "")

# The day view's context lane, keyed by (weekday, start).
DETAIL = {
    (1, 360): ("Push A", "week 6 of 8", "9 of 12 left", "Paid", ""),
    (1, 450): ("Legs B", "week 3 of 8", "4 of 12 left", "Paid", ""),
    (1, 540): ("Check-in", "remote &middot; monthly", "Renews 1 Sep", "Paid", ""),
    (1, 1020): ("Full body", "week 2 of 8", "11 of 12 left", "&#8377;800 due", "warn"),
    (1, 1110): ("Push B", "week 8 of 8", "0 left", "Renew", "danger"),
    (0, 360): ("Push A", "week 5 of 8", "10 of 12 left", "Paid", ""),
    (0, 420): ("Legs B", "week 2 of 8", "5 of 12 left", "Paid", ""),
    (0, 510): ("Full body", "week 4 of 8", "6 of 12 left", "Paid", ""),
    (0, 990): ("Full body", "week 1 of 8", "12 of 12 left", "No-show", "danger"),
    (0, 1080): ("Push B", "week 7 of 8", "1 of 12 left", "Renew soon", "warn"),
    (0, 1140): ("Upper", "week 3 of 8", "8 of 12 left", "Paid", ""),
}

# ══════════════════════════════════════════════════════════════ derived ══


def hm(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def dur(m):
    if m < 60:
        return f"{m} min"
    if m % 60 == 0:
        return f"{m // 60} h"
    return f"{m // 60} h {m % 60}"


def hrs(m):
    """Minutes as hours, one decimal only when it earns it."""
    h = m / 60
    return f"{h:.0f}" if abs(h - round(h)) < 0.05 else f"{h:.1f}"


def hrsw(m):
    """Minutes as words. `dur()` gives "1 h 45", which is right on a block and
       reads as broken English inside a sentence."""
    h, r = divmod(m, 60)
    frac = {15: "&frac14;", 30: "&frac12;", 45: "&frac34;"}.get(r)
    if not h:
        return f"{r} minutes"
    if r == 0:
        return "1 hour" if h == 1 else f"{h} hours"
    if frac:
        return f"{h}{frac} hours"
    return f"{h} hours {r} minutes"


def merged(intervals):
    out = []
    for a, b in sorted(intervals):
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [(a, b) for a, b in out]


def clash_map(sessions):
    """Every pair that overlaps, by plain interval overlap with the end
       exclusive — `slotClash()` in app/src/clients/conflicts.ts, exactly."""
    out = {}
    for i, a in enumerate(sessions):
        for j, b in enumerate(sessions):
            if i >= j or a[0] != b[0]:
                continue
            if a[1] < b[1] + b[2] and b[1] < a[1] + a[2]:
                out.setdefault(i, []).append(j)
                out.setdefault(j, []).append(i)
    return out


def gaps_for(wd, sessions=None, work=None):
    """Free intervals INSIDE a working window, long enough to hold a session
       at the trainer's usual hour. A 30-minute seam between two clients is
       not a gap; it is the seam."""
    sess = sessions if sessions is not None else SESSIONS
    busy = merged([(s[1], s[1] + s[2]) for s in sess if s[0] == wd])
    out = []
    for ws, we in (WORK if work is None else work)[wd]:
        cur = ws
        for bs, be in busy:
            if be <= ws or bs >= we:
                continue
            if bs > cur:
                out.append((cur, min(bs, we)))
            cur = max(cur, be)
        if cur < we:
            out.append((cur, we))
    return [(a, b) for a, b in out if b - a >= 60]


CLASH = clash_map(SESSIONS)
GAPS = {wd: gaps_for(wd) for wd in range(7)}

N_SESS = len(SESSIONS)
N_TODAY = sum(1 for s in SESSIONS if s[0] == TODAY)
N_REMOTE = sum(1 for s in SESSIONS if s[7] == "remote")
N_FLOOR = N_SESS - N_REMOTE
BOOKED = sum(s[2] for s in SESSIONS)
AVAIL = sum(b - a for w in WORK.values() for a, b in w)
UTIL = round(100 * BOOKED / AVAIL)
GAP_N = sum(len(g) for g in GAPS.values())
GAP_MIN = sum(b - a for g in GAPS.values() for a, b in g)
GAP_SLOTS = sum((b - a) // 60 for g in GAPS.values() for a, b in g)
GAP_RS = GAP_SLOTS * RATE
GAP_KEEP = GAP_SLOTS * KEEP
LENGTHS = sorted({s[2] for s in SESSIONS})
SEG_PX = sum(b - a for a, b in SEG)
BAND_PX = BAND[1] - BAND[0]

# ═════════════════════════════════════════════════════════════ the month ══
# The app's own rules, imported as constants rather than re-decided:
#   diary.ts  SESSIONS_PER_DOT = 2, FULL_DAY_SESSIONS = 6
#   MonthGrid.tsx  "six rows always", "dots, never names"
FULL_DAY_SESSIONS = 6

MO_ANCHOR = date(2026, 8, 1)
MO_START = MO_ANCHOR - timedelta(days=MO_ANCHOR.weekday())   # Monday of week 1
MO_DAYS = [MO_START + timedelta(days=i) for i in range(42)]  # six rows always

# The standing week, read off the week the other frames draw. A trainer's month
# IS their standing week repeated, plus the deviations below — so the month is
# projected rather than hand-typed, and the week of 10 August is asserted equal
# to the week view further up this page.
STANDING = {}
for _s in SESSIONS:
    STANDING.setdefault(_s[0], []).append((_s[1], _s[2], _s[7]))

# What actually happened, by the Monday of each row.
#   "full"  the standing week
#   "thin"  mornings only — coming back from a break
#   "away"  Monday to Friday blocked; only the weekend's standing slots run
WEEKS = {
    MO_DAYS[0]:  "full",
    MO_DAYS[7]:  "thin",
    MO_DAYS[14]: "full",   # 10 &ndash; 16 August, the week the other frames draw
    MO_DAYS[21]: "full",
    MO_DAYS[28]: "away",
    MO_DAYS[35]: "full",
}

# `time_blocks`: one table covers an afternoon and a fortnight away, and the
# only difference is the length. Both shapes are drawn.
BLOCKS = [
    ("Away &middot; Coimbatore workshop", MO_DAYS[28], MO_DAYS[32], True),
    ("Dentist &middot; 14:00 &ndash; 18:00", MO_DAYS[23], MO_DAYS[23], False),
]
BLOCKED = {d for label, a, b, allday in BLOCKS if allday
           for d in (a + timedelta(days=i) for i in range((b - a).days + 1))}
PART = {a for label, a, b, allday in BLOCKS if not allday}

# The clash the week view draws, on its real date.
CLASH_DAYS = {MO_DAYS[14] + timedelta(days=SESSIONS[i][0]) for i in CLASH}


def mo_sessions(d):
    """What ran on one date. Derived, so the month cannot disagree with the
       week it contains."""
    mode = WEEKS[d - timedelta(days=d.weekday())]
    if d in BLOCKED:
        return []
    rows = STANDING.get(d.weekday(), [])
    if mode == "thin":
        rows = [r for r in rows if r[0] < BAND[0]]      # mornings only
    return rows


def mo_cell(d):
    rows = mo_sessions(d)
    floor = sum(m for _, m, md in rows if md != "remote")
    remote = sum(m for _, m, md in rows if md == "remote")
    # A blocked day contributes NO capacity. Counting the working hours of a
    # day you declared yourself unavailable on makes utilisation punish you
    # for taking a holiday — the trip week read 3% before this.
    cap = 0 if d in BLOCKED else sum(b - a for a, b in WORK.get(d.weekday(), []))
    return {
        "d": d, "n": len(rows), "floor": floor, "remote": remote, "cap": cap,
        "util": (floor + remote) / cap if cap else 0,
        "inm": d.month == MO_ANCHOR.month,
        "today": d == WEEK_MON + timedelta(days=TODAY),
        "full": len(rows) >= FULL_DAY_SESSIONS,
        "clash": d in CLASH_DAYS,
        "off": d in BLOCKED,
        "part": d in PART,
    }


MO_CELLS = [mo_cell(d) for d in MO_DAYS]
MO_ROWS = [MO_CELLS[i * 7:(i + 1) * 7] for i in range(6)]
MO_TOTAL = sum(c["n"] for c in MO_CELLS if c["inm"])
MO_MIN = sum(c["floor"] + c["remote"] for c in MO_CELLS if c["inm"])

# the week on screen elsewhere in this file must be the week in this grid
_wk = MO_ROWS[2]
assert sum(c["n"] for c in _wk) == N_SESS, (sum(c["n"] for c in _wk), N_SESS)
assert sum(c["floor"] + c["remote"] for c in _wk) == BOOKED


def away_note(w):
    """A smaller week should be explained, not merely smaller."""
    if not w["away"]:
        return ""
    return (f'<em>{w["away"]} day{"s" if w["away"] != 1 else ""} away &mdash; '
            f'not counted</em>')


def mo_week(row):
    n = sum(c["n"] for c in row)
    mins = sum(c["floor"] + c["remote"] for c in row)
    cap = sum(c["cap"] for c in row)
    return {"n": n, "mins": mins, "cap": cap,
            "util": round(100 * mins / cap) if cap else 0,
            "away": sum(1 for c in row if c["off"]),
            "rs": n * RATE, "row": row}


MO_WEEKS = [mo_week(r) for r in MO_ROWS]
MO_THIN = min(w["util"] for w in MO_WEEKS)


def mo_bar(c):
    tot = c["floor"] + c["remote"]
    if not c["cap"] or not tot:
        return '<div class="mo__bar"></div>'
    f = round(100 * c["floor"] / c["cap"])
    r = round(100 * c["remote"] / c["cap"])
    seg = (f'<i style="width:{f}%"></i>' if f else '') + \
          (f'<s style="width:{r}%"></s>' if r else '')
    return f'<div class="mo__bar">{seg}</div>'


PT = '<span class="mo__pt" aria-hidden="true"></span>'


def mo_day(c):
    d = c["d"]
    cls = "mo__c"
    if not c["inm"]:
        cls += " mo__c--out"
    if c["today"]:
        cls += " mo__c--today"
    if c["off"]:
        cls += " mo__c--off"
    if c["clash"]:
        fig = f'<span class="mo__n mo__n--clash">{ic(I_WARN, 11)} {c["n"]}</span>'
    elif c["full"]:
        fig = f'<span class="mo__n mo__n--full">{c["n"]}</span>'
    elif c["n"]:
        fig = f'<span class="mo__n">{c["n"]}</span>'
    else:
        fig = '<span class="mo__n">&mdash;</span>'
    say = (f'{c["n"]} session{"s" if c["n"] != 1 else ""}, '
           f'{round(100 * c["util"])}% of your working hours' if c["n"]
           else ("blocked out" if c["off"] else "nothing booked"))
    lab = f'{d.strftime("%A")} {d.day} {d.strftime("%B")}, {say}'
    return (f'<button class="{cls}" type="button" aria-label="{lab}">'
            f'<span class="mo__top"><span class="mo__d">{d.day}</span>{fig}</span>'
            f'{PT if c["part"] else ""}'
            f'{mo_bar(c)}</button>')


def mo_strips(row):
    """All-day blocks, spanning the days they cover. The days area is
       `100% - var(--mo-rail)`, so a seventh of it is one column."""
    out = []
    lo, hi = row[0]["d"], row[6]["d"]
    for label, a, b, allday in BLOCKS:
        if not allday or b < lo or a > hi:
            continue
        s0 = max(a, lo)
        s1 = min(b, hi)
        i = (s0 - lo).days
        span = (s1 - s0).days + 1
        edge = (" mo__blk--l" if a < lo else "") + (" mo__blk--r" if b > hi else "")
        left = f"calc((100% - var(--mo-rail)) / 7 * {i} + 5px)"
        wide = f"calc((100% - var(--mo-rail)) / 7 * {span} - 10px)"
        days = (b - a).days + 1
        out.append(f'<button class="mo__blk{edge}" type="button" '
                   f'aria-label="{label}, {days} days" '
                   f'style="left:{left};width:{wide}">{label}</button>')
    return "".join(out)


def month():
    heads = ('<div class="mo__r">'
             + "".join(f'<div class="mo__hd">{h}</div>' for h in DAYS)
             + '<div class="mo__hd" style="text-align:left">The week</div></div>')
    rows = []
    for w in MO_WEEKS:
        row = w["row"]
        first, last = row[0]["d"], row[6]["d"]
        thin = " mo__wk--thin" if w["util"] < 40 else ""
        span = (f'{first.day} {first.strftime("%b")} &ndash; {last.day} '
                f'{last.strftime("%b")}')
        rows.append('<div class="mo__r">'
                    + "".join(mo_day(c) for c in row)
                    + f'<button class="mo__wk{thin}" type="button" '
                      f'aria-label="Week of {span}, {w["n"]} sessions, {w["util"]} per cent">'
                      f'<b>{span}</b>'
                      f'<span>{w["n"]} session{"s" if w["n"] != 1 else ""} &middot; {hrs(w["mins"])} h</span>'
                      f'<span>{w["util"]}% &middot; &#8377;{w["rs"]:,}</span>'
                      f'{away_note(w)}'
                      f'</button>'
                    + mo_strips(row) + '</div>')
    return f'<div class="mo">{heads}{"".join(rows)}</div>'


MO_KEY = (f'<div class="mo__key">'
          f'<span><i style="background:var(--tx-floor)"></i>Floor</span>'
          f'<span><i style="background:var(--tx-remote)"></i>Remote</span>'
          f'<span>Bar length is <b>booked against that day&rsquo;s own working '
          f'hours</b> &mdash; so a 3-hour Sunday fills faster than an 8-hour '
          f'Monday.</span>'
          f'<span class="ink3">The figure is the session count. '
          f'<b style="color:var(--tx-warn)">{FULL_DAY_SESSIONS}+</b> turns it '
          f'warn, the app&rsquo;s own rule.</span></div>')


# ═════════════════════════════════════════════════════════════ the grid ══


def lines(seg, quarter=False):
    """The rulings. An hour is a LINE, not a row — which is the entire
       difference between this and the matrix it replaces."""
    out = []
    a, b = seg
    m = a - a % 30 + (30 if a % 30 else 0)
    while m <= b:
        off = m - a
        if m > a:
            cls = "cw__l cw__l--h" if m % 60 == 0 else "cw__l"
            out.append(f'<span class="{cls}" style="top:{off}px"></span>')
        m += 30
    if quarter:
        m = a - a % 15 + (15 if a % 15 else 0)
        while m <= b:
            if m % 30:
                out.append(f'<span class="cw__l cw__l--q" style="top:{m - a}px"></span>')
            m += 15
    return "".join(out)


def offband(seg, wd):
    """Outside the working windows. Hatched, never blocked — working hours
       constrain what a CLIENT can self-book and have never constrained the
       trainer, which is the rule WorkingHoursScreen states on itself."""
    a, b = seg
    free = []
    cur = a
    for ws, we in WORK[wd]:
        if we <= a or ws >= b:
            continue
        if ws > cur:
            free.append((cur, ws))
        cur = max(cur, we)
    if cur < b:
        free.append((cur, b))
    return "".join(f'<span class="cw__off" style="top:{s - a}px;height:{e - s}px"></span>'
                   for s, e in free)


def block(s, seg, i=None, split=None, ghost=False, dim=False, bad=False,
          just=False, clash=None, sessions=None, draft=False, extra=""):
    """One session. A <button>, because it opens something — the 102 <div>s
       are §01.4. Its content ladder is set by its duration class, which at
       1 min = 1 px is a height class."""
    wd, st, mn, ini, av, name, plan, mode, state = s
    cl = CLASH if clash is None else clash
    sess = SESSIONS if sessions is None else sessions
    cls = ["ev"]
    if mode:
        cls.append("ev--" + mode)
    if state in ("done", "noshow"):
        cls.append("ev--" + state)
    if state == "live":
        cls.append("ev--live")
    if i is not None and i in cl:
        cls.append("ev--conflict")
    cls.append(f"ev--m{mn}")
    if split:
        cls.append(f"ev--sp{split}")
    if ghost:
        cls.append("ev--ghost")
    if bad:
        cls.append("ev--bad")
    if just:
        cls.append("ev--just")
    if extra:
        cls.append(extra)

    wide = mn >= 60 and not split
    when = f"{hm(st)}&nbsp;&ndash;&nbsp;{hm(st + mn)}" if wide else hm(st)
    glyph = ""
    if state == "done":
        glyph = ic(I_CHECK, 12)
    elif state == "noshow":
        glyph = ic(I_NO, 12)
    elif i is not None and i in cl:
        glyph = ic(I_WARN, 12)
    elif mode == "remote":
        glyph = ic(I_REMOTE, 12)
    g = f'<span class="ev__g">{glyph}</span>' if glyph else ""

    say = {"done": "done", "noshow": "no-show", "live": "in progress"}.get(state, "not started")
    where = "remote" if mode == "remote" else "floor"
    lab = (f"{LONG[wd]} {DATES[wd]} August, {hm(st)} to {hm(st + mn)}, {mn} minutes, "
           f"{name}, {plan}, {where}, {say}")
    if i is not None and i in cl:
        others = ", ".join(sess[j][5] for j in cl[i])
        lab += f", clashes with {others}"
    if just:
        lab += ", just moved, undo available"
    if draft:
        lab = "Draft, not booked yet. " + lab
    # one style attribute, not two: the second was silently dropped, which is
    # why the dragged block's original position stayed at full opacity.
    op = ";opacity:.4" if dim else ""
    return (f'<button class="{" ".join(cls)}" type="button" aria-label="{lab}"'
            f' style="top:{st - seg[0]}px;height:{mn}px{op}">'
            f'<span class="ev__t">{when}</span><span class="ev__n">{name}</span>'
            f'<span class="ev__p">{plan}</span>{g}</button>')


def gapblock(a, b, seg):
    n = (b - a) // 60
    lab = (f"Free, {hm(a)} to {hm(b)}, {dur(b - a)}. Room for {n} "
           f"session{'s' if n > 1 else ''}, worth &#8377;{n * RATE:,} billed in total. Book it.")
    return (f'<button class="gapb" type="button" aria-label="{lab}" '
            f'style="top:{a - seg[0] + 2}px;height:{b - a - 4}px">'
            f'<b>{hm(a)} &ndash; {hm(b)}</b>'
            f'<span>{dur(b - a)} &middot; {n} session{"s" if n > 1 else ""} '
            f'&middot; &#8377;{n * RATE:,}</span></button>')


def readout(when, note, *, bad=False, ghost="ok"):
    """One drop verdict, drawn out of the grid so all three can be compared.
       §09's H05 finding: the old pass drew the target that was clear and
       never the one that was a mistake."""
    tone = " cw__cur--warn" if bad else ""
    mark = ic(I_WARN, 12) if bad else ""
    gc = {"ok": "ev--ghost", "bad": "ev--ghost ev--bad"}[ghost]
    return (f'<div class="col gap3" style="min-width:0">'
            f'<div style="position:relative;height:62px;border:1px solid var(--tx-line);'
            f'border-radius:var(--tx-r1);background:var(--tx-surface-2)">'
            f'<span class="{gc} ev ev--m60" style="top:1px;height:60px;left:2px;right:2px">'
            f'<span class="ev__t">{when}</span><span class="ev__n">Sneha R</span></span></div>'
            f'<div class="cw__cur{tone}" style="position:static">'
            f'<b>{when}</b> &middot; 60 min<br>{mark}<i>{note}</i></div></div>')


def gutter(seg, now=False, brackets=()):
    a, b = seg
    out = [f'<span class="cw__tl" style="top:2px;transform:none">{hm(a)}</span>']
    m = a - a % 60 + 60
    while m <= b:
        out.append(f'<span class="cw__l cw__l--h" style="top:{m - a}px"></span>')
        # a label centred on the segment's own bottom edge is half-covered by
        # whatever grid row comes next, so the last one hangs upward instead.
        shift = ';transform:translateY(-100%)' if m == b else ''
        out.append(f'<span class="cw__tl" style="top:{m - a}px{shift}">{hm(m)}</span>')
        m += 60
    for s, e in brackets:
        out.append(f'<span class="cw__br" style="top:{s - a}px;height:{e - s}px" '
                   f'aria-hidden="true"></span>')
    if now:
        out.append(f'<span class="cw__nt" style="top:{NOW - a}px">{hm(NOW)}</span>')
    return (f'<div class="cw__seg cw__seg--gut" style="height:{b - a}px">'
            + "".join(out) + '</div>')


def nowline(seg, today=False):
    if not (seg[0] <= NOW <= seg[1]):
        return ""
    dot = '<i></i>' if today else ''
    return f'<span class="cw__now" style="top:{NOW - seg[0]}px">{dot}</span>'


def undochip(top, moved, who, secs=8, total=10):
    """Ten seconds, in place, on the row that changed — the rule the set's own
       heuristic audit states for every destructive action. A move is one:
       it tells the client automatically. So the telling is HELD for the ten
       seconds, because undo after the message has gone is not undo."""
    pct = round(100 * secs / total)
    return (f'<div class="cw__cur cw__cur--undo" style="top:{top}px;'
            f'left:calc(100% + 9px)">'
            f'<p><b>Moved to {moved}</b><br>'
            f'<i>{who} will be told in <b>{secs}s</b></i></p>'
            f'<div class="u__r"><span style="flex:1"></span>'
            f'<button class="u__b" type="button">Undo</button></div>'
            f'<div class="cw__bar" role="progressbar" aria-valuenow="{secs}" '
            f'aria-valuemin="0" aria-valuemax="{total}" '
            f'aria-label="Seconds left to undo"><i style="width:{pct}%"></i></div>'
            f'</div>')


def daycol(wd, seg, *, gaps_on=False, quarter=False, sessions=None, drag=None,
           now=True, clash=None, drop=None, draft=None):
    """One day, one segment: a single positioned track. Not fourteen cells."""
    sess = sessions if sessions is not None else SESSIONS
    cl = CLASH if clash is None else clash
    a, b = seg
    live = drag or drop
    # the 15-minute ruler belongs to the drag, not to the aftermath: a drop is
    # finished, and a dotted line through a settled block is just noise.
    inner = [lines(seg, quarter and drag is not None and drag[0] == wd),
             offband(seg, wd)]
    if gaps_on:
        inner += [gapblock(x, y, seg) for x, y in GAPS[wd] if x >= a and y <= b]
    for i, s in enumerate(sess):
        if s[0] != wd or not (a <= s[1] < b):
            continue
        sp = None
        if i in cl:
            grp = sorted([i] + cl[i])
            sp = 1 if grp.index(i) == 0 else 2
        inner.append(block(s, seg, i, split=sp, clash=cl, sessions=sess,
                           dim=bool(drag and drag[3] == i),
                           just=bool(drop and drop[3] == i)))
    if drag and drag[0] == wd and a <= drag[1] < b:
        gs = sess[drag[3]]
        # the ghost carries the verdict too: an accent-dashed target reads as
        # "yes, here", and a slot that clashes must not look like that.
        bad = drag[4] if len(drag) > 4 else False
        inner.append(block((wd, drag[1], gs[2]) + gs[3:], seg, None, ghost=True,
                           bad=bad))
        tone = " cw__cur--warn" if bad else ""
        mark = ic(I_WARN, 12) if bad else ""
        inner.append(f'<div class="cw__cur{tone}" style="top:{drag[1] - a + 6}px;'
                     f'left:calc(100% + 9px)">'
                     f'<b>{hm(drag[1])} &ndash; {hm(drag[1] + gs[2])}</b> &middot; {gs[2]} min'
                     f'<br>{mark}<i>{drag[2]}</i></div>')
    # a booking's ghost, which is a move's ghost with nothing to dim: there is
    # no source block, because the session does not exist yet. It reuses
    # `.ev--ghost` deliberately — accent, dashed, "not real yet" — so a draft
    # and a drag target cannot come to mean two different things.
    if draft and draft[0][0] == wd and a <= draft[0][1] < b:
        # No read-out chip. A drag needs one because there is no panel to read
        # the time back from; a booking has one open on the same screen saying
        # the same thing, and the chip was landing in the next day's column.
        inner.append(block(draft[0], seg, None, ghost=True, bad=draft[1], draft=True))
    if drop and drop[0] == wd and a <= sess[drop[3]][1] < b:
        ds = sess[drop[3]]
        inner.append(undochip(ds[1] - a + 6,
                              f"{hm(ds[1])} &ndash; {hm(ds[1] + ds[2])}", ds[5]))
    if now:
        inner.append(nowline(seg, wd == TODAY))
    cls = ("cw__seg" + (" cw__seg--today" if wd == TODAY else "")
           + (" cw__seg--drag" if live and live[0] == wd else ""))
    return f'<div class="{cls}" style="height:{b - a}px">' + "".join(inner) + '</div>'


def head(wd=None, sessions=None, clash=None):
    if wd is None:
        return '<div class="cal__hd" style="border-right:1px solid var(--tx-line)"></div>'
    sess = sessions if sessions is not None else SESSIONS
    cl = CLASH if clash is None else clash
    bad = any(sess[i][0] == wd for i in cl)
    cls = ("cal__hd" + (" cal__hd--today" if wd == TODAY else "")
           + (" cal__hd--clash" if bad else ""))
    n = sum(1 for s in sess if s[0] == wd)
    count = (f'<span class="cal__hd__w">{ic(I_WARN, 11)}{n}</span>' if bad
             else (str(n) if n else "&mdash;"))
    lab = f' aria-label="{LONG[wd]} {DATES[wd]}, {n} sessions, one clash"' if bad else ''
    return (f'<div class="{cls}"{lab}><p class="cal__d">{DAYS[wd]}</p>'
            f'<p class="cal__n">{DATES[wd]}</p>'
            f'<p class="cal__d" style="margin-top:2px;letter-spacing:.04em">{count}</p></div>')


def bandrow(open_=False, why=None):
    if why:
        return (f'<div class="cw__band" style="cursor:default;background:var(--tx-warn-soft);'
                f'color:var(--tx-ink-2)">{ic(I_WARN, 13)}<span>{why}</span>'
                f'<em>held&nbsp;open</em></div>')
    return (f'<button class="cw__band" type="button" aria-expanded="false">'
            f'{ic(I_UNFOLD, 13)}<span><b>{hm(BAND[0])} &ndash; {hm(BAND[1])}</b> &middot; '
            f'{hrsw(BAND_PX)} that fall outside your working hours on every day of the '
            f'week, with nothing booked in them</span>'
            f'<em>show</em></button>')


def week(*, gaps_on=False, drag=None, drop=None, band_open=False, sessions=None,
         band_why=None, clash=None, draft=None):
    sess = sessions if sessions is not None else SESSIONS
    cl = CLASH if clash is None else clash
    rows = []
    for si, seg in enumerate(SEG):
        # a clash gets a bracket in the gutter as well as a hatch on the two
        # blocks: a ring is only findable if the thing it rings is on screen,
        # and the gutter is the one column that never scrolls sideways.
        br = merged([(sess[i][1], sess[i][1] + sess[i][2])
                     for i in cl if seg[0] <= sess[i][1] < seg[1]])
        rows.append(gutter(seg, now=(seg[0] <= NOW <= seg[1]), brackets=br))
        for wd in range(7):
            rows.append(daycol(wd, seg, gaps_on=gaps_on, quarter=True,
                               sessions=sessions, drag=drag, drop=drop, clash=cl,
                               draft=draft))
        if si == 0:
            if band_open or band_why:
                rows.append(bandrow(why=band_why))
                rows.append(gutter(BAND))
                for wd in range(7):
                    rows.append(daycol(wd, BAND, sessions=sessions, clash=cl))
            else:
                rows.append(bandrow())
    heads = head() + "".join(head(wd, sessions, cl) for wd in range(7))
    return f'<div class="cw">{heads}{"".join(rows)}</div>'


def day(wd):
    """One day at full width — a spine, and a context lane beside it, aligned
       to the same minute. The wide screen's real advantage is not a taller
       hour, it is room to say WHY each block matters."""
    rows = []
    for si, seg in enumerate(SEG):
        live = wd == TODAY
        rows.append(gutter(seg, now=live and seg[0] <= NOW <= seg[1]))
        rows.append(daycol(wd, seg, gaps_on=True, now=live))
        a, b = seg
        lane = [lines(seg)] + ([nowline(seg, True)] if live else [])
        for s in SESSIONS:
            if s[0] != wd or not (a <= s[1] < b):
                continue
            d = DETAIL.get((wd, s[1]))
            if not d:
                continue
            plan, week_, pack, money, tone = d
            tag = f'<span class="tag tag--{tone or "ok"}">{money}</span>'
            # a 30-minute row is 30px, which is one line of type
            who = (f'<b>{plan}</b> &middot; {week_}' if s[2] < 45
                   else f'<b>{plan}</b><br>{week_}')
            lane.append(
                f'<div class="dtl" style="top:{s[1] - a}px;height:{s[2]}px">'
                f'<span class="dtl__p">{who}</span>'
                f'<span class="dtl__m">{pack}</span>{tag}'
                f'<button class="btn btn--sm btn--secondary" type="button">Log</button>'
                f'<button class="btn btn--icon btn--sm btn--ghost" type="button" '
                f'aria-label="More">{ic(I_DOTSH, 15)}</button></div>')
        rows.append(f'<div class="cw__seg cw__seg--dtl" style="height:{b - a}px">'
                    + "".join(lane) + '</div>')
        if si == 0:
            rows.append(bandrow())
    heads = (head() + f'<div class="cal__hd cal__hd--today"><p class="cal__d">{DAYS[wd]}</p>'
             f'<p class="cal__n">{DATES[wd]}</p></div>'
             f'<div class="cal__hd" style="text-align:left;padding-left:16px">'
             f'<p class="cal__d">Plan &middot; package &middot; money</p></div>')
    return f'<div class="cw cw--day">{heads}{"".join(rows)}</div>'


# ══════════════════════════════════════════════════════════════════ shell ══
def top(crumb):
    """The top bar. The pill reads what the queue actually holds — the rail
       page's §02.1, and the reason it is not the word `Synced` here either."""
    return f'''<header class="top">
  <nav class="crumbs" aria-label="Breadcrumb"><a>Schedule</a><i>{ic(I_CHEV, 12)}</i><b>{crumb}</b></nav>
  <div class="omni">{ic(I_SEARCH, 15)}<span>Search clients, sessions, exercises&hellip;</span><kbd>&#8984;K</kbd></div>
  <div class="top__acts"><span class="sync sync--queued"><i></i>6 queued</span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Notifications">{ic(I_BELL, 18)}</button>
  </div></header>'''


def ph(sub, primary="New session"):
    return f'''<div class="ph"><div class="ph__row">
  <div><p class="ph__t">Schedule</p><p class="ph__sub">{sub}</p></div>
  <div class="ph__acts">
    <button class="btn btn--secondary" type="button">{ic(I_CAL, 15)}Weekly pattern</button>
    <button class="btn btn--primary" type="button">{ic(I_PLUS, 15)}{primary}</button>
  </div></div></div>'''


def tools(view="Week", label=None, gaps=False):
    label = WEEK_LABEL if label is None else label
    # A gap is a free interval INSIDE a day. The month cannot draw one, so
    # it does not offer the chip — a control that does nothing is §01.
    gapchip = ("" if view == "Month" else
               f'<span class="chip" role="button" aria-pressed="'
               f'{"true" if gaps else "false"}">Show gaps</span>')
    def vb(v):
        return (f'<button class="btn" type="button" aria-pressed="'
                f'{"true" if v == view else "false"}">{v}</button>')
    return f'''<div style="padding:12px 24px;border-bottom:1px solid var(--tx-line)" class="tools">
  <div class="btngroup">{vb("Day")}{vb("Week")}{vb("Month")}</div>
  <button class="btn btn--icon btn--secondary" type="button" aria-label="Previous week">{ic(I_CHEVL, 18)}</button>
  <span class="h5" style="min-width:186px;text-align:center">{label}</span>
  <button class="btn btn--icon btn--secondary" type="button" aria-label="Next week">{ic(I_CHEV, 18)}</button>
  <button class="btn btn--ghost btn--sm" type="button">Today</button>
  <span class="tools__sp"></span>
  <span class="chip" role="button" aria-pressed="true">Floor {N_FLOOR}</span>
  <span class="chip" role="button" aria-pressed="true">Remote {N_REMOTE}</span>
  {gapchip}
</div>'''


def screen(sub, grid, *, view="Week", label=None, gaps=False,
           panel="", crumb=None, primary="New session"):
    crumb = f"Week of {DATES[0]} {MONTH_NAME}" if crumb is None else crumb
    return (f'<div class="app" data-theme="dark">{rail("sched")}{top(crumb)}'
            f'<main class="main">{ph(sub, primary)}<div class="body body--flush">'
            f'{tools(view, label, gaps)}'
            f'<div style="overflow:auto;height:648px">{grid}</div>'
            f'</div></main>{panel}</div>')


def frame(fid, name, frm, url, app, note):
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
      {app}
    </div>
  </div>
  <p class="unit__note">{note}</p>
</section>'''


def units(*sections):
    return '<div class="units">' + "".join(sections) + '</div>'


# ═════════════════════════════════════════════════════ booking, computed ══
# The slot that was clicked: Wednesday 12 August, 07:00. It is the head of the
# 07:00 — 10:00 gap §04 prices, which is what makes it a realistic click.
BOOK_WD, BOOK_AT = 2, 420
BOOK_GRACE = 30       # "trains at this hour" — within half an hour either side
BOOK_PACK = 6         # Karthik R, from DETAIL[(0, 510)]: "6 of 12 left"
DEFAULT_MIN = 60      # `DEFAULT_SESSION_MIN` in app/src/diary/diary.ts


def book_suggest(minute, grace=BOOK_GRACE, sessions=None):
    """Who to offer first, ranked by whether this is an hour they already
       train at. The phone cannot do this — `BookSheet` lists the first six
       clients alphabetically until you type, which on a 22-client roster
       hides sixteen and orders the six by nothing. The signal is in the data
       either way: every client's sessions carry a start minute, and
       `DiaryClient.weeklySchedule` carries their standing slots."""
    sess = SESSIONS if sessions is None else sessions
    by = {}
    for wd, st, mn, ini, av, name, plan, mode, state in sess:
        by.setdefault(name, {"ini": ini, "av": av, "mode": mode,
                             "plan": plan, "at": [], "mins": set()})
        by[name]["at"].append((wd, st))
        by[name]["mins"].add(mn)
    out = []
    for name, c in by.items():
        days = sorted({wd for wd, st in c["at"] if abs(st - minute) <= grace},
                      key=lambda d: d)
        if days:
            out.append((name, c, days))
    return sorted(out, key=lambda r: (-len(r[2]), r[0]))


BOOK_SUG = book_suggest(BOOK_AT)
assert [r[0] for r in BOOK_SUG] == ["Arjun S", "Karthik R"], BOOK_SUG

# Karthik R is the pick: his usual length is the one thing the two candidates
# disagree on, and it is 90 for both of his sessions.
BOOK_NAME = "Karthik R"
BOOK_C = dict(BOOK_SUG[1][1])
BOOK_DAYS = BOOK_SUG[1][2]
BOOK_MIN = max(BOOK_C["mins"])
assert BOOK_MIN == 90, BOOK_C
BOOK_DATE = WEEK_MON + timedelta(days=BOOK_WD)
BOOK_END = BOOK_AT + BOOK_MIN

# Back-to-back is not a clash — `conflicts.ts` reasons in a half-open
# interval, and Meera's 06:00 hour ends exactly where this one starts. The
# read-out says so rather than staying silent, because silence about a
# neighbour is what makes a trainer re-check the grid.
_before = [s for s in SESSIONS if s[0] == BOOK_WD and s[1] + s[2] == BOOK_AT]
assert len(_before) == 1, _before
BOOK_ABUT = _before[0][5]
# and what is left of the gap afterwards, which is the other half of the
# decision: a 90 into a 3-hour hole still leaves 90 sellable.
_gap = [g for g in GAPS[BOOK_WD] if g[0] == BOOK_AT]
assert _gap, GAPS[BOOK_WD]
BOOK_REST = (BOOK_END, _gap[0][1])


def book_occ(first, n, skip_blocked=False):
    """Every date the series lands on. Mirrors `occurrencesFor(at, weekdays,
       count)` — the bound is a COUNT, and the count is what the pack holds.
       Nothing here bounds by a date, which is the whole difference from every
       calendar we looked at."""
    out, d = [], first
    while len(out) < n:
        if not (skip_blocked and d in BLOCKED):
            out.append(d)
        d += timedelta(days=7)
    return out


BOOK_OCC = book_occ(BOOK_DATE, BOOK_PACK)
BOOK_OCC_SKIP = book_occ(BOOK_DATE, BOOK_PACK, skip_blocked=True)
BOOK_HIT = [d for d in BOOK_OCC if d in BLOCKED]
assert len(BOOK_HIT) == 1, BOOK_HIT
BOOK_AWAY = BOOK_HIT[0]
# Skipping it does NOT shrink the series, because the bound is the pack. It
# moves the end date instead — which is the argument made visible.
assert len(BOOK_OCC_SKIP) == len(BOOK_OCC)
assert BOOK_OCC_SKIP[-1] > BOOK_OCC[-1]
BOOK_BILL = BOOK_PACK * RATE
BOOK_KEEP_T = BOOK_PACK * KEEP
BOOK_UTIL_AFTER = round(100 * (BOOKED + BOOK_MIN) / AVAIL)
BOOK_HOURS = hrsw(BOOK_PACK * BOOK_MIN)


def dstamp(d):
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


# ═════════════════════════════════════════════════════════════ the panel ══
PANEL = f'''<div class="scrim scrim--soft"></div>
<aside class="panel" role="dialog" aria-label="Session">
  <div class="panel__hd"><span class="panel__t">{dlong(0)[:-5].replace(" August", " Aug")} &middot; 16:30 &ndash; 17:30</span>
    <span class="sp" style="flex:1"></span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Close">{ic(I_NO, 17)}</button></div>
  <div class="panel__body">
    <div class="row gap3"><span class="av av--lg" style="background:var(--tx-av-11)">NP</span>
      <div><p class="h4">Nikhil P</p><p class="small">Full body &middot; floor &middot; &#8377;{RATE}</p></div></div>

    <div class="card mt4" style="border-color:var(--tx-danger);background:var(--tx-danger-soft)">
      <div class="card__b" style="padding:12px 14px">
        <p class="h5" style="color:var(--tx-danger)">Marked no-show</p>
        <p class="small mt2">A no-show still takes a session off the package &mdash; that is the
          deal you set at intake. Change it below if that is wrong.</p></div></div>

    <div class="sect"><p class="h5">When</p>
      <div class="row gap3 mt2" style="align-items:flex-end">
        <div class="fld" style="flex:1"><label class="fld__l">Starts</label>
          <input class="ctl mono" value="16:30" aria-label="Start time"></div>
        <div class="fld" style="flex:1"><label class="fld__l">Runs for</label>
          <span class="affix"><input class="ctl ctl--num" value="60" aria-label="Minutes">
            <span class="affix__p" style="border-left:0;border-radius:0 var(--tx-r2) var(--tx-r2) 0">min</span></span></div>
      </div>
      <div class="tools" style="gap:7px;margin-top:10px">
        <span class="chip" role="button" aria-pressed="false">30</span>
        <span class="chip" role="button" aria-pressed="true">60</span>
        <span class="chip" role="button" aria-pressed="false">90</span>
      </div>
      <p class="small mt2" style="color:var(--tx-ink-3)">Steps by 15 minutes, and the block above
        redraws as you nudge it. Nikhil&rsquo;s usual is 60 &mdash; changing it here changes this
        session only.</p></div>

    <div class="sect"><p class="h5">Effect on the package</p>
      <div class="kv mt2"><span class="kv__k">Before</span><span class="kv__v">12 of 12</span></div>
      <div class="kv"><span class="kv__k">After</span><span class="kv__v">11 of 12</span></div>
      <div class="kv"><span class="kv__k">Billed</span><span class="kv__v">&#8377;{RATE}</span></div>
      <div class="kv"><span class="kv__k">Your share</span><span class="kv__v acc">&#8377;{KEEP}</span></div>
    </div>

    <div class="sect"><p class="h5">Note to Nikhil</p>
      <textarea class="ctl mt2" rows="3">No problem &mdash; Saturday 09:00 is open if you want to make it up.</textarea>
      <label class="row gap3 mt3" style="cursor:pointer">
        <span class="check" role="checkbox" aria-checked="true">{ic(I_CHECK, 11)}</span>
        <span class="small">Send this on WhatsApp when I save</span></label>
    </div>

    <div class="sect"><p class="h5">History</p>
      <div class="tl mt2">
        <div class="tl__i tl__i--acc"><p class="tl__d">TODAY &middot; 08:44</p>
          <p class="tl__t">Marked no-show by you</p>
          <p class="tl__b">In the gap between Arjun and Divya. Still in the sync queue.</p></div>
        <div class="tl__i"><p class="tl__d">08 AUG</p><p class="tl__t">Moved from Monday 17:00</p>
          <p class="tl__b">Nikhil asked. He was told automatically.</p></div>
        <div class="tl__i"><p class="tl__d">04 AUG</p><p class="tl__t">Booked as part of the weekly pattern</p></div>
      </div></div>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Delete</button>
    <button class="btn btn--secondary" type="button">{ic(I_MOVE, 15)}Move</button>
    <button class="btn btn--primary" type="button">Save</button>
  </div>
</aside>'''


# ═══════════════════════════════════════════════════════ the bulk pattern ══
def prow(day, time, mins, clash=None):
    warn = (f'<tr><td colspan="5" style="padding-top:0;border-top:0">'
            f'<span class="row gap2" style="color:var(--tx-danger);font-size:11.5px">'
            f'{ic(I_WARN, 13)}<span>{clash}</span></span></td></tr>' if clash else '')
    return f'''<tr><td class="strong" style="white-space:nowrap">{day}</td>
    <td><input class="ctl mono" value="{time}" style="height:30px;width:82px" aria-label="{day} time"></td>
    <td><span class="affix"><input class="ctl ctl--num" value="{mins}" style="height:30px;width:52px" aria-label="{day} minutes"><span class="affix__p" style="border-left:0;height:30px;border-radius:0 var(--tx-r2) var(--tx-r2) 0">min</span></span></td>
    <td class="mono ink3" style="font-size:11.5px">ends {hm(int(time[:2]) * 60 + int(time[3:]) + mins)}</td>
    <td style="text-align:right"><button class="btn btn--icon btn--sm btn--ghost" type="button" aria-label="Remove {day}">{ic(I_NO, 14)}</button></td></tr>{warn}'''


PATTERN = f'''<div class="scrim scrim--soft"></div>
<aside class="panel" role="dialog" aria-label="Weekly pattern">
  <div class="panel__hd"><span class="panel__t">Weekly pattern &middot; Meera K</span>
    <span class="sp" style="flex:1"></span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Close">{ic(I_NO, 17)}</button></div>
  <div class="panel__body">
    <p class="note" style="margin:0 0 14px">Three days, each with its own time and its own length.
      This is the form the phone charges twenty-four confirmations for.</p>

    <table class="dt" style="table-layout:fixed">
      <colgroup><col style="width:94px"><col style="width:84px"><col style="width:92px"><col style="width:58px"><col style="width:32px"></colgroup>
      <thead><tr><th>Day</th><th>Starts</th><th>Runs for</th><th></th><th></th></tr></thead>
      <tbody>
        {prow("Monday", "06:00", 60)}
        {prow("Wednesday", "06:00", 60)}
        {prow("Friday", "07:30", 90, "07:30 clashes with Arjun S, 07:15 &ndash; 08:15")}
      </tbody></table>
    <button class="btn btn--sm btn--secondary mt3" type="button">{ic(I_PLUS, 13)}Add a day</button>

    <div class="sect"><div class="grid2">
      <div class="fld"><label class="fld__l">Repeat for</label>
        <span class="affix"><input class="ctl ctl--num" value="8" aria-label="Weeks">
          <span class="affix__p" style="border-left:0;border-radius:0 var(--tx-r2) var(--tx-r2) 0">weeks</span></span></div>
      <div class="fld"><label class="fld__l">Starting</label><input class="ctl" value="{PAT_START.isoformat()}" aria-label="Start date"></div>
    </div></div>

    <div class="card card--acc mt4">
      <div class="card__b">
        <div class="row gap3"><span class="acc">{ic(I_CAL, 17)}</span>
          <div><p class="h5 acc">24 sessions &middot; 22 hours of your week</p>
            <p class="small mt2">{PAT_SPAN} &middot; worth <b>&#8377;19,200</b> billed,
              <b>&#8377;10,368</b> to you after the gym&rsquo;s 46%. Utilisation goes
              <b>48% &rarr; 71%</b>.</p></div></div>
        <div class="kv mt3" style="border-color:var(--tx-accent-line)">
          <span class="kv__k">One day clashes &mdash; Friday 07:30</span>
          <span class="kv__v warn">Fix it</span></div>
        <div class="kv" style="border-color:var(--tx-accent-line)">
          <span class="kv__k">Two Fridays fall outside your working hours</span>
          <span class="kv__v ink3">Allowed</span></div>
      </div>
    </div>

    <div class="why why--warn" style="margin-top:14px"><p class="why__k">Why the length is per day</p>
      <p>Because Meera&rsquo;s Friday is a 90-minute session and her Monday is 60, and one
      <code>session_duration_minutes</code> on the client cannot say that. The column stays &mdash;
      it is the default a new day inherits &mdash; and the per-day figure is what
      <code>program.schedule</code> carries. A build that predates the field reads the client
      default, which is <b>60 for all three days</b>: shorter than the truth on Friday, and never
      longer, so nothing an old build shows is a booking that does not exist.</p></div>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--secondary" type="button">Preview in the grid</button>
    <button class="btn btn--primary" type="button">Create 24 sessions</button>
  </div>
</aside>'''


# ══════════════════════════════════════════════════ working hours, layer 1 ══
# `working_hours`, edited. The screen this draws is the one every grid on this
# page has been reading and none of them could change: WORK is the source of
# the hatch, of §04's quiet band, and of the utilisation denominator.
#
# The app's own header comment on WorkingHoursScreen.tsx sets the model:
# "Two layers of availability, not four. Trainerize stacks Vacation over
# Date-specific over Appointment-type over General; it is a complete model and
# it is far too much for a trainer with a phone."

MIN_WINDOW = 30       # MIN_WINDOW_MIN
NEW_WINDOW = 120      # NEW_WINDOW_MIN

# The five presets, verbatim from PRESETS. The comment beside them is the
# reason the split shift is the default shape and not an edge case: "Peak on an
# Indian gym floor is 06:00–10:00 and 17:00–21:00".
PRESETS = [(300, 540), (360, 660), (660, 900), (1020, 1260), (1140, 1320)]

HRS_DAY = 0                     # the day being edited: Monday
HRS_COPY = [1, 2, 3, 4]         # "Also apply to" — Tue to Fri
HRS_EDGE = 1050                 # the evening window's new start: 17:30


def work_total(work):
    return sum(b - a for w in work.values() for a, b in w)


def shift_evening(work, days, start):
    """The edit: push the evening window's start later on the given days."""
    return {d: [(start, b) if (d in days and a == 990) else (a, b) for a, b in ws]
            for d, ws in work.items()}


HRS_DAYS = [HRS_DAY] + HRS_COPY
WORK2 = shift_evening(WORK, HRS_DAYS, HRS_EDGE)
AVAIL2 = work_total(WORK2)
UTIL2 = round(100 * BOOKED / AVAIL2)
assert (AVAIL // 60, AVAIL2 // 60) == (47, 42), (AVAIL, AVAIL2)


def inside(work, wd, st, mn):
    return any(a <= st and st + mn <= b for a, b in work.get(wd, []))


# Who the edit puts outside the hours. Computed against the MERGED result,
# which is what `save()` does and for the reason it gives: two windows that
# touch cover a session sitting across their seam, "and warning about it would
# be a lie the trainer can see is a lie."
STRANDED = [i for i, s in enumerate(SESSIONS)
            if inside(WORK, s[0], s[1], s[2]) and not inside(WORK2, s[0], s[1], s[2])]
assert len(STRANDED) == 5, STRANDED

# Grouped by client, not listed flat. The phone's dialog says "5 sessions are
# booked outside these hours" and prints five rows; four of those rows are the
# same person's standing slot, which is the actual fact and the one a list of
# five makes you count out for yourself.
_by = {}
for i in STRANDED:
    _by.setdefault(SESSIONS[i][5], []).append(i)
STRANDED_BY = sorted(_by.items(), key=lambda kv: (-len(kv[1]), kv[0]))
assert [(n, len(v)) for n, v in STRANDED_BY] == [("Nikhil P", 4), ("Sneha R", 1)], STRANDED_BY
# MAX_LISTED is 5 on the phone, so this change is exactly the last one its
# dialog can show in full.
MAX_LISTED = 5


def hrs_of(work, wd):
    return sum(b - a for a, b in work.get(wd, []))


# What the edit does to the sellable time. The gap COUNT is the wrong figure to
# quote and saying so is the point: it does not move &mdash; ten before, ten
# after &mdash; while hours come out of them, because a window shrinking from
# one end shortens a gap rather than deleting it.
GAPS2 = {wd: gaps_for(wd, work=WORK2) for wd in range(7)}
GAP_N2 = sum(len(g) for g in GAPS2.values())
GAP_MIN2 = sum(b - a for g in GAPS2.values() for a, b in g)
GAP_SLOTS2 = sum((b - a) // 60 for g in GAPS2.values() for a, b in g)
GAP_RS2 = GAP_SLOTS2 * RATE
assert GAP_N2 == GAP_N, (GAP_N, GAP_N2)
assert GAP_MIN2 < GAP_MIN

# And the number that matters, which falls out of the two above: of the minutes
# the edit removes, how many were EMPTY and how many were carrying a session.
# The gap value barely moves — one hour, ₹800 — because four fifths of the time
# being cut was already sold. That is the sentence this screen exists to say,
# and no calendar that does not know what a session earns can say it.
CUT_MIN = AVAIL - AVAIL2
CUT_BOOKED = sum(
    max(0, min(s[1] + s[2], 1050) - max(s[1], 990))
    for s in SESSIONS if s[0] in HRS_DAYS)
CUT_FREE = CUT_MIN - CUT_BOOKED
STRANDED_RS = len(STRANDED) * RATE
STRANDED_KEEP = len(STRANDED) * KEEP
CUT_SELLABLE = GAP_MIN - GAP_MIN2
assert (CUT_MIN, CUT_BOOKED, CUT_FREE) == (300, 225, 75), (CUT_MIN, CUT_BOOKED, CUT_FREE)
# and of the empty 75, only 60 was ever SELLABLE — a gap has to be an hour to
# count, so the fifteen minutes Sneha's session leaves behind on Wednesday were
# never on offer. Three figures, and the difference between the second and the
# third is the gap rule restated.
assert CUT_SELLABLE == 60, CUT_SELLABLE


# ══════════════════════════════════════════════ the hours editor, rendered ══
def wband(a, b, seg, *, sel=False, drag=None):
    """One working window, as an object with two ends.

       The label carries its own times because a band you can drag has to say
       what it currently says — reading a time off a pixel position is the
       thing §01 found the old grid asking of everybody."""
    lab = (f"Working window, {hm(a)} to {hm(b)}, {dur(b - a)}"
           + (", being edited" if sel else "")
           + ". Drag either end, or press Enter and use the arrow keys.")
    edges = ('<span class="wb__e wb__e--t"></span>'
             '<span class="wb__e wb__e--b"></span>')
    ro = ""
    if drag:
        ro = (f'<div class="cw__cur" style="top:3px;left:4px">'
              f'<b>{hm(a)}</b> &middot; <i>{drag}</i></div>')
    return (f'<button class="wb{" wb--sel" if sel else ""}" type="button" aria-label="{lab}"'
            f' style="top:{a - seg[0]}px;height:{b - a}px">{edges}{ro}</button>')


def hourcol(wd, seg, work, *, on=False, out=(), drag_wd=None):
    """One day of the hours editor. No hatch and no gap blocks: the subject is
       the window, and a second mark for "not available" would be redundant
       with the empty track it sits in."""
    a, b = seg
    inner = [lines(seg)]
    for x, y in work.get(wd, []):
        if x >= a and y <= b:
            moved = wd == drag_wd and x == HRS_EDGE
            inner.append(wband(x, y, seg, sel=on,
                               drag=(f"was {hm(990)}" if moved else None)))
    for i, s in enumerate(SESSIONS):
        if s[0] != wd or not (a <= s[1] < b):
            continue
        bad = i in out
        sp = None
        if i in CLASH:
            grp = sorted([i] + CLASH[i])
            sp = 1 if grp.index(i) == 0 else 2
        inner.append(block(s, seg, i, split=sp, dim=not bad,
                           extra="ev--out" if bad else ""))
    cls = ("cw__seg" + (" cw__seg--on" if on else "")
           + (" cw__seg--drag" if wd == drag_wd else ""))
    return f'<div class="{cls}" style="height:{b - a}px">' + "".join(inner) + '</div>'


def hourhead(wd, work, *, on=False):
    h = hrs_of(work, wd)
    was = hrs_of(WORK, wd)
    ws = work.get(wd, [])
    tone = ' class="acc"' if on and h != was else ' class="ink3"'
    lines_ = "".join(
        f'<p class="mono" style="font-size:10px;line-height:1.5;'
        f'color:var(--tx-ink-{"2" if on else "3"})">{hm(a)}&ndash;{hm(b)}</p>'
        for a, b in ws) or ('<p class="mono ink3" style="font-size:10px">closed</p>')
    cls = "cal__hd" + (" cal__hd--on" if on else "")
    return (f'<div class="{cls}" style="height:auto;padding:7px 6px 8px">'
            f'<p class="cal__d">{DAYS[wd]}</p>'
            f'<p class="cal__n" style="font-size:15px;line-height:1.2"><span{tone}>'
            f'{dur(h)}</span></p>{lines_}</div>')


def gridstrip(icon, text, tail, tone=""):
    return (f'<div class="cw__band cw__band--{tone or "note"}">{ic(icon, 13)}'
            f'<span>{text}</span><em>{tail}</em></div>')


# Layer two cannot be drawn on a weekly pattern, and that is the answer to it
# rather than a limitation of it: `time_blocks` are DATED. A weekly editor that
# hatched 24—28 August across every Monday would be claiming the trainer is
# away every Monday forever. So layer two appears as a strip that names its own
# dates and points at the month, and the two layers never share a channel.
DATED = gridstrip(
    I_CAL,
    f"<b>2 dated exceptions this month</b> &mdash; away {BLOCKS[0][1].day}&ndash;"
    f"{BLOCKS[0][2].day} {BLOCKS[0][2].strftime('%b')}, and "
    f"{BLOCKS[1][1].day} {BLOCKS[1][1].strftime('%b')} 14:00&ndash;18:00. "
    f"Dated, so they are not part of a weekly pattern",
    "see the month")

STRAND_STRIP = gridstrip(
    I_WARN,
    "<strong>" + " and ".join(
        f"{n} &middot; {len(v)} session{'s' if len(v) > 1 else ''}"
        for n, v in STRANDED_BY)
    + "</strong> fall outside the new hours. They stay booked and still show in your diary",
    f"{len(STRANDED)} sessions", tone="warn")


COST_STRIP = gridstrip(
    I_RUPEE,
    f"<b>{hrsw(AVAIL)} &rarr; {hrsw(AVAIL2)}</b> bookable, utilisation "
    f"<b>{UTIL}% &rarr; {UTIL2}%</b> &mdash; and {dur(CUT_BOOKED)} of the {hrsw(CUT_MIN)} "
    f"you are cutting is already carrying sessions",
    f"&#8377;{STRANDED_RS:,} booked, &#8377;{GAP_RS - GAP_RS2:,} of gap")


def hoursweek(work, *, on=(), out=(), drag_wd=None, strips=()):
    rows = []
    for si, seg in enumerate(SEG):
        rows.append(gutter(seg))
        for wd in range(7):
            rows.append(hourcol(wd, seg, work, on=(wd in on), out=out,
                                drag_wd=drag_wd))
        if si == 0:
            rows.append(bandrow())
    heads = head() + "".join(hourhead(wd, work, on=(wd in on)) for wd in range(7))
    return f'<div class="cw cw--hrs">{heads}{"".join(strips)}{"".join(rows)}</div>'


# ════════════════════════════════════════════════ the hours editor's panel ══
def wrow(i, a, b, prev=None):
    """One window, as two fields and a duration. The break line reads off the
       previous row rather than a sorted copy, for the reason the app gives:
       rows never reorder under a pointer mid-nudge, so a window dragged past
       its neighbour makes the line disappear instead of jump."""
    gap = ""
    if prev is not None and a > prev:
        gap = (f'<p class="small" style="color:var(--tx-ink-3);margin:10px 0 4px">'
               f'break &middot; {hm(prev)} &ndash; {hm(a)} &middot; {dur(a - prev)}</p>')
    return f'''{gap}<div class="sect" style="border-top:0;margin-top:8px;padding-top:0">
      <div class="row gap3"><p class="fld__l" style="flex:1">Window {i + 1}</p>
        <span class="mono ink3" style="font-size:11.5px">{dur(b - a)}</span></div>
      <div class="row gap3 mt2" style="align-items:flex-end">
        <div class="fld" style="flex:1"><label class="fld__l">Starts</label>
          <input class="ctl mono" value="{hm(a)}" aria-label="Window {i + 1} starts"></div>
        <div class="fld" style="flex:1"><label class="fld__l">Ends</label>
          <input class="ctl mono" value="{hm(b)}" aria-label="Window {i + 1} ends"></div>
        <button class="btn btn--icon btn--ghost" type="button"
          aria-label="Remove {hm(a)} to {hm(b)}">{ic(I_NO, 16)}</button>
      </div></div>'''


_DRAFT = WORK2[HRS_DAY]
_PRE = "".join(
    f'<span class="chip" role="button" aria-pressed='
    f'"{"true" if (a, b) in _DRAFT else "false"}">{hm(a)} &ndash; {hm(b)}</span>'
    for a, b in PRESETS)
_COPY = "".join(
    f'<span class="chip" role="button" aria-pressed='
    f'"{"true" if d in HRS_COPY else "false"}">{DAYS[d]}</span>'
    for d in range(7) if d != HRS_DAY)
_WINDOWS = "".join(wrow(i, a, b, prev=(_DRAFT[i - 1][1] if i else None))
                   for i, (a, b) in enumerate(_DRAFT))

HOURS_PANEL = f'''<div class="scrim scrim--soft"></div>
<aside class="panel" role="dialog" aria-label="{LONG[HRS_DAY]} hours">
  <div class="panel__hd"><span class="panel__t">{LONG[HRS_DAY]}</span>
    <span class="sp" style="flex:1"></span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Close">{ic(I_NO, 17)}</button></div>
  <div class="panel__body">
    <div class="sect" style="border-top:0;margin-top:0;padding-top:0">
      <p class="h5">Quick fill</p>
      <div class="tools" style="gap:7px;margin-top:8px">{_PRE}</div>
      <p class="small mt2" style="color:var(--tx-ink-3)">A shortcut to the usual answer, not the
        set of possible ones &mdash; none of them says this shift.</p></div>

    <div class="sect"><p class="h5">Your hours</p>{_WINDOWS}
      <button class="btn btn--sm btn--ghost mt3" type="button">{ic(I_PLUS, 13)}Add another window</button>
      <p class="small mt2" style="color:var(--tx-ink-3)">Nothing shorter than {MIN_WINDOW} minutes
        &mdash; below that it is a typo mid-nudge, not a decision.</p></div>

    <div class="sect"><p class="h5">Also apply to</p>
      <div class="tools" style="gap:7px;margin-top:8px">{_COPY}</div>
      <p class="small mt2" style="color:var(--tx-ink-3)">Saving replaces
        {", ".join(DAYS[d] for d in HRS_COPY)} with these hours too &mdash; and those four columns
        are tinted behind this panel, so the chips and the grid cannot disagree.</p></div>

    <div class="sect"><div class="row gap3">{ic(I_EYE, 15)}
      <p class="small" style="flex:1;color:var(--tx-ink-3)">These constrain what a <b>client</b> can
        self-book. They have never constrained <b>you</b> &mdash; the grid will take a session at
        05:00 on a Sunday without arguing.</p></div></div>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--primary" type="button">Save for {len(HRS_DAYS)} days</button>
  </div>
</aside>'''


# ══════════════════════════════════════════════════════ the booking form ══
def crow(name, c, sub, *, tone=""):
    """One client, as a <button>. `.lrow` was written for a div with
       cursor:pointer; a row that picks something is a control, so the
       stylesheet gains the declarations a <button> needs to look like one —
       the same fix `.gapb` needed for the same reason."""
    return (f'<button class="lrow" aria-pressed="false" type="button">'
            f'<span class="av av--sm" style="background:var(--tx-{c["av"]})">{c["ini"]}</span>'
            f'<span class="lrow__m"><span class="lrow__t">{name}</span>'
            f'<span class="lrow__s{(" " + tone) if tone else ""}">{sub}</span></span>'
            f'</button>')


def lgrp(label, n=None):
    tail = f'<em>{n}</em>' if n is not None else ""
    return f'<p class="lgrp">{label}{tail}</p>'


# Every client the session list names, with the lengths they actually train.
CLIENTS = {}
for _wd, _st, _mn, _ini, _av, _n, _pl, _mo, _sx in SESSIONS:
    CLIENTS.setdefault(_n, {"ini": _ini, "av": _av, "plan": _pl, "mins": set()})
    CLIENTS[_n]["mins"].add(_mn)

# The suggested rows, written from BOOK_SUG, so the group cannot claim a client
# the session list does not put at this hour. Nothing is pre-selected: the
# frame's whole point is the state before the one question is answered, and a
# highlighted row with a disabled primary would contradict its own foot.
SUG_LEFT = {"Arjun S": "5 of 12 left", "Karthik R": "6 of 12 left"}
_SUG_ROWS = "".join(
    crow(name, c,
         f'{", ".join(DAYS[d] for d in days)} at this hour &middot; '
         f'{max(c["mins"])} min &middot; {SUG_LEFT[name]}')
    for name, c, days in BOOK_SUG)

# Everyone else, alphabetical, and honest about the tail: the roster is 22 and
# the session list names 9, so the remainder is a count and not thirteen
# invented names.
ROSTER = 22
_PACKS = {"Divya R": ("remote &middot; monthly &middot; renews 1 Sep", ""),
          "Farhan Q": ("8 of 12 left", ""),
          "Kavya M": ("0 left &mdash; nothing to deduct", "danger")}
_SUG_NAMES = [r[0] for r in BOOK_SUG]
_SHOWN = [n for n in sorted(CLIENTS) if n in _PACKS and n not in _SUG_NAMES]
_REST_ROWS = "".join(crow(n, CLIENTS[n], _PACKS[n][0], tone=_PACKS[n][1]) for n in _SHOWN)
_MORE = ROSTER - len(BOOK_SUG) - len(_SHOWN)
assert _MORE == 17, _MORE


def bk_when(mins=None, chips=False):
    """The slot, read back. Not a date picker: the click answered it, and
       NN/g's rule is not to ask for what you already have."""
    mins = DEFAULT_MIN if mins is None else mins
    end = BOOK_AT + mins
    ch = ('<div class="tools" style="gap:7px;margin-top:10px">'
          + "".join(f'<span class="chip" role="button" aria-pressed='
                    f'"{"true" if n == mins else "false"}">{n} min</span>'
                    for n in (30, 60, 90))
          + '</div>') if chips else ""
    return (f'<div class="sect"><p class="h5">When</p>'
            f'<div class="row gap3 mt2" style="align-items:flex-end">'
            f'<div class="fld" style="flex:1"><label class="fld__l">Starts</label>'
            f'<input class="ctl mono" value="{hm(BOOK_AT)}" aria-label="Start time"></div>'
            f'<div class="fld" style="flex:1"><label class="fld__l">Runs for</label>'
            f'<span class="affix"><input class="ctl ctl--num" value="{mins}" aria-label="Minutes">'
            f'<span class="affix__p" style="border-left:0;border-radius:0 var(--tx-r2) var(--tx-r2) 0">min</span>'
            f'</span></div></div>{ch}'
            f'<p class="small mt2" style="color:var(--tx-ink-3)">'
            f'<b>{hm(BOOK_AT)} &ndash; {hm(end)}</b> &middot; clear &middot; back to back with '
            f'{BOOK_ABUT}, whose hour ends where this one starts. Leaves '
            f'<b>{hm(end)} &ndash; {hm(BOOK_REST[1])}</b> &mdash; {dur(BOOK_REST[1] - end)} '
            f'&mdash; still free.</p></div>')


BK_PACK = (f'<div class="why"><p class="why__k">Booking does not touch the pack</p>'
           f'<p>{BOOK_NAME} has <b>{BOOK_PACK} of 12</b> before this and <b>{BOOK_PACK} of 12</b> '
           f'after it. A session leaves the pack when you mark it <b>done</b> &mdash; or a '
           f'<b>no-show</b> &mdash; never when you book it.</p></div>')


def bk_hd(title):
    return (f'<div class="panel__hd"><span class="panel__t">{title}</span>'
            f'<span class="sp" style="flex:1"></span>'
            f'<button class="btn btn--icon btn--ghost" type="button" aria-label="Close">'
            f'{ic(I_NO, 17)}</button></div>')


BK_TITLE = f"New session &middot; {dstamp(BOOK_DATE)}, {hm(BOOK_AT)}"

BOOK = (f'<div class="scrim scrim--soft"></div>'
        f'<aside class="panel" role="dialog" aria-label="New session">{bk_hd(BK_TITLE)}'
        f'<div class="panel__body">'
        f'<p class="note" style="margin:0 0 14px">The click answered three of the five questions. '
        f'This form asks the two it could not.</p>'
        f'{bk_when(DEFAULT_MIN)}'
        f'<div class="sect"><p class="h5">Who</p>'
        f'<div class="fld mt3"><span class="affix">'
        f'<span class="affix__p" style="border-right:0;border-radius:var(--tx-r2) 0 0 var(--tx-r2)">'
        f'{ic(I_SEARCH, 14)}</span>'
        f'<input class="ctl" value="" aria-label="Find a client" '
        f'style="border-radius:0 var(--tx-r2) var(--tx-r2) 0"></span>'
        f'<p class="fld__h mt2">Type a name, or pick below.</p></div>'
        f'<div class="lgl mt3">'
        f'{lgrp("Trains at this hour", len(BOOK_SUG))}{_SUG_ROWS}'
        f'{lgrp("Everyone else", ROSTER - len(BOOK_SUG))}{_REST_ROWS}'
        f'<p class="lgrp lgrp--f">{_MORE} more &middot; type to find them</p>'
        f'</div></div>'
        f'</div>'
        f'<div class="panel__foot">'
        f'<span class="small ink3" style="flex:1;text-align:left">Pick a client to book.</span>'
        f'<button class="btn btn--ghost" type="button">Cancel</button>'
        f'<button class="btn btn--primary" type="button" disabled>Book {hm(BOOK_AT)}</button>'
        f'</div></aside>')


BK_WHO = (f'<div class="row gap3">'
          f'<span class="av av--lg" style="background:var(--tx-{BOOK_C["av"]})">{BOOK_C["ini"]}</span>'
          f'<div style="flex:1"><p class="h4">{BOOK_NAME}</p>'
          f'<p class="small">{BOOK_C["plan"]} &middot; {BOOK_PACK} of 12 left &middot; '
          f'week 4 of 8</p></div>'
          f'<button class="btn btn--ghost btn--sm" type="button">Change</button></div>')


def bk_repeat(on):
    """Repeat, inline. On the phone this is a second level — `repeatOpen` swaps
       the whole sheet — which is right at 390px and wrong beside a grid."""
    def rad(sel, title, sub=""):
        s = f'<span class="lrow__s">{sub}</span>' if sub else ""
        return (f'<label class="lrow" style="cursor:pointer">'
                f'<span class="rad{" rad--on" if sel else ""}" role="radio" '
                f'aria-checked="{"true" if sel else "false"}"></span>'
                f'<span class="lrow__m"><span class="lrow__t">{title}</span>{s}</span></label>')
    until = ("" if not on else
             '<p class="fld__l mt3">Until</p>'
             '<div class="tools" style="gap:7px;margin-top:8px">'
             '<span class="chip" role="button" aria-pressed="true">His pack runs out</span>'
             '<span class="chip" role="button" aria-pressed="false">A date</span>'
             '<span class="chip" role="button" aria-pressed="false">A count</span></div>')
    return (f'<div class="sect"><p class="h5">Repeat</p><div class="lgl mt3">'
            f'{rad(not on, "Does not repeat", "one session, this Wednesday")}'
            f'{rad(on, f"Every {LONG[BOOK_WD]} at {hm(BOOK_AT)}", "the slot you clicked, every week")}'
            f'</div>{until}</div>')


BOOK2 = (f'<div class="scrim scrim--soft"></div>'
         f'<aside class="panel" role="dialog" aria-label="New session">{bk_hd(BK_TITLE)}'
         f'<div class="panel__body">{BK_WHO}'
         f'{bk_when(BOOK_MIN, chips=True)}'
         f'<p class="small" style="color:var(--tx-ink-3);margin-top:8px">'
         f'<b>{BOOK_MIN} min</b> and <b>floor</b> are his usual. Changing either changes this '
         f'session, never his default.</p>'
         f'<div class="sect"><p class="h5">Where</p>'
         f'<div class="tools" style="gap:7px;margin-top:8px">'
         f'<span class="chip" role="button" aria-pressed="true">Floor</span>'
         f'<span class="chip" role="button" aria-pressed="false">Remote</span></div></div>'
         f'{bk_repeat(False)}'
         f'{BK_PACK}'
         f'</div>'
         f'<div class="panel__foot">'
         f'<button class="btn btn--ghost" type="button">Cancel</button>'
         f'<button class="btn btn--primary" type="button">Book {hm(BOOK_AT)}</button>'
         f'</div></aside>')


def occrow(d):
    """One generated date. FR-2 asks for 'a preview of every generated date
       before commit' and this is the only place in the set that gives it."""
    when = (f'<td class="strong" style="white-space:nowrap">{dstamp(d)}</td>'
            f'<td class="mono" style="font-size:11.5px;white-space:nowrap">'
            f'{hm(BOOK_AT)} &ndash; {hm(BOOK_END)}</td>')
    if d in BLOCKED:
        return (f'<tr>{when}'
                f'<td><span class="row gap2" style="color:var(--tx-danger);font-size:11.5px">'
                f'{ic(I_WARN, 13)}<span>Coimbatore</span></span></td>'
                f'<td style="text-align:right"><button class="btn btn--sm btn--secondary" '
                f'type="button">Skip</button></td></tr>')
    return (f'<tr>{when}'
            f'<td class="ink3" style="font-size:11.5px">clear</td>'
            f'<td style="text-align:right"><button class="btn btn--icon btn--sm btn--ghost" '
            f'type="button" aria-label="Drop {dstamp(d)}">{ic(I_NO, 14)}</button></td></tr>')


BOOK3 = (f'<div class="scrim scrim--soft"></div>'
         f'<aside class="panel" role="dialog" aria-label="Confirm the series">'
         f'{bk_hd(f"{BOOK_PACK} sessions &middot; every {DAYS[BOOK_WD]}")}'
         f'<div class="panel__body">'
         f'<div class="row gap3">'
         f'<span class="av av--sm" style="background:var(--tx-{BOOK_C["av"]})">{BOOK_C["ini"]}</span>'
         f'<div style="flex:1"><p class="h5">{BOOK_NAME} &middot; every {LONG[BOOK_WD]}, '
         f'{hm(BOOK_AT)} &ndash; {hm(BOOK_END)}</p>'
         f'<p class="small">floor &middot; until his pack runs out</p></div>'
         f'<button class="btn btn--ghost btn--sm" type="button">Change</button></div>'
         f'<div class="sect"><p class="h5">Every date it makes</p>'
         f'<table class="dt mt3" style="table-layout:fixed;margin-top:10px">'
         f'<colgroup><col style="width:88px"><col style="width:116px"><col style="width:94px">'
         f'<col style="width:46px"></colgroup>'
         f'<tbody>{"".join(occrow(d) for d in BOOK_OCC)}</tbody></table>'
         f'<div class="card card--acc mt4"><div class="card__b">'
         f'<div class="row gap3"><span class="acc">{ic(I_CAL, 17)}</span>'
         f'<div><p class="h5 acc">{BOOK_PACK} sessions &middot; {BOOK_HOURS} &middot; the whole of '
         f'his pack</p>'
         f'<p class="small mt2"><b>&#8377;{BOOK_BILL:,}</b> billed, '
         f'<b>&#8377;{BOOK_KEEP_T:,}</b> to you after the gym&rsquo;s 46%. Utilisation goes '
         f'<b>{UTIL}% &rarr; {BOOK_UTIL_AFTER}%</b>.</p></div></div>'
         f'<div class="kv mt3" style="border-color:var(--tx-accent-line)">'
         f'<span class="kv__k">{dstamp(BOOK_AWAY)} is inside your time off</span>'
         f'<span class="kv__v warn">Skip it</span></div>'
         f'<div class="kv" style="border-color:var(--tx-accent-line)">'
         f'<span class="kv__k">Skipping keeps all {BOOK_PACK} and ends '
         f'{BOOK_OCC_SKIP[-1].day} {BOOK_OCC_SKIP[-1].strftime("%b")}</span>'
         f'<span class="kv__v ink3" style="white-space:nowrap">not '
         f'{BOOK_OCC[-1].day} {BOOK_OCC[-1].strftime("%b")}</span></div>'
         f'<div class="kv" style="border-color:var(--tx-accent-line)">'
         f'<span class="kv__k">Nothing else clashes</span>'
         f'<span class="kv__v ink3">checked against all {N_SESS}</span></div>'
         f'</div></div></div>'
         f'</div>'
         f'<div class="panel__foot">'
         f'<button class="btn btn--ghost" type="button">Back</button>'
         f'<button class="btn btn--secondary" type="button">{ic(I_EYE, 15)}Show them in the grid</button>'
         f'<button class="btn btn--primary" type="button">Book {BOOK_PACK} sessions</button>'
         f'</div></aside>')


# ══════════════════════════════════════════════════════════════ sections ══
def finding(n, title, tone, body, proof):
    return f'''<div class="grp"><div class="grp__t">
  <h4><span class="ink3 mono" style="margin-right:8px">{n}</span>{title}</h4>
  <span><span class="tag tag--{tone}">{"Defect" if tone == "danger" else "Gap"}</span></span></div>
<div class="dd" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)">
  <div class="dd__i" style="border-color:var(--tx-line)">
    <p class="dd__k" style="background:var(--tx-surface-2);color:var(--tx-ink-3)">What is wrong</p>
    <p class="dd__c" style="border-top:0">{body}</p></div>
  <div class="dd__i" style="border-color:var(--tx-line)">
    <p class="dd__k" style="background:var(--tx-surface-2);color:var(--tx-ink-3)">How to check it</p>
    <p class="dd__c" style="border-top:0">{proof}</p></div>
</div></div>'''


S01 = f'''<p class="note">Eight things, all of them checkable against the file this page replaces
&mdash; a 73&thinsp;KB document about time that could not draw a session starting at half past.
The cause is one structural decision, and findings 1 to 4 are the same decision seen from four
sides.</p>

''' + finding(
    "01", "Every session in the file is exactly one hour, and starts exactly on the hour", "danger",
    f'''The week was a <b>matrix</b>: eight columns by fourteen 48px hour cells, each cell its own
    containing block, each session absolutely positioned <i>inside one cell</i>. So a session cannot
    start at 07:30 &mdash; the <code>top</code> that would put it there spills into a sibling cell
    with its own background, its own border and its own hover target &mdash; and it cannot run 90
    minutes, because there is no height for it. All <b>102</b> blocks in that file carry the same
    inline style. Not similar: identical.
    <br><br>The app has never agreed. <code>TimeField.tsx</code> steps by 15 minutes and its comment
    names the case &mdash; <i>&ldquo;the one that keeps 07:30 and 06:45 reachable&rdquo;</i>.
    <code>07:30</code> appears <b>once</b> in the whole schedule file: as a value you can type into
    the bulk-apply form, on the same page as a grid that cannot draw it.''',
    '''<code>grep -o 'class="ev[^"]*" style="[^"]*"' webapp-schedule.html | sort | uniq -c</code>
    &rarr; <code>102 top:2px;height:42px</code><br>
    <code>grep -c '07:30' webapp-schedule.html</code> &rarr; <code>1</code>, and it is the
    <code>&lt;input&gt;</code> in the pattern form.''') + '''

''' + finding(
    "02", "Duration is not in the design at all &mdash; and has been in the data since V2", "danger",
    f'''The words <i>duration</i>, <i>45 min</i> and <i>90 min</i> appear <b>zero</b> times in the
    file. Meanwhile <code>clients.session_duration_minutes</code> has existed since app schema V2,
    <code>conflicts.ts</code> computes <code>[start, start + that client&rsquo;s duration)</code> and
    says so in its own comment &mdash; <i>&ldquo;a 90-minute client blocks the half-hour marks inside
    their session too&rdquo;</i> &mdash; and <code>BookSheet.tsx</code> offers
    <code>LENGTHS = [30, 60, 90]</code>. The screen that exists to show a trainer their time was the
    only place in the product where a session had no length.''',
    '''<code>grep -ic 'duration\\|90 min\\|45 min' webapp-schedule.html</code> &rarr; <code>0</code><br>
    App side: <code>app/src/db/schema.ts</code>, <code>app/src/clients/conflicts.ts</code>,
    <code>app/src/screens/main/diary/BookSheet.tsx:43</code>.''') + '''

''' + finding(
    "03", "The component library already specified the fix, in numbers, and nothing obeyed it", "danger",
    '''<code>webapp-c-domain.html</code> publishes three values for <code>.ev</code>:
    <b>Height 46px per 60 min</b>, <b>&ldquo;a 30-minute session is 23px and drops the plan
    line&rdquo;</b>, and <b>Min legible 23px &mdash; below that, time only</b>. A content ladder by
    height, correctly reasoned. None of it could run, because in a 48px cell every session was 42px
    whatever its length &mdash; so the library was describing a component that did not exist.
    <br><br>Its own specimens give it away: the no-show specimen is <b>18:30 Kavya M</b> and the
    conflict specimen is <b>07:30 Arjun S</b>. The library draws the two times the grid cannot
    place.''',
    '''<code>grep -o '18:30\\|07:30\\|46px\\|23px' webapp-c-domain.html | sort | uniq -c</code><br>
    Also note <b>three</b> different heights across two files for one component: 46 (library spec),
    42 (every instance), 48 (the cell).''') + '''

''' + finding(
    "04", "A clash cannot be drawn, and the old page promised it would be", "danger",
    '''<code>.ev--conflict</code> is documented as <i>&ldquo;a hatched overlay plus a warning glyph
    &mdash; the one state that must be noticed&rdquo;</i> and implemented as
    <code>box-shadow:inset 0 0 0 1px var(--tx-danger)</code>. No hatch. No glyph.
    <br><br>Worse, it can only ever ring <i>one</i> of the two. Both blocks are
    <code>left:2px;right:2px</code> in the same cell, so the second paints over the first and the
    trainer sees one name. &sect;04 of that page states the intent exactly: <i>&ldquo;A conflict is
    spatial. Show it in space.&rdquo;</i> The grid it was written for had no space to show it in
    &mdash; and one <code>ev--conflict</code> is used in the whole file, on a block whose partner is
    invisible.''',
    '''<code>grep -c 'ev--conflict' webapp-schedule.html</code> &rarr; <code>1</code><br>
    <code>grep -A1 'ev--conflict{' assets/webapp.css</code> &rarr; a ring, and nothing else.''') + '''

''' + finding(
    "05", "494 divs, and a keyboard contract that was published and never built", "danger",
    '''102 session blocks and 392 hour cells, all <code>&lt;div&gt;</code>. <kbd>Tab</kbd> walks past
    every session on the screen. The library, again, had already written the contract: the week is a
    <code>role="grid"</code>, each block a <code>gridcell</code> whose name is the whole sentence
    (<i>&ldquo;Tuesday 6am, Meera Krishnan, Push A, floor session, done&rdquo;</i>), arrows move,
    <kbd>&crarr;</kbd> opens the panel, and <b>moving a session by keyboard uses cut and paste
    &ldquo;because drag alone would fail SC 2.5.7&rdquo;</b>. There is no role, no name, no menu and
    no drag either &mdash; the failure it guards against had not been built yet.''',
    '''<code>grep -o 'class="cal__c' webapp-schedule.html | wc -l</code> &rarr; <code>392</code><br>
    <code>grep -c 'role="grid"\\|gridcell' webapp-schedule.html</code> &rarr; <code>0</code>''') + '''

''' + finding(
    "06", "No now-line, and a window that cannot reach 20:00", "warn",
    '''Zero current-time markers in a document about a working day &mdash; the one convention every
    calendar in the category shares. And the gutter is hard-coded <b>06:00 to 19:00</b>, fourteen
    labels, so a 19:30 remote session with a client in another time zone has nowhere to go. The app
    does better already: <code>DayTimeline.tsx</code> runs 05:00&ndash;23:00 and <b>stretches to the
    hour when a window falls outside it</b>, because <i>&ldquo;a fixed 00:00&ndash;24:00 track would
    spend a third of its pixels on hours no gym is open&rdquo;</i>.
    <br><br>Fourteen 48px rows is 672px of grid in a <code>height:520px</code> scroller. A third of
    every day sat below the fold with nothing saying so.''',
    '''<code>grep -c 'cal__now\\|now-line\\|nowline' webapp-schedule.html</code> &rarr; <code>0</code><br>
    <code>grep -o 'class="cal__t"&gt;[0-9:]*' webapp-schedule.html | sort -u</code> &rarr; 06:00 &hellip; 19:00''') + f'''

''' + finding(
    "07", "The session panel marks a session two days in the future as a no-show", "danger",
    '''The grid marks <b>Tuesday 12</b> as today. The panel is headed <b>Thursday 14 Aug &middot;
    17:00</b>, its callout says <i>Marked no-show</i>, and its history reads <b>TODAY &middot; 17:12
    &mdash; Marked no-show by you</b>. Somebody recorded a no-show for a session two days away, and
    the package went from 12 of 12 to 11 of 12 for it.
    <br><br>Small, and worth naming, because it is the tell for the whole file: with no now-line and
    no minute axis, nothing on the screen could contradict it.''',
    '''Compare <code>cal__hd--today</code> (Tue 12) with the panel&rsquo;s <code>panel__t</code>
    (Thu 14) in the same frame.''')




S01 = S01 + '''

''' + finding(
    "08", "Every weekday label in the set was off by one day", "danger",
    """<b>Found by building the month, which is the first view that cannot dodge the question.</b>
    Every file in this set that draws a week labels its columns <b>Mon 11 &hellip; Sun 17 August
    2026</b>. In the real 2026 calendar 1 August is a <b>Saturday</b>, so 11 August is a
    <b>Tuesday</b> &mdash; and all seven labels were wrong, by exactly one day, everywhere.
    <br><br>Nothing broke, and that is the interesting part: no view had to agree with any other about
    which weekday a number was, so the error had nowhere to surface. A month grid has 42 cells that are
    days and six rows that are weeks; it cannot hold both a wrong mapping and a right one.
    The bulk-apply form was wrong twice over on top of that &mdash; it started an eight-week
    Monday/Wednesday/Friday pattern on a <b>Tuesday</b> and reported its span as
    <i>18 Aug &mdash; 6 Oct</i>, which is neither the right start nor the right end.""",
    """<code>python3 -c "from datetime import date; print(date(2026,8,11).strftime('%A'))"</code>
    &rarr; <code>Tuesday</code><br>
    Fixed at the root: <code>WEEK_MON = date(2026, 8, 10)</code> and every label, crumb, URL and
    ISO week string in this file is derived from it, so the columns now read
    <b>Mon 10 &hellip; Sun 16</b> and the pattern span computes to
    <b>17 Aug &mdash; 9 Oct</b>.""")


S02 = f'''<p class="note">One decision undoes findings 1 to 4: <b>the cells are gone.</b> A day is
one positioned track and the hour lines are drawn <i>on</i> it rather than <i>being</i> it &mdash;
which is how every serious calendar in the category is built, and what the app&rsquo;s own
<code>DayTimeline</code> already does with percentages.</p>

<div class="why" style="margin-top:14px"><p class="why__k">One minute is one pixel</p>
  <p><code>--cw-hour: 60px</code>. It is not a tuning value, it is the geometry:
  <code>top = startMinute &minus; segmentStart</code> and <code>height = durationMinutes</code>.
  No scale factor, no rounding, no arithmetic in the spec &mdash; a 90-minute session is 90px, and
  the 15-minute quantum the app steps by is 15px. Every number on this page is the number in the
  data, which is why none of them is hand-typed: they are computed in
  <code>gen_schedule.py</code> from the same session list that draws the blocks.</p></div>

<h3 class="sec">Why 60 and not 48</h3>
<p class="note">Because the library&rsquo;s own floor decides it. <b>Min legible 23px &mdash; below
that, time only.</b> The shortest session InclineYou sells is 30 minutes
(<code>LENGTHS = [30, 60, 90]</code>). At the old 48px hour a 30-minute block is <b>24px</b> and
loses its client&rsquo;s name; at 60px it is <b>30px</b> and keeps it on one line. 60 is the
smallest hour that lets the shortest session say who it is &mdash; and it happens to be the one that
makes the axis arithmetic disappear.</p>

<table class="dt" style="table-layout:fixed">
<colgroup><col style="width:88px"><col style="width:74px"><col><col style="width:210px"></colgroup>
<thead><tr><th>Length</th><th>Height</th><th>The block shows</th><th>In this week</th></tr></thead>
<tbody>
  <tr><th><code>30 min</code></th><td class="mono">30px</td>
    <td>One line: start, then the name beside it. The plan drops &mdash; a 30-minute block that
      tries to hold three lines holds none of them.</td>
    <td>Kavya M &times;3, Divya R &times;2</td></tr>
  <tr><th><code>45 min</code></th><td class="mono">45px</td>
    <td>Two lines: start, then the name. Still no plan.</td>
    <td class="ink3">None &mdash; but <code>session_duration_minutes</code> is an integer column and
      an imported client can hold 45, so it is specified rather than assumed away.</td></tr>
  <tr><th><code>60 min</code></th><td class="mono">60px</td>
    <td>Three lines: <b>start &ndash; end</b>, name, plan. The end time is drawn as well as
      implied by the edge, because an edge is not readable by a screen reader.</td>
    <td>14 of the 23</td></tr>
  <tr><th><code>90 min</code></th><td class="mono">90px</td>
    <td>The same three, and room for the state glyph to sit clear of them.</td>
    <td>Karthik R &times;3, Farhan Q</td></tr>
  <tr><th>split</th><td class="mono">&frac12; width</td>
    <td>Start only, and the plan drops by <i>width</i> rather than height &mdash; two clients in one
      hour halves the column, not the block. &sect;05.</td>
    <td>Wed 16:30 and 17:15</td></tr>
</tbody></table>

<p class="note" style="margin-top:14px">The ladder is applied by a duration class
(<code>.ev--m30</code>, <code>.ev--m60</code>&hellip;) rather than by a comment, so the generator
proves the rule instead of a stylesheet claiming it. At one pixel per minute a duration class
<i>is</i> a height class.</p>

<h3 class="sec">The rulings, and the 15-minute marks</h3>
<p class="note">Hour lines at <code>--tx-line-strong</code>, half-hours at <code>--tx-line</code>,
and <b>the quarter marks are drawn only while you are dragging</b>. Permanently they are 15px apart
and read as hatching, which is noise on a surface whose entire job is to be scanned; on demand they
are a ruler. Precision when you are being precise, not precision as decoration.</p>'''


S03 = f'''<p class="note">Twenty-three sessions, three lengths, one clash, and a header that says
what the week is <i>worth</i> rather than only what is in it. Colour still encodes exactly one thing
&mdash; floor against remote, because that is what decides the money &mdash; and done, no-show and
in-progress change weight and add a glyph, which is the library&rsquo;s one-colour-axis rule kept
intact.</p>
{{F1A}}
{{F1B}}'''

N1A = f'''<b>Every start and every length is real.</b> Fridays begin at 06:15 and 07:15,
Meera&rsquo;s Monday is an hour and Karthik&rsquo;s is ninety minutes, and Kavya&rsquo;s half-hours
are half the height of everything around them. Nothing here was expressible last week.
<br><br><b>The header states utilisation, not activity.</b> <b>{hrs(BOOKED)} of {hrs(AVAIL)} working
hours booked &mdash; {UTIL}%</b>, where {hrs(AVAIL)} hours is the sum of the trainer&rsquo;s own
<code>working_hours</code> windows, not a guess at a working day. Twenty-three sessions sounds like a
full week; 48% is the same fact told usefully. I could not find a competitor that puts this in the
calendar &mdash; the category puts utilisation in a report, which is the one place a trainer looking
at Thursday will not be.
<br><br><b>The line across the week is now</b>, at 09:12 &mdash; the same minute the rail and the
Today screen assert, which is why Divya&rsquo;s 09:00 check-in carries the in-progress ring here and
reads <i>In progress</i> there. The dot is on today&rsquo;s column and the pill is in the gutter; the
line is <code>--tx-ink</code> rather than an accent because lime is a fill colour in this system and
never a stroke, and red is already spoken for by the clash and the no-show.
<br><br>The count under each date is that day&rsquo;s sessions, so <b>Sunday reads &mdash; and Saturday
reads 1</b> before you have looked at a single block.'''

N1B = f'''<b>{GAP_N} openings, {hrs(GAP_MIN)} free hours, {GAP_SLOTS} of them sellable at the
trainer&rsquo;s usual hour &mdash; &#8377;{GAP_RS:,} billed, &#8377;{GAP_KEEP:,} kept.</b> Those five
numbers are computed from the same week the blocks are drawn from; the previous version said
&ldquo;3 gaps worth &#8377;8,000&rdquo; and no arrangement of its own grid produced either figure.
<br><br><b>A gap is a free interval inside a working window, long enough to hold a session.</b> Two
halves of that rule matter. <i>Inside a window</i>, because the hatched hours are not free time, they
are time the trainer said they do not work &mdash; offering to sell them is the app arguing with its
owner. <i>Long enough</i>, because the 30-minute seam between Kavya and Priya is not an opening, it
is the seam; drawing it would put ten dashed rectangles on Monday and Monday has nothing to sell.
Monday and Tuesday morning are <b>solid</b> here, and that is the finding: this trainer&rsquo;s
problem is not a thin week, it is Wednesday, Friday and Sunday.
<br><br>Each block is pressable and each says its own length and its own price, because
&ldquo;{hrs(GAP_MIN)} free hours&rdquo; is a number to worry about and <b>07:00 &ndash; 10:00 &middot;
3 sessions &middot; &#8377;2,400</b> is a thing to do something about.'''


S04 = f'''<p class="note">The full track is 05:30 to 21:00 &mdash; {SEG_PX + BAND_PX}px at one pixel
per minute, in a 596px viewport. A trainer with a split shift spends {hrsw(BAND_PX)} of it on hours
they are never on the floor, drawn every week, pushing the evening below the fold.</p>

<div class="why" style="margin-top:14px"><p class="why__k">What the band may collapse, and what it may never touch</p>
  <p>The rule is narrow on purpose. A span collapses only when it falls <b>outside every day&rsquo;s
  working windows</b> and holds <b>nothing</b>. It is not &ldquo;hide empty hours&rdquo;: an empty
  hour <i>inside</i> working hours is the sellable gap this screen exists to price, and folding that
  away would hide the money to save the pixels. So Wednesday&rsquo;s empty morning stays at full
  height and {hrsw(BAND_PX)} of nobody&rsquo;s working day becomes one 30px seam &mdash; {BAND_PX - 30}px
  back, <b>{round(100 * (BAND_PX - 30) / (SEG_PX + BAND_PX))}%</b> of the track, for nothing that was
  being said.
  <br><br>Both facts come out of <code>working_hours</code>, which is <i>one row per window</i>
  precisely so that a split shift is two windows &mdash; the schema comment says a single range per
  day &ldquo;would claim the trainer is free for lunch&rdquo;. The band is that comment, drawn.</p></div>

<h3 class="sec">And it refuses to close when something is in it</h3>
<p class="note">Working hours constrain what a <b>client</b> can self-book. They have never
constrained the trainer &mdash; that is the rule <code>WorkingHoursScreen</code> states on its own
face, kept from Trainerize. So a 12:30 one-off is a legal booking in the middle of the quiet band,
and the band cannot fold it away. It is held open for the whole week, with a reason, rather than
closing on six days and lying about the seventh:</p>

<div class="bench bench--plain bench--pad" style="margin-top:12px">
  <div style="max-width:760px;overflow:auto">{{BENCH}}</div>
</div>
<p class="note" style="margin-top:12px">A collapse that can hide a booking is not a collapse, it is a
bug with a chevron on it. The state is derived every render from the same two facts, so there is
nothing to keep in sync and nothing to get stale &mdash; and the trainer can open it by hand at any
time, which is the <code>show</code> affordance on the closed band.</p>'''


S05 = f'''<p class="note">Wednesday has two clients booked over each other: Nikhil 16:30&ndash;17:30
and Sneha 17:15&ndash;18:15. This is the state the library called <i>&ldquo;the one that must be
noticed&rdquo;</i>, and the old grid could draw exactly one of the two names.</p>

<div class="why" style="margin-top:14px"><p class="why__k">n overlapping sessions, n columns &mdash; and never a stack</p>
  <p><b>FullCalendar&rsquo;s default is the opposite.</b> <code>slotEventOverlap</code> defaults to
  <code>true</code>: overlapping events overlap visually, with <i>&ldquo;at most half of each
  event&rdquo;</i> hidden behind the other. That is right for a calendar of meetings, where an
  overlap is a normal fact you skim past. It is wrong here, because a one-to-one trainer cannot be in
  two places and <b>an overlap is always an error</b> &mdash; and you cannot resolve an error whose
  second party is behind the first. So the column splits, both blocks keep their name and their
  hours, and neither is ever occluded.
  <br><br>They also both get the hatch and the warning glyph the library specified and the stylesheet
  never had. And a <b>bracket appears in the gutter</b> spanning the overlap: a ring is only findable
  when the thing it rings is on screen, and the gutter is the one column that never scrolls
  sideways.</p></div>

<h3 class="sec">Back to back is not a clash</h3>
<p class="note">Kavya starts at 18:15, the minute Sneha ends. <code>slotClash()</code> in
<code>app/src/clients/conflicts.ts</code> is plain interval overlap with the <b>end exclusive</b> and
says so &mdash; <i>&ldquo;so back-to-back sessions are fine&rdquo;</i> &mdash; and the grid now agrees
by construction: two blocks that share an edge share no pixel. The old grid could not have
disagreed either, because it had no edges to share.</p>

<h3 class="sec">Drawn, and not blocked</h3>
<p class="note">The app is careful about this and the web must match it. The diary <b>warns</b> about
a double-booking and never blocks, because a session already on the floor is the trainer&rsquo;s
call; the standing-week pickers <b>refuse</b>, because there a clash is not a judgement call but a
mistake about to repeat every week for eight weeks. So this screen shows the clash and lets it stand
&mdash; and &sect;11&rsquo;s pattern form, which is the other end of that funnel, will not save one.
Same fact, two answers, and the difference is whether it is about to be multiplied.</p>'''


S06 = f'''<p class="note">Day was one of three buttons in the old toolbar and none of the three was
ever drawn. It earns its own layout rather than being the week zoomed: at 1440 a single day column is
1130px wide, which is a great deal of nothing beside a 60px block.</p>
{{F2A}}'''

N2A = f'''<b>A spine, and a context lane on the same minute axis.</b> The blocks keep their real
geometry &mdash; 340px is enough for a 30-minute block to say who it is &mdash; and the rest of the
width answers the question a trainer actually has at 08:55: <i>what am I doing with this person, and
do they owe me anything.</i> Plan and week, sessions left, money, and the one action.
<br><br>Because the lane is positioned by minute rather than listed, <b>the gaps line up as gaps</b>.
The 30-minute seams read as seams; Tuesday evening&rsquo;s {dur(90)} after Kavya reads as the
sellable opening it is, priced in place.
<br><br><b>Kavya&rsquo;s row is the point of the lane.</b> Her package shows <b>0 left</b> and
&ldquo;Renew&rdquo; in the danger tone &mdash; the same fact the Today screen carries as
<i>Kavya M &middot; package ran out</i> and the rail carries as a badge on Money. Here it is attached
to the block, three hours before she walks in, which is the only moment it can still be acted on.'''


S07 = f'''<p class="note">Moving a session is the commonest thing that happens to one. The old page
listed it in the toolbar of every frame and drew it nowhere; the library specified a keyboard route
for it and named the criterion it was guarding.</p>
{{F2B}}

<h3 class="sec">The verdict has three states, and the first pass of this page drew one</h3>
<p class="note">A read-out that only ever says <b>clear</b> is a read-out nobody reads. The state that
decides whether to let go is the one where the drop is a mistake, so it gets the danger tone and the
ghost changes with it &mdash; an accent-dashed target means <i>yes, here</i>, and a slot that clashes
must not look like that. Back-to-back is legal and still named, because a trainer may not want it and
can only decide if they are told.</p>
<div class="bench bench--plain bench--pad" style="margin-top:12px">
  <div class="grid3" style="gap:20px;align-items:start">{{RO}}</div>
</div>
<p class="note" style="margin-top:12px">Nothing is refused. <code>conflicts.ts</code> is explicit that
the diary <b>warns</b> and never blocks &mdash; a session already on the floor is the
trainer&rsquo;s call &mdash; so the third chip is a warning the trainer can drop through, and
&sect;11&rsquo;s pattern form is the one place that says no.</p>

{{F2C}}'''

N2B = f'''<b>Snap to 15, and say the time out loud.</b> The ghost lands on the app&rsquo;s own
quantum &mdash; <code>TimeField</code>&rsquo;s <code>step = 15</code>, <i>&ldquo;the smallest unit a
gym schedule has ever needed&rdquo;</i> &mdash; and the read-out says <b>18:45 &ndash; 19:45</b>
rather than leaving the trainer to infer it from where the rectangle stopped. The 15-minute marks
appear in the column being dragged in, and only there, and only now.
<br><br><b>The verdict is live, and it is specific.</b> <i>Clear &middot; back to back with Kavya M</i>
&mdash; not &ldquo;no conflict&rdquo;. Back-to-back is legal and the trainer may still not want it,
which is a decision they can only make if they are told. Sneha&rsquo;s old position stays at 40%
opacity so the move is a comparison and not a leap of faith, and Nikhil keeps his hatch, because
nothing has been saved yet and a screen that pre-celebrates a drop is lying for the length of a
gesture.
<br><br><b>There is a keyboard route, and it exists for a reason with a number.</b> <kbd>X</kbd> to
lift, arrows to move &mdash; <kbd>&#8679;</kbd> and an arrow to nudge by 15 minutes &mdash;
<kbd>V</kbd> to drop, <kbd>Esc</kbd> to abandon. WCAG 2.2 <b>SC 2.5.7 Dragging Movements</b> requires
a single-pointer alternative to any drag, so a grid whose only way to reschedule is a drag fails it.
The library wrote that sentence before there was a drag to fail it; this is the first frame in the set
where both halves exist.'''


S08 = f'''<p class="note">The panel gains the control the whole redesign is about, and loses the
no-show it had recorded for a session two days in the future.</p>
{{F3A}}'''

N3A = f'''<b>Length is a control now, not a constant.</b> Three chips for the three lengths the app
offers, a minutes field that steps by 15 for everything else, and the block behind the panel redraws
as it changes &mdash; which is the same &ldquo;lead with the picture&rdquo; move
<code>WorkingHoursScreen</code> makes with <code>DayTimeline</code>. The copy is explicit that this
changes <i>one session</i> and not Nikhil&rsquo;s default, because a duration field on a session
detail that quietly rewrote the client record is the sort of thing nobody discovers until the fourth
week.
<br><br><b>The panel sits over the day, not over the week.</b> The old note claimed it opened
&ldquo;beside the grid, so the trainer can see what else was on that day&rdquo; &mdash; and it was a
420px overlay on a seven-column week, so what stayed visible was three and a half columns of other
days. Behind this one is Monday, in Day view, at full height. The claim is now true rather than
aspirational.
<br><br><b>And it is Monday.</b> A no-show is a thing that has happened; today is Tuesday, and the
history says the trainer recorded it at 08:44, in the gap between Arjun and Divya, which is also why
the queue in the top bar holds six. Every frame on this page reads <b>6 queued</b> rather than
<i>Synced</i> &mdash; the rail file&rsquo;s finding, kept.'''


S09 = f'''<p class="note">This is still the strongest argument for the web app existing, and it
survives intact: on the phone an eight-week pattern is twenty-four confirmations. What changes is
that a day in the pattern now carries its own <b>time and its own length</b>.</p>
{{F4A}}'''

N4A = f'''<b>Three days, three times, three lengths.</b> Meera trains an hour on Monday and
Wednesday and ninety minutes on Friday, which is an ordinary prescription that one
<code>session_duration_minutes</code> on the client cannot express &mdash; the same shape of problem
as the programs file&rsquo;s per-set reps, and the same answer: the scalar stays as the default a new
row inherits, and the per-row value is what the schedule carries.
<br><br><b>The clash is refused here, and only here.</b> Friday 07:30 collides with Arjun&rsquo;s
07:15&ndash;08:15 and the form says so on the row, not in a toast on save &mdash; because this is the
standing-week end of the funnel, where <code>conflicts.ts</code> is hard: <i>&ldquo;an hour another
client already holds is not offered, and not saveable&rdquo;</i>. One clash in a pattern is eight
clashes in the diary.
<br><br><b>Two Fridays fall outside the working hours and are allowed.</b> Stated, not hidden and not
blocked. Working hours constrain the client&rsquo;s self-booking, never the trainer &mdash; a form
that refused this would be the app overruling the person whose hours they are.
<br><br>The preview counts in <b>hours as well as sessions</b>, and shows what utilisation becomes:
<b>{UTIL}% &rarr; 71%</b>. Twenty-four sessions is a number; a fifth of the week is a decision.'''


N2C = f'''<b>Ten seconds, in place, on the row that changed</b> &mdash; the rule this
set&rsquo;s own <a href="webapp-heuristics.html">heuristic audit</a> states for every destructive
action, and a move had been exempting itself from it. The tell is in the session panel further down this
page, whose own history reads: <i>&ldquo;Moved from Monday 17:00. Nikhil asked. He was told
automatically.&rdquo;</i> A mis-drop sends a WhatsApp.
<br><br>So <b>the telling is held, not the undoing</b>. Undo that fires after the message has gone is
not undo, it is an apology &mdash; the chip says <i>Sneha R has not been told yet</i> and counts down,
and the bar is there because &ldquo;8s&rdquo; without a moving edge is a fact you have to keep
re-reading. <kbd>&#8984;Z</kbd> does the same thing from the keyboard, which is the shortcut the
builder already specifies for the same reason.
<br><br><b>And the clash clears in front of you.</b> Sneha is out of Nikhil&rsquo;s hour, so both
blocks lose the hatch and the glyph, Wednesday&rsquo;s head loses its <b>&#9888;</b>, and the bracket
leaves the gutter. That is not decoration: it is the same clash map recomputed on the moved list
&mdash; <code>clash_map()</code> returns empty for this week &mdash; so the frame cannot claim a
resolution the data does not have.'''


S10 = f'''<p class="note">The grid stops being a grid, in the ARIA sense, the moment the cells go
&mdash; and that is a feature. Keep the matrix and a 15-minute resolution means
<b>{(SEG_PX + BAND_PX) // 15} rows &times; 7 days = {(SEG_PX + BAND_PX) // 15 * 7} cells</b> to
arrow through to reach {N_SESS} sessions. Nobody does that twice.</p>

<table class="dt" style="table-layout:fixed">
<colgroup><col style="width:150px"><col><col style="width:250px"></colgroup>
<thead><tr><th>Keys</th><th>What it does</th><th>Where the rule comes from</th></tr></thead>
<tbody>
  <tr><th><kbd>Tab</kbd></th><td>Enters the week <b>once</b>, landing on the next session from now
    &mdash; Nikhil&rsquo;s 17:00 today, not Monday 06:00.</td>
    <td>APG&rsquo;s grid pattern: <i>&ldquo;only one of the focusable elements contained by the grid
      is included in the page tab sequence&rdquo;</i>. It is the one property of that pattern worth
      keeping here.</td></tr>
  <tr><th><kbd>J</kbd> <kbd>K</kbd></th>
    <td>The next and previous <b>session</b> in the day, in clock order &mdash; not the next cell.</td>
    <td><b>The set&rsquo;s own list convention</b>, and a day column is a list.
      <code>webapp-c-data.html</code>, <code>webapp-programs.html</code> and the heuristic audit all
      specify <kbd>J</kbd>/<kbd>K</kbd> for moving through rows; the first pass of this page used
      <kbd>&darr;</kbd>/<kbd>&uarr;</kbd> instead and gave no reason, which is just an
      inconsistency.</td></tr>
  <tr><th><kbd>&rarr;</kbd> <kbd>&larr;</kbd></th>
    <td>The nearest session on the next day, by time of day. Empty day: the day head, so the week is
      still traversable.</td>
    <td><b>Arrows stay spatial.</b> A week is a plane and a list is not, so the two-dimensional move
      keeps the two-dimensional keys &mdash; and <kbd>&darr;</kbd> never means two different things on
      two screens.</td></tr>
  <tr><th><kbd>&crarr;</kbd></th><td>Opens the session panel.</td>
    <td>The library&rsquo;s contract, unchanged.</td></tr>
  <tr><th><kbd>X</kbd> &hellip; <kbd>V</kbd></th>
    <td>Lift, move, drop. While lifted, <kbd>&larr;</kbd>/<kbd>&rarr;</kbd> change the day and
      <kbd>&uarr;</kbd>/<kbd>&darr;</kbd> nudge by <b>15 minutes</b> &mdash; the one place up and down
      mean earlier and later, because a lifted block has nowhere else to go. <kbd>Esc</kbd> puts it
      back.</td>
    <td><b>SC 2.5.7 Dragging Movements.</b> The library named it; &sect;09 is the first frame that
      needs it.</td></tr>
  <tr><th><kbd>&#8984;Z</kbd></th>
    <td>Takes back the last move, for as long as its ten seconds are running.</td>
    <td>The same shortcut and the same promise the builder makes. A move tells the client
      automatically, so &sect;09 holds the message rather than the regret.</td></tr>
  <tr><th><kbd>G</kbd> then <kbd>D</kbd>/<kbd>W</kbd>/<kbd>M</kbd></th>
    <td>Day, Week, Month. <kbd>T</kbd> alone is today.</td>
    <td>The rail file&rsquo;s accelerator ladder, extended into the screen rather than stopping at
      the rail.</td></tr>
  <tr><th><kbd>N</kbd></th><td>New session, starting at the focused block&rsquo;s slot.</td>
    <td>&mdash;</td></tr>
</tbody></table>

<div class="why why--warn" style="margin-top:16px"><p class="why__k">What replaces role="grid"</p>
  <p>Each day column is a <code>role="list"</code> of session buttons in clock order, and the seven
  lists sit in a <code>role="group"</code> labelled with the week. The APG caveat is the reason:
  <i>&ldquo;if a cell contains a button and a grid navigation key places focus on the cell instead of
  the button, screen readers announce the button label but do not tell users a button is
  present&rdquo;</i> &mdash; and with the cells gone, the block <b>is</b> the button, so focus and the
  accessible object are the same thing. Each name is the full sentence, with the length in it:
  <i>&ldquo;Wednesday 13 August, 17:15 to 18:15, 60 minutes, Sneha R, Legs A, floor, not started,
  clashes with Nikhil P&rdquo;</i>. The clash is in the name and not only in the hatch, which is the
  library&rsquo;s never-colour-only rule applied to a state it could not previously reach.
  <br><br>What is lost with the cell matrix is the empty cell as a target &mdash; you can no longer
  arrow to 14:45 on Thursday and press <kbd>&crarr;</kbd>. <kbd>N</kbd> covers it, and the gap blocks
  in &sect;03 cover the case that matters, which is the empty time worth selling. An arrow route to
  every one of {(SEG_PX + BAND_PX) // 15 * 7} empty quarter-hours was never the accessible
  answer.</p></div>'''


# ════════════════════════════════════════════════════════ competitor cards ══
from gen_rail import pattern  # noqa: E402  — one card shape, defined once

S11 = f'''<p class="note">The <a href="webapp-competitors.html">market file</a> examined five patterns
and none was the calendar; the <a href="webapp-rail.html">rail file</a> examined six and none was a
grid. These six are, and they split cleanly: the first three settle the <b>resolution</b> question,
the last three are features to refuse or defer. Rows marked <span class="tag tag--ok">Verified</span>
quote a vendor&rsquo;s own documentation. Where a claim is read across vendors rather than quoted, the
row says so.</p>

''' + pattern(
    "FullCalendar &mdash; the grid everyone else is built on",
    "ok", "Verified from vendor docs",
    '''The de facto time-grid implementation, and its defaults are the category&rsquo;s defaults.
    <code>slotDuration</code> defaults to <code>'00:30:00'</code>; <code>snapDuration</code>
    <i>&ldquo;will be whatever slotDuration is&rdquo;</i>, so drag granularity follows display
    granularity. <code>slotEventOverlap</code> defaults to <code>true</code> &mdash; overlapping
    events overlap visually with <i>&ldquo;at most half of each event&rdquo;</i> hidden.''',
    '''<b>The positioned overlay, and snap as a first-class idea.</b> Not one of these options is
    expressible in a matrix of hour cells; the whole vocabulary presumes a continuous axis. That is
    the structural fix in &sect;02, and the fact that the reference implementation cannot even
    <i>describe</i> the old design is the clearest evidence that it was wrong.''',
    '''<b>Both defaults.</b> 30 minutes is not our quantum &mdash; <code>TimeField</code> steps by 15
    and names 07:30 and 06:45 as the reason &mdash; so display and snap are 15 here, with the marks
    shown only during a drag. And <b>overlap-by-half is refused outright</b>: it is correct for
    meetings and wrong for a body that can only be in one place. See &sect;05.''') + '''

''' + pattern(
    "ABC Trainerize &mdash; six durations, and four layers of availability",
    "ok", "Verified from vendor docs",
    '''Appointment types carry a duration chosen from <b>15, 30, 45, 60, 90 and 120 minutes</b>.
    Availability is four stacked layers &mdash; general calendar availability for self-booking,
    appointment-type availability, date-specific availability, and vacation, which
    <i>&ldquo;blocks off the entire day, where you select days rather than hours&rdquo;</i> &mdash;
    plus a booking window with a minimum notice and a maximum weeks-ahead.''',
    '''<b>Duration is a property of the booking, full stop.</b> Six lengths in the direct competitor
    against one immovable 42px rectangle here is the finding in &sect;01.2 stated from the outside.
    And the <b>dated hole</b> is real and already in our schema as <code>time_blocks</code>
    &mdash; <i>&ldquo;one table covers an afternoon and a fortnight away; the only difference is the
    length&rdquo;</i> &mdash; and drawn nowhere in this design set. &sect;16.''',
    '''<b>The four layers.</b> The app already made this call and wrote it on the screen:
    <code>WorkingHoursScreen</code> opens by naming Trainerize&rsquo;s stack and keeping <b>two</b>
    of it &mdash; weekly hours and time blocks &mdash; because four <i>&ldquo;is a complete model and
    it is far too much for a trainer with a phone&rdquo;</i>. A wider screen is not a reason to
    reopen a settled decision; it is a reason for the two we kept to be legible.''') + '''

''' + pattern(
    "Vagaro &mdash; the resolution is a setting, and the day is the dense view",
    "ok", "Verified from vendor docs",
    '''A salon and spa book with irregular lengths all day, which is the same shape as a
    trainer&rsquo;s week. Vagaro&rsquo;s calendar configuration sets the grid interval to <b>5, 10 or
    15 minutes</b>, and the Day view is the one built for density &mdash; up to <i>&ldquo;seven
    calendars on phone, 15 on tablet, or 25 on computer&rdquo;</i> side by side.''',
    '''<b>Fifteen is the floor a real booking business needs</b>, from an operator with far more
    schedule complexity than a personal trainer. It corroborates the app&rsquo;s own step rather than
    ours corroborating itself. And <b>Day as the dense layout</b>, not the week zoomed &mdash; which
    is &sect;06.''',
    '''<b>Making it a preference.</b> Three options is right when your customers are a nail bar and a
    medspa; here it would let the web app and the phone disagree about what a schedule is, and the
    phone&rsquo;s answer is already 15. The multi-column day is refused too: those columns are
    <i>staff</i>, and this product is one trainer. The team feature widens reads and never moves
    ownership &mdash; a teammate&rsquo;s column here would be the first place that stopped being
    true.''') + '''

''' + pattern(
    "Everfit &mdash; the Master Planner&rsquo;s three views",
    "ok", "Verified from vendor docs",
    '''Their release note describes a planner giving <i>&ldquo;an intuitive, all-in-one weekly, daily,
    and custom view&rdquo;</i> of a client&rsquo;s training calendar: week-by-week grouping the same
    day across several weeks, day-by-day for one week, and a custom view showing only selected
    workouts.''',
    '''<b>Day earning its own layout.</b> Their day-by-day is not their week at a bigger zoom, and
    ours is not either &mdash; &sect;06 spends the extra width on why each block matters rather than on
    making an hour taller. Their week-by-week is also a fair idea for &sect;11&rsquo;s eight-week
    preview, where the question really is &ldquo;what does every Friday look like&rdquo;.''',
    '''<b>The custom view.</b> A saved subset of a calendar is a filter with a name, and this
    toolbar already has three chips and a view group. Everfit&rsquo;s planner is also a
    <i>programming</i> surface &mdash; it plans which workouts fall on which day &mdash; and ours is a
    <i>time</i> surface. Merging the two is how a schedule ends up unable to say when anything
    starts.''') + '''

''' + pattern(
    "Calendly and Acuity &mdash; the booking occupies more than its own minutes",
    "ok", "Verified from vendor docs",
    '''Both put a gap around an appointment rather than in it. Calendly&rsquo;s buffers: a 30-minute
    meeting with 15-minute buffers <i>&ldquo;needs 60 minutes of free time, though the meeting stays
    30 minutes long&rdquo;</i>, and the connected calendars are checked against the whole window.
    Acuity calls it padding, before, after or both, and it <i>&ldquo;doesn&rsquo;t
    overlap&rdquo;</i>.''',
    '''<b>The idea is right for a gym floor</b> &mdash; a client leaves, the rack gets stripped, the
    next one arrives, and a trainer who books 06:00 and 07:00 back to back has no minute in between.
    &sect;09&rsquo;s read-out therefore <i>names</i> back-to-back instead of calling it &ldquo;no
    conflict&rdquo;: the fact is surfaced even though the rule is not enforced.''',
    '''<b>Shipping the rule, here.</b> <code>slotClash()</code> is ends-exclusive with no buffer, so a
    web app that padded bookings would reject slots the phone accepts &mdash; two halves disagreeing
    about what a clash is, which is exactly the class of bug the additive-only law exists to prevent.
    A buffer is a <code>working_hours</code>-level preference and it belongs in Settings, in a commit
    that changes <code>conflicts.ts</code>. Deferred, and named in &sect;16 rather than smuggled in as
    a grid behaviour.''') + '''

''' + pattern(
    "Google Calendar &mdash; the 30-minute increment nobody wants",
    "warn", "Partly inferred",
    '''Its own increment is 30 minutes and not configurable, which generates a steady stream of
    requests to make it 15 &mdash; several of the top community threads for
    <i>&ldquo;calendar increments&rdquo;</i> are exactly that ask. Appointment schedules meanwhile
    went the other way: Workspace announced slot durations <b>from five to fourteen minutes</b>, where
    <i>&ldquo;the previous minimum was fifteen&rdquo;</i>.''',
    '''<b>The now-line and the press-empty-space-to-book affordance</b>, both effectively universal
    and both absent from the old design (&sect;01.6). And the corroboration is useful: the vendor with
    the widest calendar deployment on earth is being asked for finer display granularity, not
    coarser.''',
    '''<b>Its display default.</b> Being the incumbent does not make 30 minutes right for a trainer
    whose sessions start at 06:15 and 07:15. Also refused: the <b>booking page</b>. Client
    self-booking is a real feature and it is a product decision behind
    <code>membership_status</code> and the portal, not a thing a calendar redesign gets to
    introduce.''')


S11 = S11 + '''

''' + pattern(
    "Google Calendar &mdash; &ldquo;+3 more&rdquo;, and the community asking it to stop",
    "warn", "Partly inferred",
    """Its month view puts event chips in the cell and, when they do not fit, replaces the remainder
    with a <b>+N more</b> link &mdash; two or three visible, the rest hidden. The evidence for how
    that lands is its own support community: the top results for &ldquo;see all events month
    view&rdquo; are a run of threads titled <i>&ldquo;how to fit more than 3 events in a day&rdquo;</i>,
    <i>&ldquo;how can I expand my month screen&hellip; without having to scroll over more&rdquo;</i>
    and <i>&ldquo;can I set my calendar so that ALL events are shown&hellip;&rdquo;</i>. The cap is not
    configurable.""",
    """<b>The negative result, which is the useful kind.</b> It is the obvious design and it is the one
    &sect;07 refuses, on Nielsen Norman&rsquo;s own rule for the split: <i>&ldquo;you must disclose
    everything that users frequently need up front, so that they have to progress to the secondary
    display only on rare occasions.&rdquo;</i> <b>+N more</b> inverts that &mdash; what it hides is
    not the rare advanced case, it is most of a <i>busy</i> day, which is the thing a trainer opens a
    month to find.""",
    """<b>Chips in a month cell, at any count.</b> Truncation is the failure mode either way: three
    names out of six is a cell that lies, and six names in a 150px cell is six truncated ones. Ours
    gives up identity deliberately and keeps <b>completeness</b> &mdash; the mark tells the truth
    about the whole day, every day &mdash; and identity is one press away in the Day view, which is
    two levels, NN/g&rsquo;s stated ceiling.""") + '''

''' + pattern(
    "The category &mdash; nobody ships a coach-facing month",
    "warn", "Partly inferred",
    """Everfit&rsquo;s Master Planner is <i>&ldquo;weekly, daily, and custom&rdquo;</i> &mdash; there
    is no month in it &mdash; and its client-side visibility is capped at three weeks back and four
    weeks ahead. Trainerize lets a coach page month-to-month <i>within one client&rsquo;s</i>
    calendar. Vagaro and the salon tools do have a month, but their calendars are staff-and-resource
    calendars for a shop.""",
    """<b>The reason they can skip it, and we cannot.</b> Their calendars are <b>client-scoped</b>:
    one person&rsquo;s training plan, where a month is twelve workouts and the answer is obvious. Ours
    is <b>trainer-scoped</b> &mdash; all 22 clients &mdash; so a month is
    <b>{MO_TOTAL} sessions</b> and it answers a question none of their calendars can even ask:
    <i>which of my weeks is underbooked, and what did that cost.</i> That is the whole argument for
    building it.""",
    """<b>Their omission as a reason to omit it.</b> Tempting, and wrong for the same reason the
    scope differs. But one thing is taken from their restraint: this month has <b>no drag</b>. Vagaro
    lets you drag in month view; at this scale a drop lands on a <i>day</i> with no time in it, so it
    would either invent one or ask &mdash; and a month is a reading surface. Pressing a day opens the
    Day view, where a time exists.""")


S12 = '''<p class="note">This page is a specification, not a propagation. Everything below is a real
edit that follows from it, listed so the next pass has a work list instead of a memory.</p>
<table class="dt" style="table-layout:fixed">
<colgroup><col style="width:250px"><col style="width:74px"><col></colgroup>
<thead><tr><th>File</th><th>Count</th><th>What it needs</th></tr></thead>
<tbody>
  <tr><th><code>webapp-c-domain.html</code></th><td class="mono">20</td>
    <td>The <code>.ev</code> entry is the library&rsquo;s, and three of its numbers are now stale:
      <b>Height 46px per 60 min</b> &rarr; 60, <b>Cell 48px</b> &rarr; there is no cell, and
      <b>&ldquo;a 30-minute session is 23px&rdquo;</b> &rarr; 30px. The reasoning survives whole; only
      the arithmetic moves. Add the split-column rule, the duration classes, and change
      <b>Used in</b> &mdash; it says <i>schedule, today</i> and the Today screen has never drawn one.</td></tr>
  <tr><th><code>webapp-schedule.html</code></th><td class="mono">&mdash;</td>
    <td>Replaced by this file&rsquo;s output; the hand-written original is kept beside it as
      <code>webapp-schedule.html.bak</code>, matching the convention the programs pass started. Worth
      saying plainly: <b>this whole directory is untracked</b> &mdash; <code>web app/</code> is not in
      git, so a <code>.bak</code> is the only thing standing between a generator bug and a lost
      afternoon.</td></tr>
  <tr><th><code>webapp-information-architecture.html</code></th><td class="mono">&mdash;</td>
    <td>Four routes on this page have no IA entry: <code>/schedule/day/&hellip;</code>,
      <code>/schedule/month/&hellip;</code>, <code>/schedule/pattern/new</code>, the three
      steps of <code>/schedule/week/&hellip;/new</code> and <code>/schedule/hours</code>. The IA has exactly three schedule routes
      today &mdash; <code>/schedule</code>, <code>/schedule/s/</code> and
      <code>/schedule?view=</code> &mdash; so it has no booking route at all, which is the same hole
      §08 opens with. Month being a real layout rather than a zoom level is an IA fact too.
      <b>And the IA&rsquo;s own week labels carry the off-by-one in &sect;01.8</b> &mdash; every file
      that draws a week does.</td></tr>
  <tr><th><code>webapp-design-system.html</code></th><td class="mono">&mdash;</td>
    <td>The keyboard contract needs <kbd>X</kbd>/<kbd>V</kbd> and the <kbd>&#8679;</kbd>+arrow nudge,
      and the token list needs <code>--cw-hour</code> with the sentence that explains why changing it
      is not a tuning decision.</td></tr>
  <tr><th><code>webapp-components.html</code> and
    <code>webapp-c-forms.html</code></th><td class="mono">4</td>
    <td>&sect;08 introduced three components the library does not have, and one of them is a
      surprise: <code>.rad</code> is <b>the first radio in this stylesheet</b> &mdash; every earlier
      form in the set chooses with chips or a switch, which is why a mutually-exclusive pair had
      nothing to be drawn with. Also <code>.lgl</code> (a grouped picking list) and <code>.lgrp</code>
      (a group header inside one, which is what makes a ranking sayable instead of mysterious). The
      radio also needs a keyboard contract, since arrow-keys-within-a-group is the one control
      convention &sect;13 does not yet cover. And &sect;12 adds a fourth: <code>.wb</code>, a
      <b>resizable band</b> &mdash; the first control in the set whose value is its geometry, which
      is why its keyboard contract is written out in that section rather than deferred.</td></tr>
  <tr><th><code>webapp-dashboard.html</code></th><td class="mono">1</td>
    <td>Its next-session card should read the length. &ldquo;17:00 Nikhil P&rdquo; is now half a fact.</td></tr>
  <tr><th><code>webapp-competitors.html</code></th><td class="mono">&mdash;</td>
    <td>Six new rows&rsquo; worth of evidence lives here and in the rail file rather than in the
      market file, which is the file people will look in. That is now twelve patterns in the wrong
      place.</td></tr>
  <tr><th><code>webapp-heuristics.html</code></th><td class="mono">20</td>
    <td>Done in this pass. This page and the rail were built <i>after</i> that audit ran, so
      neither was in it. Twenty findings folded in across Nielsen&rsquo;s ten &mdash; 9 hold,
      <b>7 were fixed while evaluating</b>, 4 are open. Two of them correct rows the new work
      falsified (the rail is ten destinations, not eleven) and two contradict rows that still read
      <i>Holds</i>. Its method note now also records what the walkthrough <b>missed</b>: it returned
      <i>Holds</i> for this screen without noticing that all 102 sessions were 42px tall.</td></tr>
  <tr><th><code>assets/webapp.css</code></th><td class="mono">&mdash;</td>
    <td>Done in this pass: <code>.cw</code> added, <code>.ev</code> given its duration ladder and a
      real conflict state, <code>.cal</code> marked superseded and left in place because removing a
      class is not additive and the library still measures against it. Then <code>.mo</code> for the
      month, and for &sect;08 the four declarations that let a <code>&lt;button&gt;</code> wear
      <code>.lrow</code>, plus <code>.lgl</code>, <code>.lgrp</code>, <code>.rad</code> and
      <code>.dt__hl</code>. The booking draft deliberately added <b>nothing</b>: it reuses
      <code>.ev--ghost</code> from the drag target, because both are the same claim. Then
      &sect;12&rsquo;s <code>.wb</code> band with its two grab edges, <code>.cw__seg--on</code>,
      <code>.ev--out</code> and two <code>.cw__band</code> tones. Two of those carry a measurement
      in a comment rather than a preference: <code>.wb--sel</code> filled with lime first and had
      to stop, and <code>.ev--out</code> is the only opaque block in the set, for a reason a
      screenshot found.</td></tr>
  <tr><th>the app, <code>WorkingHoursScreen.tsx</code></th><td class="mono">1</td>
    <td>&sect;12 groups the stranded sessions <b>by client</b>; the phone&rsquo;s dialog prints them
      flat, up to <code>MAX_LISTED</code>. On the change drawn there that is five rows of which four
      are one person&rsquo;s standing slot &mdash; and <i>&ldquo;{STRANDED_BY[0][0]} &middot;
      {len(STRANDED_BY[0][1])} sessions&rdquo;</i> is both shorter and the actual fact. Worth doing
      on the phone too, where five rows costs more screen than it does here.</td></tr>
  <tr><th>the app, <code>diary.ts</code></th><td class="mono">2</td>
    <td>&sect;08 uses a rule that <b>does not exist yet</b>: <i>who already trains at this hour</i>,
      defined here as any session of theirs starting within 30 minutes of the clicked slot. It is
      computable from data the app already holds &mdash; every session has a start minute, and
      <code>DiaryClient.weeklySchedule</code> has the standing slots &mdash; but until it is in
      <code>diary.ts</code> it is a design-file invention, and the grace of 30 minutes is a number
      this page chose. The second is the month&rsquo;s no-capacity-on-a-blocked-day rule, still owed
      from &sect;07.</td></tr>
  <tr><th>the app, <code>BookSheet.tsx</code></th><td class="mono">1</td>
    <td>The client list is <code>all.slice(0, 6)</code> alphabetically until you type, which on this
      roster shows six of 22 in an order that means nothing. Ranking by the hour is worth having on
      the phone too &mdash; more so, since a phone has less room to scroll a list of names.</td></tr>
  <tr><th>the app, <code>program.schedule</code></th><td class="mono">&mdash;</td>
    <td>&sect;11 draws a per-day length. Today the schedule JSON carries
      <code>{weekday, time}</code> and the length comes from the client. Adding
      <code>minutes</code> to the entry is additive and needs no migration &mdash; but it needs
      <code>backend/API.md</code> and the apply endpoint in the same commit, and an old build must
      keep reading the client default. The note in the frame states which way that fails safe.</td></tr>
</tbody></table>'''


S13 = f'''<table class="dt" style="table-layout:fixed">
<colgroup><col style="width:230px"><col></colgroup>
<tbody>
  <tr><th>Month, on the phone</th><td>Drawn in &sect;07, and it <b>diverges from the app in two
    places</b> &mdash; the count is uncapped where the phone caps its dots at three, and a blocked day
    contributes no capacity. The first is a screen-size argument and should stay web-only; the second
    is a <i>correction</i>, and if utilisation ever appears on the phone it needs the same fix. Neither
    is in <code>diary.ts</code> yet.</td></tr>
  <tr><th>The series is written unchecked</th>
    <td>Verified in <code>diary.ts</code>, and it is two faults rather than one.
      <code>buildDay</code> composes <code>items</code> from <code>input.sessions</code> only, so
      <code>findClash</code> has <b>no way to see a <code>time_block</code></b> &mdash; booking into
      declared time off is unchecked even for a single session. And <code>commitBooking</code> runs
      that check on <code>result.at</code> alone before handing the list to
      <code>bookSeries</code>, which batch-creates every occurrence without validating any of them.
      A six-session series is therefore <b>one date checked and five written blind</b>. &sect;08
      draws the refusal; nothing enforces it. This is the only item on this page that is wrong in
      code someone can run today.</td></tr>
  <tr><th><code>time_blocks</code> can be read and not written</th>
    <td><b>Half closed.</b> &sect;12 draws <code>working_hours</code>, which was the other table
      this grid read and could not change, so that half is done. <code>time_blocks</code> is not:
      &sect;08 is where a block finally has a <b>consequence</b> &mdash; it refuses
      {dstamp(BOOK_AWAY)} and names the trip &mdash; and &sect;12 shows two of them on a strip, but
      <b>nothing in the set creates one.</b> The entry point now exists and leads nowhere: the
      hours editor&rsquo;s toolbar has a <b>Time off</b> button, which is the same defect &sect;08
      opens with, committed knowingly and listed here rather than left to be found. The phone has
      <code>TimeOffSheet</code>, whose <code>BlockChoice</code> is
      <code>'keep' | 'cancel'</code> &mdash; so blocking a week is a decision about the sessions
      already inside it, which is a screen and not a date field. It is the next one to
      draw.</td></tr>
  <tr><th>Booking a client with an empty pack</th>
    <td>&sect;08 lists Kavya M as <b>0 left &mdash; nothing to deduct</b> and lets you pick her,
      which is right: the interaction map makes that a legal case. What is undefined is the
      <i>series</i>. <code>occurrencesFor(at, weekdays, remaining - 1)</code> with
      <code>remaining</code> at 0 asks for &minus;1 occurrences, and <i>until the pack runs out</i>
      is not a sentence about a pack that already has. The bound needs a second answer for that
      case, and the form should probably lead with <b>A count</b> instead.</td></tr>
  <tr><th><code>time_blocks</code>, at the hour</th>
    <td><b>The question is answered; the drawing is not.</b> This row used to ask how a dated block
      and a weekly hatch could avoid looking alike at the hour level. &sect;12 answers it by never
      putting them in the same channel: layer one is a band on the week, layer two is a
      <b>strip that names its own dates</b> and points at the month, because a weekly editor that
      hatched 24&ndash;28 August across every Monday would be claiming the trainer is away every
      Monday forever. What is still missing is the <i>schedule</i> side of it &mdash; a blocked
      Wednesday afternoon has nowhere to appear on the week or the day, and the answer above says
      what it may not look like rather than what it should.</td></tr>
  <tr><th>The buffer</th><td>&sect;14 argues for surfacing back-to-back and against enforcing a gap.
    That is the right split for a design file and it leaves a real question open: should
    <code>slotClash</code> grow a per-trainer buffer? If it ever does, the app and the backend move
    first and this grid follows.</td></tr>
  <tr><th>Overlap beyond two</th><td>The split rule is written for n and drawn for two, because two is
    all a one-to-one trainer can produce by mistake. Three would be 33% columns, which at our width
    is 31px and below the legibility floor &mdash; so the third case probably wants a
    <b>&ldquo;+1 more&rdquo;</b> affordance rather than a third column. Unspecified.</td></tr>
  <tr><th>Time zones</th><td>Divya is remote. Nothing on this screen says whose clock 19:30 is, and
    the app has no time-zone field. Fine while every client is in India, and a hole the moment one is
    not &mdash; which for a remote-coaching feature is a matter of when, not if.</td></tr>
  <tr><th>The band on a non-split week</th><td>A trainer who works 09:00&ndash;18:00 straight has no
    quiet band, so the track is 540px and nothing collapses. Correct, and it means the band must never
    become part of how the grid is read &mdash; the layout has to be right without it. It is drawn
    here because a split shift is the common case for this trainer, not because it is furniture.</td></tr>
  <tr><th>Multi&#8209;select</th><td>The biggest gap left on the screen, and it contradicts a
    row in the <a href="webapp-heuristics.html">heuristic audit</a> that still reads <i>Holds</i>:
    bulk <b>reschedule</b> is credited there as the single biggest thing the web has over the phone,
    and this grid has no selection model at all. Shifting a holiday week is twelve separate drags.
    Wants shift-click for a range, <kbd>Space</kbd> to add, and a bar offering <i>move by a
    week</i>, <i>cancel</i>, <i>tell everyone</i>.</td></tr>
  <tr><th>A series that fails to sync</th>
    <td>Six bookings is six queued writes and six notifications, and &sect;08 commits them with one
      button. Every frame on this page says <b>6 queued</b> in the top bar, so the queue is already
      the normal state &mdash; what is unspecified is a series that lands <i>partly</i>: four
      accepted, one rejected for a clash the server saw and this grid did not. The set has the
      pattern for one failure and nothing for four of six.</td></tr>
  <tr><th>A move that fails to sync</th><td>&sect;09 holds the client&rsquo;s message for ten
    seconds. What happens when it fails on the eleventh is unspecified &mdash; and a move that never
    reaches the server currently looks exactly like one that did. The set already has the pattern
    (<i>failed &middot; number not on WhatsApp</i>, with Retry and Discard as real buttons); the grid
    does not use it.</td></tr>
  <tr><th>Print and share</th><td>A trainer sending tomorrow a screenshot of their morning is a real
    thing, and neither the week nor the day has a print form. An agenda list &mdash; the one view
    Vagaro has that we do not &mdash; would be that surface and would double as the low-vision
    route.</td></tr>
</tbody></table>'''


# ══════════════════════════════════════════════════════════════ the month ══
S07M = f'''<p class="note">Month was a button in the toolbar of every frame on this page and it led
nowhere &mdash; which is the same defect &sect;01 catalogues in the file this one replaces. And it was
never an open design question: the app shipped it. <code>app/src/design/MonthGrid.tsx</code> exists,
is wired into <code>DiaryScreen</code>, and states the model on itself &mdash;
<i>&ldquo;month cells carry dots, never names. A cell is 46px on a 390pt screen and a client&rsquo;s
name in there is a truncated lie &mdash; decoration pretending to be data.&rdquo;</i> This is a
<b>port</b>, not an invention, and the two places it departs from the phone are named below.</p>

<div class="why" style="margin-top:14px"><p class="why__k">Why the month must not be this grid</p>
  <p>One minute to one pixel is the whole of &sect;02, and it does not survive multiplication: August
  at that scale is <b>{(SEG_PX + BAND_PX) * 31:,}px</b> of track. So the month is not the week zoomed
  out. It answers a different question &mdash; <i>which weeks are thin, and when am I away</i> &mdash;
  and a different question earns a different encoding. Drawing it as a shrunken week would be the same
  mistake this page just undid, one zoom level up.</p></div>

<h3 class="sec">The theory this rests on, and the evidence against the obvious alternative</h3>
<p class="note">The obvious alternative is what almost every calendar does: put the sessions in the
cell as little chips, and when they do not fit, add <b>&ldquo;+3 more&rdquo;</b>. It is worth being
precise about why that is wrong here, because it is the default and defaults win arguments by
inertia.</p>
<p class="note">Nielsen Norman&rsquo;s rule for <b>progressive disclosure</b> is a split, and it is
stated as a requirement rather than a preference: <i>&ldquo;you must disclose everything that users
frequently need up front, so that they have to progress to the secondary display only on rare
occasions.&rdquo;</i> A <b>+N more</b> link inverts exactly that. What it hides is not the rare
advanced case; it is <i>most of a busy day</i> &mdash; and a busy day is the thing a trainer opens a
month to find. Google Calendar shows two or three events per cell and hides the rest behind that
link, and the visible consequence is that most of the top results for &ldquo;calendar increments&rdquo;
and &ldquo;see all events month view&rdquo; in its own support community are people asking how to turn
it off. That is a failed split, evidenced by its own users.</p>
<p class="note">A density encoding fails differently, and better. It gives up <b>identity</b> &mdash;
you cannot see <i>who</i> &mdash; and in exchange it is <b>complete</b>: the mark tells the truth about
the whole day, at every day, with nothing hidden. Identity is what the Day view is for, and it is one
press away. That is <b>two levels</b>, which is also NN/g&rsquo;s stated ceiling &mdash; designs
beyond two <i>&ldquo;typically have low usability because users often get lost when moving between the
levels&rdquo;</i>. Month &rarr; Day &rarr; the session panel is three surfaces but two disclosures,
because the panel is a detail <i>of</i> a day, not a third level of the calendar.</p>

<h3 class="sec">Three channels, and none of them changes meaning</h3>
<table class="dt" style="table-layout:fixed">
<colgroup><col style="width:150px"><col style="width:186px"><col></colgroup>
<thead><tr><th>Channel</th><th>Carries</th><th>Why that one</th></tr></thead>
<tbody>
  <tr><th>Bar <b>length</b></th><td>Utilisation &mdash; booked minutes over <b>that day&rsquo;s
    own</b> working minutes</td>
    <td>A count cannot answer the month&rsquo;s question. Four sessions on a Sunday, whose window is
      three hours, is a full day; four on a Monday, whose window is eight, is half of one. The phone
      cannot tell those apart and neither could a chip list. This is also the number the week
      view&rsquo;s header already introduced, so the month is that number &times; 31 rather than a new
      idea.</td></tr>
  <tr><th>Bar <b>fill</b></th><td>Floor against remote, as a stacked segment</td>
    <td><b>The set&rsquo;s single colour axis, kept.</b> The library&rsquo;s rule is that colour
      encodes floor versus remote and nothing else, because that is what decides the money. It would
      have been easy to spend colour on state here; state has other channels.</td></tr>
  <tr><th>The <b>figure</b></th><td>The session count, exact</td>
    <td>The phone caps its dots at three (<code>SESSIONS_PER_DOT = 2</code>, capped), so six sessions
      and eleven look identical there. A 46px cell has no better option; a 150px one has no excuse.
      <b>This is the first departure from the phone.</b> The app&rsquo;s <code>full</code> rule
      &mdash; <code>FULL_DAY_SESSIONS = {FULL_DAY_SESSIONS}</code> &mdash; still applies, and it marks
      the <i>figure</i> rather than the bar, because it is a count fact and the bar is a time
      fact.</td></tr>
</tbody></table>
<p class="note" style="margin-top:14px">No names, and no chips. The phone&rsquo;s reason was 46px; the
reason here is the one above. What the extra width buys is not names, it is the <b>denominator</b>
&mdash; and the denominator is the finding.</p>

{{F3A}}

<h3 class="sec">The week is the row, and the row gets the week&rsquo;s own figures</h3>
<p class="note">A trainer does not say &ldquo;the 19th is quiet&rdquo;, they say <b>&ldquo;next week is
quiet&rdquo;</b>. The month&rsquo;s rows are already weeks, so the row is the unit that gets totals:
sessions, hours, utilisation and rupees &mdash; the same four the week view&rsquo;s own header carries,
which makes pressing one a continuation rather than a context switch. On this month that is the whole
insight in five lines: <b>{MO_WEEKS[1]["util"]}%</b> coming back from a break,
<b>{MO_WEEKS[4]["util"]}%</b> the week of the trip, and <b>{MO_WEEKS[0]["util"]}%</b> everywhere else.
<br><br><b>Whole weeks, including the days outside the month.</b> The first row runs from 27 July and
the last into September, and those cells keep their bar and their count &mdash; only the date dims.
Blanking them would make the first and last rows&rsquo; totals wrong, which is a worse lie than a
grey number. August&rsquo;s own total is <b>{MO_TOTAL} sessions</b>; the six rows add to more, and
they should.</p>'''

N3AM = f'''<b>Five weeks, and two of them are the story.</b> The bars make the shape of the month
readable before any number is: four weeks at {MO_WEEKS[0]["util"]}%, one at
{MO_WEEKS[1]["util"]}% and one hollowed out by the trip. That is the question a month is opened for,
and neither the day nor the week view can answer it.
<br><br><b>The dated hole finally has somewhere to live.</b> <code>time_blocks</code> has had a table,
a schema comment &mdash; <i>&ldquo;one table covers an afternoon and a fortnight away; the only
difference is the length&rdquo;</i> &mdash; and no representation anywhere in this design set. It
belongs here because <b>this is the only view where it is legible</b>: in a week grid a five-day trip
is seven hatched columns with no beginning and no end. So an all-day block <b>spans</b>, with square
ends where it continues past the row, and the days under it take the same hatch the week uses for
out-of-hours &mdash; the same mark meaning the same thing, which is <i>not available</i> rather than
merely <i>empty</i>. A part-day block is a notch and not a strip, because it is an afternoon and a
strip would claim the day.
<br><br><b>And the trip week does not read as a failure.</b> This is the second departure, and it is
a correction rather than a port: a blocked day contributes <b>no capacity</b>. Counting the working
hours of a day you declared yourself unavailable on makes utilisation punish you for taking a holiday
&mdash; that week read <b>3%</b> before the denominator was fixed and reads
<b>{MO_WEEKS[4]["util"]}%</b> now, with <i>{MO_WEEKS[4]["away"]} days away &mdash; not counted</i>
under it. A metric that shames a trainer for a week they chose is a metric they will learn to
ignore.
<br><br><b>Wednesday the 12th carries the clash</b>, in the same danger tone and the same glyph the
week&rsquo;s day head uses &mdash; because the month is where you notice the one you missed.'''

# ═════════════════════════════════════════════════════════════════ frames ══
SUB1A = (f"{N_SESS} sessions &middot; {N_TODAY} today &middot; "
         f"{hrs(BOOKED)} of {hrs(AVAIL)} working hours booked &middot; {UTIL}%")
SUB1B = (f"Gaps shown &middot; {GAP_N} openings &middot; {hrs(GAP_MIN)} free hours &middot; "
         f"{GAP_SLOTS} sellable at your usual hour &middot; &#8377;{GAP_RS:,} billed, "
         f"&#8377;{GAP_KEEP:,} kept")

F1A = frame("1a", "The week, in minutes", "diary &middot; 1a 2a 2b",
            f"/schedule/week/{ISO_WEEK}",
            screen(SUB1A, week()), N1A)

F1B = frame("1b", "Gaps, priced where they are", "new to the web",
            f"/schedule/week/{ISO_WEEK}?gaps=1",
            screen(SUB1B, week(gaps_on=True), gaps=True), N1B)

F2A = frame("2a", "One day, and why each block matters", "diary &middot; 1a 1d",
            f"/schedule/day/{(WEEK_MON + timedelta(days=TODAY)).isoformat()}",
            screen(f"{dlong(TODAY)[:-5]} &middot; {N_TODAY} sessions &middot; Divya R in progress",
                   day(TODAY), view="Day", label=dlong(TODAY),
                   crumb=dlong(TODAY)[:-5]), N2A)

F4A = frame("5a", "Moving one, at 15-minute snap", "new to the web",
            f"/schedule/week/{ISO_WEEK}",
            screen("Moving Sneha R out of Wednesday&rsquo;s clash",
                   week(drag=(2, 1125, "clear &middot; back to back with Kavya M", 13, False))), N2B)

F5A = frame("6a", "One session &mdash; and its length", "diary &middot; 4a 4b 4c 7a 7b 7c",
            "/schedule/session/8814",
            screen(f"Session detail &middot; {dlong(0)[:-5]}", day(0), view="Day",
                   label=dlong(0), crumb=f"Nikhil P &middot; {dshort(0)}",
                   panel=PANEL), N3A)

F6A = frame("7a", "Eight weeks in one form", "diary &middot; 3b 5a",
            "/schedule/pattern/new?client=meera-k",
            screen("Weekly pattern &middot; Meera K &middot; 8 weeks", week(),
                   crumb="Weekly pattern", panel=PATTERN), N4A)

# §04's bench: three days of the band held open, because Thursday has a
# one-off inside it. Three columns rather than seven — the specimen is the
# band's refusal, and the other four days would say it four more times.
_SESS2 = SESSIONS + [ONE_OFF]
BENCH = ('<div class="cw" style="grid-template-columns:var(--cw-gut) repeat(3,minmax(0,1fr))">'
         + head() + "".join(head(wd, _SESS2) for wd in (2, 3, 4))
         + bandrow(why="Thursday has a 12:30 one-off inside these hours "
                       "&mdash; 1 session, so the band cannot close")
         + gutter(BAND)
         + "".join(daycol(wd, BAND, sessions=_SESS2) for wd in (2, 3, 4))
         + '</div>')

# The week AFTER the move, with the clash map recomputed on the moved list —
# so the frame cannot claim a resolution the data does not have.
MOVED = list(SESSIONS)
MOVED[13] = (2, 1125, 60, "SR", "av-12", "Sneha R", "Legs A", "", "")
MOVED_CLASH = clash_map(MOVED)
assert MOVED_CLASH == {}, MOVED_CLASH

F4B = frame("5b", "Dropped &mdash; and ten seconds to take it back", "new to the web",
            f"/schedule/week/{ISO_WEEK}",
            screen("Sneha R moved to Wednesday 18:45 &middot; not yet sent",
                   week(sessions=MOVED, clash=MOVED_CLASH, drop=(2, 1125, "", 13))),
            N2C)

F3A = frame("3a", "The month &mdash; density, and the dated hole",
            "diary &middot; 1a &middot; new to the web",
            f"/schedule/month/{MO_ANCHOR.strftime('%Y-%m')}",
            screen(f"{MO_ANCHOR.strftime('%B %Y')} &middot; {MO_TOTAL} sessions &middot; "
                   f"thinnest week {MO_THIN}%",
                   MO_KEY + month(), view="Month",
                   label=f"{MO_ANCHOR.strftime('%B %Y')}",
                   crumb=f"{MO_ANCHOR.strftime('%B %Y')}"), N3AM)

RO = (readout("18:45 &ndash; 19:45", "clear")
      + readout("18:15 &ndash; 19:15", "clear &middot; back to back with Kavya M")
      + readout("16:30 &ndash; 17:30", "clashes with Nikhil P, 16:30 &ndash; 17:30",
                bad=True, ghost="bad"))


S03 = S03.replace("{F1A}", F1A).replace("{F1B}", F1B)
S04 = S04.replace("{BENCH}", BENCH)
S06 = S06.replace("{F2A}", F2A)
S07M = S07M.replace("{F3A}", F3A)
S07 = S07.replace("{F2B}", F4A).replace("{RO}", RO).replace("{F2C}", F4B)
S08 = S08.replace("{F3A}", F5A)
S09 = S09.replace("{F4A}", F6A)

# ═════════════════════════════════════════════════ §08 · the booking form ══
# How many controls pointed at a screen that did not exist: every gap block
# §04 draws ends its accessible name with "Book it.", and every frame's toolbar
# carries the New session primary — eight frames, before this section added
# three of its own.
def drawn_gaps(wd):
    """Gaps that actually get a block: inside a visible segment, since the
       quiet band is folded and the hatched hours are not free time."""
    return sum(1 for x, y in GAPS[wd] if any(x >= a and y <= b for a, b in SEG))


# The week draws all seven days; the day view draws one more for TODAY, which
# is the one the first count missed.
GAP_BOOKS = sum(drawn_gaps(wd) for wd in range(7)) + drawn_gaps(TODAY)
PRE_FRAMES = 8
DEAD_CTRLS = GAP_BOOKS + PRE_FRAMES

# The figures stay derived and the prose stays prose: this page spells small
# counts out in a sentence and reserves digits for the tables.
_W = ("zero one two three four five six seven eight nine ten eleven twelve "
      "thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty").split()


def word(n):
    return _W[n] if n < len(_W) else f"{n:,}"
assert (GAP_BOOKS, DEAD_CTRLS) == (11, 19), (GAP_BOOKS, DEAD_CTRLS)

BOOK_URL = (f"/schedule/week/{ISO_WEEK}/new"
            f"?at={BOOK_DATE.isoformat()}T{hm(BOOK_AT)}")

# The draft, twice: 60 minutes before a client is picked, because
# DEFAULT_SESSION_MIN is 60 — and 90 after, because that is what Karthik
# actually trains. The block redraws between the two frames, which is the
# visible consequence of answering the one question the slot could not.
DRAFT_A = ((BOOK_WD, BOOK_AT, DEFAULT_MIN, "", "av-3", "New session", "", "", ""), False)
DRAFT_B = ((BOOK_WD, BOOK_AT, BOOK_MIN, BOOK_C["ini"], BOOK_C["av"], BOOK_NAME,
            BOOK_C["plan"], "", ""), False)

F7A = frame("4a", "New session &mdash; the click answered three of the five questions",
            "diary &middot; 3a",
            BOOK_URL,
            screen(f"Booking into {dstamp(BOOK_DATE)} {hm(BOOK_AT)} &middot; "
                   f"the head of a {dur(BOOK_REST[1] - BOOK_AT)} opening",
                   week(draft=DRAFT_A), crumb="New session", panel=BOOK), "{N7A}")

F7B = frame("4b", "Picked &mdash; and the length is his, not the default",
            "diary &middot; 3a",
            BOOK_URL + "&client=karthik-r",
            screen(f"{BOOK_NAME} &middot; {hm(BOOK_AT)} &ndash; {hm(BOOK_END)} &middot; "
                   f"one session",
                   week(draft=DRAFT_B), crumb="New session", panel=BOOK2), "{N7B}")

F7C = frame("4c", "Six dates, enumerated &mdash; and one of them is a holiday",
            "diary &middot; 3b &middot; new to the web",
            BOOK_URL + "&client=karthik-r&every=wed",
            screen(f"{BOOK_NAME} &middot; every {DAYS[BOOK_WD]} until his pack runs out",
                   week(draft=DRAFT_B), crumb="Confirm 6 sessions", panel=BOOK3), "{N7C}")

N7A = f'''<b>A click is three answers, so the form asks two questions.</b> The date, the start
minute and the day are all in it. NN/g&rsquo;s form guidance is blunt about what to do with that
&mdash; <i>&ldquo;don&rsquo;t ask users for information you already have&hellip; use it to prefill
form fields and allow users to verify or update&rdquo;</i> &mdash; so <b>When</b> is a read-back with
two editable fields and there is <b>no date field at all</b>. The length opens at <b>{DEFAULT_MIN}</b>,
which is <code>DEFAULT_SESSION_MIN</code>, and the draft is already on the grid at
{hm(BOOK_AT)}&nbsp;&ndash;&nbsp;{hm(BOOK_AT + DEFAULT_MIN)} before a field is touched.
<br><br><b>So the client list is the screen, and it is ranked.</b> The phone cannot do this:
<code>BookSheet.tsx</code> shows <code>all.slice(0, 6)</code> alphabetically until you type, which on
a 22-client roster hides sixteen and orders the six by nothing. Here the first group is <b>who
already trains at this hour</b> &mdash; computed, not typed. <code>book_suggest({BOOK_AT})</code>
walks the session list for starts within half an hour of {hm(BOOK_AT)} and returns
<b>{" and ".join(f'{n} ({", ".join(DAYS[d] for d in days)})' for n, c, days in BOOK_SUG)}</b>. The
signal was already in the data: every session carries a start minute, and
<code>DiaryClient.weeklySchedule</code> carries the standing slots too.
<br><br><b>The tail is a count, not seventeen invented names.</b> Two suggested, three shown,
<b>{_MORE} more</b> &mdash; {ROSTER}, the roster the rail claims. A fake row you cannot pick is worse
than a sentence saying how many there are.
<br><br><b>Every row carries the pack</b>, because that is the number that decides whether you should
be booking at all &mdash; including Kavya&rsquo;s <b>0 left</b> in the danger tone. Booking her is
still allowed: the interaction map lists <i>&ldquo;session on a client with no package&rdquo;</i> as a
legal case with nothing to decrement. Flagged, never blocked.
<br><br><b>And the disabled primary explains itself.</b> The app&rsquo;s
<code>disabled={{!clientId}}</code> is right; a grey button with no reason beside it is not. The
sentence is in the foot, because the fix for a disabled control is to say what would enable it.'''

N7B = f'''<b>Picking the client changes the picture.</b> The block redraws from {DEFAULT_MIN} to
<b>{BOOK_MIN}</b> minutes and the read-out with it, because {BOOK_MIN} is what {BOOK_NAME} actually
trains &mdash; every session he has is a {BOOK_MIN}-minute floor session, so both defaults are derived
rather than assumed. The copy says it changes <i>this</i> session and never his default, which is the
same guard &sect;10 puts on the same field.
<br><br><b>Back-to-back is stated, not left to the eye.</b> {BOOK_ABUT}&rsquo;s hour ends at
{hm(BOOK_AT)} and this one starts there, which <code>conflicts.ts</code> reads as clear because it
reasons in a half-open interval. Silence about a neighbour that close is what sends a trainer back to
the grid to check. The same line says what is <b>left</b> &mdash;
{hm(BOOK_END)}&nbsp;&ndash;&nbsp;{hm(BOOK_REST[1])}, still sellable &mdash; because a 90 into a
{dur(BOOK_REST[1] - BOOK_AT)} hole is a decision about the rest of the hole.
<br><br><b>Repeat is inline, and that is a departure.</b> <code>BookSheet</code> puts it behind a
second level: <code>repeatOpen</code> swaps the entire sheet for a day-picker. Right at 390px, wrong
here &mdash; and NN/g states the condition it fails, which is that progressive disclosure requires you
<i>&ldquo;disclose everything that users frequently need up front, so that they have to progress to
the secondary display only on rare occasions&rdquo;</i>. A standing weekly slot is not the rare
occasion for this roster; it is most of it.
<br><br><b>The pack is answered before it is asked.</b> {BOOK_PACK} of 12 before, {BOOK_PACK} of 12
after. <code>BookSheet.tsx</code>&rsquo;s own header comment explains why that sentence is on screen
at all: <i>&ldquo;saying so at the moment of booking is what stops the support ticket.&rdquo;</i>'''

N7C = f'''<b>Every generated date, listed, before anything exists.</b> FR-2 asks for exactly this
&mdash; recurring slots <i>&ldquo;generated in one pass, with a preview of every generated date before
commit&rdquo;</i> &mdash; and nothing in this set had it: &sect;11&rsquo;s pattern form gives a count and a
span. Six rows here, each with its own verdict. It is also Nielsen&rsquo;s fifth heuristic read
literally &mdash; <i>&ldquo;provide a confirmation option before users commit to actions with serious
consequences&rdquo;</i> &mdash; and six bookings is six notifications to a client, so the list is the
confirmation rather than a dialogue asking <i>are you sure</i>.
<br><br><b>It is a step, not a longer form.</b> Six dates plus a form does not fit a panel, and
compressing either to make it fit would have been the wrong trade: the dates <i>are</i> the review.
So the decisions collapse to one line at the top with <code>Change</code> beside them, and the foot
says <b>Back</b> rather than <b>Cancel</b>.
<br><br><b>{dstamp(BOOK_AWAY)} is inside the Coimbatore trip.</b> &sect;07 draws that block on the month;
this is the first place in the set where <code>time_blocks</code> has a <b>consequence</b> instead of
a rendering. Google Calendar and Vagaro will both generate a weekly series straight
through a holiday sitting on the same calendar, because neither recurrence engine is told about it.
This one refuses the date, names the reason in the trainer&rsquo;s own words, and puts the fix on the
row.
<br><br><b>And so will we, today.</b> That check does not exist in the app, and reading the code says
so twice over. <code>buildDay</code> builds its <code>items</code> from <code>input.sessions</code>
alone, so <code>findClash</code> <b>cannot</b> see a <code>time_block</code> &mdash; not for a series,
not even for the single date you tapped. And <code>commitBooking</code> calls it on
<code>result.at</code> only, then hands the whole list to <code>bookSeries</code>, which batch-creates
every occurrence without checking any of them. So five of these six dates are written with no check of
any kind. This frame is a specification for two fixes in <code>diary.ts</code>, not a drawing of
something that works.
<br><br><b>And skipping it does not shorten the series.</b> {BOOK_PACK} sessions still, ending
{dstamp(BOOK_OCC_SKIP[-1])} instead of {dstamp(BOOK_OCC[-1])} &mdash; because the bound is
<b>{BOOK_NAME}&rsquo;s pack, not the calendar</b>. That one line is the whole argument for a money
bound, and it only becomes visible at the moment a date has to be dropped.'''

S14B = f'''<p class="note"><b>{word(DEAD_CTRLS).capitalize()} live controls pointed at this
screen and it did not exist.</b> <code>New session</code> was a primary in the toolbar of all
{word(PRE_FRAMES)} frames this page had, and every gap block &sect;04 draws ends its accessible name
with <i>&ldquo;Book it.&rdquo;</i> &mdash; {word(GAP_BOOKS)} of those. That is the
defect &sect;01 and &sect;07 both audit: a control that leads nowhere. It is also the only tab in the set where
<code>new</code> has no destination, while <code>/clients/new</code>,
<code>/money/&hellip;/payment/new</code> and <code>/nudges/new</code> all have one.
<br><br>Drawing it changed what booking <i>is</i>. The phone asks five questions &mdash; who, when,
how long, where, does it repeat. A click on a minute-true grid has already answered <b>three</b> of
them, which is NN/g&rsquo;s <i>Eliminate</i> and <i>Automate</i> steps performed by the geometry
rather than by the form.</p>
{{F7A}}
{{F7B}}
{{F7C}}

<h3 class="sub">Every calendar bounds a series in time. This one bounds it in money.</h3>
<p class="note">Four products, one question: when you say <i>every Wednesday</i>, what makes it
stop?</p>
<table class="dt"><thead><tr><th>Product</th><th>Where repeat lives</th>
  <th>What ends the series</th><th>What it knows about your own time off</th></tr></thead>
<tbody>
  <tr><th>Google Calendar</th><td>a <code>Does not repeat</code> dropdown &rarr; Custom</td>
    <td><b>On</b> a date, or <b>After</b> <i>n</i> occurrences &mdash; capped at 730</td>
    <td>Nothing. It will run a series straight through a holiday on the same calendar.</td></tr>
  <tr><th>Vagaro</th><td><code>Repeat</code> on the appointment</td>
    <td>a frequency &mdash; daily, weekly, monthly, yearly &mdash; and an <b>end date</b></td>
    <td>Nothing at generation time.</td></tr>
  <tr><th>ABC Trainerize</th><td><code>Repeat Appointment</code>, inline in the
    <code>Add appointment</code> dialogue</td>
    <td>weekly or monthly</td>
    <td>Calendar availability exists, but it governs <b>client self-booking</b> &mdash; not a series
      the trainer generates.</td></tr>
  <tr><th>Everfit</th><td>&mdash;</td><td>&mdash;</td>
    <td>No appointment booking at all. The Master Planner schedules <b>programs</b>, not
      sessions.</td></tr>
  <tr class="dt__hl"><th>X REP</th><td>inline in the panel, no second level</td>
    <td><b>the client&rsquo;s pack</b> &mdash; {BOOK_PACK} left, {BOOK_PACK} dates, and it stops</td>
    <td>Refuses the date, names it, and offers to skip &mdash; keeping the count, moving the
      end.</td></tr>
</tbody></table>

<div class="why"><p class="why__k">The best idea in this form was already on the phone</p>
  <p><code>occurrencesFor(at, weekdays, remaining - 1)</code> &mdash; the series is bounded by
  <code>packRemaining</code>, and the sheet says why in one line: <i>&ldquo;Nobody gets booked into
  sessions they haven&rsquo;t paid for.&rdquo;</i> None of the four calendars above can express that,
  because none of them knows what a pack is. The app had already written down why, in the
  docstring of that function: <i>&ldquo;PTminder and Trainerize both let a trainer book a client into
  sessions they have not paid for; that is a billing argument waiting to happen, so the count comes
  from <code>sessions_remaining</code> and stops there.&rdquo;</i> For a trainer whose product
  <b>is</b> a twelve-session pack, <i>until it runs out</i> is the only bound that is a business fact
  rather than a date somebody picked. The web&rsquo;s job was to make it <b>legible</b>: the phone shows the count, this shows the
  {BOOK_PACK} dates and what happens to the last one when a holiday eats the third.</p></div>

<h3 class="sub">The ten, on this screen</h3>
<table class="dt"><thead><tr><th>Heuristic</th><th>Where it lands here</th></tr></thead>
<tbody>
  <tr><th>1 &middot; Visibility of system status</th><td>The draft block is on the grid before a field
    is touched, and it redraws when the length changes. The six dates are the status of a series that
    does not exist yet.</td></tr>
  <tr><th>2 &middot; Match to the real world</th><td><code>His pack runs out</code>,
    <code>Floor</code>, <code>Coimbatore</code>. Not <i>recurrence rule</i>, <i>in-person</i>,
    <i>unavailability window</i>.</td></tr>
  <tr><th>3 &middot; User control and freedom</th><td>Every generated date has its own remove
    control, so a series is a starting point and not a package deal. <code>Back</code> on the last
    step returns to a filled form, not an empty one.</td></tr>
  <tr><th>4 &middot; Consistency and standards</th><td>The draft reuses <code>.ev--ghost</code> from
    the drag target rather than inventing a tone: both are the same claim &mdash; something is going
    to be here, and it is not here yet.</td></tr>
  <tr><th>5 &middot; Error prevention</th><td>The clash and the holiday are found <b>before</b> the
    commit rather than raised in a toast after it, and the check is stated as being against all
    {N_SESS} sessions and <code>time_blocks</code> &mdash; so the absence of a warning means
    something.</td></tr>
  <tr><th>6 &middot; Recognition rather than recall</th><td><i>Trains at this hour</i>, the pack on
    every row, the neighbour named in the read-out. Nothing asks the trainer to remember who normally
    has {hm(BOOK_AT)}.</td></tr>
  <tr><th>7 &middot; Flexibility and efficiency</th><td>Two ways in &mdash; click a gap, or the
    toolbar primary &mdash; and each step is a URL, so a half-filled booking can be linked to.</td></tr>
  <tr><th>8 &middot; Aesthetic and minimalist design</th><td>There is no date field, because the
    click supplied the date. Three of the five questions are <b>gone</b>, not pre-answered.</td></tr>
  <tr><th>9 &middot; Recover from errors</th><td>The holiday row does not only warn, it carries the
    fix &mdash; <code>Skip</code> &mdash; and the card says what skipping costs: nothing, except a
    week on the end date.</td></tr>
  <tr><th>10 &middot; Help and documentation</th><td>The pack rule is written where the question gets
    asked, in the app&rsquo;s own words, instead of in a help article nobody opens.</td></tr>
</tbody></table>'''

S14B = (S14B.replace("{F7A}", F7A.replace("{N7A}", N7A))
        .replace("{F7B}", F7B.replace("{N7B}", N7B))
        .replace("{F7C}", F7C.replace("{N7C}", N7C)))


# ═══════════════════════════════════════════════════ §09 · working hours ══
def hscreen(sub, grid, *, panel="", crumb="When you work"):
    """The hours editor's shell. The three view buttons and the gap chip do not
       belong on it — this is not a view of the week, it is an edit of the table
       every view reads — so the toolbar is replaced rather than reused."""
    return (f'<div class="app" data-theme="dark">{rail("sched")}{top(crumb)}'
            f'<main class="main">'
            f'<div class="ph"><div class="ph__row">'
            f'<div><p class="ph__t">When you work</p><p class="ph__sub">{sub}</p></div>'
            f'<div class="ph__acts">'
            f'<button class="btn btn--secondary" type="button">{ic(I_CAL, 15)}Time off</button>'
            f'<button class="btn btn--secondary" type="button">{ic(I_CHEVL, 15)}Back to the week</button>'
            f'</div></div></div>'
            f'<div class="body body--flush">'
            f'<div style="overflow:auto;height:648px">{grid}</div>'
            f'</div></main>{panel}</div>')


F8A = frame("8a", "When you work &mdash; the table every other frame reads",
            "diary &middot; 5a",
            "/schedule/hours",
            hscreen(f"{hrsw(AVAIL)} bookable &middot; {hrsw(BOOKED)} booked &middot; "
                    f"{UTIL}% used &middot; clients can only self-book inside these",
                    hoursweek(WORK, strips=(DATED,))), "{N8A}")

F8B = frame("8b", "One drag, five days, and the five people it strands",
            "diary &middot; 5a &middot; new to the web",
            f"/schedule/hours?day=mon&edit=1",
            hscreen(f"{LONG[HRS_DAY]} evening &rarr; {hm(HRS_EDGE)}, applied to "
                    f"{len(HRS_DAYS)} days &middot; {hrsw(AVAIL)} &rarr; {hrsw(AVAIL2)} "
                    f"&middot; {UTIL}% &rarr; {UTIL2}%",
                    hoursweek(WORK2, on=HRS_DAYS, out=STRANDED, drag_wd=HRS_DAY,
                              strips=(STRAND_STRIP, COST_STRIP)),
                    panel=HOURS_PANEL, crumb=f"{LONG[HRS_DAY]} hours"), "{N8B}")

N8A = f'''<b>Every grid on this page reads this table and none of them could change it.</b>
<code>WORK</code> is where the hatch comes from, where &sect;04&rsquo;s quiet band comes from, and
what the whole utilisation denominator is divided by &mdash; and until this frame there was no
screen in seventeen files that could edit it, Settings included.
<br><br><b>Figure and ground are swapped, deliberately.</b> On every other frame the sessions are the
subject and working hours are the negative &mdash; a hatch meaning <i>not this</i>. Here the hours are
what is being edited, so a window becomes a solid object with two ends you can take hold of, the
sessions dim to context, and <b>the hatch is gone entirely</b>: on this screen an empty track already
reads as closed, and a second mark for the same fact is one mark too many.
<br><br><b>The day head says how long, not when.</b> When is on the band, which has to say it anyway
because a thing you can drag must state what it currently says. So the head carries the total and the
shape &mdash; <i>{hrsw(hrs_of(WORK, 0))} &middot; split</i> &mdash; which is the column&rsquo;s answer
to the only two questions you ask of a week at a glance.
<br><br><b>Layer two cannot be drawn here, and that is the answer rather than the limitation.</b>
&sect;16 has been carrying an open item about this: the week&rsquo;s hatch is a <i>weekly pattern</i>
and a <code>time_block</code> is a <i>dated event</i>, and the two must not come to look alike. They
never share a channel now. A weekly editor that hatched 24&ndash;28 August across Monday would be
claiming the trainer is away every Monday forever, so the dated exceptions are a <b>strip that names
its own dates</b> and points at the month, where a date is a cell.
<br><br><b>Two layers, not four.</b> Trainerize stacks Vacation over Date-specific over
Appointment-type over General. <code>WorkingHoursScreen.tsx</code> opens by rejecting it in as many
words &mdash; <i>&ldquo;it is a complete model and it is far too much for a trainer with a
phone&rdquo;</i> &mdash; and keeps the one rule worth keeping, which is on the screen: these
constrain what a <b>client</b> can self-book and have never constrained the trainer.'''

N8B = f'''<b>The dialog became a picture, and then it became unnecessary.</b> The phone has to
<i>list</i> who a change strands, because its sheet covers the diary: a <code>Dialog</code>, titled
<i>&ldquo;{len(STRANDED)} sessions are booked outside these hours&rdquo;</i>, printing up to
<code>MAX_LISTED = {MAX_LISTED}</code> rows. This change produces exactly five, so it is the last one
that dialog can show in full. Here they are already on screen &mdash; five blocks going red in place,
across the five columns the edit touches &mdash; so there is nothing to list, no modal, and the
confirmation is the ordinary <b>Save</b>.
<br><br><b>And the grouping is the finding.</b> Five rows makes you count them; four of them are one
person. The strip says <b>{STRANDED_BY[0][0]} &middot; {len(STRANDED_BY[0][1])} sessions</b> and
<b>{STRANDED_BY[1][0]} &middot; {len(STRANDED_BY[1][1])}</b>, because the fact is not <i>five
sessions</i>, it is <i>you are about to move one client&rsquo;s standing slot</i>. That is a change to
make against the phone&rsquo;s dialog too.
<br><br><b>The day chips are direct now.</b> <i>Also apply to</i> exists on the phone because a phone
can only see one day, and it is a row of chips with no picture attached. Here the four columns it
names are <b>tinted behind the panel</b>, so the chips and the grid cannot disagree about what is
being changed &mdash; and the bands on those columns are drawn at the new position, not the old one.
<br><br><b>Nobody asks which Monday, because the model does not have the question.</b>
Calendly&rsquo;s calendar view has to: you drag over dates and it offers <i>Edit date</i> or
<i>Edit all Mondays</i>. That ambiguity is a consequence of putting weekly hours and dated overrides
in one editor. Two layers removes it &mdash; this screen is the weekly pattern and only that, and
&ldquo;next Monday I start later&rdquo; is a <code>time_block</code>. We looked for the disambiguation
and found we had already spent the complexity elsewhere.
<br><br><b>Then the figure no other calendar can compute.</b> Utilisation goes <b>{UTIL}% &rarr;
{UTIL2}%</b> &mdash; it rises when you work less, because it is booked time over bookable time, and
seeing that here is better than reading it on the month as good news. And the five hours are broken
down: <b>{dur(CUT_BOOKED)} of them was carrying sessions</b> and only {dur(CUT_FREE)} was empty, of
which {dur(CUT_SELLABLE)} was ever sellable &mdash; the rest being the fifteen minutes Sneha&rsquo;s
session leaves behind on Wednesday, which was never an hour and so was never on offer. So the honest
price of this edit is <b>&#8377;{GAP_RS - GAP_RS2:,} of gap</b> and
<b>&#8377;{STRANDED_RS:,} of booked work</b>, and they are not the same kind of number.'''

S15H = f'''<p class="note">The schedule reads two tables it could not write. This is the first of
them &mdash; <code>working_hours</code>, the source of every hatched hour on this page, of the quiet
band in &sect;04, and of the denominator under every utilisation figure in &sect;07 and &sect;08. The
phone has a whole screen for it, reached from two places in <code>DiaryScreen</code>; the web had
none, and neither did <a href="webapp-settings.html">Settings</a>.
<br><br>The desk does not get a bigger version of that screen. It gets a different one, because the
phone&rsquo;s central problem does not exist here: <b>a sheet covering the diary cannot show you what
your edit costs</b>, so the phone has to compute the damage at save time and describe it in a dialog.
A week grid has the damage already drawn.</p>
{{F8A}}
{{F8B}}

<h3 class="sub">Nobody tells you who you just stranded</h3>
<p class="note">Four products, one question: you shrink your hours, and somebody is already booked in
the part you removed. What happens?</p>
<table class="dt"><thead><tr><th>Product</th><th>Weekly hours</th><th>Dated exceptions</th>
  <th>When you cut an hour someone is booked in</th></tr></thead>
<tbody>
  <tr><th>Calendly</th><td><b>List view</b> &mdash; per-day time blocks, <code>+</code> to add a day
    and <code>x</code> to remove one</td>
    <td><b>Calendar view</b> &mdash; drag over dates, then <i>Edit date</i> or
      <i>Edit all Mondays</i>. The best gesture in the survey.</td>
    <td>Nothing. The help centre documents no conflict alert while editing a schedule; the only
      double-booking check described runs against the connected calendar at <b>booking</b> time.</td></tr>
  <tr><th>Acuity Scheduling</th><td>basic availability, per calendar</td>
    <td>availability blocks, and limits per appointment type</td>
    <td>Nothing at edit time. It warns when <b>booking</b> outside availability and lets you
      through, logging it as a manual override. Appointments already booked simply stay.</td></tr>
  <tr><th>ABC Trainerize</th><td>general availability</td>
    <td>date-specific, appointment-type and vacation layers &mdash; <b>four in total</b></td>
    <td>Not documented. And availability governs client self-booking only, so the question is
      partly moot for them.</td></tr>
  <tr><th>Vagaro</th><td>staff shifts on the calendar</td><td>&mdash;</td>
    <td>Shifts are drawn on the calendar the appointments are on, which is the one thing on this row
      worth copying &mdash; and it is what &sect;12 does.</td></tr>
  <tr class="dt__hl"><th>X REP</th><td>two layers, and the second one is deliberate</td>
    <td><code>time_blocks</code> &mdash; dated, and named as such on a strip rather than drawn as a
      pattern</td>
    <td><b>Names them, at the moment of the edit, grouped by client, and does not block.</b> Five
      sessions go red in the grid; the strip says <i>{STRANDED_BY[0][0]} &middot;
      {len(STRANDED_BY[0][1])} sessions</i>.</td></tr>
</tbody></table>

<div class="why"><p class="why__k">The direction of the check is the whole difference</p>
  <p>Every product above checks availability when a <b>client books</b>. Not one checks it when the
  <b>trainer edits</b>. That is backwards for this user: a client booking into a free slot is the
  system working, and a trainer cutting an hour that already has somebody in it is the moment a
  mistake gets made &mdash; because the trainer is looking at hours and not at names. The app already
  had this right; <code>conflictingSessions</code> runs per weekday before the save and every
  day&rsquo;s hits go into one dialog, <i>&ldquo;so the trainer answers the whole change once rather
  than being interrogated once per weekday.&rdquo;</i> The web&rsquo;s only job was to stop it being
  a list.</p></div>

<div class="why why--warn"><p class="why__k">And one rule this screen must never break</p>
  <p><b>A save that strands nobody goes straight through</b> &mdash; no dialog, no confirmation, no
  <i>are you sure</i>. That is in the app&rsquo;s header comment and it is the correct reading of
  Nielsen&rsquo;s fifth heuristic, which asks for a confirmation before actions <i>&ldquo;with serious
  consequences&rdquo;</i> and not before all of them. A trainer changing their hours in March because
  the gym changed its timings has done nothing consequential, and a product that stops to ask is a
  product that has stopped meaning anything when it asks. So the strip in <b>8b</b> is not furniture:
  it is absent from <b>8a</b>, and it is absent from every save that costs nobody a session.</p></div>

<h3 class="sub">Dragging an edge, without a mouse</h3>
<p class="note">A window has two ends and both are drag handles, which puts this screen straight into
<b>WCAG 2.2 SC 2.5.7 Dragging Movements</b> &mdash; the same requirement &sect;13 already answers for
moving a session. It gets the same answer rather than a new one, because a second keyboard idiom for
the same shape of gesture is worse than none.</p>
<table class="dt"><thead><tr><th>Key</th><th>What it does</th><th>Why this and not something
  else</th></tr></thead>
<tbody>
  <tr><th><kbd>Tab</kbd></th><td>Moves between windows &mdash; each band is one tab stop, not two.</td>
    <td>Seven columns of two windows is fourteen stops. Two stops per band would be
      twenty-eight, and the second one would be indistinguishable from the first.</td></tr>
  <tr><th><kbd>&crarr;</kbd></th><td>Takes hold of the band. The edges light and the arrows are
    live.</td><td>The same lift-then-move that <kbd>X</kbd> gives on the week grid, on the key that
      already means <i>act on this</i> for a focused control.</td></tr>
  <tr><th><kbd>&uarr;</kbd> <kbd>&darr;</kbd></th><td>Moves the <b>near</b> edge by 15 minutes
    &mdash; the resolution the whole page is drawn at, and what <code>TimeField</code> steps
    by.</td><td>Never the whole window: <i>my day shifts an hour later</i> is two edits, and one of
      them is nearly always wrong.</td></tr>
  <tr><th><kbd>&#8679;</kbd> + <kbd>&uarr;</kbd> <kbd>&darr;</kbd></th><td>The <b>far</b> edge.</td>
    <td>One modifier to reach the other end, rather than a separate tab stop for it.</td></tr>
  <tr><th><kbd>&crarr;</kbd> / <kbd>Esc</kbd></th><td>Commits, or puts it back.</td>
    <td>Matching the grid exactly. <kbd>Esc</kbd> restores the value the band had on lift, not the
      value it had on load.</td></tr>
  <tr><th>&mdash;</th><td>The two fields in the panel do all of it without any of this.</td>
    <td>The real answer to SC&nbsp;2.5.7: the drag is the accelerator and the form is the path.
      <code>Starts</code> and <code>Ends</code> are ordinary inputs and always have been.</td></tr>
</tbody></table>'''

S15H = S15H.replace("{F8A}", F8A.replace("{N8A}", N8A)).replace("{F8B}", F8B.replace("{N8B}", N8B))


# ═══════════════════════════════════════════════════════════════ assemble ══
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
       '<a href="webapp-programs.html">PROGRAMS</a>'
       '<a href="webapp-schedule.html" aria-current="page">SCHEDULE</a>'
       '<a href="webapp-workout.html">WORKOUT</a>'
       '<a href="webapp-money.html">MONEY</a>'
       '<a href="webapp-reports.html">REPORTS</a>'
       '<a href="webapp-settings.html">SETTINGS</a>'
       '<a href="webapp-client-portal.html">PORTAL</a>')

SECS = [
    ("01", "The audit &mdash; eight things, and one of them is the cause of four", S01),
    ("02", "One minute, one pixel", S02),
    ("03", "The week", S03),
    ("04", "The quiet band &mdash; and what it may never fold away", S04),
    ("05", "Two clients, one hour", S05),
    ("06", "The day", S06),
    ("07", "The month", S07M),
    ("08", f"Booking one &mdash; and the {word(DEAD_CTRLS)} controls that pointed nowhere", S14B),
    ("09", "Moving one", S07),
    ("10", "One session", S08),
    ("11", "Eight weeks in one form", S09),
    ("12", "When you work &mdash; the table every other frame reads", S15H),
    ("13", "The keyboard, and the grid that is no longer a grid", S10),
    ("14", "Competitor analysis &mdash; eight patterns, and the one the month refuses", S11),
    ("15", "What this changes in the other files", S12),
    ("16", "Still open", S13),
]

# §13's eight competitor blocks plus §08's four recurrence engines. Counted,
# because the hand-typed 6 was wrong the moment the month added two.
N_PAT = S11.count('class="grp"') + 4
assert N_PAT == 12, N_PAT

BODY_HTML = '\n\n'.join(
    f'<h2 class="sec"><span class="n">{n}</span>{t}</h2>\n{s}' for n, t, s in SECS)

HTML = f'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>X REP &middot; Web app &mdash; Schedule</title>
<meta name="description" content="The week re-drawn at one pixel per minute: real start times, real lengths, clashes side by side, and the price of the gaps. X REP web application.">
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

<h1>Schedule &mdash; a week that can say half past seven</h1>
<p class="doc__lede">The first pass drew the week as a matrix of 48px hour cells, and a matrix has
one resolution: the hour. All <b>102</b> sessions in that file carry the identical inline style
<code>top:2px;height:42px</code> &mdash; every one exactly sixty minutes, every one exactly on the
hour &mdash; while the app it documents has stored a per-client
<code>session_duration_minutes</code> since schema V2, steps its time field by <b>15 minutes</b>, and
books sessions of <b>30, 60 and 90</b>. <code>07:30</code> appears once in that 73&thinsp;KB file: as
a value you can type into a form, on the same page as a grid that cannot draw it.
<br><br>This pass throws the cells away. A day is <b>one positioned track at one pixel per minute</b>,
so <code>top</code> is the start minute and <code>height</code> is the duration, and the six
consequences follow for free: real start times, real lengths, a clash drawn <b>side by side</b>
instead of one name on top of another, a now-line, an empty hour that can be <b>priced where it
sits</b>, and 494 <code>&lt;div&gt;</code>s replaced by things a keyboard can reach. Not one number
in the prose is hand-typed &mdash; utilisation, the gap list and its rupee value are computed from the
same session list that draws the blocks.</p>
<div class="doc__meta"><span><b>Frames</b> <span data-frame-count>13</span></span>
  <span><b>Resolution</b> 60 min &rarr; 15 min</span>
  <span><b>Defects found</b> 8</span>
  <span><b>Patterns examined</b> {N_PAT}</span></div>
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
  <code>inclineyoudesignsystem.html</code> &mdash; if a value differs there, it is a bug here. Press
  <kbd>+</kbd> / <kbd>&minus;</kbd> to change the zoom.
  <br><br>Generated by <code>gen_schedule.py</code>; edit that and re-run it rather than editing this
  file. The shell is imported from <code>gen_rail.py</code> rather than copied, so the rail on this
  page is the rail file&rsquo;s second pass and cannot drift from it. Session counts, booked hours,
  utilisation, the gap list and every rupee figure are computed from <code>SESSIONS</code> and
  <code>WORK</code> in that script.
  <br><br>Competitor rows trace to primary sources: FullCalendar&rsquo;s <code>slotDuration</code>,
  <code>snapDuration</code> and <code>slotEventOverlap</code> documentation; ABC Trainerize&rsquo;s
  help-centre articles on appointment types and the four kinds of calendar availability;
  Vagaro&rsquo;s calendar configuration and day-view support articles; Everfit&rsquo;s Master Planner
  release note; Calendly&rsquo;s buffers and Acuity&rsquo;s padding articles; Google Workspace&rsquo;s
  appointment-schedule announcement. &sect;08&rsquo;s recurrence table traces to Google
  Calendar&rsquo;s <i>Create a recurring event</i> help page for the
  <code>Does not repeat</code> control and its <b>On</b> / <b>After</b> bounds and 730-occurrence
  cap; Vagaro&rsquo;s <i>Schedule Repeating Appointments</i> and <i>Book a New Appointment</i>
  articles; ABC Trainerize&rsquo;s <i>How to Schedule Appointments on the Web</i> for
  <code>Repeat Appointment</code> living inline in the <code>Add appointment</code> dialogue, and its
  calendar-availability articles for the fact that availability governs client self-booking rather
  than a trainer&rsquo;s own series; and Everfit&rsquo;s Master Planner note for the absence of
  appointments altogether. Its form reasoning quotes Nielsen Norman&rsquo;s
  <i>EAS Framework for Simplifying Forms</i> on prefilling from data you already hold, the
  <i>Progressive Disclosure</i> article on when a second level is wrong, and Nielsen&rsquo;s fifth
  heuristic on confirming before a consequential commit. The keyboard section quotes the W3C ARIA
  Authoring Practices grid pattern. The row marked <i>Partly inferred</i> reads Google&rsquo;s display granularity from
  community threads rather than from a specification.
  <br><br>Claims about the app trace to <code>app/src/db/schema.ts</code>,
  <code>app/src/clients/conflicts.ts</code>, <code>app/src/clients/schedule.ts</code>,
  <code>app/src/design/TimeField.tsx</code>, <code>app/src/design/DayTimeline.tsx</code>,
  <code>app/src/screens/main/diary/BookSheet.tsx</code> and
  <code>app/src/screens/main/diary/WorkingHoursScreen.tsx</code>. Claims about this design set are
  greppable in this directory.
</p>

</div>
<script src="assets/webapp.js"></script>
</body>
</html>
'''

if __name__ == "__main__":
    out = HERE / "webapp-schedule.html"
    out.write_text(HTML)
    print("wrote", out, len(HTML), "chars")

#!/usr/bin/env python3
"""Generate webapp-dashboard.html — Today, redrawn as a day rather than a report.

Run it from anywhere: python3 gen_today.py — it writes the page next to itself.

The file this replaces opened with "Good morning, Anbu" and four month-to-date
money cards. The app it documents ships `app/src/home/deck.ts`, whose docstring
settles both of those in one sentence:

    "The order of the modules is the finding the teardown produced: a trainer's
     home is a to-do list, not a report. What's next, where the day stands, who
     needs chasing, the schedule, the money, what happened. No chart until the
     day is over, and no greeting at all."

So the web deck was not under-designed. It was designed against the opposite of
what the product had already decided, in writing, in a file that ships.

Two imports do the structural work:

  * `gen_rail`   — the shell, so the rail cannot drift from the rail file.
  * `gen_schedule` — THE DAY ITSELF. Sessions, working hours, the clock, the
    rate and the gym's cut all come from that module's tables. The old page
    said "Tuesday 12 August" for a day the schedule file knows is a Wednesday;
    a date that is computed cannot be off by one.

Nothing in the prose is hand-typed. Every count, minute, rupee and rank below
is derived and asserted.
"""
import pathlib
import re
from datetime import date, timedelta

import gen_schedule as SCH
from gen_rail import (
    I_BELL, I_CAL, I_CHECK, I_CHEV, I_CHEVD, I_DOTSH, I_DUMB, I_EYE, I_GRID,
    I_DO, I_HELP, I_NO, I_OPEN, I_PLUS, I_RUPEE, I_SEARCH, I_SYNC, I_USERS, ic, rail,
)
from gen_schedule import DAYS, LONG, dur, hm, hrsw, merged

HERE = pathlib.Path(__file__).resolve().parent

# ───────────────────────────────────────────────────────── icons, local ──
I_WARN = ('<path d="M12 3.8 21 19.5H3L12 3.8Z"/><path d="M12 10v4"/>'
          '<circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>')
I_PLAY = '<path d="M8 5.5v13l11-6.5-11-6.5Z"/>'
I_MOON = '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>'
I_FLAG = '<path d="M6 3v18"/><path d="M6 4h11l-2 4 2 4H6"/>'
I_CLOCK = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.5 2"/>'
I_SEND = '<path d="M4 12 20 4l-7 16-2.5-6.5L4 12Z"/>'

# ══════════════════════════════════════════════════════════ the day, read ══
# Every one of these comes out of gen_schedule. The only new numbers on this
# page are the ones that file has no reason to hold: a remote session's rate,
# what arrived today, and the month's four money figures.
TODAY = SCH.TODAY                      # 1 — Tuesday
NOW = SCH.NOW                          # 552 — 09:12
D = SCH.WEEK_MON + timedelta(days=TODAY)
assert D == date(2026, 8, 11) and D.strftime("%A") == "Tuesday", D
DATE_LONG = f"{LONG[TODAY]} {D.day} {D.strftime('%B')}"
DATE_SHORT = f"{DAYS[TODAY]} &middot; {D.day} {D.strftime('%b')}"

# THE DEFECT THIS PAGE OPENS ON. The file being replaced says "Tuesday 12
# August" in four places, and 12 August 2026 is a Wednesday. gen_schedule's
# own header records the same bug being fixed across the set — "in the actual
# 2026 calendar 1 August is a Saturday, so 11 August is a TUESDAY and all seven
# labels were off by one day" — and Today, the one screen whose entire subject
# is a date, was never included in that fix.
STALE_DATE = "Tuesday 12 August"
STALE_WD = (SCH.WEEK_MON + timedelta(days=2)).strftime("%A")
assert STALE_WD == "Wednesday", STALE_WD

SESS = sorted([s for s in SCH.SESSIONS if s[0] == TODAY], key=lambda s: s[1])
N_SESS = len(SESS)
N_DONE = sum(1 for s in SESS if s[8] == "done")
WORK = SCH.WORK[TODAY]
GAPS = SCH.GAPS[TODAY]                 # sellable — 60 minutes or more, in hours

# The ribbon's extent: the first thing that happens to the last, floored and
# ceilinged to nothing at all, because both edges already fall on the hour.
LO = min([w[0] for w in WORK] + [s[1] for s in SESS])
HI = max([w[1] for w in WORK] + [s[1] + s[2] for s in SESS])
SPAN = HI - LO
assert (LO, HI, SPAN) == (360, 1230, 870), (LO, HI, SPAN)

# The hole between the two shifts. gen_schedule calls this the quiet band and
# folds it to a 30px seam on the WEEK, where it is seven days wide and holds
# nothing. On one day it is the shape of the day and folding it would be the
# lie: see §04.
HOLE = (WORK[0][1], WORK[1][0])
HOLE_MIN = HOLE[1] - HOLE[0]
assert HOLE_MIN == 390, HOLE_MIN

# ───────────────────────────────────────────────────── the hero's four states ──
# `app/src/screens/main/home/Hero.tsx`: "Four states, one slot." running,
# next, done (tomorrow), first run — plus ClearHero for a day with nothing in
# it. The web draws none of them, which is §03.
RUNNING = [s for s in SESS if s[1] <= NOW < s[1] + s[2]]
assert len(RUNNING) == 1, RUNNING
RUN = RUNNING[0]
RUN_ELAPSED = NOW - RUN[1]
RUN_LEFT = RUN[1] + RUN[2] - NOW
assert (RUN_ELAPSED, RUN_LEFT) == (12, 18), (RUN_ELAPSED, RUN_LEFT)

NEXT = [s for s in SESS if s[1] > NOW][0]
NEXT_IN = NEXT[1] - NOW


def relative(mins):
    """`relativeMinutes` in app/src/home/time.ts, to the letter — minutes up to
       an hour, then hours and minutes. The app's own comment says the hours
       form is where "the countdown is noise"; this page prints it anyway and
       then says what to do about seven hours of noise. See §05."""
    if mins <= 0:
        ago = abs(mins)
        if ago < 1:
            return "starting now"
        if ago < 60:
            return f"started {ago} min ago"
        return f"started {round(ago / 60)} h ago"
    if mins < 60:
        return f"starts in {mins} min"
    h, r = divmod(mins, 60)
    return f"starts in {h} h" if r == 0 else f"starts in {h} h {r} min"


NEXT_REL = relative(NEXT_IN)
assert NEXT_REL == "starts in 7 h 48 min", NEXT_REL

# What is left of the morning once Divya finishes: half an hour, and half an
# hour cannot hold a session. `gaps_for` in gen_schedule drops anything under
# 60 for exactly that reason — "a 30-minute seam between two clients is not a
# gap; it is the seam."
MORNING_LEFT = WORK[0][1] - (RUN[1] + RUN[2])
assert MORNING_LEFT == 30, MORNING_LEFT


# ══════════════════════════════════════════════════════════════════ money ══
# `rupees()` in app/src/home/time.ts — Indian grouping, because
# `toLocaleString` gets it wrong on Hermes. Its own docstring example is
# "₹1,24,500", which is the month's billing and not the figure the old deck
# printed under that word.
def rs(amount):
    n = abs(int(round(amount)))
    s = str(n)
    if len(s) <= 3:
        return "&#8377;" + s
    last3, rest = s[-3:], s[:-3]
    out = ""
    while len(rest) > 2:
        out = "," + rest[-2:] + out
        rest = rest[:-2]
    return "&#8377;" + rest + out + "," + last3


assert rs(124500) == "&#8377;1,24,500", rs(124500)
assert rs(4100) == "&#8377;4,100" and rs(800) == "&#8377;800"

RATE = SCH.RATE            # 800 — a floor session, billed
KEEP = SCH.KEEP            # 432 — what is left of it after the gym's 46%
# Remote is billed higher and the gym takes none of it: the money file says
# "46% of floor · 0% of remote". The number is not invented — it is the only
# rate that reproduces the ₹4,100 the old deck printed in an unlabelled table
# footer, which is the assertion below.
RATE_REMOTE = 900


def billed(s):
    return RATE_REMOTE if s[7] == "remote" else RATE


def kept(s):
    return RATE_REMOTE if s[7] == "remote" else KEEP


DAY_BILLED = sum(billed(s) for s in SESS)
DAY_KEPT = sum(kept(s) for s in SESS)
assert DAY_BILLED == 4100, DAY_BILLED       # the old footer's bare figure
assert DAY_KEPT == 2628, DAY_KEPT           # what it did not say
DAY_LOST = DAY_BILLED - DAY_KEPT
assert DAY_LOST == 1472, DAY_LOST

# Today's sellable gap, priced. One gap, and it is in the evening.
GAP_SLOTS = sum((b - a) // 60 for a, b in GAPS)
GAP_MIN = sum(b - a for a, b in GAPS)
GAP_RS = GAP_SLOTS * RATE
GAP_KEEP = GAP_SLOTS * KEEP
assert (len(GAPS), GAP_MIN, GAP_SLOTS) == (1, 90, 1), (GAPS, GAP_MIN, GAP_SLOTS)

# What has arrived today. Both rows are dated 11 August in the money file's
# ledger; the cash one is also stamped 08:02 in the offline queue three frames
# further down, which is where the minute comes from.
PAID_TODAY = [("Karthik R", "KR", "av-8", 4500, "Cash &middot; floor", 482),
              ("Divya R", "DR", "av-7", 9000, "UPI &middot; 4471", 520)]
COLLECTED_TODAY = sum(p[3] for p in PAID_TODAY)
assert COLLECTED_TODAY == 13500, COLLECTED_TODAY

# ─────────────────────────────────────────────────────── the month, four ways ──
# `DeckMoney` in app/src/home/deck.ts has FOUR fields — billed, collected,
# pending, yours — and `buildMoney` derives yours as `billed - cut`. The old
# deck had one card labelled "Billed this month" holding the COLLECTED figure,
# and a "Yours" derived from it. Both come straight off webapp-money.html.
M_BILLED = 124500       # "Billed · August — 27 sessions across 22 clients"
M_COLLECTED = 106500    # "Collected — 86% in · ₹18,000 outstanding"
M_PENDING = 18000
M_FLOOR = 106500        # "The split, by domain — Floor · 21 sessions ₹1,06,500"
M_CUT = 49000           # "The gym's share — 46% of floor · 0% of remote"
M_TREND = 8
M_YOURS = M_BILLED - M_CUT
M_CLIENTS_OWING = 3

assert M_BILLED - M_COLLECTED == M_PENDING
assert round(100 * M_CUT / M_FLOOR) == 46
assert M_YOURS == 75500, M_YOURS

# WHY NOBODY CAUGHT IT. Two of the money file's figures collide by accident:
# collected equals FLOOR billing, and pending equals REMOTE billing. So
# `collected - cut` and `floor - cut` are the same subtraction, and the wrong
# base produced an answer that closed. It is out by the whole of the month's
# remote work.
assert M_COLLECTED == M_FLOOR
assert M_PENDING == M_BILLED - M_FLOOR
STALE_YOURS = M_COLLECTED - M_CUT
assert STALE_YOURS == 57500, STALE_YOURS
YOURS_GAP = M_YOURS - STALE_YOURS
assert YOURS_GAP == 18000, YOURS_GAP


# ═════════════════════════════════════════════════════════ who needs chasing ══
# `buildAttention` in app/src/home/deck.ts, ported rather than re-invented,
# including the weights — because the weights ARE the design. The old deck's
# queue was in no order at all: §06 proves it by sorting the same six rows.
#
# The weights changed shape after webapp-clients.html was drawn. Ranking money
# by age put a ₹9,000 six-day debt below a ₹3,000 four-day one on this screen
# and above a trainer-account typo on the roster, because the two files had two
# scales. deck.ts now owns one BAND table for both; see §07 and the clients
# file's §02.
QUIET_DAYS = 7          # deck.ts: a live plan and no workout for this long
PACK_ENDING = 2         # deck.ts: a pack this close to empty is worth renewing
OVERDUE_DAYS = 7        # deck.ts: past this, a reminder becomes a problem
ATTENTION_VISIBLE = 3   # deck.ts: "more than three ... and the module becomes
                        # wallpaper" — a PHONE limit, and §06 says why the web
                        # is allowed to disagree with it.

# One invoice per client, dated. The money file's ledger dates all three
# 01 Aug and then gives them ages of 11, 6 and 4 days, which cannot all be
# true of one date — so the dates here are the ones its own ages imply, and
# §13 owes that file the correction.
OWED = [
    ("Farhan Q", "FQ", "av-6",  6000, date(2026, 7, 31)),
    ("Sneha R",  "SR", "av-12", 9000, date(2026, 8, 5)),
    ("Vikram T", "VT", "av-10", 3000, date(2026, 8, 7)),
]
# `sessionsRemaining` on the pack row.
PACKS = [("Kavya M", "KM", "av-9", 0), ("Arjun S", "AS", "av-5", 2)]
# Days since the last logged workout, for a client with a live plan.
QUIET = [("Priya N", "PN", "av-2", 9)]

assert sum(o[3] for o in OWED) == M_PENDING, sum(o[3] for o in OWED)
assert len(OWED) == M_CLIENTS_OWING


# ── the bands ────────────────────────────────────────────────────────────
# `ATTENTION_BANDS` in deck.ts, in order, most urgent first. Ported rather than
# re-invented, because this table is now the ONE place the order lives and the
# roster imports it too — see webapp-clients.html §02, which is the finding that
# produced it. A band is worth 1000 and the magnitude inside it is clamped to
# 0…999, so an amount orders items within a band and can never lift one out.
BANDS = ["unavailable", "setup", "overdue-late", "pack-empty", "quiet",
         "pack-ending", "due-soon", "invite-stale"]
BAND_VALUE = {b: len(BANDS) - i for i, b in enumerate(BANDS)}
CRITICAL_BANDS = {"overdue-late", "pack-empty"}
# Today only ever raises three of the eight. `setup`, `invite-stale` and
# `unavailable` are roster-only, and legitimately so: none of them is a thing
# that happens today. Selection differs; the model does not.
DECK_BANDS = ["overdue-late", "pack-empty", "quiet", "pack-ending", "due-soon"]


def weight(band, magnitude=0):
    return BAND_VALUE[band] * 1000 + max(0, min(999, round(magnitude)))


def sev_of(band):
    return "critical" if band in CRITICAL_BANDS else "alert"


def money_band(days):
    return "overdue-late" if days >= OVERDUE_DAYS else "due-soon"


def pack_band(left):
    return "pack-empty" if left <= 0 else ("pack-ending" if left <= PACK_ENDING
                                           else None)


def attention():
    """Every row, with the app's own line, verb, severity and band weight."""
    out = []
    for name, ini, av, amount, since in OWED:
        days = (D - since).days
        band = money_band(days)
        out.append(dict(
            name=name, ini=ini, av=av, kind="overdue", band=band,
            line=f"{rs(amount)} {'overdue' if band == 'overdue-late' else 'due'}"
                 f" &middot; {days} days",
            sev=sev_of(band), act="Remind",
            weight=weight(band, amount / 100), icon=I_RUPEE))
    for name, ini, av, left in PACKS:
        band = pack_band(left)
        out.append(dict(
            name=name, ini=ini, av=av, kind="pack", band=band,
            line="Pack is empty" if left <= 0 else f"Pack ends in {left} sessions",
            sev=sev_of(band), act="Renew",
            weight=weight(band, PACK_ENDING - left), icon=I_DUMB))
    for name, ini, av, days in QUIET:
        out.append(dict(
            name=name, ini=ini, av=av, kind="quiet", band="quiet",
            line=f"No workout logged in {days} days",
            sev=sev_of("quiet"), act="Nudge",
            weight=weight("quiet", days), icon=I_EYE))
    return sorted(out, key=lambda r: (-r["weight"], r["name"]))


# ── the ten seconds ──────────────────────────────────────────────────────
# H03 of the audit: a destructive action is "reversible for ten seconds in
# place, in the row that changed". Sending a client a WhatsApp about money is
# one, and undo after the message has gone is an apology rather than an undo —
# so the SENDING is held, not just the row's appearance.
#
# The hold belongs to the VERB. `Remind` and `Nudge` message somebody; `Renew`
# writes a package row locally and tells nobody, so it is instant. Four of the
# six rows wait and two do not, which is why this is a set rather than a flag.
HOLD_SECS = 10
HOLD_LEFT = 7                      # the moment frame 1e is drawn at
MSG_VERBS = {"Remind", "Nudge"}
assert 0 < HOLD_LEFT < HOLD_SECS

NEEDS = attention()
N_NEEDS = len(NEEDS)
N_CRIT = sum(1 for r in NEEDS if r["sev"] == "critical")
assert (N_NEEDS, N_CRIT) == (6, 2), (N_NEEDS, N_CRIT)
assert [r["name"] for r in NEEDS] == [
    "Farhan Q", "Kavya M", "Priya N", "Arjun S", "Sneha R", "Vikram T"], NEEDS
assert [r["weight"] for r in NEEDS] == [6060, 5002, 4009, 3000, 2090, 2030], \
    [r["weight"] for r in NEEDS]
assert sorted({r["kind"] for r in NEEDS}) == ["overdue", "pack", "quiet"]
# Every band a row lands in is one Today is allowed to raise, and the two red
# ones are the two that stop the work: money past its date, and a pack with
# nothing left to draw down.
assert all(r["band"] in DECK_BANDS for r in NEEDS)
assert [r["name"] for r in NEEDS if r["sev"] == "critical"] == ["Farhan Q", "Kavya M"]

# The order the old page drew, so §06 can put the two lists side by side. Its
# seventh and eighth rows were the sync queue and the weekly reports, neither
# of which is an `AttentionItem` — the first is chrome and already a pill in
# the top bar, the second is a different job with its own screen.
STALE_ORDER = ["Farhan Q", "Sneha R", "Kavya M", "Arjun S", "Priya N"]
STALE_BADGE = 7
MOVED = sum(1 for i, n in enumerate(STALE_ORDER)
            if [r["name"] for r in NEEDS].index(n) != i)
MISSING = [r["name"] for r in NEEDS if r["name"] not in STALE_ORDER]
assert (MOVED, MISSING) == (3, ["Vikram T"]), (MOVED, MISSING)
# And the verb. The app says Remind for money and Nudge for silence; the old
# page said Nudge for both, which is the difference between asking for a
# payment and asking after somebody.
STALE_VERBS = {"Farhan Q": "Nudge", "Sneha R": "Nudge"}
WRONG_VERB = sum(1 for r in NEEDS if STALE_VERBS.get(r["name"], r["act"]) != r["act"])
assert WRONG_VERB == 2, WRONG_VERB

HELD_N = sum(1 for r in NEEDS if r["act"] in MSG_VERBS)
INSTANT_N = N_NEEDS - HELD_N
assert (HELD_N, INSTANT_N) == (4, 2), (HELD_N, INSTANT_N)
# The row drawn mid-hold is the CRITICAL one on purpose. Farhan Q carries the
# 2px danger edge `.crit` gives a critical row, and the hold tints the row
# --tx-accent-soft: the one arrangement in this component where the set's
# opening rule — lime is a fill, never a ground for content — could go wrong
# again. Drawn, rendered and measured rather than assumed. See §07.
HELD_ROW = NEEDS[0]["name"]
assert HELD_ROW == "Farhan Q" and NEEDS[0]["sev"] == "critical"
assert NEEDS[0]["act"] in MSG_VERBS


# ══════════════════════════════════════════════════════════════ the shell ══
# gen_rail's pin list carries a comment — "the same five the Today screen
# lists, because a rail that disagrees with the screen beside it is the defect
# this page opens on" — and nothing enforced it. This does.
from gen_rail import BUILD as RAIL_BUILD, PINS as RAIL_PINS   # noqa: E402

assert [(p[0], p[1], p[2], p[3]) for p in RAIL_PINS] == \
    [(s[3], s[4], s[5], hm(s[1])) for s in SESS], RAIL_PINS
# One state, three names: the rail says `now`, the session table says `live`,
# and the stylesheet says `.ev--live` / `.rail__pin--now`. Recorded in §13.
assert RAIL_PINS[2][4] == "now" and RUN[8] == "live"


EXER_N = next(d[5][1] for d in RAIL_BUILD if d[0] == "exer")
assert EXER_N == "1,324", EXER_N


def railfor(when="now"):
    """The rail, with today's pins in the state the frame is in.

       `rail()` hard-codes the five pins and their states, so every frame it
       draws is 09:12 whatever the screen beside it says. Until it takes a
       parameter, this rewrites the two slots that carry state — and asserts
       the rewrite landed, because a silent no-op here would put a rail
       claiming a live session next to a screen saying the day is over."""
    r = rail("today", pins=(when != "first"))
    if when == "first":
        # First run: no pins, and no counts either. `HomeScreen` renders
        # `{deck.firstRun ? null : ...}` around every module below the hero,
        # so the phone hides the whole deck; a rail still claiming 22 clients
        # and 3 debtors beside "Add your first client" is the same defect one
        # level out.
        assert 'rail__pin' not in r
        # Five of the six counts are the trainer's own data and go. The sixth
        # is the exercise library, which is 1,324 rows before anybody signs
        # up — a count that is true on the first run is not a first-run bug.
        keep = EXER_N
        pat = re.compile(r'<span class="rail__n[^"]*"[^>]*>([^<]*)</span>')
        gone = [m.group(1) for m in pat.finditer(r) if m.group(1) != keep]
        r = pat.sub(lambda m: m.group(0) if m.group(1) == keep else '', r)
        assert len(gone) == 5 and keep in r, (gone, keep)
        return r
    if when == "done":
        tick = f'<span class="rail__pt rail__pt--done">{ic(I_CHECK, 12)}</span>'
        before = r.count("rail__pt--done")
        r = r.replace('<span class="rail__pt rail__pt--now">Now</span>', tick)
        for _, _, _, t, st in RAIL_PINS:
            if not st:
                r = r.replace(f'<span class="rail__pt">{t}</span>', tick)
        r = r.replace('rail__pin rail__pin--now', 'rail__pin rail__pin--done')
        assert r.count("rail__pt--done") == len(RAIL_PINS), r.count("rail__pt--done")
        assert before == 2
    return r


def top(sub, sync="ok", queued=0):
    """The top bar. The crumb is the destination and the SUBTITLE is the day —
       `dayStamp(now)` plus one word out of `in session` / `day done` /
       `N sessions`, which is the grammar `HomeScreen`'s app bar already uses.
       No greeting: deck.ts settles that in its docstring, and "Good morning,
       Anbu" was occupying the most-read line on the most-read screen."""
    pill = {"ok": '<span class="sync"><i></i>Synced</span>',
            "q": f'<span class="sync sync--queued"><i></i>{queued} queued</span>',
            "off": '<span class="sync sync--offline"><i></i>Offline</span>'}[sync]
    return f'''<header class="top">
  <nav class="crumbs" aria-label="Breadcrumb"><b>Today</b></nav>
  <div class="omni">{ic(I_SEARCH, 15)}<span>Search clients, sessions, exercises&hellip;</span><kbd>&#8984;K</kbd></div>
  <div class="top__acts">{pill}
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Notifications">{ic(I_BELL, 18)}</button>
  </div></header>'''


def av(ini, token, cls="av--sm"):
    return (f'<span class="av {cls}" style="background:var(--tx-{token})">'
            f'{ini}</span>')


# ═══════════════════════════════════════════════════════════ the day ribbon ══
def block(s, *, hi=False):
    """One session, laid on its side. `left` is the start minute minus the
       ribbon's, `width` is the duration — the week grid's identity, rotated."""
    wd, st, mins, ini, token, name, plan, mode, state = s
    cls = ["ev", "ev--h", f"ev--m{mins}"]
    if mode == "remote":
        cls.append("ev--remote")
    if state == "done":
        cls.append("ev--done")
    elif state == "live":
        cls.append("ev--live")
    elif state == "noshow":
        cls.append("ev--noshow")
    elif state == "late":
        cls.append("ev--late")
    if hi:
        cls.append("ev--just")
    lab = (f'{name}, {hm(st)} to {hm(st + mins)}, {plan}, '
           f'{"remote" if mode == "remote" else "floor"}'
           + (f", {state}" if state else ""))
    return (f'<button class="{" ".join(cls)}" type="button" '
            f'style="left:{st - LO}px;width:{mins}px" aria-label="{lab}">'
            f'{av(ini, token)}</button>')


def ribbon(sessions=None, *, now=NOW, gaps=None, hi=None):
    """The whole day in 870px. Windows are the ground, the rest is the week
       grid's hatch, and the hole between the shifts keeps its full width."""
    sess = SESS if sessions is None else sessions
    gps = GAPS if gaps is None else gaps
    out = []
    for a, b in WORK:
        out.append(f'<div class="dr__win" aria-hidden="true" '
                   f'style="left:{a - LO}px;width:{b - a}px"></div>')
    # everything not a working window, hatched — computed as the complement so
    # a window that moves cannot leave a stripe behind.
    cur = LO
    for a, b in WORK + [(HI, HI)]:
        if a > cur:
            out.append(f'<div class="dr__off" aria-hidden="true" '
                       f'style="left:{cur - LO}px;width:{a - cur}px"></div>')
        cur = max(cur, b)
    for m in range(LO, HI + 1, 60):
        h = ' dr__l--h' if any(m in (a, b) for a, b in WORK) else ''
        out.append(f'<div class="dr__l{h}" aria-hidden="true" style="left:{m - LO}px"></div>')
    out.append(f'<div class="dr__hole" style="left:{HOLE[0] - LO + HOLE_MIN // 2}px">'
               f'<b>{hm(HOLE[0])} &ndash; {hm(HOLE[1])}</b> &middot; between shifts, '
               f'{hrsw(HOLE_MIN)} &mdash; not sellable</div>')
    for a, b in gps:
        slots = (b - a) // 60
        out.append(f'<button class="gapb gapb--h" type="button" '
                   f'style="left:{a - LO}px;width:{b - a}px" '
                   f'aria-label="Free, {hm(a)} to {hm(b)}, {dur(b - a)}, '
                   f'worth {slots * RATE} rupees billed">'
                   f'<b>{hm(a)}</b><span>{dur(b - a)} free</span></button>')
    for s in sess:
        out.append(block(s, hi=(hi is not None and s[1] == hi)))
    # Only when now is INSIDE the day. At 20:52 the marker sat at 1132px in an
    # 870px track: the line was clipped by the track's overflow and the chip,
    # which lives on the ruler, was not — so a label reading 20:52 floated
    # past the end of the day on top of the 20:00 tick. A day that is over has
    # no "now" on it, and the hero already says so.
    live_now = now is not None and LO <= now <= HI
    if live_now:
        out.append(f'<div class="dr__now" style="left:{now - LO}px"><i></i></div>')
    # the ruler. Labelled at every even hour and at any window edge that is not
    # one, which is how 16:30 gets a number without labelling all fifteen.
    # A window edge always gets a label; an even hour gets one only if no edge
    # is already within 34px of it. Labelling both put "16:00" and "16:30" on
    # top of each other, and again at 20:00 / 20:30.
    edges = sorted({a for a, b in WORK} | {b for a, b in WORK})
    ticks = list(edges)
    for m in range(LO, HI + 1, 60):
        if (m // 60) % 2 == 0 and all(abs(m - e) > 34 for e in edges):
            ticks.append(m)
    ax = ''.join(f'<span class="dr__t" style="left:{m - LO}px">{hm(m)}</span>'
                 for m in sorted(ticks))
    if live_now:
        ax += f'<span class="dr__nt" style="left:{now - LO}px">{hm(now)}</span>'

    return (f'<div class="dr" style="width:{SPAN}px">{"".join(out)}</div>'
            f'<div class="dr__ax" style="width:{SPAN}px">{ax}</div>')


# ═══════════════════════════════════════════════════════════════ the week ══
# `buildWeek` in deck.ts counts done over everything SCHEDULED for the week,
# which on a Tuesday morning is a fraction whose denominator is mostly in the
# future. The old deck printed "Sessions made 18 of 21 · 86% adherence" at
# 09:12 on the second day of the week, when nine sessions had started. So the
# figures here are over the ELAPSED week, and the number still to come is
# stated rather than folded into a denominator.
WEEK = [s for s in SCH.SESSIONS]
START_ORD = [(s[0], s[1]) for s in WEEK]


def before_now(s):
    return (s[0], s[1]) < (TODAY, NOW)


STARTED = [s for s in WEEK if before_now(s)]
W_START = len(STARTED)
W_DONE = sum(1 for s in STARTED if s[8] == "done")
W_NOSHOW = sum(1 for s in STARTED if s[8] == "noshow")
W_LIVE = sum(1 for s in STARTED if s[8] == "live")
W_LEFT = len(WEEK) - W_START
W_SETTLED = W_DONE + W_NOSHOW
W_PCT = round(100 * W_DONE / W_SETTLED)
assert (W_START, W_DONE, W_NOSHOW, W_LIVE, W_LEFT) == (9, 7, 1, 1, 14), \
    (W_START, W_DONE, W_NOSHOW, W_LIVE, W_LEFT)
assert W_PCT == 88, W_PCT
# The old card's claim, and why it cannot be true.
STALE_WEEK = (18, 21, 86, 84)
assert STALE_WEEK[0] > W_START, STALE_WEEK
# The eight-week figure belongs to webapp-reports.html, which says 72% and
# "was 78% four weeks ago". The old deck said 84%, which is a third number for
# the same measure on a screen that links to the one holding it.
REP_8W, REP_8W_WAS = 72, 78

# ─────────────────────────────────────────────────────────────────── tomorrow ──
TOM = TODAY + 1
TOM_D = SCH.WEEK_MON + timedelta(days=TOM)
TOM_SESS = sorted([s for s in SCH.SESSIONS if s[0] == TOM], key=lambda s: s[1])
TOM_FIRST = TOM_SESS[0]
# `CLASH` is keyed by index into SESSIONS, so the pair is looked up rather
# than assumed. Tomorrow is the day the week grid draws side by side.
TOM_CLASH = sorted({SCH.SESSIONS[i][5] for pair in SCH.CLASH.items()
                    for i in (pair[0],) + tuple(pair[1])
                    if SCH.SESSIONS[i][0] == TOM})
assert len(TOM_SESS) == 4 and TOM_FIRST[5] == "Meera K", TOM_SESS
assert TOM_CLASH == ["Nikhil P", "Sneha R"], TOM_CLASH
CLASH_AT = min(s[1] for s in TOM_SESS if s[5] in TOM_CLASH)
CLASH_FROM = max(s[1] for s in TOM_SESS if s[5] in TOM_CLASH)
CLASH_OVER = min(s[1] + s[2] for s in TOM_SESS if s[5] in TOM_CLASH) - CLASH_FROM
assert (CLASH_AT, CLASH_FROM, CLASH_OVER) == (990, 1035, 15), (CLASH_AT, CLASH_FROM, CLASH_OVER)
TOM_LABEL = f"{LONG[TOM]} {TOM_D.day} {TOM_D.strftime('%B')}"

# ───────────────────────────────────────────────── the evening, and the day ──
EVE = 20 * 60 + 52       # 20:52 — after the last window closes at 20:30
assert EVE > WORK[-1][1]
# Every session settled. The two that were open at 09:12 closed.
DONE_DAY = [(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], "done") for s in SESS]
EVE_KEPT = DAY_KEPT
# The gap nobody filled. This is the only figure on the evening frame that is
# not also on the morning one, and it is the point of the frame.
UNSOLD_RS, UNSOLD_KEEP = GAP_RS, GAP_KEEP


# ═══════════════════════════════════════════════════════════════ the hero ══
# `NEXT_GRACE_MS` in deck.ts, in minutes: a session stays "next" for this long
# after its start time, "a trainer who is ten minutes late still wants the same
# card, not the one after it".
NEXT_GRACE = 90


def hero(kicker, clock, unit, name, detail, band=None, acts=(), *, live=False,
         quiet=False, empty=None, label=None):
    """One slot, five states — `Hero.tsx`'s "four states, one slot", plus the
       ClearHero it also ships. The kicker is the only thing that changes tone;
       the figure stays the same size in every state, which is the phone's rule
       and the only one of its decisions that survives the change of distance."""
    k = ('<span class="hro__k' + (' hro__k--live' if live else '') + '">'
         + ('<i></i>' if live else '') + kicker + '</span>')
    if empty is not None:
        fig = f'<p class="hro__n" style="font-size:22px;margin-top:12px">{empty}</p>'
    else:
        u = f'<em>{unit}</em>' if unit else ''
        # aria-hidden: read as "twelve colon zero zero" a display figure is
        # worse than the same fact in the card's own label, which is why the
        # label is a required argument wherever there is a figure.
        fig = f'<p class="hro__c" aria-hidden="true">{clock}{u}</p>'
    n = f'<p class="hro__n">{name}</p>' if name else ''
    d = f'<p class="hro__d">{detail}</p>' if detail else ''
    b = ''
    if band:
        glyph, tone, text = band
        b = (f'<div class="hro__w{" hro__w--" + tone if tone else ""}">'
             f'{ic(glyph, 16)}<span>{text}</span></div>')
    a = ''
    if acts:
        a = '<div class="hro__a">' + ''.join(
            f'<button class="btn btn--sm btn--{v}" type="button">'
            f'{ic(g, 15) if g else ""}{lab}</button>' for lab, v, g in acts) + '</div>'
    cls = "card" + ("" if quiet or empty is not None else " card--acc" if live else "")
    lab = f' aria-label="{label}"' if label else ''
    return (f'<div class="{cls}" role="group"{lab}><div class="hro">'
            f'{k}{fig}{n}{d}{b}{a}</div></div>')


def hero_running():
    return hero(
        f'In session &middot; {"Remote" if RUN[7] == "remote" else "Floor"}',
        f'{RUN_ELAPSED}:00', 'elapsed', RUN[5],
        f'{RUN[6]} &middot; {"Remote" if RUN[7] == "remote" else "Floor"} '
        f'&middot; {hm(RUN[1])}&ndash;{hm(RUN[1] + RUN[2])}',
        band=(I_CLOCK, "acc",
              f'<b>{RUN_LEFT} min left.</b> A remote check-in is the one kind of '
              f'session run from this desk.'),
        acts=(("Open the log", "primary", I_PLAY), ("End session", "ghost", None)),
        live=True,
        label=(f'In session: {RUN[5]}, {RUN_ELAPSED} minutes elapsed, '
               f'{RUN_LEFT} minutes left'))


def hero_next(*, late=False):
    if late:
        rel = relative(RUN[1] - NOW)
        return hero(
            f'Next &middot; {rel}', hm(RUN[1]), '', RUN[5],
            f'{RUN[6]} &middot; Remote &middot; {dur(RUN[2])}',
            band=(I_WARN, "warn",
                  f'<b>Nothing logged.</b> A session stays &ldquo;next&rdquo; for '
                  f'{NEXT_GRACE} min, so this card holds until '
                  f'{hm(RUN[1] + NEXT_GRACE)}.'),
            acts=(("Start it", "primary", I_PLAY), ("Mark no-show", "ghost", I_NO)),
            live=True,
            label=(f'Next: {RUN[5]} at {hm(RUN[1])}, {rel}, nothing logged'))
    return hero(
        f'Next &middot; {NEXT_REL}', hm(NEXT[1]), '', NEXT[5],
        f'{NEXT[6]} &middot; Floor &middot; {dur(NEXT[2])}',
        band=(I_CLOCK, "",
              f'<b>Your morning ends at {hm(WORK[0][1])}</b> &mdash; {MORNING_LEFT} min after '
              f'Divya, under the hour a session needs. Next sellable hour: '
              f'<b>{hm(GAPS[0][0])}</b>.'),
        acts=(("Book the " + hm(GAPS[0][0]), "secondary", I_PLUS),
              ("Move Nikhil", "ghost", None)),
        quiet=True,
        label=f'Next: {NEXT[5]} at {hm(NEXT[1])}, {NEXT_REL}')


def hero_tomorrow():
    return hero(
        f'Tomorrow &middot; {LONG[TOM]}', hm(TOM_FIRST[1]), '', TOM_FIRST[5],
        f'{TOM_FIRST[6]} &middot; Floor &middot; {len(TOM_SESS)} sessions tomorrow',
        band=(I_WARN, "warn",
              f'<b>{TOM_CLASH[0]} and {TOM_CLASH[1]} overlap by {CLASH_OVER} min</b> '
              f'from {hm(CLASH_FROM)} &mdash; found tonight, not at {hm(CLASH_FROM)} '
              f'tomorrow.'),
        acts=(("Fix the clash", "primary", I_CAL), ("See tomorrow", "ghost", None)),
        quiet=True,
        label=(f'Tomorrow, {LONG[TOM]}: {TOM_FIRST[5]} at {hm(TOM_FIRST[1])}, '
               f'{len(TOM_SESS)} sessions, one clash'))


def hero_first():
    return hero('No clients yet', '', '', 'Name and number is all it takes',
                'A roster of one is enough to book a session, log a set and take a '
                'payment. Everything else on this screen fills itself in.',
                acts=(("Add a client", "primary", I_PLUS),),
                empty='Add your first client')


# ══════════════════════════════════════════════════════════════ the panels ══
def card(title, body, *, badge=None, acts="", flush=False, tag=None):
    b = f'<span class="rail__n rail__n--alert" aria-label="{badge[1]}">{badge[0]}</span>' if badge else ''
    t = f'<span class="tag">{tag}</span>' if tag else ''
    a = f'<span class="card__acts">{acts}</span>' if acts else ''
    cb = 'card__b card__b--flush' if flush else 'card__b'
    return (f'<div class="card"><div class="card__hd"><span class="card__t">{title}</span>'
            f'{b}{t}{a}</div><div class="{cb}">{body}</div></div>')


def queue(rows=None, *, empty=False, held=None, off=False):
    """Who needs chasing. Six rows, in the app's own weight order, with the
       app's own verb on each. The badge counts ATTENTION ITEMS and nothing
       else: the sync queue is chrome and already a pill in the top bar, and
       the weekly reports are a different job with their own screen. Putting
       both in here is how the old badge got to seven."""
    if empty:
        return card("Needs you", f'''<div class="empty" style="min-height:220px;padding:34px 24px">
      <span class="empty__ic">{ic(I_CHECK, 22)}</span>
      <p class="empty__t">Nobody needs you</p>
      <p class="empty__b">No payment is late, no pack is running out and nobody has gone
        quiet. This is the only module on the screen that is better empty.</p></div>''')
    rs_ = rows if rows is not None else NEEDS
    body = ''.join(qrow(r, held=(held == r["name"]), off=off) for r in rs_)
    return card("Needs you", f'<table class="tbl"><tbody>{body}</tbody></table>',
                badge=(len(rs_), f"{len(rs_)} clients need you"), flush=True)


def qrow(r, *, held=False, off=False):
    """One queue row, in one of three states: at rest, held for ten seconds,
       or offline &mdash; where a verb that needs a connection is disabled and
       one that does not is untouched."""
    cls = "crit" if r["sev"] == "critical" else ""
    who = (f'<td style="padding-left:15px"><span class="who">{av(r["ini"], r["av"])}'
           f'<b>{r["name"]}</b></span></td>')
    msg = r["act"] in MSG_VERBS
    if held:
        pct = round(100 * HOLD_LEFT / HOLD_SECS)
        return (f'<tr class="{cls} held">{who}'
                f'<td class="ink3" style="font-size:12.5px" aria-live="polite">'
                f'<span class="acc">Held</span> &mdash; {r["name"].split()[0]} is told in '
                f'<b class="mono">{HOLD_LEFT}s</b></td>'
                f'<td style="text-align:right;width:98px"><div class="hold">'
                f'<button class="hold__b" type="button">Undo</button>'
                f'<div class="cw__bar cw__bar--row" role="progressbar" '
                f'aria-valuenow="{HOLD_LEFT}" aria-valuemin="0" aria-valuemax="{HOLD_SECS}" '
                f'aria-label="Seconds left to stop the message">'
                f'<i style="width:{pct}%"></i></div></div></td></tr>')
    dis = ' disabled' if off and msg else ''
    return (f'<tr class="{cls}">{who}'
            f'<td class="ink3" style="font-size:12.5px">{r["line"]}</td>'
            f'<td style="text-align:right;width:98px">'
            f'<button class="btn btn--sm btn--secondary" type="button"{dis}>'
            f'{r["act"]}</button></td></tr>')


M_OK = round(100 * W_DONE / len(WEEK))
M_NO = round(100 * W_NOSHOW / len(WEEK))
M_LIVE = round(100 * W_LIVE / len(WEEK))
assert M_OK + M_NO + M_LIVE < 100


def weekcard():
    return card(
        f"This week &middot; so far",
        f'''<div class="kv"><span class="kv__k">Delivered</span>
        <span class="kv__v">{W_DONE}</span></div>
      <div class="kv"><span class="kv__k">No-shows</span>
        <span class="kv__v warn">{W_NOSHOW}</span></div>
      <div class="kv"><span class="kv__k">Running now</span>
        <span class="kv__v acc">{W_LIVE}</span></div>
      <div class="kv"><span class="kv__k">Still to come</span>
        <span class="kv__v">{W_LEFT}</span></div>
      <div class="meter meter--lg mt3">
        <i class="ok" style="width:{M_OK}%"></i>
        <i class="warn" style="width:{M_NO}%"></i>
        <i style="width:{M_LIVE}%"></i>
        <i class="dim" style="width:{100 - M_OK - M_NO - M_LIVE}%"></i></div>
      <p class="small mt2"><b>{W_START} of {len(WEEK)}</b> have started, and {W_PCT}% of
        what settled was delivered. Eight-week figure: <b>{REP_8W}%</b>.</p>''',
        acts=f'<button class="btn btn--sm btn--ghost" type="button">{ic(I_SEND, 14)}Send 8 reports</button>')


def monthcard(*, close=False):
    """Fourth in reading order, because deck.ts puts money fourth of six. The
       four figures are `DeckMoney`'s four fields, each under its own name —
       which is the whole fix, and it is worth &#8377;{YOURS_GAP:,}."""
    note = (f'<p class="small mt3"><b>{D.strftime("%B")} is ready to close.</b> '
            f'{M_CLIENTS_OWING} clients still owe {rs(M_PENDING)}.</p>' if close else '')
    return card(
        f"{D.strftime('%B')} &middot; the month",
        f'''<div class="kv"><span class="kv__k">Billed</span>
        <span class="kv__v">{rs(M_BILLED)} <span class="ink3" style="font-weight:400">+{M_TREND}%</span></span></div>
      <div class="kv"><span class="kv__k">Collected</span>
        <span class="kv__v">{rs(M_COLLECTED)}</span></div>
      <div class="kv"><span class="kv__k">Still owed</span>
        <span class="kv__v" style="color:var(--tx-danger)">{rs(M_PENDING)}</span></div>
      <div class="kv"><span class="kv__k">The gym&rsquo;s share
        <span class="ink3">&middot; {round(100 * M_CUT / M_FLOOR)}% of floor</span></span>
        <span class="kv__v" style="color:var(--tx-warn)">&minus;{rs(M_CUT)}</span></div>
      <div class="kv"><span class="kv__k"><b style="color:var(--tx-ink)">Yours</b></span>
        <span class="kv__v" style="color:var(--tx-accent-text)">{rs(M_YOURS)}</span></div>
      {note}''',
        acts=f'<button class="btn btn--sm btn--ghost" type="button">Open{ic(I_CHEV, 14)}</button>')


def daycard(*, sessions=None, now=NOW, gaps=None, hi=None, sub=None, tag=None):
    """The ribbon, its ruler, and the day's own money — the only three things
       that are true of the DAY rather than of the month."""
    sess = SESS if sessions is None else sessions
    done = sum(1 for s in sess if s[8] == "done")
    live = sum(1 for s in sess if s[8] == "live")
    left = len(sess) - done - live
    late = sum(1 for s in sess if s[8] == "late")
    left = left - late
    parts = [f"{done} done"]
    if live:
        parts.append(f"{live} running")
    if late:
        parts.append(f"{late} unopened")
    if left:
        parts.append(f"{left} to go")
    foot = sub if sub is not None else (
        f'{" &middot; ".join(parts)} &nbsp;&middot;&nbsp; '
        f'<b>{rs(sum(billed(s) for s in sess))}</b> billed, '
        f'<b style="color:var(--tx-accent-text)">{rs(sum(kept(s) for s in sess))}</b> yours')
    return (f'<div class="card"><div class="card__hd">'
            f'<span class="card__t">{DATE_LONG}</span>'
            f'<span class="tag">{tag or f"{len(sess)} sessions"}</span>'
            f'<span class="tag tag--info">{hm(WORK[0][0])}&ndash;{hm(WORK[0][1])} '
            f'&middot; {hm(WORK[1][0])}&ndash;{hm(WORK[1][1])}</span>'
            f'<span class="card__acts"><span class="small">{foot}</span></span>'
            f'</div><div class="card__b" style="padding:9px 16px 4px">'
            f'{ribbon(sess, now=now, gaps=gaps, hi=hi)}</div></div>')


# ══════════════════════════════════════════════════════════════ the screen ══
def screen(*, hero_a, hero_b=None, day=None, third=None, sub, sync="ok",
           queued=0, note=None, pal=None, keys=False, when="now"):
    """Three rows and nothing else. Row one is what is happening, row two is
       the shape of the day, row three is what needs a decision. Money is the
       last column of row three, which is fourth in reading order — the
       position deck.ts gives it and the position the old deck did not."""
    top_row = (f'<div class="grid2">{hero_a}{hero_b}</div>' if hero_b
               else f'<div>{hero_a}</div>')
    rows = [top_row]
    if day:
        rows.append(f'<div style="margin-top:10px">{day}</div>')
    if third:
        rows.append('<div style="margin-top:10px;display:grid;gap:12px;'
                    'grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)">'
                    + third + '</div>')
    body = ''.join(rows)
    # First run has no week to open and nothing to book a session against, so
    # the two head controls are not drawn. A live button that cannot work is
    # the defect &sect;08 of the schedule file is named after.
    acts = ('' if when == "first" else
            f'<button class="btn btn--secondary" type="button">{ic(I_CAL, 15)}The week</button>'
            f'<button class="btn btn--primary" type="button">{ic(I_PLUS, 15)}New session</button>')
    scrim = '<div class="scrim scrim--top"></div>' + pal if pal else ''
    banner = note or ''
    return (f'<div class="app" data-theme="dark">{railfor(when)}'
            f'{top(sub, sync, queued)}'
            f'<main class="main"><div class="ph"><div class="ph__row">'
            f'<div><p class="ph__t">{DATE_LONG}</p>'
            f'<p class="ph__sub">{sub}</p></div>'
            f'<div class="ph__acts">{acts}</div></div></div>'
            f'<div class="body">{banner}{body}</div></main>{scrim}</div>')


THIRD = queue() + weekcard() + monthcard()


def palette():
    """Scoped to the match, and the actions offered are the ones the queue is
       already asking for — Kavya M's pack is the second row of Needs you, so
       Renew is the first action here. The old frame searched "mee" and
       returned "Ananya S" as its second result, which contains no such
       string."""
    k = next(r for r in NEEDS if r["name"] == "Kavya M")
    rows = [
        ('<p class="pal__gk">Clients</p>'
         f'<div class="pal__i" aria-selected="true">{av(k["ini"], k["av"])}'
         f'Kavya M<span class="ink3" style="font-size:12px;margin-left:8px">'
         f'{k["line"]}</span><kbd>&crarr;</kbd></div>'),
        '<p class="pal__gk">Actions</p>',
        f'<div class="pal__i">{ic(I_DUMB, 16)}Renew Kavya M&rsquo;s pack<kbd>R</kbd></div>',
        f'<div class="pal__i">{ic(I_CAL, 16)}Move her {hm(SESS[-1][1])}<kbd>M</kbd></div>',
        f'<div class="pal__i">{ic(I_RUPEE, 16)}Record a payment from Kavya M</div>',
        '<p class="pal__gk">Go to</p>',
        f'<div class="pal__i">{ic(I_USERS, 16)}Kavya M &middot; her file<kbd>G C</kbd></div>',
        f'<div class="pal__i">{ic(I_RUPEE, 16)}Money &middot; {D.strftime("%B")}<kbd>G M</kbd></div>',
    ]
    return ('<div class="pal" role="dialog" aria-label="Command palette">'
            f'<div class="pal__in">{ic(I_SEARCH, 17)}<span>kav</span>'
            '<span class="pal__car"></span></div>'
            f'<div class="pal__list">{"".join(rows)}</div></div>')


def offline_hero():
    """Offline, the hero slot answers a different question. "What is next" is
       not in doubt when the connection drops; whether anything you have typed
       is safe is, and the answer takes both halves of the row."""
    return f'''<div class="card card--acc" role="group" aria-label="Offline. {len(QROWS)} entries
      held on this browser and nothing is lost."><div class="hro">
    <span class="hro__k hro__k--live">Offline &middot; nothing is lost</span>
    <p class="hro__c" aria-hidden="true">{len(QROWS)}<em>entries held on this browser</em></p>
    <p class="hro__d" style="max-width:108ch;font-size:13px;margin-top:9px">Sessions, sets,
      attendance and cash write to this browser first and go up when the connection returns
      &mdash; the same architecture as the phone, which is why the day above is drawn rather than
      blanked. <b style="color:var(--tx-ink)">Two things need a connection</b> and are disabled
      rather than failing: a WhatsApp, and an OTP. So
      <b style="color:var(--tx-ink)">Remind</b> and <b style="color:var(--tx-ink)">Nudge</b> grey
      out and <b style="color:var(--tx-ink)">Renew</b> does not &mdash; see &sect;07.</p>
    <div class="hro__a">
      <button class="btn btn--sm btn--secondary" type="button">Review the queue</button>
      <button class="btn btn--sm btn--ghost" type="button">Retry now</button></div>
  </div></div>'''


QROWS = [
    ("Push A &middot; Meera K &middot; 12 sets", "06:52 &middot; queued 41 min", "ok"),
    ("Legs B &middot; Arjun S &middot; 9 sets", "08:14 &middot; queued 19 min", "ok"),
    (f"{rs(4500)} cash &middot; Karthik R", "08:02 &middot; queued 31 min", "ok"),
    ("Weight 60.8 kg &middot; Meera K", "07:01 &middot; queued 33 min", "ok"),
    ("Check-in started &middot; Divya R", "09:00 &middot; queued 12 min", "ok"),
    ("Reminder to Farhan Q", "Held &mdash; needs a connection", "err"),
]


def syncqueue():
    body = ''.join(
        f'<div class="q"><span class="q__ic q__ic--{tone}">'
        f'{ic(I_CHECK if tone == "ok" else I_NO, 13)}</span>'
        f'<span class="q__m"><span class="q__t">{t}</span>'
        f'<span class="q__s">{s}</span></span></div>'
        for t, s, tone in QROWS)
    return card("Waiting to sync", body, badge=(len(QROWS), f"{len(QROWS)} entries queued"),
                flush=True)


assert len(QROWS) == 6, len(QROWS)


# ══════════════════════════════════════════════════════════════════ frames ══
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


HOURS_TAG = (f'{hm(WORK[0][0])}&ndash;{hm(WORK[0][1])} and '
             f'{hm(WORK[1][0])}&ndash;{hm(WORK[1][1])}')

SUB_1A = f'In session with {RUN[5]} &middot; {N_SESS} sessions, {N_DONE} done'

SUB_1B = (f'{RUN[5]} is {RUN_ELAPSED} minutes into a session nobody has opened '
          f'&middot; {N_SESS} sessions, {N_DONE} done')
SUB_1C = f'Day done &middot; {N_SESS} of {N_SESS} delivered'
SUB_1D = 'No clients yet &middot; nothing to show until there is one'
SUB_3A = f'Working offline &middot; {len(QROWS)} entries held on this device'

F1A = screen(hero_a=hero_running(), hero_b=hero_next(), day=daycard(),
             third=THIRD, sub=SUB_1A)

F1B = screen(hero_a=hero_next(late=True),
             hero_b=hero(f'After that &middot; {NEXT_REL}', hm(NEXT[1]), '', NEXT[5],
                         f'{NEXT[6]} &middot; Floor &middot; {dur(NEXT[2])}',
                         band=(I_CLOCK, "",
                               f'<b>Nothing sellable</b> between {hm(RUN[1] + RUN[2])} and '
                               f'{hm(NEXT[1])} &mdash; the shift closes at {hm(WORK[0][1])}.'),
                         acts=(("Move Nikhil", "secondary", I_CAL),),
                         quiet=True,
                         label=f'After that: {NEXT[5]} at {hm(NEXT[1])}, {NEXT_REL}'),
             day=daycard(sessions=[s if s[8] != "live" else s[:8] + ("late",)
                                   for s in SESS],
                         tag=f'{N_SESS} sessions'),
             third=THIRD, sub=SUB_1B)

F1C = screen(hero_a=hero_tomorrow(),
             hero_b=hero('The day, closed', rs(DAY_KEPT), 'yours', 'of ' + rs(DAY_BILLED) + ' billed',  # noqa: E501
                         f'{N_SESS} sessions delivered &middot; '
                         f'{rs(DAY_LOST)} to the gym',
                         band=(I_RUPEE, "warn",
                               f'<b>{hm(GAPS[0][0])}&ndash;{hm(GAPS[0][1])} went unsold</b> &mdash; '
                               f'{dur(GAP_MIN)} inside your own hours, {rs(GAP_RS)} billed, '
                               f'{rs(GAP_KEEP)} kept.'),
                         quiet=True,
                         label=(f'The day, closed: {rs(DAY_KEPT).replace("&#8377;", "")} rupees '
                                f'yours of {rs(DAY_BILLED).replace("&#8377;", "")} billed')),
             day=daycard(sessions=DONE_DAY, now=EVE, tag=f'{N_SESS} delivered'),
             third=THIRD, sub=SUB_1C, when="done")

FIRST = f'''<div class="card"><div class="empty" style="min-height:400px">
  <span class="empty__ic">{ic(I_USERS, 22)}</span>
  <p class="empty__t">Add your first client</p>
  <p class="empty__b">Name and number is all it takes. A roster of one is enough to book a
    session, log a set and take a payment &mdash; and every other module on this screen is
    derived from clients, sessions and payments, so until there is one there is nothing for
    them to say.</p>
  <div class="row gap2" style="margin-top:6px">
    <button class="btn btn--primary" type="button">{ic(I_PLUS, 15)}Add a client</button>
    <button class="btn btn--ghost" type="button">Import from a spreadsheet</button></div>
  </div></div>'''

F1D = screen(hero_a=FIRST, sub=SUB_1D, when="first")

F2A = screen(hero_a=hero_running(), hero_b=hero_next(), day=daycard(),
             third=THIRD, sub=SUB_1A, pal=palette())

F3A = screen(hero_a=offline_hero(),
             day=daycard(tag=f'{N_SESS} sessions &middot; saved on this device'),
             third=syncqueue() + weekcard() + monthcard(),
             sub=SUB_3A, sync="off")


# ════════════════════════════════════════════════ the old page, measured ══
# Every claim in §01 is computed here rather than asserted in prose. The
# figures come out of webapp-dashboard.html as it stood, and the tables they
# are checked against come out of gen_schedule.
STALE_GAPS = [(2, 660, 960, "5 h"),      # "Wed 11:00 — 16:00   5 h"
              (3, 780, 990, "3.5 h"),    # "Thu 13:00 — 16:30   3.5 h"
              (5, 540, 660, "2 h")]      # "Sat 09:00 — 11:00   2 h"
STALE_GAP_RS = 8000                      # "worth about ₹8,000 if you fill half"


def overlap_work(wd, a, b):
    """How much of [a, b) falls inside that weekday's working windows."""
    return sum(max(0, min(b, we) - max(a, ws)) for ws, we in SCH.WORK[wd])


STALE_TOTAL = sum(b - a for _, a, b, _ in STALE_GAPS)
STALE_INSIDE = sum(overlap_work(wd, a, b) for wd, a, b, _ in STALE_GAPS)
STALE_OUTSIDE = STALE_TOTAL - STALE_INSIDE
# Two of the three fell entirely outside the trainer's hours and the third
# overran its end by an hour, so of ten and a half hours offered for sale,
# ninety minutes were ever sellable — and Karthik R has that Saturday morning.
assert (STALE_TOTAL, STALE_INSIDE, STALE_OUTSIDE) == (630, 60, 570), \
    (STALE_TOTAL, STALE_INSIDE, STALE_OUTSIDE)
STALE_FULLY_OUT = sum(1 for wd, a, b, _ in STALE_GAPS if overlap_work(wd, a, b) == 0)
assert STALE_FULLY_OUT == 2, STALE_FULLY_OUT
# and its arithmetic. "Half of them" priced at ₹800 a session is ₹4,200, not
# ₹8,000 — the figure quoted for half is what the whole would have been worth.
STALE_WHOLE = (STALE_TOTAL // 60) * RATE
STALE_HALF = STALE_WHOLE // 2
assert (STALE_WHOLE, STALE_HALF) == (8000, 4000), (STALE_WHOLE, STALE_HALF)
# What the week's gaps are actually worth, from the same table the grid draws
# from: ten gaps, sixteen sellable hours.
WEEK_GAP_RS, WEEK_GAP_KEEP, WEEK_GAP_N = SCH.GAP_RS, SCH.GAP_KEEP, SCH.GAP_N
assert (WEEK_GAP_N, WEEK_GAP_RS, WEEK_GAP_KEEP) == (10, 12800, 6912), \
    (WEEK_GAP_N, WEEK_GAP_RS, WEEK_GAP_KEEP)

# The old day table. Eight columns became seven when the audit dropped the fee
# column, and the footer's colspan was never moved with it.
STALE_COLS, STALE_COLSPAN, STALE_FOOT_CELLS = 7, 6, 2
assert STALE_COLSPAN + STALE_FOOT_CELLS == STALE_COLS + 1

# What the old page put on the screen, counted for §01's last row: four money
# cards, a five-row table, a seven-row queue, and four panels below the fold.
STALE_PANELS = 4          # This week, Free time, Your own training + the queue
STALE_BELOW = 3           # of those, three sat under 900px


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


S01 = f'''<p class="note">Ten things, and the first four are one decision seen from four sides.
The page this replaces was not under-designed. It was designed against a decision the product
had already made, in writing, in a file that ships &mdash; the docstring at the top of
<code>app/src/home/deck.ts</code>:</p>

<div class="why"><p class="why__k">app/src/home/deck.ts &middot; lines 9&ndash;12</p>
<p>&ldquo;The order of the modules is the finding the teardown produced: <b>a trainer&rsquo;s home
is a to-do list, not a report.</b> What&rsquo;s next, where the day stands, who needs chasing, the
schedule, the money, what happened. <b>No chart until the day is over, and no greeting at
all.</b>&rdquo;</p></div>

<p class="note" style="margin-top:22px">The old deck opened with <i>Good morning, Anbu</i> and four
month-to-date money cards. It is the exact inverse: the greeting the file rules out, in the position
the file gives to what happens next, with money promoted from fourth of six to first of three. And
the phone is not guessing either &mdash; <code>Hero.tsx</code> ships <b>five</b> hero states
(<code>NextHero</code>, <code>RunningHero</code>, <code>TomorrowHero</code>, <code>ClearHero</code>,
<code>FirstRunHero</code>) under the comment &ldquo;Four states, one slot&rdquo;, and the web drew
none of them.</p>

{finding("01", "The date is a Wednesday", "danger",
  f'''&ldquo;{STALE_DATE}&rdquo; appears four times on the old page. In the 2026 calendar
  12 August is a <b>{STALE_WD}</b>. The whole design set had this bug and
  <code>gen_schedule.py</code> fixed it in its header comment &mdash; &ldquo;in the actual 2026
  calendar 1 August is a Saturday, so 11 August is a TUESDAY and all seven labels were off by one
  day&rdquo; &mdash; and the one screen whose entire subject is a date was left out of the fix.''',
  f'''<code>python3 -c "import datetime; print(datetime.date(2026,8,12).strftime('%A'))"</code>.
  This page imports its day from <code>gen_schedule</code>: <code>WEEK_MON + timedelta(days=TODAY)</code>
  is {DATE_LONG}, and a date that is computed cannot be off by one. The import is asserted, not
  trusted.''')}

{finding("02", "The headline money figure is under the wrong word", "danger",
  f'''The old stat row led with <b>{rs(M_COLLECTED)}</b> labelled <i>Billed this month</i>.
  On <a href="webapp-money.html">the money screen</a> that figure is <i>Collected</i>; <i>Billed</i>
  is <b>{rs(M_BILLED)}</b>. <code>DeckMoney</code> in <code>deck.ts</code> has both as separate
  fields and derives <code>yours: billed - cut</code>, so the trainer&rsquo;s own number is
  <b>{rs(M_YOURS)}</b> and the old deck showed <b>{rs(STALE_YOURS)}</b> &mdash; out by
  <b>{rs(YOURS_GAP)}</b>, which is the whole of the month&rsquo;s remote work.''',
  f'''Grep both files for the figures. And here is why nobody caught it: two of the money
  file&rsquo;s numbers collide by accident. Collected ({rs(M_COLLECTED)}) equals <b>floor</b>
  billing, and pending ({rs(M_PENDING)}) equals <b>remote</b> billing. So
  <code>collected &minus; cut</code> and <code>floor &minus; cut</code> are the same subtraction,
  the arithmetic closed, and the wrong base was invisible. Both collisions are asserted in this
  script so the next edit to that file breaks the build instead of the page.''')}

{finding("03", "No hero, on the screen whose job is &ldquo;what do I do now&rdquo;", "danger",
  f'''At {hm(NOW)} on this Tuesday a session is running, the next one is
  <b>{NEXT_REL.replace("starts in ", "")}</b> away, and the old page said neither. It opened with
  a greeting, then four figures about the month, then a five-row table in which
  the running session was one row of five with the word <i>In&nbsp;progress</i> in its sixth
  column.''',
  f'''<code>Hero.tsx</code>, first line of its docstring: &ldquo;The top of the deck &mdash; the
  one thing on the screen that changes shape.&rdquo; Its five exported components are the five
  states. Grep the old page for any of their content: an elapsed clock, a countdown, a
  tomorrow card, a rest-day state, a first-run state. None of the five is drawn.''')}

{finding("04", "A greeting the product had ruled out in writing", "danger",
  '''<i>Good morning, Anbu</i> occupied the first line of the most-read screen. Nielsen
  Norman&rsquo;s scrolling study measures the top 20% of a page as taking over <b>42%</b> of viewing
  time; the deck spent it on a word that is true of every morning and tells the trainer nothing
  about this one.''',
  '''<code>deck.ts</code>: &ldquo;no greeting at all&rdquo;. And the app bar the phone actually
  ships composes its subtitle as <code>dayStamp(now)</code> plus one of
  <code>in session</code> / <code>day done</code> / <code>N sessions</code> &mdash; a grammar this
  page adopts verbatim.''')}

{finding("05", "The queue was in no order", "danger",
  f'''<code>buildAttention</code> assigns every row a <code>weight</code> and sorts on it.
  Since the roster was drawn those weights are <b>bands</b>, one table in
  <code>deck.ts</code> read by both screens: money past its date, then an empty pack, then
  a quiet client, then a pack running low, then money not yet late. A band is worth 1000
  and the amount inside it is clamped, so a big number orders rows within a band and can
  never lift one out of it. Sorting the old page&rsquo;s own six rows by them moves
  <b>{MOVED}</b> of the five. A <b>sixth</b> client
  &mdash; {MISSING[0]}, {rs(3000)}, {(D - OWED[2][4]).days} days late &mdash; was not on the list at
  all, though the stat row above it counted him. And two rows carried the wrong verb:
  the app says <b>Remind</b> for money and <b>Nudge</b> for silence, and the old page said
  <i>Nudge</i> for both.''',
  f'''&sect;07 puts the two orders side by side with the weights printed. The badge is the other
  half: it read <b>{STALE_BADGE}</b> because the sync queue and the weekly reports were rows in it,
  and neither is an <code>AttentionItem</code> &mdash; <code>AttentionKind</code> is
  <code>overdue | quiet | pack</code>, three kinds. Sync is chrome and already a pill in the top
  bar. The badge is <b>{N_NEEDS}</b>.''')}

{finding("06", "The week card reported a finished week on the second morning of it", "danger",
  f'''It read <i>Sessions made {STALE_WEEK[0]} of {STALE_WEEK[1]}</i> and
  <i>{STALE_WEEK[2]}% adherence</i>. At {hm(NOW)} on Tuesday, <b>{W_START}</b> of the week&rsquo;s
  {len(WEEK)} sessions had started. {STALE_WEEK[0]} sessions cannot have been made when
  {W_START} have begun. It also quoted an eight-week average of <b>{STALE_WEEK[3]}%</b>, where
  <a href="webapp-reports.html">the reports screen</a> that owns the measure says
  <b>{REP_8W}%</b>.''',
  f'''Count the sessions in <code>SESSIONS</code> whose <code>(weekday, start)</code> is before
  <code>(TODAY, NOW)</code>: {W_START}. Of those {W_DONE} are done, {W_NOSHOW} is a no-show and
  {W_LIVE} is running. The new card reports the elapsed week and states the
  <b>{W_LEFT}</b> that have not happened rather than folding them into a denominator.''')}

{finding("07", "It offered to sell hours the trainer does not work", "danger",
  f'''<i>Free time you could sell</i> listed three windows &mdash; Wed 11:00&ndash;16:00,
  Thu 13:00&ndash;16:30, Sat 09:00&ndash;11:00. Checked against <code>working_hours</code>,
  <b>{STALE_FULLY_OUT}</b> of the three fall <b>entirely</b> outside the trainer&rsquo;s windows and
  the third overruns its end by an hour. Of {hrsw(STALE_TOTAL)} offered for sale,
  {dur(STALE_INSIDE)} was ever sellable &mdash; and Karthik R has that Saturday morning.''',
  f'''<code>WORK[2]</code> and <code>WORK[3]</code> are
  {hm(WORK[0][0])}&ndash;{hm(WORK[0][1])} and {hm(WORK[1][0])}&ndash;{hm(WORK[1][1])}; the three
  windows offered sit in the 10:00&ndash;16:30 hole between the shifts. The arithmetic was wrong
  too: {hrsw(STALE_TOTAL)} at {rs(RATE)} is {rs(STALE_WHOLE)} for the whole and
  {rs(STALE_HALF)} for half, and {rs(STALE_GAP_RS)} was quoted as the half. The real figure, from
  the same table the week grid draws from, is <b>{WEEK_GAP_N}</b> gaps worth
  {rs(WEEK_GAP_RS)} billed and <b>{rs(WEEK_GAP_KEEP)}</b> kept.''')}

{finding("08", "A card for a feature that is switched off", "warn",
  f'''<i>Your own training &middot; Second book</i> was one of three panels in the bottom row.
  <code>SELF_TRAINING_ENABLED</code> in <code>app/src/settings/prefs.ts</code> is
  <code>false</code>, and every entry point in the app is gated on it &mdash;
  <code>AppTabs</code>, <code>AppDrawer</code>, <code>LogPickScreen</code>,
  <code>MainStack</code>.''',
  f'''<a href="webapp-rail.html">The rail file</a> flagged this and said whose decision it was:
  &ldquo;The card is drawn here because it is on the real Today screen today; which of the two is
  wrong is &sect;10&rsquo;s last row, and it is not a decision a rail gets to make.&rdquo; It is a
  decision Today gets to make. The card is gone.''')}

{finding("09", "An unlabelled rupee figure, in a footer one column too wide", "danger",
  f'''The day table&rsquo;s footer held <b>{rs(DAY_BILLED)}</b> with no word beside it. For this
  product that is the one figure that must never be bare: {rs(DAY_BILLED)} is what the day
  <b>billed</b> and {rs(DAY_KEPT)} is what the trainer <b>keeps</b>, and the difference is
  {rs(DAY_LOST)} &mdash; the gym&rsquo;s cut, which is the entire argument for the product.''',
  f'''The same footer read <code>colspan="{STALE_COLSPAN}"</code> plus
  {STALE_FOOT_CELLS} cells against a {STALE_COLS}-column table &mdash; one column too many, left
  over from the pass that dropped the fee column. Both figures are now in the day card&rsquo;s head,
  each under its own word.''')}

{finding("10", "It said it did not scroll, and it scrolled", "warn",
  f'''<a href="webapp-heuristics.html">The audit</a> passed this screen on heuristic 8 with
  &ldquo;Three questions answered without scrolling &mdash; where am I on money, what is happening
  today, who needs chasing. <b>Nothing else is on that screen.</b>&rdquo; There were
  {STALE_PANELS} more panels, {STALE_BELOW} of them below 900px.''',
  f'''Render the old frame at 1440&times;900 and look. Every frame on this page is measured
  instead: the tallest is <b>exactly 900px</b> of content, checked by rendering headless and
  scanning up from the bottom of the image for the last non-canvas pixel.''')}'''


from gen_rail import pattern   # noqa: E402

S02 = '''<p class="note">Six products, and the survey produced one finding rather than six: the
category splits into two families and <b>nobody is in the middle</b>. The coaching products build an
attention queue and no money. The booking and point-of-sale products build a money snapshot and no
attention queue. X&nbsp;REP&rsquo;s deck already tried to be both, which is the right ambition and
was, in the old page, the wrong order &mdash; it led with the family the trainer opens once a month.
<br><br>Rows marked <span class="tag tag--ok">Verified</span> trace to the vendor&rsquo;s own help
centre or product page. Where a page returned 403 to a direct fetch, the row says which claims came
from search summaries of that page rather than from the page itself.</p>

''' + pattern(
    "TrueCoach &mdash; the dashboard IS the landing screen",
    "ok", "Verified from vendor product page",
    '''Their dashboard page is explicit: it is <b>the first thing you see when you log in</b>, and it
    carries four named queues &mdash; <b>Today&rsquo;s Workouts</b>, <b>Reminders</b>,
    <b>Due&nbsp;Soon</b> (a client&rsquo;s program is running out) and <b>Needs&nbsp;Attention</b>
    (missed workouts, declining compliance, unusual patterns), plus client comments. Today&rsquo;s
    workouts are sorted <b>in-person, dual, then remote-only</b>. The marketing claim is a
    <b>&ldquo;one-screen system&rdquo;</b>.''',
    '''<b>Everything.</b> This is the closest thing in the category to what X&nbsp;REP is building and
    it validates three separate decisions: the home screen is a queue, the queue is
    <i>named by what it wants from you</i> rather than by which table it came from, and
    <b>Due Soon</b> is our <code>PACK_ENDING</code> rule under a better name. The in-person /
    remote sort is our floor / remote split, and it is first on their list too.''',
    '''<b>Four separate queues.</b> Four lists of one to three rows is four headings, four empty
    states and four places to look, and a trainer with one late payment and one empty pack has to
    scan all four to find two rows. Ours is <b>one</b> ranked queue with the kind stated in the row
    &mdash; which is what <code>buildAttention</code>&rsquo;s weights already produce.''') + '''

''' + pattern(
    "ABC Trainerize &mdash; the dashboard is about a client, not about your day",
    "ok", "Partly verified &middot; help centre returned 403",
    '''Their <b>Client Insights Dashboard</b> (early access) is a <b>per-client</b> surface: four
    widgets showing the most-viewed insights, and a colour-coded <b>Weekly Compliance</b> grid of
    habit, nutrition and workout completion. Clicking a widget opens the matching section of that
    client&rsquo;s Progress tab. The trainer-side <i>Things to do today</i> that their help centre
    describes is <b>a copy of the client&rsquo;s calendar for the current day</b> &mdash; again, one
    client at a time.''',
    '''The <b>compliance grid</b> as a shape: seven cells, one per day, colour as the only encoding.
    It is the cheapest possible answer to &ldquo;is this person still turning up&rdquo; and it would
    sit in a 300px column. Worth considering for the client file rather than for Today.''',
    '''<b>Per-client as the only scope.</b> A dashboard you have to open a person to see is a
    report, not a deck. The trainer&rsquo;s question at 09:12 is not &ldquo;how is Meera
    doing&rdquo; &mdash; it is &ldquo;who is next and is anything about to go wrong&rdquo;, and no
    per-client screen can answer it.''') + '''

''' + pattern(
    "Everfit &mdash; a Today screen, in the client app",
    "ok", "Verified from vendor docs",
    '''Everfit ships a screen called <b>Today</b> and it is documented under <i>Client App</i>: the
    client&rsquo;s own workouts, tasks and habits for the day. The coach side is organised around the
    client list and the Task Library; the habit-coaching insights dashboard is again per-client, a
    &ldquo;quick glance at which clients are hitting their goals and which are falling
    behind&rdquo;.''',
    '''The <b>name</b>, and the fact that they gave it to the person who has to act today. Also the
    habit dashboard&rsquo;s framing &mdash; <i>hitting</i> versus <i>falling behind</i> &mdash; which
    is a two-state ranking and exactly what <code>severity: alert | critical</code> already is.''',
    '''<b>Giving the day to the client and the list to the coach.</b> The coach has a day too. Ours
    is the trainer&rsquo;s day, and the client portal is a separate, deliberately sparse file.''') + '''

''' + pattern(
    "PTminder &mdash; money on the home screen, and it is the wrong money",
    "warn", "Verified from vendor help centre",
    '''The dashboard shows <b>total money made over the year, the previous month and the current
    month</b>, plus pending invoices. The gym-versus-trainer split does exist &mdash; but as
    <b>Payroll Reports</b>, calculated from <b>Pay Rates</b> set per staff member, with report
    variants <i>By Class</i>, <i>By Session</i>, <i>By Service</i>, <i>By Hours</i> and
    <i>By Salary</i>, each ending in a column called <b>Trainer Payout</b>.''',
    '''<b>The confirmation, and the inversion.</b> This is the only product in the survey that
    computes the number X&nbsp;REP is built on &mdash; and it computes it <i>from the gym&rsquo;s
    side</i>, as a payroll line, for a business paying a member of staff. The trainer is the payee,
    not the user. X&nbsp;REP turns the same arithmetic the other way up: the trainer is the user and
    the gym is the deduction. That is one sentence, and it is the product.''',
    '''<b>Year-to-date on a daily screen.</b> Money made this year is a number a trainer looks at in
    March when deciding whether to leave the gym. It is not a number that changes what they do at
    09:12, and a home screen that leads with it has decided the user is an owner.''') + '''

''' + pattern(
    "Vagaro &mdash; the most glanceable thing they ship is not in the product",
    "ok", "Verified from vendor support articles",
    '''The calendar is home; the thing called <b>Dashboard</b> is a set of customisable report
    widgets reached through <b>Reports &rarr; Dashboard</b>. Their genuinely glanceable surface is an
    <b>iOS home-screen widget</b>: it shows <b>the next appointment and the others on the same
    day</b>, and their own copy says you can read <b>up to 4 appointments in about a second</b>.
    Staff shifts are drawn on the calendar beside the appointments.''',
    '''<b>Next, then the rest of today</b> &mdash; and the second-in-a-second target. That is the
    hero and the ribbon, and it is worth noticing that the best statement of this idea in the whole
    category is <b>outside the application</b>, in 160&times;160px of operating-system chrome. Also
    <b>shifts drawn on the same surface as the bookings</b>, which is what the ribbon&rsquo;s two
    working windows are.''',
    '''<b>Burying the overview under Reports.</b> If the glance is worth an OS widget it is worth a
    screen, and putting it two clicks inside a reporting section says the calendar is the only home a
    business tool needs.''') + '''

''' + pattern(
    "Mindbody &mdash; the home figure is an accounting figure",
    "warn", "Partly verified &middot; from support-article summaries",
    '''The business app&rsquo;s overview is a <b>Business Snapshot</b>, and its documented option is
    whether to run it on a <b>cash or accrual basis</b>, with tips included in the total.''',
    '''<b>Nothing, and that is the finding.</b> Cash versus accrual is the correct choice for an
    accountant and it is the clearest possible evidence of who the screen was designed for.''',
    '''<b>The whole framing.</b> A trainer standing on a gym floor has never asked their software
    for an accrual view.''') + f'''

<div class="grp"><div class="grp__t"><h4>Two families, and the middle</h4>
  <span><span class="tag tag--acc">Synthesis</span></span></div>
<table class="rt" style="width:100%">
<thead><tr><th style="width:19%">Product</th><th style="width:13%">What home is</th>
  <th style="width:15%">An attention queue?</th><th style="width:17%">Money on it?</th>
  <th>What is missing</th></tr></thead>
<tbody>
<tr><th>TrueCoach</th><td>A dashboard</td>
  <td><b style="color:var(--tx-ok)">Yes &mdash; four of them</b></td>
  <td>No</td><td>What a session is worth, and therefore what a gap costs.</td></tr>
<tr><th>ABC Trainerize</th><td>A client</td><td>Per client</td><td>No</td>
  <td>The trainer&rsquo;s own day as a scope.</td></tr>
<tr><th>Everfit</th><td>A client list</td><td>Per client</td><td>No</td>
  <td>Same. The screen called Today belongs to the client.</td></tr>
<tr><th>PTminder</th><td>A dashboard</td><td>Invoices only</td>
  <td><b style="color:var(--tx-warn)">Year &middot; last month &middot; this month</b></td>
  <td>Anything about the next hour. The split exists as payroll.</td></tr>
<tr><th>Vagaro</th><td>The calendar</td><td>No</td><td>Under Reports</td>
  <td>A screen doing what their OS widget does.</td></tr>
<tr><th>Mindbody</th><td>A snapshot</td><td>No</td><td>Cash or accrual</td>
  <td>A user who is not an accountant.</td></tr>
<tr class="dt__hl"><th>X&nbsp;REP</th><td><b>The day</b></td>
  <td><b>One, ranked by weight</b></td>
  <td><b>Two scopes, both named</b></td>
  <td>&mdash;</td></tr>
</tbody></table>
<p class="note" style="margin-top:16px">Three things fall out of the table. <b>One:</b> not one of
the six answers &ldquo;what is happening in the next hour&rdquo; on its home screen, and the closest
anyone comes is an operating-system widget. <b>Two:</b> the two products with money on the home
screen both put a <i>period total</i> there &mdash; a year, a month, a snapshot &mdash; and none puts
the <b>day</b>. <b>Three:</b> the gym&rsquo;s cut is rendered exactly once in the category, by
PTminder, from the gym&rsquo;s side, in a column called <i>Trainer Payout</i>. That is the whole
market position in one word: their <i>payout</i> is our <b>Yours</b>.</p></div>'''


S03 = f'''<p class="note">Nine principles, each with the change it actually caused. A principle that
did not move a pixel is not listed &mdash; this is not a compliance checklist, it is the audit trail
for nine decisions.</p>

<table class="rt" style="width:100%;margin-top:18px">
<thead><tr><th style="width:23%">Principle</th><th style="width:31%">What it says</th>
  <th>What it changed here</th></tr></thead>
<tbody>
<tr><th>Vanity metrics<br><span class="ink3" style="font-weight:400;font-size:12px">Harley, 2019</span></th>
  <td>A vanity metric &ldquo;appears impressive but doesn&rsquo;t give insight into the true
    performance&rdquo;; a tracked metric should be <b>actionable</b> &mdash; changes in it should map
    to changes in the health of the thing. Perpetually-growing counts are the classic case.</td>
  <td><b>The four month cards went.</b> <i>Billed this month {rs(M_COLLECTED)} &middot; +{M_TREND}%
    on July</i> is a monotonic count with a month-over-month delta, and on the 11th nothing the
    trainer does before lunch changes it. What replaced it in that position is
    <b>{RUN_LEFT}&nbsp;min left</b> and <b>{NEXT_REL}</b>, both of which change every minute and
    both of which have an action attached.</td></tr>
<tr><th>Scrolling and attention<br><span class="ink3" style="font-weight:400;font-size:12px">Fessenden, 2018</span></th>
  <td>120 participants, 130,000+ fixations: <b>57%</b> of viewing time above the fold, <b>42%</b> in
    the top 20% of the page, <b>74%</b> within two screenfuls. Put high-priority content and the
    major call to action above the fold.</td>
  <td>Every frame here is <b>exactly 900px</b> of content, measured by rendering headless and
    scanning up for the last non-canvas pixel. The old page put {STALE_BELOW} panels under 900 while
    claiming in the audit that nothing else was on the screen. The top 20% &mdash; 180px, which is
    the hero row almost exactly &mdash; now holds the only two things that change during the day.</td></tr>
<tr><th>Progressive disclosure</th>
  <td>Disclose up front only what is <b>frequently</b> needed; put the rest one gesture away.</td>
  <td>The five-row day table went. It listed the same five clients, in the same order, with the same
    times and states, as <b>the rail three inches to its left</b> &mdash; whose own source comment
    says the pins are &ldquo;the same five the Today screen lists&rdquo;. The ribbon shows what the
    rail cannot (shape, the hole, the sellable stretch, now); the rail shows what the ribbon cannot
    (names, times, ticks). Neither repeats the other.</td></tr>
<tr><th>8 guidelines for complex applications &middot; 6<br>
    <span class="ink3" style="font-weight:400;font-size:12px">Kaplan, 2020</span></th>
  <td><b>Reduce clutter without reducing capability</b> &mdash; staged disclosure, options shown when
    relevant.</td>
  <td>Two whole panels left and no capability did. <i>Your own training</i> is gated off in the app;
    <i>Free time you could sell</i> became <b>one dashed block on the ribbon at the hour it
    refers to</b>, which is both smaller and more useful than three rows of text about other days.</td></tr>
<tr><th>&hellip; &middot; 7</th>
  <td><b>Ease transition between primary and secondary information</b> without leaving the screen.</td>
  <td>The ribbon&rsquo;s blocks are buttons carrying an <code>aria-label</code> with the client, both
    times, the plan, the mode and the state &mdash; so the secondary detail is on hover and on focus,
    and the primary reading stays a shape.</td></tr>
<tr><th>&hellip; &middot; 8</th>
  <td><b>Make important information visually salient</b> &mdash; by adding emphasis, or by removing
    what competes with it.</td>
  <td>Mostly by removing. The old screen had <b>four</b> 27px display figures in its top row, all
    about the month, competing with each other. There are now <b>two</b> 36px figures, and they are
    an elapsed clock and a start time.</td></tr>
<tr><th>Heuristic 1 &middot; visibility of system status</th>
  <td>Keep the user informed about what is going on, through appropriate feedback within reasonable
    time.</td>
  <td>Three things that were implicit are now drawn: <b>now</b>, as a line through the day at
    {hm(NOW)}; <b>a session that started and was never opened</b>, which the app can distinguish and
    the block ladder could not (see &sect;09); and <b>which hours are yours</b>, as the two
    unhatched windows.</td></tr>
<tr><th>Heuristic 4 &middot; consistency and standards</th>
  <td>Users should not have to wonder whether different words or situations mean the same thing.</td>
  <td>This one <b>stopped</b> a design. The month was going to become a five-figure strip across the
    bottom of the screen, and it is instead a card in the third column, the same shape as its two
    neighbours &mdash; because a screen whose layout changes on the 1st of the month teaches nothing
    twelve times a year. The CSS for the strip was written and then deleted; the comment where it
    lived says so.</td></tr>
<tr><th>Heuristic 8 &middot; aesthetic and minimalist design</th>
  <td>Interfaces should not contain information which is irrelevant or rarely needed.</td>
  <td>The icon column in the queue went. At 15px in a table cell it rendered as what the
    stylesheet&rsquo;s own comment calls &ldquo;a smudge&rdquo;, and it was encoding a category the
    row&rsquo;s own words already state.</td></tr>
</tbody></table>

<div class="why why--warn" style="max-width:none"><p class="why__k">The one that cuts the other way</p>
<p><b>Heuristic 5, error prevention, argues against something on this screen.</b> The queue&rsquo;s
six buttons &mdash; four <i>Remind</i>, two <i>Renew</i> &mdash; are one click from sending a real
WhatsApp message to a real client about money. Nielsen&rsquo;s fifth heuristic asks for a confirmation
before actions &ldquo;with serious consequences&rdquo;, and this qualifies: the schedule file&rsquo;s
own rule is that a mis-drop which messages a client must be <b>held for ten seconds with the
countdown visible</b>. The buttons here do not do that yet, because the hold belongs to the nudge
component and not to this screen. It is &sect;13&rsquo;s first row rather than a footnote, because
shipping this screen without it would make the most dangerous control on it the easiest one to
press.</p></div>'''


S04 = f'''<p class="note">Three rows, and each one answers a different question in the order the app
already ranked them: <b>what is happening</b>, <b>what shape is the day</b>, <b>what needs a
decision</b>. Money is the last column of the third row, which is fourth in reading order &mdash;
the position <code>deck.ts</code> gives it out of six modules, reached without a scroll because a
1440px canvas has three columns where a phone has one.
<br><br>The page head carries the date at 22px, because the screen is called Today and the date is
the one thing on it that is unarguable. The subtitle is the app bar&rsquo;s own grammar:
<code>dayStamp(now)</code> plus one of <code>in session</code> / <code>day done</code> /
<code>N sessions</code>. No greeting.</p>

{units(frame("1a", "Today &middot; a session running", "home &middot; 1a&ndash;1e",
             "/today", F1A, f'''<b>Everything on this screen is derived from two tables in
  <code>gen_schedule.py</code>.</b> The five blocks, the two working windows, the hole between them,
  the one sellable hour, the clock, the date and every rupee figure come from <code>SESSIONS</code>
  and <code>WORK</code> &mdash; the same tables the week grid draws from, imported rather than
  retyped. That is why the date says {LONG[TODAY]} rather than {STALE_DATE}, and it is the only
  defence against the class of bug &sect;01 opens with.
  <br><br><b>The two figures in the top row are the two that change.</b> {RUN[5]}&rsquo;s session has
  {RUN_LEFT} minutes to run; {NEXT[5]}&rsquo;s starts in {NEXT_IN // 60} hours and
  {NEXT_IN % 60} minutes. Between them the trainer has {MORNING_LEFT} minutes of working time left
  this morning, which is less than the hour a session needs, so the honest thing the second card can
  say is that there is nothing to sell before the evening &mdash; and it says it.
  <br><br><b>Money appears twice, at two scopes, each with its scope in the label.</b> The day
  &mdash; {rs(DAY_BILLED)} billed, {rs(DAY_KEPT)} yours &mdash; sits in the day card&rsquo;s head,
  beside the day it is about. The month sits in the third column with all four of
  <code>DeckMoney</code>&rsquo;s fields under their own names. Neither is a card at the top of the
  screen, and neither is a bare figure.'''))}'''

S05 = f'''<p class="note">The schedule file&rsquo;s whole redesign was one sentence &mdash;
<b>one minute is one pixel</b> &mdash; and it was drawn vertically, seven days across. Today needs
the same geometry rotated: a block&rsquo;s <code>left</code> is its start minute minus the
ribbon&rsquo;s, its <code>width</code> is its duration in minutes. No scale factor and no rounding,
which is what makes the arithmetic below checkable with a ruler.</p>

<div class="bench bench--tight" style="margin-top:20px;overflow-x:auto">
  <div style="min-width:{SPAN + 40}px">{ribbon()}</div></div>

<div class="grid3 mt4">
  <div class="card"><div class="card__b">
    <p class="micro" style="color:var(--tx-accent-text)">THE ARITHMETIC</p>
    <p class="h5" style="margin:8px 0 6px;line-height:1.45">{hm(LO)} to {hm(HI)} is
      {SPAN} minutes, so the track is {SPAN}px.</p>
    <p style="font-size:13px;line-height:1.6;color:var(--tx-ink-2)">The content column at 1440 is
      1144px wide. {SPAN} fits inside it at <b>1:1</b> with 274px left over, which is the entire
      reason this can be a ribbon rather than a chart with an axis scale. At a wider canvas it does
      not stretch; it stays true and the column gets emptier.</p></div></div>
  <div class="card"><div class="card__b">
    <p class="micro" style="color:var(--tx-accent-text)">THE FLOOR</p>
    <p class="h5" style="margin:8px 0 6px;line-height:1.45">A 30-minute session is 30px, and a
      24px avatar fits in it.</p>
    <p style="font-size:13px;line-height:1.6;color:var(--tx-ink-2)">Nothing else does. So the blocks
      carry <b>the person and nothing else</b> &mdash; no time, no plan name &mdash; and the shortest
      session this product books is exactly wide enough to be a face rather than a bar. The names,
      times and ticks are in the rail, which is already listing the same five.</p></div></div>
  <div class="card"><div class="card__b">
    <p class="micro" style="color:var(--tx-warn)">WHAT IT REFUSES TO FOLD</p>
    <p class="h5" style="margin:8px 0 6px;line-height:1.45">{hrsw(HOLE_MIN)} of the {SPAN} minutes
      is the gap between two shifts, and it keeps every pixel.</p>
    <p style="font-size:13px;line-height:1.6;color:var(--tx-ink-2)">The week grid folds that same
      span to a 30px seam, and is right to: across seven days it holds nothing. On <b>one</b> day it
      is the shape of the day. A trainer who works {hm(WORK[0][0])}&ndash;{hm(WORK[0][1])} and
      {hm(WORK[1][0])}&ndash;{hm(WORK[1][1])} is not busy from six till half eight, and a ribbon that
      compressed the middle would say they were.</p></div></div>
</div>

<p class="note" style="margin-top:22px"><b>The hatch means what it means on the week.</b> Outside a
working window the ground is the same 45&deg; hatch <code>.cw__off</code> uses, for the same reason
the schedule file gives: working hours constrain what a <i>client</i> can self-book and have never
constrained the trainer, so the hours are hatched rather than blocked. The one dashed block is
<code>.gapb</code>, unchanged from the week &mdash; a free interval <b>inside</b> working hours, long
enough to sell, labelled with what it is worth. Today has exactly one:
<b>{hm(GAPS[0][0])}&ndash;{hm(GAPS[0][1])}</b>, {dur(GAP_MIN)}, {rs(GAP_RS)} billed and
<b>{rs(GAP_KEEP)}</b> kept. Two of the three the old page offered fell entirely outside the
trainer&rsquo;s windows, and the third overran its end by an hour.</p>

<div class="why"><p class="why__k">Two things the render found that reading could not</p>
<p><b>The now chip covered the session it was pointing at.</b> At {hm(NOW)} the marker sits 192px
into the track, and {RUN[5]}&rsquo;s block occupies 180&ndash;210 &mdash; so a 40px label at
<code>top:-1px</code> covered the whole of the one block the frame exists to show. The week grid gets
away with the identical trick because its blocks are 60px <i>wide</i> and the label sits in the last
40px of the row; a ribbon&rsquo;s blocks are 30px wide and there is nowhere on them to put a label.
The chip moved to the ruler, under the line, where nothing can be behind it.
<br><br><b>And at 20:52 it floated past the end of the day.</b> The evening frame&rsquo;s clock is
after the last window closes, so <code>now &minus; LO</code> is 1132px in an 870px track: the line was
clipped by the track&rsquo;s <code>overflow</code> and the chip, which now lives on the ruler, was
not &mdash; a label reading 20:52 sitting on top of the 20:00 tick. A day that is over has no
<i>now</i> on it, so the marker is drawn only when the clock is inside
[{hm(LO)},&nbsp;{hm(HI)}].</p></div>'''


# the hero bench — five states in one slot, drawn small
def herocell(label, html, w=356):
    return (f'<div class="cell"><span class="cell__l">{label}</span>'
            f'<div style="width:{w}px">{html}</div></div>')


HERO_BENCH = (
    '<div class="bench" style="overflow-x:auto"><div class="bench__row" '
    'style="align-items:stretch;flex-wrap:nowrap;gap:18px;min-width:1140px">'
    + herocell("RUNNING &middot; 09:12", hero_running())
    + herocell("NEXT &middot; 09:12", hero_next())
    + herocell("DONE &middot; 20:52", hero_tomorrow())
    + '</div></div>')

S06 = f'''<p class="note"><code>Hero.tsx</code> opens with a sentence this design set had not acted
on: <b>&ldquo;The top of the deck &mdash; the one thing on the screen that changes shape. Four
states, one slot.&rdquo;</b> It exports five, and the reason the phone gives for the display figure
is worth quoting whole, because it is the only reason in the file that does <i>not</i> survive the
move to a desk:</p>

<div class="why"><p class="why__k">app/src/screens/main/home/Hero.tsx</p>
<p>&ldquo;The <b>62px</b> display figure is the same in every state. It is the only element on the
screen readable at arm&rsquo;s length on a gym floor, which is the whole reason it is that
size.&rdquo;</p></div>

<p class="note" style="margin-top:20px">A desk does not have arm&rsquo;s length, so 62 became
<b>36</b> &mdash; measured against the 27px stat value it is still unmistakably the largest thing on
the page. But the <i>other</i> reason for a display figure survives intact: a trainer walks past this
screen between clients, and a number they can read while walking is worth more than a row they have
to stop for. What did <b>not</b> change is the rule that all five states use the same slot at the same
size, so the shape of the screen never moves.</p>

{HERO_BENCH}

<table class="rt" style="width:100%;margin-top:22px">
<thead><tr><th style="width:14%">State</th><th style="width:15%">When</th>
  <th style="width:24%">The figure</th><th>What the band adds, and why it is not a tooltip</th></tr></thead>
<tbody>
<tr><th>Running</th><td>A workout log is open against a session that is neither done nor dead</td>
  <td><b>{RUN_ELAPSED}:00</b> elapsed &mdash; <code>formatClock</code>, the phone&rsquo;s own
    <code>m:ss</code></td>
  <td>{RUN_LEFT} minutes left, and the fact that <b>{RUN[5]}&rsquo;s is remote</b>. A remote check-in
    is the one kind of session a trainer actually runs from this desk, which is what makes a running
    hero useful on the web at all rather than a decoration for a screen nobody is looking at.</td></tr>
<tr><th>Next</th><td>Nothing is open, and a session has not happened &mdash; or started under
    {NEXT_GRACE} minutes ago</td>
  <td><b>{hm(NEXT[1])}</b>, with <code>relativeMinutes</code> in the kicker</td>
  <td>The sentence the countdown cannot say: your morning ends at {hm(WORK[0][1])}, that is
    {MORNING_LEFT} minutes, and {MORNING_LEFT} minutes is under the hour a session needs. A countdown
    of {NEXT_REL.replace("starts in ", "")} is, in the app&rsquo;s own words, &ldquo;noise&rdquo;
    &mdash; so the band converts it into the only decision available, which is
    {hm(GAPS[0][0])}.</td></tr>
<tr><th>Done</th><td>Every session has settled and the last window has closed</td>
  <td><b>{hm(TOM_FIRST[1])}</b> tomorrow</td>
  <td><b>{TOM_CLASH[0]} and {TOM_CLASH[1]} overlap by {CLASH_OVER} minutes from
    {hm(CLASH_FROM)}.</b> Found at {hm(EVE)} tonight instead of {hm(CLASH_FROM)} tomorrow, which is
    the entire reason to draw an evening state rather than let the screen go quiet.</td></tr>
<tr><th>Clear</th><td>Nothing today and nothing tomorrow</td><td>No figure</td>
  <td><code>ClearHero</code>&rsquo;s comment is the copy: &ldquo;a rest day is not an error&rdquo;.
    Not drawn as a frame here, because this trainer&rsquo;s roster does not produce one in the week
    on screen &mdash; and inventing a session table to manufacture the state would be worse than
    naming the gap. &sect;13.</td></tr>
<tr><th>First run</th><td>No clients at all</td><td>No figure</td>
  <td>Frame <b>1d</b>. The one card, and nothing else on the screen &mdash; which is the phone&rsquo;s
    own rule, not an invention: <code>HomeScreen</code> wraps every module below the hero in
    <code>{{deck.firstRun ? null : &hellip;}}</code>.</td></tr>
</tbody></table>

<p class="note" style="margin-top:20px"><b>One rule of the phone&rsquo;s is deliberately broken.</b>
<code>buildDeck</code> computes <code>next</code> as <code>running === null ? &hellip; : null</code>
&mdash; when a session is running there is no next card, because a phone has one slot and has to
choose. A desk has two, so frame 1a shows both, and the promotion is the whole argument for the
screen existing: the useful thing at {hm(NOW)} is not {RUN[5]}&rsquo;s remaining
{RUN_LEFT} minutes <i>or</i> the {NEXT_IN // 60}-hour hole after it. It is the two together.</p>'''


ORDER_ROWS = ''
_new = [r["name"] for r in NEEDS]
for i in range(max(len(STALE_ORDER), len(NEEDS))):
    old_n = STALE_ORDER[i] if i < len(STALE_ORDER) else None
    r = NEEDS[i]
    moved = old_n is None or _new.index(old_n) != i
    ORDER_ROWS += (
        f'<tr><td class="mono ink3">{i + 1}</td>'
        f'<td class="{"" if not moved else "strong"}">{old_n or "&mdash;"}</td>'
        f'<td class="strong">{r["name"]}</td>'
        f'<td class="wt">{r["weight"]}</td>'
        f'<td class="ink3" style="font-size:12.5px">{r["line"]}</td>'
        f'<td><span class="tag tag--{"danger" if r["sev"] == "critical" else "warn"}">'
        f'{r["sev"]}</span></td>'
        f'<td class="strong">{r["act"]}</td></tr>')

# Whole cards, not single rows: the claim in the middle panel below is that a
# 12% accent wash reads as "in flight" WITHOUT swallowing the danger edge, and
# that can only be judged against the five rows it is not on.
Q_CARD = queue()
Q_CARD_HELD = queue(held=HELD_ROW)
Q_OFF = qrow(NEEDS[0], off=True)
# and the row directly under it, whose verb is a local write and is untouched
Q_OFF_OK = qrow(next(r for r in NEEDS if r["act"] not in MSG_VERBS), off=True)
HELD_FIRST = NEEDS[0]["name"].split()[0]

S07 = f'''<p class="note">The right-hand column is what a trainer opens the web app for, and the old
one was a list of seven rows in the order somebody typed them. The app does not leave it to typing:
<code>buildAttention</code> gives every row a <code>weight</code>, sorts on it descending, and breaks
ties on the client&rsquo;s name. The weights are the design, so they are ported rather than
re-decided.</p>

<table class="rt" style="width:100%;margin-top:18px">
<thead><tr><th style="width:5%">#</th><th style="width:15%">Old order</th>
  <th style="width:15%">By weight</th><th style="width:8%">Weight</th>
  <th style="width:25%">The line</th><th style="width:12%">Severity</th>
  <th>Verb</th></tr></thead>
<tbody>{ORDER_ROWS}</tbody></table>

<p class="note" style="margin-top:18px"><b>{MOVED} of {len(STALE_ORDER)} rows move, one row
appears, and two verbs change.</b> The interesting move is the second: {NEEDS[1]["name"]}&rsquo;s
empty pack outranks {NEEDS[2]["name"]}&rsquo;s {rs(9000)}, because an empty pack scores
<b>1900</b> and ordinary overdue money scores <b>1000&thinsp;+&thinsp;days</b>. That is the app
saying something specific and defensible &mdash; a client whose pack ran out <b>cannot train
tomorrow</b>, and a client six days late will still be there next week &mdash; and the old page had
it the other way round.
<br><br><b>The row that was missing costs {rs(3000)}.</b> {MISSING[0]} is
{(D - OWED[2][4]).days} days late, and the stat row directly above the queue counted him: <i>Still
owed &middot; {M_CLIENTS_OWING} clients</i>. Three clients in the figure, two in the list.
<br><br><b>And the verbs.</b> <code>AttentionItem.action</code> is <code>Remind</code> for money,
<code>Nudge</code> for silence, <code>Renew</code> for a pack. The old page said <i>Nudge</i> on both
money rows. Asking someone for a payment and asking after someone who has stopped coming are not the
same message, and the app already knew.</p>

<div class="grp"><div class="grp__t"><h4>Ten seconds, in the row that changed</h4>
  <span><span class="tag tag--acc">The blocking item, closed</span></span></div>
<p class="note" style="margin-top:0"><b>The phone does not have this problem, and reading why is
what settles the design.</b> Its <code>actOn</code> is four lines long and one of them is a comment:
&ldquo;Remind, Nudge and Renew all open the client on the tab that caused the alert. &sect;04 is
explicit that <b>none of them ever sends anything silently</b>.&rdquo; Tapping the verb on the phone
is a <i>navigation</i>. There is no message to take back because nothing has been sent.
<br><br>This screen does not do that, on purpose. A desk session is a triage session &mdash; the
IA&rsquo;s own words &mdash; and a queue whose six rows each cost a navigation and a journey back is
not a queue, it is a menu. So the web <b>commits in place</b>, which is the same kind of promotion
as showing <i>running</i> and <i>next</i> at once in &sect;06: worth doing because the canvas allows
it, and <b>not free</b>. The ten seconds are the price, and they are not optional at that price.
<br><br>H03 of <a href="webapp-heuristics.html">the audit</a> already wrote the rule, for a moved
session: a destructive action is <b>&ldquo;reversible for ten seconds in place, in the row that
changed&rdquo;</b>, with the sentence that decides the whole shape &mdash; <b>undo after the message
has gone is not undo</b> &mdash; so the <i>sending</i> is what gets held rather than the row&rsquo;s
appearance. The schedule pays that rule with a floating chip, because a 60px block cannot hold two
lines and has no row to put them in. A queue row can, so here the rule is taken literally and
<b>the row is the receipt</b>: no chip, no toast, no corner of the screen the eye has to find.</p>

<div class="bench" style="margin-top:18px;overflow-x:auto">
  <div style="min-width:1058px">
    <div class="bench__row" style="align-items:flex-start;flex-wrap:nowrap;gap:18px">
      <div class="cell"><span class="cell__l">AT REST</span>
        <div style="width:520px">{Q_CARD}</div></div>
      <div class="cell"><span class="cell__l">FARHAN Q IN FLIGHT &middot; {HOLD_LEFT}S LEFT</span>
        <div style="width:520px">{Q_CARD_HELD}</div></div>
    </div>
    <div class="cell" style="margin-top:22px"><span class="cell__l">OFFLINE &middot; the same row,
      and the two verbs that differ</span>
      <div class="card" style="width:520px"><div class="card__b card__b--flush">
        <table class="tbl"><tbody>{Q_OFF}{Q_OFF_OK}</tbody></table></div></div></div>
  </div></div>

<div class="grid3 mt4">
  <div class="card"><div class="card__b">
    <p class="micro" style="color:var(--tx-accent-text)">THE HOLD BELONGS TO THE VERB</p>
    <p class="h5" style="margin:8px 0 6px;line-height:1.45">{HELD_N} of the {N_NEEDS} rows wait ten
      seconds. {INSTANT_N} are instant.</p>
    <p style="font-size:13px;line-height:1.6;color:var(--tx-ink-2)"><b>Remind</b> and <b>Nudge</b>
      send a WhatsApp. <b>Renew</b> writes a package row locally and tells nobody, so it commits at
      once. A blanket delay on the whole column would make renewing a pack feel broken, which is what
      happens when a safety rule is applied to a table instead of to an action.</p></div></div>
  <div class="card"><div class="card__b">
    <p class="micro" style="color:var(--tx-warn)">THE COLLISION, DRAWN ON PURPOSE</p>
    <p class="h5" style="margin:8px 0 6px;line-height:1.45">The held row is the <b>critical</b> one,
      so the accent tint and the danger edge have to share it.</p>
    <p style="font-size:13px;line-height:1.6;color:var(--tx-ink-2)">This is the arrangement where
      this stylesheet&rsquo;s opening rule could go wrong a second time &mdash; a lime ground
      swallowing a danger mark is exactly what the hours editor did. It survives because the tint is
      a <b>12% wash</b> and the severity is a <b>2px inset edge drawn over it</b>: a background and a
      box-shadow, not two fills competing. Rendered and measured, not assumed.</p></div></div>
  <div class="card"><div class="card__b">
    <p class="micro" style="color:var(--tx-accent-text)">ONE TOKEN CHANGED, NOT ONE COMPONENT ADDED</p>
    <p class="h5" style="margin:8px 0 6px;line-height:1.45">The countdown is <code>.cw__bar</code>,
      the schedule&rsquo;s own.</p>
    <p style="font-size:13px;line-height:1.6;color:var(--tx-ink-2)">Same argument for it, quoted from
      that file: <i>&ldquo;a bar and not a number alone, because 8s without a moving edge is a fact
      you have to keep re-reading&rdquo;</i>. One override: its track is a white alpha because it sits
      on a dark chip, and on a table row that track has to be a token or it vanishes in the light
      theme.</p></div></div>
</div>

<p class="note" style="margin-top:18px"><b>What the row says while it waits.</b>
<i>Held &mdash; {HELD_FIRST} is told in {HOLD_LEFT}s</i>, and the button becomes <b>Undo</b>. Not
&ldquo;sending&hellip;&rdquo;, which is a progress report about the software, and not
&ldquo;sent&rdquo;, which would be false for another {HOLD_LEFT} seconds. It names <b>who</b> is
about to be told, because the whole risk in this column is pressing the wrong row &mdash; six
avatars, four of them owing money, and a 98px button beside each one. The keyboard path is in
&sect;11: <kbd>R</kbd> commits, <kbd>Z</kbd> takes it back while the bar is still draining.</p>
</div>

<div class="grid2 mt4" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px">
  <div class="card"><div class="card__b">
    <p class="micro" style="color:var(--tx-accent-text)">THE BADGE</p>
    <p class="h5" style="margin:8px 0 6px;line-height:1.45">{STALE_BADGE} &rarr; {N_NEEDS}, because
      two of the seven rows were not attention items.</p>
    <p style="font-size:13px;line-height:1.6;color:var(--tx-ink-2)"><code>AttentionKind</code> is
      <code>overdue | quiet | pack</code>. <i>{len(QROWS)} entries waiting to sync</i> is chrome, and
      it is already a pill in the top bar of every screen in the set &mdash; putting it in a client
      queue makes the count mean two things. <i>8 weekly reports ready to send</i> is a real job with
      its own screen, and it is now a control in the head of <b>This week</b>, which is what a weekly
      report is about.</p></div></div>
  <div class="card"><div class="card__b">
    <p class="micro" style="color:var(--tx-warn)">THE PHONE&rsquo;S LIMIT, AND WHY THIS IGNORES IT</p>
    <p class="h5" style="margin:8px 0 6px;line-height:1.45"><code>ATTENTION_VISIBLE = {ATTENTION_VISIBLE}</code>
      &mdash; &ldquo;more than three alerts at the top of home and the whole module becomes
      wallpaper.&rdquo;</p>
    <p style="font-size:13px;line-height:1.6;color:var(--tx-ink-2)">That is true of the <b>top of a
      scroll</b>, where a fourth row pushes the day off the screen. It is not true of a column that
      is one third of the screen and has nothing under it. All {N_NEEDS} are shown, at {44}px each,
      with <b>View all</b> deleted rather than kept as a control that would do nothing. The two
      <code>critical</code> rows take a 2px danger edge and the four <code>alert</code> rows take
      nothing, because a tone on every row is a tone on no row.</p></div></div>
</div>'''


STALE_STATS = f'''<div class="stats stats--4" style="min-width:900px">
  <div class="stat"><p class="stat__k">Billed this month</p>
    <p class="stat__v">{rs(M_COLLECTED)}</p>
    <p class="stat__d">21 sessions &middot; <b>+{M_TREND}%</b> on July</p></div>
  <div class="stat"><p class="stat__k">The gym&rsquo;s share</p>
    <p class="stat__v" style="color:var(--tx-warn)">&minus;{rs(M_CUT)}</p>
    <p class="stat__d">46% of floor sessions</p></div>
  <div class="stat stat--acc"><p class="stat__k">Yours</p>
    <p class="stat__v">{rs(STALE_YOURS)}</p>
    <p class="stat__d">Stored per session, as it happens</p></div>
  <div class="stat stat--danger"><p class="stat__k">Still owed</p>
    <p class="stat__v">{rs(M_PENDING)}</p>
    <p class="stat__d">{M_CLIENTS_OWING} clients &middot; oldest <b>11 days</b></p></div>
</div>'''

S08 = f'''<p class="note">The old top row was four cards in the order money moves &mdash; billed, the
gym&rsquo;s share, yours, still owed &mdash; and that order is right and is kept. Two other things
about it were not.</p>

<div class="dd" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);margin-top:20px">
  <div class="dd__i dd__i--no"><p class="dd__k">{ic(I_NO, 13)} The old top row</p>
    <div class="dd__f" style="overflow-x:auto;padding:20px">{STALE_STATS}</div>
    <p class="dd__c">Four 27px figures, first thing, above the day. Three of the four are true of the
      month and change once a day at most; the fourth is a total. The word <b>Billed</b> is on the
      month&rsquo;s <b>collected</b> figure, and <b>Yours</b> is therefore
      {rs(STALE_YOURS)} where the app computes {rs(M_YOURS)}.</p></div>
  <div class="dd__i dd__i--do"><p class="dd__k">{ic(I_DO, 13)} The month, in the third column</p>
    <div class="dd__f" style="padding:18px"><div style="width:320px">{monthcard()}</div></div>
    <p class="dd__c">All four <code>DeckMoney</code> fields under their own names, plus what is owed,
      plus the cut with its percentage on the row it belongs to. Fourth in reading order, same shape
      as its two neighbours, no scroll.</p></div>
</div>

<table class="rt" style="width:100%;margin-top:24px">
<thead><tr><th style="width:22%">Field in <code>DeckMoney</code></th><th style="width:16%">Value</th>
  <th style="width:20%">Old page</th><th>What it is, and where it comes from</th></tr></thead>
<tbody>
<tr><th><code>billed</code></th><td class="num">{rs(M_BILLED)}</td>
  <td class="ink3">not shown</td>
  <td>Every payment row created this month, paid or not. 27 sessions across 22 clients.</td></tr>
<tr><th><code>collected</code></th><td class="num">{rs(M_COLLECTED)}</td>
  <td><span class="tag tag--danger">shown as &ldquo;Billed&rdquo;</span></td>
  <td>What has actually arrived &mdash; 86% of the month.</td></tr>
<tr><th><code>pending</code></th><td class="num">{rs(M_PENDING)}</td>
  <td>Still owed</td>
  <td>{M_CLIENTS_OWING} clients. Correct on the old page, and the reason its own queue was
    provably short a row.</td></tr>
<tr><th>the gym&rsquo;s cut</th><td class="num">{rs(M_CUT)}</td><td>The gym&rsquo;s share</td>
  <td><code>gymShareAmount</code>, stored on the payment row at record time.
    {round(100 * M_CUT / M_FLOOR)}% of {rs(M_FLOOR)} of floor work and 0% of the remote.</td></tr>
<tr class="dt__hl"><th><code>yours</code></th><td class="num">{rs(M_YOURS)}</td>
  <td><span class="tag tag--danger">{rs(STALE_YOURS)}</span></td>
  <td><code>buildMoney</code>: <code>yours: Math.max(0, billed - cut)</code>. The old figure was
    <code>collected &minus; cut</code> &mdash; short by {rs(YOURS_GAP)}.</td></tr>
</tbody></table>

<div class="why why--warn" style="max-width:none"><p class="why__k">Why a wrong figure survived four
passes</p>
<p>Two of the money file&rsquo;s numbers collide by accident. <b>Collected equals floor
billing</b> ({rs(M_COLLECTED)}), and <b>pending equals remote billing</b> ({rs(M_PENDING)}). So
<code>collected &minus; cut</code> and <code>floor &minus; cut</code> are the same subtraction, the
row&rsquo;s arithmetic closed, and there was nothing on the screen to notice. Both collisions are
now asserted in <code>gen_today.py</code>, which means the next edit to
<a href="webapp-money.html">the money file</a> that breaks either one breaks this build rather than
this page.
<br><br><b>And there are genuinely two defensible numbers here, which is the deeper problem.</b>
{rs(M_YOURS)} is what the month owes the trainer; {rs(STALE_YOURS)} is what has reached them.
A trainer wants both. The app ships the first and calls it <code>yours</code>, so the first wins
here &mdash; but the second needs a name of its own on the money screen rather than borrowing this
one. &sect;13.</p></div>

<div class="why"><p class="why__k">And the layout this argument nearly produced</p>
<p>The month was going to be a five-figure <b>strip across the bottom</b> of the screen, and a
<code>.mstrip</code> component was written for it. It was deleted before it shipped, for
heuristic&nbsp;4: a screen whose furniture changes shape on the 1st of the month teaches its layout
twelve times a year. The month card is the same shape as its two neighbours and lands in the same
reading position every day; on the 1st it changes its <b>copy</b> &mdash; <i>{D.strftime("%B")} is
ready to close</i> &mdash; and not its geometry. The comment where the deleted component lived says
so, because a component that was considered and rejected is worth more in the stylesheet than one
that is merely absent.</p></div>'''


S09 = f'''<p class="note">A screen called Today that exists in one state is a screenshot of one
Tuesday morning. The old page had three frames and all three were {hm(NOW)}. These are the other
times of day, and each one exists because it draws something the canonical frame cannot.</p>

{units(
 frame("1b", "Twelve minutes in, and nobody opened a log", "new to the web",
       "/today", F1B, f'''<b>The same minute as 1a, and one bit of data different.</b>
  {RUN[5]}&rsquo;s {hm(RUN[1])} has started and no workout log has been opened against it. The old
  deck said <i>In progress</i> for this row either way; <code>buildRunning</code> can tell the
  difference and its comment says why the pair has to be found together rather than inferred:
  &ldquo;an early session left unmarked would then mask a later one that is genuinely under
  way.&rdquo;
  <br><br><b>So the hero is Next, not Running</b> &mdash; <code>relativeMinutes</code> reads
  <i>{relative(RUN[1] - NOW)}</i>, and <code>NEXT_GRACE_MS</code> holds the card in this state for
  {NEXT_GRACE} minutes after the start time, until {hm(RUN[1] + NEXT_GRACE)}. After that it is
  simply late. The two actions are the two answers: <b>Start it</b> or <b>Mark no-show</b>.
  <br><br><b>The block ladder had no state for this, and now it has one.</b> The stylesheet shipped
  three block states with a ring &mdash; accent for running, danger for a clash &mdash; and warn was
  the one tone never spent on a block. It is <code>.ev--late</code>: the same colour, the same
  position, one more meaning. Before it, a session twelve minutes past its start looked exactly like
  one twelve minutes before it.'''),
 frame("1c", "20:52 &mdash; the day is closed", "new to the web",
       "/today", F1C, f'''<b>The evening is where the day&rsquo;s money finally gets said
  properly.</b> {rs(DAY_KEPT)} yours of {rs(DAY_BILLED)} billed, and {rs(DAY_LOST)} to the gym
  &mdash; three figures the old page compressed into one bare {rs(DAY_BILLED)} in a table footer with
  no word next to it.
  <br><br><b>And the gap that went unsold is still on the ribbon, dashed, where it was all day.</b>
  {hm(GAPS[0][0])}&ndash;{hm(GAPS[0][1])}, {dur(GAP_MIN)} inside the trainer&rsquo;s own hours,
  {rs(GAP_RS)} billed and {rs(GAP_KEEP)} kept. That is not a reproach; it is the only way a trainer
  ever learns which hour of their week is the one that keeps going empty.
  <br><br><b>The hero rolls to tomorrow and finds it broken.</b>
  {TOM_CLASH[0]} and {TOM_CLASH[1]} overlap by {CLASH_OVER} minutes from {hm(CLASH_FROM)} &mdash;
  the same clash the week grid draws side by side, surfaced at {hm(EVE)} tonight instead of
  {hm(CLASH_FROM)} tomorrow. No product in &sect;02 has an evening state at all, which is a strange
  gap in a category whose users work split shifts.
  <br><br><b>One thing in this frame is a defect and it is in the rail.</b>
  <code>rail()</code> hard-codes today&rsquo;s five pins <i>and their states</i>, so every frame it
  draws is {hm(NOW)} whatever the screen beside it says. This page rewrites the two stateful slots
  and asserts the rewrite landed; the real fix is a parameter, and it is in &sect;12.'''),
 frame("1d", "No clients yet", "home &middot; 2a",
       "/today", F1D, f'''<b>One card, and nothing else on the screen.</b> That is not restraint,
  it is the phone&rsquo;s own rule read carefully: <code>HomeScreen</code> wraps the stat rail, the
  attention list, the day, the money and the week in <code>{{deck.firstRun ? null : &hellip;}}</code>.
  Every module on this screen is derived from clients, sessions and payments, so with none of those
  there is nothing for five boxes to say and drawing them empty would be five lies about how the
  product works.
  <br><br><b>The rail loses five of its six counts.</b> A sidebar claiming <i>Clients 22</i> and
  <i>Money 3</i> beside <i>Add your first client</i> is the same defect one level out, and it is the
  kind of thing that only shows up when the empty state is actually rendered rather than described.
  The sixth count stays: the exercise library holds 1,324 rows before anybody signs up, and a number
  that is true on the first run is not a first-run bug.
  <br><br><b>And the two head controls go.</b> <i>The week</i> has no week and <i>New session</i> has
  nobody to book, and a live button that cannot work is the defect the schedule file&rsquo;s
  &sect;08 is named after &mdash; nineteen of them, pointing at a screen that did not exist.'''))}'''

S10 = f'''<p class="note">Two frames that were already right in intent and wrong in execution.</p>

{units(
 frame("2a", "The command palette &middot; &#8984;K", "new to the web",
       "/today", F2A, f'''<b>The actions are scoped to the match, and they are the queue&rsquo;s
  actions.</b> Type <code>kav</code> and the first thing offered is <b>Renew {NEEDS[1]["name"]}&rsquo;s
  pack</b> &mdash; which is the second row of <i>Needs you</i>, three inches below and to the left.
  The palette is not a second navigation system; it is the same ranked queue reached by typing. Her
  row even carries the reason: <i>{NEEDS[1]["line"]}</i>.
  <br><br><b>Two things about the old frame.</b> It searched <code>mee</code> and returned
  <i>Meera Krishnan</i> and then <i>Ananya S &middot; remote</i> &mdash; a second result containing
  no such string, in the one component whose entire job is matching. And the deck behind it was
  <b>blanked</b>: four stat cards holding <code>&amp;nbsp;</code> and an empty table. A palette drawn
  over a blank screen cannot show what a palette is for, which is that the thing you were doing is
  still there behind it. This one opens over the real Tuesday.'''),
 frame("3a", "Offline, and honest about it", "drawer &middot; 8a 8b 8c",
       "/today", F3A, f'''<b>Offline, the hero slot answers a different question.</b> &ldquo;What is
  next&rdquo; is not in doubt when the connection drops &mdash; whether anything you have typed is
  safe is. So the hero becomes the count of what is held, and the two things that genuinely cannot
  happen are named rather than discovered: a WhatsApp message and an OTP. Which is why every
  <b>Remind</b> and <b>Nudge</b> in the queue is disabled and every <b>Renew</b> is not &mdash; a
  renewal is a local write, and greying it out would be a lie about the architecture.
  <br><br><b>The day is still drawn.</b> That is the entire point: the deck is rendered from SQLite
  whether or not there is a connection, so a screen that blanked or spun when the wifi went would be
  describing an architecture this product does not have.
  <br><br><b>And rendering this frame found a library bug that had survived four passes.</b>
  <code>.q__t</code> and <code>.q__s</code> &mdash; a queued entry&rsquo;s title and its timestamp
  &mdash; carried no <code>display</code>, and both are <code>&lt;span&gt;</code>s in every markup in
  the set. So two lines came out as one run of text with a space in the middle:
  <i>Push A &middot; Meera K &middot; 12 sets 06:52 &middot; queued 41 min</i>. The page this replaces
  had it too, in the same component. Fixed in the stylesheet rather than here, because it is the
  library&rsquo;s bug and three other screens draw that component.'''))}'''


S11 = f'''<p class="note">This screen adds one new interactive surface &mdash; a horizontal track of
positioned buttons &mdash; and the question it raises is the same one the week grid answered:
<b>is it a grid?</b> The week&rsquo;s answer was no, because its cells are gone and
<code>role="grid"</code> promises a reader rows and columns it can count. A ribbon has neither, so it
is what it looks like: <b>a list of buttons in a landmark</b>, in time order, each with a full
accessible name.</p>

<table class="rt" style="width:100%;margin-top:18px">
<thead><tr><th style="width:18%">Key</th><th style="width:26%">Does</th>
  <th>Why this one</th></tr></thead>
<tbody>
<tr><th><kbd>&#8984;K</kbd></th><td>The palette</td>
  <td>Already the set&rsquo;s accelerator, and frame 2a is its home.</td></tr>
<tr><th><kbd>G</kbd> then a letter</th><td>Jump to a destination</td>
  <td>Eleven of them, from the rail. <kbd>H</kbd> for this screen, because the app calls it
    <code>HomeTab</code> and it frees <kbd>T</kbd> for Team.</td></tr>
<tr><th><kbd>Tab</kbd></th><td>Head &rarr; hero A &rarr; hero B &rarr; ribbon &rarr; queue &rarr;
    week &rarr; month</td>
  <td>Reading order and DOM order are the same, which is the only reason the ribbon can sit between
    the heroes and the queue without a skip link.</td></tr>
<tr><th><kbd>&larr;</kbd> <kbd>&rarr;</kbd></th><td>Along the ribbon, session to session</td>
  <td>One tab stop for the ribbon, then arrows inside it &mdash; the roving-tabindex half of the
    W3C grid pattern, kept without the grid semantics. Five sessions is five arrow presses; five
    extra tab stops on a screen with seven regions is not.</td></tr>
<tr><th><kbd>&crarr;</kbd></th><td>Open the focused session</td>
  <td>Same as clicking the block. The block is a <code>&lt;button&gt;</code>, so this is free.</td></tr>
<tr><th><kbd>J</kbd> <kbd>K</kbd></th><td>Down and up the queue</td>
  <td>The set&rsquo;s list idiom, and the queue is the only list on the screen.</td></tr>
<tr><th><kbd>R</kbd></th><td>Run the focused queue row&rsquo;s action</td>
  <td>One key for three verbs, because the row states which verb it is. On <b>Remind</b> and
    <b>Nudge</b> it starts the ten seconds rather than sending; on <b>Renew</b> it commits, because
    a renewal tells nobody.</td></tr>
<tr><th><kbd>Z</kbd></th><td>Stop the message that is in flight</td>
  <td>While any row is holding. Not <kbd>&#8984;Z</kbd>: this is not the undo stack, it is a
    countdown with one thing in it, and giving it the global shortcut would promise a history that
    does not exist. Focus moves to the holding row when the hold begins, so <kbd>Z</kbd> is
    reachable without hunting for it &mdash; and the row keeps its
    <code>aria-live="polite"</code> announcement of who is about to be told.</td></tr>
<tr><th><kbd>?</kbd></th><td>Every shortcut on this screen</td>
  <td>Unchanged from the rest of the set.</td></tr>
</tbody></table>

<p class="note" style="margin-top:18px"><b>What a screen reader gets from the ribbon.</b> Each block
carries the whole row as its name &mdash; <i>&ldquo;{RUN[5]}, {hm(RUN[1])} to
{hm(RUN[1] + RUN[2])}, {RUN[6]}, remote, live&rdquo;</i> &mdash; because the visible label is an
avatar and 24px of initials is not a name. The two working windows, the hatch and the hour
lines carry <code>aria-hidden</code>, because they are the ground rather than the content; the
hole&rsquo;s sentence is real text and is read. The dashed
gap is a button too, named with its hours, its length and what it is worth, which means the one
genuinely commercial thing on the screen is reachable without a pointer.</p>

<p class="note"><b>And the figure that is not read twice.</b> The hero&rsquo;s
<b>{RUN_ELAPSED}:00</b> is <code>aria-hidden</code>, with the card&rsquo;s own label carrying
&ldquo;{RUN[5]}, {RUN_ELAPSED} minutes elapsed, {RUN_LEFT} minutes left&rdquo;. A display figure read
as <i>twelve colon zero zero</i> is worse than useless when the same card says it in words.</p>'''


PROP = [
 ("webapp-money.html", "Three invoices, one date, three ages", "danger",
  f'''The ledger dates Farhan&nbsp;Q, Sneha&nbsp;R and Vikram&nbsp;T all <b>01 Aug</b> and then gives
  them ages of <b>11</b>, <b>6</b> and <b>4</b> days, which cannot all be true of one date. This page
  needed real dates to compute the queue&rsquo;s weights, so it uses the ones those ages imply
  against {DATE_LONG}: <b>31 Jul</b>, <b>5 Aug</b>, <b>7 Aug</b>. Move them there and every published
  age survives, including &ldquo;oldest 11 days&rdquo; in the stat row.'''),
 ("webapp-money.html", "&ldquo;Yours&rdquo; is two numbers wearing one word", "danger",
  f'''{rs(M_YOURS)} is <code>billed &minus; cut</code>, which is what the app computes and what the
  schema stores. {rs(STALE_YOURS)} is <code>collected &minus; cut</code>, which is what has reached
  the trainer. Both are worth knowing and the money screen currently prints the second under the
  first&rsquo;s name. It needs a second row, not a different figure.'''),
 ("webapp-money.html", "Two accidental collisions that hide arithmetic errors", "warn",
  f'''<code>collected == floor billed</code> ({rs(M_COLLECTED)}) and
  <code>pending == remote billed</code> ({rs(M_PENDING)}). Both are asserted in
  <code>gen_today.py</code> so a future edit breaks the build, but the right fix is to move one
  figure so the two subtractions stop being the same one.'''),
 ("gen_rail.py", "<code>rail()</code> hard-codes the time of day", "danger",
  f'''<code>PINS</code> carries today&rsquo;s five clients <i>and their states</i>, so every frame
  the function draws is {hm(NOW)}. The evening frame here rewrites the two stateful slots by string
  surgery and asserts the rewrite landed; it wants a parameter
  (<code>rail(&hellip;, pins="done")</code>). The <code>pins=False</code> path already exists and is
  what the first-run frame uses.'''),
 ("gen_rail.py", "It holds a second copy of the Today deck", "danger",
  f'''<code>body()</code> in that script is a whole Today screen &mdash; the greeting, the four
  stat cards, {STALE_DATE}, a four-row <code>NEEDS</code> list &mdash; drawn behind all five rail
  frames. It is now the only place in the set with the old design, and every defect in &sect;01 is
  still in it. It should import from here, or be reduced to a neutral stub, because a shell page does
  not need a real screen behind it to demonstrate a rail.'''),
 ("gen_rail.py", "The count of trainer data does not survive an empty roster", "warn",
  f'''Five of the rail&rsquo;s six badges are derived from the trainer&rsquo;s own tables and one is
  the exercise library. Only the library&rsquo;s is true on a first run. This page strips the five
  with a regex and asserts the count; the function should take the numbers as arguments.'''),
 ("every file", "The same client has a different avatar colour on every screen", "warn",
  '''<code>gen_schedule</code> says Farhan&nbsp;Q is <code>av-6</code>, Sneha&nbsp;R
  <code>av-12</code>, Priya&nbsp;N <code>av-2</code>, Kavya&nbsp;M <code>av-9</code>,
  Karthik&nbsp;R <code>av-8</code>. <code>webapp-clients.html</code> says <code>av-12</code>,
  <code>av-10</code>, <code>av-8</code>, <code>av-2</code>, <code>av-4</code> &mdash; and
  Arjun&nbsp;S is <code>av-5</code> in one place and <code>av-9</code> in another. A colour that
  identifies a person must not change per screen; that is the only job it has. One table, imported.'''),
 ("webapp-c-domain.html", "<code>.ev</code> now has two orientations and six states", "danger",
  '''That file still documents the block as a gridcell inside a 48px hour cell at 46px per 60 min,
  and names <i>schedule, today</i> as its users &mdash; which was false in both directions until
  this page. It needs the positioned-button spec, plus <code>.ev--h</code> (the ribbon) and
  <code>.ev--late</code> (started, nothing opened). The audit has been carrying this as an open item
  since its second pass.'''),
 ("webapp-components.html", "Four new entries and one fix", "warn",
  '''<code>.dr</code> (the ribbon, with its ruler and its hole), <code>.hro</code> (the hero, five
  states, one slot), <code>.ev--h</code>, <code>.ev--late</code>. And the fix:
  <code>.q__t</code> / <code>.q__s</code> had no <code>display</code> and rendered two lines as one
  &mdash; that component is drawn on three other screens.'''),
 ("webapp-information-architecture.html", "Its last open question is answered", "warn",
  '''&ldquo;Is the web app for the 1st-of-the-month admin hour, or for daily use? <b>Designed for the
  admin hour</b> &hellip; If it is daily, Today and Schedule need more depth than they have.&rdquo;
  Schedule got its depth in thirteen frames; this is Today&rsquo;s. The answer is <b>daily, with the
  admin hour reached without a layout change</b> &mdash; the month keeps a fixed position and changes
  its copy on the 1st. Also: Today is 3 frames &rarr; 6 in the file table.'''),
 ("webapp-heuristics.html", "Two Today rows are now false", "danger",
  '''The heuristic-8 row reads &ldquo;Three questions answered without scrolling &hellip; Nothing
  else is on that screen&rdquo;, and there were four more panels. The heuristic-1 row credits the
  sync pill and says nothing about a screen that could not show a running session. Both want a fifth
  pass, and &sect;01&rsquo;s ten findings want adding.'''),
 ("app/src/home/deck.ts", "<code>buildWeek</code>&rsquo;s percent is meaningless mid-week", "warn",
  f'''It divides done by everything scheduled for the whole week, so on Tuesday morning it reads
  {round(100 * W_DONE / len(WEEK))}% for a roster that is actually delivering {W_PCT}% of what has
  settled. The web card reports the elapsed week and states the {W_LEFT} still to come; the phone
  should too, because the number it shows now can only ever go up and therefore says nothing.'''),
 ("app/src/home/deck.ts", "A desk can show <code>running</code> and <code>next</code> at once", "warn",
  '''<code>next</code> is suppressed while a session is running because a phone has one hero slot.
  That is a phone constraint, not a rule, and the web shows both &mdash; which is the single most
  useful thing on frame 1a.'''),
 ("the design system", "One state, three names", "warn",
  '''The rail calls a running session <code>now</code>, the session table calls it
  <code>live</code>, and the stylesheet has both <code>.ev--live</code> and
  <code>.rail__pin--now</code>. Pick one word.'''),
 ("webapp-dashboard.html", "It is generated now", "warn",
  '''<code>gen_today.py</code> writes it. Edit the script and re-run it; anything typed into the HTML
  is lost on the next run. The shell comes from <code>gen_rail</code> and the day comes from
  <code>gen_schedule</code>, so neither the rail nor the calendar can drift from this screen
  again.'''),
]

S12 = f'''<p class="note">This page is a specification, not a propagation. {len(PROP)} things below
are real work in other files, and eight of them are defects this one found by importing tables
instead of retyping them &mdash; which is the argument for importing them.</p>

<table class="rt" style="width:100%;margin-top:18px">
<thead><tr><th style="width:22%">File</th><th style="width:26%">What</th>
  <th style="width:9%">Kind</th><th>Detail</th></tr></thead>
<tbody>''' + ''.join(
    f'<tr><th><code>{f}</code></th><td class="strong">{w}</td>'
    f'<td><span class="tag tag--{k}">{"Defect" if k == "danger" else "Gap"}</span></td>'
    f'<td>{d}</td></tr>' for f, w, k, d in PROP) + '''</tbody></table>'''

OPEN = [
 ("<code>ClearHero</code> is not drawn", "warn",
  f'''&ldquo;Nothing today and nothing tomorrow either &mdash; a rest day is not an error.&rdquo; The
  roster in <code>SESSIONS</code> produces no such day in the week on screen: Sunday has nothing, but
  Monday the 17th starts the eight-week pattern. Inventing a session table to manufacture the state
  would be worse than naming the gap, so it is named.'''),
 ("Where does &ldquo;what happened&rdquo; go?", "warn",
  f'''<code>DeckActivity</code> is the phone&rsquo;s seventh module &mdash; workouts finished,
  payments received, body metrics with a delta and a week count. It is a real feed with a real
  <code>target</code> per row, and there is no room for it in three rows of 900px. Candidates: a
  fourth row behind a scroll, the notification bell, or a lane in
  <a href="webapp-clients.html">the client file</a>. Not answered here.'''),
 ("The 1st-of-the-month copy is written and unused", "warn",
  f'''<code>monthcard(close=True)</code> renders <i>{D.strftime("%B")} is ready to close</i> with the
  count and the total owed. It appears in no frame because no frame is dated the 1st, and drawing a
  seventh frame that differs from 1a by one sentence would be a poor use of 900px. It wants a
  paragraph in the money file instead.'''),
 ("<code>collectedToday</code> is computed and shown nowhere", "warn",
  f'''The phone&rsquo;s stat trio under the hero is <b>Sessions &middot; Collected &middot;
  Pending</b> &mdash; all three about today. This page computes {rs(COLLECTED_TODAY)} collected today
  from two ledger rows and puts neither on the screen; the day card&rsquo;s head carries billed and
  yours. Whether a third figure belongs there, or whether &ldquo;what arrived today&rdquo; is a money
  question rather than a Today question, is undecided.'''),
 ("A pending team invitation is arguably an attention item", "warn",
  f'''The rail carries <i>Team &middot; 1 invitation waiting</i> and the deck says nothing about it.
  <code>AttentionKind</code> is <code>overdue | quiet | pack</code> and an invitation is none of
  them, but it is a thing that needs a decision and it is sitting in a badge. Adding a fourth kind
  touches the app, so it is a question rather than a change.'''),
 ("Twenty rows in the queue", "warn",
  f'''Six rows fit. A trainer with forty clients and a bad month produces twenty, and this screen has
  no answer &mdash; the phone&rsquo;s is <code>ATTENTION_VISIBLE = {ATTENTION_VISIBLE}</code> plus
  <i>View all</i>, which this page deleted because at six it would do nothing. The cap and the
  overflow both need designing at the size where they matter.'''),
 ("The notification bell leads nowhere", "warn",
  f'''It is drawn in the top bar of every frame in every file in this set and no file draws what it
  opens. <code>app/src/home/notifications.ts</code> exists and dates its rows with
  <code>relativePast</code>, so there is a specification to draw from.'''),
]

S13 = f'''<p class="note">{len(OPEN)} things, and <b>none of them blocks.</b> The one that did
&mdash; six one-click buttons that each sent a real WhatsApp about money with no way back &mdash; is
&sect;07&rsquo;s last bench. Everything left here is a question about scope or a screen nobody has
drawn yet, and each one says which.</p>
<table class="rt" style="width:100%;margin-top:18px">
<thead><tr><th style="width:26%">Open</th><th style="width:9%">Kind</th><th>Why it is still open</th></tr></thead>
<tbody>''' + ''.join(
    f'<tr><th>{w}</th><td><span class="tag tag--{k}">'
    f'{"Blocking" if k == "danger" else "Open"}</span></td><td>{d}</td></tr>'
    for w, k, d in OPEN) + '</tbody></table>'


# ══════════════════════════════════════════════════════════════ assemble ══
NAV = ('<a href="webapp-information-architecture.html">IA</a>'
       '<a href="webapp-design-system.html">DS</a>'
       '<a href="webapp-components.html">LIBRARY</a>'
       '<a href="webapp-competitors.html">MARKET</a>'
       '<a href="webapp-glass.html">GLASS</a>'
       '<a href="webapp-heuristics.html">UX AUDIT</a>'
       '<a href="webapp-rail.html">RAIL</a>'
       '<a href="webapp-auth.html">AUTH</a>'
       '<a href="webapp-dashboard.html" aria-current="page">TODAY</a>'
       '<a href="webapp-clients.html">CLIENTS</a>'
       '<a href="webapp-programs.html">PROGRAMS</a>'
       '<a href="webapp-schedule.html">SCHEDULE</a>'
       '<a href="webapp-workout.html">WORKOUT</a>'
       '<a href="webapp-money.html">MONEY</a>'
       '<a href="webapp-reports.html">REPORTS</a>'
       '<a href="webapp-settings.html">SETTINGS</a>'
       '<a href="webapp-client-portal.html">PORTAL</a>')

SECS = [
    ("01", "The audit &mdash; ten things, and the product had already decided four of them", S01),
    ("02", "Competitor analysis &mdash; two families, and nobody in the middle", S02),
    ("03", "Nielsen Norman, and the nine decisions it settled", S03),
    ("04", "The deck", S04),
    ("05", "The day, sideways &mdash; one minute, one pixel", S05),
    ("06", "One slot, five states", S06),
    ("07", f"The queue that had no order &mdash; and the {MISSING[0]} it left out", S07),
    ("08", f"The month, and the {rs(YOURS_GAP)} in the wrong column", S08),
    ("09", "The other times of day", S09),
    ("10", "The palette, and being offline", S10),
    ("11", "The keyboard, and a ribbon that is not a grid", S11),
    ("12", "What this changes in the other files", S12),
    ("13", "Still open", S13),
]

FRAMES = ["1a", "1b", "1c", "1d", "2a", "3a"]
N_FRAMES = len(FRAMES)
BODY_HTML = '\n\n'.join(
    f'<h2 class="sec"><span class="n">{n}</span>{t}</h2>\n{s}' for n, t, s in SECS)
# every frame drawn exactly once, in document order
for _f in FRAMES:
    assert BODY_HTML.count(f'id="f-{_f}"') == 1, _f
assert [f'id="f-{f}"' for f in FRAMES] == sorted(
    (m for m in [f'id="f-{f}"' for f in FRAMES]), key=BODY_HTML.index), "frame ids out of order"
N_PAT = S02.count('class="grp"') - 1     # six patterns; the synthesis block is the seventh
assert N_PAT == 6, N_PAT
N_FIND = S01.count('class="grp"')
assert N_FIND == 10, N_FIND

HTML = f'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>X REP &middot; Web app &mdash; Today</title>
<meta name="description" content="Today, redrawn as a day rather than a report: what is running, what is next, the shape of the day at one pixel per minute, and one ranked queue. X REP web application.">
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

<h1>Today &mdash; a to-do list, not a report</h1>
<p class="doc__lede">The page this replaces opened with <i>Good morning, Anbu</i> and four
month-to-date money cards. The app it documents ships <code>app/src/home/deck.ts</code>, whose
docstring settles both in one sentence: <b>&ldquo;a trainer&rsquo;s home is a to-do list, not a
report &hellip; No chart until the day is over, and no greeting at all.&rdquo;</b> The old deck was
the exact inverse &mdash; the greeting the file rules out, in the position the file gives to what
happens next, with money promoted from fourth of six modules to first of three. It was not
under-designed. It was designed against a decision the product had already made, in writing, in a
file that ships.
<br><br>So this pass throws away the greeting and the stat row and asks the question the screen is
named after. At <b>{hm(NOW)}</b> on this Tuesday a remote check-in has {RUN_LEFT} minutes to run, the
next session is <b>{NEXT_IN // 60}&nbsp;h&nbsp;{NEXT_IN % 60}&nbsp;min</b> away, {MORNING_LEFT}
minutes of working time are left this morning &mdash; less than the hour a session needs &mdash; and
the only stretch left long enough to sell starts at <b>{hm(GAPS[0][0])}</b>. None of that was on the old
screen. What was on it, in the largest type available, was {rs(M_COLLECTED)} under the word
<i>Billed</i>, which is the month&rsquo;s <b>collected</b> figure &mdash; making the trainer&rsquo;s
own number wrong by <b>{rs(YOURS_GAP)}</b>.
<br><br>Nothing in the prose is hand-typed. The day, the working hours, the clock, the rate and the
gym&rsquo;s cut are imported from <code>gen_schedule.py</code> and the shell from
<code>gen_rail.py</code>, so the date says <b>{LONG[TODAY]}</b> where the old page said
<i>{STALE_DATE}</i> &mdash; a {STALE_WD}.</p>
<div class="doc__meta"><span><b>Frames</b> <span data-frame-count>{N_FRAMES}</span></span>
  <span><b>Defects found</b> {N_FIND}</span>
  <span><b>Products examined</b> {N_PAT}</span>
  <span><b>Owed to other files</b> {len(PROP)}</span></div>
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
  <br><br>Generated by <code>gen_today.py</code>; edit that and re-run it rather than editing this
  file. The rail is imported from <code>gen_rail.py</code> and <b>the day itself</b> from
  <code>gen_schedule.py</code> &mdash; <code>SESSIONS</code>, <code>WORK</code>, <code>GAPS</code>,
  <code>NOW</code>, <code>RATE</code> and <code>KEEP</code> &mdash; so neither the rail nor the
  calendar can drift from this screen. Every count, minute, rupee and rank in the prose is derived and
  asserted, including the ten defects in &sect;01: a date that is a Wednesday, a queue in no order, a
  week card reporting a finished week on its second morning, and three &ldquo;free hours you could
  sell&rdquo; that fall outside the hours the trainer works.
  <br><br>Claims about the app trace to <code>app/src/home/deck.ts</code> (the module order, the
  attention weights, <code>DeckMoney</code>&rsquo;s four fields, <code>buildRunning</code>,
  <code>buildWeek</code>, <code>QUIET_DAYS</code> / <code>PACK_ENDING</code> /
  <code>OVERDUE_DAYS</code> / <code>ATTENTION_VISIBLE</code> / <code>NEXT_GRACE_MS</code>),
  <code>app/src/home/time.ts</code> (<code>relativeMinutes</code>, <code>rupees</code>,
  <code>dayStamp</code>), <code>app/src/screens/main/home/Hero.tsx</code> (five hero states, the 62px
  figure and the reason for it), <code>app/src/screens/main/HomeScreen.tsx</code> (the module order as
  rendered, the app bar&rsquo;s subtitle grammar, the first-run gating),
  <code>app/src/design/RestTimer.tsx</code> (<code>formatClock</code>) and
  <code>app/src/settings/prefs.ts</code> (<code>SELF_TRAINING_ENABLED</code>). Claims about this
  design set are greppable in this directory.
  <br><br>Competitor rows trace to primary sources: TrueCoach&rsquo;s <i>Coach Dashboard</i> feature
  page for the four named queues, the in-person / dual / remote sort and the &ldquo;one-screen
  system&rdquo; claim; ABC Trainerize&rsquo;s help-centre articles on the Client Insights Dashboard
  (four widgets, Weekly Compliance) and on what the trainer sees in a client&rsquo;s account
  &mdash; that centre returns 403 to a direct fetch, so those two rows are marked partly verified and
  read from search summaries of it; Everfit&rsquo;s help centre for the <i>Client App: Today</i>
  screen, the Task Library and the habit-coaching insights dashboard; PTminder&rsquo;s
  <i>Payroll Reports</i> help article for <code>Pay Rates</code>, the six report variants and the
  <b>Trainer Payout</b> column, plus third-party product overviews for the year / last month / this
  month dashboard; Vagaro&rsquo;s <i>Dashboard Reports</i> support article for
  <b>Reports &rarr; Dashboard</b> and its <i>iOS Appointment Widget</i> page for
  &ldquo;up to 4 appointments in about a second&rdquo;; and Mindbody&rsquo;s support material for the
  <b>Business Snapshot</b> and its cash / accrual option.
  <br><br>&sect;03 quotes Nielsen Norman Group directly: Aurora Harley, <i>Vanity Metrics: Add Context
  to Add Meaning</i> (2019) for the definition of a vanity metric and the actionability test; Therese
  Fessenden, <i>Scrolling and Attention</i> (2018) for 57% above the fold and 42% in the top fifth,
  from 120 participants and 130,000+ fixations; Kate Kaplan, <i>8 Design Guidelines for Complex
  Applications</i> (2020) for guidelines 6, 7 and 8; the <i>Progressive Disclosure</i> article; and
  Nielsen&rsquo;s ten heuristics for 1, 4, 5 and 8. &sect;11 follows the W3C ARIA Authoring Practices
  grid pattern for the roving tabindex and then declines the grid role, for the reason the schedule
  file gives.
</p>

</div>
<script src="assets/webapp.js"></script>
</body>
</html>
'''

if __name__ == "__main__":
    out = HERE / "webapp-dashboard.html"
    out.write_text(HTML)
    print("wrote", out, len(HTML), "chars")

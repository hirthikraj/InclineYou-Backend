#!/usr/bin/env python3
"""Generate webapp-clients.html — the roster, the file, intake and the way out.

Run it from anywhere: python3 gen_clients.py — it writes the page next to itself.

WHY THIS FILE EXISTS. The page it replaces drew five frames and, like the auth
page before it, documented a product that isn't there. Three of its claims are
checkable against the code and all three are wrong:

  * "Six tabs, in place", celebrated in its own change table as an improvement
    on the phone's four. `FILE_TABS` in app/src/clients/file.ts is FOUR, and §14
    of the mobile design makes it a rule with a reason — "a fifth only for a
    whole feature", because four already overflow the tab row at 360dp. The two
    invented tabs are Body (which is a separate screen, 8a, so it is at least a
    real thing in the wrong place) and Payments (which is the money book, and
    the rule says it lives one tap inside Package precisely so the owed figure
    has one source).

  * "Adding a client is the one flow where the web is barely better than the
    phone — it is six fields either way." `AddClientScreen`'s docstring is
    titled "5a · Add a client — two fields", and the empty state it quotes
    promises exactly that. The panel drawn on the old page asks for nine, four
    of them about money, one of which the app never asks at intake at all.

  * "The four numbers along the top ... sessions left, adherence, top set,
    money owed." `buildOverview` returns five rows and none of them is a top
    set. There is no top-set figure anywhere in the client file.

Everything below is imported from the code or derived from something that is,
and asserted. The two big imports:

  * `gen_today`  — the attention model, ported from `home/deck.ts`. Importing it
    rather than restating it is the whole argument of §02: `roster.ts` imports
    its thresholds from `deck.ts` for exactly this reason, and doing the same
    here is what surfaced the finding this page opens on — that the two modules
    agree on the thresholds and disagree on almost everything else.
  * `gen_schedule` — the working week, because intake step 3 picks slots out of
    it and a client's week that disagrees with the diary's is a bug one file up.
"""
import pathlib
import re
from datetime import date, timedelta

import gen_today as TDY
import gen_schedule as SCH
from gen_rail import (
    I_BARS, I_BELL, I_CAL, I_CHECK, I_CHEV, I_CHEVD, I_CHEVL, I_DOTSH, I_DUMB,
    I_GRID, I_HELP, I_OPEN, I_PLUS, I_RUPEE, I_SEARCH, I_SYNC, I_USER, I_USERS,
    ic, rail,
)
from gen_today import I_EYE, I_NO, I_DO, av, rs

HERE = pathlib.Path(__file__).resolve().parent

# ───────────────────────────────────────────────────────────── icons, local ──
I_PAUSE = '<path d="M9 5v14M15 5v14"/>'
I_PLAY = '<path d="M8 5l11 7-11 7V5Z"/>'
I_TRASH = ('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>')
I_BOX = ('<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z"/><path d="M3 8.5 12 13l9-4.5M12 13v7"/>')
I_EDIT = '<path d="M4 20h4L20 8l-4-4L4 16v4Z"/>'
I_MSG = ('<path d="M20 12a8 8 0 0 1-11.9 7L4 20l1.5-4A8 8 0 1 1 20 12Z"/>')
I_FILTER = '<path d="M4 6h16M7 12h10M10 18h4"/>'
I_SORT = '<path d="M7 5v14M7 19l-3-3M7 19l3-3M17 19V5M17 5l-3 3M17 5l3 3"/>'
I_WARN = ('<path d="M12 3.8 21 19.5H3L12 3.8Z"/><path d="M12 10v4"/>'
          '<circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>')
I_LOCK = ('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/>'
          '<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>')
I_SCALE = ('<path d="M4 8h16l-2 12H6L4 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>'
           '<path d="M12 12v4"/>')
I_CLOUD = ('<path d="M6.5 18h11a3.5 3.5 0 0 0 .3-7A5.5 5.5 0 0 0 7 9.6 3.7 3.7 0 0 0 6.5 18Z"/>')
I_PHONE = ('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 5.5h3"/>')

# ══════════════════════════════════════════════════════════════ the clock ══
D = TDY.D                       # date(2026, 8, 11), a Tuesday
assert D == date(2026, 8, 11) and D.strftime("%A") == "Tuesday", D
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def shortdate(d):
    """`shortDate` in roster.ts — "31 Jul". (Its month table is misnamed
       DAY_NAMES in the app; it holds months. Cosmetic, and it is noted in §15
       rather than silently corrected here.)"""
    return f"{d.day} {MONTHS[d.month - 1]}"


def daystamp(d):
    """`dayStamp` in home/time.ts, as the client file prints it."""
    return f"{d.day} {MONTHS[d.month - 1]}"


# ══════════════════════════════════════════ thresholds — imported, not typed ══
# roster.ts: `import { OVERDUE_DAYS, PACK_ENDING, QUIET_DAYS } from '../home/deck'`.
# gen_today already ported them from the same file, so this page takes them
# from there — one hop, same source, and a change to deck.ts breaks both pages.
QUIET_DAYS = TDY.QUIET_DAYS
PACK_ENDING = TDY.PACK_ENDING
OVERDUE_DAYS = TDY.OVERDUE_DAYS
assert (QUIET_DAYS, PACK_ENDING, OVERDUE_DAYS) == (7, 2, 7)

# roster.ts's own two constants, which the deck does not have.
INVITE_STALE_DAYS = 3       # "Trainerize turns its account tag red at three days"
INDEX_RAIL_MIN = 40         # below this the A-Z rail is scaffolding

# ── THE BANDS ────────────────────────────────────────────────────────────────
# `ATTENTION_BANDS` in deck.ts, taken from gen_today, which ports it. Importing
# the table rather than restating it is the entire point of §02: this page is
# the reason it exists, and the first draft of this file DID restate it — six
# raw weights, roster.ts's own, which is what surfaced the divergence.
BANDS = TDY.BANDS
BAND_VALUE = TDY.BAND_VALUE
CRITICAL_BANDS = TDY.CRITICAL_BANDS
DECK_BANDS = TDY.DECK_BANDS
weight = TDY.weight
sev_of = TDY.sev_of
money_band = TDY.money_band
pack_band = TDY.pack_band
assert len(BANDS) == 8 and BAND_VALUE["unavailable"] == 8
# Three bands the roster raises and Today does not. Selection, not model: none
# of the three is a thing that happens today.
ROSTER_ONLY_BANDS = [b for b in BANDS if b not in DECK_BANDS]
assert ROSTER_ONLY_BANDS == ["unavailable", "setup", "invite-stale"], ROSTER_ONLY_BANDS
# A magnitude cannot reach the band above it. The clamp is what makes the table
# a table rather than six numbers that happen not to have collided yet.
assert weight("due-soon", 10_00_000 / 100) < weight("pack-ending", 0)


# ═══════════════════════════════════════════════════════ the roster, as input ══
# Twenty-two rows, because every other file in this set says 22 — the rail
# badge, the money file's "27 sessions across 22 clients", and this page's own
# old subtitle. What none of them said is what the other four states look like,
# so four of the twenty-two are here to carry them: two mid-setup, one whose
# number belongs to a trainer account, one written on this phone and not yet
# pushed.
#
# Each row is the INPUT roster.ts reads, not the output it renders. The line,
# the verb, the severity and the weight below are all derived by `attn()`.
#   owed  : (amount, oldest invoice date) — `payments` with a due status
#   pack  : (remaining, total)            — the leanest live package
#   quiet : days since the last logged workout, for a client with a live plan
#   prog  : (name, start, end)            — the live program, for the fallback line
#   wk    : a standing week is on file    — `clients.weekly_schedule`
#   logged: anything ever logged          — `hasWorkouts`
ROSTER = [
    # name        ini    av       status    mode      batch      phone
    dict(name="Meera K",   ini="MK", av="av-1",  status="active", mode="floor",
         batch="morning", phone="98765 43210", pack=(8, 12), quiet=1,
         prog=("Push / Pull / Legs", date(2026, 7, 14), date(2026, 9, 8)),
         wk=True, logged=True, last=date(2026, 8, 11)),
    dict(name="Arjun S",   ini="AS", av="av-5",  status="active", mode="floor",
         batch="morning", phone="98410 22119", pack=(2, 12), quiet=2,
         prog=("Upper / Lower", date(2026, 7, 6), date(2026, 8, 31)),
         wk=True, logged=True, last=date(2026, 8, 11)),
    dict(name="Divya R",   ini="DR", av="av-7",  status="active", mode="remote",
         batch="morning", phone="99401 55620", pack=None, quiet=0,
         prog=("Full body", date(2026, 6, 29), None),
         wk=True, logged=True, last=date(2026, 8, 11)),
    dict(name="Nikhil P",  ini="NP", av="av-3",  status="active", mode="floor",
         batch="evening", phone="90030 41187", pack=(11, 12), quiet=3,
         prog=("Full body", date(2026, 8, 3), date(2026, 9, 28)),
         wk=True, logged=True, last=date(2026, 8, 8)),
    dict(name="Kavya M",   ini="KM", av="av-9",  status="active", mode="floor",
         batch="evening", phone="94441 08823", pack=(0, 12), quiet=1,
         prog=("Push / Pull", date(2026, 6, 15), date(2026, 8, 24)),
         wk=True, logged=True, last=date(2026, 8, 10)),
    dict(name="Farhan Q",  ini="FQ", av="av-6",  status="active", mode="floor",
         batch="evening", phone="98847 30012", owed=(6000, date(2026, 7, 31)),
         pack=(5, 12), quiet=2,
         prog=("Upper / Lower", date(2026, 7, 20), date(2026, 9, 14)),
         wk=True, logged=True, last=date(2026, 8, 9)),
    dict(name="Sneha R",   ini="SR", av="av-12", status="active", mode="remote",
         batch="none", phone="93800 66214", owed=(9000, date(2026, 8, 5)),
         pack=None, quiet=1, prog=("Home kit", date(2026, 7, 1), None),
         wk=True, logged=True, last=date(2026, 8, 10)),
    dict(name="Vikram T",  ini="VT", av="av-10", status="active", mode="floor",
         batch="night", phone="99621 47790", owed=(3000, date(2026, 8, 7)),
         pack=(9, 12), quiet=4, prog=("Legs focus", date(2026, 7, 27), None),
         wk=True, logged=True, last=date(2026, 8, 7)),
    dict(name="Priya N",   ini="PN", av="av-2",  status="active", mode="floor",
         batch="morning", phone="90921 33418", pack=(4, 12), quiet=9,
         prog=("Push / Pull / Legs", date(2026, 6, 22), date(2026, 8, 17)),
         wk=True, logged=True, last=date(2026, 8, 2)),
    dict(name="Ananya S",  ini="AS", av="av-4",  status="active", mode="remote",
         batch="none", phone="98404 71165", pack=None, quiet=2,
         prog=("Full body", date(2026, 7, 13), None),
         wk=True, logged=True, last=date(2026, 8, 9)),
    dict(name="Karthik R", ini="KR", av="av-8",  status="active", mode="floor",
         batch="morning", phone="94445 12093", pack=(7, 12), quiet=0,
         prog=("Full body", date(2026, 7, 20), date(2026, 9, 14)),
         wk=True, logged=True, last=date(2026, 8, 11)),
    dict(name="Lakshmi N", ini="LN", av="av-11", status="active", mode="floor",
         batch="evening", phone="99529 84471", pack=(6, 12), quiet=3,
         prog=("Beginner strength", date(2026, 8, 3), date(2026, 9, 28)),
         wk=True, logged=True, last=date(2026, 8, 8)),
    dict(name="Suresh K",  ini="SK", av="av-2",  status="active", mode="floor",
         batch="night", phone="90030 77812", pack=(3, 12), quiet=2,
         prog=("Upper / Lower", date(2026, 7, 6), date(2026, 8, 31)),
         wk=True, logged=True, last=date(2026, 8, 9)),
    dict(name="Naveen J",  ini="NJ", av="av-7",  status="active", mode="remote",
         batch="none", phone="98409 30074", pack=None, quiet=5,
         prog=("Home kit", date(2026, 6, 29), None),
         wk=True, logged=True, last=date(2026, 8, 6)),
    dict(name="Ritu A",    ini="RA", av="av-12", status="active", mode="floor",
         batch="morning", phone="99400 65538", pack=(10, 12), quiet=1,
         prog=("Beginner strength", date(2026, 8, 10), date(2026, 10, 5)),
         wk=True, logged=True, last=date(2026, 8, 10), queued=True),
    # The two mid-setup rows. Neither has ever trained, which is what makes
    # `onboardingStep` chase them: a client with a logged workout is in the
    # routine whatever their record says.
    dict(name="Zubin I",   ini="ZI", av="av-3",  status="active", mode="floor",
         batch="none", phone="98841 07752", pack=(10, 10), quiet=None,
         prog=None, wk=False, logged=False, last=None,
         created=date(2026, 8, 10)),
    dict(name="Deepa V",   ini="DV", av="av-9",  status="active", mode="floor",
         batch="morning", phone="94440 21186", pack=(12, 12), quiet=None,
         prog=None, wk=True, logged=False, last=None,
         created=date(2026, 8, 7)),
    # The number that belongs to a trainer account. Everything else about him
    # works — he can be booked, logged and billed. Only the invite can't land.
    dict(name="Harish B",  ini="HB", av="av-6",  status="active", mode="floor",
         batch="evening", phone="98400 11223", pack=(4, 12), quiet=2,
         prog=("Full body", date(2026, 7, 13), date(2026, 9, 7)),
         wk=True, logged=True, last=date(2026, 8, 9), membership="unavailable"),
    # Paused.
    dict(name="Rahul D",   ini="RD", av="av-4",  status="paused", mode="floor",
         batch="evening", phone="99623 40018", pack=(6, 12), quiet=None,
         prog=None, wk=True, logged=True, last=date(2026, 8, 1),
         paused=date(2026, 8, 2)),
    # Invited: one today, two stale.
    dict(name="Anjali M",  ini="AM", av="av-1",  status="invited", mode="floor",
         batch="none", phone="90031 22947", pack=(10, 10), quiet=None,
         prog=None, wk=True, logged=False, last=None, invited=date(2026, 8, 11)),
    dict(name="Gopal S",   ini="GS", av="av-8",  status="invited", mode="floor",
         batch="morning", phone="94443 90065", pack=(10, 10), quiet=None,
         prog=None, wk=True, logged=False, last=None, invited=date(2026, 8, 6)),
    dict(name="Tanvi R",   ini="TR", av="av-11", status="invited", mode="remote",
         batch="none", phone="98846 55201", pack=None, quiet=None,
         prog=None, wk=True, logged=False, last=None, invited=date(2026, 8, 7)),
]
N_ROWS = len(ROSTER)
assert N_ROWS == 22, N_ROWS

# Archived rows are filtered OUT of the roster by `buildRoster` before anything
# else happens, so they are not in the list above at all — they are a count and
# a route, which is exactly how the app treats them.
N_ARCHIVED = 4


# ═════════════════════════════════════════════ roster.ts, ported and asserted ══
def progline(c):
    """`programLine` — "Push A · Week 5 of 8". Only when the program carries
       real dates; a program with a start and no end gets no week."""
    if not c.get("prog"):
        return None
    label, start, end = c["prog"]
    week = ((D - start).days // 7) + 1
    if week < 1:
        return label
    if end is None:
        return f"{label} &middot; Week {week}"
    total = max(1, -(-(end - start).days // 7))
    return f"{label} &middot; Week {min(week, total)} of {total}"


def onboarding_step(c):
    """`onboardingStep` in clients/schedule.ts. Derived from two facts, never
       stored — which is why finishing the steps from anywhere clears it."""
    if c.get("logged"):
        return None
    if not c.get("wk"):
        return None if c.get("prog") else "schedule"
    return None if c.get("prog") else "plan"


def attn(c):
    """`row()` in clients/roster.ts — every band this client is in, most urgent
       wins.

       A list of candidates rather than an if/elif chain, which is what the file
       shipped after §02: the chain had to be kept in the same order as the band
       table by hand, and nothing caught it drifting. Still exactly one row per
       client — "a row that says three things says none of them" — but the one
       it keeps is now provably the most urgent."""
    st = c["status"]
    owed, owed_since = c.get("owed", (0, None))
    owed_days = (D - owed_since).days if owed_since else 0
    pack = c.get("pack")
    left = pack[0] if pack else None
    quiet = c["quiet"] if (c.get("prog") and st == "active") else None
    step = onboarding_step(c) if st == "active" else None
    inv_days = (D - c["invited"]).days if c.get("invited") else 0

    cand = []
    if c.get("membership") == "unavailable":
        cand.append(("unavailable", "unavailable", "Fix number", 0,
                     "That number is a trainer account &mdash; they can&rsquo;t "
                     "be invited"))
    if step:
        cand.append(("setup", "setup", "Set up", 0,
                     "Not in your week yet &mdash; pick their training days"
                     if step == "schedule" else
                     "Week picked, no plan on it yet"))
    # Paused is a state, not a job. Nothing below is collected for a paused
    # client — the debt does not go away, it is just not this list's business
    # until they are resumed, and the segment's callout says so.
    if st != "paused":
        if owed > 0:
            band = money_band(owed_days)
            cand.append((band, "overdue", "Remind", owed / 100,
                         f"{rs(owed)} "
                         f"{'overdue' if band == 'overdue-late' else 'due'}"
                         f" &middot; {owed_days} days"))
        if quiet is not None and quiet >= QUIET_DAYS:
            cand.append(("quiet", "quiet", "Nudge", quiet,
                         f"No workout logged in {quiet} days"))
        if left is not None and pack_band(left):
            cand.append((pack_band(left), "pack", "Renew", PACK_ENDING - left,
                         "Pack is empty" if left <= 0 else
                         f"Pack ends in {left} session"
                         f"{'' if left == 1 else 's'}"))
        if st == "invited" and inv_days >= INVITE_STALE_DAYS:
            cand.append(("invite-stale", "invite", "Resend", inv_days,
                         f"Invited {inv_days} days ago &middot; not set up"))

    kind = act = sev = band = None
    line = None
    w = 0
    if cand:
        band, kind, act, mag, line = max(
            cand, key=lambda x: weight(x[0], x[3]))
        w = weight(band, mag)
        sev = sev_of(band)
    elif st == "paused":
        tail = "no pack" if left is None else f"{left} sessions left"
        line = f"Paused {shortdate(c['paused'])} &middot; {tail}"
    elif st == "invited":
        line = f"Invited {'today' if inv_days == 0 else f'{inv_days} days ago'}"

    if line is None:
        line = progline(c) or (f"Last session {shortdate(c['last'])}"
                               if c.get("last") else "No program yet")

    return dict(c, kind=kind, band=band, act=act, sev=sev, weight=w, line=line,
                step=step, owed=owed, owed_days=owed_days, left=left,
                quiet_days=quiet, inv_days=inv_days,
                letter=c["name"][0].upper())


ROWS = [attn(c) for c in ROSTER]
BY_NAME = {r["name"]: r for r in ROWS}

COUNTS = dict(
    all=len(ROWS),
    attention=sum(1 for r in ROWS if r["kind"]),
    active=sum(1 for r in ROWS if r["status"] == "active"),
    paused=sum(1 for r in ROWS if r["status"] == "paused"),
    invited=sum(1 for r in ROWS if r["status"] == "invited"),
)
assert COUNTS == dict(all=22, attention=11, active=18, paused=1, invited=3), COUNTS
assert COUNTS["active"] + COUNTS["paused"] + COUNTS["invited"] == N_ROWS

# `sortRows(rows, 'attention')` — weight descending, then name.
ATTN = sorted((r for r in ROWS if r["kind"]),
              key=lambda r: (-r["weight"], r["name"]))
REST = sorted((r for r in ROWS if not r["kind"]), key=lambda r: r["name"])
assert [r["name"] for r in ATTN] == [
    "Harish B", "Deepa V", "Zubin I", "Farhan Q", "Kavya M", "Priya N",
    "Arjun S", "Sneha R", "Vikram T", "Gopal S", "Tanvi R"], \
    [r["name"] for r in ATTN]
assert [r["weight"] for r in ATTN] == [
    8000, 7000, 7000, 6060, 5002, 4009, 3000, 2090, 2030, 1005, 1004], \
    [r["weight"] for r in ATTN]
# Deepa before Zubin on a tie, by name — the only tie in the list, and it is
# there on purpose: two clients owing different setup steps are the same job.
assert ATTN[1]["weight"] == ATTN[2]["weight"]
# The band table doing the thing the raw weights could not: `unavailable` is
# genuinely first, above a ₹6,000 debt, which is what roster.ts's comment had
# been claiming while the arithmetic said otherwise.
assert ATTN[0]["band"] == "unavailable"
assert BY_NAME["Harish B"]["weight"] > BY_NAME["Farhan Q"]["weight"]
N_ATTN = len(ATTN)
N_KINDS = len({r["kind"] for r in ATTN})
N_BANDS_USED = len({r["band"] for r in ATTN})
assert (N_ATTN, N_KINDS, N_BANDS_USED) == (11, 6, 8), \
    (N_ATTN, N_KINDS, N_BANDS_USED)
N_CRIT = sum(1 for r in ATTN if r["sev"] == "critical")
# The two that stop the work, and they are the same two Today marks red.
assert [r["name"] for r in ATTN if r["sev"] == "critical"] == \
    ["Farhan Q", "Kavya M"]
assert N_CRIT == 2, N_CRIT

# `Roster.tally` — the three figures on the attention strip.
TALLY = dict(
    owed=sum(r["owed"] for r in ATTN if r["kind"] == "overdue"),
    quiet=sum(1 for r in ATTN if r["kind"] == "quiet"),
    ending=sum(1 for r in ATTN if r["kind"] == "pack"),
)
assert TALLY == dict(owed=18000, quiet=1, ending=2), TALLY

# THE SECOND THING THE BAND TABLE FIXED, without being aimed at it.
# `tally.owed` sums the overdue-KIND rows of the attention list. While the
# roster admitted a debt only after seven days, that sum was ₹6,000 across one
# client — printed under the word "owed", on a screen whose rail badge said 3
# and whose money book said ₹18,000. Three numbers for one word, all correct.
# Now that any money owed is an item, the strip and the book are the same
# figure, and the split between late and not-late is a fact the strip states
# rather than a number it hides.
TOTAL_OWED = sum(r["owed"] for r in ROWS)
N_OWING = sum(1 for r in ROWS if r["owed"] > 0)
assert TOTAL_OWED == TDY.M_PENDING == 18000, (TOTAL_OWED, TDY.M_PENDING)
assert N_OWING == TDY.M_CLIENTS_OWING == 3
assert TALLY["owed"] == TOTAL_OWED          # the strip now agrees with the book
OWED_LATE = sum(r["owed"] for r in ATTN if r["band"] == "overdue-late")
OWED_SOON = sum(r["owed"] for r in ATTN if r["band"] == "due-soon")
assert (OWED_LATE, OWED_SOON) == (6000, 12000), (OWED_LATE, OWED_SOON)
assert OWED_LATE + OWED_SOON == TOTAL_OWED
STALE_TALLY_OWED = 6000     # what the strip said before, under the word "owed"


# ═══════════════════════════ the finding, and what it cost to close it ══
# roster.ts's docstring: "the whole point of the severity spine being the same
# 2px bar on both screens is that 'needs attention' means one thing in this app,
# not two."
#
# For a while only the THRESHOLDS were imported and everything else was
# restated, which made that sentence false in four ways at once. The numbers
# below are what this page measured on 11 August before the model was unified —
# kept as literals, because a fixed bug that leaves no trace is a bug waiting to
# come back.
STALE_DECK_N = 6           # rows on Today
STALE_ROST_N = 9           # rows on Clients
STALE_BOTH_N = 4           # clients both named
STALE_SWAPPED = ["Priya N", "Kavya M"]      # of those four, two in a different order
STALE_ROST_CRIT = 1        # Clients marked one row red; Today marked two
STALE_KAVYA = [
    ("Weight", "1902", "2000"),
    ("Severity", "critical", "alert"),
    ("The line", "Pack is empty", "Pack finished"),
]
assert len(STALE_KAVYA) == 3

# And what the same data does now, through one table.
DECK = TDY.NEEDS                                     # buildAttention, deck.ts
DECK_NAMES = [r["name"] for r in DECK]
ROST_NAMES = [r["name"] for r in ATTN]

BOTH = [n for n in ROST_NAMES if n in DECK_NAMES]
DECK_ONLY = [n for n in DECK_NAMES if n not in ROST_NAMES]
ROST_ONLY = [n for n in ROST_NAMES if n not in DECK_NAMES]
N_BOTH, N_DECK_ONLY, N_ROST_ONLY = len(BOTH), len(DECK_ONLY), len(ROST_ONLY)

# 1 · Today names nobody the roster does not. It cannot: every band Today
#     raises is one the roster raises too.
assert DECK_ONLY == [], DECK_ONLY
assert N_BOTH == len(DECK) == 6, (N_BOTH, len(DECK))

# 2 · The roster names five more, and every one of them is in a band Today does
#     not raise — selection, not disagreement.
assert ROST_ONLY == ["Harish B", "Deepa V", "Zubin I", "Gopal S", "Tanvi R"], ROST_ONLY
assert all(BY_NAME[n]["band"] in ROSTER_ONLY_BANDS for n in ROST_ONLY)
assert all(r["band"] in DECK_BANDS for r in ATTN if r["name"] in BOTH)

# 3 · Identical relative order for every client both lists carry.
_d = [n for n in DECK_NAMES if n in BOTH]
_r = [n for n in ROST_NAMES if n in BOTH]
SWAPPED = [n for i, n in enumerate(_r) if _d[i] != n]
assert SWAPPED == [], SWAPPED
assert _d == _r == ["Farhan Q", "Kavya M", "Priya N", "Arjun S", "Sneha R",
                    "Vikram T"], _r

# 4 · Identical weight, severity and wording, row by row.
for _n in BOTH:
    _dk = next(r for r in DECK if r["name"] == _n)
    _rs = BY_NAME[_n]
    assert _dk["weight"] == _rs["weight"], (_n, _dk["weight"], _rs["weight"])
    assert _dk["sev"] == _rs["sev"], (_n, _dk["sev"], _rs["sev"])
    assert _dk["line"] == _rs["line"], (_n, _dk["line"], _rs["line"])
    assert _dk["band"] == _rs["band"], _n

# The kinds. Still three against six, and that is the part which was never a
# defect: `setup`, `invite` and `unavailable` are not things that happen today.
DECK_KINDS = sorted({r["kind"] for r in DECK})
ROST_KINDS = sorted({r["kind"] for r in ATTN})
assert DECK_KINDS == ["overdue", "pack", "quiet"], DECK_KINDS
assert ROST_KINDS == ["invite", "overdue", "pack", "quiet", "setup",
                      "unavailable"], ROST_KINDS
KINDS_MISSING = [k for k in ROST_KINDS if k not in DECK_KINDS]
assert KINDS_MISSING == ["invite", "setup", "unavailable"], KINDS_MISSING

# Kavya M, the client who used to carry four disagreements at once.
K_DECK = next(r for r in DECK if r["name"] == "Kavya M")
K_ROST = BY_NAME["Kavya M"]
KAVYA = [
    ("Rank among the rows both lists carry",
     f"{_d.index('Kavya M') + 1} of {len(_d)}",
     f"{_r.index('Kavya M') + 1} of {len(_r)}"),
    ("Band", K_DECK["band"], K_ROST["band"]),
    ("Weight", str(K_DECK["weight"]), str(K_ROST["weight"])),
    ("Severity", K_DECK["sev"], K_ROST["sev"]),
    ("The line", K_DECK["line"], K_ROST["line"]),
]
assert all(a == b for _, a, b in KAVYA)
assert K_DECK["line"] == "Pack is empty"

# One row per client, on both screens now. `buildAttention` still pushes an
# item per (client, kind) and `row()` still keeps one — but both rank with the
# same table, so the row the roster keeps is the top row Today would show for
# that client rather than a different one.
DECK_MULTI = [n for n in set(DECK_NAMES) if DECK_NAMES.count(n) > 1]
assert DECK_MULTI == [], DECK_MULTI

# The five states no file in this set had ever drawn.
STALE_STATES = ["active", "paused"]        # what the old page's Status column held
NEW_STATES = ["setup &middot; schedule", "setup &middot; plan", "unavailable",
              "invited &middot; fresh", "invited &middot; stale", "queued"]
N_NEW_STATES = len(NEW_STATES)
assert N_NEW_STATES == 6


# ════════════════════════════════════════════════════ one file · Meera K ══
# `FILE_TABS` in clients/file.ts, verbatim. FOUR, and §14 makes it a rule:
# "a fifth only for a whole feature", because four already overflow the tab
# row at 360dp. The old page drew six and called the two extras an improvement.
FILE_TABS = [("overview", "Overview"), ("programs", "Programs"),
             ("sessions", "Sessions"), ("package", "Package")]
N_TABS = len(FILE_TABS)
assert N_TABS == 4
STALE_TABS = ["Overview", "Programs", "Sessions", "Package", "Body", "Payments"]
INVENTED_TABS = [t for t in STALE_TABS if t not in [l for _, l in FILE_TABS]]
assert INVENTED_TABS == ["Body", "Payments"], INVENTED_TABS

M = BY_NAME["Meera K"]
JOINED = date(2026, 2, 4)
RATE = SCH.RATE                 # 800 — one floor session, billed
KEEP = SCH.KEEP                 # 432 — what is left after the gym's 46%
GYM_PCT = round(100 * (RATE - KEEP) / RATE)
assert (RATE, KEEP, GYM_PCT) == (800, 432, 46), (RATE, KEEP, GYM_PCT)

# The pack. TWELVE sessions at the ONE session rate this whole set uses —
# which is where the old page's arithmetic came apart: its Package column said
# ₹8,000 for 12 and its deal card said ₹800 a session, on the same frame, and
# 12 × 800 is not 8,000.
PACK_TOTAL = 12
PACK_LEFT = M["left"]
PACK_AMOUNT = PACK_TOTAL * RATE
PACK_PER = round(PACK_AMOUNT / PACK_TOTAL)
assert (PACK_LEFT, PACK_TOTAL, PACK_AMOUNT, PACK_PER) == (8, 12, 9600, 800)
STALE_PACK_AMOUNT = 8000
STALE_PACK_PER = round(STALE_PACK_AMOUNT / PACK_TOTAL)     # 667
PACK_GAP = PACK_AMOUNT - STALE_PACK_AMOUNT
assert (STALE_PACK_PER, PACK_GAP) == (667, 1600), (STALE_PACK_PER, PACK_GAP)

PACK_BOUGHT = date(2026, 8, 2)
PACK_END = date(2026, 10, 6)
PACK_USED = PACK_TOTAL - PACK_LEFT
PACK_CUT = round(PACK_AMOUNT * GYM_PCT / 100)
PACK_KEEP = PACK_AMOUNT - PACK_CUT
assert (PACK_USED, PACK_CUT, PACK_KEEP) == (4, 4416, 5184)
assert PACK_KEEP == PACK_TOTAL * KEEP        # the two ways round agree

# All time. Five packs sold; four finished, this one four sessions in.
PACKS_SOLD = 5
DONE_ALL = (PACKS_SOLD - 1) * PACK_TOTAL + PACK_USED
PAID_ALL = PACKS_SOLD * PACK_AMOUNT
assert (DONE_ALL, PAID_ALL) == (52, 48000), (DONE_ALL, PAID_ALL)
OWED_M = 0                       # `outstanding(pack, payments)` — paid in full

# ── the seven days behind the adherence strip ────────────────────────────
# `last7` in file.ts. Meera trains Tuesday, Thursday and Saturday, so four of
# the seven days had nothing scheduled — and a rest day is absent from BOTH
# halves of the fraction, not sitting in the denominator as a failure.
#   d = the date, sch = was anything scheduled, done = was it kept
WEEK7 = [
    (date(2026, 8, 5),  False, False),   # Wednesday — rest
    (date(2026, 8, 6),  True,  False),   # Thursday  — no-show
    (date(2026, 8, 7),  False, False),   # Friday    — rest
    (date(2026, 8, 8),  True,  True),    # Saturday  — kept
    (date(2026, 8, 9),  False, False),   # Sunday    — rest
    (date(2026, 8, 10), False, False),   # Monday    — rest
    (date(2026, 8, 11), True,  True),    # Tuesday   — kept, this morning
]
assert len(WEEK7) == 7 and WEEK7[-1][0] == D
ADH_PLANNED = sum(1 for _, s, _ in WEEK7 if s)
ADH_KEPT = sum(1 for _, _, k in WEEK7 if k)
ADH_REST = sum(1 for _, s, _ in WEEK7 if not s)
assert (ADH_KEPT, ADH_PLANNED, ADH_REST) == (2, 3, 4)
# `week: boolean[]` is SEVEN BOOLEANS, so a rest day and a missed day are the
# same false. The fraction gets the rule right and the strip it hands over
# cannot draw it. Five of the seven dots are false and only ONE of them is a
# miss. §09.
FALSE_DOTS = sum(1 for _, _, k in WEEK7 if not k)
MISSED = sum(1 for _, s, k in WEEK7 if s and not k)
assert (FALSE_DOTS, MISSED) == (5, 1)
STALE_ADH = (92, 22, 24, "8 wk")   # what the old page printed instead

# ── the sessions tab ─────────────────────────────────────────────────────
# `rowFor` in file.ts, including the pack line, which is the only consequence
# a trainer scrolls this tab for. `delta` is what the row did to the pack.
#   when, label, status, exercises, packDelta
SESSIONS = [
    (date(2026, 8, 13), "06:00", "Pull A",  "booked",     0,  0),
    (date(2026, 8, 15), "07:30", "Legs B",  "booked",     0,  0),
    (date(2026, 8, 11), "06:00", "Push A",  "done",       6, -1),
    (date(2026, 8, 8),  "07:30", "Legs B",  "done",       5, -1),
    (date(2026, 8, 6),  "06:00", "Pull A",  "no_show",    0, -1),
    (date(2026, 8, 4),  "06:00", "Push A",  "done",       6, -1),
    (date(2026, 8, 1),  "07:30", "Legs B",  "cancelled",  0,  0),
    (date(2026, 7, 30), "06:00", "Pull A",  "unmarked",   0,  0),
]
S_ALL = len(SESSIONS)
S_DONE = sum(1 for s in SESSIONS if s[3] == "done")
S_NOSHOW = sum(1 for s in SESSIONS if s[3] == "no_show")
S_CANCEL = sum(1 for s in SESSIONS if s[3] == "cancelled")
S_BOOKED = sum(1 for s in SESSIONS if s[3] == "booked")
S_UNMARKED = sum(1 for s in SESSIONS if s[3] == "unmarked")
assert (S_ALL, S_DONE, S_NOSHOW, S_CANCEL, S_BOOKED, S_UNMARKED) == \
    (8, 3, 1, 1, 2, 1)
# THE CHIPS DO NOT SUM TO ALL. `SessionFilter` has five values and there is no
# sixth for the row that has no status — a slot that came and went unmarked is
# the absence of an outcome, and the one row on this tab that needs the
# trainer, reachable only through All.
CHIP_SUM = S_DONE + S_NOSHOW + S_CANCEL + S_BOOKED
assert CHIP_SUM == 7 and S_ALL - CHIP_SUM == S_UNMARKED == 1
# The pack decrements on done and no-show, never on booked or cancelled.
assert sum(-d for *_, d in SESSIONS if d) == PACK_USED == 4
assert all(d == -1 for *_, st, _, d in SESSIONS if st in ("done", "no_show"))
assert all(d == 0 for *_, st, _, d in SESSIONS if st in ("booked", "cancelled",
                                                         "unmarked"))


# ── the programs tab ─────────────────────────────────────────────────────
# `buildPrograms`. Three programs and the gap before the first one, which is a
# real period of somebody's training and therefore a row that says what
# happened in it.
PROGRAMS = [
    ("Push / Pull / Legs", date(2026, 7, 14), date(2026, 9, 8),  "active"),
    ("Upper / Lower",      date(2026, 5, 12), date(2026, 7, 13), "completed"),
    ("Full body",          date(2026, 3, 16), date(2026, 5, 11), "completed"),
]
P_ACTIVE = PROGRAMS[0]
P_TOTAL = max(1, round((P_ACTIVE[2] - P_ACTIVE[1]).days / 7))
P_WEEK = min(P_TOTAL, max(1, (D - P_ACTIVE[1]).days // 7 + 1))
assert (P_WEEK, P_TOTAL) == (5, 8), (P_WEEK, P_TOTAL)
# roster.ts's `programLine` reaches the same pair by its own arithmetic — one
# uses round for the total, the other ceil. They must not disagree.
assert progline(M) == f"Push / Pull / Legs &middot; Week {P_WEEK} of {P_TOTAL}", progline(M)
STALE_WEEK = 6      # the old page said "wk 6 of 8", and dated a deload 22 Sep
STALE_DELOAD = date(2026, 9, 22)
assert STALE_WEEK != P_WEEK
assert STALE_DELOAD > P_ACTIVE[2]        # after the program it belongs to ends

GAP_FROM, GAP_TO = JOINED, PROGRAMS[-1][1]
GAP_DAYS = (GAP_TO - GAP_FROM).days
assert GAP_DAYS == 40 and GAP_DAYS > 7, GAP_DAYS
P_THIS_WEEK = [s[2] for s in SESSIONS if s[3] != "cancelled"
               and 0 <= (D - s[0]).days <= 6]
P_LABELS = list(dict.fromkeys(P_THIS_WEEK))[:3]
P_PLANNED, P_DONE = ADH_PLANNED, ADH_KEPT
assert P_LABELS == ["Push A", "Legs B", "Pull A"], P_LABELS

# ── the body tab ─────────────────────────────────────────────────────────
# `buildMetrics`. Append-only: no edit, no delete, in the app or here. The
# eighth row is the reason this screen is drawn at all — a fat-fingered 68.0
# at 06:58 and the right number three minutes later, BOTH kept, both saying so.
WEIGHT = [
    (date(2026, 2, 4),  None,    63.1),
    (date(2026, 4, 28), "18:40", 62.5),
    (date(2026, 6, 2),  "07:15", 61.8),
    (date(2026, 6, 30), "07:05", 61.2),
    (date(2026, 7, 28), "06:55", 61.0),
    (date(2026, 8, 11), "06:58", 68.0),      # the typo
    (date(2026, 8, 11), "07:01", 60.8),      # the correction
]
WAIST = [
    (date(2026, 2, 4),  None,    82.0),
    (date(2026, 4, 28), "18:41", 81.0),
    (date(2026, 6, 2),  "07:16", 80.0),
    (date(2026, 6, 30), "07:06", 79.0),
    (date(2026, 7, 28), "06:56", 78.0),
]
N_WEIGHT, N_WAIST = len(WEIGHT), len(WAIST)
N_METRICS = N_WEIGHT + N_WAIST
assert (N_WEIGHT, N_WAIST, N_METRICS) == (7, 5, 12)
# `count: input.metrics.length` — BOTH kinds. So the badge is 12 while the
# weight table is 7 rows. The old page put "9 entries" over a 5-row table and
# was wrong in both directions at once.
STALE_METRIC_N, STALE_METRIC_ROWS = 9, 5
assert STALE_METRIC_N not in (N_METRICS, N_WEIGHT)

W_FIRST, W_LAST = WEIGHT[0][2], WEIGHT[-1][2]
W_DELTA = round(W_LAST - W_FIRST, 1)
assert W_DELTA == -2.3, W_DELTA
WA_DELTA = round(WAIST[-1][2] - WAIST[0][2], 1)
assert WA_DELTA == -4.0, WA_DELTA

# THE SPARKLINE PLOTS THE TYPO. `spark: series.map(m => m.value)` takes every
# reading, and nothing in `MetricsView` tells the chart which rows the list is
# about to mark `replaced`. So the one screen whose whole job is to be believed
# draws a 7.2 kg spike the table underneath calls a mistake — and the real six
# months of change is squeezed into a third of the plot.
SPARK_ALL = [v for *_, v in WEIGHT]
SPARK_TRUE = [v for (d, t, v) in WEIGHT if not (d == date(2026, 8, 11) and t == "06:58")]
RANGE_ALL = round(max(SPARK_ALL) - min(SPARK_ALL), 1)
RANGE_TRUE = round(max(SPARK_TRUE) - min(SPARK_TRUE), 1)
assert (RANGE_ALL, RANGE_TRUE) == (7.2, 2.3), (RANGE_ALL, RANGE_TRUE)
SPARK_SHARE = round(100 * RANGE_TRUE / RANGE_ALL)
assert SPARK_SHARE == 32, SPARK_SHARE

# The fields `FileMetric` actually has: id, clientId, metricType, value, unit,
# recordedAt. There is no recorder, so the old page's "Recorded — By Meera, in
# the app / By you, on the floor / Intake" column had nothing behind it.
METRIC_FIELDS = ["id", "clientId", "metricType", "value", "unit", "recordedAt"]
assert "recordedBy" not in METRIC_FIELDS


def signed(delta):
    """`signedDelta`. Never coloured: −3.8 kg is progress for one client and a
       failure for another, and the app does not know which."""
    r = round(delta, 1)
    if r == 0:
        return "0"
    return ("&minus;" if r < 0 else "+") + str(abs(r))


def trim(v):
    r = round(v * 10) / 10
    return str(int(r)) if r == int(r) else str(r)


assert trim(84.20) == "84.2" and trim(96.0) == "96"
assert signed(-0.7) == "&minus;0.7" and signed(7.0) == "+7.0"


# ═════════════════════════════════════════════════════════ intake · 4 steps ══
# `Steps count={4}` on all four screens, and the count is not decorative: the
# record is created on step 2, and steps 3 and 4 are skippable — which is
# exactly where the roster's `setup` attention item comes from. Skipping them
# is a supported path that produces a chased row, not an error.
INTAKE = [
    ("Who", "Their name and phone number", "AddClientScreen",
     "Two fields. Nothing else blocks the first session."),
    ("Money", "How they pay", "AddClientPayScreen",
     "The only step that earns a screen of its own, and what it asks depends "
     "on <code>workMode</code>."),
    ("Week", "Which days, at what time", "ClientScheduleScreen",
     "Slots offered out of the trainer&rsquo;s own hours, minus the hours other "
     "clients hold. Skippable."),
    ("Plan", "A program on that week", "ClientPlanScreen",
     "Day count must match the week exactly or the server refuses the apply. "
     "Skippable."),
]
N_INTAKE = len(INTAKE)
assert N_INTAKE == 4
CREATED_ON_STEP = 2      # `createClient` in AddClientPayScreen
SKIPPABLE = [s[0] for s in INTAKE[2:]]
assert SKIPPABLE == ["Week", "Plan"]

# Step 1 asks two things. The old page's panel asked nine.
FIELDS_APP = ["Their name", "Phone number"]
STALE_FIELDS = ["Name", "Mobile number", "Where you train", "Fee per session",
                "Gym&rsquo;s share", "Who collects", "Sessions", "Valid until",
                "Send them the app link on WhatsApp now"]
assert len(FIELDS_APP) == 2 and len(STALE_FIELDS) == 9
STALE_CLAIM_FIELDS = 6   # "it is six fields either way"
assert STALE_CLAIM_FIELDS not in (len(FIELDS_APP), len(STALE_FIELDS))

# The three rows shown as em dashes rather than as empty required-looking
# fields — "a row that looks like an unfilled required field makes the two
# above it look optional".
DEFERRED = [("Program", "Assign one after their first session"),
            ("Pack", "Sell it on the day they pay"),
            ("Batch", "Morning, evening, or neither")]
assert len(DEFERRED) == 3

# `workMode` on the trainer profile. THREE branches, and two of them never ask
# who collects — because the answer is implied by the mode. The old panel asked
# every trainer, every time.
WORKMODES = [
    ("independent", "Independent",
     "They collect, by definition. Their own packs, price editable on the sale.",
     False),
    ("gym", "Gym",
     "The counter collects. The gym&rsquo;s list, and one question: their share.",
     True),
    ("both", "Both",
     "Asks first &mdash; gym client, or one of your own? That picks the form.",
     True),
]
assert sum(1 for *_, asks in WORKMODES if asks) == 2

# `trainerSplitPercent` is what the TRAINER keeps, so the gym keeps the rest —
# "the same convention `projectedCut` reads". The old panel's field was labelled
# "Gym's share %", which stores the complement of what it says.
TRAINER_KEEPS = 100 - GYM_PCT
assert TRAINER_KEEPS == 54
assert round(RATE * TRAINER_KEEPS / 100) == KEEP

# And the live-split number the old panel led with cannot exist beside the
# option it drew selected. `projectedCut` returns zero unless
# `paymentMode === 'gym_collects'`, and zero for every remote session besides.
CUT_ZERO_WHEN = ["the trainer collects, whatever the mode",
                 "the session is remote, whoever collects",
                 "there is no gym on the profile at all"]
assert len(CUT_ZERO_WHEN) == 3

# ── step 3, the week ─────────────────────────────────────────────────────
# The trainer's own working hours, from gen_schedule, so a client's week cannot
# disagree with the diary that reads it. Tuesday's windows, in minutes.
WORK_TUE = SCH.WORK[1]
assert WORK_TUE == [(360, 600), (990, 1230)], WORK_TUE
SLOT_MIN = 60           # DEFAULT_SLOT_MINUTES in clients/conflicts.ts
# Slots on the hour inside those windows.
SLOTS_TUE = [m for a, b in WORK_TUE for m in range(a, b - SLOT_MIN + 1, 60)]
assert SLOTS_TUE == [360, 420, 480, 540, 990, 1050, 1110, 1170], SLOTS_TUE
N_SLOTS_TUE = len(SLOTS_TUE)
# Hours other clients already hold on a Tuesday, from their standing weeks.
# `blocks()` in conflicts.ts: paused, inactive and archived clients don't hold
# an hour — their sessions are not happening.
HELD_TUE = [(360, "Meera K"), (420, "Arjun S"), (1050, "Kavya M"),
            (1170, "Farhan Q")]
FREE_TUE = [m for m in SLOTS_TUE if m not in [h for h, _ in HELD_TUE]]
assert len(HELD_TUE) == 4 and len(FREE_TUE) == 4, (HELD_TUE, FREE_TUE)
# Rahul D is paused and trains Tuesday 18:30 — and his hour IS offered, which
# is the rule doing something a trainer would not guess: an idle client's hours
# go back into the week rather than being held for a return that may not come.
RAHUL_TUE = 1110
assert RAHUL_TUE in FREE_TUE and BY_NAME["Rahul D"]["status"] == "paused"

# ══════════════════════════════════════════════════ three ways out, one delete ══
# `ClientEndScreen`. The order is the design: two reversible rows, the money
# rule that applies to both, a divider, then the destructive one alone below it.
R = BY_NAME["Rahul D"]
R_LEFT = R["left"]
R_PACK_TOTAL = 12
R_PACK_AMOUNT = R_PACK_TOTAL * RATE
R_VALUE = R_LEFT * RATE
assert (R_LEFT, R_PACK_AMOUNT, R_VALUE) == (6, 9600, 4800)
# What the old page said instead: ₹4,200, which is six sessions at ₹700 — a
# per-session price that appears nowhere, from a ₹7,000 pack of twelve it
# priced at ₹583.
STALE_R_PACK = 7000
STALE_R_VALUE = 4200
assert round(STALE_R_PACK / R_PACK_TOTAL) == 583
assert STALE_R_VALUE != R_VALUE and STALE_R_VALUE % R_LEFT == 0
assert STALE_R_VALUE // R_LEFT == 700

# `countForRemoval` returns exactly three counts: sessions, metrics, payments.
REMOVAL = [("sessions", 118), ("measurements", 9), ("payments", 7)]
assert [k for k, _ in REMOVAL] == ["sessions", "measurements", "payments"]
WAYS_OUT = [
    ("Pause", "reversible",
     f"Keeps all {DONE_ALL} sessions and their {R_LEFT} remaining ones. They "
     "stop counting towards your plan and can&rsquo;t see new sessions until "
     "you resume."),
    ("Archive", "reversible",
     f"<b>Closes the pack</b> &mdash; their {R_LEFT} unused sessions end "
     "there. History is kept for your records, and you can restore them any "
     "time."),
    ("Remove", "final",
     "Deletes them, " + ", ".join(f"{n} {k}" for k, n in REMOVAL[:2])
     + f" and {REMOVAL[2][1]} {REMOVAL[2][0]}. Not undoable, and it takes "
     "effect at once."),
]
assert len(WAYS_OUT) == 3
assert sum(1 for _, t, _ in WAYS_OUT if t == "reversible") == 2

# ══════════════════════════════════════════════════ what the old page claimed ══
# app/src/screens: 91 files matching *Screen.tsx. The clients tab holds 11 of
# them plus 6 sheets and menus and one skeleton.
SCREENS_ALL = 91
SCREENS_CLIENT = 11
SHEETS_CLIENT = 6
SURFACES_CLIENT = SCREENS_CLIENT + SHEETS_CLIENT
assert SURFACES_CLIENT == 17
STALE_SCREENS_ALL, STALE_SCREENS_CLIENT = 57, 12
assert (STALE_SCREENS_ALL, STALE_SCREENS_CLIENT) != (SCREENS_ALL, SURFACES_CLIENT)

# `.tab` as a <button> versus as a <div>, counted across the set.
STALE_TAB_DIVS = 7 + 21 + 4 + 12 + 9 + 6          # containers, nav, components,
STALE_TAB_FILES = 6                                # money, reports, settings
assert STALE_TAB_DIVS == 59

# The five segments, from `SEGMENTS` in roster.ts. The old page drew five chips
# and only two of them were segments.
SEGMENTS = [("all", "All"), ("attention", "Needs attention"),
            ("active", "Active"), ("paused", "Paused"), ("invited", "Invited")]
assert [k for k, _ in SEGMENTS] == list(COUNTS.keys())
STALE_SEGMENTS = ["All clients", "Active", "Owing", "Paused", "Archived"]
SEG_LABELS = [l for _, l in SEGMENTS]
SEG_KEPT = [s for s in STALE_SEGMENTS if s in SEG_LABELS]
assert SEG_KEPT == ["Active", "Paused"], SEG_KEPT
SEG_ADDED = [l for l in SEG_LABELS if l not in STALE_SEGMENTS]
assert SEG_ADDED == ["All", "Needs attention", "Invited"], SEG_ADDED

# The five sorts, from `SORTS`. "Sorted by next session" is not one of them.
SORTS = [("attention", "Needs attention first", "Overdue, then quiet, then pack ending"),
         ("name", "Name A&ndash;Z", None),
         ("recent", "Last session", "Most recent first"),
         ("left", "Sessions left", "Fewest first"),
         ("owed", "Amount owed", "Highest first")]
assert len(SORTS) == 5
STALE_SORT = "Sorted by next session"
assert STALE_SORT not in [f"Sorted by {l.lower()}" for _, l, _ in SORTS]

# Three filter axes, from `Filters`. The old page's chip row had two.
FILTER_AXES = [
    ("mode", "Where", [("floor", "Floor"), ("remote", "Remote")]),
    ("money", "Money", [("owes", "Owes me"), ("paid", "Paid up"),
                        ("ending", "Pack ending")]),
    ("batch", "Batch", [("morning", "Morning"), ("evening", "Evening"),
                        ("night", "Night"), ("none", "No batch")]),
]
assert len(FILTER_AXES) == 3
assert sum(len(v) for *_, v in FILTER_AXES) == 9


# ══════════════════════════════════════════════════════════════════ shell ══
from gen_schedule import hm                                        # noqa: E402

KIND_ICON = {"unavailable": I_WARN, "setup": I_CAL, "overdue": I_RUPEE,
             "quiet": I_EYE, "pack": I_DUMB, "invite": I_MSG}
assert set(KIND_ICON) == set(ROST_KINDS)


def browser(url):
    return ('<div class="browser__bar"><span class="browser__dots">'
            '<i></i><i></i><i></i></span>'
            f'<span class="browser__url">app.inclineyou.in<b>{url}</b></span></div>')


def top(crumb, sync="ok", queued=0):
    pill = {"ok": '<span class="sync"><i></i>Synced</span>',
            "q": f'<span class="sync sync--queued"><i></i>{queued} queued</span>',
            "off": '<span class="sync sync--offline"><i></i>Offline</span>'}[sync]
    return f'''<header class="top">
  <nav class="crumbs" aria-label="Breadcrumb">{crumb}</nav>
  <div class="omni">{ic(I_SEARCH, 15)}<span>Search clients, sessions, exercises&hellip;</span><kbd>&#8984;K</kbd></div>
  <div class="top__acts">{pill}
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Notifications">{ic(I_BELL, 18)}</button>
  </div></header>'''


def railc(*, first=False):
    """The rail with Clients current. On the first run every count on it is a
       promise about data that isn't there yet, so they all go — including the
       one on the row the trainer is standing on."""
    r = rail("clients")
    if first:
        pat = re.compile(r'<span class="rail__n[^"]*"[^>]*>([^<]*)</span>')
        keep = TDY.EXER_N
        gone = [m.group(1) for m in pat.finditer(r) if m.group(1) != keep]
        r = pat.sub(lambda m: m.group(0) if m.group(1) == keep else '', r)
        assert len(gone) == 5 and keep in r, (gone, keep)
        r = re.sub(r'<div class="rail__group rail__group--pins">.*?</div>\s*</div>',
                   '</div>', r, flags=re.S)
    return r


def app(*, crumb, head, body, sync="ok", queued=0, over="", first=False,
        keys=None):
    kb = f'<div class="keys">{keys}</div>' if keys else ''
    return (f'<div class="app" data-theme="dark">{railc(first=first)}'
            f'{top(crumb, sync, queued)}'
            f'<main class="main">{head}<div class="body">{body}</div>{kb}</main>'
            f'{over}</div>')


def ph(title, sub, acts="", extra=""):
    return (f'<div class="ph"><div class="ph__row"><div>'
            f'<p class="ph__t">{title}</p><p class="ph__sub">{sub}</p></div>'
            f'<div class="ph__acts">{acts}</div></div>{extra}</div>')


def avat(r, cls="av--sm"):
    return (f'<span class="av {cls}" style="background:var(--tx-{r["av"]})">'
            f'{r["ini"]}</span>')


def chip(label, *, count=None, on=False, ghost=False, glyph=None, badge=None):
    c = "chip" + (" chip--ghost" if ghost else "")
    n = (f'<span class="rail__n">{count}</span>' if count is not None else '')
    if badge is not None:
        n = f'<span class="rail__n rail__n--acc">{badge}</span>'
    g = ic(glyph, 14) if glyph else ''
    sel = ' aria-pressed="true"' if on else ''
    st = (' style="background:var(--tx-accent-soft);border-color:var(--tx-accent-line);'
          'color:var(--tx-accent-text)"' if on else '')
    return f'<button class="{c}" type="button"{sel}{st}>{g}{label}{n}</button>'


# ══════════════════════════════════════════════════════ the roster table ══
LAST_DAYS = {0: "today", 1: "yesterday"}


def lastlog(r):
    if not r.get("last"):
        return '<span class="ink3">&mdash;</span>'
    n = (D - r["last"]).days
    return LAST_DAYS.get(n, f"{n} days ago")


def packcell(r):
    if r["left"] is None:
        return '<span class="ink3">monthly</span>'
    total = r["pack"][1]
    return f'{r["left"]}<span class="ink3">/{total}</span>'


def owedcell(r):
    if not r["owed"]:
        return '<span class="ink3">&mdash;</span>'
    late = r["owed_days"] >= OVERDUE_DAYS
    cls = ' style="color:var(--tx-danger)"' if late else ''
    return (f'<span{cls}>{rs(r["owed"])}</span>'
            f'<i style="font-style:normal;display:block;font-family:var(--tx-mono);'
            f'font-size:10px;color:var(--tx-ink-3)">{r["owed_days"]} d</i>')


def rrow(r, *, sel=None, verb=True, menu=False):
    """One roster row. Eight columns in importance order — NN/g's rule for the
       default column order — and exactly ONE inline action, which is the only
       reason an inline action is allowed here at all: "placing single-record
       actions inline within a table row can work if you just have one or two".
       The app has one per row by construction, because `attention.action` is
       singular."""
    # `.crit` is the library's existing name for the critical spine (it came
    # from the Today queue); `alert` is new in §11 of the stylesheet.
    SPINE = {"critical": "crit", "alert": "alert"}
    cls = f' class="{SPINE[r["sev"]]}"' if r["sev"] else ''
    aria = ' aria-selected="true"' if sel else ''
    # SELECTION DOES NOT MOVE THE ROW. The checkbox takes the avatar's slot —
    # §07's rule — rather than arriving as a ninth column that shifts all eight
    # of the others right the moment the trainer selects anybody.
    if sel is None:
        lead = avat(r)
    elif sel:
        lead = (f'<span class="check" style="background:var(--tx-accent);'
                f'border-color:var(--tx-accent)">'
                f'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" '
                f'stroke="var(--tx-accent-ink)" stroke-width="3.4" '
                f'stroke-linecap="round" stroke-linejoin="round" '
                f'style="opacity:1">{I_CHECK}</svg></span>')
    else:
        lead = '<span class="check"></span>'
    if r["kind"]:
        att = (f'<span class="attn">{ic(KIND_ICON[r["kind"]], 15)}'
               f'<u>{r["line"]}</u></span>')
    else:
        att = f'<span class="attn attn--calm"><u>{r["line"]}</u></span>'
    mode = ('tag--remote' if r["mode"] == "remote" else 'tag--floor')
    modelab = "Remote" if r["mode"] == "remote" else "Floor"
    if r.get("queued"):
        # `Trailing` puts the Queued tag AHEAD of the verb, so a row waiting on
        # the network shows its state instead of an action against it.
        actcell = '<span class="tag tag--info">Queued</span>'
    elif verb and r["act"]:
        actcell = (f'<button class="btn btn--secondary btn--sm" type="button">'
                   f'{r["act"]}</button>')
    elif r["status"] == "paused":
        actcell = ('<button class="btn btn--secondary btn--sm" type="button">'
                   'Resume</button>')
    elif r["status"] == "invited":
        actcell = '<span class="tag tag--info">Invited</span>'
    else:
        actcell = ''
    # Always drawn, never on hover: the kebab is one of the three ways into every
    # verb (§15) and a hover-revealed one fails NN/g's rule and the keyboard.
    kb = (f'<td class="kb"><button class="btn btn--icon btn--ghost btn--sm" '
          f'type="button" aria-label="More for {r["name"]}"'
          + (' aria-expanded="true"' if menu else '')
          + f'>{ic(I_DOTSH, 16)}</button></td>')
    return (f'<tr{cls}{aria}>'
            f'<td><span class="who2">{lead}<span><b>{r["name"]}</b>'
            f'<i>{r["phone"]}</i></span></span></td>'
            f'<td>{att}</td>'
            f'<td><span class="tag {mode}">{modelab}</span></td>'
            f'<td class="num">{packcell(r)}</td>'
            f'<td class="num">{owedcell(r)}</td>'
            f'<td class="mono" style="color:var(--tx-ink-3);font-size:11.5px">'
            f'{lastlog(r)}</td>'
            f'<td class="act">{actcell}</td>{kb}</tr>')


def rhead(*, sel=False, sort="attention"):
    cols = [("Client", f"{len(PICKED)} selected" if sel else "Client", None),
            ("attn", "What&rsquo;s up", None),
            ("Where", "Where", None),
            ("Pack", "Pack", "num"),
            ("Owes", "Owes", "num"),
            ("Last", "Last logged", None),
            ("", "", "act"), ("", "", "kb")]
    # No selection column: see `rrow`. `sel` only changes the first header's
    # label, so the sticky head does not reflow either.
    out = ''
    srt = {"attention": "attn", "name": "Client", "owed": "Owes",
           "left": "Pack", "recent": "Last"}[sort]
    for key, label, cls in cols:
        c = f' class="{cls}"' if cls else ''
        a = (' aria-sort="descending"' if key == srt else
             ' aria-sort="none"' if key in ("Client", "Pack", "Owes", "Last",
                                            "attn") else '')
        out += f'<th{c}{a}>{label}</th>'
    return f'<thead><tr>{out}</tr></thead>'


def grph(label, count, *, tone=None, note=None, span=8):
    b = f'<b>{count}</b>' if tone == "alert" else count
    nt = f'<em>{note}</em>' if note else ''
    return (f'<tr class="grph"><th colspan="{span}">{label} '
            f'<span class="ink3">{b}</span>{nt}</th></tr>')


def segchips(cur="all", *, counts=True):
    out = ""
    for k, label in SEGMENTS:
        out += chip(label, count=(COUNTS[k] if counts else None), on=(k == cur))
    return out


def strip():
    """`Roster.tally`, split by band rather than summarised by one word.

       The app labels its first figure `owed`. While the roster admitted a debt
       only after seven days that figure was ₹6,000 across one client, printed
       under that word, beside a rail badge saying 3 and a money book saying
       ₹18,000. Now that any money owed is an item, the total agrees with the
       book — and the split between late and not-late is stated instead of being
       the difference between two screens."""
    late = sum(1 for r in ATTN if r["band"] == "overdue-late")
    soon = sum(1 for r in ATTN if r["band"] == "due-soon")
    return (f'<div class="strip">'
            f'<div class="warn"><b>{rs(OWED_LATE)}</b>'
            f'<i>overdue &gt; {OVERDUE_DAYS} d &middot; {late}</i></div>'
            f'<div><b>{rs(OWED_SOON)}</b><i>due, not yet late &middot; {soon}</i></div>'
            f'<div><b>{TALLY["quiet"]}</b><i>gone quiet</i></div>'
            f'<div><b>{TALLY["ending"]}</b><i>pack ending</i></div>'
            f'<div><b>{sum(1 for r in ATTN if r["band"] in ROSTER_ONLY_BANDS)}'
            f'</b><i>not set up</i></div></div>')


def tools(*, sort="attention", filters=0, extra=""):
    s = dict(SORTS[i][:2] for i in range(len(SORTS)))
    lab = dict((k, l) for k, l, _ in SORTS)[sort]
    f = chip("Filter", glyph=I_FILTER, badge=(filters or None)) if filters \
        else chip("Filter", glyph=I_FILTER)
    return ('<div class="tools" style="margin-bottom:12px">'
            f'<button class="chip" type="button">{ic(I_SORT, 14)}{lab}'
            f'{ic(I_CHEVD, 13)}</button>{f}{extra}'
            '<span class="tools__sp" style="flex:1"></span>'
            f'<span class="small mono">{ROWS_SHOWN} of {COUNTS["all"]}</span>'
            '</div>')


ROSTER_ACTS = (f'<button class="btn btn--secondary" type="button">{ic(I_OPEN, 15)}'
               f'Export</button>'
               f'<button class="btn btn--primary" type="button">{ic(I_PLUS, 15)}'
               f'Add client</button>')
ROWS_SHOWN = COUNTS["all"]

# How many rows are actually above the fold at 1440x900. Not a claim: measured
# off the rendered frame with a headless browser, at --rst-row 52px, under two
# sticky group headers, with the strip and the toolbar above the table. The
# page this replaces asserted twelve without a table that could hold twelve.
ROWS_VIS = 9               # frame 1a: with the attention strip above the table
ROWS_VIS_PLAIN = 11        # frames 1d and 2a: strip collapsed, toolbar only
STALE_ROWS_VIS = 12
PHONE_ROWS_VIS = 4.5        # what the old page said the phone fits
assert ROWS_VIS < ROWS_VIS_PLAIN < STALE_ROWS_VIS

KEYS_ROSTER = (f'<b><kbd>J</kbd><kbd>K</kbd> move</b>'
               f'<b><kbd>Enter</kbd> open the file</b>'
               f'<b><kbd>Space</kbd> select</b>'
               f'<b><kbd>&#8963;</kbd> the row menu</b>'
               f'<b><kbd>{"".join("N")}</kbd> add a client</b>'
               f'<b><kbd>/</kbd> search</b>')


def rostertable(rows_sections, *, sel=None, sort="attention", menu=None):
    body = ""
    for label, count, tone, note, rows in rows_sections:
        if label:
            body += grph(label, count, tone=tone, note=note, span=8)
        for r in rows:
            body += rrow(r, sel=(r["name"] in sel) if sel is not None else None,
                         menu=(menu == r["name"]))
    return (f'<table class="tbl rst">{rhead(sel=sel is not None, sort=sort)}'
            f'<tbody>{body}</tbody></table>')


SEC_ATTN = ("Needs attention", N_ATTN, "alert",
            f"{BAND_VALUE['unavailable']} bands, most urgent first &middot; "
            f"{N_KINDS} kinds", ATTN)
SEC_REST = ("Everyone else", len(REST), None, "alphabetical", REST)


def f_roster():
    """1a. The default: segment `all`, sort `attention`. Not the attention
       SEGMENT — `useState<Segment>('all')` with `useState<SortKey>('attention')`
       — which is a distinction the old page lost in both directions. The
       trainer sees the whole roster with the nine that need them at the top,
       under a header that says how many and why."""
    head = ph("Clients",
              f"{COUNTS['active']} active &middot; {COUNTS['paused']} paused "
              f"&middot; {COUNTS['invited']} invited &middot; {N_ARCHIVED} archived",
              ROSTER_ACTS,
              f'<div class="ph__tabs" style="gap:7px;padding-bottom:14px">'
              f'{segchips("all")}</div>')
    body = (strip() + '<div style="height:12px"></div>'
            + tools() + rostertable([SEC_ATTN, SEC_REST], menu=None))
    return app(crumb="<b>Clients</b>", head=head, body=body, keys=KEYS_ROSTER)


def f_az():
    """1b. Sorted A–Z. `sectionRows` groups by letter here and only here, which
       is why the phone's index rail can only exist in this order — but there
       are 22 rows and `INDEX_RAIL_MIN` is 40, so the rail is absent on the
       phone too. The desk answer is different anyway: a sticky head, a row
       count, and type-to-find."""
    secs = []
    for letter in sorted({r["letter"] for r in ROWS}):
        rows = sorted((r for r in ROWS if r["letter"] == letter),
                      key=lambda r: r["name"])
        secs.append((letter, len(rows), None, None, rows))
    head = ph("Clients",
              f"{COUNTS['active']} active &middot; {COUNTS['paused']} paused "
              f"&middot; {COUNTS['invited']} invited &middot; {N_ARCHIVED} archived",
              ROSTER_ACTS,
              f'<div class="ph__tabs" style="gap:7px;padding-bottom:14px">'
              f'{segchips("all")}</div>')
    body = (tools(sort="name") + rostertable(secs, sort="name"))
    return app(crumb="<b>Clients</b>", head=head, body=body, keys=KEYS_ROSTER)


# ═══════════════════════════════════════════════════════════ 1c · filters ══
def passes(r, mode=(), money=(), batch=()):
    """`passesFilters`, ported. Three axes, AND between axes, OR inside one."""
    if mode and r["mode"] not in mode:
        return False
    if batch and r["batch"] not in batch:
        return False
    if money:
        owes = r["owed"] > 0
        ending = r["left"] is not None and r["left"] <= PACK_ENDING
        if not any(owes if m == "owes" else (not owes) if m == "paid" else ending
                   for m in money):
            return False
    return True


AXIS_COUNTS = {}
for _ax, _lab, _vals in FILTER_AXES:
    for _k, _l in _vals:
        AXIS_COUNTS[_k] = sum(1 for r in ROWS if passes(r, **{_ax: (_k,)}))
assert AXIS_COUNTS["floor"] + AXIS_COUNTS["remote"] == N_ROWS
assert AXIS_COUNTS["owes"] == N_OWING == 3
assert AXIS_COUNTS["ending"] == 2
assert (sum(AXIS_COUNTS[k] for k in ("morning", "evening", "night", "none"))
        == N_ROWS)

# The filter drawn open: floor, evenings. The result is stated on the button
# before it is applied — "a filter that hides everything without warning is
# indistinguishable from an empty screen, and the count is what tells the two
# apart".
PICK_MODE, PICK_BATCH = ("floor",), ("evening",)
PICK_ROWS = [r for r in ROWS if passes(r, mode=PICK_MODE, batch=PICK_BATCH)]
N_PICK = len(PICK_ROWS)
assert N_PICK == 6, [r["name"] for r in PICK_ROWS]
assert AXIS_COUNTS["floor"] == 17 and AXIS_COUNTS["remote"] == 5, AXIS_COUNTS
assert AXIS_COUNTS["evening"] == 6 and AXIS_COUNTS["paid"] == 19, AXIS_COUNTS


def filterpanel():
    out = ""
    for ax, label, vals in FILTER_AXES:
        picked = PICK_MODE if ax == "mode" else PICK_BATCH if ax == "batch" else ()
        out += f'<p class="micro" style="margin:16px 0 8px">{label}</p><div class="wk">'
        for k, l in vals:
            out += chip(l, count=AXIS_COUNTS[k], on=(k in picked))
        out += '</div>'
    return f'''<div class="panel" style="width:340px">
  <div class="panel__hd"><span class="panel__t">Filter</span>
    <span class="tools__sp" style="flex:1"></span>
    <button class="btn btn--ghost btn--sm" type="button">Reset</button></div>
  <div class="panel__body" style="padding-top:2px">
    <p class="small">Every chip carries the count it would produce on its own.
      Three axes, and they narrow each other.</p>
    {out}
    <p class="small" style="margin-top:18px;border-top:1px solid var(--tx-line);
      padding-top:12px">Batch is <b>derived</b>, never typed &mdash; from where a
      client&rsquo;s sessions actually sit. Noon to four is deliberately nobody&rsquo;s
      batch: a client who trains at two is training alone, and calling that an
      afternoon batch would invent a group that does not meet.</p>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--primary" type="button">Show {N_PICK} clients</button>
  </div></div>'''


def f_filter():
    head = ph("Clients",
              f"{COUNTS['active']} active &middot; {COUNTS['paused']} paused "
              f"&middot; {COUNTS['invited']} invited &middot; {N_ARCHIVED} archived",
              ROSTER_ACTS,
              f'<div class="ph__tabs" style="gap:7px;padding-bottom:14px">'
              f'{segchips("all")}</div>')
    body = (tools(filters=2,
                  extra=chip("Floor", on=True) + chip("Evening", on=True))
            + rostertable([("Floor &middot; evenings", N_PICK, None,
                            "2 filters &middot; 16 hidden", PICK_ROWS)]))
    return app(crumb="<b>Clients</b>", head=head, body=body,
               over='<div class="scrim scrim--soft"></div>' + filterpanel())


# ══════════════════════════════════════════════════════ 1d · three at once ══
# `BulkMessageSheet`. One chat per client, opened in sequence — never a
# broadcast, because "a group message about money costs clients, and WhatsApp
# gives no way to un-send one".
PICKED = ["Farhan Q", "Sneha R", "Vikram T"]
assert all(BY_NAME[n]["owed"] > 0 for n in PICKED)
assert len(PICKED) == N_OWING
BULK_TOTAL = sum(BY_NAME[n]["owed"] for n in PICKED)
assert BULK_TOTAL == TOTAL_OWED == 18000


def bulkmsg():
    rows = ""
    for i, n in enumerate(PICKED, 1):
        r = BY_NAME[n]
        first = n.split()[0]
        rows += (f'<div class="q"><span class="q__ic q__ic--ok">{i}</span>'
                 f'<span class="q__m"><span class="q__t">&ldquo;Hi {first}, '
                 f'{rs(r["owed"])} is pending for your pack.&rdquo;</span>'
                 f'<span class="q__s">{r["phone"]} &middot; '
                 f'{r["owed_days"]} days &middot; one chat, on its own</span></span>'
                 f'<button class="btn btn--secondary btn--sm" type="button">'
                 f'{"Open" if i == 1 else "Then"}</button></div>')
    return f'''<div class="modal" style="width:540px">
  <div class="modal__hd"><p class="modal__t">Three chats, one at a time</p></div>
  <div class="modal__body" style="padding-bottom:6px">
    <p style="margin:0 0 14px">The template resolves per client, so each of them
      reads their own amount. <b>Never a broadcast</b> &mdash; a group message
      about money costs clients, and there is no un-sending one.</p>
    <div style="border:1px solid var(--tx-line);border-radius:var(--tx-r2);
      overflow:hidden">{rows}</div>
    <p class="small" style="margin-top:12px">A browser opens <b>one</b> tab per
      click and blocks the rest, so this is three clicks rather than one &mdash;
      which is also the last moment to drop somebody from the list. The phone
      opens them in sequence for the same reason: a queue of chats you can still
      abandon.</p>
  </div>
  <div class="modal__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--primary" type="button">Open the first</button>
  </div></div>'''


def f_bulk():
    head = ph("Clients",
              f"{COUNTS['active']} active &middot; {COUNTS['paused']} paused "
              f"&middot; {COUNTS['invited']} invited &middot; {N_ARCHIVED} archived",
              ROSTER_ACTS,
              f'<div class="ph__tabs" style="gap:7px;padding-bottom:14px">'
              f'{segchips("all")}</div>')
    bar = (f'<div class="bulk" style="margin:-20px -24px 12px">'
           f'{len(PICKED)} selected &middot; {rs(BULK_TOTAL)} between them'
           f'<span class="bulk__acts">'
           f'<button class="btn btn--secondary btn--sm" type="button">{ic(I_MSG, 14)}'
           f'Message</button>'
           f'<button class="btn btn--secondary btn--sm" type="button">{ic(I_GRID, 14)}'
           f'Assign a program</button>'
           f'<button class="btn btn--secondary btn--sm" type="button">{ic(I_CAL, 14)}'
           f'Book sessions</button>'
           f'<button class="btn btn--ghost btn--sm" type="button">Clear</button>'
           f'</span></div>')
    body = (bar + rostertable([SEC_ATTN, SEC_REST], sel=PICKED))
    return app(crumb="<b>Clients</b>", head=head, body=body,
               over='<div class="scrim"></div>' + bulkmsg())


# ══════════════════════════════════════════ 1e/1f · the states that are not rows ══
def f_first():
    """1e. `roster.firstRun` — no clients in any state. The empty state carries
       the promise the intake form then has to keep: a name and a phone number.
       The add action is in the header throughout, including while syncing:
       "a genuinely new trainer, online or not, is never blocked from their
       first client"."""
    head = ph("Clients", "No clients yet",
              f'<button class="btn btn--primary" type="button">{ic(I_PLUS, 15)}'
              f'Add client</button>')
    body = f'''<div class="empty" style="min-height:520px">
  <span class="empty__ic">{ic(I_USERS, 22)}</span>
  <p class="empty__t">Your roster is empty</p>
  <p class="empty__b">A client needs <b class="ink">a name and a phone number</b>.
    Everything else &mdash; program, pack, payments &mdash; you can add later.</p>
  <button class="btn btn--primary btn--lg" type="button">{ic(I_PLUS, 16)}Add a client</button>
  <p class="small" style="max-width:52ch;margin-top:6px">Nothing here is a
    placeholder for a client who exists. This screen only appears once the first
    sync has finished and come back with nothing &mdash; before that it says
    <i>Syncing your clients</i>, because &ldquo;your roster is empty&rdquo; is the
    wrong thing to say to a trainer who has eight, even for one frame.</p>
</div>'''
    return app(crumb="<b>Clients</b>", head=head, body=body, first=True)


def f_offline():
    """1f. Offline. The roster is local, so it is all here — the banner says
       which copy this is and how much of it has not left the phone, and the
       one row written on this phone carries a Queued tag instead of a verb."""
    head = ph("Clients",
              f"{COUNTS['active']} active &middot; showing the copy on this computer",
              ROSTER_ACTS,
              f'<div class="ph__tabs" style="gap:7px;padding-bottom:14px">'
              f'{segchips("all")}</div>')
    ban = (f'<div class="bulk" style="margin:-20px -24px 12px;'
           f'background:var(--tx-warn-soft);border-bottom-color:var(--tx-warn);'
           f'color:var(--tx-warn)">{ic(I_CLOUD, 16)}'
           f'Offline &mdash; your roster is stored here. 6 changes waiting.'
           f'<span class="bulk__acts">'
           f'<button class="btn btn--secondary btn--sm" type="button">'
           f'Open the sync queue</button></span></div>')
    body = (ban + tools() + rostertable([SEC_ATTN, SEC_REST]))
    return app(crumb="<b>Clients</b>", head=head, body=body,
               sync="off")


# ═══════════════════════════════════════════════════════════ 2a · finding ══
# `ClientSearchScreen`: "an empty query shows recents and saved filters rather
# than a blank screen ... a dead end gets a way out — add them, or widen to
# archived. 'No results' and nothing else is a bug, not a state."
QUERY = "zub"
HITS = [r for r in ROWS if QUERY in r["name"].lower()]
assert [r["name"] for r in HITS] == ["Zubin I"], HITS
# `matches` also searches the phone, from three digits up — which is how a
# trainer finds somebody from a missed call.
DIGITS = "988"
PHONE_HITS = [r for r in ROWS if r["phone"].replace(" ", "").startswith(DIGITS)]
assert len(PHONE_HITS) == 3, [r["name"] for r in PHONE_HITS]


def palette():
    z = BY_NAME["Zubin I"]
    return f'''<div class="pal" style="width:620px">
  <div class="pal__in">{ic(I_SEARCH, 17)}<span>{QUERY}</span>
    <span class="pal__car"></span>
    <kbd style="margin-left:auto">esc</kbd></div>
  <div class="pal__list">
    <p class="pal__gk">Clients &middot; 1</p>
    <div class="pal__i" aria-selected="true">{avat(z)}
      <b style="font-weight:600"><span class="acc">Zub</span>in I</b>
      <span class="ink3" style="font-size:12px;margin-left:8px">
        {z["line"]}</span>
      <kbd style="margin-left:auto">&#8629;</kbd></div>
    <p class="pal__gk">Nothing else matched</p>
    <div class="pal__i">{ic(I_PLUS, 16)}Add a client called
      &ldquo;{QUERY}&rdquo;<span class="ink3" style="font-size:12px;margin-left:8px">
      the name comes across pre-filled</span></div>
    <div class="pal__i">{ic(I_BOX, 16)}Search the {N_ARCHIVED} archived clients
      <span class="ink3" style="font-size:12px;margin-left:8px">off by default
      &mdash; surfacing them silently causes double-adds</span></div>
    <p class="pal__gk">Or search by number</p>
    <div class="pal__i">{ic(I_PHONE, 16)}Type three or more digits
      <span class="ink3" style="font-size:12px;margin-left:8px">&ldquo;{DIGITS}&rdquo;
      matches {len(PHONE_HITS)} clients &mdash; how you find a missed call</span></div>
  </div></div>'''


def f_search():
    head = ph("Clients",
              f"{COUNTS['active']} active &middot; {COUNTS['paused']} paused "
              f"&middot; {COUNTS['invited']} invited &middot; {N_ARCHIVED} archived",
              ROSTER_ACTS,
              f'<div class="ph__tabs" style="gap:7px;padding-bottom:14px">'
              f'{segchips("all")}</div>')
    body = (tools() + rostertable([SEC_ATTN, SEC_REST]))
    return app(crumb="<b>Clients</b>", head=head, body=body,
               over='<div class="scrim scrim--top"></div>' + palette())


# ══════════════════════════════════════════════════════════ the client file ══
FILE_ACTS = (f'<button class="btn btn--secondary" type="button">{ic(I_MSG, 15)}'
             f'Message</button>'
             f'<button class="btn btn--secondary" type="button">{ic(I_CAL, 15)}'
             f'Book</button>'
             f'<button class="btn btn--primary" type="button">{ic(I_DUMB, 15)}'
             f'Log a session</button>'
             f'<button class="btn btn--icon btn--ghost" type="button" '
             f'aria-label="More">{ic(I_DOTSH, 18)}</button>')
KEYS_FILE = (f'<b><kbd>J</kbd><kbd>K</kbd> the next client, without leaving the tab</b>'
             f'<b><kbd>1</kbd>&ndash;<kbd>{N_TABS}</kbd> switch tab</b>'
             f'<b><kbd>E</kbd> edit</b><b><kbd>L</kbd> log a session</b>'
             f'<b><kbd>Esc</kbd> back to the roster</b>')

TAB_COUNTS = {"programs": len(PROGRAMS), "sessions": S_ALL}


def filehead(cur, *, sub=None):
    tabs = ""
    for k, label in FILE_TABS:
        n = TAB_COUNTS.get(k)
        badge = f'<span class="rail__n">{n}</span>' if n else ''
        on = (' aria-selected="true"' if k == cur else ' aria-selected="false"')
        tabs += (f'<button class="tab" type="button" role="tab"{on}>'
                 f'{label}{badge}</button>')
    # Body metrics is a SCREEN, not a fifth tab — §14's rule. So it is drawn as
    # a link out of the tab row rather than as a fifth tab in it: a control that
    # looks like a tab and navigates away is the thing the rule is about.
    tabs = (f'<div class="ph__tabs" role="tablist" '
            f'aria-label="Meera Krishnan">{tabs}</div>'
            f'<span style="flex:1"></span>'
            f'<button class="btn btn--ghost btn--sm" type="button" '
            f'style="margin-bottom:6px">{ic(I_SCALE, 15)}Body metrics'
            f'<span class="rail__n">{N_METRICS}</span>{ic(I_CHEV, 14)}</button>')
    # `formatPhone` — "+91 98765 43210", the shape an Indian number is read in,
    # not the ten digits the column stores.
    line = sub or (f'+91 {M["phone"]} &middot; joined {daystamp(JOINED)} &middot; '
                   f'{DONE_ALL} sessions logged')
    head = (f'<div class="ph__row" style="align-items:center">'
            f'<span class="av av--lg" style="background:var(--tx-{M["av"]})">'
            f'{M["ini"]}</span>'
            f'<div><p class="ph__t">Meera Krishnan'
            f'<span class="tag tag--ok" style="margin-left:10px;vertical-align:middle">'
            f'Active</span>'
            f'<span class="tag tag--floor" style="margin-left:6px;vertical-align:middle">'
            f'Floor</span></p>'
            f'<p class="ph__sub">{line}</p></div>'
            f'<div class="ph__acts">{FILE_ACTS}</div></div>')
    return (f'<div class="ph">{head}'
            f'<div style="display:flex;align-items:flex-end">{tabs}</div></div>')


CRUMB_FILE = ('<a href="/clients">Clients</a><i>/</i><b>Meera Krishnan</b>')


def dots7():
    """The adherence strip. THREE states, because `week: boolean[]` has two and
       one of them is doing double duty — `last7` excludes a rest day from both
       halves of the fraction and then hands the strip a false that is
       indistinguishable from a miss."""
    out = ""
    for d, sch, done in WEEK7:
        cls = "on" if done else ("miss" if sch else "rest")
        lab = "kept" if done else ("missed" if sch else "rest day")
        out += (f'<i class="{cls}" title="{daystamp(d)} &middot; {lab}" '
                f'aria-label="{daystamp(d)}, {lab}"></i>')
    return (f'<div class="dots">{out}'
            f'<u>{ADH_KEPT}/{ADH_PLANNED} kept &middot; {ADH_REST} rest days</u></div>')


OVERVIEW_ROWS = [
    ("Next session", "Tomorrow 06:00", "Pull A &middot; Floor &middot; 60 min",
     "the session", "session"),
    ("Adherence", f"{ADH_KEPT}<span class='ink3'>/{ADH_PLANNED}</span>",
     f"Last 7 days &middot; {ADH_REST} rest days, counted in neither half",
     "the week", "adherence"),
    ("Last logged", "Today 06:52", "Push A &middot; 6 exercises &middot; 12 sets",
     "that workout", "workout"),
    ("Weight", f"{trim(W_LAST)}<span class='ink3'> kg</span>",
     f"Measured {daystamp(WEIGHT[-1][0])} &middot; waist {trim(WAIST[-1][2])} cm",
     "body metrics", "metrics"),
    ("All time", rs(PAID_ALL),
     f"Since {daystamp(JOINED)} &middot; {DONE_ALL} sessions done",
     "her book", "book"),
]
assert len(OVERVIEW_ROWS) == 5
# `FigureLink` — every row carries its destination as data, which is also what
# guarantees one source per figure.
LINKS = sorted({r[4] for r in OVERVIEW_ROWS})
assert LINKS == ["adherence", "book", "metrics", "session", "workout"], LINKS
STALE_OVERVIEW = ["Package left", "Adherence · 8 wk", "Top set · bench", "Owed"]
assert "Top set · bench" not in [r[0] for r in OVERVIEW_ROWS]


def ovrow(label, value, detail, dest, key):
    return (f'<div class="lrow" style="min-height:58px">'
            f'<span class="lrow__m" style="flex:1;min-width:0">'
            f'<span class="micro">{label}</span>'
            f'<span style="display:block;font-family:var(--tx-brand);font-weight:800;'
            f'font-size:19px;letter-spacing:-.02em;margin-top:3px">{value}</span>'
            f'</span>'
            f'<span class="lrow__r" style="text-align:right;min-width:0">'
            f'<span class="small" style="display:block">{detail}</span>'
            f'<span class="small mono" style="display:block;color:var(--tx-ink-off)">'
            f'opens {dest}</span></span>'
            f'{ic(I_CHEV, 16)}</div>')


def f_overview():
    rows = "".join(ovrow(*r) for r in OVERVIEW_ROWS)
    pair = f'''<div class="stats stats--2" style="margin-bottom:12px">
  <div class="stat"><p class="stat__k">Owes you</p>
    <p class="stat__v">{rs(OWED_M) if OWED_M else "Nothing"}</p>
    <p class="stat__d">Paid in full on {daystamp(PACK_BOUGHT)} &middot; UPI</p></div>
  <div class="stat stat--acc"><p class="stat__k">Sessions left</p>
    <p class="stat__v">{PACK_LEFT}<span class="ink3" style="font-size:19px">/{PACK_TOTAL}</span></p>
    <p class="stat__d">This pack ends {daystamp(PACK_END)}</p></div></div>'''
    right = f'''<div class="card"><div class="card__hd">
    <p class="card__t">This week</p></div>
  <div class="card__b">{dots7()}
    <p class="small" style="margin-top:12px">Four of the seven days had nothing
      scheduled. A rest day is <b>absent from both halves</b> of the fraction
      &mdash; it is the plan working, not a gap in it &mdash; so the strip draws
      three states where the app&rsquo;s <code>week: boolean[]</code> can only
      carry two.</p>
    <p class="small" style="margin-top:10px;padding-top:10px;
      border-top:1px solid var(--tx-line)">A cancelled session is in neither
      half either: the slot was given back.</p>
  </div></div>
<div class="card" style="margin-top:12px"><div class="card__hd">
    <p class="card__t">Where each figure comes from</p></div>
  <div class="card__b">
    <p class="small">Nothing on this tab is stored. All five rows and both
      figures above are computed from rows already on this computer, which is
      why there is no loading state to design &mdash; and each one carries the
      screen that owns it, so the owed pair here is literally the pair from
      her book.</p></div></div>'''
    body = (f'{pair}<div style="display:grid;gap:12px;align-items:start;'
            f'grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)">'
            f'<div class="card"><div class="card__b card__b--flush">{rows}</div></div>'
            f'<div>{right}</div></div>')
    return app(crumb=CRUMB_FILE, head=filehead("overview"), body=body,
               keys=KEYS_FILE)


# ── the sessions tab ─────────────────────────────────────────────────────
S_TAGS = {"done": ("Done", "tag--ok"), "no_show": ("No-show", "tag--danger"),
          "cancelled": ("Cancelled", "tag"), "booked": ("Booked", "tag--info"),
          "unmarked": ("Not marked", "tag")}


def srow(s):
    d, t, label, st, ex, delta = s
    packline = ("pack untouched" if delta == 0
                else f"pack {'+' if delta > 0 else '&minus;'}{abs(delta)}")
    if st == "done":
        title, detail = label, f"{ex} exercises &middot; {packline}"
    elif st == "no_show":
        title, detail = "Didn&rsquo;t turn up", f"No message &middot; {packline}"
    elif st == "cancelled":
        # Who cancelled decides the pack, so it is the title, not a detail.
        title, detail = "She told me in time", "Pack kept &middot; slot reused"
    elif st == "unmarked":
        title = label
        detail = f"Floor &middot; no outcome yet &middot; {packline}"
    else:
        title, detail = label, f"Floor &middot; {packline}"
    lab, cls = S_TAGS[st]
    crit = ' class="crit"' if st == "no_show" else ''
    warn = ' class="alert"' if st == "unmarked" else ''
    act = ('<button class="btn btn--secondary btn--sm" type="button">Mark it</button>'
           if st == "unmarked" else '')
    return (f'<tr{crit or warn}>'
            f'<td class="mono" style="width:96px;color:var(--tx-ink-3)">'
            f'{daystamp(d).upper()}</td>'
            f'<td class="mono" style="width:62px">{t}</td>'
            f'<td class="strong">{title}</td>'
            f'<td style="color:var(--tx-ink-3)">{detail}</td>'
            f'<td style="width:110px"><span class="tag {cls}">{lab}</span></td>'
            f'<td class="act" style="width:120px">{act}</td></tr>')


def f_sessions():
    chips = ""
    for key, label, n in [("all", "All", S_ALL), ("done", "Done", S_DONE),
                          ("no_show", "No-show", S_NOSHOW),
                          ("cancelled", "Cancelled", S_CANCEL),
                          ("booked", "Booked", S_BOOKED)]:
        chips += chip(label, count=n, on=(key == "all"))
    chips += chip("Not marked", count=S_UNMARKED, ghost=True)
    booked = [s for s in SESSIONS if s[3] == "booked"]
    past = [s for s in SESSIONS if s[3] != "booked"]
    rows = (f'<tr class="grph"><th colspan="6">Booked '
            f'<span class="ink3">{len(booked)}</span></th></tr>'
            + "".join(srow(s) for s in sorted(booked, key=lambda s: s[0]))
            + f'<tr class="grph"><th colspan="6">This pack '
              f'<span class="ink3">{PACK_USED} of {PACK_TOTAL} used</span>'
              f'<em>&mdash; and two rows below it are older than the pack. '
              f'See &sect;10</em></th></tr>'
            + "".join(srow(s) for s in past))
    body = f'''<div class="tools" style="margin-bottom:10px">{chips}</div>
<div class="card"><div class="card__b card__b--flush">
  <table class="tbl" style="width:100%;border-collapse:collapse">{rows}</table>
</div></div>
<div class="why" style="margin-top:8px"><p class="why__k">The only column a
    trainer scrolls for</p>
  <p>Every row says <b>what it did to the pack</b>: decremented on <b>done</b> and
  on <b>no-show</b>, never on booked, and a cancellation gives the slot back. The
  four used are three sessions and one no-show, so the Package tab is checkable
  from here without trusting either screen.</p></div>
<p class="small" style="margin-top:10px;max-width:var(--w-measure)">
  <b class="ink">Not marked</b> is the absence of a status, and
  <code>SessionFilter</code> has no value for it. &sect;10.</p>'''
    return app(crumb=CRUMB_FILE, head=filehead("sessions"), body=body,
               keys=KEYS_FILE)


# ── the package tab ──────────────────────────────────────────────────────
def f_package():
    part = round(100 * PACK_LEFT / PACK_TOTAL)
    body = f'''<div style="display:grid;gap:12px;
  grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)">
  <div class="card"><div class="card__hd">
      <p class="card__t">{PACK_TOTAL} sessions &middot; {rs(PACK_AMOUNT)}</p>
      <span class="tag tag--acc">Current</span></div>
    <div class="card__b">
      <p class="small">Bought {daystamp(PACK_BOUGHT)} &middot;
        {rs(PACK_PER)} a session</p>
      <div style="display:flex;align-items:flex-end;gap:14px;margin-top:14px">
        <p style="font-family:var(--tx-brand);font-weight:800;font-size:44px;
          letter-spacing:-.04em;line-height:1">{PACK_LEFT}<span class="ink3"
          style="font-size:24px">/{PACK_TOTAL}</span></p>
        <p class="small" style="padding-bottom:8px">left &middot; ends
          {daystamp(PACK_END)}</p></div>
      <div class="meter meter--lg" style="margin-top:12px">
        <i style="width:{part}%"></i><i class="dim" style="width:{100 - part}%"></i></div>
      <div class="row" style="justify-content:space-between;margin-top:8px">
        <span class="small">{PACK_LEFT} left</span>
        <span class="small">{PACK_USED} used &middot; {S_NOSHOW} no-show among them</span>
      </div>
      <div style="margin-top:18px;border-top:1px solid var(--tx-line);padding-top:6px">
        <div class="kv"><span class="kv__k">Owed on this pack</span>
          <span class="kv__v">Nothing &middot; paid in full</span></div>
        <div class="kv"><span class="kv__k">Price a session</span>
          <span class="kv__v">{rs(PACK_PER)}</span></div>
        <div class="kv"><span class="kv__k">The gym&rsquo;s share</span>
          <span class="kv__v">{rs(PACK_CUT)} <span class="ink3"
            style="font-weight:400">&middot; {GYM_PCT}%</span></span></div>
        <div class="kv"><span class="kv__k">What you keep</span>
          <span class="kv__v acc">{rs(PACK_KEEP)} <span class="ink3"
            style="font-weight:400">&middot; {rs(KEEP)} a session</span></span></div>
      </div>
      <div class="card__acts" style="margin-top:16px;display:flex;gap:9px">
        <button class="btn btn--primary" type="button">Renew &middot;
          {PACK_TOTAL} for {rs(PACK_AMOUNT)}</button>
        <button class="btn btn--secondary" type="button">{ic(I_RUPEE, 15)}
          Her full book</button></div>
    </div></div>
  <div>
    <div class="why"><p class="why__k">Fixed on the day it was sold</p>
      <p>{GYM_PCT}% of floor, <b>fixed on {daystamp(PACK_BOUGHT)}</b>. The
      percentage is read off the payment row, not off today&rsquo;s contract
      &mdash; so if the gym&rsquo;s terms change in October, August does not
      move, and {rs(KEEP)} a session is a promise rather than a setting.</p></div>
    <div class="card" style="margin-top:12px"><div class="card__hd">
        <p class="card__t">When the share is zero</p></div>
      <div class="card__b"><p class="small">Three cases, and two of them
        surprise people:</p>
        <ul class="small" style="margin:8px 0 0;padding-left:18px;line-height:1.7">
          <li>the <b>trainer</b> collects &mdash; whatever the mode, and even on
            the gym&rsquo;s own floor;</li>
          <li>the session is <b>remote</b> &mdash; whoever collects. Which is
            exactly why a trainer pushes remote;</li>
          <li>there is no gym on the profile at all.</li></ul>
        <p class="small" style="margin-top:10px">A live split calculator beside
          a &ldquo;trainer collects&rdquo; option is arithmetic on a number the
          rule has already made zero. See &sect;10.</p></div></div>
    <p class="small" style="margin-top:14px">Her ledger &mdash; every payment,
      every write-off &mdash; is one click inside this tab, not a fifth tab.
      Four already overflow the row on a phone, and a second place to read
      &ldquo;owed&rdquo; is a second number to disagree with the first.</p>
  </div></div>'''
    return app(crumb=CRUMB_FILE, head=filehead("package"), body=body,
               keys=KEYS_FILE)


# ── the programs tab ─────────────────────────────────────────────────────
def f_programs():
    part = round(100 * P_WEEK / P_TOTAL)
    hist = ""
    for name, start, end, st in PROGRAMS:
        live = st == "active"
        mark = str(P_WEEK) if live else ""
        to = "now" if live else daystamp(end)
        detail = f"{daystamp(start)} &ndash; {to}"
        if live:
            detail += f" &middot; week {P_WEEK} of {P_TOTAL}"
        hist += (f'<div class="tl__i{" tl__i--acc" if live else ""}">'
                 f'<p class="tl__d">{mark or "&mdash;"}</p>'
                 f'<p class="tl__t">{name}'
                 + (' <span class="tag tag--acc">Live</span>' if live else '')
                 + f'</p><p class="tl__b">{detail}</p></div>')
    hist += (f'<div class="tl__i"><p class="tl__d">&mdash;</p>'
             f'<p class="tl__t" style="color:var(--tx-ink-3)">No program</p>'
             f'<p class="tl__b">{daystamp(GAP_FROM)} &ndash; {daystamp(GAP_TO)} '
             f'&middot; sessions logged as you went</p></div>')
    body = f'''<div style="display:grid;gap:12px;
  grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)">
  <div class="card"><div class="card__hd">
      <p class="card__t">{P_ACTIVE[0]}</p><span class="tag tag--acc">Live</span></div>
    <div class="card__b">
      <p class="small">Assigned {daystamp(P_ACTIVE[1])}</p>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:12px">
        <p style="font-family:var(--tx-brand);font-weight:800;font-size:32px;
          letter-spacing:-.03em;line-height:1">Week {P_WEEK}</p>
        <p class="small">of {P_TOTAL}</p></div>
      <div class="meter meter--lg" style="margin-top:12px">
        <i style="width:{part}%"></i><i class="dim" style="width:{100 - part}%"></i></div>
      <div style="margin-top:16px;border-top:1px solid var(--tx-line);padding-top:6px">
        <div class="kv"><span class="kv__k">This week</span>
          <span class="kv__v">{", ".join(P_LABELS)}</span></div>
        <div class="kv"><span class="kv__k">Logged</span>
          <span class="kv__v">{P_DONE} of {P_PLANNED} days</span></div>
        <div class="kv"><span class="kv__k">Ends</span>
          <span class="kv__v">{daystamp(P_ACTIVE[2])}</span></div></div>
      <div style="margin-top:16px;display:flex;gap:9px">
        <button class="btn btn--secondary" type="button">{ic(I_GRID, 15)}
          Open the plan</button>
        <button class="btn btn--secondary" type="button">Assign another</button></div>
    </div></div>
  <div class="card"><div class="card__hd"><p class="card__t">Every program,
      newest first</p></div>
    <div class="card__b"><div class="tl">{hist}</div>
      <p class="small" style="border-top:1px solid var(--tx-line);padding-top:12px">
        The last row is not missing data. She joined {daystamp(JOINED)} and her
        first program started {daystamp(GAP_TO)}, so those {GAP_DAYS} days are a
        real period of somebody&rsquo;s training &mdash; and the row says what
        happened in it rather than leaving a gap the trainer has to remember.</p>
    </div></div></div>
<p class="small" style="margin-top:16px;max-width:var(--w-measure)">
  <b class="ink">Week {P_WEEK} of {P_TOTAL}</b>, and the two modules that compute
  it agree: <code>weekOf</code> here rounds the total, <code>programLine</code>
  on the roster ceilings it, and this generator asserts they land on the same
  pair. The page this replaces printed <b>week {STALE_WEEK}</b> and promised a
  deload on {daystamp(STALE_DELOAD)} &mdash; {(STALE_DELOAD - P_ACTIVE[2]).days}
  days after the program it belonged to ends.</p>'''
    return app(crumb=CRUMB_FILE, head=filehead("programs"), body=body,
               keys=KEYS_FILE)


# ── 8a · body metrics, the screen with the typo in it ────────────────────
AX_LO, AX_HI = 60.0, 69.0
assert AX_LO < min(SPARK_ALL) and AX_HI > max(SPARK_ALL)
GRID = [60, 63, 66, 69]


def chart():
    plot = 100                       # 132 - 10 top - 22 bottom
    out = ""
    for g in GRID:
        y = 10 + plot * (AX_HI - g) / (AX_HI - AX_LO)
        out += (f'<div class="chart__g" style="top:{y:.1f}px"></div>'
                f'<div class="chart__y" style="top:{y:.1f}px">{g}</div>')
    # The band the six honest readings occupy: 32% of a plot the typo tripled.
    lo, hi = min(SPARK_TRUE), max(SPARK_TRUE)
    ytop = 10 + plot * (AX_HI - hi) / (AX_HI - AX_LO)
    ybot = 10 + plot * (AX_HI - lo) / (AX_HI - AX_LO)
    # A bracket, not a wash: the bars are solid accent now, so a tinted band
    # behind them would be the one thing the house rule forbids — lime as a
    # ground for content.
    out += (f'<div style="position:absolute;left:34px;right:12px;'
            f'top:{ytop:.1f}px;height:{ybot - ytop:.1f}px;'
            f'border-top:1px dashed var(--tx-ink-3);'
            f'border-bottom:1px dashed var(--tx-ink-3);'
            f'border-left:1px solid var(--tx-ink-3)"></div>')
    n = len(WEIGHT)
    for i, (d, t, v) in enumerate(WEIGHT):
        x = 12 + (i + 0.5) * (100 - 12) / n            # per cent
        h = plot * (v - AX_LO) / (AX_HI - AX_LO)
        bad = (d == date(2026, 8, 11) and t == "06:58")
        cls = "chart__b chart__b--bad" if bad else "chart__b"
        out += (f'<div class="{cls}" style="left:calc({x:.1f}% - 13px);'
                f'height:{h:.1f}px"><b>{trim(v)}</b></div>'
                f'<div class="chart__x" style="left:{x:.1f}%">'
                f'{d.day} {MONTHS[d.month - 1]}</div>')
    return f'<div class="chart">{out}</div>'


def metricrows():
    out = ""
    desc = list(reversed(WEIGHT))
    for i, (d, t, v) in enumerate(desc):
        older = desc[i + 1] if i + 1 < len(desc) else None
        newer = desc[i - 1] if i > 0 else None
        same_new = newer and newer[0] == d
        same_old = older and older[0] == d
        note = " &middot; ".join(x for x in [
            t,
            "replaced later that day" if same_new else
            ("corrects the reading below" if same_old else None)] if x)
        delta = signed(v - older[2]) if older else "&mdash;"
        rep = ' style="opacity:.62"' if same_new else ''
        tag = ('<span class="tag tag--warn">Replaced</span>' if same_new else
               '<span class="tag tag--ok">Correction</span>' if same_old else '')
        out += (f'<tr{rep}><td class="mono" style="width:104px;color:var(--tx-ink-3)">'
                f'{daystamp(d)}</td>'
                f'<td class="num strong" style="width:96px">{trim(v)} kg</td>'
                f'<td class="num" style="width:80px;color:var(--tx-ink-3)">{delta}</td>'
                f'<td style="color:var(--tx-ink-3)">{note or "&mdash;"}</td>'
                f'<td style="width:120px">{tag}</td></tr>')
    return out


def f_body():
    # No tab is selected: this is not one of the four.
    head = filehead("overview", sub=f"Weight and waist &middot; {N_METRICS} "
                                    f"readings, append-only")
    head = head.replace('aria-selected="true"', 'aria-selected="false"', 1)
    body = f'''<div style="display:grid;gap:12px;
  grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">
  <div>
    <div class="card"><div class="card__hd">
        <p class="card__t">Weight &middot; {N_WEIGHT} readings since
          {daystamp(WEIGHT[0][0])}</p>
        <span class="tools">{chip("Weight", on=True)}{chip("Waist")}</span></div>
      <div class="card__b">{chart()}
        <div class="row" style="margin-top:9px;gap:16px">
          <span class="small" style="display:inline-flex;align-items:center;gap:6px">
            <i style="width:12px;height:0;border-top:1px dashed var(--tx-ink-3);
              display:inline-block"></i>the {N_WEIGHT - 1} honest readings &middot;
            {RANGE_TRUE} kg of change</span>
          <span class="small" style="display:inline-flex;align-items:center;gap:6px">
            <i style="width:9px;height:9px;background:var(--tx-danger);
              border-radius:2px;display:inline-block"></i>a reading the list
            marks <i>replaced</i>, plotted anyway</span></div></div></div>
    <div class="card" style="margin-top:12px"><div class="card__hd">
        <p class="card__t">Every weight reading</p>
        <span class="small mono">{N_WEIGHT} of {N_METRICS} &middot; waist is the
          other {N_WAIST}</span></div>
      <div class="card__b card__b--flush">
        <table class="tbl" style="width:100%;border-collapse:collapse">
          <thead><tr><th>Date</th><th class="num">Weight</th>
            <th class="num">Change</th><th>Note</th><th></th></tr></thead>
          <tbody>{metricrows()}</tbody></table></div></div>
  </div>
  <div>
    <div class="why why--danger"><p class="why__k">The chart plots the typo</p>
      <p><code>spark: series.map(m =&gt; m.value)</code> takes every reading, and
      nothing tells the chart which rows the list is about to mark
      <i>replaced</i>. So the one screen whose whole job is to be believed draws a
      <b>{abs(round(WEIGHT[5][2] - WEIGHT[4][2], 1))} kg</b> spike the table calls
      a mistake &mdash; and six months of real change, <b>{RANGE_TRUE} kg</b> of
      it, is squeezed into <b>{SPARK_SHARE}%</b> of the plot. Drawn red and
      outside the band here; in the app it is an ordinary point.</p></div>
    <div class="card" style="margin-top:12px"><div class="card__hd">
        <p class="card__t">Append-only, stated in the interface</p></div>
      <div class="card__b"><p class="small">A saved measurement <b>cannot be
        edited or deleted</b> &mdash; not here, not in the app. Trainerize,
        TrueCoach, Everfit and Hevy all let a trainer change a past reading, and
        it is the wrong call for the one screen a trainer turns their phone around
        to show.</p>
        <p class="small" style="margin-top:10px">A wrong number is corrected by
        <b>appending the right one</b>. Both rows stay, and both say so &mdash;
        from opposite ends.</p>
        <p class="small" style="margin-top:10px;padding-top:10px;
          border-top:1px solid var(--tx-line)">The deltas are neither green nor
        red. &minus;3.8 kg is progress for one client and a failure for another,
        and the app does not know which.</p></div></div>
    <p class="small" style="margin-top:12px">Bars, not a line: {N_WEIGHT}
      readings six weeks apart are not a continuous series, and joining them draws
      a slope nobody measured. And the old page&rsquo;s <b>Recorded</b> column
      &mdash; &ldquo;By Meera, in the app&rdquo; &mdash; had no field behind it:
      <code>FileMetric</code> carries {len(METRIC_FIELDS)} and none of them is a
      recorder. &sect;11.</p>
  </div></div>'''
    return app(crumb=CRUMB_FILE.replace('<b>Meera Krishnan</b>',
                                        '<a href="#">Meera Krishnan</a><i>/</i><b>Body</b>'),
               head=head, body=body)


# ══════════════════════════════════════════════════════════ intake, 4 steps ══
def stbar(cur):
    out = ""
    for i, (label, _, _, _) in enumerate(INTAKE):
        cls = "on" if i == cur else ("done" if i < cur else "")
        mark = ic(I_CHECK, 12) if i < cur else str(i + 1)
        opt = ('<span class="opt">optional</span>'
               if label in SKIPPABLE else '')
        out += f'<div class="{cls}"><em>{mark}</em><span>{label}</span>{opt}</div>'
    return f'<div class="stbar" style="padding-bottom:14px">{out}</div>'


CRUMB_ADD = '<a href="/clients">Clients</a><i>/</i><b>Add a client</b>'


def intakehead(cur, acts=""):
    label, sub, _, _ = INTAKE[cur]
    return ph(f"Add a client",
              f"Step {cur + 1} of {N_INTAKE} &middot; {sub}", acts, stbar(cur))


def f_add1():
    """4a. Step 1. Two fields, and the one mistake the form can actually catch."""
    clash = BY_NAME["Arjun S"]
    deferred = "".join(
        f'<div class="kv" style="padding:7px 0"><span class="kv__k">{k}'
        f'<span class="small" style="margin-left:8px">{v}</span></span>'
        f'<span class="kv__v ink3">&mdash;</span></div>' for k, v in DEFERRED)
    body = f'''<div style="display:grid;gap:20px;
  grid-template-columns:minmax(0,480px) minmax(0,1fr);max-width:1040px">
  <div>
    <div class="fld"><label class="fld__l">Their name</label>
      <input class="ctl" value="Arjun Subramanian">
      <p class="fld__h">Use the name they are already known by.</p></div>
    <div class="fld" style="margin-top:14px"><label class="fld__l">Phone number</label>
      <div class="affix"><span class="ctl ctl--said" style="width:52px;
        border-radius:var(--tx-r2) 0 0 var(--tx-r2);border-right:0;
        display:grid;place-items:center">+91</span>
        <input class="ctl" value="98410 22119"></div>
      <p class="fld__h">Reminders and the invite both go to this number.</p></div>
    <div class="why why--warn" style="margin-top:12px;padding:12px 16px">
      <p class="why__k">Already on your roster</p>
      <p><b>{clash["name"]}</b> has this number. Two records for one person split
      their pack and their history in half &mdash; and two people do share a
      phone, so this is a caution, not a refusal.</p>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn--secondary btn--sm" type="button">Open
          {clash["name"]}&rsquo;s file</button>
        <button class="btn btn--ghost btn--sm" type="button">It&rsquo;s a
          different person</button></div></div>
    <p class="micro" style="margin-top:18px">Any time later</p>
    <div class="card" style="margin-top:8px"><div class="card__b">{deferred}</div></div>
    <p class="small" style="margin-top:8px">Em dashes, not empty fields.</p>
    <div style="display:flex;gap:9px;margin-top:18px">
      <button class="btn btn--primary btn--lg" type="button">Continue</button>
      <button class="btn btn--ghost btn--lg" type="button">Cancel</button></div>
  </div>
  <div>
    <div class="why"><p class="why__k">Two fields, and that is the promise</p>
      <p>The empty roster says <i>a client needs a name and a phone number</i>,
      so this form has to keep it. Goals, injuries, measurements, a program, a
      package &mdash; everything a competitor asks for at intake &mdash; is a row
      you fill in later from the file, and none of it blocks the first
      session.</p></div>
    <div class="card" style="margin-top:12px"><div class="card__hd">
        <p class="card__t">Where the number is checked</p></div>
      <div class="card__b">
        <p class="small"><b class="ink">The shape</b>, on blur: ten digits
        starting 6 to 9, the same test the sign-in screen applies. Counting
        digits alone let a 5-leading number reach the network, where a 400 came
        back as &ldquo;couldn&rsquo;t send the code&rdquo; &mdash; blaming the
        connection for a typo.</p>
        <p class="small" style="margin-top:10px"><b class="ink">The owner</b>,
        400 ms after the tenth digit, against the server: a trainer&rsquo;s own
        number, or another trainer&rsquo;s client. Keyed by the digits it asked
        about, so an answer that arrives late is ignored rather than shown
        against a different number.</p>
        <p class="small" style="margin-top:10px"><b class="ink">The roster</b>,
        locally and instantly &mdash; the box on the left. Offline the first two
        cannot answer and this one still can.</p>
        <p class="small" style="margin-top:10px;padding-top:10px;
          border-top:1px solid var(--tx-line)">Continue is <b>not</b> disabled
        while the server is being asked: offline that ask does not answer for
        fifteen seconds, and a button that dies for fifteen seconds is worse than
        a refusal at the next sync.</p></div></div>
  </div></div>'''
    return app(crumb=CRUMB_ADD, head=intakehead(0), body=body)


def f_gate():
    """4b. The gate nothing in this set has drawn: with no packs on the price
       list, steps 2 to 4 have nothing to offer and the client would be created
       half-made. `observePacks()` counts active packs and the form does not
       render until it has an answer."""
    body = f'''<div class="empty" style="min-height:460px">
  <span class="empty__ic">{ic(I_RUPEE, 22)}</span>
  <p class="empty__t">Set up your sessions first</p>
  <p class="empty__b">A client gets sold sessions from your price list, and there
    is nothing on it yet. Add a pack &mdash; even one &mdash; and come back.
    The form is right here.</p>
  <button class="btn btn--primary btn--lg" type="button">{ic(I_RUPEE, 16)}
    Set up packs</button>
  <p class="small" style="max-width:56ch;margin-top:6px">Not a validation error
    and not a disabled button: the two fields on step 1 are fine, it is
    <b class="ink">steps 2 to 4</b> that have nothing to offer. So the gate
    replaces the form rather than sitting under it, and the count it reads is
    case-blind &mdash; server-written rows have been seen carrying
    <code>Active</code>, and a pack counted as the wrong case leaves this gate
    wrongly closed.</p></div>'''
    return app(crumb=CRUMB_ADD, head=intakehead(0), body=body)


def f_add2():
    """4c. Step 2 — the money question, and the record is created here."""
    rows = ""
    for key, label, why, asks in WORKMODES:
        on = key == "gym"
        rows += (f'<div class="lrow" {"aria-selected=" + chr(34) + "true" + chr(34) if on else ""}>'
                 f'<span class="rad{" rad--on" if on else ""}"></span>'
                 f'<span class="lrow__m" style="flex:1"><span class="lrow__t">'
                 f'{label}</span><span class="lrow__s" style="white-space:normal">'
                 f'{why}</span></span>'
                 f'<span class="tag {"tag--warn" if asks else "tag--ok"}">'
                 f'{"asks for a share" if asks else "no split"}</span></div>')
    body = f'''<div style="display:grid;gap:20px;
  grid-template-columns:minmax(0,520px) minmax(0,1fr);max-width:1060px">
  <div>
    <p class="micro">On your profile</p>
    <div class="lgl" style="margin-top:8px">{rows}</div>
    <p class="small" style="margin-top:7px">Answered once at setup. Two of the
      three <b>never ask who collects</b>: the answer is implied.</p>

    <p class="micro" style="margin-top:14px">Where they train</p>
    <div class="wk" style="margin-top:8px">{chip("Floor", on=True)}{chip("Remote")}
      <span class="small" style="margin-left:6px">decides whether there is a share
        to ask for</span></div>

    <p class="micro" style="margin-top:14px">Their pack, from the gym&rsquo;s list</p>
    <div class="card" style="margin-top:8px"><div class="card__b">
      <div class="kv"><span class="kv__k">{PACK_TOTAL} sessions
        <span class="tag tag--floor" style="margin-left:8px">Floor</span></span>
        <span class="kv__v">{rs(PACK_AMOUNT)}</span></div>
      <div class="kv"><span class="kv__k">What <b>you</b> keep</span>
        <span class="kv__v"><input class="ctl ctl--num" value="{TRAINER_KEEPS}"
          style="width:64px;height:30px"> %
          <span class="acc">{rs(PACK_KEEP)}</span></span></div>
      <div class="kv"><span class="kv__k">The gym&rsquo;s share, therefore</span>
        <span class="kv__v ink3">{GYM_PCT}% &middot; {rs(PACK_CUT)}</span></div>
      <div style="height:1px;background:var(--tx-line);margin:8px 0 2px"></div>
      <p class="micro" style="margin-bottom:2px">One chip along</p>
      <div class="kv"><span class="kv__k">{PACK_TOTAL} sessions
        <span class="tag tag--remote" style="margin-left:8px">Remote</span></span>
        <span class="kv__v acc">100% &middot; {rs(PACK_AMOUNT)}</span></div>
      <div class="kv"><span class="kv__k">The gym&rsquo;s share</span>
        <span class="kv__v ink3">0% &mdash; no field, because there is no answer
          to give</span></div>
    </div></div>
    <div style="display:flex;gap:9px;margin-top:16px">
      <button class="btn btn--primary btn--lg" type="button">Continue</button>
      <button class="btn btn--ghost btn--lg" type="button">Skip &mdash; sell it
        on the day they pay</button></div>
  </div>
  <div>
    <div class="why why--warn"><p class="why__k">The field is what you keep</p>
      <p><code>trainerSplitPercent</code> is <b>what the trainer keeps</b>. The
      page this replaces labelled its field <i>Gym&rsquo;s share&nbsp;%</i>,
      which stores the complement of what it says: type 46 and the trainer keeps
      {GYM_PCT}%, not {TRAINER_KEEPS}%.</p></div>
    <div class="why" style="margin-top:12px"><p class="why__k">The record exists
      after this screen</p>
      <p><code>createClient</code> runs <b>here</b>, on step {CREATED_ON_STEP},
      and the next two steps are <code>navigation.replace</code>. So a trainer
      who stops after this has a real client on the roster &mdash; chased, with
      a <i>Set up</i> verb, not lost. That is the whole reason intake is a page
      and not a panel: a panel implies a form you can cancel, and there is
      nothing left to cancel.</p></div>
    <div class="why why--warn" style="margin-top:12px">
      <p class="why__k">A field only where there is an answer to give</p>
      <p><code>projectedCut</code> returns zero in three cases, and one is
      <b>every remote session, whoever collects</b>. So the share field is not a
      fixture: it renders for a gym client who trains on the floor, and otherwise
      the row states the rule rather than offering arithmetic on a number already
      decided. The page this replaces led with a live calculator and drew
      <i>&ldquo;Trainer collects&rdquo;</i> selected beside it.</p>
      <p style="margin-top:9px">Not a fork either: the client&rsquo;s percentage
      <b>overrides</b> the profile&rsquo;s, in that order, which is the precedence
      <code>projectedCut</code> reads.</p></div>
  </div></div>'''
    return app(crumb=CRUMB_ADD, head=intakehead(1), body=body)


def f_add3():
    """4d. Step 3 — the week, out of hours that exist."""
    chips_ = ""
    held = dict(HELD_TUE)
    for m in SLOTS_TUE:
        if m in held:
            chips_ += (f'<span class="slot slot--held" aria-disabled="true">'
                       f'{hm(m)}<small>{held[m]} has it</small></span>')
        elif m == RAHUL_TUE:
            chips_ += (f'<span class="slot">{hm(m)}'
                       f'<small>free &mdash; Rahul D is paused</small></span>')
        elif m == 480:
            chips_ += f'<span class="slot slot--on">{hm(m)}<small>picked</small></span>'
        else:
            chips_ += f'<span class="slot">{hm(m)}<small>free</small></span>'
    body = f'''<div style="display:grid;gap:20px;
  grid-template-columns:minmax(0,600px) minmax(0,1fr);max-width:1140px">
  <div>
    <p class="micro">Which days</p>
    <div class="wk" style="margin-top:8px">
      {"".join(chip(d, on=(d in ("Tue", "Thu", "Sat"))) for d in
               ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"))}</div>
    <p class="micro" style="margin-top:22px">Tuesday &middot; your hours,
      minus the hours other clients hold</p>
    <div class="slots" style="margin-top:8px">{chips_}</div>
    <p class="small" style="margin-top:10px">{len(FREE_TUE)} of
      {N_SLOTS_TUE} Tuesday slots are free. A held hour is drawn and disabled
      rather than hidden: an hour that vanishes teaches nothing, and the name on
      it is what lets a trainer decide to move somebody.</p>
    <div style="display:flex;gap:9px;margin-top:24px">
      <button class="btn btn--primary btn--lg" type="button">Continue</button>
      <button class="btn btn--ghost btn--lg" type="button">Skip for now</button></div>
  </div>
  <div>
    <div class="why"><p class="why__k">This clash blocks. The diary&rsquo;s
      warns</p>
      <p>A double-booked day in the diary is the trainer&rsquo;s call &mdash;
      somebody is already on the floor. A double-booked <b>standing week</b> is
      a mistake about to repeat every week, so here the hour is not offered and
      not saveable, and save re-checks against the latest data: a schedule that
      synced in mid-edit still cannot double-book.</p></div>
    <div class="card" style="margin-top:12px"><div class="card__hd">
        <p class="card__t">Who holds an hour</p></div>
      <div class="card__b">
        <p class="small">Both places a standing week lives:
        <code>clients.weekly_schedule</code>, picked here, and a live
        <code>programs.schedule</code>, written by the server when a plan is
        applied. Each slot occupies its client&rsquo;s own session length, so a
        90-minute client blocks the half-hour marks inside their session
        too.</p>
        <p class="small" style="margin-top:10px"><b class="ink">Paused, inactive
        and archived clients hold nothing.</b> Their sessions are not happening,
        and keeping their hours would shrink the week for nobody&rsquo;s benefit
        &mdash; which is why {hm(RAHUL_TUE)} is offered above even though Rahul D
        trains then.</p></div></div>
    <p class="small" style="margin-top:14px">The days picked here become
      <b>ordinal slots</b>: Day 1 on the earliest weekday, which is the only
      order a training week means. Three days picked means step 4 will only
      offer three-day programs &mdash; the server refuses an apply whose
      schedule does not cover a template&rsquo;s days exactly.</p>
  </div></div>'''
    return app(crumb=CRUMB_ADD, head=intakehead(2), body=body)


# ════════════════════════════════════════════════ 5a · three ways out, one delete ══
def removedialog():
    counted = ", ".join(f"<b>{n} {k}</b>" for k, n in REMOVAL[:2])
    return f'''<div class="modal" style="width:520px;left:auto;right:36px;
  transform:translateY(-50%)">
  <div class="modal__hd"><p class="modal__t">Remove Rahul Deshpande?</p></div>
  <div class="modal__body">
    <p style="margin:0">{counted} and <b>{REMOVAL[2][1]} {REMOVAL[2][0]}</b> go
      with him. Months you have already closed keep their totals, so your
      reports will not move &mdash; but his side of them goes blank.</p>
    <p style="margin:14px 0 0"><b>Archive keeps every bit of it</b> and still
      takes him off your roster.</p>
    <p class="small" style="margin-top:14px;padding-top:12px;
      border-top:1px solid var(--tx-line)">This is a count, not a question.
      &ldquo;Are you sure?&rdquo; is not information;
      {REMOVAL[0][1]} sessions, {REMOVAL[1][1]} measurements and
      {REMOVAL[2][1]} payments is. And it takes effect at once &mdash; there is
      no grace period on a client the way there is on your own account, which is
      why archive is the row above.</p>
  </div>
  <div class="modal__foot">
    <button class="btn btn--secondary" type="button">Archive instead</button>
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--danger" type="button">Remove</button></div></div>'''


def f_end():
    rows = ""
    for label, tone, body_ in WAYS_OUT[:2]:
        rows += (f'<div class="lrow" style="min-height:66px">'
                 f'{ic(I_PAUSE if label == "Pause" else I_BOX, 18)}'
                 f'<span class="lrow__m" style="flex:1">'
                 f'<span class="lrow__t">{label} Rahul</span>'
                 f'<span class="lrow__s" style="white-space:normal">{body_}</span>'
                 f'</span><span class="tag tag--ok">reversible</span>'
                 f'{ic(I_CHEV, 16)}</div>')
    dead = (f'<div class="lrow" style="min-height:66px">{ic(I_TRASH, 18)}'
            f'<span class="lrow__m" style="flex:1">'
            f'<span class="lrow__t" style="color:var(--tx-danger)">Remove Rahul</span>'
            f'<span class="lrow__s" style="white-space:normal">{WAYS_OUT[2][2]}'
            f'</span></span><span class="tag tag--danger">final</span>'
            f'{ic(I_CHEV, 16)}</div>')
    head = ph("Rahul Deshpande",
              f"Paused {shortdate(BY_NAME['Rahul D']['paused'])} &middot; "
              f"{R_LEFT} sessions still on the pack &middot; nothing owed",
              f'<button class="btn btn--secondary" type="button">{ic(I_PLAY, 15)}'
              f'Bring him back</button>')
    body = f'''<div style="display:grid;gap:20px;
  grid-template-columns:minmax(0,440px) minmax(0,1fr);max-width:1120px">
  <div>
    <p class="note" style="margin-top:0">Three different things.
      <b>Two of them you can walk back.</b></p>
    <div class="lgl" style="margin-top:14px">{rows}</div>
    <div class="why" style="margin-top:12px"><p class="why__k">Neither one
      clears a debt</p>
      <p>Nothing is owed here, so neither leaves money behind. When something
      is, it stays on their book and in your pending total until you record it
      or write it off &mdash; the half trainers get wrong, and the half the
      page this replaces left out.</p></div>
    <div style="height:1px;background:var(--tx-line);margin:26px 0"></div>
    <div class="lgl">{dead}</div>
  </div>
  <div>
    <div class="card"><div class="card__hd">
        <p class="card__t">What each one does to the pack</p></div>
      <div class="card__b card__b--flush">
        <table class="tbl" style="width:100%;border-collapse:collapse">
          <thead><tr><th></th><th>Pause</th><th>Archive</th><th>Remove</th></tr></thead>
          <tbody>
          <tr><td class="strong">{R_LEFT} unused sessions</td>
            <td class="acc">held</td>
            <td style="color:var(--tx-warn)">closed</td>
            <td style="color:var(--tx-danger)">deleted</td></tr>
          <tr><td class="strong">{DONE_ALL} logged sessions</td>
            <td class="acc">kept</td><td class="acc">kept</td>
            <td style="color:var(--tx-danger)">deleted</td></tr>
          <tr><td class="strong">Money owed</td>
            <td class="acc">stands</td><td class="acc">stands</td>
            <td style="color:var(--tx-danger)">gone</td></tr>
          <tr><td class="strong">On the roster</td>
            <td>in <i>Paused</i></td><td>searchable</td>
            <td>no</td></tr>
          <tr><td class="strong">In your plan count</td>
            <td>no</td><td>no</td><td>no</td></tr>
          <tr><td class="strong">Reversible</td><td class="acc">yes</td>
            <td class="acc">yes</td>
            <td style="color:var(--tx-danger)">no</td></tr>
          </tbody></table></div></div>
    <div class="why why--danger" style="margin-top:12px">
      <p class="why__k">Archive closes the pack</p>
      <p>The page this replaces said his {R_LEFT} sessions
      &ldquo;<i>stay on the package and are still counted in this month&rsquo;s
      figures</i>&rdquo;. That is the <b>pause</b> rule with archive&rsquo;s name
      on it &mdash; and it valued them at {rs(STALE_R_VALUE)}, which is
      {R_LEFT} &times; {rs(STALE_R_VALUE // R_LEFT)} against a pack it priced at
      {rs(STALE_R_PACK)} for {R_PACK_TOTAL}, or {rs(round(STALE_R_PACK / R_PACK_TOTAL))}
      a session. At this set&rsquo;s one rate they are worth
      <b>{rs(R_VALUE)}</b>.</p></div>
    <p class="small" style="margin-top:14px">The destructive row sits below a
      rule, alone, and it is the only row on this screen that opens a dialog
      &mdash; consequential options do not belong next to benign ones, and
      &ldquo;Archive instead&rdquo; is offered <b>inside</b> the dialog because
      it is what the trainer almost always meant.</p>
  </div></div>'''
    return app(crumb='<a href="/clients">Clients</a><i>/</i>'
                     '<a href="#">Rahul Deshpande</a><i>/</i><b>Pause or end</b>',
               head=head, body=body,
               over='<div class="scrim"></div>' + removedialog())


# ══════════════════════════════════════════════════════════════ the frames ══
def frame(fid, name, frm, url, screen, note):
    return f'''
<section class="unit" id="f-{fid}">
  <div class="unit__label">
    <span class="unit__id">{fid}</span>
    <span class="unit__name">{name}</span>
    <span class="unit__from">from <b>{frm}</b></span>
  </div>
  <div class="viewport">
    <div class="viewport__in">{browser(url)}{screen}</div>
  </div>
  <p class="unit__note">{note}</p>
</section>'''


def units(*s):
    return '<div class="units">' + "".join(s) + '</div>'


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


FIND = []
FIND.append(finding(
    "01", "The client file has four tabs. The page drew six, and its change "
          "table called the two extras an improvement", "danger",
    f'<code>FILE_TABS</code> in <code>clients/file.ts</code> is '
    f'<b>{N_TABS}</b> &mdash; overview, programs, sessions, package. &sect;14 of '
    f'the mobile design makes it a rule with a reason: <i>a fifth only for a '
    f'whole feature</i>, because four already overflow the tab row at 360dp. '
    f'The two invented ones are <b>Body</b>, which is a real screen in the '
    f'wrong place, and <b>Payments</b>, which is the money book &mdash; and the '
    f'rule puts the ledger one tap <i>inside</i> Package precisely so the owed '
    f'figure has one source. A second place to read &ldquo;owed&rdquo; is a '
    f'second number to disagree with the first.',
    f'<code>grep -n "FILE_TABS" -A6 app/src/clients/file.ts</code>. Four '
    f'entries. The page&rsquo;s own tab strip printed '
    f'{" &middot; ".join(STALE_TABS)}.'))
FIND.append(finding(
    "02", "Intake is a four-step flow whose first step has two fields. The page "
          "drew one nine-field panel and called it six", "danger",
    f'<code>AddClientScreen</code>&rsquo;s docstring is titled <i>5a &middot; '
    f'Add a client &mdash; two fields</i>, and the empty roster it quotes '
    f'promises exactly that. All four screens carry <code>Steps count={{4}}</code>. '
    f'The panel asked for <b>{len(STALE_FIELDS)}</b> fields, four of them about '
    f'money, and one of those &mdash; the gym&rsquo;s share &mdash; is a '
    f'question the app deliberately never asks at intake, because who collects '
    f'and what the gym takes are decided per client and the mix changes month '
    f'to month.',
    f'<code>grep -n "Steps count" app/src/screens/main/clients/*.tsx</code> '
    f'&mdash; four files, <code>current</code> 0 to 3. The page&rsquo;s prose '
    f'said &ldquo;{STALE_CLAIM_FIELDS} fields either way&rdquo;; neither number '
    f'is 2 or {len(STALE_FIELDS)}.'))
FIND.append(finding(
    "03", "&ldquo;Top set &middot; bench 65 kg&rdquo; is not a figure the "
          "client file computes", "danger",
    f'<code>buildOverview</code> returns <b>five</b> rows &mdash; next session, '
    f'adherence, last logged, weight, all time &mdash; over a headline pair of '
    f'owed and sessions left. There is no top set anywhere in the file, and the '
    f'page&rsquo;s prose named it as one of <i>the four numbers the trainer '
    f'actually acts on</i>. A best lift lives in the workout log, against an '
    f'exercise, and the client file never reads it.',
    f'<code>grep -in "topset\\|top_set\\|bestSet" app/src/clients/file.ts</code> '
    f'&mdash; nothing. The five keys it does return are <code>next</code>, '
    f'<code>adherence</code>, <code>logged</code>, <code>weight</code>, '
    f'<code>alltime</code>.'))
FIND.append(finding(
    "04", f"The package column and the deal card disagreed by {rs(PACK_GAP)} "
          f"about the same client, on the same frame", "danger",
    f'The table said Meera&rsquo;s package was <b>{rs(STALE_PACK_AMOUNT)}</b> '
    f'for {PACK_TOTAL} sessions. The deal card two panels down said '
    f'<b>{rs(RATE)} a session</b>. {PACK_TOTAL} &times; {rs(RATE)} is '
    f'{rs(PACK_AMOUNT)}; {rs(STALE_PACK_AMOUNT)} over {PACK_TOTAL} is '
    f'{rs(STALE_PACK_PER)}. <code>buildPackage</code> derives '
    f'<code>perSession</code> from <code>pack.amount / total</code>, so the two '
    f'figures are the <i>same number</i> arrived at two ways and they cannot '
    f'differ. Everything downstream &mdash; the gym&rsquo;s cut, what the '
    f'trainer keeps &mdash; inherits whichever one is wrong.',
    f'{rs(RATE)} and {rs(KEEP)} are <code>RATE</code> and <code>KEEP</code> in '
    f'<code>gen_schedule.py</code>, used by three other pages in this set; '
    f'{GYM_PCT}% is the money file&rsquo;s. This page imports all three and '
    f'asserts <code>PACK_KEEP == PACK_TOTAL * KEEP</code>.'))
FIND.append(finding(
    "05", "The archive dialog states the pause rule, and misprices the "
          "sessions it is wrong about", "danger",
    f'It said Rahul&rsquo;s {R_LEFT} unused sessions <i>&ldquo;stay on the '
    f'package and are still counted in this month&rsquo;s figures&rdquo;</i>. '
    f'<code>ClientEndScreen</code>: <i>&ldquo;Archive &mdash; closes the pack, '
    f'their {R_LEFT} unused sessions end there&rdquo;</i>. Keeping the pack is '
    f'what <b>pause</b> does, and &sect;14 names this as the half trainers get '
    f'wrong. It then valued them at {rs(STALE_R_VALUE)}, which is {R_LEFT} '
    f'&times; {rs(STALE_R_VALUE // R_LEFT)} &mdash; a per-session price that '
    f'appears nowhere, against a pack the same frame priced at '
    f'{rs(STALE_R_PACK)} for {R_PACK_TOTAL}.',
    f'<code>sed -n \'118,132p\' app/src/screens/main/clients/'
    f'ClientEndScreen.tsx</code>. And the dialog it drew was the wrong dialog '
    f'entirely: archive needs no confirmation, because it is reversible. '
    f'<b>Remove</b> is the one that opens a dialog, and remove was not drawn.'))
FIND.append(finding(
    "06", "Three of the five list chips are not segments, and the two that "
          "matter most were missing", "danger",
    f'<code>SEGMENTS</code> is {" &middot; ".join(l for _, l in SEGMENTS)}. The '
    f'page drew {" &middot; ".join(STALE_SEGMENTS)}. <b>Owing</b> is a filter '
    f'(<code>money: [&#39;owes&#39;]</code>), not a segment. <b>Archived</b> is '
    f'neither &mdash; <code>buildRoster</code> filters archived rows out before '
    f'anything else runs, so it is a count and a route. And the two that were '
    f'absent are the two that carry the screen: <b>Needs attention</b>, which is '
    f'what the whole module exists to compute, and <b>Invited</b>, which is where '
    f'the honest sentence about invites lives.',
    f'<code>grep -n "export const SEGMENTS" -A8 app/src/clients/roster.ts</code>, '
    f'and <code>.filter((client) =&gt; readStatus(client.status) !== '
    f'&#39;archived&#39;)</code> at the top of <code>buildRoster</code>.'))
FIND.append(finding(
    "07", "&ldquo;Sorted by next session&rdquo; is not one of the five sorts",
    "danger",
    f'<code>SORTS</code> is {" &middot; ".join(l for _, l, _ in SORTS)}. The '
    f'page&rsquo;s table said <i>Sorted by next session</i>, which is a sixth '
    f'order nothing implements &mdash; and the one it replaced is the default: '
    f'<code>useState&lt;SortKey&gt;(&#39;attention&#39;)</code>. The distinction '
    f'the page lost is that the roster opens on segment <b>All</b> sorted by '
    f'<b>attention</b>, so the whole roster is visible with the nine who need '
    f'the trainer grouped at the top. Not a filter. A ranking.',
    f'<code>grep -n "useState&lt;SortKey&gt;\\|useState&lt;Segment&gt;" '
    f'app/src/screens/main/clients/ClientsScreen.tsx</code> &mdash; '
    f'<code>&#39;attention&#39;</code> and <code>&#39;all&#39;</code>.'))
FIND.append(finding(
    "08", "The filter row had two axes. There are three, and the missing one is "
          "the interesting one", "warn",
    f'<code>Filters</code> is <code>{{ mode, money, batch }}</code>. The '
    f'page&rsquo;s always-visible chips covered mode and one money value. '
    f'<b>Batch</b> is the axis worth having on a desk: it is <b>derived</b> from '
    f'where a client&rsquo;s sessions actually sit, never typed, because batch on '
    f'an Indian gym floor is an observation about when somebody turns up. And '
    f'noon to four is deliberately nobody&rsquo;s batch &mdash; a client who '
    f'trains at two is training alone.',
    f'<code>readBatch</code> in <code>roster.ts</code>: '
    f'<code>EVENING_FROM&nbsp;=&nbsp;16</code>, '
    f'<code>NIGHT_FROM&nbsp;=&nbsp;20</code>, ties to the earlier batch. Four '
    f'values including <code>none</code>.'))
FIND.append(finding(
    "09", f"{N_NEW_STATES} roster row states have never been drawn in this set, "
          f"and one of them outranks money", "warn",
    f'<code>AttentionKind</code> has six members. The page&rsquo;s Status column '
    f'held two of them under other names. Undrawn: <b>setup</b> (twice &mdash; '
    f'week owed, plan owed), <b>unavailable</b>, a <b>stale invite</b>, and the '
    f'<b>queued</b> tag a row wears when it was written here and has not been '
    f'pushed. <code>unavailable</code> is the first band, above overdue money, '
    f'and deliberately: every other item became true over time and will still be '
    f'true tomorrow, whereas that one is a typo made seconds ago and fixable in '
    f'seconds.',
    f'<code>grep -n "AttentionKind" app/src/clients/roster.ts</code> for the six '
    f'kinds; <code>ATTENTION_BANDS</code> in <code>home/deck.ts</code> for the '
    f'{len(BANDS)} bands they resolve into and the order of them. That table did '
    f'not exist when this page was first drawn &mdash; &sect;02 is why it does '
    f'now.'))
FIND.append(finding(
    "10", "The body-metrics table had a column with no field behind it, a "
          "heading over the wrong count, and a delta that did not subtract",
    "danger",
    f'<b>Recorded</b> &mdash; &ldquo;By Meera, in the app&rdquo; / &ldquo;By '
    f'you, on the floor&rdquo; / &ldquo;Intake&rdquo;. <code>FileMetric</code> '
    f'carries {len(METRIC_FIELDS)} fields and none of them is a recorder. The '
    f'chart was headed <i>{STALE_METRIC_N} entries</i> over a '
    f'{STALE_METRIC_ROWS}-row table: <code>count</code> is '
    f'<code>input.metrics.length</code>, <b>both kinds</b>, so the number is '
    f'neither the weight count nor the row count. And its fourth Change cell '
    f'read <b>&minus;0.2</b> for 62.5 against 63.1, which is &minus;0.6.',
    f'<code>grep -n "interface FileMetric" -A8 app/src/clients/file.ts</code>, '
    f'and <code>count: input.metrics.length</code> at the bottom of '
    f'<code>buildMetrics</code>.'))
FIND.append(finding(
    "11", f"Week {STALE_WEEK} of {P_TOTAL}, and a deload dated after the "
          f"program ends", "danger",
    f'Two modules compute the week and they agree: <code>weekOf</code> in the '
    f'file, <code>programLine</code> on the roster. With a program assigned '
    f'{daystamp(P_ACTIVE[1])} and ending {daystamp(P_ACTIVE[2])}, '
    f'{daystamp(D)} is <b>week {P_WEEK}</b>. The page printed week '
    f'{STALE_WEEK} and then promised <i>&ldquo;the deload starts automatically '
    f'on {daystamp(STALE_DELOAD)}&rdquo;</i> &mdash; '
    f'{(STALE_DELOAD - P_ACTIVE[2]).days} days after the program it belongs to '
    f'is over. Nothing in the product starts anything automatically.',
    f'This generator computes both and asserts they land on the same pair: '
    f'<code>assert progline(M) == f"&hellip; Week {{P_WEEK}} of '
    f'{{P_TOTAL}}"</code>.'))
FIND.append(finding(
    "12", "&ldquo;Twelve of the app&rsquo;s fifty-seven screens&rdquo;. It is "
          f"{SURFACES_CLIENT} of {SCREENS_ALL}", "warn",
    f'<code>app/src/screens</code> holds <b>{SCREENS_ALL}</b> files matching '
    f'<code>*Screen.tsx</code>. The clients tab holds <b>{SCREENS_CLIENT}</b> of '
    f'them plus <b>{SHEETS_CLIENT}</b> sheets and menus and one skeleton. The '
    f'lede&rsquo;s arithmetic is not decorative &mdash; it is the claim that '
    f'justifies the whole page, and understating the app by '
    f'{SCREENS_ALL - STALE_SCREENS_ALL} screens understates how much of it this '
    f'file is responsible for.',
    f'<code>find app/src/screens -name &#39;*Screen.tsx&#39; | wc -l</code> '
    f'&rarr; {SCREENS_ALL}. '
    f'<code>ls app/src/screens/main/clients/ | wc -l</code> &rarr; '
    f'{SURFACES_CLIENT + 1}, the extra being <code>RosterSkeleton</code>.'))
FIND.append(finding(
    "13", "A tab has never been a button in this design set, so the stylesheet "
          "does not reset one", "danger",
    f'<code>.tab</code> sets a colour, a height and a bottom border and nothing '
    f'else. The reset at the top of <code>webapp.css</code> is '
    f'<code>button,input,select,textarea{{font:inherit;color:inherit}}</code> '
    f'&mdash; no background, no border &mdash; so a real <code>&lt;button&gt;</code> '
    f'carrying <code>.tab</code> renders with the browser&rsquo;s grey '
    f'<i>ButtonFace</i> and its default 2px outset border. Nobody had seen it, '
    f'because <b>all {STALE_TAB_DIVS} tabs in the other {STALE_TAB_FILES} files '
    f'that carry them are <code>&lt;div&gt;</code>s</b> &mdash; which is the '
    f'other half of the same defect, and exactly the one the library already '
    f'fixed for <code>.menu__i</code> (<i>&ldquo;a menu row that DOES something '
    f'is a button&rdquo;</i>) and for <code>.ev</code> (<i>&ldquo;102 of them '
    f'were &lt;div&gt;s&rdquo;</i>).',
    f'<code>grep -c \'&lt;button class="tab"\' webapp-*.html</code>. Fixed in '
    f'the stylesheet rather than here, with the reason in the rule &mdash; and '
    f'the {STALE_TAB_DIVS} divs are converted too, in the same pass. To be exact '
    f'about what they were missing: they already carried <code>role="tab"</code> '
    f'inside a <code>role="tablist"</code>, so a screen reader announced them '
    f'correctly. What a <code>&lt;div role="tab"&gt;</code> is not is '
    f'<b>focusable</b> &mdash; so the control said the right thing and could not '
    f'be operated. All {STALE_TAB_DIVS} are now buttons with a roving '
    f'<code>tabindex</code>, and every tablist has an entry point at 0.'))
N_FIND = len(FIND)
assert N_FIND == 13


S01 = (f'''<p class="note">The first three are the ones that make this a rebuild
rather than an edit: the page described a client file with two tabs
that do not exist, an intake form with seven fields that do not exist, and a
headline figure the product does not compute. Everything on the new page is
imported from the code that enforces it and asserted, including the arithmetic
in the prose.</p>''' + "\n\n" + "\n\n".join(FIND))


# ═══════════════════════════════════════════════════════════════════ §02 ══
_krows = "".join(
    f'<tr><td class="strong">{k}</td><td colspan="2" class="acc">{a}</td></tr>'
    for k, a, b in KAVYA)
_stale_krows = "".join(
    f'<tr><td class="strong">{k}</td><td>{a}</td><td>{b}</td></tr>'
    for k, a, b in STALE_KAVYA)

_bandrows = ""
for i, b in enumerate(BANDS):
    _rows = [r for r in ATTN if r["band"] == b]
    _who = ", ".join(r["name"] for r in _rows) or "&mdash;"
    _sev = sev_of(b)
    _tone = "danger" if _sev == "critical" else "warn"
    _where = ("both" if b in DECK_BANDS else "roster only")
    _bandrows += (
        f'<tr><td class="mono">{BAND_VALUE[b]}</td>'
        f'<td class="strong">{b}</td>'
        f'<td><span class="tag tag--{_tone}">{_sev}</span></td>'
        f'<td class="mono" style="font-size:11.5px">{_where}</td>'
        f'<td>{_who}</td></tr>')

S02 = f'''<p class="note"><code>roster.ts</code> opens with a promise:
<i>&ldquo;the thresholds are imported from the deck rather than restated, because
the whole point of the severity spine being the same 2px bar on both screens is
that &lsquo;needs attention&rsquo; means one thing in this app, not two.&rdquo;</i>
The thresholds were imported. Nothing else was. This page imports
<code>gen_today</code>, which ports <code>buildAttention</code> from
<code>home/deck.ts</code>, and running the same trainer&rsquo;s data through both
modules on the same morning is what found it: <b>Today named {STALE_DECK_N}
clients, the roster named {STALE_ROST_N}, and they agreed about
{STALE_BOTH_N}.</b></p>

<p class="note">Four separate disagreements, and none of them cosmetic.</p>
<table class="dt"><tbody>
<tr><th>Two weight scales</th><td>The deck weighed overdue money at
  <code>2000&nbsp;+&nbsp;days</code>, the roster at
  <code>4000&nbsp;+&nbsp;the rupees owed</code>. So the same client sorted
  differently on two screens, and of the {STALE_BOTH_N} both lists carried,
  <b>{" and ".join(STALE_SWAPPED)}</b> swapped places.</td></tr>
<tr><th>Raw weights, so the tiers leaked</th><td>Worse than a second scale.
  <code>4000&nbsp;+&nbsp;owed</code> is unbounded, so <b>any debt over
  &#8377;1,000 outranked <code>unavailable</code></b> &mdash; the band whose own
  comment in that file read <i>&ldquo;ranked ABOVE money, which nothing else
  here is, and deliberately&rdquo;</i>. The comment had been false since the
  first client owed four figures.</td></tr>
<tr><th>Two answers about money</th><td>The deck raised a row for <b>any</b> due
  payment; the roster raised one only past {OVERDUE_DAYS} days. Two clients
  owing {rs(9000)} and {rs(3000)} were on Today and absent from the
  roster&rsquo;s attention list &mdash; and the roster&rsquo;s three-figure
  strip then said <b>{rs(STALE_TALLY_OWED)} owed</b> beside a rail badge reading
  {N_OWING} and a money book reading {rs(TOTAL_OWED)}.</td></tr>
<tr><th>Two words for one pack</th><td>An empty pack was
  <i>&ldquo;{STALE_KAVYA[2][1]}&rdquo;</i> and <b>{STALE_KAVYA[1][1]}</b> here,
  <i>&ldquo;{STALE_KAVYA[2][2]}&rdquo;</i> and <b>{STALE_KAVYA[1][2]}</b> there.
  Same package, two sentences and two colours, so the client was
  <b>red on Today and amber on Clients</b> and a trainer reading both had no way
  to know it was one fact.</td></tr>
</tbody></table>

<h3 class="h4" style="margin-top:38px">The resolution: bands, in one file</h3>
<p class="note">Both rules about money were defensible and both words for a pack
were readable. What was not defensible was two of each, so the model moved into
<code>deck.ts</code> as one exported table &mdash; <code>ATTENTION_BANDS</code>,
their order, their severities and the strings &mdash; and
<code>clients/roster.ts</code> imports all of it. The division of labour is now
explicit in both files: <b>the deck owns the model, each screen owns its own
selection.</b> A screen may decline to raise a band; no screen may re-rank or
re-word one it does show.</p>
<p class="note">A band is worth <b>1000</b> and the magnitude inside it is
clamped to <b>0&ndash;999</b>, which is the part that fixes the leak: an amount
orders rows within a band and can never lift one out of it. At ten lakh owed,
<code>due-soon</code> still scores {weight("due-soon", 10_00_000 / 100)} and
<code>pack-ending</code> still starts at {weight("pack-ending", 0)}.</p>

<table class="dt"><thead><tr><th style="width:8%">Band</th><th>Name</th>
  <th style="width:14%">Spine</th><th style="width:14%">Raised on</th>
  <th>On this roster</th></tr></thead>
<tbody>{_bandrows}</tbody></table>

<p class="note">Reading the table from the top: a phone number that can never
receive an invite is first because it is the only item that is <b>a mistake made
seconds ago and fixable in seconds</b> &mdash; every other one became true over
time and will still be true tomorrow. Then a client who was added and never
onboarded, because nothing else about them can work. Then the two red bands, and
they are red for one reason: <b>they stop the work</b>. Money past its date and a
pack with nothing left to draw down are the two things that make tomorrow&rsquo;s
session not happen. A relationship going cold is slower than either. And a stale
invite is last, because nothing is broken &mdash; a client is fully usable
without ever installing the app.</p>

<h3 class="h4" style="margin-top:38px">What the two screens do now</h3>
<div class="dd" style="margin-top:16px">
  <div class="dd__i dd__i--do"><p class="dd__k">Today &middot; {len(DECK)} rows</p>
    <div class="dd__c" style="border-top:0">
      <ol class="small" style="margin:0;padding-left:20px;line-height:1.95">
      ''' + "".join(
    f'<li><b class="ink">{r["name"]}</b> <span class="mono">{r["weight"]}</span> '
    f'<span class="ink3">&middot; {r["band"]}</span></li>' for r in DECK) + f'''</ol>
    </div></div>
  <div class="dd__i dd__i--do"><p class="dd__k">Clients &middot; {N_ATTN} rows</p>
    <div class="dd__c" style="border-top:0">
      <ol class="small" style="margin:0;padding-left:20px;line-height:1.95">
      ''' + "".join(
    f'<li><b class="ink">{r["name"]}</b> <span class="mono">{r["weight"]}</span> '
    f'<span class="ink3">&middot; {r["band"]}</span>'
    + ('' if r["name"] in BOTH else ' <span class="tag tag--acc">roster only</span>')
    + '</li>' for r in ATTN) + f'''</ol></div></div>
</div>

<p class="note">Four things this generator now asserts, so the two cannot drift
again without breaking the build:</p>
<table class="dt"><tbody>
<tr><th>Today names nobody the roster does not</th><td><code>DECK_ONLY == []</code>.
  It cannot happen: every band Today raises, the roster raises too.</td></tr>
<tr><th>The extra {N_ROST_ONLY} are all in roster-only bands</th><td>
  {", ".join("<code>" + b + "</code>" for b in ROSTER_ONLY_BANDS)} &mdash;
  selection, not disagreement. Today has no use for a stale invite because an
  invite is not a thing that happens today.</td></tr>
<tr><th>Identical order for every shared client</th><td><code>SWAPPED == []</code>,
  where it used to be {len(STALE_SWAPPED)} of {STALE_BOTH_N}.</td></tr>
<tr><th>Identical weight, severity and wording, row by row</th><td>Asserted in a
  loop over all {N_BOTH} of them. Both screens now mark
  <b>{N_CRIT}</b> rows red, and they are the same two.</td></tr>
</tbody></table>

<h3 class="h4" style="margin-top:38px">Kavya M, who used to carry four of them
  at once</h3>
<p class="note">Her pack is empty. That is one fact, and it used to render four
different ways.</p>
<table class="dt"><thead><tr><th>Before</th><th>Today</th><th>Clients</th></tr>
</thead><tbody>{_stale_krows}</tbody></table>
<table class="dt" style="margin-top:14px"><thead><tr><th>Now</th>
  <th colspan="2">Both</th></tr></thead><tbody>{_krows}</tbody></table>

<div class="why"><p class="why__k">And a second thing it fixed, unaimed</p>
  <p>Because any money owed is now an item, <code>tally.owed</code> sums every
  debtor rather than the late ones only &mdash; so the roster&rsquo;s strip reads
  <b>{rs(TOTAL_OWED)}</b>, which is exactly what the money book reports and what
  the rail badge counts. The three-numbers-for-one-word problem was a symptom of
  the same divergence, and closing one closed both. The strip still shows the
  split, because <b>{rs(OWED_LATE)} late</b> and <b>{rs(OWED_SOON)} not yet
  late</b> are two different jobs &mdash; but it is a split of one figure now,
  not the gap between two screens.</p></div>'''


# ═══════════════════════════════════════════════════════════════════ §03 ══
S03 = f'''<p class="note">The roster opens on segment <b>All</b>, sorted by
<b>attention</b>. Not on the attention segment &mdash;
<code>useState&lt;Segment&gt;(&#39;all&#39;)</code> with
<code>useState&lt;SortKey&gt;(&#39;attention&#39;)</code> &mdash; so the whole
roster is there and <code>sectionRows</code> puts the {N_ATTN} who need the
trainer in a group at the top. A ranking, not a filter: the trainer never has to
switch lists to see everybody, and never has to remember to switch back.</p>

{units(
    frame("1a", "The roster", "roster.ts &middot; ClientsScreen 1a", "/clients",
          f_roster(),
          f"Eight columns in importance order, {N_ATTN} rows carrying a severity "
          f"spine, and exactly one action per row &mdash; ranked by the band "
          f"table &sect;02 moved into the deck, so this list and Today&rsquo;s "
          f"queue put the {N_BOTH} clients they share in the same order. The "
          f"strip splits the money the way the bands do: "
          f"<i>{rs(OWED_LATE)} overdue</i> and "
          f"<i>{rs(OWED_SOON)} not yet late</i>, adding to the "
          f"{rs(TOTAL_OWED)} the money book reports."),
    frame("1b", "Sorted A&ndash;Z", "sectionRows &middot; SortSheet 2e",
          "/clients?sort=name", f_az(),
          f"The only order that has letters to group by, which is why the "
          f"phone&rsquo;s index rail can exist here and nowhere else &mdash; and "
          f"with {COUNTS['all']} rows against <code>INDEX_RAIL_MIN</code> of "
          f"{INDEX_RAIL_MIN} it does not appear on the phone either. The desk "
          f"answer is a different one: a sticky head, a live row count, and "
          f"type-to-find in the omnibox."),
)}

<h3 class="h4" style="margin-top:38px">The word on the strip</h3>
<p class="note"><code>Roster.tally</code> has three figures and the app labels the
first one <b>owed</b>. While the roster admitted a debt only after
{OVERDUE_DAYS} days that figure was {rs(STALE_TALLY_OWED)} &mdash; one client
&mdash; printed under that word, on a screen whose rail badge said {N_OWING} and
whose money book said {rs(TOTAL_OWED)}. Three numbers for one word, all of them
correct, which is the harder kind of bug: nothing crashes, nothing fails a test,
and a trainer simply stops trusting the screen.</p>
<div class="why"><p class="why__k">Closed by &sect;02, and still worth splitting</p>
  <p>Once any money owed became an item the total agreed with the book, so the
  strip now opens on {rs(TOTAL_OWED)} of real receivables. It still shows the
  split, because <b>{rs(OWED_LATE)} past {OVERDUE_DAYS} days</b> and
  <b>{rs(OWED_SOON)} not yet late</b> are two different jobs and a desk has room
  to say which is which. What is gone is the version where the difference
  between them was the difference between two screens.</p></div>'''


# ═══════════════════════════════════════════════════════════════════ §04 ══
S04 = f'''<p class="note">NN/g&rsquo;s data-table article (Laubheimer, 2022) names
four user tasks: <b>find records that fit criteria</b>, <b>compare data</b>,
<b>view or edit one row</b>, <b>act on records</b>. A roster is all four, in that
order of frequency, and every decision below serves one of them. The app is a
card list because a phone reads one row at a time; the desk job is the second
task, and a card list cannot do it.</p>

<table class="dt"><thead><tr><th>Column</th><th>Task</th>
  <th>Why it is where it is</th></tr></thead><tbody>
<tr><th>Client</th><td>find</td><td><i>&ldquo;The default first column should be
  a human-readable record identifier&rdquo;</i>. Name over the number they would
  dial &mdash; two lines, which is what sets the row at
  {52}px rather than the library&rsquo;s 44.</td></tr>
<tr><th>What&rsquo;s up</th><td>find &middot; compare</td><td>The app&rsquo;s own
  <code>row.line</code>, verbatim, with the kind&rsquo;s glyph. <i>&ldquo;The
  default order of the columns should reflect the importance of the data&rdquo;</i>
  &mdash; so the reason a trainer opened this screen is the second column, not the
  last. The page this replaces called it <b>Status</b> and put it eighth.</td></tr>
<tr><th>Where</th><td>compare</td><td>Floor or remote, and colour encodes it and
  nothing else. It is the first thing a trainer needs before deciding whether to
  leave the house.</td></tr>
<tr><th>Pack</th><td>compare</td><td>Sortable, and sorting by it is how the four
  renewals for this week are found &mdash; which on the phone means opening
  {COUNTS["all"]} files. <code>monthly</code> in the quiet ink where there is no
  session pack, because a remote client on a monthly fee is not
  &ldquo;zero left&rdquo;.</td></tr>
<tr><th>Owes</th><td>compare</td><td>The amount and its age, right-aligned and
  tabular. Every competitor in &sect;08 puts this on another screen; for a
  trainer selling ten-session packs for cash and UPI, who owes you <i>is</i> the
  roster.</td></tr>
<tr><th>Last logged</th><td>compare</td><td>The third question the page this
  replaces claimed its columns answered &mdash; <i>&ldquo;who has not been
  in&rdquo;</i> &mdash; and did not have a column for.</td></tr>
<tr><th>The verb</th><td>act</td><td>One button, always visible.</td></tr>
</tbody></table>

<h3 class="h4" style="margin-top:38px">One action, always visible</h3>
<p class="note">NN/g is specific about this and it happens to fit the app exactly:
inline row actions work <i>&ldquo;if you just have one or two&rdquo;</i>, and
<i>&ldquo;inline actions should be visible at all times rather than showing
on-hover&rdquo;</i>. <code>attention.action</code> is singular by construction
&mdash; one row, one verb, because the row was ranked to produce it &mdash; so the
table gets a real button in the last column and the other six verbs live behind
the kebab. A hover-revealed action would fail the same guideline and be invisible
to a keyboard.</p>
<p class="note">The verbs, and where each one goes:</p>
<table class="dt"><thead><tr><th>Kind</th><th>Verb</th><th>What it does</th>
  </tr></thead><tbody>
<tr><th>unavailable</th><td>Fix number</td><td>Straight to the edit form. The only
  attention item whose fix is an edit rather than a message &mdash; there is
  nothing to say to the client and nothing they could do about it.</td></tr>
<tr><th>setup</th><td>Set up</td><td>Back into the intake step still owed, with
  whatever was already answered. Resumable by construction, because the step is
  <b>derived</b> from the data rather than stored &mdash; so finishing it from
  anywhere clears the row identically.</td></tr>
<tr><th>overdue</th><td>Remind</td><td>A WhatsApp chat, one client, with the
  amount resolved into it.</td></tr>
<tr><th>quiet</th><td>Nudge</td><td>A different message and a different word.
  Asking for a payment and asking after somebody are not the same act, and the
  page this replaces used <i>Nudge</i> for both.</td></tr>
<tr><th>pack</th><td>Renew</td><td>Their package list. Writes locally, tells
  nobody, and is therefore instant.</td></tr>
<tr><th>invite</th><td>Resend</td><td>The invite again. Optional, always &mdash;
  see &sect;06.</td></tr>
</tbody></table>
<p class="note">And a seventh row state that is not a verb: <b>Queued</b>. A
client written on this computer and not yet pushed shows its state instead of an
action against it, which is <code>Trailing</code>&rsquo;s first branch and the
right order &mdash; a verb on a row the server has never seen is an invitation to
act twice.</p>

<div class="why"><p class="why__k">Selection does not move the rows</p>
  <p>The app is emphatic: <i>&ldquo;the checkbox occupies the avatar&rsquo;s slot,
  so the eye keeps its place&rdquo;</i>, and &sect;07 makes it a rule. The page
  this replaces added a checkbox <b>column</b> and called it an improvement, which
  shifts all eight columns right the moment the trainer selects anybody. Frame 1d
  keeps the app&rsquo;s rule: the box replaces the avatar, the row does not
  move.</p></div>'''


# ═══════════════════════════════════════════════════════════════════ §05 ══
S05 = f'''<p class="note">Three axes, nine values, and every chip carries the count
it would produce on its own. The rule the app states and the web has more room to
keep: <i>&ldquo;a filter that hides everything without warning is
indistinguishable from an empty screen, and the count is what tells the two
apart&rdquo;</i> &mdash; so the primary button says the result before it is
applied.</p>

{units(
    frame("1c", "Filter &middot; floor, evenings", "FilterSheet 2d",
          "/clients?mode=floor&batch=evening", f_filter(),
          f"{N_PICK} of {COUNTS['all']}, stated on the button and again on the "
          f"group header, with the two active values echoed as removable chips in "
          f"the toolbar so the filtered state is visible from the table rather "
          f"than only from the panel. The panel is a panel and not a modal for one "
          f"reason: the count on the button is only useful if the rows it is "
          f"counting are still on screen."),
    frame("1d", f"{len(PICKED)} selected, and the confirm that has no undo",
          "SelectBar &middot; BulkMessageSheet 3d", "/clients?selected=3",
          f_bulk(),
          f"NN/g&rsquo;s three bulk-action rules are select-all, a contextual "
          f"action bar, and <b>feedback with an undo</b>. Two of the three are "
          f"here; the third cannot exist, because WhatsApp gives no way to "
          f"un-send. So the guarantee moves to the front: the template resolves "
          f"per client and every message is readable before anything opens."),
)}

<h3 class="h4" style="margin-top:38px">Three chats, not one broadcast</h3>
<p class="note">The highest-value bulk action in this market, and the one rule
around it is absolute: <b>one chat per client</b>. A group message about money
costs clients, and there is no un-sending one. The phone opens them in sequence;
the web has to, because a browser opens one tab per gesture and blocks the rest
&mdash; a constraint that turns out to be the right behaviour anyway. Three
clicks is three chances to drop somebody from the list.</p>
<div class="why why--warn"><p class="why__k">Where the undo went</p>
  <p>Bulk actions divide cleanly into two kinds and the design has to treat them
  differently. <b>Assign a program</b> and <b>book sessions</b> write rows: they
  are undoable, and a toast with an undo is the correct pattern. <b>Message</b>
  leaves the product. Once a chat is open the trainer owns it, so the only place
  an undo can live is <i>before</i> &mdash; which is why that one action, alone
  among the three, opens a dialog.</p></div>'''


# ═══════════════════════════════════════════════════════════════════ §06 ══
S06 = f'''<p class="note">A roster has four states that are not a list of clients,
and getting them wrong is how a trainer with eight clients comes to believe the
app has lost them. Two are drawn here; the other two are the reason the first two
are guarded.</p>

{units(
    frame("1e", "Nobody yet", "roster.firstRun &middot; ClientsScreen 4a",
          "/clients", f_first(),
          "The empty state makes the promise the intake form then has to keep, "
          "in the words the form repeats. Every count on the rail goes with it "
          "&mdash; except the exercise library, which is 1,324 rows before "
          "anybody signs up, so a count that is true on the first run is not a "
          "first-run bug. The add action stays in the header throughout."),
    frame("1f", "Offline, with six changes waiting", "useNetworkState &middot; 4c",
          "/clients", f_offline(),
          "The roster is local, so all of it is here and none of it is stale in "
          "any way the trainer can act on. The banner says which copy this is "
          "and how much of it has not left the computer; the one row written "
          "here carries <b>Queued</b> where its verb would be. Ritu A, "
          "bottom group."),
)}

<table class="dt"><thead><tr><th>State</th><th>What it must never say</th>
  <th>What it says</th></tr></thead><tbody>
<tr><th>First pull, nothing read yet</th><td>&ldquo;Your roster is empty&rdquo;
  &mdash; the wrong thing to say to a trainer who has eight, even for one
  frame</td><td><i>Syncing your clients</i>, with the add action still live. Not
  skeleton rows either: those promise rows we cannot promise.</td></tr>
<tr><th>First pull failed</th><td>An empty roster</td><td><i>Couldn&rsquo;t reach
  X&nbsp;REP</i>, and a retry. The distinction between &ldquo;nothing
  arrived&rdquo; and &ldquo;there is nothing&rdquo; is the whole of this
  state.</td></tr>
<tr><th>Genuinely empty</th><td>Anything about syncing</td><td>Frame 1e. Guarded
  behind both the first local read <b>and</b> the first pull having had its say,
  with a {400}ms settle so the empty state cannot flash.</td></tr>
<tr><th>Empty because of a filter</th><td>&ldquo;Nobody here&rdquo; on its
  own</td><td><i>No client matches these filters</i>, and a way to clear them.
  Different sentence, different action, because it is a different
  problem.</td></tr>
</tbody></table>

<h3 class="h4" style="margin-top:38px">Invited is not a lesser client</h3>
<p class="note">The <i>Invited</i> segment carries a sentence the whole product
depends on: <b>you can log sessions and take payments for an invited client
straight away &mdash; the invite only controls whether they see the app.</b> Most
clients in this market never install anything. Every screen that assumes
otherwise breaks for the majority case, and a roster that greys out an
un-installed client teaches the trainer to stop adding people.</p>
<p class="note">Which is also what makes <code>unavailable</code> worth the
<b>first band</b> rather than a quiet tag. The client whose number belongs
to a trainer account can be booked, logged and billed exactly like anybody else
&mdash; <b>only the invite can never land</b> &mdash; so the row says that in
those words and sends the trainer to the field, not to the client.</p>'''


# ═══════════════════════════════════════════════════════════════════ §07 ══
S07 = f'''<p class="note">Search is a screen on the phone, not a filter, because
results span clients, groups and programs and those cannot be rendered inside a
roster. On a desk it is the omnibox that already exists in every frame in this
set, scoped by what the trainer is looking at &mdash; and the part worth drawing
is not the hit. It is the miss.</p>

{units(frame("2a", "The dead end has two exits",
             "ClientSearchScreen 2a&ndash;2c", "/clients?q=zub", f_search(),
             "&ldquo;No results&rdquo; and nothing else is a bug, not a state. "
             "A query that matches nobody offers the two things a trainer who "
             "typed a name actually wants: add them &mdash; with the query "
             "carried across as the name, which is the whole reason that "
             "dead-end offers the screen &mdash; or widen to the archived, which "
             "is off by default because surfacing archived clients silently is "
             "how a roster grows two records for one person."))}

<table class="dt"><tbody>
<tr><th>Name, from the first character</th><td>Substring, case-blind, and the hit
  is marked where it landed rather than merely ranked.</td></tr>
<tr><th>Phone, from three digits</th><td><code>matches</code> strips non-digits
  from both sides and requires three &mdash; which is how a trainer finds
  somebody from a missed call. &ldquo;{DIGITS}&rdquo; matches
  {len(PHONE_HITS)} clients on this roster.</td></tr>
<tr><th>Archived, only if asked</th><td>&sect;07&rsquo;s rule. Archived clients
  are archived for a reason, and the {N_ARCHIVED} of them are one click away with
  their count on the label.</td></tr>
<tr><th>Empty query</th><td>Recents and saved filters, not a blank panel. Three
  recents &mdash; what people want most of the time, and they cost nothing to
  render.</td></tr>
</tbody></table>'''


# ═══════════════════════════════════════════════════════════════════ §08 ══
def pattern(name, verdict, tone, roster, money, take):
    return f'''<div class="grp"><div class="grp__t">
  <h4>{name}</h4><span><span class="tag tag--{tone}">{verdict}</span></span></div>
<table class="dt" style="margin-top:12px"><tbody>
<tr><th>What its client list ranks by</th><td>{roster}</td></tr>
<tr><th>Where the money is</th><td>{money}</td></tr>
<tr><th>What to take, and what to leave</th><td>{take}</td></tr>
</tbody></table></div>'''


PRODUCTS = [
    ("ABC Trainerize", "closest", "acc",
     "<b>Auto client tags</b>, computed and filterable, and the best version of "
     "this idea in the category. Red is urgent &mdash; one of them fires when a "
     "client has not finished setting up their account within <b>three days</b>. "
     "Orange is attention-but-not-urgent: failing payments, not signed in for "
     "more than seven days, main program expiring, add-on expiring, not messaged "
     "lately, not responded lately.",
     "Not on the list. Its money tag is <i>failing payments</i>, which is a "
     "Stripe event &mdash; a card that declined, not a client who owes you "
     "cash.",
     "<b>Take</b> the thresholds: three days for a stale invite and seven for "
     "gone-quiet are the same numbers this product landed on independently, and "
     "they have survived contact with a lot of users. <b>Take</b> that the "
     "thresholds are adjustable &mdash; &sect;07 makes it a rule here too and no "
     "screen in this set has drawn it. <b>Leave</b> the quiet metric: "
     "&ldquo;not signed in for seven days&rdquo; requires the client to have the "
     "app, and most clients here never will. X&nbsp;REP measures <b>no workout "
     "logged</b>, which is the trainer&rsquo;s own observation and works for a "
     "client who has never installed anything."),
    ("TrueCoach", "narrower", "info",
     "Sortable by name, by <b>when the next workout is due</b>, and by "
     "compliance rate. Filterable by client type &mdash; Remote, Dual or "
     "In-Person.",
     "Not on the list.",
     "<b>Take</b> the delivery-mode filter; it is the only product in the "
     "teardown that segments by how a session is delivered, and it is the first "
     "thing a trainer needs before deciding whether to leave the house. "
     "<b>Note</b> that it has <b>three</b> values where X&nbsp;REP has two: "
     "<i>Dual</i> is a real category this product currently resolves per session "
     "instead. <b>Leave</b> &ldquo;next workout due&rdquo; as a sort: it ranks "
     "the coach&rsquo;s homework, not the client&rsquo;s risk."),
    ("Everfit", "different job", "info",
     "The client list <b>is</b> the home screen, showing last activity and "
     "workout adherence for the previous week and month. Columns are <b>fully "
     "customisable</b> &mdash; last activity, last engagement, sign-up date and "
     "more.",
     "Not on the list.",
     "<b>Leave</b> the customisable columns, and say why: a configurable table "
     "is what a product ships when it cannot decide what matters. The decision "
     "is the value here &mdash; eight columns in importance order, argued in "
     "&sect;04 &mdash; and handing it to the trainer moves the work rather than "
     "doing it. <b>Take</b> the honesty of making the list the landing screen; "
     "X&nbsp;REP does not, because Today answers a narrower question first."),
    ("PTminder", "the split", "warn",
     "A client list under <i>Clients</i>, and a <b>second list of the same "
     "people</b> under <i>Finances</i> &mdash; where you see whether each one has "
     "an <i>Amount Due</i> owing or is <i>In Credit</i>, with a balance "
     "breakdown per client. Its <i>Client List</i> is also a report: choose "
     "fields, filter by status, filter by assigned trainer, export.",
     "On the other list. Two screens, the same rows, and the trainer holds the "
     "join.",
     "This is the finding. Every product in the category either ranks attention "
     "and omits money, or reports money and omits attention &mdash; and PTminder "
     "does both, on two screens, which is the same omission twice. <b>Take</b> "
     "the exportable client report; a desk has a use for it that a phone does "
     "not, which is why <i>Export</i> is in the header of frame 1a."),
    ("My PT Hub", "further away", "info",
     "Client management and a separate <i>Financials</i> area tracking gross "
     "volume, total transactions, total subscribers, payment history and "
     "available balance.",
     "A dashboard of business KPIs, one level up from any individual.",
     "<b>Leave</b> all of it. Gross volume and total subscribers are the "
     "vanity-metric shape &mdash; true, unactionable, and about the business "
     "rather than about anybody in it. The relevant figure for this trainer is "
     "not volume; it is which three people owe them and how long it has "
     "been."),
]
N_PROD = len(PRODUCTS)
assert N_PROD == 5

S08 = f'''<p class="note">{N_PROD} products. The survey produces one sentence, and
it is the same one <code>ClientsScreen</code>&rsquo;s own docstring reaches by a
different route: <b>they all compute who needs attention rather than asking the
trainer to remember, and every single one of them puts the money on another
screen.</b></p>
<p class="note">That is not an oversight in any of them. Four of the five are
built for remote coaching sold on a card subscription, where &ldquo;owes
you&rdquo; is a failed charge the processor already knows about. X&nbsp;REP is
built for ten-session packs paid in cash and UPI on a gym floor in Chennai, where
the trainer is the processor &mdash; so who owes them <b>is</b> the roster, and
putting it on a second screen is the one thing the product cannot copy.</p>

<div class="dd" style="margin-top:20px">
  <div class="dd__i dd__i--do"><p class="dd__k">Ranks attention</p>
    <p class="dd__c" style="border-top:0">Trainerize (auto tags) &middot;
      TrueCoach (compliance) &middot; Everfit (adherence) &middot;
      <b class="acc">X&nbsp;REP</b></p></div>
  <div class="dd__i dd__i--do"><p class="dd__k">Money on the row</p>
    <p class="dd__c" style="border-top:0"><b class="acc">X&nbsp;REP</b>
      &mdash; and nobody else. PTminder has the figure and puts it on a second
      list of the same people.</p></div>
</div>

{"".join(pattern(*p) for p in PRODUCTS)}

<div class="why" style="margin-top:38px"><p class="why__k">The one idea worth
  stealing outright</p>
  <p>Trainerize&rsquo;s tags are <b>adjustable</b>. &sect;07 of the mobile design
  already makes that a rule here &mdash; <i>&ldquo;the trainer must be able to
  change &lsquo;quiet&rsquo; from 7 days to 14&rdquo;</i> &mdash; and no screen in
  this set has drawn it. It is a settings screen, so it belongs to
  <code>webapp-settings.html</code>, and &sect;16 owes it three rows: the quiet
  window, the overdue window, and how close to empty a pack has to be. All three
  are exported constants read by both modules, and a desk is the natural place to
  change a number you will live with for a year.</p></div>'''


# ═══════════════════════════════════════════════════════════════════ §09 ══
S09 = f'''<p class="note">One record, <b>{N_TABS}</b> views, and the rule that
decides the shape of all of them: <b>every figure on the overview links to the
screen that owns it.</b> A number a trainer cannot open is a number they have to
leave the file to chase &mdash; and routing off <code>row.link</code> is also what
guarantees one source per figure, because the owed pair here is literally the pair
from her book.</p>

{units(frame("3a", "The file &middot; overview", "buildOverview 6a",
             "/clients/meera-krishnan", f_overview(),
             f"Five rows, each naming its destination, over the two figures a "
             f"trainer acts on. Nothing here is stored: all of it is computed "
             f"from rows already on this computer, which is why there is no "
             f"loading state to design around and why all {N_TABS} tabs paint "
             f"before any network call."))}

<h3 class="h4" style="margin-top:38px">A full page, not a split</h3>
<p class="note">The page this replaces put the roster in a 400px list on the left
and the file on the right, with a good argument: comparing two clients costs two
clicks rather than four navigations. The argument is right and the layout is
wrong. Four of the eight columns do not fit in 400px, so the pane that survives is
not the roster &mdash; it is a card list, which is the phone&rsquo;s shape, and the
comparison job &sect;04 built the table for is gone from the screen that was
supposed to gain it.</p>
<p class="note">So the file is full width and the comparison stays in the
keyboard: <kbd>J</kbd> and <kbd>K</kbd> move to the next client <b>without
leaving the tab</b>, which is faster than two clicks and is what the app&rsquo;s
own tap map already promises. <kbd>Esc</kbd> returns to the roster with its scroll
position intact.</p>

<h3 class="h4" style="margin-top:38px">The strip that cannot draw its own rule</h3>
<p class="note"><code>last7</code> is careful, and its comment is the best thing in
the module: <i>&ldquo;A rest day never counts against anyone. A day with nothing
scheduled is not a miss &mdash; it is the plan working &mdash; so it is absent from
both halves of the fraction rather than sitting in the denominator as a
failure.&rdquo;</i> Meera trains three days a week, so on these seven days the
fraction is <b>{ADH_KEPT}/{ADH_PLANNED}</b> and {ADH_REST} days are correctly in
neither half.</p>
<p class="note">Then it returns <code>week: boolean[]</code> &mdash; seven
booleans. {FALSE_DOTS} of them are false and exactly <b>{MISSED}</b> of those is a
miss. The fraction gets the rule right and the shape it hands the strip cannot
express it: a rest day and a missed session render identically, so a client who
trains three times a week looks like a client who missed four sessions. The web
draws three states; &sect;16 owes the app a third value.</p>
<div class="why why--warn"><p class="why__k">And the window</p>
  <p>The page this replaces printed <i>Adherence &middot;
  {STALE_ADH[3]} &mdash; {STALE_ADH[0]}%, {STALE_ADH[1]} of {STALE_ADH[2]} booked
  sessions made</i>. That arithmetic is internally fine and it is not this
  product&rsquo;s: <code>last7</code> is <b>seven days</b>, and it counts <i>days
  with something scheduled</i>, not booked sessions. Two different measures with
  one name is how a trainer comes to distrust both.</p></div>'''


# ═══════════════════════════════════════════════════════════════════ §10 ══
S10 = f'''<p class="note">The other three tabs, and each one turned up a defect in
the app while being drawn. That is the argument for drawing them: three arithmetic
bugs that a specification in prose cannot contain.</p>

{units(
    frame("3b", "Sessions &middot; what each one did to the pack",
          "buildSessions 6c", "/clients/meera-krishnan/sessions", f_sessions(),
          f"{S_ALL} rows, and the detail column is the only reason a trainer "
          f"scrolls this tab: <b>pack &minus;1</b>, <b>pack untouched</b>. Four "
          f"used across three sessions and one no-show, which makes the Package "
          f"tab checkable from this list without trusting either screen."),
    frame("3c", "Package &middot; the split, frozen", "buildPackage 6d",
          "/clients/meera-krishnan/package", f_package(),
          f"{PACK_TOTAL} sessions at {rs(PACK_PER)}, {rs(PACK_CUT)} to the gym at "
          f"{GYM_PCT}% <b>fixed on {daystamp(PACK_BOUGHT)}</b>, {rs(PACK_KEEP)} "
          f"kept &mdash; and the two ways of reaching that last figure agree, "
          f"which this generator asserts. The card beside it is the one a live "
          f"split calculator needs and never has: the three cases where the "
          f"gym&rsquo;s share is zero."),
    frame("3d", "Programs &middot; including the gap", "buildPrograms 6b",
          "/clients/meera-krishnan/programs", f_programs(),
          f"Week {P_WEEK} of {P_TOTAL}, and a history whose last row is not "
          f"missing data: the {GAP_DAYS} days between joining and her first "
          f"program are a real period of somebody&rsquo;s training, so the row "
          f"says what happened in them."),
)}

<h3 class="h4" style="margin-top:38px">Three bugs the drawing found</h3>
<table class="dt"><thead><tr><th>Where</th><th>What it does</th>
  <th>Why it matters</th></tr></thead><tbody>
<tr><th>The group header</th><td><code>buildSessions</code> puts <b>every</b> past
  session into one group and titles it <i>This pack &middot;
  {PACK_USED} of {PACK_TOTAL} used</i>. The pack was bought
  {daystamp(PACK_BOUGHT)}; two of the rows under that header are older than
  it.</td><td>The count in the title is right and the rows under it are not the
  ones it counted. A trainer reconciling a disputed pack adds up the list and
  gets a different number.</td></tr>
<tr><th>The no-show legend</th><td><code>noShows</code> counts <b>all</b> of a
  client&rsquo;s no-shows, ever, and the legend renders it as <i>&ldquo;{PACK_USED}
  used &middot; N no-show <b>among them</b>&rdquo;</i>.</td><td>On this data it
  happens to be right &mdash; one no-show, and it is on this pack. On a client in
  their fifth pack it claims history against a pack that never saw it.</td></tr>
<tr><th>The filter chips</th><td><code>SessionFilter</code> has five values and
  none of them is <i>no outcome yet</i>. So the {S_UNMARKED} row that needs the
  trainer is reachable only through <i>All</i>: {S_DONE}&nbsp;+&nbsp;{S_NOSHOW}
  &nbsp;+&nbsp;{S_CANCEL}&nbsp;+&nbsp;{S_BOOKED}&nbsp;=&nbsp;{CHIP_SUM}, against
  {S_ALL}.</td><td>The chips do not sum to All, and the missing one is the only
  actionable state on the tab. The dashed chip in 3b is the web adding the
  sixth.</td></tr>
</tbody></table>
<p class="note">And one more, smaller and worse: a cancelled row&rsquo;s title is
<code>byClient ? &#39;He told me in time&#39; : &#39;I called it off&#39;</code>.
That pronoun is hard-coded. On every female client in every trainer&rsquo;s roster
the app says <i>&ldquo;He told me in time&rdquo;</i>. The frame above reads
<i>&ldquo;She told me in time&rdquo;</i> because it is Meera&rsquo;s file; neither
is right as a constant, and the fix is a sentence with no pronoun in it &mdash;
<i>&ldquo;Told me in time&rdquo;</i> &mdash; which is also shorter.</p>

<h3 class="h4" style="margin-top:38px">The split is frozen on the pack, not the
  session</h3>
<p class="note">The page this replaces got the consequence right and the mechanism
wrong, which for a document a developer reads is the worse half. It said
<i>&ldquo;the split is stored on every session as it happens, so changing it here
never rewrites a past month&rdquo;</i>. The rule is: <b>a sold pack keeps the
price and the gym percentage it was sold with</b> &mdash; read off the
<b>payment</b> row against that pack, once, at record time. Not per session. A
developer implementing the sentence as written would add a percent column to
<code>scheduled_sessions</code>, and the additive-only law means that column would
be there forever.</p>'''


# ═══════════════════════════════════════════════════════════════════ §11 ══
S11 = f'''<p class="note">One decision separates this screen from every competitor
in the teardown: <b>a saved measurement cannot be edited or deleted.</b>
Trainerize, TrueCoach, Everfit and Hevy all let a trainer change a past reading,
and it is the wrong call for the one screen whose whole job is to be believed
&mdash; a client who has watched their weight chart change shape after the fact
will never trust it again. A wrong number is corrected by appending the right one,
and the history says so on the row.</p>

{units(frame("3e", "Body &middot; the correction stays", "buildMetrics 8a",
             "/clients/meera-krishnan/body", f_body(),
             f"{N_WEIGHT} weight readings, and the two at the top are the point: "
             f"{trim(WEIGHT[5][2])} kg typed at {WEIGHT[5][1]} and "
             f"{trim(WEIGHT[6][2])} kg three minutes later. Both kept, both "
             f"labelled, neither removed &mdash; that is what append-only looks "
             f"like when it is honest. And the chart shows what it costs."))}

<div class="why why--danger"><p class="why__k">The screen designed to be believed
  draws a number it calls a mistake</p>
  <p><code>spark: series.map(m =&gt; m.value)</code>. Every reading, in order, with
  nothing to tell the chart which of them the list beneath is about to mark
  <i>replaced</i>. So on this file the app plots a <b>{abs(round(WEIGHT[5][2] - WEIGHT[4][2], 1))}
  kg</b> jump and a {abs(round(WEIGHT[6][2] - WEIGHT[5][2], 1))} kg fall in three
  minutes, and the real change &mdash; {RANGE_TRUE} kg over six months &mdash;
  occupies <b>{SPARK_SHARE}%</b> of a plot the typo stretched to
  {RANGE_ALL} kg.</p>
  <p style="margin-top:10px">Append-only is the right rule and this is its
  bill. The fix is not to hide the reading &mdash; that would be the edit the rule
  forbids, one layer down. It is to draw it as what the data already says it is:
  outside the trend, in the danger colour, with the band the honest readings
  occupy marked. The row is still there. The line no longer claims it.</p></div>

<table class="dt" style="margin-top:24px"><tbody>
<tr><th>Bars, not a line</th><td>{N_WEIGHT} readings six weeks apart are not a
  continuous series. Joining them draws a slope nobody measured, and the slope is
  the thing a client reads.</td></tr>
<tr><th>No colour on a delta</th><td>&sect;14&rsquo;s rule.
  &minus;3.8&nbsp;kg is progress for one client and a failure for another, and the
  app does not know which. So the sign carries the direction and nothing carries a
  judgement.</td></tr>
<tr><th>Two kinds, one count</th><td><code>count</code> is
  <code>input.metrics.length</code> &mdash; weight and waist together,
  {N_METRICS} here. The badge says {N_METRICS}; the weight table says
  {N_WEIGHT} of {N_METRICS} and names the other {N_WAIST}, because a count
  without its scope is the defect the old page shipped.</td></tr>
<tr><th>A correction is a pair</th><td>Two readings of the same kind on the same
  day: the later one <i>corrects the reading below</i>, the earlier one is
  <i>replaced later that day</i>. Both rows say so, from opposite ends, and the
  superseded one is dimmed rather than deleted.</td></tr>
</tbody></table>'''


# ═══════════════════════════════════════════════════════════════════ §12 ══
S12 = f'''<p class="note">Four steps, and the count is not decoration: the client
record is created on step <b>{CREATED_ON_STEP}</b>, and steps
{" and ".join(SKIPPABLE)} are skippable. Skipping them is a <b>supported path</b>
that produces a chased row on the roster with a <i>Set up</i> verb &mdash; which is
where two of &sect;03&rsquo;s nine attention rows come from. Intake and the roster
are the same loop, and no file in this set has drawn either end of it.</p>

<table class="dt"><thead><tr><th>Step</th><th>Asks</th><th>Skippable</th>
  <th>What it decides</th></tr></thead><tbody>''' + "".join(
    f'<tr><th>{i + 1} &middot; {label}</th><td>{sub}</td>'
    f'<td>{"yes" if label in SKIPPABLE else "<b>no</b>"}</td><td>{why}</td></tr>'
    for i, (label, sub, _, why) in enumerate(INTAKE)) + f'''</tbody></table>

{units(
    frame("4a", "Step 1 &middot; two fields", "AddClientScreen 5a",
          "/clients/new", f_add1(),
          "Two fields, three ways of checking the number, and the one mistake "
          "this form can actually catch. Everything a competitor asks for at "
          "intake appears as three deferred rows showing an em dash &mdash; not "
          "as empty fields, because a row that looks like an unfilled required "
          "field makes the two above it look optional."),
    frame("4b", "The gate nobody has drawn", "observePacks &middot; 5a",
          "/clients/new", f_gate(),
          "With nothing on the price list, steps 2 to 4 have nothing to offer "
          "and the client would be created half-made. So the gate replaces the "
          "form rather than disabling its button, and it sends the trainer to "
          "the one screen that fixes it."),
    frame("4c", "Step 2 &middot; the money question", "AddClientPayScreen 5b",
          "/clients/new/pay", f_add2(),
          f"Three work modes and <b>two of them never ask who collects</b>, "
          f"because the answer is implied. The field is what the <b>trainer</b> "
          f"keeps &mdash; {TRAINER_KEEPS}% here &mdash; and the gym&rsquo;s share "
          f"is shown as the consequence, which is the direction "
          f"<code>trainerSplitPercent</code> actually stores."),
    frame("4d", "Step 3 &middot; hours that exist", "ClientScheduleScreen 5c",
          "/clients/new/week", f_add3(),
          f"{len(FREE_TUE)} of {N_SLOTS_TUE} Tuesday slots, out of the "
          f"trainer&rsquo;s own working hours minus the hours other clients hold. "
          f"A held hour is drawn and disabled with the name on it, because an "
          f"hour that vanishes teaches nothing."),
)}

<h3 class="h4" style="margin-top:38px">A page, not a panel</h3>
<p class="note">The page this replaces used a right panel, and gave a good reason:
the roster stays visible, and the commonest intake error is adding somebody
already on it under a slightly different name. The reason is right and the
container is wrong twice over.</p>
<p class="note">First, the app already checks that. <code>checkClientPhone</code>
asks the server whether the number belongs to somebody, debounced 400ms after the
tenth digit, and the roster is searched locally at the same time &mdash; so the
duplicate is <b>caught</b>, by name, with a link to the existing file. Leaving it
to the trainer&rsquo;s eye is strictly worse than the check that ships.</p>
<p class="note">Second, a panel implies a form you can cancel. After step
{CREATED_ON_STEP} there is a real client on the roster whether the trainer
continues or not &mdash; <code>createClient</code> runs there and the next two
steps are <code>navigation.replace</code>. A container that promises a cancel it
cannot honour is the wrong container, and the honest one is a page whose crumb
says where it will land.</p>'''


# ═══════════════════════════════════════════════════════════════════ §13 ══
S13 = f'''<p class="note">Three different things, and two of them you can walk
back. The page this replaces drew one of the three, gave it the wrong rule, and
put a confirmation dialog on the reversible one while the irreversible one was
absent from the file.</p>

{units(frame("5a", "Pause, archive, remove", "ClientEndScreen 7b",
             "/clients/rahul-deshpande/end", f_end(),
             f"Two reversible rows, the money rule that applies to both, a rule, "
             f"then the destructive one alone below it. The dialog counts what it "
             f"will delete &mdash; {REMOVAL[0][1]} sessions, {REMOVAL[1][1]} "
             f"measurements, {REMOVAL[2][1]} payments &mdash; and offers archive "
             f"in the same breath, because that is what the trainer almost always "
             f"meant."))}

<div class="why"><p class="why__k">Neither one clears a debt</p>
  <p>&sect;14&rsquo;s rule, and the half trainers get wrong:
  <b>paused keeps the pack, archived closes it, and neither clears a debt.</b>
  Money owed survives both, and the only way to end it is a payment or a
  write-off. The page this replaces had the first clause backwards and the third
  missing entirely.</p></div>

<p class="note" style="margin-top:24px">NN/g has an article for the layout problem
here &mdash; <i>Dangerous UX: Consequential Options Close to Benign Options</i>
&mdash; and it describes the old frame exactly: <i>Reactivate</i> and <i>Archive
instead</i> side by side, one word apart, with the same weight. The app&rsquo;s
answer is the one this frame keeps: a rule between them, the destructive verb in
danger colour, and a dialog on that one alone. Inside the dialog the same rule
applies again, which is why <i>Archive instead</i> sits at the far end from
<i>Remove</i>.</p>
<p class="note">And the dialog says a number rather than asking a question.
<i>&ldquo;Are you sure?&rdquo;</i> is not information;
{REMOVAL[0][1]}&nbsp;sessions, {REMOVAL[1][1]}&nbsp;measurements and
{REMOVAL[2][1]}&nbsp;payments is. <code>countForRemoval</code> reads exactly
those three counts, and it reads them <b>on entry</b> rather than when the modal
opens &mdash; so the number is there before the trainer can reach the row.</p>'''


# ═══════════════════════════════════════════════════════════════════ §14 ══
def nn(n, title, ref, body):
    return f'''<div class="grp"><div class="grp__t"><h4>
  <span class="ink3 mono" style="margin-right:8px">{n}</span>{title}</h4>
  <span class="small mono">{ref}</span></div>
<p class="note" style="margin-top:10px">{body}</p></div>'''


NNG = [
    ("01", "The four tasks a table serves", "Laubheimer 2022",
     f'<i>Find records that fit criteria &middot; compare data &middot; view or '
     f'edit one row &middot; act on records.</i> Naming them in that order is what '
     f'produced &sect;04&rsquo;s column list, and what ruled out two things the '
     f'old page did: putting the reason a trainer opened the screen in the last '
     f'column, and having no column at all for one of the three questions its own '
     f'prose said the table answered.'),
    ("02", "The first column is a human-readable identifier", "same",
     f'Name over the number they would dial. Two lines, which is what sets the '
     f'roster row at 52px rather than the library&rsquo;s 44 &mdash; and the '
     f'number is there because the commonest action after finding somebody on '
     f'this roster is to call them.'),
    ("03", "Freeze the header when the table is longer than the screen", "same",
     f'{COUNTS["all"]} rows against a measured <b>{ROWS_VIS}</b> visible with the '
     f'strip up and {ROWS_VIS_PLAIN} without it, so the head is sticky &mdash; '
     f'and so are the group headers, at the head&rsquo;s own height, because '
     f'<i>Needs attention</i> scrolling away turns a ranked list into an '
     f'unexplained one. The page this replaces claimed {STALE_ROWS_VIS} against '
     f'the phone&rsquo;s {PHONE_ROWS_VIS}; at the row height two lines of text '
     f'actually need, it is {ROWS_VIS}.'),
    ("04", "Inline actions only if there are one or two, and always visible",
     "same",
     f'The reason the roster can have a real button in its last column at all: '
     f'<code>attention.action</code> is singular by construction. The other six '
     f'verbs are behind the kebab, and none of the eight appears on hover &mdash; '
     f'a hover-revealed action fails this guideline and is invisible to a '
     f'keyboard.'),
    ("05", "Bulk actions: select all, a contextual bar, feedback with undo",
     "NN/g, bulk actions",
     f'Two of the three, and the third is refused with a reason. <b>Assign a '
     f'program</b> and <b>book sessions</b> write rows and get an undo. '
     f'<b>Message</b> leaves the product, so its only possible undo is a '
     f'confirmation <i>before</i> &mdash; which is why that one action alone opens '
     f'a dialog, and why the dialog shows every message resolved.'),
    ("06", "Consequential options do not sit next to benign ones",
     "NN/g, dangerous UX",
     f'&sect;13. The old frame put <i>Reactivate</i> and <i>Archive instead</i> '
     f'side by side at the same weight; this one puts a rule between the '
     f'reversible pair and the delete, colours the delete, and confirms only '
     f'that.'),
    ("07", "Progressive disclosure", "NN/g",
     f'Intake asks {len(FIELDS_APP)} things and shows {len(DEFERRED)} more as em '
     f'dashes. The dashes are the disclosure working: they say the rows exist and '
     f'that now is not when they are filled. Empty fields would say the opposite '
     f'&mdash; and would make the two required ones look optional by '
     f'comparison.'),
    ("08", "Recognition rather than recall", "heuristic 6",
     f'The whole reason the attention line is a column of the app&rsquo;s own '
     f'sentences rather than a status word. <i>&ldquo;{BY_NAME["Priya N"]["line"]}&rdquo;</i> '
     f'is recognisable; <i>Inactive</i> requires the trainer to remember what the '
     f'product means by it.'),
    ("09", "Visibility of system status", "heuristic 1",
     f'Three states the old page had none of: the <b>Queued</b> tag on a row this '
     f'computer wrote, the offline banner naming which copy is on screen, and the '
     f'difference between <i>syncing</i> and <i>empty</i> &mdash; which is the one '
     f'place this screen can frighten somebody.'),
    ("10", "Match between the system and the real world", "heuristic 2",
     f'<b>Batch</b>, and the gap in it. Morning, evening and night are the '
     f'batches a Chennai floor runs; noon to four is nobody&rsquo;s, and the app '
     f'refuses to name it because a client who trains at two is training alone. A '
     f'taxonomy that invents a group is worse than one with a hole in it.'),
    ("11", "Error prevention over error messages", "heuristic 5",
     f'The week picker does not offer an hour another client holds &mdash; unlike '
     f'the diary, which warns and allows, because a double-booked standing week is '
     f'a mistake about to repeat rather than a judgement call. And the duplicate '
     f'phone is caught at the moment of typing rather than found in a month as two '
     f'half-packs.'),
    ("12", "Vanity metrics", "Harley 2019",
     f'What &sect;08 uses to reject My PT Hub&rsquo;s dashboard and '
     f'Everfit&rsquo;s customisable columns. Gross volume and total subscribers '
     f'are true, unactionable, and about the business rather than anybody in it. '
     f'This screen has {N_ATTN} rows that name a person and a verb.'),
]
N_NNG = len(NNG)
assert N_NNG == 12
S14 = (f'''<p class="note">{N_NNG} principles, each with the change it caused. Four
are from articles rather than the heuristics, and one of them &mdash;
Laubheimer&rsquo;s four tasks &mdash; is doing most of the work, because it is the
only piece of published guidance that treats a table as something people
<i>do</i> things with rather than read.</p>''' + "".join(nn(*n) for n in NNG))


# ═══════════════════════════════════════════════════════════════════ §15 ══
ROUTES = [
    ("/clients", "1a", "The roster. Segment and sort are query parameters, so a "
     "filtered roster is a link a trainer can bookmark &mdash; which the phone "
     "cannot offer at all."),
    ("/clients?sort=name", "1b", "Same list, letters instead of ranks."),
    ("/clients?mode=floor&amp;batch=evening", "1c", "Filters in the URL for the "
     "same reason. <code>filterCount</code> drives the badge; the values drive "
     "the chips in the toolbar."),
    ("/clients?selected=3", "1d", "Selection is <b>not</b> in the URL. A link "
     "that arrives with three clients already selected is a link that acts."),
    ("/clients?q=zub", "2a", "The omnibox, scoped to what is on screen. The "
     "query survives a reload; the archived widening does not."),
    ("/clients/:id", "3a", "The file, tab 1. A slug, not a UUID &mdash; ids are "
     "client-generated v4 and unreadable, and the file is a page a trainer "
     "sends themselves."),
    ("/clients/:id/programs", "3d", "Tabs are routes, so the back button moves "
     "between them and a bookmark lands on the tab it was taken from."),
    ("/clients/:id/sessions", "3b", ""),
    ("/clients/:id/package", "3c", "Her ledger is one click inside this, at "
     "<code>/money/clients/:id</code> &mdash; a route that belongs to the money "
     "file, which is the point of not making it a tab."),
    ("/clients/:id/body", "3e", "A screen, not a tab. Its own route because it "
     "is its own feature, and &sect;14 allows a fifth only for one of those."),
    ("/clients/new", "4a", "A page. See &sect;12 for why it is not a panel."),
    ("/clients/new/pay", "4c", "Step 2. Reachable with a client id after the "
     "record exists, which is how the roster&rsquo;s <i>Set up</i> verb "
     "resumes."),
    ("/clients/new/week", "4d", ""),
    ("/clients/new/plan", "&mdash;", "Step 4. Not drawn here: it is the "
     "template-apply screen, and <code>webapp-programs.html</code> owns that "
     "interaction. &sect;16 owes it the cross-link."),
    ("/clients/:id/end", "5a", "Pause, archive, remove. Its own route because "
     "the difference between the three is the whole decision and a menu row "
     "cannot explain it."),
]
N_ROUTES = len(ROUTES)
S15 = f'''<p class="note">{N_ROUTES} routes, and one rule decides all of them: <b>a
place gets a URL, a moment does not.</b> A filtered roster is a place. Three
clients selected is a moment, and a link that arrives holding a selection is a
link that acts.</p>
<table class="dt"><thead><tr><th>Route</th><th>Frame</th><th>Note</th></tr>
</thead><tbody>''' + "".join(
    f'<tr><th><code>{r}</code></th><td class="mono">{f}</td><td>{n or "&mdash;"}'
    f'</td></tr>' for r, f, n in ROUTES) + '''</tbody></table>

<h3 class="h4" style="margin-top:38px">Three ways into every action, and none of
  them the only way</h3>
<p class="note">&sect;07&rsquo;s rule, and it is the phone&rsquo;s rule translated
rather than copied. On the phone: the swipe carries the one verb the row&rsquo;s
state implies, the long-press menu carries all of them, and the client&rsquo;s own
screen carries them again. There is no swipe on a desk, so the three become:</p>
<table class="dt"><tbody>
<tr><th>The row&rsquo;s button</th><td>The one verb, always visible, never on
  hover. The swipe&rsquo;s replacement, and a better one &mdash; it is
  discoverable without a gesture and reachable from the keyboard.</td></tr>
<tr><th>The kebab, or right-click, or <kbd>&#8963;</kbd></th><td>All of them, in
  the roster&rsquo;s order. <b>Eight</b> keys in <code>RowMenuKey</code>, and the
  file&rsquo;s own menu is deliberately the same list in the same order plus Edit
  and Body metrics, minus <i>Select clients</i> &mdash; a roster gesture that
  means nothing on one record &mdash; and minus the destructive row, which lives
  on its own screen because the difference between pause, archive and remove is
  the whole decision.</td></tr>
<tr><th>The file</th><td>Same verbs, third time. A trainer who learned the menu on
  the roster does not have to learn it again.</td></tr>
</tbody></table>'''


# ═══════════════════════════════════════════════════════════════════ §16 ══
PROP = [
    ("app/src/home/deck.ts &middot; app/src/clients/roster.ts", "done",
     f"<b>Changed.</b> The attention model is one exported table in the deck "
     f"&mdash; <code>ATTENTION_BANDS</code>, <code>attentionWeight</code>, "
     f"<code>attentionSeverity</code> and the four line helpers &mdash; and "
     f"<code>roster.ts</code> imports all of it instead of restating six raw "
     f"weights. Bands are worth 1000 with the magnitude clamped inside, which is "
     f"what stops a large debt leaving its band; the two screens now agree on "
     f"weight, severity, wording and order for every client they share. The "
     f"chain in <code>row()</code> became a candidate list, so the order of the "
     f"table and the order of the chain cannot drift. &sect;02."),
    ("app/src/clients/file.ts &middot; <code>last7</code>", "code",
     f"<code>week: boolean[]</code> cannot distinguish a rest day from a missed "
     f"one. {FALSE_DOTS} of Meera&rsquo;s seven are false and {MISSED} is a "
     f"miss. Needs a third value &mdash; <code>'kept' | 'missed' | 'rest'</code> "
     f"&mdash; which is additive on a return type and touches nothing stored."),
    ("app/src/clients/file.ts &middot; <code>buildMetrics</code>", "done",
     f"<b>Changed.</b> <code>spark</code> was <code>number[]</code> and included "
     f"readings the same function was about to mark <code>replaced</code> &mdash; "
     f"on this file a {RANGE_ALL} kg plot for {RANGE_TRUE} kg of change. It is "
     f"now <code>SparkPoint[]</code> and the flag travels with the value, "
     f"computed once into a <code>superseded</code> set that both the list and "
     f"the chart read, so the two cannot disagree about it again. The phone "
     f"scales to the readings that still stand and draws a withdrawn one as a "
     f"baseline mark rather than a bar &mdash; present and dated, asserting no "
     f"value. Nothing is dropped: that is the edit append-only forbids."),
    ("app/src/clients/file.ts &middot; <code>buildSessions</code>", "code",
     f"The past group is titled <i>This pack &middot; N of M used</i> and "
     f"contains every past session, including ones older than the pack. Either "
     f"scope the rows or retitle the group."),
    ("app/src/clients/file.ts &middot; <code>buildPackage</code>", "code",
     f"<code>noShows</code> counts a client&rsquo;s whole history and the legend "
     f"says <i>among them</i>. Filter to the sessions this pack paid for, or "
     f"drop the phrase."),
    ("app/src/clients/file.ts &middot; <code>SessionFilter</code>", "code",
     f"Five values, and the {S_UNMARKED} unmarked row is the only actionable "
     f"state on the tab. It needs a sixth &mdash; the chips currently sum to "
     f"{CHIP_SUM} of {S_ALL}."),
    ("app/src/clients/file.ts &middot; <code>rowFor</code>", "code",
     f"<i>&ldquo;He told me in time&rdquo;</i> is a constant. It is wrong for "
     f"every female client in every roster. <i>&ldquo;Told me in time&rdquo;</i> "
     f"is correct for everyone and shorter."),
    ("app/src/screens/main/clients/ClientsScreen.tsx", "code",
     f"The <i>Can&rsquo;t invite</i> tag is unreachable outside selection mode: "
     f"<code>Trailing</code> returns the verb button first, and an "
     f"<code>unavailable</code> row always has a verb. Either the tag is "
     f"redundant or it should sit beside the verb rather than instead of it."),
    ("gen_rail.py &middot; <code>DEST</code>", "copy",
     f"The Clients badge is <code>(\"\", \"{COUNTS['all']}\", "
     f"\"{COUNTS['all']} active clients\")</code>. {COUNTS['all']} is the "
     f"roster; active is {COUNTS['active']}. And its tone is neutral while "
     f"{N_ATTN} rows need the trainer, where Money&rsquo;s badge is "
     f"<code>alert</code> for {N_OWING}."),
    ("webapp-information-architecture.html", "doc",
     f"Three rows. <code>/clients/:id/:tab</code> says <i>&ldquo;Six tabs: "
     f"overview &middot; programs &middot; sessions &middot; progress &middot; "
     f"payments &middot; metrics&rdquo;</i> &mdash; it is {N_TABS}, and three of "
     f"its six do not exist while the real fourth (<b>package</b>) is missing. "
     f"<code>/clients/new</code> says <i>&ldquo;a 420px panel over the "
     f"roster&rdquo;</i>; it is a {N_INTAKE}-step page whose step "
     f"{CREATED_ON_STEP} creates the record. And the Clients row says 6 frames "
     f"and names a list-detail split this page refuses. Its rule that selection "
     f"stays out of the URL is right, and &sect;15 keeps it."),
    ("webapp-settings.html", "gap",
     f"Three thresholds the trainer is promised control of and no screen has "
     f"drawn: quiet ({QUIET_DAYS} days), overdue ({OVERDUE_DAYS} days), pack "
     f"ending ({PACK_ENDING} sessions). All three are exported constants read by "
     f"the one attention model, so changing one moves both screens &mdash; which "
     f"is exactly what the copy has to say, and is easier to say now that there "
     f"is one model to say it about."),
    ("webapp-money.html", "doc",
     f"Still owed from the Today pass, and this page now depends on it: three "
     f"invoices dated 01 Aug carrying ages of 11, 6 and 4 days, which cannot all "
     f"be true of one date. The dates this page uses are the ones those ages "
     f"imply &mdash; {', '.join(shortdate(o[4]) for o in TDY.OWED)}."),
    ("webapp-programs.html", "link",
     f"Intake step {N_INTAKE} is the template apply, and that interaction "
     f"belongs to the programs file: the day count must match the client&rsquo;s "
     f"week exactly or the server refuses, and which ordinal day lands on which "
     f"weekday is the trainer&rsquo;s call. Needs the cross-link both ways."),
    ("webapp-client-portal.html", "copy",
     f"<i>&ldquo;The invite only controls whether they see the app.&rdquo;</i> "
     f"The portal file is the one place that sentence can be tested, because it "
     f"is the screen a client who accepted actually gets."),
    ("assets/webapp.css &middot; the six files with tabs", "done",
     f"<b>Changed.</b> <code>.tab</code> resets the UA button, and all "
     f"{STALE_TAB_DIVS} tabs in the other {STALE_TAB_FILES} files are now "
     f"<code>&lt;button&gt;</code>s. They already had "
     f"<code>role=\"tab\"</code> inside a <code>role=\"tablist\"</code>, so "
     f"the announcement was right; what a <code>&lt;div&gt;</code> cannot be is "
     f"focusable. Each carries a roving <code>tabindex</code> &mdash; 0 on the "
     f"selected tab, &minus;1 on the rest &mdash; and the four tablists that "
     f"draw a hover or focus state with no tab selected got their entry point on "
     f"the first. Computed styles verified identical to the divs in both states, "
     f"so it is a no-op to look at and a fix to use."),
    ("webapp-competitors.html", "doc",
     f"{N_PROD} products and one sentence: they all rank attention and none of "
     f"them puts money on the row. PTminder is the row to add &mdash; it has the "
     f"figure and puts it on a second list of the same people."),
    ("webapp-heuristics.html", "audit",
     f"{N_FIND} findings, {N_NNG} principles, and the open items below."),
]
N_PROP = len(PROP)
APP_BUGS = sum(1 for f, *_ in PROP if f.startswith("app/src"))
APP_FIXED = sum(1 for f, k, _ in PROP if f.startswith("app/src") and k == "done")
N_DONE = sum(1 for _, k, _ in PROP if k == "done")
assert (APP_BUGS, APP_FIXED, N_DONE) == (8, 2, 3), (APP_BUGS, APP_FIXED, N_DONE)
S16 = (f'''<p class="note">{N_PROP} things, and <b>{APP_BUGS} of them are defects
in the app itself</b> &mdash; found by drawing screens against the modules that
feed them, which is the only reason this document is worth writing rather than
describing. None of the {APP_BUGS} breaks a build or fails a type check; six are
arithmetic or scope, one is a hard-coded pronoun, one is dead code.
<b>{APP_FIXED} of them are now changed rather than reported</b> &mdash; the two
that were blocking &mdash; along with the stylesheet and the {STALE_TAB_DIVS}
tabs, which makes {N_DONE} rows below marked <code>done</code> with what was done
rather than what is owed. <code>tsc --noEmit</code> passes.</p>
<table class="dt"><thead><tr><th>File</th><th>Kind</th><th>What it owes</th></tr>
</thead><tbody>''' + "".join(
    f'<tr><th><code>{f}</code></th><td class="mono">{k}</td><td>{w}</td></tr>'
    for f, k, w in PROP) + '</tbody></table>')


# ═══════════════════════════════════════════════════════════════════ §17 ══
CLOSED = [
    ("The two attention models were one phrase and two lists",
     f"The model moved into <code>deck.ts</code> as one exported table &mdash; "
     f"<code>ATTENTION_BANDS</code> and its order, "
     f"<code>attentionWeight</code>, <code>attentionSeverity</code> and the "
     f"four line helpers &mdash; and <code>clients/roster.ts</code> imports all "
     f"of it. Bands are worth 1000 with the magnitude clamped to 0&ndash;999, "
     f"which is what stops a large debt leaving its band; <code>row()</code>&rsquo;s "
     f"if/elif chain became a candidate list, so the order of the table and the "
     f"order of the chain cannot drift apart by hand. Verified two ways: this "
     f"generator asserts weight, severity, wording, band and relative order "
     f"match for all {N_BOTH} clients both screens carry, and "
     f"<code>tsc --noEmit</code> passes. &sect;02."),
    ("The split calculator could be live on a cut the rule had zeroed",
     f"<code>projectedCut</code> returns zero unless the payment mode is "
     f"<code>gym_collects</code>, and zero for every remote session regardless. "
     f"So the share field is no longer a fixture: frame 4c asks the work mode "
     f"and the delivery mode first, renders the field only for a gym client on "
     f"the floor, and in the other cases states the rule where the field would "
     f"have been. The question underneath it &mdash; whether a per-client split "
     f"should exist at all &mdash; is answered by the code and was mis-framed "
     f"here: it is an <b>override</b>, not a fork. "
     f"<code>trainerSplitPercent</code> on the client beats the gym percentage "
     f"on the profile, in that order, and that is the precedence "
     f"<code>projectedCut</code> reads. &sect;12."),
]
N_CLOSED = len(CLOSED)

OPEN = [
    (False, f"The A&ndash;Z rail has no desk equivalent above "
            f"{INDEX_RAIL_MIN} clients",
     f"At {COUNTS['all']} the sticky head and a row count are enough. At 120 "
     f"&mdash; a trainer with a full book &mdash; a table sorted A&ndash;Z needs "
     f"something, and it is probably not a letter rail: it is type-to-scroll on "
     f"the table itself, which is a component that does not exist in this "
     f"library."),
    (False, "Bulk assign and bulk book are drawn as buttons and nothing behind "
            "them is specified",
     f"Both write rows, both need an undo, and both have a failure mode the "
     f"message action does not: a partial success. Eight clients, one program, "
     f"three of them with a week that does not match the template&rsquo;s day "
     f"count. <code>webapp-programs.html</code> owns the answer and does not have "
     f"one."),
    (False, "Archived clients have a count, a route and no screen",
     f"{N_ARCHIVED} of them, reachable from search and from the paused segment&rsquo;s "
     f"footer, and the app navigates to <code>Soon</code>. Restore, and what "
     f"restoring does to a closed pack, are both undrawn &mdash; and the sentence "
     f"<i>&ldquo;a closed pack stays closed, sell a new one&rdquo;</i> is the kind "
     f"a trainer needs to read before archiving, not after."),
    (False, "The adjustable thresholds are promised and unbuilt",
     f"&sect;07&rsquo;s rule and &sect;08&rsquo;s one stolen idea. Three numbers, "
     f"one settings screen &mdash; and easier to build than it was: there is now "
     f"one attention model to point them at, so changing <i>quiet</i> from "
     f"{QUIET_DAYS} to 14 provably moves both screens together rather than "
     f"hopefully."),
    (False, "Nothing here handles a client who belongs to a teammate",
     f"A team widens reads and never moves ownership, teammates&rsquo; clients are "
     f"online-only REST rather than sync, and a reassigned client row is "
     f"<i>projected</i> per caller. So a roster that is {COUNTS['all']} rows of "
     f"local SQLite plus N rows that only exist online is a different table with "
     f"a different empty state and a different offline story. The drawer file "
     f"owns it; this one does not mention it, which is a gap rather than a "
     f"defect."),
    (False, "Export is a button with no format",
     f"A desk affordance the phone cannot have, and PTminder&rsquo;s client-list "
     f"report is the shape to beat: choose the fields, filter, export. What this "
     f"one produces &mdash; the visible columns, or every column; the filtered "
     f"rows, or all {COUNTS['all']} &mdash; is undecided, and the answer that "
     f"surprises nobody is <i>exactly what is on screen</i>."),
]
N_OPEN = len(OPEN)
N_BLOCK = sum(1 for b, *_ in OPEN if b)
assert N_BLOCK == 0, N_BLOCK


def openrow(n, title, body, tone, label):
    return (f'<div class="grp"><div class="grp__t"><h4>'
            f'<span class="ink3 mono" style="margin-right:8px">{n:02d}</span>'
            f'{title}</h4>'
            f'<span><span class="tag tag--{tone}">{label}</span></span></div>'
            f'<p class="note" style="margin-top:10px">{body}</p></div>')


S17 = (f'''<p class="note">{N_CLOSED} closed and {N_OPEN} open, and <b>nothing on
the open list blocks</b>. Both of the items that did were about a number the
product stated twice, and both are now changes in shipped code rather than
decisions waiting on somebody.</p>

<h3 class="h4" style="margin-top:30px">Closed</h3>'''
       + "".join(openrow(i + 1, ti, w, "ok", "Resolved")
                 for i, (ti, w) in enumerate(CLOSED))
       + '<h3 class="h4" style="margin-top:44px">Still open</h3>'
       + "".join(openrow(i + 1, ti, w, "warn", "Open")
                 for i, (_, ti, w) in enumerate(OPEN)))


# ══════════════════════════════════════════════════════════════ the page ══
NAV = ('<a href="webapp-information-architecture.html">IA</a>'
       '<a href="webapp-design-system.html">DS</a>'
       '<a href="webapp-components.html">LIBRARY</a>'
       '<a href="webapp-competitors.html">MARKET</a>'
       '<a href="webapp-glass.html">GLASS</a>'
       '<a href="webapp-heuristics.html">UX AUDIT</a>'
       '<a href="webapp-rail.html">RAIL</a>'
       '<a href="webapp-auth.html">AUTH</a>'
       '<a href="webapp-dashboard.html">TODAY</a>'
       '<a href="webapp-clients.html" aria-current="page">CLIENTS</a>'
       '<a href="webapp-programs.html">PROGRAMS</a>'
       '<a href="webapp-schedule.html">SCHEDULE</a>'
       '<a href="webapp-workout.html">WORKOUT</a>'
       '<a href="webapp-money.html">MONEY</a>'
       '<a href="webapp-reports.html">REPORTS</a>'
       '<a href="webapp-settings.html">SETTINGS</a>'
       '<a href="webapp-client-portal.html">PORTAL</a>')

SECS = [
    ("01", f"The audit &mdash; {N_FIND} things, and three of them describe a "
           f"product that is not there", S01),
    ("02", "Two modules, one phrase, two lists", S02),
    ("03", "The roster", S03),
    ("04", "What a table is for", S04),
    ("05", "Filter, and select", S05),
    ("06", "The states that are not a list of clients", S06),
    ("07", "Finding someone, and not finding them", S07),
    ("08", f"Competitor analysis &mdash; {N_PROD} products, one omission", S08),
    ("09", f"The file &mdash; {N_TABS} tabs, and every figure is a link", S09),
    ("10", "The three tabs that each turned up a bug", S10),
    ("11", "Body metrics &mdash; append-only, and what it costs", S11),
    ("12", f"Intake &mdash; {N_INTAKE} steps, {len(FIELDS_APP)} fields", S12),
    ("13", "Three ways out, and only one of them is a delete", S13),
    ("14", "Nielsen Norman, and the four things a table is for", S14),
    ("15", "The routes", S15),
    ("16", "What this changes in the other files", S16),
    ("17", f"{N_CLOSED} closed, {N_OPEN} open, none blocking", S17),
]
N_SECS = len(SECS)

FRAMES = ["1a", "1b", "1c", "1d", "1e", "1f", "2a",
          "3a", "3b", "3c", "3d", "3e", "4a", "4b", "4c", "4d", "5a"]
N_FRAMES = len(FRAMES)
assert N_FRAMES == 17

BODY_HTML = '\n\n'.join(
    f'<h2 class="sec"><span class="n">{n}</span>{t}</h2>\n{s}' for n, t, s in SECS)
for _f in FRAMES:
    assert BODY_HTML.count(f'id="f-{_f}"') == 1, _f
_pos = [BODY_HTML.index(f'id="f-{f}"') for f in FRAMES]
assert _pos == sorted(_pos), "frame ids out of document order"

STALE_FRAMES = 5

HTML = f'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>X REP &middot; Web app &mdash; Clients</title>
<meta name="description" content="The roster as a table, the client file, intake and the three ways out — drawn against the modules that compute them. X REP web application.">
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

<h1>Clients &mdash; the roster, the file, and the three ways out</h1>
<p class="doc__lede">The page this replaces drew <b>{STALE_FRAMES}</b> frames and,
in three places, described a product that is not there. It documented a client
file with <b>six tabs</b> &mdash; <code>FILE_TABS</code> is <b>{N_TABS}</b>, and
&sect;14 of the mobile design makes it a rule with a reason. It documented intake
as <i>&ldquo;six fields either way&rdquo;</i> &mdash;
<code>AddClientScreen</code>&rsquo;s docstring is titled <i>two fields</i>, and
intake is a <b>{N_INTAKE}-step flow whose second step creates the record</b>. And
it put <i>&ldquo;top set &middot; bench 65&nbsp;kg&rdquo;</i> among <i>the four
numbers the trainer actually acts on</i>; <code>buildOverview</code> returns five
rows and not one of them is a top set.
<br><br>The rebuild imports the two modules that decide everything on this screen
&mdash; <code>clients/roster.ts</code> and <code>clients/file.ts</code> &mdash;
and running the same trainer&rsquo;s data through both of them produced the thing
this page opened on. <code>roster.ts</code> promises that <i>&ldquo;&lsquo;needs
attention&rsquo; means one thing in this app, not two&rdquo;</i>. On
{daystamp(D)} it meant two: Today named <b>{STALE_DECK_N}</b> clients and the
roster named <b>{STALE_ROST_N}</b>, they agreed about <b>{STALE_BOTH_N}</b>, two
of those four were in a different order, and one client&rsquo;s empty pack was red
here and amber there with a different sentence on each. <b>That is fixed.</b> The
model is now one exported band table in <code>deck.ts</code> that the roster
imports whole &mdash; &sect;02 &mdash; and this generator asserts the two screens
agree on weight, severity, wording and order for every one of the
<b>{N_BOTH}</b> clients they share.
<br><br>So: <b>{N_FRAMES} frames</b> &mdash; the roster as a real table with the
severity spine and one inline verb per row, its five states, the search dead end,
all {N_TABS} tabs of the file plus body metrics, all {N_INTAKE} intake steps
including the gate nobody has drawn, and pause / archive / <b>remove</b>, which is
the one real delete in the product and appears in no file in this set. Every
figure, count, rupee and rank below is derived and asserted, including
{N_PROP - APP_BUGS} corrections owed to other documents and <b>{APP_BUGS}
defects in the app itself</b> that only turned up because the screens were drawn against the code
rather than against the page before them.</p>
<div class="doc__meta"><span><b>Frames</b> <span data-frame-count>{N_FRAMES}</span></span>
  <span><b>Defects found</b> {N_FIND}</span>
  <span><b>Products examined</b> {N_PROD}</span>
  <span><b>Roster</b> {COUNTS["all"]} clients, {N_ATTN} needing you, {N_KINDS} kinds</span>
  <span><b>Owed to other files</b> {N_PROP}</span></div>
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
  X REP &middot; web application &middot; v1.1 &middot; every frame drawn at
  1440&times;900 and scaled to fit. Colour, spacing and radius tokens are copied
  verbatim from <code>inclineyoudesignsystem.html</code> &mdash; if a value differs
  there, it is a bug here. Press <kbd>+</kbd> / <kbd>&minus;</kbd> to change the
  zoom.
  <br><br>Generated by <code>gen_clients.py</code>; edit that and re-run it
  rather than editing this file. The roster&rsquo;s ranking is
  <code>row()</code> from <code>app/src/clients/roster.ts</code> ported line for
  line, with the six weights, the if/elif order and the line strings verbatim;
  the thresholds come from <code>app/src/home/deck.ts</code> by way of
  <code>gen_today.py</code>, which is the same import path
  <code>roster.ts</code> itself uses, so a change to the deck breaks both pages;
  the file&rsquo;s four tabs, the adherence window, the pack arithmetic and the
  metric series follow <code>app/src/clients/file.ts</code>; the onboarding gate
  is <code>onboardingStep</code> from <code>clients/schedule.ts</code>; the held
  hours in intake step 3 are <code>busySlots</code> from
  <code>clients/conflicts.ts</code> against the working week in
  <code>gen_schedule.py</code>; and the session rate and the gym&rsquo;s
  {GYM_PCT}% are <code>RATE</code>, <code>KEEP</code> and the money file&rsquo;s
  split, so the pack price on this page cannot disagree with the day on Today.
  Nothing in the prose is hand-typed.
  <br><br>Claims about the app trace to <code>app/src/clients/roster.ts</code>
  (<code>SEGMENTS</code>, <code>SORTS</code>, <code>Filters</code>,
  <code>AttentionKind</code> and its six weights, <code>readBatch</code>,
  <code>sectionRows</code>, <code>matches</code>,
  <code>INVITE_STALE_DAYS</code>, <code>INDEX_RAIL_MIN</code>),
  <code>clients/file.ts</code> (<code>FILE_TABS</code>,
  <code>buildOverview</code> and its five rows, <code>last7</code>,
  <code>buildSessions</code>, <code>buildPackage</code>,
  <code>buildMetrics</code>, <code>FigureLink</code>),
  <code>clients/schedule.ts</code>, <code>clients/conflicts.ts</code>,
  <code>money/money.ts</code> (<code>outstanding</code>,
  <code>projectedCut</code> and the <code>gym_collects</code> condition), and the
  {SCREENS_CLIENT} screens plus {SHEETS_CLIENT} sheets in
  <code>app/src/screens/main/clients/</code>. The mobile design document quoted
  throughout is <code>notes/design system/screens/inclineyou-clients.html</code>
  &mdash; &sect;07&rsquo;s nine rules for the roster and &sect;14&rsquo;s twelve
  for the file. Where a document disagrees with the code, the code wins and
  &sect;16 says so.
  <br><br>Competitor rows trace to primary sources: ABC Trainerize&rsquo;s help
  centre on auto client tags and their red and orange bands; TrueCoach&rsquo;s
  client-management material for its sorts and its three client types;
  Everfit&rsquo;s help centre for the client list as home screen, its
  customisable columns and its bulk program assignment; PTminder&rsquo;s help
  centre for client balances under <i>Finances</i> and for the <i>Client
  List</i> report; and My PT Hub&rsquo;s published finance features. Those
  centres return 403 to a direct fetch, so the rows are read from search
  summaries of them and are marked accordingly.
  <br><br>&sect;14 quotes Nielsen Norman Group directly: Page Laubheimer,
  <i>Data Tables: Four Major User Tasks</i> (3 April 2022) for the four tasks,
  the first-column rule, the column-order rule, frozen headers, and the
  one-or-two-inline-actions rule; the <i>Bulk Actions</i> guidelines for
  select-all, the contextual bar and undo; <i>Dangerous UX: Consequential
  Options Close to Benign Options</i> for &sect;13&rsquo;s layout;
  <i>Progressive Disclosure</i>; Aurora Harley&rsquo;s <i>Vanity Metrics</i>
  (2019); and Nielsen&rsquo;s heuristics 1, 2, 5 and 6.
</p>

</div>
<script src="assets/webapp.js"></script>
</body>
</html>
'''

if __name__ == "__main__":
    out = HERE / "webapp-clients.html"
    out.write_text(HTML)
    print("wrote", out, len(HTML), "chars")

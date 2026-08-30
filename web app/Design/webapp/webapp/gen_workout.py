#!/usr/bin/env python3
"""Generate webapp-workout.html — the desk half of a floor screen.

Run it from anywhere: python3 gen_workout.py — it writes the page next to itself.

WHY THIS FILE EXISTS. The page it replaces drew **one** frame and listed
thirteen it was standing in for. The app ships twelve log surfaces plus the
client's own read-only copy, and the one frame it drew broke a rule the mobile
spec states in so many words:

  * it put **"Package after this · 7 of 12"** in the session summary. §09:
    *"Finishing the log does NOT move the pack. A pack moves on done or no-show,
    never on booked."* That is the rule the diary sets and this screen is the
    one most likely to break it, which is exactly what happened.
  * it dated the session **"Tue 12 Aug"**. Today in this set is Tuesday
    11 August 2026; 12 August is a Wednesday. Wrong day, wrong weekday.
  * it printed **8 of 12 sets** beside **3,420 kg**, and eight sets of the
    exercises it drew do not come to 3,420 — the figure belongs to a finished
    session and the count to a live one.
  * it labelled the record *"her best at this rep range"*. `judge` compares
    today's top set against the heaviest load in the client's history. Rep
    range is not in it.

And the four things that decide the whole design of a workout log were absent:
the four verdicts (`record` · `quiet` · `matched` · `first`), the plate-step
threshold that decides whether the client's phone buzzes, the swap scope that
can reach four other people, and the fact that a record is computed on read so
correcting a set from November fixes every record that depended on it.

Everything below is imported from the code or derived from something that is,
and asserted:

  * `gen_today`   — the day, the client, and the session Meera actually trained.
    Today's queue says "Push A logged · 12 sets · Bench 65 kg × 6 — a new top
    set", so this page cannot disagree about any of it.
  * `gen_schedule` — the session's clock.
  * `gen_clients` — her pack and her file, so the pack sentence on the finish
    screen says what her book says.
"""
import pathlib
import re
from datetime import date, timedelta

import gen_today as TDY
import gen_schedule as SCH
import gen_clients as CLI
from gen_rail import (
    I_BARS, I_BELL, I_CAL, I_CHECK, I_CHEV, I_CHEVD, I_CHEVL, I_DOTSH, I_DUMB,
    I_GRID, I_OPEN, I_PLUS, I_RUPEE, I_SEARCH, I_USERS, ic, rail,
)
from gen_today import I_EYE, I_NO, I_DO, av, rs
from gen_clients import I_MSG, I_WARN, I_EDIT, I_TRASH, I_PAUSE, I_SCALE

HERE = pathlib.Path(__file__).resolve().parent

# ───────────────────────────────────────────────────────────── icons, local ──
I_FLAME = ('<path d="M12 3s4 4.2 4 8a4 4 0 0 1-8 0c0-1.6.7-2.8.7-2.8'
           'S7 10.5 7 13.5A5 5 0 0 0 12 21a5.5 5.5 0 0 0 5.5-5.8C17.5 9 12 3 12 3Z"/>')
I_UNDO = '<path d="M4 9h11a5 5 0 0 1 0 10H8"/><path d="M8 4.5 3.5 9 8 13.5"/>'
I_SWAP = ('<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>')
I_TIMER = '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M9.5 3h5"/>'
I_TROPHY = ('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 5.5H5.5V7a3 3 0 0 0 3 3"/>'
            '<path d="M16 5.5h2.5V7a3 3 0 0 1-3 3"/><path d="M10 20h4M12 12v8"/>')
I_CLOUD = ('<path d="M6.5 18h11a3.5 3.5 0 0 0 .3-7A5.5 5.5 0 0 0 7 9.6 3.7 3.7 0 0 0 6.5 18Z"/>')
I_NOTE = '<path d="M5 4h11l3 3v13H5V4Z"/><path d="M8 10h8M8 14h5"/>'
I_PLAY = '<path d="M8 5l11 7-11 7V5Z"/>'
I_HIST = ('<path d="M12 7.5V12l3.5 2"/><circle cx="12" cy="12" r="8.5"/>')

# ══════════════════════════════════════════════════════════════ the clock ══
D = TDY.D                       # date(2026, 8, 11), a Tuesday
assert D == date(2026, 8, 11) and D.strftime("%A") == "Tuesday", D
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def dshort(d):
    """`shortDate` in log.ts — 'YYYY-MM-DD' → "9 Aug", parsed by field because
       a Date would time-zone an evening session into the day before."""
    return f"{d.day} {MONTHS[d.month - 1]}"


def dlong(d):
    return f"{WEEKDAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]}"


# THE DATE THE OLD PAGE PRINTED. Two mistakes in four characters: it is not
# today, and 12 August 2026 is not a Tuesday.
STALE_DATE = "Tue 12 Aug"
STALE_D = date(2026, 8, 12)
assert STALE_D != D and STALE_D.strftime("%A") == "Wednesday"
assert dlong(D) == "Tue 11 Aug", dlong(D)


# ═══════════════════════════════════════════════════ the session, as logged ══
# Today's queue on the dashboard says "Push A · Meera K · 12 sets" at 06:52 and
# "Bench 65 kg × 6 — a new top set". Both are imported below rather than
# retyped, so this page cannot disagree with the screen that announced it.
CLIENT = "Meera K"
CLIENT_FULL = "Meera Krishnan"
START_MIN = 360                     # 06:00, her slot in gen_schedule
ENDED_MIN = 412                     # 06:52, the minute the queue stamps
MINUTES = ENDED_MIN - START_MIN
assert MINUTES == 52

PLAN = "Push A"
PROG_WEEK, PROG_TOTAL = CLI.P_WEEK, CLI.P_TOTAL
assert (PROG_WEEK, PROG_TOTAL) == (5, 8)

# `plateStepKg` in LogInput. The smallest plate in the room, and the mobile
# teardown is explicit that it is per-gym: "1.25 kg in some gyms and 2.5 kg in
# others, so the step is per-gym". It is the number that decides whether her
# phone buzzes.
PLATE_STEP = 2.5
LOG_TYPES = ["weight_reps", "reps"]     # `LogType`, both members
assert len(LOG_TYPES) == 2
# The rule §09 states — "time and distance sets relabel the two input columns"
# — describes two log types the union does not have. See §01, finding 08.
RULE_TYPES = ["weight", "reps", "time", "distance"]
MISSING_TYPES = [t for t in RULE_TYPES if t not in ("weight", "reps")]
assert MISSING_TYPES == ["time", "distance"]

# ── the plan, and what she actually did ──────────────────────────────────
#   name, logType, planned sets × reps, rest, and the sets: (load, reps, rpe, note)
#   `prev` is last session's sets, in order — what `previousFor` matches slot
#   for slot. Set 3 against set 3; if last time was shorter the last set she
#   did stands in, "better the nearest true number than a blank".
LAST_DATE = date(2026, 8, 6)
assert (D - LAST_DATE).days == 5

EX = [
    dict(key="bench", name="Bench press", type="weight_reps", plan=(3, 6), rest=120,
         prev=[(60, 8), (62.5, 8), (62.5, 6)], prev_date=LAST_DATE,
         sets=[(62.5, 8, 7, None), (65, 6, 9, "Held the last one, no spot"),
               (65, 5, 9, None)],
         # every earlier session's sets, for `judge` — the heaviest is 62.5
         hist_best_load=62.5, hist_best_reps_at_best=8, hist_sessions=9),
    dict(key="incline", name="Incline DB press", type="weight_reps", plan=(3, 10),
         rest=90, prev=[(22.5, 10), (22.5, 10), (22.5, 9)], prev_date=LAST_DATE,
         sets=[(22.5, 10, 7, None), (22.5, 10, 8, None), (22.5, 9, 8, None)],
         hist_best_load=22.5, hist_best_reps_at_best=10, hist_sessions=7),
    dict(key="fly", name="Cable fly", type="weight_reps", plan=(3, 12), rest=60,
         prev=[(15, 12), (15, 12), (15, 11)], prev_date=LAST_DATE,
         sets=[(15, 12, 6, None), (15, 12, 7, None), (15, 14, 8, None)],
         hist_best_load=15, hist_best_reps_at_best=12, hist_sessions=6),
    dict(key="rope", name="Triceps rope", type="weight_reps", plan=(3, 14), rest=60,
         prev=[], prev_date=None,
         sets=[(25, 14, 7, None), (25, 14, 7, None), (25, 12, 8, None)],
         hist_best_load=None, hist_best_reps_at_best=None, hist_sessions=0),
]
N_EX = len(EX)
PLANNED_SETS = sum(e["plan"][0] for e in EX)
assert (N_EX, PLANNED_SETS) == (4, 12)
# Today's queue: "Push A logged · 12 sets". The plan and the log agree.
assert PLANNED_SETS == 12


def half_up(v):
    """`Math.round` rounds .5 AWAY from zero; Python's `round` goes to even.
       652.5 kg of incline volume is 653 in the app and 652 here unless this
       exists, and a design document that is one kilo out on a figure it claims
       to import is worse than one that does not claim it."""
    import math
    return math.floor(v + 0.5)


assert half_up(652.5) == 653 and round(652.5) == 652


def vol(sets):
    """`volumeOf` — load × reps, added up, rounded. The one figure on this
       screen that is a sum, which is why it is the only one that gets bars.

       Per exercise, then summed: `buildLog` does
       `live.reduce((sum, v) => sum + v.volumeKg, 0)`, so the session total is a
       sum of rounded parts rather than a round of the sum."""
    return half_up(sum((s[0] or 0) * (s[1] or 0) for s in sets))


def top_set(sets, log_type="weight_reps"):
    """`topSet` — heaviest, and on a tie the one that got more reps. Not "most
       weight moved": it is the set a record is judged on, and a coach saying
       "her best set" at the rack means the heaviest one."""
    if not sets:
        return None
    best = sets[0]
    for s in sets[1:]:
        if log_type == "reps":
            if (s[1] or 0) > (best[1] or 0):
                best = s
            continue
        a, b = s[0] or 0, best[0] or 0
        if a != b:
            if a > b:
                best = s
        elif (s[1] or 0) > (best[1] or 0):
            best = s
    return best


def say(load, reps, log_type="weight_reps"):
    """`saySet` — "52.5 kg × 8", or "8 reps" for an exercise with no load."""
    if log_type == "reps" or load is None:
        return f"{reps} reps"
    return f"{trim1(load)} kg &times; {reps}"


def trim1(v):
    """`trim1` — 92.5 stays 92.5; 90.0 becomes 90. Nobody writes "90.0 kg"."""
    return str(int(v)) if float(v) == int(v) else str(v)


assert trim1(92.5) == "92.5" and trim1(90.0) == "90"
assert say(62.5, 8) == "62.5 kg &times; 8"


# ═══════════════════════════════════════════════════ judge, ported verbatim ══
def judge(today, hist_best_load, hist_best_reps_at_best, hist_sessions,
          log_type="weight_reps", plate=PLATE_STEP):
    """`judge` in log.ts. Three tests, in order, each able to end it — and then
       one more that decides whether her phone buzzes rather than whether the
       record is real.

         1. there has to be an earlier session — a first log is never a record
         2. it has to beat the old number — matching is not beating
         3. only the top set is checked, so a warm-up can never make one
    """
    top = top_set(today, log_type)
    if top is None:
        return dict(kind="none")
    # Test 1 — you cannot beat nothing.
    if not hist_sessions:
        return dict(kind="first", load=top[0], reps=top[1], by=0,
                    was_load=None, was_reps=None, streak=0)
    load, reps = top[0] or 0, top[1] or 0
    if log_type == "reps":
        # No load to compare, so no plate step either: for a reps-only exercise
        # every real record is a loud one. There is no such thing as a quiet
        # extra rep when reps are the whole measure.
        if reps > hist_best_reps_at_best:
            return dict(kind="record", load=None, reps=reps,
                        by=reps - hist_best_reps_at_best, was_load=None,
                        was_reps=hist_best_reps_at_best, streak=hist_sessions)
        if reps == hist_best_reps_at_best:
            return dict(kind="matched", load=None, reps=reps, by=0,
                        was_load=None, was_reps=hist_best_reps_at_best,
                        streak=hist_sessions)
        return dict(kind="none")
    if load > hist_best_load:
        by = round(load - hist_best_load, 2)
        # Heavier than she has ever lifted. Gold — and loud enough to send,
        # unless the jump is smaller than the smallest plate in the room, which
        # is not a session's worth of progress, it is a typo or a half plate.
        return dict(kind="record" if by + 1e-9 >= plate else "quiet",
                    load=load, reps=reps, by=by, was_load=hist_best_load,
                    was_reps=hist_best_reps_at_best, streak=hist_sessions)
    if load == hist_best_load:
        # Test 2 — matching is not beating.
        if reps > hist_best_reps_at_best:
            # A real record, and a small one: one more rep at a weight she had
            # already lifted. Kept in her history, kept off her phone.
            return dict(kind="quiet", load=load, reps=reps,
                        by=reps - hist_best_reps_at_best, was_load=load,
                        was_reps=hist_best_reps_at_best, streak=hist_sessions)
        if reps == hist_best_reps_at_best:
            return dict(kind="matched", load=load, reps=reps, by=0,
                        was_load=load, was_reps=hist_best_reps_at_best,
                        streak=hist_sessions)
    return dict(kind="none")


for _e in EX:
    _e["verdict"] = judge(_e["sets"], _e["hist_best_load"],
                          _e["hist_best_reps_at_best"], _e["hist_sessions"])
    _e["top"] = top_set(_e["sets"])
    _e["volume"] = vol(_e["sets"])

VERDICTS = {e["key"]: e["verdict"]["kind"] for e in EX}
assert VERDICTS == dict(bench="record", incline="matched", fly="quiet",
                        rope="first"), VERDICTS
# `Verdict` has five members and one session lands on four of them. The fifth,
# `none`, is a top set below what she has already done — drawn in §04's bench.
VERDICT_UNION = ["record", "quiet", "matched", "first", "none"]
assert len(VERDICT_UNION) == 5
assert sorted(set(VERDICTS.values())) == ["first", "matched", "quiet", "record"]

# Four candidates checked, two of them genuine records, one worth saying out
# loud — which is `TodaysBestsScreen`'s own docstring, arrived at from the data.
REAL_RECORDS = [e for e in EX if e["verdict"]["kind"] in ("record", "quiet")]
ANNOUNCED = [e for e in EX if e["verdict"]["kind"] == "record"]
assert (len(EX), len(REAL_RECORDS), len(ANNOUNCED)) == (4, 2, 1)

BENCH = EX[0]
assert BENCH["top"] == (65, 6, 9, "Held the last one, no spot")
assert BENCH["verdict"]["by"] == 2.5 == PLATE_STEP     # exactly one plate
FLY = EX[2]
assert FLY["verdict"]["by"] == 2 and FLY["verdict"]["load"] == 15

# The record is on set 2, not the last set — because the record is the heaviest
# set, and she did one more at the same weight for fewer reps afterwards.
PR_SLOT = BENCH["sets"].index(BENCH["top"]) + 1
assert PR_SLOT == 2, PR_SLOT

# ── the two moments this page draws ──────────────────────────────────────
# Mid-session: bench and incline done, cable fly two of three, rope untouched.
DONE_MID = {"bench": 3, "incline": 3, "fly": 2, "rope": 0}
SETS_MID = sum(DONE_MID.values())
VOL_MID = sum(vol(e["sets"][:DONE_MID[e["key"]]]) for e in EX)
SETS_ALL = sum(len(e["sets"]) for e in EX)
VOL_ALL = sum(e["volume"] for e in EX)
assert (SETS_MID, SETS_ALL) == (8, 12)
assert (VOL_MID, VOL_ALL) == (2228, 3438), (VOL_MID, VOL_ALL)

# THE OLD PAGE'S ARITHMETIC. It printed 3,420 kg beside "8 of 12 sets". Eight
# sets of the exercises it drew cannot reach it, and the figure is within 18 kg
# of a FINISHED session — a live count next to a closed total.
STALE_VOL = 3420
assert STALE_VOL != VOL_MID and abs(STALE_VOL - VOL_ALL) < 20


# ═════════════════════════════════════════════════════ the pack, from her book ══
# `FinishView.pack` — "the pack sentence, exact about what it will move" — and
# §09's rule, which this is the screen most likely to break: *finishing the log
# does not move the pack. A pack moves on done or no-show, never on booked.*
PACK_TOTAL = CLI.PACK_TOTAL
PACK_AFTER_DONE = CLI.PACK_LEFT          # 8 — her file, with today counted
PACK_NOW = PACK_AFTER_DONE + 1           # 9 — before the second, separate tap
assert (PACK_TOTAL, PACK_NOW, PACK_AFTER_DONE) == (12, 9, 8)
STALE_PACK_LINE = 7                      # what the old page printed
assert STALE_PACK_LINE not in (PACK_NOW, PACK_AFTER_DONE)
UNDO_HOURS = 24                          # §09: every pack change is undoable

# ── the three outcomes, and the one difference between them ──────────────
# `NotTrainedSheet`. Exactly one fact separates them, so it is written inside
# each option rather than in a confirmation afterwards.
NOT_TRAINED = [
    ("They didn&rsquo;t turn up", "no-show", True,
     "Costs a session. The slot was held and nobody released it."),
    ("They told me in time", "cancelled &middot; client", False,
     "Keeps the session. The slot went back into the week."),
    ("I called it off", "cancelled &middot; trainer", False,
     "Keeps the session. Yours to give back, so it is given back."),
]
assert sum(1 for *_, costs, _ in NOT_TRAINED if costs) == 1

# ══════════════════════════════════════════════════════════ swap, with scope ══
# `SwapScope`. Three different decisions, and every competitor in the teardown
# collapses them into one. Each states its own blast radius before the tap.
SWAP_SCOPES = [
    ("today", "Today only", 1,
     "This log. Her program is untouched and next Tuesday is unchanged."),
    ("program", "Her program", 1,
     f"Every Push A from now on, for {CLIENT_FULL} alone. "
     f"{PROG_TOTAL - PROG_WEEK} weeks of it left."),
    ("template", "The template", 5,
     "Push A itself &mdash; so every client on it, which is five people. "
     "The one change that reaches somebody who is not in the room."),
]
SWAP_REACH = max(n for *_, n, _ in SWAP_SCOPES)
assert [s[0] for s in SWAP_SCOPES] == ["today", "program", "template"]
assert SWAP_REACH == 5
# "Three identical swaps and XRep asks once whether the program should change."
SWAP_ASK_AFTER = 3

# ══════════════════════════════════════════════════ progress · 8 weeks ══
# `buildProgress`. Volume is a sum, so it gets bars from zero. A load is not, so
# the top set is written out as the sequence of numbers it actually is.
WEEK_VOL = [2640, 2910, 2750, 3080, 3210, 3050, 3290, 3438]
N_WEEKS = len(WEEK_VOL)
assert N_WEEKS == 8 and WEEK_VOL[-1] == VOL_ALL
VOL_PEAK = max(WEEK_VOL)
VOL_DELTA = round(100 * (WEEK_VOL[-1] - WEEK_VOL[0]) / WEEK_VOL[0])
assert VOL_PEAK == VOL_ALL and VOL_DELTA == 30, VOL_DELTA

# Her bench top set, her last five sessions. Written out, never charted: from a
# zero baseline a 2.5 kg week is two pixels, and from a 50 kg baseline it is
# everything.
TOP_SERIES = [57.5, 60, 62.5, 62.5, 65]
assert TOP_SERIES[-1] == BENCH["top"][0]
assert TOP_SERIES[-2] == BENCH["hist_best_load"]
TOP_SEQ = " &rarr; ".join(trim1(v) for v in TOP_SERIES) + " kg"

# Bodyweight, from her file, so the two pages cannot disagree. No colour and no
# verdict arrow: the app has no opinion about which way it should go.
BW_NOW, BW_DELTA = CLI.W_LAST, CLI.W_DELTA
assert (BW_NOW, BW_DELTA) == (60.8, -2.3)

SESSIONS_8W = 21
RECORDS_8W = 6
SETS_8W = 214

# ══════════════════════════════════════════════ one exercise's history ══
# `buildHistory`. Newest first, sets inside a session in the order they
# happened, and every PR judged AT THE TIME by walking history forward with the
# same function the floor screen uses — there is no stored flag to disagree.
BENCH_HIST = [
    (D,                  [(62.5, 8, 7), (65, 6, 9), (65, 5, 9)]),
    (date(2026, 8, 6),   [(60, 8, 7), (62.5, 8, 8), (62.5, 6, 9)]),
    (date(2026, 8, 1),   [(60, 8, 7), (60, 8, 8), (60, 7, 9)]),
    (date(2026, 7, 28),  [(57.5, 8, 7), (60, 6, 9), (57.5, 8, 8)]),
    (date(2026, 7, 23),  [(57.5, 8, 8), (57.5, 8, 8), (57.5, 6, 9)]),
]


def walk_history(sessions):
    """Judge each session against everything before it, oldest first — which is
       how `buildHistory` decides which sets carry a PR tag. The tag is on the
       SET, not on the day, and there is no stored flag to disagree with it."""
    seen_load, seen_reps_at, n = 0.0, 0, 0
    marks, kinds = {}, {}
    for d, sets in reversed(sessions):
        v = judge([(l, r, rpe, None) for l, r, rpe in sets], seen_load,
                  seen_reps_at, n)
        top = top_set([(l, r, rpe, None) for l, r, rpe in sets])
        kinds[d] = v["kind"]
        if v["kind"] in ("record", "quiet"):
            marks[d] = sets.index((top[0], top[1], top[2]))
        for l, r, _ in sets:
            if l > seen_load:
                seen_load, seen_reps_at = l, r
            elif l == seen_load and r > seen_reps_at:
                seen_reps_at = r
        n += len(sets)
    return marks, kinds


PR_MARKS, PR_KINDS = walk_history(BENCH_HIST)
N_HIST_SESSIONS = len(BENCH_HIST)
assert N_HIST_SESSIONS == 5
# FOUR of the five carry a tag and the oldest does not — which is Test 1 doing
# its job on real data. 23 July was the first bench she ever logged, so it is
# the number to beat rather than a number beaten.
assert [PR_KINDS[d] for d, _ in BENCH_HIST] == [
    "record", "record", "quiet", "record", "first"], PR_KINDS
assert len(PR_MARKS) == 4 and date(2026, 7, 23) not in PR_MARKS
# And one of the four is QUIET: on 1 August she did 60 kg for 8 where her best
# at 60 was 6. A real record, in her history, and off her phone.
assert PR_KINDS[date(2026, 8, 1)] == "quiet"
# The tag sits on the heaviest set, which on two of these days is not the last
# one she did.
assert PR_MARKS[D] == 1 and PR_MARKS[date(2026, 7, 28)] == 1
assert PR_MARKS[date(2026, 8, 1)] == 0

# ══════════════════════════════════════════════════ who am I logging for ══
# `LogPickView`. Three groups, in the order a gym floor answers the question —
# and the third is the group no competitor offers.
PICK_OPEN = [("Arjun S", "AS", "av-5", "2 sets in &middot; 1,245 kg")]
PICK_BOOKED = [("Nikhil P", "NP", "av-11", "17:00 &middot; Full body"),
               ("Kavya M", "KM", "av-9", "18:30 &middot; Push / Pull")]
# The caption under this group says "sorted by who trained most recently", so
# the rows are in that order and nobody in it trained today — today's five are
# the rail's pins, and this is the group that has no booking at all. The first
# draft read 2 Aug, 11 Aug, 8 Aug: not sorted, and 11 August is today.
PICK_ROSTER = [("Karthik R", "KR", "av-8", 9),
               ("Lakshmi N", "LN", "av-11", 8),
               ("Priya N", "PN", "av-2", 2)]
ROSTER_DAYS = [d for *_, d in PICK_ROSTER]
assert ROSTER_DAYS == sorted(ROSTER_DAYS, reverse=True), ROSTER_DAYS
assert max(ROSTER_DAYS) < D.day, "nobody in this group trained today"
PICK_ROSTER = [(nm, ini, tok, f"Last trained {d} {MONTHS[D.month - 1]}")
               for nm, ini, tok, d in PICK_ROSTER]
# 6b is Priya's screen, and its "no workout logged in 9 days" is this row.
assert D.day - ROSTER_DAYS[-1] == 9
assert len(PICK_OPEN) == 1 and len(PICK_BOOKED) == 2
# The rail's pins are today's five; two of them are still to come, which is what
# `booked` holds.
assert [b[0] for b in PICK_BOOKED] == ["Nikhil P", "Kavya M"]

# ══════════════════════════════════════════════════ what the old page said ══
STALE_FRAMES = 1
STALE_CLAIMED = ["1a", "1b", "1c", "2a", "2b", "2c", "3a", "3b", "4a", "4b",
                 "5a", "5b", "6a"]
assert len(STALE_CLAIMED) == 13
# app/src/screens/main/log — twelve surfaces, plus the client's read-only copy.
LOG_SCREENS = 6      # LogScreen LogPick Finish SessionProgress ExerciseHistory TodaysBests
LOG_SHEETS = 6       # Set Add Rest Swap NotTrained SessionMenu
LOG_SURFACES = LOG_SCREENS + LOG_SHEETS
assert LOG_SURFACES == 12
STALE_RPE_CLAIM = "her best at this rep range"


# ══════════════════════════════════════════════════════════════════ shell ══
from gen_schedule import hm                                        # noqa: E402


def browser(url):
    return ('<div class="browser__bar"><span class="browser__dots">'
            '<i></i><i></i><i></i></span>'
            f'<span class="browser__url">app.xrep.in<b>{url}</b></span></div>')


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


def app(*, crumb, head, body, sync="ok", queued=0, over="", keys=None):
    kb = f'<div class="keys">{keys}</div>' if keys else ''
    return (f'<div class="app" data-theme="dark">{rail("sess")}'
            f'{top(crumb, sync, queued)}'
            f'<main class="main">{head}<div class="body">{body}</div>{kb}</main>'
            f'{over}</div>')


def ph(title, sub, acts="", extra=""):
    return (f'<div class="ph"><div class="ph__row"><div>'
            f'<p class="ph__t">{title}</p><p class="ph__sub">{sub}</p></div>'
            f'<div class="ph__acts">{acts}</div></div>{extra}</div>')


CRUMB = (f'<a href="/sessions">Sessions</a><i aria-hidden="true">/</i>'
         f'<b>{CLIENT} &middot; {dlong(D)}</b>')

# NN/g on accelerators: "style them in a way that differentiates them from the
# corresponding GUI-command label", and "readily available, yet easy to ignore".
# So they sit in a bar at the foot of the frame in mono, never as the only path.
KEYS = (f'<b><kbd>Tab</kbd> across the row</b>'
        f'<b><kbd>&#8629;</kbd> commit, and open the next set</b>'
        f'<b><kbd>&#8984;</kbd><kbd>&#8629;</kbd> accept last time&rsquo;s '
        f'numbers</b>'
        f'<b><kbd>&uarr;</kbd><kbd>&darr;</kbd> between sets</b>'
        f'<b><kbd>N</kbd> a note on this set</b>'
        f'<b><kbd>&#8984;Z</kbd> undo</b>')


def avm(ini, token, cls="av--sm"):
    return (f'<span class="av {cls}" style="background:var(--tx-{token})">'
            f'{ini}</span>')


def chip(label, *, on=False, ghost=False, glyph=None, count=None):
    c = "chip" + (" chip--ghost" if ghost else "")
    st = (' aria-pressed="true" style="background:var(--tx-accent-soft);'
          'border-color:var(--tx-accent-line);color:var(--tx-accent-text)"'
          if on else '')
    n = f'<span class="rail__n">{count}</span>' if count is not None else ''
    g = ic(glyph, 14) if glyph else ''
    return f'<button class="{c}" type="button"{st}>{g}{label}{n}</button>'


# ════════════════════════════════════════════════════ the exercise list ══
VERDICT_TAG = {
    "record": ("tag--pr", "Record"),
    "quiet": ("tag--pr", "Record &middot; quiet"),
    "matched": ("tag", "Matched"),
    "first": ("tag tag--info", "First"),
    "none": ("tag", ""),
}


def exlist(*, done=None, current="bench", show_verdict=False):
    done = done or DONE_MID
    rows = ""
    for e in EX:
        n = done[e["key"]]
        planned, reps = e["plan"]
        cls = "exr"
        if n >= planned:
            cls += " exr--done"
        elif n > 0:
            cls += " exr--part"
        cur = ' aria-current="true"' if e["key"] == current else ''
        if n == 0:
            sub = f"Not started &middot; {planned} &times; {reps} planned"
            right = '<span class="exr__n">&mdash;</span>'
        else:
            t = top_set(e["sets"][:n])
            sub = f"{n} of {planned} sets &middot; top {say(t[0], t[1])}"
            right = f'<span class="exr__n">{vol(e["sets"][:n]):,} kg</span>'
        tag = ""
        if show_verdict and n >= planned:
            k = e["verdict"]["kind"]
            cl, lab = VERDICT_TAG[k]
            if lab:
                tag = f'<span class="tag {cl}">{lab}</span>'
        # The tag goes on the name's line, not the row's. On the 300px column
        # a tag beside the volume left the subtitle 130px and "top 15 kg × 14"
        # came out as "top 15…" — the one number in the row worth reading.
        rows += (f'<div class="{cls}"{cur}>'
                 f'<span class="exr__m">'
                 f'<span class="exr__h"><span class="exr__t">{e["name"]}</span>'
                 f'{tag}</span>'
                 f'<span class="exr__s">{sub}</span></span>{right}</div>')
    rows += (f'<div class="exr" style="color:var(--tx-ink-3)">'
             f'{ic(I_PLUS, 16)}<span class="exr__m">'
             f'<span class="exr__t" style="color:var(--tx-ink-3);font-weight:500">'
             f'Add an unplanned exercise</span>'
             f'<span class="exr__s">the rack was busy</span></span></div>')
    return f'<div class="exl">{rows}</div>'


# ════════════════════════════════════════════════════════ the set grid ══
def setgrid(e, *, done, active=None, empty_hint=True, readonly=False,
            queued=()):
    """Six columns. The app has five and puts RPE and the note in a sheet,
       because at 360dp a sixth column would have to come out of Previous and
       Previous does not move. A desk has the width, so RPE is a column and the
       note is a row underneath — the one place this console is allowed to be
       wider than the phone rather than merely different."""
    planned = e["plan"][0]
    body = ""
    for i in range(max(planned, len(e["sets"]))):
        slot = i + 1
        logged = i < done
        s = e["sets"][i] if i < len(e["sets"]) else (None, None, None, None)
        # `previousFor` — set N against set N; if last time was shorter, her
        # last set stands in, because the nearest true number beats a blank.
        if e["prev"]:
            pv = e["prev"][i] if i < len(e["prev"]) else e["prev"][-1]
            prev = say(pv[0], pv[1])
            stood_in = i >= len(e["prev"])
        else:
            pv, prev, stood_in = None, None, False
        is_pr = (e["verdict"]["kind"] in ("record", "quiet")
                 and done >= planned and slot == e["sets"].index(e["top"]) + 1)
        state = "done" if logged else ("active" if slot == active else "empty")
        cls = " ".join(c for c in ("pr" if is_pr else "",
                                   "queued" if slot in queued else "") if c)
        load = trim1(s[0]) if logged and s[0] is not None else (
            trim1(pv[0]) if (pv and empty_hint and not logged) else "")
        rp = str(s[1]) if logged and s[1] else (
            str(pv[1]) if (pv and empty_hint and not logged) else "")
        # `said` marks a number that came from last time and nobody has
        # committed. No proposal, no dashed border.
        said = " said" if (not logged and pv) else ""
        # A button, not a span. It is the most-pressed control on the screen and
        # for as long as it was a span it had no name, no tab stop and no role.
        tick = (f'<button type="button" class="tk{" tk--on" if logged else ""}" '
                f'aria-pressed="{"true" if logged else "false"}" '
                f'aria-label="Set {slot} logged" title="Set {slot} logged">'
                f'{ic(I_CHECK, 15)}</button>' if logged else
                f'<button type="button" class="tk" aria-pressed="false" '
                f'aria-label="Log set {slot}" title="Log set {slot}">'
                f'{ic(I_CHECK, 15)}</button>')
        body += (f'<tr data-state="{state}"{f" class={chr(34)}{cls}{chr(34)}" if cls else ""}>'
                 f'<td class="n">{slot}</td>'
                 f'<td class="prev">{prev if prev else "<em>&mdash;</em>"}'
                 + (' <em>&middot; her last set</em>' if stood_in else '')
                 + f'</td>'
                 f'<td class="num"><input class="ctl{said}" value="{load}" '
                 f'aria-label="Load, set {slot}"></td>'
                 f'<td class="num"><input class="ctl{said}" value="{rp}" '
                 f'aria-label="Reps, set {slot}"></td>'
                 f'<td class="num"><input class="ctl" style="max-width:56px" '
                 f'value="{s[2] if logged and s[2] else ""}" '
                 f'aria-label="RPE, set {slot}"></td>'
                 f'<td class="tick">{tick}</td></tr>')
        if logged and s[3]:
            body += (f'<tr class="note"><td></td><td colspan="5">'
                     f'<p>{ic(I_NOTE, 13)} {s[3]}</p></td></tr>')
    head = ('<thead><tr><th class="n"></th><th class="prev">Last time</th>'
            '<th class="num">Load kg</th><th class="num">Reps</th>'
            '<th class="num">RPE</th><th></th></tr></thead>')
    return (f'<table class="sets" style="width:100%;border-collapse:collapse">'
            f'{head}<tbody>{body}</tbody></table>')


# ═══════════════════════════════════════════════════════ 1a · the console ══
HEAD_ACTS = (f'<button class="btn btn--secondary" type="button">{ic(I_HIST, 15)}'
             f'Her history</button>'
             f'<button class="btn btn--secondary" type="button" '
             f'aria-label="More session actions" title="More session actions">'
             f'{ic(I_DOTSH, 15)}</button>'
             f'<button class="btn btn--primary" type="button">Finish the log</button>')


def sessionstrip(*, sets, volume, minutes, pack=True):
    """Three figures and a sentence, and the sentence is the rule. §09: finishing
       the log does not move the pack. The old page put "Package after this ·
       7 of 12" here, which is the one thing this strip must not say."""
    pk = (f'<div><b>{PACK_NOW}<span class="ink3" style="font-size:14px">'
          f'/{PACK_TOTAL}</span></b><i>pack, unchanged</i></div>') if pack else ''
    return (f'<div class="strip">'
            f'<div><b>{sets}<span class="ink3" style="font-size:14px">'
            f'/{PLANNED_SETS}</span></b><i>sets logged</i></div>'
            f'<div><b>{volume:,}</b><i>kg moved</i></div>'
            f'<div><b>{minutes}<span class="ink3" style="font-size:14px">'
            f' min</span></b><i>on the floor</i></div>'
            f'{pk}</div>')


def resttile(e):
    return (f'<div class="rst2" style="margin-top:10px">{ic(I_TIMER, 17)}'
            f'<b>{e["rest"] // 60}:{e["rest"] % 60:02d}</b>'
            f'<span>rest after a <u>{e["name"].lower()}</u> set. Per exercise, '
            f'not per trainer.</span>'
            f'<span style="margin-left:auto"><button class="btn btn--ghost btn--sm" '
            f'type="button">Change</button></span></div>')


def prcard(e):
    """`PrCard`. One glow per screen, enforced in CSS: the exercise card gives up
       its glow when this appears."""
    v = e["verdict"]
    loud = v["kind"] == "record"
    return f'''<div class="card {"card--acc" if loud else ""}"
  style="{"border-color:var(--tx-pr);background:var(--tx-pr-soft)" if loud else ""}">
  <div class="card__b">
    <div class="row" style="gap:9px">{ic(I_TROPHY, 17)}
      <span class="micro" style="color:{"var(--tx-pr)" if loud else "var(--tx-ink-3)"}">
        {"NEW TOP SET" if loud else "A RECORD, QUIETLY"}</span>
      <span class="tag {"tag--pr" if loud else "tag"}" style="margin-left:auto">
        Set {e["sets"].index(e["top"]) + 1}</span></div>
    <p style="font-family:var(--tx-brand);font-weight:800;font-size:34px;
      letter-spacing:-.03em;line-height:1.05;margin-top:8px">
      {trim1(v["load"])}<span class="ink3" style="font-size:18px"> kg</span>
      <span class="ink3" style="font-size:18px">&times; {v["reps"]}</span></p>
    <p class="small" style="margin-top:5px">was {trim1(v["was_load"])} kg
      &times; {v["was_reps"]} &middot;
      <b class="ink">+{trim1(v["by"])} kg</b></p>
    <p class="small" style="margin-top:10px;padding-top:10px;
      border-top:1px solid var(--tx-line)">
      {"Heavier than she has ever lifted, and the jump is a whole "
       + trim1(PLATE_STEP) + " kg plate &mdash; so this one is worth sending."
       if loud else
       "One more rep at a weight she had already lifted. Real, kept in her "
       "history, and kept off her phone."}</p>
  </div></div>'''


def f_console():
    """1a. Mid-session: bench and incline done, cable fly two of three, rope
       untouched. Eight of twelve sets, and the volume is the volume of those
       eight."""
    e = BENCH
    hist = "".join(
        f'<div class="tl__i{" tl__i--acc" if d == D else ""}">'
        f'<p class="tl__d">{dlong(d).upper()}</p>'
        f'<p class="tl__t" style="font-family:var(--tx-mono);font-size:12.5px;'
        f'font-weight:500">'
        + " &middot; ".join(
            (f'<b class="acc">{say(l, r)}</b>' if PR_MARKS.get(d) == i
             else say(l, r)) for i, (l, r, _) in enumerate(sets))
        + f'</p><p class="tl__b">{vol([(l, r, 0, None) for l, r, _ in sets]):,} kg'
        + (f' &middot; <span class="acc">record</span>'
           if PR_KINDS[d] == "record" else
           f' &middot; record, quietly' if PR_KINDS[d] == "quiet" else
           f' &middot; her first') + '</p></div>'
        for d, sets in BENCH_HIST[:3])
    body = f'''{sessionstrip(sets=SETS_MID, volume=VOL_MID, minutes=MINUTES)}
<div style="display:grid;gap:12px;margin-top:12px;
  grid-template-columns:300px minmax(0,1fr) 330px;align-items:start">
  <div>
    <p class="micro" style="margin-bottom:7px">{PLAN} &middot; {N_EX} exercises</p>
    {exlist()}
  </div>
  <div class="card"><div class="card__hd">
      <p class="card__t">{e["name"]}</p>
      <span class="tag tag--pr">Record &middot; set {e["sets"].index(e["top"]) + 1}</span>
      <span class="small mono" style="margin-left:auto">
        {e["hist_sessions"]} sets before today</span></div>
    <div class="card__b">
      {setgrid(e, done=3)}
      <div class="row" style="margin-top:10px;gap:8px">
        <button class="btn btn--secondary btn--sm" type="button">{ic(I_PLUS, 14)}
          Add a set</button>
        <button class="btn btn--ghost btn--sm" type="button">{ic(I_SWAP, 14)}
          Swap</button>
        <button class="btn btn--ghost btn--sm" type="button">{ic(I_NOTE, 14)}
          Note</button>
        <span style="flex:1"></span>
        <span class="small mono">volume {e["volume"]:,} kg</span></div>
      {resttile(e)}
    </div></div>
  <div>
    {prcard(e)}
    <div class="card" style="margin-top:12px"><div class="card__hd">
        <p class="card__t">Bench, her last four</p></div>
      <div class="card__b"><div class="tl">{hist}</div>
        <p class="small" style="border-top:1px solid var(--tx-line);padding-top:9px">
          The reason to look at history is to decide today&rsquo;s load, so it
          sits beside the entry. This is the half a 390px phone cannot
          do.</p></div></div>
  </div></div>'''
    return app(crumb=CRUMB,
               head=ph(f"{CLIENT_FULL} &middot; {PLAN}",
                       f"{dlong(D)} {hm(START_MIN)} &middot; week {PROG_WEEK} of "
                       f"{PROG_TOTAL} &middot; logging here, saved on this "
                       f"computer first", HEAD_ACTS),
               body=body, sync="q", queued=6, keys=KEYS)


# ═════════════════════════════════════════════════ 1b · one set, in full ══
def setpanel():
    """`SetSheet` — the two things the row has no width for on a phone and no
       competitor asks for: RPE and a note. They are what the trainer knows and
       the client's own app never records.

       Nothing here asks "are you sure". Delete goes straight through with an
       undo behind it: a trainer logs twenty sets a session and twenty
       confirmations is a different app."""
    s = BENCH["sets"][1]
    return f'''<div class="panel" style="width:380px">
  <div class="panel__hd"><span class="panel__t">Bench press &middot; set 2</span>
    <span class="tag tag--pr" style="margin-left:auto">Record</span></div>
  <div class="panel__body">
    <div class="grid2">
      <div class="fld"><label class="fld__l">Load kg</label>
        <input class="ctl ctl--num" value="{trim1(s[0])}"></div>
      <div class="fld"><label class="fld__l">Reps</label>
        <input class="ctl ctl--num" value="{s[1]}"></div></div>
    <p class="micro" style="margin:18px 0 8px">Effort &middot; RPE</p>
    <div class="wk">{"".join(chip(str(n), on=(n == s[2])) for n in range(6, 11))}</div>
    <p class="small" style="margin-top:7px">Optional, and the reason a log
      written by a coach is worth more than one written by a lifter.</p>
    <p class="micro" style="margin:18px 0 8px">Note</p>
    <textarea class="ctl" style="height:70px;padding:8px 11px;resize:none;
      font-family:var(--tx-font);text-align:left">{s[3]}</textarea>
    <p class="small" style="margin-top:7px">Two lines under the row in the table
      &mdash; read next week with the same set in front of you, not in an
      inbox.</p>
    <div style="margin-top:22px;border-top:1px solid var(--tx-line);
      padding-top:14px">
      <button class="btn btn--ghost" type="button"
        style="color:var(--tx-danger)">{ic(I_TRASH, 15)}Delete this set</button>
      <p class="small" style="margin-top:6px">Goes straight through, with an undo
        behind it. <b class="ink">Undo after, never confirm before</b> &mdash;
        the one exception in this whole screen is discarding a session.</p></div>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--primary" type="button">Save the set</button></div>
</div>'''


def f_set():
    body = f'''{sessionstrip(sets=SETS_MID, volume=VOL_MID, minutes=MINUTES)}
<div style="display:grid;gap:12px;margin-top:12px;
  grid-template-columns:300px minmax(0,1fr);align-items:start">
  <div><p class="micro" style="margin-bottom:7px">{PLAN} &middot; {N_EX} exercises</p>
    {exlist()}</div>
  <div class="card"><div class="card__hd"><p class="card__t">{BENCH["name"]}</p>
      <span class="tag tag--pr">Record &middot; set 2</span></div>
    <div class="card__b">{setgrid(BENCH, done=3)}{resttile(BENCH)}</div></div>
</div>'''
    return app(crumb=CRUMB, head=ph(f"{CLIENT_FULL} &middot; {PLAN}",
                                    f"{dlong(D)} {hm(START_MIN)}", HEAD_ACTS),
               body=body, sync="q", queued=6,
               over='<div class="scrim scrim--soft"></div>' + setpanel())


# ═════════════════════════════════ 1c · the row that has not claimed anything ══
def f_accept():
    """1c. Cable fly, two of three. The empty slot shows what she lifted last
       time, in the quiet ink, dashed — a placeholder and never a value. §09:
       until somebody commits, the log has not claimed a weight nobody lifted."""
    e = FLY
    body = f'''{sessionstrip(sets=SETS_MID, volume=VOL_MID, minutes=MINUTES)}
<div style="display:grid;gap:12px;margin-top:12px;
  grid-template-columns:300px minmax(0,1fr) 320px;align-items:start">
  <div><p class="micro" style="margin-bottom:7px">{PLAN} &middot; {N_EX} exercises</p>
    {exlist(current="fly")}</div>
  <div class="card"><div class="card__hd"><p class="card__t">{e["name"]}</p>
      <span class="small mono" style="margin-left:auto">2 of 3 &middot; one slot
        open</span></div>
    <div class="card__b">{setgrid(e, done=2, active=3)}
      <div class="row" style="margin-top:12px;gap:8px">
        <button class="btn btn--primary btn--sm" type="button">{ic(I_CHECK, 14)}
          Take last time&rsquo;s numbers</button>
        <span class="small mono">&#8984;&#8629;</span>
        <span style="flex:1"></span>
        <button class="btn btn--ghost btn--sm" type="button">{ic(I_PLUS, 14)}
          Add a set</button></div></div></div>
  <div>
    <div class="why" style="margin-top:0"><p class="why__k">A placeholder, never a value</p>
      <p>Set 3 shows <b>{say(e["prev"][2][0], e["prev"][2][1])}</b> in the quiet
      ink and a dashed border, because that is what she did last time and not
      what she has done today. One press takes it exactly as shown &mdash; the
      desk equivalent of the app&rsquo;s one-tap tick &mdash; and until somebody
      presses, <b>the log has not claimed a weight nobody lifted</b>.</p></div>
    <div class="card" style="margin-top:10px"><div class="card__hd">
        <p class="card__t">Why it is a column</p></div>
      <div class="card__b"><p class="small">Hevy solved this years ago with a
        <b>Previous</b> column and there is no reason to redraw a solved table.
        Strong offers last time&rsquo;s numbers as <i>placeholder text inside the
        field</i> instead &mdash; and a placeholder disappears the moment you
        type, which is exactly the moment you want it.</p>
        <p class="small" style="margin-top:9px">§09 makes it the one thing here
        that may never collapse, truncate or hide. It is the entire advantage
        over the notebook this app replaces.</p></div></div>
    <p class="small" style="margin-top:6px">A half-typed row survives a scroll
      and does not survive leaving the session.</p>
  </div></div>'''
    return app(crumb=CRUMB, head=ph(f"{CLIENT_FULL} &middot; {PLAN}",
                                    f"{dlong(D)} {hm(START_MIN)}", HEAD_ACTS),
               body=body, sync="q", queued=6, keys=KEYS)


# ══════════════════════════════════ 1d · an exercise that carries no load ══
REPS_EX = dict(key="chin", name="Chin-up", type="reps", plan=(3, 8), rest=90,
               prev=[(None, 8), (None, 7), (None, 6)], prev_date=LAST_DATE,
               sets=[(None, 9, 8, None), (None, 8, 9, None), (None, 6, 9, None)],
               hist_best_load=0, hist_best_reps_at_best=8, hist_sessions=12)
REPS_EX["verdict"] = judge(REPS_EX["sets"], 0, 8, 12, log_type="reps")
REPS_EX["top"] = top_set(REPS_EX["sets"], "reps")
REPS_EX["volume"] = 0
assert REPS_EX["verdict"]["kind"] == "record", REPS_EX["verdict"]
assert REPS_EX["top"][1] == 9 and REPS_EX["verdict"]["by"] == 1
assert say(None, 9, "reps") == "9 reps"
# Volume is load × reps, so an exercise with no load contributes nothing to it.
# That is arithmetic, not a judgement — and it is why the session figure is
# labelled "kg moved" rather than "work done".
assert vol(REPS_EX["sets"]) == 0


def f_reps():
    e = REPS_EX
    rows = ""
    for i in range(3):
        s, pv = e["sets"][i], e["prev"][i]
        pr = ' class="pr"' if i == 0 else ''
        rows += (f'<tr data-state="done"{pr}><td class="n">{i + 1}</td>'
                 f'<td class="prev">{say(None, pv[1], "reps")}</td>'
                 f'<td class="prev" style="border-left:0">'
                 f'&mdash; no load</td>'
                 f'<td class="num"><input class="ctl" value="{s[1]}" '
                 f'aria-label="Reps, set {i + 1}"></td>'
                 f'<td class="num"><input class="ctl" style="max-width:56px" '
                 f'value="{s[2]}" aria-label="RPE, set {i + 1}"></td>'
                 f'<td class="tick"><button type="button" class="tk tk--on" '
                 f'aria-pressed="true" aria-label="Set {i + 1} logged">'
                 f'{ic(I_CHECK, 15)}</button></td></tr>')
    grid = (f'<table class="sets" style="width:100%;border-collapse:collapse">'
            f'<thead><tr><th class="n"></th><th class="prev">Last time</th>'
            f'<th></th><th class="num">Reps</th><th class="num">RPE</th><th></th>'
            f'</tr></thead><tbody>{rows}</tbody></table>')
    body = f'''<div style="display:grid;gap:12px;
  grid-template-columns:minmax(0,1fr) 380px;align-items:start;max-width:1080px">
  <div class="card"><div class="card__hd"><p class="card__t">{e["name"]}</p>
      <span class="tag tag--pr">Record &middot; set 1</span>
      <span class="small mono" style="margin-left:auto">bodyweight &middot; reps
        only</span></div>
    <div class="card__b">{grid}
      <p class="small" style="margin-top:12px">Nine reps against a best of eight.
        <code>judge</code> compares reps and nothing else here, because there is
        no load to compare &mdash; and the top set is the one with the most reps
        rather than the heaviest.</p></div></div>
  <div>
    <div class="why"><p class="why__k">Relabel, never add</p>
      <p>The load column is <b>not removed</b> and no column is added: five
      columns is what fits at 360dp with Previous intact, and a sixth would have
      to come out of Previous. So the column stays and says
      <i>no&nbsp;load</i>. The web has room for a sixth &mdash; RPE, which is a
      sheet on the phone &mdash; and that is the one place this console is wider
      rather than merely different.</p></div>
    <div class="why why--warn" style="margin-top:12px">
      <p class="why__k">A rule that outruns the type</p>
      <p>§09 says <i>&ldquo;time and distance sets relabel the two input
      columns&rdquo;</i>. <code>LogType</code> is
      <code>'weight_reps' | 'reps'</code> &mdash; two members. A plank and a
      farmer&rsquo;s walk have nowhere to go, so the rule describes a capability
      the union cannot express. &sect;13 owes it two more values.</p></div>
  </div></div>'''
    return app(crumb=CRUMB.replace(f'{CLIENT} &middot;',
                                   'Arjun S &middot;'),
               head=ph("Arjun Subramanian &middot; Pull A",
                       f"{dlong(D)} 07:30 &middot; an exercise with no load",
                       HEAD_ACTS),
               body=body, sync="q", queued=6, keys=KEYS)


# ═══════════════════════════════════════════════ 2a · the four verdicts ══
VERDICT_COPY = {
    "record": ("A RECORD", "gold",
               "Heavier than she has ever lifted, by at least the smallest "
               "plate in the room. Gold, and her phone buzzes."),
    "quiet": ("A RECORD, QUIETLY", "quiet",
              "Real, and small: one more rep at a weight she had already "
              "lifted. In her history. Not on her phone."),
    "matched": ("MATCHED", "",
                "Exactly what she did last time. <b>Matching is not "
                "beating</b> &mdash; no gold, and nothing to send."),
    "first": ("HER FIRST", "",
              "No earlier session to beat. <b>A first log is never a "
              "record</b>: it is the number to beat."),
}


def verdictbench():
    cells = ""
    for e in EX:
        k = e["verdict"]["kind"]
        kicker, tone, why = VERDICT_COPY[k]
        v = e["verdict"]
        big = say(v.get("load"), v.get("reps")) if v.get("load") else \
            f"{v.get('reps')} reps"
        was = ""
        if v.get("was_load") is not None:
            was = (f"was {trim1(v['was_load'])} kg &times; {v['was_reps']}"
                   + (f" &middot; <b class='ink'>+{trim1(v['by'])} kg</b>"
                      if k == "record" else
                      f" &middot; <b class='ink'>+{v['by']} reps</b>"
                      if k == "quiet" else ""))
        elif k == "first":
            was = "nothing before it"
        cells += (f'<div class="vrd__c{f" vrd__c--{tone}" if tone else ""}">'
                  f'<p class="vrd__k">{kicker}</p>'
                  f'<p class="small" style="color:var(--tx-ink-2)">{e["name"]}</p>'
                  f'<p class="vrd__v">{big}</p>'
                  f'<p class="small mono" style="font-size:11px">{was}</p>'
                  f'<p class="vrd__b">{why}</p></div>')
    return f'<div class="vrd">{cells}</div>'


def f_verdicts():
    body = f'''{sessionstrip(sets=SETS_ALL, volume=VOL_ALL, minutes=MINUTES)}
<p class="micro" style="margin:14px 0 8px">Four top sets checked &middot;
  {len(REAL_RECORDS)} genuine records &middot; {len(ANNOUNCED)} worth sending</p>
{verdictbench()}
<div style="display:grid;gap:12px;margin-top:14px;
  grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);align-items:start">
  <div class="card"><div class="card__hd">
      <p class="card__t">The three tests, in order</p></div>
    <div class="card__b card__b--flush">
      <table class="tbl" style="width:100%;border-collapse:collapse">
        <tbody>
        <tr><td style="width:44px" class="mono">1</td>
          <td class="strong">There has to be an earlier session</td>
          <td class="wrap">A first log is never a record. It is the number to beat, not a
            number beaten &mdash; and it is what the rope did today.</td></tr>
        <tr><td class="mono">2</td><td class="strong">It has to beat the old
            number</td><td class="wrap">Matching is not beating. The incline press went
            {say(EX[1]["top"][0], EX[1]["top"][1])} against exactly
            {say(EX[1]["verdict"]["was_load"], EX[1]["verdict"]["was_reps"])},
            so it gets nothing.</td></tr>
        <tr><td class="mono">3</td><td class="strong">Only the top set is
            checked</td><td class="wrap">So a warm-up can never make one &mdash; and the gold
            sits on <b>set {BENCH["sets"].index(BENCH["top"]) + 1}</b> of the
            bench, not on the last set she did.</td></tr>
        </tbody></table></div></div>
  <div>
    <div class="why why--warn"><p class="why__k">And then the plate</p>
      <p>A fourth test, and it decides whether her phone buzzes rather than
      whether the record is real: a jump smaller than the <b>smallest plate in
      the room</b> is not a session&rsquo;s worth of progress, it is a typo or a
      half plate. <code>plateStepKg</code> is {trim1(PLATE_STEP)} kg here and
      <b>1.25 in some gyms</b>, so it is per-gym &mdash; the one number on this
      screen that changes when the trainer changes building.</p></div>
    <p class="small" style="margin-top:12px">A trainer who forwards five records
      a week has taught a client that records mean nothing. Of four candidates
      today, <b>{len(ANNOUNCED)}</b> is worth saying out loud &mdash; and the
      threshold is stated on the screen rather than hidden in a help page,
      because a threshold nobody can see is a threshold nobody trusts.</p>
  </div></div>'''
    return app(crumb=CRUMB, head=ph(f"{CLIENT_FULL} &middot; {PLAN}",
                                    f"{dlong(D)} &middot; logged, not yet closed",
                                    HEAD_ACTS),
               body=body, sync="q", queued=6)


# ══════════════════════════════════════════════════ 2b · derived, not stored ══
NOV = date(2025, 11, 18)


def f_correct():
    """6c on the app's map, and the reason a desk console exists at all: a set
       typed wrong in November, corrected in August, and every record that
       depended on it fixed in the same frame."""
    body = f'''<div style="display:grid;gap:12px;
  grid-template-columns:minmax(0,1fr) 380px;align-items:start;max-width:1120px">
  <div class="card"><div class="card__hd">
      <p class="card__t">Bench press &middot; {dlong(NOV)}</p>
      <span class="tag tag--warn">Correcting</span>
      <span class="small mono" style="margin-left:auto">nine months ago</span></div>
    <div class="card__b card__b--flush">
      <table class="sets" style="width:100%;border-collapse:collapse">
        <thead><tr><th class="n"></th><th class="prev">RPE</th>
          <th class="num">Load kg</th><th class="num">Reps</th>
          <th class="slack"></th><th></th></tr></thead>
        <tbody>
        <tr data-state="done"><td class="n">1</td><td class="prev">RPE 7</td>
          <td class="num"><input class="ctl" value="40" aria-label="Load, set 1"></td>
          <td class="num"><input class="ctl" value="8" aria-label="Reps, set 1"></td>
          <td></td>
          <td class="tick"><button type="button" class="tk tk--on" aria-pressed="true"
            aria-label="Set 1 logged">{ic(I_CHECK, 15)}</button></td></tr>
        <tr data-state="active" class="pr"><td class="n">2</td>
          <td class="prev">RPE 9</td>
          <td class="num"><input class="ctl" value="95" aria-label="Load, set 2"
            style="border-color:var(--tx-warn)"></td>
          <td class="num"><input class="ctl" value="6" aria-label="Reps, set 2"></td>
          <td></td>
          <td class="tick"><button type="button" class="tk tk--on" aria-pressed="true"
            aria-label="Set 2 logged">{ic(I_CHECK, 15)}</button></td></tr>
        <tr class="note"><td></td><td colspan="5"><p>{ic(I_WARN, 13)}
          Typed as <b>95</b>. She was benching 40 kg that month, and the set
          before it was 40 &times; 8.</p></td></tr>
        <tr data-state="done"><td class="n">3</td><td class="prev">RPE 8</td>
          <td class="num"><input class="ctl" value="40" aria-label="Load, set 3"></td>
          <td class="num"><input class="ctl" value="7" aria-label="Reps, set 3"></td>
          <td></td>
          <td class="tick"><button type="button" class="tk tk--on" aria-pressed="true"
            aria-label="Set 3 logged">{ic(I_CHECK, 15)}</button></td></tr>
        </tbody></table></div></div>
  <div>
    <div class="why"><p class="why__k">Change it, and nine months fix themselves</p>
      <p>There is <b>no <code>savePr</code> anywhere in this codebase</b>. A
      record is computed on read, every read, so correcting this one set removes
      the gold from November <i>and</i> re-judges every session after it in the
      same frame. A stored PR would be a second copy of the truth, and second
      copies drift.</p></div>
    <p class="micro" style="margin:16px 0 8px">What moves when 95 becomes 40</p>
    <div class="card"><div class="card__b card__b--flush">
      <div class="q"><span class="q__ic q__ic--ok">{ic(I_CHECK, 13)}</span>
        <span class="q__m"><span class="q__t">November loses its record</span>
        <span class="q__s">40 &times; 8 was not a best</span></span></div>
      <div class="q"><span class="q__ic q__ic--ok">{ic(I_CHECK, 13)}</span>
        <span class="q__m"><span class="q__t">Four later sessions gain one</span>
        <span class="q__s">each was judged against 95 kg and lost</span></span></div>
      <div class="q"><span class="q__ic q__ic--ok">{ic(I_CHECK, 13)}</span>
        <span class="q__m"><span class="q__t">Her top-set line redraws</span>
        <span class="q__s">45 &rarr; &hellip; &rarr; 65, with no spike in it</span></span></div>
      <div class="q"><span class="q__ic">{ic(I_NO, 13)}</span>
        <span class="q__m"><span class="q__t">Nothing is sent to her</span>
        <span class="q__s">a record un-made nine months late is not news</span></span></div>
    </div></div>
    <p class="small" style="margin-top:12px">Strava is the only platform in the
      teardown that got this right, and it is the one idea worth taking from it.
      Every other logger stores the badge and then cannot explain why a
      corrected set still has one.</p>
  </div></div>'''
    return app(crumb=f'<a href="/sessions">Sessions</a><i aria-hidden="true">/</i>'
                     f'<a href="#">{CLIENT}</a><i aria-hidden="true">/</i>'
                     f'<b>Bench press &middot; {dshort(NOV)}</b>',
               head=ph("Correcting a set from November",
                       f"{CLIENT_FULL} &middot; the reason this console exists",
                       f'<button class="btn btn--ghost" type="button">Cancel</button>'
                       f'<button class="btn btn--primary" type="button">'
                       f'Save the correction</button>'),
               body=body, sync="ok")


# ════════════════════════════════════════════ 3a · the rack was busy ══
RECENTS = [("Machine chest press", "45 kg &times; 10", "3 Aug"),
           ("Dumbbell floor press", "20 kg &times; 12", "28 Jul"),
           ("Push-up", "18 reps", "21 Jul")]
MINE = [("Banded press &middot; Meera", "shoulder, left", "14 Jul")]
LIB_N = TDY.EXER_N          # 1,324 — the library, before anybody signs up


def addpanel():
    rec = "".join(
        f'<div class="lrow"><span class="lrow__m" style="flex:1">'
        f'<span class="lrow__t">{n}</span>'
        f'<span class="lrow__s">last: {v} &middot; {d}</span></span>'
        f'{ic(I_PLUS, 16)}</div>' for n, v, d in RECENTS)
    mine = "".join(
        f'<div class="lrow"><span class="lrow__m" style="flex:1">'
        f'<span class="lrow__t">{n}</span>'
        f'<span class="lrow__s">yours &middot; {v} &middot; {d}</span></span>'
        f'{ic(I_PLUS, 16)}</div>' for n, v, d in MINE)
    return f'''<div class="panel" style="width:420px">
  <div class="panel__hd"><span class="panel__t">Add an exercise</span>
    <span class="small mono" style="margin-left:auto">today only</span></div>
  <div class="panel__body">
    <div class="search">{ic(I_SEARCH, 15)}<span>Search {LIB_N} exercises</span></div>
    <div class="wk" style="margin-top:10px">{chip("Recent", on=True)}
      {chip("Yours", count=len(MINE))}{chip("Chest")}{chip("Triceps")}
      {chip("All")}</div>
    <p class="micro" style="margin:18px 0 7px">She has done these</p>
    <div class="lgl">{rec}</div>
    <p class="small" style="margin-top:7px">Recents first, and every one carries
      what she last lifted on it &mdash; so the choice is made on numbers rather
      than on a name. That is the difference between this and a search box over
      {LIB_N} rows.</p>
    <p class="micro" style="margin:18px 0 7px">Yours</p>
    <div class="lgl">{mine}</div>
    <p class="small" style="margin-top:7px">A movement invented for one
      client&rsquo;s shoulder is the one a trainer hunts for hardest. Hevy buries
      it in the same alphabetical list as the other four hundred.</p>
  </div>
  <div class="panel__foot"><span class="small" style="margin-right:auto;
    max-width:26ch">Goes into today&rsquo;s log only. Her program does not
    change.</span>
    <button class="btn btn--ghost" type="button">Cancel</button></div></div>'''


def f_add():
    body = f'''{sessionstrip(sets=SETS_MID, volume=VOL_MID, minutes=MINUTES)}
<div style="display:grid;gap:12px;margin-top:12px;
  grid-template-columns:300px minmax(0,1fr);align-items:start">
  <div><p class="micro" style="margin-bottom:7px">{PLAN} &middot; {N_EX} exercises</p>
    {exlist(current=None)}</div>
  <div class="card"><div class="card__hd"><p class="card__t">{FLY["name"]}</p></div>
    <div class="card__b">{setgrid(FLY, done=2, active=3)}</div></div>
</div>'''
    return app(crumb=CRUMB, head=ph(f"{CLIENT_FULL} &middot; {PLAN}",
                                    f"{dlong(D)} {hm(START_MIN)}", HEAD_ACTS),
               body=body, sync="q", queued=6,
               over='<div class="scrim scrim--soft"></div>' + addpanel())


# ═══════════════════════════════════════════════ 3b · swap, with a scope ══
def swapmodal():
    rows = ""
    for key, label, reach, why in SWAP_SCOPES:
        cls = "scp"
        if key == "today":
            cls += " scp--on"
        if reach > 1:
            cls += " scp--wide"
        n = ("this log" if key == "today" else
             f"{PROG_TOTAL - PROG_WEEK} weeks" if key == "program" else
             f"{reach} clients")
        rows += (f'<button class="{cls}" type="button" style="margin-top:8px">'
                 f'<span class="rad{" rad--on" if key == "today" else ""}"></span>'
                 f'<span class="scp__m"><span class="scp__t">{label}</span>'
                 f'<span class="scp__b">{why}</span></span>'
                 f'<span class="scp__n">{n}</span></button>')
    return f'''<div class="modal" style="width:560px">
  <div class="modal__hd"><p class="modal__t">Cable fly &rarr; Machine chest press</p></div>
  <div class="modal__body" style="padding-bottom:8px">
    <p style="margin:0 0 4px">The rack was busy. That is a Tuesday, not an
      exception &mdash; and an app that scores it as non-adherence is wrong about
      the gym it is being used in.</p>
    <p class="micro" style="margin:16px 0 0">How far does this reach?</p>
    {rows}
    <p class="small" style="margin-top:12px">Three different decisions, and every
      competitor in the teardown collapses them into one. Each states its own
      blast radius <b>before</b> the tap &mdash; including the one that reaches
      {SWAP_REACH} people, because a change that size should never be discovered
      afterwards.</p>
  </div>
  <div class="modal__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--primary" type="button">Swap for today</button></div>
</div>'''


def f_swap():
    body = f'''{sessionstrip(sets=SETS_MID, volume=VOL_MID, minutes=MINUTES)}
<div style="display:grid;gap:12px;margin-top:12px;
  grid-template-columns:300px minmax(0,1fr);align-items:start">
  <div><p class="micro" style="margin-bottom:7px">{PLAN} &middot; {N_EX} exercises</p>
    {exlist(current="fly")}</div>
  <div class="card"><div class="card__hd"><p class="card__t">{FLY["name"]}</p></div>
    <div class="card__b">{setgrid(FLY, done=2, active=3)}</div></div>
</div>'''
    return app(crumb=CRUMB, head=ph(f"{CLIENT_FULL} &middot; {PLAN}",
                                    f"{dlong(D)} {hm(START_MIN)}", HEAD_ACTS),
               body=body, sync="q", queued=6,
               over='<div class="scrim"></div>' + swapmodal())


# ═══════════════════════════════════════ 4a · one exercise, all of it ══
def f_history():
    """`buildHistory`. The same columns as the log, read-only, with the Previous
       column repurposed to carry RPE — a trainer should never have to learn a
       second layout for their own data."""
    rows = ""
    for d, sets in BENCH_HIST:
        kind = PR_KINDS[d]
        tag = ({"record": '<span class="tag tag--pr">Record</span>',
                "quiet": '<span class="tag tag--pr">Record &middot; quiet</span>',
                "first": '<span class="tag tag--info">Her first</span>'}
               .get(kind, ""))
        rows += (f'<tr class="grph"><th colspan="6">'
                 f'{"Today &middot; " if d == D else ""}{dlong(d)} '
                 f'<span class="ink3">'
                 f'{vol([(l, r, 0, None) for l, r, _ in sets]):,} kg</span>'
                 f'<em>{tag}</em></th></tr>')
        for i, (l, r, rpe) in enumerate(sets):
            pr = ' class="pr"' if PR_MARKS.get(d) == i else ''
            rows += (f'<tr data-state="done"{pr}><td class="n">{i + 1}</td>'
                     f'<td class="prev">RPE {rpe}</td>'
                     f'<td class="num mono">{trim1(l)}</td>'
                     f'<td class="num mono">{r}</td>'
                     f'<td colspan="2"></td></tr>')
    body = f'''<div style="display:grid;gap:12px;
  grid-template-columns:minmax(0,1fr) 360px;align-items:start;max-width:1140px">
  <div class="card"><div class="card__hd"><p class="card__t">Bench press</p>
      <span class="small mono" style="margin-left:auto">{CLIENT_FULL} &middot;
        {N_HIST_SESSIONS} sessions shown</span></div>
    <div class="card__b card__b--flush">
      <table class="sets" style="width:100%;border-collapse:collapse">
        <thead><tr><th class="n"></th><th class="prev">RPE</th>
          <th class="num">Load kg</th><th class="num">Reps</th>
          <th class="slack" colspan="2"></th></tr></thead>
        <tbody>{rows}</tbody></table></div></div>
  <div>
    <div class="why"><p class="why__k">Judged at the time, not tagged</p>
      <p>The history is walked <b>forward</b> and each session judged against
      everything before it, by the same function the floor screen uses. Four of
      these five carry a tag; {dlong(BENCH_HIST[-1][0])} does not, because there
      was nothing before it. <b>There is no stored flag to disagree with.</b></p></div>
    <div class="card" style="margin-top:12px"><div class="card__hd">
        <p class="card__t">Two things this layout keeps</p></div>
      <div class="card__b">
        <p class="small"><b class="ink">The same five columns as the log.</b> A
        trainer should never have to learn a second layout for their own data, so
        the Previous column is simply repurposed &mdash; here it carries the RPE,
        which is the one thing worth keeping from a set that already
        happened.</p>
        <p class="small" style="margin-top:9px"><b class="ink">Sets stay in the
        order they happened.</b> Sessions run newest first, but set 3 only means
        something after set 2 &mdash; and the tag is on the set, not on the
        day.</p></div></div>
    <p class="small" style="margin-top:12px">1 August is the interesting row:
      60 kg for 8 where her best at 60 was 6. A record, and a quiet one, so it
      is here and it was never sent.</p>
  </div></div>'''
    return app(crumb=f'<a href="/sessions">Sessions</a><i aria-hidden="true">/</i>'
                     f'<a href="#">{CLIENT}</a><i aria-hidden="true">/</i><b>Bench press</b>',
               head=ph("Bench press &middot; every session",
                       f"{CLIENT_FULL} &middot; read-only &middot; every record "
                       f"re-judged on open", ""),
               body=body, sync="ok")


# ══════════════════════════════════════════════ 4b · progress, honestly ══
def volbars():
    """Eight bars, from zero. The first and the last carry their figure, because
       a chart with a number at neither end can only say "up a bit" — and the
       whole claim of this card is a percentage between those two numbers."""
    bars = "".join(
        f'<i class="{"on" if i == N_WEEKS - 1 else ""}" '
        f'style="height:{round(100 * v / VOL_PEAK)}%">'
        + (f'<b>{v:,}</b>' if i in (0, N_WEEKS - 1) else '')
        + '</i>'
        for i, v in enumerate(WEEK_VOL))
    labs = "".join(f'<span>w{i + 1}</span>' for i in range(N_WEEKS))
    return f'<div class="vb">{bars}</div><div class="vbx">{labs}</div>'


def f_progress():
    body = f'''<div class="stats stats--4">
  <div class="stat"><p class="stat__k">Sessions</p><p class="stat__v">{SESSIONS_8W}</p>
    <p class="stat__d">in eight weeks</p></div>
  <div class="stat"><p class="stat__k">Sets</p><p class="stat__v">{SETS_8W}</p>
    <p class="stat__d">across {BENCH["hist_sessions"] // 3 + N_EX} exercises</p></div>
  <div class="stat stat--acc"><p class="stat__k">Records</p>
    <p class="stat__v">{RECORDS_8W}</p><p class="stat__d">judged on read, never
      stored</p></div>
  <div class="stat"><p class="stat__k">Volume this week</p>
    <p class="stat__v">{VOL_ALL:,}</p><p class="stat__d">kg &middot;
      <b>+{VOL_DELTA}%</b> on week one</p></div></div>

<div style="display:grid;gap:12px;margin-top:12px;
  grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)">
  <div class="card"><div class="card__hd"><p class="card__t">Volume, eight weeks</p>
      <span class="small mono" style="margin-left:auto">kg moved per week</span></div>
    <div class="card__b">{volbars()}
      <p class="small" style="margin-top:12px"><b class="ink">Bars, from
        zero.</b> Volume is a sum, so a bar tells the truth about it &mdash; and
        this is the only figure on the screen that gets one.</p></div></div>
  <div>
    <div class="card"><div class="card__hd"><p class="card__t">Bench press, her
        last five</p></div>
      <div class="card__b">
        <p class="seq">{" &rarr; ".join(
            (f"<b>{trim1(v)}</b>" if i == len(TOP_SERIES) - 1 else trim1(v))
            for i, v in enumerate(TOP_SERIES))} kg</p>
        <p class="small" style="margin-top:10px">Written out, never charted.
          From a zero baseline a {trim1(PLATE_STEP)} kg week is two pixels; from
          a 50 kg baseline it is everything. This is also what a coach says out
          loud.</p></div></div>
    <div class="card" style="margin-top:12px"><div class="card__hd">
        <p class="card__t">Bodyweight</p></div>
      <div class="card__b">
        <div class="row" style="align-items:baseline;gap:10px">
          <p style="font-family:var(--tx-brand);font-weight:800;font-size:30px;
            letter-spacing:-.03em">{BW_NOW}<span class="ink3"
            style="font-size:16px"> kg</span></p>
          <p class="small mono">{trim1(BW_DELTA)} over six months</p></div>
        <p class="small" style="margin-top:9px">No colour and no arrow. The app
          has <b>no opinion</b> about which way a client&rsquo;s weight should
          go, and a green arrow would be one.</p></div></div>
  </div></div>'''
    return app(crumb=f'<a href="/clients">Clients</a><i aria-hidden="true">/</i>'
                     f'<a href="#">{CLIENT}</a><i aria-hidden="true">/</i><b>Progress</b>',
               head=ph(f"{CLIENT_FULL} &middot; progress",
                       f"Week {PROG_WEEK} of {PROG_TOTAL} &middot; {PLAN} "
                       f"&middot; eight weeks shown",
                       f'{chip("8 weeks", on=True)}{chip("6 months")}{chip("All")}'),
               body=body, sync="ok")


# ══════════════════════════════════════════ 5a · who am I logging for ══
def f_pick():
    def grp(label, note, rows, kind):
        body = ""
        for name, ini, tok, meta in rows:
            act = {"open": "Carry on", "booked": "Start", "roster": "Log"}[kind]
            body += (f'<div class="lrow">{avm(ini, tok)}'
                     f'<span class="lrow__m" style="flex:1">'
                     f'<span class="lrow__t">{name}</span>'
                     f'<span class="lrow__s">{meta}</span></span>'
                     f'<button class="btn btn--secondary btn--sm" type="button">'
                     f'{act}</button></div>')
        return (f'<p class="micro" style="margin:18px 0 7px">{label}'
                f'<span class="ink3" style="margin-left:8px;letter-spacing:0;'
                f'text-transform:none;font-family:var(--tx-font)">{note}</span></p>'
                f'<div class="lgl">{body}</div>')
    body = f'''<div style="display:grid;gap:20px;
  grid-template-columns:minmax(0,520px) minmax(0,1fr);max-width:1060px">
  <div>
    <p class="note" style="margin-top:0">One question, asked once. Not what kind
      of workout, not which program, not when &mdash; all three are answerable
      from <b>who</b>, and asking is how a two-tap action becomes a five-tap
      one.</p>
    {grp("Still open", "logs on the go", PICK_OPEN, "open")}
    {grp("Booked today", "opens against the booking", PICK_BOOKED, "booked")}
    {grp("Everybody else", "no booking needed", PICK_ROSTER, "roster")}
    <p class="small" style="margin-top:9px">Sorted by who trained most recently,
      because those are the people most likely to be standing in front of
      you.</p>
  </div>
  <div>
    <div class="why"><p class="why__k">The third group is the finding</p>
      <p>Every logger in the teardown assumes a workout belongs to a booking or
      a saved routine. <b>ABC Trainerize is the only one of them that lets a
      trainer log on the web at all, and it requires the session to be on the
      client&rsquo;s calendar first.</b> In a gym where the trainer is on the
      floor, a client turning up on a day she does not normally train is a
      Tuesday &mdash; and logging is allowed to happen before programming
      exists. Before booking, too.</p></div>
    <div class="card" style="margin-top:12px"><div class="card__hd">
        <p class="card__t">Why <i>Still open</i> is first</p></div>
      <div class="card__b"><p class="small">A trainer who logs four clients a
        morning has logs on the go, and coming back to one is the commonest
        reason to press this at all. Nothing is started from that group &mdash;
        it goes straight back in, at the set it was left on.</p>
        <p class="small" style="margin-top:9px">Two logs open at once is a
        supported state, not a warning. One phone, one desk, four clients
        between six and nine.</p></div></div>
  </div></div>'''
    return app(crumb='<a href="/sessions">Sessions</a><i aria-hidden="true">/</i><b>Log a workout</b>',
               head=ph("Who is this for?",
                       f"{dlong(D)} &middot; one question, and it decides "
                       f"everything else", ""),
               body=body, sync="ok")


# ══════════════════════════════════════════════════════ 5b · finished ══
def f_finish():
    pr = ANNOUNCED[0]
    msg = (f"{CLIENT_FULL.split()[0]} &mdash; {PLAN} done. "
           f"{say(pr['verdict']['load'], pr['verdict']['reps'])} on the bench, "
           f"a new best. {SETS_ALL} sets, {VOL_ALL:,} kg.")
    body = f'''<div style="display:grid;gap:12px;
  grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);max-width:1100px">
  <div>
    <div class="stats stats--4">
      <div class="stat"><p class="stat__k">Sets</p>
        <p class="stat__v">{SETS_ALL}</p><p class="stat__d">all {PLANNED_SETS}
          planned</p></div>
      <div class="stat"><p class="stat__k">Volume</p>
        <p class="stat__v">{VOL_ALL:,}</p><p class="stat__d">kg moved</p></div>
      <div class="stat"><p class="stat__k">Minutes</p>
        <p class="stat__v">{MINUTES}</p><p class="stat__d">{hm(START_MIN)} to
          {hm(ENDED_MIN)}</p></div>
      <div class="stat stat--acc"><p class="stat__k">Records</p>
        <p class="stat__v">{len(REAL_RECORDS)}</p><p class="stat__d">
          {len(ANNOUNCED)} worth sending</p></div></div>

    <div class="why why--warn" style="margin-top:14px">
      <p class="why__k">This did not touch her pack</p>
      <p>The sets happened. Whether the session counts against her money is a
      <b>second, separate tap</b> &mdash; and a pack moves on <i>done</i> or
      <i>no-show</i>, never on <i>booked</i>. Her pack is
      <b>{PACK_NOW} of {PACK_TOTAL}</b> right now and will be
      <b>{PACK_AFTER_DONE} of {PACK_TOTAL}</b> the moment somebody marks today
      done. Undoable for {UNDO_HOURS} hours either way, because it is one tap
      and it is somebody&rsquo;s money.</p></div>

    <div class="row" style="margin-top:16px;gap:9px;flex-wrap:wrap">
      <button class="btn btn--primary btn--lg" type="button">{ic(I_CHECK, 16)}
        Mark the session done</button>
      <button class="btn btn--secondary btn--lg" type="button">
        They didn&rsquo;t train</button>
      <button class="btn btn--ghost btn--lg" type="button">Later</button></div>
    <p class="small" style="margin-top:8px"><b class="ink">Later is a real
      option, not a cancel.</b> It leaves the session open and the diary chases
      it tomorrow.</p>
  </div>
  <div>
    {prcard(pr)}
    <div class="card" style="margin-top:12px"><div class="card__hd">
        <p class="card__t">Send her the record</p>
        <span class="sw" style="margin-left:auto"><span class="sw__i"></span></span>
      </div>
      <div class="card__b">
        <div class="ctl ctl--said" style="height:auto;padding:10px 12px;
          white-space:normal;line-height:1.55;text-align:left">{msg}</div>
        <p class="small" style="margin-top:9px">One WhatsApp, <b>opened for the
          trainer to send</b> and never sent on their behalf. The client&rsquo;s
          number belongs to the trainer&rsquo;s relationship with her, and an app
          that posts to it unasked has taken a liberty.</p>
        <p class="small" style="margin-top:9px">The switch decides whether the
          chat opens at all. Only the {len(ANNOUNCED)} loud record is in it
          &mdash; the quiet one on the cable fly stays in her history.</p></div></div>
  </div></div>'''
    return app(crumb=CRUMB, head=ph(f"{PLAN}, logged",
                                    f"{CLIENT_FULL} &middot; week {PROG_WEEK} of "
                                    f"{PROG_TOTAL} &middot; {N_EX} exercises "
                                    f"planned, {N_EX} done", ""),
               body=body, sync="q", queued=6)


# ══════════════════════════════════════════ 5c · they didn't train ══
def nottrained():
    rows = ""
    for title, tag, costs, why in NOT_TRAINED:
        rows += (f'<button class="scp{" scp--wide" if costs else ""}" '
                 f'type="button" style="margin-top:8px">'
                 f'<span class="rad"></span>'
                 f'<span class="scp__m"><span class="scp__t">{title}</span>'
                 f'<span class="scp__b">{why}</span></span>'
                 f'<span class="scp__n">{"&minus;1 session" if costs else "no change"}'
                 f'</span></button>')
    return f'''<div class="modal" style="width:540px">
  <div class="modal__hd"><p class="modal__t">{CLIENT_FULL} didn&rsquo;t train</p></div>
  <div class="modal__body" style="padding-bottom:8px">
    <p style="margin:0">Three outcomes, and exactly one difference between them:
      <b>a no-show costs a session</b> and both kinds of cancellation do
      not.</p>
    {rows}
    <p class="small" style="margin-top:12px">That single fact is what is actually
      being decided, so it is written inside each option rather than in a
      confirmation afterwards &mdash; the same shape the diary uses, because a
      decision about somebody&rsquo;s money should read identically wherever it
      is made. Undoable for {UNDO_HOURS} hours.</p>
  </div>
  <div class="modal__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--primary" type="button" aria-disabled="true">
      Save</button></div></div>'''


def f_nottrained():
    body = f'''<div class="stats stats--4">
  <div class="stat"><p class="stat__k">Sets</p><p class="stat__v">0</p>
    <p class="stat__d">nothing logged</p></div>
  <div class="stat"><p class="stat__k">Volume</p><p class="stat__v">0</p>
    <p class="stat__d">kg</p></div>
  <div class="stat"><p class="stat__k">Booked</p>
    <p class="stat__v">{hm(START_MIN)}</p><p class="stat__d">{dlong(D)}</p></div>
  <div class="stat"><p class="stat__k">Pack</p>
    <p class="stat__v">{PACK_NOW}<span class="ink3" style="font-size:16px">
      /{PACK_TOTAL}</span></p><p class="stat__d">unchanged so far</p></div></div>'''
    return app(crumb=CRUMB, head=ph(f"{CLIENT_FULL} &middot; {PLAN}",
                                    f"{dlong(D)} {hm(START_MIN)} &middot; "
                                    f"nothing logged", HEAD_ACTS),
               body=body, sync="ok",
               over='<div class="scrim"></div>' + nottrained())


# ══════════════════════════════════════════════════ 6a · the basement ══
QUEUE = [("Bench press &middot; set 3", "65 kg &times; 5 &middot; 07:41", "ok"),
         ("Cable fly &middot; set 3", "15 kg &times; 14 &middot; 07:44", "ok"),
         ("Triceps rope &middot; 3 sets", "25 kg &middot; 07:49", "ok"),
         ("RPE 9 &middot; bench set 2", "with the note &middot; 07:41", "ok"),
         ("Rest changed &middot; cable fly", "60 s &middot; 07:43", "ok"),
         ("Session finished", "waiting on a connection", "warn")]
N_QUEUE = len(QUEUE)
assert N_QUEUE == 6      # the pill in the top bar, on every frame in this set


def f_offline():
    q = "".join(
        f'<div class="q"><span class="q__ic{" q__ic--ok" if k == "ok" else ""}">'
        f'{ic(I_CHECK if k == "ok" else I_WARN, 13)}</span>'
        f'<span class="q__m"><span class="q__t">{t}</span>'
        f'<span class="q__s">{s}</span></span></div>' for t, s, k in QUEUE)
    body = f'''<div class="bulk" style="margin:-20px -24px 12px;
  background:var(--tx-warn-soft);border-bottom-color:var(--tx-warn);
  color:var(--tx-warn)">{ic(I_CLOUD, 16)}
  Offline &mdash; every set below is on this computer. {N_QUEUE} writes waiting.
  <span class="bulk__acts"><button class="btn btn--secondary btn--sm"
    type="button">Open the sync queue</button></span></div>
{sessionstrip(sets=SETS_ALL, volume=VOL_ALL, minutes=MINUTES)}
<div style="display:grid;gap:12px;margin-top:12px;
  grid-template-columns:300px minmax(0,1fr) 340px;align-items:start">
  <div><p class="micro" style="margin-bottom:6px">{PLAN} &middot; all
    {PLANNED_SETS} sets in</p>
    {exlist(done={"bench": 3, "incline": 3, "fly": 3, "rope": 3},
            current="fly", show_verdict=True)}</div>
  <div class="card"><div class="card__hd"><p class="card__t">{FLY["name"]}</p>
      <span class="tag tag--pr">Record &middot; quiet</span></div>
    <div class="card__b">{setgrid(FLY, done=3, queued=(3,))}
      <p class="small" style="margin-top:9px">The amber ring on set 3 is the only thing
        sync is allowed to say about a set. It does not mean provisional &mdash;
        it happened, and the ring is about a server, not a barbell.</p></div></div>
  <div>
    <div class="card"><div class="card__hd"><p class="card__t">Waiting</p>
        <span class="tag tag--warn">{N_QUEUE}</span></div>
      <div class="card__b card__b--flush">{q}</div></div>
    <div class="why" style="margin-top:10px"><p class="why__k">The basement is
      the normal case</p>
      <p>The free-weights floor is a level below the road and 4G does not reach
      it, so offline is <b>not a fallback</b>: a tick writes locally and returns
      in the same frame, and there is <b>no skeleton anywhere in a
      session</b>.</p></div>
  </div></div>'''
    return app(crumb=CRUMB, head=ph(f"{CLIENT_FULL} &middot; {PLAN}",
                                    f"{dlong(D)} {hm(START_MIN)} &middot; "
                                    f"working offline", HEAD_ACTS),
               body=body, sync="off")


# ═════════════════════════════════════════════ 6b · nothing planned ══
REPEAT = dict(date=date(2026, 7, 31), label="Push A", meta="4 exercises · 12 sets · 3,290 kg")
QUIET_DAYS_N = 9


def f_empty():
    body = f'''<div style="display:grid;gap:20px;
  grid-template-columns:minmax(0,560px) minmax(0,1fr);max-width:1080px">
  <div>
    <div class="empty" style="min-height:0;padding:34px 0 26px;align-items:flex-start;
      text-align:left">
      <span class="empty__ic">{ic(I_DUMB, 22)}</span>
      <p class="empty__t">Nothing planned, and nothing added</p>
      <p class="empty__b" style="max-width:48ch">She has no live program, so there
        is no plan to seed this log from. Logging is allowed to happen
        <b class="ink">before programming exists</b> &mdash; so this is a starting
        point, not an error.</p></div>
    <div class="lgl">
      <div class="lrow"><span class="lrow__m" style="flex:1">
        <span class="lrow__t">Repeat {dshort(REPEAT["date"])} &middot;
          {REPEAT["label"]}</span>
        <span class="lrow__s">{REPEAT["meta"]}</span></span>
        <button class="btn btn--primary btn--sm" type="button">Use it</button></div>
      <div class="lrow">{ic(I_PLUS, 17)}<span class="lrow__m" style="flex:1">
        <span class="lrow__t">Add an exercise</span>
        <span class="lrow__s">recents first, with what she last lifted</span></span>
        </div>
      <div class="lrow">{ic(I_GRID, 17)}<span class="lrow__m" style="flex:1">
        <span class="lrow__t">Assign her a program</span>
        <span class="lrow__s">and this log seeds itself next time</span></span>
        </div></div>
    <div class="msg msg--warn" style="margin-top:14px">{ic(I_WARN, 15)}<span>
      <b>No workout logged in {QUIET_DAYS_N} days.</b> Stated, not
      editorialised &mdash; the app does not know why, and a screen that guesses
      is a screen a trainer argues with.</span></div>
  </div>
  <div>
    <div class="why"><p class="why__k">The last whole session, as something to
      repeat</p>
      <p>Not a template and not a suggestion: the actual session she did on
      {dlong(REPEAT["date"])}, offered whole. The commonest thing a trainer wants
      on a day with no plan is <b>last time again</b>, and every logger in the
      teardown makes them build it from a routine instead.</p></div>
    <p class="small" style="margin-top:12px">And nothing here auto-progresses it.
      §09: <b class="ink">the app never puts a number in a row that nobody
      lifted</b>. Repeating the session brings the exercises and the slots; the
      loads arrive in the Previous column, where they belong.</p>
  </div></div>'''
    return app(crumb=f'<a href="/sessions">Sessions</a><i aria-hidden="true">/</i>'
                     f'<b>Priya N &middot; {dlong(D)}</b>',
               head=ph("Priya Nair &middot; no plan",
                       f"{dlong(D)} &middot; nothing to seed from", HEAD_ACTS),
               body=body, sync="ok")


# ═══════════════════════════════════════════════════════════ frames ══
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


# ══════════════════════════════════════════════════════════════ findings ══
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
    "01", f"The page said it stood in for {len(STALE_CLAIMED)} app frames and "
          f"drew {STALE_FRAMES}", "danger",
    f'Its provenance line reads <i>{" ".join(STALE_CLAIMED)}</i> and there is '
    f'<b>one</b> frame under it. <code>app/src/screens/main/log</code> holds '
    f'<b>{LOG_SCREENS}</b> screens and <b>{LOG_SHEETS}</b> sheets &mdash; '
    f'{LOG_SURFACES} surfaces &mdash; plus the client&rsquo;s own read-only '
    f'copy in <code>screens/client/ClientLogScreen.tsx</code>. Twelve of them '
    f'carry a rule the one frame could not express.',
    f'<code>ls app/src/screens/main/log/ | wc -l</code>. The change table at '
    f'the foot of that page has four rows for {LOG_SURFACES} surfaces.'))
FIND.append(finding(
    "02", "It put the pack in the session summary, which is the one thing this "
          "screen must not do", "danger",
    f'The strip read <b>&ldquo;Package after this &middot; {STALE_PACK_LINE} of '
    f'{PACK_TOTAL}&rdquo;</b>. §09: <i>&ldquo;Finishing the log does not move '
    f'the pack. A pack moves on <b>done</b> or <b>no-show</b>, never on '
    f'<b>booked</b>&rdquo;</i> &mdash; and the rule names this screen as the one '
    f'most likely to break it. <i>After this</i> is the whole problem: it says '
    f'the log does the moving. And the figure was wrong twice over, because her '
    f'pack is {PACK_NOW} now and {PACK_AFTER_DONE} after somebody marks today '
    f'done.',
    f'<code>FinishView.packMoves</code> and the sentence in '
    f'<code>buildFinish</code>. Her file has {PACK_AFTER_DONE} of '
    f'{PACK_TOTAL} left with today counted, so before the second tap it is '
    f'{PACK_NOW}. Neither is {STALE_PACK_LINE}.'))
FIND.append(finding(
    "03", f"&ldquo;{STALE_DATE}&rdquo; &mdash; not today, and not a Tuesday",
    "danger",
    f'Today in this set is <b>{dlong(D)} 2026</b>. '
    f'{STALE_D.day} August 2026 is a <b>Wednesday</b>. So the header paired the '
    f'wrong weekday with the wrong date, on the screen whose entire subject is '
    f'one session on one morning.',
    f'This generator imports the day from <code>gen_today</code> and asserts '
    f'both halves: <code>D == date(2026, 8, 11)</code> and '
    f'<code>D.strftime("%A") == "Tuesday"</code>.'))
FIND.append(finding(
    "04", f"{SETS_MID} of {PLANNED_SETS} sets beside {STALE_VOL:,} kg, which is "
          f"a finished session&rsquo;s figure", "danger",
    f'The exercises it drew were bench 3 of 3, incline 3 of 3, cable fly 2 of 3 '
    f'and the rope not started &mdash; {SETS_MID} sets. Those eight come to '
    f'<b>{VOL_MID:,} kg</b>. All {PLANNED_SETS} come to <b>{VOL_ALL:,}</b>, '
    f'which is within {abs(STALE_VOL - VOL_ALL)} kg of the number printed. A '
    f'live count next to a closed total.',
    f'<code>volumeOf</code> is load &times; reps summed per exercise, then '
    f'<code>live.reduce((sum, v) =&gt; sum + v.volumeKg, 0)</code> for the '
    f'session &mdash; a sum of rounded parts, which this page reproduces down to '
    f'the half-kilo of incline volume that JavaScript rounds up and Python '
    f'rounds down.'))
FIND.append(finding(
    "05", "&ldquo;Her best at this rep range&rdquo; is a different computation",
    "danger",
    f'<code>judge</code> takes today&rsquo;s <b>top set</b> &mdash; heaviest, '
    f'and on a tie the one with more reps &mdash; and compares it against the '
    f'<b>heaviest load in her whole history</b> on that exercise. Rep range is '
    f'not in it. A caption that describes a per-rep-range best is describing a '
    f'feature nobody built, on the one badge whose credibility is the point.',
    f'<code>const bestLoad = history.reduce((max, s) =&gt; Math.max(max, '
    f's.loadKg ?? 0), 0)</code>. One number, across every earlier set.'))
FIND.append(finding(
    "06", f"<code>Verdict</code> has {len(VERDICT_UNION)} members and the page "
          f"drew one badge", "warn",
    f'<code>record | quiet | matched | first | none</code>. The page had '
    f'<b>PR</b>. Missing: a real record that is deliberately <b>not</b> '
    f'announced, a top set that <b>matched</b> and therefore is not a record, '
    f'and a <b>first</b> log, which can never be one. Those three are the whole '
    f'design of the badge &mdash; gold is cheap to hand out and worthless once '
    f'it is &mdash; and one session of hers lands on four of the five.',
    f'<code>grep -n "export type Verdict" app/src/log/log.ts</code>. Frame 2a '
    f'benches all four, computed by a port of <code>judge</code> that this file '
    f'asserts against the four exercises.'))
FIND.append(finding(
    "07", "The number that decides whether the client&rsquo;s phone buzzes was "
          "not on the screen", "warn",
    f'A load heavier than she has ever lifted is gold. Whether it is <b>loud</b> '
    f'gold depends on <code>plateStepKg</code>: a jump smaller than the smallest '
    f'plate in the room is <i>&ldquo;not a session&rsquo;s worth of progress, it '
    f'is a typo or a fractional plate&rdquo;</i>. It is {trim1(PLATE_STEP)} kg '
    f'in this gym and <b>1.25 in others</b> &mdash; per-gym, and the only number '
    f'on this screen that changes when the trainer changes building.',
    f'<code>kind: by + 1e-9 &gt;= plateStep ? \'record\' : \'quiet\'</code>. '
    f'Her bench moved exactly {trim1(BENCH["verdict"]["by"])} kg today, which is '
    f'exactly one plate &mdash; the closest a record can be to not counting.'))
FIND.append(finding(
    "08", "A rule the app&rsquo;s own type cannot express", "danger",
    f'§09: <i>&ldquo;Time and distance sets <b>relabel</b> the two input '
    f'columns; they never add a column.&rdquo;</i> '
    f'<code>LogType</code> is <code>{" | ".join(repr(t) for t in LOG_TYPES)}</code> '
    f'&mdash; two members. A plank and a farmer&rsquo;s walk have nowhere to go. '
    f'The rule is right and it is describing a capability that does not exist, '
    f'which for a document a developer reads is the worse half.',
    f'<code>grep -n "export type LogType" app/src/log/log.ts</code>. '
    f'&sect;14 owes it <code>{"\' | \'".join(MISSING_TYPES)}</code>.'))
FIND.append(finding(
    "09", "<code>Judged.streak</code> counts sets, says sessions, and nothing "
          "reads it", "danger",
    f'The field&rsquo;s comment is <i>&ldquo;how many earlier sessions this '
    f'exercise has, for the &lsquo;third running&rsquo; line&rdquo;</i>. The '
    f'value assigned is <code>history.length</code>, and <code>history</code> is '
    f'a list of <b>sets</b> &mdash; so on her bench it is {BENCH["hist_sessions"]} '
    f'where the sessions are {BENCH["hist_sessions"] // 3}. Then it is carried '
    f'through every branch of <code>judge</code> and <b>never read</b>: the line '
    f'it exists for was not built. Three problems in one field.',
    f'<code>const streak = history.length;</code> at the top of '
    f'<code>judge</code>, then <code>grep -n "streak" app/src/log/log.ts</code> '
    f'&mdash; eight hits, all of them writes.'))
FIND.append(finding(
    "10", f"A swap can reach {SWAP_REACH} people and the page had no swap",
    "warn",
    f'<code>SwapScope</code> is <b>today</b>, <b>this client&rsquo;s '
    f'program</b>, or <b>the template</b> &mdash; three different decisions, and '
    f'the third rewrites Push A for every client on it. Every competitor in the '
    f'teardown collapses them into one. The app states each blast radius on its '
    f'own row before the tap, <i>&ldquo;including the one that reaches four '
    f'other people, because a change that size should never be discovered '
    f'afterwards&rdquo;</i>. The old page mentioned <i>&ldquo;The rack was '
    f'busy&rdquo;</i> as a link and drew neither the add nor the swap.',
    f'<code>swapExercise(&hellip;, scope: SwapScope)</code> in '
    f'<code>db/log.ts</code>, and <code>SwapSheet</code>&rsquo;s docstring. '
    f'Frame 3b draws all three with their counts.'))
FIND.append(finding(
    "11", "RPE arrived in the grid without an argument, and the note &mdash; the "
          "best idea in the category &mdash; never arrived at all", "warn",
    f'The old grid was <i>Load &middot; Reps &middot; RPE &middot; Last '
    f'time</i>. Putting RPE in the table is <b>right on a desk</b> and it is a '
    f'departure from a stated rule &mdash; five columns is what fits at 360dp '
    f'with Previous intact &mdash; so it needs saying. The <b>note</b> is the '
    f'other half of the same sheet and it is the one thing TrueCoach does better '
    f'than anybody: a comment on a single set. It was absent, and with it the '
    f'reason a log written by a coach is worth more than one written by a '
    f'lifter.',
    f'<code>SetSheet</code>: <i>&ldquo;this sheet is for the two things the row '
    f'has no width for and no competitor asks for: RPE and a note&rdquo;</i>. '
    f'Frame 1b draws the sheet; 1a draws the note where it belongs, two lines '
    f'under its own row in the table.'))
FIND.append(finding(
    "12", "The one drawn frame had no state at all", "warn",
    f'One session, mid-flow, online-ish. No offline queue on the screen whose '
    f'§09 rule is <i>&ldquo;the gym is a basement&rdquo;</i>; no empty log for a '
    f'client with no program, though logging is explicitly allowed before '
    f'programming exists; no finish; no <i>they didn&rsquo;t train</i>, where '
    f'the single fact that separates three outcomes is somebody&rsquo;s money. '
    f'The mobile spec calls itself <b>15 states</b> in its own footer.',
    f'<code>notes/design system/screens/xrep-workout-log.html</code>, footer: '
    f'<i>COMMAND DECK &middot; 15 STATES &middot; DARK + LIGHT</i>. This page '
    f'draws {15} frames across {6} of them.'))
N_FIND = len(FIND)
assert N_FIND == 12


# ══════════════════════════════════════════════════════════════ sections ══
S01 = (f'''<p class="note">{N_FIND} things. The first four are arithmetic and a
date; the rest are the design of a workout log &mdash; four verdicts, a plate,
a swap that reaches five people, and a note. Two of them are defects in the
app&rsquo;s own rules rather than in the page: a rule whose type cannot express
it, and a field that counts one thing, says another, and is read by
nobody.</p>''' + "\n\n" + "\n\n".join(FIND))


S02 = f'''<p class="note">Nothing here replaces the phone on the gym floor. A
trainer is not carrying a laptop to a squat rack, and the {56}px thumb targets in
the app exist because the thumb is sweaty, the phone is on a rack and nobody is
looking at the screen. That page got this right and it is worth keeping
verbatim.</p>
<p class="note">What the desk adds is <b>three</b> things the phone cannot do, and
every frame below is one of them:</p>
<table class="dt"><tbody>
<tr><th>The history beside the entry</th><td>Twelve weeks of top sets while you
  type today&rsquo;s. The reason to look at history is to decide today&rsquo;s
  load, and on a 390px screen it is a different screen.</td></tr>
<tr><th>Catching up a session logged on paper</th><td>Four clients between six and
  nine, a notebook, and half an hour at nine. A keyboard beats a stepper by an
  order of magnitude for twelve sets, which is the whole of &sect;12.</td></tr>
<tr><th>Correcting the past</th><td>A set typed wrong in November. On a phone you
  would never find it; on a desk it is two clicks &mdash; and because a record is
  computed on read, fixing it fixes nine months of records in the same
  frame.</td></tr>
</tbody></table>
<p class="note">And one thing it must <b>not</b> do: become the place logging
happens. The five columns, the Previous column, the tick, the per-exercise rest,
the four verdicts &mdash; all of it is the phone&rsquo;s design, ported. Where
this console is wider rather than merely different, &sect;04 says so and says
why.</p>'''


S03 = f'''<p class="note">Three columns: the exercises, the set grid, and the
history. One exercise is open and the rest are rows, which is the one lesson worth
taking from Jefit and it is a negative one &mdash; everything Jefit puts in the
thumb zone competes with the tick.</p>

{units(
    frame("1a", "The console, mid-session", "LogScreen &middot; §01",
          "/sessions/8801/log", f_console(),
          f"Bench and incline done, cable fly two of three, the rope untouched: "
          f"<b>{SETS_MID} of {PLANNED_SETS}</b> sets and <b>{VOL_MID:,} kg</b> "
          f"&mdash; the volume of those eight and not of a finished session. The "
          f"gold sits on <b>set {BENCH['sets'].index(BENCH['top']) + 1}</b>, "
          f"because a record belongs to the heaviest set and she did one more "
          f"afterwards for fewer reps. And the fourth figure in the strip is the "
          f"pack, saying <b>unchanged</b>."),
    frame("1b", "One set, in full", "SetSheet &middot; §2a",
          "/sessions/8801/log?set=2", f_set(),
          "RPE and a note: the two things the row has no width for on a phone "
          "and no competitor asks for. They are what the trainer knows and the "
          "client&rsquo;s own app never records. Delete is here and it goes "
          "straight through &mdash; <b>undo after, never confirm before</b>, "
          "because twenty confirmations a session is a different app."),
)}

<h3 class="h4" style="margin-top:38px">A completed exercise never fades</h3>
<p class="note">&sect;09, and it is the opposite of the rule the diary follows. A
done session in the diary is history and dims. A done <i>exercise</i> mid-session
is what you scroll back to check, so it keeps full contrast &mdash; there is no
dimmed state in the exercise list at all, only a 2px spine in the ok green for
finished and amber for part-done. Same 2px vocabulary the roster uses for
severity: one grammar for <i>this row has a state</i>.</p>
<p class="note">And one glow per screen, <b>enforced in CSS</b> rather than left
to whoever writes the next screen: the open exercise card gives up its accent the
moment a record card appears. If two things glow, nothing is live.</p>'''


S04 = f'''<p class="note">The <b>Previous</b> column is the entire advantage over
the notebook this app replaces, and §09 gives it the strongest protection of any
element in the product: <i>&ldquo;it never collapses, truncates or hides &mdash;
at 360dp, in landscape, with a note open, it stays.&rdquo;</i> Hevy solved this
years ago and there is no reason to redraw a solved table.</p>

{units(
    frame("1c", "The row that has not claimed anything",
          "LogScreen &middot; the tick", "/sessions/8801/log?ex=fly", f_accept(),
          f"Cable fly, two of three. The open slot shows "
          f"<b>{say(FLY['prev'][2][0], FLY['prev'][2][1])}</b> in the quiet ink "
          f"behind a dashed border, because that is what she did last time and "
          f"not what she has done today. One press takes it exactly as shown. "
          f"Until somebody presses, <b>the log has not claimed a weight nobody "
          f"lifted</b>."),
    frame("1d", "An exercise that carries no load", "LogType &middot; 'reps'",
          "/sessions/8802/log?ex=chin", f_reps(),
          "Nine reps against a best of eight. The load column is not removed and "
          "no column is added &mdash; it says <i>no load</i> and stays, because a "
          "sixth column would have to come out of Previous. And for reps there is "
          "no plate step, so every real record here is a loud one."),
)}

<h3 class="h4" style="margin-top:38px">Where this console is wider, and why</h3>
<table class="dt"><thead><tr><th>Column</th><th>Phone</th><th>Desk</th>
  <th>Because</th></tr></thead><tbody>
<tr><th>Set</th><td>yes</td><td>yes</td><td>The slot, stable across an un-tick &mdash;
  which is why it is not an index. It also carries the record, in gold.</td></tr>
<tr><th>Previous</th><td>yes</td><td>yes</td><td>Never a placeholder inside the
  load field. Strong offers it that way and a placeholder disappears the moment
  you type, which is exactly when you want it.</td></tr>
<tr><th>Load &middot; Reps</th><td>yes</td><td>yes</td><td>Relabelled for a log
  type that carries no load. Never removed.</td></tr>
<tr><th>RPE</th><td><b>a sheet</b></td><td><b>a column</b></td><td>The one
  departure. Five columns is what fits at 360dp with Previous intact; a desk has
  the width, and RPE is typed on nine sets out of ten.</td></tr>
<tr><th>The note</th><td>a sheet</td><td><b>a row under its set</b></td><td>Also a
  departure, and the same argument. TrueCoach has the best note model in the
  category and puts it in an inbox; this is read next week with the same set in
  front of you.</td></tr>
<tr><th>&#10003;</th><td>56px</td><td>32px</td><td>The phone&rsquo;s number exists
  because the thumb is sweaty and nobody is looking. Neither is true of a mouse,
  so this one is <code>--w-tap</code>, the pointer-only token.</td></tr>
</tbody></table>'''


S05 = f'''<p class="note">Gold is cheap to hand out and worthless once it is. So
the threshold is the design, and it is not decoration: <b>it decides whether the
client&rsquo;s phone buzzes</b>, and a trainer who forwards five records a week
has taught a client that records mean nothing.</p>

{units(frame("2a", "Four top sets, four different answers",
             "judge &middot; TodaysBestsScreen §4b", "/sessions/8801/bests",
             f_verdicts(),
             f"One session lands on four of the five members of "
             f"<code>Verdict</code>. Two are genuine records and <b>one</b> is "
             f"worth sending &mdash; which is <code>TodaysBestsScreen</code>&rsquo;s "
             f"own docstring, arrived at from the data rather than quoted. The two "
             f"gold cells are tinted; the two that are not records get nothing, "
             f"because a badge that appears for matching is a badge that means "
             f"nothing."))}

<table class="dt" style="margin-top:24px"><thead><tr><th>Verdict</th>
  <th>What it means</th><th>Gold</th><th>Her phone</th></tr></thead><tbody>
<tr><th><code>record</code></th><td>Heavier than she has ever lifted, by at least
  one plate.</td><td>yes</td><td><b>buzzes</b></td></tr>
<tr><th><code>quiet</code></th><td>A real record, and small: more reps at a weight
  she had already lifted &mdash; or heavier by <i>less</i> than a plate, which is
  a typo or a fractional plate rather than a session&rsquo;s
  progress.</td><td>yes</td><td>silent</td></tr>
<tr><th><code>matched</code></th><td>Exactly what she did last time. Matching is
  not beating.</td><td>no</td><td>silent</td></tr>
<tr><th><code>first</code></th><td>No earlier session. The number to beat, not a
  number beaten.</td><td>no</td><td>silent</td></tr>
<tr><th><code>none</code></th><td>A top set below what she has already done. Most
  sessions, most weeks, and that is fine.</td><td>no</td><td>silent</td></tr>
</tbody></table>

<div class="why" style="margin-top:24px"><p class="why__k">The idea worth stealing,
  and it is Strava&rsquo;s</p>
  <p>Strava is not a strength logger at all, and it is the only platform in the
  nine that got the important thing right: <b>a record is derived from the data,
  never entered by hand</b>. There is no <code>savePr</code> anywhere in this
  codebase. Every other logger stores the badge and then cannot explain why a
  corrected set still has one. &sect;11 is what that buys.</p></div>'''


S06 = f'''<p class="note">In an Indian gym the rack you planned for has somebody
else in it and the cable station has a queue. Every logger in the category treats
that as a failure &mdash; an exercise you <i>skipped</i>, a workout you did not
<i>complete</i>, a red mark against adherence. Here it is the highest-signal thing
a trainer does all week.</p>

{units(
    frame("3a", "The rack was busy", "AddExerciseSheet &middot; §3a",
          "/sessions/8801/log?add=1", f_add(),
          f"Recents first, because the answer to a busy rack is nearly always "
          f"something she has already done &mdash; and every recent row carries "
          f"what she last lifted on it, so the choice is made on numbers rather "
          f"than on a name. That is the difference between this and a search box "
          f"over {LIB_N} rows. <b>Yours</b> is a first-class chip: a movement "
          f"invented for one client&rsquo;s shoulder is the one a trainer hunts "
          f"for hardest."),
    frame("3b", f"A swap that can reach {SWAP_REACH} people",
          "SwapSheet &middot; §3b", "/sessions/8801/log?swap=fly", f_swap(),
          "Three scopes, three blast radii, each on its own row before the tap. "
          "The one that rewrites the template is drawn in the warn colour and "
          "counts the clients it touches, because a change that size should never "
          "be discovered afterwards."),
)}

<div class="why" style="margin-top:24px"><p class="why__k">What the plan learns:
  nothing, silently</p>
  <p>{SWAP_ASK_AFTER} identical swaps and the app <b>asks once</b> whether the
  program should change. Asking is the design. An app that quietly rewrites a
  trainer&rsquo;s programming has taken their job &mdash; and an unplanned
  exercise is a <b>first-class row</b> either way: same card, same table, counted
  in volume, one quiet <i>Unplanned</i> tag. The rack was busy; that is not the
  client&rsquo;s failure and not a second-class log.</p></div>'''


S07 = f'''<p class="note">Two screens, and the rule that separates them is the
same one: <b>no chart with a non-zero baseline, and no bar chart of anything that
is not a sum</b>.</p>

{units(
    frame("4a", "One exercise, every session", "buildHistory &middot; §5b",
          "/clients/meera-krishnan/exercises/bench-press", f_history(),
          f"The same columns as the log, read-only, with Previous repurposed to "
          f"carry RPE &mdash; a trainer should never have to learn a second "
          f"layout for their own data. {len(PR_MARKS)} of {N_HIST_SESSIONS} "
          f"sessions carry a tag and {dshort(BENCH_HIST[-1][0])} does not, "
          f"because there was nothing before it. Every one of them is judged "
          f"<b>at the time</b>, by walking the history forward with the same "
          f"function the floor screen uses."),
    frame("4b", "Volume gets a chart. The load does not.",
          "buildProgress &middot; §5a", "/clients/meera-krishnan/progress",
          f_progress(),
          f"Volume adds up, so bars from zero tell the truth about it. A load "
          f"does not: from a zero baseline a {trim1(PLATE_STEP)} kg week is two "
          f"pixels, and from a 50 kg baseline it is everything. So her top set is "
          f"written out as the sequence of numbers it actually is &mdash; which is "
          f"also what a coach says out loud."),
)}

<table class="dt" style="margin-top:24px"><tbody>
<tr><th>Sets stay in the order they happened</th><td>Sessions run newest first,
  but set 3 only means something after set 2 &mdash; and the tag is on the
  <b>set</b>, not on the day.</td></tr>
<tr><th>1 August is the interesting row</th><td>60 kg for 8 where her best at 60
  was 6. A record, and a <b>quiet</b> one, so it is in her history and it was
  never sent. Nothing else in the category can hold that distinction because
  nothing else in the category derives the record.</td></tr>
<tr><th>Bodyweight gets no colour and no arrow</th><td>&minus;{abs(BW_DELTA)} kg
  over six months. The app has <b>no opinion</b> about which way a client&rsquo;s
  weight should go, and a green arrow would be one.</td></tr>
</tbody></table>'''


# ═══════════════════════════════════════════════════════════════════ §08 ══
def product(name, verdict, tone, phone, desk, take):
    return f'''<div class="grp"><div class="grp__t">
  <h4>{name}</h4><span><span class="tag tag--{tone}">{verdict}</span></span></div>
<table class="dt" style="margin-top:12px"><tbody>
<tr><th>On a phone</th><td>{phone}</td></tr>
<tr><th>On a desk</th><td>{desk}</td></tr>
<tr><th>Take, or refuse</th><td>{take}</td></tr>
</tbody></table></div>'''


PRODUCTS = [
    ("Hevy &middot; Hevy Coach", "the closest shape", "acc",
     "The best set table in the category: a <b>Previous</b> column on every row, "
     "the whole cell as the tick target, per-exercise rest, gold PR badges, and "
     "it logs offline and syncs later.",
     "A <b>read</b> surface. The coach dashboard shows <i>Latest Activities</i>, "
     "and clicking a workout opens a window with the breakdown &mdash; exercises, "
     "sets, weights, RPE. Programs are built on the desktop; logs arrive there.",
     "<b>Take</b> the table, verbatim &mdash; there is no reason to redraw a "
     "solved table. <b>Refuse</b> the direction of travel: in Hevy Coach the log "
     "belongs to the client and the coach reads it. Here the trainer&rsquo;s log "
     "is the record and the client&rsquo;s app receives a copy."),
    ("ABC Trainerize", "the only one that lets you", "warn",
     "Programming-first. The client logs; the trainer reviews. Trainer-side "
     "logging exists and is clearly not the main path.",
     "<b>It can be done, and it needs a booking.</b> To track a workout for a "
     "client on the web, <i>&ldquo;the workout(s) have to be scheduled on the "
     "client&rsquo;s calendar first&rdquo;</i> &mdash; pick a date, schedule the "
     "workout, then click it.",
     "This is the finding. It is the <b>only</b> product in the nine where a "
     "trainer can log from a browser, and it gates that on a booking existing. "
     "&sect;09&rsquo;s third group is the refusal: a client turning up on a day "
     "she does not normally train is a Tuesday, and logging is allowed to happen "
     "before programming exists. Before booking, too."),
    ("TrueCoach", "the best note", "info",
     "Per-set comments and video review threads &mdash; the best note model "
     "anybody ships.",
     "The same app for coach and client, and <i>results</i> are entered by the "
     "client. The desk is where the coach reads and replies.",
     "<b>Take</b> the note as a first-class object on a single set. <b>Move</b> "
     "it: ours lives in the table, two lines under its row, because it is read "
     "next week with the same set in front of you &mdash; not in an inbox."),
    ("Strong &middot; Jefit &middot; FitNotes", "consumer loggers", "info",
     "Strong: per-exercise rest autostart, plate maths, placeholders. Jefit: "
     "density, eight things at once in the thumb zone. FitNotes: offline-only, "
     "no account, very fast because it does almost nothing else.",
     "<b>No desk at all.</b> None of the three has a web app a trainer could use "
     "to catch up a session.",
     "<b>Take</b> Strong&rsquo;s per-exercise rest &mdash; 90 s after a bench set "
     "and 20 after a curl is one trainer, not two preferences &mdash; and "
     "FitNotes&rsquo; posture that offline is the default. <b>Refuse</b> "
     "Jefit&rsquo;s layout entirely, and FitNotes&rsquo; conclusion: a trainer "
     "who changes machines cannot lose 27 clients&rsquo; history."),
    ("A shared spreadsheet", "the real incumbent", "warn",
     "Not a phone product. It is what the trainer had before, and half the "
     "market still has it.",
     "Free, already understood, <b>infinitely customisable</b>, and built for "
     "collaboration &mdash; a coach and an athlete editing the same week is "
     "something no app in this list can do. The honest failure is scale: at ten "
     "or fifteen clients the sheets multiply and version control breaks down.",
     "<b>Take</b> the keyboard. A spreadsheet is the fastest set-entry surface "
     "ever built and it is what this console is competing with at nine in the "
     "morning &mdash; which is why &sect;12 is about accelerators and not about "
     "buttons. <b>Refuse</b> the shared sheet: two people editing one client's "
     "numbers is a money argument waiting to happen."),
]
N_PROD = len(PRODUCTS)
assert N_PROD == 5

S08 = f'''<p class="note">The mobile spec already tore down nine platforms and
found the sentence that decides the phone screen: <b>every one of them assumes the
person logging is the person lifting.</b> The desk half is a different question,
and it has a different answer.</p>
<p class="note"><b>On a browser, every one of them assumes the person at the desk
is not the person who logged it.</b> Hevy Coach&rsquo;s web is a review surface.
TrueCoach&rsquo;s web is where the coach reads what the client entered. Strong,
Jefit and FitNotes have no web app at all. Exactly one product &mdash; ABC
Trainerize &mdash; lets a trainer log from a browser, and it requires the session
to be on the client&rsquo;s calendar first.</p>

<div class="dd" style="margin-top:20px">
  <div class="dd__i dd__i--do"><p class="dd__k">A desk that can log</p>
    <p class="dd__c" style="border-top:0">ABC Trainerize (booking required)
      &middot; <b class="acc">X&nbsp;REP</b> &middot; a spreadsheet</p></div>
  <div class="dd__i dd__i--no"><p class="dd__k">A desk that can only read</p>
    <p class="dd__c" style="border-top:0">Hevy Coach &middot; TrueCoach &middot;
      Everfit &middot; My PT Hub &mdash; and Strong, Jefit and FitNotes have no
      desk at all</p></div>
</div>

{"".join(product(*p) for p in PRODUCTS)}

<div class="why" style="margin-top:38px"><p class="why__k">What India adds, and it
  is not a feature list</p>
  <p>Three things, and each one turns up as a frame above. <b>Basement gyms</b>
  &mdash; the free-weights floor is a level below the road and 4G does not reach
  it, so offline is the normal case (6a). <b>Shared racks</b> &mdash; the rack you
  planned for has somebody in it, so a swap is a Tuesday and an app that scores it
  as non-adherence is wrong (3a, 3b). And <b>the trainer logs, not the client</b>
  &mdash; her phone is a 32 GB Android with no room for another app and no
  interest in one, which is why every screen here is fast for the person who is
  <i>not</i> training. Plus the small thing that decides the maths: the smallest
  plate in the room is 1.25 kg in some gyms and {trim1(PLATE_STEP)} in others, so
  the step is per-gym.</p></div>'''


S09 = f'''<p class="note">Three frames, and the middle one carries the rule this
whole screen is measured against.</p>

{units(
    frame("5a", "Who is this for?", "LogPickScreen", "/sessions/new", f_pick(),
          "One question, asked once. Not what kind of workout, not which program, "
          "not when &mdash; all three are answerable from <b>who</b>, and asking "
          "is how a two-tap action becomes a five-tap one. Three groups, and the "
          "third is the one no competitor offers."),
    frame("5b", "Logged &mdash; and the pack has not moved",
          "buildFinish &middot; §6b", "/sessions/8801/finish", f_finish(),
          f"Four figures and one honest sentence. The sets happened; whether the "
          f"session counts against her money is a <b>second, separate tap</b>. "
          f"Her pack is {PACK_NOW} of {PACK_TOTAL} now and "
          f"{PACK_AFTER_DONE} of {PACK_TOTAL} the moment somebody marks today "
          f"done &mdash; undoable for {UNDO_HOURS} hours either way. "
          f"<i>Later</i> is a real option, not a cancel."),
    frame("5c", "They didn&rsquo;t train", "NotTrainedSheet",
          "/sessions/8801?outcome=1", f_nottrained(),
          "Three outcomes and exactly one difference between them: <b>a no-show "
          "costs a session</b> and both kinds of cancellation do not. That single "
          "fact is what the trainer is deciding, so it is written inside each "
          "option rather than in a confirmation afterwards."),
)}

<div class="why why--warn" style="margin-top:24px"><p class="why__k">One WhatsApp,
  opened and not sent</p>
  <p>The message carries the loud record and nothing else &mdash; the quiet one on
  the cable fly stays in her history. And it is <b>opened for the trainer to
  send</b>, never sent on their behalf: the client&rsquo;s number belongs to the
  trainer&rsquo;s relationship with her, and an app that posts to it unasked has
  taken a liberty. The switch decides whether the chat opens at all.</p></div>'''


S10 = f'''<p class="note">Two states the old page had none of, and one of them is
the normal case rather than the edge case.</p>

{units(
    frame("6a", "The basement", "§09 &middot; FR-8", "/sessions/8801/log",
          f_offline(),
          f"All {PLANNED_SETS} sets in, {N_QUEUE} writes waiting, and nothing on "
          f"the screen is a placeholder. A tick writes locally and returns in the "
          f"same frame; there is <b>no skeleton anywhere in a session</b>, "
          f"because a shimmer for local data is a lie about where the data is. "
          f"The amber ring is the only thing sync is allowed to say about a "
          f"set."),
    frame("6b", "Nothing planned, and nothing added", "buildLog &middot; §6c",
          "/sessions/new?client=priya-nair", f_empty(),
          f"No live program, so nothing to seed from &mdash; and that is a "
          f"starting point rather than an error, because logging is allowed to "
          f"happen before programming exists. The offer is the <b>last whole "
          f"session she did</b>, not a template: the commonest thing a trainer "
          f"wants on a day with no plan is last time again. The "
          f"{QUIET_DAYS_N}-day fact is stated and not editorialised."),
)}

<p class="note" style="margin-top:24px">And nothing here auto-progresses anything.
&sect;09 is flat about it: <b>the app never puts a number in a row that nobody
lifted</b>. Repeating a session brings the exercises and the slots; the loads
arrive in the Previous column, which is where a number she has actually lifted
belongs.</p>'''


S11 = f'''<p class="note">This is the frame that justifies a desk. Everything else
on this page is the phone&rsquo;s design ported to a keyboard; this one is a thing
the phone cannot do at all.</p>

{units(frame("7a", "A set typed wrong in November", "§09 &middot; derived records",
             "/clients/meera-krishnan/exercises/bench-press?edit=nov-18",
             f_correct(),
             "95 kg in a month she was benching 40. On a phone you would never "
             "find it. Here it is two clicks &mdash; and because a record is "
             "computed on read, correcting it strips the gold from November "
             "<b>and re-judges every session after it in the same frame</b>."))}

<div class="why"><p class="why__k">There is no <code>savePr</code> in this
  codebase</p>
  <p>A stored PR is a second copy of the truth, and second copies drift. Every
  other logger in the teardown stores the badge, and then cannot explain why a
  corrected set still carries one &mdash; or why a badge exists for a session the
  trainer has since deleted. The cost of deriving it is that four functions have
  to walk the history on every read. The benefit is that this frame is possible
  at all.</p></div>
<p class="note">One thing it deliberately does not do: send anything. A record
un-made nine months late is not news, and a record newly <i>granted</i> to a
session from July is not either. The correction is silent by design &mdash; the
same judgement that keeps a quiet record off her phone.</p>'''


# ═══════════════════════════════════════════════════════════════════ §12 ══
def nn(n, title, ref, body):
    return f'''<div class="grp"><div class="grp__t"><h4>
  <span class="ink3 mono" style="margin-right:8px">{n}</span>{title}</h4>
  <span class="small mono">{ref}</span></div>
<p class="note" style="margin-top:10px">{body}</p></div>'''


ACCEL = [
    ("Tab", "across the row", "load &rarr; reps &rarr; RPE"),
    ("&#8629;", "commit, and open the next set", "the tick, from the keyboard"),
    ("&#8984;&#8629;", "accept last time&rsquo;s numbers", "the one-tap tick"),
    ("&uarr; &darr;", "between sets", "without a mouse"),
    ("N", "a note on this set", "the sheet, inline"),
    ("&#8984;Z", "undo", "never overridden"),
]
N_ACCEL = len(ACCEL)
assert N_ACCEL == 6

NNG = [
    ("01", "An accelerator is not a new feature", "Krause &amp; Harley 2024",
     f'''<i>&ldquo;An accelerator is not a new feature &mdash; it is merely an
     additional way of completing an existing action&rdquo;</i>, and
     <i>&ldquo;those users who never discover the accelerator should be able to
     complete the same task in another way.&rdquo;</i> This is the rule the old
     frame failed: it drew a keyboard hint bar and <b>no pointer path</b> for the
     tick, the note, the swap or the un-tick. Every one of the {N_ACCEL} shortcuts
     below has a button in the frame beside it. The keyboard is the fast road, not
     the only road.'''),
    ("02", "Style them so an expert spots them and a novice ignores them", "same",
     f'''<i>&ldquo;Style them in a way that differentiates them from the
     corresponding GUI-command label&rdquo;</i>, and <i>&ldquo;accelerators should
     be readily available, yet easy to ignore.&rdquo;</i> So they live in a bar at
     the foot of the frame in mono <code>&lt;kbd&gt;</code>, never in the labels of
     the buttons they duplicate, and the bar is the last thing in the reading
     order rather than the first.'''),
    ("03", "Prioritise what people do repeatedly", "same",
     f'''<i>&ldquo;Increasing efficiency and productivity really matters only for
     repeat tasks&rdquo;</i>, and <i>&ldquo;learning requires repetition&rdquo;</i>.
     A trainer logs {PLANNED_SETS} sets in a session and four sessions in a
     morning &mdash; about {PLANNED_SETS * 4} rows before nine o&rsquo;clock. That
     is the most repeated action in the entire product, which is why it is the only
     screen in this set with its own accelerator bar.'''),
    ("04", "Do not override commonly known shortcuts", "same",
     f'''<code>&#8984;Z</code> is undo and nothing else. Nothing here rebinds copy,
     paste, select-all or print &mdash; and <code>&#8984;&#8629;</code>, which is
     the one non-obvious binding, is the accept-last-time action, printed in the
     bar and duplicated as the primary button in frame 1c.'''),
    ("05", "Provide a safety net for an accidentally triggered accelerator",
     "same, and it conflicts",
     f'''NN/g offers two nets: an undo, and <i>&ldquo;a confirmation dialog&hellip;
     serves to prevent unintended actions&rdquo;</i>. &sect;09 forbids the second
     outright: <b>undo after, never confirm before</b>, because a trainer logs
     twenty sets a session and twenty confirmations is a different app. The rule
     wins, and it is not a fudge &mdash; a logged set is <i>reversible</i>, so an
     undo is a complete net. The one place a confirm survives is discarding a
     whole session, which is not reversible.'''),
    ("06", "Recognition rather than recall", "heuristic 6",
     f'''The whole argument for the Previous column being a column. A placeholder
     inside the load field is recall the moment you start typing; a column beside
     it is recognition for as long as you need it. Strong ships the placeholder,
     Hevy ships the column, and §09 protects the column against every future
     layout pressure by name.'''),
    ("07", "Visibility of system status", "heuristic 1",
     f'''Three states the old frame had none of: the amber ring on a set this
     machine wrote, the offline banner naming how many writes are waiting, and the
     pack figure in the session strip saying <b>unchanged</b> &mdash; which is
     status about something that did <i>not</i> happen, and the harder kind to
     remember to show.'''),
    ("08", "Error prevention over error messages", "heuristic 5",
     f'''Nothing on this screen validates a load, because there is no wrong
     number: 95 kg is a legitimate bench for somebody. So prevention has to work
     differently &mdash; the Previous column puts last week&rsquo;s number next to
     the field, which is the only defence available, and &sect;11 accepts that the
     rest is caught later and makes catching it cheap.'''),
    ("09", "Match between the system and the real world", "heuristic 2",
     f'''<b>Rest is per exercise.</b> 90 seconds after a bench set and 20 after a
     curl is one trainer, not two preferences &mdash; and every app that made rest
     a single global number made it a number people turn off. Also the reason the
     plate step is per-gym: the smallest plate in the room is a fact about a room.'''),
    ("10", "Flexibility and efficiency of use", "heuristic 7",
     f'''The one heuristic this screen is <i>about</i>. Its real competitor at nine
     in the morning is a spreadsheet &mdash; free, understood, and the fastest
     set-entry surface ever built. A console that loses to Google Sheets on speed
     loses, whatever else it offers.'''),
    ("11", "Aesthetic and minimalist design", "heuristic 8",
     f'''One glow per screen, <b>enforced in CSS</b> rather than left to whoever
     writes the next screen: the open exercise card gives up its accent the moment
     a record card appears. If two things glow, nothing is live.'''),
    ("12", "Vanity metrics", "Harley 2019",
     f'''Why the session strip has {4} figures and none of them is a streak, a
     score or a completion percentage. Sets, kilos, minutes, and a pack that has
     not moved &mdash; every one of them is a thing that happened or a thing that
     is about to be decided.'''),
]
N_NNG = len(NNG)
assert N_NNG == 12

S12 = (f'''<p class="note">{N_NNG} principles. One article is doing most of the work
&mdash; Krause and Harley on accelerators (2024) &mdash; because this is the one
screen in the set whose whole job is speed at a keyboard, and because its central
rule is the one the page this replaces broke.</p>

<table class="dt"><thead><tr><th style="width:14%">Key</th><th>What it does</th>
  <th>And the pointer path beside it</th></tr></thead><tbody>'''
       + "".join(
    f'<tr><th><kbd>{k}</kbd></th><td>{w}</td><td class="wrap">{p_}</td></tr>'
    for k, w, p_ in ACCEL) + '</tbody></table>'
       + "".join(nn(*n) for n in NNG))


# ═══════════════════════════════════════════════════════════════════ §13 ══
ROUTES = [
    ("/sessions/new", "5a", "Who is this for. Three groups, and the third needs "
     "no booking."),
    ("/sessions/:id/log", "1a", "The console. One session, and the exercise in "
     "focus is a query so a half-typed row survives a reload of the tab it is "
     "in."),
    ("/sessions/:id/log?set=:n", "1b", "The set panel. A panel and not a modal: "
     "the row it is about stays on screen behind it."),
    ("/sessions/:id/log?add=1", "3a", "Add an exercise. Not a route of its own "
     "&mdash; it is a thing you do to a log, not a place."),
    ("/sessions/:id/log?swap=:exerciseId", "3b", "The swap, and the only modal in "
     "this file, because one of its three answers reaches somebody who is not in "
     "the room."),
    ("/sessions/:id/bests", "2a", "Every top set judged. Its own route because a "
     "trainer opens it after the session and wants to link to it."),
    ("/sessions/:id/finish", "5b", "Four figures, and the pack sentence."),
    ("/clients/:id/exercises/:exerciseId", "4a", "One exercise, every session. "
     "Belongs to the client, not to a session &mdash; which is why it is under "
     "<code>/clients</code>."),
    ("/clients/:id/progress", "4b", "Volume, the top set and bodyweight. Also the "
     "client&rsquo;s, so <code>webapp-clients.html</code> links here from the "
     "file&rsquo;s overview."),
    ("/clients/:id/exercises/:exerciseId?edit=:setId", "2b", "Correcting the past. "
     "A route, because it is a place somebody is sent to from a report."),
]
N_ROUTES = len(ROUTES)

S13 = f'''<p class="note">{N_ROUTES} routes, and the same rule the rest of the set
uses: <b>a place gets a URL, a moment does not.</b> A session is a place. An open
set panel is a moment &mdash; but the <i>exercise in focus</i> is a place, because
a trainer with a half-typed row and an accidental reload should land back on
it.</p>
<table class="dt"><thead><tr><th>Route</th><th>Frame</th><th>Note</th></tr></thead>
<tbody>''' + "".join(
    f'<tr><th><code>{r}</code></th><td class="mono">{f}</td>'
    f'<td class="wrap">{n}</td></tr>' for r, f, n in ROUTES) + '''</tbody></table>

<h3 class="h4" style="margin-top:38px">A mode, not a tab</h3>
<p class="note">On the phone the log takes the whole screen: no tab bar, no
hamburger, because mid-session there is nowhere else to be. The desk cannot do
that &mdash; a browser has its own chrome and the rail is how a trainer gets to
the next client &mdash; so the console keeps the rail and earns the same focus a
different way: the session strip pins the four figures at the top, the keyboard
bar pins the accelerators at the bottom, and nothing in between competes with the
grid.</p>
<p class="note">The one thing it borrows outright is the <b>escape</b>. On the
phone, backing out of a log is a deliberate act with a confirm on it, because
discarding a session is the single exception to <i>undo after, never confirm
before</i>. Here it is the same: closing the tab leaves the log open, which is why
frame 5a&rsquo;s first group exists.</p>'''


# ═══════════════════════════════════════════════════════════════════ §14 ══
PROP = [
    ("app/src/log/log.ts &middot; <code>LogType</code>", "code",
     f"&sect;09 promises that <i>time and distance sets relabel the two input "
     f"columns</i>. The union has {len(LOG_TYPES)} members and neither is one of "
     f"them, so a plank and a farmer&rsquo;s walk cannot be logged as what they "
     f"are. Needs <code>{'</code> and <code>'.join(MISSING_TYPES)}</code>, and "
     f"the column labels to follow the type &mdash; additive on a union, and no "
     f"migration, because the value lives on the exercise row."),
    ("app/src/log/log.ts &middot; <code>Judged.streak</code>", "code",
     f"Three problems in one field: the comment says <i>sessions</i>, the value "
     f"is <code>history.length</code> which counts <b>sets</b>, and nothing reads "
     f"it. Either build the &ldquo;third session running&rdquo; line it exists "
     f"for &mdash; with a session count &mdash; or delete the field. Carrying a "
     f"wrong number through eight assignments is the worst of the three."),
    ("app/src/log/log.ts &middot; <code>buildProgress</code>", "gap",
     f"<code>ProgressView.topSet</code> is the client&rsquo;s <b>most-logged</b> "
     f"exercise. On a Push A client that is a press; on somebody rehabbing a knee "
     f"it might be a band walk, and the card will say so with a straight face. "
     f"The desk has room to let the trainer pick which exercise the sequence is "
     f"about, and frame 4b assumes bench because Meera&rsquo;s most-logged "
     f"happens to be the interesting one."),
    ("webapp-clients.html", "link",
     f"The client file&rsquo;s overview links <i>Last logged</i> to a workout and "
     f"<i>Adherence</i> to the week. Neither destination existed when that page "
     f"was drawn; both are frames here now &mdash; 1a and 4b &mdash; and the two "
     f"files should name each other."),
    ("webapp-programs.html", "link",
     f"A swap with scope <code>template</code> rewrites Push A for "
     f"{SWAP_REACH} clients, and the programs file owns what that looks like from "
     f"the template&rsquo;s side. It also owns the answer to <i>&ldquo;three "
     f"identical swaps and the app asks once&rdquo;</i> &mdash; where that ask "
     f"appears, and what it looks like when the trainer says no."),
    ("webapp-schedule.html", "link",
     f"<b>Mark done</b> lives on both screens and moves the same pack. The diary "
     f"sets the rule and this screen must not break it, so the two need to draw "
     f"the identical sentence &mdash; including the {UNDO_HOURS}-hour undo, which "
     f"the finish frame states and the diary&rsquo;s version does not."),
    ("webapp-money.html", "link",
     f"Her pack is {PACK_NOW} of {PACK_TOTAL} until somebody marks today done. "
     f"The money file is where that becomes a number in a book, and the sentence "
     f"about what a session is worth should be one sentence in one place."),
    ("webapp-client-portal.html", "doc",
     f"<code>screens/client/ClientLogScreen.tsx</code> is the client&rsquo;s "
     f"read-only copy of this table, and the shared-table idea is the one thing "
     f"Hevy Coach gets right: a client&rsquo;s copy should not be a different "
     f"screen. The portal file has no log frame at all."),
    ("webapp-information-architecture.html", "doc",
     f"The IA lists this file as <i>Workout console</i> with one frame. It is "
     f"{15}, and the routes in &sect;13 include four the IA does not have &mdash; "
     f"<code>/sessions/:id/bests</code>, "
     f"<code>/clients/:id/exercises/:exerciseId</code>, its "
     f"<code>?edit=</code> form, and <code>/sessions/new</code>."),
    ("webapp-competitors.html", "doc",
     f"The desk-half finding: on a browser every product in the category assumes "
     f"the person at the desk is not the person who logged it, and ABC Trainerize "
     f"is the only one that lets a trainer log at all &mdash; gated on a booking. "
     f"Worth a row of its own, because it is the gap this console is."),
    ("webapp-components.html &middot; webapp-c-domain.html", "code",
     f"Both document <code>.sets</code>, and it grew four things here: a "
     f"<code>Previous</code> column, gold on the set number, a note row and a "
     f"32px tick. Additive &mdash; new selectors, no edits &mdash; and both files "
     f"render as before, but the component page should show the new states."),
    ("webapp-heuristics.html", "audit",
     f"{N_FIND} findings and {N_NNG} principles, plus the open items below."),
]
N_PROP = len(PROP)
APP_BUGS = sum(1 for f, *_ in PROP if f.startswith("app/src"))
assert APP_BUGS == 3, APP_BUGS

S14 = (f'''<p class="note">{N_PROP} things, and <b>{APP_BUGS} of them are in the
app</b>. None of the three breaks a build; one is a type that cannot express a
rule the same repository states, one is a field that counts sets and says
sessions, and one is a card that will confidently describe the wrong
exercise.</p>
<table class="dt"><thead><tr><th>File</th><th>Kind</th><th>What it owes</th></tr>
</thead><tbody>''' + "".join(
    f'<tr><th><code>{f}</code></th><td class="mono">{k}</td>'
    f'<td class="wrap">{w}</td></tr>' for f, k, w in PROP) + '</tbody></table>')


# ═══════════════════════════════════════════════════════════════════ §15 ══
OPEN = [
    (False, "Supersets are out, and the reason is a phone reason",
     f"<i>&ldquo;A superset is a UI for a lifter optimising their own hour, and a "
     f"trainer supervising one client can simply log two exercises.&rdquo;</i> "
     f"That holds on a phone. On a desk, two exercises interleaved across six "
     f"rows is exactly the shape a grid is good at &mdash; and Hevy has had them "
     f"for years. Deliberately skipped in v1, and the desk is where the argument "
     f"gets weaker."),
    (False, f"The {SWAP_ASK_AFTER}-swap ask has no screen",
     f"{SWAP_ASK_AFTER} identical swaps and the app asks once whether the program "
     f"should change. Nothing in this set draws the ask, what it looks like when "
     f"the trainer declines, or whether declining is remembered &mdash; and an "
     f"ask that returns every third swap is a nag. <code>webapp-programs.html</code> "
     f"owns it."),
    (False, "Two logs open at once is supported and undrawn",
     f"Frame 5a&rsquo;s first group exists because a trainer logs four clients a "
     f"morning. What the console looks like with two live sessions &mdash; whether "
     f"there is a switcher, whether the rail shows both, what the browser tab says "
     f"&mdash; is not decided. The phone answers it with a list; a desk has room "
     f"for something better and nothing is drawn."),
    (False, "Reordering exercises",
     f"§07 puts it on a long press and a drag of the card, and explicitly refuses "
     f"a &ldquo;Reorder&rdquo; mode reached through a menu. Drag on a desk needs a "
     f"keyboard alternative under WCAG 2.2 SC&nbsp;2.5.7 &mdash; the schedule file "
     f"specifies one (X lift, arrows, V drop) and this console has not adopted "
     f"it."),
    (False, "The plate step has no setting",
     f"{trim1(PLATE_STEP)} kg here, 1.25 in other gyms, and it decides whether a "
     f"client&rsquo;s phone buzzes. <code>plateStepKg</code> is on "
     f"<code>LogInput</code> and reaches it from somewhere; no screen in this set "
     f"lets a trainer say which gym they are in. It belongs with the three "
     f"attention thresholds the clients file also owes to "
     f"<code>webapp-settings.html</code>."),
    (False, "Catching up a session from paper has no shape of its own",
     f"This page&rsquo;s own stated reason to exist, and it is drawn as the live "
     f"console with a different mindset. A trainer entering four sessions from a "
     f"notebook at nine wants a different arrangement &mdash; probably one client "
     f"after another in one continuous grid, with the date as a field rather than "
     f"a header. That is a frame, and it is not here."),
]
N_OPEN = len(OPEN)
N_BLOCK = sum(1 for b, *_ in OPEN if b)
assert N_BLOCK == 0

S15 = (f'''<p class="note">{N_OPEN} things, and <b>none of them blocks</b>. Four are
features the mobile spec deliberately skipped or put on a gesture, and the desk is
where two of those decisions get weaker rather than stronger. The last one is this
page&rsquo;s own stated purpose, drawn only as a mindset.</p>'''
       + "".join(
    f'<div class="grp"><div class="grp__t"><h4>'
    f'<span class="ink3 mono" style="margin-right:8px">{i + 1:02d}</span>{t_}</h4>'
    f'<span><span class="tag tag--warn">Open</span></span></div>'
    f'<p class="note" style="margin-top:10px">{w}</p></div>'
    for i, (b, t_, w) in enumerate(OPEN)))


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
       '<a href="webapp-clients.html">CLIENTS</a>'
       '<a href="webapp-programs.html">PROGRAMS</a>'
       '<a href="webapp-schedule.html">SCHEDULE</a>'
       '<a href="webapp-workout.html" aria-current="page">WORKOUT</a>'
       '<a href="webapp-money.html">MONEY</a>'
       '<a href="webapp-reports.html">REPORTS</a>'
       '<a href="webapp-settings.html">SETTINGS</a>'
       '<a href="webapp-client-portal.html">PORTAL</a>')

SECS = [
    ("01", f"The audit &mdash; {N_FIND} things, and two of them are the "
           f"app&rsquo;s own rules", S01),
    ("02", "The one screen the web should not win", S02),
    ("03", "The console", S03),
    ("04", "Previous is a column, not a placeholder", S04),
    ("05", f"The record &mdash; {len(VERDICT_UNION)} verdicts and one plate", S05),
    ("06", "Off-plan: the rack was busy", S06),
    ("07", "History, and a chart that does not lie", S07),
    ("08", f"Competitor analysis &mdash; nine on the phone, {N_PROD} on the desk",
     S08),
    ("09", "Into a session, and out of it", S09),
    ("10", "When it goes wrong", S10),
    ("11", "Correcting the past, which is why a desk exists", S11),
    ("12", "Nielsen Norman &mdash; accelerators, and the rule the old frame broke",
     S12),
    ("13", "The routes", S13),
    ("14", "What this changes in the other files", S14),
    ("15", f"Still open &mdash; {N_OPEN}, none blocking", S15),
]
N_SECS = len(SECS)

# Document order, which is also the order the frame index renders. The
# correction frame is 7a rather than 2b: it belongs to the record's story but it
# is read last, and an id that jumps backwards in the index is a navigation bug.
FRAMES = ["1a", "1b", "1c", "1d", "2a", "3a", "3b", "4a", "4b", "5a", "5b",
          "5c", "6a", "6b", "7a"]
N_FRAMES = len(FRAMES)
assert N_FRAMES == 15
assert len(set(FRAMES)) == N_FRAMES

BODY_HTML = '\n\n'.join(
    f'<h2 class="sec"><span class="n">{n}</span>{t}</h2>\n{s}' for n, t, s in SECS)
for _f in FRAMES:
    assert BODY_HTML.count(f'id="f-{_f}"') == 1, _f
_pos = [BODY_HTML.index(f'id="f-{f}"') for f in FRAMES]
assert _pos == sorted(_pos), "frame ids out of document order"

HTML = f'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>X REP &middot; Web app &mdash; Workout console</title>
<meta name="description" content="The desk half of a floor screen: the set grid, the four verdicts, the swap that reaches five people, and correcting a set from November. X REP web application.">
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

<h1>Workout console &mdash; the desk half of a floor screen</h1>
<p class="doc__lede">The page this replaces got its opening argument right and then
drew <b>{STALE_FRAMES}</b> frame. It said so itself: its provenance line lists
<b>{len(STALE_CLAIMED)}</b> app frames, and
<code>app/src/screens/main/log</code> holds <b>{LOG_SURFACES}</b> surfaces &mdash;
{LOG_SCREENS} screens and {LOG_SHEETS} sheets &mdash; plus the client&rsquo;s own
read-only copy of the same table.
<br><br>The one frame it drew broke the rule &sect;09 says this screen is most
likely to break. It put <b>&ldquo;Package after this &middot;
{STALE_PACK_LINE} of {PACK_TOTAL}&rdquo;</b> in the session summary, and the rule
is that <i>finishing the log does not move the pack &mdash; a pack moves on done
or no-show, never on booked</i>. It dated the session <b>{STALE_DATE}</b>, which
is neither today nor a Tuesday. It printed <b>{SETS_MID} of {PLANNED_SETS}
sets</b> beside <b>{STALE_VOL:,} kg</b>, and those eight sets come to
{VOL_MID:,} &mdash; the figure belongs to a finished session. And it labelled the
record <i>&ldquo;her best at this rep range&rdquo;</i>, which is not what
<code>judge</code> computes.
<br><br>What was missing is the design of a workout log: the
<b>{len(VERDICT_UNION)} verdicts</b>, the <b>plate step</b> that decides whether
the client&rsquo;s phone buzzes, the <b>swap scope</b> that can reach
{SWAP_REACH} people, the <b>note</b> that is the best idea in the category, and
the fact that a record is <b>computed on read</b> &mdash; so correcting a set from
November fixes nine months of records in the same frame, which is the one thing a
desk can do that a phone cannot.
<br><br>So: <b>{N_FRAMES} frames</b>. Every figure below is derived and asserted
from the modules that compute it, down to the half-kilo of incline volume that
JavaScript rounds up and Python rounds down.</p>
<div class="doc__meta"><span><b>Frames</b> <span data-frame-count>{N_FRAMES}</span></span>
  <span><b>Defects found</b> {N_FIND}</span>
  <span><b>Products examined</b> {N_PROD}</span>
  <span><b>The session</b> {PLANNED_SETS} sets, {VOL_ALL:,} kg, {len(REAL_RECORDS)} records, {len(ANNOUNCED)} sent</span>
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
  verbatim from <code>xrepdesignsystem.html</code> &mdash; if a value differs
  there, it is a bug here. Press <kbd>+</kbd> / <kbd>&minus;</kbd> to change the
  zoom.
  <br><br>Generated by <code>gen_workout.py</code>; edit that and re-run it
  rather than editing this file. <code>judge</code> is ported from
  <code>app/src/log/log.ts</code> branch for branch &mdash; the three tests, the
  plate-step fourth, and the reps-only path &mdash; and this generator asserts
  that one session of Meera&rsquo;s lands on four of the five members of
  <code>Verdict</code>, that the record sits on set
  {BENCH['sets'].index(BENCH['top']) + 1} rather than the last set she did, and
  that walking her bench history forward reproduces {len(PR_MARKS)} tags out of
  {N_HIST_SESSIONS} sessions with the oldest carrying none. <code>volumeOf</code>,
  <code>topSet</code>, <code>previousFor</code>, <code>saySet</code> and
  <code>trim1</code> are ported the same way, including <code>Math.round</code>'s
  half-up behaviour, which Python does not share. The day, the client and the
  session come from <code>gen_today.py</code>, whose sync queue announces
  &ldquo;Push A logged &middot; {PLANNED_SETS} sets&rdquo; and &ldquo;Bench
  {trim1(BENCH['verdict']['load'])} kg &times; {BENCH['verdict']['reps']} &mdash; a
  new top set&rdquo;; the pack comes from <code>gen_clients.py</code>, so the
  finish frame cannot disagree with her book; her bodyweight comes from the same
  place.
  <br><br>Claims about the app trace to <code>app/src/log/log.ts</code>
  (<code>LogType</code>, <code>LogSetRow</code>, <code>LogExerciseView</code>,
  <code>Verdict</code>, <code>PrCard</code>, <code>judge</code>,
  <code>previousFor</code>, <code>topSet</code>, <code>buildLog</code>,
  <code>buildFinish</code>, <code>buildProgress</code>,
  <code>buildHistory</code>, <code>buildPicker</code>) and to the
  {LOG_SCREENS} screens and {LOG_SHEETS} sheets in
  <code>app/src/screens/main/log/</code>. The mobile design document quoted
  throughout is <code>notes/design system/screens/xrep-workout-log.html</code>
  &mdash; &sect;08&rsquo;s nine-platform teardown and &sect;09&rsquo;s sixteen
  rules. Where a document disagrees with the code, the code wins and &sect;14
  says so.
  <br><br>Competitor rows trace to primary sources: Hevy Coach&rsquo;s own pages
  on the coach dashboard and the client tracker; ABC Trainerize&rsquo;s help
  centre article on tracking workouts for a client, which is where the
  booking-first requirement is stated; TrueCoach&rsquo;s help centre on the client
  experience and on results entry; and published comparisons of trainer software
  against spreadsheets for the incumbent&rsquo;s side. Those help centres return
  403 to a direct fetch, so the rows are read from search summaries of them and
  are marked accordingly. The nine-platform phone teardown is the mobile
  document&rsquo;s, not re-run here.
  <br><br>&sect;12 quotes Nielsen Norman Group directly: Rachel Krause and Aurora
  Harley, <i>Accelerators Maximize Efficiency in User Interfaces</i>
  (18 October 2024) for the definition, the not-a-new-feature rule, the styling
  rule, the repetition rule, the do-not-override rule and the safety net; the
  <i>Flexibility and Efficiency of Use</i> heuristic article; Aurora Harley&rsquo;s
  <i>Vanity Metrics</i> (2019); and Nielsen&rsquo;s heuristics 1, 2, 5, 6, 7 and
  8.
</p>

</div>
<script src="assets/webapp.js"></script>
</body>
</html>
'''

if __name__ == "__main__":
    out = HERE / "webapp-workout.html"
    out.write_text(HTML)
    print("wrote", out, len(HTML), "chars")

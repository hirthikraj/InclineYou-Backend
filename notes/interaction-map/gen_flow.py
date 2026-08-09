#!/usr/bin/env python3
"""Generates the TrainDesk MVP master flow chart (trainer + client) as a standalone SVG."""

W, H = 1900, 1600

INK      = "#15162B"
BODY     = "#434860"
MUTED    = "#767D96"
STROKE   = "#C3CADB"
RULE     = "#D8DEEC"
GROUND   = "#FFFFFF"
CLUSTER  = "#F6F7FB"
BOXFILL  = "#FFFFFF"
TR       = "#4F46E5"   # trainer accent
TR_SOFT  = "#E9ECFF"
CL       = "#0E6E78"   # client accent
CL_SOFT  = "#DFF1F2"
SYNC     = "#B26A00"   # cross-device sync / push
SYNC_SFT = "#FFF3E2"
GOOD     = "#2E7D32"

SANS = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
MONO = "'DejaVu Sans Mono', Menlo, Consolas, monospace"

out = []
A = out.append


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def txt(x, y, s, size=12, fill=BODY, weight="400", anchor="start", family=SANS, ls=None):
    extra = f' letter-spacing="{ls}"' if ls else ""
    A(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" '
      f'fill="{fill}" text-anchor="{anchor}"{extra}>{esc(s)}</text>')


def box(x, y, w, h, title, sub=None, tag=None, kind="plain"):
    fill, stroke, tcol, scol = BOXFILL, STROKE, INK, MUTED
    if kind == "accent":
        fill, stroke, tcol, scol = TR_SOFT, TR, TR, TR
    elif kind == "client":
        fill, stroke, tcol, scol = CL_SOFT, CL, CL, CL
    elif kind == "hub":
        fill, stroke, tcol, scol = TR, TR, "#FFFFFF", "#D9D6FF"
    elif kind == "sunk":
        fill = CLUSTER
    A(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="{fill}" stroke="{stroke}" stroke-width="1.3"/>')
    ty = y + (h / 2 + 4) if not sub else y + 24
    txt(x + 14, ty, title, size=12.5, fill=tcol, weight="600")
    if sub:
        txt(x + 14, y + 41, sub, size=10.5, fill=scol)
    if tag:
        txt(x + w - 12, y + 16, tag, size=9.5, fill=scol, anchor="end", family=MONO)


def diamond(cx, cy, hw, hh, l1, l2=None):
    A(f'<path d="M{cx} {cy-hh} L{cx+hw} {cy} L{cx} {cy+hh} L{cx-hw} {cy} Z" '
      f'fill="{BOXFILL}" stroke="{STROKE}" stroke-width="1.3"/>')
    if l2:
        txt(cx, cy - 2, l1, size=11, fill=INK, weight="600", anchor="middle")
        txt(cx, cy + 14, l2, size=11, fill=INK, weight="600", anchor="middle")
    else:
        txt(cx, cy + 4, l1, size=11, fill=INK, weight="600", anchor="middle")


def arrow(x1, y1, x2, y2, color=BODY, dashed=False, both=False, marker="a"):
    d = ' stroke-dasharray="5 4"' if dashed else ""
    s = f' marker-start="url(#{marker}-s)"' if both else ""
    A(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.4" '
      f'fill="none"{d}{s} marker-end="url(#{marker})"/>')


def cluster(x, y, w, h, title, tag):
    A(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{CLUSTER}" stroke="{RULE}" stroke-width="1.3"/>')
    txt(x + 18, y + 27, title, size=12, fill=INK, weight="700", ls="0.09em")
    txt(x + w - 16, y + 27, tag, size=10, fill=TR, anchor="end", family=MONO)


# ---------------------------------------------------------------- canvas
A(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">')
A('<defs>')
for name, col in (("a", BODY), ("a-tr", TR), ("a-cl", CL), ("a-sy", SYNC)):
    for suffix, orient in (("", "auto-start-reverse"), ("-s", "auto-start-reverse")):
        A(f'<marker id="{name}{suffix}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" '
          f'orient="{orient}"><path d="M0,0 L10,5 L0,10 z" fill="{col}"/></marker>')
A('</defs>')
A(f'<rect width="{W}" height="{H}" fill="{GROUND}"/>')

# ---------------------------------------------------------------- title
txt(40, 52, "TrainDesk MVP — trainer & client flow", size=25, fill=INK, weight="700")
txt(40, 76, "Every screen in the MVP, both roles, and the paths that connect them. FR tags map to the Final Requirements & Delivery Plan v2.0.",
    size=12.5, fill=MUTED)

# ---------------------------------------------------------------- entry band
ey = 110
box(60, ey, 140, 54, "Launch", "app opens")
arrow(200, ey + 27, 236, ey + 27)
diamond(320, ey + 27, 84, 40, "session on", "this device?")
arrow(404, ey + 12, 452, ey + 12)
txt(428, ey - 2, "no", size=10.5, fill=MUTED, anchor="middle", family=MONO)
box(456, ey - 12, 150, 54, "Phone entry", "mobile number")
arrow(606, ey + 15, 638, ey + 15)
box(642, ey - 12, 170, 54, "OTP verify", "needs a connection")
arrow(812, ey + 15, 856, ey + 34)
A(f'<path d="M320 {ey+67} L320 {ey+92} L860 {ey+92} L860 {ey+62}" stroke="{TR}" stroke-width="1.4" '
  f'fill="none" marker-end="url(#a-tr)"/>')
txt(590, ey + 108, "yes — opens offline, straight into local data", size=11, fill=TR, anchor="middle", family=MONO)
box(860, ey, 180, 54, "Resolve role", "a person can be both")

arrow(950, ey + 54, 662, 288, color=TR)
arrow(1040, ey + 27, 1660, 404, color=CL)

# ---------------------------------------------------------------- lane headers
txt(40, 250, "TRAINER ROLE", size=13, fill=TR, weight="700", ls="0.14em", family=MONO)
A(f'<line x1="40" y1="262" x2="1220" y2="262" stroke="{TR}" stroke-width="1.6"/>')
txt(1460, 250, "CLIENT ROLE", size=13, fill=CL, weight="700", ls="0.14em", family=MONO)
A(f'<line x1="1460" y1="262" x2="1860" y2="262" stroke="{CL}" stroke-width="1.6"/>')

# ---------------------------------------------------------------- trainer hub
box(500, 292, 260, 62, "Home / Dashboard", "clients · today · revenue · gym split", kind="hub")
txt(770, 316, "FR-7", size=10.5, fill=TR, family=MONO)
txt(770, 332, "opens 20× a day", size=10.5, fill=MUTED)

# vertical rail down the middle gutter of the trainer lane
A(f'<line x1="630" y1="354" x2="630" y2="1436" stroke="{TR}" stroke-width="1.3" stroke-dasharray="5 5"/>')

CL_X1, CL_X2 = 40, 650          # cluster column origins
CW = 570
ROWS = (382, 742, 1102)
CH = 320

def rail_tick(row_y):
    cy = row_y + CH / 2
    arrow(630, cy, 612, cy, color=TR)
    arrow(630, cy, 648, cy, color=TR)

for r in ROWS:
    rail_tick(r)

# --- CLIENTS -----------------------------------------------------
cluster(CL_X1, ROWS[0], CW, CH, "CLIENTS & INTAKE", "FR-1")
box(60, 430, 250, 56, "Client roster", "search · status chips · filters")
box(350, 430, 240, 56, "Add client", "intake · payment mode · split %")
box(60, 520, 250, 56, "Client detail", "the whole file, one screen")
box(350, 520, 240, 56, "Edit client", "pause · reactivate · soft delete")
box(60, 610, 250, 56, "Body metrics", "weight, waist — append-only")
box(350, 610, 240, 56, "Client tabs", "programs · sessions · package")
arrow(310, 458, 346, 458)
arrow(185, 486, 185, 516)
arrow(310, 548, 346, 548)
arrow(185, 576, 185, 606)
arrow(310, 638, 346, 638)

# --- PLANS -------------------------------------------------------
cluster(CL_X2, ROWS[0], CW, CH, "PLANS & TEMPLATES", "FR-3")
box(670, 430, 250, 56, "Template list", "reusable plans this trainer owns")
box(960, 430, 240, 56, "Template builder", "days · sets · reps · load")
box(670, 520, 250, 56, "Template detail", "review · assign · duplicate")
box(960, 520, 240, 56, "Exercise picker", "873 seeded + custom")
box(670, 610, 250, 56, "Program detail", "tweak this client only", kind="accent")
box(960, 610, 240, 56, "Custom exercise", "name · muscle · image · video")
arrow(920, 458, 956, 458)
arrow(795, 486, 795, 516)
arrow(1080, 486, 1080, 516)
arrow(795, 576, 795, 606, color=TR)
txt(805, 596, "assign = deep copy", size=10, fill=TR, family=MONO)
arrow(1080, 576, 1080, 606)

# --- SCHEDULE ----------------------------------------------------
cluster(CL_X1, ROWS[1], CW, CH, "SCHEDULING", "FR-2")
box(60, 790, 250, 56, "Calendar", "day · week · month")
box(350, 790, 240, 56, "Session list", "upcoming & past")
box(60, 880, 250, 56, "Schedule session", "one-off: client, date, time")
box(350, 880, 240, 56, "Weekly slot picker", "recurring slots in bulk")
box(60, 970, 250, 56, "Session detail", "done · no-show · cancel · move")
box(350, 970, 240, 56, "Marked done", "pack −1 · notifies client", kind="accent")
arrow(310, 818, 346, 818)
arrow(185, 846, 185, 876)
arrow(470, 846, 470, 876)
arrow(185, 936, 185, 966)
arrow(310, 998, 346, 998, color=TR)
A(f'<path d="M470 936 L470 955 L250 955 L250 963" stroke="{BODY}" stroke-width="1.4" fill="none" marker-end="url(#a)"/>')

# --- LOGGING -----------------------------------------------------
cluster(CL_X2, ROWS[1], CW, CH, "WORKOUT LOGGING", "FR-4 · FR-5")
box(670, 790, 250, 56, "Workout log", "the floor screen · fully offline", kind="accent")
box(960, 790, 240, 56, "Prefilled sets", "last session's load & reps")
box(670, 880, 250, 56, "Add / edit / delete set", "load · reps · RPE · note")
box(960, 880, 240, 56, "Unplanned exercise", "the rack was busy")
box(670, 970, 250, 56, "PR detected", "computed on read, never stored", kind="accent")
box(960, 970, 240, 56, "Progress & PRs", "volume · top set · bodyweight")
arrow(920, 818, 956, 818)
arrow(795, 846, 795, 876)
arrow(1080, 846, 1080, 876)
arrow(795, 936, 795, 966, color=TR)
arrow(920, 998, 956, 998)

# --- MONEY -------------------------------------------------------
cluster(CL_X1, ROWS[2], CW, CH, "PACKAGES & PAYMENTS", "FR-6")
box(60, 1150, 250, 56, "Package editor", "session pack or monthly")
box(350, 1150, 240, 56, "Payment sheet", "branches on payment mode")
box(60, 1240, 250, 56, "UPI intent link", "trainer_collects → own VPA", kind="accent")
box(350, 1240, 240, 56, "Front office", "gym_collects → mark paid")
box(60, 1330, 250, 56, "Marked paid", "either party · optional ref")
box(350, 1330, 240, 56, "Payment history", "append-only ledger")
arrow(310, 1178, 346, 1178)
A(f'<path d="M470 1206 L470 1222 L185 1222 L185 1233" stroke="{BODY}" stroke-width="1.4" fill="none" marker-end="url(#a)"/>')
arrow(470, 1206, 470, 1236)
arrow(185, 1296, 185, 1326)
arrow(470, 1296, 470, 1326)
arrow(310, 1358, 346, 1358)

# --- COMMS -------------------------------------------------------
cluster(CL_X2, ROWS[2], CW, CH, "REPORTS, NUDGES & SETUP", "FR-9 · FR-10")
box(670, 1150, 250, 56, "Nudge composer", "4 approved WhatsApp templates")
box(960, 1150, 240, 56, "Delivery state", "queued · sent · failed")
box(670, 1240, 250, 56, "Weekly report", "auto-generated per client")
box(960, 1240, 240, 56, "Share on demand", "any past week")
box(670, 1330, 250, 56, "Adherence", "who is drifting, roster-wide")
box(960, 1330, 240, 56, "Settings", "name · UPI VPA · push · role")
arrow(920, 1178, 956, 1178)
arrow(920, 1268, 956, 1268)

# ---------------------------------------------------------------- sync gutter
A(f'<rect x="1244" y="382" width="192" height="1040" rx="7" fill="{SYNC_SFT}" stroke="{RULE}" stroke-width="1.2"/>')
txt(1340, 410, "SYNC + PUSH BRIDGE", size=10.5, fill=SYNC, weight="700", anchor="middle", family=MONO, ls="0.06em")
txt(1340, 428, "FR-8 · eventual, not live", size=10, fill=SYNC, anchor="middle", family=MONO)

CROSS = [
    (492, "plan assigned", "push announces it", "r"),
    (622, "either role logs", "same screen, syncs", "b"),
    (752, "same numbers", "shown to both roles", "b"),
    (882, "booked or moved", "push announces it", "r"),
    (1012, "amount due", "paid, either party", "b"),
    (1142, "weekly report", "auto-sent", "r"),
]
for y, l1, l2, dirn in CROSS:
    A(f'<line x1="1220" y1="{y}" x2="1456" y2="{y}" stroke="{SYNC}" stroke-width="1.5" stroke-dasharray="6 4" '
      f'marker-end="url(#a-sy)"{" marker-start=\"url(#a-sy-s)\"" if dirn == "b" else ""}/>')
    txt(1340, y - 12, l1, size=10.5, fill=SYNC, weight="600", anchor="middle", family=MONO)
    txt(1340, y + 20, l2, size=10, fill=MUTED, anchor="middle", family=MONO)

# ---------------------------------------------------------------- client lane
CLIENT = [
    ("Today", "today's plan · next session · anything owed", "FR-11.1", 450),
    ("Workout log", "log their own sets — offline, same engine", "FR-4.3", 580),
    ("Progress", "PRs · charts · log a body metric", "FR-5.2", 710),
    ("Sessions", "upcoming · reschedule notices land here", "FR-2.3", 840),
    ("Payments", "pay by UPI · mark paid · history", "FR-11.2", 970),
    ("Weekly report", "what the server generated on Sunday", "FR-10.2", 1100),
]
for name, sub_, tag, y in CLIENT:
    box(1460, y - 42, 400, 84, name, sub_, tag=tag, kind="client")

A(f'<path d="M1860 450 L1882 450 L1882 1100" stroke="{CL}" stroke-width="1.3" fill="none" stroke-dasharray="5 5"/>')
for _, _, _, y in CLIENT[1:]:
    arrow(1882, y, 1864, y, color=CL)

txt(1460, 1166, "FIRST-RUN STATE", size=10, fill=MUTED, weight="700", family=MONO, ls="0.1em")
box(1460, 1180, 400, 84, "No plan assigned yet", "the likeliest first launch — design it properly", kind="sunk")

# ---------------------------------------------------------------- legend
ly = 1476
A(f'<line x1="40" y1="{ly-28}" x2="1860" y2="{ly-28}" stroke="{RULE}" stroke-width="1.3"/>')
items = [
    (40, BODY, False, "navigation between screens"),
    (330, TR, False, "trainer-side consequence"),
    (620, SYNC, True, "crosses devices — sync or push"),
    (960, CL, False, "client-side navigation"),
]
for x, col, dash, label in items:
    d = ' stroke-dasharray="6 4"' if dash else ""
    A(f'<line x1="{x}" y1="{ly}" x2="{x+42}" y2="{ly}" stroke="{col}" stroke-width="1.6"{d} marker-end="url(#a)"/>')
    txt(x + 54, ly + 4, label, size=11, fill=BODY)

A(f'<rect x="1250" y="{ly-11}" width="22" height="22" rx="4" fill="{TR_SOFT}" stroke="{TR}" stroke-width="1.3"/>')
txt(1282, ly + 4, "offline-critical or consequential", size=11, fill=BODY)
A(f'<rect x="1560" y="{ly-11}" width="22" height="22" rx="4" fill="{CL_SOFT}" stroke="{CL}" stroke-width="1.3"/>')
txt(1592, ly + 4, "client role", size=11, fill=BODY)

txt(40, ly + 46, "16 of 31 screens exist in code today; the rest are greenfield. See the screen inventory for which is which.",
    size=11, fill=MUTED, family=MONO)
txt(1860, ly + 46, "TrainDesk · MVP interaction map · 9 Aug 2026", size=11, fill=MUTED, anchor="end", family=MONO)

A('</svg>')

import pathlib
p = pathlib.Path("/home/hirthick/Hirthik/TrainX/trainX/notes/interaction-map/trainer-client-flow.svg")
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text("\n".join(out))
print("wrote", p, len("\n".join(out)), "bytes")

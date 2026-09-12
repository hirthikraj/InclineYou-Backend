#!/usr/bin/env python3
"""Generate webapp-money.html.

Run it from anywhere: python3 gen_money.py — it writes the page next to itself.

Seventeen frames share one shell, so the rail, the top bar, the four-figure stat
row and the six-tab page header are defined once here rather than pasted
seventeen times. The file this replaces drew two frames and declared six tabs;
four of those tabs pointed at nothing, which is the failure this generator
exists to end.

Every frame traces to a state in `notes/design system/screens/inclineyoumoney.html`,
which is the source of truth for what this screen is. Where the two disagree the
phone file wins — including the one rule it calls non-negotiable: money in is
green with a down arrow, money out is red with an up arrow.
"""
import pathlib

HERE = pathlib.Path(__file__).resolve().parent

# The navigation rail, verbatim from the rest of the design set, with Money as
# the current page. Held here as a literal because all seventeen frames draw it.
RAIL = r"""<nav class="rail" aria-label="Sections">
  <div class="rail__top"><span class="rail__mark"><svg width="17" height="17" viewBox="0 0 100 100" fill="none" aria-hidden="true"><rect x="4" y="16" width="92" height="8" rx="3" fill="#0A0B0D"/><rect x="4" y="13" width="7" height="14" fill="#0A0B0D"/><rect x="89" y="13" width="7" height="14" fill="#0A0B0D"/><rect x="16" y="7" width="10" height="26" fill="#0A0B0D"/><rect x="74" y="7" width="10" height="26" fill="#0A0B0D"/><path d="M28 93 C28 60 72 60 72 93" stroke="#0A0B0D" stroke-width="11"/><circle cx="50" cy="35" r="9" fill="#0A0B0D"/><g stroke="#0A0B0D" stroke-width="11"><path d="M50 43 L50 64"/><path d="M33 22 C34 56 66 56 67 22"/></g></svg></span>
    <span class="rail__word">X&nbsp;REP</span></div>
  <div class="rail__body"><div class="rail__group"><p class="rail__gk">WORK</p><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/></svg><span>Today</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg><span>Schedule</span><span class="rail__n">5</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8"/><path d="M18 13.6c2.1.7 3.5 2.5 3.5 5"/></svg><span>Clients</span><span class="rail__n">22</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10"/></svg><span>Sessions</span></div></div><div class="rail__group"><p class="rail__gk">BUILD</p><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 9h8M8 13h8M8 17h5"/></svg><span>Programs</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="17" r="1.2"/><circle cx="15" cy="17" r="1.2"/></svg><span>Exercises</span></div></div><div class="rail__group"><p class="rail__gk">BUSINESS</p><div class="rail__i" aria-current="page"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10M7 8.5h10M15.5 4c0 4-3.4 4.5-6 4.5h-.5l7 11.5"/></svg><span>Money</span><span class="rail__n rail__n--alert">3</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V4M4 20h16"/><rect x="7.5" y="12" width="3" height="5"/><rect x="12.5" y="8.5" width="3" height="8.5"/><rect x="17" y="6" width="3" height="11"/></svg><span>Reports</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/></svg><span>Nudges</span><span class="rail__n rail__n--acc">8</span></div></div><div class="rail__group"><p class="rail__gk">SYSTEM</p><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6"/><path d="M17.5 3v3.6h-3.6M6.5 21v-3.6h3.6"/></svg><span>Sync queue</span><span class="rail__n">6</span></div><div class="rail__i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.6M12 18.6v2.6M4.5 12H2M22 12h-2.5M6.2 6.2 4.4 4.4M19.6 19.6l-1.8-1.8M17.8 6.2l1.8-1.8M4.4 19.6l1.8-1.8"/></svg><span>Settings</span></div></div></div>
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
I_SEARCH = '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'
I_BELL = ('<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/>'
          '<path d="M10 19a2.2 2.2 0 0 0 4 0"/>')
I_DOTS = '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'
I_PLUS = '<path d="M12 5v14M5 12h14"/>'
I_DOWN = '<path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>'
I_DOC = '<path d="M6 3.5h7l5 5V20.5H6z"/><path d="M13 3.5v5h5"/>'
I_X = '<path d="M6 6l12 12M18 6L6 18"/>'
I_SEND = '<path d="M21 3 10.5 13.5"/><path d="M21 3l-6.8 18-3.7-7.5L3 9.8Z"/>'
I_WALLET = ('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/>'
            '<circle cx="17" cy="14.5" r="1.1"/>')
I_RUPEE = '<path d="M7 4h10M7 8.5h10M15.5 4c0 4-3.4 4.5-6 4.5h-.5l7 11.5"/>'
I_UNDO = '<path d="M4 10h9a4.5 4.5 0 0 1 0 9H8"/><path d="M7.5 6.5 4 10l3.5 3.5"/>'
I_ALERT = '<path d="M12 4.5 21 19.5H3Z"/><path d="M12 10v4.2M12 17.2h.01"/>'
I_SHIELD = '<path d="M12 3l7.5 3v6c0 4.5-3.2 7.6-7.5 9-4.3-1.4-7.5-4.5-7.5-9V6Z"/>'
I_BUILD = ('<path d="M4 20.5V7l7-3.5V20.5"/><path d="M11 10.5h6.5a1.5 1.5 0 0 1 1.5 1.5v8.5"/>'
           '<path d="M2.5 20.5h19"/>')
I_CHECK = '<path d="M4.5 12.5l5 5 10-11"/>'
I_TRASH = '<path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'
I_CLOUD_OFF = ('<path d="M4 4l16 16"/>'
               '<path d="M7 18.5h9.5a4 4 0 0 0 1.4-7.75A6 6 0 0 0 9.2 7.4"/>'
               '<path d="M6.6 10.1A4.2 4.2 0 0 0 7 18.5"/>')
I_EDIT = '<path d="M15.5 4.5 19.5 8.5 8 20H4v-4Z"/>'
I_FILTER = '<path d="M3.5 5.5h17l-6.5 7.5v6l-4 2v-8Z"/>'

# Money in is green with a down arrow; money out is red with an up arrow.
# Ten million people already read a book this way — see `.dirn` in webapp.css.
I_ARR_IN = '<path d="M12 5v13"/><path d="M6.5 12.5 12 18l5.5-5.5"/>'
I_ARR_OUT = '<path d="M12 19V6"/><path d="M6.5 11.5 12 6l5.5 5.5"/>'


# ─────────────────────────────────────────────────────────────────── shell ──
def top(crumb, sync='<span class="sync"><i></i>Synced</span>'):
    return f'''<header class="top">
  <nav class="crumbs" aria-label="Breadcrumb"><a>Money</a><i>{ic(I_CHEV, 12)}</i><b>{crumb}</b></nav><div class="omni">{ic(I_SEARCH)}<span>Search clients, sessions, exercises…</span><kbd>⌘K</kbd></div>
  <div class="top__acts">{sync}
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Notifications">{ic(I_BELL, 18)}</button>
  </div></header>'''


TABS = [('Ledger', '27'), ('Owed', '3'), ('Packages', '6'), ('Gym share', ''),
        ('GST', ''), ('Write-offs', '1')]


def tabs(active):
    out = []
    for name, n in TABS:
        on = name == active
        badge = f'<span class="rail__n">{n}</span>' if n else ''
        out.append(f'<button class="tab" type="button" role="tab" '
                   f'aria-selected="{"true" if on else "false"}" '
                   f'tabindex="{0 if on else -1}">{name}{badge}</button>')
    return '<div class="ph__tabs" role="tablist">' + ''.join(out) + '</div>'


MONTHS = '''<div class="btngroup"><button class="btn" type="button" aria-pressed="false">Jun</button><button class="btn" type="button" aria-pressed="false">Jul</button><button class="btn" type="button" aria-pressed="true">Aug</button></div>'''

EXPORT_BTN = (f'<button class="btn btn--secondary" type="button">{ic(I_DOWN)}'
              'Export for my CA</button>')


def ph(sub, active, acts=None, title='Money'):
    a = MONTHS + EXPORT_BTN if acts is None else acts
    a = f'<div class="ph__acts">{a}</div>' if a else ''
    return (f'<div class="ph"><div class="ph__row"><div><p class="ph__t">{title}</p>'
            f'<p class="ph__sub">{sub}</p></div>{a}</div>{tabs(active)}</div>')


KEYS = ('<div class="keys"><b><kbd>⌘K</kbd>command</b><b><kbd>R</kbd>record a payment</b>'
        '<b><kbd>N</kbd>remind who owes</b><b><kbd>E</kbd>export</b>'
        '<b><kbd>J / K</kbd>move</b><b><kbd>Esc</kbd>clear filters</b></div>')


def main(head, body, keys=KEYS, after=''):
    return f'<main class="main">{head}<div class="body">{body}</div>{keys}</main>{after}'


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
  <p class="unit__note">{note}</p>
</section>
'''


# ──────────────────────────────────────────────────────── the four figures ──
# Billed → collected → the gym's share → yours. That order, always: it is the
# order the money actually moves, and it is the order that makes "yours" the
# last thing read rather than a number somebody has to work out.
def stats(active=None):
    """`active` presses one figure, which is what filters the ledger below it."""
    def one(key, val, det, mod='', k=None):
        on = (k == active)
        press = ' aria-pressed="true"' if on else ''
        cls = f'stat {mod}'.strip() + (' stat--on' if on else '')
        return (f'<button class="{cls}" type="button"{press}>'
                f'<p class="stat__k">{key}</p><p class="stat__v">{val}</p>'
                f'<p class="stat__d">{det}</p></button>')

    return ('<div class="stats stats--4">'
            + one('Billed · August', '₹1,24,500', '27 entries across 22 clients', k='billed')
            + one('Collected', '₹1,06,500', '86% in · <b>₹18,000</b> still owed', k='in')
            + one('The gym&rsquo;s share', '₹49,000', '46% of floor · 0% of remote',
                  'stat--warn', k='gym')
            + one('Yours', '₹57,500', 'Stored per session, as it happened',
                  'stat--acc', k='mine')
            + '</div>')


# ────────────────────────────────────────────────────────────── the ledger ──
def amt(value, d='in'):
    """One figure, with the arrow that says which way it went.

    A write-off takes the OUT arrow, not the in one: the money was owed and it
    never came. Struck through and grey says it is cancelled; an incoming arrow
    would say it arrived, which is the opposite of what the row means.
    """
    arrow = I_ARR_IN if d == 'in' else I_ARR_OUT
    return (f'<span class="dirn dirn--{d}">{ic(arrow, 13)}'
            f'<span>{"&minus;" if d == "out" else ""}{value}</span></span>')


def led(date, av, ini, name, how, value, tag, d='in', sel=False):
    a = ' aria-selected="true"' if sel else ''
    return (f'<tr{a}><td class="mono">{date}</td>'
            f'<td><span class="who"><span class="av av--sm" style="background:var(--tx-av-{av})">'
            f'{ini}</span><b>{name}</b></span></td>'
            f'<td>{how}</td><td class="num">{amt(value, d)}</td>'
            f'<td>{tag}</td>'
            f'<td style="text-align:right">{ic(I_DOTS, 16)}</td></tr>')


T_OK = '<span class="tag tag--ok">Received</span>'
T_OFF = '<span class="tag">Written off</span>'


def t_late(n):
    tone = 'danger' if n > 7 else 'warn'
    return f'<span class="tag tag--{tone}">{n} days late</span>'


LED_HEAD = ('<thead><tr><th aria-sort="descending">Date</th><th>Client</th>'
            '<th>How</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>')

# Six received, three owed, one written off — and the foot totals each of them
# separately. A single "₹66,600" under a column holding money received, money
# owed and money let go is a number that answers no question anybody has.
LED_FOOT = ('<tfoot><tr><td colspan="3">Showing 10 of 27 · August</td>'
            '<td class="num">₹47,000 in</td>'
            '<td colspan="2">₹18,000 owed · ₹1,600 off</td></tr></tfoot>')

RECEIVED = [
    ('12 Aug', '4', 'KR', 'Karthik R', 'Cash · floor', '₹4,500'),
    ('11 Aug', '7', 'DR', 'Divya R', 'UPI · ref 4471', '₹9,000'),
    ('09 Aug', '8', 'PN', 'Priya N', 'Gym counter', '₹8,500'),
    ('06 Aug', '3', 'MK', 'Meera K', 'UPI · ref 4468', '₹8,000'),
    ('04 Aug', '9', 'AS', 'Ananya S', 'UPI · ref 4462', '₹9,500'),
    ('02 Aug', '11', 'NP', 'Nikhil P', 'Cash · floor', '₹7,500'),
]
OWED = [
    ('01 Aug', '12', 'FQ', 'Farhan Q', 'Not yet paid', '₹6,000', 11),
    ('01 Aug', '10', 'SR', 'Sneha R', 'Not yet paid', '₹9,000', 6),
    ('01 Aug', '6', 'VT', 'Vikram T', 'Not yet paid', '₹3,000', 4),
]


def ledger_rows(flow='all'):
    out = []
    for r in RECEIVED:
        out.append(led(*r, T_OK, 'in'))
    if flow != 'in':
        for date, av, ini, nm, how, v, late in OWED:
            out.append(led(date, av, ini, nm, how, v, t_late(late), 'out'))
        out.append(led('28 Jul', '2', 'KM', 'Kavya M', 'Never arrived', '₹1,600',
                       T_OFF, 'off'))
    return ''.join(out)


LED_ACTS = ('<span class="card__acts">'
            f'<button class="btn btn--sm btn--secondary" type="button">{ic(I_DOWN, 14)}CSV</button>'
            f'<button class="btn btn--sm btn--secondary" type="button">{ic(I_DOC, 14)}Receipts</button>'
            f'<button class="btn btn--sm btn--primary" type="button">{ic(I_PLUS, 14)}'
            'Record payment</button></span>')


def ledger_card(flow='all'):
    """The book. Append-only, and the tag says so where somebody might doubt it."""
    filt = ''
    foot = LED_FOOT
    if flow == 'in':
        # A filter with no visible way out is a screen a trainer reads as broken.
        filt = ('<span class="chip" role="button">Money in'
                f'<span class="chip__x" role="button" aria-label="Clear filter">{ic(I_X, 11)}</span>'
                '</span>')
        foot = ('<tfoot><tr><td colspan="3">6 of 10 entries · money in only</td>'
                '<td class="num">₹47,000</td><td colspan="2"></td></tr></tfoot>')
    return (f'<div class="card"><div class="card__hd"><span class="card__t">Ledger · August</span>'
            f'<span class="tag">Append-only</span>{filt}{LED_ACTS}</div>'
            f'<div class="card__b card__b--flush"><table class="tbl">{LED_HEAD}'
            f'<tbody>{ledger_rows(flow)}</tbody>{foot}</table></div></div>')


# ──────────────────────────────────────────────────── the two side panels ──
SPLIT_CARD = '''<div class="card"><div class="card__hd"><span class="card__t">The split, by domain</span></div>
        <div class="card__b">
          <div class="kv"><span class="kv__k">Floor · 21 sessions</span><span class="kv__v">₹1,06,500</span></div>
          <div class="kv"><span class="kv__k">Gym takes 46%</span><span class="kv__v warn">−₹49,000</span></div>
          <div class="kv"><span class="kv__k">Remote · 6 sessions</span><span class="kv__v">₹18,000</span></div>
          <div class="kv"><span class="kv__k">Gym takes 0%</span><span class="kv__v">−₹0</span></div>
          <div class="kv" style="border-top:2px solid var(--tx-accent);margin-top:6px;padding-top:12px">
            <span class="kv__k" style="color:var(--tx-ink);font-weight:600">Yours</span>
            <span class="kv__v acc" style="font-size:17px">₹57,500</span></div>
          <div class="meter meter--lg mt3"><i style="width:54%"></i>
            <i class="warn" style="width:46%"></i></div>
          <div class="row mt2" style="justify-content:space-between">
            <span class="small">54% yours</span><span class="small">46% the gym&rsquo;s</span></div>
        </div></div>'''

GST_CARD = '''<div class="card"><div class="card__hd"><span class="card__t">GST turnover</span>
        <span class="tag tag--ok">Under</span></div>
        <div class="card__b">
          <p class="stat__v" style="font-size:24px">₹11,84,000</p>
          <p class="small mt2">Rolling twelve months of <b>your</b> share — the gym&rsquo;s cut is
            never your turnover. The ₹20 lakh registration line is
            <b>₹8,16,000</b> away at the current run rate, about seven months.</p>
          <div class="meter meter--lg mt3"><i class="ok" style="width:59%"></i>
            <i class="dim" style="width:41%"></i></div>
          <p class="small mt2">Not tax advice — the figure and the date, so your CA has both.</p>
        </div></div>'''

GRID = 'grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)'


# ══════════════════════════════════════════════════ §01 · THE MONTH ═══════
F = []

F.append(frame(
    '1a', 'Money · the ledger and the split', 'money · 1a 1b 4a 5a 5b 6b',
    '/money/2026-08',
    top('August 2026') + main(
        ph('August 2026 · billed, collected, split and owed', 'Ledger'),
        stats() + f'<div class="grid2 mt4" style="{GRID}">' + ledger_card()
        + f'<div class="col gap4">{SPLIT_CARD}{GST_CARD}</div></div>'),
    'Four figures in the order money moves, then the rows that produced them. '
    'Two things the first draft of this page dropped and this one restores: the '
    '<b>direction of every entry</b> — green with a down arrow for money in, red with an up '
    'arrow for money out, the OkCredit convention the phone file calls non-negotiable — and an '
    'honest footer. A single total under a column holding money received, money still owed and '
    'money written off is a number that answers no question anyone has, so the foot totals the '
    'three separately.'))

F.append(frame(
    '1b', 'Collected, pressed · the ledger filtered to money in', 'money · 1a',
    '/money/2026-08?flow=in',
    top('August 2026') + main(
        ph('August 2026 · money in', 'Ledger'),
        stats('in') + f'<div class="grid2 mt4" style="{GRID}">' + ledger_card('in')
        + f'<div class="col gap4">{SPLIT_CARD}{GST_CARD}</div></div>'),
    'The figures are the filters. Pressing <b>Collected</b> takes the book down to what came in — '
    'the pressed tile, a removable chip on the card header and a foot that counts what is showing '
    'against what is there. Three separate ways out, because a filter you cannot see is a screen '
    'a trainer reports as broken data.'))

EMPTY_BODY = f'''<div class="empty" style="margin-top:64px">
  <span class="empty__ic">{ic(I_WALLET, 24)}</span>
  <p class="empty__t">No money in the book yet</p>
  <p class="empty__b">X REP doesn&rsquo;t take payments. It keeps the book — cash, UPI into your
    own account, or money the gym collected for you.</p>
  <div class="row gap2" style="margin-top:22px">
    <button class="btn btn--primary btn--lg" type="button">{ic(I_PLUS)}Record a payment</button>
    <button class="btn btn--secondary btn--lg" type="button">{ic(I_WALLET)}Set up a package</button>
  </div>
  <div class="why" style="margin-top:30px;max-width:var(--w-measure);text-align:left">
    <p class="why__k">Where the money actually goes</p>
    <p>Your UPI ID goes on the reminder, so a client pays you directly.
      <b>The money never touches X REP</b> — which also means we never hold it, and there is
      nothing here to withdraw.</p></div>
</div>'''

F.append(frame(
    '1c', 'First run · nothing recorded yet', 'money · 1c',
    '/money',
    top('August 2026') + main(
        ph('Nothing recorded yet', 'Ledger', acts=EXPORT_BTN), EMPTY_BODY,
        keys='<div class="keys"><b><kbd>⌘K</kbd>command</b><b><kbd>R</kbd>record a payment</b></div>'),
    'The empty state states the constraint plainly, because the alternative is a support ticket. '
    '<b>X REP never holds your money</b> — saying it on the first screen a trainer sees is what '
    'prevents &ldquo;where is my payout&rdquo;, and it is the honest reason there is no payout '
    'screen anywhere in the product.'))


# ══════════════════════════════════════════ §02 · CHASING WHAT'S OWED ═════
def chase(av, ini, name, pack, late, amount, reminded, sev):
    return (f'<tr><td><span class="who">'
            f'<span class="av av--sm" style="background:var(--tx-av-{av})">{ini}</span>'
            f'<b>{name}</b></span></td>'
            f'<td>{pack}</td>'
            f'<td>{t_late(late)}</td>'
            f'<td>{reminded}</td>'
            f'<td class="num">{amt(amount, "out")}</td>'
            f'<td style="text-align:right">'
            f'<button class="btn btn--sm btn--secondary" type="button">{ic(I_SEND, 13)}Remind</button>'
            f'</td></tr>')


OWED_BODY = f'''<div class="stats stats--3">
    <div class="stat stat--danger"><p class="stat__k">Late</p><p class="stat__v">₹15,000</p>
      <p class="stat__d">2 clients, past the due date</p></div>
    <div class="stat stat--warn"><p class="stat__k">Due, not yet late</p><p class="stat__v">₹3,000</p>
      <p class="stat__d">1 client</p></div>
    <div class="stat"><p class="stat__k">Oldest</p><p class="stat__v">11d</p>
      <p class="stat__d">Farhan Q · reminded twice</p></div>
  </div>

  <div class="card mt4"><div class="card__hd"><span class="card__t">Still owed</span>
    <span class="tag tag--warn">Sorted by how late</span>
    <span class="card__acts">
      <button class="btn btn--sm btn--primary" type="button">{ic(I_SEND, 13)}Remind all 3</button>
    </span></div>
    <div class="card__b card__b--flush">
      <table class="tbl"><thead><tr><th>Client</th><th>For</th>
        <th aria-sort="descending">How late</th><th>Asked</th>
        <th class="num">Amount</th><th></th></tr></thead><tbody>
        {chase('12', 'FQ', 'Farhan Q', '16-session pack', 11, '₹6,000', 'Twice', 'danger')}
        {chase('10', 'SR', 'Sneha R', '24-session pack', 6, '₹9,000', 'Once', 'danger')}
        {chase('6', 'VT', 'Vikram T', 'Monthly · August', 4, '₹3,000', 'Not yet', 'warn')}
      </tbody>
      <tfoot><tr><td colspan="4">3 clients · every one of them reachable on WhatsApp</td>
        <td class="num">₹18,000</td><td></td></tr></tfoot></table>
    </div></div>

  <div class="why why--warn mt4" style="max-width:var(--w-measure)">
    <p class="why__k">Three chats, never one broadcast</p>
    <p>&ldquo;Remind all&rdquo; opens three <b>separate</b> conversations, one after the next, each
    carrying its own name, its own figure and your UPI link. Never a group message about money —
    the debt is small, the relationship is personal, and a broadcast costs clients. Sorted by how
    late rather than how much, because ₹3,000 eleven days old is a worse problem than ₹9,000 due
    tomorrow.</p></div>'''

F.append(frame(
    '2a', 'Owed · the chase list', 'money · 2a',
    '/money/2026-08/owed',
    top('Still owed') + main(ph('August 2026 · ₹18,000 across 3 clients', 'Owed'), OWED_BODY),
    'The highest-value job on the screen, and the one every competitor turns into an automated '
    'dunning email. <b>Asked</b> is a column because after the amount, whether you have already '
    'asked is the most useful fact there is — and it is the one that decides the tone of the next '
    'message.'))

REMIND_PANEL = f'''<div class="scrim scrim--soft"></div><aside class="panel" role="dialog" aria-label="Remind Farhan">
  <div class="panel__hd"><span class="panel__t">Remind Farhan</span>
    <span class="tag tag--acc">Chat 1 of 3</span><span class="sp"></span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Close">{ic(I_X, 18)}</button></div>
  <div class="panel__body">
    <div class="row gap2"><span class="av av--sm" style="background:var(--tx-av-12)">FQ</span>
      <span class="h5">Farhan Qureshi</span>{t_late(11)}</div>
    <p class="small mt2">₹6,000 for a 16-session pack · reminded twice</p>

    <div class="sect"><p class="h5">Tone</p>
      <div class="row gap2 mt2" style="flex-wrap:wrap">
        <span class="chip" role="button" aria-pressed="true">Polite</span>
        <span class="chip" role="button" aria-pressed="false">Firm</span>
        <span class="chip" role="button" aria-pressed="false">Write my own</span></div></div>

    <div class="fld mt3"><label class="fld__l" for="rm">The message</label>
      <textarea class="ctl" id="rm" rows="6" style="resize:vertical">Hi Farhan, hope training is going well. A small reminder — ₹6,000 for your 16-session pack is still pending. You can pay straight to anbu@okhdfcbank from any UPI app. Thanks!</textarea>
      <span class="fld__h">Editable. It goes out as you, from your number.</span></div>

    <div class="card card--acc mt3"><div class="card__b" style="padding:12px 14px">
      <div class="row gap2"><span style="color:var(--tx-accent-text)">{ic(I_RUPEE, 16)}</span>
        <span class="small" style="flex:1">The UPI link is attached, so a tap opens their
          payment app with ₹6,000 filled in.</span></div></div></div>

    <div class="why why--warn mt3"><p class="why__k">We cannot confirm it</p>
      <p>The money goes straight to your bank — X REP never sees it. You will still have to mark
      it received when it lands, and the amount is a suggestion any UPI app lets them change.</p></div>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Skip Farhan</button>
    <button class="btn btn--secondary" type="button">Show a QR instead</button>
    <button class="btn btn--primary" type="button">{ic(I_SEND, 14)}Open WhatsApp</button>
  </div>
</aside>'''

F.append(frame(
    '2b', 'Remind · one chat at a time', 'money · 2b 2c',
    '/money/2026-08/owed/remind?to=farhan-q',
    top('Still owed') + main(ph('August 2026 · ₹18,000 across 3 clients', 'Owed'), OWED_BODY,
                             after=REMIND_PANEL),
    '<b>Chat 1 of 3</b> in the header, and <b>Skip</b> in the footer. Without a position the walk '
    'is three identical panels arriving in a row and no way to tell a queue that is moving from '
    'one that is stuck; without a skip, one client with no phone number ends the run. The panel '
    'also says the hard thing out loud — X REP cannot confirm the payment, so the trainer will '
    'still have to mark it received.'))


# ═════════════════════════════════════════ §03 · RECORDING WHAT CAME IN ═══
LEDGER_SCREEN = (top('Record a payment')
                 + main(ph('August 2026', 'Ledger', acts=''),
                        stats() + f'<div class="grid2 mt4" style="{GRID}">' + ledger_card()
                        + f'<div class="col gap4">{SPLIT_CARD}{GST_CARD}</div></div>',
                        keys=''))


def record_panel(part=False):
    """3a full, 3b part. One panel, one branch — the remainder is the branch."""
    if part:
        amount, hint = '2,500', 'Part of ₹6,000 · they said the rest on Friday'
        split = ('<div class="kv" style="border:0;padding:4px 0"><span class="kv__k">This payment</span>'
                 '<span class="kv__v">₹2,500</span></div>'
                 '<div class="kv" style="border:0;padding:4px 0"><span class="kv__k">Gym&rsquo;s 46%</span>'
                 '<span class="kv__v warn">−₹1,150</span></div>'
                 '<div class="kv" style="border:0;padding:4px 0"><span class="kv__k">You keep</span>'
                 '<span class="kv__v acc">₹1,350</span></div>')
        rest = ('<div class="msg msg--warn" style="margin-top:12px">'
                f'{ic(I_ALERT, 16)}<span><b>₹3,500 will still be owed.</b> Farhan stays on the '
                'chase list and the pack does not close.</span></div>')
        modes = ('<span class="chip" role="button" aria-pressed="false">Full ₹6,000</span>'
                 '<span class="chip" role="button" aria-pressed="true">Part</span>')
    else:
        amount, hint = '6,000', 'August · a 16-session pack at ₹375'
        split = ('<div class="kv" style="border:0;padding:4px 0"><span class="kv__k">Billed</span>'
                 '<span class="kv__v">₹6,000</span></div>'
                 '<div class="kv" style="border:0;padding:4px 0"><span class="kv__k">Gym&rsquo;s 46%</span>'
                 '<span class="kv__v warn">−₹2,760</span></div>'
                 '<div class="kv" style="border:0;padding:4px 0"><span class="kv__k">You keep</span>'
                 '<span class="kv__v acc">₹3,240</span></div>')
        rest = ('<div class="msg msg--ok" style="margin-top:12px">'
                f'{ic(I_CHECK, 16)}<span>That settles it. Farhan comes off the chase list.</span></div>')
        modes = ('<span class="chip" role="button" aria-pressed="true">Full ₹6,000</span>'
                 '<span class="chip" role="button" aria-pressed="false">Part</span>')

    return f'''<div class="scrim scrim--soft"></div><aside class="panel" role="dialog" aria-label="Record a payment">
  <div class="panel__hd"><span class="panel__t">Record a payment</span><span class="sp"></span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Close">{ic(I_X, 18)}</button></div>
  <div class="panel__body">
    <div class="fld"><label class="fld__l">Client</label>
      <div class="row gap2" style="margin-top:6px"><span class="av av--sm" style="background:var(--tx-av-12)">FQ</span>
        <span class="h5">Farhan Qureshi</span>{t_late(11)}</div></div>

    <div class="row gap2 mt4" style="flex-wrap:wrap">{modes}</div>

    <div class="fld mt3"><label class="fld__l" for="pa">Amount</label>
      <span class="affix"><span class="affix__p">₹</span>
        <input class="ctl ctl--num" id="pa" value="{amount}"></span>
      <span class="fld__h">{hint}</span></div>
    {rest}

    <div class="sect"><p class="h5">How it came in</p>
      <div class="row gap2 mt2" style="flex-wrap:wrap">
        <span class="chip" role="button" aria-pressed="true">UPI to me</span>
        <span class="chip" role="button" aria-pressed="false">Cash</span>
        <span class="chip" role="button" aria-pressed="false">Gym front office</span></div>
      <div class="fld mt3"><label class="fld__l" for="pr">Reference (optional)</label>
        <input class="ctl mono" id="pr" placeholder="UPI ref, or a note"></div>
    </div>

    <div class="card card--acc mt4"><div class="card__b" style="padding:12px 14px">{split}</div></div>

    <div class="why why--warn" style="margin-top:14px"><p class="why__k">The money never touches us</p>
      <p>Recording a payment is bookkeeping, not a transaction. X REP holds no balance and moves
      no money — this row says what already happened between Farhan and you.</p></div>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--secondary" type="button">Save &amp; send receipt</button>
    <button class="btn btn--primary" type="button">Save</button>
  </div>
</aside>'''


F.append(frame(
    '3a', 'Record a payment · the panel', 'money · 3a 7a',
    '/money/2026-08/payment/new?client=farhan-q',
    LEDGER_SCREEN + record_panel(False),
    'The split is computed live and shown before saving — billed, the gym&rsquo;s cut, what the '
    'trainer keeps. <b>The panel says out loud that this is bookkeeping</b>, not a transaction: '
    'X REP holds no balance, so &ldquo;record&rdquo; is the honest verb and &ldquo;collect&rdquo; '
    'would not be. The scrim behind it is 26%, not 66% — a payment is decided while reading the '
    'ledger, so the ledger has to stay readable.'))

F.append(frame(
    '3b', 'Part payment · what will still be owed', 'money · 3b',
    '/money/2026-08/payment/new?client=farhan-q&part=1',
    LEDGER_SCREEN + record_panel(True),
    'The one thing this panel refuses to hide. <b>&ldquo;₹3,500 will still be owed&rdquo; is stated '
    'in amber above the button</b>, not discovered afterwards on the chase list — nobody should '
    'record ₹2,500 of a ₹6,000 debt and walk away thinking it is settled. Full and Part stay side '
    'by side in both states, so a mistyped part payment is one click from being a full one.'))

RECEIPT_PANEL = f'''<div class="scrim scrim--soft"></div><aside class="panel" role="dialog" aria-label="Receipt">
  <div class="panel__hd"><span class="panel__t">Receipt XR-2608-0114</span><span class="sp"></span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Close">{ic(I_X, 18)}</button></div>
  <div class="panel__body">
    <div class="row gap2" style="justify-content:center;margin-bottom:4px">
      <span style="width:44px;height:44px;border-radius:var(--tx-rfull);background:var(--tx-ok-fill);
        display:flex;align-items:center;justify-content:center;color:var(--tx-ink-inverse)">{ic(I_CHECK, 22)}</span></div>
    <p class="h4" style="text-align:center">₹6,000 recorded</p>

    <div class="card mt4"><div class="card__b">
      <div class="kv"><span class="kv__k">Client</span><span class="kv__v">Farhan Qureshi</span></div>
      <div class="kv"><span class="kv__k">For</span><span class="kv__v">16-session pack</span></div>
      <div class="kv"><span class="kv__k">Method</span><span class="kv__v">UPI · ref 4483</span></div>
      <div class="kv"><span class="kv__k">Date</span><span class="kv__v mono">12 Aug 2026, 6:42 PM</span></div>
      <div class="kv"><span class="kv__k">Receipt no.</span><span class="kv__v mono">XR-2608-0114</span></div>
      <div class="kv"><span class="kv__k">Gym&rsquo;s share</span><span class="kv__v warn">−₹2,760</span></div>
      <div class="kv" style="border-top:2px solid var(--tx-accent);margin-top:6px;padding-top:12px">
        <span class="kv__k" style="color:var(--tx-ink);font-weight:600">Received</span>
        <span class="kv__v acc" style="font-size:17px">₹6,000</span></div>
    </div></div>

    <div class="why" style="margin-top:14px"><p class="why__k">Not a tax invoice</p>
      <p>You are under the ₹20 lakh GST line, so a receipt is all that is required — and saying so
      is more useful than a fake invoice number that would be worth nothing if anyone looked at
      it. Receipt numbers are issued locally from this device&rsquo;s range, so cash taken in a
      basement still gets one.</p></div>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">{ic(I_UNDO, 14)}Undo</button>
    <span class="sp"></span>
    <button class="btn btn--secondary" type="button">{ic(I_DOC, 14)}PDF</button>
    <button class="btn btn--primary" type="button">{ic(I_SEND, 14)}Send on WhatsApp</button>
  </div>
</aside>'''

F.append(frame(
    '3c', 'The receipt · numbered, sendable, undoable for a day', 'money · 3c',
    '/money/2026-08/receipt/XR-2608-0114',
    LEDGER_SCREEN + RECEIPT_PANEL,
    '<b>Undo sits next to Send, not behind a menu</b> — the moment you notice you typed 9,000 '
    'instead of 900 is the moment this panel is open. It is a real delete and the book is '
    'append-only everywhere else, which is exactly why it is bounded: the button is here for '
    'twenty-four hours and then it is gone. Open this same receipt from a July row and the footer '
    'has PDF and Send, and no Undo.'))


# ══════════════════════════════════════════ §04 · ONE CLIENT'S BOOK ═══════
def balm(label, value, clear=False):
    c = ' balm--clear' if clear else ''
    return (f'<tr class="balm{c}"><td colspan="3"><span class="balm__k">{label}</span></td>'
            f'<td class="num"><span class="balm__v">{value}</span></td><td colspan="2"></td></tr>')


BOOK_BODY = f'''<div class="stats stats--3">
    <div class="stat stat--warn"><p class="stat__k">Farhan owes</p><p class="stat__v">₹6,000</p>
      <p class="stat__d">11 days late · reminded twice</p></div>
    <div class="stat"><p class="stat__k">Sessions left</p><p class="stat__v">9<span
      style="font-size:15px;color:var(--tx-ink-3)">/16</span></p>
      <p class="stat__d">16-session pack, bought 1 July</p></div>
    <div class="stat stat--acc"><p class="stat__k">Paid on time</p><p class="stat__v">4 of 5</p>
      <p class="stat__d">Context before judgement</p></div>
  </div>

  <div class="grid2 mt4" style="{GRID}">
    <div class="card"><div class="card__hd"><span class="card__t">Farhan&rsquo;s book</span>
      <span class="tag">Append-only</span>
      <span class="card__acts">
        <button class="btn btn--sm btn--secondary" type="button">{ic(I_SEND, 13)}Remind</button>
        <button class="btn btn--sm btn--primary" type="button">{ic(I_PLUS, 13)}Record payment</button>
      </span></div>
      <div class="card__b card__b--flush">
        <table class="tbl"><thead><tr><th aria-sort="descending">Date</th><th>What</th>
          <th>How</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>
          <tr><td class="mono">01 Aug</td><td>16-session pack</td><td>Billed</td>
            <td class="num">{amt('₹6,000', 'out')}</td><td>{t_late(11)}</td>
            <td style="text-align:right">{ic(I_DOTS, 16)}</td></tr>
          {balm('Balance', '₹6,000 due')}
          <tr><td class="mono">04 Jul</td><td>16-session pack</td><td>UPI · ref 4402</td>
            <td class="num">{amt('₹6,000')}</td><td>{T_OK}</td>
            <td style="text-align:right">{ic(I_DOTS, 16)}</td></tr>
          <tr><td class="mono">01 Jul</td><td>16-session pack</td><td>Billed</td>
            <td class="num">{amt('₹6,000', 'out')}</td><td><span class="tag tag--ok">Settled</span></td>
            <td style="text-align:right">{ic(I_DOTS, 16)}</td></tr>
          {balm('Everything clear', '₹0', clear=True)}
          <tr><td class="mono">02 Jun</td><td>Monthly · June</td><td>Cash · floor</td>
            <td class="num">{amt('₹5,500')}</td><td>{T_OK}</td>
            <td style="text-align:right">{ic(I_DOTS, 16)}</td></tr>
          <tr><td class="mono">01 Jun</td><td>Monthly · June</td><td>Billed</td>
            <td class="num">{amt('₹5,500', 'out')}</td><td><span class="tag tag--ok">Settled</span></td>
            <td style="text-align:right">{ic(I_DOTS, 16)}</td></tr>
        </tbody></table>
      </div></div>

    <div class="col gap4">
      <div class="card"><div class="card__hd"><span class="card__t">Farhan Qureshi</span></div>
        <div class="card__b">
          <div class="kv"><span class="kv__k">On the book since</span><span class="kv__v">2 Jun 2026</span></div>
          <div class="kv"><span class="kv__k">Trains</span><span class="kv__v">Floor · Adyar</span></div>
          <div class="kv"><span class="kv__k">Billed to date</span><span class="kv__v">₹17,500</span></div>
          <div class="kv"><span class="kv__k">Paid to date</span><span class="kv__v">₹11,500</span></div>
          <div class="kv"><span class="kv__k">Written off</span><span class="kv__v">₹0</span></div>
        </div></div>
      <div class="card"><div class="card__hd"><span class="card__t">If it never arrives</span></div>
        <div class="card__b">
          <p class="small">Some money does not come. Writing it off keeps the row, keeps the nine
            sessions Farhan already has, and puts ₹6,000 into the year&rsquo;s written-off total —
            so next March the figure is the truth.</p>
          <button class="btn btn--secondary btn--sm mt3" type="button">Write it off instead</button>
        </div></div>
    </div>
  </div>'''

F.append(frame(
    '4a', 'One client&rsquo;s book · the screen that settles an argument', 'money · 4a',
    '/money/clients/farhan-q',
    top('Farhan Qureshi') + main(ph('Farhan Qureshi · ₹6,000 owed', 'Ledger', acts=''), BOOK_BODY),
    'This is the screen a trainer turns the laptop around to show somebody, which is why the '
    '<b>balance markers</b> matter: you can point at the exact moment the account came back to '
    'zero. They are dividers, never rows — not clickable, no menu, no hover. The last figure is '
    'the one that counts: <b>paid 4 of 5 on time</b>. Context before judgement.'))


# ═══════════════════════════════════ §05 · PACKAGES AND THE GYM ═══════════
def pack_row(name, price, per, sold, on, tag=''):
    return (f'<tr><td><b>{name}</b>{tag}</td><td class="num mono">{price}</td>'
            f'<td class="mono">{per}</td><td class="num mono">{sold}</td>'
            f'<td class="num mono">{on}</td>'
            f'<td style="text-align:right">{ic(I_DOTS, 16)}</td></tr>')


PACKS_BODY = f'''<div class="card"><div class="card__hd"><span class="card__t">What you sell</span>
    <span class="card__acts">
      <button class="btn btn--sm btn--primary" type="button">{ic(I_PLUS, 13)}New package</button>
    </span></div>
    <div class="card__b card__b--flush">
      <table class="tbl"><thead><tr><th>Package</th><th class="num">Price</th>
        <th>Per session</th><th class="num">Sold, 12 mo</th><th class="num">On it now</th>
        <th></th></tr></thead><tbody>
        {pack_row('16-session pack', '₹6,000', '₹375', '31', '9',
                  ' <span class="tag tag--acc">Most sold</span>')}
        {pack_row('24-session pack', '₹9,000', '₹375', '18', '6')}
        {pack_row('12-session pack', '₹5,000', '₹417', '11', '4')}
        {pack_row('Monthly · unlimited floor', '₹5,500', '—', '9', '3')}
        {pack_row('Remote · monthly', '₹3,000', '—', '7', '2')}
      </tbody></table></div></div>

  <div class="card mt4"><div class="card__hd">
    <span class="card__t">Anytime Fitness, Adyar sells</span>
    <span class="tag tag--warn">Their price list, not yours</span></div>
    <div class="card__b card__b--flush">
      <table class="tbl"><thead><tr><th>Package</th><th class="num">Counter price</th>
        <th>They keep</th><th class="num">You get</th><th class="num">On it now</th>
        <th></th></tr></thead><tbody>
        <tr><td><b>PT · 12 sessions</b></td><td class="num mono">₹9,000</td>
          <td class="mono">46%</td><td class="num mono">₹4,860</td><td class="num mono">3</td>
          <td style="text-align:right">{ic(I_DOTS, 16)}</td></tr>
        <tr><td><b>PT · 24 sessions</b></td><td class="num mono">₹16,000</td>
          <td class="mono">46%</td><td class="num mono">₹8,640</td><td class="num mono">1</td>
          <td style="text-align:right">{ic(I_DOTS, 16)}</td></tr>
      </tbody></table></div></div>

  <div class="why mt4" style="max-width:var(--w-measure)">
    <p class="why__k">A sold package never changes</p>
    <p>Editing a package changes what is offered next, never what somebody already bought. The
    percentage is applied at the moment a payment is recorded and stored <b>on that entry</b> —
    so if the gym renegotiates in October, September&rsquo;s split does not move.</p></div>'''

F.append(frame(
    '5a', 'Packages · the price list both sides sell from', 'money · 4b',
    '/money/2026-08/packages',
    top('Packages') + main(ph('Your price list, and the gym&rsquo;s', 'Packages'), PACKS_BODY),
    'Two price lists, drawn apart, because they are not the same thing. Yours is what you charge; '
    'the gym&rsquo;s is what their counter charges and what reaches you after their cut. '
    '<b>Per session</b> is a computed column and the reason it exists: ₹5,000 for twelve looks '
    'cheaper than ₹6,000 for sixteen until the arithmetic is on the screen.'))

GYM_BODY = f'''<div class="stats stats--4">
    <div class="stat"><p class="stat__k">Billed on the floor</p><p class="stat__v">₹1,06,500</p>
      <p class="stat__d">21 sessions</p></div>
    <div class="stat stat--warn"><p class="stat__k">The gym&rsquo;s 46%</p><p class="stat__v">₹49,000</p>
      <p class="stat__d">Applied per entry, at record time</p></div>
    <div class="stat"><p class="stat__k">Remote</p><p class="stat__v">₹18,000</p>
      <p class="stat__d">6 sessions · they take nothing</p></div>
    <div class="stat stat--acc"><p class="stat__k">Yours, August</p><p class="stat__v">₹57,500</p>
      <p class="stat__d">54% of what you billed</p></div>
  </div>

  <div class="grid2 mt4" style="{GRID}">
    <div class="card"><div class="card__hd"><span class="card__t">Where the 46% went</span>
      <span class="tag">Per entry</span></div>
      <div class="card__b card__b--flush">
        <table class="tbl"><thead><tr><th class="mono">Date</th><th>Client</th><th>Where</th>
          <th class="num">Billed</th><th class="num">Their cut</th><th class="num">Yours</th>
          </tr></thead><tbody>
          <tr><td class="mono">12 Aug</td><td><span class="who"><span class="av av--sm"
            style="background:var(--tx-av-4)">KR</span><b>Karthik R</b></span></td>
            <td><span class="tag tag--floor">Floor</span></td><td class="num mono">₹4,500</td>
            <td class="num">{amt('₹2,070', 'out')}</td><td class="num mono">₹2,430</td></tr>
          <tr><td class="mono">11 Aug</td><td><span class="who"><span class="av av--sm"
            style="background:var(--tx-av-7)">DR</span><b>Divya R</b></span></td>
            <td><span class="tag tag--remote">Remote</span></td><td class="num mono">₹9,000</td>
            <td class="num mono" style="color:var(--tx-ink-3)">₹0</td><td class="num mono">₹9,000</td></tr>
          <tr><td class="mono">09 Aug</td><td><span class="who"><span class="av av--sm"
            style="background:var(--tx-av-8)">PN</span><b>Priya N</b></span></td>
            <td><span class="tag tag--floor">Floor</span></td><td class="num mono">₹8,500</td>
            <td class="num">{amt('₹3,910', 'out')}</td><td class="num mono">₹4,590</td></tr>
          <tr><td class="mono">06 Aug</td><td><span class="who"><span class="av av--sm"
            style="background:var(--tx-av-3)">MK</span><b>Meera K</b></span></td>
            <td><span class="tag tag--floor">Floor</span></td><td class="num mono">₹8,000</td>
            <td class="num">{amt('₹3,680', 'out')}</td><td class="num mono">₹4,320</td></tr>
        </tbody>
        <tfoot><tr><td colspan="3">21 floor · 6 remote</td><td class="num">₹1,24,500</td>
          <td class="num">₹49,000</td><td class="num">₹57,500</td></tr></tfoot></table>
      </div></div>

    <div class="col gap4">
      <div class="card"><div class="card__hd"><span class="card__t">The arrangement</span>
        <span class="card__acts"><button class="btn btn--sm btn--secondary" type="button">
          {ic(I_EDIT, 13)}Edit</button></span></div>
        <div class="card__b">
          <div class="kv"><span class="kv__k">Gym</span><span class="kv__v">Anytime Fitness, Adyar</span></div>
          <div class="kv"><span class="kv__k">They keep, floor</span><span class="kv__v warn">46%</span></div>
          <div class="kv"><span class="kv__k">They keep, remote</span><span class="kv__v">0%</span></div>
          <div class="kv"><span class="kv__k">Since</span><span class="kv__v">1 Apr 2026</span></div>
          <div class="meter meter--lg mt3"><i style="width:54%"></i><i class="warn" style="width:46%"></i></div>
          <div class="row mt2" style="justify-content:space-between">
            <span class="small">54% yours</span><span class="small">46% theirs</span></div>
        </div></div>
      <div class="why why--warn"><p class="why__k">Remote is always yours in full</p>
        <p>Which is the whole reason to push it. Six remote sessions in August were worth
        ₹18,000 to you; the same ₹18,000 billed on their floor would have been ₹9,720.</p></div>
    </div>
  </div>'''

F.append(frame(
    '5b', 'Gym share · whose money it actually is', 'money · 5a',
    '/money/2026-08/gym-share',
    top('Gym share') + main(ph('Anytime Fitness, Adyar · 46% of floor', 'Gym share'), GYM_BODY),
    'The line no Western coaching app has, because none of them model a gym taking half. '
    '<b>The percentage is stored on each entry, not looked up</b> — the table is a record of what '
    'was agreed at the time, which is what makes it survive a renegotiation. The remote rows are '
    'the argument: same money, none of it shared.'))


# ═════════════════════════════════ §06 · WHEN IT NEVER ARRIVES ════════════
WOFF_BODY = f'''<div class="stats stats--3">
    <div class="stat"><p class="stat__k">Written off · this year</p><p class="stat__v">₹1,600</p>
      <p class="stat__d">1 entry, since April</p></div>
    <div class="stat"><p class="stat__k">As a share of billed</p><p class="stat__v">0.13%</p>
      <p class="stat__d">₹1,600 of ₹12,40,000</p></div>
    <div class="stat"><p class="stat__k">Still chaseable</p><p class="stat__v">₹18,000</p>
      <p class="stat__d">3 clients · none written off yet</p></div>
  </div>

  <div class="card mt4"><div class="card__hd"><span class="card__t">Written off · 2026&ndash;27</span>
    <span class="tag">Struck through, never removed</span></div>
    <div class="card__b card__b--flush">
      <table class="tbl"><thead><tr><th class="mono">Date</th><th>Client</th><th>What</th>
        <th class="num">Amount</th><th>What happened</th><th></th></tr></thead><tbody>
        <tr><td class="mono">28 Jul</td><td><span class="who"><span class="av av--sm"
          style="background:var(--tx-av-2)">KM</span><b>Kavya M</b></span></td>
          <td>12-session pack · balance</td>
          <td class="num">{amt('₹1,600', 'off')}</td>
          <td>Left the city. Kept her 4 sessions.</td>
          <td style="text-align:right">{ic(I_DOTS, 16)}</td></tr>
      </tbody></table></div></div>

  <div class="why mt4" style="max-width:var(--w-measure)">
    <p class="why__k">Write off, do not delete</p>
    <p>Every ledger app lets you delete the row, which hides the money and quietly rewrites the
    client&rsquo;s package. A write-off does neither: the debt leaves <b>still owed</b>, the row
    stays in the client&rsquo;s book struck through, the sessions they already had stay theirs,
    and the amount lands in the year&rsquo;s written-off total — so next March the number is the
    truth rather than a flattering gap.</p></div>'''

F.append(frame(
    '6a', 'Write-offs · the money that never came', 'money · 6b',
    '/money/2026-08/write-offs',
    top('Write-offs') + main(ph('2026&ndash;27 · ₹1,600 let go', 'Write-offs'), WOFF_BODY),
    'A tab, not a footnote. <b>0.13% of billed</b> is the figure that makes this screen worth '
    'having: it is the number that tells a trainer whether they have a collection problem or one '
    'unlucky month, and it is the number a deletion-based ledger can never show.'))

WOFF_PANEL = f'''<div class="scrim scrim--soft"></div><aside class="panel" role="dialog" aria-label="Write it off">
  <div class="panel__hd"><span class="panel__t">Farhan&rsquo;s ₹6,000</span><span class="sp"></span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Close">{ic(I_X, 18)}</button></div>
  <div class="panel__body">
    <p class="small">11 days late · reminded twice · 9 sessions still on the pack</p>

    <div class="col gap2 mt4">
      <label class="card" style="padding:12px 14px;cursor:pointer;display:block">
        <span class="row gap2" style="align-items:flex-start">
          <span class="rad rad--on" aria-hidden="true"></span>
          <span style="flex:1"><b>Keep chasing</b>
            <span class="small" style="display:block;margin-top:3px">Stays in still owed. He keeps
            his 9 remaining sessions either way.</span></span></span></label>

      <label class="card" style="padding:12px 14px;cursor:pointer;display:block">
        <span class="row gap2" style="align-items:flex-start">
          <span class="rad" aria-hidden="true"></span>
          <span style="flex:1"><b>Write it off</b>
            <span class="small" style="display:block;margin-top:3px">Leaves still owed and goes
            into written off. The row stays in his book, and the year&rsquo;s written-off total
            becomes <b>₹7,600</b>.</span></span></span></label>

      <label class="card" style="padding:12px 14px;cursor:pointer;display:block">
        <span class="row gap2" style="align-items:flex-start">
          <span class="rad" aria-hidden="true"></span>
          <span style="flex:1"><b>Change the amount</b>
            <span class="small" style="display:block;margin-top:3px">He agreed a smaller figure.
            The pack shortens to match.</span></span></span></label>
    </div>

    <div class="why mt4"><p class="why__k">Why this is not a delete</p>
      <p>Deleting hides the money and rewrites the pack. This keeps the history, so in March the
      year&rsquo;s figure is what actually happened.</p></div>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--primary" type="button">Save</button>
  </div>
</aside>'''

F.append(frame(
    '6b', 'Write it off · three options, each with its consequence', 'money · 6b',
    '/money/clients/farhan-q/write-off',
    top('Farhan Qureshi') + main(ph('Farhan Qureshi · ₹6,000 owed', 'Ledger', acts=''),
                                 BOOK_BODY, keys='') + WOFF_PANEL,
    'Each option states what it does to <b>his pack</b> and to <b>your year</b>, with the real '
    'figures substituted in — &ldquo;the year&rsquo;s written-off total becomes ₹7,600&rdquo;, not '
    '&ldquo;this cannot be undone&rdquo;. That second sentence is what makes the decision honest '
    'rather than a shrug.'))

DELETE_MODAL = f'''<div class="scrim scrim--top"></div><div class="modal" role="alertdialog" aria-label="Delete this entry">
  <div class="modal__hd"><p class="modal__t">Delete this entry?</p></div>
  <div class="modal__body">
    <p>It comes out of the book, and Divya&rsquo;s pack goes back to what it was before —
      <b>from 9 sessions left to 3</b>. The receipt number is not reissued.</p>
    <div class="card mt3"><div class="card__b" style="padding:10px 12px">
      <div class="row gap2"><span class="av av--sm" style="background:var(--tx-av-7)">DR</span>
        <span style="flex:1"><b>Divya R</b>
          <span class="small" style="display:block">11 Aug · UPI · ref 4471</span></span>
        <span class="num">{amt('₹9,000')}</span></div></div></div>
    <div class="why why--danger mt3"><p class="why__k">The book is append-only</p>
      <p>This is the one gesture in Money that removes a row rather than adding one. Everything
      else — a correction, a refund, money that never came — is a new entry. If this payment
      simply never arrived, <b>write it off</b> instead and the history survives.</p></div>
  </div>
  <div class="modal__foot">
    <button class="btn btn--ghost" type="button">Keep it</button>
    <button class="btn btn--secondary" type="button">Write it off instead</button>
    <button class="btn btn--danger" type="button">{ic(I_TRASH, 14)}Delete</button>
  </div>
</div>'''

F.append(frame(
    '6c', 'Delete asks, always', 'money · 6b · tap map',
    '/money/2026-08?delete=XR-2608-0109',
    (top('August 2026')
     + main(ph('August 2026 · billed, collected, split and owed', 'Ledger'),
            stats() + f'<div class="grid2 mt4" style="{GRID}">' + ledger_card()
            + f'<div class="col gap4">{SPLIT_CARD}{GST_CARD}</div></div>', keys='')
     + DELETE_MODAL),
    'The screen&rsquo;s own rule, and the only place it interrupts: <b>delete always asks</b>. '
    'The dialog does the two things an &ldquo;Are you sure?&rdquo; never does — it <b>counts what '
    'changes</b> (nine sessions back to three) and it <b>offers the better verb</b>, because most '
    'people reaching for Delete want Write it off. A 66% scrim here, not the panel&rsquo;s 26%: a '
    'modal&rsquo;s background must be unusable.'))


# ═══════════════════════════════════ §07 · THE YEAR, AND THE CA ═══════════
def bar(x, h_in, h_out, label, cur=False):
    """One month of the financial year. April to March — the CA works to that."""
    out = ''
    if h_out:
        out = (f'<i class="chart__b chart__b--bad" style="left:{x}px;bottom:22px;'
               f'height:{h_out}px"></i>')
        base = 22 + h_out
    else:
        base = 22
    ins = f'<i class="chart__b" style="left:{x}px;bottom:{base}px;height:{h_in}px"></i>'
    w = 'font-weight:700;color:var(--tx-accent-text)' if cur else ''
    lab = f'<i class="chart__x" style="left:{x}px;width:26px;text-align:center;{w}">{label}</i>'
    return out + ins + lab


YEAR = [(0, 62, 4, 'A'), (1, 54, 6, 'M'), (2, 66, 4, 'J'), (3, 74, 0, 'J'),
        (4, 58, 11, 'A', True), (5, 0, 0, 'S'), (6, 0, 0, 'O'), (7, 0, 0, 'N'),
        (8, 0, 0, 'D'), (9, 0, 0, 'J'), (10, 0, 0, 'F'), (11, 0, 0, 'M')]

CHART = ('<div class="chart" style="height:150px">'
         + '<i class="chart__g" style="bottom:22px"></i>'
         + '<i class="chart__g" style="bottom:70px"></i>'
         + '<i class="chart__g" style="bottom:118px"></i>'
         + ''.join(
             bar(16 + i * 40, hi if hi else 2, ho, lb, len(rest) > 0)
             for i, hi, ho, lb, *rest in YEAR)
         + '</div>')

GST_BODY = f'''<div class="stats stats--4">
    <div class="stat stat--acc"><p class="stat__k">Your turnover · rolling 12mo</p>
      <p class="stat__v">₹11,84,000</p><p class="stat__d">Your share only, never the gym&rsquo;s</p></div>
    <div class="stat"><p class="stat__k">The registration line</p><p class="stat__v">₹20,00,000</p>
      <p class="stat__d">Services, all-India</p></div>
    <div class="stat"><p class="stat__k">Headroom</p><p class="stat__v">₹8,16,000</p>
      <p class="stat__d">About 7 months at this rate</p></div>
    <div class="stat"><p class="stat__k">Best month</p><p class="stat__v">₹1,18,000</p>
      <p class="stat__d">July 2026</p></div>
  </div>

  <div class="grid2 mt4" style="{GRID}">
    <div class="card"><div class="card__hd"><span class="card__t">2026&ndash;27 · your share, by month</span>
      <span class="tag">April to March</span></div>
      <div class="card__b">{CHART}
        <div class="row gap4 mt3">
          <span class="row gap2"><i style="width:9px;height:9px;border-radius:2px;
            background:var(--tx-accent);display:inline-block"></i><span class="small">Collected</span></span>
          <span class="row gap2"><i style="width:9px;height:9px;border-radius:2px;
            background:var(--tx-danger);display:inline-block"></i><span class="small">Still owed</span></span>
        </div>
        <p class="small mt3">The Indian financial year, because the GST line is annual and your CA
          works to that calendar. A month with nothing in it keeps its baseline, so the axis still
          reads as twelve months rather than five.</p>
      </div></div>

    <div class="col gap4">
      <div class="card"><div class="card__hd"><span class="card__t">Distance to the line</span>
        <span class="tag tag--ok">Under</span></div>
        <div class="card__b">
          <div class="meter meter--lg"><i class="ok" style="width:59%"></i>
            <i class="dim" style="width:41%"></i></div>
          <div class="row mt2" style="justify-content:space-between">
            <span class="small">Apr 2026</span><span class="small">₹20L</span></div>
          <p class="small mt3">You are at <b>59%</b> of the line. At the current run rate you reach
            it around <b>March 2027</b>. We will say so a month before, not after — late
            registration carries a penalty, and a warning after the fact is just bad news.</p>
        </div></div>

      <div class="why why--warn"><p class="why__k">The gym&rsquo;s cut is not your turnover</p>
        <p>₹49,000 went over their counter in August and never became yours. Counting it would put
        this figure at ₹17,2 lakh and send a trainer to register a year early. This is the single
        most expensive misunderstanding in the product, which is why the interface states it
        rather than assuming it.</p></div>

      <div class="why"><p class="why__k">Not tax advice</p>
        <p>The figure and the date, so your CA has both.</p></div>
    </div>
  </div>'''

F.append(frame(
    '7a', 'GST · the ₹20 lakh line, and how far away it is', 'money · 5b',
    '/money/gst',
    top('GST') + main(ph('2026&ndash;27 · ₹11,84,000 of your own', 'GST', acts=EXPORT_BTN),
                      GST_BODY),
    'The card that earns the web app its keep at month end. Nobody in the category warns about '
    'this because nobody in the category is built for India. Two decisions carry it: the figure is '
    '<b>the trainer&rsquo;s share only</b>, and the useful form of &ldquo;₹11.84 lakh&rdquo; is '
    '<b>&ldquo;seven months away&rdquo;</b> — a number you can act on rather than one you have to '
    'divide.'))

def tick(label, on=True):
    """`.check` reads its state from aria-checked, and knocks the tick out of
    the lime fill — a bare span with a data attribute renders as an empty box."""
    state = 'true' if on else 'false'
    return (f'<label class="row gap2"><span class="check" role="checkbox" '
            f'aria-checked="{state}">{ic(I_CHECK, 12)}</span><span>{label}</span></label>')


EXPORT_PANEL = f'''<div class="scrim scrim--soft"></div><aside class="panel" role="dialog" aria-label="Export for my CA">
  <div class="panel__hd"><span class="panel__t">Export for my CA</span><span class="sp"></span>
    <button class="btn btn--icon btn--ghost" type="button" aria-label="Close">{ic(I_X, 18)}</button></div>
  <div class="panel__body">
    <div class="sect" style="margin-top:0"><p class="h5">How much</p>
      <div class="row gap2 mt2" style="flex-wrap:wrap">
        <span class="chip" role="button" aria-pressed="false">August</span>
        <span class="chip" role="button" aria-pressed="true">2026&ndash;27</span>
        <span class="chip" role="button" aria-pressed="false">Everything</span></div></div>

    <div class="sect"><p class="h5">What goes in it</p>
      <div class="col gap2 mt2">
        {tick('Date, client, amount, method, receipt number')}
        {tick('The gym&rsquo;s share, per entry')}
        {tick('Write-offs, marked as write-offs')}
        {tick('Client phone numbers', False)}
      </div>
      <p class="small mt2">Phone numbers are off by default. A CA needs the money, not the roster.</p>
    </div>

    <div class="card mt4"><div class="card__b">
      <div class="kv"><span class="kv__k">Period</span><span class="kv__v">Apr 2026 – Mar 2027</span></div>
      <div class="kv"><span class="kv__k">Entries</span><span class="kv__v mono">184</span></div>
      <div class="kv"><span class="kv__k">Billed</span><span class="kv__v">₹12,40,000</span></div>
      <div class="kv"><span class="kv__k">Collected</span><span class="kv__v">₹11,96,000</span></div>
      <div class="kv"><span class="kv__k">Written off</span><span class="kv__v">₹1,600</span></div>
      <div class="kv"><span class="kv__k">Gym share paid</span><span class="kv__v warn">−₹5,49,000</span></div>
      <div class="kv" style="border-top:2px solid var(--tx-accent);margin-top:6px;padding-top:12px">
        <span class="kv__k" style="color:var(--tx-ink);font-weight:600">Yours</span>
        <span class="kv__v acc" style="font-size:17px">₹11,84,000</span></div>
    </div></div>
    <p class="small mt2"><b>Yours</b> is the only figure on this summary that is really yours, and
      it is the one a CA will ask for first.</p>
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost" type="button">Cancel</button>
    <button class="btn btn--secondary" type="button">{ic(I_DOC, 14)}Receipt book · PDF</button>
    <button class="btn btn--primary" type="button">{ic(I_DOWN, 14)}Download CSV</button>
  </div>
</aside>'''

F.append(frame(
    '7b', 'Export · the summary before anything leaves', 'money · 6c',
    '/money/export?scope=fy',
    (top('GST') + main(ph('2026&ndash;27 · ₹11,84,000 of your own', 'GST', acts=EXPORT_BTN),
                       GST_BODY, keys='') + EXPORT_PANEL),
    'The summary is shown <b>before</b> anything leaves the machine, so a trainer knows what they '
    'are sending. Phone numbers are unticked by default — an accountant needs the money, not the '
    'roster, and a default that over-shares is a default that gets discovered later. On the phone '
    'this is a share sheet; here it is a named file for a named person.'))


# ══════════════════════════════════════════ §08 · WHEN THE LINE DROPS ═════
QUEUED_TAG = '<span class="tag tag--warn">Queued</span>'

OFFLINE_BANNER = f'''<div class="why why--warn" style="margin:0 0 16px;display:flex;gap:12px;align-items:flex-start">
    <span style="color:var(--tx-warn);flex:0 0 auto;margin-top:1px">{ic(I_CLOUD_OFF, 18)}</span>
    <span style="flex:1"><span class="why__k" style="display:block">Offline — the book is on this
      machine</span>
      <span>Recording still works. <b>6 changes are waiting to sync</b>, and every one of them is
      already in the figures below. Nothing is lost by closing this tab.</span></span>
    <button class="btn btn--sm btn--secondary" type="button">Open the sync queue</button>
  </div>'''


def offline_ledger():
    rows = (led('12 Aug', '4', 'KR', 'Karthik R', 'Cash · floor', '₹4,500', QUEUED_TAG, 'in')
            + led('12 Aug', '9', 'AS', 'Ananya S', 'UPI · ref 4484', '₹9,500', QUEUED_TAG, 'in')
            + ''.join(led(*r, T_OK, 'in') for r in RECEIVED[1:5])
            + ''.join(led(d, a, i, n, h, v, t_late(l), 'out') for d, a, i, n, h, v, l in OWED))
    return (f'<div class="card"><div class="card__hd"><span class="card__t">Ledger · August</span>'
            f'<span class="tag tag--warn">2 not yet synced</span>{LED_ACTS}</div>'
            f'<div class="card__b card__b--flush"><table class="tbl">{LED_HEAD}'
            f'<tbody>{rows}</tbody>'
            '<tfoot><tr><td colspan="3">Showing 9 of 27 · August</td>'
            '<td class="num">₹45,000 in</td>'
            '<td colspan="2">₹18,000 owed</td></tr></tfoot></table></div></div>')


OFFLINE_BODY = (OFFLINE_BANNER + stats()
                + f'<div class="grid2 mt4" style="{GRID}">' + offline_ledger()
                + f'<div class="col gap4">{SPLIT_CARD}{GST_CARD}</div></div>')

F.append(frame(
    '8a', 'Offline · the book is on this machine', 'money · 6a',
    '/money/2026-08',
    (top('August 2026',
         sync=f'<span class="sync sync--offline">{ic(I_CLOUD_OFF, 13)}Offline · 6 queued</span>')
     + main(ph('August 2026 · billed, collected, split and owed', 'Ledger'), OFFLINE_BODY)),
    'Offline-first is the architecture, not a failure state, so this frame is not an error screen. '
    'The banner says what still works before it says what is waiting; the queued rows carry a tag '
    'and are <b>counted in the totals above them</b>, because a figure that excludes what you just '
    'typed is a figure a trainer will not trust again. The one honest omission: the two queued '
    'entries have no receipt number yet — those come from this device&rsquo;s own range and are '
    'minted on save, not on sync.'))


# ════════════════════════════════════════════════════════ the page ═══════
NAV = ('<nav class="doc__nav" aria-label="Design files">'
       '<a href="webapp-information-architecture.html">IA</a>'
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
       '<a href="webapp-workout.html">WORKOUT</a>'
       '<a href="webapp-money.html" aria-current="page">MONEY</a>'
       '<a href="webapp-reports.html">REPORTS</a>'
       '<a href="webapp-settings.html">SETTINGS</a>'
       '<a href="webapp-client-portal.html">PORTAL</a></nav>')


def sec(n, title, note=''):
    p = f'<p class="note">{note}</p>' if note else ''
    return f'<h2 class="sec"><span class="n">{n}</span>{title}</h2>{p}'


HTML = f'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>X REP · Web app — Money</title>
<meta name="description" content="The month, the ledger, who owes, packages, the gym share, GST and export. X REP web application.">
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
  {NAV}
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

<h1>Money — the month, in the order money actually moves</h1>
<p class="doc__lede">Billed &rarr; collected &rarr; the gym&rsquo;s share &rarr; yours. Four figures
in one row, then the ledger that produced them. The app shows this as a scroll; a desk shows the
<b>arithmetic and its evidence at the same time</b>, which is the whole point of doing month-end at
a table. Every one of the six tabs is drawn — the version this replaces declared six and drew
one.</p>
<div class="doc__meta"><span><b>Frames</b> <span data-frame-count>17</span></span>
  <span><b>From</b> money · 1a 1b 1c 2a 2b 2c 3a 3b 3c 4a 4b 5a 5b 6a 6b 6c</span>
  <span><b>Patterns</b> stat row as filter · append-only ledger · right panel · modal for the one
    destructive verb · derived totals</span></div>
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


{sec('01', 'The month',
     'Six tabs carry what the app spreads over sixteen frames: the ledger, who owes, packages, '
     'the gym share, GST turnover and write-offs. <b>A write-off is struck through, not '
     'removed</b> — the app is append-only and the web app must not quietly become editable. The '
     'four figures at the top are not a read-out; each one filters the book underneath it.')}
<div class="units">{F[0]}{F[1]}{F[2]}</div>

{sec('02', 'Chasing what&rsquo;s owed',
     'The highest-value job on the screen, and the one every competitor turns into an automated '
     'dunning email. In India the channel is WhatsApp, the instrument is a UPI link, and the '
     'message has to come from the trainer — because the relationship is personal and the debt is '
     'small.')}
<div class="units">{F[3]}{F[4]}</div>

{sec('03', 'Recording what came in',
     'Three ways money arrives and one of them takes a cut. The split is computed before saving, '
     'not after, and the remainder on a part payment is stated in amber above the button.')}
<div class="units">{F[5]}{F[6]}{F[7]}</div>

{sec('04', 'One client&rsquo;s book',
     'A running balance in reverse-chronological order, with the package that created each debt '
     'and the payment that cleared it — and a marker wherever the account came back to zero.')}
<div class="units">{F[8]}</div>

{sec('05', 'Packages, and whose money it is',
     'Two price lists and one arrangement. The percentage is applied at record time and stored on '
     'the entry, so a renegotiation in October never moves September.')}
<div class="units">{F[9]}{F[10]}</div>

{sec('06', 'When it never arrives',
     'Write off, don&rsquo;t delete — and on the one occasion a row really does come out, ask '
     'first and offer the better verb.')}
<div class="units">{F[11]}{F[12]}{F[13]}</div>

{sec('07', 'The year, and the person who reads it',
     'The GST line is annual, the financial year runs April to March, and the person receiving '
     'the export is an accountant rather than a phone.')}
<div class="units">{F[14]}{F[15]}</div>

{sec('08', 'When the line drops',
     'The book is local first and reconciles later. That is the architecture on both halves, so '
     'offline is a state this screen is designed for rather than an error it reports.')}
<div class="units">{F[16]}</div>

<h2 class="sec"><span class="n">09</span>Rules this screen sets</h2>
<p class="note">Carried verbatim from the phone file, because a rule that holds on one half and not
the other is not a rule.</p>
<table class="dt"><thead><tr><th>Rule</th><th>Why</th><th>Where it shows here</th></tr></thead>
<tbody>
  <tr><th>X REP never holds, moves or confirms money</th>
    <td>No PSP licence, no settlement account, no liability.</td>
    <td><b>1c</b> empty state, <b>3a</b> panel, <b>2b</b> reminder</td></tr>
  <tr><th>A payment is recorded by the trainer, never auto-detected</th>
    <td>We cannot read their bank. Auto-marking from an SMS parse would be wrong often enough to
      destroy trust in the book.</td>
    <td><b>3a</b> — &ldquo;record&rdquo;, never &ldquo;collect&rdquo;</td></tr>
  <tr><th>Money in is green with a down arrow; money out is red with an up arrow</th>
    <td>The OkCredit convention. Ten million people already read it this way; inverting it to match
      a Western accounting app would be a self-inflicted wound.</td>
    <td>Every ledger row — <code>.dirn</code>. Arrow <i>and</i> colour, never colour alone</td></tr>
  <tr><th>Every entry is editable and deletable, and delete always asks</th>
    <td>It is a book, and books get corrected. But a deleted payment changes a package, so it is
      never silent.</td>
    <td><b>6c</b> — and it counts the sessions that change</td></tr>
  <tr><th>Receipt numbers are issued locally from a device-scoped range</th>
    <td>Cash arrives in basements. Two devices must never mint the same number.</td>
    <td><b>3c</b>, and <b>8a</b> where a queued row already has one</td></tr>
  <tr><th>The gym percentage is applied at record time and stored on the entry</th>
    <td>If the contract changes in October, September&rsquo;s split must not move.</td>
    <td><b>5b</b> — a per-entry column, not a lookup</td></tr>
  <tr><th>Every figure is tabular and right-aligned in its column</th>
    <td>Columns of money that don&rsquo;t line up cannot be scanned, and scanning is the whole
      job.</td>
    <td><code>.dirn</code>, <code>.num</code>, <code>.mono</code></td></tr>
  <tr><th>Write-off is a first-class action, not a delete</th>
    <td>Deleting hides the money; a write-off keeps the history and shows the year&rsquo;s real
      total.</td>
    <td><b>6a</b> its own tab, <b>6b</b> its own panel</td></tr>
  <tr><th>The GST warning fires a month before the line, not after</th>
    <td>Late registration carries a penalty. A warning after the fact is just bad news.</td>
    <td><b>7a</b> — and the figure is the trainer&rsquo;s share only</td></tr>
</tbody></table>

<h2 class="sec"><span class="n">10</span>What changed from the phone</h2>
<table class="dt"><thead><tr><th>On the phone</th><th>On the web</th><th>Because</th></tr></thead>
<tbody>
  <tr><th>Sixteen frames across money</th><td>Six tabs on one screen</td>
    <td>Month-end is one sitting; it should be one screen.</td></tr>
  <tr><th>Figures and ledger on separate scrolls</th><td>Both visible at once</td>
    <td>You reconcile by looking at the total and the rows together.</td></tr>
  <tr><th>Tapping &ldquo;Collected&rdquo; filters in place</th><td>The same figure, now visibly a
    button, with a removable chip</td>
    <td>A pointer has hover; a tile that filters should look like it does before it is clicked.</td></tr>
  <tr><th>&ldquo;Remind all&rdquo; walks three sheets</th><td>One panel that says <b>chat 1 of 3</b>
    and offers Skip</td><td>Same rule — never a broadcast — with the position a queue needs.</td></tr>
  <tr><th>GST is a card you scroll to</th><td>Its own tab, with a runway in months</td>
    <td>The useful form of &ldquo;₹11.84 lakh&rdquo; is &ldquo;seven months away&rdquo;.</td></tr>
  <tr><th>Export is a share sheet</th><td>CSV and a receipt book, named for a CA, with a summary
    first</td><td>The person receiving it is an accountant, not a phone.</td></tr>
  <tr><th>Long-press a row for its menu</th><td>A row menu on the ⋯ button, and delete behind a
    dialog</td><td>A pointer has no long press.</td></tr>
</tbody></table>

<h2 class="sec"><span class="n">11</span>What this pass fixed</h2>
<p class="note">The page this replaces drew two frames and declared six tabs. These are the
specific contradictions, each traceable to the phone file or to the stylesheet.</p>
<table class="dt"><thead><tr><th>Was</th><th>Now</th><th>Source of truth</th></tr></thead>
<tbody>
  <tr><th>Four of six tabs pointed at nothing</th><td>All six drawn</td>
    <td>The tab bar is a promise; <code>inclineyoumoney.html</code> has a state behind each one</td></tr>
  <tr><th>Every amount in the same neutral ink</th>
    <td><code>.dirn</code> — arrow and colour, in and out</td>
    <td>&ldquo;Money in is green with a down arrow&rdquo; is listed as non-negotiable in the phone
      file&rsquo;s own rules table, and the web had dropped it entirely</td></tr>
  <tr><th>A ledger foot reading <code>₹66,600</code></th>
    <td><code>₹47,000 in · ₹18,000 owed · ₹1,600 off</code></td>
    <td>That figure summed money received, money still owed and money let go into one total under a
      column headed &ldquo;Amount&rdquo;. It answered no question anybody has</td></tr>
  <tr><th>Ten rows under a stat saying ₹1,06,500 collected</th>
    <td><code>Showing 10 of 27</code></td>
    <td>A truncated table that does not say it is truncated reads as a contradiction between the
      figure and the evidence — which is the one thing this layout exists to prevent</td></tr>
  <tr><th><code>class="who"</code> used 49 times, defined nowhere</th>
    <td>Defined in <code>webapp.css</code></td>
    <td>Every avatar-and-name cell in money, reports, dashboard, rail and the data library rendered
      with no gap and no shared baseline. It is the most-scanned cell in any of these tables</td></tr>
  <tr><th>The four figures were <code>&lt;div&gt;</code>s</th><td>Buttons, with hover, focus and a
    pressed state</td>
    <td>They filter the ledger. A control that does something has to look like one</td></tr>
  <tr><th>Owed, Packages, Gym share, GST and Write-offs had no frames</th>
    <td><b>2a 5a 5b 7a 6a</b></td>
    <td>Those five tabs are where a month-end sitting actually goes</td></tr>
  <tr><th>No offline frame</th><td><b>8a</b></td>
    <td>Offline-first is the architecture on both halves. A money screen with no offline state is a
      money screen that has not been designed for the gym floor it runs on</td></tr>
</tbody></table>

<h2 class="sec"><span class="n">12</span>Still open</h2>
<table class="dt"><thead><tr><th>#</th><th>Item</th><th>Why it is still open</th></tr></thead>
<tbody>
  <tr><th>01</th><td>The receipt book PDF</td><td>Drawn as a button in <b>7b</b> and it should stay
    a button — but the layout of the book itself, one receipt per page with the device range on
    it, has no frame yet. The CSV path is complete.</td></tr>
  <tr><th>02</th><td>The row menu on ⋯</td><td>Every table row has the affordance and the delete
    dialog behind it is drawn, but the menu itself — send receipt, edit, change method, delete —
    is specimened in <code>webapp-c-nav.html</code> rather than here.</td></tr>
  <tr><th>03</th><td>A gym&rsquo;s own view of this screen</td><td>Ring 2 of the growth roadmap.
    A gym never owns a client and never sees outside its own wall, so the admin console is a
    different set of frames with a different money model — not a permission on these.</td></tr>
  <tr><th>04</th><td>Multi-currency, and paise</td><td>Amounts are integer paise everywhere in the
    model and rupees everywhere in the interface. Nothing here is drawn with a decimal, which is
    correct for India today and a decision worth revisiting only if the product leaves it.</td></tr>
</tbody></table>

<hr class="rule" style="margin-top:84px">
<p class="small" style="max-width:var(--w-measure)">
  X REP · web application · v1.1 · every frame drawn at 1440&times;900 and scaled to fit.
  Colour, spacing and radius tokens are copied verbatim from
  <code>inclineyoudesignsystem.html</code> — if a value differs there, it is a bug here.
  Press <kbd>+</kbd> / <kbd>&minus;</kbd> to change the zoom.
  <br><br>States and rules trace to <code>notes/design system/screens/inclineyoumoney.html</code>
  (screen 06 · sixteen states · the tap map and the rules table) and to the app itself:
  <code>money/money.ts</code>, <code>db/money.ts</code>,
  <code>screens/main/money/MoneyScreen.tsx</code>, <code>OwedScreen.tsx</code>,
  <code>RecordSheet.tsx</code>, <code>ReceiptSheet.tsx</code> and <code>WriteOffSheet.tsx</code>.
</p>

</div>
<script src="assets/webapp.js"></script>
</body>
</html>
'''

out = HERE / "webapp-money.html"
out.write_text(HTML, encoding="utf-8")
print(f"wrote {out.name} · {len(F)} frames · {len(HTML):,} bytes")
